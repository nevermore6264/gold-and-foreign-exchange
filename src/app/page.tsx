"use client";

import {
  MANH_HAI_COL,
  MANH_HAI_SLOTS_ORDER,
  manhHaiSlotMinutes,
} from "@/lib/manh-hai-columns";
import {
  CSV_COL_LABELS,
  DEFAULT_COLUMN_VISIBILITY,
  getTableColumnConfigIssues,
  GROUP_LABELS_VI,
  isColumnVisible,
  LS_COLUMN_VISIBILITY,
  parseColumnVisibilityFromStorage,
  TABLE_COL_ORDER,
  TOGGLEABLE_GROUPS,
  type ToggleableColGroup,
} from "@/lib/table-columns";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import * as XLSX from "xlsx";

if (process.env.NODE_ENV === "development") {
  const colIssues = getTableColumnConfigIssues();
  if (colIssues.length > 0)
    console.error("[gia-vang] lệch cấu hình cột:", colIssues);
}

/**
 * Khung UI trước – chỉ header + bảng trống.
 * Phần render / load dữ liệu sẽ làm sau.
 */

/** Cột Thứ chỉ hiển thị CN / 2–7 — hẹp hơn chia đều với các cột dữ liệu. */
const WEEKDAY_COL_WIDTH_PX = 48;
const DATE_COL_WIDTH_PX = 128;
const DATA_COL_MIN_PX = 108;

type FullTableRow = Record<string, string | number | null>;

type MarketLiveResponse = {
  oil?: { price?: number; changePercent?: number; updatedAt: string };
  dollarIndex?: { price?: number; changePercent?: number; updatedAt: string };
  bond10y?: { price?: number; changePercent?: number; updatedAt: string };
  sp500?: { price?: number; changePercent?: number; updatedAt: string };
  /** COMEX GC=F — MỞ/PRICE theo phiên Mỹ */
  goldGc?: {
    price?: number;
    changePercent?: number;
    regularMarketOpen?: number;
    updatedAt: string;
  };
};

function toIsoDateLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatCellValue(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "–";
  if (typeof v === "number") return Number.isFinite(v) ? v.toFixed(2) : "–";
  return v;
}

function formatVnd(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "–";
  const n = typeof v === "number" ? v : parseFloat(String(v));
  if (!Number.isFinite(n)) return "–";
  return new Intl.NumberFormat("vi-VN", {
    maximumFractionDigits: 0,
  }).format(n);
}

/**
 * Toàn bảng — ô có tone xanh/đỏ: đỏ kế toán (…); xanh thêm dấu + (tránh ++ nếu đã có).
 */
function formatTableToneCellDisplay(
  mainText: string,
  toneClass: string | undefined,
): string {
  if (mainText === "–" || !toneClass) return mainText;
  if (toneClass.includes("text-red-600")) {
    const inner = mainText.trim().replace(/^[\u2212\−\-]\s*/, "");
    if (inner === "") return mainText;
    return `(${inner})`;
  }
  if (toneClass.includes("text-green-600")) {
    const inner = mainText.trim().replace(/^\+/, "");
    if (inner === "") return mainText;
    return `+${inner}`;
  }
  return mainText;
}

function formatMarketNumberByColumn(
  value: string | number | null | undefined,
  colIndex: number,
): string {
  if (value === null || value === undefined) return "–";
  const n =
    typeof value === "number"
      ? value
      : parseFloat(String(value).replace(/,/g, "").trim());
  if (!Number.isFinite(n)) return "–";

  // KITCO: không hiển thị phần thập phân (ví dụ 5,999 thay vì 5,999.000).
  if (colIndex >= 13 && colIndex <= 20)
    return new Intl.NumberFormat("en-US", {
      maximumFractionDigits: 0,
    }).format(n);

  // US10Y: giữ 3 số lẻ.
  if (colIndex >= 40 && colIndex <= 47)
    return new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 3,
      maximumFractionDigits: 3,
    }).format(n);

  // Dầu và Dollar Index: 2 số lẻ.
  if ((colIndex >= 22 && colIndex <= 29) || (colIndex >= 31 && colIndex <= 38))
    return new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);

  // S&P 500: không số lẻ, có phân tách nghìn.
  if (colIndex >= 49 && colIndex <= 56)
    return new Intl.NumberFormat("vi-VN", {
      maximumFractionDigits: 0,
    }).format(n);

  return formatCellValue(value);
}

/** Chuẩn hóa ô ∑ TÀI SẢN: chỉ chữ số + dấu . phân nghìn khi blur / load LS */
function formatTaiSanInputDisplay(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  const noSep = t.replace(/\./g, "").replace(/\s/g, "");
  if (!/^\d+$/.test(noSep)) return raw;
  const n = Number(noSep);
  if (!Number.isFinite(n) || n <= 0) return raw;
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(n);
}

/** Chuẩn hóa ô ∑ CHỈ VÀNG CŨ (cho phép 0) */
function formatChiVangCuInputDisplay(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  const noSep = t.replace(/\./g, "").replace(/\s/g, "");
  if (!/^\d+$/.test(noSep)) return raw;
  const n = Number(noSep);
  if (!Number.isFinite(n) || n < 0) return raw;
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(n);
}

function getNumberToneClass(n: number | null): string {
  if (n == null || !Number.isFinite(n))
    return "text-stone-950 dark:text-stone-50 font-bold";
  if (n < 0) return "text-red-600 dark:text-red-400 font-bold";
  if (n > 0) return "text-green-600 dark:text-green-400 font-bold";
  return "text-stone-950 dark:text-stone-50 font-bold";
}

function getVietnamNowParts(): { isoDate: string; minutes: number } {
  // Use VN timezone regardless of user's system timezone
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());

  const get = (type: string) => parts.find((p) => p.type === type)?.value;
  const y = get("year") ?? "1970";
  const m = get("month") ?? "01";
  const d = get("day") ?? "01";
  const h = parseInt(get("hour") ?? "0", 10);
  const min = parseInt(get("minute") ?? "0", 10);
  return { isoDate: `${y}-${m}-${d}`, minutes: h * 60 + min };
}

/**
 * Hàng “hôm nay” (VN): Đóng / Cao / Thấp / % là OHLC ngày — trước khi phiên Mỹ (ET)
 * coi như đã đóng (sau 17:00 Thứ 2–6) thì chỉ là giá tạm, không hiển thị.
 */
function shouldShowDailyOhlcForVnTodayRow(isoDate: string): boolean {
  const vn = getVietnamNowParts();
  if (isoDate !== vn.isoDate) return true;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(new Date());
  const wd = parts.find((p) => p.type === "weekday")?.value;
  const hour = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);
  if (wd === "Sat" || wd === "Sun") return false;
  return hour >= 17;
}

type RangeMode = "month" | "quarter" | "year" | "all";

function getMarketChangeToneClass(value: string): string {
  // Match web: dương xanh, âm đỏ (cho Change% của Oil / Dollar / Bond / S&P)
  const trimmed = value.trim();
  if (trimmed === "–" || trimmed === "") {
    return "text-stone-950 dark:text-stone-50 font-bold";
  }
  const num = parseFloat(trimmed.replace("%", "").replace(",", "."));
  if (!Number.isFinite(num)) {
    return "text-stone-950 dark:text-stone-50 font-bold";
  }
  if (num > 0) return "text-green-600 dark:text-green-400 font-bold";
  if (num < 0) return "text-red-600 dark:text-red-400 font-bold";
  return "text-stone-950 dark:text-stone-50 font-bold";
}

function getRegionBgClass(colIndex: number): string {
  // Background riêng cho từng nhóm dữ liệu để dễ phân biệt khi cuộn ngang.
  // Mạnh Hải Mua/Bán: col_1..col_10 — nền trắng (body)
  if (colIndex >= 1 && colIndex <= 10)
    return "bg-white dark:bg-stone-950/35 group-hover/row:bg-[#fafafa] dark:group-hover/row:bg-stone-900/45";
  // Lãi (nếu bán ra) + ∑ chỉ vàng + ∑ chỉ vàng thêm — cùng nền xanh lá nhạt (Excel ~#e6f0db)
  if ((colIndex >= 67 && colIndex <= 70) || colIndex === 61 || colIndex === 66)
    return "bg-[#e6f0db] dark:bg-emerald-950/35 group-hover/row:bg-[#dce8d0] dark:group-hover/row:bg-emerald-950/50";
  // KITCO - GIÁ VÀNG THẾ GIỚI: col_13..col_21 — nền xám nhạt (giống Excel)
  if (colIndex >= 13 && colIndex <= 21)
    return "bg-[#e5e5e5] dark:bg-stone-800/45 group-hover/row:bg-[#dadada] dark:group-hover/row:bg-stone-800/65";
  // Giá dầu: col_22..col_30 — nền trắng / kem
  if (colIndex >= 22 && colIndex <= 30)
    return "bg-white dark:bg-stone-950/35 group-hover/row:bg-[#fafafa] dark:group-hover/row:bg-stone-900/45";
  // Dollar index: col_31..col_39 — xám nhạt (cùng tông KITCO / S&P)
  if (colIndex >= 31 && colIndex <= 39)
    return "bg-[#e5e5e5] dark:bg-stone-800/45 group-hover/row:bg-[#dadada] dark:group-hover/row:bg-stone-800/65";
  // Trái phiếu 10Y: col_40..col_48 — trắng (cùng tông giá dầu)
  if (colIndex >= 40 && colIndex <= 48)
    return "bg-white dark:bg-stone-950/35 group-hover/row:bg-[#fafafa] dark:group-hover/row:bg-stone-900/45";
  // S&P 500: col_49..col_57 — xám nhạt
  if (colIndex >= 49 && colIndex <= 57)
    return "bg-[#e5e5e5] dark:bg-stone-800/45 group-hover/row:bg-[#dadada] dark:group-hover/row:bg-stone-800/65";
  // VCB: col_60 — tím
  if (colIndex === 60) return "bg-violet-200/50 dark:bg-violet-900/30";
  // CHÊNH LỆCH (trong nước / thế giới): col_62..65 — vàng nhạt (như Excel)
  if (colIndex >= 62 && colIndex <= 65)
    return "bg-[#fff9c4] dark:bg-amber-950/25 group-hover/row:bg-[#fff59d] dark:group-hover/row:bg-amber-950/40";

  return "";
}

function getRegionHeaderBgClass(colIndex: number): string {
  // Đậm hơn body để nhìn rõ ở header.
  if (colIndex >= 1 && colIndex <= 10) return "bg-[#C8E3F5] dark:bg-sky-900/48";
  if ((colIndex >= 67 && colIndex <= 70) || colIndex === 61 || colIndex === 66)
    return "bg-[#d4e8c8] dark:bg-emerald-900/50";
  // KITCO: header đào / hồng nhạt (nhóm “MỞ / ĐÓNG / …”)
  if (colIndex >= 13 && colIndex <= 21)
    return "bg-[#fde4dc] dark:bg-rose-950/40";
  // Giá dầu: header vàng kem
  if (colIndex >= 22 && colIndex <= 30)
    return "bg-[#fff4d6] dark:bg-amber-950/35";
  // Dollar & S&P: header đào (giống KITCO)
  if (colIndex >= 31 && colIndex <= 39)
    return "bg-[#fde4dc] dark:bg-rose-950/40";
  // Trái phiếu 10Y: header vàng kem (giống giá dầu)
  if (colIndex >= 40 && colIndex <= 48)
    return "bg-[#fff4d6] dark:bg-amber-950/35";
  if (colIndex >= 49 && colIndex <= 57)
    return "bg-[#fde4dc] dark:bg-rose-950/40";
  if (colIndex === 60) return "bg-violet-300/75 dark:bg-violet-900/45";
  if (colIndex >= 62 && colIndex <= 65)
    return "bg-[#fff59d] dark:bg-amber-950/45";
  return "";
}

/** Mạnh Hải (Mua/Bán): header xanh dương nhạt (~Excel #BDD7EE) */
const MH_HEAD_BLUE =
  "bg-[#BDD7EE] dark:bg-sky-900/45 text-stone-900 dark:text-sky-50";
/** Viền ô bảng: đen (light) / sáng (dark) — nét rõ giữa hàng & cột */
const TABLE_CELL_BR = "border-b border-r border-black dark:border-stone-200";
const MH_HEAD_BORDER = TABLE_CELL_BR;

/** Header cột Lãi (nếu bán ra) — nền xanh lá nhạt như Excel */
const LAI_HEAD_GREEN =
  "bg-[#e6f0db] dark:bg-emerald-950/40 text-stone-950 dark:text-emerald-50";
/** Mật độ ô gần Excel — chữ nhỏ hơn, padding dọc ít */
const TABLE_TEXT = "text-[13px] leading-tight";
const TABLE_TD_PAD = "px-1.5 py-1";

const LAI_HEAD_TIME_CLASS = `${TABLE_CELL_BR} px-1.5 py-1 ${TABLE_TEXT} font-bold ${LAI_HEAD_GREEN} whitespace-nowrap`;

/** Hiệu ứng ô: highlight nhẹ khi hover cả hàng (giống glass / macOS) */
const TD_CELL_FX =
  "transition-[box-shadow,filter] duration-200 ease-out motion-reduce:transition-none group-hover/row:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.4)] dark:group-hover/row:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.09)] group-hover/row:brightness-[1.015] dark:group-hover/row:brightness-110";

function manhHaiHeaderGroupClass(): string {
  return `${MH_HEAD_BORDER} px-1.5 py-1.5 ${TABLE_TEXT} font-bold whitespace-nowrap ${MH_HEAD_BLUE}`;
}

function manhHaiHeaderRow2CellClass(): string {
  return `${MH_HEAD_BORDER} px-1.5 py-1 ${TABLE_TEXT} font-bold whitespace-nowrap ${MH_HEAD_BLUE}`;
}

function manhHaiHeaderChenhLechRowSpanClass(): string {
  return `${MH_HEAD_BORDER} px-1.5 py-1 align-middle ${TABLE_TEXT} font-bold whitespace-nowrap ${MH_HEAD_BLUE}`;
}

function manhHaiHeaderTimeRowClass(): string {
  return `${MH_HEAD_BORDER} px-1.5 py-1 ${TABLE_TEXT} font-bold text-stone-950 dark:text-stone-50 whitespace-nowrap ${MH_HEAD_BLUE}`;
}

function formatChangeWithPlus(value: string): string {
  const trimmed = value.trim();
  if (trimmed === "–" || trimmed === "") return "–";
  const num = parseFloat(trimmed.replace("%", "").replace(",", "."));
  if (!Number.isFinite(num)) return trimmed;
  if (num > 0 && !trimmed.startsWith("+")) return `+${trimmed}`;
  return trimmed;
}

function clampIsoToTodayInVietnam(isoDate: string): string {
  const vnToday = getVietnamNowParts().isoDate;
  return isoDate > vnToday ? vnToday : isoDate;
}

function daysInMonth(year: number, month1to12: number): number {
  return new Date(year, month1to12, 0).getDate();
}

/** localStorage keys cho 2 chỉ số nhập tay */
const LS_INPUT_TAI_SAN = "gia-vang-input-tai-san";
const LS_INPUT_CHI_VANG_CU = "gia-vang-input-chi-vang-cu";
const LS_INPUT_DAU_TU = "gia-vang-input-dau-tu";
const LS_INPUT_CHI_VANG_DANG_CO = "gia-vang-input-chi-vang-dang-co";
const LS_CELL_BG_COLORS = "gia-vang-cell-bg-colors";
const LS_MANUAL_CARD_VISIBILITY = "gia-vang-manual-card-visibility-v1";

type ManualCardGroup = "manualLeft" | "manualRight";

const MANUAL_CARD_GROUPS: ManualCardGroup[] = ["manualLeft", "manualRight"];

const DEFAULT_MANUAL_CARD_VISIBILITY: Record<ManualCardGroup, boolean> = {
  manualLeft: true,
  manualRight: true,
};

const MANUAL_CARD_LABELS_VI: Record<ManualCardGroup, string> = {
  manualLeft: "∑ Đầu tư + ∑ Chỉ vàng cũ",
  manualRight: "∑ Tài sản + ∑ Chỉ vàng đang có",
};

/** Tên hiển thị nút mở modal + tiêu đề dialog — tham số tính vàng / tiền */
const MANUAL_INPUTS_UI_LABEL_VI = "Tính vàng & tiền" as const;

/** Modal nhập tham số: form thường — tiêu đề trên, label/mô tả dưới, ô nhập cuối; lưới 2 cột */
const MANUAL_MODAL_FORM_GRID = "grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-6";

const MANUAL_MODAL_FIELD = "flex min-w-0 flex-col gap-1.5";

const MANUAL_MODAL_FIELD_TITLE_MONEY =
  "text-[13px] font-bold tracking-tight text-amber-950 dark:text-amber-100";

const MANUAL_MODAL_FIELD_TITLE_CHI =
  "text-[13px] font-bold tracking-tight text-sky-900 dark:text-sky-100";

const MANUAL_MODAL_FIELD_LABEL =
  "text-[11px] font-medium leading-snug text-stone-500 dark:text-stone-400";

const MANUAL_MODAL_INPUT_CLASS =
  "mt-1 h-10 w-full rounded-lg border-0 bg-white/95 px-3 py-2 text-right text-sm font-semibold tabular-nums text-stone-900 shadow-inner ring-1 ring-stone-200/90 outline-none transition placeholder:text-stone-400 focus:bg-white focus:ring-2 focus:ring-amber-400/75 dark:bg-stone-950/90 dark:text-stone-100 dark:ring-stone-600 dark:placeholder:text-stone-500 dark:focus:ring-amber-500/55";

const MANUAL_MODAL_INPUT_CLASS_CHI =
  "mt-1 h-10 w-full rounded-lg border-0 bg-white/95 px-3 py-2 text-right text-sm font-semibold tabular-nums text-stone-900 shadow-inner ring-1 ring-stone-200/90 outline-none transition placeholder:text-stone-400 focus:bg-white focus:ring-2 focus:ring-sky-400/75 dark:bg-stone-950/90 dark:text-stone-100 dark:ring-stone-600 dark:placeholder:text-stone-500 dark:focus:ring-sky-500/55";

const MANUAL_MODAL_FIELD_BOX_MONEY = `${MANUAL_MODAL_FIELD} rounded-xl border border-amber-200/75 bg-gradient-to-br from-amber-50/95 via-white to-amber-50/45 p-3.5 shadow-md ring-1 ring-amber-100/45 dark:border-amber-800/55 dark:from-amber-950/50 dark:via-stone-900/98 dark:to-amber-950/35 dark:ring-amber-900/30`;

const MANUAL_MODAL_FIELD_BOX_CHI = `${MANUAL_MODAL_FIELD} rounded-xl border border-sky-200/75 bg-gradient-to-br from-sky-50/90 via-white to-sky-50/40 p-3.5 shadow-md ring-1 ring-sky-100/45 dark:border-sky-800/50 dark:from-sky-950/40 dark:via-stone-900/98 dark:to-sky-950/30 dark:ring-sky-900/28`;

function parseManualCardVisibilityFromStorage(
  raw: string | null,
): Record<ManualCardGroup, boolean> {
  const next = { ...DEFAULT_MANUAL_CARD_VISIBILITY };
  if (!raw) return next;
  try {
    const o = JSON.parse(raw) as Record<string, boolean>;
    for (const g of MANUAL_CARD_GROUPS) {
      if (typeof o[g] === "boolean") next[g] = o[g];
    }
  } catch {
    /* ignore */
  }
  if (!MANUAL_CARD_GROUPS.some((g) => next[g])) {
    return { ...DEFAULT_MANUAL_CARD_VISIBILITY };
  }
  return next;
}

function parseCellBgColorsFromStorage(
  raw: string | null,
): Record<string, string> {
  if (!raw) return {};
  try {
    const o = JSON.parse(raw) as unknown;
    if (!o || typeof o !== "object" || Array.isArray(o)) return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(o)) {
      if (
        typeof k === "string" &&
        typeof v === "string" &&
        /^#[0-9A-Fa-f]{6}$/.test(v)
      ) {
        out[k] = v;
      }
    }
    return out;
  } catch {
    return {};
  }
}

/** Màu gợi ý — một cú nhấp là áp nền ô. */
const CELL_BG_PRESETS = [
  "#fff9c4",
  "#ffe082",
  "#c8e6c9",
  "#b3e5fc",
  "#e1bee7",
  "#ffcdd2",
  "#ffe0b2",
  "#dcedc8",
  "#b2dfdb",
  "#d1c4e9",
  "#f5f5f4",
  "#ffffff",
  "#e0f2f1",
  "#fff3e0",
] as const;

const CELL_COLOR_POPOVER_W = 216;
const CELL_COLOR_POPOVER_H = 268;

function computeRange(
  mode: RangeMode,
  year: number,
  month?: number,
  quarter?: number,
): {
  from: string;
  to: string;
} {
  /** Trùng `START_DATE` trong `src/lib/full-table.ts` — toàn bộ dữ liệu API */
  if (mode === "all") {
    const to = clampIsoToTodayInVietnam(getVietnamNowParts().isoDate);
    return { from: "2022-01-01", to };
  }

  if (mode === "year") {
    const from = `${year}-01-01`;
    const to = clampIsoToTodayInVietnam(`${year}-12-31`);
    return { from, to };
  }

  if (mode === "quarter") {
    const q = Math.min(4, Math.max(1, quarter ?? 1));
    const startMonth = (q - 1) * 3 + 1; // 1,4,7,10
    const endMonth = startMonth + 2;
    const from = `${year}-${String(startMonth).padStart(2, "0")}-01`;
    const lastDay = daysInMonth(year, endMonth);
    const to = clampIsoToTodayInVietnam(
      `${year}-${String(endMonth).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`,
    );
    return { from, to };
  }

  const m = Math.min(12, Math.max(1, month ?? 1));
  const from = `${year}-${String(m).padStart(2, "0")}-01`;
  const lastDay = daysInMonth(year, m);
  const to = clampIsoToTodayInVietnam(
    `${year}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`,
  );
  return { from, to };
}

function parseIso(iso: string): Date {
  // YYYY-MM-DD -> local Date at 00:00
  const [y, m, d] = iso.split("-").map((x) => parseInt(x, 10));
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

/** Số ngày trong [from, to] (cùng logic hiển thị bảng) */
function countInclusiveDays(fromIso: string, toIso: string): number {
  const a = parseIso(fromIso);
  const b = parseIso(toIso);
  if (a > b) return 0;
  const dayMs = 86400000;
  return Math.floor((b.getTime() - a.getTime()) / dayMs) + 1;
}

/**
 * Tách khoảng ngày thành các đoạn theo năm dương lịch (để tải dần + hiện % tiến trình).
 */
function splitRangeIntoYearChunks(
  fromIso: string,
  toIso: string,
): { from: string; to: string }[] {
  const start = parseIso(fromIso);
  const end = parseIso(toIso);
  if (start > end) return [];
  const chunks: { from: string; to: string }[] = [];
  let cur = new Date(start.getFullYear(), start.getMonth(), start.getDate());

  while (cur <= end) {
    const y = cur.getFullYear();
    const yearEnd = new Date(y, 11, 31);
    const chunkEnd = yearEnd.getTime() > end.getTime() ? end : yearEnd;
    chunks.push({
      from: toIsoDateLocal(cur),
      to: toIsoDateLocal(chunkEnd),
    });
    cur = new Date(y + 1, 0, 1);
  }
  return chunks;
}

/** Snapshot slots từ GET /api/manh-hai */
type ManhHaiSlotMap = Partial<
  Record<
    "09:00" | "11:00" | "14:30" | "17:30",
    { buy: number | null; sell: number | null }
  >
>;

/**
 * Giá từ snapshot live (API). `undefined` = không overlay (dùng full-table);
 * `null` = chưa đến giờ / chưa có → hiển thị –
 */
function computeLiveManhHaiNumber(
  slots: ManhHaiSlotMap,
  colIndex: number,
  nowMin: number,
): number | null | undefined {
  const order = MANH_HAI_SLOTS_ORDER;
  if (colIndex >= 1 && colIndex <= 4) {
    const k = order[colIndex - 1];
    if (nowMin < manhHaiSlotMinutes(k)) return null;
    const buy = slots[k]?.buy;
    if (buy != null && Number.isFinite(buy)) return buy;
    return undefined;
  }
  if (colIndex >= 6 && colIndex <= 9) {
    const k = order[colIndex - 6];
    if (nowMin < manhHaiSlotMinutes(k)) return null;
    const sell = slots[k]?.sell;
    if (sell != null && Number.isFinite(sell)) return sell;
    return undefined;
  }
  if (colIndex === MANH_HAI_COL.MUA_CHENH_LECH) {
    if (nowMin < manhHaiSlotMinutes("17:30")) return null;
    const b9 = slots["09:00"]?.buy;
    const b17 = slots["17:30"]?.buy;
    if (b9 != null && b17 != null) return b17 - b9;
    return undefined;
  }
  if (colIndex === MANH_HAI_COL.BAN_CHENH_LECH) {
    if (nowMin < manhHaiSlotMinutes("17:30")) return null;
    const s9 = slots["09:00"]?.sell;
    const s17 = slots["17:30"]?.sell;
    if (s9 != null && s17 != null) return s17 - s9;
    return undefined;
  }
  return undefined;
}

export default function Home() {
  const vnTodayIso = getVietnamNowParts().isoDate;
  const currentYear = parseInt(vnTodayIso.slice(0, 4), 10);
  const currentMonth = parseInt(vnTodayIso.slice(5, 7), 10);
  const currentQuarter = Math.floor((currentMonth - 1) / 3) + 1;

  const prevMonthInfo = (() => {
    let y = currentYear;
    let m = currentMonth - 1;
    if (m <= 0) {
      y -= 1;
      m = 12;
    }
    return { y, m };
  })();

  const prevQuarterInfo = (() => {
    let y = currentYear;
    let q = currentQuarter - 1;
    if (q <= 0) {
      y -= 1;
      q = 4;
    }
    return { y, q };
  })();

  const [rangeMode, setRangeMode] = useState<RangeMode>("month");
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [selectedMonth, setSelectedMonth] = useState<number>(currentMonth);
  const [selectedQuarter, setSelectedQuarter] =
    useState<number>(currentQuarter);

  const maxMonth = selectedYear === currentYear ? currentMonth : 12;
  const maxQuarter = selectedYear === currentYear ? currentQuarter : 4;

  useEffect(() => {
    // Prevent selecting future months/quarters in the current year.
    if (rangeMode === "month" && selectedMonth > maxMonth) {
      setSelectedMonth(maxMonth);
    }
    if (rangeMode === "quarter" && selectedQuarter > maxQuarter) {
      setSelectedQuarter(maxQuarter);
    }
  }, [rangeMode, selectedMonth, maxMonth, selectedQuarter, maxQuarter]);

  const isAllRange = rangeMode === "all";

  const { from, to } = useMemo(() => {
    return computeRange(
      rangeMode,
      selectedYear,
      selectedMonth,
      selectedQuarter,
    );
  }, [rangeMode, selectedYear, selectedMonth, selectedQuarter]);

  const dateRows = useMemo(() => {
    const startDate = parseIso(from);
    const endDate = parseIso(to);
    const rows: {
      date: Date;
      isoDate: string;
      weekdayLabel: string;
      dateLabel: string;
    }[] = [];
    for (
      let d = new Date(endDate.getTime());
      d >= startDate;
      d = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1)
    ) {
      const day = d.getDay(); // 0..6 (Sun..Sat)
      const weekdayLabel = day === 0 ? "CN" : day === 6 ? "7" : `${day + 1}`; // Mon=2..Sat=7

      // Hiển thị: dd - mm - yyyy (e.g. 20 - 03 - 2026)
      const dd = String(d.getDate()).padStart(2, "0");
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const yyyy = String(d.getFullYear());
      const dateLabel = `${dd} - ${mm} - ${yyyy}`;
      const isoDate = toIsoDateLocal(d);

      rows.push({ date: d, isoDate, weekdayLabel, dateLabel });
    }
    return rows;
  }, [from, to]);

  const [fullRowsByDate, setFullRowsByDate] = useState<
    Record<string, FullTableRow>
  >({});
  /** Giá Mạnh Hải hôm nay (VN) từ /api/manh-hai — overlay lên full-table */
  const [manhHaiLive, setManhHaiLive] = useState<{
    slots: ManhHaiSlotMap;
  } | null>(null);
  const [isLoadingTable, setIsLoadingTable] = useState<boolean>(false);
  /** Tiến trình tải bảng (theo từng gói năm) */
  const [tableLoadProgress, setTableLoadProgress] = useState<{
    loaded: number;
    total: number;
    chunkCurrent: number;
    chunkTotal: number;
  } | null>(null);
  const [marketLive, setMarketLive] = useState<MarketLiveResponse>();

  /** ∑ TÀI SẢN / ∑ CHỈ VÀNG CŨ — nhập tay, lưu trên trình duyệt */
  const [totalTaiSan, setTotalTaiSan] = useState("");
  const [totalChiVangCu, setTotalChiVangCu] = useState("");
  /** Σ Đầu tư (VNĐ) — tham chiếu / đối chiếu */
  const [totalDauTu, setTotalDauTu] = useState("");
  /** Σ chỉ vàng đang có — tham chiếu */
  const [chiVangDangCo, setChiVangDangCo] = useState("");

  const [columnVisibility, setColumnVisibility] = useState<
    Record<ToggleableColGroup, boolean>
  >(() => {
    if (typeof window === "undefined") return { ...DEFAULT_COLUMN_VISIBILITY };
    try {
      return parseColumnVisibilityFromStorage(
        localStorage.getItem(LS_COLUMN_VISIBILITY),
      );
    } catch {
      return { ...DEFAULT_COLUMN_VISIBILITY };
    }
  });
  const [columnMenuOpen, setColumnMenuOpen] = useState(false);
  const [columnMenuQuery, setColumnMenuQuery] = useState("");
  const [manualCardVisibility, setManualCardVisibility] = useState<
    Record<ManualCardGroup, boolean>
  >(() => {
    if (typeof window === "undefined")
      return { ...DEFAULT_MANUAL_CARD_VISIBILITY };
    try {
      return parseManualCardVisibilityFromStorage(
        localStorage.getItem(LS_MANUAL_CARD_VISIBILITY),
      );
    } catch {
      return { ...DEFAULT_MANUAL_CARD_VISIBILITY };
    }
  });

  const [manualCardsModalOpen, setManualCardsModalOpen] = useState(false);

  const [cellBgColors, setCellBgColors] = useState<Record<string, string>>({});
  const [cellColorPicker, setCellColorPicker] = useState<{
    key: string;
    top: number;
    left: number;
  } | null>(null);

  useEffect(() => {
    if (!manualCardsModalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setManualCardsModalOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [manualCardsModalOpen]);

  function persistCellBgColors(next: Record<string, string>) {
    try {
      localStorage.setItem(LS_CELL_BG_COLORS, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    try {
      const parsed = parseCellBgColorsFromStorage(
        localStorage.getItem(LS_CELL_BG_COLORS),
      );
      setCellBgColors(parsed);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!cellColorPicker) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setCellColorPicker(null);
    };
    const onScroll = () => setCellColorPicker(null);
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [cellColorPicker]);

  useEffect(() => {
    try {
      localStorage.setItem(
        LS_COLUMN_VISIBILITY,
        JSON.stringify(columnVisibility),
      );
    } catch {
      /* ignore */
    }
  }, [columnVisibility]);

  useEffect(() => {
    try {
      localStorage.setItem(
        LS_MANUAL_CARD_VISIBILITY,
        JSON.stringify(manualCardVisibility),
      );
    } catch {
      /* ignore */
    }
  }, [manualCardVisibility]);

  const visibleJ = useMemo(
    () => TABLE_COL_ORDER.filter((j) => isColumnVisible(j, columnVisibility)),
    [columnVisibility],
  );

  const tableMinWidthPx = useMemo(
    () =>
      WEEKDAY_COL_WIDTH_PX +
      DATE_COL_WIDTH_PX +
      Math.max(0, visibleJ.length - 2) * DATA_COL_MIN_PX,
    [visibleJ.length],
  );

  const filteredToggleableGroups = useMemo(() => {
    const q = columnMenuQuery.trim().toLocaleLowerCase("vi");
    if (!q) return TOGGLEABLE_GROUPS;
    return TOGGLEABLE_GROUPS.filter((g) =>
      GROUP_LABELS_VI[g].toLocaleLowerCase("vi").includes(q),
    );
  }, [columnMenuQuery]);

  const filteredManualCardGroups = useMemo(() => {
    const q = columnMenuQuery.trim().toLocaleLowerCase("vi");
    if (!q) return MANUAL_CARD_GROUPS;
    return MANUAL_CARD_GROUPS.filter((g) =>
      MANUAL_CARD_LABELS_VI[g].toLocaleLowerCase("vi").includes(q),
    );
  }, [columnMenuQuery]);

  useEffect(() => {
    try {
      const a = localStorage.getItem(LS_INPUT_TAI_SAN);
      const b = localStorage.getItem(LS_INPUT_CHI_VANG_CU);
      const c = localStorage.getItem(LS_INPUT_DAU_TU);
      const d = localStorage.getItem(LS_INPUT_CHI_VANG_DANG_CO);
      if (a != null) setTotalTaiSan(formatTaiSanInputDisplay(a));
      if (b != null) setTotalChiVangCu(formatChiVangCuInputDisplay(b));
      if (c != null) setTotalDauTu(formatTaiSanInputDisplay(c));
      if (d != null) setChiVangDangCo(formatChiVangCuInputDisplay(d));
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function loadFullTable() {
      const expectedTotal = countInclusiveDays(from, to);
      if (expectedTotal === 0) {
        setFullRowsByDate({});
        setTableLoadProgress(null);
        setIsLoadingTable(false);
        return;
      }

      try {
        setFullRowsByDate({});
        const chunks = splitRangeIntoYearChunks(from, to);
        const chunkTotal = Math.max(1, chunks.length);
        setTableLoadProgress({
          loaded: 0,
          total: expectedTotal,
          chunkCurrent: 1,
          chunkTotal,
        });
        setIsLoadingTable(true);

        // Cập nhật snapshot Mạnh Hải (hôm nay VN) trước khi merge vào bảng
        try {
          const vnToday = getVietnamNowParts().isoDate;
          await fetch(`/api/manh-hai?date=${encodeURIComponent(vnToday)}`, {
            signal: controller.signal,
          });
        } catch {
          /* ignore */
        }

        let loaded = 0;
        for (let i = 0; i < chunks.length; i++) {
          if (cancelled) break;
          const { from: cf, to: ct } = chunks[i];
          setTableLoadProgress((p) =>
            p
              ? {
                  ...p,
                  chunkCurrent: i + 1,
                }
              : null,
          );
          try {
            const res = await fetch(
              `/api/full-table?from=${encodeURIComponent(cf)}&to=${encodeURIComponent(ct)}`,
              { signal: controller.signal },
            );
            if (!res.ok) break;
            const data = (await res.json()) as { rows?: FullTableRow[] };
            const rows = data.rows ?? [];
            if (cancelled) break;
            loaded += rows.length;
            setFullRowsByDate((prev) => {
              const next = { ...prev };
              for (const r of rows) {
                const date = r.col_12;
                if (typeof date === "string") next[date] = r;
              }
              return next;
            });
            setTableLoadProgress((p) =>
              p
                ? {
                    ...p,
                    loaded,
                  }
                : null,
            );
          } catch {
            break;
          }
        }
      } catch {
        // ignore
      } finally {
        if (!cancelled) {
          setIsLoadingTable(false);
          setTableLoadProgress(null);
        }
      }
    }

    loadFullTable();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [from, to]);

  useEffect(() => {
    let cancelled = false;
    async function loadManhHaiLive() {
      try {
        const vn = getVietnamNowParts().isoDate;
        const res = await fetch(
          `/api/manh-hai?date=${encodeURIComponent(vn)}`,
          { cache: "no-store" },
        );
        if (!res.ok) return;
        const data = (await res.json()) as { slots?: ManhHaiSlotMap };
        if (!cancelled) setManhHaiLive({ slots: data.slots ?? {} });
      } catch {
        // ignore
      }
    }
    loadManhHaiLive();
    const t = setInterval(loadManhHaiLive, 60_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadMarketLive() {
      try {
        const res = await fetch("/api/market-live", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as MarketLiveResponse;
        if (!cancelled) setMarketLive(data);
      } catch {
        // ignore
      }
    }

    loadMarketLive();
    const t = setInterval(loadMarketLive, 60_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  function kitcoCellValue(isoDate: string, colIndex: number): string {
    const base = fullRowsByDate[isoDate];
    const baseVal = base ? base[`col_${colIndex}`] : null;
    const vnNow = getVietnamNowParts();

    // Hàng hôm nay: Đóng/Cao/Thấp/% chỉ từ OHLC ngày sau khi coi phiên ET đã đóng — không dùng spot Kitco (vẫn là giá phiên, không phải đóng ngày).
    if (isoDate === vnNow.isoDate && colIndex >= 18 && colIndex <= 21) {
      if (!shouldShowDailyOhlcForVnTodayRow(isoDate)) return "–";
      return formatMarketNumberByColumn(baseVal, colIndex);
    }

    if (isoDate !== vnNow.isoDate)
      return formatMarketNumberByColumn(baseVal, colIndex);

    // MỞ (US): Yahoo GC=F regularMarketOpen — khớp phiên COMEX, không dùng spot Investing/Kitco
    if (colIndex === 13) {
      const o = marketLive?.goldGc?.regularMarketOpen;
      if (typeof o === "number" && Number.isFinite(o))
        return formatMarketNumberByColumn(o, colIndex);
    }

    return formatMarketNumberByColumn(baseVal, colIndex);
  }

  function marketTimedCellValue(
    isoDate: string,
    colIndex: number,
    kind: "oil" | "dollarIndex" | "bond10y" | "sp500",
  ): string {
    const base = fullRowsByDate[isoDate];
    const baseVal = base ? base[`col_${colIndex}`] : null;

    if (!shouldShowDailyOhlcForVnTodayRow(isoDate)) {
      const closeHighLowCh: Record<
        "oil" | "dollarIndex" | "bond10y" | "sp500",
        number[]
      > = {
        oil: [27, 28, 29, 30],
        dollarIndex: [36, 37, 38, 39],
        bond10y: [45, 46, 47, 48],
        sp500: [54, 55, 56, 57],
      };
      if (closeHighLowCh[kind].includes(colIndex)) return "–";
    }

    const vnNow = getVietnamNowParts();
    if (isoDate !== vnNow.isoDate)
      return formatMarketNumberByColumn(baseVal, colIndex);

    const live =
      kind === "oil"
        ? marketLive?.oil
        : kind === "dollarIndex"
          ? marketLive?.dollarIndex
          : kind === "bond10y"
            ? marketLive?.bond10y
            : marketLive?.sp500;
    const livePrice = live?.price;
    const liveChangePercent = live?.changePercent;

    const start =
      kind === "oil"
        ? 22
        : kind === "dollarIndex"
          ? 31
          : kind === "bond10y"
            ? 40
            : 49; // open slots start
    const changeCol =
      kind === "oil"
        ? 30
        : kind === "dollarIndex"
          ? 39
          : kind === "bond10y"
            ? 48
            : 57;

    // Khung cột theo mốc giờ VN (cùng lưới với Mạnh Hải); với hàng hôm nay,
    // các ô “mở cửa” 22–26 / 31–35 / … có thể hiện cùng giá realtime phiên Mỹ (xem /api/market-live).
    if (colIndex >= start && colIndex <= start + 4) {
      if (typeof livePrice !== "number")
        return formatMarketNumberByColumn(baseVal, colIndex);
      return formatMarketNumberByColumn(livePrice, colIndex);
    }

    // change%: hôm nay sau khi hiển thị OHLC ngày thì dùng % từ bảng (OHLC), không dùng % realtime (chưa phải đóng phiên).
    if (colIndex === changeCol) {
      if (
        isoDate === vnNow.isoDate &&
        shouldShowDailyOhlcForVnTodayRow(isoDate)
      )
        return formatCellValue(baseVal);
      if (
        typeof liveChangePercent === "number" &&
        Number.isFinite(liveChangePercent)
      )
        return `${liveChangePercent.toFixed(2)}%`;
      return formatCellValue(baseVal);
    }

    return formatMarketNumberByColumn(baseVal, colIndex);
  }

  function vcbCellValue(isoDate: string, colIndex: number): string {
    // Chỉ lấy duy nhất dữ liệu cột "Bán" (col_60) để tránh nhầm
    if (colIndex !== 60) return "–";
    const base = fullRowsByDate[isoDate];
    const baseVal = base ? base[`col_60`] : null;
    return formatVnd(baseVal);
  }

  function manhHaiCellValue(
    isoDate: string,
    colIndex: number,
  ): { text: string; toneClass?: string } {
    const vn = getVietnamNowParts();
    if (isoDate === vn.isoDate && manhHaiLive?.slots) {
      const live = computeLiveManhHaiNumber(
        manhHaiLive.slots,
        colIndex,
        vn.minutes,
      );
      if (live !== undefined) {
        if (live === null) return { text: "–" };
        if (
          colIndex === MANH_HAI_COL.MUA_CHENH_LECH ||
          colIndex === MANH_HAI_COL.BAN_CHENH_LECH
        ) {
          const text = formatVnd(live);
          return {
            text,
            toneClass: getNumberToneClass(Number.isFinite(live) ? live : null),
          };
        }
        return { text: formatVnd(live) };
      }
    }

    const base = fullRowsByDate[isoDate];
    const raw = base ? base[`col_${colIndex}`] : null;
    if (raw == null) return { text: "–" };
    const n = typeof raw === "number" ? raw : Number(raw);
    if (
      colIndex === MANH_HAI_COL.MUA_CHENH_LECH ||
      colIndex === MANH_HAI_COL.BAN_CHENH_LECH
    ) {
      const text = formatVnd(raw);
      return {
        text,
        toneClass: getNumberToneClass(Number.isFinite(n) ? n : null),
      };
    }
    return { text: formatVnd(raw) };
  }

  /** Ô ∑ TÀI SẢN / ∑ CHỈ VÀNG CŨ: số nguyên, có thể nhập kiểu 36.500.000.000 */
  function parseBigNumberInput(raw: string): number | null {
    const t = raw.trim();
    if (!t) return null;
    const noDots = t.replace(/\./g, "").replace(/\s/g, "");
    const n = Number(noDots);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  /** Giá Mạnh Hải thô (VNĐ) từ col_1..col_10 */
  function manhHaiRawNumber(isoDate: string, colIndex: number): number | null {
    const vn = getVietnamNowParts();
    if (isoDate === vn.isoDate && manhHaiLive?.slots) {
      const live = computeLiveManhHaiNumber(
        manhHaiLive.slots,
        colIndex,
        vn.minutes,
      );
      if (live !== undefined) {
        if (live === null) return null;
        return live;
      }
    }

    const base = fullRowsByDate[isoDate];
    const raw = base ? base[`col_${colIndex}`] : null;
    if (raw == null) return null;
    if (typeof raw === "number")
      return Number.isFinite(raw) && raw > 0 ? raw : null;
    const s = String(raw).replace(/\./g, "").replace(/,/g, "");
    const n = parseFloat(s);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  /**
   * Bán – Đóng 17h30 = col_9 (sau 9h, 11h MỞ; 14h30, 17h30 ĐÓNG).
   * col_61 "∑ chỉ vàng" = ∑ TÀI SẢN ÷ (Bán Đóng 17h30)
   */
  function chiVangIndexTaiSanOverDong17h30(isoDate: string): string {
    const taiSan = parseBigNumberInput(totalTaiSan);
    const dong17h30Ban = manhHaiRawNumber(isoDate, MANH_HAI_COL.BAN_17H30);
    if (taiSan == null) return "–";
    if (dong17h30Ban == null) return "–";
    const q = taiSan / dong17h30Ban;
    return q.toLocaleString("vi-VN", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 4,
    });
  }

  /** ∑ CHỈ VÀNG CŨ: cho phép 0 (khác ô ∑ TÀI SẢN chỉ nhận > 0) */
  function parseChiVangCuInput(raw: string): number | null {
    const t = raw.trim();
    if (!t) return null;
    const noDots = t.replace(/\./g, "").replace(/\s/g, "");
    const n = Number(noDots);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }

  /**
   * col_66 "∑ chỉ vàng thêm" = ∑ chỉ vàng − ∑ CHỈ VÀNG CŨ
   * (= cùng số với col_61 trừ ô nhập ∑ CHỈ VÀNG CŨ)
   */
  function chiVangThemMinusChiCu(isoDate: string): string {
    const taiSan = parseBigNumberInput(totalTaiSan);
    const chiCu = parseChiVangCuInput(totalChiVangCu);
    const dong17h30Ban = manhHaiRawNumber(isoDate, MANH_HAI_COL.BAN_17H30);
    if (taiSan == null) return "–";
    if (dong17h30Ban == null) return "–";
    if (chiCu == null) return "–";
    const chiVang = taiSan / dong17h30Ban;
    const them = chiVang - chiCu;
    return them.toLocaleString("vi-VN", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 4,
    });
  }

  /** Giá trị số cột ∑ chỉ vàng (61) — để so sánh hàng. */
  function chiVangIndexNumber(isoDate: string): number | null {
    const taiSan = parseBigNumberInput(totalTaiSan);
    const dong17h30Ban = manhHaiRawNumber(isoDate, MANH_HAI_COL.BAN_17H30);
    if (taiSan == null || dong17h30Ban == null) return null;
    return taiSan / dong17h30Ban;
  }

  /** Giá trị số cột ∑ chỉ vàng thêm (66). */
  function chiVangThemNumber(isoDate: string): number | null {
    const taiSan = parseBigNumberInput(totalTaiSan);
    const chiCu = parseChiVangCuInput(totalChiVangCu);
    const dong17h30Ban = manhHaiRawNumber(isoDate, MANH_HAI_COL.BAN_17H30);
    if (taiSan == null || dong17h30Ban == null || chiCu == null) return null;
    return taiSan / dong17h30Ban - chiCu;
  }

  /** Cột CHÊNH LỆCH (trong nước / thế giới) 62–65:
   *  = BÁN mạnh hải theo khung giờ - (KITCO - Giá vàng thế giới / 8.2945) * Tỉ giá VCB (bán).
   */
  const CHENH_LECH_TRONG_THE_GIOI_DENOM = 8.2945;

  function parseNumberFromDisplayedKitco(s: string): number | null {
    const t = s.trim();
    if (t === "–" || t === "") return null;
    const x = t.replace("%", "").trim().replace(/\s/g, "");
    const n = parseFloat(x.replace(/,/g, ""));
    return Number.isFinite(n) ? n : null;
  }

  function chenhLechTrongNuocTheGioiNumber(
    isoDate: string,
    slotIdx: 0 | 1 | 2 | 3,
  ): number | null {
    // 0..3 ứng với (9h, 11h, 14h30, 17h30)
    const banCols = [6, 7, 8, 9] as const; // MANH_HAI_COL.BAN_*
    const kitcoCols = [14, 15, 16, 17] as const; // KITCO 9h/11h/14h30/17h30

    const ban = manhHaiRawNumber(isoDate, banCols[slotIdx]);

    const kitcoStr = kitcoCellValue(isoDate, kitcoCols[slotIdx]);
    const kitco = parseNumberFromDisplayedKitco(kitcoStr);

    const base = fullRowsByDate[isoDate];
    const rawVcb = base ? base[`col_60`] : null;
    const vcb =
      rawVcb == null
        ? null
        : typeof rawVcb === "number"
          ? rawVcb
          : (() => {
              const n = parseFloat(String(rawVcb).replace(/,/g, "").trim());
              return Number.isFinite(n) ? n : null;
            })();

    if (ban == null || kitco == null || vcb == null) return null;

    const v = ban - (kitco / CHENH_LECH_TRONG_THE_GIOI_DENOM) * vcb;
    return Number.isFinite(v) ? v : null;
  }

  /** So với hàng liền trên trong bảng: xanh tăng, đỏ giảm, đen nếu không đổi hoặc không so được. */
  function toneClassCompareToRowAbove(
    current: number | null,
    prev: number | null,
  ): string {
    if (current == null) return "text-stone-950 dark:text-stone-50 font-bold";
    if (prev == null) return "text-stone-950 dark:text-stone-50 font-bold";
    // "Không tăng không giảm": coi như bằng nhau nếu chênh lệch rất nhỏ
    const EPS = 1e-9;
    if (Math.abs(current - prev) <= EPS)
      return "text-stone-950 dark:text-stone-50 font-bold";
    if (current > prev) return "text-green-600 dark:text-green-400 font-bold";
    if (current < prev) return "text-red-600 dark:text-red-400 font-bold";
    return "text-stone-950 dark:text-stone-50 font-bold";
  }

  /** Trong cùng một ngày (cùng hàng): so với ô giá liền trước — dùng cho khung giờ / ĐÓNG vs mốc trước. */
  function toneClassIntradayVsPrev(
    currentStr: string,
    prevStr: string,
  ): string {
    const cur = parseNumberFromDisplayedKitco(currentStr);
    const prev = parseNumberFromDisplayedKitco(prevStr);
    return toneClassCompareToRowAbove(cur, prev);
  }

  const neutralPriceClass =
    "text-stone-950 dark:text-stone-50 font-bold" as const;

  /**
   * Mở (9h, 11h = col 1–2, 6–7): không tô màu theo chênh — luôn đen (neutral).
   * Đóng (14h30, 17h30): xanh/đỏ so với mốc giá liền trước trong cùng ngày
   * (MUA: 14h30↔11h, 17h30↔14h30; BÁN: tương tự col 8↔7, 9↔8).
   */
  function manhHaiDongIntradayToneClass(isoDate: string, colIndex: number): string {
    if (colIndex === MANH_HAI_COL.MUA_14H30) {
      return toneClassCompareToRowAbove(
        manhHaiRawNumber(isoDate, MANH_HAI_COL.MUA_14H30),
        manhHaiRawNumber(isoDate, MANH_HAI_COL.MUA_11H),
      );
    }
    if (colIndex === MANH_HAI_COL.MUA_17H30) {
      return toneClassCompareToRowAbove(
        manhHaiRawNumber(isoDate, MANH_HAI_COL.MUA_17H30),
        manhHaiRawNumber(isoDate, MANH_HAI_COL.MUA_14H30),
      );
    }
    if (colIndex === MANH_HAI_COL.BAN_14H30) {
      return toneClassCompareToRowAbove(
        manhHaiRawNumber(isoDate, MANH_HAI_COL.BAN_14H30),
        manhHaiRawNumber(isoDate, MANH_HAI_COL.BAN_11H),
      );
    }
    if (colIndex === MANH_HAI_COL.BAN_17H30) {
      return toneClassCompareToRowAbove(
        manhHaiRawNumber(isoDate, MANH_HAI_COL.BAN_17H30),
        manhHaiRawNumber(isoDate, MANH_HAI_COL.BAN_14H30),
      );
    }
    return neutralPriceClass;
  }

  /**
   * Lãi (nếu bán ra) tại từng mốc =
   * (∑ Đầu tư × ∑ chỉ vàng đang có) − MUA − Bán (Mạnh Hải cùng mốc VN).
   * MUA: col_1..col_4; Bán: col_6..col_9 (9h, 11h, 14h30, 17h30).
   */
  function laiNeuBanRaNumber(
    isoDate: string,
    colJ: 67 | 68 | 69 | 70,
  ): number | null {
    const muaCols = [
      MANH_HAI_COL.MUA_9H,
      MANH_HAI_COL.MUA_11H,
      MANH_HAI_COL.MUA_14H30,
      MANH_HAI_COL.MUA_17H30,
    ] as const;
    const banCols = [
      MANH_HAI_COL.BAN_9H,
      MANH_HAI_COL.BAN_11H,
      MANH_HAI_COL.BAN_14H30,
      MANH_HAI_COL.BAN_17H30,
    ] as const;
    const slotIdx = colJ - 67;
    const dauTu = parseBigNumberInput(totalDauTu);
    const chi = parseChiVangCuInput(chiVangDangCo);
    const giaMua = manhHaiRawNumber(isoDate, muaCols[slotIdx]!);
    const giaBan = manhHaiRawNumber(isoDate, banCols[slotIdx]!);
    if (dauTu == null || chi == null || giaMua == null || giaBan == null)
      return null;
    const base = dauTu * chi;
    const lai = base - giaMua - giaBan;
    return Number.isFinite(lai) ? lai : null;
  }

  function laiNeuBanRa(
    isoDate: string,
    colJ: 67 | 68 | 69 | 70,
  ): { text: string; toneClass?: string } {
    const lai = laiNeuBanRaNumber(isoDate, colJ);
    if (lai == null) return { text: "–" };
    const text = formatVnd(lai);
    return {
      text,
      toneClass: getNumberToneClass(lai),
    };
  }

  function exportCellPlainText(
    row: { isoDate: string; weekdayLabel: string; dateLabel: string },
    j: number,
  ): string {
    const { isoDate } = row;
    if (j === 11) return row.weekdayLabel;
    if (j === 12) return row.dateLabel;
    if (j >= 1 && j <= 10) {
      const v = manhHaiCellValue(isoDate, j);
      const toneClass =
        j === 1 || j === 2 || j === 6 || j === 7
          ? neutralPriceClass
          : j === 3 || j === 4 || j === 8 || j === 9
            ? manhHaiDongIntradayToneClass(isoDate, j)
            : (v.toneClass ?? neutralPriceClass);
      return formatTableToneCellDisplay(v.text, toneClass);
    }
    if (j >= 67 && j <= 70) {
      const colJ = j as 67 | 68 | 69 | 70;
      const v = laiNeuBanRa(isoDate, colJ);
      return formatTableToneCellDisplay(
        v.text,
        v.toneClass ?? neutralPriceClass,
      );
    }
    if (j === 21) {
      const raw = kitcoCellValue(isoDate, j);
      return formatTableToneCellDisplay(
        formatChangeWithPlus(raw),
        getMarketChangeToneClass(raw),
      );
    }
    if (j === 30) {
      const rawCh = marketTimedCellValue(isoDate, j, "oil");
      return formatTableToneCellDisplay(
        formatChangeWithPlus(rawCh),
        getMarketChangeToneClass(rawCh),
      );
    }
    if (j === 39) {
      const rawCh = marketTimedCellValue(isoDate, j, "dollarIndex");
      return formatTableToneCellDisplay(
        formatChangeWithPlus(rawCh),
        getMarketChangeToneClass(rawCh),
      );
    }
    if (j === 48) {
      const rawCh = marketTimedCellValue(isoDate, j, "bond10y");
      return formatTableToneCellDisplay(
        formatChangeWithPlus(rawCh),
        getMarketChangeToneClass(rawCh),
      );
    }
    if (j === 57) {
      const rawCh = marketTimedCellValue(isoDate, j, "sp500");
      return formatTableToneCellDisplay(
        formatChangeWithPlus(rawCh),
        getMarketChangeToneClass(rawCh),
      );
    }
    if (j === 13) return kitcoCellValue(isoDate, j);
    if (j >= 14 && j <= 20) {
      const v = kitcoCellValue(isoDate, j);
      if (v === "–") return v;
      const openV = kitcoCellValue(isoDate, 13);
      return formatTableToneCellDisplay(v, toneClassIntradayVsPrev(v, openV));
    }
    if (j === 22) return marketTimedCellValue(isoDate, j, "oil");
    if (j >= 23 && j <= 29) {
      const v = marketTimedCellValue(isoDate, j, "oil");
      if (v === "–") return v;
      const openV = marketTimedCellValue(isoDate, 22, "oil");
      return formatTableToneCellDisplay(v, toneClassIntradayVsPrev(v, openV));
    }
    if (j === 31) return marketTimedCellValue(isoDate, j, "dollarIndex");
    if (j >= 32 && j <= 38) {
      const v = marketTimedCellValue(isoDate, j, "dollarIndex");
      if (v === "–") return v;
      const openV = marketTimedCellValue(isoDate, 31, "dollarIndex");
      return formatTableToneCellDisplay(v, toneClassIntradayVsPrev(v, openV));
    }
    if (j === 40) return marketTimedCellValue(isoDate, j, "bond10y");
    if (j >= 41 && j <= 47) {
      const v = marketTimedCellValue(isoDate, j, "bond10y");
      if (v === "–") return v;
      const openV = marketTimedCellValue(isoDate, 40, "bond10y");
      return formatTableToneCellDisplay(v, toneClassIntradayVsPrev(v, openV));
    }
    if (j === 49) return marketTimedCellValue(isoDate, j, "sp500");
    if (j >= 50 && j <= 56) {
      const v = marketTimedCellValue(isoDate, j, "sp500");
      if (v === "–") return v;
      const openV = marketTimedCellValue(isoDate, 49, "sp500");
      return formatTableToneCellDisplay(v, toneClassIntradayVsPrev(v, openV));
    }
    if (j === 61) {
      const text = chiVangIndexTaiSanOverDong17h30(isoDate);
      if (text === "–") return text;
      const n = chiVangIndexNumber(isoDate);
      const rowIdx = dateRows.findIndex((r) => r.isoDate === isoDate);
      const prevIso = rowIdx > 0 ? dateRows[rowIdx - 1]?.isoDate : null;
      const prevN = prevIso != null ? chiVangIndexNumber(prevIso) : null;
      return formatTableToneCellDisplay(
        text,
        toneClassCompareToRowAbove(n, prevN),
      );
    }
    if (j >= 62 && j <= 65) {
      const slot = (j - 62) as 0 | 1 | 2 | 3;
      const n = chenhLechTrongNuocTheGioiNumber(isoDate, slot);
      if (n == null) return "–";
      const prevN =
        slot > 0
          ? chenhLechTrongNuocTheGioiNumber(
              isoDate,
              (slot - 1) as 0 | 1 | 2 | 3,
            )
          : null;
      return formatTableToneCellDisplay(
        formatVnd(n),
        toneClassCompareToRowAbove(n, prevN),
      );
    }
    if (j === 66) {
      const text = chiVangThemMinusChiCu(isoDate);
      if (text === "–") return text;
      const n = chiVangThemNumber(isoDate);
      const rowIdx = dateRows.findIndex((r) => r.isoDate === isoDate);
      const prevIso = rowIdx > 0 ? dateRows[rowIdx - 1]?.isoDate : null;
      const prevN = prevIso != null ? chiVangThemNumber(prevIso) : null;
      return formatTableToneCellDisplay(
        text,
        toneClassCompareToRowAbove(n, prevN),
      );
    }
    if (j === 60) return vcbCellValue(isoDate, j);
    return "–";
  }

  function handleDownloadXlsx() {
    const cols = visibleJ.filter((c) => c !== 0);
    if (cols.length === 0) return;
    const header = cols.map((jj) => CSV_COL_LABELS[jj] ?? `col_${jj}`);
    const rows = dateRows.map((row) =>
      cols.map((jj) => exportCellPlainText(row, jj)),
    );
    const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Du_lieu");
    XLSX.writeFile(wb, `gia-vang-${from}_${to}.xlsx`);
  }

  return (
    <div className="flex h-dvh max-h-dvh min-h-0 flex-col overflow-hidden bg-white text-stone-900 dark:bg-stone-950 dark:text-stone-100">
      <header className="shrink-0 z-20 border-b border-amber-200/50 dark:border-amber-900/30 bg-white/90 dark:bg-stone-900/90">
        <div className="w-full px-4 sm:px-6">
          <div className="flex h-12 shrink-0 items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl overflow-hidden">
                <Image
                  src="/favicon.svg"
                  alt="Logo"
                  width={28}
                  height={28}
                  priority
                />
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-[15px] sm:text-lg font-extrabold tracking-tight">
                    <span className="bg-gradient-to-r from-amber-700 via-amber-600 to-orange-600 dark:from-amber-300 dark:via-amber-200 dark:to-orange-200 bg-clip-text text-transparent">
                      Giá vàng
                    </span>{" "}
                    <span className="text-stone-800 dark:text-stone-100">
                      &
                    </span>{" "}
                    <span className="text-stone-800 dark:text-stone-100">
                      Tỷ giá
                    </span>
                  </h1>
                  <span className="hidden sm:inline-flex items-center gap-1 rounded-full border border-amber-200/70 dark:border-amber-800/40 bg-amber-50/70 dark:bg-amber-950/30 px-2 py-0.5 text-[14px] font-semibold text-amber-800 dark:text-amber-200">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    Live
                  </span>
                </div>
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-2 border-t border-amber-200/40 py-2 dark:border-amber-900/25 sm:flex-row sm:items-end sm:flex-wrap">
            {/* Trái: xuất CSV/XLSX + cột (cùng khu với bộ lọc) */}
            <div className="flex flex-wrap items-center gap-2">
              {isLoadingTable ? (
                tableLoadProgress ? (
                  <span className="inline-flex items-center gap-2 rounded-lg border border-amber-200/70 bg-amber-50/80 px-2.5 py-1 text-[13px] text-amber-900 dark:border-amber-800/50 dark:bg-amber-950/40 dark:text-amber-200">
                    <span className="inline-block h-3 w-3 shrink-0 rounded-full border-2 border-amber-500 border-t-transparent animate-spin" />
                    <span className="font-semibold tabular-nums">
                      {tableLoadProgress.loaded.toLocaleString("vi-VN")} /{" "}
                      {tableLoadProgress.total.toLocaleString("vi-VN")}{" "}
                      <span className="hidden sm:inline">ngày</span>
                    </span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-2 text-[14px] text-amber-700 dark:text-amber-300">
                    <span className="inline-block h-3 w-3 rounded-full border-2 border-amber-500 border-t-transparent animate-spin" />
                    <span className="hidden sm:inline">Đang tải...</span>
                  </span>
                )
              ) : null}
              <div className="inline-flex h-9 shrink-0 overflow-hidden rounded-xl border border-emerald-200/80 dark:border-emerald-800/50">
                <button
                  type="button"
                  onClick={handleDownloadXlsx}
                  disabled={isLoadingTable || dateRows.length === 0}
                  className="border-0 bg-emerald-50/90 px-3 text-[14px] font-semibold text-emerald-900 hover:bg-emerald-100/90 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-emerald-950/40 dark:text-emerald-200 dark:hover:bg-emerald-900/50"
                >
                  Tải XLSX
                </button>
              </div>
              <div className="inline-flex h-9 shrink-0 overflow-hidden rounded-xl border border-stone-200/70 dark:border-stone-700/40">
                <button
                  type="button"
                  onClick={() => setManualCardsModalOpen(true)}
                  className="border-0 bg-stone-50/90 px-3 text-[14px] font-semibold text-stone-900 hover:bg-stone-100/90 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-stone-900/40 dark:text-stone-100 dark:hover:bg-stone-800/60"
                >
                  {MANUAL_INPUTS_UI_LABEL_VI}
                </button>
              </div>
              <div className="relative z-[260]">
                <button
                  type="button"
                  onClick={() =>
                    setColumnMenuOpen((o) => {
                      const next = !o;
                      if (!next) setColumnMenuQuery("");
                      return next;
                    })
                  }
                  className={`inline-flex h-9 shrink-0 items-center gap-2 rounded-xl border px-3 text-[14px] font-semibold transition-colors ${
                    columnMenuOpen
                      ? "border-amber-300 bg-amber-100/90 text-amber-900 dark:border-amber-700 dark:bg-amber-900/35 dark:text-amber-100"
                      : "border-amber-200/70 bg-white text-amber-900 hover:bg-amber-50/80 dark:border-amber-800/45 dark:bg-stone-900 dark:text-amber-200 dark:hover:bg-amber-950/40"
                  }`}
                  aria-expanded={columnMenuOpen}
                  aria-haspopup="dialog"
                >
                  <span className="text-[15px] leading-none">⚙</span>
                  <span>Tùy chỉnh hiển thị</span>
                  <span className="text-[12px] leading-none">
                    {columnMenuOpen ? "▲" : "▼"}
                  </span>
                </button>
                {columnMenuOpen
                  ? createPortal(
                      <>
                        <button
                          type="button"
                          aria-label="Đóng tùy chỉnh hiển thị"
                          className="fixed inset-0 z-[298] bg-black/25 backdrop-blur-[1px]"
                          onMouseDown={() => {
                            setColumnMenuOpen(false);
                            setColumnMenuQuery("");
                          }}
                        />
                        <div
                          className="scroll-table-premium fixed left-1/2 top-1/2 z-[299] w-[min(92vw,560px)] max-h-[min(78vh,560px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-amber-200/80 bg-white/95 p-3 shadow-2xl backdrop-blur-sm dark:border-stone-600 dark:bg-stone-900/95"
                          role="dialog"
                          aria-label="Chọn nhóm cột hiển thị"
                          onWheel={(e) => {
                            // Khi popup đang mở, chặn wheel lan sang vùng bảng lớn phía sau.
                            e.stopPropagation();
                            e.preventDefault();
                            e.currentTarget.scrollTop += e.deltaY;
                          }}
                        >
                          <div className="mb-3 flex items-start justify-between gap-3 px-1">
                            <div>
                              <p className="text-[14px] font-extrabold text-stone-900 dark:text-stone-100">
                                Tùy chỉnh hiển thị
                              </p>
                            </div>
                            <button
                              type="button"
                              className="rounded-md border border-stone-200 px-2 py-1 text-[12px] font-semibold text-stone-600 hover:bg-stone-100 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
                              onClick={() => {
                                setColumnMenuOpen(false);
                                setColumnMenuQuery("");
                              }}
                            >
                              Đóng
                            </button>
                          </div>

                          <div className="rounded-xl border border-amber-200/80 bg-amber-50/60 p-2 dark:border-amber-800/50 dark:bg-amber-950/25">
                            <p className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-300">
                              Nhóm cột
                            </p>
                            <div className="flex flex-col gap-1">
                              {filteredToggleableGroups.map((g) => (
                                <label
                                  key={g}
                                  className="flex cursor-pointer items-center justify-between gap-3 rounded-lg px-2 py-1.5 hover:bg-white/80 dark:hover:bg-stone-800/70"
                                >
                                  <span className="text-[14px] text-stone-800 dark:text-stone-200">
                                    {GROUP_LABELS_VI[g]}
                                  </span>
                                  <span className="relative inline-flex shrink-0 items-center">
                                    <input
                                      type="checkbox"
                                      checked={columnVisibility[g]}
                                      onChange={(e) => {
                                        const checked = e.target.checked;
                                        setColumnVisibility((prev) => {
                                          const next = {
                                            ...prev,
                                            [g]: checked,
                                          };
                                          if (
                                            !TOGGLEABLE_GROUPS.some(
                                              (x) => next[x],
                                            )
                                          )
                                            return prev;
                                          return next;
                                        });
                                      }}
                                      className="peer sr-only"
                                    />
                                    <span className="h-5 w-9 rounded-full bg-stone-300 transition-colors peer-checked:bg-amber-500 dark:bg-stone-600 dark:peer-checked:bg-amber-500" />
                                    <span className="pointer-events-none absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4" />
                                  </span>
                                </label>
                              ))}
                              {filteredToggleableGroups.length === 0 ? (
                                <p className="px-2 py-1 text-[12px] text-stone-500 dark:text-stone-400">
                                  Không tìm thấy nhóm cột phù hợp.
                                </p>
                              ) : null}
                            </div>
                          </div>

                          <div className="mt-2 rounded-xl border border-blue-200/80 bg-blue-50/60 p-2 dark:border-blue-800/50 dark:bg-blue-950/20">
                            <p className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-wide text-blue-800 dark:text-blue-300">
                              {MANUAL_INPUTS_UI_LABEL_VI}
                            </p>
                            <div className="flex flex-col gap-1">
                              {filteredManualCardGroups.map((g) => (
                                <label
                                  key={g}
                                  className="flex cursor-pointer items-center justify-between gap-3 rounded-lg px-2 py-1.5 hover:bg-white/80 dark:hover:bg-stone-800/70"
                                >
                                  <span className="text-[14px] text-stone-800 dark:text-stone-200">
                                    {MANUAL_CARD_LABELS_VI[g]}
                                  </span>
                                  <span className="relative inline-flex shrink-0 items-center">
                                    <input
                                      type="checkbox"
                                      checked={manualCardVisibility[g]}
                                      onChange={(e) => {
                                        const checked = e.target.checked;
                                        setManualCardVisibility((prev) => {
                                          const next = {
                                            ...prev,
                                            [g]: checked,
                                          };
                                          if (
                                            !MANUAL_CARD_GROUPS.some(
                                              (x) => next[x],
                                            )
                                          ) {
                                            return prev;
                                          }
                                          return next;
                                        });
                                      }}
                                      className="peer sr-only"
                                    />
                                    <span className="h-5 w-9 rounded-full bg-stone-300 transition-colors peer-checked:bg-blue-500 dark:bg-stone-600 dark:peer-checked:bg-blue-500" />
                                    <span className="pointer-events-none absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4" />
                                  </span>
                                </label>
                              ))}
                              {filteredManualCardGroups.length === 0 ? (
                                <p className="px-2 py-1 text-[12px] text-stone-500 dark:text-stone-400">
                                  Không tìm thấy mục phù hợp.
                                </p>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </>,
                      document.body,
                    )
                  : null}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[14px] font-semibold text-stone-600 dark:text-stone-400">
                Lọc theo
              </span>
              <div className="inline-flex rounded-xl border border-amber-200/60 dark:border-amber-800/40 bg-white dark:bg-stone-900 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setRangeMode("month")}
                  className={`px-3 py-2 text-sm font-medium transition-colors ${
                    rangeMode === "month"
                      ? "bg-amber-100/80 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200"
                      : "text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800"
                  }`}
                >
                  Tháng
                </button>
                <button
                  type="button"
                  onClick={() => setRangeMode("quarter")}
                  className={`px-3 py-2 text-sm font-medium transition-colors ${
                    rangeMode === "quarter"
                      ? "bg-amber-100/80 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200"
                      : "text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800"
                  }`}
                >
                  Quý
                </button>
                <button
                  type="button"
                  onClick={() => setRangeMode("year")}
                  className={`px-3 py-2 text-sm font-medium transition-colors ${
                    rangeMode === "year"
                      ? "bg-amber-100/80 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200"
                      : "text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800"
                  }`}
                >
                  Năm
                </button>
                <button
                  type="button"
                  onClick={() => setRangeMode("all")}
                  className={`px-3 py-2 text-sm font-medium transition-colors ${
                    rangeMode === "all"
                      ? "bg-amber-100/80 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200"
                      : "text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800"
                  }`}
                  title="Từ 01/01/2022 đến hôm nay (toàn bộ dữ liệu app)"
                >
                  Tất cả
                </button>
              </div>
            </div>

            {!isAllRange ? (
              <div className="flex items-center gap-2">
                <span className="text-[14px] font-semibold text-stone-600 dark:text-stone-400">
                  Năm
                </span>
                <select
                  value={selectedYear}
                  onChange={(e) =>
                    setSelectedYear(parseInt(e.target.value, 10))
                  }
                  className="h-9 rounded-xl border border-amber-200/60 dark:border-amber-800/40 bg-white dark:bg-stone-900 px-3 text-sm"
                >
                  {Array.from(
                    { length: currentYear - 2022 + 1 },
                    (_, i) => 2022 + i,
                  )
                    .reverse()
                    .map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                </select>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-300/50 bg-amber-50/70 px-3 py-2 text-[13px] dark:border-amber-800/50 dark:bg-amber-950/35">
                <span className="font-bold text-amber-900 dark:text-amber-200">
                  Toàn bộ dữ liệu
                </span>
                <span className="text-stone-600 dark:text-stone-400">
                  01/01/2022 → hôm nay
                </span>
              </div>
            )}

            {rangeMode === "month" && (
              <div className="flex items-center gap-2">
                <span className="text-[14px] font-semibold text-stone-600 dark:text-stone-400">
                  Tháng
                </span>
                <select
                  value={selectedMonth}
                  onChange={(e) =>
                    setSelectedMonth(parseInt(e.target.value, 10))
                  }
                  className="h-9 rounded-xl border border-amber-200/60 dark:border-amber-800/40 bg-white dark:bg-stone-900 px-3 text-sm"
                >
                  {Array.from({ length: maxMonth }, (_, i) => i + 1).map(
                    (m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ),
                  )}
                </select>
              </div>
            )}

            {rangeMode === "quarter" && (
              <div className="flex items-center gap-2">
                <span className="text-[14px] font-semibold text-stone-600 dark:text-stone-400">
                  Quý
                </span>
                <div className="inline-flex rounded-xl overflow-hidden border border-amber-200/60 dark:border-amber-800/40 bg-white dark:bg-stone-900">
                  {[1, 2, 3, 4].map((q) => {
                    const disabled = q > maxQuarter;
                    return (
                      <button
                        key={q}
                        type="button"
                        disabled={disabled}
                        onClick={() => setSelectedQuarter(q)}
                        className={`px-3 py-2 text-sm font-medium transition-colors ${
                          selectedQuarter === q
                            ? "bg-amber-100/80 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200"
                            : disabled
                              ? "bg-stone-50 dark:bg-stone-800 text-stone-400 dark:text-stone-500 cursor-not-allowed"
                              : "text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800"
                        }`}
                      >
                        Q{q}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="text-[14px] text-stone-500 dark:text-stone-400 sm:ml-auto">
              <div className="flex items-center gap-2 justify-end">
                <span>
                  Đang xem: <span className="font-semibold">{from}</span> →{" "}
                  <span className="font-semibold">{to}</span>
                  {isAllRange ? (
                    <span className="ml-1.5 text-stone-400 dark:text-stone-500">
                      (tất cả)
                    </span>
                  ) : null}
                </span>
                {!isLoadingTable && (
                  <span className="hidden sm:inline">
                    • <span className="font-semibold">{dateRows.length}</span>{" "}
                    ngày
                  </span>
                )}
              </div>
              {isLoadingTable && tableLoadProgress ? (
                <div className="mt-2 w-full max-w-md sm:ml-auto">
                  <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-[12px] text-amber-800 dark:text-amber-200">
                    <span className="font-medium text-amber-900 dark:text-amber-100">
                      Đang tải bảng (gói {tableLoadProgress.chunkCurrent}/
                      {tableLoadProgress.chunkTotal})
                    </span>
                    <span className="font-bold tabular-nums">
                      {tableLoadProgress.loaded.toLocaleString("vi-VN")} /{" "}
                      {tableLoadProgress.total.toLocaleString("vi-VN")} ngày
                    </span>
                  </div>
                  <div
                    className="h-2 w-full overflow-hidden rounded-full bg-amber-200/50 dark:bg-amber-900/50"
                    role="progressbar"
                    aria-valuenow={tableLoadProgress.loaded}
                    aria-valuemin={0}
                    aria-valuemax={tableLoadProgress.total}
                  >
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 transition-[width] duration-300 ease-out dark:from-amber-400 dark:via-orange-400 dark:to-amber-500"
                      style={{
                        width: `${tableLoadProgress.total > 0 ? Math.min(100, (tableLoadProgress.loaded / tableLoadProgress.total) * 100) : 0}%`,
                      }}
                    />
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      <main className="flex min-h-0 flex-1 flex-col overflow-hidden px-0 pb-2 pt-3 sm:pt-4">
        {cellColorPicker != null &&
          typeof document !== "undefined" &&
          createPortal(
            <>
              <button
                type="button"
                aria-label="Đóng chọn màu"
                className="fixed inset-0 z-[199] cursor-default bg-black/20 dark:bg-black/40"
                onMouseDown={() => setCellColorPicker(null)}
              />
              <div
                role="dialog"
                aria-label="Màu nền ô"
                className="fixed z-[200] rounded-xl border border-stone-200/90 bg-white p-2.5 shadow-2xl dark:border-stone-600 dark:bg-stone-900"
                style={{
                  top: cellColorPicker.top,
                  left: cellColorPicker.left,
                  width: CELL_COLOR_POPOVER_W,
                }}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <p className="mb-2 text-center text-[12px] font-semibold text-stone-600 dark:text-stone-300">
                  Màu nền ô
                </p>
                <div className="grid grid-cols-4 gap-1.5">
                  {CELL_BG_PRESETS.map((hex) => (
                    <button
                      key={hex}
                      type="button"
                      title={hex}
                      className="h-8 rounded-md border border-stone-300/80 shadow-inner transition hover:scale-105 hover:ring-2 hover:ring-amber-400/70 focus:outline-none focus:ring-2 focus:ring-amber-500 dark:border-stone-600"
                      style={{ backgroundColor: hex }}
                      onClick={() => {
                        const key = cellColorPicker.key;
                        setCellBgColors((prev) => {
                          const next = { ...prev, [key]: hex };
                          persistCellBgColors(next);
                          return next;
                        });
                        setCellColorPicker(null);
                      }}
                    />
                  ))}
                </div>
                <label className="mt-2.5 flex items-center gap-2 text-[12px] text-stone-600 dark:text-stone-400">
                  <span className="shrink-0">Khác</span>
                  <input
                    type="color"
                    className="h-9 min-w-0 flex-1 cursor-pointer rounded-md border border-stone-300 bg-stone-50 p-0.5 dark:border-stone-600 dark:bg-stone-800"
                    value={cellBgColors[cellColorPicker.key] ?? "#fff9c4"}
                    onChange={(e) => {
                      const hex = e.target.value;
                      const key = cellColorPicker.key;
                      setCellBgColors((prev) => {
                        const next = { ...prev, [key]: hex };
                        persistCellBgColors(next);
                        return next;
                      });
                    }}
                  />
                </label>
                <button
                  type="button"
                  className="mt-2 w-full rounded-lg border border-stone-200 py-1.5 text-[12px] font-medium text-stone-600 hover:bg-stone-100 dark:border-stone-600 dark:text-stone-300 dark:hover:bg-stone-800"
                  onClick={() => {
                    const key = cellColorPicker.key;
                    setCellBgColors((prev) => {
                      const next = { ...prev };
                      delete next[key];
                      persistCellBgColors(next);
                      return next;
                    });
                    setCellColorPicker(null);
                  }}
                >
                  Xóa màu (mặc định)
                </button>
              </div>
            </>,
            document.body,
          )}

        {manualCardsModalOpen &&
          typeof document !== "undefined" &&
          createPortal(
            <>
              <button
                type="button"
                aria-label={`Đóng ${MANUAL_INPUTS_UI_LABEL_VI}`}
                className="fixed inset-0 z-[330] bg-black/35 backdrop-blur-[2px]"
                onMouseDown={() => setManualCardsModalOpen(false)}
              />
              <div
                className="scroll-table-premium fixed left-1/2 top-1/2 z-[331] w-[min(92vw,720px)] max-h-[min(80vh,720px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-amber-200/70 bg-gradient-to-b from-amber-50/55 via-white to-white p-0 shadow-[0_10px_50px_-12px_rgba(180,83,9,0.28)] backdrop-blur-md dark:border-amber-800/45 dark:from-amber-950/45 dark:via-stone-900 dark:to-stone-950"
                role="dialog"
                aria-label={MANUAL_INPUTS_UI_LABEL_VI}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <div className="rounded-t-2xl border-b border-amber-200/55 bg-gradient-to-r from-amber-500/[0.12] via-amber-400/[0.06] to-sky-500/[0.08] px-4 py-3.5 dark:border-amber-800/40">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[15px] font-extrabold tracking-tight text-stone-900 dark:text-stone-50">
                        {MANUAL_INPUTS_UI_LABEL_VI}
                      </p>
                      <p className="mt-1 text-[12px] leading-snug text-stone-600 dark:text-stone-400">
                        Nhập số để đối chiếu với các cột tính trong bảng.
                      </p>
                    </div>
                    <button
                      type="button"
                      className="group inline-flex shrink-0 items-center gap-1.5 rounded-full border border-amber-300/90 bg-gradient-to-b from-white to-amber-50/90 px-3.5 py-2 text-[13px] font-bold text-amber-950 shadow-sm transition hover:border-amber-400 hover:from-amber-50 hover:to-amber-100 hover:shadow-md active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/80 dark:border-amber-600/80 dark:from-amber-950/70 dark:to-amber-900/80 dark:text-amber-50 dark:hover:border-amber-500 dark:hover:from-amber-900/90 dark:hover:to-amber-950"
                      onClick={() => setManualCardsModalOpen(false)}
                    >
                      <span
                        className="text-[20px] font-light leading-none text-amber-600 transition group-hover:text-amber-800 dark:text-amber-300 dark:group-hover:text-amber-100"
                        aria-hidden
                      >
                        ×
                      </span>
                      Đóng
                    </button>
                  </div>
                </div>

                {manualCardVisibility.manualLeft ||
                manualCardVisibility.manualRight ? (
                  <div className="w-full px-4 pb-4 pt-4">
                    {/* Bốn chỉ số nhập tay — lưới 2 cột, hàng cuối full width */}
                    <div className="w-full">
                      <div className={MANUAL_MODAL_FORM_GRID}>
                        {/* 1 — Σ Đầu tư */}
                        {manualCardVisibility.manualLeft ? (
                          <div className={MANUAL_MODAL_FIELD_BOX_MONEY}>
                            <p className={MANUAL_MODAL_FIELD_TITLE_MONEY}>
                              ∑ Đầu tư
                            </p>
                            <label
                              htmlFor="manual-modal-dau-tu"
                              className={MANUAL_MODAL_FIELD_LABEL}
                            >
                              Vốn / giá trị đầu tư — đơn vị VNĐ
                            </label>
                            <input
                              id="manual-modal-dau-tu"
                              type="text"
                              inputMode="numeric"
                              autoComplete="off"
                              placeholder="vd. 30.000.000.000"
                              value={totalDauTu}
                              onChange={(e) => {
                                const v = e.target.value;
                                setTotalDauTu(v);
                                try {
                                  localStorage.setItem(LS_INPUT_DAU_TU, v);
                                } catch {
                                  /* ignore */
                                }
                              }}
                              onBlur={(e) => {
                                const v = formatTaiSanInputDisplay(
                                  e.target.value,
                                );
                                setTotalDauTu(v);
                                try {
                                  localStorage.setItem(LS_INPUT_DAU_TU, v);
                                } catch {
                                  /* ignore */
                                }
                              }}
                              className={MANUAL_MODAL_INPUT_CLASS}
                            />
                          </div>
                        ) : null}

                        {/* 2 — Σ Tài sản */}
                        {manualCardVisibility.manualRight ? (
                          <div className={MANUAL_MODAL_FIELD_BOX_MONEY}>
                            <p className={MANUAL_MODAL_FIELD_TITLE_MONEY}>
                              ∑ Tài sản
                            </p>
                            <label
                              htmlFor="manual-modal-tai-san"
                              className={MANUAL_MODAL_FIELD_LABEL}
                            >
                              Dùng tính cột ∑ chỉ vàng trong bảng — đơn vị VNĐ
                            </label>
                            <input
                              id="manual-modal-tai-san"
                              type="text"
                              inputMode="numeric"
                              autoComplete="off"
                              placeholder="vd. 36.500.000.000"
                              value={totalTaiSan}
                              onChange={(e) => {
                                const v = e.target.value;
                                setTotalTaiSan(v);
                                try {
                                  localStorage.setItem(LS_INPUT_TAI_SAN, v);
                                } catch {
                                  /* ignore */
                                }
                              }}
                              onBlur={(e) => {
                                const v = formatTaiSanInputDisplay(
                                  e.target.value,
                                );
                                setTotalTaiSan(v);
                                try {
                                  localStorage.setItem(LS_INPUT_TAI_SAN, v);
                                } catch {
                                  /* ignore */
                                }
                              }}
                              className={MANUAL_MODAL_INPUT_CLASS}
                            />
                          </div>
                        ) : null}

                        {/* 3 — Σ chỉ vàng cũ */}
                        {manualCardVisibility.manualLeft ? (
                          <div className={MANUAL_MODAL_FIELD_BOX_CHI}>
                            <p className={MANUAL_MODAL_FIELD_TITLE_CHI}>
                              ∑ Chỉ vàng cũ
                            </p>
                            <label
                              htmlFor="manual-modal-chi-vang-cu"
                              className={MANUAL_MODAL_FIELD_LABEL}
                            >
                              Trừ khi tính “∑ chỉ vàng thêm” — đơn vị chỉ
                            </label>
                            <input
                              id="manual-modal-chi-vang-cu"
                              type="text"
                              inputMode="numeric"
                              autoComplete="off"
                              placeholder="vd. 1.148"
                              value={totalChiVangCu}
                              onChange={(e) => {
                                const v = e.target.value;
                                setTotalChiVangCu(v);
                                try {
                                  localStorage.setItem(LS_INPUT_CHI_VANG_CU, v);
                                } catch {
                                  /* ignore */
                                }
                              }}
                              onBlur={(e) => {
                                const v = formatChiVangCuInputDisplay(
                                  e.target.value,
                                );
                                setTotalChiVangCu(v);
                                try {
                                  localStorage.setItem(LS_INPUT_CHI_VANG_CU, v);
                                } catch {
                                  /* ignore */
                                }
                              }}
                              className={MANUAL_MODAL_INPUT_CLASS_CHI}
                            />
                          </div>
                        ) : null}

                        {/* 4 — Σ chỉ vàng đang có */}
                        {manualCardVisibility.manualRight ? (
                          <div className={MANUAL_MODAL_FIELD_BOX_CHI}>
                            <p className={MANUAL_MODAL_FIELD_TITLE_CHI}>
                              ∑ Chỉ vàng đang có
                            </p>
                            <label
                              htmlFor="manual-modal-chi-vang-dang-co"
                              className={MANUAL_MODAL_FIELD_LABEL}
                            >
                              Số chỉ hiện đang nắm giữ — đơn vị chỉ
                            </label>
                            <input
                              id="manual-modal-chi-vang-dang-co"
                              type="text"
                              inputMode="numeric"
                              autoComplete="off"
                              placeholder="vd. 1.920"
                              value={chiVangDangCo}
                              onChange={(e) => {
                                const v = e.target.value;
                                setChiVangDangCo(v);
                                try {
                                  localStorage.setItem(
                                    LS_INPUT_CHI_VANG_DANG_CO,
                                    v,
                                  );
                                } catch {
                                  /* ignore */
                                }
                              }}
                              onBlur={(e) => {
                                const v = formatChiVangCuInputDisplay(
                                  e.target.value,
                                );
                                setChiVangDangCo(v);
                                try {
                                  localStorage.setItem(
                                    LS_INPUT_CHI_VANG_DANG_CO,
                                    v,
                                  );
                                } catch {
                                  /* ignore */
                                }
                              }}
                              className={MANUAL_MODAL_INPUT_CLASS_CHI}
                            />
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2 hidden">
                      <button
                        type="button"
                        onClick={() => {
                          setRangeMode("month");
                          setSelectedYear(currentYear);
                          setSelectedMonth(currentMonth);
                        }}
                        className="h-9 px-3 rounded-xl border border-amber-200/60 dark:border-amber-800/40 bg-white dark:bg-stone-900 text-[14px] text-amber-900 dark:text-amber-200 hover:bg-amber-50/70 dark:hover:bg-amber-950/30"
                      >
                        Tháng này
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setRangeMode("month");
                          setSelectedYear(prevMonthInfo.y);
                          setSelectedMonth(prevMonthInfo.m);
                        }}
                        className="h-9 px-3 rounded-xl border border-amber-200/60 dark:border-amber-800/40 bg-white dark:bg-stone-900 text-[14px] text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800"
                      >
                        Tháng trước
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setRangeMode("quarter");
                          setSelectedYear(currentYear);
                          setSelectedQuarter(currentQuarter);
                        }}
                        className="h-9 px-3 rounded-xl border border-amber-200/60 dark:border-amber-800/40 bg-white dark:bg-stone-900 text-[14px] text-amber-900 dark:text-amber-200 hover:bg-amber-50/70 dark:hover:bg-amber-950/30"
                      >
                        Quý này
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setRangeMode("quarter");
                          setSelectedYear(prevQuarterInfo.y);
                          setSelectedQuarter(prevQuarterInfo.q);
                        }}
                        className="h-9 px-3 rounded-xl border border-amber-200/60 dark:border-amber-800/40 bg-white dark:bg-stone-900 text-[14px] text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800"
                      >
                        Quý trước
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setRangeMode("year");
                          setSelectedYear(currentYear);
                        }}
                        className="h-9 px-3 rounded-xl border border-amber-200/60 dark:border-amber-800/40 bg-white dark:bg-stone-900 text-[14px] text-amber-900 dark:text-amber-200 hover:bg-amber-50/70 dark:hover:bg-amber-950/30"
                      >
                        Năm nay
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mx-4 mb-4 rounded-xl border border-amber-200/65 bg-gradient-to-r from-amber-50/80 to-stone-50/60 p-4 text-[13px] leading-relaxed text-stone-600 shadow-sm dark:border-amber-800/45 dark:from-amber-950/35 dark:to-stone-900/60 dark:text-stone-300">
                    {`Chưa bật “${MANUAL_INPUTS_UI_LABEL_VI}” trong Tùy chỉnh hiển thị.`}
                  </div>
                )}
              </div>
            </>,
            document.body,
          )}

        <div className="scroll-table-premium min-h-0 w-full flex-1 overflow-auto border-2 border-solid border-black bg-white dark:border-stone-200 dark:bg-stone-900">
          <table
            className={`table-fixed w-full border-separate border-spacing-0 text-center ${TABLE_TEXT}`}
            style={{ minWidth: `${tableMinWidthPx}px` }}
          >
            <colgroup>
              {visibleJ.map((j) => (
                <col
                  key={j}
                  style={{
                    width:
                      j === 11
                        ? `${WEEKDAY_COL_WIDTH_PX}px`
                        : j === 12
                          ? `${DATE_COL_WIDTH_PX}px`
                          : `${DATA_COL_MIN_PX}px`,
                    minWidth:
                      j === 11
                        ? WEEKDAY_COL_WIDTH_PX
                        : j === 12
                          ? DATE_COL_WIDTH_PX
                          : DATA_COL_MIN_PX,
                  }}
                />
              ))}
            </colgroup>
            {/* z-50: luôn nằm trên ô sticky Thứ/Ngày ở tbody (z-20/19) khi cuộn dọc — tránh bị hàng dữ liệu đè header */}
            <thead className="sticky top-0 z-50 bg-amber-100/90 dark:bg-amber-900/30 backdrop-blur-sm text-center [&_th]:!text-[13px] [&_th]:!leading-tight [&_th]:font-bold [&_th]:!border-black [&_th]:dark:!border-stone-200 [&_th]:transition-[filter,box-shadow] [&_th]:duration-200 [&_th]:hover:brightness-[1.04] dark:[&_th]:hover:brightness-110">
              {/* Dòng 1: STT + Thứ (hẹp) / Ngày (rộng) */}
              <tr>
                <th
                  rowSpan={3}
                  className="sticky left-0 top-0 z-[102] min-w-0 max-w-[48px] border-b border-r border-black dark:border-stone-200 px-0.5 py-1 text-[12px] font-bold uppercase tracking-wide text-stone-950 dark:text-stone-100 whitespace-nowrap bg-rose-100 dark:bg-rose-950 shadow-[4px_0_12px_-4px_rgba(0,0,0,0.12)] dark:shadow-[4px_0_12px_-4px_rgba(0,0,0,0.45)]"
                >
                  Thứ
                </th>
                <th
                  rowSpan={3}
                  className="sticky top-0 z-[101] min-w-0 border-b border-r border-black dark:border-stone-200 px-1.5 py-1 text-[13px] font-bold uppercase tracking-wide leading-tight text-stone-950 dark:text-stone-100 whitespace-nowrap bg-sky-100 dark:bg-sky-900 shadow-[4px_0_12px_-4px_rgba(0,0,0,0.1)] dark:shadow-[4px_0_12px_-4px_rgba(0,0,0,0.4)]"
                  style={{
                    left: `${WEEKDAY_COL_WIDTH_PX}px`,
                  }}
                >
                  Ngày
                </th>
                {columnVisibility.muaMh ? (
                  <th colSpan={5} className={manhHaiHeaderGroupClass()}>
                    MUA - Mạnh Hải
                  </th>
                ) : null}
                {columnVisibility.muaMh ? (
                  <th
                    rowSpan={2}
                    colSpan={4}
                    className={`${TABLE_CELL_BR} align-middle px-1.5 py-1 text-center text-[13px] font-bold uppercase tracking-wide leading-tight ${LAI_HEAD_GREEN}`}
                  >
                    LÃI
                    <br />
                    (nếu bán ra)
                  </th>
                ) : null}
                {columnVisibility.banMh ? (
                  <th colSpan={5} className={manhHaiHeaderGroupClass()}>
                    BÁN - Mạnh Hải
                  </th>
                ) : null}
                {columnVisibility.banMh ? (
                  <>
                    <th
                      rowSpan={3}
                      className={`min-w-0 border border-black dark:border-stone-200 px-1.5 py-1 text-[13px] font-bold leading-tight text-stone-900 dark:text-stone-100 ${getRegionHeaderBgClass(61)}`}
                    >
                      <span className="block">∑</span>
                      <span className="block">chỉ</span>
                      <span className="block">vàng</span>
                    </th>
                    <th
                      rowSpan={3}
                      className={`min-w-0 border border-black dark:border-stone-200 border-l-0 px-1.5 py-1 text-[13px] font-bold leading-tight text-stone-900 dark:text-stone-100 ${getRegionHeaderBgClass(66)}`}
                    >
                      <span className="block">∑</span>
                      <span className="block">chỉ vàng</span>
                      <span className="block">thêm</span>
                    </th>
                    <th
                      colSpan={4}
                      className={`border border-black dark:border-stone-200 border-l-0 px-1.5 py-1 text-[13px] font-bold uppercase tracking-wide text-stone-900 dark:text-stone-100 ${getRegionHeaderBgClass(62)}`}
                    >
                      CHÊNH LỆCH
                    </th>
                  </>
                ) : null}
                {columnVisibility.kitco ? (
                  <th
                    colSpan={9}
                    className={`border-b border-r border-black dark:border-stone-200 px-1.5 py-1 text-[13px] font-bold text-stone-900 dark:text-stone-100 whitespace-nowrap ${getRegionHeaderBgClass(13)}`}
                  >
                    KITCO - GIÁ VÀNG THẾ GIỚI
                  </th>
                ) : null}
                {columnVisibility.oil ? (
                  <th
                    colSpan={9}
                    className={`border-b border-r border-black dark:border-stone-200 px-1.5 py-1 text-[13px] font-bold text-stone-900 dark:text-stone-100 whitespace-nowrap ${getRegionHeaderBgClass(22)}`}
                  >
                    GIÁ DẦU
                  </th>
                ) : null}
                {columnVisibility.dollar ? (
                  <th
                    colSpan={9}
                    className={`border-b border-r border-black dark:border-stone-200 px-1.5 py-1 text-[13px] font-bold text-stone-900 dark:text-stone-100 whitespace-nowrap ${getRegionHeaderBgClass(31)}`}
                  >
                    DOLLAR INDEX
                  </th>
                ) : null}
                {columnVisibility.bond ? (
                  <th
                    colSpan={9}
                    className={`border-b border-r border-black dark:border-stone-200 px-1.5 py-1 text-[13px] font-bold text-stone-900 dark:text-stone-100 whitespace-nowrap ${getRegionHeaderBgClass(40)}`}
                  >
                    TRÁI PHIẾU US - 10 NĂM
                  </th>
                ) : null}
                {columnVisibility.sp500 ? (
                  <th
                    colSpan={9}
                    className={`border-b border-r border-black dark:border-stone-200 px-1.5 py-1 text-[13px] font-bold text-stone-900 dark:text-stone-100 whitespace-nowrap ${getRegionHeaderBgClass(49)}`}
                  >
                    S&amp;P 500
                  </th>
                ) : null}
                {columnVisibility.vcb ? (
                  <th
                    colSpan={1}
                    className={`border-b border-black dark:border-stone-200 px-1.5 py-1 text-[13px] font-bold text-stone-950 dark:text-stone-100 whitespace-nowrap ${getRegionHeaderBgClass(60)}`}
                  >
                    Tỷ Giá VCB
                  </th>
                ) : null}
              </tr>
              {/* Dòng 2: Mở/Đóng/Chênh lệch, v.v. */}
              <tr>
                {columnVisibility.muaMh ? (
                  <>
                    <th className={manhHaiHeaderRow2CellClass()}>MỞ</th>
                    <th className={manhHaiHeaderRow2CellClass()}></th>
                    <th className={manhHaiHeaderRow2CellClass()}></th>
                    <th className={manhHaiHeaderRow2CellClass()}>ĐÓNG</th>
                    <th
                      rowSpan={2}
                      className={manhHaiHeaderChenhLechRowSpanClass()}
                    >
                      CHÊNH LỆCH
                    </th>
                  </>
                ) : null}
                {columnVisibility.banMh ? (
                  <>
                    <th className={manhHaiHeaderRow2CellClass()}>MỞ</th>
                    <th className={manhHaiHeaderRow2CellClass()}></th>
                    <th className={manhHaiHeaderRow2CellClass()}></th>
                    <th className={manhHaiHeaderRow2CellClass()}>ĐÓNG</th>
                    <th
                      rowSpan={2}
                      className={manhHaiHeaderChenhLechRowSpanClass()}
                    >
                      CHÊNH LỆCH
                    </th>
                  </>
                ) : null}
                {/* Thứ, Ngày đã rowSpan=3 ở dòng 1 nên bỏ qua ở dòng 2 */}
                {columnVisibility.banMh ? (
                  <th
                    colSpan={4}
                    className={`border-b border-r border-black dark:border-stone-200 px-1.5 py-1 text-[13px] font-bold text-center text-stone-900 dark:text-stone-100 ${getRegionHeaderBgClass(62)}`}
                  >
                    (trong nước / thế giới)
                  </th>
                ) : null}
                {columnVisibility.kitco ? (
                  <>
                    {/* KITCO (9 cột) */}
                    <th
                      className={`border-b border-r border-black dark:border-stone-200 px-1.5 py-1 text-[13px] font-semibold text-stone-900 dark:text-stone-100 whitespace-nowrap ${getRegionHeaderBgClass(13)}`}
                    >
                      MỞ
                    </th>
                    <th
                      className={`border-b border-r border-black dark:border-stone-200 px-1.5 py-1 text-[13px] font-semibold text-stone-900 dark:text-stone-100 whitespace-nowrap ${getRegionHeaderBgClass(13)}`}
                      aria-hidden
                    >
                      {"\u00a0"}
                    </th>
                    <th
                      className={`border-b border-r border-black dark:border-stone-200 px-1.5 py-1 text-[13px] font-semibold text-stone-900 dark:text-stone-100 whitespace-nowrap ${getRegionHeaderBgClass(13)}`}
                      aria-hidden
                    >
                      {"\u00a0"}
                    </th>
                    <th
                      className={`border-b border-r border-black dark:border-stone-200 px-1.5 py-1 text-[13px] font-semibold text-stone-900 dark:text-stone-100 whitespace-nowrap ${getRegionHeaderBgClass(13)}`}
                      aria-hidden
                    >
                      {"\u00a0"}
                    </th>
                    <th
                      className={`border-b border-r border-black dark:border-stone-200 px-1.5 py-1 text-[13px] font-semibold text-stone-900 dark:text-stone-100 whitespace-nowrap ${getRegionHeaderBgClass(13)}`}
                      aria-hidden
                    >
                      {"\u00a0"}
                    </th>
                    <th
                      className={`border-b border-r border-black dark:border-stone-200 px-1.5 py-1 text-[13px] font-semibold text-stone-900 dark:text-stone-100 whitespace-nowrap ${getRegionHeaderBgClass(13)}`}
                    >
                      ĐÓNG
                    </th>
                    <th
                      rowSpan={2}
                      className={`border-b border-r border-black dark:border-stone-200 px-1.5 py-1 text-[13px] font-semibold text-stone-900 dark:text-stone-100 whitespace-nowrap align-middle text-center ${getRegionHeaderBgClass(13)}`}
                    >
                      CAO
                    </th>
                    <th
                      rowSpan={2}
                      className={`border-b border-r border-black dark:border-stone-200 px-1.5 py-1 text-[13px] font-semibold text-stone-900 dark:text-stone-100 whitespace-nowrap align-middle text-center ${getRegionHeaderBgClass(13)}`}
                    >
                      THẤP
                    </th>
                    <th
                      rowSpan={2}
                      className={`border-b border-r border-black dark:border-stone-200 px-1.5 py-1 text-[13px] font-semibold text-stone-900 dark:text-stone-100 whitespace-nowrap align-middle text-center ${getRegionHeaderBgClass(13)}`}
                    >
                      THAY ĐỔI
                    </th>
                  </>
                ) : null}
                {columnVisibility.oil ? (
                  <>
                    {/* Giá dầu (9 cột) */}
                    <th
                      className={`border-b border-r border-black dark:border-stone-200 px-1.5 py-1 text-[13px] font-semibold text-stone-900 dark:text-stone-100 whitespace-nowrap ${getRegionHeaderBgClass(22)}`}
                    >
                      MỞ
                    </th>
                    <th
                      className={`border-b border-r border-black dark:border-stone-200 px-1.5 py-1 text-[13px] font-semibold text-stone-900 dark:text-stone-100 whitespace-nowrap ${getRegionHeaderBgClass(22)}`}
                      aria-hidden
                    >
                      {"\u00a0"}
                    </th>
                    <th
                      className={`border-b border-r border-black dark:border-stone-200 px-1.5 py-1 text-[13px] font-semibold text-stone-900 dark:text-stone-100 whitespace-nowrap ${getRegionHeaderBgClass(22)}`}
                      aria-hidden
                    >
                      {"\u00a0"}
                    </th>
                    <th
                      className={`border-b border-r border-black dark:border-stone-200 px-1.5 py-1 text-[13px] font-semibold text-stone-900 dark:text-stone-100 whitespace-nowrap ${getRegionHeaderBgClass(22)}`}
                      aria-hidden
                    >
                      {"\u00a0"}
                    </th>
                    <th
                      className={`border-b border-r border-black dark:border-stone-200 px-1.5 py-1 text-[13px] font-semibold text-stone-900 dark:text-stone-100 whitespace-nowrap ${getRegionHeaderBgClass(22)}`}
                      aria-hidden
                    >
                      {"\u00a0"}
                    </th>
                    <th
                      className={`border-b border-r border-black dark:border-stone-200 px-1.5 py-1 text-[13px] font-semibold text-stone-900 dark:text-stone-100 whitespace-nowrap ${getRegionHeaderBgClass(22)}`}
                    >
                      PRICE
                    </th>
                    <th
                      rowSpan={2}
                      className={`border-b border-r border-black dark:border-stone-200 px-1.5 py-1 text-[13px] font-semibold text-stone-900 dark:text-stone-100 whitespace-nowrap align-middle text-center ${getRegionHeaderBgClass(22)}`}
                    >
                      CAO
                    </th>
                    <th
                      rowSpan={2}
                      className={`border-b border-r border-black dark:border-stone-200 px-1.5 py-1 text-[13px] font-semibold text-stone-900 dark:text-stone-100 whitespace-nowrap align-middle text-center ${getRegionHeaderBgClass(22)}`}
                    >
                      THẤP
                    </th>
                    <th
                      rowSpan={2}
                      className={`border-b border-r border-black dark:border-stone-200 px-1.5 py-1 text-[13px] font-semibold text-stone-900 dark:text-stone-100 whitespace-nowrap align-middle text-center ${getRegionHeaderBgClass(22)}`}
                    >
                      THAY ĐỔI
                    </th>
                  </>
                ) : null}
                {columnVisibility.dollar ? (
                  <>
                    {/* Dollar index (9 cột) */}
                    <th
                      className={`border-b border-r border-black dark:border-stone-200 px-1.5 py-1 text-[13px] font-semibold text-stone-900 dark:text-stone-100 whitespace-nowrap ${getRegionHeaderBgClass(31)}`}
                    >
                      MỞ
                    </th>
                    <th
                      className={`border-b border-r border-black dark:border-stone-200 px-1.5 py-1 text-[13px] font-semibold text-stone-900 dark:text-stone-100 whitespace-nowrap ${getRegionHeaderBgClass(31)}`}
                      aria-hidden
                    >
                      {"\u00a0"}
                    </th>
                    <th
                      className={`border-b border-r border-black dark:border-stone-200 px-1.5 py-1 text-[13px] font-semibold text-stone-900 dark:text-stone-100 whitespace-nowrap ${getRegionHeaderBgClass(31)}`}
                      aria-hidden
                    >
                      {"\u00a0"}
                    </th>
                    <th
                      className={`border-b border-r border-black dark:border-stone-200 px-1.5 py-1 text-[13px] font-semibold text-stone-900 dark:text-stone-100 whitespace-nowrap ${getRegionHeaderBgClass(31)}`}
                      aria-hidden
                    >
                      {"\u00a0"}
                    </th>
                    <th
                      className={`border-b border-r border-black dark:border-stone-200 px-1.5 py-1 text-[13px] font-semibold text-stone-900 dark:text-stone-100 whitespace-nowrap ${getRegionHeaderBgClass(31)}`}
                      aria-hidden
                    >
                      {"\u00a0"}
                    </th>
                    <th
                      className={`border-b border-r border-black dark:border-stone-200 px-1.5 py-1 text-[13px] font-semibold text-stone-900 dark:text-stone-100 whitespace-nowrap ${getRegionHeaderBgClass(31)}`}
                    >
                      PRICE
                    </th>
                    <th
                      rowSpan={2}
                      className={`border-b border-r border-black dark:border-stone-200 px-1.5 py-1 text-[13px] font-semibold text-stone-900 dark:text-stone-100 whitespace-nowrap align-middle text-center ${getRegionHeaderBgClass(31)}`}
                    >
                      CAO
                    </th>
                    <th
                      rowSpan={2}
                      className={`border-b border-r border-black dark:border-stone-200 px-1.5 py-1 text-[13px] font-semibold text-stone-900 dark:text-stone-100 whitespace-nowrap align-middle text-center ${getRegionHeaderBgClass(31)}`}
                    >
                      THẤP
                    </th>
                    <th
                      rowSpan={2}
                      className={`border-b border-r border-black dark:border-stone-200 px-1.5 py-1 text-[13px] font-semibold text-stone-900 dark:text-stone-100 whitespace-nowrap align-middle text-center ${getRegionHeaderBgClass(31)}`}
                    >
                      THAY ĐỔI
                    </th>
                  </>
                ) : null}
                {columnVisibility.bond ? (
                  <>
                    {/* Trái phiếu 10Y (9 cột) */}
                    <th
                      className={`border-b border-r border-black dark:border-stone-200 px-1.5 py-1 text-[13px] font-semibold text-stone-900 dark:text-stone-100 whitespace-nowrap ${getRegionHeaderBgClass(40)}`}
                    >
                      MỞ
                    </th>
                    <th
                      className={`border-b border-r border-black dark:border-stone-200 px-1.5 py-1 text-[13px] font-semibold text-stone-900 dark:text-stone-100 whitespace-nowrap ${getRegionHeaderBgClass(40)}`}
                      aria-hidden
                    >
                      {"\u00a0"}
                    </th>
                    <th
                      className={`border-b border-r border-black dark:border-stone-200 px-1.5 py-1 text-[13px] font-semibold text-stone-900 dark:text-stone-100 whitespace-nowrap ${getRegionHeaderBgClass(40)}`}
                      aria-hidden
                    >
                      {"\u00a0"}
                    </th>
                    <th
                      className={`border-b border-r border-black dark:border-stone-200 px-1.5 py-1 text-[13px] font-semibold text-stone-900 dark:text-stone-100 whitespace-nowrap ${getRegionHeaderBgClass(40)}`}
                      aria-hidden
                    >
                      {"\u00a0"}
                    </th>
                    <th
                      className={`border-b border-r border-black dark:border-stone-200 px-1.5 py-1 text-[13px] font-semibold text-stone-900 dark:text-stone-100 whitespace-nowrap ${getRegionHeaderBgClass(40)}`}
                      aria-hidden
                    >
                      {"\u00a0"}
                    </th>
                    <th
                      className={`border-b border-r border-black dark:border-stone-200 px-1.5 py-1 text-[13px] font-semibold text-stone-900 dark:text-stone-100 whitespace-nowrap ${getRegionHeaderBgClass(40)}`}
                    >
                      PRICE
                    </th>
                    <th
                      rowSpan={2}
                      className={`border-b border-r border-black dark:border-stone-200 px-1.5 py-1 text-[13px] font-semibold text-stone-900 dark:text-stone-100 whitespace-nowrap align-middle text-center ${getRegionHeaderBgClass(40)}`}
                    >
                      CAO
                    </th>
                    <th
                      rowSpan={2}
                      className={`border-b border-r border-black dark:border-stone-200 px-1.5 py-1 text-[13px] font-semibold text-stone-900 dark:text-stone-100 whitespace-nowrap align-middle text-center ${getRegionHeaderBgClass(40)}`}
                    >
                      THẤP
                    </th>
                    <th
                      rowSpan={2}
                      className={`border-b border-r border-black dark:border-stone-200 px-1.5 py-1 text-[13px] font-semibold text-stone-900 dark:text-stone-100 whitespace-nowrap align-middle text-center ${getRegionHeaderBgClass(40)}`}
                    >
                      THAY ĐỔI
                    </th>
                  </>
                ) : null}
                {columnVisibility.sp500 ? (
                  <>
                    {/* S&P 500 (9 cột) */}
                    <th
                      className={`border-b border-r border-black dark:border-stone-200 px-1.5 py-1 text-[13px] font-semibold text-stone-900 dark:text-stone-100 whitespace-nowrap ${getRegionHeaderBgClass(49)}`}
                    >
                      MỞ
                    </th>
                    <th
                      className={`border-b border-r border-black dark:border-stone-200 px-1.5 py-1 text-[13px] font-semibold text-stone-900 dark:text-stone-100 whitespace-nowrap ${getRegionHeaderBgClass(49)}`}
                      aria-hidden
                    >
                      {"\u00a0"}
                    </th>
                    <th
                      className={`border-b border-r border-black dark:border-stone-200 px-1.5 py-1 text-[13px] font-semibold text-stone-900 dark:text-stone-100 whitespace-nowrap ${getRegionHeaderBgClass(49)}`}
                      aria-hidden
                    >
                      {"\u00a0"}
                    </th>
                    <th
                      className={`border-b border-r border-black dark:border-stone-200 px-1.5 py-1 text-[13px] font-semibold text-stone-900 dark:text-stone-100 whitespace-nowrap ${getRegionHeaderBgClass(49)}`}
                      aria-hidden
                    >
                      {"\u00a0"}
                    </th>
                    <th
                      className={`border-b border-r border-black dark:border-stone-200 px-1.5 py-1 text-[13px] font-semibold text-stone-900 dark:text-stone-100 whitespace-nowrap ${getRegionHeaderBgClass(49)}`}
                      aria-hidden
                    >
                      {"\u00a0"}
                    </th>
                    <th
                      className={`border-b border-r border-black dark:border-stone-200 px-1.5 py-1 text-[13px] font-semibold text-stone-900 dark:text-stone-100 whitespace-nowrap ${getRegionHeaderBgClass(49)}`}
                    >
                      ĐÓNG
                    </th>
                    <th
                      rowSpan={2}
                      className={`border-b border-r border-black dark:border-stone-200 px-1.5 py-1 text-[13px] font-semibold text-stone-900 dark:text-stone-100 whitespace-nowrap align-middle text-center ${getRegionHeaderBgClass(49)}`}
                    >
                      CAO
                    </th>
                    <th
                      rowSpan={2}
                      className={`border-b border-r border-black dark:border-stone-200 px-1.5 py-1 text-[13px] font-semibold text-stone-900 dark:text-stone-100 whitespace-nowrap align-middle text-center ${getRegionHeaderBgClass(49)}`}
                    >
                      THẤP
                    </th>
                    <th
                      rowSpan={2}
                      className={`border-b border-r border-black dark:border-stone-200 px-1.5 py-1 text-[13px] font-semibold text-stone-900 dark:text-stone-100 whitespace-nowrap align-middle text-center ${getRegionHeaderBgClass(49)}`}
                    >
                      THAY ĐỔI
                    </th>
                  </>
                ) : null}
                {columnVisibility.vcb ? (
                  <>
                    {/* Tách riêng để "Bán" thẳng hàng với dòng 2 (không gộp vào "Tỷ Giá VCB") */}
                    <th
                      rowSpan={2}
                      className={`border-b border-stone-200 px-1.5 py-1 text-[13px] font-semibold text-stone-950 dark:text-stone-100 whitespace-nowrap align-middle ${getRegionHeaderBgClass(60)}`}
                    >
                      Bán
                    </th>
                  </>
                ) : null}
              </tr>
              {/* Dòng 3: các mốc giờ chi tiết */}
              <tr>
                {columnVisibility.muaMh ? (
                  <>
                    {/* Mua - Mạnh Hải: 4 ô giờ (CHÊNH LỆCH đã rowSpan ở dòng trên) */}
                    <th className={manhHaiHeaderTimeRowClass()}>
                      9h
                      <br />
                      (Việt Nam)
                    </th>
                    <th className={manhHaiHeaderTimeRowClass()}>
                      11h
                      <br />
                      (Việt Nam)
                    </th>
                    <th className={manhHaiHeaderTimeRowClass()}>
                      14h30
                      <br />
                      (Việt Nam)
                    </th>
                    <th className={manhHaiHeaderTimeRowClass()}>
                      17h30
                      <br />
                      (Việt Nam)
                    </th>
                  </>
                ) : null}
                {columnVisibility.muaMh ? (
                  <>
                    <th className={LAI_HEAD_TIME_CLASS}>
                      9h
                      <br />
                      (Việt Nam)
                    </th>
                    <th className={LAI_HEAD_TIME_CLASS}>
                      11h
                      <br />
                      (Việt Nam)
                    </th>
                    <th className={LAI_HEAD_TIME_CLASS}>
                      14h30
                      <br />
                      (Việt Nam)
                    </th>
                    <th className={LAI_HEAD_TIME_CLASS}>
                      17h30
                      <br />
                      (Việt Nam)
                    </th>
                  </>
                ) : null}
                {columnVisibility.banMh ? (
                  <>
                    {/* Bán - Mạnh Hải */}
                    <th className={manhHaiHeaderTimeRowClass()}>
                      9h
                      <br />
                      (Việt Nam)
                    </th>
                    <th className={manhHaiHeaderTimeRowClass()}>
                      11h
                      <br />
                      (Việt Nam)
                    </th>
                    <th className={manhHaiHeaderTimeRowClass()}>
                      14h30
                      <br />
                      (Việt Nam)
                    </th>
                    <th className={manhHaiHeaderTimeRowClass()}>
                      17h30
                      <br />
                      (Việt Nam)
                    </th>
                  </>
                ) : null}
                {/* Thứ, Ngày đã rowSpan=3 ở dòng 1 */}
                {columnVisibility.banMh ? (
                  <>
                    <th
                      className={`border-b border-r border-black dark:border-stone-200 px-1.5 py-1 text-[13px] font-bold text-stone-950 dark:text-stone-50 whitespace-nowrap ${getRegionHeaderBgClass(62)}`}
                    >
                      9h
                      <br />
                      (Việt Nam)
                    </th>
                    <th
                      className={`border-b border-r border-black dark:border-stone-200 px-1.5 py-1 text-[13px] font-bold text-stone-950 dark:text-stone-50 whitespace-nowrap ${getRegionHeaderBgClass(62)}`}
                    >
                      11h
                      <br />
                      (Việt Nam)
                    </th>
                    <th
                      className={`border-b border-r border-black dark:border-stone-200 px-1.5 py-1 text-[13px] font-bold text-stone-950 dark:text-stone-50 whitespace-nowrap ${getRegionHeaderBgClass(62)}`}
                    >
                      14h30
                      <br />
                      (Việt Nam)
                    </th>
                    <th
                      className={`border-b border-r border-black dark:border-stone-200 px-1.5 py-1 text-[13px] font-bold text-stone-950 dark:text-stone-50 whitespace-nowrap ${getRegionHeaderBgClass(62)}`}
                    >
                      17h30
                      <br />
                      (Việt Nam)
                    </th>
                  </>
                ) : null}
                {columnVisibility.kitco ? (
                  <>
                    {/* KITCO (9 cột) */}
                    <th
                      className={`border-b border-r border-black dark:border-stone-200 px-1.5 py-1 text-[13px] font-bold text-stone-950 dark:text-stone-50 whitespace-nowrap ${getRegionHeaderBgClass(13)}`}
                    >
                      (US)
                    </th>
                    <th
                      className={`border-b border-r border-black dark:border-stone-200 px-1.5 py-1 text-[13px] font-bold text-stone-950 dark:text-stone-50 whitespace-nowrap ${getRegionHeaderBgClass(13)}`}
                    >
                      9h
                      <br />
                      (Việt Nam)
                    </th>
                    <th
                      className={`border-b border-r border-black dark:border-stone-200 px-1.5 py-1 text-[13px] font-bold text-stone-950 dark:text-stone-50 whitespace-nowrap ${getRegionHeaderBgClass(13)}`}
                    >
                      11h
                      <br />
                      (Việt Nam)
                    </th>
                    <th
                      className={`border-b border-r border-black dark:border-stone-200 px-1.5 py-1 text-[13px] font-bold text-stone-950 dark:text-stone-50 whitespace-nowrap ${getRegionHeaderBgClass(13)}`}
                    >
                      14h30
                      <br />
                      (Việt Nam)
                    </th>
                    <th
                      className={`border-b border-r border-black dark:border-stone-200 px-1.5 py-1 text-[13px] font-bold text-stone-950 dark:text-stone-50 whitespace-nowrap ${getRegionHeaderBgClass(13)}`}
                    >
                      17h30
                      <br />
                      (Việt Nam)
                    </th>
                    <th
                      className={`border-b border-r border-black dark:border-stone-200 px-1.5 py-1 text-[13px] font-bold text-stone-950 dark:text-stone-50 whitespace-nowrap ${getRegionHeaderBgClass(13)}`}
                    >
                      (US)
                    </th>
                  </>
                ) : null}
                {columnVisibility.oil ? (
                  <>
                    {/* Giá dầu (9 cột) */}
                    <th
                      className={`border-b border-r border-black dark:border-stone-200 px-1.5 py-1 text-[13px] font-bold text-stone-950 dark:text-stone-50 whitespace-nowrap ${getRegionHeaderBgClass(22)}`}
                    >
                      (US)
                    </th>
                    <th
                      className={`border-b border-r border-black dark:border-stone-200 px-1.5 py-1 text-[13px] font-bold text-stone-950 dark:text-stone-50 whitespace-nowrap ${getRegionHeaderBgClass(22)}`}
                    >
                      9h
                      <br />
                      (Việt Nam)
                    </th>
                    <th
                      className={`border-b border-r border-black dark:border-stone-200 px-1.5 py-1 text-[13px] font-bold text-stone-950 dark:text-stone-50 whitespace-nowrap ${getRegionHeaderBgClass(22)}`}
                    >
                      11h
                      <br />
                      (Việt Nam)
                    </th>
                    <th
                      className={`border-b border-r border-black dark:border-stone-200 px-1.5 py-1 text-[13px] font-bold text-stone-950 dark:text-stone-50 whitespace-nowrap ${getRegionHeaderBgClass(22)}`}
                    >
                      14h30
                      <br />
                      (Việt Nam)
                    </th>
                    <th
                      className={`border-b border-r border-black dark:border-stone-200 px-1.5 py-1 text-[13px] font-bold text-stone-950 dark:text-stone-50 whitespace-nowrap ${getRegionHeaderBgClass(22)}`}
                    >
                      17h30
                      <br />
                      (Việt Nam)
                    </th>
                    <th
                      className={`border-b border-r border-black dark:border-stone-200 px-1.5 py-1 text-[13px] font-bold text-stone-950 dark:text-stone-50 whitespace-nowrap ${getRegionHeaderBgClass(22)}`}
                    >
                      (US)
                    </th>
                  </>
                ) : null}
                {columnVisibility.dollar ? (
                  <>
                    {/* Dollar index (9 cột) */}
                    <th
                      className={`border-b border-r border-black dark:border-stone-200 px-1.5 py-1 text-[13px] font-bold text-stone-950 dark:text-stone-50 whitespace-nowrap ${getRegionHeaderBgClass(31)}`}
                    >
                      (US)
                    </th>
                    <th
                      className={`border-b border-r border-black dark:border-stone-200 px-1.5 py-1 text-[13px] font-bold text-stone-950 dark:text-stone-50 whitespace-nowrap ${getRegionHeaderBgClass(31)}`}
                    >
                      9h
                      <br />
                      (Việt Nam)
                    </th>
                    <th
                      className={`border-b border-r border-black dark:border-stone-200 px-1.5 py-1 text-[13px] font-bold text-stone-950 dark:text-stone-50 whitespace-nowrap ${getRegionHeaderBgClass(31)}`}
                    >
                      11h
                      <br />
                      (Việt Nam)
                    </th>
                    <th
                      className={`border-b border-r border-black dark:border-stone-200 px-1.5 py-1 text-[13px] font-bold text-stone-950 dark:text-stone-50 whitespace-nowrap ${getRegionHeaderBgClass(31)}`}
                    >
                      14h30
                      <br />
                      (Việt Nam)
                    </th>
                    <th
                      className={`border-b border-r border-black dark:border-stone-200 px-1.5 py-1 text-[13px] font-bold text-stone-950 dark:text-stone-50 whitespace-nowrap ${getRegionHeaderBgClass(31)}`}
                    >
                      17h30
                      <br />
                      (Việt Nam)
                    </th>
                    <th
                      className={`border-b border-r border-black dark:border-stone-200 px-1.5 py-1 text-[13px] font-bold text-stone-950 dark:text-stone-50 whitespace-nowrap ${getRegionHeaderBgClass(31)}`}
                    >
                      (US)
                    </th>
                  </>
                ) : null}
                {columnVisibility.bond ? (
                  <>
                    {/* Trái phiếu 10Y (9 cột) */}
                    <th
                      className={`border-b border-r border-black dark:border-stone-200 px-1.5 py-1 text-[13px] font-bold text-stone-950 dark:text-stone-50 whitespace-nowrap ${getRegionHeaderBgClass(40)}`}
                    >
                      (US)
                    </th>
                    <th
                      className={`border-b border-r border-black dark:border-stone-200 px-1.5 py-1 text-[13px] font-bold text-stone-950 dark:text-stone-50 whitespace-nowrap ${getRegionHeaderBgClass(40)}`}
                    >
                      9h
                      <br />
                      (Việt Nam)
                    </th>
                    <th
                      className={`border-b border-r border-black dark:border-stone-200 px-1.5 py-1 text-[13px] font-bold text-stone-950 dark:text-stone-50 whitespace-nowrap ${getRegionHeaderBgClass(40)}`}
                    >
                      11h
                      <br />
                      (Việt Nam)
                    </th>
                    <th
                      className={`border-b border-r border-black dark:border-stone-200 px-1.5 py-1 text-[13px] font-bold text-stone-950 dark:text-stone-50 whitespace-nowrap ${getRegionHeaderBgClass(40)}`}
                    >
                      14h30
                      <br />
                      (Việt Nam)
                    </th>
                    <th
                      className={`border-b border-r border-black dark:border-stone-200 px-1.5 py-1 text-[13px] font-bold text-stone-950 dark:text-stone-50 whitespace-nowrap ${getRegionHeaderBgClass(40)}`}
                    >
                      17h30
                      <br />
                      (Việt Nam)
                    </th>
                    <th
                      className={`border-b border-r border-black dark:border-stone-200 px-1.5 py-1 text-[13px] font-bold text-stone-950 dark:text-stone-50 whitespace-nowrap ${getRegionHeaderBgClass(40)}`}
                    >
                      (US)
                    </th>
                  </>
                ) : null}
                {columnVisibility.sp500 ? (
                  <>
                    {/* S&P 500 (9 cột) */}
                    <th
                      className={`border-b border-r border-black dark:border-stone-200 px-1.5 py-1 text-[13px] font-bold text-stone-950 dark:text-stone-50 whitespace-nowrap ${getRegionHeaderBgClass(49)}`}
                    >
                      (US)
                    </th>
                    <th
                      className={`border-b border-r border-black dark:border-stone-200 px-1.5 py-1 text-[13px] font-bold text-stone-950 dark:text-stone-50 whitespace-nowrap ${getRegionHeaderBgClass(49)}`}
                    >
                      9h
                      <br />
                      (Việt Nam)
                    </th>
                    <th
                      className={`border-b border-r border-black dark:border-stone-200 px-1.5 py-1 text-[13px] font-bold text-stone-950 dark:text-stone-50 whitespace-nowrap ${getRegionHeaderBgClass(49)}`}
                    >
                      11h
                      <br />
                      (Việt Nam)
                    </th>
                    <th
                      className={`border-b border-r border-black dark:border-stone-200 px-1.5 py-1 text-[13px] font-bold text-stone-950 dark:text-stone-50 whitespace-nowrap ${getRegionHeaderBgClass(49)}`}
                    >
                      14h30
                      <br />
                      (Việt Nam)
                    </th>
                    <th
                      className={`border-b border-r border-black dark:border-stone-200 px-1.5 py-1 text-[13px] font-bold text-stone-950 dark:text-stone-50 whitespace-nowrap ${getRegionHeaderBgClass(49)}`}
                    >
                      17h30
                      <br />
                      (Việt Nam)
                    </th>
                    <th
                      className={`border-b border-r border-black dark:border-stone-200 px-1.5 py-1 text-[13px] font-bold text-stone-950 dark:text-stone-50 whitespace-nowrap ${getRegionHeaderBgClass(49)}`}
                    >
                      (US)
                    </th>
                  </>
                ) : null}
                {columnVisibility.vcb ? (
                  <>
                    {/* Tỷ giá VCB (1 cột - chỉ lấy Bán) */}
                    {/*
                      Đã rowSpan ở dòng 2 để gộp "Bán" với dòng 3,
                      nên dòng 3 không render thêm th cho VCB.
                    */}
                  </>
                ) : null}
              </tr>
            </thead>
            <tbody className="[&_td]:align-middle [&_span]:inline-block [&_span]:max-w-full [&_span]:text-center">
              {dateRows.map((row, rowIdx) => (
                <tr
                  key={row.isoDate}
                  className="group/row transition-colors duration-200 hover:bg-stone-100/50 dark:hover:bg-stone-800/30"
                >
                  {visibleJ.map((j) =>
                    j === 0 || j === 58 || j === 59 ? null : (
                      <td
                        key={j}
                        align="center"
                        title="Nhấp đúp để chọn màu nền ô"
                        style={{
                          ...(cellBgColors[`${row.isoDate}:${j}`]
                            ? {
                                backgroundColor:
                                  cellBgColors[`${row.isoDate}:${j}`],
                              }
                            : {}),
                          ...(j === 12
                            ? {
                                left: `${WEEKDAY_COL_WIDTH_PX}px`,
                              }
                            : {}),
                        }}
                        onMouseDown={(e) => {
                          if (e.detail > 1) e.preventDefault();
                        }}
                        onDoubleClick={(e) => {
                          if (j === 0) return;
                          e.preventDefault();
                          const key = `${row.isoDate}:${j}`;
                          const rect = e.currentTarget.getBoundingClientRect();
                          const pad = 8;
                          let left = rect.left;
                          let top = rect.bottom + 6;
                          if (
                            left + CELL_COLOR_POPOVER_W >
                            window.innerWidth - pad
                          ) {
                            left = Math.max(
                              pad,
                              window.innerWidth - pad - CELL_COLOR_POPOVER_W,
                            );
                          }
                          if (left < pad) left = pad;
                          if (
                            top + CELL_COLOR_POPOVER_H >
                            window.innerHeight - pad
                          ) {
                            top = Math.max(
                              pad,
                              rect.top - CELL_COLOR_POPOVER_H - 6,
                            );
                          }
                          if (top < pad) top = pad;
                          setCellColorPicker({ key, top, left });
                        }}
                        className={
                          j === 0
                            ? "border-0 px-0 py-0 w-0 max-w-0 overflow-hidden"
                            : j === 11
                              ? `sticky left-0 z-20 min-w-0 max-w-[48px] border-r border-b border-black dark:border-stone-200 px-0.5 py-1 text-center text-[12px] font-bold tabular-nums leading-tight text-balance text-stone-950 dark:text-stone-100 bg-orange-50 dark:bg-orange-950 group-hover/row:bg-orange-100 dark:group-hover/row:bg-orange-900 shadow-[4px_0_10px_-6px_rgba(0,0,0,0.15)] dark:shadow-[4px_0_10px_-6px_rgba(0,0,0,0.5)] ${TD_CELL_FX}`
                              : j === 12
                                ? `sticky z-[19] min-w-0 border-r border-b border-black dark:border-stone-200 ${TABLE_TD_PAD} text-center ${TABLE_TEXT} font-bold tabular-nums text-balance text-stone-950 dark:text-stone-100 bg-sky-100 dark:bg-sky-950 group-hover/row:bg-sky-200 dark:group-hover/row:bg-sky-900 shadow-[4px_0_10px_-6px_rgba(0,0,0,0.12)] dark:shadow-[4px_0_10px_-6px_rgba(0,0,0,0.45)] ${TD_CELL_FX}`
                                : j >= 61 && j <= 66
                                  ? `border-r border-b border-black dark:border-stone-200 ${TABLE_TD_PAD} text-center ${TABLE_TEXT} font-bold tabular-nums whitespace-normal break-words text-stone-950 dark:text-stone-50 ${getRegionBgClass(j)} ${TD_CELL_FX}`
                                  : `border-r border-b border-black dark:border-stone-200 ${TABLE_TD_PAD} text-center ${TABLE_TEXT} font-bold tabular-nums whitespace-normal break-words text-stone-950 dark:text-stone-50 ${getRegionBgClass(j)} ${TD_CELL_FX}`
                        }
                      >
                        {isLoadingTable && j !== 0 && j !== 11 && j !== 12 ? (
                          <div className="mx-auto h-3.5 w-16 rounded bg-stone-200/70 dark:bg-stone-800/70 animate-pulse" />
                        ) : j === 0 ? (
                          ""
                        ) : j === 11 ? (
                          row.weekdayLabel
                        ) : j === 12 ? (
                          row.dateLabel
                        ) : j >= 1 && j <= 10 ? (
                          (() => {
                            const v = manhHaiCellValue(row.isoDate, j);
                            const toneClass =
                              j === 1 || j === 2 || j === 6 || j === 7
                                ? neutralPriceClass
                                : j === 3 || j === 4 || j === 8 || j === 9
                                  ? manhHaiDongIntradayToneClass(
                                      row.isoDate,
                                      j,
                                    )
                                  : (v.toneClass ?? neutralPriceClass);
                            const text = formatTableToneCellDisplay(
                              v.text,
                              toneClass,
                            );
                            return <span className={toneClass}>{text}</span>;
                          })()
                        ) : j >= 67 && j <= 70 ? (
                          (() => {
                            const colJ = j as 67 | 68 | 69 | 70;
                            const v = laiNeuBanRa(row.isoDate, colJ);
                            const tone = v.toneClass ?? neutralPriceClass;
                            const text = formatTableToneCellDisplay(v.text, tone);
                            return <span className={tone}>{text}</span>;
                          })()
                        ) : j === 21 ? (
                          (() => {
                            const v = kitcoCellValue(row.isoDate, j);
                            const tone = getMarketChangeToneClass(v);
                            const text = formatTableToneCellDisplay(
                              formatChangeWithPlus(v),
                              tone,
                            );
                            return <span className={tone}>{text}</span>;
                          })()
                        ) : j === 30 ? (
                          (() => {
                            const v = marketTimedCellValue(
                              row.isoDate,
                              j,
                              "oil",
                            );
                            const tone = getMarketChangeToneClass(v);
                            const text = formatTableToneCellDisplay(
                              formatChangeWithPlus(v),
                              tone,
                            );
                            return <span className={tone}>{text}</span>;
                          })()
                        ) : j === 39 ? (
                          (() => {
                            const v = marketTimedCellValue(
                              row.isoDate,
                              j,
                              "dollarIndex",
                            );
                            const tone = getMarketChangeToneClass(v);
                            const text = formatTableToneCellDisplay(
                              formatChangeWithPlus(v),
                              tone,
                            );
                            return <span className={tone}>{text}</span>;
                          })()
                        ) : j === 48 ? (
                          (() => {
                            const v = marketTimedCellValue(
                              row.isoDate,
                              j,
                              "bond10y",
                            );
                            const tone = getMarketChangeToneClass(v);
                            const text = formatTableToneCellDisplay(
                              formatChangeWithPlus(v),
                              tone,
                            );
                            return <span className={tone}>{text}</span>;
                          })()
                        ) : j === 57 ? (
                          (() => {
                            const v = marketTimedCellValue(
                              row.isoDate,
                              j,
                              "sp500",
                            );
                            const tone = getMarketChangeToneClass(v);
                            const text = formatTableToneCellDisplay(
                              formatChangeWithPlus(v),
                              tone,
                            );
                            return <span className={tone}>{text}</span>;
                          })()
                        ) : j === 13 ? (
                          (() => {
                            const v = kitcoCellValue(row.isoDate, j);
                            return v === "–" ? (
                              v
                            ) : (
                              <span className={neutralPriceClass}>{v}</span>
                            );
                          })()
                        ) : j >= 14 && j <= 20 ? (
                          (() => {
                            const v = kitcoCellValue(row.isoDate, j);
                            if (v === "–") return v;
                            const openV = kitcoCellValue(row.isoDate, 13);
                            const cls = toneClassIntradayVsPrev(v, openV);
                            return (
                              <span className={cls}>
                                {formatTableToneCellDisplay(v, cls)}
                              </span>
                            );
                          })()
                        ) : j === 22 ? (
                          (() => {
                            const v = marketTimedCellValue(
                              row.isoDate,
                              j,
                              "oil",
                            );
                            return v === "–" ? (
                              v
                            ) : (
                              <span className={neutralPriceClass}>{v}</span>
                            );
                          })()
                        ) : j >= 23 && j <= 29 ? (
                          (() => {
                            const v = marketTimedCellValue(
                              row.isoDate,
                              j,
                              "oil",
                            );
                            if (v === "–") return v;
                            const openV = marketTimedCellValue(
                              row.isoDate,
                              22,
                              "oil",
                            );
                            const cls = toneClassIntradayVsPrev(v, openV);
                            return (
                              <span className={cls}>
                                {formatTableToneCellDisplay(v, cls)}
                              </span>
                            );
                          })()
                        ) : j === 31 ? (
                          (() => {
                            const v = marketTimedCellValue(
                              row.isoDate,
                              j,
                              "dollarIndex",
                            );
                            return v === "–" ? (
                              v
                            ) : (
                              <span className={neutralPriceClass}>{v}</span>
                            );
                          })()
                        ) : j >= 32 && j <= 38 ? (
                          (() => {
                            const v = marketTimedCellValue(
                              row.isoDate,
                              j,
                              "dollarIndex",
                            );
                            if (v === "–") return v;
                            const openV = marketTimedCellValue(
                              row.isoDate,
                              31,
                              "dollarIndex",
                            );
                            const cls = toneClassIntradayVsPrev(v, openV);
                            return (
                              <span className={cls}>
                                {formatTableToneCellDisplay(v, cls)}
                              </span>
                            );
                          })()
                        ) : j === 40 ? (
                          (() => {
                            const v = marketTimedCellValue(
                              row.isoDate,
                              j,
                              "bond10y",
                            );
                            return v === "–" ? (
                              v
                            ) : (
                              <span className={neutralPriceClass}>{v}</span>
                            );
                          })()
                        ) : j >= 41 && j <= 47 ? (
                          (() => {
                            const v = marketTimedCellValue(
                              row.isoDate,
                              j,
                              "bond10y",
                            );
                            if (v === "–") return v;
                            const openV = marketTimedCellValue(
                              row.isoDate,
                              40,
                              "bond10y",
                            );
                            const cls = toneClassIntradayVsPrev(v, openV);
                            return (
                              <span className={cls}>
                                {formatTableToneCellDisplay(v, cls)}
                              </span>
                            );
                          })()
                        ) : j === 49 ? (
                          (() => {
                            const v = marketTimedCellValue(
                              row.isoDate,
                              j,
                              "sp500",
                            );
                            return v === "–" ? (
                              v
                            ) : (
                              <span className={neutralPriceClass}>{v}</span>
                            );
                          })()
                        ) : j >= 50 && j <= 56 ? (
                          (() => {
                            const v = marketTimedCellValue(
                              row.isoDate,
                              j,
                              "sp500",
                            );
                            if (v === "–") return v;
                            const openV = marketTimedCellValue(
                              row.isoDate,
                              49,
                              "sp500",
                            );
                            const cls = toneClassIntradayVsPrev(v, openV);
                            return (
                              <span className={cls}>
                                {formatTableToneCellDisplay(v, cls)}
                              </span>
                            );
                          })()
                        ) : j === 61 ? (
                          (() => {
                            const text = chiVangIndexTaiSanOverDong17h30(
                              row.isoDate,
                            );
                            if (text === "–") return text;
                            const n = chiVangIndexNumber(row.isoDate);
                            const prevIso =
                              rowIdx > 0 ? dateRows[rowIdx - 1]!.isoDate : null;
                            const prevN =
                              prevIso != null
                                ? chiVangIndexNumber(prevIso)
                                : null;
                            const cls = toneClassCompareToRowAbove(n, prevN);
                            return (
                              <span className={cls}>
                                {formatTableToneCellDisplay(text, cls)}
                              </span>
                            );
                          })()
                        ) : j >= 62 && j <= 65 ? (
                          (() => {
                            const slot = (j - 62) as 0 | 1 | 2 | 3;
                            const n = chenhLechTrongNuocTheGioiNumber(
                              row.isoDate,
                              slot,
                            );
                            const text = n == null ? "–" : formatVnd(n);
                            if (text === "–") return text;
                            const prevN =
                              slot > 0
                                ? chenhLechTrongNuocTheGioiNumber(
                                    row.isoDate,
                                    (slot - 1) as 0 | 1 | 2 | 3,
                                  )
                                : null;
                            const cls = toneClassCompareToRowAbove(n, prevN);
                            return (
                              <span className={cls}>
                                {formatTableToneCellDisplay(text, cls)}
                              </span>
                            );
                          })()
                        ) : j === 66 ? (
                          (() => {
                            const text = chiVangThemMinusChiCu(row.isoDate);
                            if (text === "–") return text;
                            const n = chiVangThemNumber(row.isoDate);
                            const prevIso =
                              rowIdx > 0 ? dateRows[rowIdx - 1]!.isoDate : null;
                            const prevN =
                              prevIso != null
                                ? chiVangThemNumber(prevIso)
                                : null;
                            const cls = toneClassCompareToRowAbove(n, prevN);
                            return (
                              <span className={cls}>
                                {formatTableToneCellDisplay(text, cls)}
                              </span>
                            );
                          })()
                        ) : j >= 58 && j <= 60 ? (
                          vcbCellValue(row.isoDate, j)
                        ) : (
                          "–"
                        )}
                      </td>
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>

      <footer className="shrink-0 border-t border-amber-200/40 dark:border-amber-900/30 bg-white/70 dark:bg-stone-900/70 mt-auto">
        <div className="w-full px-4 sm:px-6 py-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 text-[14px] text-stone-500 dark:text-stone-400">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg overflow-hidden">
                <Image src="/favicon.svg" alt="Logo" width={20} height={20} />
              </span>
              <p>© {new Date().getFullYear()} · Giá vàng & Tỷ giá</p>
            </div>
            <p className="text-[14px]">Make by Trần Trung Hiếu - 0862478150</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

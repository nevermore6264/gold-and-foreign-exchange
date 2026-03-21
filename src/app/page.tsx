"use client";

import { MANH_HAI_COL } from "@/lib/manh-hai-columns";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";

/**
 * Khung UI trước – chỉ header + bảng trống.
 * Phần render / load dữ liệu sẽ làm sau.
 */

type FullTableRow = Record<string, string | number | null>;
type GoldApiResponse = {
  live?: {
    bid?: number;
    ask?: number;
    change?: number;
    changePercent?: number;
  };
};

type MarketLiveResponse = {
  oil?: { price?: number; changePercent?: number; updatedAt: string };
  dollarIndex?: { price?: number; changePercent?: number; updatedAt: string };
  bond10y?: { price?: number; changePercent?: number; updatedAt: string };
  sp500?: { price?: number; changePercent?: number; updatedAt: string };
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

function getNumberToneClass(n: number | null): string {
  if (n == null || !Number.isFinite(n))
    return "text-stone-500 dark:text-stone-300 font-bold";
  if (n < 0) return "text-red-600 dark:text-red-400 font-bold";
  // Dương/trung tính: dùng đen/xám để đồng nhất màu
  return "text-stone-700 dark:text-stone-200 font-bold";
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

type RangeMode = "month" | "quarter" | "year";

function getMarketChangeToneClass(value: string): string {
  // Match web: dương xanh, âm đỏ (cho Change% của Oil / Dollar / Bond / S&P)
  const trimmed = value.trim();
  if (trimmed === "–" || trimmed === "") {
    return "text-stone-500 dark:text-stone-300 font-bold";
  }
  const num = parseFloat(trimmed.replace("%", "").replace(",", "."));
  if (!Number.isFinite(num)) {
    return "text-stone-500 dark:text-stone-300 font-bold";
  }
  if (num > 0) return "text-green-600 dark:text-green-400 font-bold";
  if (num < 0) return "text-red-600 dark:text-red-400 font-bold";
  return "text-stone-500 dark:text-stone-300 font-bold";
}

function getRegionBgClass(colIndex: number): string {
  // Background riêng cho từng nhóm dữ liệu để dễ phân biệt khi cuộn ngang.
  // Mạnh Hải: col_1..col_10
  if (colIndex >= 1 && colIndex <= 10)
    return "bg-amber-200/35 dark:bg-amber-900/25";
  // KITCO - GIÁ VÀNG THẾ GIỚI: col_13..col_21 — vàng
  if (colIndex >= 13 && colIndex <= 21)
    return "bg-yellow-200/50 dark:bg-yellow-900/30";
  // Giá dầu: col_22..col_30 — xám
  if (colIndex >= 22 && colIndex <= 30)
    return "bg-stone-200/55 dark:bg-stone-700/35";
  // Dollar index: col_31..col_39 — xanh dương
  if (colIndex >= 31 && colIndex <= 39)
    return "bg-sky-200/50 dark:bg-sky-900/30";
  // Trái phiếu 10Y: col_40..col_48 — xanh lá
  if (colIndex >= 40 && colIndex <= 48)
    return "bg-emerald-200/50 dark:bg-emerald-900/30";
  // S&P 500: col_49..col_57 — hồng
  if (colIndex >= 49 && colIndex <= 57)
    return "bg-pink-200/50 dark:bg-pink-900/30";
  // VCB: col_60 — tím
  if (colIndex === 60) return "bg-violet-200/50 dark:bg-violet-900/30";
  // Cột nhập tay sau Bán Mạnh Hải (không có trong API cũ)
  if (colIndex === 61) return "bg-rose-200/60 dark:bg-rose-900/30";
  if (colIndex === 62) return "bg-emerald-200/60 dark:bg-emerald-900/30";

  return "";
}

function getRegionHeaderBgClass(colIndex: number): string {
  // Đậm hơn body để nhìn rõ ở header.
  if (colIndex >= 1 && colIndex <= 10)
    return "bg-amber-200/70 dark:bg-amber-900/50";
  if (colIndex >= 13 && colIndex <= 21)
    return "bg-yellow-300/75 dark:bg-yellow-900/45";
  if (colIndex >= 22 && colIndex <= 30)
    return "bg-stone-300/70 dark:bg-stone-700/45";
  if (colIndex >= 31 && colIndex <= 39)
    return "bg-sky-300/75 dark:bg-sky-900/45";
  if (colIndex >= 40 && colIndex <= 48)
    return "bg-emerald-300/75 dark:bg-emerald-900/45";
  if (colIndex >= 49 && colIndex <= 57)
    return "bg-pink-300/75 dark:bg-pink-900/45";
  if (colIndex === 60) return "bg-violet-300/75 dark:bg-violet-900/45";
  if (colIndex === 61) return "bg-rose-200/80 dark:bg-rose-900/45";
  if (colIndex === 62) return "bg-emerald-200/80 dark:bg-emerald-900/45";
  return "";
}

/** Mạnh Hải (Mua/Bán): header xanh dương nhạt (~Excel #BDD7EE) */
const MH_HEAD_BLUE =
  "bg-[#BDD7EE] dark:bg-sky-900/45 text-stone-900 dark:text-sky-50";
/** Viền ô bảng: đen (light) / sáng (dark) — nét rõ giữa hàng & cột */
const TABLE_CELL_BR =
  "border-b border-r border-black dark:border-stone-200";
const MH_HEAD_BORDER = TABLE_CELL_BR;

/** Hiệu ứng ô: highlight nhẹ khi hover cả hàng (giống glass / macOS) */
const TD_CELL_FX =
  "transition-[box-shadow,filter] duration-200 ease-out motion-reduce:transition-none group-hover/row:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.4)] dark:group-hover/row:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.09)] group-hover/row:brightness-[1.015] dark:group-hover/row:brightness-110";

function manhHaiHeaderGroupClass(): string {
  return `${MH_HEAD_BORDER} px-2 py-2.5 text-xs font-bold whitespace-nowrap ${MH_HEAD_BLUE}`;
}

function manhHaiHeaderRow2CellClass(): string {
  return `${MH_HEAD_BORDER} px-2 py-2 text-[11px] font-bold whitespace-nowrap ${MH_HEAD_BLUE}`;
}

function manhHaiHeaderChenhLechRowSpanClass(): string {
  return `${MH_HEAD_BORDER} px-2 py-2 align-middle text-[11px] font-bold whitespace-nowrap ${MH_HEAD_BLUE}`;
}

function manhHaiHeaderTimeRowClass(): string {
  return `${MH_HEAD_BORDER} px-2 py-2 text-[10px] font-semibold text-stone-800 dark:text-sky-100 whitespace-nowrap ${MH_HEAD_BLUE}`;
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

function computeRange(
  mode: RangeMode,
  year: number,
  month?: number,
  quarter?: number,
): {
  from: string;
  to: string;
} {
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
  const [isLoadingTable, setIsLoadingTable] = useState<boolean>(false);
  const [kitcoLive, setKitcoLive] = useState<GoldApiResponse["live"]>();
  const [marketLive, setMarketLive] = useState<MarketLiveResponse>();

  /** ∑ TÀI SẢN / ∑ CHỈ VÀNG CŨ — nhập tay, lưu trên trình duyệt */
  const [totalTaiSan, setTotalTaiSan] = useState("");
  const [totalChiVangCu, setTotalChiVangCu] = useState("");

  useEffect(() => {
    try {
      const a = localStorage.getItem(LS_INPUT_TAI_SAN);
      const b = localStorage.getItem(LS_INPUT_CHI_VANG_CU);
      if (a != null) setTotalTaiSan(a);
      if (b != null) setTotalChiVangCu(b);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function loadFullTable() {
      try {
        // Clear old data immediately when switching range
        setFullRowsByDate({});
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
        const res = await fetch(`/api/full-table?from=${from}&to=${to}`, {
          signal: controller.signal,
        });
        if (!res.ok) return;
        const data = (await res.json()) as { rows?: FullTableRow[] };
        if (!data.rows || cancelled) return;

        const map: Record<string, FullTableRow> = {};
        for (const r of data.rows) {
          const date = r.col_12;
          if (typeof date === "string") map[date] = r;
        }
        if (!cancelled) setFullRowsByDate(map);
      } catch {
        // ignore
      } finally {
        if (!cancelled) setIsLoadingTable(false);
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

    async function loadKitcoLive() {
      try {
        const res = await fetch("/api/gold", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as GoldApiResponse;
        if (!cancelled) setKitcoLive(data.live);
      } catch {
        // ignore
      }
    }

    loadKitcoLive();
    const t = setInterval(loadKitcoLive, 60_000);
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

  const kitcoLiveMid = useMemo(() => {
    if (!kitcoLive) return undefined;
    const bid = kitcoLive.bid;
    const ask = kitcoLive.ask;
    if (typeof bid === "number" && typeof ask === "number")
      return (bid + ask) / 2;
    if (typeof bid === "number") return bid;
    if (typeof ask === "number") return ask;
    return undefined;
  }, [kitcoLive]);

  function kitcoCellValue(isoDate: string, colIndex: number): string {
    const base = fullRowsByDate[isoDate];
    const baseVal = base ? base[`col_${colIndex}`] : null;

    // Only overlay realtime for "today in Vietnam"
    const vnNow = getVietnamNowParts();
    if (isoDate !== vnNow.isoDate) return formatCellValue(baseVal);

    const slotMinutes = [0, 9 * 60, 11 * 60, 14 * 60 + 30, 17 * 60 + 30];
    const currentSlot =
      slotMinutes.filter((m) => vnNow.minutes >= m).length - 1;

    // KITCO open slots are col_13..col_17 (0h,9h,11h,14h30,17h30)
    if (colIndex >= 13 && colIndex <= 17) {
      const slot = colIndex - 13;
      if (kitcoLiveMid == null) return formatCellValue(baseVal);
      if (currentSlot >= slot) return formatCellValue(kitcoLiveMid);
      return "–";
    }

    // KITCO change% is col_21
    if (colIndex === 21) {
      const cp = kitcoLive?.changePercent;
      if (typeof cp === "number" && Number.isFinite(cp))
        return `${cp.toFixed(2)}%`;
      return formatCellValue(baseVal);
    }

    return formatCellValue(baseVal);
  }

  function marketTimedCellValue(
    isoDate: string,
    colIndex: number,
    kind: "oil" | "dollarIndex" | "bond10y" | "sp500",
  ): string {
    const base = fullRowsByDate[isoDate];
    const baseVal = base ? base[`col_${colIndex}`] : null;

    const vnNow = getVietnamNowParts();
    if (isoDate !== vnNow.isoDate) return formatCellValue(baseVal);

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

    const slotMinutes = [0, 9 * 60, 11 * 60, 14 * 60 + 30, 17 * 60 + 30];
    const currentSlot =
      slotMinutes.filter((m) => vnNow.minutes >= m).length - 1;

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

    // open slots are start..start+4 (0h,9h,11h,14h30,17h30)
    if (colIndex >= start && colIndex <= start + 4) {
      const slot = colIndex - start;
      if (typeof livePrice !== "number") return formatCellValue(baseVal);
      if (currentSlot >= slot) return formatCellValue(livePrice);
      return "–";
    }

    // change% is the last col of the group
    if (colIndex === changeCol) {
      if (
        typeof liveChangePercent === "number" &&
        Number.isFinite(liveChangePercent)
      )
        return `${liveChangePercent.toFixed(2)}%`;
      return formatCellValue(baseVal);
    }

    return formatCellValue(baseVal);
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
  function manhHaiRawNumber(
    isoDate: string,
    colIndex: number,
  ): number | null {
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
    const dong17h30Ban = manhHaiRawNumber(
      isoDate,
      MANH_HAI_COL.BAN_17H30,
    );
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
   * col_62 "∑ chỉ vàng thêm" = ∑ chỉ vàng − ∑ CHỈ VÀNG CŨ
   * (= cùng số với col_61 trừ ô nhập ∑ CHỈ VÀNG CŨ)
   */
  function chiVangThemMinusChiCu(isoDate: string): string {
    const taiSan = parseBigNumberInput(totalTaiSan);
    const chiCu = parseChiVangCuInput(totalChiVangCu);
    const dong17h30Ban = manhHaiRawNumber(
      isoDate,
      MANH_HAI_COL.BAN_17H30,
    );
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

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-amber-50/80 via-stone-50/50 to-orange-50/70 dark:from-stone-950 dark:via-stone-900 dark:to-stone-950 text-stone-900 dark:text-stone-100">
      <header
        className="shrink-0 sticky top-0 z-20 opacity-0 animate-fade-in-up border-b border-amber-200/50 dark:border-amber-900/30 bg-white/90 dark:bg-stone-900/90 backdrop-blur-md shadow-sm"
        style={{ animationDelay: "0ms", animationFillMode: "forwards" }}
      >
        <div className="w-full px-4 sm:px-6 h-16 flex items-center justify-between">
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
                  <span className="text-stone-800 dark:text-stone-100">&</span>{" "}
                  <span className="text-stone-800 dark:text-stone-100">
                    Tỷ giá
                  </span>
                </h1>
                <span className="hidden sm:inline-flex items-center gap-1 rounded-full border border-amber-200/70 dark:border-amber-800/40 bg-amber-50/70 dark:bg-amber-950/30 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:text-amber-200">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  Live
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-stone-500 dark:text-stone-400">
                Tổng hợp vàng, tỷ giá &amp; chỉ số thị trường
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full px-4 sm:px-6 py-8 sm:py-10">
        <section
          className="mb-6 opacity-0 animate-fade-in-up"
          style={{ animationDelay: "80ms", animationFillMode: "forwards" }}
        >
          <div className="mt-4 flex flex-col sm:flex-row sm:items-end gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-stone-600 dark:text-stone-400">
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
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-stone-600 dark:text-stone-400">
                Năm
              </span>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(parseInt(e.target.value, 10))}
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

            {rangeMode === "month" && (
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-stone-600 dark:text-stone-400">
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
                <span className="text-xs font-semibold text-stone-600 dark:text-stone-400">
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

            <div className="text-xs text-stone-500 dark:text-stone-400 sm:ml-auto">
              <div className="flex items-center gap-2 justify-end">
                <span>
                  Đang xem: <span className="font-semibold">{from}</span> →{" "}
                  <span className="font-semibold">{to}</span>
                </span>
                {!isLoadingTable && (
                  <span className="hidden sm:inline">
                    • <span className="font-semibold">{dateRows.length}</span>{" "}
                    ngày
                  </span>
                )}
              </div>
              {isLoadingTable && (
                <span className="mt-1 ml-1 inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                  <span className="inline-block h-2 w-2 rounded-full bg-amber-500 animate-ping" />
                  Đang tải dữ liệu...
                </span>
              )}
            </div>
          </div>

          {/* Hai chỉ số nhập tay: trái / phải — nhãn trên, input dưới */}
          <div className="mt-4 grid w-full max-w-lg grid-cols-2 gap-3 sm:max-w-xl">
            <div className="min-w-0 overflow-hidden rounded-md border border-emerald-800/50 bg-white dark:border-emerald-700/45 dark:bg-stone-900">
              <div className="border-b border-stone-200 bg-stone-100/90 px-2 py-1 text-center dark:border-stone-700 dark:bg-stone-800/60">
                <span className="text-[10px] font-bold leading-tight text-stone-900 dark:text-stone-100">
                  ∑ TÀI SẢN
                </span>
              </div>
              <input
                type="text"
                inputMode="decimal"
                autoComplete="off"
                placeholder="0"
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
                className="h-7 w-full border-0 bg-stone-50 px-2 py-0.5 text-right text-xs font-bold tabular-nums text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-1 focus:ring-amber-400/50 focus:ring-inset dark:bg-stone-900/80 dark:text-stone-100 dark:placeholder:text-stone-500"
              />
            </div>
            <div className="min-w-0 overflow-hidden rounded-md border border-emerald-800/50 bg-white dark:border-emerald-700/45 dark:bg-stone-900">
              <div className="border-b border-stone-200 bg-stone-100/90 px-2 py-1 text-center dark:border-stone-700 dark:bg-stone-800/60">
                <span className="text-[10px] font-bold leading-tight text-stone-900 dark:text-stone-100">
                  <span className="block">∑ CHỈ</span>
                  <span className="block">VÀNG CŨ</span>
                </span>
              </div>
              <input
                type="text"
                inputMode="decimal"
                autoComplete="off"
                placeholder="0"
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
                className="h-7 w-full border-0 bg-stone-50 px-2 py-0.5 text-right text-xs font-bold tabular-nums text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-1 focus:ring-amber-400/50 focus:ring-inset dark:bg-stone-900/80 dark:text-stone-100 dark:placeholder:text-stone-500"
              />
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
              className="h-8 px-3 rounded-xl border border-amber-200/60 dark:border-amber-800/40 bg-white dark:bg-stone-900 text-xs text-amber-900 dark:text-amber-200 hover:bg-amber-50/70 dark:hover:bg-amber-950/30"
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
              className="h-8 px-3 rounded-xl border border-amber-200/60 dark:border-amber-800/40 bg-white dark:bg-stone-900 text-xs text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800"
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
              className="h-8 px-3 rounded-xl border border-amber-200/60 dark:border-amber-800/40 bg-white dark:bg-stone-900 text-xs text-amber-900 dark:text-amber-200 hover:bg-amber-50/70 dark:hover:bg-amber-950/30"
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
              className="h-8 px-3 rounded-xl border border-amber-200/60 dark:border-amber-800/40 bg-white dark:bg-stone-900 text-xs text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800"
            >
              Quý trước
            </button>
            <button
              type="button"
              onClick={() => {
                setRangeMode("year");
                setSelectedYear(currentYear);
              }}
              className="h-8 px-3 rounded-xl border border-amber-200/60 dark:border-amber-800/40 bg-white dark:bg-stone-900 text-xs text-amber-900 dark:text-amber-200 hover:bg-amber-50/70 dark:hover:bg-amber-950/30"
            >
              Năm nay
            </button>
          </div>
        </section>

        <div
          className="relative rounded-2xl border border-amber-200/50 dark:border-amber-800/40 bg-gradient-to-br from-white via-amber-50/40 to-orange-50/50 dark:from-stone-900 dark:via-stone-900 dark:to-amber-950/30 shadow-xl shadow-amber-500/10 dark:shadow-black/40 ring-1 ring-white/60 dark:ring-stone-700/50 overflow-hidden opacity-0 animate-scale-in"
          style={{ animationDelay: "140ms", animationFillMode: "forwards" }}
        >
          <div className="border-b border-amber-200/50 dark:border-amber-900/30 px-5 py-3.5 text-sm text-stone-500 dark:text-stone-400 bg-gradient-to-r from-amber-100/50 via-white/70 to-amber-50/40 dark:from-amber-950/30 dark:via-stone-900/50 dark:to-amber-950/20 backdrop-blur-sm flex items-center justify-between gap-3">
            <span className="font-medium text-stone-700 dark:text-stone-300">
              Tổng hợp vàng, tỷ giá & chỉ số thị trường
            </span>
            {isLoadingTable && (
              <span className="inline-flex items-center gap-2 text-xs text-amber-700 dark:text-amber-300">
                <span className="inline-block h-3 w-3 rounded-full border-2 border-amber-500 border-t-transparent animate-spin" />
                Đang tải...
              </span>
            )}
          </div>
          <div className="relative bg-gradient-to-br from-amber-50/50 via-white/30 to-stone-100/40 dark:from-stone-950/60 dark:via-stone-900/50 dark:to-stone-950/70 p-2 sm:p-2.5">
            <div className="scroll-table-premium overflow-auto max-h-[min(78vh,1200px)] rounded-xl border border-white/70 dark:border-stone-600/35 bg-white/45 dark:bg-stone-900/40 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.75),0_10px_40px_-16px_rgba(180,83,9,0.18)] dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06),0_12px_48px_-12px_rgba(0,0,0,0.55)] backdrop-blur-[3px]">
            <table className="w-full text-left border-separate border-spacing-0 min-w-max">
              <thead className="sticky top-0 z-10 bg-amber-100/90 dark:bg-amber-900/30 backdrop-blur-sm text-center [&_th]:font-bold [&_th]:!border-black [&_th]:dark:!border-stone-200 [&_th]:transition-[filter,box-shadow] [&_th]:duration-200 [&_th]:hover:brightness-[1.04] dark:[&_th]:hover:brightness-110">
                {/* Dòng 1: nhóm lớn + STT + Thứ/Ngày (rowSpan) */}
                <tr>
                  <th
                    rowSpan={3}
                    className="sticky left-0 z-40 border-b border-r border-black dark:border-stone-200 px-2 py-2 w-20 min-w-20 text-[11px] font-bold text-amber-900/80 dark:text-amber-200/90 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30"
                  ></th>
                  <th
                    rowSpan={3}
                    className="sticky left-20 z-40 border-b border-r border-black dark:border-stone-200 px-2 py-2 w-28 min-w-28 text-[11px] font-bold text-amber-900/80 dark:text-amber-200/90 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30"
                  >
                    DATE
                  </th>
                  <th colSpan={5} className={manhHaiHeaderGroupClass()}>
                    MUA - Mạnh Hải
                  </th>
                  <th colSpan={5} className={manhHaiHeaderGroupClass()}>
                    BÁN - Mạnh Hải
                  </th>
                  <th
                    rowSpan={3}
                    className={`border border-black dark:border-stone-200 px-1.5 py-2 w-12 min-w-12 text-[10px] font-bold leading-tight text-stone-900 dark:text-stone-100 ${getRegionHeaderBgClass(61)}`}
                  >
                    <span className="block">∑</span>
                    <span className="block">chỉ</span>
                    <span className="block">vàng</span>
                  </th>
                  <th
                    rowSpan={3}
                    className={`border border-black dark:border-stone-200 border-l-0 px-1.5 py-2 w-14 min-w-14 text-[10px] font-bold leading-tight text-stone-900 dark:text-stone-100 ${getRegionHeaderBgClass(62)}`}
                  >
                    <span className="block">∑</span>
                    <span className="block">chỉ vàng</span>
                    <span className="block">thêm</span>
                  </th>
                  <th
                    colSpan={9}
                    className={`border-b border-r border-black dark:border-stone-200 px-2 py-2 text-[11px] font-bold text-amber-900/80 dark:text-amber-200/90 whitespace-nowrap ${getRegionHeaderBgClass(13)}`}
                  >
                    KITCO - GIÁ VÀNG THẾ GIỚI
                  </th>
                  <th
                    colSpan={9}
                    className={`border-b border-r border-black dark:border-stone-200 px-2 py-2 text-[11px] font-bold text-amber-900/80 dark:text-amber-200/90 whitespace-nowrap ${getRegionHeaderBgClass(22)}`}
                  >
                    GIÁ DẦU
                  </th>
                  <th
                    colSpan={9}
                    className={`border-b border-r border-black dark:border-stone-200 px-2 py-2 text-[11px] font-bold text-amber-900/80 dark:text-amber-200/90 whitespace-nowrap ${getRegionHeaderBgClass(31)}`}
                  >
                    DOLLAR INDEX
                  </th>
                  <th
                    colSpan={9}
                    className={`border-b border-r border-black dark:border-stone-200 px-2 py-2 text-[11px] font-bold text-amber-900/80 dark:text-amber-200/90 whitespace-nowrap ${getRegionHeaderBgClass(40)}`}
                  >
                    TRÁI PHIẾU US - 10 NĂM
                  </th>
                  <th
                    colSpan={9}
                    className={`border-b border-r border-black dark:border-stone-200 px-2 py-2 text-[11px] font-bold text-amber-900/80 dark:text-amber-200/90 whitespace-nowrap ${getRegionHeaderBgClass(49)}`}
                  >
                    S&P 500
                  </th>
                  <th
                    colSpan={1}
                    className={`border-b border-black dark:border-stone-200 px-2 py-2 text-[11px] font-bold text-amber-900/80 dark:text-amber-200/90 whitespace-nowrap ${getRegionHeaderBgClass(60)}`}
                  >
                    Tỷ Giá VCB
                  </th>
                </tr>
                {/* Dòng 2: Mở/Đóng/Chênh lệch, v.v. */}
                <tr>
                  {/* Mua - Mạnh Hải: MỞ/ĐÓNG từng ô; CHÊNH LỆCH gộp 2 dòng */}
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
                  {/* Bán - Mạnh Hải */}
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
                  {/* Thứ, Ngày đã rowSpan=3 ở dòng 1 nên bỏ qua ở dòng 2 */}
                  {/* KITCO (9 cột) */}
                  <th
                    colSpan={5}
                    className={`border-b border-r border-black dark:border-stone-200 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap ${getRegionHeaderBgClass(13)}`}
                  >
                    MỞ
                  </th>
                  <th
                    className={`border-b border-r border-black dark:border-stone-200 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap ${getRegionHeaderBgClass(13)}`}
                  >
                    ĐÓNG
                  </th>
                  <th
                    className={`border-b border-r border-black dark:border-stone-200 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap ${getRegionHeaderBgClass(13)}`}
                  >
                    CAO
                  </th>
                  <th
                    className={`border-b border-r border-black dark:border-stone-200 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap ${getRegionHeaderBgClass(13)}`}
                  >
                    THẤP (Low)
                  </th>
                  <th
                    className={`border-b border-r border-black dark:border-stone-200 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap ${getRegionHeaderBgClass(13)}`}
                  >
                    THAY ĐỔI (Change)
                  </th>
                  {/* Giá dầu (9 cột) */}
                  <th
                    colSpan={5}
                    className={`border-b border-r border-black dark:border-stone-200 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap ${getRegionHeaderBgClass(22)}`}
                  >
                    MỞ
                  </th>
                  <th
                    className={`border-b border-r border-black dark:border-stone-200 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap ${getRegionHeaderBgClass(22)}`}
                  >
                    ĐÓNG
                  </th>
                  <th
                    className={`border-b border-r border-black dark:border-stone-200 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap ${getRegionHeaderBgClass(22)}`}
                  >
                    CAO
                  </th>
                  <th
                    className={`border-b border-r border-black dark:border-stone-200 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap ${getRegionHeaderBgClass(22)}`}
                  >
                    THẤP
                  </th>
                  <th
                    className={`border-b border-r border-black dark:border-stone-200 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap ${getRegionHeaderBgClass(22)}`}
                  >
                    THAY ĐỔI
                  </th>
                  {/* Dollar index (9 cột) */}
                  <th
                    colSpan={5}
                    className={`border-b border-r border-black dark:border-stone-200 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap ${getRegionHeaderBgClass(31)}`}
                  >
                    MỞ
                  </th>
                  <th
                    className={`border-b border-r border-black dark:border-stone-200 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap ${getRegionHeaderBgClass(31)}`}
                  >
                    ĐÓNG
                  </th>
                  <th
                    className={`border-b border-r border-black dark:border-stone-200 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap ${getRegionHeaderBgClass(31)}`}
                  >
                    CAO
                  </th>
                  <th
                    className={`border-b border-r border-black dark:border-stone-200 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap ${getRegionHeaderBgClass(31)}`}
                  >
                    THẤP
                  </th>
                  <th
                    className={`border-b border-r border-black dark:border-stone-200 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap ${getRegionHeaderBgClass(31)}`}
                  >
                    THAY ĐỔI
                  </th>
                  {/* Trái phiếu 10Y (9 cột) */}
                  <th
                    colSpan={5}
                    className={`border-b border-r border-black dark:border-stone-200 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap ${getRegionHeaderBgClass(40)}`}
                  >
                    MỞ
                  </th>
                  <th
                    className={`border-b border-r border-black dark:border-stone-200 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap ${getRegionHeaderBgClass(40)}`}
                  >
                    ĐÓNG
                  </th>
                  <th
                    className={`border-b border-r border-black dark:border-stone-200 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap ${getRegionHeaderBgClass(40)}`}
                  >
                    CAO
                  </th>
                  <th
                    className={`border-b border-r border-black dark:border-stone-200 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap ${getRegionHeaderBgClass(40)}`}
                  >
                    THẤP
                  </th>
                  <th
                    className={`border-b border-r border-black dark:border-stone-200 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap ${getRegionHeaderBgClass(40)}`}
                  >
                    THAY ĐỔI
                  </th>
                  {/* S&P 500 (9 cột) */}
                  <th
                    colSpan={5}
                    className={`border-b border-r border-black dark:border-stone-200 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap ${getRegionHeaderBgClass(49)}`}
                  >
                    MỞ
                  </th>
                  <th
                    className={`border-b border-r border-black dark:border-stone-200 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap ${getRegionHeaderBgClass(49)}`}
                  >
                    ĐÓNG
                  </th>
                  <th
                    className={`border-b border-r border-black dark:border-stone-200 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap ${getRegionHeaderBgClass(49)}`}
                  >
                    CAO
                  </th>
                  <th
                    className={`border-b border-r border-black dark:border-stone-200 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap ${getRegionHeaderBgClass(49)}`}
                  >
                    THẤP
                  </th>
                  <th
                    className={`border-b border-r border-black dark:border-stone-200 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap ${getRegionHeaderBgClass(49)}`}
                  >
                    THAY ĐỔI
                  </th>
                  {/* Tỷ giá VCB (1 cột - chỉ lấy Bán) */}
                  <th
                    className={`border-b border-black dark:border-stone-200 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap ${getRegionHeaderBgClass(60)}`}
                  >
                    Bán
                  </th>
                </tr>
                {/* Dòng 3: các mốc giờ chi tiết */}
                <tr>
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
                  {/* Thứ, Ngày đã rowSpan=3 ở dòng 1 */}
                  {/* KITCO (9 cột) */}
                  <th className="border-b border-r border-black dark:border-stone-200 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap">
                    0h <br />
                    (Kitco)
                  </th>
                  <th className="border-b border-r border-black dark:border-stone-200 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap">
                    9h
                    <br />
                    (Việt Nam)
                  </th>
                  <th className="border-b border-r border-black dark:border-stone-200 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap">
                    11h
                    <br />
                    (Việt Nam)
                  </th>
                  <th className="border-b border-r border-black dark:border-stone-200 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap">
                    14h30
                    <br />
                    (Việt Nam)
                  </th>
                  <th className="border-b border-r border-black dark:border-stone-200 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap">
                    17h30
                    <br />
                    (Việt Nam)
                  </th>
                  <th className="border-b border-r border-black dark:border-stone-200 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap">
                    24h <br />
                    (Kitco)
                  </th>
                  <th className="border-b border-r border-black dark:border-stone-200 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap" />
                  <th className="border-b border-r border-black dark:border-stone-200 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap" />
                  <th className="border-b border-r border-black dark:border-stone-200 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap" />
                  {/* Giá dầu (9 cột) */}
                  <th className="border-b border-r border-black dark:border-stone-200 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap">
                    0h
                    <br /> (Investing)
                  </th>
                  <th className="border-b border-r border-black dark:border-stone-200 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap">
                    9h
                    <br />
                    (Việt Nam)
                  </th>
                  <th className="border-b border-r border-black dark:border-stone-200 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap">
                    11h
                    <br />
                    (Việt Nam)
                  </th>
                  <th className="border-b border-r border-black dark:border-stone-200 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap">
                    14h30
                    <br />
                    (Việt Nam)
                  </th>
                  <th className="border-b border-r border-black dark:border-stone-200 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap">
                    17h30
                    <br />
                    (Việt Nam)
                  </th>
                  <th className="border-b border-r border-black dark:border-stone-200 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap">
                    24h
                    <br /> (Investing)
                  </th>
                  <th className="border-b border-r border-black dark:border-stone-200 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap" />
                  <th className="border-b border-r border-black dark:border-stone-200 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap" />
                  <th className="border-b border-r border-black dark:border-stone-200 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap" />
                  {/* Dollar index (9 cột) */}
                  <th className="border-b border-r border-black dark:border-stone-200 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap">
                    0h
                    <br /> (Investing)
                  </th>
                  <th className="border-b border-r border-black dark:border-stone-200 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap">
                    9h
                    <br />
                    (Việt Nam)
                  </th>
                  <th className="border-b border-r border-black dark:border-stone-200 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap">
                    11h
                    <br />
                    (Việt Nam)
                  </th>
                  <th className="border-b border-r border-black dark:border-stone-200 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap">
                    14h30
                    <br />
                    (Việt Nam)
                  </th>
                  <th className="border-b border-r border-black dark:border-stone-200 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap">
                    17h30
                    <br />
                    (Việt Nam)
                  </th>
                  <th className="border-b border-r border-black dark:border-stone-200 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap">
                    24h
                    <br /> (Investing)
                  </th>
                  <th className="border-b border-r border-black dark:border-stone-200 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap" />
                  <th className="border-b border-r border-black dark:border-stone-200 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap" />
                  <th className="border-b border-r border-black dark:border-stone-200 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap" />
                  {/* Trái phiếu 10Y (9 cột) */}
                  <th className="border-b border-r border-black dark:border-stone-200 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap">
                    0h <br />
                    (Investing)
                  </th>
                  <th className="border-b border-r border-black dark:border-stone-200 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap">
                    9h
                    <br />
                    (Việt Nam)
                  </th>
                  <th className="border-b border-r border-black dark:border-stone-200 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap">
                    11h
                    <br />
                    (Việt Nam)
                  </th>
                  <th className="border-b border-r border-black dark:border-stone-200 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap">
                    14h30
                    <br />
                    (Việt Nam)
                  </th>
                  <th className="border-b border-r border-black dark:border-stone-200 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap">
                    17h30
                    <br />
                    (Việt Nam)
                  </th>
                  <th className="border-b border-r border-black dark:border-stone-200 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap">
                    24h
                    <br /> (Investing)
                  </th>
                  <th className="border-b border-r border-black dark:border-stone-200 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap" />
                  <th className="border-b border-r border-black dark:border-stone-200 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap" />
                  <th className="border-b border-r border-black dark:border-stone-200 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap" />
                  {/* S&P 500 (9 cột) */}
                  <th className="border-b border-r border-black dark:border-stone-200 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap">
                    0h <br />
                    (Investing)
                  </th>
                  <th className="border-b border-r border-black dark:border-stone-200 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap">
                    9h
                    <br />
                    (Việt Nam)
                  </th>
                  <th className="border-b border-r border-black dark:border-stone-200 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap">
                    11h
                    <br />
                    (Việt Nam)
                  </th>
                  <th className="border-b border-r border-black dark:border-stone-200 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap">
                    14h30
                    <br />
                    (Việt Nam)
                  </th>
                  <th className="border-b border-r border-black dark:border-stone-200 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap">
                    17h30
                    <br />
                    (Việt Nam)
                  </th>
                  <th className="border-b border-r border-black dark:border-stone-200 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap">
                    24h
                    <br /> (Investing)
                  </th>
                  <th className="border-b border-r border-black dark:border-stone-200 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap" />
                  <th className="border-b border-r border-black dark:border-stone-200 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap" />
                  <th className="border-b border-r border-black dark:border-stone-200 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap" />
                  {/* Tỷ giá VCB (1 cột - chỉ lấy Bán) */}
                  <th className="border-b border-r border-black dark:border-stone-200 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap" />
                </tr>
              </thead>
              <tbody>
                {dateRows.map((row) => (
                  <tr
                    key={row.isoDate}
                    className="group/row transition-colors duration-200 hover:bg-amber-50/60 dark:hover:bg-amber-950/30"
                  >
                    {[
                      0, 11, 12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 61, 62, 13, 14,
                      15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28,
                      29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42,
                      43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56,
                      57, 60,
                    ].map((j) =>
                      j === 0 || j === 58 || j === 59 ? null : (
                        <td
                          key={j}
                          className={
                            j === 0
                              ? "border-0 px-0 py-0 w-0 max-w-0 overflow-hidden"
                              : j === 11
                                ? `sticky left-0 z-30 border-r border-b border-black dark:border-stone-200 px-2 py-2 text-xs font-bold w-20 max-w-20 truncate tabular-nums text-stone-400 dark:text-stone-500 bg-amber-50/60 dark:bg-amber-950/20 ${TD_CELL_FX}`
                                : j === 12
                                  ? `sticky left-20 z-30 border-r border-b border-black dark:border-stone-200 px-2 py-2 text-xs font-bold w-28 max-w-28 truncate tabular-nums text-red-600 dark:text-red-400 bg-amber-50/60 dark:bg-amber-950/20 ${TD_CELL_FX}`
                                  : j === 61 || j === 62
                                    ? `border-r border-b border-black dark:border-stone-200 px-2 py-2 text-xs font-bold max-w-[100px] truncate tabular-nums text-stone-700 dark:text-stone-300 text-center ${getRegionBgClass(j)} ${TD_CELL_FX}`
                                    : `border-r border-b border-black dark:border-stone-200 px-2 py-2 text-xs font-bold max-w-[120px] truncate tabular-nums text-stone-400 dark:text-stone-500 ${getRegionBgClass(j)} ${TD_CELL_FX}`
                          }
                        >
                          {isLoadingTable && j !== 0 && j !== 11 && j !== 12 ? (
                            <div className="h-4 w-14 rounded bg-stone-200/70 dark:bg-stone-800/70 animate-pulse" />
                          ) : j === 0 ? (
                            ""
                          ) : j === 11 ? (
                            row.weekdayLabel
                          ) : j === 12 ? (
                            row.dateLabel
                          ) : j >= 1 && j <= 10 ? (
                            (() => {
                              const v = manhHaiCellValue(row.isoDate, j);
                              return v.toneClass ? (
                                <span className={v.toneClass}>{v.text}</span>
                              ) : (
                                v.text
                              );
                            })()
                          ) : j === 21 ? (
                            (() => {
                              const v = kitcoCellValue(row.isoDate, j);
                              const text = formatChangeWithPlus(v);
                              return (
                                <span className={getMarketChangeToneClass(v)}>
                                  {text}
                                </span>
                              );
                            })()
                          ) : j === 30 ? (
                            (() => {
                              const v = marketTimedCellValue(
                                row.isoDate,
                                j,
                                "oil",
                              );
                              const text = formatChangeWithPlus(v);
                              return (
                                <span className={getMarketChangeToneClass(v)}>
                                  {text}
                                </span>
                              );
                            })()
                          ) : j === 39 ? (
                            (() => {
                              const v = marketTimedCellValue(
                                row.isoDate,
                                j,
                                "dollarIndex",
                              );
                              const text = formatChangeWithPlus(v);
                              return (
                                <span className={getMarketChangeToneClass(v)}>
                                  {text}
                                </span>
                              );
                            })()
                          ) : j === 48 ? (
                            (() => {
                              const v = marketTimedCellValue(
                                row.isoDate,
                                j,
                                "bond10y",
                              );
                              const text = formatChangeWithPlus(v);
                              return (
                                <span className={getMarketChangeToneClass(v)}>
                                  {text}
                                </span>
                              );
                            })()
                          ) : j === 57 ? (
                            (() => {
                              const v = marketTimedCellValue(
                                row.isoDate,
                                j,
                                "sp500",
                              );
                              const text = formatChangeWithPlus(v);
                              return (
                                <span className={getMarketChangeToneClass(v)}>
                                  {text}
                                </span>
                              );
                            })()
                          ) : j >= 13 && j <= 17 ? (
                            (() => {
                              const v = kitcoCellValue(row.isoDate, j);
                              const ch = kitcoCellValue(row.isoDate, 21);
                              const tone = getMarketChangeToneClass(ch);
                              return v === "–" ? (
                                v
                              ) : (
                                <span className={tone}>{v}</span>
                              );
                            })()
                          ) : j >= 18 && j <= 20 ? (
                            kitcoCellValue(row.isoDate, j)
                          ) : j >= 22 && j <= 29 ? (
                            (() => {
                              const v = marketTimedCellValue(
                                row.isoDate,
                                j,
                                "oil",
                              );
                              const ch = marketTimedCellValue(
                                row.isoDate,
                                30,
                                "oil",
                              );
                              const tone = getMarketChangeToneClass(
                                formatChangeWithPlus(ch),
                              );
                              return v === "–" ? (
                                v
                              ) : (
                                <span className={tone}>{v}</span>
                              );
                            })()
                          ) : j >= 31 && j <= 38 ? (
                            (() => {
                              const v = marketTimedCellValue(
                                row.isoDate,
                                j,
                                "dollarIndex",
                              );
                              const ch = marketTimedCellValue(
                                row.isoDate,
                                39,
                                "dollarIndex",
                              );
                              const tone = getMarketChangeToneClass(
                                formatChangeWithPlus(ch),
                              );
                              return v === "–" ? (
                                v
                              ) : (
                                <span className={tone}>{v}</span>
                              );
                            })()
                          ) : j >= 40 && j <= 47 ? (
                            (() => {
                              const v = marketTimedCellValue(
                                row.isoDate,
                                j,
                                "bond10y",
                              );
                              const ch = marketTimedCellValue(
                                row.isoDate,
                                48,
                                "bond10y",
                              );
                              const tone = getMarketChangeToneClass(
                                formatChangeWithPlus(ch),
                              );
                              return v === "–" ? (
                                v
                              ) : (
                                <span className={tone}>{v}</span>
                              );
                            })()
                          ) : j >= 49 && j <= 56 ? (
                            (() => {
                              const v = marketTimedCellValue(
                                row.isoDate,
                                j,
                                "sp500",
                              );
                              const ch = marketTimedCellValue(
                                row.isoDate,
                                57,
                                "sp500",
                              );
                              const tone = getMarketChangeToneClass(
                                formatChangeWithPlus(ch),
                              );
                              return v === "–" ? (
                                v
                              ) : (
                                <span className={tone}>{v}</span>
                              );
                            })()
                          ) : j === 61 ? (
                            chiVangIndexTaiSanOverDong17h30(row.isoDate)
                          ) : j === 62 ? (
                            chiVangThemMinusChiCu(row.isoDate)
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
          </div>
        </div>
      </main>

      <footer
        className="shrink-0 border-t border-amber-200/40 dark:border-amber-900/30 bg-white/70 dark:bg-stone-900/70 backdrop-blur-sm mt-auto opacity-0 animate-fade-in"
        style={{ animationDelay: "350ms", animationFillMode: "forwards" }}
      >
        <div className="w-full px-4 sm:px-6 py-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 text-sm text-stone-500 dark:text-stone-400">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg overflow-hidden">
                <Image src="/favicon.svg" alt="Logo" width={20} height={20} />
              </span>
              <p>© {new Date().getFullYear()} · Giá vàng & Tỷ giá</p>
            </div>
            <p className="text-xs sm:text-sm">
              Make by Trần Trung Hiếu - 0862478150
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

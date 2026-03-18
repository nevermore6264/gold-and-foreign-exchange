"use client";

import Image from "next/image";
import { TOTAL_COLUMNS } from "@/data/table-headers-60";
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

export default function Home() {
  const startDate = new Date(2022, 0, 1); // 01/01/2022 (local time)

  const today = new Date();
  const endDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  const dateRows: {
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
    const weekdayLabel =
      day === 0
        ? "Chủ nhật"
        : day === 6
          ? "Thứ 7"
          : `Thứ ${day + 1}`; // Mon=2..Sat=7

    const dateLabel = d.toLocaleDateString("vi-VN"); // dd/mm/yyyy
    const isoDate = toIsoDateLocal(d);

    dateRows.push({ date: d, isoDate, weekdayLabel, dateLabel });
  }

  const [fullRowsByDate, setFullRowsByDate] = useState<
    Record<string, FullTableRow>
  >({});
  const [kitcoLive, setKitcoLive] = useState<GoldApiResponse["live"]>();

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function loadFullTable() {
      try {
        const from = "2022-01-01";
        const to = toIsoDateLocal(new Date());
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
      }
    }

    loadFullTable();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

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

  const kitcoLiveMid = useMemo(() => {
    if (!kitcoLive) return undefined;
    const bid = kitcoLive.bid;
    const ask = kitcoLive.ask;
    if (typeof bid === "number" && typeof ask === "number") return (bid + ask) / 2;
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
    const currentSlot = slotMinutes.filter((m) => vnNow.minutes >= m).length - 1;

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
      if (typeof cp === "number" && Number.isFinite(cp)) return `${cp.toFixed(2)}%`;
      return formatCellValue(baseVal);
    }

    return formatCellValue(baseVal);
  }

  return (
    <div className="min-h-screen flex flex-col bg-stone-50 dark:bg-stone-950 text-stone-900 dark:text-stone-100">
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
              <h1 className="text-lg font-bold tracking-tight text-stone-800 dark:text-stone-100">
                Giá vàng & Tỷ giá
              </h1>
              <p className="text-xs text-amber-700/80 dark:text-amber-400/80 font-medium">
                Giá dầu & Dollar index từ Investing.com · VCB, FreeGoldAPI
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
          <h2 className="text-xl font-semibold text-stone-800 dark:text-stone-200">
            Bảng dữ liệu
          </h2>
          <p className="text-sm text-stone-500 dark:text-stone-400 mt-1">
            Khung bảng 60 cột (Mua/Bán Mạnh Hải, Kitco, Giá dầu, Dollar index,
            Trái phiếu US 10Y, S&P 500, Tỷ giá VCB). Phần dữ liệu sẽ làm sau.
          </p>
        </section>

        <div
          className="rounded-2xl border border-amber-200/40 dark:border-amber-900/30 bg-white dark:bg-stone-900 shadow-xl shadow-amber-500/5 overflow-hidden opacity-0 animate-scale-in"
          style={{ animationDelay: "140ms", animationFillMode: "forwards" }}
        >
          <div className="border-b border-amber-200/50 dark:border-amber-900/30 px-5 py-3.5 text-sm text-stone-500 dark:text-stone-400 bg-amber-50/60 dark:bg-amber-950/20 backdrop-blur">
            <span className="font-medium text-stone-700 dark:text-stone-300">
              Khung bảng – chưa nối dữ liệu
            </span>
          </div>
          <div className="overflow-auto">
            <table className="w-full text-left border-collapse min-w-max">
              <thead className="sticky top-0 z-10 bg-amber-100/90 dark:bg-amber-900/30 backdrop-blur-sm">
                {/* Dòng 1: nhóm lớn + STT + Thứ/Ngày (rowSpan) */}
                <tr>
                  <th
                    rowSpan={3}
                    className="w-12 border-b border-r border-amber-200/60 dark:border-amber-800/40 px-2 py-2 text-xs font-bold uppercase tracking-wider text-amber-900/80 dark:text-amber-200/90 align-bottom bg-amber-100/70 dark:bg-amber-900/40"
                  >
                    STT
                  </th>
                  <th
                    colSpan={5}
                    className="border-b border-r border-amber-200/60 dark:border-amber-800/40 px-2 py-2 text-[11px] font-bold text-amber-900/80 dark:text-amber-200/90 whitespace-nowrap bg-amber-100/70 dark:bg-amber-900/40"
                  >
                    MUA - Mạnh Hải
                  </th>
                  <th
                    colSpan={5}
                    className="border-b border-r border-amber-200/60 dark:border-amber-800/40 px-2 py-2 text-[11px] font-bold text-amber-900/80 dark:text-amber-200/90 whitespace-nowrap bg-amber-100/70 dark:bg-amber-900/40"
                  >
                    BÁN - Mạnh Hải
                  </th>
                  <th
                    rowSpan={3}
                    className="border-b border-r border-amber-200/60 dark:border-amber-800/40 px-2 py-2 text-[11px] font-bold text-amber-900/80 dark:text-amber-200/90 whitespace-nowrap bg-amber-100/70 dark:bg-amber-900/40"
                  >
                    Thứ
                  </th>
                  <th
                    rowSpan={3}
                    className="border-b border-r border-amber-200/60 dark:border-amber-800/40 px-2 py-2 text-[11px] font-bold text-amber-900/80 dark:text-amber-200/90 whitespace-nowrap bg-amber-100/70 dark:bg-amber-900/40"
                  >
                    Ngày
                  </th>
                  <th
                    colSpan={9}
                    className="border-b border-r border-amber-200/60 dark:border-amber-800/40 px-2 py-2 text-[11px] font-bold text-amber-900/80 dark:text-amber-200/90 whitespace-nowrap bg-amber-100/70 dark:bg-amber-900/40"
                  >
                    KITCO - GIÁ VÀNG THẾ GIỚI
                  </th>
                  <th
                    colSpan={9}
                    className="border-b border-r border-amber-200/60 dark:border-amber-800/40 px-2 py-2 text-[11px] font-bold text-amber-900/80 dark:text-amber-200/90 whitespace-nowrap bg-amber-100/70 dark:bg-amber-900/40"
                  >
                    GIÁ DẦU
                  </th>
                  <th
                    colSpan={9}
                    className="border-b border-r border-amber-200/60 dark:border-amber-800/40 px-2 py-2 text-[11px] font-bold text-amber-900/80 dark:text-amber-200/90 whitespace-nowrap bg-amber-100/70 dark:bg-amber-900/40"
                  >
                    DOLLAR INDEX
                  </th>
                  <th
                    colSpan={9}
                    className="border-b border-r border-amber-200/60 dark:border-amber-800/40 px-2 py-2 text-[11px] font-bold text-amber-900/80 dark:text-amber-200/90 whitespace-nowrap bg-amber-100/70 dark:bg-amber-900/40"
                  >
                    TRÁI PHIẾU US - 10 NĂM
                  </th>
                  <th
                    colSpan={9}
                    className="border-b border-r border-amber-200/60 dark:border-amber-800/40 px-2 py-2 text-[11px] font-bold text-amber-900/80 dark:text-amber-200/90 whitespace-nowrap bg-amber-100/70 dark:bg-amber-900/40"
                  >
                    S&P 500
                  </th>
                  <th
                    colSpan={3}
                    className="border-b border-amber-200/60 dark:border-amber-800/40 px-2 py-2 text-[11px] font-bold text-amber-900/80 dark:text-amber-200/90 whitespace-nowrap bg-amber-100/70 dark:bg-amber-900/40"
                  >
                    Tỷ Giá VCB
                  </th>
                </tr>
                {/* Dòng 2: Mở/Đóng/Chênh lệch, v.v. */}
                <tr>
                  {/* Mua - Mạnh Hải (5 cột) */}
                  <th className="border-b border-r border-amber-200/60 dark:border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30">
                    MỞ
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark:border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30" />
                  <th className="border-b border-r border-amber-200/60 dark:border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30" />
                  <th className="border-b border-r border-amber-200/60 dark:border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30">
                    ĐÓNG
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark:border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30">
                    CHÊNH LỆCH
                  </th>
                  {/* Bán - Mạnh Hải (5 cột) */}
                  <th className="border-b border-r border-amber-200/60 dark:border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30">
                    MỞ
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark:border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30" />
                  <th className="border-b border-r border-amber-200/60 dark:border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30" />
                  <th className="border-b border-r border-amber-200/60 dark:border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30">
                    ĐÓNG
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark:border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30">
                    CHÊNH LỆCH
                  </th>
                  {/* Thứ, Ngày đã rowSpan=3 ở dòng 1 nên bỏ qua ở dòng 2 */}
                  {/* KITCO (9 cột) */}
                  <th className="border-b border-r border-amber-200/60 dark:border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30">
                    MỞ (Open)
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark:border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30" />
                  <th className="border-b border-r border-amber-200/60 dark:border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30" />
                  <th className="border-b border-r border-amber-200/60 dark:border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30" />
                  <th className="border-b border-r border-amber-200/60 dark:border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30" />
                  <th className="border-b border-r border-amber-200/60 dark:border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30">
                    ĐÓNG (Price)
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark:border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30">
                    CAO (High)
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark:border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30">
                    THẤP (Low)
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark:border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30">
                    THAY ĐỔI (Change)
                  </th>
                  {/* Giá dầu (9 cột) */}
                  <th className="border-b border-r border-amber-200/60 dark:border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30">
                    MỞ (Open)
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark:border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30" />
                  <th className="border-b border-r border-amber-200/60 dark:border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30" />
                  <th className="border-b border-r border-amber-200/60 dark:border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30" />
                  <th className="border-b border-r border-amber-200/60 dark:border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30" />
                  <th className="border-b border-r border-amber-200/60 dark:border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30">
                    ĐÓNG (Price)
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark:border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30">
                    CAO (High)
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark:border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30">
                    THẤP (Low)
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark:border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30">
                    THAY ĐỔI (Change)
                  </th>
                  {/* Dollar index (9 cột) */}
                  <th className="border-b border-r border-amber-200/60 dark:border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30">
                    MỞ
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark:border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30" />
                  <th className="border-b border-r border-amber-200/60 dark:border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30" />
                  <th className="border-b border-r border-amber-200/60 dark:border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30" />
                  <th className="border-b border-r border-amber-200/60 dark:border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30" />
                  <th className="border-b border-r border-amber-200/60 dark:border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30">
                    ĐÓNG
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark:border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30">
                    CAO (High)
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark:border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30">
                    THẤP (Low)
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark:border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30">
                    THAY ĐỔI
                  </th>
                  {/* Trái phiếu 10Y (9 cột) */}
                  <th className="border-b border-r border-amber-200/60 dark:border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30">
                    MỞ
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark:border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30" />
                  <th className="border-b border-r border-amber-200/60 dark:border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30" />
                  <th className="border-b border-r border-amber-200/60 dark:border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30" />
                  <th className="border-b border-r border-amber-200/60 dark:border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30" />
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30">
                    ĐÓNG
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30">
                    CAO (High)
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30">
                    THẤP (Low)
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30">
                    THAY ĐỔI
                  </th>
                  {/* S&P 500 (9 cột) */}
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30">
                    MỞ
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30" />
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30" />
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30" />
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30" />
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30">
                    ĐÓNG
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30">
                    CAO (High)
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30">
                    THẤP (Low)
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30">
                    THAY ĐỔI
                  </th>
                  {/* Tỷ giá VCB (3 cột) */}
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30">
                    Mua tiền mặt
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30">
                    Mua chuyển khoản
                  </th>
                  <th className="border-b border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30">
                    Bán
                  </th>
                </tr>
                {/* Dòng 3: các mốc giờ chi tiết */}
                <tr>
                  {/* Mua - Mạnh Hải (5 cột) */}
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap">
                    9h (Việt Nam)
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap">
                    11h (Việt Nam)
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap">
                    14h30 (Việt Nam)
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap">
                    17h30 (Việt Nam)
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap" />
                  {/* Bán - Mạnh Hải (5 cột) */}
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap">
                    9h (Việt Nam)
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap">
                    11h (Việt Nam)
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap">
                    14h30 (Việt Nam)
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap">
                    17h30 (Việt Nam)
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap" />
                  {/* Thứ, Ngày đã rowSpan=3 ở dòng 1 */}
                  {/* KITCO (9 cột) */}
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap">
                    0h (Kitco)
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap">
                    9h (Việt Nam)
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap">
                    11h (Việt Nam)
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap">
                    14h30 (Việt Nam)
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap">
                    17h30 (Việt Nam)
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap">
                    24h (Kitco)
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap" />
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap" />
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap" />
                  {/* Giá dầu (9 cột) */}
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap">
                    0h (Investing)
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap">
                    9h (Việt Nam)
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap">
                    11h (Việt Nam)
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap">
                    14h30 (Việt Nam)
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap">
                    17h30 (Việt Nam)
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap">
                    24h (Investing)
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap" />
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap" />
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap" />
                  {/* Dollar index (9 cột) */}
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap">
                    0h (Investing)
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap">
                    9h (Việt Nam)
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap">
                    11h (Việt Nam)
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap">
                    14h30 (Việt Nam)
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap">
                    17h30 (Việt Nam)
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap">
                    24h (Investing)
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap" />
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap" />
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap" />
                  {/* Trái phiếu 10Y (9 cột) */}
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap">
                    0h (Investing)
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap">
                    9h (Việt Nam)
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap">
                    11h (Việt Nam)
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap">
                    14h30 (Việt Nam)
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap">
                    17h30 (Việt Nam)
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap">
                    24h (Investing)
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap" />
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap" />
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap" />
                  {/* S&P 500 (9 cột) */}
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap">
                    0h (Investing)
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap">
                    9h (Việt Nam)
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap">
                    11h (Việt Nam)
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap">
                    14h30 (Việt Nam)
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap">
                    17h30 (Việt Nam)
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap">
                    24h (Investing)
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap" />
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap" />
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap" />
                  {/* Tỷ giá VCB (3 cột) */}
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap" />
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap" />
                  <th className="border-b border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap" />
                </tr>
              </thead>
              <tbody>
                {dateRows.map((row, i) => (
                  <tr
                    key={row.date.toISOString()}
                    className="border-b border-stone-100 dark:border-stone-800 transition-colors duration-200 hover:bg-amber-50/60 dark:hover:bg-amber-950/30"
                  >
                    {Array.from({ length: TOTAL_COLUMNS }, (_, j) => (
                      <td
                        key={j}
                        className="border-r border-stone-100 dark:border-stone-800 px-2 py-2 text-xs max-w-[120px] truncate tabular-nums text-stone-400 dark:text-stone-500"
                      >
                        {j === 0
                          ? i + 1
                          : j === 11
                            ? row.weekdayLabel
                            : j === 12
                              ? row.dateLabel
                              : j >= 13 && j <= 21
                                ? kitcoCellValue(row.isoDate, j)
                              : "–"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
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

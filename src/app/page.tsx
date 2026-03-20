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

function getChangeToneClass(value: string): string {
  // value examples: "1.23%", "-0.45%", "–"
  const trimmed = value.trim();
  if (trimmed === "–" || trimmed === "") {
    return "text-stone-500 dark:text-stone-300 font-bold";
  }
  const num = parseFloat(trimmed.replace("%", "").replace(",", "."));
  if (!Number.isFinite(num)) {
    return "text-stone-500 dark:text-stone-300 font-bold";
  }
  if (num < 0) return "text-red-600 dark:text-red-400 font-bold";
  // Dương/0%: đồng nhất về đen/xám
  if (num > 0) return "text-stone-700 dark:text-stone-200 font-bold";
  return "text-stone-500 dark:text-stone-300 font-bold";
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
      const weekdayLabel =
        day === 0 ? "Chủ nhật" : day === 6 ? "Thứ 7" : `Thứ ${day + 1}`; // Mon=2..Sat=7

      // Force dd/mm/yyyy (e.g. 07/10/2026)
      const dd = String(d.getDate()).padStart(2, "0");
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const yyyy = String(d.getFullYear());
      const dateLabel = `${dd}/${mm}/${yyyy}`;
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

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function loadFullTable() {
      try {
        // Clear old data immediately when switching range
        setFullRowsByDate({});
        setIsLoadingTable(true);
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
    if (colIndex === 5 || colIndex === 10) {
      const text = formatVnd(raw);
      return {
        text,
        toneClass: getNumberToneClass(Number.isFinite(n) ? n : null),
      };
    }
    return { text: formatVnd(raw) };
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
          className="relative rounded-2xl border border-amber-200/40 dark:border-amber-900/30 bg-white dark:bg-stone-900 shadow-xl shadow-amber-500/5 overflow-hidden opacity-0 animate-scale-in"
          style={{ animationDelay: "140ms", animationFillMode: "forwards" }}
        >
          <div className="border-b border-amber-200/50 dark:border-amber-900/30 px-5 py-3.5 text-sm text-stone-500 dark:text-stone-400 bg-gradient-to-r from-amber-50/70 to-white/60 dark:from-amber-950/20 dark:to-stone-900/10 backdrop-blur flex items-center justify-between gap-3">
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
          <div className="overflow-auto">
            <table className="w-full text-left border-separate border-spacing-0 min-w-max">
              <thead className="sticky top-0 z-10 bg-amber-100/90 dark:bg-amber-900/30 backdrop-blur-sm text-center [&_th]:font-bold [&_th]:!border-stone-300 [&_th]:dark:!border-stone-700">
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
                    colSpan={1}
                    className="border-b border-amber-200/60 dark:border-amber-800/40 px-2 py-2 text-[11px] font-bold text-amber-900/80 dark:text-amber-200/90 whitespace-nowrap bg-amber-100/70 dark:bg-amber-900/40"
                  >
                    Tỷ Giá VCB
                  </th>
                </tr>
                {/* Dòng 2: Mở/Đóng/Chênh lệch, v.v. */}
                <tr>
                  {/* Mua - Mạnh Hải (5 cột) */}
                  <th
                    colSpan={3}
                    className="border-b border-r border-amber-200/60 dark:border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30"
                  >
                    MỞ
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark:border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30">
                    ĐÓNG
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark:border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30">
                    CHÊNH LỆCH
                  </th>
                  {/* Bán - Mạnh Hải (5 cột) */}
                  <th
                    colSpan={3}
                    className="border-b border-r border-amber-200/60 dark:border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30"
                  >
                    MỞ
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark:border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30">
                    ĐÓNG
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark:border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30">
                    CHÊNH LỆCH
                  </th>
                  {/* Thứ, Ngày đã rowSpan=3 ở dòng 1 nên bỏ qua ở dòng 2 */}
                  {/* KITCO (9 cột) */}
                  <th
                    colSpan={5}
                    className="border-b border-r border-amber-200/60 dark:border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30"
                  >
                    MỞ
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark:border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30">
                    ĐÓNG
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark:border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30">
                    CAO
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark:border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30">
                    THẤP (Low)
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark:border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30">
                    THAY ĐỔI (Change)
                  </th>
                  {/* Giá dầu (9 cột) */}
                  <th
                    colSpan={5}
                    className="border-b border-r border-amber-200/60 dark:border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30"
                  >
                    MỞ
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark:border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30">
                    ĐÓNG
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark:border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30">
                    CAO
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark:border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30">
                    THẤP
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark:border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30">
                    THAY ĐỔI
                  </th>
                  {/* Dollar index (9 cột) */}
                  <th
                    colSpan={5}
                    className="border-b border-r border-amber-200/60 dark:border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30"
                  >
                    MỞ
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark:border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30">
                    ĐÓNG
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark:border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30">
                    CAO
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark:border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30">
                    THẤP
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
                    CAO
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30">
                    THẤP
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
                    CAO
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30">
                    THẤP
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30">
                    THAY ĐỔI
                  </th>
                  {/* Tỷ giá VCB (1 cột - chỉ lấy Bán) */}
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
                  {/* Tỷ giá VCB (1 cột - chỉ lấy Bán) */}
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap" />
                </tr>
              </thead>
              <tbody>
                {dateRows.map((row, i) => (
                  <tr
                    key={row.isoDate}
                    className="transition-colors duration-200 hover:bg-amber-50/60 dark:hover:bg-amber-950/30"
                  >
                    {Array.from({ length: TOTAL_COLUMNS }, (_, j) => (j === 58 || j === 59 ? null : (
                      <td
                        key={j}
                        className="border-r border-b border-stone-300 dark:border-stone-700 px-2 py-2 text-xs font-bold max-w-[120px] truncate tabular-nums text-stone-400 dark:text-stone-500"
                      >
                        {isLoadingTable && j !== 0 && j !== 11 && j !== 12 ? (
                          <div className="h-4 w-14 rounded bg-stone-200/70 dark:bg-stone-800/70 animate-pulse" />
                        ) : j === 0 ? (
                          i + 1
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
                              <span className={getChangeToneClass(v)}>
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
                              <span className={getChangeToneClass(v)}>
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
                              <span className={getChangeToneClass(v)}>
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
                              <span className={getChangeToneClass(v)}>
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
                              <span className={getChangeToneClass(v)}>
                                {text}
                              </span>
                            );
                          })()
                        ) : j >= 13 && j <= 21 ? (
                          kitcoCellValue(row.isoDate, j)
                        ) : j >= 22 && j <= 30 ? (
                          marketTimedCellValue(row.isoDate, j, "oil")
                        ) : j >= 31 && j <= 39 ? (
                          marketTimedCellValue(row.isoDate, j, "dollarIndex")
                        ) : j >= 40 && j <= 48 ? (
                          marketTimedCellValue(row.isoDate, j, "bond10y")
                        ) : j >= 49 && j <= 57 ? (
                          marketTimedCellValue(row.isoDate, j, "sp500")
                        ) : j >= 58 && j <= 60 ? (
                          vcbCellValue(row.isoDate, j)
                        ) : (
                          "–"
                        )}
                      </td>
                    )))} 
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

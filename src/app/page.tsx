"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  HEADER_ROW0,
  HEADER_ROW1,
  HEADER_ROW2,
  TOTAL_COLUMNS,
} from "@/data/table-headers-60";

const YEARS = [2022, 2023, 2024, 2025, 2026] as const;
type YearFilter = (typeof YEARS)[number] | "all" | "recent";

type FullTableRow = Record<string, string | number | null>;

interface FullTableResponse {
  rows: FullTableRow[];
  fromDate: string;
  toDate: string;
}

/** Lấy tên thứ (Hai, Ba, Tư, Năm, Sáu, Bảy, CN) từ yyyy-mm-dd – chữ hoa đầu cho đẹp */
function getWeekdayVi(dateStr: string | number | null): string {
  if (!dateStr) return "";
  const s = String(dateStr);
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "";
  const wd = d.getDay();
  switch (wd) {
    case 0:
      return "Chủ Nhật";
    case 1:
      return "Hai";
    case 2:
      return "Ba";
    case 3:
      return "Tư";
    case 4:
      return "Năm";
    case 5:
      return "Sáu";
    case 6:
      return "Bảy";
    default:
      return "";
  }
}

/** Chuỗi yyyy-mm-dd → dd-mm-yyyy */
function formatDateDdMmYyyy(s: string): string {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return s;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

/** Xóa data Mua/Bán Mạnh Hải (col_1..col_10) – xử lý sau, không hiển thị data cũ/sai */
function clearMạnhHảiData(row: FullTableRow): FullTableRow {
  const r = { ...row };
  for (let j = 1; j <= 10; j++) r[`col_${j}`] = null;
  return r;
}

/** Cột % thay đổi (màu xanh/đỏ) – layout 60 cột Temp.csv */
const CHANGE_COL_KEYS = new Set([
  "col_21",
  "col_30",
  "col_39",
  "col_48",
  "col_57",
]);

function cellDisplay(val: string | number | null, key: string): string {
  if (val == null || val === "") return "–";
  if (typeof val === "string" && val.startsWith("http")) return val;
  if ((key === "col_6" || key === "col_12") && typeof val === "string")
    return formatDateDdMmYyyy(val);
  if (typeof val === "number") {
    if (Number.isInteger(val) && val > 1000) return val.toLocaleString("vi");
    if (typeof val === "number" && !Number.isInteger(val)) {
      const s = val.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
      if (CHANGE_COL_KEYS.has(key) && val > 0) return `+${s}%`;
      return s;
    }
    if (CHANGE_COL_KEYS.has(key) && val > 0) return `+${val}%`;
    return String(val);
  }
  const s = String(val).trim();
  if (CHANGE_COL_KEYS.has(key)) {
    const num = parseFloat(s.replace(/%/g, ""));
    if (!Number.isNaN(num) && num > 0 && !s.startsWith("+")) return `+${s}`;
  }
  return s;
}

/** Trả về 1 (tăng/xanh), -1 (giảm/đỏ), 0 (trung tính) từ giá trị cột Thay đổi % */
function getChangeSign(val: string | number | null): 1 | -1 | 0 {
  if (val == null || val === "") return 0;
  const s = String(val).trim();
  const pct = s.replace(/%/g, "");
  const num = parseFloat(pct);
  if (Number.isNaN(num)) return 0;
  if (num > 0) return 1;
  if (num < 0) return -1;
  return 0;
}

const CLOSE_TO_CHANGE: Record<string, string> = {
  col_18: "col_21",
  col_27: "col_30",
  col_36: "col_39",
  col_45: "col_48",
  col_54: "col_57",
};

function getCellColorClass(
  colKey: string,
  val: string | number | null,
  row: FullTableRow,
): string {
  let sign: 1 | -1 | 0 = 0;
  if (CHANGE_COL_KEYS.has(colKey)) {
    sign = getChangeSign(val);
  } else if (CLOSE_TO_CHANGE[colKey]) {
    sign = getChangeSign(row[CLOSE_TO_CHANGE[colKey]]);
  }
  if (sign === 1) return "text-emerald-600 dark:text-emerald-400 font-medium";
  if (sign === -1) return "text-red-600 dark:text-red-400 font-medium";
  return "text-stone-700 dark:text-stone-300";
}

/** Chia khoảng [from, to] thành các chunk theo tháng (mỗi chunk tối đa 1 tháng) */
function getMonthlyChunks(from: string, to: string): [string, string][] {
  const chunks: [string, string][] = [];
  const end = new Date(to);
  const d = new Date(from);
  d.setHours(0, 0, 0, 0);
  while (d <= end) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const chunkFrom = `${y}-${m}-01`;
    const lastDay = new Date(y, d.getMonth() + 1, 0);
    const chunkTo = lastDay > end ? to : lastDay.toISOString().slice(0, 10);
    chunks.push([chunkFrom, chunkTo]);
    d.setMonth(d.getMonth() + 1);
    d.setDate(1);
  }
  return chunks;
}

/** Số ngày trong khoảng [from, to] (ước tính tổng bản ghi) */
function countDays(from: string, to: string): number {
  const a = new Date(from);
  const b = new Date(to);
  a.setHours(0, 0, 0, 0);
  b.setHours(0, 0, 0, 0);
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 86400000) + 1);
}

export default function Home() {
  const [yearFilter, setYearFilter] = useState<YearFilter>("recent");
  const [rows, setRows] = useState<FullTableRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Khi đang tải từng chunk: { loaded, total } để hiển thị "Đã X / Y bản ghi" */
  const [loadingProgress, setLoadingProgress] = useState<{
    loaded: number;
    total: number;
  } | null>(null);

  const loadData = useCallback(
    async (forceRefresh = false) => {
      setLoading(true);
      setError(null);
      setRows([]);
      const today = new Date().toISOString().slice(0, 10);
      let from: string;
      let to: string;
      if (yearFilter === "recent") {
        const d = new Date();
        d.setMonth(d.getMonth() - 1);
        d.setDate(1);
        from = d.toISOString().slice(0, 10);
        to = today;
      } else if (yearFilter === "all") {
        from = "2022-01-01";
        to = today;
      } else {
        from = `${yearFilter}-01-01`;
        to = `${yearFilter}-12-31`;
      }
      const toUse = to > today ? today : to;
      const totalEstimate = countDays(from, toUse);
      setLoadingProgress({ loaded: 0, total: totalEstimate });

      const chunks = getMonthlyChunks(from, toUse);
      const refreshParam = forceRefresh ? "&refresh=1" : "";
      try {
        for (const [chunkFrom, chunkTo] of chunks) {
          const res = await fetch(
            `/api/full-table?from=${encodeURIComponent(chunkFrom)}&to=${encodeURIComponent(chunkTo)}${refreshParam}`,
          );
          if (!res.ok) {
            setError("Không tải được dữ liệu. Thử lại sau.");
            setRows([]);
            setLoadingProgress(null);
            return;
          }
          const data: FullTableResponse = await res.json();
          const newRows = (data.rows ?? []).map(clearMạnhHảiData);
          setRows((prev) => {
            const byDate = new Map<string, FullTableRow>();
            const dateKey = (r: FullTableRow) =>
              r.col_12 != null
                ? String(r.col_12)
                : r.col_6 != null
                  ? String(r.col_6)
                  : "";
            for (const r of prev) {
              const d = dateKey(r);
              if (d) byDate.set(d, clearMạnhHảiData(r));
            }
            for (const r of newRows) {
              const d = dateKey(r);
              if (d) byDate.set(d, r);
            }
            const merged = Array.from(byDate.values()).map(clearMạnhHảiData);
            return merged.sort((a, b) => {
              const da = a.col_12 ?? a.col_6;
              const db = b.col_12 ?? b.col_6;
              if (da == null || db == null) return 0;
              const dateA = parseDateForSort(String(da));
              const dateB = parseDateForSort(String(db));
              return dateB.getTime() - dateA.getTime();
            });
          });
          setLoadingProgress((p) =>
            p ? { ...p, loaded: p.loaded + newRows.length } : null,
          );
        }
      } catch {
        setError("Lỗi kết nối. Thử lại sau.");
        setRows([]);
      } finally {
        setLoading(false);
        setLoadingProgress(null);
      }
    },
    [yearFilter],
  );

  useEffect(() => {
    loadData();
  }, [loadData]);

  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => {
      const da = a.col_12 ?? a.col_6;
      const db = b.col_12 ?? b.col_6;
      if (da == null || db == null) return 0;
      const dateA = parseDateForSort(String(da));
      const dateB = parseDateForSort(String(db));
      return dateB.getTime() - dateA.getTime();
    });
  }, [rows]);

  return (
    <div className="min-h-screen flex flex-col bg-stone-50 dark:bg-stone-950 text-stone-900 dark:text-stone-100">
      <header
        className="shrink-0 sticky top-0 z-20 opacity-0 animate-fade-in-up border-b border-amber-200/50 dark:border-amber-900/30 bg-white/90 dark:bg-stone-900/90 backdrop-blur-md shadow-sm"
        style={{ animationDelay: "0ms", animationFillMode: "forwards" }}
      >
        <div className="w-full px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-amber-700 text-white text-lg font-bold shadow-lg shadow-amber-500/25 transition-transform duration-300 hover:scale-105">
              G
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
            Giá dầu (Investing), Dollar index (Investing), Trái phiếu 10Y, Vàng
            XAU/USD, S&P 500, Tỷ giá VCB
          </p>
        </section>

        <div
          className="mb-6 flex flex-wrap items-center gap-3 opacity-0 animate-fade-in-up"
          style={{ animationDelay: "140ms", animationFillMode: "forwards" }}
        >
          <span className="text-sm font-semibold text-stone-600 dark:text-stone-400">
            Khoảng thời gian
          </span>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setYearFilter("recent")}
              disabled={loading}
              className={`rounded-full px-4 py-2 text-sm font-medium transition-all duration-300 ease-out hover:scale-105 active:scale-100 disabled:opacity-60 ${
                yearFilter === "recent"
                  ? "bg-gradient-to-r from-amber-500 to-amber-600 text-white shadow-md shadow-amber-500/30"
                  : "bg-stone-200/80 dark:bg-stone-700/80 text-stone-600 dark:text-stone-400 hover:bg-stone-300 dark:hover:bg-stone-600"
              }`}
            >
              2 tháng gần nhất
            </button>
            {YEARS.map((y) => (
              <button
                key={y}
                type="button"
                onClick={() => setYearFilter(y)}
                disabled={loading}
                className={`rounded-full px-4 py-2 text-sm font-medium transition-all duration-300 ease-out hover:scale-105 active:scale-100 disabled:opacity-60 ${
                  yearFilter === y
                    ? "bg-gradient-to-r from-amber-500 to-amber-600 text-white shadow-md shadow-amber-500/30"
                    : "bg-stone-200/80 dark:bg-stone-700/80 text-stone-600 dark:text-stone-400 hover:bg-stone-300 dark:hover:bg-stone-600"
                }`}
              >
                {y}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setYearFilter("all")}
              disabled={loading}
              className={`rounded-full px-4 py-2 text-sm font-medium transition-all duration-300 ease-out hover:scale-105 active:scale-100 disabled:opacity-60 ${
                yearFilter === "all"
                  ? "bg-gradient-to-r from-amber-500 to-amber-600 text-white shadow-md shadow-amber-500/30"
                  : "bg-stone-200/80 dark:bg-stone-700/80 text-stone-600 dark:text-stone-400 hover:bg-stone-300 dark:hover:bg-stone-600"
              }`}
            >
              Xem tất cả
            </button>
          </div>
          <span className="inline-flex items-center rounded-full bg-amber-100 dark:bg-amber-900/40 px-3 py-1 text-sm font-medium text-amber-800 dark:text-amber-200">
            {loading && loadingProgress
              ? `Đã tải ${loadingProgress.loaded} / ${loadingProgress.total} bản ghi`
              : `${sortedRows.length} dòng`}
          </span>
          <button
            type="button"
            onClick={() => loadData(true)}
            disabled={loading}
            className="rounded-full px-3 py-2 text-xs font-medium text-amber-700 dark:text-amber-300 bg-amber-100/80 dark:bg-amber-900/40 hover:bg-amber-200/80 dark:hover:bg-amber-800/50 disabled:opacity-50"
            title="Tải lại từ API và cập nhật cache"
          >
            Làm mới
          </button>
        </div>

        {loading && loadingProgress && (
          <div
            className="mb-6 rounded-xl border border-amber-200/50 dark:border-amber-800/50 bg-amber-50/60 dark:bg-amber-950/30 px-4 py-3 opacity-0 animate-fade-in-up"
            style={{ animationDelay: "0ms", animationFillMode: "forwards" }}
          >
            <div className="flex items-center gap-3">
              <div className="h-2 flex-1 rounded-full bg-stone-200 dark:bg-stone-700 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-amber-500 to-amber-600 transition-all duration-300"
                  style={{
                    width: `${loadingProgress.total ? Math.min(100, (loadingProgress.loaded / loadingProgress.total) * 100) : 0}%`,
                  }}
                />
              </div>
              <span className="text-sm font-medium text-amber-800 dark:text-amber-200 whitespace-nowrap">
                {loadingProgress.loaded} / {loadingProgress.total}
              </span>
            </div>
            <p className="mt-2 text-xs text-stone-500 dark:text-stone-400">
              Đang tải từng tháng, bảng cập nhật dần…
            </p>
          </div>
        )}

        {error && (
          <div className="mb-6 rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-4 flex items-center justify-between">
            <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>
            <button
              type="button"
              onClick={() => loadData()}
              className="rounded-lg bg-amber-600 px-3 py-1.5 text-white text-sm font-medium hover:bg-amber-700"
            >
              Thử lại
            </button>
          </div>
        )}

        {loading && rows.length === 0 && (
          <div className="rounded-2xl border border-amber-200/40 dark:border-amber-900/30 bg-white dark:bg-stone-900 shadow-xl shadow-amber-500/5 overflow-hidden p-12 text-center">
            <div className="inline-block h-10 w-10 animate-spin rounded-full border-4 border-amber-500 border-t-transparent" />
            <p className="mt-3 text-stone-500 dark:text-stone-400">
              Đang tải dữ liệu từ Investing, VCB, FreeGoldAPI…
            </p>
            {loadingProgress && (
              <p className="mt-2 text-sm font-medium text-amber-700 dark:text-amber-300">
                Đã có {loadingProgress.loaded} / {loadingProgress.total} bản ghi
              </p>
            )}
          </div>
        )}

        {!loading && rows.length === 0 && !error && (
          <div className="rounded-2xl border border-dashed border-amber-200 dark:border-amber-800 bg-amber-50/40 dark:bg-amber-950/20 p-8 text-center">
            <p className="text-stone-600 dark:text-stone-400 text-sm">
              Chưa có dữ liệu. Chọn khoảng thời gian ở trên rồi đợi tải, hoặc
              bấm <strong>Làm mới</strong>.
            </p>
          </div>
        )}

        {rows.length > 0 && (
          <div
            className="rounded-2xl border border-amber-200/40 dark:border-amber-900/30 bg-white dark:bg-stone-900 shadow-xl shadow-amber-500/5 overflow-hidden animate-scale-in"
            style={{ animationDuration: "0.3s", animationFillMode: "forwards" }}
          >
            <div className="border-b border-amber-200/50 dark:border-amber-900/30 px-5 py-3.5 text-sm text-stone-500 dark:text-stone-400 bg-amber-50/60 dark:bg-amber-950/20">
              <span className="font-medium text-stone-700 dark:text-stone-300">
                {yearFilter === "recent"
                  ? "2 tháng gần nhất"
                  : yearFilter === "all"
                    ? "Tất cả năm (2022 → nay)"
                    : `Năm ${yearFilter}`}
              </span>
              <span className="mx-2">·</span>
              <span>{sortedRows.length} dòng</span>
            </div>
            <div>
              <table className="w-full text-left border-collapse min-w-max">
                <thead className="sticky top-0 z-10 bg-amber-100/90 dark:bg-amber-900/30 backdrop-blur-sm">
                  <tr>
                    <th
                      rowSpan={3}
                      className="w-12 border-b border-r border-amber-200/60 dark:border-amber-800/40 px-2 py-2 text-xs font-bold uppercase tracking-wider text-amber-900/80 dark:text-amber-200/90 align-bottom bg-amber-100/70 dark:bg-amber-900/40"
                    >
                      STT
                    </th>
                    {HEADER_ROW0.slice(1).map((label, j) => (
                      <th
                        key={j}
                        className="border-b border-r border-amber-200/60 dark:border-amber-800/40 px-2 py-2 text-[11px] font-bold text-amber-900/80 dark:text-amber-200/90 whitespace-nowrap bg-amber-100/70 dark:bg-amber-900/40"
                      >
                        {label || "\u00A0"}
                      </th>
                    ))}
                  </tr>
                  <tr>
                    {HEADER_ROW1.slice(1).map((label, j) => (
                      <th
                        key={j}
                        className="border-b border-r border-amber-200/60 dark:border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30"
                      >
                        {String(label || "").replace(/\n/g, " ") || "\u00A0"}
                      </th>
                    ))}
                  </tr>
                  <tr>
                    {HEADER_ROW2.slice(1).map((label, j) => (
                      <th
                        key={j}
                        className="border-b border-r border-amber-200/60 dark:border-amber-800/40 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap"
                      >
                        {String(label || "").replace(/\n/g, " ") || "\u00A0"}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedRows.map((row, i) => (
                    <tr
                      key={`${row.col_12 ?? row.col_6 ?? i}-${i}`}
                      className="border-b border-stone-100 dark:border-stone-800 transition-colors duration-200 hover:bg-amber-50/50 dark:hover:bg-amber-950/20"
                    >
                      {Array.from({ length: TOTAL_COLUMNS }, (_, j) => {
                        const key = `col_${j}`;
                        let content: React.ReactNode;
                        const dateVal = row.col_12 ?? row.col_6 ?? null;
                        if (j === 0) {
                          content = i + 1;
                        } else if (j === 11) {
                          content = getWeekdayVi(dateVal);
                        } else if (j === 12) {
                          content = cellDisplay(dateVal, "col_12");
                        } else {
                          const val = row[key];
                          const isLink =
                            typeof val === "string" && val.startsWith("http");
                          content = isLink ? (
                            <a
                              href={val}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-amber-600 dark:text-amber-400 font-medium hover:underline underline-offset-2 truncate block"
                            >
                              Link
                            </a>
                          ) : (
                            cellDisplay(val, key)
                          );
                        }
                        const colorClass =
                          j === 0 || j === 11
                            ? "text-stone-600 dark:text-stone-400 font-medium"
                            : getCellColorClass(key, row[key], row);
                        return (
                          <td
                            key={j}
                            className={`border-r border-stone-100 dark:border-stone-800 px-2 py-2 text-xs max-w-[120px] truncate tabular-nums ${colorClass}`}
                            title={
                              typeof content === "string"
                                ? content
                                : j === 0
                                  ? String(i + 1)
                                  : undefined
                            }
                          >
                            {content}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      <footer
        className="shrink-0 border-t border-amber-200/40 dark:border-amber-900/30 bg-white/70 dark:bg-stone-900/70 backdrop-blur-sm mt-auto opacity-0 animate-fade-in"
        style={{ animationDelay: "350ms", animationFillMode: "forwards" }}
      >
        <div className="w-full px-4 sm:px-6 py-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 text-sm text-stone-500 dark:text-stone-400">
            <p>© {new Date().getFullYear()} · Giá vàng & Tỷ giá</p>
            <p className="text-xs sm:text-sm">
              Make by Trần Trung Hiếu - 0862478150
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

function parseDateForSort(val: string | number): Date {
  const s = String(val).trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso)
    return new Date(
      parseInt(iso[1], 10),
      parseInt(iso[2], 10) - 1,
      parseInt(iso[3], 10),
    );
  const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy)
    return new Date(
      parseInt(dmy[3], 10),
      parseInt(dmy[2], 10) - 1,
      parseInt(dmy[1], 10),
    );
  return new Date(0);
}

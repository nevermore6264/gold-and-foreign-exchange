"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import excelColumns from "@/data/excel-columns.json";

const TABLE_COLUMNS = (excelColumns as { key: string; label: string }[]).filter(
  (col) => col.key !== "col_0",
);

/** Dòng header nhóm cột (row 1 trong Excel) – giống file cần xử lý.xlsx */
const SECTION_HEADERS: { label: string; colspan: number }[] = [
  { label: "GIÁ DẦU", colspan: 5 },
  { label: "DATE", colspan: 1 },
  { label: "DOLLAR INDEX", colspan: 5 },
  { label: "", colspan: 2 },
  { label: "TRÁI PHIẾU US - 10 NĂM", colspan: 5 },
  { label: "GIÁ VÀNG THẾ GIỚI / OUNCE", colspan: 5 },
  { label: "S&P 500", colspan: 5 },
  { label: "Tỷ Giá VCB", colspan: 1 },
  { label: "", colspan: 5 },
];

const YEARS = [2022, 2023, 2024, 2025, 2026] as const;
type YearFilter = (typeof YEARS)[number] | "all";

type FullTableRow = Record<string, string | number | null>;

interface FullTableResponse {
  rows: FullTableRow[];
  fromDate: string;
  toDate: string;
}

/** Chuỗi yyyy-mm-dd → dd-mm-yyyy */
function formatDateDdMmYyyy(s: string): string {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return s;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

function cellDisplay(val: string | number | null, key: string): string {
  if (val == null || val === "") return "–";
  if (typeof val === "string" && val.startsWith("http")) return val;
  if (key === "col_6" && typeof val === "string")
    return formatDateDdMmYyyy(val);
  if (typeof val === "number") {
    if (Number.isInteger(val) && val > 1000) return val.toLocaleString("vi");
    if (typeof val === "number" && !Number.isInteger(val))
      return val.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    return String(val);
  }
  return String(val);
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

const CHANGE_COL_KEYS = new Set([
  "col_5",
  "col_11",
  "col_18",
  "col_23",
  "col_28",
]);
const CLOSE_TO_CHANGE: Record<string, string> = {
  col_4: "col_5",
  col_10: "col_11",
  col_17: "col_18",
  col_22: "col_23",
  col_27: "col_28",
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

export default function Home() {
  const [yearFilter, setYearFilter] = useState<YearFilter>("all");
  const [rows, setRows] = useState<FullTableRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    const today = new Date().toISOString().slice(0, 10);
    const from = yearFilter === "all" ? "2022-01-01" : `${yearFilter}-01-01`;
    const to = yearFilter === "all" ? today : `${yearFilter}-12-31`;
    if (yearFilter !== "all" && yearFilter >= 2025 && to > today) {
      // Năm hiện tại: đến hôm nay
      // (already handled by to when year is current)
    }
    const toUse = to > today ? today : to;
    try {
      const res = await fetch(
        `/api/full-table?from=${encodeURIComponent(from)}&to=${encodeURIComponent(toUse)}`,
      );
      if (!res.ok) {
        setError("Không tải được dữ liệu. Thử lại sau.");
        setRows([]);
        return;
      }
      const data: FullTableResponse = await res.json();
      setRows(data.rows ?? []);
    } catch {
      setError("Lỗi kết nối. Thử lại sau.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [yearFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => {
      const da = a.col_6;
      const db = b.col_6;
      if (da == null || db == null) return 0;
      const dateA = parseDateForSort(da);
      const dateB = parseDateForSort(db);
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
                THEO DÕI · Investing, VCB, FreeGoldAPI
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
            Dầu, Dollar index, Trái phiếu US 10Y, Vàng XAU/USD, S&P 500, Tỷ giá
            VCB · Fill đúng cột
          </p>
        </section>

        <div
          className="mb-6 flex flex-wrap items-center gap-3 opacity-0 animate-fade-in-up"
          style={{ animationDelay: "140ms", animationFillMode: "forwards" }}
        >
          <span className="text-sm font-semibold text-stone-600 dark:text-stone-400">
            Lọc theo năm
          </span>
          <div className="flex flex-wrap gap-2">
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
              Tất cả
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
          </div>
          <span className="inline-flex items-center rounded-full bg-amber-100 dark:bg-amber-900/40 px-3 py-1 text-sm font-medium text-amber-800 dark:text-amber-200">
            {loading ? "…" : sortedRows.length} dòng
          </span>
        </div>

        {error && (
          <div className="mb-6 rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-4 flex items-center justify-between">
            <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>
            <button
              type="button"
              onClick={loadData}
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
          </div>
        )}

        {!loading && rows.length > 0 && (
          <div
            className="rounded-2xl border border-amber-200/40 dark:border-amber-900/30 bg-white dark:bg-stone-900 shadow-xl shadow-amber-500/5 overflow-hidden opacity-0 animate-scale-in"
            style={{ animationDelay: "0ms", animationFillMode: "forwards" }}
          >
            <div className="border-b border-amber-200/50 dark:border-amber-900/30 px-5 py-3.5 text-sm text-stone-500 dark:text-stone-400 bg-amber-50/60 dark:bg-amber-950/20">
              <span className="font-medium text-stone-700 dark:text-stone-300">
                {yearFilter === "all"
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
                      rowSpan={2}
                      className="w-12 border-b border-r border-amber-200/60 dark:border-amber-800/40 px-3 py-3 text-xs font-bold uppercase tracking-wider text-amber-900/80 dark:text-amber-200/90 align-bottom"
                    >
                      STT
                    </th>
                    {SECTION_HEADERS.map((sec, i) => (
                      <th
                        key={i}
                        colSpan={sec.colspan}
                        className="border-b border-r border-amber-200/60 dark:border-amber-800/40 px-2 py-2 text-[11px] font-bold text-amber-900/80 dark:text-amber-200/90 whitespace-nowrap bg-amber-100/70 dark:bg-amber-900/40"
                      >
                        {sec.label}
                      </th>
                    ))}
                  </tr>
                  <tr>
                    {TABLE_COLUMNS.map((col) => (
                      <th
                        key={col.key}
                        className="border-b border-r border-amber-200/60 dark:border-amber-800/40 px-3 py-2 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap max-w-[140px]"
                        title={col.label}
                      >
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedRows.map((row, i) => (
                    <tr
                      key={`${row.col_6}-${i}`}
                      className="border-b border-stone-100 dark:border-stone-800 transition-colors duration-200 hover:bg-amber-50/50 dark:hover:bg-amber-950/20"
                    >
                      <td className="tabular-nums border-r border-stone-100 dark:border-stone-800 px-3 py-2.5 text-xs text-stone-600 dark:text-stone-400 font-medium">
                        {i + 1}
                      </td>
                      {TABLE_COLUMNS.map((col) => {
                        const val = row[col.key];
                        const isLink =
                          typeof val === "string" && val.startsWith("http");
                        const colorClass = getCellColorClass(col.key, val, row);
                        return (
                          <td
                            key={col.key}
                            className={`border-r border-stone-100 dark:border-stone-800 px-3 py-2.5 text-xs max-w-[140px] truncate tabular-nums ${colorClass}`}
                            title={isLink ? "Link" : cellDisplay(val, col.key)}
                          >
                            {isLink ? (
                              <a
                                href={val}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-amber-600 dark:text-amber-400 font-medium hover:underline underline-offset-2 truncate block"
                              >
                                Link
                              </a>
                            ) : (
                              cellDisplay(val, col.key)
                            )}
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
              Nguồn: Investing.com, Vietcombank, FreeGoldAPI · Cafef (col 12)
              chưa tích hợp
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

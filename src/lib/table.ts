/**
 * Bảng kết hợp: STT | Ngày (2022→nay) | Giá vàng USD XAU/USD (Investing.com) | Tỷ giá bán USD (VCB).
 * Sinh đủ từng ngày từ 2022-01-01 đến hôm nay.
 */

import { fetchInvestingXauUsd } from "./investing";
import { fetchVietcombankUsdSellByDate } from "./vietcombank";

const CONCURRENCY = 10;
export const START_DATE = "2022-01-01";
const LOOKBACK_DAYS = 10;

function addDaysIso(iso: string, deltaDays: number): string {
  const [y, m, d] = iso.split("-").map((x) => parseInt(x, 10));
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
  dt.setDate(dt.getDate() + deltaDays);
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Sinh danh sách mọi ngày từ start đến end (YYYY-MM-DD).
 * end = hôm nay nếu không truyền.
 */
export function generateAllDates(start: string, end?: string): string[] {
  const endDate = end ? new Date(end) : new Date();
  const dates: string[] = [];
  const d = new Date(start);
  d.setHours(0, 0, 0, 0);
  const e = new Date(endDate);
  e.setHours(0, 0, 0, 0);
  while (d <= e) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    dates.push(`${yyyy}-${mm}-${dd}`);
    d.setDate(d.getDate() + 1);
  }
  return dates;
}

async function runInBatches<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += CONCURRENCY) {
    const batch = items.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(batch.map(fn));
    results.push(...batchResults);
  }
  return results;
}

export interface TableRow {
  stt: number;
  date: string;
  goldUsd: number | null;
  vcbUsdSell: number | null;
}

export interface TableData {
  rows: TableRow[];
  fromDate: string;
  toDate: string;
}

/**
 * Lấy bảng theo khoảng ngày [from, to]. Dùng để tải từng chunk.
 */
export async function getCombinedTableRange(
  from: string,
  to: string,
): Promise<TableData> {
  const dates = generateAllDates(from, to);
  if (dates.length === 0) {
    return { rows: [], fromDate: "", toDate: "" };
  }

  const fetchFrom =
    from <= START_DATE
      ? START_DATE
      : addDaysIso(from, -LOOKBACK_DAYS) < START_DATE
        ? START_DATE
        : addDaysIso(from, -LOOKBACK_DAYS);

  const [xauRows, vcbSells] = await Promise.all([
    fetchInvestingXauUsd(fetchFrom, to),
    runInBatches(dates, (date) => fetchVietcombankUsdSellByDate(date)),
  ]);

  const byTradingDay = new Map(xauRows.map((r) => [r.date, r.close]));
  const extended = generateAllDates(fetchFrom, to);
  let lastClose: number | null = null;
  const closeByCal = new Map<string, number | null>();
  for (const d of extended) {
    const c = byTradingDay.get(d);
    if (c != null && Number.isFinite(c)) lastClose = c;
    closeByCal.set(d, c ?? lastClose);
  }

  const rows: TableRow[] = dates.map((date, i) => ({
    stt: i + 1,
    date,
    goldUsd: closeByCal.get(date) ?? null,
    vcbUsdSell: vcbSells[i] ?? null,
  }));

  return {
    rows,
    fromDate: dates[0] ?? "",
    toDate: dates[dates.length - 1] ?? "",
  };
}

/**
 * Lấy toàn bộ bảng (2022-01-01 → hôm nay). Giá vàng = đóng XAU/USD (Investing) theo ngày.
 */
export async function getCombinedTable(): Promise<TableData> {
  return getCombinedTableRange(
    START_DATE,
    new Date().toISOString().slice(0, 10),
  );
}

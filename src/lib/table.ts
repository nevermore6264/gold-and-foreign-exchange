/**
 * Bảng kết hợp: STT | Ngày (2022→nay) | Giá vàng USD (Kitco/FreeGoldAPI) | Tỷ giá bán USD (VCB).
 * Sinh đủ từng ngày từ 2022-01-01 đến hôm nay.
 */

import { fetchGoldFromFreeGoldAPI } from "./gold";
import { fetchVietcombankUsdSellByDate } from "./vietcombank";

const CONCURRENCY = 10;
export const START_DATE = "2022-01-01";

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
    // Use local calendar day to avoid timezone shift with toISOString()
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
  const [goldList, dates] = await Promise.all([
    fetchGoldFromFreeGoldAPI(),
    Promise.resolve(generateAllDates(from, to)),
  ]);

  const goldByMonth = new Map<string, number>();
  for (const { date, price } of goldList) {
    const ym = date.slice(0, 7);
    if (!goldByMonth.has(ym)) goldByMonth.set(ym, price);
  }

  const vcbSells = await runInBatches(dates, (date) =>
    fetchVietcombankUsdSellByDate(date),
  );

  const rows: TableRow[] = dates.map((date, i) => ({
    stt: i + 1,
    date,
    goldUsd: goldByMonth.get(date.slice(0, 7)) ?? null,
    vcbUsdSell: vcbSells[i] ?? null,
  }));

  return {
    rows,
    fromDate: dates[0] ?? "",
    toDate: dates[dates.length - 1] ?? "",
  };
}

/**
 * Lấy toàn bộ bảng (2022-01-01 → hôm nay). Giá vàng dùng giá tháng.
 */
export async function getCombinedTable(): Promise<TableData> {
  return getCombinedTableRange(
    START_DATE,
    new Date().toISOString().slice(0, 10),
  );
}

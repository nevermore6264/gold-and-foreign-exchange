/**
 * Bảng đủ 35 cột (col_0 .. col_34) theo mapping từ file Excel / ảnh.
 * Nguồn:
 * - col_1-5: Giá dầu → investing.com crude oil
 * - col_6: DATE
 * - col_7-11: Dollar index → Yahoo (DX-Y.NYB) hoặc investing.com
 * - col_12: MẠNH HẢI MUA VÀO → cafef (chưa tích hợp, để trống)
 * - col_13: MẠNH HẢI BÁN RA → năm (vd 2025)
 * - col_14-18: Trái phiếu US 10Y → investing.com
 * - col_19-23: Giá vàng XAU/USD → FreeGoldAPI (hoặc investing)
 * - col_24-28: S&P 500 → investing.com
 * - col_29: Tỷ giá VCB → Vietcombank API
 * - col_30-34: Công thức/ghi chú (để trống)
 */

import { fetchGoldFromFreeGoldAPI } from "./gold";
import { fetchVietcombankUsdSellByDate } from "./vietcombank";
import { fetchInvestingHistorical, PAIR_IDS, type OHLCRow } from "./investing";
import { fetchOilHistoricalYahoo } from "./oil";
import { fetchDollarIndexHistoricalYahoo } from "./dollar";

const CONCURRENCY = 8;
export const START_DATE = "2022-01-01";

export function generateAllDates(start: string, end?: string): string[] {
  const endDate = end ? new Date(end) : new Date();
  const dates: string[] = [];
  const d = new Date(start);
  d.setHours(0, 0, 0, 0);
  const e = new Date(endDate);
  e.setHours(0, 0, 0, 0);
  while (d <= e) {
    dates.push(d.toISOString().slice(0, 10));
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

function ohlcToCols(row: OHLCRow | null): (string | number | null)[] {
  if (!row) return [null, null, null, null, null];
  return [row.open, row.high, row.low, row.close, row.changePercent ?? null];
}

export type FullTableRow = Record<string, string | number | null>;

/**
 * Lấy bảng đầy đủ cột cho khoảng ngày [from, to].
 */
export async function getFullTableRange(
  from: string,
  to: string,
): Promise<{ rows: FullTableRow[]; fromDate: string; toDate: string }> {
  const dates = generateAllDates(from, to);
  if (dates.length === 0) {
    return { rows: [], fromDate: from, toDate: to };
  }

  const [
    goldList,
    vcbSells,
    oilYahoo,
    oilInvesting,
    dollarYahoo,
    dollarInvesting,
    bond,
    xauUsd,
    sp500,
  ] = await Promise.all([
    fetchGoldFromFreeGoldAPI(),
    runInBatches(dates, (d) => fetchVietcombankUsdSellByDate(d)),
    fetchOilHistoricalYahoo(from, to),
    fetchInvestingHistorical(PAIR_IDS.crudeOil, from, to),
    fetchDollarIndexHistoricalYahoo(from, to),
    fetchInvestingHistorical(PAIR_IDS.dollarIndex, from, to),
    fetchInvestingHistorical(PAIR_IDS.us10yBond, from, to),
    fetchInvestingHistorical(PAIR_IDS.xauUsd, from, to),
    fetchInvestingHistorical(PAIR_IDS.sp500, from, to),
  ]);

  const oil = oilYahoo.length > 0 ? oilYahoo : oilInvesting;
  const dollar = dollarYahoo.length > 0 ? dollarYahoo : dollarInvesting;

  const goldByMonth = new Map<string, number>();
  for (const { date, price } of goldList) {
    const ym = date.slice(0, 7);
    if (!goldByMonth.has(ym)) goldByMonth.set(ym, price);
  }

  const byDate = (arr: OHLCRow[]): Map<string, OHLCRow> =>
    new Map(arr.map((r) => [r.date, r]));

  const oilMap = byDate(oil);
  const dollarMap = byDate(dollar);
  const bondMap = byDate(bond);
  const xauMap = byDate(xauUsd);
  const spMap = byDate(sp500);

  const rows: FullTableRow[] = dates.map((date, i) => {
    const oilRow = oilMap.get(date) ?? null;
    const dollarRow = dollarMap.get(date) ?? null;
    const bondRow = bondMap.get(date) ?? null;
    const xauRow = xauMap.get(date) ?? null;
    const spRow = spMap.get(date) ?? null;
    const goldClose = goldByMonth.get(date.slice(0, 7)) ?? null;
    const vcb = vcbSells[i] ?? null;

    const [c1, c2, c3, c4, c5] = ohlcToCols(oilRow);
    const [c7, c8, c9, c10, c11] = ohlcToCols(dollarRow);
    const [c14, c15, c16, c17, c18] = ohlcToCols(bondRow);
    const [c24, c25, c26, c27, c28] = ohlcToCols(spRow);

    let c19: number | null = xauRow?.open ?? null;
    let c20: number | null = xauRow?.high ?? null;
    let c21: number | null = xauRow?.low ?? null;
    let c22: number | null = xauRow?.close ?? null;
    let c23: string | null = xauRow?.changePercent ?? null;
    if (c22 == null && goldClose != null) {
      c19 = c20 = c21 = c22 = goldClose;
      c23 = null;
    }

    const year = date.slice(0, 4);
    const row: FullTableRow = {};
    row.col_0 = null;
    row.col_1 = c1;
    row.col_2 = c2;
    row.col_3 = c3;
    row.col_4 = c4;
    row.col_5 = c5;
    row.col_6 = date;
    row.col_7 = c7;
    row.col_8 = c8;
    row.col_9 = c9;
    row.col_10 = c10;
    row.col_11 = c11;
    row.col_12 = null;
    row.col_13 = parseInt(year, 10);
    row.col_14 = c14;
    row.col_15 = c15;
    row.col_16 = c16;
    row.col_17 = c17;
    row.col_18 = c18;
    row.col_19 = c19;
    row.col_20 = c20;
    row.col_21 = c21;
    row.col_22 = c22;
    row.col_23 = c23;
    row.col_24 = c24;
    row.col_25 = c25;
    row.col_26 = c26;
    row.col_27 = c27;
    row.col_28 = c28;
    row.col_29 = vcb;
    row.col_30 = null;
    row.col_31 = null;
    row.col_32 = null;
    row.col_33 = null;
    row.col_34 = null;
    return row;
  });

  return {
    rows,
    fromDate: dates[0] ?? from,
    toDate: dates[dates.length - 1] ?? to,
  };
}

export async function getFullTable(): Promise<{
  rows: FullTableRow[];
  fromDate: string;
  toDate: string;
}> {
  return getFullTableRange(START_DATE, new Date().toISOString().slice(0, 10));
}

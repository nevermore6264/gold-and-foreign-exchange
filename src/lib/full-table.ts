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

    const [oilOpen, oilHigh, oilLow, oilClose, oilChange] = ohlcToCols(oilRow);
    const [dollarOpen, dollarHigh, dollarLow, dollarClose, dollarChange] =
      ohlcToCols(dollarRow);
    const [bondOpen, bondHigh, bondLow, bondClose, bondChange] =
      ohlcToCols(bondRow);
    const [spOpen, spHigh, spLow, spClose, spChange] = ohlcToCols(spRow);

    let kitcoOpen: number | null = xauRow?.open ?? null;
    let kitcoHigh: number | null = xauRow?.high ?? null;
    let kitcoLow: number | null = xauRow?.low ?? null;
    let kitcoClose: number | null = xauRow?.close ?? null;
    let kitcoChange: string | null = xauRow?.changePercent ?? null;
    if (kitcoClose == null && goldClose != null) {
      kitcoOpen = kitcoHigh = kitcoLow = kitcoClose = goldClose;
      kitcoChange = null;
    }

    const row: FullTableRow = {};
    for (let j = 0; j < 60; j++) row[`col_${j}`] = null;

    row.col_12 = date;
    row.col_13 = kitcoOpen;
    row.col_14 = kitcoOpen;
    row.col_15 = kitcoOpen;
    row.col_16 = kitcoOpen;
    row.col_17 = kitcoOpen;
    row.col_18 = kitcoClose;
    row.col_19 = kitcoHigh;
    row.col_20 = kitcoLow;
    row.col_21 = kitcoChange;

    row.col_22 = oilOpen;
    row.col_23 = oilOpen;
    row.col_24 = oilOpen;
    row.col_25 = oilOpen;
    row.col_26 = oilOpen;
    row.col_27 = oilClose;
    row.col_28 = oilHigh;
    row.col_29 = oilLow;
    row.col_30 = oilChange;

    row.col_31 = dollarOpen;
    row.col_32 = dollarOpen;
    row.col_33 = dollarOpen;
    row.col_34 = dollarOpen;
    row.col_35 = dollarOpen;
    row.col_36 = dollarClose;
    row.col_37 = dollarHigh;
    row.col_38 = dollarLow;
    row.col_39 = dollarChange;

    row.col_40 = bondOpen;
    row.col_41 = bondOpen;
    row.col_42 = bondOpen;
    row.col_43 = bondOpen;
    row.col_44 = bondOpen;
    row.col_45 = bondClose;
    row.col_46 = bondHigh;
    row.col_47 = bondLow;
    row.col_48 = bondChange;

    row.col_49 = spOpen;
    row.col_50 = spOpen;
    row.col_51 = spOpen;
    row.col_52 = spOpen;
    row.col_53 = spOpen;
    row.col_54 = spClose;
    row.col_55 = spHigh;
    row.col_56 = spLow;
    row.col_57 = spChange;

    row.col_59 = vcb;
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

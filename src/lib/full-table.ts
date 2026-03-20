/**
 * Bảng 60 cột (col_0 .. col_59). Nguồn:
 * - col_1-10: Mua/Bán Mạnh Hải – bỏ tạm, xử lý sau (để null)
 * - col_12: DATE
 * - col_13-21: KITCO (XAU/USD) → investing / FreeGoldAPI
 * - col_22-30: Giá dầu → Investing.com crude-oil-historical-data (fallback Yahoo CL=F)
 * - col_31-39: Dollar index → Investing.com usdollar-historical-data (fallback Yahoo DX-Y.NYB)
 * - col_40-48: Trái phiếu US 10Y → investing.com
 * - col_49-57: S&P 500 → investing.com
 * - col_58..col_60: Tỷ giá VCB (Mua tiền mặt / Mua chuyển khoản / Bán)
 */

import { fetchGoldFromFreeGoldAPI } from "./gold";
import {
  fetchVietcombankUsdRatesByDate,
  type VietcombankUsdRates,
} from "./vietcombank";
import { fetchInvestingHistorical, PAIR_IDS, type OHLCRow } from "./investing";
import { fetchOilHistoricalYahoo } from "./oil";
import { fetchDollarIndexHistoricalYahoo } from "./dollar";
import { fetchXauUsdHistoricalYahoo } from "./xau";
import { fetchBond10yHistoricalYahoo } from "./bond-10y";
import { fetchSp500HistoricalYahoo } from "./sp500";
import { readManhHaiSnapshot, type ManhHaiSlot } from "./manh-hai";

const CONCURRENCY = 8;
export const START_DATE = "2022-01-01";
const LOOKBACK_DAYS_FOR_CHANGE = 10;

function addDaysIso(iso: string, deltaDays: number): string {
  const [y, m, d] = iso.split("-").map((x) => parseInt(x, 10));
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
  dt.setDate(dt.getDate() + deltaDays);
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

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

  // Fetch thêm vài ngày trước "from" để tính % thay đổi cho ngày đầu kỳ.
  const fetchFrom =
    from <= START_DATE
      ? START_DATE
      : addDaysIso(from, -LOOKBACK_DAYS_FOR_CHANGE) < START_DATE
        ? START_DATE
        : addDaysIso(from, -LOOKBACK_DAYS_FOR_CHANGE);
  const allDates = generateAllDates(fetchFrom, to);

  const [
    goldList,
    vcbRates,
    manhHaiSnapshots,
    oilYahoo,
    oilInvesting,
    dollarYahoo,
    dollarInvesting,
    bond,
    bondYahoo,
    xauUsd,
    xauUsdYahoo,
    sp500,
    sp500Yahoo,
  ] = await Promise.all([
    fetchGoldFromFreeGoldAPI(),
    // VCB theo ngày trong range (đủ cho 3 cột cuối)
    runInBatches(dates, (d) => fetchVietcombankUsdRatesByDate(d)),
    Promise.all(dates.map((d) => readManhHaiSnapshot(d))),
    // Market series: fetch theo window mở rộng để có prevClose cho ngày đầu kỳ
    fetchOilHistoricalYahoo(fetchFrom, to),
    fetchInvestingHistorical(PAIR_IDS.crudeOil, fetchFrom, to),
    fetchDollarIndexHistoricalYahoo(fetchFrom, to),
    fetchInvestingHistorical(PAIR_IDS.dollarIndex, fetchFrom, to),
    fetchInvestingHistorical(PAIR_IDS.us10yBond, fetchFrom, to),
    fetchBond10yHistoricalYahoo(fetchFrom, to),
    fetchInvestingHistorical(PAIR_IDS.xauUsd, fetchFrom, to),
    fetchXauUsdHistoricalYahoo(fetchFrom, to),
    fetchInvestingHistorical(PAIR_IDS.sp500, fetchFrom, to),
    fetchSp500HistoricalYahoo(fetchFrom, to),
  ]);

  // Ưu tiên Investing.com (crude-oil-historical-data, usdollar-historical-data), fallback Yahoo
  const oil = oilInvesting.length > 0 ? oilInvesting : oilYahoo;
  const dollar = dollarInvesting.length > 0 ? dollarInvesting : dollarYahoo;
  const bondData = bond.length > 0 ? bond : bondYahoo;
  const spData = sp500.length > 0 ? sp500 : sp500Yahoo;

  const goldByMonth = new Map<string, number>();
  for (const { date, price } of goldList) {
    const ym = date.slice(0, 7);
    if (!goldByMonth.has(ym)) goldByMonth.set(ym, price);
  }

  const byDate = (arr: OHLCRow[]): Map<string, OHLCRow> =>
    new Map(arr.map((r) => [r.date, r]));

  const oilMap = byDate(oil);
  const dollarMap = byDate(dollar);
  const bondMap = byDate(bondData);
  const xauMap = byDate(xauUsd);
  const xauYahooMap = byDate(xauUsdYahoo as unknown as OHLCRow[]);
  const spMap = byDate(spData);

  // Forward-fill missing market days (weekends/holidays) using last known value.
  let lastOil: OHLCRow | null = null;
  let lastDollar: OHLCRow | null = null;
  let lastBond: OHLCRow | null = null;
  let lastXau: OHLCRow | null = null;
  let lastSp: OHLCRow | null = null;

  const vcbByDate = new Map<string, VietcombankUsdRates>();
  for (let i = 0; i < dates.length; i++) vcbByDate.set(dates[i], vcbRates[i]);

  const manhHaiByDate = new Map<string, ReturnType<typeof readManhHaiSnapshot> extends Promise<infer T> ? T : never>();
  for (let i = 0; i < dates.length; i++) {
    const snap = manhHaiSnapshots[i] ?? null;
    if (snap?.date) manhHaiByDate.set(snap.date, snap);
  }

  const requestedSet = new Set(dates);
  const rows: FullTableRow[] = [];

  for (const date of allDates) {
    const oilRow = oilMap.get(date) ?? lastOil;
    const dollarRow = dollarMap.get(date) ?? lastDollar;
    const bondRow = bondMap.get(date) ?? lastBond;
    const xauRow = xauMap.get(date) ?? xauYahooMap.get(date) ?? lastXau;
    const spRow = spMap.get(date) ?? lastSp;

    if (oilMap.has(date)) lastOil = oilMap.get(date) ?? lastOil;
    if (dollarMap.has(date)) lastDollar = dollarMap.get(date) ?? lastDollar;
    if (bondMap.has(date)) lastBond = bondMap.get(date) ?? lastBond;
    if (xauMap.has(date) || xauYahooMap.has(date)) {
      lastXau = (xauMap.get(date) ?? xauYahooMap.get(date) ?? lastXau) ?? lastXau;
    }
    if (spMap.has(date)) lastSp = spMap.get(date) ?? lastSp;

    if (!requestedSet.has(date)) continue;

    const goldClose = goldByMonth.get(date.slice(0, 7)) ?? null;
    const vcb: VietcombankUsdRates | null = vcbByDate.get(date) ?? null;
    const manhHaiSnap = manhHaiByDate.get(date) ?? null;

    const slot = (s: ManhHaiSlot) => manhHaiSnap?.slots?.[s] ?? null;
    const buy09 = slot("09:00")?.buy ?? null;
    const buy11 = slot("11:00")?.buy ?? null;
    const buy1430 = slot("14:30")?.buy ?? null;
    const buy1730 = slot("17:30")?.buy ?? null;
    const sell09 = slot("09:00")?.sell ?? null;
    const sell11 = slot("11:00")?.sell ?? null;
    const sell1430 = slot("14:30")?.sell ?? null;
    const sell1730 = slot("17:30")?.sell ?? null;
    const buyDiff =
      buy09 != null && buy1730 != null ? buy1730 - buy09 : null;
    const sellDiff =
      sell09 != null && sell1730 != null ? sell1730 - sell09 : null;

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
    for (let j = 0; j < 61; j++) row[`col_${j}`] = null;
    // col_1..col_10 Mua/Bán Mạnh Hải – không fill data, xử lý sau

    row.col_1 = buy09;
    row.col_2 = buy11;
    row.col_3 = buy1430;
    row.col_4 = buy1730;
    row.col_5 = buyDiff;
    row.col_6 = sell09;
    row.col_7 = sell11;
    row.col_8 = sell1430;
    row.col_9 = sell1730;
    row.col_10 = sellDiff;

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

    row.col_58 = vcb?.buyCash ?? null;
    row.col_59 = vcb?.buyTransfer ?? null;
    row.col_60 = vcb?.sell ?? null;
    rows.push(row);
  }

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

/**
 * Bảng 61 trường index (col_0 .. col_60). Nguồn:
 * - col_1-10: Mua/Bán Mạnh Hải (file cache/manh-hai; nếu thiếu → backfill từ lịch sử CafeF từ ~2025-02-08, 1 giá/ngày × 4 khung giờ)
 * - col_12: DATE
 * - col_13-21: XAU/USD — Open/High/Low/%/Đóng (US) từ Investing daily; 9h–17h30 VN từ nến 1h (Yahoo, khớp mốc giờ VN)
 * - col_22-30: Dầu — daily **Yahoo BZ=F** (Brent, …); mốc VN 9h–17h30 = Yahoo 1h **chỉ khi có nến ngày cùng ngày** (tránh T7/CN có 1h nhưng không có dòng History)
 * - col_31-57: DXY, US10Y, S&P — daily Investing; mốc VN Yahoo 1h
 * - col_58..col_60: Tỷ giá VCB (Mua tiền mặt / Mua chuyển khoản / Bán)
 */

import {
  fetchVietcombankUsdRatesByDate,
  type VietcombankUsdRates,
} from "./vietcombank";
import {
  fetchInvestingHistorical,
  fetchInvestingXauUsd,
  PAIR_IDS,
  type OHLCRow,
} from "./investing";
import { fetchCafeFDomesticSjcByVnDateCached } from "./gold-cafef";
import { MANH_HAI_COL } from "./manh-hai-columns";
import {
  readManhHaiSnapshot,
  mergeManhHaiSnapshotWithCafeFBackfill,
  type ManhHaiSlot,
  type ManhHaiSnapshot,
} from "./manh-hai";
import {
  buildVnIntradaySlotMaps,
  fetchYahooOilDailyBrent,
  type MarketVnIntradaySlots,
} from "./intraday-vn-yahoo";

const CONCURRENCY = 8;
export const START_DATE = "2022-01-01";
const LOOKBACK_DAYS_FOR_CHANGE = 10;

/** Map ngày → 4 mốc VN; ngày không có nến → null → col fallback MỞ daily (không lặp giá ngày trước). */
type VnIntradaySlots = MarketVnIntradaySlots;

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
 * Liệt kê từng ngày [start, end] theo **lịch ISO** (YYYY-MM-DD).
 * Không dùng `new Date("YYYY-MM-DD")` (UTC) để tránh lệch tháng/ngày theo múi giờ server.
 */
export function generateAllDates(start: string, end?: string): string[] {
  const endIso = end ?? new Date().toISOString().slice(0, 10);
  const dates: string[] = [];
  const [sy, sm, sd] = start.split("-").map((x) => parseInt(x, 10));
  const [ey, em, ed] = endIso.split("-").map((x) => parseInt(x, 10));
  let cur = new Date(sy, (sm ?? 1) - 1, sd ?? 1);
  cur.setHours(0, 0, 0, 0);
  const endD = new Date(ey, (em ?? 1) - 1, ed ?? 1);
  endD.setHours(0, 0, 0, 0);
  while (cur <= endD) {
    const yyyy = cur.getFullYear();
    const mm = String(cur.getMonth() + 1).padStart(2, "0");
    const dd = String(cur.getDate()).padStart(2, "0");
    dates.push(`${yyyy}-${mm}-${dd}`);
    cur.setDate(cur.getDate() + 1);
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

/**
 * Chỉ tính lại % khi thiếu — giữ `changePercent` từ Investing (bảng historical/68) để khớp cột Change % trên web.
 */
function recomputeChangePercent(rows: OHLCRow[]): OHLCRow[] {
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  return sorted.map((r, i) => {
    if (r.changePercent != null && r.changePercent !== "") {
      return r;
    }
    const prevClose = i > 0 ? sorted[i - 1].close : null;
    const changePercent =
      prevClose != null && prevClose !== 0
        ? (((r.close - prevClose) / prevClose) * 100).toFixed(2) + "%"
        : null;
    return { ...r, changePercent };
  });
}

export type FullTableRow = Record<string, string | number | null>;

async function fetchOilDailyBrentYahooThenInvestingWti(
  fetchFrom: string,
  to: string,
): Promise<OHLCRow[]> {
  const yahoo = await fetchYahooOilDailyBrent(fetchFrom, to);
  if (yahoo.length > 0) return yahoo;
  return fetchInvestingHistorical(PAIR_IDS.crudeOil, fetchFrom, to);
}

/**
 * Điền col_1..col_10 từ snapshot Mạnh Hải (MUA/BÁN × 4 khung giờ + chênh lệch).
 * Dùng chung cho getFullTableRange và khi merge lại từ master/cache.
 */
export function applyManhHaiSnapshotToRow(
  row: FullTableRow,
  snapshot: ManhHaiSnapshot | null,
): void {
  const slot = (s: ManhHaiSlot) => snapshot?.slots?.[s] ?? null;
  const buy09 = slot("09:00")?.buy ?? null;
  const buy11 = slot("11:00")?.buy ?? null;
  const buy1430 = slot("14:30")?.buy ?? null;
  const buy1730 = slot("17:30")?.buy ?? null;
  const sell09 = slot("09:00")?.sell ?? null;
  const sell11 = slot("11:00")?.sell ?? null;
  const sell1430 = slot("14:30")?.sell ?? null;
  const sell1730 = slot("17:30")?.sell ?? null;
  const buyDiff = buy09 != null && buy1730 != null ? buy1730 - buy09 : null;
  const sellDiff =
    sell09 != null && sell1730 != null ? sell1730 - sell09 : null;

  row[`col_${MANH_HAI_COL.MUA_9H}`] = buy09;
  row[`col_${MANH_HAI_COL.MUA_11H}`] = buy11;
  row[`col_${MANH_HAI_COL.MUA_14H30}`] = buy1430;
  row[`col_${MANH_HAI_COL.MUA_17H30}`] = buy1730;
  row[`col_${MANH_HAI_COL.MUA_CHENH_LECH}`] = buyDiff;
  row[`col_${MANH_HAI_COL.BAN_9H}`] = sell09;
  row[`col_${MANH_HAI_COL.BAN_11H}`] = sell11;
  row[`col_${MANH_HAI_COL.BAN_14H30}`] = sell1430;
  row[`col_${MANH_HAI_COL.BAN_17H30}`] = sell1730;
  row[`col_${MANH_HAI_COL.BAN_CHENH_LECH}`] = sellDiff;
}

/**
 * OHLC Investing đã có sẵn (từ máy local / file JSON) — bỏ qua fetch từng mã tương ứng.
 * Dùng cho pipeline: trình duyệt lấy JSON → script gọi `getFullTableRange` + merge master.
 */
export type GetFullTableInvestingOhlcOverride = {
  xauUsd?: OHLCRow[];
  crudeOil?: OHLCRow[];
  dollarIndex?: OHLCRow[];
  us10yBond?: OHLCRow[];
  sp500?: OHLCRow[];
};

export type GetFullTableRangeOptions = {
  investingOhlc?: GetFullTableInvestingOhlcOverride;
};

/**
 * Lấy bảng đầy đủ cột cho khoảng ngày [from, to].
 */
export async function getFullTableRange(
  from: string,
  to: string,
  options?: GetFullTableRangeOptions,
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

  const inj = options?.investingOhlc;

  const [
    vcbRates,
    fileManhHaiSnaps,
    cafeDomesticByDate,
    oilInvesting,
    dollarInvesting,
    bondInvesting,
    xauUsd,
    sp500Investing,
    vnSlotMaps,
  ] = await Promise.all([
    // VCB theo ngày trong range (đủ cho 3 cột cuối)
    runInBatches(dates, (d) => fetchVietcombankUsdRatesByDate(d)),
    Promise.all(dates.map((d) => readManhHaiSnapshot(d))),
    fetchCafeFDomesticSjcByVnDateCached(),
    inj?.crudeOil != null
      ? Promise.resolve(inj.crudeOil)
      : fetchOilDailyBrentYahooThenInvestingWti(fetchFrom, to),
    inj?.dollarIndex != null
      ? Promise.resolve(inj.dollarIndex)
      : fetchInvestingHistorical(PAIR_IDS.dollarIndex, fetchFrom, to),
    inj?.us10yBond != null
      ? Promise.resolve(inj.us10yBond)
      : fetchInvestingHistorical(PAIR_IDS.us10yBond, fetchFrom, to),
    inj?.xauUsd != null
      ? Promise.resolve(inj.xauUsd)
      : fetchInvestingXauUsd(fetchFrom, to),
    inj?.sp500 != null
      ? Promise.resolve(inj.sp500)
      : fetchInvestingHistorical(PAIR_IDS.sp500, fetchFrom, to),
    buildVnIntradaySlotMaps(fetchFrom, to, allDates),
  ]);

  const manhHaiSnapshots = dates.map((d, i) =>
    mergeManhHaiSnapshotWithCafeFBackfill(
      d,
      fileManhHaiSnaps[i],
      cafeDomesticByDate,
    ),
  );

  const goldVnSlots = vnSlotMaps.xau;
  const oilVnSlots = vnSlotMaps.oil;
  const dollarVnSlots = vnSlotMaps.dollar;
  const bondVnSlots = vnSlotMaps.bond;
  const spVnSlots = vnSlotMaps.sp;

  const oil = recomputeChangePercent(oilInvesting);
  const dollar = recomputeChangePercent(dollarInvesting);
  const bondData = recomputeChangePercent(bondInvesting);
  const xauCombined = recomputeChangePercent(xauUsd);
  const spData = recomputeChangePercent(sp500Investing);

  const byDate = (arr: OHLCRow[]): Map<string, OHLCRow> =>
    new Map(arr.map((r) => [r.date, r]));

  const oilMap = byDate(oil);
  const dollarMap = byDate(dollar);
  const bondMap = byDate(bondData);
  const xauMap = byDate(xauCombined);
  const spMap = byDate(spData);

  const vcbByDate = new Map<string, VietcombankUsdRates>();
  for (let i = 0; i < dates.length; i++) vcbByDate.set(dates[i], vcbRates[i]);

  const manhHaiByDate = new Map<
    string,
    ReturnType<typeof readManhHaiSnapshot> extends Promise<infer T> ? T : never
  >();
  for (let i = 0; i < dates.length; i++) {
    const snap = manhHaiSnapshots[i] ?? null;
    if (snap?.date) manhHaiByDate.set(snap.date, snap);
  }

  const requestedSet = new Set(dates);
  const rows: FullTableRow[] = [];

  for (const date of allDates) {
    const oilRow = oilMap.get(date) ?? null;
    const dollarRow = dollarMap.get(date) ?? null;
    const bondRow = bondMap.get(date) ?? null;
    const xauRow = xauMap.get(date) ?? null;
    const spRow = spMap.get(date) ?? null;

    if (!requestedSet.has(date)) continue;

    const vcb: VietcombankUsdRates | null = vcbByDate.get(date) ?? null;
    const manhHaiSnap = manhHaiByDate.get(date) ?? null;

    const [oilOpen, oilHigh, oilLow, oilClose, oilChange] = ohlcToCols(oilRow);
    const [dollarOpen, dollarHigh, dollarLow, dollarClose, dollarChange] =
      ohlcToCols(dollarRow);
    const [bondOpen, bondHigh, bondLow, bondClose, bondChange] =
      ohlcToCols(bondRow);
    const [spOpen, spHigh, spLow, spClose, spChange] = ohlcToCols(spRow);

    const xauOpen: number | null = xauRow?.open ?? null;
    const xauHigh: number | null = xauRow?.high ?? null;
    const xauLow: number | null = xauRow?.low ?? null;
    const xauClose: number | null = xauRow?.close ?? null;
    const xauChange: string | null = xauRow?.changePercent ?? null;

    const vnSl = goldVnSlots.get(date);
    const fb = xauOpen;
    const k14 = vnSl?.col14 ?? fb;
    const k15 = vnSl?.col15 ?? fb;
    const k16 = vnSl?.col16 ?? fb;
    const k17 = vnSl?.col17 ?? fb;

    const oilSl = oilVnSlots.get(date);
    const oilFb = oilOpen;
    const hasOilDaily = oilRow != null;
    const o23 = hasOilDaily ? (oilSl?.col14 ?? oilFb) : null;
    const o24 = hasOilDaily ? (oilSl?.col15 ?? oilFb) : null;
    const o25 = hasOilDaily ? (oilSl?.col16 ?? oilFb) : null;
    const o26 = hasOilDaily ? (oilSl?.col17 ?? oilFb) : null;

    const dollarSl = dollarVnSlots.get(date);
    const dollarFb = dollarOpen;
    const d32 = dollarSl?.col14 ?? dollarFb;
    const d33 = dollarSl?.col15 ?? dollarFb;
    const d34 = dollarSl?.col16 ?? dollarFb;
    const d35 = dollarSl?.col17 ?? dollarFb;

    const bondSl = bondVnSlots.get(date);
    const bondFb = bondOpen;
    const b41 = bondSl?.col14 ?? bondFb;
    const b42 = bondSl?.col15 ?? bondFb;
    const b43 = bondSl?.col16 ?? bondFb;
    const b44 = bondSl?.col17 ?? bondFb;

    const spSl = spVnSlots.get(date);
    const spFb = spOpen;
    const s50 = spSl?.col14 ?? spFb;
    const s51 = spSl?.col15 ?? spFb;
    const s52 = spSl?.col16 ?? spFb;
    const s53 = spSl?.col17 ?? spFb;

    const row: FullTableRow = {};
    for (let j = 0; j < 61; j++) row[`col_${j}`] = null;
    applyManhHaiSnapshotToRow(row, manhHaiSnap);

    row.col_12 = date;
    row.col_13 = xauOpen;
    row.col_14 = k14;
    row.col_15 = k15;
    row.col_16 = k16;
    row.col_17 = k17;
    row.col_18 = xauClose;
    row.col_19 = xauHigh;
    row.col_20 = xauLow;
    row.col_21 = xauChange;

    row.col_22 = oilOpen;
    row.col_23 = o23;
    row.col_24 = o24;
    row.col_25 = o25;
    row.col_26 = o26;
    row.col_27 = oilClose;
    row.col_28 = oilHigh;
    row.col_29 = oilLow;
    row.col_30 = oilChange;

    row.col_31 = dollarOpen;
    row.col_32 = d32;
    row.col_33 = d33;
    row.col_34 = d34;
    row.col_35 = d35;
    row.col_36 = dollarClose;
    row.col_37 = dollarHigh;
    row.col_38 = dollarLow;
    row.col_39 = dollarChange;

    row.col_40 = bondOpen;
    row.col_41 = b41;
    row.col_42 = b42;
    row.col_43 = b43;
    row.col_44 = b44;
    row.col_45 = bondClose;
    row.col_46 = bondHigh;
    row.col_47 = bondLow;
    row.col_48 = bondChange;

    row.col_49 = spOpen;
    row.col_50 = s50;
    row.col_51 = s51;
    row.col_52 = s52;
    row.col_53 = s53;
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

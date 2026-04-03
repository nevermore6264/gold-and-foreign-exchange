/**
 * Lấy dữ liệu historical từ Investing.com (API không chính thức).
 * Nguồn: crude oil, dollar index, US 10Y bond, XAU/USD, S&P 500.
 * Pair IDs tham khảo từ trang investing.com (có thể thay đổi).
 */

const INVESTING_API = "https://api.investing.com/api/financialdata";

/** Không dùng Data Cache Next (trước đây revalidate 86400 → trùng URL có thể sai so với trang Investing cả ngày). */
const INVESTING_FETCH_INIT: RequestInit = { cache: "no-store" };

const DEFAULT_HEADERS: HeadersInit = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
  Referer: "https://www.investing.com/",
  Origin: "https://www.investing.com",
  Accept: "application/json",
  "Accept-Language": "en-US,en;q=0.9",
};

/** Bắt buộc cho `/historical/{id}` — không có hay bị 403 / Cloudflare challenge. */
const HISTORICAL_TABLE_HEADERS: HeadersInit = {
  ...DEFAULT_HEADERS,
  "domain-id": "www",
};

/**
 * Pair IDs từ trang investing.com (tham số cid trong URL).
 * Crude Oil WTI: https://www.investing.com/commodities/crude-oil-historical-data?cid=1178037 (CLc1 CME)
 * US Dollar Index: https://www.investing.com/indices/usdollar-historical-data (DXY, cid=1224074)
 * XAU/USD chart (fallback): cid 8830 — `/8830/historical/chart?...`
 * XAU/USD bảng historical (ưu tiên): instrument_id **68** — `/historical/68?start-date&end-date&time-frame=Daily`
 */
export const PAIR_IDS = {
  crudeOil: 1178037,
  dollarIndex: 1224074,
  us10yBond: 23705,
  /** Chart API — dùng khi historical table không trả dữ liệu */
  xauUsd: 8830,
  sp500: 166,
} as const;

/** Cùng id với request trên trang XAU/USD historical (instrument_id). */
export const XAU_USD_HISTORICAL_INSTRUMENT_ID = 68;

export interface OHLCRow {
  date: string; // YYYY-MM-DD
  open: number;
  high: number;
  low: number;
  close: number;
  changePercent: string | null;
}

interface InvestingChartPoint {
  date?: number;
  price_open?: number;
  price_high?: number;
  price_low?: number;
  price_close?: number;
}

/** Một dòng từ `GET .../historical/{instrumentId}?...&time-frame=Daily` */
interface InvestingHistoricalTableRow {
  rowDateTimestamp?: string;
  last_openRaw?: string | number;
  last_maxRaw?: string | number;
  last_minRaw?: string | number;
  last_closeRaw?: string | number;
  change_precentRaw?: number;
}

function parseInvestingNum(raw: unknown): number {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") {
    const n = parseFloat(raw);
    return Number.isFinite(n) ? n : NaN;
  }
  return NaN;
}

/**
 * Bảng daily đúng như UI historical (Open/High/Low/Price/Change %).
 * VD: `/api/financialdata/historical/68?start-date=2026-03-02&end-date=2026-04-02&time-frame=Daily&add-missing-rows=false`
 */
export async function fetchInvestingHistoricalDailyTable(
  instrumentId: number,
  fromDate: string,
  toDate: string,
): Promise<OHLCRow[]> {
  try {
    const qs = new URLSearchParams({
      "start-date": fromDate,
      "end-date": toDate,
      "time-frame": "Daily",
      "add-missing-rows": "false",
    });
    const url = `${INVESTING_API}/historical/${instrumentId}?${qs}`;
    const res = await fetch(url, {
      ...INVESTING_FETCH_INIT,
      headers: HISTORICAL_TABLE_HEADERS,
    });
    if (!res.ok) return [];
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("application/json")) return [];
    const json = (await res.json()) as { data?: InvestingHistoricalTableRow[] };
    const list = json?.data ?? [];
    const rows: OHLCRow[] = [];
    for (const r of list) {
      const ts = r.rowDateTimestamp;
      const dateStr =
        typeof ts === "string" && ts.length >= 10 ? ts.slice(0, 10) : null;
      if (!dateStr || dateStr < fromDate || dateStr > toDate) continue;
      const open = parseInvestingNum(r.last_openRaw);
      const high = parseInvestingNum(r.last_maxRaw);
      const low = parseInvestingNum(r.last_minRaw);
      const close = parseInvestingNum(r.last_closeRaw);
      if (![open, high, low, close].every((n) => Number.isFinite(n))) continue;
      const ch = r.change_precentRaw;
      const changePercent =
        typeof ch === "number" && Number.isFinite(ch)
          ? `${ch.toFixed(2)}%`
          : null;
      rows.push({ date: dateStr, open, high, low, close, changePercent });
    }
    rows.sort((a, b) => a.date.localeCompare(b.date));
    return rows;
  } catch {
    return [];
  }
}

/**
 * XAU/USD: ưu tiên historical table (id 68), fallback chart cid 8830.
 */
export async function fetchInvestingXauUsd(
  fromDate: string,
  toDate: string,
): Promise<OHLCRow[]> {
  const table = await fetchInvestingHistoricalDailyTable(
    XAU_USD_HISTORICAL_INSTRUMENT_ID,
    fromDate,
    toDate,
  );
  if (table.length > 0) return table;
  return fetchInvestingHistorical(PAIR_IDS.xauUsd, fromDate, toDate);
}

/**
 * Gọi API historical chart của Investing.com.
 * Trả về mảng OHLC theo ngày; thất bại thì trả về [].
 */
export async function fetchInvestingHistorical(
  pairId: number,
  fromDate: string,
  toDate: string,
): Promise<OHLCRow[]> {
  try {
    // pointscount: ~10 năm ngày giao dịch > 2000 — tăng để không mất các ngày gần nhất (vd. tháng hiện tại).
    const url = `${INVESTING_API}/${pairId}/historical/chart?period=P10Y&interval=P1D&pointscount=12000`;
    const res = await fetch(url, {
      ...INVESTING_FETCH_INIT,
      headers: DEFAULT_HEADERS,
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { data?: InvestingChartPoint[] };
    const points = [...(data?.data ?? [])].sort(
      (a, b) => (a.date ?? 0) - (b.date ?? 0),
    );

    const byDay = new Map<string, Omit<OHLCRow, "changePercent">>();
    for (const p of points) {
      const ts = p.date;
      if (ts == null) continue;
      const d = new Date(ts * 1000);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      const dateStr = `${yyyy}-${mm}-${dd}`;
      if (dateStr < fromDate || dateStr > toDate) continue;
      const open = p.price_open ?? p.price_close ?? 0;
      const high = p.price_high ?? p.price_close ?? open;
      const low = p.price_low ?? p.price_close ?? open;
      const close = p.price_close ?? open;
      byDay.set(dateStr, { date: dateStr, open, high, low, close });
    }

    const sortedDates = [...byDay.keys()].sort((a, b) => a.localeCompare(b));
    const rows: OHLCRow[] = [];
    for (const dateStr of sortedDates) {
      const row = byDay.get(dateStr)!;
      const prevClose = rows.length > 0 ? rows[rows.length - 1].close : row.close;
      const changePercent =
        prevClose && prevClose !== 0
          ? (((row.close - prevClose) / prevClose) * 100).toFixed(2) + "%"
          : null;
      rows.push({
        ...row,
        changePercent,
      });
    }
    return rows;
  } catch {
    return [];
  }
}

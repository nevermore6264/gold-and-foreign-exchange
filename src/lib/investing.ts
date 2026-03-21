/**
 * Lấy dữ liệu historical từ Investing.com (API không chính thức).
 * Nguồn: crude oil, dollar index, US 10Y bond, XAU/USD, S&P 500.
 * Pair IDs tham khảo từ trang investing.com (có thể thay đổi).
 */

const INVESTING_API = "https://api.investing.com/api/financialdata";
const DEFAULT_HEADERS: HeadersInit = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Referer: "https://www.investing.com/",
  Origin: "https://www.investing.com",
  Accept: "application/json",
  "Accept-Language": "en-US,en;q=0.9",
};

/**
 * Pair IDs từ trang investing.com (tham số cid trong URL).
 * Crude Oil WTI: https://www.investing.com/commodities/crude-oil-historical-data?cid=1178037 (CLc1 CME)
 * US Dollar Index: https://www.investing.com/indices/usdollar-historical-data (DXY, cid=1224074)
 */
export const PAIR_IDS = {
  crudeOil: 1178037,
  dollarIndex: 1224074,
  us10yBond: 23705,
  xauUsd: 8830,
  sp500: 166,
} as const;

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
      next: { revalidate: 86400 },
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

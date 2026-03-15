/**
 * Giá dầu WTI (Crude Oil) – lấy từ Yahoo Finance (symbol CL=F).
 * Dùng thay Investing.com khi API Investing bị chặn.
 */

import YahooFinance from "yahoo-finance2";

const WTI_SYMBOL = "CL=F";

export interface OHLCRow {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  changePercent: string | null;
}

/**
 * Lấy dữ liệu giá dầu WTI historical theo khoảng ngày.
 * Trả về mảng OHLC (open, high, low, close) + % thay đổi so ngày trước.
 */
export async function fetchOilHistoricalYahoo(
  fromDate: string,
  toDate: string,
): Promise<OHLCRow[]> {
  try {
    const yahooFinance = new YahooFinance();
    const result = await yahooFinance.historical(WTI_SYMBOL, {
      period1: fromDate,
      period2: toDate,
      interval: "1d",
      events: "history",
    });

    if (!result || !Array.isArray(result)) return [];

    const list = result as Array<{
      date: Date;
      open: number;
      high: number;
      low: number;
      close: number;
    }>;

    const sorted = [...list].sort((a, b) => {
      const tA = a.date instanceof Date ? a.date.getTime() : new Date(String(a.date)).getTime();
      const tB = b.date instanceof Date ? b.date.getTime() : new Date(String(b.date)).getTime();
      return tA - tB;
    });

    const rows: OHLCRow[] = [];
    for (let i = 0; i < sorted.length; i++) {
      const d = sorted[i];
      const dateStr =
        d.date instanceof Date
          ? d.date.toISOString().slice(0, 10)
          : String(d.date).slice(0, 10);
      if (dateStr < fromDate || dateStr > toDate) continue;

      const open = d.open ?? d.close ?? 0;
      const high = d.high ?? d.close ?? open;
      const low = d.low ?? d.close ?? open;
      const close = d.close ?? open;

      const prevClose = i >= 1 ? sorted[i - 1].close : null;
      const changePercent =
        prevClose != null && prevClose !== 0
          ? (((close - prevClose) / prevClose) * 100).toFixed(2) + "%"
          : null;

      rows.push({
        date: dateStr,
        open,
        high,
        low,
        close,
        changePercent,
      });
    }

    return rows;
  } catch {
    return [];
  }
}

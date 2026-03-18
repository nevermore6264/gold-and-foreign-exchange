/**
 * XAU/USD (Gold) historical - fallback khi Investing.com bị chặn.
 * Dùng Yahoo Finance để có OHLC + change%.
 */

import YahooFinance from "yahoo-finance2";

export interface OHLCRow {
  date: string; // YYYY-MM-DD
  open: number;
  high: number;
  low: number;
  close: number;
  changePercent: string | null;
}

// Gold futures (Yahoo) - có historical tốt hơn XAUUSD=X ở nhiều giai đoạn
const XAUUSD_SYMBOL = "GC=F";

export async function fetchXauUsdHistoricalYahoo(
  fromDate: string,
  toDate: string,
): Promise<OHLCRow[]> {
  try {
    const yahooFinance = new YahooFinance();
    const result = await yahooFinance.historical(XAUUSD_SYMBOL, {
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

    const sorted = [...list].sort((a, b) => a.date.getTime() - b.date.getTime());

    const rows: OHLCRow[] = [];
    for (let i = 0; i < sorted.length; i++) {
      const d = sorted[i];
      const yyyy = d.date.getFullYear();
      const mm = String(d.date.getMonth() + 1).padStart(2, "0");
      const dd = String(d.date.getDate()).padStart(2, "0");
      const dateStr = `${yyyy}-${mm}-${dd}`;
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


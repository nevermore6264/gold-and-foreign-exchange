/**
 * Trái phiếu US 10Y (10-year yield) – fallback lấy từ Yahoo Finance khi Investing bị chặn.
 * Yahoo symbol: ^TNX (10Y yield, thường là % * 10). Chúng ta scale về % bằng cách chia 10.
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

const TNX_SYMBOL = "^TNX";
const SCALE = 10; // ^TNX is in percent*10

function toLocalDateStr(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export async function fetchBond10yHistoricalYahoo(
  fromDate: string,
  toDate: string,
): Promise<OHLCRow[]> {
  try {
    const yahooFinance = new YahooFinance();
    const result = await yahooFinance.historical(TNX_SYMBOL, {
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
      const dateStr = toLocalDateStr(d.date);
      if (dateStr < fromDate || dateStr > toDate) continue;

      const open = (d.open ?? d.close ?? 0) / SCALE;
      const high = (d.high ?? d.close ?? open * SCALE) / SCALE;
      const low = (d.low ?? d.close ?? open * SCALE) / SCALE;
      const close = (d.close ?? d.open ?? 0) / SCALE;

      const prevClose = i >= 1 ? sorted[i - 1].close / SCALE : null;
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


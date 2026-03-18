/**
 * S&P 500 historical – fallback lấy từ Yahoo Finance khi Investing bị chặn.
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

const SP500_SYMBOL = "^GSPC";

function toLocalDateStr(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export async function fetchSp500HistoricalYahoo(
  fromDate: string,
  toDate: string,
): Promise<OHLCRow[]> {
  try {
    const yahooFinance = new YahooFinance();
    const result = await yahooFinance.historical(SP500_SYMBOL, {
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


/**
 * US Dollar Index – lấy từ Yahoo Finance (symbol DX-Y.NYB).
 * Dùng thay Investing.com khi API Investing bị chặn.
 */

import YahooFinance from "yahoo-finance2";

const DOLLAR_INDEX_SYMBOL = "DX-Y.NYB";

const yahooOptions: ConstructorParameters<typeof YahooFinance>[0] = {
  suppressNotices: ["yahooSurvey", "ripHistorical"],
};

export interface OHLCRow {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  changePercent: string | null;
}

type YahooBar = {
  date: Date;
  open?: number | null;
  high?: number | null;
  low?: number | null;
  close?: number | null;
};

function buildRowsFromBars(
  list: YahooBar[],
  fromDate: string,
  toDate: string,
): OHLCRow[] {
  const sorted = [...list].sort((a, b) => {
    const tA =
      a.date instanceof Date
        ? a.date.getTime()
        : new Date(String(a.date)).getTime();
    const tB =
      b.date instanceof Date
        ? b.date.getTime()
        : new Date(String(b.date)).getTime();
    return tA - tB;
  });

  const rows: OHLCRow[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const d = sorted[i];
    const dateStr =
      d.date instanceof Date
        ? `${d.date.getFullYear()}-${String(d.date.getMonth() + 1).padStart(2, "0")}-${String(d.date.getDate()).padStart(2, "0")}`
        : String(d.date).slice(0, 10);
    if (dateStr < fromDate || dateStr > toDate) continue;

    const open = Number(d.open ?? d.close ?? 0);
    const high = Number(d.high ?? d.close ?? open);
    const low = Number(d.low ?? d.close ?? open);
    const close = Number(d.close ?? open);

    const prevClose = i >= 1 ? sorted[i - 1].close : null;
    const changePercent =
      prevClose != null &&
      typeof prevClose === "number" &&
      Number.isFinite(prevClose) &&
      prevClose !== 0
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
}

async function fetchYahooDailyBars(
  yahooFinance: InstanceType<typeof YahooFinance>,
  fromDate: string,
  toDate: string,
): Promise<YahooBar[]> {
  try {
    const result = await yahooFinance.historical(DOLLAR_INDEX_SYMBOL, {
      period1: fromDate,
      period2: toDate,
      interval: "1d",
      events: "history",
    });
    if (Array.isArray(result) && result.length > 0) {
      return result as YahooBar[];
    }
  } catch {
    /* thử chart */
  }

  try {
    const ch = await yahooFinance.chart(DOLLAR_INDEX_SYMBOL, {
      period1: fromDate,
      period2: toDate,
      interval: "1d",
    });
    const quotes = ch?.quotes;
    if (Array.isArray(quotes) && quotes.length > 0) {
      return quotes as YahooBar[];
    }
  } catch {
    /* empty */
  }

  return [];
}

/**
 * Lấy dữ liệu Dollar Index historical theo khoảng ngày.
 * Trả về mảng OHLC + % thay đổi so ngày trước.
 */
export async function fetchDollarIndexHistoricalYahoo(
  fromDate: string,
  toDate: string,
): Promise<OHLCRow[]> {
  try {
    const yahooFinance = new YahooFinance({ ...yahooOptions });
    const list = await fetchYahooDailyBars(yahooFinance, fromDate, toDate);
    if (list.length === 0) return [];
    return buildRowsFromBars(list, fromDate, toDate);
  } catch {
    return [];
  }
}

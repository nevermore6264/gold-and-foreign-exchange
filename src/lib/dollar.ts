/**
 * US Dollar Index – lấy từ Yahoo Finance (symbol DX-Y.NYB).
 * Dùng thay Investing.com khi API Investing bị chặn.
 *
 * Ngày nến 1D gán theo lịch Asia/Ho_Chi_Minh để khớp cột ngày (col_12) và UI VN,
 * tránh lệch ngày so với múi giờ UTC trên server.
 */

import YahooFinance from "yahoo-finance2";

const DOLLAR_INDEX_SYMBOL = "DX-Y.NYB";

/** Khớp lịch ngày trong bảng (client/server thường lấy theo ngày dương VN). */
const DOLLAR_CALENDAR_TZ = "Asia/Ho_Chi_Minh";

const yahooOptions: ConstructorParameters<typeof YahooFinance>[0] = {
  suppressNotices: ["yahooSurvey", "ripHistorical"],
};

/** Yahoo chart/historical đôi khi cắt gói nếu range quá dài — tải từng đoạn. */
const FETCH_CHUNK_DAYS = 220;

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

function addDaysIso(iso: string, deltaDays: number): string {
  const [y, m, d] = iso.split("-").map((x) => parseInt(x, 10));
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
  dt.setDate(dt.getDate() + deltaDays);
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function isoCalendarDayInTz(d: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const y = parts.find((p) => p.type === "year")?.value ?? "1970";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const day = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${y}-${m}-${day}`;
}

function barHasUsableClose(b: YahooBar): boolean {
  const c = b.close;
  return typeof c === "number" && Number.isFinite(c);
}

/** Gộp nhiều nến trùng cùng một ngày (lịch VN): giữ bản có close hợp lệ. */
function dedupeBarsByCalendarDay(bars: YahooBar[]): YahooBar[] {
  const map = new Map<string, YahooBar>();
  for (const b of bars) {
    if (!(b.date instanceof Date) || Number.isNaN(b.date.getTime())) continue;
    const key = isoCalendarDayInTz(b.date, DOLLAR_CALENDAR_TZ);
    const prev = map.get(key);
    if (!prev) {
      map.set(key, b);
      continue;
    }
    const goodP = barHasUsableClose(prev);
    const goodB = barHasUsableClose(b);
    if (goodB && !goodP) map.set(key, b);
  }
  return [...map.values()].sort((a, b) => a.date.getTime() - b.date.getTime());
}

async function fetchYahooBarsOneWindow(
  yahooFinance: InstanceType<typeof YahooFinance>,
  period1: string,
  period2: string,
  sink: YahooBar[],
): Promise<void> {
  try {
    const result = await yahooFinance.historical(DOLLAR_INDEX_SYMBOL, {
      period1,
      period2,
      interval: "1d",
      events: "history",
    });
    if (Array.isArray(result) && result.length > 0) {
      sink.push(...(result as YahooBar[]));
    }
  } catch {
    /* thử chart */
  }

  try {
    const ch = await yahooFinance.chart(DOLLAR_INDEX_SYMBOL, {
      period1,
      period2,
      interval: "1d",
    });
    const quotes = ch?.quotes;
    if (Array.isArray(quotes) && quotes.length > 0) {
      sink.push(...(quotes as YahooBar[]));
    }
  } catch {
    /* bỏ qua */
  }
}

async function fetchYahooDailyBars(
  yahooFinance: InstanceType<typeof YahooFinance>,
  fromDate: string,
  toDate: string,
): Promise<YahooBar[]> {
  if (fromDate > toDate) return [];

  const sink: YahooBar[] = [];
  let cur = fromDate;

  while (cur <= toDate) {
    const chunkEnd = addDaysIso(cur, FETCH_CHUNK_DAYS - 1);
    const period2 = chunkEnd > toDate ? toDate : chunkEnd;
    await fetchYahooBarsOneWindow(yahooFinance, cur, period2, sink);
    const next = addDaysIso(period2, 1);
    if (next <= cur) break;
    cur = next;
  }

  return dedupeBarsByCalendarDay(sink);
}

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
    if (!(d.date instanceof Date)) continue;

    const dateStr = isoCalendarDayInTz(d.date, DOLLAR_CALENDAR_TZ);
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

/**
 * Lấy dữ liệu Dollar Index historical theo khoảng ngày.
 * Trả về mảng OHLC + % thay đổi so ngày trước (theo lịch VN).
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

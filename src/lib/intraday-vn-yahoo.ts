/**
 * Cột 9h / 11h / 14h30 / 17h30 (giờ VN): lấy giá từ nến 1h (đóng nến vừa xong trước mốc giờ).
 * Dầu: Yahoo **BZ=F** (Brent) — cùng ticker với lịch sử trên finance.yahoo.com/quote/BZ=F/history.
 * OHLC ngày: dầu BZ=F; DXY DX-Y.NYB; US10Y ^TNX; S&P ^GSPC — mỗi mã + fallback Investing tương ứng trong full-table.
 */

import type { OHLCRow } from "./investing";

export type MarketVnIntradaySlots = {
  col14: number | null;
  col15: number | null;
  col16: number | null;
  col17: number | null;
};

/** Mốc theo giờ wall-clock Việt Nam (UTC+7, không DST). */
const VN_SLOTS = [
  { h: 9, m: 0 },
  { h: 11, m: 0 },
  { h: 14, m: 30 },
  { h: 17, m: 30 },
] as const;

/** Ticker Yahoo ~ tương ứng từng thị trường (1h). Dầu = Brent BZ=F (không dùng CL=F WTI). */
export const YAHOO_INTRADAY_BY_MARKET = {
  xau: "XAUUSD=X",
  oil: "BZ=F",
  dollar: "DX-Y.NYB",
  bond: "^TNX",
  sp: "^GSPC",
} as const;

type YahooHourBar = { t: number; c: number };

/** Yahoo ~730 ngày / lần với interval 1h — giảm số request khi tải dài. */
const CHUNK_DAYS = 720;
const BAR_SEC = 3600;
const YAHOO_FETCH: RequestInit = {
  cache: "no-store",
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    Accept: "application/json",
  },
};

function vnWallTimeToUnixSec(iso: string, hour: number, minute: number): number {
  const [y, mo, d] = iso.split("-").map((x) => parseInt(x, 10));
  const ys = String(y);
  const ms = String(mo).padStart(2, "0");
  const ds = String(d).padStart(2, "0");
  const hs = String(hour).padStart(2, "0");
  const mins = String(minute).padStart(2, "0");
  const s = `${ys}-${ms}-${ds}T${hs}:${mins}:00+07:00`;
  return Math.floor(new Date(s).getTime() / 1000);
}

function isoStartOfRangeUnix(iso: string): number {
  return vnWallTimeToUnixSec(iso, 0, 0);
}

function isoEndOfRangeUnix(iso: string): number {
  return vnWallTimeToUnixSec(iso, 23, 59) + 60;
}

/** Ngày YYYY-MM-DD của `ts` (giây Unix) theo múi giờ phiên (vd. BZ=F dùng ET như Yahoo History). */
function isoDateInTimeZone(tsSec: number, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(tsSec * 1000));
  const y = parts.find((p) => p.type === "year")?.value ?? "1970";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const d = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${y}-${m}-${d}`;
}

function padIsoParts(iso: string): { y: number; m: number; d: number } {
  const [y, mo, d] = iso.split("-").map((x) => parseInt(x, 10));
  return { y, m: mo, d };
}

function addCalendarDaysIso(iso: string, delta: number): string {
  const { y, m, d } = padIsoParts(iso);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + delta);
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

async function fetchYahooHourlyChunk(
  symbol: string,
  period1: number,
  period2: number,
): Promise<YahooHourBar[]> {
  const enc = encodeURIComponent(symbol);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${enc}?period1=${period1}&period2=${period2}&interval=1h`;
  try {
    const res = await fetch(url, YAHOO_FETCH);
    if (!res.ok) return [];
    const json = (await res.json()) as {
      chart?: {
        result?: Array<{
          timestamp?: number[];
          indicators?: { quote?: Array<{ close?: Array<number | null> }> };
        }>;
        error?: unknown;
      };
    };
    const r0 = json?.chart?.result?.[0];
    const ts = r0?.timestamp ?? [];
    const closes = r0?.indicators?.quote?.[0]?.close ?? [];
    const out: YahooHourBar[] = [];
    for (let i = 0; i < ts.length; i++) {
      const t = ts[i];
      const c = closes[i];
      if (t == null || c == null || !Number.isFinite(c)) continue;
      out.push({ t, c });
    }
    out.sort((a, b) => a.t - b.t);
    return out;
  } catch {
    return [];
  }
}

async function fetchYahooHourlyMerged(
  symbol: string,
  fromIso: string,
  toIso: string,
): Promise<YahooHourBar[]> {
  const start = isoStartOfRangeUnix(fromIso);
  const end = isoEndOfRangeUnix(toIso);
  const byT = new Map<number, number>();
  let chunkStart = start;
  const step = CHUNK_DAYS * 24 * 3600;
  while (chunkStart < end) {
    const chunkEnd = Math.min(chunkStart + step, end);
    const bars = await fetchYahooHourlyChunk(symbol, chunkStart, chunkEnd);
    for (const b of bars) byT.set(b.t, b.c);
    chunkStart = chunkEnd;
  }
  return [...byT.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([t, c]) => ({ t, c }));
}

function closeOfLastCompletedBarBefore(
  bars: YahooHourBar[],
  targetSec: number,
): number | null {
  let best: YahooHourBar | null = null;
  for (const b of bars) {
    const barEnd = b.t + BAR_SEC;
    if (barEnd <= targetSec && (!best || b.t > best.t)) best = b;
  }
  return best?.c ?? null;
}

function buildRawSlotMapForTicker(
  bars: YahooHourBar[],
  dates: string[],
): Map<string, MarketVnIntradaySlots> {
  const map = new Map<string, MarketVnIntradaySlots>();
  for (const iso of dates) {
    const slots: MarketVnIntradaySlots = {
      col14: null,
      col15: null,
      col16: null,
      col17: null,
    };
    const keys: (keyof MarketVnIntradaySlots)[] = [
      "col14",
      "col15",
      "col16",
      "col17",
    ];
    for (let i = 0; i < VN_SLOTS.length; i++) {
      const { h, m } = VN_SLOTS[i]!;
      const target = vnWallTimeToUnixSec(iso, h, m);
      const v = closeOfLastCompletedBarBefore(bars, target);
      slots[keys[i]!] = v;
    }
    map.set(iso, slots);
  }
  return map;
}

function emptyVnSlotMapsForDates(allDatesOrdered: string[]): {
  xau: Map<string, MarketVnIntradaySlots>;
  oil: Map<string, MarketVnIntradaySlots>;
  dollar: Map<string, MarketVnIntradaySlots>;
  bond: Map<string, MarketVnIntradaySlots>;
  sp: Map<string, MarketVnIntradaySlots>;
} {
  const make = () => {
    const m = new Map<string, MarketVnIntradaySlots>();
    for (const d of allDatesOrdered) {
      m.set(d, { col14: null, col15: null, col16: null, col17: null });
    }
    return m;
  };
  return {
    xau: make(),
    oil: make(),
    dollar: make(),
    bond: make(),
    sp: make(),
  };
}

export async function buildVnIntradaySlotMaps(
  fetchFromIso: string,
  toIso: string,
  allDatesOrdered: string[],
): Promise<{
  xau: Map<string, MarketVnIntradaySlots>;
  oil: Map<string, MarketVnIntradaySlots>;
  dollar: Map<string, MarketVnIntradaySlots>;
  bond: Map<string, MarketVnIntradaySlots>;
  sp: Map<string, MarketVnIntradaySlots>;
}> {
  try {
    const extendFrom = addCalendarDaysIso(fetchFromIso, -2);
    const [xauB, oilB, dxyB, bondB, spB] = await Promise.all([
      fetchYahooHourlyMerged(YAHOO_INTRADAY_BY_MARKET.xau, extendFrom, toIso),
      fetchYahooHourlyMerged(YAHOO_INTRADAY_BY_MARKET.oil, extendFrom, toIso),
      fetchYahooHourlyMerged(YAHOO_INTRADAY_BY_MARKET.dollar, extendFrom, toIso),
      fetchYahooHourlyMerged(YAHOO_INTRADAY_BY_MARKET.bond, extendFrom, toIso),
      fetchYahooHourlyMerged(YAHOO_INTRADAY_BY_MARKET.sp, extendFrom, toIso),
    ]);

    const xau = buildRawSlotMapForTicker(xauB, allDatesOrdered);
    const oil = buildRawSlotMapForTicker(oilB, allDatesOrdered);
    const dollar = buildRawSlotMapForTicker(dxyB, allDatesOrdered);
    const bond = buildRawSlotMapForTicker(bondB, allDatesOrdered);
    const sp = buildRawSlotMapForTicker(spB, allDatesOrdered);

    return { xau, oil, dollar, bond, sp };
  } catch {
    return emptyVnSlotMapsForDates(allDatesOrdered);
  }
}

const DAILY_CHUNK_SEC = 720 * 86400;

async function fetchYahooDailyChunk(
  symbol: string,
  period1: number,
  period2: number,
  barDateTimeZone: string,
): Promise<
  Array<{
    date: string;
    open: number;
    high: number;
    low: number;
    close: number;
  }>
> {
  const enc = encodeURIComponent(symbol);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${enc}?period1=${period1}&period2=${period2}&interval=1d`;
  try {
    const res = await fetch(url, YAHOO_FETCH);
    if (!res.ok) return [];
    const json = (await res.json()) as {
      chart?: {
        result?: Array<{
          timestamp?: number[];
          indicators?: {
            quote?: Array<{
              open?: Array<number | null>;
              high?: Array<number | null>;
              low?: Array<number | null>;
              close?: Array<number | null>;
            }>;
          };
        }>;
      };
    };
    const r0 = json?.chart?.result?.[0];
    const ts = r0?.timestamp ?? [];
    const q = r0?.indicators?.quote?.[0];
    const opens = q?.open ?? [];
    const highs = q?.high ?? [];
    const lows = q?.low ?? [];
    const closes = q?.close ?? [];
    const out: Array<{
      date: string;
      open: number;
      high: number;
      low: number;
      close: number;
    }> = [];
    for (let i = 0; i < ts.length; i++) {
      const t = ts[i];
      if (t == null) continue;
      const date = isoDateInTimeZone(t, barDateTimeZone);
      const o = opens[i];
      const h = highs[i];
      const l = lows[i];
      const c = closes[i];
      const close = c != null && Number.isFinite(c) ? c : NaN;
      if (!Number.isFinite(close)) continue;
      const open = o != null && Number.isFinite(o) ? o : close;
      const high = h != null && Number.isFinite(h) ? h : Math.max(open, close);
      const low = l != null && Number.isFinite(l) ? l : Math.min(open, close);
      out.push({ date, open, high, low, close });
    }
    out.sort((a, b) => a.date.localeCompare(b.date));
    return out;
  } catch {
    return [];
  }
}

/**
 * Nến ngày Yahoo `interval=1d` (API v8).
 * `barDateTimeZone`: gán `col_12` — với hàng hóa Mỹ (BZ=F) dùng `America/New_York` để khớp cột Date trên Yahoo History; mặc định UTC.
 */
export async function fetchYahooDailyOhlc(
  symbol: string,
  fromIso: string,
  toIso: string,
  barDateTimeZone = "UTC",
): Promise<OHLCRow[]> {
  const start = isoStartOfRangeUnix(fromIso);
  const end = isoEndOfRangeUnix(toIso);
  const byDate = new Map<
    string,
    { date: string; open: number; high: number; low: number; close: number }
  >();
  let chunkStart = start;
  while (chunkStart < end) {
    const chunkEnd = Math.min(chunkStart + DAILY_CHUNK_SEC, end);
    const bars = await fetchYahooDailyChunk(
      symbol,
      chunkStart,
      chunkEnd,
      barDateTimeZone,
    );
    for (const b of bars) {
      if (b.date < fromIso || b.date > toIso) continue;
      byDate.set(b.date, b);
    }
    chunkStart = chunkEnd;
  }
  const sorted = [...byDate.keys()].sort((a, b) => a.localeCompare(b));
  return sorted.map((date) => {
    const b = byDate.get(date)!;
    return {
      date: b.date,
      open: b.open,
      high: b.high,
      low: b.low,
      close: b.close,
      changePercent: null,
    };
  });
}

/** Dầu Brent — khớp https://finance.yahoo.com/quote/BZ=F/history (ngày nến = America/New_York). */
export async function fetchYahooOilDailyBrent(
  fromIso: string,
  toIso: string,
): Promise<OHLCRow[]> {
  return fetchYahooDailyOhlc(
    YAHOO_INTRADAY_BY_MARKET.oil,
    fromIso,
    toIso,
    "America/New_York",
  );
}

/** Dollar Index — khớp https://finance.yahoo.com/quote/DX-Y.NYB/history (ngày nến = America/New_York). */
export async function fetchYahooDollarIndexDailyDxNyse(
  fromIso: string,
  toIso: string,
): Promise<OHLCRow[]> {
  return fetchYahooDailyOhlc(
    YAHOO_INTRADAY_BY_MARKET.dollar,
    fromIso,
    toIso,
    "America/New_York",
  );
}

/** S&P 500 — khớp https://finance.yahoo.com/quote/%5EGSPC/history (ngày nến = America/New_York). */
export async function fetchYahooSp500DailyGspc(
  fromIso: string,
  toIso: string,
): Promise<OHLCRow[]> {
  return fetchYahooDailyOhlc(
    YAHOO_INTRADAY_BY_MARKET.sp,
    fromIso,
    toIso,
    "America/New_York",
  );
}

/** Lợi suất Kho bạc Mỹ 10 năm — khớp https://finance.yahoo.com/quote/%5ETNX/history (ngày nến = America/New_York). */
export async function fetchYahooUs10yDailyTnx(
  fromIso: string,
  toIso: string,
): Promise<OHLCRow[]> {
  return fetchYahooDailyOhlc(
    YAHOO_INTRADAY_BY_MARKET.bond,
    fromIso,
    toIso,
    "America/New_York",
  );
}

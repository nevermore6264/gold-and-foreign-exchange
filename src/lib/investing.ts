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

/** Điểm trong `data[]` của `.../historical/chart` (Investing). */
export interface InvestingChartPoint {
  date?: number;
  price_open?: number;
  price_high?: number;
  price_low?: number;
  price_close?: number;
}

/** Một dòng từ `GET .../historical/{instrumentId}?...&time-frame=Daily` (tên trường có thể đổi theo bản API). */
type InvestingHistoricalTableRow = Record<string, unknown>;

function parseInvestingNum(raw: unknown): number {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") {
    const n = parseFloat(raw.replace(/,/g, ""));
    return Number.isFinite(n) ? n : NaN;
  }
  return NaN;
}

function pickNum(row: InvestingHistoricalTableRow, keys: string[]): number {
  for (const k of keys) {
    if (!(k in row)) continue;
    const n = parseInvestingNum(row[k]);
    if (Number.isFinite(n)) return n;
  }
  return NaN;
}

function pickDateIso(row: InvestingHistoricalTableRow): string | null {
  const keys = [
    "rowDateTimestamp",
    "RowDateTimestamp",
    "row_date_timestamp",
    "date",
    "Date",
  ];
  for (const k of keys) {
    const v = row[k];
    if (typeof v === "string" && v.length >= 10) return v.slice(0, 10);
    if (typeof v === "number" && Number.isFinite(v)) {
      const d = new Date(v);
      if (!Number.isNaN(d.getTime())) {
        const y = d.getUTCFullYear();
        const m = String(d.getUTCMonth() + 1).padStart(2, "0");
        const day = String(d.getUTCDate()).padStart(2, "0");
        return `${y}-${m}-${day}`;
      }
    }
  }
  return null;
}

/** Cột “Price” trên web = đóng phiên → close. */
function parseHistoricalTableOhlc(row: InvestingHistoricalTableRow): {
  open: number;
  high: number;
  low: number;
  close: number;
  changePercent: string | null;
} | null {
  const open = pickNum(row, [
    "last_openRaw",
    "lastOpenRaw",
    "last_open",
    "open",
    "Open",
  ]);
  const high = pickNum(row, [
    "last_maxRaw",
    "lastMaxRaw",
    "high",
    "High",
    "last_high",
    "max",
  ]);
  const low = pickNum(row, [
    "last_minRaw",
    "lastMinRaw",
    "low",
    "Low",
    "last_low",
    "min",
  ]);
  const close = pickNum(row, [
    "last_closeRaw",
    "lastCloseRaw",
    "last_close",
    "close",
    "Close",
    "last_priceRaw",
    "lastPriceRaw",
    "price",
    "Price",
  ]);
  if (![open, high, low, close].every((n) => Number.isFinite(n))) return null;

  let changePercent: string | null = null;
  const ch = pickNum(row, [
    "change_precentRaw",
    "changePercentRaw",
    "change_percent",
    "ChangePercent",
    "pct_change",
    "percent_change",
  ]);
  if (Number.isFinite(ch)) changePercent = `${ch.toFixed(2)}%`;
  else {
    const s = row.change_precentRaw ?? row.changePercentRaw ?? row.change_percent;
    if (typeof s === "string" && s.trim()) {
      const t = s.trim();
      changePercent = t.includes("%") ? t : `${t}%`;
    }
  }

  return { open, high, low, close, changePercent };
}

/**
 * Parse body JSON từ `GET .../historical/{id}?...` (sao chép từ DevTools / pipeline local).
 */
export function parseOhlcFromHistoricalTableJson(
  json: unknown,
  fromDate: string,
  toDate: string,
): OHLCRow[] {
  const j = json as { data?: InvestingHistoricalTableRow[] };
  const list = j?.data ?? [];
  const rows: OHLCRow[] = [];
  for (const raw of list) {
    const dateStr = pickDateIso(raw);
    if (!dateStr || dateStr < fromDate || dateStr > toDate) continue;
    const ohlc = parseHistoricalTableOhlc(raw);
    if (!ohlc) continue;
    rows.push({ date: dateStr, ...ohlc });
  }
  rows.sort((a, b) => a.date.localeCompare(b.date));
  return rows;
}

/**
 * Parse body JSON từ `GET .../{pairId}/historical/chart?...` (sao chép từ DevTools).
 */
export function parseOhlcFromChartJson(
  json: unknown,
  fromDate: string,
  toDate: string,
): OHLCRow[] {
  const j = json as { data?: InvestingChartPoint[] };
  const points = [...(j?.data ?? [])].sort(
    (a, b) => (a.date ?? 0) - (b.date ?? 0),
  );
  const byDay = new Map<string, Omit<OHLCRow, "changePercent">>();
  for (const p of points) {
    const ts = p.date;
    if (ts == null) continue;
    const d = new Date(ts * 1000);
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
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
    rows.push({ ...row, changePercent });
  }
  return rows;
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
    const json = await res.json();
    return parseOhlcFromHistoricalTableJson(json, fromDate, toDate);
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
    const data = await res.json();
    return parseOhlcFromChartJson(data, fromDate, toDate);
  } catch {
    return [];
  }
}

/** Gọi thử `historical/68` — dùng cho `_debug` trên API (Cloudflare / sai field JSON). */
export type InvestingXau68ProbeResult = {
  historicalRequestUrl: string;
  httpOk: boolean;
  httpStatus: number;
  contentType: string | null;
  bodyIsProbablyHtml: boolean;
  bodySnippet: string;
  jsonTopLevelKeys: string[] | null;
  dataArrayLength: number | null;
  firstDataRowKeys: string[] | null;
  /** JSON đã parse từ body (cùng cấu trúc Investing trả về). */
  rawResponseJson?: unknown;
  /** Số dòng parse được OHLC (cùng logic với `fetchInvestingHistoricalDailyTable`). */
  parsedOhlcRowCount: number;
  parseNote?: string;
};

export async function probeInvestingXauHistorical68(
  fromDate: string,
  toDate: string,
): Promise<InvestingXau68ProbeResult> {
  const qs = new URLSearchParams({
    "start-date": fromDate,
    "end-date": toDate,
    "time-frame": "Daily",
    "add-missing-rows": "false",
  });
  const historicalRequestUrl = `${INVESTING_API}/historical/${XAU_USD_HISTORICAL_INSTRUMENT_ID}?${qs}`;
  const base: Omit<InvestingXau68ProbeResult, "parsedOhlcRowCount" | "parseNote"> = {
    historicalRequestUrl,
    httpOk: false,
    httpStatus: 0,
    contentType: null,
    bodyIsProbablyHtml: true,
    bodySnippet: "",
    jsonTopLevelKeys: null,
    dataArrayLength: null,
    firstDataRowKeys: null,
  };
  try {
    const res = await fetch(historicalRequestUrl, {
      ...INVESTING_FETCH_INIT,
      headers: HISTORICAL_TABLE_HEADERS,
    });
    const text = await res.text();
    const snippet = text.slice(0, 1800);
    const probablyHtml =
      snippet.trimStart().startsWith("<") || /<!DOCTYPE/i.test(snippet);
    base.httpOk = res.ok;
    base.httpStatus = res.status;
    base.contentType = res.headers.get("content-type");
    base.bodyIsProbablyHtml = probablyHtml;
    base.bodySnippet = snippet;

    const ct = base.contentType ?? "";
    if (!ct.includes("application/json") || probablyHtml) {
      return {
        ...base,
        parsedOhlcRowCount: 0,
        parseNote: "Không phải JSON (thường là Cloudflare / challenge HTML).",
      };
    }

    const json = JSON.parse(text) as { data?: InvestingHistoricalTableRow[] };
    base.jsonTopLevelKeys =
      json && typeof json === "object" ? Object.keys(json) : [];
    const list = json.data ?? [];
    base.dataArrayLength = list.length;
    const first = list[0];
    base.firstDataRowKeys =
      first && typeof first === "object"
        ? Object.keys(first as object)
        : null;

    let parsedOhlcRowCount = 0;
    for (const raw of list) {
      const dateStr = pickDateIso(raw);
      if (!dateStr || dateStr < fromDate || dateStr > toDate) continue;
      if (parseHistoricalTableOhlc(raw)) parsedOhlcRowCount += 1;
    }
    const parseNote =
      list.length > 0 && parsedOhlcRowCount === 0
        ? "Có `data[]` nhưng không parse được OHLC — kiểm tra tên field trong firstDataRowKeys."
        : undefined;

    return {
      ...base,
      bodySnippet: "",
      rawResponseJson: json,
      parsedOhlcRowCount,
      parseNote,
    };
  } catch (e) {
    return {
      ...base,
      bodySnippet: base.bodySnippet || String(e),
      parsedOhlcRowCount: 0,
      parseNote: `Lỗi fetch/parse: ${String(e)}`,
    };
  }
}

/** Probe chart daily (cùng endpoint với `fetchInvestingHistorical`). */
export type InvestingChartDailyProbe = {
  pairId: number;
  chartUrl: string;
  httpOk: boolean;
  httpStatus: number;
  contentType: string | null;
  bodyIsProbablyHtml: boolean;
  bodySnippet: string;
  pointsTotalInResponse: number | null;
  /** Số nến có `date` nằm trong [filterFrom, filterTo] (UTC). */
  pointsInFilterRange: number;
  filterRange: { from: string; to: string };
  sampleInRange: {
    date: string;
    open: number;
    high: number;
    low: number;
    close: number;
  } | null;
  /**
   * Điểm `data[]` của Investing nằm trong [filterFrom, filterTo] (UTC) — tránh nhét cả ~12k nến.
   */
  rawDataInFilterRange?: InvestingChartPoint[];
  parseNote?: string;
};

export async function probeInvestingChartDaily(
  pairId: number,
  filterFrom: string,
  filterTo: string,
): Promise<InvestingChartDailyProbe> {
  const chartUrl = `${INVESTING_API}/${pairId}/historical/chart?period=P10Y&interval=P1D&pointscount=12000`;
  const empty: InvestingChartDailyProbe = {
    pairId,
    chartUrl,
    httpOk: false,
    httpStatus: 0,
    contentType: null,
    bodyIsProbablyHtml: true,
    bodySnippet: "",
    pointsTotalInResponse: null,
    pointsInFilterRange: 0,
    filterRange: { from: filterFrom, to: filterTo },
    sampleInRange: null,
  };
  try {
    const res = await fetch(chartUrl, {
      ...INVESTING_FETCH_INIT,
      headers: DEFAULT_HEADERS,
    });
    const text = await res.text();
    const snippet = text.slice(0, 1200);
    const probablyHtml =
      snippet.trimStart().startsWith("<") || /<!DOCTYPE/i.test(snippet);
    empty.httpOk = res.ok;
    empty.httpStatus = res.status;
    empty.contentType = res.headers.get("content-type");
    empty.bodyIsProbablyHtml = probablyHtml;
    empty.bodySnippet = snippet;

    const ct = empty.contentType ?? "";
    if (!ct.includes("application/json") || probablyHtml) {
      return {
        ...empty,
        parseNote: "Không phải JSON (Cloudflare / challenge).",
      };
    }

    const json = JSON.parse(text) as { data?: InvestingChartPoint[] };
    const points = json.data ?? [];
    empty.bodySnippet = "";
    empty.pointsTotalInResponse = points.length;

    let sample: InvestingChartDailyProbe["sampleInRange"] = null;
    let inRange = 0;
    const rawInFilter: InvestingChartPoint[] = [];
    for (const p of points) {
      const ts = p.date;
      if (ts == null) continue;
      const d = new Date(ts * 1000);
      const yyyy = d.getUTCFullYear();
      const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
      const dd = String(d.getUTCDate()).padStart(2, "0");
      const dateStr = `${yyyy}-${mm}-${dd}`;
      if (dateStr < filterFrom || dateStr > filterTo) continue;
      inRange += 1;
      rawInFilter.push(p);
      if (!sample) {
        const open = p.price_open ?? p.price_close ?? 0;
        const high = p.price_high ?? p.price_close ?? open;
        const low = p.price_low ?? p.price_close ?? open;
        const close = p.price_close ?? open;
        sample = { date: dateStr, open, high, low, close };
      }
    }
    empty.pointsInFilterRange = inRange;
    empty.sampleInRange = sample;
    empty.rawDataInFilterRange =
      rawInFilter.length > 0 ? rawInFilter : undefined;
    if (points.length > 0 && inRange === 0) {
      empty.parseNote =
        "Có điểm chart nhưng không có nến trong filterRange (kiểm tra UTC vs ngày lọc).";
    }
    return empty;
  } catch (e) {
    return {
      ...empty,
      parseNote: `Lỗi: ${String(e)}`,
    };
  }
}

function inferYearFromToIso(toIso: string): number {
  const y = parseInt(toIso.slice(0, 4), 10);
  if (Number.isFinite(y) && y >= 2000 && y <= 2100) return y;
  return new Date().getUTCFullYear();
}

/** HTML challenge Cloudflare (server-side `fetch` thường không vượt qua). */
function bodyLooksLikeCloudflareChallenge(snippet: string): boolean {
  const t = snippet.slice(0, 3000);
  return (
    /just a moment/i.test(t) ||
    /cf-browser-verification/i.test(t) ||
    /__cf_chl/i.test(t) ||
    /challenge-platform/i.test(t)
  );
}

function probeLooksCloudflare403(p: {
  httpStatus: number;
  contentType: string | null;
  bodySnippet: string;
}): boolean {
  return (
    p.httpStatus === 403 &&
    (p.contentType ?? "").toLowerCase().includes("text/html") &&
    bodyLooksLikeCloudflareChallenge(p.bodySnippet)
  );
}

/** Dùng cho UI / API tóm tắt — cùng điều kiện với `accessBlocked`. */
export function isInvestingProbeCloudflareHtml(p: {
  httpStatus: number;
  contentType: string | null;
  bodySnippet: string;
}): boolean {
  return probeLooksCloudflare403(p);
}

/** Một dòng trong bảng “đang gọi API Investing nào — status”. */
export type InvestingApiCallStatusRow = {
  id: string;
  labelVi: string;
  kind: "historical_table" | "chart";
  url: string;
  httpStatus: number;
  httpOk: boolean;
  contentType: string | null;
  /** Body có vẻ JSON thật (không phải HTML challenge). */
  responseLooksLikeJson: boolean;
  cloudflareChallengeHtml: boolean;
  parseNote?: string;
  /** Số liệu nhỏ để đối chiếu nhanh */
  metrics?: Record<string, string | number | null>;
};

function statusRowFromXau68Probe(
  id: string,
  labelVi: string,
  dateRangeLabel: string,
  p: InvestingXau68ProbeResult,
): InvestingApiCallStatusRow {
  const ct = (p.contentType ?? "").toLowerCase();
  return {
    id,
    labelVi: `${labelVi} — ${dateRangeLabel}`,
    kind: "historical_table",
    url: p.historicalRequestUrl,
    httpStatus: p.httpStatus,
    httpOk: p.httpOk,
    contentType: p.contentType,
    responseLooksLikeJson:
      p.httpOk && ct.includes("application/json") && !p.bodyIsProbablyHtml,
    cloudflareChallengeHtml: probeLooksCloudflare403(p),
    parseNote: p.parseNote,
    metrics: {
      dataArrayLength: p.dataArrayLength ?? null,
      parsedOhlcRowCount: p.parsedOhlcRowCount,
    },
  };
}

/** Tóm tắt 5 khối cột bảng → nguồn Investing + status ngắn. */
export type InvestingMarketBlockShortVi = {
  tenCot: string;
  /** Path/loại request (ngắn) */
  apiTomTat: string;
  /** Ví dụ `403 CF`, `200 OK`, `68:403 | 8830:403` */
  statusNgan: string;
};

function statusNganTuProbeRow(
  c: InvestingApiCallStatusRow | undefined,
): string {
  if (!c) return "—";
  if (c.cloudflareChallengeHtml) return `${c.httpStatus} CF`;
  if (c.httpOk && c.responseLooksLikeJson) return `${c.httpStatus} OK`;
  return `${c.httpStatus}${c.httpOk ? "" : " !"}`;
}

/**
 * Map `apiCallStatuses` → 5 nhóm giống header bảng (KITCO, dầu, DXY, US10Y, S&P).
 */
export function buildMarketBlocksShortViFromCalls(
  calls: InvestingApiCallStatusRow[],
): InvestingMarketBlockShortVi[] {
  const m = new Map(calls.map((c) => [c.id, c]));
  const x68 = m.get("xau_historical_68_request_range");
  const c8830 = m.get("chart_xau_8830");
  return [
    {
      tenCot: "KITCO — GIÁ VÀNG THẾ GIỚI",
      apiTomTat: "historical/68 (XAU) → fallback chart 8830",
      statusNgan: `68:${statusNganTuProbeRow(x68)} | 8830:${statusNganTuProbeRow(c8830)}`,
    },
    {
      tenCot: "GIÁ DẦU",
      apiTomTat:
        "OHLC ngày: Yahoo BZ=F (Brent); probe chỉ test Investing WTI chart 1178037",
      statusNgan: statusNganTuProbeRow(m.get("chart_oil_1178037")),
    },
    {
      tenCot: "DOLLAR INDEX",
      apiTomTat: "chart 1224074",
      statusNgan: statusNganTuProbeRow(m.get("chart_dxy_1224074")),
    },
    {
      tenCot: "TRÁI PHIẾU US — 10 NĂM",
      apiTomTat: "chart 23705",
      statusNgan: statusNganTuProbeRow(m.get("chart_us10y_23705")),
    },
    {
      tenCot: "S&P 500",
      apiTomTat: "chart 166",
      statusNgan: statusNganTuProbeRow(m.get("chart_sp500_166")),
    },
  ];
}

function statusRowFromChartProbe(
  id: string,
  labelVi: string,
  p: InvestingChartDailyProbe,
): InvestingApiCallStatusRow {
  const ct = (p.contentType ?? "").toLowerCase();
  return {
    id,
    labelVi,
    kind: "chart",
    url: p.chartUrl,
    httpStatus: p.httpStatus,
    httpOk: p.httpOk,
    contentType: p.contentType,
    responseLooksLikeJson:
      p.httpOk && ct.includes("application/json") && !p.bodyIsProbablyHtml,
    cloudflareChallengeHtml: probeLooksCloudflare403({
      httpStatus: p.httpStatus,
      contentType: p.contentType,
      bodySnippet: p.bodySnippet,
    }),
    parseNote: p.parseNote,
    metrics: {
      pairId: p.pairId,
      pointsTotalInResponse: p.pointsTotalInResponse,
      pointsInFilterRange: p.pointsInFilterRange,
      filterFrom: p.filterRange.from,
      filterTo: p.filterRange.to,
    },
  };
}

export type InvestingDebugForApiResult = {
  /** Có khi mọi probe đều giống bị Cloudflare chặn — URL vẫn đúng. */
  accessBlocked?: {
    likelyCause: "cloudflare_challenge";
    messageVi: string;
  };
  /** Gợi ý deploy Vercel + `FULL_TABLE_MASTER_URL`. */
  vercelMasterUrlHint?: string;
  investingXauHistorical68_forRequestRange: InvestingXau68ProbeResult;
  april: {
    year: number;
    range: { from: string; to: string };
    note: string;
    xauHistorical68: InvestingXau68ProbeResult;
    chartsDaily: {
      xauUsd8830: InvestingChartDailyProbe;
      crudeOil1178037: InvestingChartDailyProbe;
      dollarIndex1224074: InvestingChartDailyProbe;
      us10yBond23705: InvestingChartDailyProbe;
      sp500_166: InvestingChartDailyProbe;
    };
  };
};

/**
 * `_debug` đầy đủ: probe XAU `historical/68` cho đúng khoảng request + **tháng 4**
 * (`aprilYearOverride` hoặc năm suy ra từ `requestTo`) và chart daily các mã.
 */
export async function buildInvestingDebugForApi(
  requestFrom: string,
  requestTo: string,
  aprilYearOverride?: number,
): Promise<InvestingDebugForApiResult> {
  const y =
    aprilYearOverride != null &&
    Number.isFinite(aprilYearOverride) &&
    aprilYearOverride >= 2000 &&
    aprilYearOverride <= 2100
      ? aprilYearOverride
      : inferYearFromToIso(requestTo);
  const af = `${y}-04-01`;
  const at = `${y}-04-30`;

  const reqXau = await probeInvestingXauHistorical68(requestFrom, requestTo);

  const [aprXau, c8830, cOil, cDxy, cBond, cSp] = await Promise.all([
    probeInvestingXauHistorical68(af, at),
    probeInvestingChartDaily(PAIR_IDS.xauUsd, af, at),
    probeInvestingChartDaily(PAIR_IDS.crudeOil, af, at),
    probeInvestingChartDaily(PAIR_IDS.dollarIndex, af, at),
    probeInvestingChartDaily(PAIR_IDS.us10yBond, af, at),
    probeInvestingChartDaily(PAIR_IDS.sp500, af, at),
  ]);

  const probes403Cf = [
    reqXau,
    aprXau,
    c8830,
    cOil,
    cDxy,
    cBond,
    cSp,
  ].filter((p) => probeLooksCloudflare403(p));

  const accessBlocked: InvestingDebugForApiResult["accessBlocked"] =
    probes403Cf.length === 7
      ? {
          likelyCause: "cloudflare_challenge",
          messageVi:
            "Máy chủ Next.js gọi api.investing.com bị Cloudflare trả 403 + trang HTML 'Just a moment...' (Managed Challenge). URL và query giống trình duyệt; khác biệt là không có cookie / TLS / hành vi giống người. Trình duyệt của bạn mở link vẫn thấy JSON vì đã qua challenge. Hướng xử lý thực tế: chạy sync từ môi trường/IP ít bị chặn, proxy, hoặc nguồn dữ liệu thay thế (Yahoo, v.v.); gắn cookie cf_clearance vào server rất khó bảo trì và hay hết hạn.",
        }
      : probes403Cf.length >= 1
        ? {
            likelyCause: "cloudflare_challenge",
            messageVi:
              "Một số request Investing trả 403 + HTML giống Cloudflare — xem từng probe trong JSON bên dưới.",
          }
        : undefined;

  const vercelMasterUrlHint =
    process.env.VERCEL === "1"
      ? process.env.FULL_TABLE_MASTER_URL?.trim()
        ? "Đã cấu hình FULL_TABLE_MASTER_URL — fast path đọc master từ URL; probe Investing vẫn có thể 403 (bình thường trên Vercel)."
        : "Vercel: api.investing.com thường 403 (Cloudflare). Đặt env FULL_TABLE_MASTER_URL = URL file full-table-dataset.json (GitHub raw / Gist / R2). Build file: npm run sync:master:local trên máy local rồi upload."
      : undefined;

  return {
    ...(accessBlocked ? { accessBlocked } : {}),
    ...(vercelMasterUrlHint ? { vercelMasterUrlHint } : {}),
    investingXauHistorical68_forRequestRange: reqXau,
    april: {
      year: y,
      range: { from: af, to: at },
      note: `Tháng 4 năm ${y}: historical/68 (XAU) + chart daily các pair (cùng app đang dùng).`,
      xauHistorical68: aprXau,
      chartsDaily: {
        xauUsd8830: c8830,
        crudeOil1178037: cOil,
        dollarIndex1224074: cDxy,
        us10yBond23705: cBond,
        sp500_166: cSp,
      },
    },
  };
}

/** Gom probe `_debug` thành danh sách URL + HTTP status (đọc nhanh). */
export function flattenInvestingDebugToApiCallStatuses(
  d: InvestingDebugForApiResult,
): InvestingApiCallStatusRow[] {
  const { year, range } = d.april;
  const aprilLabel = `tháng 4/${year} (${range.from} → ${range.to})`;
  return [
    statusRowFromXau68Probe(
      "xau_historical_68_request_range",
      "XAU/USD — bảng historical id 68",
      "khoảng request",
      d.investingXauHistorical68_forRequestRange,
    ),
    statusRowFromXau68Probe(
      "xau_historical_68_april",
      "XAU/USD — bảng historical id 68",
      aprilLabel,
      d.april.xauHistorical68,
    ),
    statusRowFromChartProbe(
      "chart_xau_8830",
      "XAU/USD — chart daily (pair 8830)",
      d.april.chartsDaily.xauUsd8830,
    ),
    statusRowFromChartProbe(
      "chart_oil_1178037",
      "Dầu WTI — chart daily (1178037)",
      d.april.chartsDaily.crudeOil1178037,
    ),
    statusRowFromChartProbe(
      "chart_dxy_1224074",
      "Dollar Index — chart daily (1224074)",
      d.april.chartsDaily.dollarIndex1224074,
    ),
    statusRowFromChartProbe(
      "chart_us10y_23705",
      "US 10Y bond — chart daily (23705)",
      d.april.chartsDaily.us10yBond23705,
    ),
    statusRowFromChartProbe(
      "chart_sp500_166",
      "S&P 500 — chart daily (166)",
      d.april.chartsDaily.sp500_166,
    ),
  ];
}

/**
 * Gọi đủ probe giống `_debug` full-table, trả về danh sách URL + status (không nhét raw JSON).
 */
export async function fetchInvestingApiCallStatusReport(
  requestFrom: string,
  requestTo: string,
  aprilYearOverride?: number,
): Promise<{
  calls: InvestingApiCallStatusRow[];
  khoiBangNgan: InvestingMarketBlockShortVi[];
  accessBlocked: InvestingDebugForApiResult["accessBlocked"];
  vercelMasterUrlHint: InvestingDebugForApiResult["vercelMasterUrlHint"];
}> {
  const debug = await buildInvestingDebugForApi(
    requestFrom,
    requestTo,
    aprilYearOverride,
  );
  const calls = flattenInvestingDebugToApiCallStatuses(debug);
  return {
    calls,
    khoiBangNgan: buildMarketBlocksShortViFromCalls(calls),
    accessBlocked: debug.accessBlocked,
    vercelMasterUrlHint: debug.vercelMasterUrlHint,
  };
}

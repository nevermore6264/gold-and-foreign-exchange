/**
 * Giá vàng GC=F (COMEX): lấy giá tại các mốc 9h / 11h / 14h30 / 17h30 theo **giờ lịch Việt Nam**
 * (cùng logic với khung Mạnh Hải), bằng nến 1h từ Yahoo chart.
 *
 * MỞ / ĐÓNG / Cao / Thấp / % vẫn lấy từ OHLC ngày; 4 cột giữa lấy từ intraday tại các mốc trên.
 */

import YahooFinance from "yahoo-finance2";

const GC_F = "GC=F";
const VN_TZ = "Asia/Ho_Chi_Minh";

const MONTH_FETCH_CONCURRENCY = 4;

export type GoldGcVnSlots = {
  col14: number | null;
  col15: number | null;
  col16: number | null;
  col17: number | null;
};

function monthKeysBetween(fromIso: string, toIso: string): Array<{ y: number; m: number }> {
  const out: Array<{ y: number; m: number }> = [];
  const [fy, fm] = fromIso.split("-").map((x) => parseInt(x, 10));
  const [ty, tm] = toIso.split("-").map((x) => parseInt(x, 10));
  let y = fy;
  let m = fm;
  for (;;) {
    out.push({ y, m });
    if (y === ty && m === tm) break;
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}

function periodForMonth(
  y: number,
  m: number,
  clipFrom: string,
  clipTo: string,
): { period1: Date; period2: Date } {
  const [fy, fm, fd] = clipFrom.split("-").map((x) => parseInt(x, 10));
  const [ty, tm, td] = clipTo.split("-").map((x) => parseInt(x, 10));
  const lastDom = new Date(y, m, 0).getDate();
  let startDay = 1;
  let endDay = lastDom;
  if (y === fy && m === fm) startDay = fd;
  if (y === ty && m === tm) endDay = td;
  return {
    period1: new Date(y, m - 1, startDay),
    period2: new Date(y, m - 1, endDay, 23, 59, 59),
  };
}

function vnCalendarDateUtcMs(utcMs: number): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: VN_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(new Date(utcMs));
  const y = parts.find((p) => p.type === "year")?.value;
  const mo = parts.find((p) => p.type === "month")?.value;
  const da = parts.find((p) => p.type === "day")?.value;
  if (!y || !mo || !da) return "";
  return `${y}-${mo}-${da}`;
}

function vnSlotTargetMs(isoDate: string, hour: number, minute: number): number {
  const h = String(hour).padStart(2, "0");
  const mi = String(minute).padStart(2, "0");
  return Date.parse(`${isoDate}T${h}:${mi}:00+07:00`);
}

type YahooChartArray = {
  quotes?: Array<{
    date?: Date;
    close?: number | null;
    open?: number | null;
  }>;
};

function extractBars(chart: YahooChartArray): Array<{ t: number; c: number }> {
  const q = chart.quotes;
  if (!Array.isArray(q)) return [];
  const out: Array<{ t: number; c: number }> = [];
  for (const row of q) {
    const d = row.date;
    const c = row.close ?? row.open;
    if (d instanceof Date && c != null && Number.isFinite(c))
      out.push({ t: d.getTime(), c });
  }
  return out;
}

function bucketBarsByVnDate(
  bars: Array<{ t: number; c: number }>,
): Map<string, Array<{ t: number; c: number }>> {
  const map = new Map<string, Array<{ t: number; c: number }>>();
  for (const b of bars) {
    const d = vnCalendarDateUtcMs(b.t);
    if (!d) continue;
    let arr = map.get(d);
    if (!arr) {
      arr = [];
      map.set(d, arr);
    }
    arr.push(b);
  }
  for (const arr of map.values()) arr.sort((a, b) => a.t - b.t);
  return map;
}

function priceAtOrBeforeSlot(
  dayBars: Array<{ t: number; c: number }>,
  targetMs: number,
): number | null {
  let best: { t: number; c: number } | null = null;
  for (const b of dayBars) {
    if (b.t <= targetMs && (!best || b.t > best.t)) best = b;
  }
  if (best) return best.c;
  let early: { t: number; c: number } | null = null;
  for (const b of dayBars) {
    if (b.t >= targetMs && (!early || b.t < early.t)) early = b;
  }
  return early?.c ?? null;
}

function slotsForVnDay(
  vnDate: string,
  dayBars: Array<{ t: number; c: number }> | undefined,
  fallback: number | null,
): GoldGcVnSlots {
  const fb = fallback;
  if (!dayBars?.length) {
    return { col14: fb, col15: fb, col16: fb, col17: fb };
  }
  const targets: Array<[number, number]> = [
    [9, 0],
    [11, 0],
    [14, 30],
    [17, 30],
  ];
  const vals = targets.map(([h, mi]) =>
    priceAtOrBeforeSlot(dayBars, vnSlotTargetMs(vnDate, h, mi)),
  );
  return {
    col14: vals[0] ?? fb,
    col15: vals[1] ?? fb,
    col16: vals[2] ?? fb,
    col17: vals[3] ?? fb,
  };
}

/**
 * Trả về map theo ngày lịch VN (YYYY-MM-DD) — trùng col_12 trong bảng.
 */
export async function fetchGoldGcVnSlotsByDateRange(
  fromIso: string,
  toIso: string,
): Promise<Map<string, GoldGcVnSlots>> {
  const result = new Map<string, GoldGcVnSlots>();
  if (fromIso > toIso) return result;

  const months = monthKeysBetween(fromIso, toIso);
  const yahooFinance = new YahooFinance();
  const allBars: Array<{ t: number; c: number }> = [];

  for (let i = 0; i < months.length; i += MONTH_FETCH_CONCURRENCY) {
    const chunk = months.slice(i, i + MONTH_FETCH_CONCURRENCY);
    const batch = await Promise.all(
      chunk.map(async (ym) => {
        const { period1, period2 } = periodForMonth(
          ym.y,
          ym.m,
          fromIso,
          toIso,
        );
        try {
          const chart = (await yahooFinance.chart(GC_F, {
            period1,
            period2,
            interval: "1h",
          })) as YahooChartArray;
          return extractBars(chart);
        } catch {
          return [];
        }
      }),
    );
    for (const bars of batch) allBars.push(...bars);
  }

  allBars.sort((a, b) => a.t - b.t);
  const byVnDay = bucketBarsByVnDate(allBars);

  const dates: string[] = [];
  const [sy, sm, sd] = fromIso.split("-").map((x) => parseInt(x, 10));
  const [ey, em, ed] = toIso.split("-").map((x) => parseInt(x, 10));
  let cur = new Date(sy, (sm ?? 1) - 1, sd ?? 1);
  cur.setHours(0, 0, 0, 0);
  const endD = new Date(ey, (em ?? 1) - 1, ed ?? 1);
  endD.setHours(0, 0, 0, 0);
  while (cur <= endD) {
    const yyyy = cur.getFullYear();
    const mm = String(cur.getMonth() + 1).padStart(2, "0");
    const dd = String(cur.getDate()).padStart(2, "0");
    dates.push(`${yyyy}-${mm}-${dd}`);
    cur.setDate(cur.getDate() + 1);
  }

  for (const d of dates) {
    result.set(d, slotsForVnDay(d, byVnDay.get(d), null));
  }

  return result;
}

import { NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type OHLCRow = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  changePercent: string | null;
};

function toLocalDateStr(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

async function fetchHistorical(symbol: string, from: string, to: string): Promise<OHLCRow[]> {
  try {
    const yahooFinance = new YahooFinance();
    const result = await yahooFinance.historical(symbol, {
      period1: from,
      period2: to,
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
      if (dateStr < from || dateStr > to) continue;

      const open = d.open ?? d.close ?? 0;
      const high = d.high ?? d.close ?? open;
      const low = d.low ?? d.close ?? open;
      const close = d.close ?? open;

      const prevClose = i >= 1 ? sorted[i - 1].close : null;
      const changePercent =
        prevClose != null && prevClose !== 0
          ? (((close - prevClose) / prevClose) * 100).toFixed(2) + "%"
          : null;

      rows.push({ date: dateStr, open, high, low, close, changePercent });
    }

    return rows;
  } catch {
    return [];
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  if (!from || !to) {
    return NextResponse.json({ error: "missing from/to" }, { status: 400 });
  }

  const [xau, gc] = await Promise.all([
    fetchHistorical("XAUUSD=X", from, to),
    fetchHistorical("GC=F", from, to),
  ]);

  const lastXau = xau.length ? xau[xau.length - 1] : null;
  const lastGc = gc.length ? gc[gc.length - 1] : null;

  return NextResponse.json({
    from,
    to,
    xauCount: xau.length,
    gcCount: gc.length,
    lastXau,
    lastGc,
  });
}


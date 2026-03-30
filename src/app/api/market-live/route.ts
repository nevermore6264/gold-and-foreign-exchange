import { NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type LiveQuote = {
  price?: number;
  changePercent?: number;
  /** Giá MỞ phiên regular (US) — COMEX GC=F */
  regularMarketOpen?: number;
  updatedAt: string;
};

function liveQuoteFromYahoo(q: unknown): LiveQuote {
  const now = new Date().toISOString();
  if (!q || typeof q !== "object") {
    return { updatedAt: now };
  }
  const o = q as {
    regularMarketPrice?: number;
    regularMarketChangePercent?: number;
    regularMarketOpen?: number;
  };
  return {
    price:
      typeof o.regularMarketPrice === "number"
        ? o.regularMarketPrice
        : undefined,
    changePercent:
      typeof o.regularMarketChangePercent === "number"
        ? o.regularMarketChangePercent
        : undefined,
    regularMarketOpen:
      typeof o.regularMarketOpen === "number"
        ? o.regularMarketOpen
        : undefined,
    updatedAt: now,
  };
}

async function quoteDollarIndexLive(
  yahooFinance: InstanceType<typeof YahooFinance>,
  quoteSafe: (symbol: string) => Promise<unknown>,
): Promise<unknown> {
  const sym = "DX-Y.NYB";
  const q = await quoteSafe(sym);
  const o = q as { regularMarketPrice?: number } | null;
  if (o && typeof o.regularMarketPrice === "number" && Number.isFinite(o.regularMarketPrice)) {
    return q;
  }
  try {
    const p2 = new Date();
    const p1 = new Date(p2.getTime() - 10 * 24 * 60 * 60 * 1000);
    const ch = await yahooFinance.chart(sym, {
      period1: p1,
      period2: p2,
      interval: "1d",
    });
    const quotes = ch?.quotes;
    if (!Array.isArray(quotes) || quotes.length === 0) return q;
    const last = quotes[quotes.length - 1] as {
      close?: number | null;
      date?: Date;
    };
    const prev =
      quotes.length >= 2
        ? (quotes[quotes.length - 2] as { close?: number | null })
        : null;
    const price = last?.close;
    if (typeof price !== "number" || !Number.isFinite(price)) return q;
    let changePercent: number | undefined;
    const pc = prev?.close;
    if (typeof pc === "number" && Number.isFinite(pc) && pc !== 0) {
      changePercent = ((price - pc) / pc) * 100;
    }
    return {
      regularMarketPrice: price,
      regularMarketChangePercent: changePercent,
      regularMarketTime: last?.date,
    };
  } catch (e) {
    console.error("market-live DXY chart fallback:", e);
    return q;
  }
}

export async function GET() {
  try {
    const yahooFinance = new YahooFinance({
      suppressNotices: ["yahooSurvey", "ripHistorical"],
    });

    const quoteSafe = async (symbol: string) => {
      try {
        return await yahooFinance.quote(symbol);
      } catch (e) {
        console.error(`market-live quote ${symbol}:`, e);
        return null;
      }
    };

    const [oil, tnx, sp, gc, dxy] = await Promise.all([
      quoteSafe("CL=F"),
      quoteSafe("^TNX"),
      quoteSafe("^GSPC"),
      quoteSafe("GC=F"),
      quoteDollarIndexLive(yahooFinance, quoteSafe),
    ]);

    const oilLive = liveQuoteFromYahoo(oil);

    const dxyLive = liveQuoteFromYahoo(dxy);

    // ^TNX is in percent*10 (e.g. 4.30% -> ~43). Scale về % để khớp historal.
    const tnxBase = liveQuoteFromYahoo(tnx);
    const tnxO = tnx as {
      regularMarketPrice?: number;
    } | null;
    const tnxLive: LiveQuote = {
      ...tnxBase,
      price:
        tnxO && typeof tnxO.regularMarketPrice === "number"
          ? tnxO.regularMarketPrice / 10
          : undefined,
    };

    const spLive = liveQuoteFromYahoo(sp);
    const goldGcLive = liveQuoteFromYahoo(gc);

    return NextResponse.json({
      oil: oilLive,
      dollarIndex: dxyLive,
      bond10y: tnxLive,
      sp500: spLive,
      goldGc: goldGcLive,
    });
  } catch (e) {
    console.error("Market live API error:", e);
    return NextResponse.json(
      { error: "Không thể tải dữ liệu realtime." },
      { status: 500 },
    );
  }
}


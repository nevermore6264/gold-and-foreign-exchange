import { NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type LiveQuote = {
  price?: number;
  changePercent?: number;
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
    updatedAt: now,
  };
}

export async function GET() {
  try {
    const yahooFinance = new YahooFinance();

    const quoteSafe = async (symbol: string) => {
      try {
        return await yahooFinance.quote(symbol);
      } catch (e) {
        console.error(`market-live quote ${symbol}:`, e);
        return null;
      }
    };

    const [oil, dxy, tnx, sp] = await Promise.all([
      quoteSafe("CL=F"),
      quoteSafe("DX-Y.NYB"),
      quoteSafe("^TNX"),
      quoteSafe("^GSPC"),
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

    return NextResponse.json({
      oil: oilLive,
      dollarIndex: dxyLive,
      bond10y: tnxLive,
      sp500: spLive,
    });
  } catch (e) {
    console.error("Market live API error:", e);
    return NextResponse.json(
      { error: "Không thể tải dữ liệu realtime." },
      { status: 500 },
    );
  }
}


import { NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type LiveQuote = {
  price?: number;
  changePercent?: number;
  updatedAt: string;
};

export async function GET() {
  try {
    const yahooFinance = new YahooFinance();

    const [oil, dxy] = await Promise.all([
      yahooFinance.quote("CL=F"),
      yahooFinance.quote("DX-Y.NYB"),
    ]);

    const oilLive: LiveQuote = {
      price:
        typeof oil?.regularMarketPrice === "number"
          ? oil.regularMarketPrice
          : undefined,
      changePercent:
        typeof oil?.regularMarketChangePercent === "number"
          ? oil.regularMarketChangePercent
          : undefined,
      updatedAt: new Date().toISOString(),
    };

    const dxyLive: LiveQuote = {
      price:
        typeof dxy?.regularMarketPrice === "number"
          ? dxy.regularMarketPrice
          : undefined,
      changePercent:
        typeof dxy?.regularMarketChangePercent === "number"
          ? dxy.regularMarketChangePercent
          : undefined,
      updatedAt: new Date().toISOString(),
    };

    const [tnx, sp] = await Promise.all([
      yahooFinance.quote("^TNX"),
      yahooFinance.quote("^GSPC"),
    ]);

    // ^TNX is in percent*10 (e.g. 4.30% -> ~43). Scale về % để khớp historal.
    const tnxLive: LiveQuote = {
      price:
        typeof tnx?.regularMarketPrice === "number"
          ? tnx.regularMarketPrice / 10
          : undefined,
      changePercent:
        typeof tnx?.regularMarketChangePercent === "number"
          ? tnx.regularMarketChangePercent
          : undefined,
      updatedAt: new Date().toISOString(),
    };

    const spLive: LiveQuote = {
      price:
        typeof sp?.regularMarketPrice === "number"
          ? sp.regularMarketPrice
          : undefined,
      changePercent:
        typeof sp?.regularMarketChangePercent === "number"
          ? sp.regularMarketChangePercent
          : undefined,
      updatedAt: new Date().toISOString(),
    };

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


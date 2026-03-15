/**
 * Giá vàng: lấy từ FreeGoldAPI (historical từ 2022) và Kitco (live).
 * Kitco không có API công khai, nên historical dùng FreeGoldAPI (dữ liệu USD/oz tương đương).
 */

const FREE_GOLD_API = "https://freegoldapi.com/data/latest.json";
const KITCO_GOLD_URL = "https://www.kitco.com/charts/gold";

const START_YEAR = 2022;

export interface GoldPriceItem {
  date: string;
  price: number;
  source?: string;
}

export interface GoldData {
  source: "freegoldapi" | "kitco";
  updatedAt: string;
  fromYear: number;
  historical: GoldPriceItem[];
  live?: {
    bid?: number;
    ask?: number;
    change?: number;
    changePercent?: number;
  };
}

/**
 * Lấy dữ liệu giá vàng historical từ FreeGoldAPI (từ năm 2022 đến nay).
 */
export async function fetchGoldFromFreeGoldAPI(): Promise<GoldPriceItem[]> {
  const res = await fetch(FREE_GOLD_API, {
    next: { revalidate: 3600 },
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`FreeGoldAPI error: ${res.status}`);
  const data = (await res.json()) as Array<{
    date: string;
    price: number;
    source?: string;
  }>;
  const start = `${START_YEAR}-01-01`;
  return data
    .filter((d) => d.date >= start)
    .map((d) => ({ date: d.date, price: d.price, source: d.source }));
}

/**
 * Thử lấy giá vàng live từ trang Kitco (parse HTML).
 * Nếu fail thì trả về null, app vẫn dùng historical.
 */
export async function fetchKitcoLivePrice(): Promise<GoldData["live"] | null> {
  try {
    const res = await fetch(KITCO_GOLD_URL, {
      next: { revalidate: 60 },
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });
    if (!res.ok) return null;
    const html = await res.text();
    // Kitco: Bid/Ask với số dạng 5,105.00
    const bidMatch =
      html.match(/Bid[\s\S]{0,200}?([\d,]+\.\d{2})/i) ||
      html.match(/>\s*([\d,]+\.\d{2})\s*<\/[^>]*>\s*[\s\S]{0,100}Bid/i);
    const askMatch = html.match(/Ask[\s\S]{0,200}?([\d,]+\.\d{2})/i);
    const changeMatch = html.match(
      /([-+]?[\d,]+\.\d+)\s*\(([-+]?\d+\.?\d*)%\)/,
    );
    const parseNum = (s: string) =>
      parseFloat(s.replace(/,/g, "")) || undefined;
    const bid = bidMatch ? parseNum(bidMatch[1]) : undefined;
    const ask = askMatch ? parseNum(askMatch[1]) : undefined;
    let change: number | undefined;
    let changePercent: number | undefined;
    if (changeMatch) {
      change = parseNum(changeMatch[1]);
      changePercent = parseNum(changeMatch[2]);
    }
    if (!bid && !ask) return null;
    return { bid, ask, change, changePercent };
  } catch {
    return null;
  }
}

/**
 * Tổng hợp: historical từ FreeGoldAPI (từ 2022), live (nếu có) từ Kitco.
 */
export async function getGoldData(): Promise<GoldData> {
  const [historical, live] = await Promise.all([
    fetchGoldFromFreeGoldAPI(),
    fetchKitcoLivePrice(),
  ]);
  return {
    source: "freegoldapi",
    updatedAt: new Date().toISOString(),
    fromYear: START_YEAR,
    historical,
    live: live ?? undefined,
  };
}

/**
 * Tỷ giá Vietcombank từ API XML.
 * Endpoint: https://portal.vietcombank.com.vn/Usercontrols/TVPortal.TyGia/pXML.aspx
 * Tham số b=0, b=8, b=10... (loại bảng).
 */

const VCB_XML_URL =
  "https://portal.vietcombank.com.vn/Usercontrols/TVPortal.TyGia/pXML.aspx";

export interface ExchangeRateItem {
  currencyCode: string;
  currencyName: string;
  buyCash?: number;
  buyTransfer?: number;
  sell?: number;
}

export interface VietcombankRates {
  updatedAt: string;
  source: string;
  rates: ExchangeRateItem[];
  error?: string;
}

function parseXmlRates(xmlText: string): ExchangeRateItem[] {
  const rates: ExchangeRateItem[] = [];
  // Vietcombank: <Exrate CurrencyCode="USD" CurrencyName="..." Buy="..." Transfer="..." Sell="..."/>
  const exrateRegex =
    /<Exrate[^>]*CurrencyCode="([^"]*)"[^>]*CurrencyName="([^"]*)"[^>]*Buy="([^"]*)"[^>]*Transfer="([^"]*)"[^>]*Sell="([^"]*)"/gi;
  let m: RegExpExecArray | null;
  while ((m = exrateRegex.exec(xmlText)) !== null) {
    const parseNum = (s: string) =>
      s ? parseFloat(s.replace(/,/g, ".")) : undefined;
    rates.push({
      currencyCode: m[1]?.trim() ?? "",
      currencyName: m[2]?.trim() ?? "",
      buyCash: parseNum(m[3] ?? ""),
      buyTransfer: parseNum(m[4] ?? ""),
      sell: parseNum(m[5] ?? ""),
    });
  }
  // Fallback: any order of attributes
  if (rates.length === 0) {
    const tagRegex = /<Exrate\s+([^/]+?)\s*\/?>/gi;
    while ((m = tagRegex.exec(xmlText)) !== null) {
      const attrs = m[1];
      const getAttr = (name: string) => {
        const r = new RegExp(`${name}="([^"]*)"`, "i");
        const x = r.exec(attrs);
        return x ? x[1].trim() : "";
      };
      const parseNum = (s: string) =>
        s ? parseFloat(s.replace(/,/g, ".")) : undefined;
      rates.push({
        currencyCode: getAttr("CurrencyCode"),
        currencyName: getAttr("CurrencyName"),
        buyCash: parseNum(getAttr("Buy")),
        buyTransfer: parseNum(getAttr("Transfer")),
        sell: parseNum(getAttr("Sell")),
      });
    }
  }
  return rates.filter((r) => r.currencyCode);
}

/**
 * Lấy tỷ giá từ Vietcombank (XML). Thử nhiều tham số b= nếu cần.
 */
export async function fetchVietcombankRates(): Promise<VietcombankRates> {
  const params = [0, 8, 10];
  for (const b of params) {
    try {
      const url = `${VCB_XML_URL}?b=${b}`;
      const res = await fetch(url, {
        next: { revalidate: 3600 },
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "application/xml, text/xml, */*",
        },
      });
      if (!res.ok) continue;
      const xml = await res.text();
      const rates = parseXmlRates(xml);
      if (rates.length > 0) {
        return {
          updatedAt: new Date().toISOString(),
          source: "vietcombank",
          rates,
        };
      }
    } catch {
      // try next param
    }
  }
  return {
    updatedAt: new Date().toISOString(),
    source: "vietcombank",
    rates: [],
    error:
      "Không thể tải tỷ giá từ Vietcombank. Vui lòng thử lại sau hoặc kiểm tra kết nối.",
  };
}

/** API JSON theo ngày: https://www.vietcombank.com.vn/api/exchangerates?date=YYYY-MM-DD */
const VCB_JSON_API = "https://www.vietcombank.com.vn/api/exchangerates";

interface VcbJsonItem {
  currencyCode: string;
  sell: string;
}

interface VcbJsonResponse {
  Date: string;
  Data: VcbJsonItem[];
}

/**
 * Lấy giá bán USD (VND) của Vietcombank theo ngày.
 * @param date YYYY-MM-DD
 */
export async function fetchVietcombankUsdSellByDate(
  date: string,
): Promise<number | null> {
  try {
    const url = `${VCB_JSON_API}?date=${date}`;
    const res = await fetch(url, {
      next: { revalidate: 86400 },
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "application/json",
      },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as VcbJsonResponse;
    const usd = data.Data?.find((c) => c.currencyCode?.toUpperCase() === "USD");
    if (!usd?.sell) return null;
    return parseFloat(usd.sell.replace(/,/g, "."));
  } catch {
    return null;
  }
}

export interface VietcombankUsdRates {
  buyCash: number | null; // cash
  buyTransfer: number | null; // transfer
  sell: number | null;
}

/**
 * Lấy tỷ giá USD theo ngày từ Vietcombank JSON API.
 * https://www.vietcombank.com.vn/api/exchangerates?date=YYYY-MM-DD
 */
export async function fetchVietcombankUsdRatesByDate(
  date: string,
): Promise<VietcombankUsdRates> {
  try {
    const url = `${VCB_JSON_API}?date=${date}`;
    const res = await fetch(url, {
      next: { revalidate: 86400 },
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "application/json",
      },
    });
    if (!res.ok) {
      return { buyCash: null, buyTransfer: null, sell: null };
    }

    const data = (await res.json()) as VcbJsonResponse;
    const usd = data.Data?.find(
      (c) => c.currencyCode?.toUpperCase() === "USD",
    );

    const parseMaybe = (s?: string): number | null => {
      if (!s) return null;
      const n = parseFloat(s.replace(/,/g, "."));
      return Number.isFinite(n) ? n : null;
    };

    return {
      buyCash: parseMaybe((usd as any)?.cash),
      buyTransfer: parseMaybe((usd as any)?.transfer),
      sell: parseMaybe((usd as any)?.sell),
    };
  } catch {
    return { buyCash: null, buyTransfer: null, sell: null };
  }
}

/**
 * Giá vàng trong nước từ CafeF.
 *
 * Trang HTML chỉ có vài <tr> — bảng giá được hydrate bằng JS. Nguồn đáng tin cậy là
 * Ajax `ajaxgoldpricehistory.ashx` (cùng endpoint trình duyệt gọi).
 * Giá trong JSON là số thập phân; nhân 100_000 → đồng VND (đối chiếu với baotinmanhhai.vn).
 */

import { pickGoldRowFromHtml } from "./gold-html-parse";

const DEFAULT_HEADERS: HeadersInit = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "application/json, text/html, */*",
  "Accept-Language": "vi-VN,vi;q=0.9,en;q=0.8",
};

const CAFEF_REFERER_DESKTOP =
  "https://cafef.vn/du-lieu/gia-vang-hom-nay/trong-nuoc.chn";
const CAFEF_REFERER_MOBILE =
  "https://m.cafef.vn/du-lieu/gia-vang-hom-nay/trong-nuoc.chn";

/** `index` giống dropdown trên trang (vd: 1m = gần nhất). */
const CAFEF_AJAX_URLS: { url: string; referer: string }[] = [
  {
    url: "https://cafef.vn/du-lieu/Ajax/ajaxgoldpricehistory.ashx?index=1m",
    referer: CAFEF_REFERER_DESKTOP,
  },
  {
    url: "https://m.cafef.vn/du-lieu/Ajax/ajaxgoldpricehistory.ashx?index=1m",
    referer: CAFEF_REFERER_MOBILE,
  },
];

const CAFEF_GOLD_PAGE_URLS = [
  "https://cafef.vn/du-lieu/gia-vang-hom-nay/trong-nuoc.chn",
  "https://m.cafef.vn/du-lieu/gia-vang-hom-nay/trong-nuoc.chn",
];

type CafeFGoldHistRow = {
  name?: string;
  buyPrice?: number;
  sellPrice?: number;
};

function cafeFPricesToVnd(buy: number, sell: number): { buy: number; sell: number } {
  return {
    buy: Math.round(buy * 100_000),
    sell: Math.round(sell * 100_000),
  };
}

function pickSjcRow(
  hist: CafeFGoldHistRow[],
  productKeyword: string,
): CafeFGoldHistRow | null {
  if (!hist.length) return null;
  const kw = productKeyword.toLowerCase();
  const tokens = kw.split(/\s+/).filter((w) => w.length >= 2);

  const nameMatch = (row: CafeFGoldHistRow) => {
    const n = (row.name ?? "").toLowerCase();
    if (!n) return false;
    if (n.includes("sjc")) return true;
    return tokens.some((t) => n.includes(t));
  };

  return hist.find((r) => nameMatch(r) && r.buyPrice != null && r.sellPrice != null) ?? hist[0] ?? null;
}

async function fetchCafeFGoldFromAjax(keyword: string): Promise<{
  buy: number;
  sell: number;
  productName: string;
} | null> {
  for (const { url, referer } of CAFEF_AJAX_URLS) {
    try {
      const res = await fetch(url, {
        cache: "no-store",
        headers: { ...DEFAULT_HEADERS, Referer: referer },
      });
      if (!res.ok) continue;
      const json: unknown = await res.json();
      const data = json as { Data?: { goldPriceWorldHistories?: CafeFGoldHistRow[] } };
      const hist = data?.Data?.goldPriceWorldHistories;
      if (!Array.isArray(hist) || hist.length === 0) continue;

      const row = pickSjcRow(hist, keyword);
      const b = row?.buyPrice;
      const s = row?.sellPrice;
      if (typeof b !== "number" || typeof s !== "number") continue;

      const vnd = cafeFPricesToVnd(b, s);
      if (vnd.buy <= 0 || vnd.sell <= 0) continue;

      return {
        buy: vnd.buy,
        sell: vnd.sell,
        productName: `${(row?.name ?? "SJC").trim()} (CafeF)`,
      };
    } catch {
      /* thử URL tiếp */
    }
  }
  return null;
}

async function fetchCafeFGoldFromHtml(keyword: string): Promise<{
  buy: number;
  sell: number;
  productName: string;
} | null> {
  for (const url of CAFEF_GOLD_PAGE_URLS) {
    try {
      const res = await fetch(url, {
        cache: "no-store",
        headers: DEFAULT_HEADERS,
      });
      if (!res.ok) continue;
      const html = await res.text();
      const row =
        pickGoldRowFromHtml(html, keyword) ??
        pickGoldRowFromHtml(html, "SJC") ??
        pickGoldRowFromHtml(html, "Mạnh Hải");
      if (row && row.buy != null && row.sell != null) {
        return {
          buy: row.buy,
          sell: row.sell,
          productName: `${row.name.trim()} (CafeF)`,
        };
      }
    } catch {
      /* thử URL tiếp */
    }
  }
  return null;
}

export async function fetchCafeFGoldSjcPrices(options?: {
  productKeyword?: string;
}): Promise<{ buy: number | null; sell: number | null; productName: string }> {
  const keyword = options?.productKeyword ?? "Vàng miếng SJC";

  const fromAjax = await fetchCafeFGoldFromAjax(keyword);
  if (fromAjax) {
    return {
      buy: fromAjax.buy,
      sell: fromAjax.sell,
      productName: fromAjax.productName,
    };
  }

  const fromHtml = await fetchCafeFGoldFromHtml(keyword);
  if (fromHtml) {
    return {
      buy: fromHtml.buy,
      sell: fromHtml.sell,
      productName: fromHtml.productName,
    };
  }

  return { buy: null, sell: null, productName: "N/A" };
}

/**
 * Giá vàng từ VietnamNet — ưu tiên bài "giá vàng hôm nay" mới nhất trên tag,
 * parse bảng SJC / miếng.
 * Dùng khi ngày tham chiếu <= 2025-02-07 (theo yêu cầu nguồn).
 */

import { pickGoldRowFromHtml } from "./gold-html-parse";

const DEFAULT_HEADERS: HeadersInit = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "vi-VN,vi;q=0.9,en;q=0.8",
};

const TAG_URL =
  "https://vietnamnet.vn/gia-vang-hom-nay-tag13562867302245381526.html";

/**
 * Lấy URL bài mới nhất có slug gia-vang-hom-nay từ trang tag.
 */
function extractLatestGoldArticleUrl(html: string): string | null {
  const abs = html.match(
    /href="(https:\/\/vietnamnet\.vn\/gia-vang-hom-nay[^"]+\.html)"/i,
  );
  if (abs?.[1]) return abs[1];
  const rel = html.match(/href="(\/gia-vang-hom-nay[^"]+\.html)"/i);
  if (rel?.[1]) return `https://vietnamnet.vn${rel[1]}`;
  return null;
}

export async function fetchVietnamNetGoldSjcPrices(options?: {
  productKeyword?: string;
}): Promise<{ buy: number | null; sell: number | null; productName: string }> {
  const keyword = options?.productKeyword ?? "Vàng miếng SJC";

  try {
    const tagRes = await fetch(TAG_URL, {
      next: { revalidate: 300 },
      headers: DEFAULT_HEADERS,
    });
    if (!tagRes.ok) {
      return { buy: null, sell: null, productName: "N/A" };
    }
    const tagHtml = await tagRes.text();
    const articleUrl = extractLatestGoldArticleUrl(tagHtml);
    if (!articleUrl) {
      return { buy: null, sell: null, productName: "N/A" };
    }

    const artRes = await fetch(articleUrl, {
      next: { revalidate: 300 },
      headers: DEFAULT_HEADERS,
    });
    if (!artRes.ok) {
      return { buy: null, sell: null, productName: "N/A" };
    }
    const articleHtml = await artRes.text();

    const row =
      pickGoldRowFromHtml(articleHtml, keyword) ??
      pickGoldRowFromHtml(articleHtml, "SJC") ??
      pickGoldRowFromHtml(articleHtml, "miếng");

    if (row && row.buy != null && row.sell != null) {
      return {
        buy: row.buy,
        sell: row.sell,
        productName: `${row.name.trim()} (VietnamNet)`,
      };
    }
  } catch {
    /* fall through */
  }

  return { buy: null, sell: null, productName: "N/A" };
}

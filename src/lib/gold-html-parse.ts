/**
 * Parse bảng giá vàng HTML (Mua/Bán) — dùng chung cho CafeF, VietnamNet, Mạnh Hải.
 */

export function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

export function parseVndNumber(text: string): number | null {
  const m = text.match(/(\d{1,3}(?:\.\d{3})+)/);
  if (!m) return null;
  const n = parseInt(m[1].replace(/\./g, ""), 10);
  return Number.isFinite(n) ? n : null;
}

export type GoldRow = { name: string; buy: number | null; sell: number | null };

export function pickGoldRowFromHtml(
  html: string,
  keyword: string,
): GoldRow | null {
  const rows = Array.from(html.matchAll(/<tr[\s\S]*?<\/tr>/gi)).map((m) => m[0]);
  const kw = keyword.toLowerCase();
  const candidates: GoldRow[] = [];

  for (const r of rows) {
    const cells = Array.from(r.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)).map(
      (c) => stripTags(c[1] ?? ""),
    );
    if (cells.length < 3) continue;
    const name = cells[0] ?? "";
    if (!name) continue;
    const buy = parseVndNumber(cells[1] ?? "");
    const sell = parseVndNumber(cells[2] ?? "");
    if (buy == null && sell == null) continue;
    candidates.push({ name, buy, sell });
  }

  const pick =
    candidates.find((c) => c.name.toLowerCase().includes(kw) && c.buy != null && c.sell != null) ??
    candidates.find((c) => c.name.toLowerCase().includes(kw)) ??
    candidates.find((c) => c.buy != null && c.sell != null) ??
    candidates[0];

  return pick ?? null;
}

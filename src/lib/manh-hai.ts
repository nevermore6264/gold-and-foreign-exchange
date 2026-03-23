/**
 * Lấy giá vàng "MUA/BÁN - Mạnh Hải" từ trang:
 * https://baotinmanhhai.vn/gia-vang-hom-nay
 *
 * Trang không cung cấp historical API công khai, nên app sẽ:
 * - fetch giá hiện tại
 * - lưu snapshot theo ngày + khung giờ (9h/11h/14h30/17h30)
 * - đọc snapshot để hiển thị "quá khứ"
 * - nếu không có file: từ ~2025-02-08 backfill 1 giá/ngày từ lịch sử Ajax CafeF (điền cả 4 khung giờ)
 */

import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";

import {
  fetchCafeFGoldSjcPrices,
  fetchCafeFDomesticSjcByVnDateCached,
  type CafeFDomesticDailyQuote,
} from "./gold-cafef";
import { fetchVietnamNetGoldSjcPrices } from "./gold-vietnamnet";
import { getAppCacheRoot } from "./cache-dir";

const SOURCE_URL = "https://baotinmanhhai.vn/gia-vang-hom-nay";

/**
 * Từ 08/02/2025 → ưu tiên CafeF; từ 01/01/2022 đến 07/02/2025 → ưu tiên VietnamNet (bài mới nhất trên tag).
 * Luôn fallback https://baotinmanhhai.vn nếu nguồn trên không parse được bảng.
 */
export const DOMESTIC_GOLD_CAFEF_START = "2025-02-08";
const CACHE_DIR = path.join(getAppCacheRoot(), "manh-hai");

export type ManhHaiSlot = "09:00" | "11:00" | "14:30" | "17:30";

export interface ManhHaiQuote {
  buy: number | null;
  sell: number | null;
  capturedAt: string; // ISO
  productName: string;
}

export interface ManhHaiSnapshot {
  date: string; // YYYY-MM-DD (VN calendar day)
  slots: Partial<Record<ManhHaiSlot, ManhHaiQuote>>;
}

function toLocalDateStr(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function getVietnamTodayIso(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value;
  const y = get("year") ?? "1970";
  const m = get("month") ?? "01";
  const d = get("day") ?? "01";
  return `${y}-${m}-${d}`;
}

function snapshotPath(dateIso: string): string {
  const safe = dateIso.replace(/[^0-9-]/g, "");
  return path.join(CACHE_DIR, `${safe}.json`);
}

export async function readManhHaiSnapshot(dateIso: string): Promise<ManhHaiSnapshot | null> {
  try {
    const raw = await readFile(snapshotPath(dateIso), "utf-8");
    const data = JSON.parse(raw) as ManhHaiSnapshot;
    if (!data?.date || typeof data.date !== "string") return null;
    if (!data.slots || typeof data.slots !== "object") return null;
    return data;
  } catch {
    return null;
  }
}

const SLOTS_FOR_CHECK: ManhHaiSlot[] = ["09:00", "11:00", "14:30", "17:30"];

/** Có ít nhất một khung giờ đã có giá mua hoặc bán. */
export function snapshotHasAnyPrice(
  snap: ManhHaiSnapshot | null | undefined,
): boolean {
  if (!snap?.slots) return false;
  for (const s of SLOTS_FOR_CHECK) {
    const q = snap.slots[s];
    if (q != null && (q.buy != null || q.sell != null)) return true;
  }
  return false;
}

/**
 * CafeF chỉ có 1 mức giá/ngày — nhân vào 4 khung giờ để bảng đủ cột;
 * chênh lệch 9h↔17h30 = 0 (không có dữ liệu intraday lịch sử).
 */
export function buildSyntheticManhHaiSnapshotFromDailyPrice(
  dateIso: string,
  q: { buy: number; sell: number; productName: string },
): ManhHaiSnapshot {
  const capturedAt = `${dateIso}T23:59:59+07:00`;
  const quote: ManhHaiQuote = {
    buy: q.buy,
    sell: q.sell,
    capturedAt,
    productName: q.productName,
  };
  return {
    date: dateIso,
    slots: {
      "09:00": { ...quote },
      "11:00": { ...quote },
      "14:30": { ...quote },
      "17:30": { ...quote },
    },
  };
}

/**
 * Nếu không có file snapshot (hoặc rỗng) và ngày nằm trong khoảng CafeF có lịch sử,
 * điền từ bản đồ giá trong nước theo ngày (Ajax CafeF).
 */
export function mergeManhHaiSnapshotWithCafeFBackfill(
  dateIso: string,
  fileSnap: ManhHaiSnapshot | null,
  cafeByDate: Map<string, CafeFDomesticDailyQuote>,
): ManhHaiSnapshot | null {
  if (snapshotHasAnyPrice(fileSnap)) return fileSnap;
  if (dateIso < DOMESTIC_GOLD_CAFEF_START) return fileSnap;
  const q = cafeByDate.get(dateIso);
  if (!q) return fileSnap;
  return buildSyntheticManhHaiSnapshotFromDailyPrice(dateIso, q);
}

/** Dùng khi chỉ có async cache (API đơn lẻ). */
export async function resolveManhHaiSnapshotWithCafeFBackfill(
  dateIso: string,
  fileSnap: ManhHaiSnapshot | null,
): Promise<ManhHaiSnapshot | null> {
  const map = await fetchCafeFDomesticSjcByVnDateCached();
  return mergeManhHaiSnapshotWithCafeFBackfill(dateIso, fileSnap, map);
}

export async function writeManhHaiSnapshot(snapshot: ManhHaiSnapshot): Promise<void> {
  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(snapshotPath(snapshot.date), JSON.stringify(snapshot, null, 0), "utf-8");
}

function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function parseVndNumber(text: string): number | null {
  // Examples: "17.540.000" or "16.550.000"
  const m = text.match(/(\d{1,3}(?:\.\d{3})+)/);
  if (!m) return null;
  const n = parseInt(m[1].replace(/\./g, ""), 10);
  return Number.isFinite(n) ? n : null;
}

async function fetchManhHaiFromOfficialSite(options?: {
  productKeyword?: string;
}): Promise<{ buy: number | null; sell: number | null; productName: string }> {
  const res = await fetch(SOURCE_URL, {
    cache: "no-store",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "text/html, */*",
    },
  });
  if (!res.ok) throw new Error(`Mạnh Hải fetch failed: ${res.status}`);
  const html = await res.text();

  // Naive row parsing: find table rows, strip tags -> columns.
  const rows = Array.from(html.matchAll(/<tr[\s\S]*?<\/tr>/gi)).map((m) => m[0]);
  const keyword = (options?.productKeyword ?? "Vàng miếng SJC").toLowerCase();

  type Candidate = { name: string; buy: number | null; sell: number | null };
  const candidates: Candidate[] = [];

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
    candidates.find((c) => c.name.toLowerCase().includes(keyword) && c.buy != null && c.sell != null) ??
    candidates.find((c) => c.name.toLowerCase().includes(keyword)) ??
    candidates.find((c) => c.buy != null && c.sell != null) ??
    candidates[0];

  return {
    buy: pick?.buy ?? null,
    sell: pick?.sell ?? null,
    productName: pick?.name ?? "N/A",
  };
}

export async function fetchManhHaiCurrentQuote(options?: {
  /**
   * Nếu muốn cố định 1 dòng sản phẩm (khuyến nghị), truyền keyword để match theo tên.
   * Mặc định: ưu tiên "Vàng miếng SJC", fallback dòng đầu có đủ Mua/Bán.
   */
  productKeyword?: string;
  /** Ngày snapshot (YYYY-MM-DD, lịch VN) — chọn nguồn CafeF vs VietnamNet */
  dateIso?: string;
}): Promise<{ buy: number | null; sell: number | null; productName: string }> {
  const dateIso = options?.dateIso ?? getVietnamTodayIso();
  const kw = options?.productKeyword ?? "Vàng miếng SJC";

  try {
    if (dateIso >= DOMESTIC_GOLD_CAFEF_START) {
      const c = await fetchCafeFGoldSjcPrices({ productKeyword: kw });
      if (c.buy != null && c.sell != null) return c;
    } else {
      const v = await fetchVietnamNetGoldSjcPrices({ productKeyword: kw });
      if (v.buy != null && v.sell != null) return v;
    }
  } catch {
    /* fallback site chính thức */
  }

  try {
    return await fetchManhHaiFromOfficialSite({ productKeyword: kw });
  } catch (e) {
    console.error("fetchManhHaiFromOfficialSite:", e);
    return { buy: null, sell: null, productName: "N/A" };
  }
}

export function slotMinutes(slot: ManhHaiSlot): number {
  if (slot === "09:00") return 9 * 60;
  if (slot === "11:00") return 11 * 60;
  if (slot === "14:30") return 14 * 60 + 30;
  return 17 * 60 + 30;
}

export function vnNowMinutes(): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value;
  const h = parseInt(get("hour") ?? "0", 10);
  const m = parseInt(get("minute") ?? "0", 10);
  return h * 60 + m;
}


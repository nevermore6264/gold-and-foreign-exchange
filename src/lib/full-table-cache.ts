/**
 * Cache kết quả full-table theo khoảng ngày (from-to) vào file JSON.
 * Lần sau đọc từ file, không gọi API bên ngoài. Dùng ?refresh=1 để bỏ qua cache.
 */

import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import type { FullTableRow } from "./full-table";

const CACHE_DIR = path.join(process.cwd(), "cache", "full-table");
/** Cache coi như hết hạn sau 24 giờ (ms). Set 0 = không bao giờ hết hạn. */
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export interface CachedFullTable {
  rows: FullTableRow[];
  fromDate: string;
  toDate: string;
  cachedAt: string; // ISO
}

function cacheFilePath(from: string, to: string): string {
  const safe = (s: string) => s.replace(/[^0-9-]/g, "");
  return path.join(CACHE_DIR, `${safe(from)}_${safe(to)}.json`);
}

export async function readFullTableCache(
  from: string,
  to: string,
): Promise<CachedFullTable | null> {
  const filePath = cacheFilePath(from, to);
  try {
    const raw = await readFile(filePath, "utf-8");
    const data = JSON.parse(raw) as CachedFullTable;
    if (!data.rows || !Array.isArray(data.rows)) return null;
    if (CACHE_TTL_MS > 0 && data.cachedAt) {
      const age = Date.now() - new Date(data.cachedAt).getTime();
      if (age > CACHE_TTL_MS) return null;
    }
    return {
      rows: data.rows,
      fromDate: data.fromDate ?? from,
      toDate: data.toDate ?? to,
      cachedAt: data.cachedAt ?? new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export async function writeFullTableCache(
  from: string,
  to: string,
  data: { rows: FullTableRow[]; fromDate: string; toDate: string },
): Promise<void> {
  const filePath = cacheFilePath(from, to);
  try {
    await mkdir(path.dirname(filePath), { recursive: true });
    const payload: CachedFullTable = {
      ...data,
      cachedAt: new Date().toISOString(),
    };
    await writeFile(filePath, JSON.stringify(payload, null, 0), "utf-8");
  } catch (e) {
    console.warn("Full-table cache write failed:", e);
  }
}

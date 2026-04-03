/**
 * Cache kết quả full-table theo khoảng ngày (from-to) vào file JSON.
 * Lần sau đọc từ file, không gọi API bên ngoài. Dùng ?refresh=1 để bỏ qua cache.
 */

import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import type { FullTableRow } from "./full-table";

import { getAppCacheRoot } from "./cache-dir";

const CACHE_DIR = path.join(getAppCacheRoot(), "full-table");
// Bump cache version when date-key logic changes (timezone, formats, etc.)
const CACHE_VERSION = "v10";
/** Đồng bộ tần làm mới với master — tránh file JSON cũ giữ giá vàng sai so với Investing. */
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 giờ

export interface CachedFullTable {
  rows: FullTableRow[];
  fromDate: string;
  toDate: string;
  cachedAt: string; // ISO
}

function cacheFilePath(from: string, to: string): string {
  const safe = (s: string) => s.replace(/[^0-9-]/g, "");
  return path.join(CACHE_DIR, CACHE_VERSION, `${safe(from)}_${safe(to)}.json`);
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

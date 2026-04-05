/**
 * Lưu toàn bộ dòng bảng theo ngày vào 1 file JSON (merge theo col_12).
 * Lần sau các ngày đã có chỉ cần đọc từ file, không cần gọi lại API ngoài.
 *
 * **Vercel / serverless:** Investing hay bị Cloudflare 403. Đặt env `FULL_TABLE_MASTER_URL`
 * trỏ tới file JSON tĩnh (GitHub raw, Gist, R2 public, …) build bằng `npm run sync:master:local`
 * trên máy local — app sẽ đọc master từ URL thay vì gọi Investing trên server.
 * Tùy chọn `FULL_TABLE_MASTER_AUTH`: Bearer token nếu URL cần auth.
 */

import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";

import { getAppCacheRoot } from "./cache-dir";

const MASTER_PATH = path.join(getAppCacheRoot(), "full-table-dataset.json");

/** Tránh gọi URL master mỗi request (serverless). */
const REMOTE_MASTER_CACHE_MS = 60_000;

let remoteMasterCache: {
  url: string;
  fetchedAt: number;
  data: FullTableMasterFile;
} | null = null;

/**
 * Tăng khi đổi cách gộp OHLC / generate ngày — bỏ qua master cũ để build lại dữ liệu thị trường.
 * v6: Dollar Index — bổ sung fallback Yahoo chart (Investing hay chặn serverless; historical đôi khi rỗng).
 * v7: Dollar Index — ngày nến theo Asia/Ho_Chi_Minh + gộp historical+chart + tải chunk (lịch sử đủ ngày quá khứ).
 * v8: Xác minh mapping cột — bỏ master cũ nếu version lệch (tránh dữ liệu cột sai sau khi đổi schema).
 * v9: Chỉ Investing cho OHLC thị trường (bỏ Yahoo); intraday VN = MỞ daily.
 * v10: Parse historical/68 linh hoạt tên trường; giữ % từ API; chart daily theo UTC.
 * v11: Dầu daily + intraday VN = Yahoo BZ=F (Brent); fallback WTI Investing 1178037.
 * v12: Ngày nến dầu Yahoo daily theo America/New_York (khớp cột Date trên Yahoo History).
 * v13: Không forward-fill OHLC + mốc VN Yahoo khi không có phiên (T7/CN/nghỉ) — tránh trùng Yahoo History.
 * v14: Dầu — cột mốc VN (col_23–26) chỉ khi có nến ngày dầu; bỏ giá từ nến 1h ngày không có History.
 * v15: Dollar Index daily + mốc VN = Yahoo DX-Y.NYB (History ET), fallback Investing DXY; mốc VN chỉ khi có nến ngày.
 * v16: S&P 500 daily + mốc VN = Yahoo ^GSPC (History ET), fallback Investing; mốc VN chỉ khi có nến ngày.
 * v17: US 10Y daily + mốc VN = Yahoo ^TNX (History ET), fallback Investing; mốc VN chỉ khi có nến ngày.
 */
export const MARKET_SCHEMA_VERSION = 17;

/**
 * Master JSON chỉ dùng fast path nếu `updatedAt` còn mới — không thì vẫn đủ ngày nhưng OHLC (vàng/dầu/…) có thể lệch Investing.
 */
export const MASTER_MARKET_DATA_MAX_AGE_MS = 60 * 60 * 1000; // 1 giờ

export function isMasterMarketDataStale(master: FullTableMasterFile): boolean {
  if (!master.updatedAt) return true;
  const t = new Date(master.updatedAt).getTime();
  if (!Number.isFinite(t)) return true;
  return Date.now() - t > MASTER_MARKET_DATA_MAX_AGE_MS;
}

/** Đang dùng master host tĩnh — không ép `refresh` vì `updatedAt` (server không gọi được Investing). */
export function usesRemoteFullTableMaster(): boolean {
  return Boolean(process.env.FULL_TABLE_MASTER_URL?.trim());
}

function normalizeMasterParsed(raw: unknown): FullTableMasterFile {
  const data = raw as FullTableMasterFile;
  if (!data?.byDate || typeof data.byDate !== "object") {
    return { version: 1, updatedAt: new Date().toISOString(), byDate: {} };
  }
  return {
    version: 1,
    updatedAt: data.updatedAt ?? new Date().toISOString(),
    byDate: data.byDate,
    marketSchemaVersion: data.marketSchemaVersion,
  };
}

async function readMasterFromDiskOnly(): Promise<FullTableMasterFile> {
  try {
    const raw = await readFile(MASTER_PATH, "utf-8");
    return normalizeMasterParsed(JSON.parse(raw) as unknown);
  } catch {
    return { version: 1, updatedAt: new Date().toISOString(), byDate: {} };
  }
}

async function fetchMasterFromRemote(url: string): Promise<FullTableMasterFile | null> {
  try {
    const headers: HeadersInit = { Accept: "application/json" };
    const auth = process.env.FULL_TABLE_MASTER_AUTH?.trim();
    if (auth) headers["Authorization"] = `Bearer ${auth}`;
    const res = await fetch(url, { cache: "no-store", headers });
    if (!res.ok) return null;
    const text = await res.text();
    return normalizeMasterParsed(JSON.parse(text) as unknown);
  } catch {
    return null;
  }
}

function cloneMaster(m: FullTableMasterFile): FullTableMasterFile {
  return {
    version: 1,
    updatedAt: m.updatedAt,
    byDate: { ...m.byDate },
    marketSchemaVersion: m.marketSchemaVersion,
  };
}

/** Cùng shape với FullTableRow trong full-table.ts */
export type MasterTableRow = Record<string, string | number | null>;

export interface FullTableMasterFile {
  version: 1;
  updatedAt: string;
  /** key = YYYY-MM-DD (col_12) */
  byDate: Record<string, MasterTableRow>;
  /** Khớp MARKET_SCHEMA_VERSION — file cũ không có field này sẽ bị bỏ qua fast path */
  marketSchemaVersion?: number;
}

export async function readFullTableMaster(): Promise<FullTableMasterFile> {
  const url = process.env.FULL_TABLE_MASTER_URL?.trim();
  if (url) {
    const now = Date.now();
    if (
      remoteMasterCache &&
      remoteMasterCache.url === url &&
      now - remoteMasterCache.fetchedAt < REMOTE_MASTER_CACHE_MS
    ) {
      return cloneMaster(remoteMasterCache.data);
    }
    const remote = await fetchMasterFromRemote(url);
    if (remote && Object.keys(remote.byDate).length > 0) {
      remoteMasterCache = { url, fetchedAt: now, data: remote };
      return cloneMaster(remote);
    }
    const disk = await readMasterFromDiskOnly();
    if (Object.keys(disk.byDate).length > 0) return disk;
    return remote ?? disk;
  }
  return readMasterFromDiskOnly();
}

/**
 * Merge các dòng mới vào file master (ghi đè theo ngày).
 */
export async function mergeRowsIntoFullTableMaster(
  rows: MasterTableRow[],
): Promise<void> {
  const master = await readFullTableMaster();
  for (const row of rows) {
    const date = row.col_12;
    if (typeof date !== "string" || !date) continue;
    master.byDate[date] = { ...row };
  }
  master.updatedAt = new Date().toISOString();
  master.marketSchemaVersion = MARKET_SCHEMA_VERSION;
  const url = process.env.FULL_TABLE_MASTER_URL?.trim();
  if (url) {
    remoteMasterCache = {
      url,
      fetchedAt: Date.now(),
      data: {
        version: 1,
        updatedAt: master.updatedAt,
        byDate: { ...master.byDate },
        marketSchemaVersion: master.marketSchemaVersion,
      },
    };
  }
  await mkdir(path.dirname(MASTER_PATH), { recursive: true });
  await writeFile(MASTER_PATH, JSON.stringify(master, null, 0), "utf-8");
}

export function hasAllDatesInMaster(
  master: FullTableMasterFile,
  dates: string[],
): boolean {
  if (master.marketSchemaVersion !== MARKET_SCHEMA_VERSION) return false;
  if (dates.length === 0) return false;
  return dates.every((d) => {
    const r = master.byDate[d];
    return r != null && r.col_12 === d;
  });
}

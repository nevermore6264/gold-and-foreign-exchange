/**
 * Lưu toàn bộ dòng bảng theo ngày vào 1 file JSON (merge theo col_12).
 * Lần sau các ngày đã có chỉ cần đọc từ file, không cần gọi lại API ngoài.
 */

import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";

const MASTER_PATH = path.join(process.cwd(), "cache", "full-table-dataset.json");

/** Cùng shape với FullTableRow trong full-table.ts */
export type MasterTableRow = Record<string, string | number | null>;

export interface FullTableMasterFile {
  version: 1;
  updatedAt: string;
  /** key = YYYY-MM-DD (col_12) */
  byDate: Record<string, MasterTableRow>;
}

export async function readFullTableMaster(): Promise<FullTableMasterFile> {
  try {
    const raw = await readFile(MASTER_PATH, "utf-8");
    const data = JSON.parse(raw) as FullTableMasterFile;
    if (!data.byDate || typeof data.byDate !== "object") {
      return { version: 1, updatedAt: new Date().toISOString(), byDate: {} };
    }
    return {
      version: 1,
      updatedAt: data.updatedAt ?? new Date().toISOString(),
      byDate: data.byDate,
    };
  } catch {
    return { version: 1, updatedAt: new Date().toISOString(), byDate: {} };
  }
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
  await mkdir(path.dirname(MASTER_PATH), { recursive: true });
  await writeFile(MASTER_PATH, JSON.stringify(master, null, 0), "utf-8");
}

export function hasAllDatesInMaster(
  master: FullTableMasterFile,
  dates: string[],
): boolean {
  if (dates.length === 0) return false;
  return dates.every((d) => {
    const r = master.byDate[d];
    return r != null && r.col_12 === d;
  });
}

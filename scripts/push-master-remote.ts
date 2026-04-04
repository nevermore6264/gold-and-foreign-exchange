/**
 * Đọc cache/full-table-dataset.json local và POST lên máy chủ có API master-import.
 *
 * Env:
 *   PUSH_MASTER_URL   — ví dụ https://your-host.com/api/master-import
 *   MASTER_IMPORT_SECRET — cùng giá trị với env trên server
 *
 *   npx tsx scripts/push-master-remote.ts
 *
 * Chỉ hữu ích khi server **ghi được** file master bền (VPS/Docker volume), không phải Vercel ephemeral /tmp.
 */

import { readFile } from "fs/promises";
import path from "path";

import { getAppCacheRoot } from "@/lib/cache-dir";
import type { FullTableMasterFile } from "@/lib/full-table-master-json";

async function main() {
  const url = process.env.PUSH_MASTER_URL?.trim();
  const secret = process.env.MASTER_IMPORT_SECRET?.trim();
  if (!url || !secret) {
    console.error("Thiếu PUSH_MASTER_URL hoặc MASTER_IMPORT_SECRET.");
    process.exit(1);
  }

  const masterPath = path.join(getAppCacheRoot(), "full-table-dataset.json");
  const raw = await readFile(masterPath, "utf-8");
  const master = JSON.parse(raw) as FullTableMasterFile;
  const byDate = master.byDate ?? {};

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify({ byDate }),
  });

  const text = await res.text();
  if (!res.ok) {
    console.error(res.status, text);
    process.exit(1);
  }
  console.log(text);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

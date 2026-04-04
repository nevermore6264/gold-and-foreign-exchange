/**
 * Đồng bộ master JSON trên máy **local** — gọi Investing (và VCB, Yahoo intraday, …) từ IP trình duyệt/mạng nhà,
 * thường qua Cloudflare dễ hơn serverless.
 *
 * Chạy từ thư mục gốc repo:
 *   npx tsx scripts/sync-master-local.ts [from] [to]
 *   npm run sync:master:local -- 2026-01-01 2026-04-30
 *
 * Ghi: cache/full-table-dataset.json (xem getAppCacheRoot).
 */

import { getFullTableRange, START_DATE } from "@/lib/full-table";
import { mergeRowsIntoFullTableMaster } from "@/lib/full-table-master-json";

async function main() {
  const toDefault = new Date().toISOString().slice(0, 10);
  const from = process.argv[2] ?? START_DATE;
  const to = process.argv[3] ?? toDefault;

  console.log(`getFullTableRange(${from}, ${to}) …`);
  const { rows } = await getFullTableRange(from, to);
  console.log(`→ ${rows.length} dòng, merge vào master…`);
  await mergeRowsIntoFullTableMaster(rows);
  console.log("Xong.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

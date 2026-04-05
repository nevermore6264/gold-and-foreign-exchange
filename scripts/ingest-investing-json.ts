/**
 * Đọc JSON đã lưu từ DevTools (Network → Response → Save) trong thư mục:
 *   cache/investing-import/
 *
 * Tên file (UTF-8 JSON body thuần, không phải HAR):
 *   historical-68.json     — GET .../historical/68?start-date&end-date&...
 *   chart-8830.json        — XAU chart (nếu không dùng 68)
 *   chart-1178037.json     — dầu WTI (inject override; app ưu tiên Yahoo BZ=F cho OHLC dầu)
 *   chart-1224074.json     — Dollar Index
 *   chart-23705.json       — US 10Y
 *   chart-166.json         — S&P 500
 *
 * Thiếu file → mã đó vẫn fetch từ mạng (có thể 403 trên server; local thường ổn hơn).
 *
 *   npx tsx scripts/ingest-investing-json.ts [from] [to]
 *   npm run sync:master:ingest -- 2026-01-01 2026-04-30
 */

import { access, readFile } from "fs/promises";
import path from "path";
import { constants } from "fs";

import { getFullTableRange, START_DATE } from "@/lib/full-table";
import type { GetFullTableInvestingOhlcOverride } from "@/lib/full-table";
import { mergeRowsIntoFullTableMaster } from "@/lib/full-table-master-json";
import {
  parseOhlcFromChartJson,
  parseOhlcFromHistoricalTableJson,
} from "@/lib/investing";

const IMPORT_DIR = path.join(process.cwd(), "cache", "investing-import");

function addDaysIso(iso: string, deltaDays: number): string {
  const [y, m, d] = iso.split("-").map((x) => parseInt(x, 10));
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
  dt.setDate(dt.getDate() + deltaDays);
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

const LOOKBACK = 10;

async function readJsonIfExists(file: string): Promise<unknown | null> {
  const p = path.join(IMPORT_DIR, file);
  try {
    await access(p, constants.R_OK);
    return JSON.parse(await readFile(p, "utf-8")) as unknown;
  } catch {
    return null;
  }
}

async function main() {
  const toDefault = new Date().toISOString().slice(0, 10);
  const from = process.argv[2] ?? START_DATE;
  const to = process.argv[3] ?? toDefault;

  const fetchFrom =
    from <= START_DATE
      ? START_DATE
      : addDaysIso(from, -LOOKBACK) < START_DATE
        ? START_DATE
        : addDaysIso(from, -LOOKBACK);

  const inj: GetFullTableInvestingOhlcOverride = {};

  const h68 = await readJsonIfExists("historical-68.json");
  const c8830 = await readJsonIfExists("chart-8830.json");
  if (h68 != null) {
    inj.xauUsd = parseOhlcFromHistoricalTableJson(h68, fetchFrom, to);
    console.log("XAU: historical-68.json →", inj.xauUsd.length, "dòng");
  } else if (c8830 != null) {
    inj.xauUsd = parseOhlcFromChartJson(c8830, fetchFrom, to);
    console.log("XAU: chart-8830.json →", inj.xauUsd.length, "dòng");
  }

  const oil = await readJsonIfExists("chart-1178037.json");
  if (oil != null) {
    inj.crudeOil = parseOhlcFromChartJson(oil, fetchFrom, to);
    console.log("Dầu: chart-1178037.json →", inj.crudeOil.length, "dòng");
  }

  const dxy = await readJsonIfExists("chart-1224074.json");
  if (dxy != null) {
    inj.dollarIndex = parseOhlcFromChartJson(dxy, fetchFrom, to);
    console.log("DXY: chart-1224074.json →", inj.dollarIndex.length, "dòng");
  }

  const bond = await readJsonIfExists("chart-23705.json");
  if (bond != null) {
    inj.us10yBond = parseOhlcFromChartJson(bond, fetchFrom, to);
    console.log("US10Y: chart-23705.json →", inj.us10yBond.length, "dòng");
  }

  const sp = await readJsonIfExists("chart-166.json");
  if (sp != null) {
    inj.sp500 = parseOhlcFromChartJson(sp, fetchFrom, to);
    console.log("S&P: chart-166.json →", inj.sp500.length, "dòng");
  }

  const hasAny = Object.keys(inj).length > 0;
  console.log(
    `getFullTableRange(${from}, ${to}) ${hasAny ? "với inject file" : "— không có file import, toàn bộ fetch mạng"}…`,
  );

  const { rows } = await getFullTableRange(from, to, {
    investingOhlc: hasAny ? inj : undefined,
  });
  console.log(`→ ${rows.length} dòng, merge master…`);
  await mergeRowsIntoFullTableMaster(rows);
  console.log("Xong.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

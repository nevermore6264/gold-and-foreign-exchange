import {
  applyManhHaiSnapshotToRow,
  getFullTable,
  getFullTableRange,
  generateAllDates,
  type FullTableRow,
} from "@/lib/full-table";
import { fetchCafeFDomesticSjcByVnDateCached } from "@/lib/gold-cafef";
import {
  mergeManhHaiSnapshotWithCafeFBackfill,
  readManhHaiSnapshot,
} from "@/lib/manh-hai";
import {
  readFullTableCache,
  writeFullTableCache,
} from "@/lib/full-table-cache";
import {
  hasAllDatesInMaster,
  isMasterMarketDataStale,
  mergeRowsIntoFullTableMaster,
  readFullTableMaster,
  usesRemoteFullTableMaster,
} from "@/lib/full-table-master-json";
import { buildInvestingDebugForApi } from "@/lib/investing";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 120;

/**
 * Query: `refresh=1` — bỏ qua master JSON + file cache, gọi lại Investing (dùng khi cần khớp tức thì trang historical).
 * Query: `debug=1` — `_debug`: probe XAU `historical/68` cho khoảng request + **tháng 4** và chart daily.
 * Query: `debugAprilYear=YYYY` (kèm debug=1) — năm của tháng 4 probe (khớp năm đang xem khi chunk khác năm).
 * Env `FULL_TABLE_MASTER_URL` — master JSON tĩnh (Vercel: tránh Investing bị Cloudflare trên server).
 * CSV trên client lấy cùng JSON từ route này — không có pipeline CSV riêng.
 */

/** Luôn merge snapshot Mạnh Hải mới nhất (master/cache có thể cũ ở col_1..10). */
async function patchRowsWithManhHaiSnapshots(
  rows: FullTableRow[],
): Promise<FullTableRow[]> {
  const cafeDomesticByDate = await fetchCafeFDomesticSjcByVnDateCached();
  return Promise.all(
    rows.map(async (r) => {
      const date = r.col_12;
      if (typeof date !== "string" || !date) return r;
      const fileSnap = await readManhHaiSnapshot(date);
      const snap = mergeManhHaiSnapshotWithCafeFBackfill(
        date,
        fileSnap,
        cafeDomesticByDate,
      );
      const next = { ...r };
      applyManhHaiSnapshotToRow(next, snap);
      return next;
    }),
  );
}

export async function GET(request: NextRequest) {
  try {
    const from = request.nextUrl.searchParams.get("from");
    const to = request.nextUrl.searchParams.get("to");
    const refresh = request.nextUrl.searchParams.get("refresh") === "1";
    const debug = request.nextUrl.searchParams.get("debug") === "1";
    const debugAprilYearRaw =
      request.nextUrl.searchParams.get("debugAprilYear");
    const debugAprilYear =
      debugAprilYearRaw != null
        ? parseInt(debugAprilYearRaw, 10)
        : undefined;

    const debugPayload =
      debug && from && to
        ? await buildInvestingDebugForApi(
            from,
            to,
            Number.isFinite(debugAprilYear) ? debugAprilYear : undefined,
          )
        : undefined;

    const withDebug = <T extends object>(body: T) =>
      debugPayload !== undefined
        ? { ...body, _debug: debugPayload }
        : body;

    if (!from || !to) {
      const data = await getFullTable();
      return NextResponse.json(withDebug(data));
    }

    if (!refresh) {
      // Fast path: master đủ ngày + chưa quá cũ (OHLC thị trường phải khớp Investing gần đây)
      const dates = generateAllDates(from, to);
      const master = await readFullTableMaster();
      const masterFreshEnough =
        !isMasterMarketDataStale(master) || usesRemoteFullTableMaster();
      if (hasAllDatesInMaster(master, dates) && masterFreshEnough) {
        const rows = await patchRowsWithManhHaiSnapshots(
          dates.map((d) => ({ ...master.byDate[d]! })),
        );
        return NextResponse.json(
          withDebug({
            rows,
            fromDate: from,
            toDate: to,
          }),
        );
      }

      // Fallback: cache theo từng khoảng from-to (cũ)
      const cached = await readFullTableCache(from, to);
      if (cached) {
        const rows = await patchRowsWithManhHaiSnapshots(cached.rows);
        return NextResponse.json(
          withDebug({
            rows,
            fromDate: cached.fromDate,
            toDate: cached.toDate,
          }),
        );
      }
    }

    const data = await getFullTableRange(from, to);
    await writeFullTableCache(from, to, data);
    // Merge vào master — trên Vercel phải ghi /tmp; nếu vẫn lỗi thì vẫn trả JSON.
    try {
      await mergeRowsIntoFullTableMaster(data.rows);
    } catch (mergeErr) {
      console.error("mergeRowsIntoFullTableMaster:", mergeErr);
    }
    return NextResponse.json(withDebug(data));
  } catch (e) {
    console.error("Full table API error:", e);
    return NextResponse.json(
      { error: "Không thể tạo bảng dữ liệu." },
      { status: 500 },
    );
  }
}

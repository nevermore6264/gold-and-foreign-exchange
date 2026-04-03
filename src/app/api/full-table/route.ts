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
} from "@/lib/full-table-master-json";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 120;

/**
 * Query: `refresh=1` — bỏ qua master JSON + file cache, gọi lại Investing (dùng khi cần khớp tức thì trang historical).
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

    if (!from || !to) {
      const data = await getFullTable();
      return NextResponse.json(data);
    }

    if (!refresh) {
      // Fast path: master đủ ngày + chưa quá cũ (OHLC thị trường phải khớp Investing gần đây)
      const dates = generateAllDates(from, to);
      const master = await readFullTableMaster();
      if (
        hasAllDatesInMaster(master, dates) &&
        !isMasterMarketDataStale(master)
      ) {
        const rows = await patchRowsWithManhHaiSnapshots(
          dates.map((d) => ({ ...master.byDate[d]! })),
        );
        return NextResponse.json({
          rows,
          fromDate: from,
          toDate: to,
        });
      }

      // Fallback: cache theo từng khoảng from-to (cũ)
      const cached = await readFullTableCache(from, to);
      if (cached) {
        const rows = await patchRowsWithManhHaiSnapshots(cached.rows);
        return NextResponse.json({
          rows,
          fromDate: cached.fromDate,
          toDate: cached.toDate,
        });
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
    return NextResponse.json(data);
  } catch (e) {
    console.error("Full table API error:", e);
    return NextResponse.json(
      { error: "Không thể tạo bảng dữ liệu." },
      { status: 500 },
    );
  }
}

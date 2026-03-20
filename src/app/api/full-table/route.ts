import { getFullTable, getFullTableRange, generateAllDates } from "@/lib/full-table";
import {
  readFullTableCache,
  writeFullTableCache,
} from "@/lib/full-table-cache";
import {
  hasAllDatesInMaster,
  mergeRowsIntoFullTableMaster,
  readFullTableMaster,
} from "@/lib/full-table-master-json";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 120;

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
      // Fast path: nếu master JSON đã có đủ tất cả ngày trong khoảng
      const dates = generateAllDates(from, to);
      const master = await readFullTableMaster();
      if (hasAllDatesInMaster(master, dates)) {
        return NextResponse.json({
          rows: dates.map((d) => master.byDate[d]!),
          fromDate: from,
          toDate: to,
        });
      }

      // Fallback: cache theo từng khoảng from-to (cũ)
      const cached = await readFullTableCache(from, to);
      if (cached) {
        return NextResponse.json({
          rows: cached.rows,
          fromDate: cached.fromDate,
          toDate: cached.toDate,
        });
      }
    }

    const data = await getFullTableRange(from, to);
    await writeFullTableCache(from, to, data);
    // Merge vào master để lần sau có thể đọc thẳng không cần fetch API ngoài
    await mergeRowsIntoFullTableMaster(data.rows);
    return NextResponse.json(data);
  } catch (e) {
    console.error("Full table API error:", e);
    return NextResponse.json(
      { error: "Không thể tạo bảng dữ liệu." },
      { status: 500 },
    );
  }
}

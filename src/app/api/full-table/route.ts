import { getFullTable, getFullTableRange } from "@/lib/full-table";
import {
  readFullTableCache,
  writeFullTableCache,
} from "@/lib/full-table-cache";
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
    return NextResponse.json(data);
  } catch (e) {
    console.error("Full table API error:", e);
    return NextResponse.json(
      { error: "Không thể tạo bảng dữ liệu." },
      { status: 500 },
    );
  }
}

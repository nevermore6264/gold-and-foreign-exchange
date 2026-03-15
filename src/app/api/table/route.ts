import { getCombinedTable, getCombinedTableRange } from "@/lib/table";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  try {
    const from = request.nextUrl.searchParams.get("from");
    const to = request.nextUrl.searchParams.get("to");
    const data =
      from && to
        ? await getCombinedTableRange(from, to)
        : await getCombinedTable();
    return NextResponse.json(data);
  } catch (e) {
    console.error("Table API error:", e);
    return NextResponse.json(
      { error: "Không thể tạo bảng dữ liệu." },
      { status: 500 },
    );
  }
}

import { getGoldData } from "@/lib/gold";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const data = await getGoldData();
    return NextResponse.json(data);
  } catch (e) {
    console.error("Gold API error:", e);
    return NextResponse.json(
      { error: "Không thể tải dữ liệu giá vàng." },
      { status: 500 },
    );
  }
}

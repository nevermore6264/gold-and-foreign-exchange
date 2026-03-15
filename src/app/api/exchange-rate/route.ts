import { fetchVietcombankRates } from "@/lib/vietcombank";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const data = await fetchVietcombankRates();
    return NextResponse.json(data);
  } catch (e) {
    console.error("Exchange rate API error:", e);
    return NextResponse.json(
      { error: "Không thể tải tỷ giá Vietcombank." },
      { status: 500 },
    );
  }
}

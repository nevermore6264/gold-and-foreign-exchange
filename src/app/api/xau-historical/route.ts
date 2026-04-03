import { NextResponse } from "next/server";
import { fetchInvestingXauUsd } from "@/lib/investing";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  if (!from || !to) {
    return NextResponse.json({ error: "missing from/to" }, { status: 400 });
  }

  const rows = await fetchInvestingXauUsd(from, to);
  const last = rows.length ? rows[rows.length - 1] : null;

  return NextResponse.json({
    from,
    to,
    source: "investing",
    count: rows.length,
    last,
  });
}

import { mergeRowsIntoFullTableMaster } from "@/lib/full-table-master-json";
import type { MasterTableRow } from "@/lib/full-table-master-json";
import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

function authSecretOk(headerSecret: string | null, envSecret: string): boolean {
  if (!headerSecret || !envSecret) return false;
  const a = Buffer.from(headerSecret.trim(), "utf8");
  const b = Buffer.from(envSecret.trim(), "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function getBearerSecret(request: NextRequest): string | null {
  const h = request.headers.get("authorization");
  if (!h?.startsWith("Bearer ")) return null;
  return h.slice(7).trim() || null;
}

/**
 * POST — merge `rows` hoặc toàn bộ `byDate` vào `cache/full-table-dataset.json` trên **máy chủ này**.
 *
 * Header: `Authorization: Bearer <MASTER_IMPORT_SECRET>`
 *
 * Body: `{ "rows": MasterTableRow[] }` hoặc `{ "byDate": Record<string, MasterTableRow> }`
 *
 * **Lưu ý Vercel/serverless:** filesystem `/tmp` không bền giữa request — API này phù hợp máy chủ có ổ đĩa
 * (Docker volume, VPS) hoặc `next dev` local. Trên Vercel chỉ có tác dụng trong phiên instance ngắn.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.MASTER_IMPORT_SECRET ?? "";
  if (!secret) {
    return NextResponse.json(
      {
        error:
          "Chưa cấu hình MASTER_IMPORT_SECRET — từ chối import (tránh endpoint mở).",
      },
      { status: 503 },
    );
  }

  const provided =
    getBearerSecret(request) ?? request.headers.get("x-master-secret");
  if (!authSecretOk(provided, secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const o = body as { rows?: unknown; byDate?: unknown };
  let rows: MasterTableRow[] = [];

  if (Array.isArray(o.rows)) {
    rows = o.rows as MasterTableRow[];
  } else if (o.byDate && typeof o.byDate === "object" && o.byDate !== null) {
    rows = Object.values(o.byDate as Record<string, MasterTableRow>);
  } else {
    return NextResponse.json(
      { error: "Cần `rows: []` hoặc `byDate: {}`." },
      { status: 400 },
    );
  }

  if (rows.length === 0) {
    return NextResponse.json({ error: "Không có dòng nào." }, { status: 400 });
  }
  if (rows.length > 15_000) {
    return NextResponse.json(
      { error: "Quá 15000 dòng — chia nhỏ request." },
      { status: 400 },
    );
  }

  for (const r of rows) {
    if (typeof r?.col_12 !== "string" || !r.col_12) {
      return NextResponse.json(
        { error: "Mỗi dòng phải có col_12 (YYYY-MM-DD)." },
        { status: 400 },
      );
    }
  }

  try {
    await mergeRowsIntoFullTableMaster(rows);
  } catch (e) {
    console.error("master-import merge:", e);
    return NextResponse.json(
      { error: "Ghi master thất bại (quyền ghi thư mục cache?)." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    mergedRows: rows.length,
  });
}

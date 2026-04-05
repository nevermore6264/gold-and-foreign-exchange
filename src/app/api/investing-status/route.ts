import { fetchInvestingApiCallStatusReport } from "@/lib/investing";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

function addDaysIso(iso: string, deltaDays: number): string {
  const [y, m, d] = iso.split("-").map((x) => parseInt(x, 10));
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
  dt.setDate(dt.getDate() + deltaDays);
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * GET — danh sách request tới `api.investing.com` mà app dùng (probe), kèm **HTTP status**.
 *
 * Query:
 * - `from`, `to` (YYYY-MM-DD) — khoảng cho historical/68 “request range”; mặc định `to` = hôm nay, `from` = to − 7 ngày.
 * - `debugAprilYear` — năm tháng 4 cho các probe còn lại (mặc định = năm của `to`).
 *
 * Ví dụ: `/api/investing-status?from=2026-04-01&to=2026-04-05&debugAprilYear=2026`
 */
export async function GET(request: NextRequest) {
  try {
    const toParam = request.nextUrl.searchParams.get("to");
    const to =
      toParam && /^\d{4}-\d{2}-\d{2}$/.test(toParam)
        ? toParam
        : new Date().toISOString().slice(0, 10);
    const fromParam = request.nextUrl.searchParams.get("from");
    const from =
      fromParam && /^\d{4}-\d{2}-\d{2}$/.test(fromParam)
        ? fromParam
        : addDaysIso(to, -7);

    const debugAprilYearRaw =
      request.nextUrl.searchParams.get("debugAprilYear");
    const debugAprilYear =
      debugAprilYearRaw != null
        ? parseInt(debugAprilYearRaw, 10)
        : undefined;

    const report = await fetchInvestingApiCallStatusReport(
      from,
      to,
      Number.isFinite(debugAprilYear) ? debugAprilYear : undefined,
    );

    return NextResponse.json({
      ok: true,
      queriedAt: new Date().toISOString(),
      requestRange: { from, to },
      /** 5 khối bảng: KITCO, dầu, DXY, US10Y, S&P — nguồn + status ngắn */
      khoiBangNgan: report.khoiBangNgan,
      summary: {
        totalCalls: report.calls.length,
        okCount: report.calls.filter((c) => c.httpOk && c.responseLooksLikeJson)
          .length,
        cloudflareLikeCount: report.calls.filter((c) => c.cloudflareChallengeHtml)
          .length,
      },
      calls: report.calls,
      accessBlocked: report.accessBlocked ?? null,
      vercelMasterUrlHint: report.vercelMasterUrlHint ?? null,
    });
  } catch (e) {
    console.error("investing-status:", e);
    return NextResponse.json(
      { ok: false, error: String(e) },
      { status: 500 },
    );
  }
}

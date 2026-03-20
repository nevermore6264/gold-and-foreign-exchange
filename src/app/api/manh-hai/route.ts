import { NextRequest, NextResponse } from "next/server";
import {
  fetchManhHaiCurrentQuote,
  getVietnamTodayIso,
  readManhHaiSnapshot,
  slotMinutes,
  type ManhHaiSlot,
  vnNowMinutes,
  writeManhHaiSnapshot,
} from "@/lib/manh-hai";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SLOTS: ManhHaiSlot[] = ["09:00", "11:00", "14:30", "17:30"];

export async function GET(request: NextRequest) {
  try {
    const date = request.nextUrl.searchParams.get("date") || getVietnamTodayIso();
    const keyword =
      request.nextUrl.searchParams.get("keyword") || "Vàng miếng SJC";

    const nowMin = vnNowMinutes();
    const snapshot = (await readManhHaiSnapshot(date)) ?? { date, slots: {} };

    // Nếu đã qua 1 slot giờ và slot đó chưa có snapshot, thì capture.
    const dueSlots = SLOTS.filter((s) => nowMin >= slotMinutes(s));
    const missing = dueSlots.filter((s) => !snapshot.slots[s]);

    if (missing.length > 0) {
      const q = await fetchManhHaiCurrentQuote({ productKeyword: keyword });
      const capturedAt = new Date().toISOString();
      for (const s of missing) {
        snapshot.slots[s] = {
          buy: q.buy,
          sell: q.sell,
          capturedAt,
          productName: q.productName,
        };
      }
      await writeManhHaiSnapshot(snapshot);
    }

    return NextResponse.json({
      date: snapshot.date,
      keyword,
      slots: snapshot.slots,
      nowMinutes: nowMin,
    });
  } catch (e) {
    console.error("ManhHai API error:", e);
    return NextResponse.json(
      { error: "Không thể tải dữ liệu Mạnh Hải." },
      { status: 500 },
    );
  }
}


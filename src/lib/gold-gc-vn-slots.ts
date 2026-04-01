/**
 * Giá vàng GC=F (COMEX): lấy giá tại các mốc 9h / 11h / 14h30 / 17h30 theo **giờ lịch Việt Nam**
 * (cùng logic với khung Mạnh Hải), bằng nến 1h từ Yahoo chart.
 *
 * MỞ / ĐÓNG / Cao / Thấp / % vẫn lấy từ OHLC ngày; 4 cột giữa lấy từ intraday tại các mốc trên.
 */

import {
  fetchYahoo1hVnSlotsByDateRange,
  type Yahoo1hVnSlots,
} from "./yahoo-1h-vn-slots";

const GC_F = "GC=F";

export type GoldGcVnSlots = Yahoo1hVnSlots;

/**
 * Trả về map theo ngày lịch VN (YYYY-MM-DD) — trùng col_12 trong bảng.
 */
export async function fetchGoldGcVnSlotsByDateRange(
  fromIso: string,
  toIso: string,
): Promise<Map<string, GoldGcVnSlots>> {
  return fetchYahoo1hVnSlotsByDateRange(GC_F, fromIso, toIso);
}

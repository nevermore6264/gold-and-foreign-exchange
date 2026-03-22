/**
 * Chỉ số cột bảng (col_1 … col_10) ↔ MUA / BÁN Mạnh Hải.
 * Tách file để import an toàn từ Client Components (không kéo theo fs).
 *
 * - MUA: giá Mua 9h / 11h / 14h30 / 17h30 (VN); cột 5 = chênh (Đóng−Mở).
 * - BÁN: giá Bán tương ứng; cột 10 = chênh; cột 9 = Bán 17h30 (công thức ∑ chỉ vàng).
 */
export const MANH_HAI_COL = {
  MUA_9H: 1,
  MUA_11H: 2,
  MUA_14H30: 3,
  MUA_17H30: 4,
  MUA_CHENH_LECH: 5,
  BAN_9H: 6,
  BAN_11H: 7,
  BAN_14H30: 8,
  BAN_17H30: 9,
  BAN_CHENH_LECH: 10,
} as const;

/** Thứ tự khung giờ (VN) — trùng với snapshot API */
export const MANH_HAI_SLOTS_ORDER = [
  "09:00",
  "11:00",
  "14:30",
  "17:30",
] as const;

export type ManhHaiSlotKey = (typeof MANH_HAI_SLOTS_ORDER)[number];

export function manhHaiSlotMinutes(slot: ManhHaiSlotKey): number {
  if (slot === "09:00") return 9 * 60;
  if (slot === "11:00") return 11 * 60;
  if (slot === "14:30") return 14 * 60 + 30;
  return 17 * 60 + 30;
}

/**
 * Thứ tự cột bảng (trùng page.tsx) — col_0 / 58 / 59 không render.
 */
export const TABLE_COL_ORDER: number[] = [
  0, 11, 12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 61, 62, 13, 14, 15, 16, 17, 18, 19, 20,
  21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41,
  42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 60,
];

/** Nhóm có thể bật/tắt (Thứ & Ngày luôn hiển thị). */
export type ToggleableColGroup =
  | "muaMh"
  | "banMh"
  | "sumCols"
  | "kitco"
  | "oil"
  | "dollar"
  | "bond"
  | "sp500"
  | "vcb";

export const TOGGLEABLE_GROUPS: ToggleableColGroup[] = [
  "muaMh",
  "banMh",
  "sumCols",
  "kitco",
  "oil",
  "dollar",
  "bond",
  "sp500",
  "vcb",
];

export const GROUP_LABELS_VI: Record<ToggleableColGroup, string> = {
  muaMh: "MUA – Mạnh Hải",
  banMh: "BÁN – Mạnh Hải",
  sumCols: "∑ chỉ vàng / ∑ thêm",
  kitco: "KITCO – Giá vàng TG",
  oil: "Giá dầu",
  dollar: "Dollar Index",
  bond: "Trái phiếu US 10Y",
  sp500: "S&P 500",
  vcb: "Tỷ giá VCB",
};

export const DEFAULT_COLUMN_VISIBILITY: Record<ToggleableColGroup, boolean> =
  TOGGLEABLE_GROUPS.reduce(
    (acc, g) => {
      acc[g] = true;
      return acc;
    },
    {} as Record<ToggleableColGroup, boolean>,
  );

export const LS_COLUMN_VISIBILITY = "gia-vang-column-visibility-v1";

export function colGroupForDataColumn(j: number): ToggleableColGroup | null {
  if (j === 11 || j === 12) return null;
  if (j >= 1 && j <= 5) return "muaMh";
  if (j >= 6 && j <= 10) return "banMh";
  if (j === 61 || j === 62) return "sumCols";
  if (j >= 13 && j <= 21) return "kitco";
  if (j >= 22 && j <= 30) return "oil";
  if (j >= 31 && j <= 39) return "dollar";
  if (j >= 40 && j <= 48) return "bond";
  if (j >= 49 && j <= 57) return "sp500";
  if (j === 60) return "vcb";
  return null;
}

export function isColumnVisible(
  j: number,
  vis: Record<ToggleableColGroup, boolean>,
): boolean {
  if (j === 0 || j === 58 || j === 59) return false;
  if (j === 11 || j === 12) return true;
  const g = colGroupForDataColumn(j);
  if (!g) return false;
  return vis[g] !== false;
}

/** Nhãn 1 dòng cho CSV (UTF-8 BOM + delimiter ,). */
export const CSV_COL_LABELS: Record<number, string> = {
  11: "Thứ",
  12: "Ngày",
  1: "MUA_9h_VN",
  2: "MUA_11h_VN",
  3: "MUA_14h30_VN",
  4: "MUA_17h30_VN",
  5: "MUA_CHENH_Dong_Mo",
  6: "BAN_9h_VN",
  7: "BAN_11h_VN",
  8: "BAN_14h30_VN",
  9: "BAN_17h30_VN",
  10: "BAN_CHENH_Dong_Mo",
  61: "SUM_chi_vang",
  62: "SUM_chi_vang_them",
  13: "KITCO_0h",
  14: "KITCO_9h_VN",
  15: "KITCO_11h_VN",
  16: "KITCO_14h30_VN",
  17: "KITCO_17h30_VN",
  18: "KITCO_24h",
  19: "KITCO_Cao",
  20: "KITCO_Thap",
  21: "KITCO_Thay_doi_pct",
  22: "DAU_0h",
  23: "DAU_9h_VN",
  24: "DAU_11h_VN",
  25: "DAU_14h30_VN",
  26: "DAU_17h30_VN",
  27: "DAU_24h",
  28: "DAU_Cao",
  29: "DAU_Thap",
  30: "DAU_Thay_doi_pct",
  31: "DXY_0h",
  32: "DXY_9h_VN",
  33: "DXY_11h_VN",
  34: "DXY_14h30_VN",
  35: "DXY_17h30_VN",
  36: "DXY_24h",
  37: "DXY_Cao",
  38: "DXY_Thap",
  39: "DXY_Thay_doi_pct",
  40: "BOND10Y_0h",
  41: "BOND10Y_9h_VN",
  42: "BOND10Y_11h_VN",
  43: "BOND10Y_14h30_VN",
  44: "BOND10Y_17h30_VN",
  45: "BOND10Y_24h",
  46: "BOND10Y_Cao",
  47: "BOND10Y_Thap",
  48: "BOND10Y_Thay_doi_pct",
  49: "SP500_0h",
  50: "SP500_9h_VN",
  51: "SP500_11h_VN",
  52: "SP500_14h30_VN",
  53: "SP500_17h30_VN",
  54: "SP500_24h",
  55: "SP500_Cao",
  56: "SP500_Thap",
  57: "SP500_Thay_doi_pct",
  60: "VCB_Ban",
};

export function parseColumnVisibilityFromStorage(
  raw: string | null,
): Record<ToggleableColGroup, boolean> {
  const next = { ...DEFAULT_COLUMN_VISIBILITY };
  if (!raw) return next;
  try {
    const o = JSON.parse(raw) as Record<string, boolean>;
    for (const g of TOGGLEABLE_GROUPS) {
      if (typeof o[g] === "boolean") next[g] = o[g];
    }
  } catch {
    /* ignore */
  }
  if (!TOGGLEABLE_GROUPS.some((g) => next[g])) return { ...DEFAULT_COLUMN_VISIBILITY };
  return next;
}

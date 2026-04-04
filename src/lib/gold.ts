/**
 * Giá vàng thế giới (XAU/USD): historical từ Investing.com (bảng daily id 68, fallback chart).
 */

import { fetchInvestingXauUsd } from "./investing";

const START_YEAR = 2022;
const START_DATE = `${START_YEAR}-01-01`;

export interface GoldPriceItem {
  date: string;
  price: number;
  source?: string;
}

export interface GoldData {
  source: "investing";
  updatedAt: string;
  fromYear: number;
  historical: GoldPriceItem[];
  live?: {
    bid?: number;
    ask?: number;
    change?: number;
    changePercent?: number;
  };
}

/**
 * Historical đóng phiên XAU/USD + “live” = đóng ngày giao dịch gần nhất (cùng nguồn Investing).
 */
export async function getGoldData(): Promise<GoldData> {
  const to = new Date().toISOString().slice(0, 10);
  const rows = await fetchInvestingXauUsd(START_DATE, to);
  const historical: GoldPriceItem[] = rows.map((r) => ({
    date: r.date,
    price: r.close,
    source: "investing",
  }));

  const last = rows[rows.length - 1];
  const prev = rows.length > 1 ? rows[rows.length - 2] : null;
  let live: GoldData["live"] | undefined;
  if (last && Number.isFinite(last.close)) {
    const change =
      prev && Number.isFinite(prev.close) ? last.close - prev.close : undefined;
    const changePercent =
      prev && prev.close !== 0 && change !== undefined
        ? (change / prev.close) * 100
        : undefined;
    live = {
      bid: last.close,
      ask: last.close,
      change,
      changePercent,
    };
  }

  return {
    source: "investing",
    updatedAt: new Date().toISOString(),
    fromYear: START_YEAR,
    historical,
    live,
  };
}

"use client";

import Image from "next/image";
import { TOTAL_COLUMNS } from "@/data/table-headers-60";

/**
 * Khung UI trước – chỉ header + bảng trống.
 * Phần render / load dữ liệu sẽ làm sau.
 */

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col bg-stone-50 dark:bg-stone-950 text-stone-900 dark:text-stone-100">
      <header
        className="shrink-0 sticky top-0 z-20 opacity-0 animate-fade-in-up border-b border-amber-200/50 dark:border-amber-900/30 bg-white/90 dark:bg-stone-900/90 backdrop-blur-md shadow-sm"
        style={{ animationDelay: "0ms", animationFillMode: "forwards" }}
      >
        <div className="w-full px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-amber-700 text-white text-lg font-bold shadow-lg shadow-amber-500/25 transition-transform duration-300 hover:scale-105 overflow-hidden">
              <Image
                src="/favicon.svg"
                alt="Logo"
                width={28}
                height={28}
                priority
              />
            </span>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-stone-800 dark:text-stone-100">
                Giá vàng & Tỷ giá
              </h1>
              <p className="text-xs text-amber-700/80 dark:text-amber-400/80 font-medium">
                Giá dầu & Dollar index từ Investing.com · VCB, FreeGoldAPI
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full px-4 sm:px-6 py-8 sm:py-10">
        <section
          className="mb-6 opacity-0 animate-fade-in-up"
          style={{ animationDelay: "80ms", animationFillMode: "forwards" }}
        >
          <h2 className="text-xl font-semibold text-stone-800 dark:text-stone-200">
            Bảng dữ liệu
          </h2>
          <p className="text-sm text-stone-500 dark:text-stone-400 mt-1">
            Khung bảng 60 cột (Mua/Bán Mạnh Hải, Kitco, Giá dầu, Dollar index,
            Trái phiếu US 10Y, S&P 500, Tỷ giá VCB). Phần dữ liệu sẽ làm sau.
          </p>
        </section>

        <div
          className="rounded-2xl border border-amber-200/40 dark:border-amber-900/30 bg-white dark:bg-stone-900 shadow-xl shadow-amber-500/5 overflow-hidden opacity-0 animate-scale-in"
          style={{ animationDelay: "140ms", animationFillMode: "forwards" }}
        >
          <div className="border-b border-amber-200/50 dark:border-amber-900/30 px-5 py-3.5 text-sm text-stone-500 dark:text-stone-400 bg-amber-50/60 dark:bg-amber-950/20 backdrop-blur">
            <span className="font-medium text-stone-700 dark:text-stone-300">
              Khung bảng – chưa nối dữ liệu
            </span>
          </div>
          <div className="overflow-auto">
            <table className="w-full text-left border-collapse min-w-max">
              <thead className="sticky top-0 z-10 bg-amber-100/90 dark:bg-amber-900/30 backdrop-blur-sm">
                {/* Dòng 1: nhóm lớn + STT + Thứ/Ngày (rowSpan) */}
                <tr>
                  <th
                    rowSpan={3}
                    className="w-12 border-b border-r border-amber-200/60 dark:border-amber-800/40 px-2 py-2 text-xs font-bold uppercase tracking-wider text-amber-900/80 dark:text-amber-200/90 align-bottom bg-amber-100/70 dark:bg-amber-900/40"
                  >
                    STT
                  </th>
                  <th
                    colSpan={5}
                    className="border-b border-r border-amber-200/60 dark:border-amber-800/40 px-2 py-2 text-[11px] font-bold text-amber-900/80 dark:text-amber-200/90 whitespace-nowrap bg-amber-100/70 dark:bg-amber-900/40"
                  >
                    MUA - Mạnh Hải
                  </th>
                  <th
                    colSpan={5}
                    className="border-b border-r border-amber-200/60 dark:border-amber-800/40 px-2 py-2 text-[11px] font-bold text-amber-900/80 dark:text-amber-200/90 whitespace-nowrap bg-amber-100/70 dark:bg-amber-900/40"
                  >
                    BÁN - Mạnh Hải
                  </th>
                  <th
                    rowSpan={3}
                    className="border-b border-r border-amber-200/60 dark:border-amber-800/40 px-2 py-2 text-[11px] font-bold text-amber-900/80 dark:text-amber-200/90 whitespace-nowrap bg-amber-100/70 dark:bg-amber-900/40"
                  >
                    Thứ
                  </th>
                  <th
                    rowSpan={3}
                    className="border-b border-r border-amber-200/60 dark:border-amber-800/40 px-2 py-2 text-[11px] font-bold text-amber-900/80 dark:text-amber-200/90 whitespace-nowrap bg-amber-100/70 dark:bg-amber-900/40"
                  >
                    Ngày
                  </th>
                  <th
                    colSpan={9}
                    className="border-b border-r border-amber-200/60 dark:border-amber-800/40 px-2 py-2 text-[11px] font-bold text-amber-900/80 dark:text-amber-200/90 whitespace-nowrap bg-amber-100/70 dark:bg-amber-900/40"
                  >
                    KITCO - GIÁ VÀNG THẾ GIỚI
                  </th>
                  <th
                    colSpan={9}
                    className="border-b border-r border-amber-200/60 dark:border-amber-800/40 px-2 py-2 text-[11px] font-bold text-amber-900/80 dark:text-amber-200/90 whitespace-nowrap bg-amber-100/70 dark:bg-amber-900/40"
                  >
                    GIÁ DẦU
                  </th>
                  <th
                    colSpan={9}
                    className="border-b border-r border-amber-200/60 dark:border-amber-800/40 px-2 py-2 text-[11px] font-bold text-amber-900/80 dark:text-amber-200/90 whitespace-nowrap bg-amber-100/70 dark:bg-amber-900/40"
                  >
                    DOLLAR INDEX
                  </th>
                  <th
                    colSpan={9}
                    className="border-b border-r border-amber-200/60 dark:border-amber-800/40 px-2 py-2 text-[11px] font-bold text-amber-900/80 dark:text-amber-200/90 whitespace-nowrap bg-amber-100/70 dark:bg-amber-900/40"
                  >
                    TRÁI PHIẾU US - 10 NĂM
                  </th>
                  <th
                    colSpan={9}
                    className="border-b border-r border-amber-200/60 dark:border-amber-800/40 px-2 py-2 text-[11px] font-bold text-amber-900/80 dark:text-amber-200/90 whitespace-nowrap bg-amber-100/70 dark:bg-amber-900/40"
                  >
                    S&P 500
                  </th>
                  <th
                    colSpan={2}
                    className="border-b border-amber-200/60 dark:border-amber-800/40 px-2 py-2 text-[11px] font-bold text-amber-900/80 dark:text-amber-200/90 whitespace-nowrap bg-amber-100/70 dark:bg-amber-900/40"
                  >
                    Tỷ Giá VCB
                  </th>
                </tr>
                {/* Dòng 2: Mở/Đóng/Chênh lệch, v.v. */}
                <tr>
                  {/* Mua - Mạnh Hải (5 cột) */}
                  <th className="border-b border-r border-amber-200/60 dark:border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30">
                    MỞ
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark:border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30" />
                  <th className="border-b border-r border-amber-200/60 dark:border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30" />
                  <th className="border-b border-r border-amber-200/60 dark:border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30">
                    ĐÓNG
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark:border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30">
                    CHÊNH LỆCH
                  </th>
                  {/* Bán - Mạnh Hải (5 cột) */}
                  <th className="border-b border-r border-amber-200/60 dark:border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30">
                    MỞ
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark:border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30" />
                  <th className="border-b border-r border-amber-200/60 dark:border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30" />
                  <th className="border-b border-r border-amber-200/60 dark:border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30">
                    ĐÓNG
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark:border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30">
                    CHÊNH LỆCH
                  </th>
                  {/* Thứ, Ngày đã rowSpan=3 ở dòng 1 nên bỏ qua ở dòng 2 */}
                  {/* KITCO (9 cột) */}
                  <th className="border-b border-r border-amber-200/60 dark:border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30">
                    MỞ (Open)
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark:border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30" />
                  <th className="border-b border-r border-amber-200/60 dark:border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30" />
                  <th className="border-b border-r border-amber-200/60 dark:border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30" />
                  <th className="border-b border-r border-amber-200/60 dark:border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30">
                    ĐÓNG (Price)
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark:border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30">
                    CAO (High)
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark:border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30">
                    THẤP (Low)
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark:border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30">
                    THAY ĐỔI (Change)
                  </th>
                  {/* Giá dầu (9 cột) */}
                  <th className="border-b border-r border-amber-200/60 dark:border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30">
                    MỞ (Open)
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark:border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30" />
                  <th className="border-b border-r border-amber-200/60 dark:border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30" />
                  <th className="border-b border-r border-amber-200/60 dark:border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30" />
                  <th className="border-b border-r border-amber-200/60 dark:border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30" />
                  <th className="border-b border-r border-amber-200/60 dark:border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30">
                    ĐÓNG (Price)
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark:border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30">
                    CAO (High)
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark:border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30">
                    THẤP (Low)
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark:border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30">
                    THAY ĐỔI (Change)
                  </th>
                  {/* Dollar index (9 cột) */}
                  <th className="border-b border-r border-amber-200/60 dark:border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30">
                    MỞ
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark:border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30" />
                  <th className="border-b border-r border-amber-200/60 dark:border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30" />
                  <th className="border-b border-r border-amber-200/60 dark:border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30" />
                  <th className="border-b border-r border-amber-200/60 dark:border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30" />
                  <th className="border-b border-r border-amber-200/60 dark:border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30">
                    ĐÓNG
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark:border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30">
                    CAO (High)
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark:border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30">
                    THẤP (Low)
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark:border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30">
                    THAY ĐỔI
                  </th>
                  {/* Trái phiếu 10Y (9 cột) */}
                  <th className="border-b border-r border-amber-200/60 dark:border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30">
                    MỞ
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark:border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30" />
                  <th className="border-b border-r border-amber-200/60 dark:border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30" />
                  <th className="border-b border-r border-amber-200/60 dark:border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30" />
                  <th className="border-b border-r border-amber-200/60 dark:border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30" />
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30">
                    ĐÓNG
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30">
                    CAO (High)
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30">
                    THẤP (Low)
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30">
                    THAY ĐỔI
                  </th>
                  {/* S&P 500 (9 cột) */}
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30">
                    MỞ
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30" />
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30" />
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30" />
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30" />
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30">
                    ĐÓNG
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30">
                    CAO (High)
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30">
                    THẤP (Low)
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30">
                    THAY ĐỔI
                  </th>
                  {/* Tỷ giá VCB (2 cột) */}
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30">
                    MỞ
                  </th>
                  <th className="border-b border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[11px] font-semibold text-amber-900/70 dark:text-amber-200/80 whitespace-nowrap bg-amber-50/80 dark:bg-amber-950/30">
                    ĐÓNG
                  </th>
                </tr>
                {/* Dòng 3: các mốc giờ chi tiết */}
                <tr>
                  {/* Mua - Mạnh Hải (5 cột) */}
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap">
                    9h (Việt Nam)
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap">
                    11h (Việt Nam)
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap">
                    14h30 (Việt Nam)
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap">
                    17h30 (Việt Nam)
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap" />
                  {/* Bán - Mạnh Hải (5 cột) */}
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap">
                    9h (Việt Nam)
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap">
                    11h (Việt Nam)
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap">
                    14h30 (Việt Nam)
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap">
                    17h30 (Việt Nam)
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap" />
                  {/* Thứ, Ngày đã rowSpan=3 ở dòng 1 */}
                  {/* KITCO (9 cột) */}
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap">
                    0h (Kitco)
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap">
                    9h (Việt Nam)
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap">
                    11h (Việt Nam)
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap">
                    14h30 (Việt Nam)
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap">
                    17h30 (Việt Nam)
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap">
                    24h (Kitco)
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap" />
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap" />
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap" />
                  {/* Giá dầu (9 cột) */}
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap">
                    0h (Investing)
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap">
                    9h (Việt Nam)
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap">
                    11h (Việt Nam)
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap">
                    14h30 (Việt Nam)
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap">
                    17h30 (Việt Nam)
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap">
                    24h (Investing)
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap" />
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap" />
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap" />
                  {/* Dollar index (9 cột) */}
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap">
                    0h (Investing)
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap">
                    9h (Việt Nam)
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap">
                    11h (Việt Nam)
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap">
                    14h30 (Việt Nam)
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap">
                    17h30 (Việt Nam)
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap">
                    24h (Investing)
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap" />
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap" />
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap" />
                  {/* Trái phiếu 10Y (9 cột) */}
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap">
                    0h (Investing)
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap">
                    9h (Việt Nam)
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap">
                    11h (Việt Nam)
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap">
                    14h30 (Việt Nam)
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap">
                    17h30 (Việt Nam)
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap">
                    24h (Investing)
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap" />
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap" />
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap" />
                  {/* S&P 500 (9 cột) */}
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap">
                    0h (Investing)
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap">
                    9h (Việt Nam)
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap">
                    11h (Việt Nam)
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap">
                    14h30 (Việt Nam)
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap">
                    17h30 (Việt Nam)
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap">
                    24h (Investing)
                  </th>
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap" />
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap" />
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap" />
                  {/* Tỷ giá VCB (2 cột) */}
                  <th className="border-b border-r border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap">
                    9h (Việt Nam)
                  </th>
                  <th className="border-b border-amber-200/60 dark-border-amber-800/40 px-2 py-1.5 text-[10px] font-medium text-stone-600 dark:text-stone-400 whitespace-nowrap">
                    11h (Việt Nam)
                  </th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 3 }).map((_, i) => (
                  <tr
                    key={i}
                    className="border-b border-stone-100 dark:border-stone-800 transition-colors duration-200 hover:bg-amber-50/60 dark:hover:bg-amber-950/30"
                  >
                    {Array.from({ length: TOTAL_COLUMNS }, (_, j) => (
                      <td
                        key={j}
                        className="border-r border-stone-100 dark:border-stone-800 px-2 py-2 text-xs max-w-[120px] truncate tabular-nums text-stone-400 dark:text-stone-500"
                      >
                        {j === 0 ? i + 1 : "–"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      <footer
        className="shrink-0 border-t border-amber-200/40 dark:border-amber-900/30 bg-white/70 dark:bg-stone-900/70 backdrop-blur-sm mt-auto opacity-0 animate-fade-in"
        style={{ animationDelay: "350ms", animationFillMode: "forwards" }}
      >
        <div className="w-full px-4 sm:px-6 py-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 text-sm text-stone-500 dark:text-stone-400">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-amber-700 shadow-md shadow-amber-500/25 overflow-hidden">
                <Image src="/favicon.svg" alt="Logo" width={20} height={20} />
              </span>
              <p>© {new Date().getFullYear()} · Giá vàng & Tỷ giá</p>
            </div>
            <p className="text-xs sm:text-sm">
              Make by Trần Trung Hiếu - 0862478150
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

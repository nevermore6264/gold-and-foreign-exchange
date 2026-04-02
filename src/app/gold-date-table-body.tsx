"use client";

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";

const WEEKDAY_COL_WIDTH_PX = 48;

const TABLE_TEXT = "text-[13px] leading-tight";
const TABLE_TD_PAD = "px-1.5 py-1";
const TD_CELL_FX =
  "transition-[box-shadow,filter] duration-200 ease-out motion-reduce:transition-none group-hover/row:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.4)] dark:group-hover/row:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.09)] group-hover/row:brightness-[1.015] dark:group-hover/row:brightness-110";

/** Khớp `contain-intrinsic-size` trong globals.css (~2.25rem) — lệch vài px vẫn chấp nhận được */
const GOLD_TBODY_VIRTUAL_ROW_PX = 36;
/** Chỉ ảo hóa khi đủ dài — tháng/quý vẫn render đủ để tránh phức tạp */
const GOLD_TBODY_VIRTUAL_MIN_ROWS = 50;
const GOLD_TBODY_VIRTUAL_OVERSCAN = 12;

type VirtualWindowLayout = {
  start: number;
  end: number;
  topPadPx: number;
  bottomPadPx: number;
};

function useTableBodyVirtualWindow(
  scrollParentRef: RefObject<HTMLElement | null>,
  rowCount: number,
): VirtualWindowLayout {
  const smallLayout = useMemo((): VirtualWindowLayout | null => {
    if (rowCount <= 0) {
      return { start: 0, end: -1, topPadPx: 0, bottomPadPx: 0 };
    }
    if (rowCount <= GOLD_TBODY_VIRTUAL_MIN_ROWS) {
      return { start: 0, end: rowCount - 1, topPadPx: 0, bottomPadPx: 0 };
    }
    return null;
  }, [rowCount]);

  const [bigLayout, setBigLayout] = useState<VirtualWindowLayout>({
    start: 0,
    end: 0,
    topPadPx: 0,
    bottomPadPx: 0,
  });

  const recomputeLayout = useCallback(() => {
    const h = GOLD_TBODY_VIRTUAL_ROW_PX;
    const os = GOLD_TBODY_VIRTUAL_OVERSCAN;

    if (rowCount <= 0) {
      setBigLayout({ start: 0, end: -1, topPadPx: 0, bottomPadPx: 0 });
      return;
    }
    if (rowCount <= GOLD_TBODY_VIRTUAL_MIN_ROWS) {
      return;
    }

    const el = scrollParentRef.current;
    if (!el || el.clientHeight <= 0) {
      const fallbackEnd = Math.min(rowCount - 1, 48);
      setBigLayout({
        start: 0,
        end: fallbackEnd,
        topPadPx: 0,
        bottomPadPx: Math.max(0, rowCount - 1 - fallbackEnd) * h,
      });
      return;
    }

    const st = el.scrollTop;
    const vh = el.clientHeight;
    let s = Math.floor(st / h) - os;
    let e = Math.ceil((st + vh) / h) + os;
    s = Math.max(0, s);
    e = Math.min(rowCount - 1, e);
    if (e < s) e = s;

    setBigLayout({
      start: s,
      end: e,
      topPadPx: s * h,
      bottomPadPx: Math.max(0, rowCount - 1 - e) * h,
    });
  }, [rowCount, scrollParentRef]);

  useEffect(() => {
    if (smallLayout != null) return;

    const el = scrollParentRef.current;
    if (!el) return;

    let rafPending = 0;
    const schedule = () => {
      if (rafPending) return;
      rafPending = requestAnimationFrame(() => {
        rafPending = 0;
        recomputeLayout();
      });
    };

    el.addEventListener("scroll", schedule, { passive: true });
    const ro = new ResizeObserver(schedule);
    ro.observe(el);
    schedule();

    return () => {
      el.removeEventListener("scroll", schedule);
      ro.disconnect();
      if (rafPending) cancelAnimationFrame(rafPending);
    };
  }, [smallLayout, scrollParentRef, recomputeLayout]);

  return smallLayout ?? bigLayout;
}

export type GoldDateRow = {
  isoDate: string;
  weekdayLabel: string;
  dateLabel: string;
};

export type GoldDateTableBodyApi = {
  neutralPriceClass: string;
  formatTableToneCellDisplay: (
    mainText: string,
    toneClass: string | undefined,
  ) => string;
  formatVnd: (v: string | number | null | undefined) => string;
  getRegionBgClass: (colIndex: number) => string;
  manhHaiCellValue: (
    isoDate: string,
    colIndex: number,
  ) => { text: string; toneClass?: string };
  manhHaiDongIntradayToneClass: (
    isoDate: string,
    colIndex: number,
  ) => string;
  laiNeuBanRa: (
    isoDate: string,
    colJ: 67 | 68 | 69 | 70,
  ) => { text: string; toneClass?: string };
  kitcoCellValue: (isoDate: string, colIndex: number) => string;
  getMarketChangeToneClass: (value: string) => string;
  formatChangeWithPlus: (value: string) => string;
  marketTimedCellValue: (
    isoDate: string,
    colIndex: number,
    kind: "oil" | "dollarIndex" | "bond10y" | "sp500",
  ) => string;
  vcbCellValue: (isoDate: string, colIndex: number) => string;
  toneClassIntradayVsPrev: (currentStr: string, prevStr: string) => string;
  chiVangIndexTaiSanOverDong17h30: (isoDate: string) => string;
  chiVangIndexNumber: (isoDate: string) => number | null;
  toneClassCompareToRowAbove: (
    current: number | null,
    prev: number | null,
  ) => string;
  chenhLechTrongNuocTheGioiNumber: (
    isoDate: string,
    slot: 0 | 1 | 2 | 3,
  ) => number | null;
  chiVangThemMinusChiCu: (isoDate: string) => string;
  chiVangThemNumber: (isoDate: string) => number | null;
};

export type GoldDateTableBodyProps = {
  /** Khối cuộn bọc `<table>` — bắt buộc khi bảng dài để ảo hóa tbody */
  scrollParentRef: RefObject<HTMLDivElement | null>;
  dateRows: GoldDateRow[];
  visibleJ: number[];
  cellBgColors: Record<string, string>;
  fullRowsByDate: Record<string, Record<string, string | number | null>>;
  isLoadingTable: boolean;
  api: GoldDateTableBodyApi;
  onOpenCellColorPicker: (
    isoDate: string,
    colJ: number,
    el: HTMLElement,
  ) => void;
};

type GoldDateTableDataRowProps = {
  row: GoldDateRow;
  rowIdx: number;
  dateRows: GoldDateRow[];
  visibleJ: number[];
  cellBgColors: Record<string, string>;
  fullRowsByDate: Record<string, Record<string, string | number | null>>;
  isLoadingTable: boolean;
  api: GoldDateTableBodyApi;
  onOpenCellColorPicker: (
    isoDate: string,
    colJ: number,
    el: HTMLElement,
  ) => void;
};

function GoldDateTableDataRow({
  row,
  rowIdx,
  dateRows,
  visibleJ,
  cellBgColors,
  fullRowsByDate,
  isLoadingTable,
  api,
  onOpenCellColorPicker,
}: GoldDateTableDataRowProps) {
  return (
    <tr
      className="group/row transition-colors duration-200 hover:bg-stone-100/50 dark:hover:bg-stone-800/30"
    >
          {visibleJ.map((j) =>
            j === 0 || j === 58 || j === 59 ? null : (
              <td
                key={j}
                align="center"
                title="Nhấp đúp để chọn màu nền ô"
                style={{
                  ...(cellBgColors[`${row.isoDate}:${j}`]
                    ? {
                        backgroundColor: cellBgColors[`${row.isoDate}:${j}`],
                      }
                    : {}),
                  ...(j === 12
                    ? {
                        left: `${WEEKDAY_COL_WIDTH_PX}px`,
                      }
                    : {}),
                }}
                onMouseDown={(e) => {
                  if (e.detail > 1) e.preventDefault();
                }}
                onDoubleClick={(e) => {
                  if (j === 0) return;
                  e.preventDefault();
                  onOpenCellColorPicker(row.isoDate, j, e.currentTarget);
                }}
                className={
                  j === 0
                    ? "border-0 px-0 py-0 w-0 max-w-0 overflow-hidden"
                    : j === 11
                      ? `sticky left-0 z-20 min-w-0 max-w-[48px] border-r border-b border-black dark:border-stone-200 px-0.5 py-1 text-center text-[12px] font-bold tabular-nums leading-tight text-balance text-stone-950 dark:text-stone-100 bg-orange-50 dark:bg-orange-950 group-hover/row:bg-orange-100 dark:group-hover/row:bg-orange-900 shadow-[4px_0_10px_-6px_rgba(0,0,0,0.15)] dark:shadow-[4px_0_10px_-6px_rgba(0,0,0,0.5)] ${TD_CELL_FX}`
                      : j === 12
                        ? `sticky z-[19] min-w-0 border-r border-b border-black dark:border-stone-200 ${TABLE_TD_PAD} text-center ${TABLE_TEXT} font-bold tabular-nums text-balance text-stone-950 dark:text-stone-100 bg-sky-100 dark:bg-sky-950 group-hover/row:bg-sky-200 dark:group-hover/row:bg-sky-900 shadow-[4px_0_10px_-6px_rgba(0,0,0,0.12)] dark:shadow-[4px_0_10px_-6px_rgba(0,0,0,0.45)] ${TD_CELL_FX}`
                        : j >= 67 && j <= 70
                          ? `border-r border-b border-black dark:border-stone-200 ${TABLE_TD_PAD} text-center ${TABLE_TEXT} font-bold tabular-nums whitespace-nowrap text-stone-950 dark:text-stone-50 ${api.getRegionBgClass(j)} ${TD_CELL_FX}`
                        : j >= 61 && j <= 66
                          ? `border-r border-b border-black dark:border-stone-200 ${TABLE_TD_PAD} text-center ${TABLE_TEXT} font-bold tabular-nums whitespace-normal break-words text-stone-950 dark:text-stone-50 ${api.getRegionBgClass(j)} ${TD_CELL_FX}`
                          : `border-r border-b border-black dark:border-stone-200 ${TABLE_TD_PAD} text-center ${TABLE_TEXT} font-bold tabular-nums whitespace-normal break-words text-stone-950 dark:text-stone-50 ${api.getRegionBgClass(j)} ${TD_CELL_FX}`
                }
              >
                {isLoadingTable &&
                !fullRowsByDate[row.isoDate] &&
                j !== 0 &&
                j !== 11 &&
                j !== 12 ? (
                  <div className="mx-auto h-3.5 w-16 rounded bg-stone-200/70 dark:bg-stone-800/70 animate-pulse" />
                ) : j === 0 ? (
                  ""
                ) : j === 11 ? (
                  row.weekdayLabel
                ) : j === 12 ? (
                  row.dateLabel
                ) : j >= 1 && j <= 10 ? (
                  (() => {
                    const v = api.manhHaiCellValue(row.isoDate, j);
                    const toneClass =
                      j === 1 || j === 2 || j === 6 || j === 7
                        ? api.neutralPriceClass
                        : j === 3 || j === 4 || j === 8 || j === 9
                          ? api.manhHaiDongIntradayToneClass(row.isoDate, j)
                          : (v.toneClass ?? api.neutralPriceClass);
                    const text = api.formatTableToneCellDisplay(
                      v.text,
                      toneClass,
                    );
                    return <span className={toneClass}>{text}</span>;
                  })()
                ) : j >= 67 && j <= 70 ? (
                  (() => {
                    const colJ = j as 67 | 68 | 69 | 70;
                    const v = api.laiNeuBanRa(row.isoDate, colJ);
                    const tone = v.toneClass ?? api.neutralPriceClass;
                    const text = api.formatTableToneCellDisplay(v.text, tone);
                    return <span className={tone}>{text}</span>;
                  })()
                ) : j === 21 ? (
                  (() => {
                    const v = api.kitcoCellValue(row.isoDate, j);
                    const tone = api.getMarketChangeToneClass(v);
                    const text = api.formatTableToneCellDisplay(
                      api.formatChangeWithPlus(v),
                      tone,
                    );
                    return <span className={tone}>{text}</span>;
                  })()
                ) : j === 30 ? (
                  (() => {
                    const v = api.marketTimedCellValue(row.isoDate, j, "oil");
                    const tone = api.getMarketChangeToneClass(v);
                    const text = api.formatTableToneCellDisplay(
                      api.formatChangeWithPlus(v),
                      tone,
                    );
                    return <span className={tone}>{text}</span>;
                  })()
                ) : j === 39 ? (
                  (() => {
                    const v = api.marketTimedCellValue(
                      row.isoDate,
                      j,
                      "dollarIndex",
                    );
                    const tone = api.getMarketChangeToneClass(v);
                    const text = api.formatTableToneCellDisplay(
                      api.formatChangeWithPlus(v),
                      tone,
                    );
                    return <span className={tone}>{text}</span>;
                  })()
                ) : j === 48 ? (
                  (() => {
                    const v = api.marketTimedCellValue(
                      row.isoDate,
                      j,
                      "bond10y",
                    );
                    const tone = api.getMarketChangeToneClass(v);
                    const text = api.formatTableToneCellDisplay(
                      api.formatChangeWithPlus(v),
                      tone,
                    );
                    return <span className={tone}>{text}</span>;
                  })()
                ) : j === 57 ? (
                  (() => {
                    const v = api.marketTimedCellValue(
                      row.isoDate,
                      j,
                      "sp500",
                    );
                    const tone = api.getMarketChangeToneClass(v);
                    const text = api.formatTableToneCellDisplay(
                      api.formatChangeWithPlus(v),
                      tone,
                    );
                    return <span className={tone}>{text}</span>;
                  })()
                ) : j === 13 ? (
                  (() => {
                    const v = api.kitcoCellValue(row.isoDate, j);
                    return v === "–" ? (
                      v
                    ) : (
                      <span className={api.neutralPriceClass}>{v}</span>
                    );
                  })()
                ) : j >= 14 && j <= 20 ? (
                  (() => {
                    const v = api.kitcoCellValue(row.isoDate, j);
                    if (v === "–") return v;
                    const openV = api.kitcoCellValue(row.isoDate, 13);
                    const cls = api.toneClassIntradayVsPrev(v, openV);
                    return (
                      <span className={cls}>
                        {api.formatTableToneCellDisplay(v, cls)}
                      </span>
                    );
                  })()
                ) : j === 22 ? (
                  (() => {
                    const v = api.marketTimedCellValue(row.isoDate, j, "oil");
                    return v === "–" ? (
                      v
                    ) : (
                      <span className={api.neutralPriceClass}>{v}</span>
                    );
                  })()
                ) : j >= 23 && j <= 29 ? (
                  (() => {
                    const v = api.marketTimedCellValue(row.isoDate, j, "oil");
                    if (v === "–") return v;
                    const openV = api.marketTimedCellValue(
                      row.isoDate,
                      22,
                      "oil",
                    );
                    const cls = api.toneClassIntradayVsPrev(v, openV);
                    return (
                      <span className={cls}>
                        {api.formatTableToneCellDisplay(v, cls)}
                      </span>
                    );
                  })()
                ) : j === 31 ? (
                  (() => {
                    const v = api.marketTimedCellValue(
                      row.isoDate,
                      j,
                      "dollarIndex",
                    );
                    return v === "–" ? (
                      v
                    ) : (
                      <span className={api.neutralPriceClass}>{v}</span>
                    );
                  })()
                ) : j >= 32 && j <= 38 ? (
                  (() => {
                    const v = api.marketTimedCellValue(
                      row.isoDate,
                      j,
                      "dollarIndex",
                    );
                    if (v === "–") return v;
                    const openV = api.marketTimedCellValue(
                      row.isoDate,
                      31,
                      "dollarIndex",
                    );
                    const cls = api.toneClassIntradayVsPrev(v, openV);
                    return (
                      <span className={cls}>
                        {api.formatTableToneCellDisplay(v, cls)}
                      </span>
                    );
                  })()
                ) : j === 40 ? (
                  (() => {
                    const v = api.marketTimedCellValue(
                      row.isoDate,
                      j,
                      "bond10y",
                    );
                    return v === "–" ? (
                      v
                    ) : (
                      <span className={api.neutralPriceClass}>{v}</span>
                    );
                  })()
                ) : j >= 41 && j <= 47 ? (
                  (() => {
                    const v = api.marketTimedCellValue(
                      row.isoDate,
                      j,
                      "bond10y",
                    );
                    if (v === "–") return v;
                    const openV = api.marketTimedCellValue(
                      row.isoDate,
                      40,
                      "bond10y",
                    );
                    const cls = api.toneClassIntradayVsPrev(v, openV);
                    return (
                      <span className={cls}>
                        {api.formatTableToneCellDisplay(v, cls)}
                      </span>
                    );
                  })()
                ) : j === 49 ? (
                  (() => {
                    const v = api.marketTimedCellValue(
                      row.isoDate,
                      j,
                      "sp500",
                    );
                    return v === "–" ? (
                      v
                    ) : (
                      <span className={api.neutralPriceClass}>{v}</span>
                    );
                  })()
                ) : j >= 50 && j <= 56 ? (
                  (() => {
                    const v = api.marketTimedCellValue(
                      row.isoDate,
                      j,
                      "sp500",
                    );
                    if (v === "–") return v;
                    const openV = api.marketTimedCellValue(
                      row.isoDate,
                      49,
                      "sp500",
                    );
                    const cls = api.toneClassIntradayVsPrev(v, openV);
                    return (
                      <span className={cls}>
                        {api.formatTableToneCellDisplay(v, cls)}
                      </span>
                    );
                  })()
                ) : j === 61 ? (
                  (() => {
                    const text = api.chiVangIndexTaiSanOverDong17h30(
                      row.isoDate,
                    );
                    if (text === "–") return text;
                    const n = api.chiVangIndexNumber(row.isoDate);
                    const prevIso =
                      rowIdx > 0 ? dateRows[rowIdx - 1]!.isoDate : null;
                    const prevN =
                      prevIso != null ? api.chiVangIndexNumber(prevIso) : null;
                    const cls = api.toneClassCompareToRowAbove(n, prevN);
                    return (
                      <span className={cls}>
                        {api.formatTableToneCellDisplay(text, cls)}
                      </span>
                    );
                  })()
                ) : j >= 62 && j <= 65 ? (
                  (() => {
                    const slot = (j - 62) as 0 | 1 | 2 | 3;
                    const n = api.chenhLechTrongNuocTheGioiNumber(
                      row.isoDate,
                      slot,
                    );
                    const text = n == null ? "–" : api.formatVnd(n);
                    if (text === "–") return text;
                    const prevN =
                      slot > 0
                        ? api.chenhLechTrongNuocTheGioiNumber(
                            row.isoDate,
                            (slot - 1) as 0 | 1 | 2 | 3,
                          )
                        : null;
                    const cls = api.toneClassCompareToRowAbove(n, prevN);
                    return (
                      <span className={cls}>
                        {api.formatTableToneCellDisplay(text, cls)}
                      </span>
                    );
                  })()
                ) : j === 66 ? (
                  (() => {
                    const text = api.chiVangThemMinusChiCu(row.isoDate);
                    if (text === "–") return text;
                    const n = api.chiVangThemNumber(row.isoDate);
                    const prevIso =
                      rowIdx > 0 ? dateRows[rowIdx - 1]!.isoDate : null;
                    const prevN =
                      prevIso != null ? api.chiVangThemNumber(prevIso) : null;
                    const cls = api.toneClassCompareToRowAbove(n, prevN);
                    return (
                      <span className={cls}>
                        {api.formatTableToneCellDisplay(text, cls)}
                      </span>
                    );
                  })()
                ) : j >= 58 && j <= 60 ? (
                  api.vcbCellValue(row.isoDate, j)
                ) : (
                  "–"
                )}
              </td>
            )
          )}
        </tr>
  );
}

function GoldDateTableBodyInner({
  scrollParentRef,
  dateRows,
  visibleJ,
  cellBgColors,
  fullRowsByDate,
  isLoadingTable,
  api,
  onOpenCellColorPicker,
}: GoldDateTableBodyProps) {
  const virtual = useTableBodyVirtualWindow(scrollParentRef, dateRows.length);

  const colSpan = useMemo(() => {
    let n = 0;
    for (const j of visibleJ) {
      if (j !== 0 && j !== 58 && j !== 59) n += 1;
    }
    return Math.max(1, n);
  }, [visibleJ]);

  const slice = useMemo(() => {
    if (virtual.end < virtual.start) return [];
    return dateRows.slice(virtual.start, virtual.end + 1);
  }, [dateRows, virtual.start, virtual.end]);

  const padCellStyle: CSSProperties = {
    lineHeight: 0,
    fontSize: 0,
    padding: 0,
    border: "none",
    background: "transparent",
    verticalAlign: "top",
  };

  return (
    <tbody className="gold-tbody-perf [&_td]:align-middle [&_span]:inline-block [&_span]:max-w-full [&_span]:text-center">
      {virtual.topPadPx > 0 ? (
        <tr className="gold-tbody-spacer pointer-events-none" aria-hidden>
          <td
            colSpan={colSpan}
            style={{ ...padCellStyle, height: virtual.topPadPx }}
          >
            &nbsp;
          </td>
        </tr>
      ) : null}
      {slice.map((row, i) => (
        <GoldDateTableDataRow
          key={row.isoDate}
          row={row}
          rowIdx={virtual.start + i}
          dateRows={dateRows}
          visibleJ={visibleJ}
          cellBgColors={cellBgColors}
          fullRowsByDate={fullRowsByDate}
          isLoadingTable={isLoadingTable}
          api={api}
          onOpenCellColorPicker={onOpenCellColorPicker}
        />
      ))}
      {virtual.bottomPadPx > 0 ? (
        <tr className="gold-tbody-spacer pointer-events-none" aria-hidden>
          <td
            colSpan={colSpan}
            style={{ ...padCellStyle, height: virtual.bottomPadPx }}
          >
            &nbsp;
          </td>
        </tr>
      ) : null}
    </tbody>
  );
}

export const GoldDateTableBody = memo(GoldDateTableBodyInner);

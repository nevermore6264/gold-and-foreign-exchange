"use client";

import {
  type ThemePreference,
  THEME_STORAGE_KEY,
  applyThemeClass,
  readThemePreference,
} from "@/lib/theme-preference";
import { useEffect, useLayoutEffect, useState } from "react";

const SEGMENTS: { value: ThemePreference; label: string; title: string }[] = [
  { value: "light", label: "Sáng", title: "Giao diện sáng" },
  { value: "dark", label: "Tối", title: "Giao diện tối" },
  { value: "system", label: "Hệ thống", title: "Theo cài đặt thiết bị" },
];

export function ThemeToggle() {
  const [mode, setMode] = useState<ThemePreference>("system");
  const [ready, setReady] = useState(false);

  useLayoutEffect(() => {
    setMode(readThemePreference());
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    applyThemeClass(mode);
  }, [mode, ready]);

  useEffect(() => {
    if (!ready || mode !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyThemeClass("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [mode, ready]);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== THEME_STORAGE_KEY || e.newValue == null) return;
      if (!["light", "dark", "system"].includes(e.newValue)) return;
      setMode(e.newValue as ThemePreference);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  function select(next: ThemePreference) {
    setMode(next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
    applyThemeClass(next);
  }

  return (
    <div
      className="inline-flex h-9 shrink-0 overflow-hidden rounded-xl border border-stone-200/90 bg-stone-50/90 p-0.5 dark:border-stone-600 dark:bg-stone-800/80"
      role="group"
      aria-label="Chủ đề giao diện"
    >
      {SEGMENTS.map(({ value, label, title }) => {
        const active = ready && mode === value;
        return (
          <button
            key={value}
            type="button"
            title={title}
            onClick={() => select(value)}
            className={`min-w-0 rounded-lg px-2.5 py-1 text-[12px] font-semibold transition-colors sm:px-3 sm:text-[13px] ${
              active
                ? "bg-white text-amber-900 shadow-sm dark:bg-stone-700 dark:text-amber-100"
                : "text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100"
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

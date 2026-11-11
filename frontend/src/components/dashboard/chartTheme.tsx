"use client";

import { useSyncExternalStore } from "react";

/**
 * Chart tokens. Every chart is a single series, so one brand hue carries all data and text
 * stays in slate ink. "Other" is a neutral gray so it never reads as another category.
 */
export const chartTheme = {
  series: "#0f766e", // teal-700 — 5.5:1 on white
  seriesFill: "#14b8a6", // teal-500, used only as a translucent area fill
  other: "#94a3b8", // slate-400 for the folded "Other" bucket
  grid: "#e2e8f0", // slate-200 hairlines
  axis: "#cbd5e1", // slate-300
  tick: "#64748b", // slate-500 — 4.8:1 on white
  label: "#334155", // slate-700
  fontSize: 12,
} as const;

export const axisTick = { fill: chartTheme.tick, fontSize: chartTheme.fontSize };

function subscribe(query: string) {
  return (callback: () => void) => {
    if (typeof window === "undefined" || !window.matchMedia) return () => undefined;
    const media = window.matchMedia(query);
    media.addEventListener?.("change", callback);
    return () => media.removeEventListener?.("change", callback);
  };
}

/** SSR-safe media query hook. */
export function useMediaQuery(query: string, serverValue = false): boolean {
  return useSyncExternalStore(
    subscribe(query),
    () => (typeof window !== "undefined" && window.matchMedia ? window.matchMedia(query).matches : serverValue),
    () => serverValue,
  );
}

/** Narrow screens get shorter labels so axes stay readable on phones. */
export const useIsCompact = () => useMediaQuery("(max-width: 639px)");
export const usePrefersReducedMotion = () => useMediaQuery("(prefers-reduced-motion: reduce)");

export function truncateLabel(value: string, maximum: number): string {
  return value.length > maximum ? `${value.slice(0, maximum - 1).trimEnd()}…` : value;
}

/** Tooltip shell shared by all charts. */
export function TooltipCard({ title, lines }: { title: string; lines: Array<{ label: string; value: string; muted?: boolean }> }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-lg shadow-slate-900/10">
      <p className="font-medium text-slate-900">{title}</p>
      {lines.map((line) => (
        <p key={line.label} className={`mt-0.5 flex items-center justify-between gap-4 ${line.muted ? "text-slate-500" : "text-slate-700"}`}>
          <span>{line.label}</span><span className="font-semibold tabular-nums text-slate-900">{line.value}</span>
        </p>
      ))}
    </div>
  );
}

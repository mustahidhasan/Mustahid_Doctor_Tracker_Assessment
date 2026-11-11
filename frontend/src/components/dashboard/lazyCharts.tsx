"use client";

import dynamic from "next/dynamic";

/**
 * Recharts (~118 KB gzipped) is split into its own chunk and loaded after the page renders, so the
 * KPI cards, card headers, summaries, and table views never wait for the chart library.
 */
function PlotSkeleton() {
  return <div aria-hidden="true" className="h-full w-full animate-pulse rounded-xl bg-slate-50" />;
}

export const LazyTrendPlot = dynamic(() => import("./TrendPlot").then((module) => module.TrendPlot), { ssr: false, loading: PlotSkeleton });
export const LazyHorizontalBarChart = dynamic(() => import("./HorizontalBarChart").then((module) => module.HorizontalBarChart), { ssr: false, loading: PlotSkeleton });

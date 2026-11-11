"use client";

import { memo, useMemo } from "react";
import { type DistributionResponse, formatNumber } from "@/lib/dashboard";
import { ChartCard, type Scope } from "./ChartCard";
import { barChartHeight, type BarRow } from "./barLayout";
import { LazyHorizontalBarChart as HorizontalBarChart } from "./lazyCharts";

export function toDistributionRows(response: DistributionResponse): BarRow[] {
  return response.data.map((item) => ({
    key: item.label,
    label: item.label === "Other" && response.otherCategories > 0 ? `Other (${response.otherCategories})` : item.label,
    value: item.count,
    valueLabel: `${formatNumber(item.percentage)}%`,
    detail: `${formatNumber(item.count)} of ${formatNumber(response.total)}`,
    muted: item.label === "Other",
  }));
}

interface DistributionChartProps {
  title: string;
  description: string;
  scope: Scope;
  /** Plural noun for the counted records, e.g. "doctors". */
  noun: string;
  /** Column heading for the category, e.g. "Specialization". */
  categoryName: string;
  emptyMessage: string;
  data?: DistributionResponse;
  status: "loading" | "error" | "ready";
  error?: string;
  refreshing?: boolean;
  onRetry?: () => void;
}

/**
 * Part-to-whole as ranked bars (not a donut): with 10+ categories, bar length compares far more
 * accurately than angles. The tail folds into a gray "Other" bar so shares still sum to 100%.
 */
export const DistributionChart = memo(function DistributionChart({ title, description, scope, noun, categoryName, emptyMessage, data, status, error, refreshing, onRetry }: DistributionChartProps) {
  const rows = useMemo(() => data ? toDistributionRows(data) : [], [data]);
  const top = data?.data.find((item) => item.label !== "Other");
  const summary = data && top
    ? `${formatNumber(data.total)} ${noun} across ${data.categories} ${categoryName.toLowerCase()} categor${data.categories === 1 ? "y" : "ies"}. Most common: ${top.label} (${formatNumber(top.count)}, ${formatNumber(top.percentage)}%).`
    : undefined;

  return (
    <ChartCard
      title={title} description={description} scope={scope} height={barChartHeight(rows.length || 6)}
      status={status === "ready" ? (data && data.total > 0 ? "ready" : "empty") : status}
      emptyMessage={emptyMessage} error={error} onRetry={onRetry} refreshing={refreshing} summary={summary}
      table={{ caption: title, columns: [categoryName, "Count", "Share"], rows: (data?.data ?? []).map((item, index) => [rows[index]?.label ?? item.label, item.count, `${formatNumber(item.percentage)}%`]) }}
    >
      <HorizontalBarChart rows={rows} valueName="Share" />
    </ChartCard>
  );
});

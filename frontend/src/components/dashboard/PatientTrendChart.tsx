"use client";

import { memo, useMemo } from "react";
import { formatRange, toTrendPoints, type TrendResponse, trendSummary } from "@/lib/dashboard";
import { ChartCard } from "./ChartCard";
import { LazyTrendPlot } from "./lazyCharts";

const HEIGHT = 280; // keep in sync with TREND_HEIGHT in TrendPlot


interface PatientTrendChartProps {
  data?: TrendResponse;
  status: "loading" | "error" | "ready";
  error?: string;
  refreshing?: boolean;
  onRetry?: () => void;
}

export const PatientTrendChart = memo(function PatientTrendChart({ data, status, error, refreshing, onRetry }: PatientTrendChartProps) {
  const points = useMemo(() => data ? toTrendPoints(data) : [], [data]);
  const unit = data?.range.granularity ?? "day";
  const description = data
    ? `New patient registrations per ${unit}, ${formatRange(data.range)} (UTC).`
    : "New patient registrations over the selected period.";

  return (
    <ChartCard
      title="Patient registrations" description={description} scope="period" height={HEIGHT}
      status={status === "ready" ? (data && data.total > 0 ? "ready" : "empty") : status}
      emptyMessage={data ? `No patients were registered between ${formatRange(data.range)}. Try a longer period.` : undefined}
      error={error} onRetry={onRetry} refreshing={refreshing}
      summary={data ? trendSummary(data) : undefined}
      table={{ caption: "Patient registrations by period", columns: ["Period", "New patients"], rows: points.map((point) => [point.fullLabel, point.count]) }}
    >
      <LazyTrendPlot points={points} />
    </ChartCard>
  );
});

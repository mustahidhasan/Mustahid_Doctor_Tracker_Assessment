"use client";

import { memo, useMemo } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, type TooltipContentProps, XAxis, YAxis } from "recharts";
import { formatNumber, formatRange, toTrendPoints, type TrendPoint, type TrendResponse, trendSummary } from "@/lib/dashboard";
import { ChartCard } from "./ChartCard";
import { axisTick, chartTheme, TooltipCard, useIsCompact, usePrefersReducedMotion } from "./chartTheme";

const HEIGHT = 280;

function TrendTooltip({ active, payload }: TooltipContentProps) {
  const point = payload?.[0]?.payload as TrendPoint | undefined;
  if (!active || !point) return null;
  return <TooltipCard title={point.fullLabel} lines={[{ label: "New patients", value: formatNumber(point.count) }]} />;
}

interface PatientTrendChartProps {
  data?: TrendResponse;
  status: "loading" | "error" | "ready";
  error?: string;
  refreshing?: boolean;
  onRetry?: () => void;
}

export const PatientTrendChart = memo(function PatientTrendChart({ data, status, error, refreshing, onRetry }: PatientTrendChartProps) {
  const compact = useIsCompact();
  const reducedMotion = usePrefersReducedMotion();
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
      <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 640, height: HEIGHT }}>
        <AreaChart data={points} margin={{ top: 8, right: 12, bottom: 0, left: 0 }} accessibilityLayer>
          <defs>
            <linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={chartTheme.seriesFill} stopOpacity={0.28} />
              <stop offset="100%" stopColor={chartTheme.seriesFill} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke={chartTheme.grid} />
          <XAxis dataKey="axisLabel" tick={axisTick} tickLine={false} axisLine={{ stroke: chartTheme.axis }}
            interval="preserveStartEnd" minTickGap={compact ? 24 : 12} tickMargin={8} />
          {/* Zero baseline and whole numbers keep the scale honest. */}
          <YAxis allowDecimals={false} domain={[0, (max: number) => Math.max(4, Math.ceil(max * 1.1))]} tick={axisTick}
            tickLine={false} axisLine={false} width={36} />
          <Tooltip content={TrendTooltip} cursor={{ stroke: chartTheme.axis, strokeWidth: 1 }} />
          <Area type="monotone" dataKey="count" name="New patients" stroke={chartTheme.series} strokeWidth={2} fill="url(#trend-fill)"
            dot={points.length <= 14 ? { r: 3, fill: chartTheme.series, strokeWidth: 0 } : false}
            activeDot={{ r: 5, fill: chartTheme.series, stroke: "#fff", strokeWidth: 2 }} isAnimationActive={!reducedMotion} />
        </AreaChart>
      </ResponsiveContainer>
    </ChartCard>
  );
});

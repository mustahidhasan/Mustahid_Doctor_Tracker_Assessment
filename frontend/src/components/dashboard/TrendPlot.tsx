"use client";

import { memo } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, type TooltipContentProps, XAxis, YAxis } from "recharts";
import { formatNumber, type TrendPoint } from "@/lib/dashboard";
import { niceAxisMax } from "./barLayout";
import { axisTick, chartTheme, TooltipCard, useIsCompact, usePrefersReducedMotion } from "./chartTheme";

export const TREND_HEIGHT = 280;
const HEIGHT = TREND_HEIGHT;

function TrendTooltip({ active, payload }: TooltipContentProps) {
  const point = payload?.[0]?.payload as TrendPoint | undefined;
  if (!active || !point) return null;
  return <TooltipCard title={point.fullLabel} lines={[{ label: "New patients", value: formatNumber(point.count) }]} />;
}

/** The Recharts area chart itself; loaded lazily by PatientTrendChart. */
export const TrendPlot = memo(function TrendPlot({ points }: { points: TrendPoint[] }) {
  const compact = useIsCompact();
  const reducedMotion = usePrefersReducedMotion();
  return (
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
          <YAxis allowDecimals={false} domain={[0, (max: number) => niceAxisMax(Math.max(4, max))]} tick={axisTick}
            tickLine={false} axisLine={false} width={36} />
          <Tooltip content={TrendTooltip} cursor={{ stroke: chartTheme.axis, strokeWidth: 1 }} />
          <Area type="monotone" dataKey="count" name="New patients" stroke={chartTheme.series} strokeWidth={2} fill="url(#trend-fill)"
            dot={points.length <= 14 ? { r: 3, fill: chartTheme.series, strokeWidth: 0 } : false}
            activeDot={{ r: 5, fill: chartTheme.series, stroke: "#fff", strokeWidth: 2 }} isAnimationActive={!reducedMotion} />
        </AreaChart>
      </ResponsiveContainer>
  );
});

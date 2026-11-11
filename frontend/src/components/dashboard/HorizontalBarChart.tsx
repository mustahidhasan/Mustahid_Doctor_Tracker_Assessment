"use client";

import { memo } from "react";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, type TooltipContentProps, XAxis, YAxis } from "recharts";
import { axisTick, chartTheme, TooltipCard, truncateLabel, useIsCompact, usePrefersReducedMotion } from "./chartTheme";

export interface BarRow {
  key: string;
  label: string;
  value: number;
  /** Optional secondary line for the tooltip (e.g. specialization, percentage). */
  detail?: string;
  /** Text shown at the end of the bar. */
  valueLabel: string;
  muted?: boolean;
}

const ROW_HEIGHT = 34;
const AXIS_HEIGHT = 28;
export const barChartHeight = (rows: number) => Math.max(rows, 1) * ROW_HEIGHT + AXIS_HEIGHT;

function BarTooltip({ active, payload, valueName }: TooltipContentProps & { valueName: string }) {
  const row = payload?.[0]?.payload as BarRow | undefined;
  if (!active || !row) return null;
  return <TooltipCard title={row.label} lines={[{ label: valueName, value: row.valueLabel }, ...(row.detail ? [{ label: row.detail, value: "", muted: true }] : [])]} />;
}

/** Ranked horizontal bars: one hue, rounded data-ends, value labels at the bar end. */
export const HorizontalBarChart = memo(function HorizontalBarChart({ rows, valueName }: { rows: BarRow[]; valueName: string }) {
  const compact = useIsCompact();
  const reducedMotion = usePrefersReducedMotion();
  const labelWidth = compact ? 108 : 168;
  const labelLength = compact ? 14 : 24;

  return (
    <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 560, height: barChartHeight(rows.length) }}>
      <BarChart data={rows} layout="vertical" margin={{ top: 0, right: compact ? 48 : 64, bottom: 0, left: 0 }} barCategoryGap={8} accessibilityLayer>
        <CartesianGrid horizontal={false} stroke={chartTheme.grid} />
        <XAxis type="number" allowDecimals={false} domain={[0, (max: number) => Math.max(1, max)]} tick={axisTick} tickLine={false}
          axisLine={{ stroke: chartTheme.axis }} height={AXIS_HEIGHT} />
        <YAxis type="category" dataKey="label" width={labelWidth} tickLine={false} axisLine={false} interval={0}
          tick={{ ...axisTick, fill: chartTheme.label }} tickFormatter={(value: string) => truncateLabel(value, labelLength)} />
        <Tooltip content={(props) => <BarTooltip {...(props as TooltipContentProps)} valueName={valueName} />} cursor={{ fill: "#f1f5f9" }} />
        <Bar dataKey="value" name={valueName} radius={[0, 4, 4, 0]} maxBarSize={20} isAnimationActive={!reducedMotion}>
          {rows.map((row) => <Cell key={row.key} fill={row.muted ? chartTheme.other : chartTheme.series} />)}
          <LabelList dataKey="valueLabel" position="right" offset={8} fill={chartTheme.label} fontSize={chartTheme.fontSize} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
});

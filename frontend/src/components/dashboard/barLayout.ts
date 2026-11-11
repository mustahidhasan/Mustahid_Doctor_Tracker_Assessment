/** Recharts-free layout helpers, so chart cards can size themselves without loading the chart library. */
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

export const BAR_ROW_HEIGHT = 34;
export const BAR_AXIS_HEIGHT = 28;
export const barChartHeight = (rows: number) => Math.max(rows, 1) * BAR_ROW_HEIGHT + BAR_AXIS_HEIGHT;

/**
 * Rounds an axis maximum up to a "nice" value (1, 2, 5 × 10ⁿ steps) so the last tick lands on a
 * round number instead of crowding the raw maximum next to a regular tick (e.g. "12 14").
 */
export function niceAxisMax(max: number): number {
  if (!Number.isFinite(max) || max <= 0) return 1;
  if (max <= 5) return Math.ceil(max);
  // Smallest whole-number step from 1, 2, 5, 10, 20, 50, … giving at most 5 intervals.
  for (let power = 1; ; power *= 10) {
    for (const multiple of [1, 2, 5]) {
      const step = multiple * power;
      if (max / step <= 5) return Math.ceil(max / step) * step;
    }
  }
}

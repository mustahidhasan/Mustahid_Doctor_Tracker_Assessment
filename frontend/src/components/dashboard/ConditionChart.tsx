"use client";

import type { DistributionResponse } from "@/lib/dashboard";
import { DistributionChart } from "./DistributionChart";

type Props = { data?: DistributionResponse; status: "loading" | "error" | "ready"; error?: string; refreshing?: boolean; onRetry?: () => void };

export function ConditionChart(props: Props) {
  return <DistributionChart {...props} title="Patient conditions" description="Most common conditions among patients registered in this period." scope="period"
    noun="patients" categoryName="Condition" emptyMessage="No patients were registered in this period, so there are no conditions to show." />;
}

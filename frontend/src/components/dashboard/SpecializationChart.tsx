"use client";

import type { DistributionResponse } from "@/lib/dashboard";
import { DistributionChart } from "./DistributionChart";

type Props = { data?: DistributionResponse; status: "loading" | "error" | "ready"; error?: string; refreshing?: boolean; onRetry?: () => void };

export function SpecializationChart(props: Props) {
  return <DistributionChart {...props} title="Doctor specializations" description="Share of all doctors by specialization." scope="all-time"
    noun="doctors" categoryName="Specialization" emptyMessage="No doctors yet. Specializations appear once doctors are added." />;
}

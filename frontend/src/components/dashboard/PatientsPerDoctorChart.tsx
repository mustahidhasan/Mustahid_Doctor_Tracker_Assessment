"use client";

import { memo, useMemo } from "react";
import { formatNumber, type PatientsPerDoctorResponse } from "@/lib/dashboard";
import { ChartCard } from "./ChartCard";
import { barChartHeight, type BarRow, HorizontalBarChart } from "./HorizontalBarChart";

interface PatientsPerDoctorChartProps {
  data?: PatientsPerDoctorResponse;
  status: "loading" | "error" | "ready";
  error?: string;
  refreshing?: boolean;
  onRetry?: () => void;
}

export function toDoctorRows(response: PatientsPerDoctorResponse): BarRow[] {
  return response.data.map((doctor) => ({
    key: doctor.doctorId,
    label: doctor.name,
    value: doctor.patientCount,
    valueLabel: formatNumber(doctor.patientCount),
    detail: doctor.specialization,
  }));
}

export const PatientsPerDoctorChart = memo(function PatientsPerDoctorChart({ data, status, error, refreshing, onRetry }: PatientsPerDoctorChartProps) {
  const rows = useMemo(() => data ? toDoctorRows(data) : [], [data]);
  const top = data?.data[0];
  const meta = data?.meta;
  const summary = top && meta
    ? `${top.name} has the most patients (${top.patientCount}). ${meta.doctorsWithPatients} of ${meta.totalDoctors} doctors have at least one patient; ${meta.doctorsWithoutPatients} have none.`
    : undefined;

  return (
    <ChartCard
      title="Patients per doctor" description={`Doctors with the largest current caseload (top ${meta?.limit ?? 10}).`} scope="all-time"
      height={barChartHeight(rows.length || 6)}
      status={status === "ready" ? (rows.length ? "ready" : "empty") : status}
      emptyMessage="No doctors yet. Add doctors and assign patients to see caseloads."
      error={error} onRetry={onRetry} refreshing={refreshing} summary={summary}
      table={{ caption: "Patients per doctor", columns: ["Doctor", "Specialization", "Patients"], rows: (data?.data ?? []).map((doctor) => [doctor.name, doctor.specialization, doctor.patientCount]) }}
    >
      <HorizontalBarChart rows={rows} valueName="Patients" />
    </ChartCard>
  );
});

"use client";

import { PageHeader } from "@/components/layout/PageHeader";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { errorMessage } from "@/lib/api";
import {
  createDashboardClient, type DashboardData, type DashboardRange, type DashboardResults, type DashboardSection, periodLabel,
} from "@/lib/dashboard";
import { ConditionChart } from "./ConditionChart";
import { DateRangeFilter } from "./DateRangeFilter";
import { PatientsPerDoctorChart } from "./PatientsPerDoctorChart";
import { PatientTrendChart } from "./PatientTrendChart";
import { SpecializationChart } from "./SpecializationChart";
import { SummaryCards } from "./SummaryCards";

type Loaded = { [K in DashboardSection]?: DashboardData[K] };
type Errors = { [K in DashboardSection]?: string };
interface ViewState { key: string; data: Loaded; errors: Errors; }

const rangeKey = (range: DashboardRange) => range.kind === "preset" ? range.period : `${range.from}_${range.to}`;

export function DashboardManager({ client: injectedClient }: { client?: ReturnType<typeof createDashboardClient> }) {
  // One request cache per dashboard visit (see createDashboardClient).
  const [client] = useState(() => injectedClient ?? createDashboardClient());

  const [range, setRange] = useState<DashboardRange>({ kind: "preset", period: "30d" });
  const [reloadToken, setReloadToken] = useState(0);
  const [view, setView] = useState<ViewState | null>(null);
  const requestKey = `${rangeKey(range)}#${reloadToken}`;
  const latestRequest = useRef(requestKey);

  useEffect(() => {
    latestRequest.current = requestKey;
    let cancelled = false;
    client.load(range).then((results: DashboardResults) => {
      // Ignore responses for a range the user has already moved away from.
      if (cancelled || latestRequest.current !== requestKey) return;
      setView((previous) => {
        const data: Loaded = { ...(previous?.data ?? {}) }; // keep last good data for sections that failed
        const errors: Errors = {};
        for (const section of Object.keys(results) as DashboardSection[]) {
          const result = results[section];
          if (result.status === "fulfilled") (data as Record<string, unknown>)[section] = result.value;
          else errors[section] = errorMessage(result.error, "Request failed");
        }
        return { key: requestKey, data, errors };
      });
    });
    return () => { cancelled = true; };
  }, [client, range, requestKey]);

  const refreshing = view?.key !== requestKey;
  const data = view?.data ?? {};
  const errors = refreshing ? {} : view?.errors ?? {};

  const retry = useCallback(() => setReloadToken((value) => value + 1), []);
  const refresh = useCallback(() => { client.clear(); setReloadToken((value) => value + 1); }, [client]);
  const changeRange = useCallback((next: DashboardRange) => setRange(next), []);

  const status = (section: DashboardSection): "loading" | "error" | "ready" => {
    if (data[section]) return "ready";
    if (errors[section]) return "error";
    return "loading";
  };

  const label = useMemo(() => periodLabel(range), [range]);
  const summaryRange = data.summary?.range;
  const anyError = Object.keys(errors).length > 0;

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader eyebrow="Overview" title="Dashboard" description="Live analytics from your doctor and patient records." />

      <DateRangeFilter value={range} onChange={changeRange} resolved={summaryRange} refreshing={refreshing && Boolean(view)} onRefresh={refresh} />

      {anyError && Object.keys(data).length > 0 && (
        <div role="alert" className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <span>Some statistics could not be refreshed. Showing the most recent data available.</span>
          <button type="button" onClick={retry} className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 font-medium hover:bg-amber-100">Retry</button>
        </div>
      )}

      <div className={`mt-6 transition-opacity ${refreshing && view ? "opacity-90" : ""}`}>
        <SummaryCards summary={data.summary?.data} periodLabel={label} loading={status("summary") === "loading" || (refreshing && !data.summary)}
          {...(errors.summary ? { error: errors.summary } : {})} onRetry={retry} />
      </div>

      <div className="mt-6 min-w-0">
        <PatientTrendChart data={data.trends} status={status("trends")} error={errors.trends} refreshing={refreshing && Boolean(data.trends)} onRetry={retry} />
      </div>
      <div className="mt-6 grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-2">
        <PatientsPerDoctorChart data={data.patientsPerDoctor} status={status("patientsPerDoctor")} error={errors.patientsPerDoctor} onRetry={retry} />
        <ConditionChart data={data.conditions} status={status("conditions")} error={errors.conditions} refreshing={refreshing && Boolean(data.conditions)} onRetry={retry} />
        <SpecializationChart data={data.specializations} status={status("specializations")} error={errors.specializations} onRetry={retry} />
        <aside className="rounded-2xl border border-dashed border-slate-200 bg-white/60 p-5 text-sm leading-6 text-slate-600 sm:p-6">
          <h2 className="text-base font-semibold text-slate-900">How to read this dashboard</h2>
          <ul className="mt-3 list-disc space-y-1.5 pl-5">
            <li><span className="font-medium text-slate-800">All time</span> cards and charts describe current records and ignore the period.</li>
            <li><span className="font-medium text-slate-800">{label}</span> values count records by their creation date within the selected range.</li>
            <li>All dates use UTC. Weekly buckets start on Monday; the first and last bucket can be partial.</li>
            <li>Use <span className="font-medium text-slate-800">Show table</span> on any chart for exact values.</li>
          </ul>
        </aside>
      </div>
    </main>
  );
}

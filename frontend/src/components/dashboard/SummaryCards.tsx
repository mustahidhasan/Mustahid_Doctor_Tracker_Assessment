"use client";

import { memo, type ReactNode } from "react";
import { type DashboardSummary, formatNumber } from "@/lib/dashboard";
import { ScopeBadge, type Scope } from "./ChartCard";

const icons = {
  doctor: <path d="M12 2a4 4 0 1 1 0 8 4 4 0 0 1 0-8Zm-7 18a7 7 0 0 1 14 0v1H5v-1Zm11-6h2v2h2v2h-2v2h-2v-2h-2v-2h2v-2Z" />,
  patients: <path d="M9 4a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7Zm7.5 1a3 3 0 1 1 0 6 3 3 0 0 1 0-6ZM2 19a7 7 0 0 1 14 0v1H2v-1Zm15.5 1v-1c0-1.8-.6-3.5-1.7-4.8A5.5 5.5 0 0 1 22 19.5v.5h-4.5Z" />,
  newPatient: <path d="M10 3a4 4 0 1 1 0 8 4 4 0 0 1 0-8ZM3 20a7 7 0 0 1 11.4-5.4A5 5 0 0 0 13 18v2H3Zm15-6h2v3h3v2h-3v3h-2v-3h-3v-2h3v-3Z" />,
  ratio: <path d="M4 20V10h3v10H4Zm6.5 0V4h3v16h-3ZM17 20v-7h3v7h-3Z" />,
  stethoscope: <path d="M6 3h2v2H7v5a3 3 0 0 0 6 0V5h-1V3h2a1 1 0 0 1 1 1v6a5 5 0 0 1-4 4.9V16a3 3 0 0 0 6 0v-1.2a2.5 2.5 0 1 1 2 0V16a5 5 0 0 1-10 0v-1.1A5 5 0 0 1 5 10V4a1 1 0 0 1 1-1Z" />,
  pulse: <path d="M3 13h4l2-5 4 10 2.5-6H21v2h-4.2L13 21 9 11l-.7 2H3v-2Z" />,
};

interface KpiCardProps {
  title: string;
  value: ReactNode;
  description: string;
  icon: keyof typeof icons;
  scope: Scope;
  scopeLabel?: string;
  loading?: boolean;
  emphasis?: boolean;
}

export function KpiCard({ title, value, description, icon, scope, scopeLabel, loading, emphasis }: KpiCardProps) {
  return (
    <article className={`flex min-w-0 flex-col rounded-2xl border p-5 shadow-sm ${emphasis ? "border-teal-200 bg-gradient-to-br from-teal-50 to-white" : "border-slate-200 bg-white"}`} aria-busy={loading}>
      <div className="flex items-start justify-between gap-3">
        <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${emphasis ? "bg-teal-700 text-white" : "bg-teal-50 text-teal-700"}`}>
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">{icons[icon]}</svg>
        </div>
        <ScopeBadge scope={scope} {...(scopeLabel ? { label: scopeLabel } : {})} />
      </div>
      <h3 className="mt-4 text-sm font-medium text-slate-600">{title}</h3>
      {loading ? (
        <div className="mt-1.5 h-8 w-20 animate-pulse rounded-md bg-slate-200" role="status" aria-label={`Loading ${title}`} />
      ) : (
        <p className="mt-1 truncate text-3xl font-semibold tracking-tight text-slate-950 tabular-nums">{value}</p>
      )}
      <p className="mt-1.5 text-xs leading-5 text-slate-500">{description}</p>
    </article>
  );
}

interface SummaryCardsProps {
  summary?: DashboardSummary;
  periodLabel: string;
  loading: boolean;
  error?: string;
  onRetry?: () => void;
}

/** KPI cards. All-time and period values are labelled so they are never confused. No growth % is shown: there is no comparison period. */
export const SummaryCards = memo(function SummaryCards({ summary, periodLabel, loading, error, onRetry }: SummaryCardsProps) {
  if (error && !summary) {
    return (
      <div className="rounded-2xl border border-red-200 bg-white p-6 text-center shadow-sm">
        <p className="font-medium text-slate-900">Key statistics could not be loaded</p>
        <p role="alert" className="mt-1 text-sm text-red-700">{error}</p>
        {onRetry && <button type="button" onClick={onRetry} className="mt-4 rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-slate-800">Retry</button>}
      </div>
    );
  }
  const show = loading && !summary;
  const s = summary;
  const plural = (count: number, noun: string) => `${formatNumber(count)} ${noun}${count === 1 ? "" : "s"}`;

  return (
    <section aria-labelledby="key-statistics-heading" className="space-y-4">
      <h2 id="key-statistics-heading" className="sr-only">Key statistics</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard title="Total doctors" icon="doctor" scope="all-time" loading={show} value={s ? formatNumber(s.totalDoctors) : "—"}
          description={s ? `${plural(s.newDoctors, "doctor")} added in the ${periodLabel.toLowerCase()}.` : "Registered doctors."} />
        <KpiCard title="Total patients" icon="patients" scope="all-time" loading={show} value={s ? formatNumber(s.totalPatients) : "—"}
          description="All patients currently assigned to a doctor." />
        <KpiCard title="New patients" icon="newPatient" scope="period" scopeLabel={periodLabel} loading={show} emphasis value={s ? formatNumber(s.newPatients) : "—"}
          description={s && s.totalPatients > 0 ? `${formatNumber(Math.round((s.newPatients / s.totalPatients) * 1000) / 10)}% of all patients registered in this period.` : "Patients registered in this period."} />
        <KpiCard title="Avg. patients per doctor" icon="ratio" scope="all-time" loading={show} value={s ? formatNumber(s.averagePatientsPerDoctor) : "—"}
          description={s && s.totalDoctors > 0 ? `${plural(s.totalPatients, "patient")} across ${plural(s.totalDoctors, "doctor")}.` : "Calculated once doctors are added."} />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <KpiCard title="Most common specialization" icon="stethoscope" scope="all-time" loading={show}
          value={s?.topSpecialization ? s.topSpecialization.label : "—"}
          description={s?.topSpecialization ? `${plural(s.topSpecialization.count, "doctor")} practise this specialization.` : "No doctors yet."} />
        <KpiCard title="Most common condition" icon="pulse" scope="all-time" loading={show}
          value={s?.topCondition ? s.topCondition.label : "—"}
          description={s?.topCondition ? `${plural(s.topCondition.count, "patient")} have this condition.` : "No patients yet."} />
      </div>
    </section>
  );
});

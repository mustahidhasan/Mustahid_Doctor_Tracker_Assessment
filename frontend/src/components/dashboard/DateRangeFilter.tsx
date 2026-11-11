"use client";

import { type FormEvent, type KeyboardEvent, useRef, useState } from "react";
import { type DashboardRange, formatRange, PERIOD_OPTIONS, type RangeInfo, validateCustomRange } from "@/lib/dashboard";

interface DateRangeFilterProps {
  value: DashboardRange;
  onChange: (range: DashboardRange) => void;
  /** The range the server resolved, shown as concrete dates. */
  resolved?: RangeInfo;
  refreshing?: boolean;
  onRefresh: () => void;
}

const segment = (active: boolean) => `rounded-lg px-3 py-1.5 text-sm font-medium transition focus:outline-none focus-visible:ring-4 focus-visible:ring-teal-100 ${active ? "bg-white text-teal-800 shadow-sm ring-1 ring-slate-200" : "text-slate-600 hover:text-slate-900"}`;
const dateInput = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-teal-600 focus:ring-4 focus:ring-teal-100";

/** Global period selector: one control drives every period-based statistic so all charts share one date range. */
export function DateRangeFilter({ value, onChange, resolved, refreshing, onRefresh }: DateRangeFilterProps) {
  const [customOpen, setCustomOpen] = useState(value.kind === "custom");
  const [from, setFrom] = useState(value.kind === "custom" ? value.from : "");
  const [to, setTo] = useState(value.kind === "custom" ? value.to : "");
  const [error, setError] = useState("");
  const groupRef = useRef<HTMLDivElement>(null);
  const customActive = customOpen || value.kind === "custom";

  const selectPreset = (period: (typeof PERIOD_OPTIONS)[number]["value"]) => {
    setCustomOpen(false); setError("");
    if (!(value.kind === "preset" && value.period === period)) onChange({ kind: "preset", period });
  };

  // ARIA radio-group keyboard pattern: arrows/Home/End move focus and select; only the checked radio is tabbable.
  function onGroupKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const radios = Array.from(groupRef.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]') ?? []);
    const current = radios.indexOf(document.activeElement as HTMLButtonElement);
    if (current < 0) return;
    const last = radios.length - 1;
    const next = event.key === "ArrowRight" || event.key === "ArrowDown" ? (current === last ? 0 : current + 1)
      : event.key === "ArrowLeft" || event.key === "ArrowUp" ? (current === 0 ? last : current - 1)
      : event.key === "Home" ? 0 : event.key === "End" ? last : -1;
    if (next < 0) return;
    event.preventDefault();
    radios[next]!.focus();
    radios[next]!.click();
  }

  function applyCustom(event: FormEvent) {
    event.preventDefault();
    const problem = validateCustomRange(from, to);
    setError(problem ?? "");
    if (!problem) onChange({ kind: "custom", from, to });
  }

  return (
    <section aria-label="Dashboard date range" className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <div ref={groupRef} role="radiogroup" aria-label="Period" onKeyDown={onGroupKeyDown} className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1">
            {PERIOD_OPTIONS.map((option) => {
              const active = value.kind === "preset" && value.period === option.value && !customOpen;
              return (
                <button key={option.value} type="button" role="radio" aria-checked={active} aria-label={option.label} tabIndex={active ? 0 : -1} className={segment(active)}
                  onClick={() => selectPreset(option.value)}>
                  <span className="sm:hidden">{option.short}</span><span className="hidden sm:inline">{option.label}</span>
                </button>
              );
            })}
            <button type="button" role="radio" aria-checked={customActive} tabIndex={customActive ? 0 : -1} className={segment(customActive)}
              onClick={() => setCustomOpen(true)}>Custom</button>
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 text-sm text-slate-500 lg:justify-end">
          <p aria-live="polite">
            {refreshing ? <span className="inline-flex items-center gap-2"><span aria-hidden="true" className="h-3 w-3 animate-spin rounded-full border-2 border-teal-600 border-t-transparent" />Updating…</span>
              : resolved ? <>Showing <span className="font-medium text-slate-700">{formatRange(resolved)}</span> <span className="text-slate-500">(UTC)</span></> : null}
          </p>
          <button type="button" onClick={onRefresh} disabled={refreshing} aria-label="Refresh dashboard"
            className="rounded-lg border border-slate-200 p-2 text-slate-600 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-slate-200 disabled:opacity-50">
            <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}><path fillRule="evenodd" d="M15.3 5.3A7 7 0 0 0 3.1 9H1.6a8.5 8.5 0 0 1 14.8-4.8V2h1.5v5h-5V5.5h2.4ZM4.7 14.7A7 7 0 0 0 16.9 11h1.5a8.5 8.5 0 0 1-14.8 4.8V18H2.1v-5h5v1.5H4.7Z" clipRule="evenodd" /></svg>
          </button>
        </div>
      </div>
      {customOpen && (
        <form onSubmit={applyCustom} noValidate className="mt-3 grid gap-3 border-t border-slate-100 pt-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">From
            <input type="date" aria-label="Custom start date" value={from} max={to || undefined} onChange={(event) => setFrom(event.target.value)} className={`${dateInput} mt-1.5 normal-case tracking-normal`} />
          </label>
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">To
            <input type="date" aria-label="Custom end date" value={to} min={from || undefined} onChange={(event) => setTo(event.target.value)} className={`${dateInput} mt-1.5 normal-case tracking-normal`} />
          </label>
          <button type="submit" className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-800 focus:outline-none focus-visible:ring-4 focus-visible:ring-teal-200">Apply range</button>
          {error && <p role="alert" className="text-sm text-red-600 sm:col-span-3">{error}</p>}
        </form>
      )}
    </section>
  );
}

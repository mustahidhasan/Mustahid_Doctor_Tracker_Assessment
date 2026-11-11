"use client";

import { type ReactNode, useId, useRef, useState } from "react";
import { useNearViewport } from "./useNearViewport";

export type Scope = "all-time" | "period";

export function ScopeBadge({ scope, label }: { scope: Scope; label?: string }) {
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ring-1 ring-inset ${scope === "all-time" ? "bg-slate-50 text-slate-600 ring-slate-500/20" : "bg-teal-50 text-teal-800 ring-teal-600/20"}`}>
      {label ?? (scope === "all-time" ? "All time" : "Selected period")}
    </span>
  );
}

export interface TableView { caption: string; columns: string[]; rows: Array<Array<string | number>>; }

interface ChartCardProps {
  title: string;
  description: string;
  scope: Scope;
  scopeLabel?: string;
  /** Plain-language summary of the chart, announced to screen readers and shown under the chart. */
  summary?: string;
  status: "loading" | "error" | "empty" | "ready";
  error?: string;
  emptyMessage?: string;
  onRetry?: () => void;
  refreshing?: boolean;
  table?: TableView;
  /** Height of the plot area including axis labels, so cards never scroll internally. */
  height: number;
  className?: string;
  children?: ReactNode;
}

/** Shared frame for every dashboard chart: header, scope badge, states, and an accessible table view. */
export function ChartCard({ title, description, scope, scopeLabel, summary, status, error, emptyMessage, onRetry, refreshing, table, height, className = "", children }: ChartCardProps) {
  const [showTable, setShowTable] = useState(false);
  const titleId = useId();
  const summaryId = useId();
  const frame = useRef<HTMLDivElement>(null);
  const nearViewport = useNearViewport(frame);

  return (
    <section aria-labelledby={titleId} aria-busy={status === "loading" || refreshing} className={`flex min-w-0 flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6 ${className}`}>
      <header className="mb-4 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id={titleId} className="text-base font-semibold text-slate-950">{title}</h2>
            <ScopeBadge scope={scope} {...(scopeLabel ? { label: scopeLabel } : {})} />
          </div>
          <p className="mt-1 text-sm text-slate-500">{description}</p>
        </div>
        {status === "ready" && table && (
          <button type="button" onClick={() => setShowTable((value) => !value)} aria-pressed={showTable}
            className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-slate-200">
            {showTable ? "Show chart" : "Show table"}
          </button>
        )}
      </header>

      <div ref={frame} className={`relative flex-1 transition-opacity ${refreshing ? "opacity-60" : ""}`}>
        {status === "loading" ? (
          <div role="status" aria-label={`Loading ${title}`} className="animate-pulse" style={{ height }}>
            <div className="flex h-full items-end gap-2 rounded-xl bg-slate-50 p-4">
              {[40, 65, 50, 80, 55, 70, 45, 60].map((value, index) => <div key={index} className="flex-1 rounded-t bg-slate-200" style={{ height: `${value}%` }} />)}
            </div>
          </div>
        ) : status === "error" ? (
          <div className="grid place-items-center rounded-xl border border-dashed border-red-200 bg-red-50/40 p-6 text-center" style={{ minHeight: height }}>
            <div>
              <p className="text-sm font-medium text-slate-900">{title} could not be loaded</p>
              <p role="alert" className="mt-1 text-sm text-red-700">{error}</p>
              {onRetry && <button type="button" onClick={onRetry} className="mt-4 rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-slate-800 focus:outline-none focus-visible:ring-4 focus-visible:ring-slate-300">Retry</button>}
            </div>
          </div>
        ) : status === "empty" ? (
          <div className="grid place-items-center rounded-xl border border-dashed border-slate-200 bg-slate-50/60 p-6 text-center" style={{ minHeight: height }}>
            <p className="max-w-xs text-sm text-slate-500">{emptyMessage ?? "No data for this selection."}</p>
          </div>
        ) : showTable && table ? (
          <div className="overflow-x-auto" style={{ maxHeight: Math.max(height, 240) }}>
            <table className="w-full text-left text-sm">
              <caption className="sr-only">{table.caption}</caption>
              <thead className="sticky top-0 bg-white text-xs uppercase tracking-wider text-slate-500">
                <tr>{table.columns.map((column, index) => <th key={column} scope="col" className={`py-2 pr-3 font-semibold ${index > 0 ? "text-right" : ""}`}>{column}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {table.rows.map((row, rowIndex) => (
                  <tr key={rowIndex}>{row.map((cell, index) => index === 0
                    ? <th key={index} scope="row" className="py-2 pr-3 font-normal">{cell}</th>
                    : <td key={index} className="py-2 pr-3 text-right tabular-nums">{cell}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <figure role="img" aria-label={summary ?? title} aria-describedby={summary ? summaryId : undefined} className="m-0 w-full min-w-0" style={{ height }}>
            {nearViewport ? children : <div aria-hidden="true" className="h-full w-full rounded-xl bg-slate-50" />}
          </figure>
        )}
      </div>
      {status === "ready" && summary && <p id={summaryId} className="mt-3 text-xs leading-5 text-slate-500">{summary}</p>}
    </section>
  );
}

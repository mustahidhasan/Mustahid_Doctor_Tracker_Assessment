"use client";

import type { Pagination as PaginationState } from "@/lib/api";

interface PaginationProps {
  pagination: PaginationState;
  itemCount: number;
  /** Singular noun for the records, e.g. "doctor" or "patient". */
  noun: string;
  disabled?: boolean;
  onPageChange: (page: number) => void;
}

export function Pagination({ pagination, itemCount, noun, disabled, onPageChange }: PaginationProps) {
  if (pagination.totalPages === 0) return null;
  const first = (pagination.page - 1) * pagination.limit + 1;
  const last = first + itemCount - 1;
  const button = "rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-slate-200 disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <nav className="mt-4 flex flex-col items-center justify-between gap-3 sm:flex-row" aria-label={`${noun[0]!.toUpperCase()}${noun.slice(1)} list pagination`}>
      <p className="text-sm text-slate-500">
        {itemCount > 0 ? <>Showing <span className="font-medium text-slate-700">{first}–{last}</span> of </> : null}
        <span className="font-medium text-slate-700">{pagination.total}</span> {noun}{pagination.total === 1 ? "" : "s"}
      </p>
      <div className="flex items-center gap-2">
        <button type="button" className={button} disabled={disabled || !pagination.hasPreviousPage} onClick={() => onPageChange(pagination.page - 1)}>Previous</button>
        <span className="px-2 text-sm text-slate-600" aria-current="page">Page {pagination.page} of {pagination.totalPages}</span>
        <button type="button" className={button} disabled={disabled || !pagination.hasNextPage} onClick={() => onPageChange(pagination.page + 1)}>Next</button>
      </div>
    </nav>
  );
}

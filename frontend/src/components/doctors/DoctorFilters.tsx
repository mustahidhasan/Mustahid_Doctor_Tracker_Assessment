"use client";

import { SelectMenu, type SelectOption } from "@/components/ui/SelectMenu";
import type { DoctorFilterOptions, DoctorSort } from "@/lib/doctors";

export interface FilterState { search: string; specialization: string; hospital: string; dateFrom: string; dateTo: string; sort: DoctorSort; }

export const initialFilters: FilterState = { search: "", specialization: "", hospital: "", dateFrom: "", dateTo: "", sort: "newest" };

export function hasInvalidDateRange(filters: Pick<FilterState, "dateFrom" | "dateTo">): boolean {
  return Boolean(filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo);
}

export function activeFilterCount(filters: FilterState): number {
  return [filters.search.trim(), filters.specialization, filters.hospital, filters.dateFrom, filters.dateTo].filter(Boolean).length;
}

const control = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-teal-600 focus:ring-4 focus:ring-teal-100";
const label = "mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500";

const SORT_OPTIONS: SelectOption[] = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "name", label: "Name A–Z" },
];

interface DoctorFiltersProps {
  filters: FilterState;
  options: DoctorFilterOptions;
  onChange: (filters: FilterState) => void;
  onReset: () => void;
}

export function DoctorFilters({ filters, options, onChange, onReset }: DoctorFiltersProps) {
  const update = <K extends keyof FilterState>(field: K, value: FilterState[K]) => onChange({ ...filters, [field]: value });
  const invalidRange = hasInvalidDateRange(filters);
  const activeCount = activeFilterCount(filters);
  // Keep a selected value visible even if it is no longer in the option list.
  const toOptions = (allLabel: string, values: string[], selected: string): SelectOption[] => [
    { value: "", label: allLabel },
    ...(selected && !values.includes(selected) ? [selected, ...values] : values).map((value) => ({ value, label: value })),
  ];

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5" aria-label="Doctor filters">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-12">
        <div className="md:col-span-2 xl:col-span-3">
          <label htmlFor="doctor-search" className={label}>Search</label>
          <div className="relative">
            <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"><path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.45 4.39l3.08 3.08a.75.75 0 1 1-1.06 1.06l-3.08-3.08A7 7 0 0 1 2 9Z" clipRule="evenodd" /></svg>
            <input id="doctor-search" type="search" aria-label="Search doctors" placeholder="Name, specialization, hospital, or email" maxLength={100}
              value={filters.search} onChange={(event) => update("search", event.target.value)} className={`${control} pl-9`} />
          </div>
        </div>
        <div className="xl:col-span-2">
          <label htmlFor="doctor-specialization-filter" className={label}>Specialization</label>
          <SelectMenu id="doctor-specialization-filter" label="Filter specialization" value={filters.specialization} searchable searchPlaceholder="Search specializations…"
            options={toOptions("All specializations", options.specializations, filters.specialization)} onChange={(value) => update("specialization", value)} />
        </div>
        <div className="xl:col-span-2">
          <label htmlFor="doctor-hospital-filter" className={label}>Hospital</label>
          <SelectMenu id="doctor-hospital-filter" label="Filter hospital" value={filters.hospital} searchable searchPlaceholder="Search hospitals…"
            options={toOptions("All hospitals", options.hospitals, filters.hospital)} onChange={(value) => update("hospital", value)} />
        </div>
        <fieldset className="md:col-span-2 xl:col-span-3">
          <legend className={label}>Date added</legend>
          <div className="grid grid-cols-2 gap-2">
            <input type="date" aria-label="Created from" value={filters.dateFrom} max={filters.dateTo || undefined} onChange={(event) => update("dateFrom", event.target.value)}
              aria-invalid={invalidRange} className={`${control} ${invalidRange ? "border-red-300" : ""}`} />
            <input type="date" aria-label="Created to" value={filters.dateTo} min={filters.dateFrom || undefined} onChange={(event) => update("dateTo", event.target.value)}
              aria-invalid={invalidRange} className={`${control} ${invalidRange ? "border-red-300" : ""}`} />
          </div>
        </fieldset>
        <div className="xl:col-span-2">
          <label htmlFor="doctor-sort" className={label}>Sort</label>
          <SelectMenu id="doctor-sort" label="Sort doctors" value={filters.sort} options={SORT_OPTIONS} align="right" onChange={(value) => update("sort", value as DoctorSort)} />
        </div>
      </div>
      {(invalidRange || activeCount > 0) && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3 text-sm">
          {invalidRange
            ? <p className="text-red-600" role="alert">The start date must be on or before the end date.</p>
            : <p className="text-slate-500">{activeCount} active filter{activeCount === 1 ? "" : "s"}</p>}
          <button type="button" onClick={onReset} className="font-medium text-teal-700 hover:text-teal-900 focus:outline-none focus-visible:underline">Clear filters</button>
        </div>
      )}
    </section>
  );
}

"use client";

import { SelectMenu, type SelectOption } from "@/components/ui/SelectMenu";
import { PATIENT_SORT_LABELS, type PatientFilterOptions, type PatientSort } from "@/lib/patients";

export interface PatientFilterState { search: string; condition: string; doctorId: string; dateFrom: string; dateTo: string; sort: PatientSort; }

export const initialPatientFilters: PatientFilterState = { search: "", condition: "", doctorId: "", dateFrom: "", dateTo: "", sort: "newest" };

export function hasInvalidPatientDateRange(filters: Pick<PatientFilterState, "dateFrom" | "dateTo">): boolean {
  return Boolean(filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo);
}

export function activePatientFilterCount(filters: PatientFilterState): number {
  return [filters.search.trim(), filters.condition, filters.doctorId, filters.dateFrom, filters.dateTo].filter(Boolean).length;
}

const control = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-teal-600 focus:ring-4 focus:ring-teal-100";
const label = "mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500";
const SORT_OPTIONS: SelectOption[] = (Object.keys(PATIENT_SORT_LABELS) as PatientSort[]).map((value) => ({ value, label: PATIENT_SORT_LABELS[value] }));

interface PatientFiltersProps {
  filters: PatientFilterState;
  options: PatientFilterOptions;
  onChange: (filters: PatientFilterState) => void;
  onReset: () => void;
}

export function PatientFilters({ filters, options, onChange, onReset }: PatientFiltersProps) {
  const update = <K extends keyof PatientFilterState>(field: K, value: PatientFilterState[K]) => onChange({ ...filters, [field]: value });
  const invalidRange = hasInvalidPatientDateRange(filters);
  const activeCount = activePatientFilterCount(filters);

  const conditionOptions: SelectOption[] = [
    { value: "", label: "All conditions" },
    ...(filters.condition && !options.conditions.includes(filters.condition) ? [filters.condition, ...options.conditions] : options.conditions).map((value) => ({ value, label: value })),
  ];
  const doctorOptions: SelectOption[] = [
    { value: "", label: "All doctors" },
    ...(filters.doctorId && !options.doctors.some((doctor) => doctor._id === filters.doctorId) ? [{ value: filters.doctorId, label: "Selected doctor" }] : []),
    ...options.doctors.map((doctor) => ({ value: doctor._id, label: `${doctor.name} · ${doctor.specialization}` })),
  ];

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5" aria-label="Patient filters">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-12">
        <div className="md:col-span-2 xl:col-span-3">
          <label htmlFor="patient-search" className={label}>Search</label>
          <div className="relative">
            <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"><path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.45 4.39l3.08 3.08a.75.75 0 1 1-1.06 1.06l-3.08-3.08A7 7 0 0 1 2 9Z" clipRule="evenodd" /></svg>
            <input id="patient-search" type="search" aria-label="Search patients" placeholder="Name, condition, or email" maxLength={100}
              value={filters.search} onChange={(event) => update("search", event.target.value)} className={`${control} pl-9`} />
          </div>
        </div>
        <div className="xl:col-span-2">
          <label htmlFor="patient-condition-filter" className={label}>Condition</label>
          <SelectMenu id="patient-condition-filter" label="Filter condition" value={filters.condition} options={conditionOptions} searchable searchPlaceholder="Search conditions…"
            onChange={(value) => update("condition", value)} />
        </div>
        <div className="xl:col-span-2">
          <label htmlFor="patient-doctor-filter" className={label}>Doctor</label>
          <SelectMenu id="patient-doctor-filter" label="Filter doctor" value={filters.doctorId} options={doctorOptions} searchable searchPlaceholder="Search doctors…"
            onChange={(value) => update("doctorId", value)} />
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
          <label htmlFor="patient-sort" className={label}>Sort</label>
          <SelectMenu id="patient-sort" label="Sort patients" value={filters.sort} options={SORT_OPTIONS} align="right" onChange={(value) => update("sort", value as PatientSort)} />
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

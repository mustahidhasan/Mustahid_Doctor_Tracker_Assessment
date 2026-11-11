"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Modal } from "@/components/ui/Modal";
import { Toast, useToast } from "@/components/ui/Toast";
import {
  createDoctor, deleteDoctor, type Doctor, type DoctorFilterOptions, type DoctorInput, type DoctorList, type DoctorQuery,
  errorMessage, getDoctorFilterOptions, listDoctors, updateDoctor,
} from "@/lib/doctors";
import { activeFilterCount, DoctorFilters, type FilterState, hasInvalidDateRange, initialFilters } from "./DoctorFilters";
import { DoctorForm } from "./DoctorForm";
import { DoctorPagination } from "./DoctorPagination";
import { DoctorTable, DoctorTableSkeleton } from "./DoctorTable";

export const PAGE_SIZE = 10;
export const SEARCH_DEBOUNCE_MS = 350;

type FormState = { mode: "create" } | { mode: "edit"; doctor: Doctor } | null;
interface LoadResult { key: string; list?: DoctorList; error?: string; }

export function DoctorsManager() {
  const [filters, setFilters] = useState<FilterState>(initialFilters);
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [reloadToken, setReloadToken] = useState(0);
  const [result, setResult] = useState<LoadResult | null>(null);
  const [options, setOptions] = useState<DoctorFilterOptions>({ specializations: [], hospitals: [] });
  const [optionsToken, setOptionsToken] = useState(0);
  const [form, setForm] = useState<FormState>(null);
  const [pendingDelete, setPendingDelete] = useState<Doctor | null>(null);
  const { toast, notify, dismiss } = useToast();

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(filters.search.trim()), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [filters.search]);

  const invalidRange = hasInvalidDateRange(filters);
  const query = useMemo<DoctorQuery>(() => ({
    page, limit: PAGE_SIZE, search: debouncedSearch, specialization: filters.specialization, hospital: filters.hospital,
    dateFrom: filters.dateFrom, dateTo: filters.dateTo, sort: filters.sort,
  }), [page, debouncedSearch, filters.specialization, filters.hospital, filters.dateFrom, filters.dateTo, filters.sort]);
  const requestKey = `${JSON.stringify(query)}#${reloadToken}`;

  useEffect(() => {
    if (invalidRange) return;
    // Abort superseded requests so a slow, older response can never overwrite newer results.
    const controller = new AbortController();
    listDoctors(query, controller.signal)
      .then((list) => {
        // If deletions left this page empty, step back to the last page that has data.
        if (list.data.length === 0 && list.pagination.totalPages > 0 && query.page > list.pagination.totalPages) setPage(list.pagination.totalPages);
        setResult({ key: requestKey, list });
      })
      .catch((error: unknown) => { if (!controller.signal.aborted) setResult({ key: requestKey, error: errorMessage(error, "Unable to load doctors") }); });
    return () => controller.abort();
  }, [query, requestKey, invalidRange]);

  useEffect(() => {
    let active = true;
    getDoctorFilterOptions().then((value) => { if (active) setOptions(value); }).catch(() => undefined);
    return () => { active = false; };
  }, [optionsToken]);

  const loading = !invalidRange && result?.key !== requestKey;
  const list = result?.list;
  const loadError = !loading && result?.error;
  const refresh = useCallback(() => { setReloadToken((value) => value + 1); setOptionsToken((value) => value + 1); }, []);

  const changeFilters = (next: FilterState) => { setFilters(next); setPage(1); };
  const resetFilters = () => { setFilters(initialFilters); setDebouncedSearch(""); setPage(1); };

  async function saveDoctor(input: DoctorInput) {
    if (form?.mode === "edit") {
      await updateDoctor(form.doctor._id, input);
      notify("success", `${input.name} was updated.`);
    } else {
      await createDoctor(input);
      notify("success", `${input.name} was added.`);
      // Show the new doctor at the top of the default view.
      if (filters.sort === "newest") setPage(1);
    }
    setForm(null);
    refresh();
  }

  async function confirmDelete(doctor: Doctor) {
    await deleteDoctor(doctor._id);
    notify("success", `${doctor.name} was deleted.`);
    refresh();
  }

  const filtered = activeFilterCount(filters) > 0;
  const showSkeleton = loading && !list;

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-teal-700">Clinical network</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Doctors</h1>
          <p className="mt-2 max-w-2xl text-slate-600">Search, filter, and manage doctors and the patients assigned to them.</p>
        </div>
        <button type="button" onClick={() => setForm({ mode: "create" })}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 py-2.5 font-semibold text-white shadow-sm transition hover:bg-teal-800 focus:outline-none focus-visible:ring-4 focus-visible:ring-teal-200">
          <span aria-hidden="true" className="text-lg leading-none">+</span> Add doctor
        </button>
      </header>

      <DoctorFilters filters={filters} options={options} onChange={changeFilters} onReset={resetFilters} />

      <section className="mt-5" aria-live="polite" aria-busy={loading}>
        {invalidRange ? (
          <EmptyState title="Check the date range" message="Choose a start date that is on or before the end date to see results." />
        ) : showSkeleton ? (
          <DoctorTableSkeleton />
        ) : loadError ? (
          <div className="rounded-2xl border border-red-200 bg-white p-8 text-center shadow-sm">
            <h2 className="font-semibold text-slate-900">Doctors could not be loaded</h2>
            <p className="mt-2 text-sm text-red-700" role="alert">{loadError}</p>
            <button type="button" onClick={() => setReloadToken((value) => value + 1)}
              className="mt-5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 focus:outline-none focus-visible:ring-4 focus-visible:ring-slate-300">Retry</button>
          </div>
        ) : list && list.data.length === 0 ? (
          filtered
            ? <EmptyState title="No doctors match your filters" message="Try a different search term or clear the filters." action={{ label: "Clear filters", onClick: resetFilters }} />
            : <EmptyState title="No doctors yet" message="Add your first doctor to start building your clinical network." action={{ label: "Add doctor", onClick: () => setForm({ mode: "create" }) }} />
        ) : list ? (
          <div className={`transition-opacity ${loading ? "pointer-events-none opacity-60" : ""}`}>
            <DoctorTable doctors={list.data} onEdit={(doctor) => setForm({ mode: "edit", doctor })} onDelete={setPendingDelete} />
            <DoctorPagination pagination={list.pagination} itemCount={list.data.length} disabled={loading} onPageChange={setPage} />
          </div>
        ) : null}
      </section>

      {form && (
        <Modal title={form.mode === "edit" ? "Edit doctor" : "Add doctor"} description={form.mode === "edit" ? "Update this doctor's profile details." : "All fields are required."} onClose={() => setForm(null)}>
          <DoctorForm
            key={form.mode === "edit" ? form.doctor._id : "new"}
            initial={form.mode === "edit" ? { name: form.doctor.name, specialization: form.doctor.specialization, hospital: form.doctor.hospital, phone: form.doctor.phone, email: form.doctor.email } : undefined}
            suggestions={options} onSubmit={saveDoctor} onCancel={() => setForm(null)} />
        </Modal>
      )}

      {pendingDelete && (
        <ConfirmDialog title={`Delete ${pendingDelete.name}?`} confirmLabel="Delete doctor"
          message="This permanently removes the doctor. Doctors who still have assigned patients cannot be deleted — remove their patients first."
          onConfirm={() => confirmDelete(pendingDelete)} onClose={() => setPendingDelete(null)} />
      )}

      <Toast toast={toast} onDismiss={dismiss} />
    </main>
  );
}

function EmptyState({ title, message, action }: { title: string; message: string; action?: { label: string; onClick: () => void } }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
      <div aria-hidden="true" className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-teal-50 text-xl text-teal-700">✚</div>
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">{message}</p>
      {action && <button type="button" onClick={action.onClick} className="mt-5 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-slate-200">{action.label}</button>}
    </div>
  );
}

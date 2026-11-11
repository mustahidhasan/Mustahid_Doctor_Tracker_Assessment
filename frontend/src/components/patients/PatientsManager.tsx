"use client";

import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/layout/PageHeader";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState, LoadError } from "@/components/ui/EmptyState";
import { Modal } from "@/components/ui/Modal";
import { Pagination } from "@/components/ui/Pagination";
import { Toast, useToast } from "@/components/ui/Toast";
import { errorMessage } from "@/lib/api";
import {
  createPatient, deletePatient, getPatientFilterOptions, isObjectId, listPatients, type PatientFilterOptions, type PatientFormInput,
  type PatientList, type PatientQuery, type PatientRecord, updatePatient,
} from "@/lib/patients";
import { activePatientFilterCount, hasInvalidPatientDateRange, initialPatientFilters, PatientFilters, type PatientFilterState } from "./PatientFilters";
import { PatientForm, toPatientFormInput } from "./PatientForm";
import { PatientTable, PatientTableSkeleton } from "./PatientTable";

export const PATIENT_PAGE_SIZE = 10;
export const PATIENT_SEARCH_DEBOUNCE_MS = 350;

type FormState = { mode: "create" } | { mode: "edit"; patient: PatientRecord } | null;
interface LoadResult { key: string; list?: PatientList; error?: string; }

export function PatientsManager({ initialDoctorId }: { initialDoctorId?: string }) {
  const [filters, setFilters] = useState<PatientFilterState>(() => ({ ...initialPatientFilters, doctorId: isObjectId(initialDoctorId) ? initialDoctorId : "" }));
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [reloadToken, setReloadToken] = useState(0);
  const [result, setResult] = useState<LoadResult | null>(null);
  const [options, setOptions] = useState<PatientFilterOptions>({ conditions: [], doctors: [] });
  const [optionsToken, setOptionsToken] = useState(0);
  const [form, setForm] = useState<FormState>(null);
  const [pendingDelete, setPendingDelete] = useState<PatientRecord | null>(null);
  const { toast, notify, dismiss } = useToast();

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(filters.search.trim()), PATIENT_SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [filters.search]);

  const invalidRange = hasInvalidPatientDateRange(filters);
  const query = useMemo<PatientQuery>(() => ({
    page, limit: PATIENT_PAGE_SIZE, search: debouncedSearch, condition: filters.condition, doctorId: filters.doctorId,
    dateFrom: filters.dateFrom, dateTo: filters.dateTo, sort: filters.sort,
  }), [page, debouncedSearch, filters.condition, filters.doctorId, filters.dateFrom, filters.dateTo, filters.sort]);
  const requestKey = `${JSON.stringify(query)}#${reloadToken}`;

  useEffect(() => {
    if (invalidRange) return;
    // Abort superseded requests so a slow, older response can never overwrite newer results.
    const controller = new AbortController();
    listPatients(query, controller.signal)
      .then((list) => {
        if (list.data.length === 0 && list.pagination.totalPages > 0 && query.page > list.pagination.totalPages) setPage(list.pagination.totalPages);
        setResult({ key: requestKey, list });
      })
      .catch((error: unknown) => { if (!controller.signal.aborted) setResult({ key: requestKey, error: errorMessage(error, "Unable to load patients") }); });
    return () => controller.abort();
  }, [query, requestKey, invalidRange]);

  useEffect(() => {
    let active = true;
    getPatientFilterOptions().then((value) => { if (active) setOptions(value); }).catch(() => undefined);
    return () => { active = false; };
  }, [optionsToken]);

  const loading = !invalidRange && result?.key !== requestKey;
  const list = result?.list;
  const loadError = !loading && result?.error;
  const refresh = useCallback(() => { setReloadToken((value) => value + 1); setOptionsToken((value) => value + 1); }, []);

  const changeFilters = (next: PatientFilterState) => { setFilters(next); setPage(1); };
  const resetFilters = () => { setFilters(initialPatientFilters); setDebouncedSearch(""); setPage(1); };

  async function savePatient(input: PatientFormInput) {
    if (form?.mode === "edit") {
      await updatePatient(form.patient._id, input);
      notify("success", form.patient.doctorId !== input.doctorId ? `${input.name} was reassigned and updated.` : `${input.name} was updated.`);
    } else {
      await createPatient(input);
      notify("success", `${input.name} was added.`);
      if (filters.sort === "newest") setPage(1);
    }
    setForm(null);
    refresh();
  }

  async function confirmDelete(patient: PatientRecord) {
    await deletePatient(patient._id);
    notify("success", `${patient.name} was deleted.`);
    refresh();
  }

  const filtered = activePatientFilterCount(filters) > 0;
  const showSkeleton = loading && !list;

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader eyebrow="Patient registry" title="Patients" description="Search, filter, and manage patients and their assigned doctors."
        action={<Button variant="primary" onClick={() => setForm({ mode: "create" })} className="w-full sm:w-auto"><span aria-hidden="true" className="text-lg leading-none">+</span> Add patient</Button>} />

      <PatientFilters filters={filters} options={options} onChange={changeFilters} onReset={resetFilters} />

      <section className="mt-5" aria-live="polite" aria-busy={loading}>
        {invalidRange ? (
          <EmptyState title="Check the date range" message="Choose a start date that is on or before the end date to see results." />
        ) : showSkeleton ? (
          <PatientTableSkeleton />
        ) : loadError ? (
          <LoadError title="Patients could not be loaded" message={loadError} onRetry={() => setReloadToken((value) => value + 1)} />
        ) : list && list.data.length === 0 ? (
          filtered
            ? <EmptyState title="No patients match your filters" message="Try a different search term or clear the filters." action={{ label: "Clear filters", onClick: resetFilters }} />
            : <EmptyState title="No patients yet" message="Add your first patient and assign them to a doctor." action={{ label: "Add patient", onClick: () => setForm({ mode: "create" }) }} />
        ) : list ? (
          <div className={`transition-opacity ${loading ? "pointer-events-none opacity-60" : ""}`}>
            <PatientTable patients={list.data} onEdit={(patient) => setForm({ mode: "edit", patient })} onDelete={setPendingDelete} />
            <Pagination pagination={list.pagination} itemCount={list.data.length} noun="patient" disabled={loading} onPageChange={setPage} />
          </div>
        ) : null}
      </section>

      {form && (
        <Modal title={form.mode === "edit" ? "Edit patient" : "Add patient"}
          description={form.mode === "edit" ? "Update details or reassign this patient to another doctor." : "Name, condition, and assigned doctor are required."}
          onClose={() => setForm(null)}>
          <PatientForm key={form.mode === "edit" ? form.patient._id : "new"} initial={form.mode === "edit" ? toPatientFormInput(form.patient) : undefined}
            doctors={options.doctors} conditions={options.conditions} onSubmit={savePatient} onCancel={() => setForm(null)} />
        </Modal>
      )}

      {pendingDelete && (
        <ConfirmDialog title={`Delete ${pendingDelete.name}?`} confirmLabel="Delete patient"
          message={`This permanently deletes the patient record${pendingDelete.doctor ? ` and removes them from ${pendingDelete.doctor.name}'s list` : ""}.`}
          onConfirm={() => confirmDelete(pendingDelete)} onClose={() => setPendingDelete(null)} />
      )}

      <Toast toast={toast} onDismiss={dismiss} />
    </main>
  );
}

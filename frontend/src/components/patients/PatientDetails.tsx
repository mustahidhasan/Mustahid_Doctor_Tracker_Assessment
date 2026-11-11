"use client";

import { BreakableEmail } from "@/components/ui/BreakableText";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Modal } from "@/components/ui/Modal";
import { Toast, useToast } from "@/components/ui/Toast";
import { ApiError, errorMessage, formatDate, formatDateTime } from "@/lib/api";
import { deletePatient, getPatient, getPatientFilterOptions, type PatientFilterOptions, type PatientFormInput, type PatientRecord, updatePatient } from "@/lib/patients";
import { Breadcrumbs } from "@/components/layout/PageHeader";
import { PatientForm, toPatientFormInput } from "./PatientForm";

interface LoadState { token: number; patient?: PatientRecord; error?: string; notFound?: boolean; }

export function PatientDetails({ id }: { id: string }) {
  const router = useRouter();
  const [token, setToken] = useState(0);
  const [state, setState] = useState<LoadState | null>(null);
  const [options, setOptions] = useState<PatientFilterOptions>({ conditions: [], doctors: [] });
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { toast, notify, dismiss } = useToast();

  useEffect(() => {
    let active = true;
    getPatient(id)
      .then((patient) => { if (active) setState({ token, patient }); })
      .catch((error: unknown) => {
        if (!active) return;
        const notFound = error instanceof ApiError && (error.status === 404 || error.status === 400);
        setState({ token, notFound, error: errorMessage(error, "Unable to load patient") });
      });
    return () => { active = false; };
  }, [id, token]);

  // Doctor options are only needed for editing; load them when the form opens.
  useEffect(() => {
    if (!editing || options.doctors.length) return;
    let active = true;
    getPatientFilterOptions().then((value) => { if (active) setOptions(value); }).catch(() => undefined);
    return () => { active = false; };
  }, [editing, options.doctors.length]);

  const patient = state?.patient;
  const loading = state?.token !== token && !patient;

  async function save(input: PatientFormInput) {
    const updated = await updatePatient(id, input);
    const reassigned = patient?.doctorId !== updated.doctorId;
    setState((current) => current ? { ...current, patient: updated } : current);
    setEditing(false);
    notify("success", reassigned && updated.doctor ? `Reassigned to ${updated.doctor.name}.` : "Patient updated.");
  }

  async function remove() {
    await deletePatient(id);
    router.replace("/patients");
  }

  if (loading) {
    return (
      <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6" role="status" aria-label="Loading patient">
        <div className="h-4 w-32 animate-pulse rounded bg-slate-200" />
        <div className="my-6 h-56 animate-pulse rounded-2xl bg-slate-200" />
        <div className="h-40 animate-pulse rounded-2xl bg-slate-100" />
        <span className="sr-only">Loading patient…</span>
      </main>
    );
  }

  if (!patient) {
    return (
      <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
        <BackLink />
        <div className="mt-6 rounded-2xl border border-red-200 bg-white p-10 text-center shadow-sm">
          <h1 className="text-lg font-semibold text-slate-900">{state?.notFound ? "Patient not found" : "Patient could not be loaded"}</h1>
          <p role="alert" className="mt-2 text-sm text-red-700">{state?.notFound ? "This patient may have been deleted or the link is incorrect." : state?.error}</p>
          {!state?.notFound && <button type="button" onClick={() => setToken((value) => value + 1)} className="mt-5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">Retry</button>}
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
      <BackLink current={patient.name} />
      <section className="mb-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-gradient-to-br from-slate-50 to-teal-50/60 p-6 sm:p-8">
          <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wider text-teal-700">Patient record</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">{patient.name}</h1>
              <span className="mt-3 inline-flex rounded-full bg-amber-50 px-3 py-1 text-sm font-medium text-amber-900 ring-1 ring-inset ring-amber-600/20">{patient.condition}</span>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setEditing(true)} className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-slate-200">Edit</button>
              <button type="button" onClick={() => setConfirmDelete(true)} className="rounded-lg border border-red-200 bg-white px-3.5 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-red-100">Delete</button>
            </div>
          </div>
        </div>
        <dl className="grid gap-6 p-6 sm:grid-cols-2 sm:p-8">
          <Detail label="Assigned doctor" className="sm:col-span-2">
            {patient.doctor ? (
              <Link href={`/doctors/${patient.doctor._id}`} className="group inline-flex flex-col rounded-xl border border-slate-200 px-4 py-3 transition hover:border-teal-300 hover:bg-teal-50/50 focus:outline-none focus-visible:ring-4 focus-visible:ring-teal-100">
                <span className="font-semibold text-slate-900 group-hover:text-teal-800">{patient.doctor.name} <span aria-hidden="true">→</span></span>
                <span className="text-sm text-slate-500">{patient.doctor.specialization} · {patient.doctor.hospital}</span>
              </Link>
            ) : <span className="text-slate-500">No doctor assigned</span>}
          </Detail>
          <Detail label="Phone">{patient.phone ? <a href={`tel:${patient.phone}`} className="hover:text-teal-700">{patient.phone}</a> : <span className="text-slate-500">Not provided</span>}</Detail>
          <Detail label="Email">{patient.email ? <a href={`mailto:${patient.email}`} className="break-words hover:text-teal-700"><BreakableEmail value={patient.email} /></a> : <span className="text-slate-500">Not provided</span>}</Detail>
          <Detail label="Created">{formatDate(patient.createdAt)}</Detail>
          <Detail label="Last updated">{formatDateTime(patient.updatedAt)}</Detail>
        </dl>
      </section>

      {editing && (
        <Modal title="Edit patient" description="Update details or reassign this patient to another doctor." onClose={() => setEditing(false)}>
          <PatientForm initial={toPatientFormInput(patient)} doctors={options.doctors} conditions={options.conditions} onSubmit={save} onCancel={() => setEditing(false)} />
        </Modal>
      )}
      {confirmDelete && (
        <ConfirmDialog title={`Delete ${patient.name}?`} confirmLabel="Delete patient" onConfirm={remove} onClose={() => setConfirmDelete(false)}
          message={`This permanently deletes the patient record${patient.doctor ? ` and removes them from ${patient.doctor.name}'s list` : ""}.`} />
      )}
      <Toast toast={toast} onDismiss={dismiss} />
    </main>
  );
}

function BackLink({ current = "Patient" }: { current?: string }) {
  return <Breadcrumbs items={[{ label: "Patients", href: "/patients" }, { label: current }]} />;
}

function Detail({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return <div className={`min-w-0 ${className}`}><dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</dt><dd className="mt-1.5 break-words text-slate-800">{children}</dd></div>;
}

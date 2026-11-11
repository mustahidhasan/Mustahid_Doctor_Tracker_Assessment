"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Modal } from "@/components/ui/Modal";
import { Toast, useToast } from "@/components/ui/Toast";
import {
  addDoctorPatient, ApiError, deleteDoctor, deleteDoctorPatient, type Doctor, type DoctorInput, type DoctorPatientList,
  errorMessage, formatDate, getDoctor, listDoctorPatients, type Patient, type PatientInput, updateDoctor,
} from "@/lib/doctors";
import { DoctorForm } from "./DoctorForm";
import { DoctorPatients } from "./DoctorPatients";

interface LoadState { token: number; doctor?: Doctor; patients?: DoctorPatientList; error?: string; notFound?: boolean; }

export function DoctorDetails({ id }: { id: string }) {
  const router = useRouter();
  const [token, setToken] = useState(0);
  const [state, setState] = useState<LoadState | null>(null);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { toast, notify, dismiss } = useToast();

  useEffect(() => {
    let active = true;
    Promise.all([getDoctor(id), listDoctorPatients(id)])
      .then(([doctor, patients]) => { if (active) setState({ token, doctor, patients }); })
      .catch((error: unknown) => {
        if (!active) return;
        const notFound = error instanceof ApiError && (error.status === 404 || error.status === 400);
        setState({ token, notFound, error: errorMessage(error, "Unable to load doctor") });
      });
    return () => { active = false; };
  }, [id, token]);

  const loading = state?.token !== token && !state?.doctor;
  const doctor = state?.doctor;
  const patients = state?.patients;

  const reloadPatients = async () => {
    const next = await listDoctorPatients(id);
    setState((current) => current ? { ...current, patients: next } : current);
  };

  async function addPatient(input: PatientInput) {
    await addDoctorPatient(id, input);
    notify("success", `${input.name} was added.`);
    await reloadPatients().catch(() => notify("error", "Patient added, but the list could not be refreshed."));
  }

  async function removePatient(patient: Patient) {
    await deleteDoctorPatient(id, patient._id);
    setState((current) => current?.patients ? {
      ...current,
      patients: { ...current.patients, data: current.patients.data.filter((item) => item._id !== patient._id), total: Math.max(0, current.patients.total - 1) },
    } : current);
    notify("success", `${patient.name} was removed.`);
  }

  async function saveDoctor(input: DoctorInput) {
    const updated = await updateDoctor(id, input);
    setState((current) => current ? { ...current, doctor: updated } : current);
    setEditing(false);
    notify("success", "Doctor profile updated.");
  }

  async function removeDoctor() {
    await deleteDoctor(id);
    router.replace("/doctors");
  }

  if (loading) {
    return (
      <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6" role="status" aria-label="Loading doctor">
        <div className="h-4 w-32 animate-pulse rounded bg-slate-200" />
        <div className="my-6 h-64 animate-pulse rounded-2xl bg-slate-200" />
        <div className="h-48 animate-pulse rounded-2xl bg-slate-100" />
        <span className="sr-only">Loading doctor…</span>
      </main>
    );
  }

  if (!doctor) {
    return (
      <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
        <BackLink />
        <div className="mt-6 rounded-2xl border border-red-200 bg-white p-10 text-center shadow-sm">
          <h1 className="text-lg font-semibold text-slate-900">{state?.notFound ? "Doctor not found" : "Doctor could not be loaded"}</h1>
          <p role="alert" className="mt-2 text-sm text-red-700">{state?.notFound ? "This doctor may have been deleted or the link is incorrect." : state?.error}</p>
          {!state?.notFound && <button type="button" onClick={() => setToken((value) => value + 1)} className="mt-5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">Retry</button>}
        </div>
      </main>
    );
  }

  const patientTotal = patients?.total ?? 0;

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      <BackLink />
      <section className="my-6 overflow-hidden rounded-2xl bg-gradient-to-br from-teal-800 to-cyan-900 text-white shadow-lg">
        <div className="p-6 sm:p-8">
          <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wider text-teal-200">Doctor profile</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight">{doctor.name}</h1>
              <p className="mt-1.5 text-lg text-teal-100">{doctor.specialization}</p>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setEditing(true)} className="rounded-lg bg-white/10 px-3.5 py-2 text-sm font-medium ring-1 ring-inset ring-white/25 transition hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white">Edit</button>
              <button type="button" onClick={() => setConfirmDelete(true)} className="rounded-lg bg-white/10 px-3.5 py-2 text-sm font-medium text-red-100 ring-1 ring-inset ring-white/25 transition hover:bg-red-500/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-white">Delete</button>
            </div>
          </div>
          <dl className="mt-7 grid gap-5 border-t border-white/20 pt-6 sm:grid-cols-2 lg:grid-cols-5">
            <Detail label="Hospital" className="lg:col-span-2">{doctor.hospital}</Detail>
            <Detail label="Phone"><a href={`tel:${doctor.phone}`} className="hover:underline">{doctor.phone}</a></Detail>
            <Detail label="Email" className="lg:col-span-2"><a href={`mailto:${doctor.email}`} className="break-all hover:underline">{doctor.email}</a></Detail>
            <Detail label="Added">{formatDate(doctor.createdAt)}</Detail>
            <Detail label="Patients">{patientTotal}</Detail>
          </dl>
        </div>
      </section>

      <DoctorPatients doctorId={id} patients={patients?.data ?? []} total={patientTotal} onAdd={addPatient} onRemove={removePatient} />

      {editing && (
        <Modal title="Edit doctor" description="Update this doctor's profile details." onClose={() => setEditing(false)}>
          <DoctorForm initial={{ name: doctor.name, specialization: doctor.specialization, hospital: doctor.hospital, phone: doctor.phone, email: doctor.email }}
            onSubmit={saveDoctor} onCancel={() => setEditing(false)} />
        </Modal>
      )}
      {confirmDelete && (
        <ConfirmDialog title={`Delete ${doctor.name}?`} confirmLabel="Delete doctor" onConfirm={removeDoctor} onClose={() => setConfirmDelete(false)}
          message={patientTotal > 0
            ? `This doctor has ${patientTotal} assigned patient${patientTotal === 1 ? "" : "s"}. Remove them before deleting the doctor.`
            : "This permanently removes the doctor."} />
      )}
      <Toast toast={toast} onDismiss={dismiss} />
    </main>
  );
}

function BackLink() {
  return <Link href="/doctors" className="inline-flex items-center gap-1 text-sm font-medium text-teal-700 hover:text-teal-900 focus:outline-none focus-visible:underline"><span aria-hidden="true">←</span> Back to doctors</Link>;
}

function Detail({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return <div className={`min-w-0 ${className}`}><dt className="text-xs font-medium uppercase tracking-wider text-teal-200">{label}</dt><dd className="mt-1 break-words">{children}</dd></div>;
}

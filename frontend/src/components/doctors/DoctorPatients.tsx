"use client";

import { type FormEvent, useState } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { errorMessage, fieldErrors, formatDate, type Patient, type PatientInput, trimInput, validatePatientInput } from "@/lib/doctors";

const emptyPatient: PatientInput = { name: "", condition: "", phone: "", email: "" };

const FIELDS: Array<{ name: keyof PatientInput; label: string; type: string; placeholder: string; required: boolean; maxLength: number }> = [
  { name: "name", label: "Patient name", type: "text", placeholder: "Full name", required: true, maxLength: 120 },
  { name: "condition", label: "Patient condition", type: "text", placeholder: "e.g. Hypertension follow-up", required: true, maxLength: 200 },
  { name: "phone", label: "Patient phone", type: "tel", placeholder: "Optional", required: false, maxLength: 30 },
  { name: "email", label: "Patient email", type: "email", placeholder: "Optional", required: false, maxLength: 254 },
];

interface DoctorPatientsProps {
  patients: Patient[];
  total: number;
  onAdd: (input: PatientInput) => Promise<void>;
  onRemove: (patient: Patient) => Promise<void>;
}

export function DoctorPatients({ patients, total, onAdd, onRemove }: DoctorPatientsProps) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<PatientInput>(emptyPatient);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [pendingRemoval, setPendingRemoval] = useState<Patient | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    const nextErrors = validatePatientInput(form);
    if (Object.keys(nextErrors).length) { setErrors(nextErrors); return; }
    setSaving(true); setErrors({});
    try {
      await onAdd(trimInput(form));
      setForm(emptyPatient); setOpen(false);
    } catch (error) {
      setErrors(fieldErrors(error) ?? { form: errorMessage(error, "Unable to add patient") });
    } finally {
      setSaving(false);
    }
  }

  const toggle = () => { setOpen((value) => !value); setErrors({}); setForm(emptyPatient); };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6" aria-labelledby="doctor-patients-title">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 id="doctor-patients-title" className="text-xl font-semibold text-slate-950">Associated patients</h2>
          <p className="mt-1 text-sm text-slate-500">{total} patient{total === 1 ? "" : "s"} assigned</p>
        </div>
        <button type="button" onClick={toggle} aria-expanded={open} aria-controls="add-patient-form"
          className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition focus:outline-none focus-visible:ring-4 ${open ? "border border-slate-200 text-slate-700 hover:bg-slate-50 focus-visible:ring-slate-200" : "bg-teal-700 text-white shadow-sm hover:bg-teal-800 focus-visible:ring-teal-200"}`}>
          {open ? "Cancel" : "Add patient"}
        </button>
      </div>

      {open && (
        <form id="add-patient-form" onSubmit={submit} noValidate aria-busy={saving} className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {FIELDS.map((field) => {
              const id = `patient-${field.name}`;
              return (
                <div key={field.name}>
                  <label htmlFor={id} className="mb-1 block text-sm font-medium text-slate-700">{field.label.replace("Patient ", "").replace(/^./, (letter) => letter.toUpperCase())}{field.required && <span className="text-red-600" aria-hidden="true"> *</span>}</label>
                  <input id={id} aria-label={field.label} type={field.type} placeholder={field.placeholder} maxLength={field.maxLength} required={field.required} disabled={saving}
                    value={form[field.name] ?? ""} onChange={(event) => { const value = event.target.value; setForm((current) => ({ ...current, [field.name]: value })); }}
                    aria-invalid={Boolean(errors[field.name])} aria-describedby={errors[field.name] ? `${id}-error` : undefined}
                    className={`w-full rounded-lg border bg-white px-3 py-2.5 text-sm outline-none transition focus:ring-4 ${errors[field.name] ? "border-red-300 focus:ring-red-100" : "border-slate-200 focus:border-teal-600 focus:ring-teal-100"}`} />
                  {errors[field.name] && <p id={`${id}-error`} className="mt-1 text-sm text-red-600">{errors[field.name]}</p>}
                </div>
              );
            })}
          </div>
          {errors.form && <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{errors.form}</p>}
          <div className="mt-4 flex justify-end">
            <button type="submit" disabled={saving} className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 focus:outline-none focus-visible:ring-4 focus-visible:ring-slate-300 disabled:opacity-60 sm:w-auto">
              {saving ? "Adding…" : "Save patient"}
            </button>
          </div>
        </form>
      )}

      {patients.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">No patients assigned to this doctor.</div>
      ) : (
        <ul className="mt-5 divide-y divide-slate-100" aria-label="Patients">
          {patients.map((patient) => (
            <li key={patient._id} className="flex flex-col justify-between gap-3 py-4 sm:flex-row sm:items-center">
              <div className="min-w-0">
                <h3 className="font-semibold text-slate-900">{patient.name}</h3>
                <p className="mt-0.5 text-sm text-slate-600">{patient.condition}</p>
                <p className="mt-1 break-all text-xs text-slate-500">{[patient.phone, patient.email, `Added ${formatDate(patient.createdAt)}`].filter(Boolean).join(" · ")}</p>
              </div>
              <button type="button" onClick={() => setPendingRemoval(patient)} aria-label={`Remove ${patient.name}`}
                className="self-start rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-red-100 sm:self-center">Remove</button>
            </li>
          ))}
        </ul>
      )}
      {total > patients.length && patients.length > 0 && (
        <p className="mt-3 text-center text-xs text-slate-500">Showing the {patients.length} most recent of {total} patients.</p>
      )}

      {pendingRemoval && (
        <ConfirmDialog title={`Remove ${pendingRemoval.name}?`} confirmLabel="Remove patient"
          message="This permanently deletes the patient record from this doctor."
          onConfirm={() => onRemove(pendingRemoval)} onClose={() => setPendingRemoval(null)} />
      )}
    </section>
  );
}

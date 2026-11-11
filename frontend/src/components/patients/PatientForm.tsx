"use client";

import { type FormEvent, useMemo, useState } from "react";
import { SelectMenu, type SelectOption } from "@/components/ui/SelectMenu";
import { errorMessage, fieldErrors, trimInput } from "@/lib/api";
import { type PatientDoctorOption, type PatientFormInput, validatePatientForm } from "@/lib/patients";

const emptyForm: PatientFormInput = { name: "", condition: "", doctorId: "", phone: "", email: "" };

const inputClass = (invalid: boolean) => `w-full rounded-xl border bg-white px-3.5 py-2.5 text-slate-950 outline-none transition placeholder:text-slate-400 focus:ring-4 disabled:bg-slate-50 ${invalid ? "border-red-300 focus:border-red-500 focus:ring-red-100" : "border-slate-200 focus:border-teal-600 focus:ring-teal-100"}`;

interface PatientFormProps {
  initial?: PatientFormInput;
  doctors: PatientDoctorOption[];
  conditions?: string[];
  submitLabel?: string;
  onSubmit: (input: PatientFormInput) => Promise<void>;
  onCancel: () => void;
}

export function PatientForm({ initial, doctors, conditions = [], submitLabel, onSubmit, onCancel }: PatientFormProps) {
  const [form, setForm] = useState<PatientFormInput>(initial ?? emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const doctorOptions = useMemo<SelectOption[]>(() => {
    const options = doctors.map((doctor) => ({ value: doctor._id, label: `${doctor.name} · ${doctor.specialization}` }));
    // Keep the current assignment visible even if it is outside the loaded option list.
    if (form.doctorId && !options.some((option) => option.value === form.doctorId)) options.unshift({ value: form.doctorId, label: "Currently assigned doctor" });
    return [{ value: "", label: doctors.length ? "Select a doctor" : "Loading doctors…" }, ...options];
  }, [doctors, form.doctorId]);

  const update = (field: keyof PatientFormInput, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    if (errors[field]) setErrors((current) => { const next = { ...current }; delete next[field]; return next; });
  };

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    const nextErrors = validatePatientForm(form);
    if (Object.keys(nextErrors).length) { setErrors(nextErrors); return; }
    setSubmitting(true); setErrors({});
    try {
      await onSubmit(trimInput(form));
    } catch (error) {
      setErrors(fieldErrors(error) ?? { form: errorMessage(error, "Unable to save patient") });
      setSubmitting(false);
    }
  }

  const error = (field: string) => errors[field] ? <p id={`patient-form-${field}-error`} className="mt-1.5 text-sm text-red-600">{errors[field]}</p> : null;
  const described = (field: string) => errors[field] ? `patient-form-${field}-error` : undefined;

  return (
    <form onSubmit={submit} className="space-y-4" noValidate aria-busy={submitting}>
      <div>
        <label htmlFor="patient-form-name" className="mb-1.5 block text-sm font-medium text-slate-700">Name <span className="text-red-600" aria-hidden="true">*</span></label>
        <input id="patient-form-name" autoComplete="off" placeholder="Full name" maxLength={120} required disabled={submitting}
          value={form.name} onChange={(event) => update("name", event.target.value)} aria-invalid={Boolean(errors.name)} aria-describedby={described("name")} className={inputClass(Boolean(errors.name))} />
        {error("name")}
      </div>
      <div>
        <label htmlFor="patient-form-condition" className="mb-1.5 block text-sm font-medium text-slate-700">Condition <span className="text-red-600" aria-hidden="true">*</span></label>
        <input id="patient-form-condition" autoComplete="off" placeholder="e.g. Hypertension follow-up" maxLength={200} required disabled={submitting} list={conditions.length ? "patient-form-condition-options" : undefined}
          value={form.condition} onChange={(event) => update("condition", event.target.value)} aria-invalid={Boolean(errors.condition)} aria-describedby={described("condition")} className={inputClass(Boolean(errors.condition))} />
        {conditions.length > 0 && <datalist id="patient-form-condition-options">{conditions.map((condition) => <option key={condition} value={condition} />)}</datalist>}
        {error("condition")}
      </div>
      <div>
        <label htmlFor="patient-form-doctor" className="mb-1.5 block text-sm font-medium text-slate-700">Assigned doctor <span className="text-red-600" aria-hidden="true">*</span></label>
        <SelectMenu id="patient-form-doctor" label="Assigned doctor" value={form.doctorId} options={doctorOptions} searchable searchPlaceholder="Search doctors…"
          invalid={Boolean(errors.doctorId)} describedBy={described("doctorId")} disabled={submitting} onChange={(value) => update("doctorId", value)} />
        {error("doctorId")}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="patient-form-phone" className="mb-1.5 block text-sm font-medium text-slate-700">Phone <span className="font-normal text-slate-400">(optional)</span></label>
          <input id="patient-form-phone" type="tel" autoComplete="off" placeholder="+1 555 010 2000" maxLength={30} disabled={submitting}
            value={form.phone} onChange={(event) => update("phone", event.target.value)} aria-invalid={Boolean(errors.phone)} aria-describedby={described("phone")} className={inputClass(Boolean(errors.phone))} />
          {error("phone")}
        </div>
        <div>
          <label htmlFor="patient-form-email" className="mb-1.5 block text-sm font-medium text-slate-700">Email <span className="font-normal text-slate-400">(optional)</span></label>
          <input id="patient-form-email" type="email" autoComplete="off" placeholder="name@example.com" maxLength={254} disabled={submitting}
            value={form.email} onChange={(event) => update("email", event.target.value)} aria-invalid={Boolean(errors.email)} aria-describedby={described("email")} className={inputClass(Boolean(errors.email))} />
          {error("email")}
        </div>
      </div>
      {errors.form && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">{errors.form}</p>}
      {Object.keys(errors).length > 0 && !errors.form && <p className="sr-only" role="alert">Please correct the highlighted fields.</p>}
      <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
        <button type="button" onClick={onCancel} disabled={submitting}
          className="rounded-xl border border-slate-200 px-4 py-2.5 font-medium text-slate-700 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-slate-200 disabled:opacity-60">Cancel</button>
        <button type="submit" disabled={submitting}
          className="rounded-xl bg-teal-700 px-4 py-2.5 font-semibold text-white shadow-sm transition hover:bg-teal-800 focus:outline-none focus-visible:ring-4 focus-visible:ring-teal-200 disabled:cursor-not-allowed disabled:opacity-60">
          {submitting ? "Saving…" : submitLabel ?? (initial ? "Save changes" : "Add patient")}
        </button>
      </div>
    </form>
  );
}

export function toPatientFormInput(patient: { name: string; condition: string; doctorId: string | null; phone?: string; email?: string }): PatientFormInput {
  return { name: patient.name, condition: patient.condition, doctorId: patient.doctorId ?? "", phone: patient.phone ?? "", email: patient.email ?? "" };
}

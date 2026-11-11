"use client";

import { ComboboxInput } from "@/components/ui/ComboboxInput";
import { Button } from "@/components/ui/Button";
import { type FormEvent, useState } from "react";
import { DOCTOR_LABELS, type DoctorFilterOptions, type DoctorInput, errorMessage, fieldErrors, trimInput, validateDoctorInput } from "@/lib/doctors";

const emptyForm: DoctorInput = { name: "", specialization: "", hospital: "", phone: "", email: "" };

const FIELDS: Array<{ name: keyof DoctorInput; type: string; autoComplete: string; placeholder: string; maxLength: number }> = [
  { name: "name", type: "text", autoComplete: "name", placeholder: "Dr. Jane Smith", maxLength: 120 },
  { name: "specialization", type: "text", autoComplete: "off", placeholder: "Cardiology", maxLength: 120 },
  { name: "hospital", type: "text", autoComplete: "organization", placeholder: "City General Hospital", maxLength: 160 },
  { name: "phone", type: "tel", autoComplete: "tel", placeholder: "+1 555 010 2000", maxLength: 30 },
  { name: "email", type: "email", autoComplete: "email", placeholder: "jane.smith@hospital.org", maxLength: 254 },
];

interface DoctorFormProps {
  initial?: DoctorInput;
  suggestions?: DoctorFilterOptions;
  onSubmit: (input: DoctorInput) => Promise<void>;
  onCancel: () => void;
}

export function DoctorForm({ initial, suggestions, onSubmit, onCancel }: DoctorFormProps) {
  const [form, setForm] = useState<DoctorInput>(initial ?? emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    const nextErrors = validateDoctorInput(form);
    if (Object.keys(nextErrors).length) { setErrors(nextErrors); return; }
    setSubmitting(true); setErrors({});
    try {
      await onSubmit(trimInput(form));
    } catch (error) {
      setErrors(fieldErrors(error) ?? { form: errorMessage(error, "Unable to save doctor") });
      setSubmitting(false);
    }
  }

  const update = (field: keyof DoctorInput, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    if (errors[field]) setErrors((current) => { const next = { ...current }; delete next[field]; return next; });
  };

  return (
    <form onSubmit={submit} className="space-y-4" noValidate aria-busy={submitting}>
      {FIELDS.map((field) => {
        const id = `doctor-${field.name}`;
        // Specialization and hospital suggest existing values but still accept new ones.
        const options = field.name === "specialization" ? suggestions?.specializations ?? [] : field.name === "hospital" ? suggestions?.hospitals ?? [] : null;
        const inputClass = `w-full rounded-xl border bg-white px-3.5 py-2.5 text-slate-950 outline-none transition placeholder:text-slate-400 focus:ring-4 disabled:bg-slate-50 ${errors[field.name] ? "border-red-300 focus:border-red-500 focus:ring-red-100" : "border-slate-200 focus:border-teal-600 focus:ring-teal-100"}`;
        const describedBy = errors[field.name] ? `${id}-error` : undefined;
        return (
          <div key={field.name}>
            <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-slate-700">{DOCTOR_LABELS[field.name]} <span className="text-red-600" aria-hidden="true">*</span></label>
            {options ? (
              <ComboboxInput id={id} name={field.name} value={form[field.name]} onChange={(value) => update(field.name, value)} options={options}
                placeholder={field.placeholder} maxLength={field.maxLength} required disabled={submitting}
                invalid={Boolean(errors[field.name])} describedBy={describedBy} className={inputClass} />
            ) : (
              <input id={id} name={field.name} type={field.type} autoComplete={field.autoComplete} placeholder={field.placeholder} maxLength={field.maxLength}
                required value={form[field.name]} disabled={submitting}
                onChange={(event) => update(field.name, event.target.value)}
                aria-invalid={Boolean(errors[field.name])} aria-describedby={describedBy} className={inputClass} />
            )}
            {errors[field.name] && <p id={`${id}-error`} className="mt-1.5 text-sm text-red-600">{errors[field.name]}</p>}
          </div>
        );
      })}
      {errors.form && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">{errors.form}</p>}
      {Object.keys(errors).length > 0 && !errors.form && <p className="sr-only" role="alert">Please correct the highlighted fields.</p>}
      <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
        <Button onClick={onCancel} disabled={submitting}>Cancel</Button>
        <Button type="submit" variant="primary" loading={submitting} loadingText="Saving…">{initial ? "Save changes" : "Add doctor"}</Button>
      </div>
    </form>
  );
}

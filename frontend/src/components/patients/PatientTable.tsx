"use client";

import Link from "next/link";
import { formatDate } from "@/lib/api";
import type { PatientRecord } from "@/lib/patients";

interface PatientTableProps {
  patients: PatientRecord[];
  onEdit: (patient: PatientRecord) => void;
  onDelete: (patient: PatientRecord) => void;
}

function DoctorLink({ patient }: { patient: PatientRecord }) {
  if (!patient.doctor) return <span className="text-slate-400">Unassigned</span>;
  return (
    <>
      <Link href={`/doctors/${patient.doctor._id}`} className="font-medium text-slate-800 hover:text-teal-700 focus:outline-none focus-visible:underline">{patient.doctor.name}</Link>
      <p className="mt-0.5 text-xs text-slate-500">{patient.doctor.specialization}</p>
    </>
  );
}

function Actions({ patient, onEdit, onDelete, className = "" }: { patient: PatientRecord; onEdit: PatientTableProps["onEdit"]; onDelete: PatientTableProps["onDelete"]; className?: string }) {
  return (
    <div className={`flex gap-2 ${className}`}>
      <button type="button" onClick={() => onEdit(patient)} aria-label={`Edit ${patient.name}`}
        className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-slate-200">Edit</button>
      <button type="button" onClick={() => onDelete(patient)} aria-label={`Delete ${patient.name}`}
        className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-700 transition hover:bg-red-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-red-100">Delete</button>
    </div>
  );
}

/** Table on medium+ screens, stacked cards on mobile. */
export function PatientTable({ patients, onEdit, onDelete }: PatientTableProps) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Patients</caption>
          <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th scope="col" className="px-5 py-3.5 font-semibold">Patient</th>
              <th scope="col" className="px-5 py-3.5 font-semibold">Condition</th>
              <th scope="col" className="px-5 py-3.5 font-semibold">Assigned doctor</th>
              <th scope="col" className="px-5 py-3.5 font-semibold">Contact</th>
              <th scope="col" className="px-5 py-3.5 text-right font-semibold"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {patients.map((patient) => (
              <tr key={patient._id} className="transition hover:bg-slate-50/70">
                <td className="px-5 py-4">
                  <Link href={`/patients/${patient._id}`} className="font-semibold text-slate-900 hover:text-teal-700 focus:outline-none focus-visible:underline">{patient.name}</Link>
                  <p className="mt-1 text-xs text-slate-500">Added {formatDate(patient.createdAt)}</p>
                </td>
                <td className="px-5 py-4"><span className="inline-flex rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-900 ring-1 ring-inset ring-amber-600/20">{patient.condition}</span></td>
                <td className="px-5 py-4"><DoctorLink patient={patient} /></td>
                <td className="px-5 py-4 text-slate-600">
                  {patient.phone || patient.email ? <>
                    {patient.phone && <a href={`tel:${patient.phone}`} className="block hover:text-teal-700">{patient.phone}</a>}
                    {patient.email && <a href={`mailto:${patient.email}`} className="block break-all hover:text-teal-700">{patient.email}</a>}
                  </> : <span className="text-slate-400">—</span>}
                </td>
                <td className="px-5 py-4"><Actions patient={patient} onEdit={onEdit} onDelete={onDelete} className="justify-end" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="divide-y divide-slate-100 md:hidden" aria-label="Patients">
        {patients.map((patient) => (
          <li key={patient._id} className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Link href={`/patients/${patient._id}`} className="text-base font-semibold text-slate-950 hover:text-teal-700">{patient.name}</Link>
                <p className="mt-0.5 text-sm font-medium text-amber-800">{patient.condition}</p>
              </div>
              <span className="shrink-0 text-xs text-slate-400">{formatDate(patient.createdAt)}</span>
            </div>
            <dl className="mt-3 space-y-1 text-sm text-slate-600">
              <div className="flex gap-2"><dt className="w-16 shrink-0 text-slate-400">Doctor</dt><dd className="min-w-0">{patient.doctor ? <Link href={`/doctors/${patient.doctor._id}`} className="hover:text-teal-700">{patient.doctor.name}</Link> : "Unassigned"}</dd></div>
              {patient.phone && <div className="flex gap-2"><dt className="w-16 shrink-0 text-slate-400">Phone</dt><dd className="min-w-0">{patient.phone}</dd></div>}
              {patient.email && <div className="flex gap-2"><dt className="w-16 shrink-0 text-slate-400">Email</dt><dd className="min-w-0 break-all">{patient.email}</dd></div>}
            </dl>
            <Actions patient={patient} onEdit={onEdit} onDelete={onDelete} className="mt-4" />
          </li>
        ))}
      </ul>
    </div>
  );
}

export function PatientTableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" role="status" aria-label="Loading patients">
      <div className="hidden h-11 bg-slate-50 md:block" />
      <div className="divide-y divide-slate-100">
        {Array.from({ length: rows }, (_, index) => (
          <div key={index} className="flex animate-pulse items-center gap-6 px-5 py-5">
            <div className="flex-1 space-y-2"><div className="h-4 w-40 rounded bg-slate-200" /><div className="h-3 w-24 rounded bg-slate-100" /></div>
            <div className="hidden h-6 w-28 rounded-full bg-slate-100 md:block" />
            <div className="hidden h-4 w-32 rounded bg-slate-100 md:block" />
            <div className="hidden h-8 w-28 rounded-lg bg-slate-100 md:block" />
          </div>
        ))}
      </div>
      <span className="sr-only">Loading patients…</span>
    </div>
  );
}

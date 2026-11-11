"use client";

import { BreakableEmail } from "@/components/ui/BreakableText";
import Link from "next/link";
import { type Doctor, formatDate } from "@/lib/doctors";
import { DoctorActions } from "./DoctorActions";

interface DoctorTableProps {
  doctors: Doctor[];
  onEdit: (doctor: Doctor) => void;
  onDelete: (doctor: Doctor) => void;
}

/** Table on medium+ screens, stacked cards on mobile. */
export function DoctorTable({ doctors, onEdit, onDelete }: DoctorTableProps) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="hidden overflow-x-auto xl:block">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Doctors</caption>
          <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th scope="col" className="px-5 py-3.5 font-semibold">Doctor</th>
              <th scope="col" className="px-5 py-3.5 font-semibold">Specialization</th>
              <th scope="col" className="px-5 py-3.5 font-semibold">Hospital</th>
              <th scope="col" className="px-5 py-3.5 font-semibold">Contact</th>
              <th scope="col" className="px-5 py-3.5 text-right font-semibold"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {doctors.map((doctor) => (
              <tr key={doctor._id} className="transition hover:bg-slate-50/70">
                <td className="px-5 py-4">
                  <Link href={`/doctors/${doctor._id}`} className="inline-flex min-h-6 items-center font-semibold text-slate-900 hover:text-teal-700 focus:outline-none focus-visible:underline">{doctor.name}</Link>
                  <p className="mt-1 text-xs text-slate-500">Added {formatDate(doctor.createdAt)}</p>
                </td>
                <td className="px-5 py-4"><span className="inline-flex rounded-full bg-teal-50 px-2.5 py-1 text-xs font-medium text-teal-800 ring-1 ring-inset ring-teal-600/15">{doctor.specialization}</span></td>
                <td className="px-5 py-4 text-slate-700">{doctor.hospital}</td>
                <td className="px-5 py-4 text-slate-600">
                  <a href={`tel:${doctor.phone}`} className="flex min-h-6 items-center hover:text-teal-700">{doctor.phone}</a>
                  <a href={`mailto:${doctor.email}`} className="flex min-h-6 items-center break-words hover:text-teal-700"><BreakableEmail value={doctor.email} /></a>
                </td>
                <td className="px-5 py-4"><DoctorActions doctor={doctor} onEdit={onEdit} onDelete={onDelete} className="justify-end" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="grid divide-y divide-slate-100 sm:grid-cols-2 sm:gap-px sm:divide-y-0 sm:bg-slate-100 xl:hidden" aria-label="Doctors">
        {doctors.map((doctor) => (
          <li key={doctor._id} className="min-w-0 bg-white p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Link href={`/doctors/${doctor._id}`} className="inline-flex min-h-6 items-center text-base font-semibold text-slate-950 hover:text-teal-700">{doctor.name}</Link>
                <p className="mt-0.5 text-sm font-medium text-teal-700">{doctor.specialization}</p>
              </div>
              <span className="shrink-0 text-xs text-slate-500">{formatDate(doctor.createdAt)}</span>
            </div>
            <dl className="mt-3 space-y-1 text-sm text-slate-600">
              <div className="flex gap-2"><dt className="w-16 shrink-0 text-slate-500">Hospital</dt><dd className="min-w-0">{doctor.hospital}</dd></div>
              <div className="flex gap-2"><dt className="w-16 shrink-0 text-slate-500">Phone</dt><dd className="min-w-0">{doctor.phone}</dd></div>
              <div className="flex gap-2"><dt className="w-16 shrink-0 text-slate-500">Email</dt><dd className="min-w-0 break-words"><BreakableEmail value={doctor.email} /></dd></div>
            </dl>
            <DoctorActions doctor={doctor} onEdit={onEdit} onDelete={onDelete} className="mt-4" />
          </li>
        ))}
      </ul>
    </div>
  );
}

export function DoctorTableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" role="status" aria-label="Loading doctors">
      <div className="hidden h-11 bg-slate-50 xl:block" />
      <div className="divide-y divide-slate-100">
        {Array.from({ length: rows }, (_, index) => (
          <div key={index} className="flex animate-pulse items-center gap-6 px-5 py-5">
            <div className="flex-1 space-y-2"><div className="h-4 w-40 rounded bg-slate-200" /><div className="h-3 w-24 rounded bg-slate-100" /></div>
            <div className="hidden h-6 w-24 rounded-full bg-slate-100 xl:block" />
            <div className="hidden h-4 w-32 rounded bg-slate-100 xl:block" />
            <div className="hidden h-8 w-28 rounded-lg bg-slate-100 xl:block" />
          </div>
        ))}
      </div>
      <span className="sr-only">Loading doctors…</span>
    </div>
  );
}

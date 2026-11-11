"use client";

import type { Doctor } from "@/lib/doctors";

interface DoctorActionsProps {
  doctor: Doctor;
  onEdit: (doctor: Doctor) => void;
  onDelete: (doctor: Doctor) => void;
  className?: string;
}

export function DoctorActions({ doctor, onEdit, onDelete, className = "" }: DoctorActionsProps) {
  return (
    <div className={`flex gap-2 ${className}`}>
      <button type="button" onClick={() => onEdit(doctor)} aria-label={`Edit ${doctor.name}`}
        className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-slate-200">Edit</button>
      <button type="button" onClick={() => onDelete(doctor)} aria-label={`Delete ${doctor.name}`}
        className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-700 transition hover:bg-red-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-red-100">Delete</button>
    </div>
  );
}

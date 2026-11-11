"use client";

import { Button } from "@/components/ui/Button";
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
      <Button size="sm" onClick={() => onEdit(doctor)} aria-label={`Edit ${doctor.name}`}>Edit</Button>
      <Button size="sm" variant="danger-outline" onClick={() => onDelete(doctor)} aria-label={`Delete ${doctor.name}`}>Delete</Button>
    </div>
  );
}

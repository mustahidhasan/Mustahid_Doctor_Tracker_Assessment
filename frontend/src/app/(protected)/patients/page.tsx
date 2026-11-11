import { PatientsManager } from "@/components/patients/PatientsManager";

export const instant = false;

/** Supports /patients?doctorId=<id> (linked from a doctor's page) to pre-filter by doctor. */
export default async function PatientsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { doctorId } = await searchParams;
  return <PatientsManager initialDoctorId={typeof doctorId === "string" ? doctorId : undefined} />;
}

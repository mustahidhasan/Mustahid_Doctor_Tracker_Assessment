import { PatientDetails } from "@/components/patients/PatientDetails";

export const instant = false;

export default async function PatientDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PatientDetails id={id} />;
}

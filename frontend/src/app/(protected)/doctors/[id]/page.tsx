import { DoctorDetails } from "@/components/doctors/DoctorDetails";

export const instant = false;

export default async function DoctorDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DoctorDetails id={id} />;
}

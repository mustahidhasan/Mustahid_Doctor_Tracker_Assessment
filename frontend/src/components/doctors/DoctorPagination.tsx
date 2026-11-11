"use client";

import type { ComponentProps } from "react";
import { Pagination } from "@/components/ui/Pagination";

export function DoctorPagination(props: Omit<ComponentProps<typeof Pagination>, "noun">) {
  return <Pagination {...props} noun="doctor" />;
}

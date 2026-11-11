"use client";

import Link from "next/link";
import type { AdminUser } from "@/lib/auth";
import { NavLinks } from "./NavLinks";
import { Brand } from "./navigation";
import { UserPanel } from "./UserPanel";

/** Fixed sidebar for desktop widths (≥1024px). */
export function AppSidebar({ user }: { user: AdminUser }) {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-slate-200 bg-white lg:flex">
      <div className="flex h-16 items-center px-5">
        <Link href="/dashboard" className="rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"><Brand /></Link>
      </div>
      <nav aria-label="Main navigation" className="flex-1 overflow-y-auto px-3 py-4">
        <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Workspace</p>
        <NavLinks />
      </nav>
      <div className="p-3"><UserPanel user={user} /></div>
    </aside>
  );
}

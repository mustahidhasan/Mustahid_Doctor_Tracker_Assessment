"use client";

import type { AdminUser } from "@/lib/auth";
import { LogoutButton } from "@/components/auth/LogoutButton";

export function UserPanel({ user }: { user: AdminUser }) {
  const initials = (user.name || user.email).split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((part) => part[0]!.toUpperCase()).join("");
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3">
      <span aria-hidden="true" className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">{initials}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-900">{user.name || "Administrator"}</p>
        <p className="truncate text-xs text-slate-500">{user.email}</p>
      </div>
      <LogoutButton />
    </div>
  );
}

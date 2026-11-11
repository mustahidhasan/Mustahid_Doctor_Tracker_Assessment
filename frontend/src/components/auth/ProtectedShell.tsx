"use client";

import Link from "next/link";
import { type ReactNode } from "react";
import { AuthGuard } from "./AuthGuard";
import { LogoutButton } from "./LogoutButton";

export function ProtectedShell({ children }: { children: ReactNode }) {
  return <AuthGuard>{(user) => (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <Link href="/dashboard" className="font-semibold text-teal-800">✚ Doctor Tracker</Link>
          <nav className="hidden gap-6 text-sm font-medium text-slate-600 sm:flex" aria-label="Main navigation">
            <Link href="/dashboard" className="hover:text-teal-700">Dashboard</Link>
            <Link href="/doctors" className="hover:text-teal-700">Doctors</Link>
            <Link href="/patients" className="hover:text-teal-700">Patients</Link>
          </nav>
          <div className="flex items-center gap-3"><span className="hidden text-sm text-slate-500 md:inline">{user.email}</span><LogoutButton /></div>
        </div>
      </header>
      {children}
    </div>
  )}</AuthGuard>;
}

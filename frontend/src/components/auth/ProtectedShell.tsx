"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode } from "react";
import { AuthGuard } from "./AuthGuard";
import { LogoutButton } from "./LogoutButton";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/doctors", label: "Doctors" },
  { href: "/patients", label: "Patients" },
];

export function ProtectedShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const links = (className: string) => NAV_ITEMS.map((item) => (
    <Link key={item.href} href={item.href} aria-current={isActive(item.href) ? "page" : undefined}
      className={`${className} ${isActive(item.href) ? "text-teal-700" : "text-slate-600 hover:text-teal-700"}`}>{item.label}</Link>
  ));

  return <AuthGuard>{(user) => (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <Link href="/dashboard" className="font-semibold text-teal-800">✚ Doctor Tracker</Link>
          <nav className="hidden gap-6 text-sm font-medium sm:flex" aria-label="Main navigation">{links("transition")}</nav>
          <div className="flex items-center gap-3"><span className="hidden text-sm text-slate-500 md:inline">{user.email}</span><LogoutButton /></div>
        </div>
        <nav className="flex gap-1 overflow-x-auto border-t border-slate-100 px-2 text-sm font-medium sm:hidden" aria-label="Main navigation">{links("px-3 py-2.5")}</nav>
      </header>
      {children}
    </div>
  )}</AuthGuard>;
}

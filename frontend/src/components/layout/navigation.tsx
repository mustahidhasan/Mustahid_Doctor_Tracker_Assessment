import type { ReactNode } from "react";

export interface NavItem { href: string; label: string; icon: ReactNode; }

const icon = (path: ReactNode) => <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 shrink-0">{path}</svg>;

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: icon(<><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></>) },
  { href: "/doctors", label: "Doctors", icon: icon(<><path d="M6 3v5a5 5 0 0 0 10 0V3" /><path d="M11 13v3a4 4 0 0 0 8 0v-1" /><circle cx="19" cy="13" r="2" /></>) },
  { href: "/patients", label: "Patients", icon: icon(<><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7" /><path d="M18.5 14.5A6.5 6.5 0 0 1 21.5 20" /></>) },
];

export function isActivePath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Brand({ className = "" }: { className?: string }) {
  return (
    <span className={`flex items-center gap-2.5 font-semibold text-slate-900 ${className}`}>
      <span aria-hidden="true" className="grid h-8 w-8 place-items-center rounded-lg bg-teal-700 text-sm text-white">✚</span>
      Doctor Tracker
    </span>
  );
}

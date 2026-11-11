"use client";

import Link from "next/link";
import { useRef } from "react";
import type { AdminUser } from "@/lib/auth";
import { useFocusTrap } from "@/components/ui/useFocusTrap";
import { NavLinks } from "./NavLinks";
import { Brand } from "./navigation";
import { UserPanel } from "./UserPanel";

/** Slide-in navigation drawer for mobile and tablet. A modal dialog: focus is trapped, Escape closes it. */
export function MobileNavigation({ open, onClose, user }: { open: boolean; onClose: () => void; user: AdminUser }) {
  const panel = useRef<HTMLDivElement>(null);
  useFocusTrap(panel, open, onClose);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <div className="absolute inset-0 bg-slate-950/40" aria-hidden="true" onClick={onClose} />
      <div ref={panel} id="mobile-navigation" role="dialog" aria-modal="true" aria-label="Navigation menu" tabIndex={-1}
        className="absolute inset-y-0 left-0 flex w-[min(20rem,85vw)] flex-col bg-white shadow-2xl outline-none">
        <div className="flex h-16 items-center justify-between border-b border-slate-100 px-4">
          <Link href="/dashboard" onClick={onClose} className="rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"><Brand /></Link>
          <button type="button" onClick={onClose} aria-label="Close navigation menu"
            className="grid h-11 w-11 place-items-center rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500">
            <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5"><path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" /></svg>
          </button>
        </div>
        <nav aria-label="Main navigation" className="flex-1 overflow-y-auto px-3 py-4"><NavLinks onNavigate={onClose} /></nav>
        <div className="border-t border-slate-100 p-3"><UserPanel user={user} /></div>
      </div>
    </div>
  );
}

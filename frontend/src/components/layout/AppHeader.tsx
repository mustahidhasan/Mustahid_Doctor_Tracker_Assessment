"use client";

import Link from "next/link";
import { Brand } from "./navigation";

/** Top bar shown below 1024px: brand plus the menu button that opens the navigation drawer. */
export function AppHeader({ menuOpen, onOpenMenu }: { menuOpen: boolean; onOpenMenu: () => void }) {
  return (
    <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-slate-200 bg-white/95 px-4 backdrop-blur sm:px-6 lg:hidden">
      <Link href="/dashboard" className="rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"><Brand /></Link>
      <button type="button" onClick={onOpenMenu} aria-label="Open navigation menu" aria-expanded={menuOpen} aria-controls="mobile-navigation" aria-haspopup="dialog"
        className="grid h-11 w-11 place-items-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500">
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="h-5 w-5"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
      </button>
    </header>
  );
}

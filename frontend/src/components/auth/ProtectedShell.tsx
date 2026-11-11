"use client";

import { type ReactNode, useState } from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { MobileNavigation } from "@/components/layout/MobileNavigation";
import { AuthGuard } from "./AuthGuard";

/** Authenticated application frame: skip link, desktop sidebar, mobile top bar + drawer, page content. */
export function ProtectedShell({ children }: { children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  return <AuthGuard>{(user) => (
    <div className="min-h-screen bg-slate-50">
      <a href="#main-content" className="sr-only z-[70] rounded-lg bg-white px-4 py-2 font-medium text-teal-800 shadow-lg focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:outline-none focus:ring-4 focus:ring-teal-200">Skip to main content</a>
      <AppSidebar user={user} />
      <AppHeader menuOpen={menuOpen} onOpenMenu={() => setMenuOpen(true)} />
      <MobileNavigation open={menuOpen} onClose={() => setMenuOpen(false)} user={user} />
      <div id="main-content" tabIndex={-1} className="min-w-0 outline-none lg:pl-64">{children}</div>
    </div>
  )}</AuthGuard>;
}

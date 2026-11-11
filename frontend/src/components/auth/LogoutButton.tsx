"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { logout } from "@/lib/auth";

export function LogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  return <button type="button" disabled={loading} onClick={async () => {
    setLoading(true);
    try { await logout(); } finally { router.replace("/login"); router.refresh(); }
  }} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60">
    {loading ? "Signing out…" : "Sign out"}
  </button>;
}

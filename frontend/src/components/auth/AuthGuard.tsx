"use client";

import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";
import { type AdminUser, clearSession, expiredLoginUrl, getCurrentUser } from "@/lib/auth";

type GuardState = { status: "checking" } | { status: "ready"; user: AdminUser } | { status: "error" };

/**
 * Client-side session check for protected pages. The proxy has already confirmed a cookie exists;
 * this verifies it with the API. An invalid/expired session is cleared and sent to /login, while a
 * network failure shows a retry instead of signing the user out.
 */
export function AuthGuard({ children }: { children: (user: AdminUser) => ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [state, setState] = useState<GuardState>({ status: "checking" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    getCurrentUser().then(async (currentUser) => {
      if (!active) return;
      if (currentUser) { setState({ status: "ready", user: currentUser }); return; }
      await clearSession();
      router.replace(expiredLoginUrl(`${pathname}${typeof window !== "undefined" ? window.location.search : ""}`));
    }).catch(() => { if (active) setState({ status: "error" }); });
    return () => { active = false; };
    // Re-verify only on mount and when the user retries; navigation inside the app keeps the session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  if (state.status === "ready") return children(state.user);
  if (state.status === "error") {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-50 px-4">
        <div className="max-w-sm rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-lg font-semibold text-slate-900">We couldn&apos;t verify your session</h1>
          <p role="alert" className="mt-2 text-sm text-slate-600">Check your connection and try again.</p>
          <button type="button" onClick={() => { setState({ status: "checking" }); setAttempt((value) => value + 1); }}
            className="mt-5 min-h-11 rounded-xl bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800 focus:outline-none focus-visible:ring-4 focus-visible:ring-slate-300">Try again</button>
        </div>
      </main>
    );
  }
  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 text-sm text-slate-500" role="status" aria-live="polite">
      <span className="inline-flex items-center gap-2"><span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-teal-600 border-t-transparent" />Verifying secure session…</span>
    </main>
  );
}

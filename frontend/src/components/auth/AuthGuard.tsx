"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";
import { type AdminUser, getCurrentUser } from "@/lib/auth";

export function AuthGuard({ children }: { children: (user: AdminUser) => ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<AdminUser | null>(null);

  useEffect(() => {
    getCurrentUser().then((currentUser) => {
      if (!currentUser) router.replace("/login");
      else setUser(currentUser);
    }).catch(() => router.replace("/login"));
  }, [router]);

  if (!user) return <main className="grid min-h-screen place-items-center bg-slate-50 text-sm text-slate-500" role="status">Verifying secure session…</main>;
  return children(user);
}

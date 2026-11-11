"use client";

import { useCallback, useEffect, useState } from "react";

export interface ToastMessage { id: number; tone: "success" | "error"; text: string; }

/** Minimal notification state: one message at a time, auto-dismissed after a few seconds. */
export function useToast(duration = 4000) {
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const notify = useCallback((tone: ToastMessage["tone"], text: string) => setToast({ id: Date.now(), tone, text }), []);
  const dismiss = useCallback(() => setToast(null), []);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast((current) => current?.id === toast.id ? null : current), duration);
    return () => window.clearTimeout(timer);
  }, [toast, duration]);
  return { toast, notify, dismiss };
}

export function Toast({ toast, onDismiss }: { toast: ToastMessage | null; onDismiss: () => void }) {
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-4 bottom-4 z-[60] flex justify-center sm:inset-x-auto sm:right-6 sm:bottom-6">
      {toast && (
        <div role={toast.tone === "error" ? "alert" : "status"}
          className={`pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border px-4 py-3 text-sm shadow-lg ${toast.tone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-red-200 bg-red-50 text-red-800"}`}>
          <span aria-hidden="true" className="mt-0.5 font-bold">{toast.tone === "success" ? "✓" : "!"}</span>
          <p className="flex-1">{toast.text}</p>
          <button type="button" onClick={onDismiss} aria-label="Dismiss notification" className="rounded px-1 opacity-70 hover:opacity-100">✕</button>
        </div>
      )}
    </div>
  );
}

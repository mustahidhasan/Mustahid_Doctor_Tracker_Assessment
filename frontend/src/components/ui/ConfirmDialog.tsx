"use client";

import { useState } from "react";
import { errorMessage } from "@/lib/doctors";
import { Modal } from "./Modal";

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}

/**
 * Confirmation for destructive actions. Stays open and shows the server's message if the
 * action fails (e.g. a 409 conflict), and prevents double submission while pending.
 */
export function ConfirmDialog({ title, message, confirmLabel, onConfirm, onClose }: ConfirmDialogProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function confirm() {
    setPending(true); setError("");
    try { await onConfirm(); onClose(); }
    catch (confirmError) { setError(errorMessage(confirmError, "The action could not be completed")); setPending(false); }
  }

  return (
    <Modal title={title} description={message} onClose={pending ? () => undefined : onClose} size="sm">
      {error && <p className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</p>}
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <button type="button" onClick={onClose} disabled={pending}
          className="rounded-xl border border-slate-200 px-4 py-2.5 font-medium text-slate-700 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-slate-200 disabled:opacity-60">Cancel</button>
        <button type="button" onClick={() => void confirm()} disabled={pending}
          className="rounded-xl bg-red-600 px-4 py-2.5 font-semibold text-white shadow-sm transition hover:bg-red-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-red-200 disabled:cursor-not-allowed disabled:opacity-60">
          {pending ? "Working…" : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

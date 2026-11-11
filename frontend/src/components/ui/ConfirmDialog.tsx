"use client";

import { Button } from "./Button";
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
        <Button onClick={onClose} disabled={pending}>Cancel</Button>
        <Button variant="danger" onClick={() => void confirm()} loading={pending} loadingText="Working…">{confirmLabel}</Button>
      </div>
    </Modal>
  );
}

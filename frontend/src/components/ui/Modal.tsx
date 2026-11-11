"use client";

import { type ReactNode, useEffect, useId, useRef } from "react";
import { useFocusTrap } from "./useFocusTrap";

interface ModalProps {
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  size?: "sm" | "md";
}

/** Accessible modal dialog: focus is trapped inside, Escape and backdrop clicks close it, focus returns afterwards, page scroll is locked. */
export function Modal({ title, description, onClose, children, size = "md" }: ModalProps) {
  const titleId = useId();
  const descriptionId = useId();
  const panel = useRef<HTMLDivElement>(null);
  useFocusTrap(panel, true, onClose, () => panel.current?.querySelector<HTMLElement>("input, select, textarea, button:not([data-modal-close])"));

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-0 backdrop-blur-[2px] sm:items-center sm:p-4"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={description ? descriptionId : undefined}
        className={`max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white p-6 shadow-2xl outline-none sm:rounded-2xl ${size === "sm" ? "sm:max-w-md" : "sm:max-w-lg"}`}>
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 id={titleId} className="text-xl font-semibold text-slate-950">{title}</h2>
            {description && <p id={descriptionId} className="mt-1.5 text-sm leading-6 text-slate-600">{description}</p>}
          </div>
          <button type="button" data-modal-close onClick={onClose} aria-label="Close dialog"
            className="-mr-2 -mt-1 grid h-10 w-10 place-items-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500">
            <svg aria-hidden="true" viewBox="0 0 20 20" className="h-5 w-5" fill="currentColor"><path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" /></svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

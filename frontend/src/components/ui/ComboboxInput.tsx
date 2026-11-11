"use client";

import { type KeyboardEvent, useEffect, useId, useMemo, useRef, useState } from "react";

const MAX_SUGGESTIONS = 8;

interface ComboboxInputProps {
  id: string;
  name?: string;
  value: string;
  onChange: (value: string) => void;
  /** Existing values offered as suggestions. Free text is always allowed. */
  options: string[];
  placeholder?: string;
  maxLength?: number;
  required?: boolean;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
  className?: string;
}

/**
 * Text input with a custom-styled suggestion list (replaces the native <datalist>). Follows the
 * ARIA 1.2 combobox pattern: ↓/↑ move through suggestions, Enter picks one, Escape closes the list
 * (without closing a surrounding dialog), and typing filters. Any typed value is accepted.
 */
export function ComboboxInput({ id, name, value, onChange, options, placeholder, maxLength, required, disabled, invalid, describedBy, className = "" }: ComboboxInputProps) {
  const listId = useId();
  const optionId = (index: number) => `${listId}-option-${index}`;
  const root = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const suggestions = useMemo(() => {
    const term = value.trim().toLowerCase();
    const matches = term ? options.filter((option) => option.toLowerCase().includes(term)) : options;
    // Hide the list when the only match is exactly what is already typed.
    return matches.length === 1 && matches[0]!.toLowerCase() === term ? [] : matches.slice(0, MAX_SUGGESTIONS);
  }, [options, value]);
  const expanded = open && suggestions.length > 0 && !disabled;

  // Close when clicking anywhere outside the component.
  useEffect(() => {
    if (!expanded) return;
    const onPointerDown = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [expanded]);

  useEffect(() => {
    if (expanded && activeIndex >= 0) document.getElementById(optionId(activeIndex))?.scrollIntoView?.({ block: "nearest" });
  });

  const choose = (option: string) => { onChange(option); setOpen(false); setActiveIndex(-1); };

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!expanded) { setOpen(true); setActiveIndex(0); return; }
      setActiveIndex((index) => Math.min(suggestions.length - 1, index + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(0, index - 1));
    } else if (event.key === "Enter" && expanded && activeIndex >= 0) {
      event.preventDefault(); // pick the suggestion instead of submitting the form
      choose(suggestions[activeIndex]!);
    } else if (event.key === "Escape" && expanded) {
      event.preventDefault();
      event.stopPropagation(); // close the list, not the dialog around it
      setOpen(false); setActiveIndex(-1);
    } else if (event.key === "Tab") {
      setOpen(false);
    }
  }

  return (
    <div ref={root} className="relative">
      <input id={id} name={name} type="text" role="combobox" autoComplete="off" value={value} placeholder={placeholder} maxLength={maxLength}
        required={required} disabled={disabled} aria-invalid={invalid} aria-describedby={describedBy}
        aria-autocomplete="list" aria-expanded={expanded} aria-controls={listId}
        aria-activedescendant={expanded && activeIndex >= 0 ? optionId(activeIndex) : undefined}
        onChange={(event) => { onChange(event.target.value); setOpen(true); setActiveIndex(-1); }}
        onFocus={() => setOpen(true)} onClick={() => setOpen(true)} onKeyDown={onKeyDown}
        className={`${className} ${options.length ? "pr-10" : ""}`} />
      {options.length > 0 && (
        <button type="button" tabIndex={-1} aria-label={expanded ? "Hide suggestions" : "Show suggestions"} disabled={disabled}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => { setOpen((current) => !current); document.getElementById(id)?.focus(); }}
          className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-slate-500 hover:text-slate-700 disabled:opacity-50">
          <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`}>
            <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
          </svg>
        </button>
      )}
      <ul id={listId} role="listbox" aria-label="Suggestions" hidden={!expanded}
        className="absolute left-0 right-0 z-30 mt-2 max-h-60 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl shadow-slate-900/10 ring-1 ring-slate-900/5">
        {expanded && suggestions.map((option, index) => {
          const selected = option.toLowerCase() === value.trim().toLowerCase();
          return (
            <li key={option} id={optionId(index)} role="option" aria-selected={index === activeIndex}
              onMouseDown={(event) => event.preventDefault()} onMouseEnter={() => setActiveIndex(index)} onClick={() => choose(option)}
              className={`flex cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${index === activeIndex ? "bg-teal-50 text-teal-900" : "text-slate-700"} ${selected ? "font-semibold" : ""}`}>
              <span className="truncate">{option}</span>
              {selected && <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 shrink-0 text-teal-700"><path fillRule="evenodd" d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0l-3.5-3.5a1 1 0 1 1 1.4-1.4l2.8 2.79 6.8-6.79a1 1 0 0 1 1.4 0Z" clipRule="evenodd" /></svg>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

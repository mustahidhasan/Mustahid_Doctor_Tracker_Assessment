"use client";

import { type KeyboardEvent, useEffect, useId, useMemo, useRef, useState } from "react";

export interface SelectOption { value: string; label: string; }

interface SelectMenuProps {
  /** Accessible name for the trigger button, e.g. "Filter specialization". */
  label: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  /** Adds a type-to-filter search box inside the menu. */
  searchable?: boolean;
  searchPlaceholder?: string;
  id?: string;
  className?: string;
  /** Which edge the popover aligns to; use "right" for controls near the right edge of the page. */
  align?: "left" | "right";
  /** Marks the control invalid (red border, aria-invalid) and links an error message. */
  invalid?: boolean;
  describedBy?: string;
  disabled?: boolean;
}

/**
 * Custom-styled replacement for a native <select>: a button that opens a listbox popover.
 * Keyboard: ↑/↓, Home/End, Enter to choose, Escape or Tab to close; typing filters when searchable.
 */
export function SelectMenu({ label, value, options, onChange, searchable = false, searchPlaceholder = "Search…", id, className = "", align = "left", invalid = false, describedBy, disabled = false }: SelectMenuProps) {
  const generatedId = useId();
  const triggerId = id ?? `${generatedId}-trigger`;
  const listId = `${generatedId}-list`;
  const optionId = (index: number) => `${generatedId}-option-${index}`;
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const selected = options.find((option) => option.value === value) ?? options[0];
  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    return term ? options.filter((option) => option.label.toLowerCase().includes(term)) : options;
  }, [options, query]);

  const openMenu = () => {
    setQuery("");
    setActiveIndex(Math.max(0, options.findIndex((option) => option.value === value)));
    setOpen(true);
  };
  const closeMenu = (returnFocus = true) => {
    setOpen(false);
    if (returnFocus) trigger.current?.focus();
  };
  const choose = (option: SelectOption | undefined) => {
    if (!option) return;
    if (option.value !== value) onChange(option.value);
    closeMenu();
  };

  // Focus the search box (or the list) when the menu opens.
  useEffect(() => {
    if (open) (searchable ? search.current : list.current)?.focus();
  }, [open, searchable]);

  // Keep the highlighted option scrolled into view.
  useEffect(() => {
    if (open) document.getElementById(optionId(activeIndex))?.scrollIntoView?.({ block: "nearest" });
  });

  // Close when clicking anywhere outside the component.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent | MouseEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  function onTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) { event.preventDefault(); openMenu(); }
  }

  function onMenuKeyDown(event: KeyboardEvent<HTMLElement>) {
    const last = visible.length - 1;
    switch (event.key) {
      case "ArrowDown": event.preventDefault(); setActiveIndex((index) => Math.min(last, index + 1)); break;
      case "ArrowUp": event.preventDefault(); setActiveIndex((index) => Math.max(0, index - 1)); break;
      case "Home": event.preventDefault(); setActiveIndex(0); break;
      case "End": event.preventDefault(); setActiveIndex(Math.max(0, last)); break;
      case "Enter": event.preventDefault(); choose(visible[activeIndex]); break;
      case "Escape": event.preventDefault(); event.stopPropagation(); closeMenu(); break;
      case "Tab": closeMenu(false); break;
      default:
        if (!searchable && event.key.length === 1) {
          // Type-ahead on non-searchable menus: jump to the next option starting with the typed letter.
          const letter = event.key.toLowerCase();
          const next = visible.findIndex((option, index) => index > activeIndex && option.label.toLowerCase().startsWith(letter));
          const wrapped = next >= 0 ? next : visible.findIndex((option) => option.label.toLowerCase().startsWith(letter));
          if (wrapped >= 0) setActiveIndex(wrapped);
        }
    }
  }

  const isPlaceholder = selected?.value === "";

  return (
    <div ref={root} className={`relative ${className}`}>
      <button ref={trigger} id={triggerId} type="button" aria-label={label} aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? listId : undefined}
        aria-describedby={describedBy} disabled={disabled}
        onClick={() => (open ? closeMenu() : openMenu())} onKeyDown={onTriggerKeyDown}
        className={`flex w-full items-center justify-between gap-2 rounded-xl border bg-white px-3 py-2.5 text-left text-sm outline-none transition hover:border-slate-300 focus-visible:border-teal-600 focus-visible:ring-4 focus-visible:ring-teal-100 disabled:cursor-not-allowed disabled:bg-slate-50 ${open ? "border-teal-600 ring-4 ring-teal-100" : invalid ? "border-red-300" : "border-slate-200"}`}>
        <span className={`truncate ${isPlaceholder ? "text-slate-500" : "font-medium text-slate-900"}`}>{selected?.label}</span>
        <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}>
          <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
        </svg>
      </button>

      {open && (
        <div className={`absolute z-30 ${align === "right" ? "right-0" : "left-0"} mt-2 w-full min-w-[14rem] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl shadow-slate-900/10 ring-1 ring-slate-900/5`}>
          {searchable && (
            <div className="border-b border-slate-100 p-2">
              <div className="relative">
                <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"><path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.45 4.39l3.08 3.08a.75.75 0 1 1-1.06 1.06l-3.08-3.08A7 7 0 0 1 2 9Z" clipRule="evenodd" /></svg>
                <input ref={search} type="text" value={query} placeholder={searchPlaceholder} aria-label={`${label} search`}
                  role="combobox" aria-expanded="true" aria-controls={listId} aria-autocomplete="list"
                  aria-activedescendant={visible[activeIndex] ? optionId(activeIndex) : undefined}
                  onChange={(event) => { setQuery(event.target.value); setActiveIndex(0); }} onKeyDown={onMenuKeyDown}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-8 pr-3 text-sm outline-none focus:border-teal-600 focus:bg-white" />
              </div>
            </div>
          )}
          <ul ref={list} id={listId} role="listbox" aria-label={label} tabIndex={searchable ? -1 : 0}
            aria-activedescendant={!searchable && visible[activeIndex] ? optionId(activeIndex) : undefined}
            onKeyDown={searchable ? undefined : onMenuKeyDown} className="max-h-64 overflow-y-auto p-1.5 outline-none">
            {visible.length === 0 ? (
              <li className="px-3 py-6 text-center text-sm text-slate-500" role="presentation">No matches for “{query.trim()}”</li>
            ) : visible.map((option, index) => {
              const isSelected = option.value === value;
              const isActive = index === activeIndex;
              return (
                <li key={option.value || "__all"} id={optionId(index)} role="option" aria-selected={isSelected}
                  onMouseEnter={() => setActiveIndex(index)} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(option)}
                  className={`flex cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${isActive ? "bg-teal-50 text-teal-900" : "text-slate-700"} ${isSelected ? "font-semibold" : ""} ${option.value === "" ? "text-slate-500" : ""}`}>
                  <span className="truncate">{option.label}</span>
                  {isSelected && (
                    <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 shrink-0 text-teal-700"><path fillRule="evenodd" d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0l-3.5-3.5a1 1 0 1 1 1.4-1.4l2.8 2.79 6.8-6.79a1 1 0 0 1 1.4 0Z" clipRule="evenodd" /></svg>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

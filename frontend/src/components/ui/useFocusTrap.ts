"use client";

import { type RefObject, useEffect, useRef } from "react";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Keeps keyboard focus inside `container` while active: Tab/Shift+Tab wrap around, Escape calls
 * `onEscape`, and focus returns to the previously focused element when the trap is released.
 */
export function useFocusTrap(container: RefObject<HTMLElement | null>, active: boolean, onEscape?: () => void, initialFocus?: () => HTMLElement | null | undefined) {
  const escapeRef = useRef(onEscape);
  const initialRef = useRef(initialFocus);
  useEffect(() => { escapeRef.current = onEscape; initialRef.current = initialFocus; });

  useEffect(() => {
    if (!active) return;
    const previous = document.activeElement as HTMLElement | null;
    const node = container.current;
    (initialRef.current?.() ?? node?.querySelector<HTMLElement>(FOCUSABLE) ?? node)?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && escapeRef.current) { event.stopPropagation(); escapeRef.current(); return; }
      if (event.key !== "Tab" || !node) return;
      const items = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((element) => !element.closest("[hidden]"));
      if (items.length === 0) { event.preventDefault(); node.focus(); return; }
      const first = items[0]!, last = items[items.length - 1]!;
      const current = document.activeElement;
      if (event.shiftKey && (current === first || !node.contains(current))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (current === last || !node.contains(current))) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      if (previous && document.contains(previous)) previous.focus();
    };
  }, [active, container]);
}

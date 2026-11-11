"use client";

import { type RefObject, useEffect, useState } from "react";

/**
 * True once the element comes within `margin` of the viewport (and stays true). Charts use it to
 * defer loading and drawing Recharts until they are about to be seen, keeping that work out of the
 * initial page load. Without IntersectionObserver (old browsers, tests) it is true immediately.
 */
export function useNearViewport(ref: RefObject<Element | null>, margin = "200px"): boolean {
  const [near, setNear] = useState(() => typeof window === "undefined" || typeof IntersectionObserver === "undefined");
  useEffect(() => {
    if (near || !ref.current) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) { setNear(true); observer.disconnect(); }
    }, { rootMargin: margin });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [near, ref, margin]);
  return near;
}

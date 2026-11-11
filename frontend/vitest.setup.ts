import "@testing-library/jest-dom/vitest";

// jsdom lacks ResizeObserver, which Recharts' ResponsiveContainer uses.
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

import { describe, expect, it } from "vitest";
import nextConfig, { apiProxyTarget } from "../next.config";

describe("Next.js configuration", () => {
  it("sends baseline security headers on every route and hides X-Powered-By", async () => {
    expect(nextConfig.poweredByHeader).toBe(false);
    const rules = await nextConfig.headers!();
    const all = rules.find((rule) => rule.source === "/:path*");
    const headers = Object.fromEntries((all?.headers ?? []).map((header) => [header.key, header.value]));
    expect(headers).toMatchObject({
      "X-Frame-Options": "DENY",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
    });
    expect(headers["Content-Security-Policy"]).toContain("frame-ancestors 'none'");
    expect(headers["Content-Security-Policy"]).toContain("object-src 'none'");
    expect(headers["Permissions-Policy"]).toContain("camera=()");
  });

  it("proxies /api through an environment-driven target", async () => {
    const original = process.env.API_PROXY_TARGET;
    process.env.API_PROXY_TARGET = "https://backend.example.test";
    const rewrites = await nextConfig.rewrites!();
    expect(rewrites).toEqual([{ source: "/api/:path*", destination: "https://backend.example.test/api/:path*" }]);
    process.env.API_PROXY_TARGET = original;
  });

  it("normalizes API_PROXY_TARGET so formatting slips cannot break the proxy (regression)", () => {
    for (const value of ["https://doctor-tracker-api.vercel.app", "https://doctor-tracker-api.vercel.app/", "https://doctor-tracker-api.vercel.app/api", ' "https://doctor-tracker-api.vercel.app/" ']) {
      expect(apiProxyTarget({ API_PROXY_TARGET: value })).toBe("https://doctor-tracker-api.vercel.app");
    }
    expect(apiProxyTarget({})).toBe("http://localhost:5000");
  });

  it("fails a Vercel build when API_PROXY_TARGET is missing or invalid instead of proxying to localhost", () => {
    expect(() => apiProxyTarget({ VERCEL: "1" })).toThrow(/API_PROXY_TARGET is not set/);
    expect(() => apiProxyTarget({ API_PROXY_TARGET: "doctor-tracker-api.vercel.app" })).toThrow(/full URL/);
  });
});

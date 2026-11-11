import { describe, expect, it } from "vitest";
import nextConfig from "../next.config";

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
});

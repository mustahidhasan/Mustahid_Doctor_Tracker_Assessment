import type { NextConfig } from "next";

/**
 * Backend origin for the /api/* proxy (read at build time). Normalized to scheme + host + port, so a
 * trailing slash, an "/api" suffix, quotes or spaces cannot produce "//api" or "/api/api" URLs.
 * On Vercel builds it must be set; locally it defaults to the Express dev server.
 */
export function apiProxyTarget(environment: Record<string, string | undefined> = process.env): string {
  const raw = environment.API_PROXY_TARGET?.trim().replace(/^['"]|['"]$/g, "").trim();
  if (!raw) {
    if (environment.VERCEL) throw new Error("API_PROXY_TARGET is not set for this Vercel deployment. Set it to the backend URL (e.g. https://doctor-tracker-api.vercel.app) and redeploy.");
    return "http://localhost:5000";
  }
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error(`API_PROXY_TARGET must be a full URL such as https://doctor-tracker-api.vercel.app (got "${raw}").`); }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("API_PROXY_TARGET must use http or https.");
  return url.origin;
}

const nextConfig: NextConfig = {
  poweredByHeader: false,
  agentRules: false,
  cacheComponents: true,
  partialPrefetching: true,
  // Baseline security headers for every page. A full script-src CSP would need per-request nonces for
  // Next.js inline scripts, so the policy is limited to directives that are safe without them.
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "X-Frame-Options", value: "DENY" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
        { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'" },
        { key: "Strict-Transport-Security", value: "max-age=31536000" },
      ],
    }];
  },
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${apiProxyTarget()}/api/:path*` }];
  },
};

export default nextConfig;

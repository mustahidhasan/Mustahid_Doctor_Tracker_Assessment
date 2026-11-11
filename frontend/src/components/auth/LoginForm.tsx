"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, type KeyboardEvent, useRef, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/Button";
import { login, safeNextPath } from "@/lib/auth";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const noopSubscribe = () => () => undefined;

/** Reads the login query string on the client only (the page itself is statically prerendered). */
function useLoginParams() {
  const search = useSyncExternalStore(noopSubscribe, () => window.location.search, () => "");
  const params = new URLSearchParams(search);
  return { expired: params.get("expired") === "1", next: safeNextPath(params.get("next")) };
}

const inputClass = (invalid: boolean) => `w-full rounded-xl border bg-white px-4 py-3 text-slate-950 outline-none transition placeholder:text-slate-400 focus:ring-4 disabled:bg-slate-50 ${invalid ? "border-red-300 focus:border-red-500 focus:ring-red-100" : "border-slate-200 focus:border-teal-600 focus:ring-teal-100"}`;

export function LoginForm() {
  const router = useRouter();
  const { expired, next } = useLoginParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [error, setError] = useState("");
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    setError("");
    const errors: { email?: string; password?: string } = {};
    if (!EMAIL_PATTERN.test(email.trim())) errors.email = "Enter a valid email address.";
    if (!password) errors.password = "Enter your password.";
    setFieldErrors(errors);
    if (errors.email || errors.password) {
      (errors.email ? emailRef : passwordRef).current?.focus();
      return;
    }
    setLoading(true);
    try {
      await login(email.trim(), password);
      router.replace(next ?? "/dashboard");
      router.refresh();
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Unable to sign in");
      setPassword("");
      setLoading(false);
      passwordRef.current?.focus();
    }
  }

  const trackCapsLock = (event: KeyboardEvent<HTMLInputElement>) => setCapsLock(event.getModifierState?.("CapsLock") ?? false);

  return (
    <form className="space-y-5" onSubmit={handleSubmit} noValidate aria-busy={loading}>
      {expired && !error && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" role="status">
          Your session has expired. Please sign in again to continue.
        </p>
      )}
      <div>
        <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="email">Email address</label>
        <input ref={emailRef} id="email" name="email" type="email" autoComplete="username" inputMode="email" required autoFocus
          value={email} onChange={(event) => { setEmail(event.target.value); if (fieldErrors.email) setFieldErrors(({ password: p }) => ({ password: p })); }}
          aria-invalid={Boolean(fieldErrors.email)} aria-describedby={fieldErrors.email ? "email-error" : undefined} disabled={loading}
          className={inputClass(Boolean(fieldErrors.email))} placeholder="admin@example.com" />
        {fieldErrors.email && <p id="email-error" className="mt-1.5 text-sm text-red-600">{fieldErrors.email}</p>}
      </div>
      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className="text-sm font-medium text-slate-700" htmlFor="password">Password</label>
          <button type="button" onClick={() => setShowPassword((value) => !value)} aria-pressed={showPassword} aria-controls="password"
            className="inline-flex min-h-8 items-center rounded-lg px-1.5 text-sm font-medium text-teal-700 hover:text-teal-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500">
            {showPassword ? "Hide" : "Show"} password
          </button>
        </div>
        <input ref={passwordRef} id="password" name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" required
          value={password} onChange={(event) => { setPassword(event.target.value); if (fieldErrors.password) setFieldErrors(({ email: e }) => ({ email: e })); }}
          onKeyDown={trackCapsLock} onKeyUp={trackCapsLock} disabled={loading}
          aria-invalid={Boolean(fieldErrors.password)} aria-describedby={[fieldErrors.password ? "password-error" : "", capsLock ? "caps-lock-hint" : ""].filter(Boolean).join(" ") || undefined}
          className={inputClass(Boolean(fieldErrors.password))} placeholder="Enter your password" />
        {fieldErrors.password && <p id="password-error" className="mt-1.5 text-sm text-red-600">{fieldErrors.password}</p>}
        {capsLock && <p id="caps-lock-hint" className="mt-1.5 text-sm text-amber-700">Caps Lock is on.</p>}
      </div>
      {(fieldErrors.email || fieldErrors.password) && <p className="sr-only" role="alert">Enter a valid email address and password.</p>}
      {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p>}
      <Button type="submit" variant="primary" loading={loading} loadingText="Signing in…" className="w-full py-3">Sign in securely</Button>
    </form>
  );
}

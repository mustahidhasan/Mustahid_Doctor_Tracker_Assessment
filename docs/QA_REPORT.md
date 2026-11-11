# Doctor Tracker: QA Report (Module 8)

- **Scope:** final testing, security review, and quality assurance before deployment.
- **Code reviewed:** commit `601601c` (Modules 1–7) plus the Module 8 changes listed below.
- **Environment:** macOS, Node 22, MongoDB Atlas development database `doctor_tracker_dev` (server 8.0), Google Chrome (headless).
- **Not yet verified:** Vercel deployment, which is Module 9.

## 1. Results summary

| Check | Result |
|---|---|
| Backend type check (`src` and the Vercel entry `api/`) | Pass |
| Backend tests | **156 / 156 pass** (6 files) |
| Backend production build | Pass |
| Frontend ESLint / TypeScript | Pass / Pass |
| Frontend tests | **121 / 121 pass** (8 files) |
| Frontend production build | Pass |
| End-to-end (Playwright, real browser, production build) | **1 / 1 pass, 3 consecutive runs** (8.3–8.7 s) |
| `bash -n run.sh` and live `run.sh` start and stop tests | Pass |
| `npm audit --omit=dev` (backend, frontend, e2e) | 0 vulnerabilities |
| `npm audit` including dev tooling (frontend) | 8 moderate, all in the dev-only ESLint `minimatch` chain (see §6) |

## 2. Tested functionality

**Automated (unit and integration, all mocked, no database writes)**

- **Authentication:**
  - Admin seeding and bcrypt hashing.
  - Valid and invalid login with generic errors.
  - JWT signing and verification: HS256 only. Tampered, wrongly signed, and `alg: none` tokens are rejected.
  - Session restore and logout.
  - Deleted or non-admin accounts are rejected.
  - Two-layer login rate limiting.
  - Trusted-origin (CSRF) checks.
  - Cookie flags and lifetime.
  - Expired-session redirects with a safe `next` path.
  - Route proxy redirects.
- **Doctors:**
  - CRUD, with validation of required fields, email, phone, length limits, and unknown fields.
  - Invalid ObjectIds.
  - Escaped regex search, exact filters, UTC date ranges, sorting, and pagination math.
  - Patient association.
  - The restrict-on-delete policy (`409` while patients exist).
- **Patients:**
  - CRUD and reassignment.
  - Rejection of nonexistent doctors (`400` with field details).
  - Clearing optional fields.
  - Cross-doctor delete protection.
  - Filters run against the generated seed data.
- **Dashboard:**
  - Totals, averages (no division by zero), and period counts.
  - Day, week, and month buckets with zero-filling, UTC boundaries, and date ordering.
  - Patients per doctor, including doctors with zero patients.
  - Distributions with an "Other" bucket.
  - Aggregation failures.
- **Seed:**
  - 30 doctors and 150 patients with valid references.
  - Variety across specializations, hospitals, conditions, and 12 months.
  - Determinism and idempotency.
  - The insert-only real write path (`$setOnInsert` upserts only; no `$set`, deletes, or user writes).
  - Production and permission guards.
- **Security regressions (new):**
  - Rate-limit spoofing.
  - Operator-object injection in bodies and query parameters.
  - Oversized bodies (`413`).
  - Security headers.
  - No stack traces or raw errors in responses.
  - No password hashes or tokens in response bodies.
  - The serverless connection cache and the `503` path.
- **Frontend:**
  - App shell, mobile drawer, and focus traps.
  - axe-core audits of the shell, login, Doctors, Patients (with an open dialog), and Dashboard.
  - Forms, validation, and prevention of duplicate submissions.
  - Search debounce and out-of-order responses.
  - Pagination edge cases and refresh after mutations.
  - Dashboard filters, cache, chart rendering, and deferred drawing.
  - Next.js security headers and the environment-driven proxy target.

**End-to-end (`e2e/tests/workflow.spec.ts`, production build, development database, disposable records only)**

The test runs all 16 workflow steps:
1. Log in through the form.
2. Open the dashboard.
3. Create two `[E2E]` doctors.
4. Search.
5. Open details.
6. Add a patient there.
7. Search on the Patients page.
8. Edit the patient.
9. Reassign the patient to the second doctor.
10. Verify the relationship moved on both doctors' pages.
11. Delete the patient.
12. Delete both doctors.
13. Confirm the search is empty.
14. Log out.
15. Check that `/dashboard`, `/doctors`, and `/patients` redirect to `/login?next=…`.
16. Check that `GET /api/doctors` returns `401`.

After each run, the database had 0 `[E2E]` records left.

## 3. Manual and browser verification

Browser checks used headless Google Chrome (Puppeteer and Playwright) against a local production build. Screen-reader testing with VoiceOver or NVDA was **not** performed.

- **Responsive layout.** Six routes at 375, 768, 1024, and 1440px (24 combinations): no horizontal page overflow, exactly one `h1` per page, all four charts render, and the sidebar or menu button appears at the correct breakpoint. **0 console errors**, including under the new Content-Security-Policy.
- **Lighthouse 12.6.1** (mobile preset, this build, single run each):

  | Route | Performance | Accessibility | Best practices |
  |---|---|---|---|
  | `/login` | 100 | 100 | 100 |
  | `/dashboard` | 99 | 100 | 100 |
  | `/doctors` | 99 | 100 | 100 |
  | `/patients` | 99 | 100 | 100 |

  The only non-passing audit is an informational `bf-cache` on `/patients`, caused by deliberate `no-store` caching (§6).
- **Interaction checks (Module 7 script, 22/22):**
  - Skip link and focus visibility.
  - Drawer and dialog focus trapping within 375px.
  - Expired and forged session handling.
  - CRUD and reassignment through the UI.
- **`run.sh`, in an isolated worktree on ports 3057/5057:**
  - A real Ctrl+C through a pseudo-terminal: exit 130, 0 leftover app processes, ports released.
  - SIGTERM to `run.sh` only: exit 143, 0 leftovers.
  - Busy ports, a production database name, and a short `JWT_SECRET`: each refused with a clear message and exit 1.
  - No credentials appeared in any output.
- **Proxy and headers (live):**
  - Unauthenticated `/api/*` through the frontend returns `401`.
  - A cross-site `POST /api/auth/login` returns `403`.
  - Expected security headers on both apps, and no `X-Powered-By`.
- **Seed:** two runs inserted 0 doctors and 0 patients (all already present). Earlier, collection fingerprints were byte-identical before and after seeding.

## 4. Bugs found and fixed in Module 8

| # | Severity | Bug | Fix | Regression test |
|---|---|---|---|---|
| 1 | High | **Login rate limit could be bypassed** by rotating `X-Forwarded-For`. 15 wrong passwords in a row were never limited, because the Next.js proxy forwards client-supplied XFF and the backend trusts one hop. | Added a per-account limiter (normalized email, 10 per 15 min) that ignores IP headers. The IP limiter stays as a looser second layer. | `security.test.ts` |
| 2 | Medium | **Bodies over 16 KB returned `500`** instead of `413`: the error handler only recognized JSON syntax errors. | Map body-parser client errors to `413` / `415` / `400` with generic messages. | `security.test.ts` |
| 3 | Medium | **Serverless DB handling:** the Vercel handler called `mongoose.connect()` on every request, logged each time, and turned an Atlas outage into an unhandled crash. | Cached, shared in-flight connection; retries after failure; reconnects when closed; `503` JSON on failure. | `security.test.ts` |
| 4 | Medium | **`run.sh` left dev servers running** after SIGTERM: killing children one by one let `tsx watch` respawn them. Its signal trap also never exited, so it printed "Backend exited unexpectedly". | Separate process groups (`set -m`), whole-group TERM then KILL, correct exit codes, stdin from `/dev/null`. | Live pty tests (§3) |
| 5 | Low | **Session cookie lifetime was fixed at 24h** regardless of `JWT_EXPIRES_IN`. | Cookie `Max-Age` is derived from the token's `exp`. | `security.test.ts` |
| 6 | Low | **`api/index.ts` (the Vercel entry) was never type-checked.** | `tsconfig.api.json`, included in `npm run typecheck`. | Type check |
| 7 | Low | **Missing security headers** on both apps. | API: `nosniff`, `DENY`, `no-referrer`, `no-store`, CORP. Frontend: `DENY`, `nosniff`, referrer and permissions policy, CSP framing/base/form/object directives, HSTS. `X-Powered-By` removed. | `security.test.ts`, `config.test.ts` |
| 8 | Low | Unused dev dependency `@testing-library/user-event`. | Removed. | — |

Also added: `run.sh` checks the ports before starting, refuses a production database, and requires a `JWT_SECRET` of at least 32 characters.

## 5. Security review findings (verified as correct)

- **Every Doctor, Patient, and Dashboard route** requires an admin session. The session is re-validated against the database on each request, so deleted users are rejected immediately.
- **Strict Zod schemas** reject unknown fields and object-shaped values. Express 5's simple query parser never produces objects. Search input is regex-escaped. Pagination is capped at 100 per page and 10,000 pages.
- **Errors never include stack traces or database messages.** Password hashes are excluded by default (`select: false`), and tokens never appear in response bodies.
- **CORS** allows only `CORS_ORIGIN`, with credentials. Cookies are `HttpOnly`, `SameSite=Lax`, and `Secure` in production.
- **Authentication is stateless (JWT cookie).** Nothing relies on in-memory sessions or the local filesystem.
- **Seeding** is blocked in production and requires `ALLOW_DEV_SEED=true`.
- **Secrets:** no secrets are tracked by Git. `.env` and `.env.local` are ignored, and both `.env.example` files contain placeholders only.

## 6. Remaining risks and limitations

- **Rate limits are in memory per instance.** Vercel instances don't share them, so a Redis or KV store is needed for global enforcement. A targeted account can be locked out for 15 minutes by an attacker; that's the inherent trade-off of per-account limits.
- **Logout doesn't revoke an issued JWT.** It stays valid until it expires (default 1 day). Revocation would need a denylist or session store.
- **The CSP has no `script-src` directive,** because Next.js inline scripts would need per-request nonces.
- **`npm audit` reports 8 moderate findings** in dev-only ESLint tooling (`minimatch`). The only fix is a breaking `--force` upgrade, and none of it ships in production bundles.
- **No back/forward cache** for `/patients` and other pages that load authenticated data, because of `no-store`. This is a deliberate privacy choice.
- **Scale limits:** regex search scans documents, offset pagination slows on deep pages, check-then-write sequences don't use transactions, and dashboard aggregations aren't cached. All are acceptable at assessment scale and documented in the README.
- **Redundant Atlas indexes** (`email_1` and old single-field sort indexes) remain until dropped manually. The README has the command.
- **Seeded dates age over time,** so the 7-day and 30-day dashboard views will gradually empty.
- **Untested environments:** screen readers, and Linux for `run.sh` (bash constructs are portable, but it was only exercised on macOS).

## 7. Deployment readiness

- **Ready for Module 9:**
  - Both production builds pass.
  - The Express app is exposed as a Vercel Function (`backend/api/index.ts` with `vercel.json`) and reuses its connection across invocations.
  - The proxy target is environment-driven.
  - Database credentials are backend-only.
  - Authentication needs no persistent state.
  - Required environment variables and Atlas network access are documented in the README ("Production deployment prerequisites").
- **To verify on Vercel:**
  - The cookie flows through the frontend rewrite.
  - `X-Forwarded-For` behaves as expected at the backend.
  - Security headers and CORS work with the deployed origins.
  - Cold-start latency to Atlas.

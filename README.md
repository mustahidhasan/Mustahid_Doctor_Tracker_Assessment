# Doctor Tracker

A Next.js administration frontend and Express/MongoDB backend for managing healthcare data.

## Technology stack

- Frontend: Next.js 16, React 19, TypeScript, Tailwind CSS v4 (PostCSS), and Recharts
- Backend: Node.js, Express 5, TypeScript, Zod, JWT, and bcrypt
- Database: MongoDB Atlas with Mongoose
- Deployment: separate frontend and backend Vercel projects

## Project structure

```text
backend/    Express API, MongoDB models, authentication, doctor, patient and dashboard APIs, seed script, and tests
frontend/   Next.js application, login UI, protected routes, dashboard, doctor and patient management UI, and tests
run.sh      Local launcher for both applications
```

## Authentication architecture

The browser calls relative `/api/*` URLs. Next.js rewrites those requests to Express using `API_PROXY_TARGET`, so the JWT remains in a same-origin, `HttpOnly`, `SameSite=Lax` cookie. The backend validates the HS256 signature, expiration, payload, and active admin account on every authenticated request. Passwords are hashed with bcrypt (12 rounds) and `passwordHash` is excluded from normal MongoDB queries.

Login, logout, and every state-changing API request reject untrusted browser origins (CSRF defence in depth on top of `SameSite=Lax`). Request bodies are limited to 16 KB, and larger ones return `413`.

**Login rate limiting has two layers**, and both count only failed attempts:
- **Per account:** 10 per 15 minutes, keyed by the normalized email. This is the brute-force control. It can't be bypassed by rotating `X-Forwarded-For`, which a client can send through the Next.js proxy.
- **Per client IP:** 50 per 15 minutes, a looser brake on credential stuffing across many accounts.

Both limiters are in memory per instance, and Vercel instances don't share them. A shared Redis or KV store is needed for global enforcement.

The session cookie's `Max-Age` matches the JWT's actual expiry (`JWT_EXPIRES_IN`).

Logout removes the browser cookie but does not revoke a JWT that was already issued. Account lookup on every authenticated request ensures deleted or unauthorized accounts are rejected. Immediate token revocation would require a server-side denylist or session store.

## Local setup

1. Copy `backend/.env.example` to `backend/.env` and `frontend/.env.example` to `frontend/.env.local`.
2. Set a unique `JWT_SECRET` of at least 32 characters and your MongoDB Atlas URI. Never commit either value.
3. Set `ADMIN_EMAIL` and an `ADMIN_PASSWORD` of at least 12 characters.
4. Create the initial admin once:

   ```bash
   npm run seed --prefix backend
   ```

   The seed is idempotent and never replaces an existing admin password.

5. Start both applications from the repository root:

   ```bash
   ./run.sh
   ```

   What the runner does:
   - **Checks configuration** without printing any values: required variables, and a `JWT_SECRET` of at least 32 characters.
   - **Refuses a production configuration:** `NODE_ENV=production`, or a database name containing "prod". Override with `ALLOW_PRODUCTION_DATABASE=true` only deliberately. It prints the database *name*, never the connection string.
   - **Checks the ports** and fails with a clear message if 5000 or 3000 is taken. Set `BACKEND_PORT` and `FRONTEND_PORT` to change them.
   - **Installs missing dependencies**, then starts each service in its own process group.
   - **Stops cleanly.** Ctrl+C (exit 130), `SIGTERM` (exit 143), or either service exiting stops both whole process trees; anything still running after 5 seconds is force-stopped.

   It works with bash 3.2 or later on macOS and Linux, and doesn't need Docker. To run the services separately, use `npm run dev --prefix backend` and `npm run dev --prefix frontend`.

6. Visit `http://localhost:3000/login`.

## Environment variables

Backend: `NODE_ENV`, `PORT`, `MONGODB_URI`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `CORS_ORIGIN`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD`. Optional, for development seeding only: `ALLOW_DEV_SEED` and `SEED_REFERENCE_DATE`.

Frontend: `API_PROXY_TARGET` (defaults locally to `http://localhost:5000`). On Vercel, set it to the separately deployed backend URL and set backend `CORS_ORIGIN` to the frontend origin. Production cookies automatically use `Secure`.

End-to-end tests (optional, local only): `E2E_ADMIN_EMAIL`, `E2E_ADMIN_PASSWORD`, `E2E_BASE_URL`.

## MongoDB

The backend reads `MONGODB_URI` and connects through `backend/src/config/db.ts`. The connection is opened once and reused. In serverless functions, a warm instance skips the handshake, concurrent cold-start requests share one attempt, a failed attempt is retried on the next request, and a closed connection is re-established. If Atlas is unreachable, the Vercel handler returns `503 {"error":"Service temporarily unavailable"}` without exposing details. Local startup fails safely when the URI is missing or Atlas is unavailable. The seed command uses the same connection, creates only a missing administrator, and always closes its connection. Add the current machine or deployment egress address to the Atlas network access list as needed.

## Authentication API

- `POST /api/auth/login` validates credentials and creates the cookie session.
- `GET /api/auth/me` returns the sanitized active administrator or `401`.
- `POST /api/auth/logout` clears the session cookie.

Protected frontend routes are `/dashboard`, `/doctors`, `/doctors/:id`, `/patients`, and `/patients/:id`. Cookie presence is checked before rendering and the backend independently validates the session; frontend guards are not treated as API authorization.

## Doctor Management

### Features

- Doctors list at `/doctors`: debounced search, specialization and hospital filters (options loaded from existing data), created-date range, sorting (newest, oldest, name A–Z), and server-side pagination.
- Add and edit doctors in an accessible modal form. Validation runs in the browser first, and the server's field-level errors appear inline. The submit button is disabled while saving.
- Doctor details at `/doctors/:id`: profile, created date, patient count, and the associated patients list with add and remove actions.
- Destructive actions use a confirmation dialog. If an action fails (for example a `409`), the dialog stays open and shows the server's message.
- Loading skeletons, separate empty states for "no doctors yet" and "no matches", error states with retry, toast notifications, and responsive layouts (table on desktop, cards on mobile).
- A `401` from any doctor request returns the user to `/login`.

### API reference

All endpoints require an authenticated admin session cookie. Requests without a valid session return `401`. `POST`, `PATCH`, and `DELETE` also reject untrusted browser origins with `403` as CSRF defence in depth.

| Method | Endpoint | Success | Purpose |
|---|---|---|---|
| `POST` | `/api/doctors` | `201 { data }` | Create a doctor |
| `GET` | `/api/doctors` | `200 { data, pagination }` | List, search, filter, sort, and paginate doctors |
| `GET` | `/api/doctors/filter-options` | `200 { data: { specializations, hospitals } }` | Distinct values for the filter dropdowns |
| `GET` | `/api/doctors/:id` | `200 { data }` | Doctor details |
| `PATCH` | `/api/doctors/:id` | `200 { data }` | Partially update a doctor |
| `DELETE` | `/api/doctors/:id` | `204` | Delete a doctor (`409` if patients are still assigned) |
| `GET` | `/api/doctors/:id/patients` | `200 { data, total, limit }` | The doctor's patients (newest 100) and the total count |
| `POST` | `/api/doctors/:id/patients` | `201 { data }` | Create a patient under this doctor |
| `DELETE` | `/api/doctors/:id/patients/:patientId` | `204` | Delete a patient that belongs to this doctor |

Errors always use the shape `{ "error": string, "details"?: [{ "field", "message" }] }`. Status codes: `400` for validation failures, invalid ObjectIds, or invalid query parameters; `404` when a doctor or patient is not found; `409` for a doctor delete conflict; `500` for any other error, returned as the generic message `Internal server error`. Raw MongoDB errors are never returned.

### List query parameters

`GET /api/doctors?page=1&limit=10&search=cardio&specialization=Cardiology&hospital=City%20Hospital&dateFrom=2026-01-01&dateTo=2026-01-31&sort=newest`

| Parameter | Rules |
|---|---|
| `page` | Integer from 1 to 10000. Default `1`. |
| `limit` | Integer from 1 to 100. Default `10`. |
| `search` | Up to 100 characters. Case-insensitive substring match on name, specialization, hospital, or email. Special characters are escaped and matched literally. |
| `specialization`, `hospital` | Exact match. The UI sends values from `/filter-options`. |
| `dateFrom`, `dateTo` | `YYYY-MM-DD` calendar dates in UTC. Both ends are inclusive. `dateFrom` must be on or before `dateTo`. |
| `sort` | `newest` (default), `oldest`, or `name`. Each sort uses `_id` as a tiebreaker, so page boundaries stay stable. |

Example response:

```json
{ "data": [], "pagination": { "page": 1, "limit": 10, "total": 0, "totalPages": 0, "hasNextPage": false, "hasPreviousPage": false } }
```

### Doctor schema

| Field | Rules |
|---|---|
| `name` | Required. Trimmed. Max 120 characters. |
| `specialization` | Required. Trimmed. Max 120 characters. |
| `hospital` | Required. Trimmed. Max 160 characters. |
| `phone` | Required. Digits, spaces, `+ ( ) - .` only. Must contain 7–15 digits. |
| `email` | Required. Valid format. Trimmed and lowercased. Not unique, because the same email may legitimately be shared. |
| `createdAt`, `updatedAt` | Managed by Mongoose timestamps. |

Unknown fields are rejected, so a client cannot set `_id`, timestamps, or other unexpected keys.

### Doctor–patient relationship

Each patient references exactly one doctor through `doctorId`. The nested endpoints enforce these rules:

- A patient cannot be created under a doctor that does not exist (`404`). The `doctorId` comes from the URL, never from the request body.
- Patient deletion is scoped by both IDs (`deleteOne({ _id: patientId, doctorId })`), so a patient cannot be deleted through another doctor's endpoint. That request returns `404`.
- **Doctor deletion policy: restrict.** A doctor with any associated patients cannot be deleted (`409`, with a message giving the patient count). Patients are never orphaned or silently cascade-deleted. Remove or reassign the patients first.

### Performance and indexing

- Filtering, counting, sorting, and pagination all run in MongoDB (`find().sort().skip().limit()` alongside `countDocuments()`, in parallel). Nothing is filtered in memory.
- Read queries use `.lean()` and an explicit projection.
- Doctor indexes: `name` (name sort), `specialization` and `hospital` (exact-match filters and `distinct()` for filter options), and `createdAt` (default sort and date range). Patient indexes include `{ doctorId: 1, createdAt: -1 }`, which supports listing and counting a doctor's patients and the delete-restriction check.
- Email has no index. Search uses unanchored, case-insensitive regex, which cannot use a B-tree index anyway.
- `limit` is capped at 100. The doctor's patient list is capped at the newest 100, with the true total returned separately.

## Patient Management

### Features

- Patients list at `/patients`: debounced search (name, condition, email), searchable condition and doctor filters, created-date range, sorting (newest, oldest, name A–Z, name Z–A), and server-side pagination. Each row shows the assigned doctor with a link to their profile.
- Add and edit patients in a modal form. The assigned doctor is chosen from a searchable dropdown, and editing that field reassigns the patient. Validation runs in the browser first, and server errors appear next to the relevant field. The submit button is disabled while saving.
- Patient details at `/patients/:id`: name, condition, assigned doctor (linked), phone, email, created date, and last-updated time, with edit and delete actions.
- Deletion always asks for confirmation. Loading skeletons, empty states, error states with retry, toast notifications, and responsive layouts (table on desktop, cards on mobile) match the Doctors pages.
- `/patients?doctorId=<id>` opens the list filtered to one doctor. A doctor's page links to it ("View in Patients"), and each patient name on a doctor's page opens that patient's record.

### API reference

All endpoints require an authenticated admin session (`401` otherwise). `POST`, `PATCH`, and `DELETE` also reject untrusted browser origins with `403`.

| Method | Endpoint | Success | Purpose |
|---|---|---|---|
| `GET` | `/api/patients` | `200 { data, pagination }` | List, search, filter, sort, and paginate patients |
| `GET` | `/api/patients/filter-options` | `200 { data: { conditions, doctors } }` | Distinct conditions and the doctor list (up to 1000) for filters and the form |
| `GET` | `/api/patients/:id` | `200 { data }` | Patient details |
| `POST` | `/api/patients` | `201 { data }` | Create a patient (`doctorId` required) |
| `PATCH` | `/api/patients/:id` | `200 { data }` | Partial update. Changing `doctorId` reassigns the patient. `""` for `phone` or `email` clears that value. |
| `DELETE` | `/api/patients/:id` | `204` | Delete a patient |

List and detail responses add `doctor: { _id, name, specialization, hospital }` to each patient, filled in with a single batched `populate` per page. Errors use the shared shape `{ error, details? }`. Assigning a nonexistent doctor returns `400` with `details: [{ field: "doctorId", ... }]`. A missing patient returns `404`. Invalid IDs and invalid query parameters return `400`.

List query parameters: `page` (1–10000), `limit` (1–100, default 10), `search` (up to 100 characters, escaped, case-insensitive across name, condition, and email), `condition` (exact), `doctorId` (ObjectId), `dateFrom` and `dateTo` (`YYYY-MM-DD`, UTC, inclusive), and `sort` (`newest` by default, `oldest`, `name`, `name_desc`). Every sort uses `_id` as a tiebreaker.

### Patient schema

| Field | Rules |
|---|---|
| `name` | Required. Trimmed. Max 120 characters. |
| `condition` | Required. Trimmed. Max 200 characters. |
| `doctorId` | Required ObjectId reference to `Doctor`. Must point to an existing doctor on create and on reassignment. |
| `phone` | Optional. Same format as doctor phones (7–15 digits). |
| `email` | Optional. Valid format. Trimmed and lowercased. |
| `createdAt`, `updatedAt` | Mongoose timestamps. |

Indexes `{ doctorId: 1, createdAt: -1 }`, `{ condition: 1 }`, `{ name: 1 }`, and `{ createdAt: -1 }` already match the query patterns: doctor filtering and listing, the condition filter and its options, name sorts in both directions, and date sorts and ranges. No schema or index changes were needed.

### Consistency between Doctors and Patients

Both pages read the same `patients` collection, so a change made in one place shows up everywhere:

- The Module 4 nested endpoints (`/api/doctors/:id/patients`) still work and now call the same patient-creation and patient-deletion service as `/api/patients`, so both paths apply the same rules.
- Patients created from `/patients` appear under their doctor, and patients added from a doctor's page appear in `/patients`.
- Reassigning a patient changes only `doctorId`. The patient leaves the previous doctor's list and joins the new one.
- Deleting a patient removes it from both views. Doctor deletion is still blocked while patients are assigned (`409`).

## Development seed data

`backend/src/scripts/seedData.ts` fills a development database with fictional data, so you can try search, filters, date ranges, pagination, and the doctor–patient screens with realistic volume.

### What it creates

- **30 doctors** across 12 specializations and 8 fictional hospitals.
- **150 patients**, each assigned to a seeded doctor, with conditions that match the doctor's specialization. About 80% have a phone number and about 60% have an email.
- Patients per doctor vary from 0 to 14. Several doctors have none, which is useful for testing doctor deletion.
- `createdAt` dates spread over the previous 12 months. Each patient is created after their doctor.
- Every name, phone number (the fictional 555-01xx range), and email (the reserved `.example` domain) is fictional.

### Running it

Use a development database only (for example `doctor_tracker_dev`):

```bash
ALLOW_DEV_SEED=true npm run seed:data --prefix backend
# Optional: pin dates for byte-for-byte reproducible data
ALLOW_DEV_SEED=true SEED_REFERENCE_DATE=2026-11-11 npm run seed:data --prefix backend
```

The script prints how many doctors and patients it inserted and how many were already present. The first run reports `30 inserted` and `150 inserted`. Later runs report `0 inserted`.

### Idempotency and data safety

- **Stable identifiers.** Each seed record's `_id` is derived from a SHA-1 hash of a fixed key (for example `doctor-tracker-dev-seed:doctor:7`), so the same record always gets the same ID.
- **Insert-only writes.** Each record is written as an upsert keyed on `_id` with `$setOnInsert`. Missing records are inserted. Existing records, seeded or manually created, are never modified. Re-running never creates duplicates, and edits you make to seeded records are kept.
- **No deletes.** The script never deletes anything and only touches the `doctors` and `patients` collections. The admin account and `users` collection are never touched.
- **Deterministic generation.** A seeded pseudo-random generator produces the data, and dates are offsets from a reference day (today in UTC, or `SEED_REFERENCE_DATE`). The same reference day always produces identical records.
- **Validated before writing.** All records are checked against the Mongoose schemas before the database is touched. Patients are written only after every doctor they reference is confirmed to exist.

### Preventing production seeding

- The script refuses to run when `NODE_ENV=production`, even if `ALLOW_DEV_SEED=true`.
- It also refuses unless `ALLOW_DEV_SEED` is exactly `true`. Pass it inline as shown above rather than storing `true` in a shared environment file.
- Both checks run before any database connection is opened. Any failure, whether a guard, validation, or a database error, exits with code `1`.

### Removing seed data

The script intentionally has no delete mode. Seeded records are identified exactly by their deterministic IDs, which `seedObjectId("doctor" | "patient", n)` returns for doctors 1–30 and patients 1–150. Don't select seed records by email domain or `doctorId` alone. That could also match records you created manually, such as a patient you added under a seeded doctor. If you remove seeded doctors, first remove or reassign every patient that references them.

## Dashboard and analytics

### Overview

`/dashboard` shows live analytics computed from MongoDB:

- **Six statistic cards:** total doctors, total patients, new patients in the period, average patients per doctor, most common specialization, and most common condition. Each card is labelled **All time** or with the selected period. No growth percentages are shown, because the app has no comparison period to calculate them from.
- **Patient registrations:** an area chart of new patients per day, week, or month.
- **Patients per doctor:** a ranked horizontal bar chart of the 10 doctors with the most patients.
- **Patient conditions** and **Doctor specializations:** ranked horizontal bar charts of share, with the long tail folded into a gray "Other" bar.
- **Period selector:** Last 7 days, 30 days, 90 days, 12 months, or a custom range. One selector drives every period-based statistic, so all charts always use the same date range. The resolved dates are shown (for example "Oct 13 – Nov 11, 2026 (UTC)").
- **Every chart** has hover tooltips, a written summary for screen readers, a **Show table** toggle with exact values, a loading skeleton, an empty state, and an error state with **Retry**.

### Analytics API

All endpoints are `GET` requests and require an admin session (`401` otherwise). Invalid parameters return `400` with field details.

| Endpoint | Scope | Parameters | Returns |
|---|---|---|---|
| `/api/dashboard/summary` | Mixed (see below) | `period` or `from` + `to` | `{ data: { totalDoctors, totalPatients, newDoctors, newPatients, averagePatientsPerDoctor, topSpecialization, topCondition }, range, scope }` |
| `/api/dashboard/patient-trends` | Period | `period` or `from` + `to` | `{ data: [{ key, start, end, count }], total, range }` |
| `/api/dashboard/conditions` | Period | `period` or `from` + `to`, `limit` (1–20, default 8) | `{ data: [{ label, count, percentage }], total, categories, otherCategories, range }` |
| `/api/dashboard/patients-per-doctor` | All time | `limit` (1–50, default 10) | `{ data: [{ doctorId, name, specialization, patientCount }], meta: { totalDoctors, doctorsWithPatients, doctorsWithoutPatients } }` |
| `/api/dashboard/specializations` | All time | `limit` (1–20, default 10) | `{ data: [{ label, count, percentage }], total, categories, otherCategories }` |

### Date filtering

- **Periods:** `period` is `7d`, `30d` (the default), `90d`, or `12m`.
  - 7d, 30d and 90d mean the last N calendar days, including today.
  - 12m means the current month plus the previous 11.
- **Custom ranges:** use `from` and `to` (`YYYY-MM-DD`, both inclusive, at most 1830 days). You can't combine them with `period`, and you must provide both.
- **UTC everywhere.** A range runs from 00:00 UTC on the first day up to, but not including, 00:00 UTC after the last day, so nothing at a day boundary is counted twice or dropped.
- **Trend granularity:**
  - Daily for 7d, 30d, and custom ranges up to 31 days.
  - Weekly for 90d and custom ranges up to 183 days. Weeks start on Monday, and the first and last weeks are cut to the range.
  - Monthly for 12m and longer custom ranges.
  - Every period in the range is returned in date order, including ones with zero registrations.
- **What the period filters.** It applies to the record's own `createdAt`:
  - `newPatients`, registration trends, and conditions count patients registered in the period.
  - `newDoctors` counts doctors added in the period.
- **What the period does not filter.** Total doctors, total patients, average patients per doctor, top specialization, top condition, patients per doctor, and specializations describe current records, so they always cover all time. The **patients per doctor** chart shows each doctor's current caseload, not patients registered in the period.

### How the statistics are calculated

The browser never downloads collections to count them. Each statistic is a count query or a MongoDB aggregation pipeline, and only small chart-ready results are returned (at most about 60 trend periods or 50 rows).

- **Totals and period counts** use `countDocuments`. Period counts use the `createdAt` indexes.
- **Trends:** `$match` on `createdAt` (indexed), then `$group` by `$dateTrunc` (day, week starting Monday, or month, in UTC). The server fills in missing periods with zero so the browser receives a complete, ordered series.
- **Patients per doctor:** `$group` patients by `doctorId`, then a single `$lookup` to fetch doctor names and specializations, then sort and limit inside a `$facet` that also counts how many doctors have patients. That makes one round trip with no extra query per doctor. Patients whose doctor no longer exists are skipped. If fewer than `limit` doctors have patients, doctors with zero patients fill the remaining rows.
- **Specializations and conditions** share one pipeline. Labels are trimmed and grouped case-insensitively for counting only; stored records are never changed. Missing or non-text values count as "Unspecified". A `$facet` returns the top N groups and the totals together, and the server adds an "Other" row so the shares add up to the whole.
- **Empty data:** averages and percentages fall back to 0 when the total is 0, so an empty database renders empty states rather than errors.
- **Requirements:** `$dateTrunc` and `$lookup` with both `localField` and `pipeline` need MongoDB 5.0 or later. Atlas currently runs 8.0.
- **Indexes:** the existing `createdAt`, `{ doctorId: 1, createdAt: -1 }`, `specialization`, and `condition` indexes already support these queries, so none were added. Grouping all patients by doctor or condition reads every patient once. That is fine at this scale; much larger datasets would call for pre-computed counts or Atlas Charts.

### Chart choices

- **Trend:** an area chart, because it shows change over time. The y-axis starts at zero and uses whole numbers, so differences aren't exaggerated.
- **Patients per doctor, specializations, and conditions:** ranked horizontal bars rather than donuts. With 12 or more specializations and 50 or more conditions, bar length compares far more accurately than slice angle, and long names fit on the axis.
- **Color:** each chart shows a single series, so one teal carries the data and "Other" is neutral gray rather than an extra category color. Text uses the normal slate text colors. The grid lines are faint solid lines, and the bars have rounded ends.
- **Small screens:** the cards stack into one column, period buttons use short labels (7D, 30D, …), and long doctor names are shortened. The page never scrolls sideways.

### Frontend data flow

- **Five parallel requests.** The dashboard calls the five relative `/api/dashboard/*` endpoints at once through the same-origin proxy, so the session cookie is included. A 401 redirects to `/login`. If one endpoint fails, only that card shows an error and a Retry button.
- **Request cache per visit.** Identical requests are shared, so returning to a period you already viewed is instant. Patients per doctor and specializations don't depend on the period, so changing it doesn't refetch them. Failed requests are never cached. **Refresh** clears the cache, and each new visit to the dashboard starts with fresh data.
- **Changing the period** keeps the last good data on screen with an "Updating…" indicator. If you click through periods quickly, a slow, older response is ignored rather than overwriting your newer selection. Chart data transforms are memoized.

## UI architecture, accessibility, and performance

### Shared UI structure

```text
frontend/src/components/
├── layout/   AppSidebar (desktop ≥1024px), AppHeader + MobileNavigation (drawer below 1024px),
│             NavLinks, UserPanel, PageHeader + Breadcrumbs
├── ui/       Button, Modal, ConfirmDialog, SelectMenu (pick-from-list), ComboboxInput (type or pick),
│             Pagination, EmptyState/LoadError,
│             Toast, BreakableEmail, useFocusTrap
├── auth/     AuthGuard, LoginForm, LogoutButton, ProtectedShell (the authenticated frame)
└── doctors/ patients/ dashboard/   feature components built on the pieces above
```

- **No native browser dropdowns.** Filters use `SelectMenu`. Form fields that suggest existing values but accept new ones (doctor specialization and hospital, patient condition) use `ComboboxInput`, an ARIA combobox with a styled suggestion list.
- **One button system.** `Button` has `primary`, `secondary`, `danger`, `danger-outline`, `ghost`, and `dark` variants, consistent focus rings, disabled and loading states (`aria-busy`), and defaults to `type="button"`.
- **Every page** uses `PageHeader` (eyebrow, `h1`, description, action). Details pages use breadcrumbs.
- **Lists:** cards on phones, tablets, and small desktops, in a 2-column grid from 640px. The full data table appears only from 1280px, where its five columns have room. Long emails wrap after `@` and `.` instead of mid-word.

### Accessibility (WCAG 2.2 AA practices)

- **Skip link and landmarks.** A "Skip to main content" link, a labelled main navigation with `aria-current="page"`, one `h1` per page, and correct heading order. The dashboard statistic cards sit under an `h2`.
- **Dialogs and the mobile drawer.** Focus moves inside and is trapped (Tab and Shift+Tab wrap), Escape closes, focus returns to the control that opened it, and page scroll is locked. Destructive actions always confirm, and failures are announced inside the dialog.
- **Forms.**
  - Visible labels, `aria-invalid`, and errors linked with `aria-describedby`. Focus moves to the first invalid field.
  - The login form adds a password toggle with `aria-pressed` and a Caps Lock hint.
  - Custom dropdowns include their visible value in their accessible name.
- **Keyboard.** The period selector follows the radio-group pattern: arrow keys, Home and End, with only the selected option in the tab order.
- **Touch targets** are at least 24×24px. Buttons and navigation items are 36–44px.
- **Color contrast.** Body and secondary text meet 4.5:1. Light gray is used only for decorative icons and placeholders.
- **Automated checks.** `axe-core` runs in the test suite against the shell, login (including its error state), Doctors, Patients (including an open dialog with errors), and the dashboard. Color contrast is checked in the browser by Lighthouse, because jsdom does not compute styles.

### Sessions

- **Without a session:** a protected page redirects to `/login?next=<page>`.
- **Already signed in:** opening `/login` redirects to `/dashboard` in the route proxy, so there is no client-side session request and no console 401.
- **Session expires** (any API `401`): the stale HttpOnly cookie is cleared through `/api/auth/logout`, then the user goes to `/login?expired=1&next=<page>`. Login shows a "session expired" notice and returns to that page.
- **Safe redirects:** only same-site relative `next` paths are accepted.
- **Network failure** while checking the session: the user sees a retry screen instead of being signed out.

### Frontend performance

- **Recharts is lazy-loaded and drawn on demand.** It lives in its own chunk (`next/dynamic`), and each chart draws only when it comes within 200px of the viewport. Card headers, summaries, table views, and statistic cards never wait for it.
- **Lists:** search is debounced (350 ms), and superseded requests are cancelled with `AbortController`, so stale responses can't overwrite newer results. Each mutation refetches only the current page and the filter options.
- **Dashboard:** a request cache scoped to each visit, and memoized chart transforms.

Measured with Lighthouse 12.6.1 (mobile preset, local production build, same backend and data). The dashboard figures are medians of 3 runs; "Before" is commit `f311e01`.

| Route | Metric | Before | After |
|---|---|---|---|
| `/dashboard` | Performance / Accessibility | 96 / 94 | **99 / 100** |
| `/dashboard` | Total Blocking Time | 87 ms | **51 ms** |
| `/dashboard` | Largest Contentful Paint | 2.64 s | **1.97 s** |
| `/dashboard` | JS transferred | 276 KB | **151 KB** |
| `/dashboard` | Page-specific JS (gzip) | 131.1 KB | **17.1 KB** |
| `/doctors`, `/patients` | JS transferred | 276 / 283 KB | **163 / 165 KB** |
| `/doctors`, `/patients` | Accessibility | 96 / 96 | **100 / 100** |
| `/login` | Best practices (console 401 removed) | 96 | **100** |

### Production CSS fix

`next build --webpack` (the production build) was shipping almost no Tailwind utilities. Tailwind was wired up only through a Turbopack-specific loader, so it worked in `next dev` but not in the webpack build. It now uses the standard `@tailwindcss/postcss` plugin (`frontend/postcss.config.mjs`), which both dev and build use. Production CSS now contains every utility.

### Database query optimization

Every list sort ends with an `_id` tiebreaker so pages are stable, and a single-field sort index cannot serve that sort. `explain()` showed the default Doctors and Patients lists doing a full collection scan plus an in-memory sort on every page load. The sort indexes now include `_id`: `{ createdAt: -1, _id: -1 }` and `{ name: 1, _id: 1 }` on both collections, plus `{ doctorId: 1, createdAt: -1, _id: -1 }` on patients. Each list page now reads only the 10 index entries and 10 documents it returns.

Filters use the `specialization`, `hospital`, `condition`, and `doctorId` indexes. Dashboard period counts use `COUNT_SCAN`, and `distinct(doctorId)` uses `DISTINCT_SCAN`.

Mongoose creates the new indexes automatically and never drops old ones. These Atlas indexes are now redundant and can be removed manually, which does not affect any data:

```js
// mongosh, connected to the development database
db.doctors.dropIndexes(["name_1", "createdAt_-1", "email_1"]);
db.patients.dropIndexes(["name_1", "createdAt_-1", "doctorId_1_createdAt_-1"]);
```

## Validation

```bash
npm run typecheck --prefix backend   # also type-checks the Vercel entry (backend/api) via tsconfig.api.json
npm run build --prefix backend
npm test --prefix backend
npm run lint --prefix frontend
npx --prefix frontend tsc --noEmit -p frontend
npm run build --prefix frontend
npm test --prefix frontend
bash -n run.sh
```

Unit and integration tests use mocks and never connect to or modify MongoDB Atlas.

### End-to-end tests (Playwright)

`e2e/` contains a browser workflow test that uses your installed Google Chrome, so no browser download is needed. It walks through the whole admin workflow in a real browser: log in, dashboard, create two doctors, search, open details, add a patient, search on the Patients page, edit and reassign the patient, verify the new relationship, delete the patient and both doctors, log out, and confirm protected pages and APIs are no longer reachable.

It creates only records tagged `[E2E <run id>]` and deletes them, including in a cleanup step if any step fails. Seed and manually created records are never touched. Run it against a running app connected to a **development** database:

```bash
npm install --prefix e2e
E2E_ADMIN_EMAIL=... E2E_ADMIN_PASSWORD=... E2E_BASE_URL=http://localhost:3000 npm test --prefix e2e
```

Without the two credential variables, the test is skipped.

- Backend (`backend/src/*.test.ts`): authentication; dashboard security (`401` on every endpoint), query validation (period, custom range, limit), UTC range resolution, day, week, and month buckets with zero-filling, date order and boundaries, summary math including the empty database, patients per doctor including doctors with zero patients, specialization and condition distributions, and aggregation failures; patient API security, validation, CRUD, reassignment, nonexistent-doctor rejection, query construction, database-error masking, consistency between doctors and patients, and the patient filters run against the generated seed data; development seed generation, safety guards, and idempotency; plus doctor API security (`401` on every endpoint, untrusted-origin `403`, no leaked database errors), validation, CRUD, query construction (escaped search, exact filters, UTC date range, sort, pagination math), patient association, cross-doctor delete protection, and the restrict-on-delete policy.
- Frontend (`frontend/src/components/**/*.test.tsx`): app shell, mobile drawer, and focus traps; axe-core page audits; the route proxy, session-expiry redirects, and safe `next` handling; out-of-order list responses, paging back after a deletion, and refresh after reassignment; login flow; dashboard statistic cards, loading, empty, and error states, per-chart retry, period and custom-range selection, ignored stale responses, the request cache, chart rendering, table views, response transforms, 401 and 403 handling, and small-screen layout; patient list, search, filters (including searching the doctor list), pagination, create and edit forms, doctor selection and reassignment, delete confirmation, details page, and loading, empty, and error states; the custom dropdown component; plus doctor list rendering, loading, empty, and error states, debounced search, filters, invalid date range, pagination, form validation, create and edit, prevention of duplicate submissions, delete confirmation and conflicts, and details page patient add and remove.

### Manually checking doctor management

Use a development database (for example `doctor_tracker_dev`), never production. Start the app with `./run.sh`, sign in, then:

1. Open **Doctors**, add a doctor, and confirm it appears in the list and in Atlas.
2. Search, filter, sort, and page through the list. A start date after the end date shows an inline message and sends no request.
3. Open a doctor, add a patient, remove it (with confirmation), and confirm the patient count updates.
4. Try to delete a doctor who has patients. You should see the `409` message.
5. Run `curl -i http://localhost:5000/api/doctors` without a cookie. It should return `401`.

### Manually checking patient management

1. Run `ALLOW_DEV_SEED=true npm run seed:data --prefix backend` (safe to repeat), then open **Patients**. You should see at least 150 patients across 15 pages.
2. Search, filter by condition, doctor, and date, change the sort, and page through the list.
3. Add a patient, then open the assigned doctor and confirm the patient is listed there.
4. Edit the patient and change the assigned doctor. Confirm the patient moved from the old doctor's page to the new one.
5. Delete the patient and confirm it is gone from both pages.

### Manually checking the dashboard

1. Seed the development database if needed (`ALLOW_DEV_SEED=true npm run seed:data --prefix backend`), start `./run.sh`, and open **Dashboard**.
2. Compare Total doctors and Total patients with the Doctors and Patients pages. Records you added by hand make these higher than 30 and 150.
3. Switch between 7 days, 30 days, 90 days, and 12 months. "New patients", the trend, and the conditions chart change; the "All time" cards stay the same.
4. Use **Show table** on any chart to see exact values, then resize the window to phone width.

## Known limitations

- Search is an unanchored regex across four fields, so it scans documents. This is fine at assessment scale. A larger dataset would call for Atlas Search or a normalized, prefix-indexed search field.
- Specialization and hospital filters are exact and case-sensitive. Values that differ only in case (for example "cardiology" and "Cardiology") appear as separate options.
- Offset pagination (`skip`) slows down on very deep pages. Cursor pagination would be the next step for large collections.
- The doctor delete restriction and patient creation each check, then write, without a transaction. A concurrent request between the two steps could still cause a rare inconsistency. Multi-document transactions would close that gap.
- A doctor's details page lists their newest 100 patients. "View all" opens `/patients` filtered to that doctor.
- The patient form and doctor filter load up to 1000 doctors. Beyond that, a server-side doctor search endpoint would be needed.
- Patient search is an unanchored regex across name, condition, and email, with the same scaling caveat as doctor search.
- Seeded `createdAt` dates are fixed when records are first inserted, because the seed never modifies existing records. As time passes, the 7-day and 30-day dashboard views will gradually empty. Refreshing them would mean deleting the seeded records by their deterministic IDs (only where they haven't been edited) and seeding again. That isn't automated, on purpose, because it deletes data.
- Redundant indexes left over from earlier versions (`email_1` and the old single-field sort indexes) stay in Atlas until dropped manually (see "Database query optimization").
- Doctor and Patient filters and the current page are kept in component state, not the URL. The exception is the `?doctorId=` link into Patients.
- Dashboard statistics are recomputed for each request (with a per-visit browser cache). There is no server-side cache or pre-computed counts, which very large datasets would need.
- No period-over-period comparison is shown, so the dashboard reports no growth percentages.
- Rounded percentages can add up to slightly more or less than 100% (for example 100.3%).
- Patient creation and reassignment check that the doctor exists, then write. A doctor deleted between those two steps could leave a dangling reference, which the UI shows as "Unassigned".
- Login rate limits and the absence of JWT revocation are per-instance and in-memory (see "Authentication architecture").
- The Content-Security-Policy covers framing, `base-uri`, `form-action`, and `object-src`. A full `script-src` policy would need per-request nonces for Next.js inline scripts.
- API responses are `Cache-Control: no-store`, and `/patients` is rendered per request. Pages showing patient data therefore don't enter the browser's back/forward cache, which is deliberate for health data.
- Development-only tooling (ESLint's `minimatch`) has a moderate `npm audit` advisory whose only fix is a breaking `--force` upgrade. It is not part of any production bundle; `npm audit --omit=dev` reports 0 vulnerabilities.

Validate the local launcher with `bash -n run.sh`, then use `./run.sh`. Confirm `http://localhost:5000/health` returns `200` and an unauthenticated request to `http://localhost:5000/api/auth/me` returns `401`.

## Troubleshooting

- Missing environment error: create the local files from their `.env.example` templates and fill every required value.
- MongoDB timeout: confirm the Atlas URI, database user permissions, and network access list.
- Port already in use: `run.sh` names the busy port. Stop that process, or run `BACKEND_PORT=5001 FRONTEND_PORT=3001 ./run.sh` (and point `API_PROXY_TARGET` at the new backend port).
- Login rejected: run the seed command and confirm `ADMIN_EMAIL` matches the normalized account email.
- Cookie absent in production: confirm both projects use HTTPS, `API_PROXY_TARGET` points to the backend, and `CORS_ORIGIN` matches the frontend origin.

## Production architecture

The browser talks only to the Next.js origin. Next.js rewrites `/api/*` to the separate Express Vercel deployment, so the session cookie is set on, and sent to, the frontend origin only. The backend Vercel handler (`backend/api/index.ts`) reuses a cached Atlas connection before handing each request to Express. Configure all production secrets in Vercel project settings; never upload local environment files. A shared external rate-limit store is recommended for distributed production enforcement.

### Production deployment prerequisites (for Module 9; not yet verified on Vercel)

- **Two Vercel projects** from this repository: root directory `backend` (Express as a Vercel Function via `api/index.ts` and `vercel.json`), and root directory `frontend` (Next.js; build command `npm run build`).
- **Backend environment:**
  - `NODE_ENV=production` (makes the cookie `Secure`).
  - `MONGODB_URI` (production database, backend only).
  - `JWT_SECRET` (a new random value of at least 32 characters, different from local).
  - `JWT_EXPIRES_IN`.
  - `CORS_ORIGIN` (the frontend's production origin).
  - `ADMIN_EMAIL` and `ADMIN_PASSWORD`, needed only when running the admin seed.
  - Never set `ALLOW_DEV_SEED` in production.
- **Frontend environment:** `API_PROXY_TARGET`, the backend's production URL.
- **MongoDB Atlas network access** must allow Vercel's egress. Vercel Functions have no fixed IPs on standard plans, so this usually means `0.0.0.0/0` with a strong database password and a least-privilege database user, or Vercel's static-IP option.
- **Seed the production admin once:** run `npm run seed --prefix backend` with the production variables from a trusted machine. Don't run the development data seed against production.
- **Nothing depends on local state:** authentication is a stateless JWT cookie with no session store, and nothing is written to the local filesystem.
- **To verify after deploying:** that the cookie arrives through the frontend proxy, that `X-Forwarded-For` reaches the backend as expected, and the security headers and CORS from the deployed origins.

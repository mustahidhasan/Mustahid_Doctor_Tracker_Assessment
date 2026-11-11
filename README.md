# Doctor Tracker

A Next.js administration frontend and Express/MongoDB backend for managing healthcare data.

## Technology stack

- Frontend: Next.js 16, React 19, TypeScript, Tailwind CSS, and Recharts
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

Login and logout requests reject untrusted browser origins. Login is limited to 10 failed attempts per 15 minutes and requests are limited to 16 KB. The included rate limiter is an in-memory local safeguard; Vercel instances do not share its state. For stronger production enforcement, add a shared Redis/KV-backed limiter at the platform edge.

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

   The runner validates required configuration without printing values, installs missing dependencies, starts ports 3000 and 5000, and stops both process trees on Ctrl+C or an unexpected application exit. To run services separately, use `npm run dev --prefix backend` and `npm run dev --prefix frontend`.

6. Visit `http://localhost:3000/login`.

## Environment variables

Backend: `NODE_ENV`, `PORT`, `MONGODB_URI`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `CORS_ORIGIN`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD`. Optional, for development seeding only: `ALLOW_DEV_SEED` and `SEED_REFERENCE_DATE`.

Frontend: `API_PROXY_TARGET` (defaults locally to `http://localhost:5000`). On Vercel, set it to the separately deployed backend URL and set backend `CORS_ORIGIN` to the frontend origin. Production cookies automatically use `Secure`.

## MongoDB

The backend reads `MONGODB_URI` and connects through `backend/src/config/db.ts`. Local startup fails safely when the URI is missing or Atlas is unavailable. The seed command uses the same connection, creates only a missing administrator, and always closes its connection. Add the current machine or deployment egress address to the Atlas network access list as needed.

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

## Validation

```bash
npm run typecheck --prefix backend
npm run build --prefix backend
npm test --prefix backend
npm run lint --prefix frontend
npm run build --prefix frontend
npm test --prefix frontend
```

Tests use mocks and do not connect to or modify MongoDB Atlas.

- Backend (`backend/src/*.test.ts`): authentication; dashboard security (`401` on every endpoint), query validation (period, custom range, limit), UTC range resolution, day, week, and month buckets with zero-filling, date order and boundaries, summary math including the empty database, patients per doctor including doctors with zero patients, specialization and condition distributions, and aggregation failures; patient API security, validation, CRUD, reassignment, nonexistent-doctor rejection, query construction, database-error masking, consistency between doctors and patients, and the patient filters run against the generated seed data; development seed generation, safety guards, and idempotency; plus doctor API security (`401` on every endpoint, untrusted-origin `403`, no leaked database errors), validation, CRUD, query construction (escaped search, exact filters, UTC date range, sort, pagination math), patient association, cross-doctor delete protection, and the restrict-on-delete policy.
- Frontend (`frontend/src/components/**/*.test.tsx`): login flow; dashboard statistic cards, loading, empty, and error states, per-chart retry, period and custom-range selection, ignored stale responses, the request cache, chart rendering, table views, response transforms, 401 and 403 handling, and small-screen layout; patient list, search, filters (including searching the doctor list), pagination, create and edit forms, doctor selection and reassignment, delete confirmation, details page, and loading, empty, and error states; the custom dropdown component; plus doctor list rendering, loading, empty, and error states, debounced search, filters, invalid date range, pagination, form validation, create and edit, prevention of duplicate submissions, delete confirmation and conflicts, and details page patient add and remove.

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
- Filters and page live in component state, not the URL, so a refresh resets them.
- A doctor's details page lists their newest 100 patients. "View all" opens `/patients` filtered to that doctor.
- The patient form and doctor filter load up to 1000 doctors. Beyond that, a server-side doctor search endpoint would be needed.
- Patient search is an unanchored regex across name, condition, and email, with the same scaling caveat as doctor search.
- Seeded `createdAt` dates are fixed when records are first inserted, because the seed never modifies existing records. As time passes, the 7-day and 30-day dashboard views will gradually empty. Refreshing them would mean deleting the seeded records by their deterministic IDs (only where they haven't been edited) and seeding again. That isn't automated, on purpose, because it deletes data.
- `run.sh` stops everything with Ctrl+C. If only the `run.sh` process is sent `SIGTERM` from outside a terminal, the dev servers it started can keep running.
- An `email_1` index left over from an early draft may exist on `doctors` in Atlas. The schema no longer defines it and no query uses it. It is harmless and can be dropped manually.
- Dashboard statistics are recomputed for each request (with a per-visit browser cache). There is no server-side cache or pre-computed counts, which very large datasets would need.
- No period-over-period comparison is shown, so the dashboard reports no growth percentages.
- Rounded percentages can add up to slightly more or less than 100% (for example 100.3%).
- Patient creation and reassignment check that the doctor exists, then write. A doctor deleted between those two steps could leave a dangling reference, which the UI shows as "Unassigned".

Validate the local launcher with `bash -n run.sh`, then use `./run.sh`. Confirm `http://localhost:5000/health` returns `200` and an unauthenticated request to `http://localhost:5000/api/auth/me` returns `401`.

## Troubleshooting

- Missing environment error: create the local files from their `.env.example` templates and fill every required value.
- MongoDB timeout: confirm the Atlas URI, database user permissions, and network access list.
- Port already in use: stop the process using port 3000 or 5000 before launching.
- Login rejected: run the seed command and confirm `ADMIN_EMAIL` matches the normalized account email.
- Cookie absent in production: confirm both projects use HTTPS, `API_PROXY_TARGET` points to the backend, and `CORS_ORIGIN` matches the frontend origin.

## Production architecture

The browser talks only to the Next.js origin. Next.js rewrites `/api/*` to the separate Express Vercel deployment, preserving the session cookie response. The backend Vercel handler connects to Atlas before serving API requests. Configure all production secrets in Vercel project settings; do not upload local environment files. A shared external rate-limit store is recommended for distributed production enforcement.

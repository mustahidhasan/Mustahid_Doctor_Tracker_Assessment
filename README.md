# Doctor Tracker

A Next.js administration frontend and Express/MongoDB backend for managing healthcare data.

## Technology stack

- Frontend: Next.js 16, React 19, TypeScript, and Tailwind CSS
- Backend: Node.js, Express 5, TypeScript, Zod, JWT, and bcrypt
- Database: MongoDB Atlas with Mongoose
- Deployment: separate frontend and backend Vercel projects

## Project structure

```text
backend/    Express API, MongoDB models, authentication, doctor management API, seed script, and tests
frontend/   Next.js application, login UI, protected routes, doctor management UI, and tests
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

- Backend (`backend/src/*.test.ts`): authentication; patient API security, validation, CRUD, reassignment, nonexistent-doctor rejection, query construction, database-error masking, consistency between doctors and patients, and the patient filters run against the generated seed data; development seed generation, safety guards, and idempotency; plus doctor API security (`401` on every endpoint, untrusted-origin `403`, no leaked database errors), validation, CRUD, query construction (escaped search, exact filters, UTC date range, sort, pagination math), patient association, cross-doctor delete protection, and the restrict-on-delete policy.
- Frontend (`frontend/src/components/**/*.test.tsx`): login flow; patient list, search, filters (including searching the doctor list), pagination, create and edit forms, doctor selection and reassignment, delete confirmation, details page, and loading, empty, and error states; the custom dropdown component; plus doctor list rendering, loading, empty, and error states, debounced search, filters, invalid date range, pagination, form validation, create and edit, prevention of duplicate submissions, delete confirmation and conflicts, and details page patient add and remove.

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

## Known limitations

- Search is an unanchored regex across four fields, so it scans documents. This is fine at assessment scale. A larger dataset would call for Atlas Search or a normalized, prefix-indexed search field.
- Specialization and hospital filters are exact and case-sensitive. Values that differ only in case (for example "cardiology" and "Cardiology") appear as separate options.
- Offset pagination (`skip`) slows down on very deep pages. Cursor pagination would be the next step for large collections.
- The doctor delete restriction and patient creation each check, then write, without a transaction. A concurrent request between the two steps could still cause a rare inconsistency. Multi-document transactions would close that gap.
- Filters and page live in component state, not the URL, so a refresh resets them.
- A doctor's details page lists their newest 100 patients. "View all" opens `/patients` filtered to that doctor.
- The patient form and doctor filter load up to 1000 doctors. Beyond that, a server-side doctor search endpoint would be needed.
- Patient search is an unanchored regex across name, condition, and email, with the same scaling caveat as doctor search.
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

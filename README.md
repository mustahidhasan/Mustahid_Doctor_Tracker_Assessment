# Doctor Tracker

Admin app for managing doctors, their patients, and a live analytics dashboard.

- **Frontend:** Next.js 16, TypeScript, Tailwind CSS (`frontend/`)
- **Backend:** Express, TypeScript, MongoDB Atlas via Mongoose (`backend/`)
- **Auth:** JWT in an HttpOnly cookie. The browser only talks to Next.js, which proxies `/api/*` to Express.

## Prerequisites

- Node.js 20+ and npm
- A MongoDB Atlas cluster with a **development** database, and your IP on the Atlas network access list

## Setup

1. **Create the env files** from the templates:

   ```bash
   cp backend/.env.example backend/.env
   cp frontend/.env.example frontend/.env.local
   ```

2. **Fill in `backend/.env`:**

   | Variable | Value |
   |---|---|
   | `MONGODB_URI` | Your Atlas connection string, pointing at a dev database (e.g. `.../doctor_tracker_dev`) |
   | `JWT_SECRET` | A random string of 32+ characters (e.g. `openssl rand -base64 48`) |
   | `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Your login. The password needs 12+ characters. |

   Keep the defaults for everything else. `frontend/.env.local` already points to `http://localhost:5000`.

3. **Install dependencies and create the admin account:**

   ```bash
   npm install --prefix backend && npm install --prefix frontend
   npm run seed --prefix backend
   ```

4. **Optional: load sample data** (30 doctors, 150 patients, safe to re-run):

   ```bash
   ALLOW_DEV_SEED=true npm run seed:data --prefix backend
   ```

5. **Run the app:**

   ```bash
   ./run.sh
   ```

   Open http://localhost:3000 and sign in with `ADMIN_EMAIL` / `ADMIN_PASSWORD`. Press Ctrl+C to stop both servers.

## Common commands

| Task | Command |
|---|---|
| Backend tests / types / build | `npm test --prefix backend` · `npm run typecheck --prefix backend` · `npm run build --prefix backend` |
| Frontend tests / lint / build | `npm test --prefix frontend` · `npm run lint --prefix frontend` · `npm run build --prefix frontend` |
| End-to-end test (needs the app running) | `npm install --prefix e2e`, then `E2E_ADMIN_EMAIL=... E2E_ADMIN_PASSWORD=... npm test --prefix e2e` |
| Run the services separately | `npm run dev --prefix backend` and `npm run dev --prefix frontend` |

Unit tests are mocked and never touch the database.

## Troubleshooting

- **"port already in use":** stop whatever is running on 3000 or 5000, or run `BACKEND_PORT=5001 FRONTEND_PORT=3001 ./run.sh` and set `API_PROXY_TARGET` to match.
- **MongoDB timeout:** check the URI, the database user's permissions, and the Atlas IP access list.
- **Login rejected:** run `npm run seed --prefix backend`, and check that `ADMIN_EMAIL` is the address you're typing.

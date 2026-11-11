# Doctor Tracker

A Next.js administration frontend and Express/MongoDB backend for managing healthcare data.

## Technology stack

- Frontend: Next.js 16, React 19, TypeScript, and Tailwind CSS
- Backend: Node.js, Express 5, TypeScript, Zod, JWT, and bcrypt
- Database: MongoDB Atlas with Mongoose
- Deployment: separate frontend and backend Vercel projects

## Project structure

```text
backend/    Express API, MongoDB models, authentication, seed script, and tests
frontend/   Next.js application, login UI, protected routes, and tests
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

Backend: `NODE_ENV`, `PORT`, `MONGODB_URI`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `CORS_ORIGIN`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD`.

Frontend: `API_PROXY_TARGET` (defaults locally to `http://localhost:5000`). On Vercel, set it to the separately deployed backend URL and set backend `CORS_ORIGIN` to the frontend origin. Production cookies automatically use `Secure`.

## MongoDB

The backend reads `MONGODB_URI` and connects through `backend/src/config/db.ts`. Local startup fails safely when the URI is missing or Atlas is unavailable. The seed command uses the same connection, creates only a missing administrator, and always closes its connection. Add the current machine or deployment egress address to the Atlas network access list as needed.

## Authentication API

- `POST /api/auth/login` validates credentials and creates the cookie session.
- `GET /api/auth/me` returns the sanitized active administrator or `401`.
- `POST /api/auth/logout` clears the session cookie.

Protected frontend routes are `/dashboard`, `/doctors`, and `/patients`. Cookie presence is checked before rendering and the backend independently validates the session; frontend guards are not treated as API authorization.

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

Validate the local launcher with `bash -n run.sh`, then use `./run.sh`. Confirm `http://localhost:5000/health` returns `200` and an unauthenticated request to `http://localhost:5000/api/auth/me` returns `401`.

## Troubleshooting

- Missing environment error: create the local files from their `.env.example` templates and fill every required value.
- MongoDB timeout: confirm the Atlas URI, database user permissions, and network access list.
- Port already in use: stop the process using port 3000 or 5000 before launching.
- Login rejected: run the seed command and confirm `ADMIN_EMAIL` matches the normalized account email.
- Cookie absent in production: confirm both projects use HTTPS, `API_PROXY_TARGET` points to the backend, and `CORS_ORIGIN` matches the frontend origin.

## Production architecture

The browser talks only to the Next.js origin. Next.js rewrites `/api/*` to the separate Express Vercel deployment, preserving the session cookie response. The backend Vercel handler connects to Atlas before serving API requests. Configure all production secrets in Vercel project settings; do not upload local environment files. A shared external rate-limit store is recommended for distributed production enforcement.

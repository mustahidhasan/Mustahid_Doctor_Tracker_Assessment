# Doctor Tracker

Next.js frontend (`frontend/`) and Express + MongoDB backend (`backend/`). Requires Node.js 22.

## Setup

```bash
cp backend/.env.example backend/.env          # set MONGODB_URI, JWT_SECRET (32+ chars), ADMIN_EMAIL, ADMIN_PASSWORD
cp frontend/.env.example frontend/.env.local
npm install --prefix backend && npm install --prefix frontend
npm run seed --prefix backend                  # create the admin account
ALLOW_DEV_SEED=true npm run seed:data --prefix backend   # optional sample data
```

## Run

```bash
./run.sh            # http://localhost:3000, Ctrl+C to stop
```

## Test

```bash
npm test --prefix backend && npm test --prefix frontend
```

## Deploy (Vercel)

One-time setup:
1. Create two Vercel projects from this repo:
   - `doctor-tracker-api`: Root Directory `backend`, Framework Preset **Other**, everything else default
   - `doctor-tracker-web`: Root Directory `frontend`, Framework Preset **Next.js**
2. Set the environment variables in Vercel:
   - api project: `MONGODB_URI`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `CORS_ORIGIN` (the frontend URL)
   - web project: `API_PROXY_TARGET` (the backend URL)
3. Link the folders, then create the production admin:

   ```bash
   npm install -g vercel && vercel login
   vercel link --cwd backend --project doctor-tracker-api
   vercel link --cwd frontend --project doctor-tracker-web
   ./deploy.sh seed-admin
   ```

Deploy:

```bash
./deploy.sh preview      # or: ./deploy.sh production
```

# Dental Shadowing Map

This project is a React + Express + SQLite web app for pre-dental students in
the University of Washington Tacoma region. It includes an authenticated clinic
directory, a shadowing tracker, and AADSAS-friendly export tooling.

## Features

- Map centered on UW Tacoma with clinic pins
- Status color coding (available / mixed / unavailable / pending)
- Verified `.edu` sign-in with email verification
- Add Clinic or Suggest Update form (authenticated)
- Clinic directory with ZIP + radius filters
- Shadowing projects/sessions tracker with CSV export

## Tech Stack

- React + Vite
- React Leaflet (OpenStreetMap tiles)
- SQLite + Express (local API)
- Plain CSS

## Getting Started

```bash
npm install
npm run dev
```

Start the SQLite API server in another terminal:

```bash
npm run dev:server
```

Seed the database once (optional):

```bash
node server/seed.js
```

Or run everything together (seed + server + web):

```bash
npm run dev:all
```

Run auth smoke checks against a running API server:

```bash
npm run test:smoke:auth
```

Optional: point tests to a different server URL.

```bash
SMOKE_BASE_URL=http://localhost:3000 npm run test:smoke:auth
```

SQLite database file:

- `server/shadowing.db`

## Notes

- The API server runs on `http://localhost:3000` by default.
- Vite dev server runs on `http://localhost:5173` and proxies `/api` to the API server.
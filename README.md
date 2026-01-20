# Dental Shadowing Map (MVP)

This project is a simple, login-free MVP for a dental shadowing map near
University of Washington Tacoma. It lets students view clinics, submit new
clinics or updates, and store data in a local SQLite database.

## Features

- Map centered on UW Tacoma with clinic pins
- Status color coding (available / mixed / unavailable / pending)
- Add Clinic or Suggest Update form
- Clinic directory with ZIP + radius filters

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

SQLite database file:

- `server/shadowing.db`

## Notes

- The API runs on `http://localhost:5174` and Vite proxies `/api`.
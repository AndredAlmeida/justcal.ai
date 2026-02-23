# justcalendar.ai

A single-page infinite scrolling calendar built with Vite and vanilla JavaScript.

## Features

- Infinite month timeline with lazy-loading in both directions.
- Multiple calendar types: `Semaphore`, `Score`, `Check`, and `Notes`.
- Score calendar supports `Number`, `Heatmap`, and `Number + Heatmap` display modes.
- Notes calendar includes inline previews, delayed hover preview, and focused day editor.
- Calendar management UI with add, edit, and delete flows (with duplicate-name guard and delete confirmation).
- Pinning system with animated reorder, max 3 pins, and pinned chips shown in the header.
- Theme system with 5 themes (`Dark`, `Tokyo Night Storm`, `Solarized Dark`, `Solarized Light`, `Light`).
- Day interaction supports selection, optional pan/zoom + expansion behavior, and keyboard `Esc` close.
- Developer controls for zoom, expansion, and background fade tuning (`P` shortcut + mobile toggle).
- State persistence via `localStorage` for calendars, day values, theme, and tuning controls.

## Tech Stack

- Vite 5
- Vanilla JavaScript (ES modules)
- HTML + CSS (single page UI)

## Requirements

- Node.js (recommended: current LTS; this project is running on Node 22 in production).
- npm

## Quick Start

```bash
npm install
npm run dev
```

App scripts:

- `npm run dev` -> start Vite dev server
- `npm run build` -> production build to `dist/`
- `npm run preview` -> preview built app

## HTTPS and Cloudflare (Full Mode)

This project is configured to run HTTPS directly from Vite on port `443`.
Production domain: `justcalendar.ai` (`www.justcalendar.ai`).

Current Vite configuration:

- `host: 0.0.0.0`
- `port: 443`
- `strictPort: true`
- `allowedHosts`: `justcalendar.ai`, `www.justcalendar.ai` (plus internal hosts and legacy `justcal.ai` entries)
- TLS certificate/key loaded from:
  - `certs/justcal.ai.crt` (current file name)
  - `certs/justcal.ai.key` (current file name)

Certificate files are intentionally ignored by git (`certs/` in `.gitignore`).

### Generate a self-signed cert (compatible with Cloudflare `Full`)

```bash
mkdir -p certs
openssl req -x509 -nodes -newkey rsa:2048 -sha256 -days 3650 \
  -keyout certs/justcalendar.ai.key \
  -out certs/justcalendar.ai.crt \
  -subj "/CN=justcalendar.ai" \
  -addext "subjectAltName=DNS:justcalendar.ai,DNS:www.justcalendar.ai"
```

If you use these new file names, update `vite.config.js` certificate paths accordingly.

Cloudflare SSL/TLS mode:

- Use **Full** (not Full strict) when using self-signed origin certs.

## Browser Storage

The app persists state in `localStorage` using:

- `justcal-calendars`
- `justcal-calendar-day-states`
- `justcal-day-states` (legacy key read for migration)
- `justcal-theme`
- `justcal-camera-zoom`
- `justcal-cell-expansion-x`
- `justcal-cell-expansion-y`
- `justcal-fade-delta`
- `justcal-cell-expansion` (legacy key read for migration)
- `justcal-selection-expansion` (legacy key read for migration)

## Project Structure

```text
.
├── index.html
├── src/
│   ├── main.js
│   ├── calendar.js
│   ├── calendars.js
│   ├── theme.js
│   └── tweak-controls.js
├── vite.config.js
└── package.json
```

## Notes for VPS Deployment

- Port `443` usually requires elevated privileges or a reverse proxy.
- If you run the app as a non-root user, either:
  - terminate TLS at Nginx/Caddy and proxy to a higher local port, or
  - grant Node permission to bind low ports.

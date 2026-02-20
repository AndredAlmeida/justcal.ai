# justcal.ai

A single-page infinite scrolling calendar built with Vite and vanilla JavaScript.

## Features

- Infinite month scrolling in both directions.
- Click-to-select day expansion animation (row and column expansion).
- Per-day status markers: `X`, `Red`, `Yellow`, `Green`.
- Persistent day states via browser `localStorage`.
- Dark mode by default with a theme toggle.
- Expand-controls panel for tuning day expansion strength.
- Keyboard support: `Esc` clears the selected day.
- Floating GitHub shortcut button (bottom-right).

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

Current Vite configuration:

- `host: 0.0.0.0`
- `port: 443`
- `strictPort: true`
- `allowedHosts`: `justcal.ai`, `www.justcal.ai` (plus internal hosts)
- TLS certificate/key loaded from:
  - `certs/justcal.ai.crt`
  - `certs/justcal.ai.key`

Certificate files are intentionally ignored by git (`certs/` in `.gitignore`).

### Generate a self-signed cert (compatible with Cloudflare `Full`)

```bash
mkdir -p certs
openssl req -x509 -nodes -newkey rsa:2048 -sha256 -days 3650 \
  -keyout certs/justcal.ai.key \
  -out certs/justcal.ai.crt \
  -subj "/CN=justcal.ai" \
  -addext "subjectAltName=DNS:justcal.ai,DNS:www.justcal.ai"
```

Cloudflare SSL/TLS mode:

- Use **Full** (not Full strict) when using self-signed origin certs.

## Browser Storage

The app persists state in `localStorage` using:

- `justcal-day-states`
- `justcal-theme`
- `justcal-selection-expansion`

## Project Structure

```text
.
├── index.html
├── src/
│   ├── main.js
│   ├── calendar.js
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


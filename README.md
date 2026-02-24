# justcalendar.ai

A single-page infinite scrolling calendar built with Vite and vanilla JavaScript.
Entirely created via a Telegram bot connected to Codex, using Ductor: https://github.com/PleasePrompto/ductor

## Features

- Infinite month timeline with lazy-loading in both directions.
- Month/Year view toggle with a full-year grid, per-month summaries, and year navigation.
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

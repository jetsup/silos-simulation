# GrainPlant SCADA: Silo Monitoring Simulation

Realistic web SCADA to monitor a flour-mill plant, built with **NPM libraries** (no hand-rolled 3D/charts):

| Library | Used for |
| --- | --- |
| `three` | 3D plant overview (silos, bins, diesel tank, animated fill) |
| `chart.js` | Live trend chart (stock / temp / moisture history) |
| `canvas-gauges` | Temperature & moisture radial gauges per vessel |
| `express` | Telemetry backend (ingest, query, CSV + reports) |
| `better-sqlite3` | Embedded database for readings |
| `vite` | Dev server + build |

## Plant

- **3× Grain silos**, 40 m, 32 segments × 10 t = **320 t**
- **2× Dirty wheat silos**, 40 m, 32 × 10 t = **320 t**
- **6× Conditioning silos**, 18 m, **96 t**
- **5× Flour bins**, 15 m, **50 t**
- **1× Diesel tank** horizontal Ø1.5 m × L3.0 m = **5 301 L** (true horizontal-cylinder math)

Content is measured in tonnes (t), litres for diesel. Segments = 10 t each (40 m silos).

## Run

```bash
npm install
cp .env.example .env   # optional: SYSTEM_NAME, PORT, CHROME_PATH
npm run server   # → backend + SQLite on http://localhost:3001
npm run dev      # → frontend on http://localhost:5173 (proxies /api)
npm run build    # → dist/ (served by the backend in production)
```

Without the backend the dashboard shows its baked-in state but cannot
refresh; history recording, CSV export and reports need `npm run server`.

The display name in the header, browser tab and reports comes from
`SYSTEM_NAME` in `.env` (served to the dashboard via `GET /api/config`).

All plant thresholds and tuning constants (capacities, alarm bands,
generator rules, flow rates, retention, intervals) live in
`src/silo_credentials.js`, shared by the simulation, dashboard and backend.

## Reports & database

- The frontend posts a snapshot of every vessel to `/api/telemetry` every 10 s;
  readings land in `server/data/plant.db` (SQLite, auto-trimmed to 200k rows).
- The **Reports** section filters by vessel (or all vessels) and time range
  (or all time), then: **View report** (printable HTML with stat cards for
  every vessel, SVG stock/temperature/moisture charts across all vessels,
  current stock visuals and latest readings per vessel), **Download PDF**
  (same report rendered server-side with headless Chrome — needs
  `CHROME_PATH`), **Download CSV** (raw rows).
- Raw API: `GET /api/readings`, `/api/export.csv`, `/api/report`,
  `/api/report.pdf`, `/api/vessels`, `/api/stats`, `/api/state`,
  `/api/config` — reads accept `vesselId`, `from`, `to` (ISO).

## Features

- 3D plant (`three`): orbit/zoom, colour = status, grain fill = stock, click vessel → detail modal
- 2D SVG silo cards with animated grain + flow indicator
- Radial gauges (`canvas-gauges`) for temp / moisture, bar for stock
- `chart.js` rolling trend for selected vessel
- Simulation engine: fill/discharge rates (t/h or L/h), ambient day cycle, self-heating when moist+full, aeration drying, random events, alarms (high/low, hot, wet)
- Per-vessel: +10 t / −10 t, ±1 segment, rate sliders, aeration, top-up, empty
- Global: play/pause, 1×/10×/60×/300× speed, fill-all / empty-all toggles, events feed, reset
- Sidebar filter (also focuses the group in 3D), KPI header, alarm bar, detail modal
- Reports, CSV export and SQLite history via the backend

> All values are simulated, not for operational use.

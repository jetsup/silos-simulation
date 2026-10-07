# GrainPlant SCADA: Silo Monitoring Simulation

Realistic web SCADA to monitor a flour-mill plant, built with **NPM libraries** (no hand-rolled 3D/charts):

| Library | Used for |
| --- | --- |
| `three` | 3D plant overview (silos, bins, diesel tank, animated fill) |
| `chart.js` | Live trend chart (level / temp / moisture history) |
| `canvas-gauges` | Temperature & moisture radial gauges per vessel |
| `vite` | Dev server + build |

## Plant

- **3× Grain silos**, 40 m, 32 segments × 10 t = **320 t**
- **2× Dirty wheat silos**, 40 m, 32 × 10 t = **320 t**
- **6× Conditioning silos**, 18 m, **96 t**
- **5× Flour bins**, 15 m, **50 t**
- **1× Diesel tank** horizontal Ø1.5 m × L3.0 m = **5 301 L** (true horizontal-cylinder math)

Level m = % × height. Segments = tonnes / 10 t (40 m silos).

## Run

```bash
npm install
npm run dev      # → http://localhost:5173
npm run build    # → dist/
npm run preview
```

No backend needed, pure front-end simulation.

## Features

- 3D plant (`three`): orbit/zoom, colour = status, fill height = level, click vessel → detail modal
- 2D SVG silo cards with animated grain + flow indicator
- Radial gauges (`canvas-gauges`) for temp / moisture, bar for level
- `chart.js` rolling trend for selected vessel
- Simulation engine: fill/discharge rates (t/h or L/h), ambient day cycle, self-heating when moist+full, aeration drying, random events, alarms (high/low, hot, wet)
- Per-vessel: +10 t / −10 t, ±1 segment, rate sliders, aeration, top-up, empty
- Global: play/pause, 1×/10×/60×/300× speed, fill-all, random event, reset
- Sidebar filter, KPI header, alarm bar, detail modal

> All values are simulated, not for operational use.

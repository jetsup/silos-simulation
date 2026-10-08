// GrainPlant telemetry backend: owns the simulation, stores readings in
// SQLite, serves state / controls / CSV export / HTML + PDF reports.
// Display name, port and PDF renderer come from the `.env` file.
import dotenv from 'dotenv';
dotenv.config();
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { storeReadings, listVessels, queryReadings, stats, trim, latestPerVessel } from './db.js';
import { buildReport } from './report.js';
import { serialize, snapshotRows, applyControl, applyGlobal, resetPlant, seedFromDb, tickServer } from './plant.js';
import { renderPdf } from './pdf.js';
import { CSV_MAX_ROWS, REPORT_MAX_ROWS, RECORD_EVERY_S } from '../src/silo_credentials.js';

const PORT = process.env.PORT || 3001;
export const SYSTEM_NAME = process.env.SYSTEM_NAME || 'GRAINPLANT SCADA';
const app = express();
app.use(express.json({ limit: '2mb' }));

function cleanStr(v, max = 64) {
  return typeof v === 'string' ? v.slice(0, max) : '';
}

app.post('/api/telemetry', (req, res) => {
  const batch = Array.isArray(req.body?.readings) ? req.body.readings : [];
  const rows = [];
  for (const r of batch.slice(0, 500)) {
    if (!r || !r.vessel || !r.vessel.id) continue;
    rows.push({
      vessel: {
        id: cleanStr(r.vessel.id, 32),
        name: cleanStr(r.vessel.name || r.vessel.id),
        vessel_group: cleanStr(r.vessel.group || 'grain', 32),
        height_m: Number(r.vessel.heightM) || null,
        capacity: Number(r.vessel.capacity) || null,
        unit: cleanStr(r.vessel.unit || 't', 8)
      },
      reading: {
        vessel_id: cleanStr(r.vessel.id, 32),
        ts: cleanStr(r.ts || new Date().toISOString(), 32),
        sim_hours: Number(r.simHours) || null,
        level: Number(r.level),
        temp_c: Number(r.tempC),
        moisture: Number(r.moisture),
        fill_rate: Number(r.fillRate) || 0,
        dis_rate: Number(r.disRate) || 0
      }
    });
  }
  const stored = storeReadings(rows);
  if (stored) trim();
  res.json({ stored });
});

app.get('/api/vessels', (_req, res) => res.json(listVessels()));
app.get('/api/stats', (_req, res) => res.json(stats()));
app.get('/api/config', (_req, res) => res.json({ systemName: SYSTEM_NAME }));

// ---- live simulation state (the single source of truth) ----
app.get('/api/state', (_req, res) => res.json(serialize()));

app.post('/api/control', (req, res) => {
  const { id, patch } = req.body || {};
  if (!id || typeof patch !== 'object') return res.status(400).json({ error: 'Expected {id, patch}.' });
  const r = applyControl(String(id), patch);
  if (r.error) return res.status(409).json(r);
  res.json({ ok: true, state: serialize() });
});

app.post('/api/global', (req, res) => {
  res.json({ ok: true, ...applyGlobal(req.body || {}), state: serialize() });
});

app.post('/api/reset', (_req, res) => {
  resetPlant();
  res.json({ ok: true, state: serialize() });
});

function filters(q) {
  return {
    vesselId: cleanStr(q.vesselId || '', 32) || null,
    from: cleanStr(q.from || '', 32) || null,
    to: cleanStr(q.to || '', 32) || null
  };
}

app.get('/api/readings', (req, res) => {
  const rows = queryReadings({ ...filters(req.query) });
  res.json(rows);
});

app.get('/api/export.csv', (req, res) => {
  const rows = queryReadings({ ...filters(req.query), limit: CSV_MAX_ROWS });
  const head = 'vessel_id,timestamp,sim_hours,stock_t,temp_c,moisture,fill_rate,dis_rate\n';
  const body = rows.map(r => [r.vessel_id, r.ts, r.sim_hours ?? '', r.level, r.temp_c, r.moisture ?? '', r.fill_rate, r.dis_rate].join(',')).join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="plant-data.csv"');
  res.send(head + body);
});

function reportPayload(query) {
  const f = filters(query);
  const rows = queryReadings({ ...f, limit: REPORT_MAX_ROWS });
  const registry = listVessels();
  const byId = new Map(registry.map(v => [v.id, v]));
  const rowsByVessel = {};
  for (const r of rows) {
    (rowsByVessel[r.vessel_id] = rowsByVessel[r.vessel_id] || []).push(r);
    if (!byId.has(r.vessel_id)) byId.set(r.vessel_id, { id: r.vessel_id, name: r.vessel_id, group: '?' });
  }
  const vessels = (f.vesselId ? [byId.get(f.vesselId)].filter(Boolean) : [...byId.values()]).filter(
    v => (rowsByVessel[v.id] || []).length
  );
  const capacities = {};
  for (const v of vessels) capacities[v.id] = v.capacity || 1;
  const period = `${f.from || 'beginning'} → ${f.to || 'now'}`;
  const html = buildReport({
    systemName: SYSTEM_NAME,
    title: f.vesselId ? `Vessel report: ${f.vesselId}` : 'Plant Report: all vessels',
    period,
    vessels,
    rowsByVessel,
    capacities,
    generatedAt: new Date().toLocaleString()
  });
  // Timestamped file stem, e.g. plant-report-G-01-20261008T153045 (colon-free: Windows-safe).
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15);
  const stem = f.vesselId ? `plant-report-${f.vesselId}-${stamp}` : `plant-report-all-${stamp}`;
  return { html, stem, count: vessels.length };
}

app.get('/api/report', (req, res) => {
  const { html, stem } = reportPayload(req.query);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  if (req.query.download === '1') res.setHeader('Content-Disposition', `attachment; filename="${stem}.html"`);
  res.send(html);
});

app.get('/api/report.pdf', async (req, res) => {
  try {
    const { html, stem } = reportPayload(req.query);
    const pdf = await renderPdf(html);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${stem}.pdf"`);
    res.send(Buffer.from(pdf));
  } catch (err) {
    res.status(500).json({ error: `PDF rendering failed: ${err.message}` });
  }
});

// Serve the built frontend (npm run build) when present.
const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(here, '..', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.use((req, res) => {
    if (req.path.startsWith('/api')) return res.status(404).json({ error: 'not found' });
    res.sendFile(path.join(dist, 'index.html'));
  });
}

app.listen(PORT, () => console.log(`Telemetry backend on http://localhost:${PORT}`));

// Populate the plant from the newest stored readings (empty DB → the
// built-in random initial conditions), so page loads show last values.
try {
  const restored = seedFromDb(latestPerVessel());
  console.log(restored ? `Restored ${restored} vessels from database history.` : 'Database empty — starting from initial conditions.');
} catch (err) {
  console.error('restore failed, using initial conditions:', err.message);
}

// Advance the plant every wall second; record history on RECORD_EVERY_S.
let elapsed = 0;
setInterval(() => {
  try {
    tickServer();
    elapsed += 1;
    if (elapsed % RECORD_EVERY_S === 0) {
      const n = storeReadings(snapshotRows());
      if (n) trim();
    }
  } catch (err) {
    console.error('tick failed:', err.message);
  }
}, 1000);

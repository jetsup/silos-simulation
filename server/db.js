// SQLite store for plant telemetry (better-sqlite3, synchronous).
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DB_MAX_ROWS, DB_QUERY_LIMIT } from '../src/silo_credentials.js';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'data');
fs.mkdirSync(dir, { recursive: true });
const db = new Database(path.join(dir, 'plant.db'));
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS vessels (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  vessel_group TEXT NOT NULL,
  height_m REAL,
  capacity REAL,
  unit TEXT
);
CREATE TABLE IF NOT EXISTS readings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vessel_id TEXT NOT NULL,
  ts TEXT NOT NULL,
  sim_hours REAL,
  level REAL,
  temp_c REAL,
  moisture REAL,
  fill_rate REAL,
  dis_rate REAL,
  FOREIGN KEY (vessel_id) REFERENCES vessels (id)
);
CREATE INDEX IF NOT EXISTS idx_readings_vessel_ts ON readings (vessel_id, ts);
`);

const upsertVesselStmt = db.prepare(`
INSERT INTO vessels (id, name, vessel_group, height_m, capacity, unit)
VALUES (@id, @name, @vessel_group, @height_m, @capacity, @unit)
ON CONFLICT (id) DO UPDATE SET name = excluded.name, vessel_group = excluded.vessel_group
`);
const insertReadingStmt = db.prepare(`
INSERT INTO readings (vessel_id, ts, sim_hours, level, temp_c, moisture, fill_rate, dis_rate)
VALUES (@vessel_id, @ts, @sim_hours, @level, @temp_c, @moisture, @fill_rate, @dis_rate)
`);

const insertBatch = db.transaction((rows) => {
  for (const r of rows) {
    upsertVesselStmt.run(r.vessel);
    insertReadingStmt.run(r.reading);
  }
});

export function storeReadings(rows) {
  if (!rows.length) return 0;
  insertBatch(rows);
  return rows.length;
}

export function listVessels() {
  return db.prepare('SELECT id, name, vessel_group AS "group", height_m, capacity, unit FROM vessels ORDER BY id').all();
}

export function queryReadings({ vesselId, from, to, limit = DB_QUERY_LIMIT }) {
  const conds = [];
  const params = {};
  if (vesselId) {
    conds.push('vessel_id = @vesselId');
    params.vesselId = vesselId;
  }
  if (from) {
    conds.push('ts >= @from');
    params.from = from;
  }
  if (to) {
    conds.push('ts <= @to');
    params.to = to;
  }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  return db
    .prepare(`SELECT vessel_id, ts, sim_hours, level, temp_c, moisture, fill_rate, dis_rate FROM readings ${where} ORDER BY ts ASC LIMIT @limit`)
    .all({ ...params, limit });
}

export function stats() {
  const n = db.prepare('SELECT COUNT(*) AS c FROM readings').get().c;
  const vessels = db.prepare('SELECT COUNT(*) AS c FROM vessels').get().c;
  const range = db.prepare('SELECT MIN(ts) AS fromTs, MAX(ts) AS toTs FROM readings').get();
  return { readings: n, vessels, from: range.fromTs, to: range.toTs };
}

// Newest stored reading per vessel — used to restore the plant on startup
// so the dashboard reloads the last known values instead of random ones.
export function latestPerVessel() {
  return db
    .prepare(
      `SELECT r.vessel_id, r.ts, r.sim_hours, r.level, r.temp_c, r.moisture
       FROM readings r
       INNER JOIN (SELECT vessel_id, MAX(id) AS maxid FROM readings GROUP BY vessel_id) m
       ON m.maxid = r.id`
    )
    .all();
}

// Keep the DB bounded: retain the newest DB_MAX_ROWS readings.
export function trim() {
  const n = db.prepare('SELECT COUNT(*) AS c FROM readings').get().c;
  if (n > DB_MAX_ROWS) {
    db.prepare('DELETE FROM readings WHERE id <= (SELECT id FROM readings ORDER BY id DESC LIMIT 1 OFFSET @keep)').run({
      keep: DB_MAX_ROWS
    });
  }
}

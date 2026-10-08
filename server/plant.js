// Backend-owned plant simulation: the server advances the vessels, serves
// live state, applies control commands and records history to SQLite.
// The frontend is a thin client: it fetches state and posts controls.
import { createPlant, tick, ambientAt, levelPct, levelM, segments, statusOf, canStartGenerator } from '../src/sim.js';
import { FLOW_FILL_TPH, FLOW_DRAIN_TPH, DIESEL_FILL_LPH, DIESEL_DRAIN_LPH, MAX_SIM_SPEED } from '../src/silo_credentials.js';

let plant = createPlant();

const FILL_DEFAULTS = { fill: FLOW_FILL_TPH, drain: FLOW_DRAIN_TPH, dieselFill: DIESEL_FILL_LPH, dieselDrain: DIESEL_DRAIN_LPH };

export function getPlant() {
  return plant;
}

export function resetPlant() {
  plant = createPlant();
  return plant;
}

// Restore level / temperature / moisture from the newest database rows so a
// restart (and every page load reading /api/state) continues from the last
// known values instead of fresh random ones. Flows stay stopped on purpose.
export function seedFromDb(rows) {
  let restored = 0;
  let maxSim = null;
  for (const r of rows || []) {
    const v = plant.vessels.find(x => x.id === r.vessel_id);
    if (!v) continue;
    if (Number.isFinite(Number(r.level))) {
      v.level = Math.min(Math.max(Number(r.level), 0), v.capacity);
      restored += 1;
    }
    if (!v.isDiesel) {
      if (Number.isFinite(Number(r.temp_c))) v.tempC = Number(r.temp_c);
      if (Number.isFinite(Number(r.moisture))) v.moisture = Number(r.moisture);
    } else if (Number.isFinite(Number(r.temp_c))) {
      v.tempC = Number(r.temp_c);
    }
    if (Number.isFinite(Number(r.sim_hours)) && (maxSim === null || Number(r.sim_hours) > maxSim)) {
      maxSim = Number(r.sim_hours);
    }
  }
  if (maxSim !== null) plant.simHours = maxSim;
  return restored;
}

export function serialize() {
  const amb = ambientAt(plant.simHours);
  return {
    simHours: plant.simHours,
    playing: plant.playing,
    speed: plant.speed,
    fillAll: plant.fillAll,
    emptyAll: plant.emptyAll,
    ambient: amb,
    vessels: plant.vessels.map(v => {
      const st = statusOf(v);
      return {
        uid: v.uid,
        id: v.id,
        name: v.name,
        group: v.group,
        isDiesel: v.isDiesel,
        heightM: v.heightM,
        capacity: v.capacity,
        unit: v.unit,
        rateUnit: v.rateUnit,
        level: v.level,
        tempC: v.tempC,
        moisture: v.moisture,
        fillRate: v.fillRate,
        disRate: v.disRate,
        aeration: v.aeration,
        genOn: !!v.genOn,
        genRate: v.genRate || 0,
        pct: levelPct(v),
        levelM: levelM(v),
        seg: segments(v),
        sev: st.sev,
        alarms: st.alarms,
        flowing: st.flowing
      };
    })
  };
}

export function snapshotRows() {
  const ts = new Date().toISOString();
  return plant.vessels.map(v => ({
    vessel: {
      id: v.id,
      name: v.name,
      vessel_group: v.group,
      height_m: v.heightM,
      capacity: v.capacity,
      unit: v.unit
    },
    reading: {
      vessel_id: v.id,
      ts,
      sim_hours: plant.simHours,
      level: v.level,
      temp_c: v.tempC,
      moisture: v.moisture,
      fill_rate: v.fillRate,
      dis_rate: v.disRate
    }
  }));
}

function find(id) {
  return plant.vessels.find(v => v.id === id);
}

function clampLevel(v, x) {
  v.level = Math.min(Math.max(x, 0), v.capacity);
}

export function applyControl(id, patch = {}) {
  const v = find(id);
  if (!v) return { error: 'Unknown vessel.' };
  if (patch.fillRate !== undefined) v.fillRate = Math.max(0, Number(patch.fillRate) || 0);
  if (patch.disRate !== undefined) v.disRate = Math.max(0, Number(patch.disRate) || 0);
  if (patch.aeration !== undefined && !v.isDiesel) v.aeration = !!patch.aeration;
  if (patch.genOn !== undefined && v.isDiesel) {
    if (patch.genOn) {
      const chk = canStartGenerator(v);
      if (!chk.ok) return { error: chk.reason };
      v.genOn = true;
    } else {
      v.genOn = false;
    }
  }
  if (patch.bump !== undefined) clampLevel(v, v.level + Number(patch.bump));
  if (patch.level !== undefined) clampLevel(v, Number(patch.level));
  if (patch.topup) clampLevel(v, v.capacity * 0.95);
  if (patch.empty) {
    v.level = 0;
    v.fillRate = 0;
  }
  return { ok: true };
}

export function applyGlobal(patch = {}) {
  if (patch.playing !== undefined) plant.playing = !!patch.playing;
  if (patch.speed !== undefined) plant.speed = Math.min(Math.max(Number(patch.speed) || 1, 1), MAX_SIM_SPEED);
  if (patch.fillAll !== undefined) {
    plant.fillAll = !!patch.fillAll;
    if (plant.fillAll) {
      plant.emptyAll = false;
      for (const v of plant.vessels) {
        v.disRate = 0;
        v.fillRate = v.isDiesel ? FILL_DEFAULTS.dieselFill : FILL_DEFAULTS.fill;
      }
    } else {
      for (const v of plant.vessels) v.fillRate = 0;
    }
  }
  if (patch.emptyAll !== undefined) {
    plant.emptyAll = !!patch.emptyAll;
    if (plant.emptyAll) {
      plant.fillAll = false;
      for (const v of plant.vessels) {
        v.fillRate = 0;
        v.disRate = v.isDiesel ? FILL_DEFAULTS.dieselDrain : FILL_DEFAULTS.drain;
      }
    } else {
      for (const v of plant.vessels) v.disRate = 0;
    }
  }
  return { fillAll: plant.fillAll, emptyAll: plant.emptyAll, playing: plant.playing, speed: plant.speed };
}

export function tickServer() {
  if (plant.playing) tick(plant, plant.speed);
}

// Plant model + simulation engine (pure logic, no rendering libs here).
// All thresholds and capacities live in silo_credentials.js.
import {
  GRAIN_SILO_HEIGHT_M, GRAIN_SILO_CAPACITY_T,
  COND_SILO_HEIGHT_M, COND_SILO_CAPACITY_T,
  FLOUR_BIN_HEIGHT_M, FLOUR_BIN_CAPACITY_T,
  SEGMENT_TONNES,
  DIESEL_TANK_DIAMETER_M, DIESEL_TANK_LENGTH_M,
  LEVEL_HI_HI_PCT, LEVEL_HIGH_PCT, LEVEL_LOW_PCT, DIESEL_CRITICAL_L,
  GRAIN_HOT_C, GRAIN_WARM_C, FUEL_HOT_C,
  MOIST_WET_LIMIT_DEFAULT, MOIST_WET_LIMIT_FLOUR, MOIST_WET_LIMIT_DIRTY, MOIST_WET_MARGIN,
  GEN_MIN_L, GEN_CONSUMPTION_LPH, DIESEL_STANDBY_LOSS_LPH,
  AMBIENT_BASE_C, AMBIENT_SWING_C, AMBIENT_TROUGH_HOUR, AMBIENT_RH_BASE, AMBIENT_RH_SWING
} from './silo_credentials.js';

export const DIESEL = { D: DIESEL_TANK_DIAMETER_M, L: DIESEL_TANK_LENGTH_M };
export const DIESEL_VMAX = Math.PI * (DIESEL.D / 2) ** 2 * DIESEL.L * 1000; // litres ~5301

export function dieselVolumeFromHeight(h) {
  const r = DIESEL.D / 2, L = DIESEL.L;
  h = Math.min(Math.max(h, 0), DIESEL.D);
  if (h <= 0) return 0;
  if (h >= DIESEL.D) return Math.PI * r * r * L * 1000;
  const area = r * r * Math.acos((r - h) / r) - (r - h) * Math.sqrt(2 * r * h - h * h);
  return area * L * 1000;
}

export function dieselHeightFromVolume(V) {
  V = Math.min(Math.max(V, 0), DIESEL_VMAX);
  let lo = 0, hi = DIESEL.D;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (dieselVolumeFromHeight(mid) < V) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

let seq = 0;
function mk(id, name, group, heightM, capacity, level, tempC, moisture, opts = {}) {
  return {
    uid: seq++, id, name, group, heightM,
    capacity, level, tempC, moisture,
    fillRate: 0, disRate: 0,
    aeration: false, flowing: 0,
    isDiesel: group === 'diesel',
    unit: group === 'diesel' ? 'L' : 't',
    rateUnit: group === 'diesel' ? 'L/h' : 't/h',
    hist: [], maxHist: 240,
    ...opts
  };
}

export function createPlant() {
  seq = 0;
  const v = [];
  const R = (a, b) => a + Math.random() * (b - a);
  for (let i = 1; i <= 3; i++)
    v.push(mk(`G-0${i}`, `Grain Silo G-0${i}`, 'grain', GRAIN_SILO_HEIGHT_M, GRAIN_SILO_CAPACITY_T, R(120, 240), R(22, 27), R(12.2, 13.8)));
  for (let i = 1; i <= 2; i++)
    v.push(mk(`DW-0${i}`, `Dirty Wheat DW-0${i}`, 'dirty', GRAIN_SILO_HEIGHT_M, GRAIN_SILO_CAPACITY_T, R(150, 260), R(23, 28), R(14.5, 16.5)));
  for (let i = 1; i <= 6; i++)
    v.push(mk(`CD-0${i}`, `Conditioning CD-0${i}`, 'cond', COND_SILO_HEIGHT_M, COND_SILO_CAPACITY_T, R(25, 65), R(21, 26), R(14.0, 16.0)));
  for (let i = 1; i <= 5; i++)
    v.push(mk(`F-0${i}`, `Flour Bin F-0${i}`, 'flour', FLOUR_BIN_HEIGHT_M, FLOUR_BIN_CAPACITY_T, R(15, 33), R(22, 26), R(11.5, 13.0)));
  v.push(mk('DZL-01', 'Diesel Tank DZL-01', 'diesel', DIESEL.D, DIESEL_VMAX, DIESEL_VMAX * 0.62, 26, 0, { genOn: false, genRate: GEN_CONSUMPTION_LPH }));
  return { vessels: v, simHours: 8.5, playing: true, speed: 10, fillAll: false, emptyAll: false, showEvents: false };
}

export function levelPct(x) { return (x.level / x.capacity) * 100; }
export function levelM(x) {
  if (x.isDiesel) return dieselHeightFromVolume(x.level);
  return (levelPct(x) / 100) * x.heightM;
}
export function segments(x) { return x.isDiesel ? null : x.level / SEGMENT_TONNES; }

export function ambientAt(simHours) {
  const t = ((simHours % 24) + 24) % 24;
  const temp = AMBIENT_BASE_C + AMBIENT_SWING_C * Math.sin((2 * Math.PI * (t - AMBIENT_TROUGH_HOUR)) / 24);
  const rh = AMBIENT_RH_BASE - AMBIENT_RH_SWING * Math.sin((2 * Math.PI * (t - AMBIENT_TROUGH_HOUR)) / 24);
  return { temp, rh };
}

export function canStartGenerator(x) {
  if (!x.isDiesel) return { ok: false, reason: 'Only the diesel tank can run the generator.' };
  if (x.level < GEN_MIN_L) {
    return {
      ok: false,
      reason: `Cannot start generator, tank is empty (${Math.round(x.level).toLocaleString()} L). Refuel the tank first.`
    };
  }
  return { ok: true };
}

export function statusOf(x) {
  const p = levelPct(x);
  const alarms = [];
  if (p >= LEVEL_HI_HI_PCT) alarms.push('HI-HI level');
  else if (p >= LEVEL_HIGH_PCT) alarms.push('HIGH level');
  if (p <= LEVEL_LOW_PCT) alarms.push('LOW level');
  if (x.isDiesel && x.level < DIESEL_CRITICAL_L) alarms.push('FUEL CRITICAL');
  if (!x.isDiesel) {
    if (x.tempC >= GRAIN_HOT_C) alarms.push('HOT grain');
    else if (x.tempC >= GRAIN_WARM_C) alarms.push('Warm');
    const wetLim = x.group === 'flour' ? MOIST_WET_LIMIT_FLOUR : x.group === 'dirty' ? MOIST_WET_LIMIT_DIRTY : MOIST_WET_LIMIT_DEFAULT;
    if (x.moisture >= wetLim + MOIST_WET_MARGIN) alarms.push('WET');
    else if (x.moisture >= wetLim) alarms.push('Moist high');
  } else if (x.tempC >= FUEL_HOT_C) alarms.push('HOT fuel');
  const flowing = x.fillRate > 0 || x.disRate > 0 || !!x.genOn;
  let sev = 'ok';
  if (alarms.some(a => /HI-HI|HOT|WET|CRITICAL/.test(a))) sev = 'alarm';
  else if (alarms.length) sev = 'warn';
  else if (flowing) sev = 'flow';
  return { sev, alarms, flowing };
}

export function tick(plant, dtSimSec) {
  const dtH = dtSimSec / 3600;
  const amb = ambientAt(plant.simHours);
  plant.simHours += dtH;
  for (const x of plant.vessels) {
    // level integration
    if (x.fillRate > 0 || x.disRate > 0) {
      x.level += (x.fillRate - x.disRate) * dtH;
      x.level = Math.min(Math.max(x.level, 0), x.capacity);
      x.flowing = Date.now();
    }
    const p = levelPct(x) / 100;
    if (!x.isDiesel) {
      // temperature: ambient + self-heating (moist & full) - aeration cooling
      const moistFactor = Math.max(0, x.moisture - 13.5);
      const heatGain = (x.group === 'flour' ? 0.6 : 1.6) * moistFactor * p;
      let target = amb.temp + heatGain;
      if (x.aeration) target = amb.temp - 1.5 + heatGain * 0.3;
      const k = x.aeration ? 0.25 : 0.06; // /h
      x.tempC += (target - x.tempC) * Math.min(1, k * dtH * 4);
      x.tempC += (Math.random() - 0.5) * 0.02 * Math.sqrt(dtH * 60 + 1) * 0.3;
      // moisture drift to ambient equilibrium; aeration dries
      let eq = 12.8 + (amb.rh - 55) * 0.03 + (x.group === 'dirty' ? 2.2 : 0) + (x.group === 'cond' ? 1.6 : 0) - (x.group === 'flour' ? 1.0 : 0);
      if (x.aeration) eq -= 1.2;
      x.moisture += (eq - x.moisture) * Math.min(1, 0.05 * dtH * 4);
      x.moisture += (Math.random() - 0.5) * 0.02;
      x.moisture = Math.min(Math.max(x.moisture, 8), 20);
      x.tempC = Math.min(Math.max(x.tempC, 5), 60);
    } else {
      const target = amb.temp + 2;
      x.tempC += (target - x.tempC) * Math.min(1, 0.15 * dtH * 4);
      // tanks breathe a little: very small standby loss even with everything off
      x.level -= DIESEL_STANDBY_LOSS_LPH * dtH;
      // generator consumes fuel continuously while switched on
      if (x.genOn) {
        x.level -= (x.genRate || GEN_CONSUMPTION_LPH) * dtH;
        x.flowing = Date.now();
      }
      if (x.level <= 0) { x.level = 0; x.genOn = false; }
    }
    // history (sampled by caller-throttle, store every tick is fine at 1s sim)
    x.hist.push({ p: levelPct(x), t: x.tempC, m: x.moisture });
    if (x.hist.length > x.maxHist) x.hist.shift();
  }
  return amb;
}

export function randomEvent(plant) {
  const grains = plant.vessels.filter(v => !v.isDiesel);
  const pick = grains[Math.floor(Math.random() * grains.length)];
  const kind = Math.floor(Math.random() * 4);
  if (kind === 0) { pick.moisture += 1.5 + Math.random(); return `Rain ingress : ${pick.id} moisture spike`; }
  if (kind === 1) { pick.tempC += 3 + Math.random() * 3; return `Hot spot detected : ${pick.id} heating`; }
  if (kind === 2) { pick.fillRate = 60 + Math.random() * 40; setTimeout(() => (pick.fillRate = 0), 15000); return `Intake conveyor started → ${pick.id}`; }
  pick.disRate = 60 + Math.random() * 40; setTimeout(() => (pick.disRate = 0), 15000);
  return `Mill demand surge : discharging ${pick.id}`;
}

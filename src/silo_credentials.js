// ============================================================================
// silo_credentials.js — SINGLE SOURCE OF TRUTH for every plant threshold,
// capacity and tuning constant used by the dashboard, the simulation engine
// and the backend.
//
// NOTE on the legacy filename: despite being called "*credentials*", this
// file holds PUBLIC operating parameters, not secrets. Nothing in here
// grants access to anything — it only describes how the plant behaves and
// when it warns. Keep secrets (if any are ever added) in `.env` instead.
//
// Sections:
//   1. VESSEL GEOMETRY & CAPACITY .... physical size of each unit
//   2. SEGMENT MODEL ................. how 40 m silo content maps to tonnage
//   3. DIESEL TANK GEOMETRY ........... horizontal cylinder dimensions
//   4. ALARM / WARNING THRESHOLDS ..... when a vessel turns amber or red
//   5. GENERATOR ...................... fuel rules for the diesel generator
//   6. AMBIENT CLIMATE ................. simulated day-cycle of the plant air
//   7. FLOW DEFAULTS .................. toggle-button fill / drain rates
//   8. DATABASE ....................... history retention and query limits
//   9. TIMING ......................... polling, recording and UI intervals
//  10. DISPLAY RANGES ................. gauges, trends and 3D blink cadence
// ============================================================================

// --- 1. VESSEL GEOMETRY & CAPACITY -------------------------------------------
// Grain + dirty-wheat silos: 40 m tall, 320 t each.
export const GRAIN_SILO_HEIGHT_M = 40;
export const GRAIN_SILO_CAPACITY_T = 320;
// Conditioning (tempering) silos: 18 m tall, 96 t each.
export const COND_SILO_HEIGHT_M = 18;
export const COND_SILO_CAPACITY_T = 96;
// Flour bins (finished product): 15 m tall, 50 t each.
export const FLOUR_BIN_HEIGHT_M = 15;
export const FLOUR_BIN_CAPACITY_T = 50;

// --- 2. SEGMENT MODEL ----------------------------------------------------------
// Each 40 m silo is stacked from 32 segments holding ~10 t each.
export const SILO_SEGMENTS = 32;
export const SEGMENT_TONNES = 10;

// --- 3. DIESEL TANK GEOMETRY -----------------------------------------------------
// Horizontal cylinder: diameter 1.5 m × length 3.0 m ≈ 5 301 L.
export const DIESEL_TANK_DIAMETER_M = 1.5;
export const DIESEL_TANK_LENGTH_M = 3.0;

// --- 4. ALARM / WARNING THRESHOLDS ------------------------------------------------
// Level bands (percent of capacity). HI-HI/HOT/WET are red, the rest amber.
export const LEVEL_HI_HI_PCT = 97; // red: critically full
export const LEVEL_HIGH_PCT = 92; // amber: high level
export const LEVEL_LOW_PCT = 6; // amber: low level / low fuel
// Diesel critical-fuel floor (litres): below this the tank raises FUEL
// CRITICAL (red) and blinks on the card and in the 3D plant.
export const DIESEL_CRITICAL_L = 20;
// Grain temperature bands (°C). Fuel has its own (higher) hot limit.
export const GRAIN_HOT_C = 37; // red: hot grain (self-heating suspected)
export const GRAIN_WARM_C = 33; // amber: warming grain
export const FUEL_HOT_C = 45; // red: hot fuel
// Grain moisture bands (%). Above limit + margin reads WET (red).
export const MOIST_WET_LIMIT_DEFAULT = 15.2; // grain + conditioning silos
export const MOIST_WET_LIMIT_FLOUR = 13.8; // flour must stay drier
export const MOIST_WET_LIMIT_DIRTY = 17.0; // dirty wheat arrives wetter
export const MOIST_WET_MARGIN = 1.2; // +margin above limit = WET (red)

// --- 5. GENERATOR ------------------------------------------------------------------
// The generator cranks with almost any fuel on board — warnings never block
// it. Only a (near-)empty tank refuses to start.
export const GEN_MIN_L = 5; // litres: below this the tank counts as empty
export const GEN_CONSUMPTION_LPH = 25; // litres per hour drawn while running
export const DIESEL_STANDBY_LOSS_LPH = 0.02; // tank "breathing" loss (≈0.5 L/day)

// --- 6. AMBIENT CLIMATE ---------------------------------------------------------------
// Simulated plant air follows a 24 h sine: coolest ≈09:00, warmest ≈21:00.
export const AMBIENT_BASE_C = 24; // daily mean air temperature (°C)
export const AMBIENT_SWING_C = 7; // ± amplitude around the mean (°C)
export const AMBIENT_TROUGH_HOUR = 9; // hour of the daily minimum
export const AMBIENT_RH_BASE = 58; // daily mean relative humidity (%)
export const AMBIENT_RH_SWING = 12; // ± amplitude around the mean (%RH)

// --- 7. FLOW DEFAULTS -------------------------------------------------------------------
// Rates applied by the ▲ Fill / ▼ Empty toggle buttons.
export const FLOW_FILL_TPH = 60; // t/h into grain/conditioning/flour vessels
export const FLOW_DRAIN_TPH = 60; // t/h out of grain/conditioning/flour vessels
export const DIESEL_FILL_LPH = 500; // L/h refuelling the diesel tank
export const DIESEL_DRAIN_LPH = 300; // L/h pumped out of the diesel tank

// --- 8. DATABASE --------------------------------------------------------------------------
// Telemetry history retention and per-request row caps.
export const DB_MAX_ROWS = 200000; // newest readings retained in SQLite
export const DB_QUERY_LIMIT = 20000; // default row cap for JSON reads
export const CSV_MAX_ROWS = 100000; // row cap for CSV export
export const REPORT_MAX_ROWS = 50000; // row cap feeding one report

// --- 9. TIMING --------------------------------------------------------------------------------
// Wall-clock cadence (milliseconds unless noted) for loops and UI feedback.
export const POLL_STATE_MS = 1000; // dashboard live-state refresh
export const RECORD_EVERY_S = 5; // backend history snapshot cadence
export const REFRESH_SLOW_MS = 5000; // trend reload + warning-feed refresh
export const DB_STATS_MS = 15000; // reports "database:" line refresh
export const TOAST_MS = 5000; // toast notification visibility
export const MAX_SIM_SPEED = 1000; // clamp for the simulation speed multiplier

// --- 10. DISPLAY RANGES ------------------------------------------------------------------------
// Gauge faces, default trend window and 3D/card blink cadence.
export const GAUGE_TEMP_MIN = 0; // °C, radial temp gauge minimum
export const GAUGE_TEMP_MAX = 50; // °C, radial temp gauge maximum
export const GAUGE_MOIST_MIN = 8; // %, radial moisture gauge minimum
export const GAUGE_MOIST_MAX = 20; // %, radial moisture gauge maximum
export const TREND_DEFAULT_WINDOW = 120; // samples shown on the trend X axis
export const CARD_BLINK_MS = 600; // card tag flow/status alternation period
export const MODEL_BLINK_MS = 500; // 3D ring/body alarm pulse period

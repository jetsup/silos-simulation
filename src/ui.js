// Vessel cards: SVG silo drawing + canvas-gauges radial gauges (library).
import { RadialGauge } from 'canvas-gauges';
import { levelPct, statusOf } from './sim.js';
import {
  FLOW_FILL_TPH, FLOW_DRAIN_TPH, DIESEL_FILL_LPH, DIESEL_DRAIN_LPH,
  GAUGE_TEMP_MIN, GAUGE_TEMP_MAX, GAUGE_MOIST_MIN, GAUGE_MOIST_MAX,
  CARD_BLINK_MS
} from './silo_credentials.js';

const gauges = new Map(); // uid -> {temp, hum}

function siloSVG(v, pct) {
  const h = 150, top = 26, bottom = top + h;
  // clamp grain strictly inside the cylinder body so a full silo never
  // paints above the roof cone
  const fillH = Math.max(0, Math.min(h, h * pct / 100));
  const y = bottom - fillH;
  const gid = `g${v.uid}`;
  const grainCol = v.group === 'flour' ? '#efe6d2,#cbb98f' : v.group === 'dirty' ? '#a67c3a,#6e4f1f' : v.group === 'cond' ? '#d9b45c,#9a7a2e' : '#e8bd55,#a67c2a';
  // side ticks read in tonnes of content (not level): fractions of capacity
  const tick = f => `${Math.round(v.capacity * f)}t`;
  const tickY = f => bottom - h * f + 3;
  return `<svg class="silo-svg" width="104" height="190" viewBox="0 0 104 190">
    <defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${grainCol.split(',')[0]}"/><stop offset="1" stop-color="${grainCol.split(',')[1]}"/>
    </linearGradient></defs>
    <ellipse cx="43" cy="26" rx="30" ry="10" fill="#9aa6b1"/>
    <rect x="13" y="26" width="60" height="${h}" fill="#c7d0d8" stroke="#5a6a78" stroke-width="2"/>
    ${[0.25, 0.5, 0.75].map(f => `<line x1="13" y1="${26 + h * (1 - f)}" x2="73" y2="${26 + h * (1 - f)}" stroke="#ffffff55"/><text x="77" y="${tickY(f)}" font-size="8" fill="#8aa0b3" font-family="monospace">${tick(f)}</text>`).join('')}
    <rect x="15" y="${y}" width="56" height="${fillH}" fill="url(#${gid})"/>
    <path d="M15 ${y} Q28 ${y - 7} 43 ${y} T71 ${y} V${y + 6} H15 Z" fill="${grainCol.split(',')[0]}"/>
    <polygon points="43,2 73,26 13,26" fill="#7d8a96" stroke="#4a565f" stroke-width="2"/>
    <polygon points="13,${26 + h} 43,${26 + h + 14} 73,${26 + h}" fill="#39434d"/>
    <text x="77" y="32" font-size="8" fill="#8aa0b3" font-family="monospace">${Math.round(v.capacity)}t</text>
    <text x="77" y="${26 + h}" font-size="8" fill="#8aa0b3" font-family="monospace">0</text>
  </svg>`;
}

function tankSVG(v, pct) {
  // Side view of the horizontal tank: fuel fills BOTTOM-UP (dip height).
  const w = 300, y0 = 20, H = 70;
  const fillH = Math.max(0, H * pct / 100);
  const fy = y0 + H - fillH;
  return `<svg class="tank-svg" width="300" height="120" viewBox="0 0 320 120">
    <rect x="10" y="${y0}" width="${w}" height="${H}" rx="35" fill="#2a3540" stroke="#5a6a78" stroke-width="2"/>
    <clipPath id="tk${v.uid}"><rect x="10" y="${y0}" width="${w}" height="${H}" rx="35"/></clipPath>
    <g clip-path="url(#tk${v.uid})">
      <rect x="10" y="${fy}" width="${w}" height="${fillH}" fill="#8a5a1a"/>
      <rect x="10" y="${fy}" width="${w}" height="7" fill="#c98f2e" opacity=".85"/>
      <line x1="10" y1="20" x2="10" y2="90" stroke="#ffffff22"/>
    </g>
    <rect x="10" y="${y0}" width="${w}" height="${H}" rx="35" fill="none" stroke="#5a6a78" stroke-width="2"/>
    <line x1="10" y1="${fy}" x2="310" y2="${fy}" stroke="#ffb020" stroke-width="1.5" stroke-dasharray="5 3"/>
    <rect x="60" y="90" width="20" height="14" fill="#39434d"/><rect x="220" y="90" width="20" height="14" fill="#39434d"/>
    <text x="14" y="14" font-size="10" fill="#8aa0b3" font-family="monospace">Ø1.5m × L3.0m : ${Math.round(v.level).toLocaleString()} L</text>
  </svg>`;
}

export function renderCards(vessels, onOpen, onControl) {
  const grids = { grain: 'grid-grain', dirty: 'grid-dirty', cond: 'grid-cond', flour: 'grid-flour', diesel: 'grid-diesel' };
  Object.values(grids).forEach(id => (document.getElementById(id).innerHTML = ''));
  for (const v of vessels) {
    const card = document.createElement('div');
    card.className = 'card'; card.dataset.uid = v.uid;
    card.innerHTML = cardHTML(v);
    card.addEventListener('click', e => { if (!e.target.closest('button')) onOpen(v); });
    document.getElementById(grids[v.group]).appendChild(card);
    wireCardButtons(card, v, onControl);
    if (!v.isDiesel) mountGauges(card, v);
  }
}

function cardHTML(v) {
  const p = levelPct(v);
  const fmtT = t => `${t.toFixed(1)} t`;
  const fmtL = l => `${Math.round(l).toLocaleString()} L`;
  const lvl = v.isDiesel
    ? `<div class="big">${fmtL(v.level)}</div><div class="row"><span>Content</span><b>${fmtL(v.level)} of ${fmtL(v.capacity)}</b></div><div class="row"><span>Space left</span><b>${fmtL(v.capacity - v.level)}</b></div>`
    : `<div class="big">${fmtT(v.level)}</div><div class="row"><span>Content</span><b>${fmtT(v.level)} of ${fmtT(v.capacity)}</b></div><div class="row"><span>Space left</span><b>${fmtT(v.capacity - v.level)}</b></div>`;
  return `<div class="flow-anim"></div>
    <div class="card-head"><b>${v.id}</b><span class="tag ok">…</span></div>
    <div class="viz-row">${v.isDiesel ? tankSVG(v, p) : siloSVG(v, p)}
      <div class="reads">${lvl}
        ${v.isDiesel ? `<div class="row"><span>Fuel temp</span><b data-t>—</b></div><div class="row"><span>Generator</span><b data-g>—</b></div>` : `<div class="row"><span>Temp</span><b data-t>—</b></div><div class="row"><span>Moisture</span><b data-h>—</b></div><div class="row"><span>Aeration</span><b data-a>—</b></div>`}
        <div class="gauge-row">${v.isDiesel ? '' : `<div class="gauge"><label>TEMP °C</label><canvas data-gt width="110" height="90"></canvas></div><div class="gauge"><label>MOIST %</label><canvas data-gh width="110" height="90"></canvas></div>`}</div>
        <div class="bar"><i data-bar style="width:${p}%"></i></div>
      </div></div>
    <div class="controls">
      ${v.isDiesel
        ? `<button data-act="fill">▲ Refuel</button><button data-act="gen">⏻ Generator</button>`
        : `<button data-act="fill">▲ Fill</button><button data-act="drain">▼ Empty</button>`}
      <button data-act="open">⚙ Open</button>
    </div>`;
}

function mountGauges(card, v) {
  const gt = card.querySelector('[data-gt]'), gh = card.querySelector('[data-gh]');
  const base = { width: 110, height: 90, units: '', fontNumbersSize: 20, fontUnitsSize: 12, animation: false, valueBox: true, borders: false };
  const temp = new RadialGauge({ ...base, renderTo: gt, minValue: GAUGE_TEMP_MIN, maxValue: GAUGE_TEMP_MAX, majorTicks: ['0', '10', '20', '30', '40', '50'], highlights: [{ from: 33, to: 50, color: 'rgba(255,77,77,.7)' }], value: v.tempC });
  const hum = new RadialGauge({ ...base, renderTo: gh, minValue: GAUGE_MOIST_MIN, maxValue: GAUGE_MOIST_MAX, majorTicks: ['8', '11', '14', '17', '20'], highlights: [{ from: 15.2, to: 20, color: 'rgba(255,77,77,.7)' }], value: v.moisture });
  temp.draw(); hum.draw();
  gauges.set(v.uid, { temp, hum });
}

export const FLOW_DEFAULTS = { fill: FLOW_FILL_TPH, drain: FLOW_DRAIN_TPH, dieselFill: DIESEL_FILL_LPH, dieselDrain: DIESEL_DRAIN_LPH };

function wireCardButtons(card, v, onControl) {
  card.querySelectorAll('button').forEach(b => b.addEventListener('click', e => {
    e.stopPropagation();
    const a = b.dataset.act;
    // Continuous simulation toggles served by the backend: press to start, again to stop.
    if (a === 'fill') onControl(v.id, { fillRate: v.fillRate > 0 ? 0 : v.isDiesel ? FLOW_DEFAULTS.dieselFill : FLOW_DEFAULTS.fill });
    if (a === 'drain') onControl(v.id, { disRate: v.disRate > 0 ? 0 : FLOW_DEFAULTS.drain });
    if (a === 'gen') onControl(v.id, { genOn: !v.genOn });
    if (a === 'open') card.dispatchEvent(new CustomEvent('open-vessel', { bubbles: true, detail: v }));
  }));
}

export function syncToggleButtons(card, v) {
  const f = card.querySelector('[data-act="fill"]');
  const d = card.querySelector('[data-act="drain"]');
  const g = card.querySelector('[data-act="gen"]');
  if (f) {
    f.classList.toggle('active', v.fillRate > 0);
    f.textContent = v.isDiesel
      ? (v.fillRate > 0 ? '■ Stop refuel' : '▲ Refuel')
      : (v.fillRate > 0 ? `■ Filling ${v.fillRate}/h` : '▲ Fill');
  }
  if (d) {
    d.classList.toggle('active', v.disRate > 0);
    d.textContent = v.disRate > 0 ? `■ Draining ${v.disRate}/h` : '▼ Empty';
  }
  if (g) {
    g.classList.toggle('active', !!v.genOn);
    g.textContent = v.genOn ? '■ Gen ON (tap to stop)' : '⏻ Generator';
  }
}

// Called at ~1 Hz with the latest backend state: update numbers, svg fill, gauges, status classes.
export function refreshCards(vessels) {
  for (const v of vessels) {
    const card = document.querySelector(`.card[data-uid="${v.uid}"]`);
    if (!card) continue;
    const p = levelPct(v);
    const { sev, alarms, flowing } = statusOf(v);
    // Visual feedback: flowing alternates between flow-blue and the status
    // color: blue↔green while healthy, blue↔amber/red while in warning.
    const phase = Math.floor(Date.now() / CARD_BLINK_MS) % 2 === 0;
    let disp = sev;
    let flowTag = '● NORMAL';
    if (flowing && sev === 'ok') {
      disp = phase ? 'flow' : 'ok';
      flowTag = phase ? '● FLOW' : '● NORMAL';
    } else if (flowing) {
      disp = phase ? sev : 'flow';
      flowTag = '● FLOW';
    }
    card.classList.toggle('alarm', disp === 'alarm');
    card.classList.toggle('warn', disp === 'warn');
    card.classList.toggle('filling', flowing);
    const tag = card.querySelector('.tag');
    tag.className = 'tag ' + disp;
    tag.textContent = alarms.length ? alarms.join(' • ') : v.genOn ? '● GEN ON' : flowTag;
    syncToggleButtons(card, v);
    const big = card.querySelector('.big');
    if (v.isDiesel) big.textContent = `${Math.round(v.level).toLocaleString()} L`;
    else big.textContent = `${v.level.toFixed(1)} t`;
    const rows = card.querySelectorAll('.reads .row b');
    if (v.isDiesel) {
      if (rows[0]) rows[0].textContent = `${Math.round(v.level).toLocaleString()} L of ${Math.round(v.capacity).toLocaleString()} L`;
      if (rows[1]) rows[1].textContent = `${Math.round(v.capacity - v.level).toLocaleString()} L`;
      const t = card.querySelector('[data-t]'); if (t) t.textContent = `${v.tempC.toFixed(1)}°C`;
      const gg = card.querySelector('[data-g]'); if (gg) gg.textContent = v.genOn ? `ON • −${v.genRate} L/h` : 'OFF';
      const svg = card.querySelector('.tank-svg'); if (svg) svg.outerHTML = tankSVG(v, p);
    } else {
      if (rows[0]) rows[0].textContent = `${v.level.toFixed(1)} t of ${v.capacity.toFixed(1)} t`;
      if (rows[1]) rows[1].textContent = `${(v.capacity - v.level).toFixed(1)} t`;
      const t = card.querySelector('[data-t]'); if (t) t.textContent = `${v.tempC.toFixed(1)}°C`;
      const h = card.querySelector('[data-h]'); if (h) h.textContent = `${v.moisture.toFixed(1)}%`;
      const a = card.querySelector('[data-a]'); if (a) a.textContent = v.aeration ? '❄ ON' : 'off';
      const svg = card.querySelector('.silo-svg'); if (svg) svg.outerHTML = siloSVG(v, p);
      const gg = gauges.get(v.uid);
      if (gg) { try { gg.temp.value = v.tempC; gg.hum.value = v.moisture; } catch { /* gauge canvas disposed */ } }
    }
    const bar = card.querySelector('[data-bar]'); if (bar) bar.style.width = `${p}%`;
  }
}

// Vessel cards: SVG silo drawing + canvas-gauges radial gauges (library).
import { RadialGauge } from 'canvas-gauges';
import { levelPct, levelM, segments, statusOf, canStartGenerator } from './sim.js';

const gauges = new Map(); // uid -> {temp, hum}

function siloSVG(v, pct) {
  const h = 150, top = 26, bottom = top + h;
  // clamp grain strictly inside the cylinder body so a full silo never
  // paints above the roof cone
  const fillH = Math.max(0, Math.min(h, h * pct / 100));
  const y = bottom - fillH;
  const gid = `g${v.uid}`;
  const grainCol = v.group === 'flour' ? '#efe6d2,#cbb98f' : v.group === 'dirty' ? '#a67c3a,#6e4f1f' : v.group === 'cond' ? '#d9b45c,#9a7a2e' : '#e8bd55,#a67c2a';
  return `<svg class="silo-svg" width="86" height="190" viewBox="0 0 86 190">
    <defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${grainCol.split(',')[0]}"/><stop offset="1" stop-color="${grainCol.split(',')[1]}"/>
    </linearGradient></defs>
    <ellipse cx="43" cy="26" rx="30" ry="10" fill="#9aa6b1"/>
    <rect x="13" y="26" width="60" height="${h}" fill="#c7d0d8" stroke="#5a6a78" stroke-width="2"/>
    ${[0.25, 0.5, 0.75].map(f => `<line x1="13" y1="${26 + h * f}" x2="73" y2="${26 + h * f}" stroke="#ffffff55"/>`).join('')}
    <rect x="15" y="${y}" width="56" height="${fillH}" fill="url(#${gid})"/>
    <path d="M15 ${y} Q28 ${y - 7} 43 ${y} T71 ${y} V${y + 6} H15 Z" fill="${grainCol.split(',')[0]}"/>
    <polygon points="43,2 73,26 13,26" fill="#7d8a96" stroke="#4a565f" stroke-width="2"/>
    <polygon points="13,${26 + h} 43,${26 + h + 14} 73,${26 + h}" fill="#39434d"/>
    <text x="78" y="40" font-size="8" fill="#8aa0b3" font-family="monospace">${v.heightM}m</text>
    <text x="78" y="${26 + h}" font-size="8" fill="#8aa0b3" font-family="monospace">0</text>
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
    <text x="14" y="14" font-size="10" fill="#8aa0b3" font-family="monospace">Ø1.5m × L3.0m : ${pct.toFixed(1)}% (bottom-up)</text>
  </svg>`;
}

export function renderCards(plant, onOpen, onNotify) {
  const grids = { grain: 'grid-grain', dirty: 'grid-dirty', cond: 'grid-cond', flour: 'grid-flour', diesel: 'grid-diesel' };
  Object.values(grids).forEach(id => (document.getElementById(id).innerHTML = ''));
  for (const v of plant.vessels) {
    const card = document.createElement('div');
    card.className = 'card'; card.dataset.uid = v.uid;
    card.innerHTML = cardHTML(v);
    card.addEventListener('click', e => { if (!e.target.closest('button')) onOpen(v); });
    document.getElementById(grids[v.group]).appendChild(card);
    wireCardButtons(card, v, onNotify);
    if (!v.isDiesel) mountGauges(card, v);
  }
}

function cardHTML(v) {
  const p = levelPct(v);
  const m = levelM(v);
  const seg = segments(v);
  const lvl = v.isDiesel
    ? `<div class="big">${Math.round(v.level).toLocaleString()} L</div><div class="row"><span>Dip height</span><b>${m.toFixed(2)} m / 1.50 m</b></div><div class="row"><span>Volume</span><b>${p.toFixed(1)}% of 5 301 L</b></div>`
    : `<div class="big">${v.level.toFixed(1)} t</div><div class="row"><span>Height</span><b>${m.toFixed(1)} m / ${v.heightM} m</b></div><div class="row"><span>Level</span><b>${p.toFixed(1)}% • ${seg.toFixed(1)} seg</b></div>`;
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
  const temp = new RadialGauge({ ...base, renderTo: gt, minValue: 0, maxValue: 50, majorTicks: ['0', '10', '20', '30', '40', '50'], highlights: [{ from: 33, to: 50, color: 'rgba(255,77,77,.7)' }], value: v.tempC });
  const hum = new RadialGauge({ ...base, renderTo: gh, minValue: 8, maxValue: 20, majorTicks: ['8', '11', '14', '17', '20'], highlights: [{ from: 15.2, to: 20, color: 'rgba(255,77,77,.7)' }], value: v.moisture });
  temp.draw(); hum.draw();
  gauges.set(v.uid, { temp, hum });
}

export const FLOW_DEFAULTS = { fill: 60, drain: 60, dieselFill: 500, dieselDrain: 300 };

function wireCardButtons(card, v, onNotify) {
  card.querySelectorAll('button').forEach(b => b.addEventListener('click', e => {
    e.stopPropagation();
    const a = b.dataset.act;
    // Continuous simulation toggles: press once to start, again to stop.
    if (a === 'fill') v.fillRate = v.fillRate > 0 ? 0 : (v.isDiesel ? FLOW_DEFAULTS.dieselFill : FLOW_DEFAULTS.fill);
    if (a === 'drain') v.disRate = v.disRate > 0 ? 0 : FLOW_DEFAULTS.drain;
    if (a === 'gen') {
      if (v.genOn) {
        v.genOn = false;
      } else {
        const chk = canStartGenerator(v);
        if (!chk.ok) {
          if (onNotify) onNotify(chk.reason);
          return;
        }
        v.genOn = true;
      }
    }
    if (a === 'open') card.dispatchEvent(new CustomEvent('open-vessel', { bubbles: true, detail: v }));
    syncToggleButtons(card, v);
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

// Called at ~2 Hz: update numbers, svg fill, gauges, status classes.
export function refreshCards(plant) {
  for (const v of plant.vessels) {
    const card = document.querySelector(`.card[data-uid="${v.uid}"]`);
    if (!card) continue;
    const p = levelPct(v), m = levelM(v);
    const { sev, alarms, flowing } = statusOf(v);
    // Visual feedback: flowing alternates between flow-blue and the status
    // color: blue↔green while healthy, blue↔amber/red while in warning.
    const phase = Math.floor(Date.now() / 600) % 2 === 0;
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
      if (rows[0]) rows[0].textContent = `${m.toFixed(2)} m / 1.50 m`;
      if (rows[1]) rows[1].textContent = `${p.toFixed(1)}% of 5 301 L`;
      const t = card.querySelector('[data-t]'); if (t) t.textContent = `${v.tempC.toFixed(1)}°C`;
      const gg = card.querySelector('[data-g]'); if (gg) gg.textContent = v.genOn ? `ON • −${v.genRate} L/h` : 'OFF';
      const svg = card.querySelector('.tank-svg'); if (svg) svg.outerHTML = tankSVG(v, p);
    } else {
      if (rows[0]) rows[0].textContent = `${m.toFixed(1)} m / ${v.heightM} m`;
      if (rows[1]) rows[1].textContent = `${p.toFixed(1)}% • ${segments(v).toFixed(1)} seg`;
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

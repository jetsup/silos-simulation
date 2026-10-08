// Entry: thin HMI client. The backend owns the simulation and the database;
// this polls live state every second and posts control commands.
import { initPlant3D } from './plant3d.js';
import { initTrend, setTrendWindow, setTrendData } from './trends.js';
import { renderCards, refreshCards } from './ui.js';
import { initReports } from './reports.js';
import { POLL_STATE_MS, REFRESH_SLOW_MS, TOAST_MS } from './silo_credentials.js';

const $ = id => document.getElementById(id);

// Stable client-side vessel objects: merged in place on every poll so the
// 3D scene (which holds references) and gauges never go stale.
const vessels = [];
const byId = new Map();
function mergeState(list) {
  for (const s of list) {
    const v = byId.get(s.id);
    if (v) Object.assign(v, s);
    else {
      const nv = { ...s };
      vessels.push(nv);
      byId.set(s.id, nv);
    }
  }
}

let live = null; // last /api/state payload
let trendId = 'G-01';
let modalId = null;
let showEvents = false;
let cardsBuilt = false;
let view3d = null;
let offlineShown = false;

let toastTimer = 0;
function notify(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), TOAST_MS);
}

async function api(path, opts) {
  const r = await fetch(path, opts);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
  return data;
}

// ---- controls: every change goes to the backend, then re-renders ----
async function control(id, patch) {
  try {
    const r = await api('/api/control', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, patch })
    });
    applyState(r.state);
  } catch (e) {
    notify(e.message);
  }
}

async function global(patch) {
  try {
    const r = await api('/api/global', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch)
    });
    applyState(r.state);
  } catch (e) {
    notify(e.message);
  }
}

function applyState(st) {
  if (!st) return;
  live = st;
  mergeState(st.vessels);
  if (!cardsBuilt && vessels.length) {
    renderCards(vessels, openModal, control);
    fillTrendSel();
    view3d = initPlant3D($('plant3d'), { vessels }, openModal);
    initTrend($('trend'));
    cardsBuilt = true;
  }
  refreshCards(vessels);
  view3d?.update();
  updateKpis(st);
  syncHeaderButtons(st);
  if (modalId && !$('modal').classList.contains('hidden')) drawModal();
  if (showEvents) renderFeed();
}

async function fetchState() {
  try {
    const st = await api('/api/state');
    if (offlineShown) {
      offlineShown = false;
      notify('Backend reconnected.');
    }
    applyState(st);
  } catch {
    if (!offlineShown) {
      offlineShown = true;
      notify('Backend offline! Start it with npm run server. Retrying…');
    }
  }
}

// trend selector (options come from the database-backed state)
function fillTrendSel() {
  const s = $('sel-trend');
  s.innerHTML = vessels.map(v => `<option value="${v.id}">${v.id} : ${v.name}</option>`).join('');
  if (!byId.has(trendId) && vessels.length) trendId = vessels[0].id;
  s.value = trendId;
  s.onchange = () => {
    trendId = s.value;
    refreshTrend();
  };
}

async function refreshTrend() {
  const v = byId.get(trendId);
  if (!v) return;
  try {
    const rows = await api(`/api/readings?vesselId=${encodeURIComponent(trendId)}&limit=240`);
    setTrendData(rows, v.capacity, v.isDiesel);
  } catch {
    /* backend offline: keep the previous chart */
  }
}

// modal
function openModal(v) {
  modalId = v.id;
  $('modal').classList.remove('hidden');
  drawModal();
}
function drawModal() {
  const v = byId.get(modalId);
  if (!v) return;
  $('m-title').textContent = `${v.id} : ${v.name}`;
  const metricCls = (re) => {
    const hit = v.alarms.find(a => re.test(a.toLowerCase()));
    if (!hit) return '';
    return /hi-hi|hot|wet|critical/.test(hit.toLowerCase()) ? 'alarm-text' : 'warn-text';
  };
  const lvlCls = metricCls(/level/), tmpCls = metricCls(/hot|warm/), mstCls = metricCls(/wet|moist/);
  const mcard = document.querySelector('.modal-card');
  mcard.classList.toggle('alarm', v.sev === 'alarm');
  mcard.classList.toggle('warn', v.sev === 'warn');
  $('m-stats').innerHTML = v.isDiesel ? `
    <div><label>VOLUME</label><b class="${lvlCls}">${Math.round(v.level).toLocaleString()} L</b></div>
    <div><label>CAPACITY</label><b>${Math.round(v.capacity).toLocaleString()} L</b></div>
    <div><label>SPACE LEFT</label><b>${Math.round(v.capacity - v.level).toLocaleString()} L</b></div>
    <div><label>FUEL TEMP</label><b class="${tmpCls}">${v.tempC.toFixed(1)} °C</b></div>
    <div><label>GENERATOR</label><b>${v.genOn ? `ON • −${v.genRate} L/h` : 'OFF'}</b></div>`
    : `
    <div><label>STOCK</label><b class="${lvlCls}">${v.level.toFixed(1)} t</b></div>
    <div><label>CAPACITY</label><b>${v.capacity.toFixed(1)} t</b></div>
    <div><label>SPACE LEFT</label><b>${(v.capacity - v.level).toFixed(1)} t</b></div>
    <div><label>TEMP</label><b class="${tmpCls}">${v.tempC.toFixed(1)} °C</b></div>
    <div><label>MOISTURE</label><b class="${mstCls}">${v.moisture.toFixed(1)} %</b></div>
    <div><label>AERATION</label><b>${v.aeration ? '❄ ON' : 'off'}</b></div>`;
  $('m-viz').innerHTML = `<div class="bar" style="height:14px"><i style="display:block;height:100%;width:${v.pct}%;background:linear-gradient(90deg,#37c6ff,#ffb020)"></i></div>
    <p class="hint">${v.isDiesel ? `Capacity ${Math.round(v.capacity).toLocaleString()} L • Ø1.5 m × L3.0 m horizontal cylinder. Generator draws ${v.genRate} L/h while ON.` : `Capacity ${v.capacity} t • ${v.heightM} m • ${v.capacity / 10} segments × 10 t.`} Fill ${v.fillRate} / discharge ${v.disRate} ${v.rateUnit}.</p>`;
  $('m-fill').max = v.isDiesel ? 1000 : 120;
  $('m-dis').max = v.isDiesel ? 1000 : 120;
  $('m-fill').value = v.fillRate;
  $('m-dis').value = v.disRate;
  $('m-fill-v').textContent = `${v.fillRate} ${v.rateUnit}`;
  $('m-dis-v').textContent = `${v.disRate} ${v.rateUnit}`;
  $('m-aer').textContent = v.isDiesel ? (v.genOn ? '■ Generator ON (tap to stop)' : '⏻ Start generator') : (v.aeration ? '❄ Aeration ON (tap to stop)' : '❄ Toggle aeration');
  $('m-add').textContent = v.isDiesel ? '+200 L' : '+10 t';
  $('m-rem').textContent = v.isDiesel ? '−200 L' : '−10 t';
}

// global controls
$('btn-play').onclick = () => global({ playing: !(live && live.playing) });
$('sel-speed').onchange = e => global({ speed: +e.target.value });
function syncHeaderButtons(st) {
  $('btn-play').textContent = st.playing ? '⏸ Pause' : '▶ Play';
  if (+$('sel-speed').value !== st.speed) $('sel-speed').value = String(st.speed);
  const f = $('btn-fill-all');
  f.classList.toggle('active', st.fillAll);
  f.textContent = st.fillAll ? '■ Filling all' : '▲ Fill all';
  const e = $('btn-empty-all');
  e.classList.toggle('active', st.emptyAll);
  e.textContent = st.emptyAll ? '■ Emptying all' : '▼ Empty all';
  const v = $('btn-events');
  v.classList.toggle('active', showEvents);
  v.textContent = showEvents ? '● Events on' : '⚡ Events';
}
$('btn-fill-all').onclick = () => global({ fillAll: !(live && live.fillAll) });
$('btn-empty-all').onclick = () => global({ emptyAll: !(live && live.emptyAll) });
$('btn-events').onclick = () => setEvents(!showEvents);
$('feed-close').onclick = () => setEvents(false);
$('btn-reset').onclick = async () => {
  try {
    const r = await api('/api/reset', { method: 'POST' });
    applyState(r.state);
    notify('Plant reset to initial conditions.');
  } catch (e) {
    notify(e.message);
  }
};
$('sel-range').onchange = e => {
  setTrendWindow(+e.target.value);
  refreshTrend();
};
document.querySelectorAll('.nav').forEach(b => b.onclick = () => {
  document.querySelectorAll('.nav').forEach(x => x.classList.remove('active'));
  b.classList.add('active');
  const f = b.dataset.filter;
  document.querySelectorAll('.group[data-group]').forEach(g => {
    if (['grain', 'dirty', 'cond', 'flour', 'diesel', 'reports'].includes(g.dataset.group))
      g.style.display = f === 'all' || f === g.dataset.group ? '' : 'none';
  });
  view3d?.setFocus(f);
});

// modal wiring
$('m-close').onclick = () => $('modal').classList.add('hidden');
$('modal').addEventListener('click', e => { if (e.target.id === 'modal') $('modal').classList.add('hidden'); });
$('fab').onclick = () => $('info-modal').classList.remove('hidden');
$('info-close').onclick = () => $('info-modal').classList.add('hidden');
$('info-modal').addEventListener('click', e => { if (e.target.id === 'info-modal') $('info-modal').classList.add('hidden'); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') { $('info-modal').classList.add('hidden'); $('modal').classList.add('hidden'); } });
document.addEventListener('open-vessel', e => openModal(e.detail));
$('m-fill').oninput = e => {
  const v = byId.get(modalId);
  if (v) $('m-fill-v').textContent = `${e.target.value} ${v.rateUnit}`;
};
$('m-fill').onchange = e => { if (modalId) control(modalId, { fillRate: +e.target.value }); };
$('m-dis').oninput = e => {
  const v = byId.get(modalId);
  if (v) $('m-dis-v').textContent = `${e.target.value} ${v.rateUnit}`;
};
$('m-dis').onchange = e => { if (modalId) control(modalId, { disRate: +e.target.value }); };
$('m-add').onclick = () => { const v = byId.get(modalId); if (v) control(modalId, { bump: v.isDiesel ? 200 : 10 }); };
$('m-add1').onclick = () => { if (modalId) control(modalId, { bump: 10 }); };
$('m-rem').onclick = () => { const v = byId.get(modalId); if (v) control(modalId, { bump: v.isDiesel ? -200 : -10 }); };
$('m-aer').onclick = () => {
  const v = byId.get(modalId);
  if (!v) return;
  if (v.isDiesel) control(modalId, { genOn: !v.genOn });
  else control(modalId, { aeration: !v.aeration });
};
$('m-topup').onclick = () => { if (modalId) control(modalId, { topup: true }); };
$('m-empty').onclick = () => { if (modalId) control(modalId, { empty: true }); };

function collectAlarms() {
  const out = [];
  for (const v of vessels) {
    v.alarms.forEach(a => out.push({ text: `${v.id}: ${a}`, sev: /HI-HI|HOT|WET|CRITICAL/.test(a) ? 'alarm' : 'warn' }));
  }
  return out;
}

function renderFeed() {
  const list = $('feed-list');
  const al = collectAlarms();
  list.innerHTML = al.length
    ? al.map(a => `<li class="${a.sev}">${a.text}</li>`).join('')
    : '<li class="ok">All clear. No active warnings</li>';
}

function setEvents(on) {
  showEvents = on;
  $('event-feed').classList.toggle('hidden', !on);
  if (on) renderFeed();
  if (live) syncHeaderButtons(live);
}

function updateKpis(st) {
  const grains = st.vessels.filter(v => !v.isDiesel);
  const stock = grains.reduce((s, v) => s + v.level, 0);
  const cap = grains.reduce((s, v) => s + v.capacity, 0);
  $('kpi-stock').textContent = `${Math.round(stock).toLocaleString()} t`;
  $('kpi-stock-sub').textContent = `of ${cap.toLocaleString()} t capacity`;
  $('kpi-temp').textContent = `${(grains.reduce((s, v) => s + v.tempC, 0) / grains.length).toFixed(1)}°C`;
  $('kpi-temp-sub').textContent = `ambient ${st.ambient.temp.toFixed(1)}°C`;
  $('kpi-hum').textContent = `${(grains.reduce((s, v) => s + v.moisture, 0) / grains.length).toFixed(1)}%`;
  const dz = st.vessels.find(v => v.isDiesel);
  $('kpi-diesel').textContent = `${Math.round(dz.level).toLocaleString()} L`;
  $('kpi-diesel-sub').textContent = `${Math.round(dz.capacity - dz.level).toLocaleString()} L space left`;
  const al = collectAlarms();
  const texts = al.map(a => a.text);
  $('kpi-alarm').textContent = al.length;
  $('kpi-alarm').style.color = al.length ? 'var(--alarm)' : 'var(--ok)';
  $('kpi-alarm-sub').textContent = al.length ? texts.slice(0, 2).join(' • ') + (al.length > 2 ? ` +${al.length - 2}` : '') : 'all clear';
  const bar = $('alarm-bar');
  if (al.length) { bar.classList.remove('hidden'); bar.textContent = `⚠ ${al.length} active : ${texts.slice(0, 4).join(' • ')}`; }
  else bar.classList.add('hidden');
  $('amb-t').textContent = `${st.ambient.temp.toFixed(1)}°C`;
  $('amb-h').textContent = `${st.ambient.rh.toFixed(0)}%`;
  $('clock').textContent = new Date().toLocaleTimeString();
  $('sim-time').textContent = `T+${st.simHours.toFixed(1)}h • ${st.speed}×`;
}

// ---- boot + polling: live state on POLL_STATE_MS, trend/feed on REFRESH_SLOW_MS ----
async function loadConfig() {
  try {
    const c = await api('/api/config');
    if (c.systemName) {
      $('brand-name').textContent = c.systemName;
      document.title = c.systemName;
    }
  } catch {
    /* backend offline: keep the baked-in name */
  }
}
loadConfig();
fetchState();
setInterval(fetchState, POLL_STATE_MS);
setInterval(() => {
  refreshTrend();
  if (showEvents) renderFeed();
}, REFRESH_SLOW_MS);
initReports(() => ({ vessels, simHours: live ? live.simHours : 0 }), notify);

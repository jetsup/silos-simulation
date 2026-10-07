// Entry: wires sim engine + three.js 3D + chart.js trend + canvas-gauges cards.
import { createPlant, tick, ambientAt, levelPct, levelM, segments, statusOf, canStartGenerator, DIESEL_VMAX } from './sim.js';
import { initPlant3D } from './plant3d.js';
import { initTrend, pushTrend, setTrendWindow } from './trends.js';
import { renderCards, refreshCards } from './ui.js';

let plant = createPlant();
let trendVessel = plant.vessels[0];
let modalVessel = null;
let lastTick = performance.now(), acc = 0, lastUi = 0, lastTrend = 0, lastFeed = 0;

const $ = id => document.getElementById(id);

let toastTimer = 0;
function notify(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 5000);
}

// trend selector
function fillTrendSel() {
  const s = $('sel-trend');
  s.innerHTML = plant.vessels.map(v => `<option value="${v.uid}">${v.id}: ${v.name}</option>`).join('');
  s.value = trendVessel.uid;
  s.onchange = () => { trendVessel = plant.vessels.find(v => v.uid === +s.value); };
}

// modal
function openModal(v) {
  modalVessel = v;
  $('modal').classList.remove('hidden');
  drawModal();
}
function drawModal() {
  const v = modalVessel; if (!v) return;
  $('m-title').textContent = `${v.id}: ${v.name}`;
  const p = levelPct(v), m = levelM(v);
  // modal border blinks red on alarm; the offending values take warning colors
  const st = statusOf(v);
  const mcard = document.querySelector('.modal-card');
  mcard.classList.toggle('alarm', st.sev === 'alarm');
  mcard.classList.toggle('warn', st.sev === 'warn');
  const metricCls = (re) => {
    const hit = st.alarms.find(a => re.test(a.toLowerCase()));
    if (!hit) return '';
    return /hi-hi|hot|wet/.test(hit.toLowerCase()) ? 'alarm-text' : 'warn-text';
  };
  const lvlCls = metricCls(/level/), tmpCls = metricCls(/hot|warm/), mstCls = metricCls(/wet|moist/);
  $('m-stats').innerHTML = v.isDiesel ? `
    <div><label>VOLUME</label><b>${Math.round(v.level).toLocaleString()} L</b></div>
    <div><label>LEVEL</label><b class="${lvlCls}">${p.toFixed(1)}%</b></div>
    <div><label>DIP HEIGHT</label><b class="${lvlCls}">${m.toFixed(2)} m</b></div>
    <div><label>FUEL TEMP</label><b class="${tmpCls}">${v.tempC.toFixed(1)} °C</b></div>
    <div><label>GENERATOR</label><b>${v.genOn ? `ON • −${v.genRate} L/h` : 'OFF'}</b></div>`
    : `
    <div><label>STOCK</label><b>${v.level.toFixed(1)} t</b></div>
    <div><label>LEVEL</label><b class="${lvlCls}">${p.toFixed(1)}% • ${m.toFixed(1)} m</b></div>
    <div><label>SEGMENTS</label><b class="${lvlCls}">${segments(v).toFixed(1)} / ${v.capacity / 10}</b></div>
    <div><label>TEMP</label><b class="${tmpCls}">${v.tempC.toFixed(1)} °C</b></div>
    <div><label>MOISTURE</label><b class="${mstCls}">${v.moisture.toFixed(1)} %</b></div>
    <div><label>AERATION</label><b>${v.aeration ? '❄ ON' : 'off'}</b></div>`;
  $('m-viz').innerHTML = `<div class="bar" style="height:14px"><i style="display:block;height:100%;width:${p}%;background:linear-gradient(90deg,#37c6ff,#ffb020)"></i></div>
    <p class="hint">${v.isDiesel ? `Capacity ${Math.round(v.capacity).toLocaleString()} L • Ø1.5 m × L3.0 m horizontal cylinder. Generator draws ${v.genRate} L/h while ON.` : `Capacity ${v.capacity} t • ${v.heightM} m • ${v.capacity / 10} segments × 10 t.`} Fill ${v.fillRate} / discharge ${v.disRate} ${v.rateUnit}.</p>`;
  $('m-fill').max = v.isDiesel ? 1000 : 120; $('m-dis').max = v.isDiesel ? 1000 : 120;
  $('m-fill').value = v.fillRate; $('m-dis').value = v.disRate;
  $('m-fill-v').textContent = `${v.fillRate} ${v.rateUnit}`; $('m-dis-v').textContent = `${v.disRate} ${v.rateUnit}`;
  $('m-aer').textContent = v.isDiesel ? (v.genOn ? '■ Generator ON (tap to stop)' : '⏻ Start generator') : (v.aeration ? '❄ Aeration ON (tap to stop)' : '❄ Toggle aeration');
  $('m-add').textContent = v.isDiesel ? '+200 L' : '+10 t';
  $('m-rem').textContent = v.isDiesel ? '−200 L' : '−10 t';
}

// global controls
$('btn-play').onclick = () => { plant.playing = !plant.playing; $('btn-play').textContent = plant.playing ? '⏸ Pause' : '▶ Play'; };
$('sel-speed').onchange = e => (plant.speed = +e.target.value);
function setFillAll(on) {
  plant.fillAll = on;
  if (on) {
    plant.emptyAll = false;
    plant.vessels.forEach(v => { v.disRate = 0; v.fillRate = v.isDiesel ? 500 : 60; });
  } else {
    plant.vessels.forEach(v => { v.fillRate = 0; });
  }
  syncHeaderButtons();
}
function setEmptyAll(on) {
  plant.emptyAll = on;
  if (on) {
    plant.fillAll = false;
    plant.vessels.forEach(v => { v.fillRate = 0; v.disRate = v.isDiesel ? 300 : 60; });
  } else {
    plant.vessels.forEach(v => { v.disRate = 0; });
  }
  syncHeaderButtons();
}
function setEvents(on) {
  plant.showEvents = on;
  $('event-feed').classList.toggle('hidden', !on);
  if (on) {
    lastFeed = 0;
    renderFeed();
  }
  syncHeaderButtons();
}
function syncHeaderButtons() {
  const f = $('btn-fill-all');
  f.classList.toggle('active', plant.fillAll);
  f.textContent = plant.fillAll ? '■ Filling all' : '▲ Fill all';
  const e = $('btn-empty-all');
  e.classList.toggle('active', plant.emptyAll);
  e.textContent = plant.emptyAll ? '■ Emptying all' : '▼ Empty all';
  const v = $('btn-events');
  v.classList.toggle('active', plant.showEvents);
  v.textContent = plant.showEvents ? '● Events on' : '⚡ Events';
}
$('btn-fill-all').onclick = () => setFillAll(!plant.fillAll);
$('btn-empty-all').onclick = () => setEmptyAll(!plant.emptyAll);
$('btn-events').onclick = () => setEvents(!plant.showEvents);
$('feed-close').onclick = () => setEvents(false);
$('btn-reset').onclick = () => {
  plant = createPlant();
  trendVessel = plant.vessels[0];
  boot(false);
  syncHeaderButtons();
  $('event-feed').classList.add('hidden');
};
$('sel-range').onchange = e => setTrendWindow(+e.target.value);
document.querySelectorAll('.nav').forEach(b => b.onclick = () => {
  document.querySelectorAll('.nav').forEach(x => x.classList.remove('active'));
  b.classList.add('active');
  const f = b.dataset.filter;
  document.querySelectorAll('.group[data-group]').forEach(g => {
    if (['grain', 'dirty', 'cond', 'flour', 'diesel'].includes(g.dataset.group))
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
$('m-fill').oninput = e => { if (modalVessel) { modalVessel.fillRate = +e.target.value; drawModal(); } };
$('m-dis').oninput = e => { if (modalVessel) { modalVessel.disRate = +e.target.value; drawModal(); } };
const bump = d => { if (!modalVessel) return; modalVessel.level = Math.min(Math.max(modalVessel.level + d, 0), modalVessel.capacity); drawModal(); };
$('m-add').onclick = () => bump(modalVessel.isDiesel ? 200 : 10);
$('m-add1').onclick = () => bump(10);
$('m-rem').onclick = () => bump(modalVessel.isDiesel ? -200 : -10);
$('m-aer').onclick = () => {
  if (!modalVessel) return;
  if (modalVessel.isDiesel) {
    if (modalVessel.genOn) {
      modalVessel.genOn = false;
    } else {
      const chk = canStartGenerator(modalVessel);
      if (!chk.ok) {
        notify(chk.reason);
        return;
      }
      modalVessel.genOn = true;
    }
  } else modalVessel.aeration = !modalVessel.aeration;
  drawModal();
};
$('m-topup').onclick = () => { if (modalVessel) { modalVessel.level = modalVessel.capacity * 0.95; drawModal(); } };
$('m-empty').onclick = () => { if (modalVessel) { modalVessel.level = 0; modalVessel.fillRate = 0; drawModal(); } };

function collectAlarms() {
  const out = [];
  for (const v of plant.vessels) {
    const { alarms } = statusOf(v);
    alarms.forEach(a => out.push({ text: `${v.id}: ${a}`, sev: /HI-HI|HOT|WET/.test(a) ? 'alarm' : 'warn' }));
  }
  return out;
}

function renderFeed() {
  const list = $('feed-list');
  const al = collectAlarms();
  list.innerHTML = al.length
    ? al.map(a => `<li class="${a.sev}">${a.text}</li>`).join('')
    : '<li class="ok">All clear, no active warnings</li>';
}

function updateKpis(amb) {
  const grains = plant.vessels.filter(v => !v.isDiesel);
  const stock = grains.reduce((s, v) => s + v.level, 0);
  const cap = grains.reduce((s, v) => s + v.capacity, 0);
  $('kpi-stock').textContent = `${Math.round(stock).toLocaleString()} t`;
  $('kpi-stock-sub').textContent = `${(stock / cap * 100).toFixed(1)}% of ${cap.toLocaleString()} t`;
  $('kpi-temp').textContent = `${(grains.reduce((s, v) => s + v.tempC, 0) / grains.length).toFixed(1)}°C`;
  $('kpi-temp-sub').textContent = `ambient ${amb.temp.toFixed(1)}°C`;
  $('kpi-hum').textContent = `${(grains.reduce((s, v) => s + v.moisture, 0) / grains.length).toFixed(1)}%`;
  const dz = plant.vessels.find(v => v.isDiesel);
  $('kpi-diesel').textContent = `${Math.round(dz.level).toLocaleString()} L`;
  $('kpi-diesel-sub').textContent = `${levelPct(dz).toFixed(0)}% of ${Math.round(DIESEL_VMAX).toLocaleString()} L`;
  const al = collectAlarms();
  const texts = al.map(a => a.text);
  $('kpi-alarm').textContent = al.length;
  $('kpi-alarm').style.color = al.length ? 'var(--alarm)' : 'var(--ok)';
  $('kpi-alarm-sub').textContent = al.length ? texts.slice(0, 2).join(' • ') + (al.length > 2 ? ` +${al.length - 2}` : '') : 'all clear';
  const bar = $('alarm-bar');
  if (al.length) { bar.classList.remove('hidden'); bar.textContent = `⚠ ${al.length} active : ${texts.slice(0, 4).join(' • ')}`; }
  else bar.classList.add('hidden');
  $('amb-t').textContent = `${amb.temp.toFixed(1)}°C`;
  $('amb-h').textContent = `${amb.rh.toFixed(0)}%`;
  const d = new Date();
  $('clock').textContent = d.toLocaleTimeString();
  $('sim-time').textContent = `T+${plant.simHours.toFixed(1)}h • ${plant.speed}×`;
}

// ---- boot ----
let view3d = null;
function boot(first = true) {
  renderCards(plant, openModal, notify);
  fillTrendSel();
  if (first) {
    view3d = initPlant3D($('plant3d'), plant, openModal);
    initTrend($('trend'), () => trendVessel);
  } else {
    view3d?.destroy();
    view3d = initPlant3D($('plant3d'), plant, openModal);
  }
  if (modalVessel) { modalVessel = plant.vessels.find(v => v.id === modalVessel.id) || null; if (modalVessel) drawModal(); }
}

boot();

// ---- main loop: advance sim by real dt × speed, refresh UI at 2Hz ----
function frame(now) {
  requestAnimationFrame(frame);
  const realDt = Math.min((now - lastTick) / 1000, 1);
  lastTick = now;
  if (plant.playing) {
    acc += realDt;
    // fixed 1s sim steps, scaled by speed
    let steps = acc * plant.speed;
    const maxSteps = 600; // avoid spiral
    steps = Math.min(steps, maxSteps);
    for (let i = 0; i < Math.floor(steps); i++) tick(plant, 1);
    acc -= Math.floor(steps) / plant.speed;
    if (acc > 2) acc = 0;
  }
  if (now - lastUi > 500) {
    lastUi = now;
    const amb = ambientAt(plant.simHours);
    refreshCards(plant);
    view3d?.update();
    updateKpis(amb);
    if (modalVessel && !$('modal').classList.contains('hidden')) drawModal();
  }
  if (now - lastTrend > 1500) { lastTrend = now; pushTrend(() => trendVessel); }
  if (plant.showEvents && now - lastFeed > 5000) { lastFeed = now; renderFeed(); }
}
requestAnimationFrame(frame);

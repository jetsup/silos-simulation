// Reports UI: the backend owns the simulation and records every snapshot to
// SQLite; this form builds filtered CSV / HTML-report downloads from that data.
let getPlant = () => null;

const el = id => document.getElementById(id);

function params() {
  const q = new URLSearchParams();
  const vessel = el('rep-vessel').value;
  if (vessel) q.set('vesselId', vessel);
  if (!el('rep-all').checked) {
    const from = el('rep-from').value, to = el('rep-to').value;
    if (from) q.set('from', new Date(from).toISOString());
    if (to) q.set('to', new Date(to).toISOString());
  }
  return q.toString();
}

function saveBlob(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

async function download(url, fallbackName, notify) {
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    // Prefer the timestamped filename the server sends, e.g. plant-report-G-01-20261008T153045.pdf.
    const cd = r.headers.get('Content-Disposition') || '';
    const m = cd.match(/filename="([^"]+)"/);
    saveBlob(await r.blob(), m ? m[1] : fallbackName);
    notify('Download started.');
  } catch {
    notify('Download failed — is the backend running (npm run server)?');
  }
}

async function refreshVessels() {
  const plant = getPlant();
  const sel = el('rep-vessel');
  const current = sel.value;
  let options = plant ? plant.vessels.map(v => ({ id: v.id, name: `${v.id} : ${v.name}` })) : [];
  try {
    const db = await (await fetch('/api/vessels')).json();
    if (db.length) options = db.map(v => ({ id: v.id, name: `${v.id} : ${v.name}` }));
  } catch {
    /* backend offline: fall back to the live plant list */
  }
  sel.innerHTML = '<option value="">All vessels</option>' + options.map(o => `<option value="${o.id}">${o.name}</option>`).join('');
  if (options.some(o => o.id === current)) sel.value = current;
}

async function refreshStats() {
  const st = el('rep-status');
  try {
    const s = await (await fetch('/api/stats')).json();
    const span = s.from ? ` • ${new Date(s.from).toLocaleString()} → ${new Date(s.to).toLocaleString()}` : '';
    st.textContent = `Database: ${Number(s.readings).toLocaleString()} readings from ${s.vessels} vessels${span}. Snapshots recorded every 5 s.`;
  } catch {
    st.textContent = 'Backend offline. Start it with npm run server to record history and enable downloads.';
  }
}

export function initReports(getPlantFn, notify) {
  getPlant = getPlantFn;
  el('rep-view').onclick = () => window.open(`/api/report?${params()}`, '_blank');
  el('rep-download').onclick = () => download(`/api/report.pdf?${params()}`, 'plant-report.pdf', notify);
  el('rep-csv').onclick = () => download(`/api/export.csv?${params()}`, 'plant-data.csv', notify);
  const toggleDates = () => {
    const off = el('rep-all').checked;
    el('rep-from').disabled = off;
    el('rep-to').disabled = off;
  };
  el('rep-all').onchange = toggleDates;
  toggleDates();
  refreshVessels();
  refreshStats();
  setInterval(refreshStats, 15000);
}

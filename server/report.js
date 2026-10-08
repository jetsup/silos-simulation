// Self-contained HTML report builder: stat cards, SVG charts, vessel visuals.
// Charts are rendered as inline SVG so the report works offline and prints well.

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmtT(ts) {
  const d = new Date(ts);
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// Multi-series SVG line chart. series: [{label, color, points:[{t, v}]}]
function lineChart(series, { title, unit, width = 760, height = 230 }) {
  const padL = 52, padR = 12, padT = 14, padB = 30;
  const W = width - padL - padR, H = height - padT - padB;
  const all = series.flatMap(s => s.points.map(p => p.v)).filter(v => Number.isFinite(v));
  if (!all.length) return `<p class="muted">No data for ${esc(title)}.</p>`;
  let lo = Math.min(...all), hi = Math.max(...all);
  if (hi - lo < 1e-9) {
    lo -= 1;
    hi += 1;
  }
  const span = hi - lo;
  lo -= span * 0.08;
  hi += span * 0.08;
  const t0 = Math.min(...series.flatMap(s => s.points.map(p => p.t)));
  const t1 = Math.max(...series.flatMap(s => s.points.map(p => p.t)));
  const X = t => padL + (t1 === t0 ? W / 2 : ((t - t0) / (t1 - t0)) * W);
  const Y = v => padT + H - ((v - lo) / (hi - lo)) * H;
  const grid = [0, 0.25, 0.5, 0.75, 1]
    .map(f => {
      const v = lo + (hi - lo) * f, y = Y(v);
      return `<line x1="${padL}" y1="${y}" x2="${padL + W}" y2="${y}" class="grid"/><text x="${padL - 6}" y="${y + 4}" class="ylab">${v.toFixed(1)}</text>`;
    })
    .join('');
  const paths = series
    .map(s => {
      const d = s.points.map((p, i) => `${i ? 'L' : 'M'}${X(p.t).toFixed(1)},${Y(p.v).toFixed(1)}`).join(' ');
      return `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2"/>`;
    })
    .join('');
  const legend = series.map(s => `<span class="lg"><i style="background:${s.color}"></i>${esc(s.label)}</span>`).join('');
  return `<div class="chart"><h3>${esc(title)} <small>(${esc(unit)})</small></h3>
    <svg viewBox="0 0 ${width} ${height}" role="img">
    ${grid}${paths}
    <text x="${padL}" y="${height - 8}" class="ylab">${esc(fmtT(t0))}</text>
    <text x="${padL + W}" y="${height - 8}" class="ylab end">${esc(fmtT(t1))}</text>
    </svg><div class="legend">${legend}</div></div>`;
}

// Vertical vessel bar showing last stock in tonnes (litres for diesel).
function vesselBar(id, level, capacity, unit, color) {
  const h = 120, pct = (level / (capacity || 1)) * 100;
  const fill = Math.max(0, Math.min(h, (h * pct) / 100)), y = 10 + h - fill;
  const label = unit === 'L' ? `${Math.round(level).toLocaleString()} L` : `${level.toFixed(1)} t`;
  return `<div class="vbar"><svg viewBox="0 0 60 ${h + 30}">
    <rect x="12" y="10" width="36" height="${h}" rx="6" class="shell"/>
    <rect x="12" y="${y}" width="${36}" height="${fill}" rx="6" fill="${color}"/>
    <text x="30" y="${h + 24}" class="vlab">${esc(id)}</text>
    </svg><b>${label}</b></div>`;
}

function summarize(rows) {
  // rows: readings for one vessel, ascending. Returns stats object.
  const temps = rows.map(r => r.temp_c).filter(Number.isFinite);
  const moist = rows.map(r => r.moisture).filter(v => Number.isFinite(v) && v !== 0);
  const avg = a => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN);
  return {
    n: rows.length,
    tAvg: avg(temps),
    tMax: temps.length ? Math.max(...temps) : NaN,
    mAvg: avg(moist),
    mMax: moist.length ? Math.max(...moist) : NaN,
    last: rows[rows.length - 1]
  };
}

export function buildReport({ systemName = 'GRAINPLANT SCADA', title, period, vessels, rowsByVessel, capacities, generatedAt }) {
  const cards = [];
  const charts = [];
  const bars = [];
  for (const v of vessels) {
    const rows = rowsByVessel[v.id] || [];
    if (!rows.length) continue;
    const s = summarize(rows);
    const cap = capacities[v.id] || 1;
    const stock = x => (v.unit === 'L' ? `${Math.round(x).toLocaleString()} L` : `${x.toFixed(1)} t`);
    const lvlAvg = rows.reduce((a, r) => a + r.level, 0) / rows.length;
    const lvlMin = Math.min(...rows.map(r => r.level));
    const lvlMax = Math.max(...rows.map(r => r.level));
    cards.push(`<div class="stat"><h4>${esc(v.id)}</h4>
      <div><span>Readings</span><b>${s.n}</b></div>
      <div><span>Stock avg</span><b>${stock(lvlAvg)}</b></div>
      <div><span>Stock min–max</span><b>${stock(lvlMin)} – ${stock(lvlMax)}</b></div>
      <div><span>Temp avg / max</span><b>${s.tAvg.toFixed(1)} / ${s.tMax.toFixed(1)} °C</b></div>
      ${Number.isFinite(s.mAvg) ? `<div><span>Moisture avg / max</span><b>${s.mAvg.toFixed(1)} / ${s.mMax.toFixed(1)} %</b></div>` : ''}
    </div>`);
    bars.push(vesselBar(v.id, s.last.level, cap, v.unit, '#e8a93d'));
  }
  // stock chart (every vessel with data, in tonnes / litres) + temperature /
  // moisture charts covering every vessel, so the full plant is represented
  const withRows = vessels.filter(v => (rowsByVessel[v.id] || []).length);
  const palette = ['#e8a93d', '#37c6ff', '#ff4d6d', '#2ecc71', '#b388ff', '#ff8c42', '#4dd0a6', '#e06ba7'];
  const col = i => palette[i % palette.length];
  const tOf = r => new Date(r.ts).getTime();
  if (withRows.length) {
    charts.push(
      lineChart(
        withRows.map((v, i) => ({
          label: v.id,
          color: col(i),
          points: rowsByVessel[v.id].map(r => ({ t: tOf(r), v: r.level }))
        })),
        { title: 'Stock over time (all vessels)', unit: 't (diesel: L)' }
      )
    );
    charts.push(
      lineChart(
        withRows.map((v, i) => ({
          label: v.id,
          color: col(i),
          points: rowsByVessel[v.id].map(r => ({ t: tOf(r), v: r.temp_c }))
        })),
        { title: 'Temperature (all vessels)', unit: '°C' }
      )
    );
    const moistVessels = withRows.filter(v => rowsByVessel[v.id].some(r => r.moisture));
    if (moistVessels.length) {
      charts.push(
        lineChart(
          moistVessels.map((v, i) => ({
            label: v.id,
            color: col(i),
            points: rowsByVessel[v.id].map(r => ({ t: tOf(r), v: r.moisture }))
          })),
          { title: 'Moisture (all vessels)', unit: '% grain moisture' }
        )
      );
    }
  }
  const totalRows = Object.values(rowsByVessel).reduce((a, r) => a + r.length, 0);
  // latest reading of every vessel (not just the first one)
  const latest = withRows.map(v => ({ id: v.id, row: rowsByVessel[v.id][rowsByVessel[v.id].length - 1] }));
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<title>${esc(systemName)}:: ${esc(title)}</title>
<style>
body{font-family:system-ui,-apple-system,'Segoe UI',sans-serif;background:#0e1620;color:#e8eef4;margin:0;padding:28px}
.wrap{max-width:960px;margin:0 auto}
h1{margin:0;font-size:24px}h1 span{color:#ffb020}
.sub{color:#8aa0b3;font-size:13px;margin:4px 0 18px}
.stats{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px;margin-bottom:18px}
.stat{background:#182430;border:1px solid #243445;border-radius:10px;padding:10px 14px}
.stat h4{margin:0 0 6px;font-size:13px;color:#ffb020}
.stat div{display:flex;justify-content:space-between;font-size:12px;padding:2px 0}
.stat span{color:#8aa0b3}.stat b{font-variant-numeric:tabular-nums}
.bars{display:flex;gap:14px;flex-wrap:wrap;margin-bottom:18px}
.vbar{text-align:center}.vbar svg{width:60px}.vbar b{font-size:12px}
.shell{fill:#22303f;stroke:#355062}.vlab{fill:#8aa0b3;font-size:9px;text-anchor:middle}
.chart{background:#121b24;border:1px solid #243445;border-radius:12px;padding:12px 14px;margin-bottom:16px}
.chart h3{margin:0 0 6px;font-size:14px}.chart small{color:#8aa0b3}
.chart svg{width:100%;height:auto}.grid{stroke:#ffffff14}.ylab{fill:#8aa0b3;font-size:10px}.ylab.end{text-anchor:end}
.legend{display:flex;gap:14px;flex-wrap:wrap;font-size:12px;color:#8aa0b3}
.lg i{display:inline-block;width:14px;height:4px;margin-right:5px;vertical-align:middle}
table{width:100%;border-collapse:collapse;font-size:11px;margin-top:8px}
th,td{border:1px solid #243445;padding:4px 8px;text-align:right;font-variant-numeric:tabular-nums}
th{background:#182430}td:first-child,th:first-child{text-align:left}
.muted{color:#8aa0b3}.foot{color:#8aa0b3;font-size:12px;margin-top:18px;border-top:1px solid #243445;padding-top:10px}
@media print{body{background:#fff;color:#000}.chart,.stat{background:#fff;color:#000;border-color:#999}}
</style></head><body><div class="wrap">
<h1>${esc(systemName)}:: ${esc(title)}</h1>
<p class="sub">Period: ${esc(period)} • Generated: ${esc(generatedAt)} • ${totalRows} readings</p>
<h2>Summary</h2><div class="stats">${cards.join('') || '<p class="muted">No data in this period.</p>'}</div>
<h2>Current levels</h2><div class="bars">${bars.join('')}</div>
${charts.join('')}
<h2>Latest readings: every vessel</h2>
<table><tr><th>Vessel</th><th>Time</th><th>Stock (t)</th><th>Temp °C</th><th>Moist %</th><th>Fill/h</th><th>Dis/h</th></tr>
${latest.map(({ id, row: r }) => `<tr><td>${esc(id)}</td><td>${esc(fmtT(r.ts))}</td><td>${Number(r.level).toFixed(1)}</td><td>${Number(r.temp_c).toFixed(1)}</td><td>${r.moisture == null ? '—' : Number(r.moisture).toFixed(1)}</td><td>${Number(r.fill_rate).toFixed(0)}</td><td>${Number(r.dis_rate).toFixed(0)}</td></tr>`).join('')}
</table>
</div></body></html>`;
}

// Trend chart built on chart.js. No hand-rolled canvas charting.
import { Chart, LineController, LineElement, PointElement, LinearScale, CategoryScale, Legend, Tooltip, Filler } from 'chart.js';
import { TREND_DEFAULT_WINDOW } from './silo_credentials.js';

Chart.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, Legend, Tooltip, Filler);

let chart = null;
let xWindow = TREND_DEFAULT_WINDOW; // visible samples on the X axis

export function setTrendWindow(n) { xWindow = Math.max(10, n); }

export function initTrend(canvas) {
  chart = new Chart(canvas, {
    type: 'line',
    data: { labels: [], datasets: [
      { label: 'Stock (t)', data: [], borderColor: '#ffb020', backgroundColor: '#ffb02022', fill: true, tension: 0.3, pointRadius: 0, yAxisID: 'y' },
      { label: 'Temp °C', data: [], borderColor: '#ff4d6d', tension: 0.3, pointRadius: 0, yAxisID: 'y1' },
      { label: 'Moist %', data: [], borderColor: '#37c6ff', tension: 0.3, pointRadius: 0, yAxisID: 'y1' }
    ]},
    options: {
      responsive: true, maintainAspectRatio: false,
      animation: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: '#8aa0b3', maxTicksLimit: 8 }, grid: { color: '#ffffff10' } },
        y: { min: 0, max: 100, ticks: { color: '#ffb020' }, grid: { color: '#ffffff10' } },
        y1: { min: 0, max: 45, position: 'right', ticks: { color: '#8aa0b3' }, grid: { display: false } }
      }
    }
  });
  return chart;
}

// Render the trend from database rows (ascending): [{ts, level, temp_c, moisture}].
// Capacity converts level to %; diesel has no moisture series.
export function setTrendData(rows, capacity, isDiesel) {
  if (!chart) return;
  const h = rows.slice(-xWindow);
  const cap = capacity || 1;
  chart.options.scales.y.min = 0;
  chart.options.scales.y.max = cap;
  chart.data.labels = h.map(r => new Date(r.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
  chart.data.datasets[0].data = h.map(r => +Number(r.level).toFixed(1));
  chart.data.datasets[1].data = h.map(r => (r.temp_c == null ? null : +Number(r.temp_c).toFixed(1)));
  chart.data.datasets[2].data = isDiesel ? h.map(() => null) : h.map(r => (r.moisture == null ? null : +Number(r.moisture).toFixed(2)));
  chart.update('none');
}

// Trend chart built on chart.js. No hand-rolled canvas charting.
import { Chart, LineController, LineElement, PointElement, LinearScale, CategoryScale, Legend, Tooltip, Filler } from 'chart.js';

Chart.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, Legend, Tooltip, Filler);

let chart = null;
let currentId = null;
let xWindow = 120; // visible samples on the X axis

export function setTrendWindow(n) { xWindow = Math.max(10, n); }

export function initTrend(canvas, getVessel) {
  chart = new Chart(canvas, {
    type: 'line',
    data: { labels: [], datasets: [
      { label: 'Level %', data: [], borderColor: '#ffb020', backgroundColor: '#ffb02022', fill: true, tension: 0.3, pointRadius: 0, yAxisID: 'y' },
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
  currentId = getVessel().id;
  return chart;
}

export function pushTrend(getVessel) {
  if (!chart) return;
  const v = getVessel();
  if (v.id !== currentId) {
    currentId = v.id;
    chart.data.labels = []; chart.data.datasets.forEach(d => (d.data = []));
  }
  const h = v.hist.slice(-xWindow);
  chart.data.labels = h.map((_, i) => `-${h.length - 1 - i}`);
  chart.data.datasets[0].data = h.map(s => +s.p.toFixed(1));
  chart.data.datasets[1].data = h.map(s => +s.t.toFixed(1));
  chart.data.datasets[2].data = v.isDiesel ? h.map(() => null) : h.map(s => +s.m.toFixed(2));
  chart.update('none');
}

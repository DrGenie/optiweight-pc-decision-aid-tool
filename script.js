let upChart, cbChart;
let current = null;

// Tab navigation
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(x => x.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.getElementById(btn.dataset.tab).classList.add('active');
  });
});

// Range value display
[['bmi','bmiVal'], ['cost','costVal'], ['eff','effVal']].forEach(([id, out]) => {
  const inp = document.getElementById(id), disp = document.getElementById(out);
  inp.addEventListener('input', e => disp.textContent = e.target.value);
});

// Helper to read radio
function getRadio(name) {
  return document.querySelector(`input[name="${name}"]:checked`).value;
}

// Calculate action
document.getElementById('calcBtn').addEventListener('click', e => {
  e.preventDefault();
  // Gather
  const bmi = +document.getElementById('bmi').value;
  const cost = +document.getElementById('cost').value;
  const eff = +document.getElementById('eff').value;
  const side = +getRadio('side');
  const freq = getRadio('freq');
  const method = getRadio('method');
  const dur = +getRadio('dur');
  const prog = getRadio('prog');

  // Validation warnings
  if (prog === 'lifestyle' && method === 'injection') {
    alert('Inconsistent: Lifestyle-only cannot use injections.');
    return;
  }
  if (prog === 'lifestyle' && eff > 6) {
    alert('High efficacy (>6) unlikely for lifestyle alone.');
  }

  // Utility betas
  const b = {
    cost: -0.015,
    eff: 0.6,
    side: -0.25,
    freq: freq==='weekly' ? -0.15 : 0,
    method: method==='injection' ? -0.1 : 0.1,
    dur: dur===12 ? -0.05 : 0,
    prog: prog==='combined' ? 0.3 : 0
  };
  const U = b.cost*cost + b.eff*eff + b.side*side + b.freq + b.method + b.dur + b.prog;
  const P = Math.exp(U)/(1+Math.exp(U));

  // Cost–benefit
  const drug = method==='injection'?175:0;
  const monitor = prog==='combined'?50:30;
  const admin = 20;
  const train = prog==='lifestyle'?15:0;
  const totCost = (drug+monitor+admin+train)*dur;
  const saving = eff*92;
  const qaly = eff*0.05;
  const qv = qaly*20000;
  const net = saving + qv - totCost;
  const expNet = P*net;
  const icer = qaly>0? (totCost/qaly) : null;

  current = { P, totCost, saving, qv, net, expNet, icer };

  // Popup
  const body = document.getElementById('popupBody');
  body.innerHTML = `
    <h3>Results</h3>
    <p>Uptake: ${(P*100).toFixed(1)}%<br>
    Total Cost: £${totCost.toFixed(2)}<br>
    Net Benefit: £${net.toFixed(2)}<br>
    Exp. Net: £${expNet.toFixed(2)}<br>
    ICER: £${icer?icer.toFixed(2):'N/A'}/QALY</p>
  `;
  document.getElementById('resultsPopup').classList.add('active');

  // Uptake chart
  document.getElementById('upText').innerHTML = `<p>Uptake Probability: <strong>${(P*100).toFixed(1)}%</strong></p>`;
  const ctx1 = document.getElementById('upChart').getContext('2d');
  if (upChart) upChart.destroy();
  upChart = new Chart(ctx1, {
    type: 'doughnut',
    data: {
      labels: ['Uptake','Opt-out'],
      datasets: [{ data: [P*100,100-P*100], backgroundColor: ['var(--secondary-color)','var(--accent-color)'] }]
    },
    options: { responsive: true }
  });

  // CBA table + chart
  document.getElementById('cbTable').innerHTML = `
    <table>
      <tr><th>Metric</th><th>£</th></tr>
      <tr><td>Total Cost</td><td>${totCost.toFixed(2)}</td></tr>
      <tr><td>Savings</td><td>${saving.toFixed(2)}</td></tr>
      <tr><td>QALY Value</td><td>${qv.toFixed(2)}</td></tr>
      <tr><td>Net Benefit</td><td>${net.toFixed(2)}</td></tr>
    </table>
  `;
  const ctx2 = document.getElementById('cbChart').getContext('2d');
  if (cbChart) cbChart.destroy();
  cbChart = new Chart(ctx2, {
    type: 'bar',
    data: {
      labels: ['Cost','Savings','QALY','Net'],
      datasets: [{
        label: '£',
        data: [totCost,saving,qv,net],
        backgroundColor: ['#ff6384','#36a2eb','#ffce56','#4bc0c0']
      }]
    },
    options: { responsive: true, scales: { y:{ beginAtZero:true } } }
  });
});

// Close popup
document.querySelector('.close-popup').onclick = () =>
  document.getElementById('resultsPopup').classList.remove('active');

// Simulation
document.getElementById('simBtn').addEventListener('click', e => {
  e.preventDefault();
  if (!current) { alert('Please calculate first.'); return; }
  const sims = [];
  for (let i=0; i<100; i++) {
    const c = current.totCost*(1+(Math.random()-0.5)*0.3);
    const q = current.qv*(1+(Math.random()-0.5)*0.3);
    sims.push(q>0? c/q : 0);
  }
  // simple histogram
  const min = Math.min(...sims), max = Math.max(...sims);
  const bins = 10, width = (max-min)/bins;
  const counts = Array(bins).fill(0), labels = [];
  sims.forEach(v => {
    const idx = Math.min(Math.floor((v-min)/width), bins-1);
    counts[idx]++;
  });
  for (let i=0; i<bins; i++) {
    labels.push(`${(min+i*width).toFixed(0)}–${(min+(i+1)*width).toFixed(0)}`);
  }
  // append chart
  const ctx = document.createElement('canvas');
  document.getElementById('cbaTab').appendChild(ctx);
  new Chart(ctx.getContext('2d'), {
    type: 'bar',
    data: { labels, datasets: [{ label:'ICER', data:counts, backgroundColor:'var(--primary-color)' }] },
    options: { responsive:true, scales:{ y:{ beginAtZero:true } } }
  });
});

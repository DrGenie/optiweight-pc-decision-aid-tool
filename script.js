const $ = sel => document.querySelector(sel);
const $$ = sel => document.querySelectorAll(sel);
const getRadio = name => document.querySelector(`input[name="${name}"]:checked`).value;
let upChart, cbChart, simChart, current = null, scenarios = [];

// Tab switching
$$('.tab-btn').forEach(btn => btn.addEventListener('click', () => {
  $$('.tab-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  $$('.tab-content').forEach(s=>s.classList.remove('active'));
  $('#' + btn.dataset.tab).classList.add('active');
}));

// Live slider
[['bmi','bmiVal'],['cost','costVal'],['eff','effVal']].forEach(([i,o]) => {
  $('#' + i).addEventListener('input', e => $('#' + o).textContent = e.target.value);
});

// Inline warning
const warn = msg => $('#warn').textContent = msg;

// Calculate event
$('#calcBtn').addEventListener('click', e => {
  e.preventDefault();
  warn('');

  const bmi   = +$('#bmi').value;
  const cost  = +$('#cost').value;
  const eff   = +$('#eff').value;
  const side  = +getRadio('side');
  const freq  = getRadio('freq');
  const meth  = getRadio('method');
  const dur   = +getRadio('dur');
  const prog  = getRadio('prog');

  // Input validation
  if (prog==='lifestyle' && meth==='injection') return warn('Lifestyle-only cannot use injection method.');
  if (prog==='lifestyle' && eff>6) warn('Efficacy >6 kg/m² is rarely achievable for lifestyle-alone.');

  // DCE logit utility
  const β = {
    cost: -0.015, eff: 0.6, side: -0.25,
    freq: freq==='weekly' ? -0.15 : 0,
    meth: meth==='injection' ? -0.1 : 0.1,
    dur: dur===12 ? -0.05 : 0,
    prog: prog==='combined' ? 0.3 : 0
  };
  const U = β.cost*cost + β.eff*eff + β.side*side + β.freq + β.meth + β.dur + β.prog;
  const P = Math.exp(U)/(1+Math.exp(U));

  // Cost-benefit breakdown
  const drug   = meth==='injection' ? 175 : 0;
  const monit  = prog==='combined' ? 50 : 30;
  const admin  = 20;
  const train  = prog==='lifestyle' ? 15 : 0;
  const tot    = (drug+monit+admin+train)*dur;
  const saving = eff*92;
  const qaly   = eff*0.05;
  const qval   = qaly*20000;
  const net    = saving + qval - tot;
  const expNet = P * net;
  const icer   = qaly > 0 ? tot/qaly : null;

  current = {bmi,cost,eff,side,freq,meth,dur,prog,P,drug,monit,admin,train,tot,saving,qaly,qval,net,expNet,icer};

  // Enable simulate
  $('#simBtn').disabled = false;

  // Modal popup summary
  $('#popupBody').innerHTML = `
    <h3>Programme Summary</h3>
    <ul>
      <li>BMI: ${bmi}</li>
      <li>Cost: £${cost}/month</li>
      <li>Efficacy: ${eff} kg/m²</li>
      <li>Side-effects: ${['None','Mild','Moderate'][side]}</li>
      <li>${freq}, ${meth}, ${dur} mo, ${prog}</li>
    </ul>
    <h3>Results</h3>
    <ul>
      <li>Uptake: <strong>${(P*100).toFixed(1)} %</strong></li>
      <li>Net Benefit: <strong>£${net.toFixed(0)}</strong></li>
      <li>Expected Benefit: £${expNet.toFixed(0)}</li>
      <li>ICER: ${icer ? '£'+icer.toFixed(0)+'/QALY' : 'N/A'}</li>
    </ul>`;
  $('#popup').classList.add('active');

  // Uptake chart
  $('#upText').innerHTML = `<p><strong>${(P*100).toFixed(1)}%</strong> of eligible patients would choose this programme.</p>`;
  if (upChart) upChart.destroy();
  upChart = new Chart($('#upChart'), {
    type: 'doughnut',
    data: {
      labels: ['Uptake','Opt-out'],
      datasets:[{
        data: [P*100, 100-P*100],
        backgroundColor: [
          getComputedStyle(document.documentElement).getPropertyValue('--uptake-col').trim(),
          getComputedStyle(document.documentElement).getPropertyValue('--optout-col').trim()
        ]
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: 'bottom' },
        title: { display: true, text: 'Predicted Uptake (%)' }
      }
    }
  });

  // Cost-benefit table/chart
  $('#cbTable').innerHTML = `
    <table>
      <tr><th>Component</th><th>£</th><th>Details</th></tr>
      <tr><td>Drug</td><td>${(drug*dur).toFixed(0)}</td><td>£${drug} × ${dur}</td></tr>
      <tr><td>Monitoring</td><td>${(monit*dur).toFixed(0)}</td><td>£${monit} × ${dur}</td></tr>
      <tr><td>Admin</td><td>${(admin*dur).toFixed(0)}</td><td>£${admin} × ${dur}</td></tr>
      <tr><td>Training</td><td>${(train*dur).toFixed(0)}</td><td>£${train} × ${dur}</td></tr>
      <tr><th>Total Cost</th><th>${tot.toFixed(0)}</th><td>Sum</td></tr>
      <tr><td>Savings</td><td>${saving.toFixed(0)}</td><td>£92 × ${eff}</td></tr>
      <tr><td>QALY Value</td><td>${qval.toFixed(0)}</td><td>${qaly.toFixed(2)} × £20,000</td></tr>
      <tr><th>Net Benefit</th><th>${net.toFixed(0)}</th><td>Savings + QALY – Cost</td></tr>
    </table>`;
  if (cbChart) cbChart.destroy();
  cbChart = new Chart($('#cbChart').getContext('2d'), {
    type: 'bar',
    data: {
      labels: ['Total Cost','Savings','QALY Value','Net Benefit'],
      datasets: [{ label:'£', data: [tot,saving,qval,net], backgroundColor:['#f44336','#36a2eb','#ffce56','#009688'] }]
    },
    options: {
      responsive: true,
      scales: { y: { beginAtZero:true, title:{display:true, text:'£'} }},
      plugins: { legend:{display:false}, title:{display:true,text:'Cost-Benefit Breakdown'} }
    }
  });

  // Remove previous sim chart
  if (simChart){ simChart.destroy(); $('#simChart').style.display='none'; }
});

// Modal close
$('.close').onclick = () => $('#popup').classList.remove('active');

// Simulate uncertainty
$('#simBtn').addEventListener('click', e => {
  e.preventDefault();
  if (!current) return alert('Calculate first.');
  const draws = 500, arr = [];
  for (let i=0; i<draws; i++){
    const t = current.tot * (1 + (Math.random()-0.5)*0.3);
    const q = current.qval * (1 + (Math.random()-0.5)*0.3);
    arr.push(q>0 ? t/(q/20000) : 0);
  }
  const bins=18, min=Math.min(...arr), max=Math.max(...arr), width=(max-min)/bins;
  const counts=Array(bins).fill(0), labels=[];
  arr.forEach(v=>counts[Math.min(Math.floor((v-min)/width),bins-1)]++);
  for (let i=0;i<bins;i++) labels.push(`${(min+i*width).toFixed(0)}–${(min+(i+1)*width).toFixed(0)}`);

  $('#simChart').style.display='block';
  if (simChart) simChart.destroy();
  simChart = new Chart($('#simChart').getContext('2d'), {
    type:'bar',
    data:{labels,datasets:[{label:'ICER (£/QALY)',data:counts,backgroundColor:getComputedStyle(document.documentElement).getPropertyValue('--uptake-col').trim()}]},
    options:{responsive:true,scales:{y:{beginAtZero:true,title:{display:true,text:'Frequency'}}, x:{title:{display:true,text:'ICER (£/QALY)'}}},
      plugins:{title:{display:true,text:'ICER Uncertainty Simulation'}}}
  });
});

// Save scenario
$('#saveBtn').addEventListener('click', () => {
  if (!current) return alert('Calculate first.');
  scenarios.push({...current});
  const ul = $('#scList'); ul.innerHTML = '';
  scenarios.forEach((s,i) => {
    const li = document.createElement('li');
    li.textContent = `[${i+1}] Uptake ${(s.P*100).toFixed(0)}% · Net £${s.net.toFixed(0)} · ICER ${s.icer?('£'+s.icer.toFixed(0)):'N/A'}`;
    ul.append(li);
  });
});

// Export PDF
$('#pdfBtn').addEventListener('click', () => {
  if (!current) return alert('Calculate first.');
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  let y=10;
  doc.setFontSize(16); doc.text('OptiWeight-PC Decision Aid Report',10,y); y+=10;
  doc.setFontSize(11); doc.text('Inputs:',10,y); y+=6;
  ['BMI '+current.bmi,'Cost £'+current.cost,'ΔBMI '+current.eff,
   'Side '+['None','Mild','Moderate'][current.side],
   current.freq,current.meth,current.dur+' mo',current.prog]
  .forEach(t=>{doc.text(t,12,y); y+=5;});
  y+=4; doc.text('Results:',10,y); y+=6;
  ['Uptake '+(current.P*100).toFixed(1)+'%',
   'Total Cost £'+current.tot,
   'Savings £'+current.saving,
   'QALY Value £'+current.qval,
   'Net Benefit £'+current.net,
   'ICER '+(current.icer?('£'+current.icer.toFixed(2)):'N/A')+'/QALY']
  .forEach(t=>{doc.text(t,12,y); y+=5;});
  const addChart = (canvas,title) => {
    doc.addPage(); doc.text(title,10,15);
    doc.addImage(canvas.toDataURL('image/png'),'PNG',10,20,190,90);
  };
  addChart($('#upChart'),'Predicted Uptake');
  addChart($('#cbChart'),'Cost-Benefit Breakdown');
  if (simChart) addChart($('#simChart'),'ICER Uncertainty');
  doc.save('OptiWeight_Report.pdf');
});

// ======== helpers ========
const $ = q => document.querySelector(q);
const $$ = q => document.querySelectorAll(q);
const getRadio = name => document.querySelector(`input[name="${name}"]:checked`).value;
let upChart, cbChart, simChart, scenarios = [], current = null;

// ======== tab handling ========
$$('.tab-btn').forEach(btn=>{
  btn.addEventListener('click',()=>{
    $$('.tab-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    $$('.tab-content').forEach(c=>c.classList.remove('active'));
    $('#'+btn.dataset.tab).classList.add('active');
  });
});

// ======== live value display ========
[['bmi','bmiVal'],['cost','costVal'],['eff','effVal']].forEach(([id,out])=>{
  $('#'+id).addEventListener('input',e=>$('#'+out).textContent=e.target.value);
});

// ======== inline warnings ========
function warn(msg=''){
  $('#warningMsg').textContent = msg;
}

// ======== calculate ========
$('#calcBtn').addEventListener('click',e=>{
  e.preventDefault(); warn('');
  const bmi = +$('#bmi').value;
  const cost = +$('#cost').value;
  const eff  = +$('#eff').value;
  const side = +getRadio('side');
  const freq = getRadio('freq');
  const method = getRadio('method');
  const dur   = +getRadio('dur');
  const prog  = getRadio('prog');

  // logic checks
  if(prog==='lifestyle' && method==='injection')
    return warn('Lifestyle-only programme cannot use injections.');
  if(prog==='lifestyle' && eff>6)
    warn('Warning: efficacy >6 kg/m² is implausible for lifestyle-only.');

  // β from DCE literature
  const β = {
    cost:-0.015, eff:0.6, side:-0.25,
    freq:(freq==='weekly'?-0.15:0),
    method:(method==='injection'?-0.1:0.1),
    dur:(dur===12?-0.05:0),
    prog:(prog==='combined'?0.3:0)
  };
  const U = β.cost*cost + β.eff*eff + β.side*side + β.freq + β.method + β.dur + β.prog;
  const P = Math.exp(U)/(1+Math.exp(U)); // uptake

  // cost components
  const drug      = method==='injection'? 175 : 0;
  const monitor   = prog==='combined'? 50 : 30;
  const admin     = 20;
  const training  = prog==='lifestyle'?15:0;
  const totCost   = (drug+monitor+admin+training)*dur;

  const saving    = eff*92;          // NHS complication savings
  const qalyGain  = eff*0.05;
  const qalyVal   = qalyGain*20000;
  const net       = saving + qalyVal - totCost;
  const expNet    = P*net;
  const icer      = qalyGain>0 ? totCost/qalyGain : null;

  current = {bmi,cost,eff,side,freq,method,dur,prog,P,drug,monitor,admin,training,totCost,saving,qalyGain,qalyVal,net,expNet,icer};

  // ----- popup -----
  $('#popupBody').innerHTML = `
    <h3>Inputs</h3>
    <p>BMI ${bmi} kg/m² · £${cost}/mo · ΔBMI ${eff} · Side ${['None','Mild','Moderate'][side]}
       · ${freq}, ${method}, ${dur} mo, ${prog}</p>
    <h3>Results</h3>
    <p>Uptake ${(P*100).toFixed(1)} %<br>
       Net Benefit £${net.toFixed(2)}<br>
       Expected Benefit £${expNet.toFixed(2)}<br>
       ICER ${icer?('£'+icer.toFixed(2)): 'N/A'}/QALY</p>`;
  $('#resultsPopup').classList.add('active');

  // ----- uptake chart -----
  $('#upText').innerHTML = `<p><strong>${(P*100).toFixed(1)} % of patients</strong> are predicted to choose this programme.</p>`;
  if(upChart) upChart.destroy();
  upChart = new Chart($('#upChart'),{
    type:'doughnut',
    data:{labels:['Uptake','Opt-out'],
      datasets:[{data:[P*100,100-P*100],
        backgroundColor:['var(--secondary-color)','var(--accent-color)']}]} });

  // ----- cost-benefit table & chart -----
  $('#cbTable').innerHTML = `
    <table>
      <tr><th>Component</th><th>£</th><th>Calculation</th></tr>
      <tr><td>Drug</td><td>${(drug*dur).toFixed(2)}</td><td>£${drug} × ${dur}</td></tr>
      <tr><td>Monitoring</td><td>${(monitor*dur).toFixed(2)}</td><td>£${monitor} × ${dur}</td></tr>
      <tr><td>Admin</td><td>${(admin*dur).toFixed(2)}</td><td>£${admin} × ${dur}</td></tr>
      <tr><td>Training</td><td>${(training*dur).toFixed(2)}</td><td>£${training} × ${dur}</td></tr>
      <tr><td><strong>Total Cost</strong></td><td><strong>${totCost.toFixed(2)}</strong></td><td>Sum</td></tr>
      <tr><td>Savings</td><td>${saving.toFixed(2)}</td><td>£92 × ${eff}</td></tr>
      <tr><td>QALY Value</td><td>${qalyVal.toFixed(2)}</td><td>${qalyGain.toFixed(2)} × £20 000</td></tr>
      <tr><td><strong>Net Benefit</strong></td><td><strong>${net.toFixed(2)}</strong></td><td>Savings + QALY – Cost</td></tr>
    </table>`;
  if(cbChart) cbChart.destroy();
  cbChart = new Chart($('#cbChart').getContext('2d'),{
    type:'bar',
    data:{
      labels:['Total Cost','Savings','QALY Value','Net Benefit'],
      datasets:[{label:'£',data:[totCost,saving,qalyVal,net],
        backgroundColor:['#ff6384','#36a2eb','#ffce56','#4bc0c0']}]
    },
    options:{responsive:true,scales:{y:{beginAtZero:true}}}
  });

  // clear previous simulation
  if(simChart){simChart.destroy(); $('#simChart').style.display='none';}
});

// ======== close popup ========
$('.close-popup').onclick = ()=>$('#resultsPopup').classList.remove('active');

// ======== simulate uncertainty ========
$('#simBtn').addEventListener('click',e=>{
  e.preventDefault();
  if(!current){return alert('Calculate first.');}
  const draws = 500, arr=[];
  for(let i=0;i<draws;i++){
    const tc = current.totCost*(1+(Math.random()-0.5)*.3);
    const qv = current.qalyVal*(1+(Math.random()-0.5)*.3);
    arr.push(qv>0? tc/(qv/20000) : 0); // convert back to £/QALY
  }
  // histogram data
  const bins = 15, min=Math.min(...arr), max=Math.max(...arr), width=(max-min)/bins;
  const counts=Array(bins).fill(0), labels=[];
  arr.forEach(v=>{counts[Math.min(Math.floor((v-min)/width),bins-1)]++;});
  for(let i=0;i<bins;i++){labels.push(`${(min+i*width).toFixed(0)}–${(min+(i+1)*width).toFixed(0)}`);}

  $('#simChart').style.display='block';
  if(simChart) simChart.destroy();
  simChart = new Chart($('#simChart').getContext('2d'),{
    type:'bar',
    data:{labels,datasets:[{label:'ICER draws',data:counts,
      backgroundColor:'var(--primary-color)'}]},
    options:{responsive:true,scales:{y:{beginAtZero:true}}}
  });
});

// ======== save scenario ========
$('#saveBtn').addEventListener('click',()=>{
  if(!current)return alert('Calculate first.');
  scenarios.push({...current});
  renderScenarioList();
});
function renderScenarioList(){
  const ul = $('#scList'); ul.innerHTML='';
  scenarios.forEach((s,i)=>{
    const li=document.createElement('li');
    li.textContent=`Scenario ${i+1}: Uptake ${ (s.P*100).toFixed(1) } %, Net £${s.net.toFixed(0)}, ICER ${s.icer?('£'+s.icer.toFixed(0)):'N/A'}`;
    ul.append(li);
  });
}

// ======== PDF export ========
$('#pdfBtn').addEventListener('click',()=>{
  if(!current)return alert('Calculate first.');
  const {jsPDF} = window.jspdf; const doc = new jsPDF({orientation:'p',unit:'mm',format:'a4'});
  let y=10;
  doc.setFontSize(14); doc.text('OptiWeight-PC Decision Aid Report',10,y); y+=10;
  doc.setFontSize(11); doc.text('Inputs',10,y); y+=6;
  const i=current;
  [
    `BMI ${i.bmi}`,`Cost £${i.cost}/mo`,`ΔBMI ${i.eff}`,
    `Side ${['None','Mild','Moderate'][i.side]}`,
    i.freq, i.method, `${i.dur} mo`, i.prog
  ].forEach(t=>{doc.text(t,12,y); y+=5;});
  y+=2; doc.text('Outputs',10,y); y+=6;
  [
    `Uptake ${(i.P*100).toFixed(1)} %`,
    `Total Cost £${i.totCost.toFixed(2)}`,
    `Savings £${i.saving.toFixed(2)}`,
    `QALY Value £${i.qalyVal.toFixed(2)}`,
    `Net Benefit £${i.net.toFixed(2)}`,
    `ICER ${i.icer?('£'+i.icer.toFixed(2)):'N/A'}/QALY`
  ].forEach(t=>{doc.text(t,12,y); y+=5;});

  // charts
  const addChart = (canvas, title)=>{
    if(!canvas)return;
    doc.addPage(); doc.text(title,10,15);
    doc.addImage(canvas.toDataURL('image/png'),'PNG',10,20,180,90);
  };
  addChart($('#upChart'),'Uptake');
  addChart($('#cbChart'),'Cost-Benefit Breakdown');
  if(simChart) addChart($('#simChart'),'ICER Simulation');

  doc.save('OptiWeight_report.pdf');
});

// ======== value update listeners for warnings ========
['method','prog','eff'].forEach(name=>{
  $$( `input[name='${name}']` ).forEach(r=> r.addEventListener('change', ()=> warn('') ));
});

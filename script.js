/* —————————————————————  DOM ACCESS  ————————————————————— */
const $  = q => document.querySelector(q);
const $$ = q => document.querySelectorAll(q);
const getRadio = name => document.querySelector(`input[name="${name}"]:checked`).value;

/* —————————————————  TAB BEHAVIOUR  ————————————————— */
$$('.tab-btn').forEach(btn=>{
  btn.addEventListener('click',()=>{
    $$('.tab-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    $$('.tab-content').forEach(sec=>sec.classList.remove('active'));
    $('#'+btn.dataset.tab).classList.add('active');
  });
});

/* ————————————  LIVE SLIDER VALUES  ———————————— */
[['bmi','bmiVal'],['cost','costVal'],['eff','effVal']]
 .forEach(([id,out])=> $('#'+id).addEventListener('input',e=>$('#'+out).textContent=e.target.value));

/* ————————————  STATE  ———————————— */
let upChart, cbChart, simChart, current=null, scenarios=[];

/* ————————————  HELPERS  ———————————— */
const warn = msg => $('#warn').textContent = msg;

/* ————————————  CALCULATION  ———————————— */
$('#calcBtn').addEventListener('click',e=>{
  e.preventDefault(); warn('');

  /* input set */
  const bmi   = +$('#bmi').value;
  const cost  = +$('#cost').value;
  const eff   = +$('#eff').value;
  const side  = +getRadio('side');
  const freq  = getRadio('freq');
  const meth  = getRadio('method');
  const dur   = +getRadio('dur');
  const prog  = getRadio('prog');

  /* plausibility checks */
  if(prog==='lifestyle'&&meth==='injection') return warn('Lifestyle-only cannot use injections.');
  if(prog==='lifestyle'&&eff>6) warn('High efficacy (>6 kg/m²) rarely achievable by lifestyle alone.');

  /* utility  */
  const β = {
    cost:-0.015, eff:0.6, side:-0.25,
    freq:freq==='weekly'?-0.15:0,
    meth:meth==='injection'?-0.1:0.1,
    dur:dur===12?-0.05:0,
    prog:prog==='combined'?0.3:0
  };
  const U = β.cost*cost + β.eff*eff + β.side*side + β.freq + β.meth + β.dur + β.prog;
  const P = Math.exp(U)/(1+Math.exp(U));

  /* costs & benefits */
  const drug   = meth==='injection'?175:0;
  const monit  = prog==='combined'?50:30;
  const admin  = 20;
  const train  = prog==='lifestyle'?15:0;
  const tot    = (drug+monit+admin+train)*dur;

  const saving = eff*92;
  const qaly   = eff*0.05;
  const qval   = qaly*20000;
  const net    = saving + qval - tot;
  const expNet = P*net;
  const icer   = qaly>0? tot/qaly : null;

  current = {bmi,cost,eff,side,freq,meth,dur,prog,P,drug,monit,admin,train,tot,saving,qval,net,expNet,icer};

  /* ——— POP-UP ——— */
  $('#popupBody').innerHTML = `
    <h3>Programme Summary</h3>
    <ul>
      <li>BMI ${bmi}</li><li>Cost £${cost}/mo</li><li>ΔBMI ${eff}</li>
      <li>Side-effects ${['None','Mild','Moderate'][side]}</li>
      <li>${freq}, ${meth}, ${dur} mo, ${prog}</li>
    </ul>
    <h3>Key Results</h3>
    <ul>
      <li>Uptake <strong>${(P*100).toFixed(1)} %</strong></li>
      <li>Net Benefit per patient <strong>£${net.toFixed(0)}</strong></li>
      <li>Expected Net (with uptake) <strong>£${expNet.toFixed(0)}</strong></li>
      <li>ICER ${icer?('£'+icer.toFixed(0)):'N/A'} / QALY</li>
    </ul>`;
  $('#popup').classList.add('active');

  /* ——— Uptake chart ——— */
  $('#upText').innerHTML = `<p><strong>${(P*100).toFixed(1)} %</strong> of eligible patients would choose this programme.</p>`;
  if(upChart) upChart.destroy();
  upChart = new Chart($('#upChart'),{
    type:'doughnut',
    data:{labels:['Uptake','Opt-out'],
      datasets:[{data:[P*100,100-P*100],
        backgroundColor:['var(--teal)','var(--pink)']}]},
    options:{responsive:true,plugins:{legend:{position:'bottom'}}}
  });

  /* ——— Cost-Benefit table & bar ——— */
  $('#cbTable').innerHTML = `
    <table>
      <tr><th>Component</th><th>£</th><th>Calculation</th></tr>
      <tr><td>Drug</td><td>${(drug*dur).toFixed(0)}</td><td>£${drug} × ${dur}</td></tr>
      <tr><td>Monitoring</td><td>${(monit*dur).toFixed(0)}</td><td>£${monit} × ${dur}</td></tr>
      <tr><td>Admin</td><td>${(admin*dur).toFixed(0)}</td><td>£${admin} × ${dur}</td></tr>
      <tr><td>Training</td><td>${(train*dur).toFixed(0)}</td><td>£${train} × ${dur}</td></tr>
      <tr><th>Total Cost</th><th>${tot.toFixed(0)}</th><td>Sum</td></tr>
      <tr><td>Savings (complication ↓)</td><td>${saving.toFixed(0)}</td><td>£92 × ${eff}</td></tr>
      <tr><td>QALY Value</td><td>${qval.toFixed(0)}</td><td>${(qaly).toFixed(2)} × £20 000</td></tr>
      <tr><th>Net Benefit</th><th>${net.toFixed(0)}</th><td>Sav.+QALY-Cost</td></tr>
    </table>`;
  if(cbChart) cbChart.destroy();
  cbChart = new Chart($('#cbChart').getContext('2d'),{
    type:'bar',
    data:{labels:['Total Cost','Savings','QALY Value','Net Benefit'],
      datasets:[{label:'£',data:[tot,saving,qval,net],
        backgroundColor:['#ff6384','#36a2eb','#ffce56','#4bc0c0']}]},
    options:{responsive:true,scales:{y:{beginAtZero:true}}}
  });

  /* reset uncertainty chart */
  if(simChart){simChart.destroy();$('#simChart').style.display='none';}
});

/* ————————————  CLOSE MODAL  ———————————— */
$('.close').onclick = ()=> $('#popup').classList.remove('active');

/* ————————————  SIMULATE ICER  ———————————— */
$('#simBtn').addEventListener('click',e=>{
  e.preventDefault();
  if(!current) return alert('Calculate first.');
  const draws = 500, arr=[];
  for(let i=0;i<draws;i++){
    const t = current.tot*(1+(Math.random()-0.5)*0.3);      // ±30 %
    const q = current.qval*(1+(Math.random()-0.5)*0.3);     // ±30 %
    arr.push(q>0? t/(q/20000) : 0);                         // £/QALY
  }
  const bins=15,min=Math.min(...arr),max=Math.max(...arr),w=(max-min)/bins;
  const counts=Array(bins).fill(0),labels=[];
  arr.forEach(v=>counts[Math.min(Math.floor((v-min)/w),bins-1)]++);
  for(let i=0;i<bins;i++) labels.push(`${(min+i*w).toFixed(0)}–${(min+(i+1)*w).toFixed(0)}`);

  $('#simChart').style.display='block';
  if(simChart) simChart.destroy();
  simChart = new Chart($('#simChart').getContext('2d'),{
    type:'bar',
    data:{labels,
      datasets:[{label:'ICER draws',data:counts,backgroundColor:'var(--blue)'}]},
    options:{responsive:true,scales:{y:{beginAtZero:true}}}
  });
});

/* ————————————  SAVE SCENARIO  ———————————— */
$('#saveBtn').addEventListener('click',()=>{
  if(!current) return alert('Calculate first.');
  scenarios.push({...current});
  renderList();
});
function renderList(){
  const ul=$('#scList'); ul.innerHTML='';
  scenarios.forEach((s,i)=>{
    const li=document.createElement('li');
    li.textContent=`[${i+1}] Uptake ${(s.P*100).toFixed(0)} % · Net £${s.net.toFixed(0)} · ICER ${s.icer?('£'+s.icer.toFixed(0)):'N/A'}`;
    ul.append(li);
  });
}

/* ————————————  PDF EXPORT  ———————————— */
$('#pdfBtn').addEventListener('click',()=>{
  if(!current) return alert('Calculate first.');
  const {jsPDF}=window.jspdf; const doc=new jsPDF();
  let y=10; doc.setFontSize(16); doc.text('OptiWeight-PC Decision Report',10,y); y+=10;
  doc.setFontSize(11); doc.text('Inputs',10,y); y+=6;
  ['BMI '+current.bmi,'Cost £'+current.cost,'ΔBMI '+current.eff,
   'Side '+['None','Mild','Moderate'][current.side],
   current.freq,current.meth,current.dur+' mo',current.prog]
  .forEach(t=>{doc.text(t,12,y);y+=5;});
  y+=4; doc.text('Outputs',10,y); y+=6;
  ['Uptake '+(current.P*100).toFixed(1)+' %',
   'Total Cost £'+current.tot.toFixed(0),
   'Savings £'+current.saving.toFixed(0),
   'QALY Value £'+current.qval.toFixed(0),
   'Net Benefit £'+current.net.toFixed(0),
   'ICER '+(current.icer?('£'+current.icer.toFixed(0)):'N/A')+'/QALY']
  .forEach(t=>{doc.text(t,12,y);y+=5;});
  const addChart=(canvas,title)=>{
    doc.addPage(); doc.text(title,10,15);
    doc.addImage(canvas.toDataURL('image/png'),'PNG',10,20,190,90);
  };
  addChart($('#upChart'),'Uptake');
  addChart($('#cbChart'),'Cost-Benefit Breakdown');
  if(simChart) addChart($('#simChart'),'ICER Uncertainty');
  doc.save('OptiWeight_Report.pdf');
});

let uptakeChart, cbaChart, simChart;
let scenarios = [];
let currentResults = {};
let simData = [];

// Update slider values display
document.getElementById('bmi').addEventListener('input', (e) => document.getElementById('bmiValue').textContent = e.target.value);
document.getElementById('cost').addEventListener('input', (e) => document.getElementById('costValue').textContent = e.target.value);
document.getElementById('efficacy').addEventListener('input', (e) => document.getElementById('efficacyValue').textContent = e.target.value);

document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
        document.getElementById(btn.dataset.tab).classList.add('active');
    });
});

function getRadioValue(name) {
    return document.querySelector(`input[name="${name}"]:checked`).value;
}

function calculate() {
    const bmi = parseFloat(document.getElementById('bmi').value);
    if (bmi < 27 || bmi > 35) return alert('BMI out of range.');

    const cost = parseFloat(document.getElementById('cost').value);
    const efficacy = parseFloat(document.getElementById('efficacy').value);
    const side_effects = parseFloat(getRadioValue('side_effects'));
    const frequency = getRadioValue('frequency');
    const method = getRadioValue('method');
    const duration = parseInt(getRadioValue('duration'));
    const programme = getRadioValue('programme');

    // Realistic betas (adjusted from DCE studies: higher efficacy positive, cost/side negative)
    const beta_cost = -0.015; // Stronger negative from cost sensitivity
    const beta_efficacy = 0.6; // Preference for weight loss
    const beta_side = -0.25;
    const beta_freq = frequency === 'weekly' ? -0.15 : 0;
    const beta_method = method === 'injection' ? -0.1 : 0.1; // Slight pref for lifestyle
    const beta_duration = duration === 12 ? -0.05 : 0;
    const beta_programme = programme === 'combined' ? 0.3 : 0;

    const U_i = (beta_cost * cost) + (beta_efficacy * efficacy) + (beta_side * side_effects) +
                beta_freq + beta_method + beta_duration + beta_programme;
    const U_optout = 0;
    const P_i = Math.exp(U_i) / (Math.exp(U_i) + Math.exp(U_optout));

    // Realistic CBA
    const drug_cost_month = method === 'injection' ? 175 : 0; // £175 maintenance
    const monitoring_cost_month = 50; // Visits
    const other_cost_month = 20; // Misc
    const total_cost_month = drug_cost_month + monitoring_cost_month + other_cost_month;
    const total_cost = total_cost_month * duration;
    const savings_per_patient = efficacy * 92; // £460 /5 avg efficacy (~£92 per unit BMI reduction)
    const qaly_gain_per_patient = efficacy * 0.05; // ~0.25-0.5 for 5-10 reduction
    const net_benefit_per_patient = savings_per_patient + (qaly_gain_per_patient * 20000) - total_cost; // Monetize QALY @£20k
    const expected_net_benefit = (P_i * net_benefit_per_patient).toFixed(2); // Uptake scales
    const icer = total_cost / qaly_gain_per_patient;

    currentResults = {
        uptake_prob: (P_i * 100).toFixed(2),
        total_cost: total_cost.toFixed(2),
        drug_cost: (drug_cost_month * duration).toFixed(2),
        monitoring_cost: (monitoring_cost_month * duration).toFixed(2),
        other_cost: (other_cost_month * duration).toFixed(2),
        savings: savings_per_patient.toFixed(2),
        qaly_gain: qaly_gain_per_patient.toFixed(2),
        net_benefit: net_benefit_per_patient.toFixed(2),
        expected_net_benefit,
        icer: icer.toFixed(2)
    };

    // Detailed intuitive recommendations
    let recs = '<h3>Recommendations:</h3>';
    if (P_i < 0.6) recs += '<p>Uptake is low (<60%). To improve: Lower cost below £100/month or choose milder side effects. Studies show patients prefer low-cost, effective options.</p>';
    if (efficacy < 4) recs += '<p>Efficacy is low. Aim for >5 kg/m² reduction (e.g., combined program) to cut incontinence risk by 20% and save ~£460 in complications.</p>';
    if (icer > 20000) recs += '<p>ICER high (>£20k/QALY). Not cost-effective for NHS; reduce duration or switch to lifestyle alone for better value.</p>';
    if (programme === 'combined') recs += '<p>Combined program: Great for efficacy but monitor side effects. Expect 38% lower incontinence odds from weight loss.</p>';
    recs += '<p>Overall: ' + (icer < 20000 ? 'Cost-effective! Proceed with confidence.' : 'Reconsider attributes for better balance.') + '</p>';
    document.getElementById('recommendations').innerHTML = recs;

    // Uptake Chart (Doughnut)
    document.getElementById('uptakeResults').innerHTML = `<p>Uptake: ${currentResults.uptake_prob}% (Likelihood patients choose this over nothing.)</p>`;
    const uptakeCtx = document.getElementById('uptakeChart').getContext('2d');
    if (uptakeChart) uptakeChart.destroy();
    uptakeChart = new Chart(uptakeCtx, {
        type: 'doughnut',
        data: { labels: ['Uptake', 'Opt-Out'], datasets: [{ data: [P_i * 100, 100 - P_i * 100], backgroundColor: ['#28a745', '#dc3545'] }] },
        options: { responsive: true, plugins: { legend: { position: 'top' } } }
    });

    // CBA Table & Bar Chart
    let cbaHtml = `
        <table>
            <tr><th>Component</th><th>Value (£)</th></tr>
            <tr><td>Drug Cost</td><td>${currentResults.drug_cost}</td></tr>
            <tr><td>Monitoring Cost</td><td>${currentResults.monitoring_cost}</td></tr>
            <tr><td>Other Cost</td><td>${currentResults.other_cost}</td></tr>
            <tr><td>Total Cost</td><td>${currentResults.total_cost}</td></tr>
            <tr><td>Savings from Reduced Complications</td><td>${currentResults.savings}</td></tr>
            <tr><td>QALY Gain</td><td>${currentResults.qaly_gain}</td></tr>
            <tr><td>Net Benefit per Patient</td><td>${currentResults.net_benefit}</td></tr>
            <tr><td>Expected Net Benefit (with Uptake)</td><td>${currentResults.expected_net_benefit}</td></tr>
            <tr><td>ICER (/QALY)</td><td>${currentResults.icer}</td></tr>
        </table>`;
    document.getElementById('cbaResults').innerHTML = cbaHtml;
    const cbaCtx = document.getElementById('cbaChart').getContext('2d');
    if (cbaChart) cbaChart.destroy();
    cbaChart = new Chart(cbaCtx, {
        type: 'bar',
        data: {
            labels: ['Total Cost', 'Savings', 'Net Benefit', 'Expected Net Benefit'],
            datasets: [{ label: 'Metrics (£)', data: [total_cost, savings_per_patient, net_benefit_per_patient, P_i * net_benefit_per_patient], backgroundColor: ['#ffc107', '#17a2b8', '#007bff', '#6f42c1'] }]
        },
        options: { responsive: true, scales: { y: { beginAtZero: true } } }
    });
}

function simulate() {
    simData = [];
    for (let i = 0; i < 100; i++) {
        const simEfficacy = currentResults ? parseFloat(currentResults.qaly_gain) + (Math.random() - 0.5) * 0.1 : 0; // Variability in QALY
        const simCost = currentResults ? parseFloat(currentResults.total_cost) * (1 + (Math.random() - 0.5) * 0.2) : 0; // 20% var
        simData.push(simCost / simEfficacy);
    }
    const simCtx = document.getElementById('simChart').getContext('2d');
    if (simChart) simChart.destroy();
    simChart = new Chart(simCtx, {
        type: 'histogram',
        data: { datasets: [{ label: 'Simulated ICERs', data: simData, backgroundColor: '#007bff' }] },
        options: { responsive: true, scales: { x: { type: 'linear' }, y: { beginAtZero: true } } }
    });
}

function saveScenario() {
    if (!Object.keys(currentResults).length) return alert('Calculate first.');
    const inputs = {
        bmi: document.getElementById('bmi').value,
        cost: document.getElementById('cost').value,
        efficacy: document.getElementById('efficacy').value,
        side_effects: getRadioValue('side_effects'),
        frequency: getRadioValue('frequency'),
        method: getRadioValue('method'),
        duration: getRadioValue('duration'),
        programme: getRadioValue('programme')
    };
    scenarios.push({ inputs, results: currentResults });
    updateScenarioList();
}

function updateScenarioList() {
    const list = document.getElementById('scenarioList');
    list.innerHTML = '';
    scenarios.forEach((sc, index) => {
        const li = document.createElement('li');
        li.innerHTML = `Scenario ${index + 1}: BMI=${sc.inputs.bmi}, Uptake=${sc.results.uptake_prob}%, Expected Net Benefit=£${sc.results.expected_net_benefit}`;
        list.appendChild(li);
    });
}

function generatePDF() {
    if (!Object.keys(currentResults).length) return alert('Calculate first.');
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    doc.text('OptiWeight-PC Report', 10, 10);
    let y = 20;
    Object.entries(currentResults).forEach(([key, val]) => {
        doc.text(`${key.replace(/_/g, ' ')}: ${val}`, 10, y);
        y += 10;
    });
    if (uptakeChart) doc.addImage(document.getElementById('uptakeChart').toDataURL('image/png'), 'PNG', 10, y, 90, 45); y += 50;
    if (cbaChart) doc.addImage(document.getElementById('cbaChart').toDataURL('image/png'), 'PNG', 10, y, 90, 45); y += 50;
    if (simChart) doc.addImage(document.getElementById('simChart').toDataURL('image/png'), 'PNG', 10, y, 90, 45);
    doc.save('optiweight_report.pdf');
}

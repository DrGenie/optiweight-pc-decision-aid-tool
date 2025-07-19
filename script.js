let uptakeChart, cbaChart, simChart;
let scenarios = [];
let currentResults = {};
let simData = [];

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

document.getElementById('calculateBtn').addEventListener('click', calculate);
document.getElementById('simulateBtn').addEventListener('click', simulate);
document.getElementById('saveScenarioBtn').addEventListener('click', saveScenario);
document.getElementById('generatePDFBtn').addEventListener('click', generatePDF);

function getRadioValue(name) {
    const selected = document.querySelector(`input[name="${name}"]:checked`);
    return selected ? selected.value : null;
}

function calculate() {
    const bmi = parseFloat(document.getElementById('bmi').value);
    if (bmi < 27 || bmi > 35) {
        alert('BMI must be between 27 and 35 kg/m².');
        return;
    }

    const cost = parseFloat(document.getElementById('cost').value);
    const efficacy = parseFloat(document.getElementById('efficacy').value);
    const side_effects = parseFloat(getRadioValue('side_effects') || 0);
    const frequency = getRadioValue('frequency') || 'weekly';
    const method = getRadioValue('method') || 'injection';
    const duration = parseInt(getRadioValue('duration') || 12);
    const programme = getRadioValue('programme') || 'combined';

    // Realistic betas based on DCE literature
    const beta_cost = -0.015; // Cost sensitivity
    const beta_efficacy = 0.6; // Preference for BMI reduction
    const beta_side = -0.25; // Dislike for side effects
    const beta_freq = frequency === 'weekly' ? -0.15 : 0;
    const beta_method = method === 'injection' ? -0.1 : 0.1;
    const beta_duration = duration === 12 ? -0.05 : 0;
    const beta_programme = programme === 'combined' ? 0.3 : 0;

    const U_i = (beta_cost * cost) + (beta_efficacy * efficacy) + (beta_side * side_effects) +
                beta_freq + beta_method + beta_duration + beta_programme;
    const U_optout = 0;
    const P_i = Math.exp(U_i) / (Math.exp(U_i) + Math.exp(U_optout));

    // Detailed CBA based on Bolenz et al. and NHS/BNF
    const drug_cost_month = method === 'injection' ? 175 : 0; // Semaglutide £175
    const monitoring_cost_month = programme === 'combined' ? 50 : 30; // Clinic visits
    const admin_cost_month = 20; // Admin/staff
    const training_cost_month = programme === 'lifestyle' ? 15 : 0; // Lifestyle app training
    const total_cost_month = drug_cost_month + monitoring_cost_month + admin_cost_month + training_cost_month;
    const total_cost = total_cost_month * duration;
    const savings_per_patient = efficacy * 92; // £460 / 5 kg/m² (Bolenz et al.)
    const qaly_gain_per_patient = efficacy * 0.05; // ~0.25-0.5 QALY for 5-10 reduction
    const qaly_value = qaly_gain_per_patient * 20000; // NHS £20k/QALY
    const net_benefit_per_patient = savings_per_patient + qaly_value - total_cost;
    const expected_net_benefit = (P_i * net_benefit_per_patient).toFixed(2); // Uptake scales

    const icer = qaly_gain_per_patient > 0 ? (total_cost / qaly_gain_per_patient).toFixed(2) : 'N/A';

    currentResults = {
        uptake_prob: (P_i * 100).toFixed(2),
        total_cost: total_cost.toFixed(2),
        drug_cost: (drug_cost_month * duration).toFixed(2),
        monitoring_cost: (monitoring_cost_month * duration).toFixed(2),
        admin_cost: (admin_cost_month * duration).toFixed(2),
        training_cost: (training_cost_month * duration).toFixed(2),
        savings: savings_per_patient.toFixed(2),
        qaly_gain: qaly_gain_per_patient.toFixed(2),
        qaly_value: qaly_value.toFixed(2),
        net_benefit: net_benefit_per_patient.toFixed(2),
        expected_net_benefit,
        icer
    };

    // Detailed recommendations
    let recs = '<h3>Recommendations</h3><ul>';
    if (P_i < 0.6) recs += '<li><strong>Low Uptake (<60%):</strong> Patients may avoid this program. Reduce costs to £100/month or select milder side effects. Research shows cost and side effects drive refusals.</li>';
    if (efficacy < 4) recs += '<li><strong>Low Efficacy:</strong> Aim for >5 kg/m² BMI reduction (e.g., combined program) to cut incontinence risk by 20% and save ~£460 in complications.</li>';
    if (icer !== 'N/A' && parseFloat(icer) > 20000) recs += '<li><strong>High ICER:</strong> Above NHS threshold (£20k/QALY). Try shorter duration or lifestyle-only to improve cost-effectiveness.</li>';
    if (programme === 'combined') recs += '<li><strong>Combined Program:</strong> High efficacy but monitor side effects like nausea. Expect 38% lower incontinence odds (Look AHEAD trial).</li>';
    if (method === 'lifestyle') recs += '<li><strong>Lifestyle Only:</strong> Safer, lower cost, but slower. Pair with NHS app for better adherence.</li>';
    recs += `<li><strong>Overall:</strong> ${icer !== 'N/A' && parseFloat(icer) < 20000 ? 'Cost-effective; strong candidate for adoption.' : 'Adjust attributes for better value.'}</li></ul>`;
    document.getElementById('recommendations').innerHTML = recs;

    // Uptake Tab
    document.getElementById('uptakeResults').innerHTML = `<p><strong>Uptake Probability:</strong> ${currentResults.uptake_prob}% (Likelihood patients choose this program over no intervention.)</p>`;
    const uptakeCtx = document.getElementById('uptakeChart').getContext('2d');
    if (uptakeChart) uptakeChart.destroy();
    uptakeChart = new Chart(uptakeCtx, {
        type: 'doughnut',
        data: {
            labels: ['Uptake', 'Opt-Out'],
            datasets: [{ data: [P_i * 100, 100 - P_i * 100], backgroundColor: ['#28a745', '#dc3545'], borderColor: '#ffffff' }]
        },
        options: {
            responsive: true,
            plugins: { legend: { position: 'top', labels: { font: { size: 12 } } } }
        }
    });

    // Cost-Benefit Tab
    let cbaHtml = `
        <table>
            <tr><th>Component</th><th>Value (£)</th><th>Description</th></tr>
            <tr><td>Drug Cost</td><td>${currentResults.drug_cost}</td><td>Semaglutide (Wegovy) at £175/month for injections; £0 for lifestyle.</td></tr>
            <tr><td>Monitoring Cost</td><td>${currentResults.monitoring_cost}</td><td>Clinic visits; £50/month (combined), £30/month (lifestyle).</td></tr>
            <tr><td>Admin Cost</td><td>${currentResults.admin_cost}</td><td>Staff/program admin; £20/month.</td></tr>
            <tr><td>Training Cost</td><td>${currentResults.training_cost}</td><td>Lifestyle app training; £15/month for lifestyle, £0 for combined.</td></tr>
            <tr><td>Total Cost</td><td>${currentResults.total_cost}</td><td>Sum of all costs over duration.</td></tr>
            <tr><td>Savings</td><td>${currentResults.savings}</td><td>From reduced complications; £92 per 1 kg/m² BMI reduction.</td></tr>
            <tr><td>QALY Gain</td><td>${currentResults.qaly_gain}</td><td>Quality-of-life gain; 0.05 QALY per 1 kg/m² reduction.</td></tr>
            <tr><td>QALY Value</td><td>${currentResults.qaly_value}</td><td>Monetized at £20,000/QALY (NHS standard).</td></tr>
            <tr><td>Net Benefit per Patient</td><td>${currentResults.net_benefit}</td><td>Savings + QALY value - Total Cost.</td></tr>
            <tr><td>Expected Net Benefit</td><td>${currentResults.expected_net_benefit}</td><td>Net benefit scaled by ${currentResults.uptake_prob}% uptake.</td></tr>
            <tr><td>ICER (/QALY)</td><td>${currentResults.icer}</td><td>Total Cost ÷ QALY Gain; <£20k is cost-effective.</td></tr>
        </table>`;
    document.getElementById('cbaResults').innerHTML = cbaHtml;
    const cbaCtx = document.getElementById('cbaChart').getContext('2d');
    if (cbaChart) cbaChart.destroy();
    cbaChart = new Chart(cbaCtx, {
        type: 'bar',
        data: {
            labels: ['Total Cost', 'Savings', 'QALY Value', 'Net Benefit', 'Expected Benefit'],
            datasets: [{
                label: 'Cost-Benefit Metrics (£)',
                data: [total_cost, savings_per_patient, qaly_value, net_benefit_per_patient, P_i * net_benefit_per_patient],
                backgroundColor: ['#ff6b6b', '#4caf50', '#17a2b8', '#1a73e8', '#6f42c1'],
                borderColor: '#ffffff',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            scales: { y: { beginAtZero: true, title: { display: true, text: 'Value (£)' } } },
            plugins: { legend: { labels: { font: { size: 12 } } } }
        }
    });

    // Clear simulation chart until simulated
    if (simChart) simChart.destroy();
    simData = [];
    document.getElementById('simChart').getContext('2d').clearRect(0, 0, 400, 200);
}

function simulate() {
    if (!Object.keys(currentResults).length) {
        alert('Calculate results first.');
        return;
    }
    simData = [];
    for (let i = 0; i < 100; i++) {
        const simEfficacy = parseFloat(currentResults.qaly_gain) * (1 + (Math.random() - 0.5) * 0.2); // ±20% QALY
        const simCost = parseFloat(currentResults.total_cost) * (1 + (Math.random() - 0.5) * 0.15); // ±15% cost
        simData.push(simEfficacy > 0 ? simCost / simEfficacy : 100000); // Cap outliers
    }
    const simCtx = document.getElementById('simChart').getContext('2d');
    if (simChart) simChart.destroy();
    simChart = new Chart(simCtx, {
        type: 'histogram',
        data: {
            datasets: [{
                label: 'Simulated ICERs (£/QALY)',
                data: simData,
                backgroundColor: '#1a73e8',
                borderColor: '#ffffff',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            scales: {
                x: { type: 'linear', title: { display: true, text: 'ICER (£/QALY)' } },
                y: { beginAtZero: true, title: { display: true, text: 'Frequency' } }
            },
            plugins: { legend: { labels: { font: { size: 12 } } } }
        }
    });
}

function saveScenario() {
    if (!Object.keys(currentResults).length) {
        alert('Calculate results first.');
        return;
    }
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
        li.innerHTML = `Scenario ${index + 1}: BMI=${sc.inputs.bmi}, Uptake=${sc.results.uptake_prob}%, Expected Net Benefit=£${sc.results.expected_net_benefit}, ICER=£${sc.results.icer}/QALY`;
        list.appendChild(li);
    });
}

function generatePDF() {
    if (!Object.keys(currentResults).length) {
        alert('Calculate results first.');
        return;
    }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    doc.setFontSize(14);
    doc.text('OptiWeight-PC Decision Aid Report', 10, 10);
    doc.setFontSize(10);
    let y = 20;
    Object.entries(currentResults).forEach(([key, val]) => {
        doc.text(`${key.replace(/_/g, ' ').toUpperCase()}: ${val}`, 10, y);
        y += 8;
    });
    if (uptakeChart) {
        doc.text('Uptake Chart', 10, y);
        doc.addImage(document.getElementById('uptakeChart').toDataURL('image/png'), 'PNG', 10, y + 5, 90, 45);
        y += 55;
    }
    if (cbaChart) {
        doc.text('Cost-Benefit Chart', 10, y);
        doc.addImage(document.getElementById('cbaChart').toDataURL('image/png'), 'PNG', 10, y + 5, 90, 45);
        y += 55;
    }
    if (simChart) {
        doc.text('Simulation Chart', 10, y);
        doc.addImage(document.getElementById('simChart').toDataURL('image/png'), 'PNG', 10, y + 5, 90, 45);
    }
    doc.save('optiweight_report.pdf');
}

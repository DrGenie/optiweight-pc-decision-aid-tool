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
document.querySelector('.close-popup').addEventListener('click', () => document.getElementById('resultsPopup').classList.remove('active'));

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

    // Detailed CBA (NHS/BNF, Bolenz et al.)
    const drug_cost_month = method === 'injection' ? 175 : 0; // Semaglutide £175
    const monitoring_cost_month = programme === 'combined' ? 50 : 30; // Clinic visits
    const admin_cost_month = 20; // Admin/staff
    const training_cost_month = programme === 'lifestyle' ? 15 : 0; // App training
    const total_cost_month = drug_cost_month + monitoring_cost_month + admin_cost_month + training_cost_month;
    const total_cost = total_cost_month * duration;
    const savings_per_patient = efficacy * 92; // £460 / 5 kg/m² (Bolenz et al.)
    const qaly_gain_per_patient = efficacy * 0.05; // 0.05 QALY per 1 kg/m²
    const qaly_value = qaly_gain_per_patient * 20000; // NHS £20k/QALY
    const net_benefit_per_patient = savings_per_patient + qaly_value - total_cost;
    const expected_net_benefit = (P_i * net_benefit_per_patient).toFixed(2);

    const icer = qaly_gain_per_patient > 0 ? (total_cost / qaly_gain_per_patient).toFixed(2) : 'N/A';

    currentResults = {
        inputs: { bmi, cost, efficacy, side_effects, frequency, method, duration, programme },
        outputs: {
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
        }
    };

    // Detailed recommendations
    let recs = '<h3>Recommendations</h3><ul>';
    if (P_i < 0.6) recs += '<li><strong>Low Uptake (<60%):</strong> Patients may avoid this program. Reduce costs to ~£100/month or select milder side effects to boost acceptance.</li>';
    if (efficacy < 4) recs += '<li><strong>Low Efficacy:</strong> Target >5 kg/m² BMI reduction (e.g., combined program) to reduce incontinence risk by 20% and save ~£460 in complications.</li>';
    if (icer !== 'N/A' && parseFloat(icer) > 20000) recs += '<li><strong>High ICER:</strong> Above NHS £20k/QALY threshold. Try 6-month duration or lifestyle-only for better value.</li>';
    if (programme === 'combined') recs += '<li><strong>Combined Program:</strong> High efficacy (38% lower incontinence odds per Look AHEAD trial) but monitor nausea. Consider patient tolerance.</li>';
    if (method === 'lifestyle') recs += '<li><strong>Lifestyle Only:</strong> Safer and cheaper but slower. Use NHS Weight Loss App to improve adherence.</li>';
    recs += `<li><strong>Summary:</strong> ${icer !== 'N/A' && parseFloat(icer) < 20000 ? 'Cost-effective; ideal for NHS adoption.' : 'Adjust cost or efficacy for better outcomes.'}</li></ul>`;
    
    // Popup Results
    let popupHtml = `
        <h4>Inputs</h4>
        <p>BMI: ${bmi} kg/m², Cost: £${cost}/month, Efficacy: ${efficacy} kg/m², Side Effects: ${['None', 'Mild', 'Moderate'][side_effects]},
        Frequency: ${frequency}, Method: ${method}, Duration: ${duration} months, Programme: ${programme}</p>
        <h4>Results</h4>
        <p>Uptake: ${currentResults.outputs.uptake_prob}%</p>
        <p>Total Cost: £${currentResults.outputs.total_cost}</p>
        <p>Net Benefit: £${currentResults.outputs.net_benefit}</p>
        <p>Expected Net Benefit (with uptake): £${currentResults.outputs.expected_net_benefit}</p>
        <p>ICER: £${currentResults.outputs.icer}/QALY</p>`;
    document.getElementById('popupResults').innerHTML = popupHtml;
    document.getElementById('recommendations').innerHTML = recs;
    document.getElementById('resultsPopup').classList.add('active');

    // Uptake Tab
    document.getElementById('uptakeResults').innerHTML = `<p><strong>Uptake Probability:</strong> ${currentResults.outputs.uptake_prob}% (Likelihood patients choose this program.)</p>`;
    const uptakeCtx = document.getElementById('uptakeChart').getContext('2d');
    if (uptakeChart) uptakeChart.destroy();
    uptakeChart = new Chart(uptakeCtx, {
        type: 'doughnut',
        data: {
            labels: ['Uptake', 'Opt-Out'],
            datasets: [{ data: [P_i * 100, 100 - P_i * 100], backgroundColor: [getComputedStyle(document.documentElement).getPropertyValue('--secondary-color'), getComputedStyle(document.documentElement).getPropertyValue('--accent-color')], borderColor: '#ffffff', borderWidth: 1 }]
        },
        options: {
            responsive: true,
            plugins: { legend: { position: 'top', labels: { font: { size: 12 } } }, title: { display: true, text: 'Uptake Probability (%)' } }
        }
    });

    // Cost-Benefit Tab
    let cbaHtml = `
        <table>
            <tr><th>Component</th><th>Value (£)</th><th>Calculation</th></tr>
            <tr><td>Drug Cost</td><td>${currentResults.outputs.drug_cost}</td><td>Semaglutide (£175/month for injections, £0 for lifestyle) × ${duration} months.</td></tr>
            <tr><td>Monitoring Cost</td><td>${currentResults.outputs.monitoring_cost}</td><td>Clinic visits (£50/month for combined, £30 for lifestyle) × ${duration} months.</td></tr>
            <tr><td>Admin Cost</td><td>${currentResults.outputs.admin_cost}</td><td>Staff/program admin (£20/month) × ${duration} months.</td></tr>
            <tr><td>Training Cost</td><td>${currentResults.outputs.training_cost}</td><td>Lifestyle app training (£15/month for lifestyle, £0 for combined) × ${duration} months.</td></tr>
            <tr><td>Total Cost</td><td>${currentResults.outputs.total_cost}</td><td>Sum of drug, monitoring, admin, training costs.</td></tr>
            <tr><td>Savings</td><td>${currentResults.outputs.savings}</td><td>£92 per 1 kg/m² BMI reduction × ${efficacy} kg/m² (from reduced complications, Bolenz et al.).</td></tr>
            <tr><td>QALY Gain</td><td>${currentResults.outputs.qaly_gain}</td><td>0.05 QALY per 1 kg/m² × ${efficacy} kg/m².</td></tr>
            <tr><td>QALY Value</td><td>${currentResults.outputs.qaly_value}</td><td>QALY Gain × £20,000 (NHS standard).</td></tr>
            <tr><td>Net Benefit per Patient</td><td>${currentResults.outputs.net_benefit}</td><td>Savings + QALY Value - Total Cost.</td></tr>
            <tr><td>Expected Net Benefit</td><td>${currentResults.outputs.expected_net_benefit}</td><td>Net Benefit × ${currentResults.outputs.uptake_prob}% uptake.</td></tr>
            <tr><td>ICER (/QALY)</td><td>${currentResults.outputs.icer}</td><td>Total Cost ÷ QALY Gain; <£20,000 is cost-effective.</td></tr>
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
                backgroundColor: ['#ff6b6b', getComputedStyle(document.documentElement).getPropertyValue('--secondary-color'), '#17a2b8', getComputedStyle(document.documentElement).getPropertyValue('--primary-color'), getComputedStyle(document.documentElement).getPropertyValue('--accent-color')],
                borderColor: '#ffffff',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            scales: { y: { beginAtZero: true, title: { display: true, text: 'Value (£)' } } },
            plugins: { legend: { labels: { font: { size: 12 } } }, title: { display: true, text: 'Cost-Benefit Breakdown' } }
        }
    });

    // Clear simulation chart
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
        const simEfficacy = parseFloat(currentResults.outputs.qaly_gain) * (1 + (Math.random() - 0.5) * 0.2); // ±20% QALY
        const simCost = parseFloat(currentResults.outputs.total_cost) * (1 + (Math.random() - 0.5) * 0.15); // ±15% cost
        simData.push(simEfficacy > 0 ? simCost / simEfficacy : 100000);
    }
    const simCtx = document.getElementById('simChart').getContext('2d');
    if (simChart) simChart.destroy();
    simChart = new Chart(simCtx, {
        type: 'histogram',
        data: {
            datasets: [{
                label: 'Simulated ICERs (£/QALY)',
                data: simData,
                backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--primary-color'),
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
            plugins: { legend: { labels: { font: { size: 12 } } }, title: { display: true, text: 'ICER Uncertainty Simulation' } }
        }
    });
}

function saveScenario() {
    if (!Object.keys(currentResults).length) {
        alert('Calculate results first.');
        return;
    }
    scenarios.push(currentResults);
    updateScenarioList();
}

function updateScenarioList() {
    const list = document.getElementById('scenarioList');
    list.innerHTML = '';
    scenarios.forEach((sc, index) => {
        const li = document.createElement('li');
        li.innerHTML = `Scenario ${index + 1}: BMI=${sc.inputs.bmi}, Uptake=${sc.outputs.uptake_prob}%, Expected Net Benefit=£${sc.outputs.expected_net_benefit}, ICER=£${sc.outputs.icer}/QALY`;
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
    
    // Inputs
    doc.text('Inputs', 10, 20);
    let y = 30;
    const inputs = currentResults.inputs;
    doc.text(`BMI: ${inputs.bmi} kg/m²`, 10, y); y += 8;
    doc.text(`Cost: £${inputs.cost}/month`, 10, y); y += 8;
    doc.text(`Efficacy: ${inputs.efficacy} kg/m²`, 10, y); y += 8;
    doc.text(`Side Effects: ${['None', 'Mild', 'Moderate'][inputs.side_effects]}`, 10, y); y += 8;
    doc.text(`Frequency: ${inputs.frequency}`, 10, y); y += 8;
    doc.text(`Method: ${inputs.method}`, 10, y); y += 8;
    doc.text(`Duration: ${inputs.duration} months`, 10, y); y += 8;
    doc.text(`Programme: ${inputs.programme}`, 10, y); y += 8;

    // Results
    doc.text('Results', 10, y); y += 10;
    Object.entries(currentResults.outputs).forEach(([key, val]) => {
        doc.text(`${key.replace(/_/g, ' ').toUpperCase()}: ${val}`, 10, y);
        y += 8;
    });

    // Recommendations
    doc.text('Recommendations', 10, y); y += 10;
    const recsText = document.getElementById('recommendations').innerText.replace(/\n/g, ' ').substring(0, 500);
    doc.text(recsText, 10, y, { maxWidth: 180 }); y += 30;

    // Charts
    if (uptakeChart) {
        doc.text('Uptake Probability', 10, y);
        doc.addImage(document.getElementById('uptakeChart').toDataURL('image/png'), 'PNG', 10, y + 5, 90, 45);
        y += 55;
    }
    if (cbaChart) {
        doc.text('Cost-Benefit Breakdown', 10, y);
        doc.addImage(document.getElementById('cbaChart').toDataURL('image/png'), 'PNG', 10, y + 5, 90, 45);
        y += 55;
    }
    if (simChart) {
        doc.text('ICER Uncertainty Simulation', 10, y);
        doc.addImage(document.getElementById('simChart').toDataURL('image/png'), 'PNG', 10, y + 5, 90, 45);
    }

    doc.save('optiweight_report.pdf');
}

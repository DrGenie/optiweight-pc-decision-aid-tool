// Global varisables for charts and state
let uptakeChart, cbaChart, simChart;
let scenarios = [];
let currentResults = {};
let simData = [];

// Event listeners for sliderss (live value update)
document.getElementById('bmi').addEventListener('input', (e) => document.getElementById('bmiValue').textContent = e.target.value);
document.getElementById('cost').addEventListener('input', (e) => document.getElementById('costValue').textContent = e.target.value);
document.getElementById('efficacy').addEventListener('input', (e) => document.getElementById('efficacyValue').textContent = e.target.value);

// Tab navigation
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
        document.getElementById(btn.dataset.tab).classList.add('active');
    });
});

// Button event listeners
document.getElementById('calculateBtn').addEventListener('click', calculate);
document.getElementById('simulateBtn').addEventListener('click', simulate);
document.getElementById('saveScenarioBtn').addEventListener('click', saveScenario);
document.getElementById('generatePDFBtn').addEventListener('click', generatePDF);
document.querySelector('.close-popup').addEventListener('click', () => document.getElementById('resultsPopup').classList.remove('active'));

// Helper to get radio value
function getRadioValue(name) {
    const selected = document.querySelector(`input[name="${name}"]:checked`);
    return selected ? selected.value : null;
}

// Calculate function - computes uptake and CBA, shows popup
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

    // Realistic betas from DCE literature (cost negative, efficacy positive, etc.)
    const beta_cost = -0.015;
    const beta_efficacy = 0.6;
    const beta_side = -0.25;
    const beta_freq = frequency === 'weekly' ? -0.15 : 0;
    const beta_method = method === 'injection' ? -0.1 : 0.1;
    const beta_duration = duration === 12 ? -0.05 : 0;
    const beta_programme = programme === 'combined' ? 0.3 : 0;

    const U_i = (beta_cost * cost) + (beta_efficacy * efficacy) + (beta_side * side_effects) +
                beta_freq + beta_method + beta_duration + beta_programme;
    const U_optout = 0;
    const P_i = Math.exp(U_i) / (Math.exp(U_i) + Math.exp(U_optout));

    // Detailed CBA components (based on NHS/BNF, Bolenz et al.)
    const drug_cost_month = method === 'injection' ? 175 : 0; // Semaglutide maintenance price
    const monitoring_cost_month = programme === 'combined' ? 50 : 30; // Clinic visits
    const admin_cost_month = 20; // Administrative costs
    const training_cost_month = programme === 'lifestyle' ? 15 : 0; // Lifestyle training
    const total_cost_month = drug_cost_month + monitoring_cost_month + admin_cost_month + training_cost_month;
    const total_cost = total_cost_month * duration;
    const savings_per_patient = efficacy * 92; // £92 per kg/m² from reduced complications (Bolenz et al.)
    const qaly_gain_per_patient = efficacy * 0.05; // 0.05 QALY per kg/m² based on literature
    const qaly_value = qaly_gain_per_patient * 20000; // NHS threshold £20k/QALY
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

    // Detailed professional recommendations
    let recs = '<h3>Recommendations</h3><ul>';
    if (P_i < 0.6) recs += '<li><strong>Low Uptake (<60%):</strong> Potential patient avoidance. Recommend reducing costs to ~£100/month or selecting milder side effects to enhance acceptability, based on DCE preference weights.</li>';
    if (efficacy < 4) recs += '<li><strong>Low Efficacy:</strong> Target >5 kg/m² BMI reduction (e.g., combined Semaglutide + lifestyle) to achieve ~20% incontinence risk reduction and ~£460 savings in complications (meta-analysis data).</li>';
    if (icer !== 'N/A' && parseFloat(icer) > 20000) recs += '<li><strong>High ICER:</strong> Exceeds NHS £20k/QALY threshold. Suggest shortening to 6 months or switching to lifestyle-only for improved cost-effectiveness.</li>';
    if (programme === 'combined') recs += '<li><strong>Combined Program:</strong> Offers high efficacy with 38% lower incontinence odds (Look AHEAD trial), but monitor GI side effects. Suitable for high-risk patients.</li>';
    if (method === 'lifestyle') recs += '<li><strong>Lifestyle Only:</strong> Lower risk and cost, but efficacy may be limited. Integrate NHS Weight Loss App for better compliance (25% attrition mitigation per reviews).</li>';
    recs += `<li><strong>Summary:</strong> ${icer !== 'N/A' && parseFloat(icer) < 20000 ? 'Highly cost-effective; recommend for guideline inclusion.' : 'Further optimization needed for viability.'}</li></ul>`;
    
    // Popup content
    let popupHtml = `
        <h4>Inputs</h4>
        <p>BMI: ${bmi} kg/m², Cost: £${cost}/month, Efficacy: ${efficacy} kg/m², Side Effects: ${['None', 'Mild', 'Moderate'][side_effects]},
        Frequency: ${frequency}, Method: ${method}, Duration: ${duration} months, Programme: ${programme}</p>
        <h4>Outputs</h4>
        <p>Uptake Probability: ${currentResults.outputs.uptake_prob}%</p>
        <p>Total Cost: £${currentResults.outputs.total_cost}</p>
        <p>Net Benefit per Patient: £${currentResults.outputs.net_benefit}</p>
        <p>Expected Net Benefit (scaled by uptake): £${currentResults.outputs.expected_net_benefit}</p>
        <p>ICER: £${currentResults.outputs.icer}/QALY</p>`;
    document.getElementById('popupResults').innerHTML = popupHtml;
    document.getElementById('recommendations').innerHTML = recs;
    document.getElementById('resultsPopup').classList.add('active');

    // Render uptake chart
    const uptakeCtx = document.getElementById('uptakeChart').getContext('2d');
    if (uptakeChart) uptakeChart.destroy();
    uptakeChart = new Chart(uptakeCtx, {
        type: 'doughnut',
        data: {
            labels: ['Uptake', 'Opt-Out'],
            datasets: [{ data: [P_i * 100, 100 - P_i * 100], backgroundColor: [var(--secondary-color), var(--accent-color)], borderColor: '#ffffff', borderWidth: 1 }]
        },
        options: {
            responsive: true,
            plugins: { legend: { position: 'top', labels: { font: { size: 12 } } }, title: { display: true, text: 'Uptake Probability (%)' } }
        }
    });

    // Render cost-benefit chart
    const cbaCtx = document.getElementById('cbaChart').getContext('2d');
    if (cbaChart) cbaChart.destroy();
    cbaChart = new Chart(cbaCtx, {
        type: 'bar',
        data: {
            labels: ['Total Cost', 'Savings', 'QALY Value', 'Net Benefit', 'Expected Benefit'],
            datasets: [{
                label: 'Cost-Benefit Metrics (£)',
                data: [total_cost, savings_per_patient, qaly_value, net_benefit_per_patient, P_i * net_benefit_per_patient],
                backgroundColor: [var(--accent-color), var(--secondary-color), '#17a2b8', var(--primary-color), var(--primary-dark)],
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

    // Update uptake results
    document.getElementById('uptakeResults').innerHTML = `<p><strong>Uptake Probability:</strong> ${currentResults.outputs.uptake_prob}% (Percentage of patients likely to adopt this intervention based on DCE preferences.)</p>`;

    // Update CBA results with dynamic calculations
    let cbaHtml = `
        <table>
            <tr><th>Component</th><th>Value (£)</th><th>Calculation Method</th></tr>
            <tr><td>Drug Cost</td><td>${currentResults.outputs.drug_cost}</td><td>Semaglutide (£175/month for injections, £0 for lifestyle) × ${duration} months.</td></tr>
            <tr><td>Monitoring Cost</td><td>${currentResults.outputs.monitoring_cost}</td><td>Clinic visits (£50/month for combined, £30 for lifestyle) × ${duration} months.</td></tr>
            <tr><td>Admin Cost</td><td>${currentResults.outputs.admin_cost}</td><td>Staff/program admin (£20/month) × ${duration} months.</td></tr>
            <tr><td>Training Cost</td><td>${currentResults.outputs.training_cost}</td><td>Lifestyle app training (£15/month for lifestyle, £0 for combined) × ${duration} months.</td></tr>
            <tr><td>Total Cost</td><td>${currentResults.outputs.total_cost}</td><td>Sum of drug, monitoring, admin, and training costs over duration.</td></tr>
            <tr><td>Savings from Reduced Complications</td><td>${currentResults.outputs.savings}</td><td>£92 per 1 kg/m² BMI reduction × ${efficacy} kg/m² (Bolenz et al.).</td></tr>
            <tr><td>QALY Gain</td><td>${currentResults.outputs.qaly_gain}</td><td>0.05 QALY per 1 kg/m² × ${efficacy} kg/m² (estimated from health-economic models).</td></tr>
            <tr><td>QALY Value</td><td>${currentResults.outputs.qaly_value}</td><td>QALY Gain × £20,000 (NICE/NHS standard valuation).</td></tr>
            <tr><td>Net Benefit per Patient</td><td>${currentResults.outputs.net_benefit}</td><td>Savings + QALY Value - Total Cost.</td></tr>
            <tr><td>Expected Net Benefit</td><td>${currentResults.outputs.expected_net_benefit}</td><td>Net Benefit × ${currentResults.outputs.uptake_prob}% uptake (dynamic scaling for real-world adoption).</td></tr>
            <tr><td>ICER (/QALY)</td><td>${currentResults.outputs.icer}</td><td>Total Cost ÷ QALY Gain; <£20,000 indicates cost-effectiveness per NICE guidelines.</td></tr>
        </table>`;
    document.getElementById('cbaResults').innerHTML = cbaHtml;

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
    for (let i = 0; i = 100; i++) {
        const simEfficacy = parseFloat(currentResults.outputs.qaly_gain) * (1 + (Math.random() - 0.5) * 0.2); // ±20% variability for realism
        const simCost = parseFloat(currentResults.outputs.total_cost) * (1 + (Math.random() - 0.5) * 0.15); // ±15% cost variability
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
                backgroundColor: var(--primary-color),
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
            plugins: { legend: { labels: { font: { size: 12 } } }, title: { display: true, text: 'ICER Uncertainty Simulation (Monte Carlo, 100 runs)' } }
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
    
    // Inputs section
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

    // Outputs section
    doc.text('Outputs', 10, y); y += 10;
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

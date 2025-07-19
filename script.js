let uptakeChart, cbaChart;
let scenarios = [];
let currentResults = {};

document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
        document.getElementById(btn.dataset.tab).classList.add('active');
    });
});

function calculate() {
    const bmi = parseFloat(document.getElementById('bmi').value);
    if (bmi < 27 || bmi > 35) {
        alert('BMI must be between 27 and 35 kg/m².');
        return;
    }

    const cost = parseFloat(document.getElementById('cost').value);
    const efficacy = parseFloat(document.getElementById('efficacy').value);
    const side_effects = parseFloat(document.getElementById('side_effects').value);
    const frequency = document.getElementById('frequency').value;
    const method = document.getElementById('method').value;
    const duration = parseInt(document.getElementById('duration').value);
    const programme = document.getElementById('programme').value;

    // Mixed logit utility (dummy betas)
    const beta_cost = -0.01;
    const beta_efficacy = 0.5;
    const beta_side = -0.2;
    const beta_freq = frequency === 'weekly' ? -0.1 : 0;
    const beta_method = method === 'injection' ? -0.05 : 0;
    const beta_duration = duration === 12 ? -0.1 : 0;
    const beta_programme = programme === 'combined' ? 0.2 : 0;

    const U_i = (beta_cost * cost) + (beta_efficacy * efficacy) + (beta_side * side_effects) +
                beta_freq + beta_method + beta_duration + beta_programme;
    const U_optout = 0;
    const P_i = Math.exp(U_i) / (Math.exp(U_i) + Math.exp(U_optout));

    // Detailed CBA
    const drug_cost = method === 'injection' ? cost * 0.8 : 0; // 80% drug
    const monitoring_cost = cost * 0.15; // 15% monitoring
    const other_cost = cost * 0.05; // 5% other
    const total_cost = cost * duration;
    const benefit = efficacy * 590; // Savings from reduced complications (Bolenz et al.)
    const net_benefit = benefit - total_cost;
    const qaly_gain = efficacy / 5; // Dummy QALY (adjusted for realism)
    const icer = total_cost / qaly_gain;

    currentResults = {
        uptake_prob: (P_i * 100).toFixed(2),
        total_cost,
        drug_cost: (drug_cost * duration).toFixed(2),
        monitoring_cost: (monitoring_cost * duration).toFixed(2),
        other_cost: (other_cost * duration).toFixed(2),
        net_benefit: net_benefit.toFixed(2),
        icer: icer.toFixed(2),
        qaly_gain: qaly_gain.toFixed(2)
    };

    // Dynamic recommendations
    let recs = '';
    if (P_i < 0.5) recs += '<p>Low uptake predicted; consider reducing cost or side effects.</p>';
    if (efficacy < 5) recs += '<p>Increase efficacy target for better outcomes (aim >5 kg/m² reduction).</p>';
    if (icer > 20000) recs += '<p>ICER exceeds £20,000/QALY; evaluate cost reductions.</p>';
    document.getElementById('recommendations').innerHTML = recs || '<p>Scenario looks optimal.</p>';

    // Update Uptake Tab
    document.getElementById('uptakeResults').innerHTML = `<p>Uptake Probability: ${currentResults.uptake_prob}%</p>`;
    const uptakeCtx = document.getElementById('uptakeChart').getContext('2d');
    if (uptakeChart) uptakeChart.destroy();
    uptakeChart = new Chart(uptakeCtx, {
        type: 'doughnut',
        data: {
            labels: ['Uptake', 'Opt-Out'],
            datasets: [{ data: [P_i * 100, 100 - P_i * 100], backgroundColor: ['#28a745', '#dc3545'] }]
        },
        options: { responsive: true, plugins: { legend: { position: 'top' } } }
    });

    // Update CBA Tab
    let cbaHtml = `
        <table>
            <tr><th>Component</th><th>Value (£)</th></tr>
            <tr><td>Drug Cost</td><td>${currentResults.drug_cost}</td></tr>
            <tr><td>Monitoring Cost</td><td>${currentResults.monitoring_cost}</td></tr>
            <tr><td>Other Cost</td><td>${currentResults.other_cost}</td></tr>
            <tr><td>Total Cost</td><td>${currentResults.total_cost.toFixed(2)}</td></tr>
            <tr><td>Net Benefit</td><td>${currentResults.net_benefit}</td></tr>
            <tr><td>ICER (/QALY)</td><td>${currentResults.icer}</td></tr>
            <tr><td>QALY Gain</td><td>${currentResults.qaly_gain}</td></tr>
        </table>`;
    document.getElementById('cbaResults').innerHTML = cbaHtml;
    const cbaCtx = document.getElementById('cbaChart').getContext('2d');
    if (cbaChart) cbaChart.destroy();
    cbaChart = new Chart(cbaCtx, {
        type: 'bar',
        data: {
            labels: ['Total Cost', 'Net Benefit', 'ICER'],
            datasets: [{ label: 'CBA Metrics', data: [total_cost, net_benefit, icer], backgroundColor: ['#ffc107', '#17a2b8', '#007bff'] }]
        },
        options: { responsive: true, scales: { y: { beginAtZero: true } } }
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
        side_effects: document.getElementById('side_effects').options[document.getElementById('side_effects').selectedIndex].text,
        frequency: document.getElementById('frequency').value,
        method: document.getElementById('method').value,
        duration: document.getElementById('duration').value,
        programme: document.getElementById('programme').value
    };
    scenarios.push({ inputs, results: currentResults });
    updateScenarioList();
}

function updateScenarioList() {
    const list = document.getElementById('scenarioList');
    list.innerHTML = '';
    scenarios.forEach((sc, index) => {
        const li = document.createElement('li');
        li.innerHTML = `Scenario ${index + 1}: BMI=${sc.inputs.bmi}, Uptake=${sc.results.uptake_prob}%, ICER=£${sc.results.icer}/QALY`;
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
    doc.text('OptiWeight-PC Report', 10, 10);
    let y = 20;
    doc.text(`Uptake Probability: ${currentResults.uptake_prob}%`, 10, y); y += 10;
    doc.text(`Total Cost: £${currentResults.total_cost.toFixed(2)}`, 10, y); y += 10;
    doc.text(`Net Benefit: £${currentResults.net_benefit}`, 10, y); y += 10;
    doc.text(`ICER: £${currentResults.icer}/QALY`, 10, y); y += 10;

    if (uptakeChart) {
        const uptakeImg = document.getElementById('uptakeChart').toDataURL('image/png');
        doc.addImage(uptakeImg, 'PNG', 10, y, 90, 45); y += 50;
    }
    if (cbaChart) {
        const cbaImg = document.getElementById('cbaChart').toDataURL('image/png');
        doc.addImage(cbaImg, 'PNG', 10, y, 90, 45);
    }

    doc.save('optiweight_report.pdf');
}

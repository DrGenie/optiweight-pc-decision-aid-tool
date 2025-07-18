let chart;
let scenarios = [];
let currentResults = {};

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

    // Dummy betas for mixed logit utility
    const beta_cost = -0.01;
    const beta_efficacy = 0.5; // Higher reduction better
    const beta_side = -0.2;
    const beta_freq = frequency === 'weekly' ? -0.1 : 0;
    const beta_method = method === 'injection' ? -0.05 : 0;
    const beta_duration = duration === 12 ? -0.1 : 0;
    const beta_programme = programme === 'combined' ? 0.2 : 0;

    const U_i = (beta_cost * cost) + (beta_efficacy * efficacy) + (beta_side * side_effects) +
                beta_freq + beta_method + beta_duration + beta_programme;
    const U_optout = 0;
    const P_i = Math.exp(U_i) / (Math.exp(U_i) + Math.exp(U_optout));

    // Dummy CBA
    const total_cost = cost * duration;
    const benefit = efficacy * 100; // £100 per unit BMI reduction (dummy)
    const net_benefit = benefit - total_cost;
    const qaly_gain = efficacy / 10; // Dummy QALY
    const icer = total_cost / qaly_gain;

    currentResults = {
        uptake_prob: (P_i * 100).toFixed(2) + '%',
        total_cost: '£' + total_cost.toFixed(2),
        net_benefit: '£' + net_benefit.toFixed(2),
        icer: '£' + icer.toFixed(2) + '/QALY'
    };

    // Update table
    const tbody = document.querySelector('#resultTable tbody');
    tbody.innerHTML = '';
    Object.entries(currentResults).forEach(([key, value]) => {
        const row = document.createElement('tr');
        row.innerHTML = `<td>${key.replace('_', ' ').toUpperCase()}</td><td>${value}</td>`;
        tbody.appendChild(row);
    });

    // Update chart
    const ctx = document.getElementById('uptakeChart').getContext('2d');
    if (chart) chart.destroy();
    chart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['Uptake Probability', 'Net Benefit', 'ICER'],
            datasets: [{
                label: 'Results',
                data: [P_i * 100, net_benefit, icer],
                backgroundColor: ['#4CAF50', '#2196F3', '#FFC107']
            }]
        },
        options: { scales: { y: { beginAtZero: true } } }
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
        li.innerHTML = `Scenario ${index + 1}: BMI=${sc.inputs.bmi}, Uptake=${sc.results.uptake_prob}, ICER=${sc.results.icer}`;
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
    doc.text('OptiWeight-PC Results', 10, 10);
    let y = 20;
    Object.entries(currentResults).forEach(([key, value]) => {
        doc.text(`${key.replace('_', ' ').toUpperCase()}: ${value}`, 10, y);
        y += 10;
    });

    // Add chart image if available
    if (chart) {
        const chartImg = document.getElementById('uptakeChart').toDataURL('image/png');
        doc.addImage(chartImg, 'PNG', 10, y, 180, 90);
    }

    doc.save('optiweight_report.pdf');
}
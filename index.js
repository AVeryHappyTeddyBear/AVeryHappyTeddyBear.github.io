
async function run_wasm() {
    // Load the Wasm file by awaiting the Promise returned by `wasm_bindgen`
    await wasm_bindgen('./pkg/demoparser2_bg.wasm');
    
    // Create a worker in JS. The worker also uses Rust functions
    var myWorker = new Worker('./worker.js');
    
    // Set up file picker - accept only .dem files
    const filePicker = document.getElementById("file_picker");
    filePicker.addEventListener("change", function () {
        const file = this.files[0];
        if (!file) return;
        
        // Validate file extension
        if (!file.name.toLowerCase().endsWith('.dem')) {
            showError("Please select a valid .dem (demo) file");
            return;
        }
        
        // Show loading indicator
        showLoading(true);
        hideResults();
        hideError();
        
        const reader = new FileReader();
        reader.onload = function (event) {
            try {
                const uint8Array = new Uint8Array(event.target.result);
                myWorker.postMessage({ fileBytes: uint8Array });
                
                myWorker.onmessage = function (e) {
                    showLoading(false);
                    
                    console.log("Received data:", e.data);
                    
                    if (e.data.error) {
                        showError("Error analyzing demo: " + e.data.message);
                        console.error(e.data);
                        return;
                    }
                    
                    // Display results
                    displayResults(e.data);
                    showResults(true);
                };
            } catch (err) {
                showLoading(false);
                showError("Error reading file: " + err.message);
            }
        };
        
        reader.onerror = function () {
            showLoading(false);
            showError("Error reading file");
        };
        
        reader.readAsArrayBuffer(file);
    }, false);
    
    // Tab switching functionality
    const tabButtons = document.querySelectorAll('.tab-button');
    tabButtons.forEach(button => {
        button.addEventListener('click', function () {
            const tabName = this.getAttribute('data-tab');
            switchTab(tabName);
        });
    });
}

function switchTab(tabName) {
    // Hide all tab contents
    const contents = document.querySelectorAll('.tab-content');
    contents.forEach(content => {
        content.classList.remove('active');
    });
    
    // Deactivate all buttons
    const buttons = document.querySelectorAll('.tab-button');
    buttons.forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Show selected tab
    const selectedTab = document.getElementById(tabName);
    if (selectedTab) {
        selectedTab.classList.add('active');
    }
    
    // Activate selected button
    const selectedButton = document.querySelector(`[data-tab="${tabName}"]`);
    if (selectedButton) {
        selectedButton.classList.add('active');
    }
}

function displayResults(data) {
    // Display all deaths table
    displayDeathsTable(data.allDeaths);
    
    // Display victim rankings
    displayVictimStats(data.victimRanking);
    
    // Display attacker rankings
    displayAttackerStats(data.attackerRanking);
    
    // Display top 5 unluckiest
    displayTop5(data.top5Unlucky);
}

function displayDeathsTable(deaths) {
    const table = document.getElementById('deaths-table');
    table.innerHTML = '';
    
    if (deaths.length === 0) {
        const row = table.insertRow();
        const cell = row.insertCell(0);
        cell.colSpan = 7;
        cell.textContent = 'No valid deaths found (excluding warmup and team kills)';
        return;
    }
    
    // Create header
    const headers = ['Tick', 'Victim', 'Attacker', 'Weapon', 'Distance (units)', 'Accuracy Penalty', 'Spread (cm)'];
    const headerRow = table.insertRow(0);
    headers.forEach((header, idx) => {
        const th = document.createElement('th');
        th.textContent = header;
        headerRow.appendChild(th);
    });
    
    // Add rows
    deaths.forEach(death => {
        const row = table.insertRow();
        row.insertCell(0).textContent = death.tick;
        row.insertCell(1).textContent = death.victim_name;
        row.insertCell(2).textContent = death.attacker_name;
        row.insertCell(3).textContent = death.weapon;
        row.insertCell(4).textContent = death.distance.toFixed(1);
        row.insertCell(5).textContent = death.accuracy_penalty.toFixed(3);
        const spreadCell = row.insertCell(6);
        spreadCell.textContent = death.spread.toFixed(1);
        spreadCell.classList.add('spread-value');
    });
}

function displayVictimStats(victims) {
    const table = document.getElementById('victim-table');
    table.innerHTML = '';
    
    if (victims.length === 0) {
        const row = table.insertRow();
        const cell = row.insertCell(0);
        cell.colSpan = 3;
        cell.textContent = 'No victim data available';
        return;
    }
    
    // Create header
    const headerRow = table.insertRow(0);
    ['Player', 'Avg Spread (cm)', 'Deaths'].forEach(header => {
        const th = document.createElement('th');
        th.textContent = header;
        headerRow.appendChild(th);
    });
    
    // Add rows
    victims.forEach((victim, idx) => {
        const row = table.insertRow();
        row.insertCell(0).textContent = victim.player;
        const spreadCell = row.insertCell(1);
        spreadCell.textContent = victim.avgSpread.toFixed(1);
        spreadCell.classList.add('spread-value');
        row.insertCell(2).textContent = victim.deaths;
        
        // Alternate row colors
        if (idx % 2 === 0) {
            row.classList.add('alt-row');
        }
    });
}

function displayAttackerStats(attackers) {
    const table = document.getElementById('attacker-table');
    table.innerHTML = '';
    
    if (attackers.length === 0) {
        const row = table.insertRow();
        const cell = row.insertCell(0);
        cell.colSpan = 3;
        cell.textContent = 'No attacker data available';
        return;
    }
    
    // Create header
    const headerRow = table.insertRow(0);
    ['Player', 'Avg Spread (cm)', 'Kills'].forEach(header => {
        const th = document.createElement('th');
        th.textContent = header;
        headerRow.appendChild(th);
    });
    
    // Add rows
    attackers.forEach((attacker, idx) => {
        const row = table.insertRow();
        row.insertCell(0).textContent = attacker.player;
        const spreadCell = row.insertCell(1);
        spreadCell.textContent = attacker.avgSpread.toFixed(1);
        spreadCell.classList.add('spread-value');
        row.insertCell(2).textContent = attacker.kills;
        
        // Alternate row colors
        if (idx % 2 === 0) {
            row.classList.add('alt-row');
        }
    });
}

function displayTop5(top5) {
    const table = document.getElementById('top5-table');
    table.innerHTML = '';
    
    if (top5.length === 0) {
        const row = table.insertRow();
        const cell = row.insertCell(0);
        cell.colSpan = 9;
        cell.textContent = 'No death data available';
        return;
    }
    
    // Create header
    const headerRow = table.insertRow(0);
    ['#', 'Tick', 'Victim', 'Attacker', 'Weapon', 'Hitgroup', 'Distance (units)', 'Accuracy Penalty', 'Spread (cm)'].forEach(header => {
        const th = document.createElement('th');
        th.textContent = header;
        headerRow.appendChild(th);
    });
    
    // Add rows
    top5.forEach((death, idx) => {
        const row = table.insertRow();
        row.insertCell(0).textContent = idx + 1;
        row.insertCell(1).textContent = death.tick;
        row.insertCell(2).textContent = death.victim_name;
        row.insertCell(3).textContent = death.attacker_name;
        row.insertCell(4).textContent = death.weapon;
        row.insertCell(5).textContent = death.hitgroup;
        row.insertCell(6).textContent = death.distance.toFixed(1);
        row.insertCell(7).textContent = death.accuracy_penalty.toFixed(3);
        const spreadCell = row.insertCell(8);
        spreadCell.textContent = death.spread.toFixed(1);
        spreadCell.classList.add('top-spread-value');
        
        row.classList.add('top5-row');
    });
}

function showLoading(show) {
    const loading = document.getElementById('loading');
    if (show) {
        loading.classList.remove('hidden');
    } else {
        loading.classList.add('hidden');
    }
}

function showResults(show) {
    const results = document.getElementById('results');
    if (show) {
        results.classList.remove('hidden');
    } else {
        results.classList.add('hidden');
    }
}

function hideResults() {
    document.getElementById('results').classList.add('hidden');
}

function showError(message) {
    const errorDiv = document.getElementById('error');
    const messageElement = errorDiv.querySelector('.error-message');
    messageElement.textContent = message;
    errorDiv.classList.remove('hidden');
}

function hideError() {
    document.getElementById('error').classList.add('hidden');
}

run_wasm();

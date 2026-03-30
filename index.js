
async function run_wasm() {
    // Load the Wasm file by awaiting the Promise returned by `wasm_bindgen`
    await wasm_bindgen('./pkg/demoparser2_bg.wasm');
    
    // Create a worker in JS. The worker also uses Rust functions
    var myWorker = new Worker('./worker.js');
    
    // Store full deaths data for filtering
    let allDeathsData = [];
    
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
                    
                    // Store deaths data and display results
                    allDeathsData = e.data.allDeaths;
                    displayResults(e.data);
                    showResults(true);
                    setupDeathTableFilters();
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
    
    // Setup death table filters
    function setupDeathTableFilters() {
        const victimFilter = document.getElementById('filter-victim');
        const attackerFilter = document.getElementById('filter-attacker');
        const weaponFilter = document.getElementById('filter-weapon');
        const hitgroupFilter = document.getElementById('filter-hitgroup');
        const clearBtn = document.getElementById('clear-filters');
        
        // Extract unique values from deaths data
        function getUniqueValues(field) {
            const values = new Set(allDeathsData.map(death => death[field]));
            return Array.from(values).sort();
        }
        
        // Populate dropdowns
        function populateDropdowns() {
            const victims = getUniqueValues('victim_name');
            const attackers = getUniqueValues('attacker_name');
            const weapons = getUniqueValues('weapon');
            const hitgroups = getUniqueValues('hitgroup');
            
            // Clear and add "All" option
            [victimFilter, attackerFilter, weaponFilter, hitgroupFilter].forEach(select => {
                select.innerHTML = '<option value="">All</option>';
            });
            
            // Add options
            victims.forEach(v => {
                const option = document.createElement('option');
                option.value = v;
                option.textContent = v;
                victimFilter.appendChild(option);
            });
            
            attackers.forEach(a => {
                const option = document.createElement('option');
                option.value = a;
                option.textContent = a;
                attackerFilter.appendChild(option);
            });
            
            weapons.forEach(w => {
                const option = document.createElement('option');
                option.value = w;
                option.textContent = w;
                weaponFilter.appendChild(option);
            });
            
            hitgroups.forEach(h => {
                const option = document.createElement('option');
                option.value = h;
                option.textContent = h;
                hitgroupFilter.appendChild(option);
            });
        }
        
        populateDropdowns();
        
        function applyFilters() {
            const victim = victimFilter.value;
            const attacker = attackerFilter.value;
            const weapon = weaponFilter.value;
            const hitgroup = hitgroupFilter.value;
            
            const filtered = allDeathsData.filter(death => {
                return (!victim || death.victim_name === victim) &&
                       (!attacker || death.attacker_name === attacker) &&
                       (!weapon || death.weapon === weapon) &&
                       (!hitgroup || death.hitgroup === hitgroup);
            });
            
            displayDeathsTable(filtered);
        }
        
        victimFilter.addEventListener('change', applyFilters);
        attackerFilter.addEventListener('change', applyFilters);
        weaponFilter.addEventListener('change', applyFilters);
        hitgroupFilter.addEventListener('change', applyFilters);
        
        clearBtn.addEventListener('click', function() {
            victimFilter.value = '';
            attackerFilter.value = '';
            weaponFilter.value = '';
            hitgroupFilter.value = '';
            displayDeathsTable(allDeathsData);
        });
    }
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
        cell.colSpan = 9;
        cell.textContent = 'No valid deaths found (excluding warmup and team kills)';
        return;
    }
    
    // Create header
    const headers = [
        { text: 'Tick', title: null },
        { text: 'Victim', title: null },
        { text: 'Attacker', title: null },
        { text: 'Weapon', title: null },
        { text: 'Hitgroup', title: null },
        { text: 'Distance (units)', title: null },
        { text: 'Accuracy Penalty', title: 'The weapon accuracy penalty value from the game at the time of the shot' },
        { text: 'Spread (cm)', title: 'The calculated bullet spread diameter in centimeters (accuracy_penalty × distance × constants)' },
        { text: 'Hit Probability (%)', title: 'Approximate % chance the spread would hit this body part. Calculated as (body_part_area / total_spread_area) × 100. Uses estimated body part areas from CS2 player models.' }
    ];
    const headerRow = table.insertRow(0);
    headers.forEach((header, idx) => {
        const th = document.createElement('th');
        th.textContent = header.text;
        if (header.title) {
            th.title = header.title;
            th.style.cursor = 'help';
        }
        headerRow.appendChild(th);
    });
    
    // Add rows
    deaths.forEach(death => {
        const row = table.insertRow();
        row.insertCell(0).textContent = death.tick;
        row.insertCell(1).textContent = death.victim_name;
        row.insertCell(2).textContent = death.attacker_name;
        row.insertCell(3).textContent = death.weapon;
        row.insertCell(4).textContent = death.hitgroup;
        row.insertCell(5).textContent = death.distance.toFixed(1);
        row.insertCell(6).textContent = death.accuracy_penalty.toFixed(3);
        const spreadCell = row.insertCell(7);
        spreadCell.textContent = death.spread.toFixed(1);
        spreadCell.classList.add('spread-value');
        const probabilityCell = row.insertCell(8);
        probabilityCell.textContent = death.hitProbability.toFixed(1);
        probabilityCell.classList.add('probability-value');
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
    const victimHeaders = [
        { text: 'Player', title: null },
        { text: 'Avg Hit Probability (%)', title: 'Average hit probability across all deaths. Lower = More Unlucky' },
        { text: 'Deaths', title: null }
    ];
    victimHeaders.forEach(header => {
        const th = document.createElement('th');
        th.textContent = header.text;
        if (header.title) {
            th.title = header.title;
            th.style.cursor = 'help';
        }
        headerRow.appendChild(th);
    });
    
    // Add rows
    victims.forEach((victim, idx) => {
        const row = table.insertRow();
        row.insertCell(0).textContent = victim.player;
        const probabilityCell = row.insertCell(1);
        probabilityCell.textContent = victim.avgHitProbability.toFixed(1);
        probabilityCell.classList.add('probability-value');
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
    const attackerHeaders = [
        { text: 'Player', title: null },
        { text: 'Avg Hit Probability (%)', title: 'Average hit probability across all kills. Lower = More Lucky' },
        { text: 'Kills', title: null }
    ];
    attackerHeaders.forEach(header => {
        const th = document.createElement('th');
        th.textContent = header.text;
        if (header.title) {
            th.title = header.title;
            th.style.cursor = 'help';
        }
        headerRow.appendChild(th);
    });
    
    // Add rows
    attackers.forEach((attacker, idx) => {
        const row = table.insertRow();
        row.insertCell(0).textContent = attacker.player;
        const probabilityCell = row.insertCell(1);
        probabilityCell.textContent = attacker.avgHitProbability.toFixed(1);
        probabilityCell.classList.add('probability-value');
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
        cell.colSpan = 10;
        cell.textContent = 'No death data available';
        return;
    }
    
    // Create header
    const headerRow = table.insertRow(0);
    const top5Headers = [
        { text: '#', title: null },
        { text: 'Tick', title: null },
        { text: 'Victim', title: null },
        { text: 'Attacker', title: null },
        { text: 'Weapon', title: null },
        { text: 'Hitgroup', title: null },
        { text: 'Distance (units)', title: null },
        { text: 'Accuracy Penalty', title: 'The weapon accuracy penalty value from the game at the time of the shot' },
        { text: 'Spread (cm)', title: 'The calculated bullet spread diameter in centimeters (accuracy_penalty × distance × constants)' },
        { text: 'Hit Probability (%)', title: 'Approximate % chance the spread would hit this body part. Calculated as (body_part_area / total_spread_area) × 100. Uses estimated body part areas from CS2 player models.' }
    ];
    top5Headers.forEach(header => {
        const th = document.createElement('th');
        th.textContent = header.text;
        if (header.title) {
            th.title = header.title;
            th.style.cursor = 'help';
        }
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
        const probabilityCell = row.insertCell(9);
        probabilityCell.textContent = death.hitProbability.toFixed(1);
        probabilityCell.classList.add('top-probability-value');
        
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

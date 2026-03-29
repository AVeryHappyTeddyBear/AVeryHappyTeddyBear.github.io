importScripts('./pkg/demoparser2.js');

const { parseEvents, parseTicks } = wasm_bindgen;

async function run_in_worker() {
    await wasm_bindgen('./pkg/demoparser2_bg.wasm');
    console.log("worker.js loaded");
}

run_in_worker();

onmessage = async function (e) {
    try {
        console.log("Starting demo analysis...");
        
        // Step 1: Parse death events
        let deathEvents = parseEvents(
            e.data.fileBytes,
            ["player_death"],
            null,
            ["hitgroup"]  // Get the body part hit in the death
        );

        console.log("Death events:", deathEvents.length);
        
        const deathArray = Array.isArray(deathEvents) ? deathEvents : Array.from(deathEvents);
        
        // Step 2: Collect all shooting ticks we need
        const ticksToQuery = new Set();
        for (const deathMap of deathArray) {
            const death = mapToObject(deathMap);
            ticksToQuery.add(death.tick - 1);  // shooting tick is 1 before death tick
        }
        
        console.log("Querying", ticksToQuery.size, "unique ticks");
        
        // Step 3: Query all those ticks at once (no player filtering, just the properties we need)
        const ticksArray = Array.from(ticksToQuery).map(t => parseInt(t));
        const ticksInt32 = new Int32Array(ticksArray);
        
        let tickData;
        try {
            tickData = parseTicks(
                e.data.fileBytes,
                ["X", "Y", "Z", "accuracy_penalty", "steamid", "name"],
                ticksInt32,
                null,  // no player filtering
                false
            );
        } catch (tickError) {
            console.error("Error parsing ticks:", tickError);
            throw tickError;
        }
        
        console.log("Tick data returned:", tickData ? tickData.length : 0);
        
        console.log("Raw tick data: ", tickData);

        // Step 4: Build a map for quick lookup: tickData[tick][steamid] = player_data
        const tickMap = {};
        const tickDataArray = Array.isArray(tickData) ? tickData : Array.from(tickData || []);
        
        for (const playerData of tickDataArray) {
            const data = mapToObject(playerData);
            const tick = data.tick;
            const steamid = data.steamid;
            
            if (tick !== undefined && steamid !== undefined) {
                if (!tickMap[tick]) tickMap[tick] = {};
                tickMap[tick][steamid] = data;
            }
        }
        
        console.log("Built tick map with", Object.keys(tickMap).length, "ticks");
        
        // Step 5: Process each death event one at a time
        const analysisResult = analyzeDeaths(deathArray, tickMap);
        postMessage(analysisResult);
    } catch (error) {
        console.error("Error:", error);
        postMessage({
            error: true,
            message: error.message
        });
    }
};

function analyzeDeaths(deathArray, tickMap) {
    const allDeaths = [];
    const skippedDeaths = [];
    const victimStats = {};
    const attackerStats = {};
    
    console.log("Processing", deathArray.length, "deaths");

    console.log("Raw Death Array:", deathArray);
    
    // Process each death event one at a time
    let skipped = 0;
    let noTickData = 0;
    let missingPlayerData = 0;
    
    for (const deathMap of deathArray) {
        const death = mapToObject(deathMap);
        
        // Extract info from this death
        const death_tick = death.tick;
        const shooting_tick = death_tick - 1;
        const attacker_steamid = death.attacker_steamid;
        const victim_steamid = death.user_steamid;
        const weapon = death.weapon || "Unknown";
        const hitgroup = death.hitgroup || "Unknown";
        
        // Skip if victim and attacker are the same person
        if (attacker_steamid === victim_steamid) {
            skipped++;
            skippedDeaths.push(death);
            continue;
        }
        
        // Get player data from the shooting tick
        const tickPlayerData = tickMap[shooting_tick];
        if (!tickPlayerData) {
            noTickData++;
            skippedDeaths.push(death);
            continue;  // No data for this tick
        }
        
        const attackerData = tickPlayerData[attacker_steamid];
        const victimData = tickPlayerData[victim_steamid];
        
        if (!attackerData || !victimData) {
            missingPlayerData++;
            skippedDeaths.push(death);
            continue;  // Missing data for attacker or victim
        }
        
        //Check for undefined position data
        if (attackerData.X === undefined || attackerData.Y === undefined || attackerData.Z === undefined ||
            victimData.X === undefined || victimData.Y === undefined || victimData.Z === undefined) {
            missingPlayerData++;
            console.log("Missing position data for death at tick", death_tick, "attacker:", attacker_steamid, "victim:", victim_steamid, "AttackerData:", attackerData, "VictimData:", victimData);
            skippedDeaths.push(death);
            continue;  // Missing position data
        }

        // Calculate distance between players
        const dx = attackerData.X - victimData.X;
        const dy = attackerData.Y - victimData.Y;
        const dz = attackerData.Z - victimData.Z;
        const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
        
        // Calculate spread = accuracy_penalty * distance * 0.19685
        const accuracy_penalty = attackerData.accuracy_penalty || 0;
        const spread = accuracy_penalty * distance * 0.19685;
        
        const attacker_name = attackerData.name || "Unknown";
        const victim_name = victimData.name || "Unknown";
        
        // Store death record
        const deathRecord = {
            tick: death_tick,
            victim_name,
            victim_steamid,
            attacker_name,
            attacker_steamid,
            weapon,
            hitgroup,
            distance: Math.round(distance * 10) / 10,
            accuracy_penalty: Math.round(accuracy_penalty * 1000) / 1000,
            spread: Math.round(spread * 10) / 10
        };
        
        allDeaths.push(deathRecord);
        
        // Track victim stats
        if (!victimStats[victim_name]) {
            victimStats[victim_name] = { name: victim_name, spreadTotal: 0, deaths: 0 };
        }
        victimStats[victim_name].spreadTotal += spread;
        victimStats[victim_name].deaths += 1;
        
        // Track attacker stats
        if (!attackerStats[attacker_name]) {
            attackerStats[attacker_name] = { name: attacker_name, spreadTotal: 0, kills: 0 };
        }
        attackerStats[attacker_name].spreadTotal += spread;
        attackerStats[attacker_name].kills += 1;
    }
    
    console.log("Valid deaths processed:", allDeaths.length);
    console.log("Deaths skipped (missing attacker/victim):", skipped);
    console.log("Deaths skipped (no tick data):", noTickData);
    console.log("Deaths skipped (missing player data):", missingPlayerData);
    
    // Calculate averages for victims
    const victimRanking = Object.values(victimStats)
        .map(v => ({
            player: v.name,
            avgSpread: Math.round((v.spreadTotal / v.deaths) * 10) / 10,
            deaths: v.deaths
        }))
        .sort((a, b) => b.avgSpread - a.avgSpread);
    
    // Calculate averages for attackers
    const attackerRanking = Object.values(attackerStats)
        .map(a => ({
            player: a.name,
            avgSpread: Math.round((a.spreadTotal / a.kills) * 10) / 10,
            kills: a.kills
        }))
        .sort((a, b) => b.avgSpread - a.avgSpread);
    
    // Get top 5 unluckiest deaths
    const top5Unlucky = allDeaths
        .sort((a, b) => b.spread - a.spread)
        .slice(0, 5);
    
    return {
        error: false,
        allDeaths,
        skippedDeaths,
        victimRanking,
        attackerRanking,
        top5Unlucky,
        totalDeaths: allDeaths.length
    };
}

function mapToObject(mapOrObj) {
    if (mapOrObj instanceof Map) {
        const obj = {};
        for (let [key, value] of mapOrObj) {
            obj[key] = value;
        }
        return obj;
    }
    return mapOrObj;
}

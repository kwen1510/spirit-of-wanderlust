// Declare core session variables early
let sessionId = null;
let playerId = null;
let role = null;

// Clear sessionStorage on load to reset reflection submission state for testing
sessionStorage.clear(); 

// Demo data for inventory
let inventory = { A: 0, W: 0, S: 0, C: 0 };
const itemNames = { A: 'Spirit Ash', W: 'Moonwood', S: 'Storm-Iron', C: 'Coral Runes' };
const itemEmojis = { A: '🔥', W: '🌲', S: '⚡', C: '🌀' };
const itemCodes = Object.keys(itemNames);

let introductoryMessage = "Awaiting role assignment..."; // Only need intro message now
let roleSpecificElderChewMessages = []; // Array to store role-specific Elder Chew messages
let logEntries = []; 

let reflectionSubmitted = false;
let reflectionSubmittedThisRound = false;

const reflectionArea = document.getElementById('reflection-area');
const reflectionBtn = document.getElementById('submit-reflection');

const injectStories = [
    "A mischievous sprite snatches something from your bag!",
    "You stumble upon a mysterious altar demanding tribute.",
    "A sudden gust of wind scatters your supplies.",
    "A friendly animal offers a trade, but at a cost.",
    "A hidden trap springs, forcing you to drop an item.",
    "A wise old traveler asks for a donation.",
    "A shimmering portal taxes your inventory for passage.",
    "A riddle from the void: pay up or face the unknown!"
];

let gameOverShown = false;

let allowRefresh = false;

window.addEventListener('beforeunload', function (e) {
    if (!allowRefresh && role === 'Charlie') {
        e.preventDefault();
        e.returnValue = '';
    }
});

function renderInventory() {
    const ul = document.getElementById('inventory-list');
    ul.innerHTML = '';
    Object.keys(itemNames).forEach(code => {
        const qty = inventory[code] == null ? 0 : inventory[code];
        const li = document.createElement('li');
        li.textContent = `${itemNames[code]}: ${qty}`;
        ul.appendChild(li);
    });
}
function renderLog() {
    const logDiv = document.getElementById('log-content');
    logDiv.innerHTML = '';
    logEntries.forEach(entry => {
        const msg = document.createElement('div');
        msg.className = 'log-bubble';
        
        // Set message class based on content for proper styling
        if (entry.startsWith('--- Round ')) {
            msg.classList.add('log-round-separator');
            msg.style.textAlign = 'center';
            msg.style.fontWeight = 'bold';
            msg.style.background = '#f0f0f0';
            msg.style.borderLeft = 'none';
        } else if (entry.startsWith('Elder Chew:')) {
            msg.classList.add('log-elder');
        } else if (entry.startsWith('Inject Story:')) {
            msg.classList.add('log-inject-story');
        } else if (entry.startsWith('Reflection:') || entry.startsWith('Reflection Submitted')) {
            msg.classList.add('log-user');
        } else if (entry.startsWith('Reflection Missed')) {
            msg.classList.add('log-missed-reflection');
            msg.style.background = '#ffecec';
            msg.style.borderLeft = '5px solid #ff5757';
        } else if (entry.startsWith('Reflection Penalty:') || entry.startsWith('No reflection')) {
            msg.classList.add('log-penalty');
            msg.style.background = '#fff0f0';
            msg.style.borderLeft = '5px solid #ff4500';
        } else if (entry.startsWith('Inventory updated:') || entry.startsWith('Inject:') || entry.startsWith('No inject')) {
            msg.classList.add('log-system');
        } else if (entry.startsWith('Leader starting') || entry.startsWith('Game Started')) {
            msg.classList.add('log-system');
            msg.style.fontWeight = 'bold';
        } else if (entry.startsWith('Moved to')) {
            msg.classList.add('log-move');
            msg.style.background = '#f0f8ff';
            msg.style.borderLeft = '5px solid #4682b4';
        }
        
        msg.textContent = entry;
        logDiv.appendChild(msg);
    });
    logDiv.scrollTop = logDiv.scrollHeight;
}

document.getElementById('objective-box').textContent = 'Elder Chew: Awaiting guidance...';

// --- Timers ---
let roundSeconds = 15;
// Calculate session duration based on rounds and round time
let config = null;
async function loadConfig() {
  const response = await fetch('/api/game-config');
  config = await response.json();
}
let sessionSeconds;
let roundNum;
let timerInterval = null; // We might remove this interval entirely or keep for leader UI only
let sessionStartTime = null; // Declare sessionStartTime in accessible scope
let sessionEndTime = null; // Stores calculated end timestamp
let roundEndTime = null;   // Stores calculated end timestamp
let canMove = false;
let steps = 0;
let injectCells = {};
let roundHistory = [];
let currentPickupChoices = null;
let curr = null; // Declare curr in the outer scope

function pad(n) { return n < 10 ? '0' + n : n; }
function renderTimers() {
    const clampedRoundNum = Math.min(roundNum, config.ROUND_COUNT);
    document.getElementById('primary-timer').textContent = `${pad(Math.floor(sessionSeconds/60))}:${pad(sessionSeconds%60)}`;
    const secondaryTimer = document.getElementById('secondary-timer');
    secondaryTimer.textContent = `${pad(Math.floor(roundSeconds/60))}:${pad(roundSeconds%60)}`;
    if (roundSeconds <= 5) {
        secondaryTimer.style.color = 'red';
    } else {
        secondaryTimer.style.color = 'black';
    }
    document.getElementById('turn-counter').textContent = `${clampedRoundNum} / ${config.ROUND_COUNT}`;
}

// Modify startBtn.onclick to calculate and send end times
const startBtn = document.getElementById('start-game-btn');
if (startBtn) {
    startBtn.onclick = function() {
        console.log('[Leader] Game start button clicked');
        logEntries.push('Leader starting the game...');
        renderLog();
        this.disabled = true;
        this.textContent = 'Starting...';
        
        // Calculate delay until the next full second
        const now = Date.now();
        const delay = 1000 - (now % 1000);
        const startTime = now + delay;

        // Logging removed.toISOString()}`);

        setTimeout(() => {
            // Keep the introduction message (if it exists) and remove other messages
            const introMessage = logEntries.find(entry => entry.startsWith('Elder Chew:'));
            
            // Reset log entries but keep the intro
            logEntries = [];
            if (introMessage) {
                logEntries.push(introMessage);
            }
            
            // First show "Leader starting the game..."
            logEntries.push('Leader starting the game...');
            
            // Then add Game Started message
            logEntries.push('Game Started!');
            
            // Then add Round 1 message
            logEntries.push(`--- Round ${roundNum} ---`);
            
            // Get Elder Chew's round-specific message
            let elderMessage = "";
            if (roleSpecificElderChewMessages && roleSpecificElderChewMessages.length > 0) {
                // Use round number to select message deterministically
                const index = (roundNum - 1) % roleSpecificElderChewMessages.length;
                elderMessage = roleSpecificElderChewMessages[index];
                logEntries.push(`Elder Chew: ${elderMessage}`);
            }
            
            // Immediately render the log to show the messages
            renderLog();
            
            this.textContent = 'Game Started';
            clearHistory();
            // Generate grid without adding duplicate messages
            setupGridWithoutMessages();

            // Assign sessionStartTime here
            sessionStartTime = startTime; // Use the synced start time

            // Calculate end times based on synced start time
            sessionEndTime = startTime + sessionSeconds * 1000;
            roundEndTime = startTime + roundSeconds * 1000;

            const initialState = {
                inventory,
                roundNum,
                itemsGrid,
                visited: Array.from(visited),
                curr,
                N,
                sessionStartTime: startTime, // Send the synced start time
                sessionEndTime,
                roundEndTime,
                roundDuration: config.ROUND_DURATION_SEC,
                totalRounds: config.ROUND_COUNT
            };
            // Logging removed;
            ws.send(JSON.stringify({
                sessionId,
                type: 'session-start',
                payload: { playerId, role, state: initialState }
            }));
            // Start leader's local timer UI update
            startLocalUITimer();

            // Log the starting cell as a move for round 1
            ws.send(JSON.stringify({
                sessionId,
                type: 'move',
                payload: {
                    move: { r: 0, c: 0, steps: 0 },
                    state: initialState,
                    roundNum: 1,
                    playerId: playerId
                }
            }));
        }, delay);
    };
}

// Function to load role introductory text and role-specific Elder Chew messages
async function loadRoleIntro(roleNameToLoad) { 
    if (!roleNameToLoad) {
        console.error("Cannot load intro text, role not yet assigned.");
        return Promise.reject("Role not assigned");
    }
    try {
        // First, load the intro message
        const introResponse = await fetch(`/text/role-introductions.json`);
        if (!introResponse.ok) throw new Error(`HTTP error for intro: ${introResponse.status}`);
        const intros = await introResponse.json();
        introductoryMessage = intros[roleNameToLoad] || "Embark on your journey!";
        
        // Then load the role-specific round messages
        const messagesResponse = await fetch(`/text/elder-chew-messages.json`);
        if (!messagesResponse.ok) throw new Error(`HTTP error for messages: ${messagesResponse.status}`);
        const allRoleMessages = await messagesResponse.json();
        roleSpecificElderChewMessages = allRoleMessages[roleNameToLoad.toLowerCase()] || [];
        
        // Display initial message and log it
        updateObjectiveBox(); // Display initial intro message
        
        // Add the introduction message to chat log
        logEntries.push(`Elder Chew: ${introductoryMessage}`);
        renderLog();
        
        return Promise.resolve(); // Return a resolved promise
    } catch (error) {
        console.error('Error loading role text:', error);
        introductoryMessage = "Error loading guidance...";
        updateObjectiveBox();
        return Promise.reject(error);
    }
}

// Consolidated function to update the objective box - ALWAYS show intro
function updateObjectiveBox() {
    const objectiveBox = document.getElementById('objective-box');
    if (!objectiveBox) return;
    objectiveBox.textContent = 'Elder Chew: ' + introductoryMessage;
    // Do NOT log the intro message repeatedly
}

// Function to log messages (now just updates array and UI)
function log(msg) {
    logEntries.push(msg);
    renderLog(); 
}

// Modify startLocalUITimer to prevent multiple missed reflection reports
function startLocalUITimer() {
    if (timerInterval) clearInterval(timerInterval);
    // Initial render based on server/calculated times
    renderTimers(); 
    
    // Keep track of rounds we've already reported as missed
    const reportedMissedRounds = new Set();
    
    timerInterval = setInterval(() => {
        const now = Date.now();
        // Use sessionEndTime and roundEndTime which were calculated from the synced startTime
        let remainingSession = Math.ceil((sessionEndTime - now) / 1000);
        let remainingRound = Math.ceil((roundEndTime - now) / 1000);

        sessionSeconds = Math.max(0, remainingSession);
        roundSeconds = Math.max(0, remainingRound);

        renderTimers(); // Always update UI first

        let sessionEnded = remainingSession <= 0;
        let roundEnded = remainingRound <= 0;

        if (roundEnded && !sessionEnded && roundNum <= config.ROUND_COUNT) {
            const roundThatEnded = roundNum;

            // Check if leader missed reflection for the round that JUST ended
            // AND we haven't already reported it as missed
            if (!reflectionSubmittedThisRound && !reportedMissedRounds.has(roundThatEnded)) {
                const text = reflectionArea.value.trim();
                // Logging removed;
                localStorage.setItem(`reflection_autosave_${sessionId}_${playerId}_round${roundThatEnded}`, text);
                
                // Mark this round as reported to prevent duplicates
                reportedMissedRounds.add(roundThatEnded);
                
                // Update the log message with consistent format
                logEntries.push(`Reflection Missed (R${roundThatEnded}): ${text || '[Empty]'}`);
                renderLog();
                
                console.log('Sending reflection-missing', { sessionId, playerId, roundNum: roundThatEnded, text });
                ws.send(JSON.stringify({
                    sessionId,
                    type: 'reflection-missing',
                    payload: { playerId, roundNum: roundThatEnded, text }
                }));
            }

            // --- Advance to next round --- 
            roundNum++;
            roundSeconds = config.ROUND_DURATION_SEC;
            roundEndTime = roundEndTime + config.ROUND_DURATION_SEC * 1000; 
            canMove = true;
            reflectionSubmittedThisRound = false; // Reset flag for the new round
            reflectionArea.disabled = false;
            reflectionArea.value = '';
            reflectionBtn.disabled = false;
            log(`--- Round ${roundNum} ---`);
            
            // Add Elder Chew comment for the new round if we have messages
            if (roleSpecificElderChewMessages && roleSpecificElderChewMessages.length > 0) {
                // Use round number to select message deterministically
                const index = (roundNum - 1) % roleSpecificElderChewMessages.length;
                const message = roleSpecificElderChewMessages[index];
                log(`Elder Chew: ${message}`);
            }
            
            updateObjectiveBox();

            // Leader still needs to broadcast state to advance team member round
             ws.send(JSON.stringify({
                sessionId,
                type: 'state-update',
                payload: {
                    state: { inventory, roundNum, itemsGrid, visited: Array.from(visited), curr, N, sessionStartTime, sessionEndTime, roundEndTime, roundDuration: config.ROUND_DURATION_SEC, totalRounds: config.ROUND_COUNT }
                }
            }));
        }

        if ((sessionEnded || roundNum > config.ROUND_COUNT) && !gameOverShown) {
            // --- NEW: Check for missed reflection in the final round ---
            const lastRound = Math.min(roundNum, config.ROUND_COUNT);
            if (!reflectionSubmittedThisRound && !reportedMissedRounds.has(lastRound)) {
                const text = reflectionArea.value.trim();
                localStorage.setItem(`reflection_autosave_${sessionId}_${playerId}_round${lastRound}`, text);
                reportedMissedRounds.add(lastRound);
                logEntries.push(`Reflection Missed (R${lastRound}): ${text || '[Empty]'}`);
                renderLog();
                console.log('Sending reflection-missing', { sessionId, playerId, roundNum: lastRound, text });
                ws.send(JSON.stringify({
                    sessionId,
                    type: 'reflection-missing',
                    payload: { playerId, roundNum: lastRound, text }
                }));
            }
            // --- END NEW ---
            gameOverShown = true;
            canMove = false;
            clearInterval(timerInterval);
            ws.send(JSON.stringify({
                sessionId,
                type: 'game-over',
                payload: { reason: sessionEnded ? 'Time ran out' : 'All rounds completed' }
            }));
            showBigModal({
                emoji: '⏰',
                main: 'Game Over',
                sub: sessionEnded ? 'Time ran out! The session has ended.' : 'All rounds completed! The session has ended.',
                okText: 'OK',
                borderColor: '#faad14',
                eventType: 'Game Over'
            });
            return;
        }

        renderTimers(); // Update leader UI

    }, 250); // Update UI frequently
}

// --- WebSocket Integration ---
let ws = null; // Initialize ws later

// --- Helper for safe WebSocket send ---
function safeSendWS(msg) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(msg));
    } else {
        console.warn("WebSocket not open, could not send:", msg);
    }
}

// --- DOMContentLoaded Handler ---
document.addEventListener('DOMContentLoaded', async () => {
    // Assign DOM elements here
    const reflectionArea = document.getElementById('reflection-area');
    const reflectionBtn = document.getElementById('submit-reflection');
    const playerRoleElement = document.getElementById('player-role');
    gridEl = document.getElementById('grid');

    // Assign event handlers here
    if (reflectionBtn) {
        reflectionBtn.onclick = function() {
            console.log('[Leader] Reflection submitted');
            const text = reflectionArea.value.trim();
            if (!reflectionSubmittedThisRound) {
                logEntries.push(`Reflection Submitted (R${roundNum}): ${text || '[Empty]'}`);
                reflectionArea.value = '';
                renderLog();
                reflectionSubmittedThisRound = true;
                reflectionArea.disabled = true;
                reflectionBtn.disabled = true;
                if (!roundHistory[roundNum-1]) roundHistory[roundNum-1] = { round: roundNum };
                roundHistory[roundNum-1].reflection = text;
                saveHistory();
                safeSendWS({
                    sessionId,
                    type: 'reflection',
                    payload: { playerId, text, roundNum }
                });
            }
        };
    }

    // Load config
    try {
        await loadConfig();
    } catch (e) {
        alert("Failed to load game config.");
        return;
    }
    sessionSeconds = config.ROUND_COUNT * config.ROUND_DURATION_SEC;
    roundNum = 1;
    roundSeconds = config.ROUND_DURATION_SEC;

    // Get session/player/role from URL
    const urlParams = new URLSearchParams(window.location.search);
    sessionId = urlParams.get('sessionId');
    playerId = urlParams.get('playerId');
    role = urlParams.get('role') || 'Charlie';

    if (!sessionId || !playerId || !role) {
        alert("Missing session or player information.");
        return;
    }

    if (playerRoleElement) playerRoleElement.textContent = role;

    // Load role-specific texts
    await loadRoleIntro(role);

    // Now initialize WebSocket
    initializeWebSocket();

    // Other setup
    renderInventory();
    renderLog();

    // Prompt to reset game if session is already started
    if (sessionId && playerId && role === 'Charlie') {
        setTimeout(() => {
            if (confirm('Do you want to reset the game for this session?')) {
                if (window.ws && window.ws.readyState === WebSocket.OPEN) {
                    window.ws.send(JSON.stringify({
                        sessionId,
                        type: 'reset-session',
                        payload: { playerId }
                    }));
                } else {
                    alert('WebSocket not connected. Please try again after the connection is established.');
                }
            }
        }, 500); // Wait a bit to ensure ws is connected
    }
});

// --- WebSocket Initialization ---
function initializeWebSocket() {
    if (ws) ws.close();
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsHost = window.location.host;
    const wsUrl = `${wsProtocol}//${wsHost}`;
    ws = new WebSocket(wsUrl);
    ws.onopen = () => console.log('[Leader] WebSocket opened');
    ws.onclose = () => console.log('[Leader] WebSocket closed');
    ws.onerror = (e) => console.error('[Leader] WebSocket error:', e);
    ws.onmessage = (event) => {
        try {
            const msg = JSON.parse(event.data);
            console.log('[Leader] WebSocket message:', msg.type, msg.payload);
            
            if (msg.type === 'reflection-penalty') {
                console.log('[Leader] Penalty received:', msg.payload);
                
                // Handle reflection penalty
                const lostItemText = msg.payload.itemCode
                    ? `Lost 1 ${itemNames[msg.payload.itemCode]} (${itemEmojis[msg.payload.itemCode]})`
                    : 'No item lost';
                const reason = msg.payload.reason || 'A reflection was missed.';
                
                // Add to log
                log(`Reflection Penalty: ${lostItemText}. Reason: ${reason}`);
                
                // Update inventory from server
                if (msg.payload.inventory) {
                    inventory = { ...msg.payload.inventory };
                    renderInventory();
                }
                
                // Show penalty modal
                showBigModal({
                    emoji: '⚠️',
                    main: 'Team Penalty Applied',
                    sub: `${reason}<br><br>${lostItemText}`,
                    okText: 'Acknowledge',
                    borderColor: '#e63946'
                });
            }
            // ... existing code ...
        } catch (e) {
            console.error('[Leader] Failed to parse WebSocket message:', event.data, e);
        }
    };
}

// --- Grid Map ---
const N = 5;
const PLAYER = '🧑‍🚀';
const ITEMS = ['A','W','S','C']; // A=🔥, W=🌲, S=⚡, C=🌀
const ITEM_EMOJI = { A: '🔥', W: '🌲', S: '⚡', C: '🌀' };
const MAX_STEPS = 8;
const total = N * N;
let itemList = [];
let gridEl = document.getElementById('grid');
const cells = Array.from({ length: N }, () => Array(N));
let itemsGrid = {};
let visited = new Set();

function setupGridAndStart() {
    // Always start at (0,0)
    curr = { r: 0, c: 0 }; // Initialize curr here
    visited = new Set([`0,0`]);
    steps = 0;
    // Fill the rest of the map with items
    itemList = [];
    ITEMS.forEach(e => itemList.push(e, e));
    while (itemList.length < total) itemList.push(null);
    for (let i = itemList.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [itemList[i], itemList[j]] = [itemList[j], itemList[i]];
    }
    itemsGrid = {};
    let idx = 0;
    for (let rr = 0; rr < N; rr++) {
        for (let cc = 0; cc < N; cc++) {
            itemsGrid[`${rr},${cc}`] = itemList[idx++];
        }
    }
    itemsGrid[`0,0`] = null; // No item at start
    // Precompute inject cells: 80% have injects, 20% do not
    injectCells = {};
    let allCells = [];
    for (let rr = 0; rr < N; rr++) {
        for (let cc = 0; cc < N; cc++) {
            if (!(rr === 0 && cc === 0)) allCells.push(`${rr},${cc}`);
        }
    }
    // Shuffle and pick 20% for no inject
    allCells = allCells.sort(() => Math.random() - 0.5);
    const noInjectCount = Math.floor(allCells.length * 0.2);
    const noInjectCells = new Set(allCells.slice(0, noInjectCount));
    for (let rr = 0; rr < N; rr++) {
        for (let cc = 0; cc < N; cc++) {
            const key = `${rr},${cc}`;
            injectCells[key] = !noInjectCells.has(key); // true if has inject
        }
    }
    
    // If called from websocket session-started event, make sure messages are shown
    if (!logEntries.some(entry => entry === 'Leader starting the game...')) {
        // Keep the introduction message (if it exists) and remove other messages
        const introMessage = logEntries.find(entry => entry.startsWith('Elder Chew:'));
        
        // Reset log entries but keep the intro
        logEntries = [];
        if (introMessage) {
            logEntries.push(introMessage);
        }
        
        // Add messages in correct order
        logEntries.push('Leader starting the game...');
        logEntries.push('Game Started!');
        logEntries.push(`--- Round ${roundNum} ---`);
        
        // Add Elder Chew message for the round
        let elderMessage = "";
        if (roleSpecificElderChewMessages && roleSpecificElderChewMessages.length > 0) {
            const index = (roundNum - 1) % roleSpecificElderChewMessages.length;
            elderMessage = roleSpecificElderChewMessages[index];
            logEntries.push(`Elder Chew: ${elderMessage}`);
        }
        
        renderLog();
    }
    
    renderGrid();
    canMove = true;
    startLocalUITimer(); // NEW call for leader's UI timer
}

function setupGridWithoutMessages() {
    // Always start at (0,0)
    curr = { r: 0, c: 0 }; // Initialize curr here
    visited = new Set([`0,0`]);
    steps = 0;
    // Fill the rest of the map with items
    itemList = [];
    ITEMS.forEach(e => itemList.push(e, e));
    while (itemList.length < total) itemList.push(null);
    for (let i = itemList.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [itemList[i], itemList[j]] = [itemList[j], itemList[i]];
    }
    itemsGrid = {};
    let idx = 0;
    for (let rr = 0; rr < N; rr++) {
        for (let cc = 0; cc < N; cc++) {
            itemsGrid[`${rr},${cc}`] = itemList[idx++];
        }
    }
    itemsGrid[`0,0`] = null; // No item at start
    // Precompute inject cells: 80% have injects, 20% do not
    injectCells = {};
    let allCells = [];
    for (let rr = 0; rr < N; rr++) {
        for (let cc = 0; cc < N; cc++) {
            if (!(rr === 0 && cc === 0)) allCells.push(`${rr},${cc}`);
        }
    }
    // Shuffle and pick 20% for no inject
    allCells = allCells.sort(() => Math.random() - 0.5);
    const noInjectCount = Math.floor(allCells.length * 0.2);
    const noInjectCells = new Set(allCells.slice(0, noInjectCount));
    for (let rr = 0; rr < N; rr++) {
        for (let cc = 0; cc < N; cc++) {
            const key = `${rr},${cc}`;
            injectCells[key] = !noInjectCells.has(key); // true if has inject
        }
    }
    
    // No message display code here
    
    renderGrid();
    canMove = true;
    startLocalUITimer(); // NEW call for leader's UI timer
}

function renderGrid() {
    gridEl.innerHTML = '';
    for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
            const cell = document.createElement('div');
            cell.className = 'cell';
            cell.dataset.r = r;
            cell.dataset.c = c;
            const key = `${r},${c}`;
            if (visited.has(key)) cell.classList.add('visited');
            if (curr && r === curr.r && c === curr.c) {
                cell.classList.add('current');
                cell.textContent = PLAYER;
            } else if (itemsGrid[key] && !visited.has(key)) {
                cell.textContent = ITEM_EMOJI[itemsGrid[key]];
            }
            cell.onclick = onCellClick;
            gridEl.appendChild(cell);
            cells[r][c] = cell;
        }
    }
}

function isAdjacent(r, c) {
    if (!curr) return false;
    const dr = Math.abs(r - curr.r);
    const dc = Math.abs(c - curr.c);
    return dr + dc === 1;
}
function onCellClick(e) {
    console.log('[Leader] Move action');
    if (!canMove) return;
    const cell = e.target.closest('.cell');
    if (!cell) return;
    const r = +cell.dataset.r;
    const c = +cell.dataset.c;
    const key = `${r},${c}`;
    if (steps >= MAX_STEPS) {
        log('❌ No more steps left.');
        renderLog();
        return;
    }
    if (visited.has(key)) {
        log('❌ Tried revisiting a cell.');
        renderLog();
        return;
    }
    if (!isAdjacent(r, c)) {
        log('❌ Invalid move distance.');
        renderLog();
        return;
    }
    // Valid move
    steps++;
    visited.add(key);
    curr = { r, c };
    renderGrid();
    canMove = false;
    log(`Moved to (${r}, ${c}). Step ${steps}/${MAX_STEPS}.`);
    renderLog();
    // Broadcast the move and state
    broadcastMove({ r, c, steps }, { inventory, steps, curr, visited: Array.from(visited) });
    // Pickup phase
    setTimeout(() => showPickupModal(key), 300);
}

// --- Pickup Card in Log ---
function showBigModal({emoji, main, sub, okText, onOk, borderColor, eventType}) {
    const modal = document.createElement('div');
    modal.style.position = 'fixed';
    modal.style.left = '0';
    modal.style.top = '0';
    modal.style.width = '100vw';
    modal.style.height = '100vh';
    modal.style.background = 'rgba(0,0,0,0.25)';
    modal.style.display = 'flex';
    modal.style.alignItems = 'center';
    modal.style.justifyContent = 'center';
    modal.style.zIndex = 1000;
    
    // Determine if this is a choice modal (contains interactive elements)
    const isChoiceModal = sub && (sub.includes('<button') || sub.includes('data-code'));
    
    // Only include OK button if:
    // 1. okText is provided explicitly, OR
    // 2. This is for a penalty event, OR
    // 3. This is NOT a choice modal (choice modals have their own actions)
    const showOkButton = !!okText || eventType === 'Reflection Penalty' || !isChoiceModal;
    
    // Modal content with or without button
    const buttonHtml = showOkButton 
        ? `<button class='modal-ok-btn' style='font-size:1.2em;padding:0.7em 2.5em;margin-top:1em;border-radius:18px;border:2px solid #222;background:#e0e0e0;color:#222;font-weight:600;cursor:pointer;'>${okText || 'OK'}</button>`
        : '';
        
    modal.innerHTML = `<div style="background:#fff;padding:2.5em 3em;border-radius:28px;box-shadow:0 2px 24px #0003;text-align:center;min-width:320px;border:2.5px solid ${borderColor || '#e0e0e0'};">
        ${(eventType ? `<div style='color:#888;font-size:0.95em;margin-bottom:0.7em;'>${eventType}</div>` : '')}
        <div style='font-size:2.5em;margin-bottom:0.5em;'>${emoji || ''}</div>
        <div style='font-size:1.5em;font-weight:bold;margin-bottom:0.7em;'>${main}</div>
        <div style='font-size:1.1em;color:#444;margin-bottom:1.2em;'>${sub || ''}</div>
        ${buttonHtml}
    </div>`;
    document.body.appendChild(modal);
    
    const okBtn = modal.querySelector('.modal-ok-btn');
    if (okBtn) {
        okBtn.addEventListener('click', () => {
            modal.remove();
            if (typeof onOk === 'function') onOk();
        });
    }
    
    // Broadcast the modal info to team members (excluding the onOk callback)
    ws.send(JSON.stringify({
        sessionId,
        type: 'show-modal',
        payload: { emoji, main, sub, okText: 'OK', borderColor, eventType }
    }));
}

function showPickupModal(key) {
    removeLogCard();
    const cellItem = itemsGrid[key];
    let options;
    if (cellItem) {
        options = [{ code: cellItem, qty: 3 }];
    } else {
        const shuffled = itemCodes.slice().sort(() => Math.random() - 0.5);
        options = [
            { code: shuffled[0], qty: 1 },
            { code: shuffled[1], qty: 1 }
        ];
    }
    // Track choices given for this round
    currentPickupChoices = options.map(opt => ({ code: opt.code, qty: opt.qty }));
    if (!roundHistory[roundNum-1]) {
        roundHistory[roundNum-1] = { round: roundNum };
    }
    roundHistory[roundNum-1].choicesGiven = currentPickupChoices;
    saveHistory();
    // Show as modal popup for clarity
    if (options.length === 1) {
        showBigModal({
            emoji: itemEmojis[options[0].code],
            main: `+${options[0].qty} ${itemNames[options[0].code]}`,
            sub: 'You found a bonus!',
            okText: 'Collect',
            onOk: () => {
                inventory[options[0].code] += options[0].qty;
                // Create the formatted message
                const updateMessage = `Inventory updated: +${options[0].qty} ${itemNames[options[0].code]} (${itemEmojis[options[0].code]})`;
                // Add to leader's log
                log(updateMessage);
                renderInventory();
                // Track choice made
                if (!roundHistory[roundNum-1]) roundHistory[roundNum-1] = { round: roundNum };
                roundHistory[roundNum-1].choiceMade = { code: options[0].code, qty: options[0].qty };
                saveHistory();
                // Broadcast inventory update with the exact message
                broadcastInventory(inventory, { curr, visited }, updateMessage, currentPickupChoices, roundHistory[roundNum-1].choiceMade);
                setTimeout(() => {
                    if (roundNum >= 4 && injectCells[key]) {
                        showInjectLogic();
                    }
                }, 300);
            }
        });
    } else {
        // Two choices - Before showing modal, send choices to server
        ws.send(JSON.stringify({
            sessionId,
            type: 'pickup-choices-shown',
            payload: { options } // Send the actual choice options
        }));

        showBigModal({
            emoji: '',
            main: 'Pick up an item',
            sub: options.map(opt => `<button style='margin:1em 1em;font-size:2em;padding:1em 2em;font-weight:bold;border-radius:12px;display:inline-block;background:#f3f3f3;border:2px solid #e0e0e0;color:#222;' data-code='${opt.code}' data-qty='${opt.qty}'>${itemEmojis[opt.code]} +${opt.qty} ${itemNames[opt.code]}</button>`).join(''),
            okText: '',
            onOk: null
        });
        // Attach handlers to buttons
        setTimeout(() => {
            document.querySelectorAll('[data-code][data-qty]').forEach(btn => {
                btn.onclick = function() {
                    const code = this.dataset.code;
                    const qty = +this.dataset.qty;
                    inventory[code] += qty;
                    // Create the formatted message
                    const updateMessage = `Inventory updated: +${qty} ${itemNames[code]} (${itemEmojis[code]})`;
                    // Add to leader's log
                    log(updateMessage);
                    renderInventory();
                    // Track choice made
                    if (!roundHistory[roundNum-1]) roundHistory[roundNum-1] = { round: roundNum };
                    roundHistory[roundNum-1].choiceMade = { code, qty };
                    saveHistory();
                    // Broadcast inventory update with the exact message
                    broadcastInventory(inventory, { curr, visited }, updateMessage, currentPickupChoices, roundHistory[roundNum-1].choiceMade);
                    document.querySelector('.modal')?.remove();
                    // Remove modal manually
                    const modals = document.querySelectorAll('div[style*="position: fixed"]');
                    modals.forEach(m => m.parentNode && m.parentNode.removeChild(m));
                    setTimeout(() => {
                        if (roundNum >= 4 && injectCells[key]) {
                            showInjectLogic();
                        }
                    }, 300);
                };
            });
        }, 100);
    }
}

function removeLogCard() {
    const logDiv = document.getElementById('log-content');
    const card = logDiv.querySelector('.log-card');
    if (card) logDiv.removeChild(card);
}

// --- Inject Card in Log ---
function showInjectLogic() {
    console.log('[Leader] Inject action');
    removeLogCard();
    // Show inject story
    const injectStory = injectStories[Math.floor(Math.random() * injectStories.length)];
    log(`Inject Story: ${injectStory}`);
    renderLog();
    // 30% random, 50% user choice
    const rand = Math.random();
    let injectType = null;
    if (rand < 0.3) {
        injectType = 'random';
    } else {
        injectType = 'choice';
    }
    const totalItems = itemCodes.reduce((sum, code) => sum + inventory[code], 0);
    if (totalItems === 0) {
        log('Inject: No items to lose.');
        // Log in roundHistory
        if (!roundHistory[roundNum-1]) roundHistory[roundNum-1] = { round: roundNum };
        roundHistory[roundNum-1].inject = { type: 'none', story: injectStory };
        saveHistory();
        renderLog();
        return;
    }
    if (injectType === 'random') {
        const available = itemCodes.filter(code => inventory[code] > 0);
        if (available.length > 0) {
            const code = available[Math.floor(Math.random() * available.length)];
            inventory[code]--;
            log(`Inject: Lost 1 ${itemNames[code]} (${itemEmojis[code]})`);
            renderInventory();
            showBigModal({
                emoji: itemEmojis[code],
                main: `You lost 1 ${itemNames[code]}!`,
                sub: injectStory,
                okText: 'OK',
                borderColor: '#e0e0e0',
                eventType: 'Inject event'
            });
            if (!roundHistory[roundNum-1]) roundHistory[roundNum-1] = { round: roundNum };
            roundHistory[roundNum-1].inject = { type: 'random', item: code, story: injectStory };
            saveHistory();
            // --- NEW: Always include choicesGiven and choiceMade ---
            broadcastInject({ type: 'random', item: code, story: injectStory }, { inventory, curr, visited }, currentPickupChoices, roundHistory[roundNum-1].choiceMade);
        } else {
            log('Inject: No items to lose.');
            if (!roundHistory[roundNum-1]) roundHistory[roundNum-1] = { round: roundNum };
            roundHistory[roundNum-1].inject = { type: 'none', story: injectStory };
            saveHistory();
            // --- NEW: Always include choicesGiven and choiceMade ---
            broadcastInject({ type: 'none', story: injectStory }, { inventory, curr, visited }, currentPickupChoices, roundHistory[roundNum-1].choiceMade);
        }
        renderLog();
    } else {
        showInjectChoiceModal(injectStory);
    }
}

function showInjectChoiceModal(injectStory) {
    const available = itemCodes.filter(code => inventory[code] > 0);
    showBigModal({
        emoji: '',
        main: 'Inject Event',
        sub: `<div style='margin-bottom:1em;'>${injectStory}</div>` +
            available.map(code => `<button style='margin:1em 1em;font-size:2em;padding:1em 2em;font-weight:bold;border-radius:12px;display:inline-block;background:#f3f3f3;border:2px solid #e0e0e0;color:#222;' data-code='${code}'>${itemEmojis[code]} -1 ${itemNames[code]}</button>`).join(''),
        okText: '',
        onOk: null,
        borderColor: '#e0e0e0',
        eventType: 'Inject event'
    });
    setTimeout(() => {
        document.querySelectorAll('[data-code]:not([data-qty])').forEach(btn => {
            btn.onclick = function() {
                const code = this.dataset.code;
                inventory[code]--;
                // Format message consistently
                log(`Inject: Lost 1 ${itemNames[code]} (${itemEmojis[code]})`);
                renderInventory();
                // Log in roundHistory
                if (!roundHistory[roundNum-1]) roundHistory[roundNum-1] = { round: roundNum };
                roundHistory[roundNum-1].inject = { type: 'choice', item: code, story: injectStory };
                saveHistory();
                // Broadcast inject event and inventory update
                broadcastInject({ type: 'choice', item: code, story: injectStory }, { inventory, curr, visited }, currentPickupChoices, roundHistory[roundNum-1].choiceMade);
                // Remove modal manually
                const modals = document.querySelectorAll('div[style*="position: fixed"]');
                modals.forEach(m => m.parentNode && m.parentNode.removeChild(m));
            };
        });
    }, 100);
}

function showBigLossModal(itemCode, reasonText) {
    showBigModal({
        emoji: itemEmojis[itemCode],
        main: `You lost 1 ${itemNames[itemCode]}!`,
        sub: '',
        okText: 'OK'
    });
}

function saveHistory() {
    localStorage.setItem('roundHistory', JSON.stringify(roundHistory));
}
function clearHistory() {
    roundHistory = [];
    localStorage.removeItem('roundHistory');
}

// Modify existing broadcast functions to include timers
function broadcastMove(move, state) {
    console.log('[Leader] Move action', move, state);
    const fullState = {
        ...state,
        sessionEndTime, // Include end times
        roundEndTime,
        roundNum, // Already includes roundNum
        itemsGrid,
        inventory: state.inventory || inventory // Ensure inventory is included
    };
    ws.send(JSON.stringify({ sessionId, type: 'move', payload: { move, state: fullState, roundNum, playerId } }));
}
function broadcastInject(inject, state, choicesGiven, choiceMade) {
    console.log('[Leader] Inject action', inject, state);
    const fullState = {
        inventory: state.inventory,
        curr: state.curr,
        visited: Array.from(state.visited),
        sessionEndTime,
        roundEndTime,
        roundNum,
        itemsGrid,
        inject
    };
    ws.send(JSON.stringify({
        sessionId,
        type: 'inject',
        payload: {
            inject,
            state: fullState,
            choicesGiven: choicesGiven || null,
            choiceMade: choiceMade || null,
            roundNum,
            playerId
        }
    }));
}
function broadcastInventory(inventoryData, state, messageText, choicesGiven, choiceMade) {
    const fullState = {
        curr: state.curr,
        visited: Array.from(state.visited),
        inventory: inventoryData,
        sessionEndTime,
        roundEndTime,
        roundNum,
        itemsGrid
    };
    ws.send(JSON.stringify({
        sessionId,
        type: 'inventory-update',
        payload: {
            inventory: inventoryData,
            state: fullState,
            messageText: messageText || null,
            choicesGiven: choicesGiven || null,
            choiceMade: choiceMade || null,
            roundNum,
            playerId
        }
    }));
}

renderInventory();
renderLog();

// Initialize the first message on page load too
document.addEventListener('DOMContentLoaded', () => {
    // Initial objective box content is set after texts load
}); 
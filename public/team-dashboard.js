// Clear ALL storage on load to reset reflection submission state for testing
sessionStorage.clear();
localStorage.clear(); // Also clear localStorage
document.cookie.split(";").forEach(function(c) { 
    document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/"); 
});

// --- Team Dashboard Demo ---
// This file assumes the HTML structure is similar to leader-dashboard-demo.html but without grid, pickup/inject, or start game button.
// Only reflection input is enabled; all other info is read-only and synced from the leader via WebSocket.

// Team dashboard initialization

const itemNames = { A: 'Spirit Ash', W: 'Moonwood', S: 'Storm-Iron', C: 'Coral Runes' };
const itemEmojis = { A: '🔥', W: '🌲', S: '⚡', C: '🌀' };
const itemCodes = Object.keys(itemNames);

let roleSpecificElderChewMessages = [];
let introductoryMessage = "Awaiting role assignment...";
let logEntries = [];
let roundNum = 1;
let sessionEndTime = null; // Stores end timestamp received from server
let roundEndTime = null;   // Stores end timestamp received from server
let timerInterval = null;
let reflectionSubmitted = false;
let reflectionSubmittedThisRound = false;
let teamRoundHistory = [];
let lastRoundNum = null; // Track last roundNum from server
let inventory = { A: 0, W: 0, S: 0, C: 0 };

const reflectionArea = document.getElementById('reflection-area');
const reflectionBtn = document.getElementById('submit-reflection');

// --- WebSocket Integration ---
const urlParams = new URLSearchParams(window.location.search);
const sessionId = urlParams.get('sessionId'); // Must be provided via URL
let playerId = urlParams.get('playerId'); // Must be provided via URL
const role = urlParams.get('role') || 'Wally'; // Fallback to Wally if not specified

// Session parameters loaded

// Initialize ws as null, properly create it in DOMContentLoaded event
let ws = null;

// Add necessary constants (copy from leader)
let N = 5; // Grid size - will be updated from server
const PLAYER = '🧑‍🚀'; // Use the same player emoji
const ITEM_EMOJI = { A: '🔥', W: '🌲', S: '⚡', C: '🌀' }; // Use same item emojis

// Add state variables for map
let itemsGrid = {};
let visited = new Set();
let curr = null;
// N is defined above

// Add grid element reference
let gridEl; // Will be assigned in initialize

// Add necessary variables at the top level if they don't exist
let sessionStartTime = null;
let roundDuration = 60; // Default or get from server
let totalRounds = 8; // Default or get from server
let currentRoundNumber = 1;

// --- Timer constants ---
const SESSION_DURATION = 120; // 2 minutes in seconds
const ROUND_DURATION = 15; // 15 seconds per round
const TOTAL_ROUNDS = 8;

let config = null;

// Add a gameStarted flag to control initial rendering
let gameStarted = false;

// Reset all state variables - moved after declarations
let resetGame = function() {
    roleSpecificElderChewMessages = [];
    introductoryMessage = "Awaiting role assignment...";
    logEntries = [];
    roundNum = 1;
    sessionEndTime = null;
    roundEndTime = null;
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = null;
    reflectionSubmitted = false;
    reflectionSubmittedThisRound = false;
    teamRoundHistory = [];
    lastRoundNum = null;
    inventory = { A: 0, W: 0, S: 0, C: 0 };
    itemsGrid = {};
    visited = new Set();
    curr = null;
    sessionStartTime = null;
    currentRoundNumber = 1;
};
resetGame(); // Now safe to call after all variables are declared

async function loadConfig() {
  const response = await fetch('/api/game-config');
  config = await response.json();
}

// Load Elder Chew's role-specific messages
async function loadElderChewMessages() {
    if (!role) {
        console.error("Cannot load elder chew messages, role not yet assigned.");
        return;
    }
    
    try {
        // First, load the intro message
        const introResponse = await fetch(`/text/role-introductions.json`);
        if (!introResponse.ok) throw new Error(`HTTP error for intro: ${introResponse.status}`);
        const intros = await introResponse.json();
        introductoryMessage = intros[role] || "Follow the leader's path!";
        
        // Then load the role-specific round messages
        const messagesResponse = await fetch(`/text/elder-chew-messages.json`);
        if (!messagesResponse.ok) throw new Error(`HTTP error for messages: ${messagesResponse.status}`);
        const allRoleMessages = await messagesResponse.json();
        roleSpecificElderChewMessages = allRoleMessages[role.toLowerCase()] || [];
        
        // Display initial message in objective box
        updateObjectiveBox();
        
        // Add intro message to array and render the log immediately
        // Make sure we don't add duplicate entries
        if (!logEntries.some(entry => entry === `Elder Chew: ${introductoryMessage}`)) {
            logEntries.push(`Elder Chew: ${introductoryMessage}`);
        }
        
        // If we're not in game yet, update the log display immediately
        if (!gameStarted) {
            const logDiv = document.getElementById('log-content');
            if (logDiv) {
                logDiv.innerHTML = `
                    <div class="log-bubble log-elder">Elder Chew: ${introductoryMessage}</div>
                    <div class="log-bubble log-system">Waiting for leader to start the game...</div>
                `;
            }
        } else {
            renderLog(); // Render the full log if the game has started
        }
    } catch (error) {
        console.error('Error loading role-specific messages:', error);
        introductoryMessage = "Error loading guidance...";
        updateObjectiveBox();
    }
}

// Function removed - Elder Chew messages now appear only in the chat

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

    // Get session/player/role from URL
    const urlParams = new URLSearchParams(window.location.search);
    const sessionId = urlParams.get('sessionId');
    let playerId = urlParams.get('playerId');
    const role = urlParams.get('role') || 'Wally';

    // Load config
    await loadConfig();
    totalRounds = config.ROUND_COUNT;
    roundDuration = config.ROUND_DURATION_SEC;

    // --- DEFINE wsProtocol and wsHost HERE --- 
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsHost = window.location.host;
    // --- NOW CREATE WebSocket URL --- 
    const wsUrl = `${wsProtocol}//${wsHost}`;
    console.log(`[Team] Attempting to connect WebSocket to: ${wsUrl}`);
    ws = new WebSocket(wsUrl);
    window.ws = ws; // Optional, for debugging

    // Assign WebSocket event handlers
    ws.onopen = () => {
        console.log('[Team] WebSocket opened');
        safeSendWS({
            sessionId,
            type: 'register',
            payload: { playerId, role }
        });
        loadElderChewMessages();
    };
    
    ws.onmessage = (event) => {
        try {
            const msg = JSON.parse(event.data);
            console.log('[Team] WebSocket message:', msg.type, msg.payload);
            
            if (msg.type === 'reflection-penalty') {
                console.log('[Team] Reflection penalty received:', msg.payload);
                
                // Format the lost item info
                const itemEmojis = {
                    'W': '🪵',
                    'M': '🔩',
                    'F': '🪶',
                    'S': '✨'
                };
                
                const itemNames = {
                    'W': 'Wood',
                    'M': 'Metal',
                    'F': 'Fiber',
                    'S': 'Spirit'
                };
                
                // Handle reflection penalty
                const lostItemText = msg.payload.itemCode
                    ? `Lost 1 ${itemNames[msg.payload.itemCode]} (${itemEmojis[msg.payload.itemCode]})`
                    : 'No item lost';
                
                const reason = msg.payload.reason || 'A reflection was missed.';
                
                // Add entry to log with consistent format
                logEntries.push(`Reflection Penalty: ${lostItemText}. Reason: ${reason}`);
                renderLog();
                
                // Show penalty modal
                showBigModal({
                    emoji: '⚠️',
                    main: 'Team Penalty Applied',
                    sub: `${reason}<br><br>${lostItemText}`,
                    okText: 'Acknowledge',
                    borderColor: '#e63946'
                });
                
                // Update inventory from server if provided
                if (msg.payload.inventory) {
                    updateInventoryDisplay(msg.payload.inventory);
                }
            }

            let updateNeeded = false;
            let newState = null;
            let mapUpdateNeeded = false;

            if (msg.payload && msg.payload.state) {
                newState = msg.payload.state;
                updateNeeded = true;
                // Update state variables directly
                if (newState.sessionStartTime) {
                    sessionStartTime = newState.sessionStartTime;
                }
                if (newState.N) {
                    // Update grid size from server data
                    N = newState.N;
                }
                if (newState.roundDuration) roundDuration = newState.roundDuration;
                if (newState.totalRounds) totalRounds = newState.totalRounds;
                if (newState.inventory) inventory = { ...newState.inventory };
                if (newState.itemsGrid) {
                    itemsGrid = newState.itemsGrid;
                    mapUpdateNeeded = true;
                }
                if (newState.visited) {
                    visited = new Set(newState.visited);
                    mapUpdateNeeded = true;
                }
                if (newState.curr) {
                    curr = newState.curr;
                    mapUpdateNeeded = true;
                }
                if (typeof newState.roundNum === 'number') {
                    const newRoundNum = Math.min(newState.roundNum, totalRounds);
                    if (newRoundNum > currentRoundNumber) { // Use currentRoundNumber for visual sync
                        // Handle new round transition
                        currentRoundNumber = newRoundNum;
                        reflectionSubmittedThisRound = false;
                        if(reflectionArea) reflectionArea.disabled = false;
                        if(reflectionBtn) reflectionBtn.disabled = false;
                        
                        // Add round separator
                        logEntries.push(`--- Round ${currentRoundNumber} ---`);
                        
                        // Always add Elder Chew message for the round
                        if (roleSpecificElderChewMessages && roleSpecificElderChewMessages.length > 0) {
                            // Use round number to select message deterministically
                            const index = (currentRoundNumber - 1) % roleSpecificElderChewMessages.length;
                            const message = roleSpecificElderChewMessages[index];
                            logEntries.push(`Elder Chew: ${message}`);
                            
                            // Don't show popup, just add to chat log
                        }
                        
                        roundNum = newRoundNum;
                        renderLog();
                    }
                }
            }

            switch (msg.type) {
                case 'session-start':
                case 'session-started': // Add this case to match the actual message type
                    // Debug log
                    console.log('Handling session-started, applying state and initializing team dashboard.');
                    
                    // Set game as started
                    gameStarted = true;

                    // --- Process State FIRST ---
                    if (msg.payload && msg.payload.state) {
                        newState = msg.payload.state;
                        // Apply all state variables (sessionStartTime, N, roundDuration, totalRounds, inventory, itemsGrid, visited, curr, roundNum)
                        if (newState.sessionStartTime) sessionStartTime = newState.sessionStartTime;
                        if (newState.N) N = newState.N;
                        if (newState.roundDuration) roundDuration = newState.roundDuration;
                        if (newState.totalRounds) totalRounds = newState.totalRounds;
                        if (newState.inventory) inventory = { ...newState.inventory };
                        if (newState.itemsGrid) itemsGrid = newState.itemsGrid;
                        if (newState.visited) visited = new Set(newState.visited);
                        if (newState.curr) curr = newState.curr;
                        if (typeof newState.roundNum === 'number') currentRoundNumber = Math.min(newState.roundNum, totalRounds); // Use currentRoundNumber

                         // Add Round 1 separator IF NOT PRESENT
                        if (!logEntries.some(entry => entry.startsWith('--- Round 1 ---'))) {
                            logEntries.push('--- Round 1 ---');
                        }
                        updateNeeded = true; // Mark that UI update is needed after state processing
                        mapUpdateNeeded = true; // Mark that map update is needed
                    } else {
                        console.error('Received session-started but missing state payload.');
                    }

                    // --- Initialize UI SECOND (uses updated state) ---
                    initializeTeamDashboard(); // This renders grid, inventory, log, timers based on updated state

                    // --- Start Timer THIRD (requires sessionStartTime) ---
                    if (typeof sessionStartTime === 'number' && sessionStartTime > 0) {
                        startLocalUITimer();
                    } else {
                        console.error("Invalid sessionStartTime:", sessionStartTime);
                    }
                    break;
                case 'state-update': // Generic state update might still be useful
                     if (msg.payload && msg.payload.state) {
                        // Check if inventory has changed
                        if (msg.payload.state.inventory) {
                            const oldInventory = {...inventory};
                            const newInventory = msg.payload.state.inventory;
                            
                            // Create a delta of changes
                            const changes = [];
                            Object.keys(newInventory).forEach(key => {
                                const diff = newInventory[key] - (oldInventory[key] || 0);
                                if (diff !== 0) {
                                    changes.push(`${diff > 0 ? '+' : ''}${diff} ${itemNames[key]} (${itemEmojis[key]})`);
                                }
                            });
                            
                            // Always update inventory
                            inventory = { ...newInventory };
                            renderInventory();
                            
                            // Add log entry for inventory changes
                            if (changes.length > 0) {
                                const updateMessage = `Inventory updated: ${changes.join(', ')}`;
                                
                                // Force add to log and render
                                document.getElementById('log-content').innerHTML += `<div class="log-bubble log-system">${updateMessage}</div>`;
                                document.getElementById('log-content').scrollTop = document.getElementById('log-content').scrollHeight;
                                
                                // Also add to logEntries array for consistency
                                logEntries.push(updateMessage);
                            }
                        }
                        
                        // Update other state properties if they exist
                        if (msg.payload.state.curr) {
                            curr = msg.payload.state.curr;
                        }
                        if (msg.payload.state.visited) {
                            visited = new Set(msg.payload.state.visited);
                        }
                        if (msg.payload.state.itemsGrid) {
                            itemsGrid = msg.payload.state.itemsGrid;
                        }
                        
                        if (mapUpdateNeeded || msg.payload.state.visited || msg.payload.state.curr) {
                            renderGrid();
                        }
                    }
                     break;
                case 'show-modal': // Keep showing modals (like penalties)
                    if (msg.payload) {
                        showBigModal({
                            emoji: msg.payload.emoji,
                            main: msg.payload.main,
                            sub: msg.payload.sub,
                            borderColor: msg.payload.borderColor,
                            eventType: msg.payload.eventType,
                        });
                    }
                    break;
                case 'pickup-update':
                case 'inventory-update': // Add this case to handle inventory updates from leader
                    if (msg.payload && msg.payload.inventory) {
                        // Always update inventory
                        const oldInventory = {...inventory};
                        const newInventory = msg.payload.inventory;
                        
                        // Update inventory data
                        inventory = { ...newInventory };
                        renderInventory();
                        
                        // Use the exact message sent from leader if available
                        if (msg.payload.messageText) {
                            // Add directly to DOM
                            const logDiv = document.getElementById('log-content');
                            if (logDiv) {
                                const msgElement = document.createElement('div');
                                msgElement.className = 'log-bubble log-system'; 
                                msgElement.style.background = '#e6ffe6';
                                msgElement.style.borderLeft = '5px solid #4CAF50';
                                msgElement.textContent = msg.payload.messageText;
                                logDiv.appendChild(msgElement);
                                
                                // Also add to logEntries for later renders
                                logEntries.push(msg.payload.messageText);
                                logDiv.scrollTop = logDiv.scrollHeight;
                            }
                        } else {
                            // Fallback: Create a message from inventory changes if no message was provided
                            // Create a delta of changes
                            const changes = [];
                            Object.keys(newInventory).forEach(key => {
                                const diff = newInventory[key] - (oldInventory[key] || 0);
                                if (diff !== 0) {
                                    changes.push(`${diff > 0 ? '+' : ''}${diff} ${itemNames[key]} (${itemEmojis[key]})`);
                                }
                            });
                            
                            if (changes.length > 0) {
                                // Create our own update message
                                const updateMessage = `Inventory updated: ${changes.join(', ')}`;
                                
                                // Add directly to DOM
                                const logDiv = document.getElementById('log-content');
                                if (logDiv) {
                                    const msgElement = document.createElement('div');
                                    msgElement.className = 'log-bubble log-system'; 
                                    msgElement.style.background = '#e6ffe6';
                                    msgElement.style.borderLeft = '5px solid #4CAF50';
                                    msgElement.textContent = updateMessage;
                                    logDiv.appendChild(msgElement);
                                    
                                    // Also add to logEntries for later renders
                                    logEntries.push(updateMessage);
                                    logDiv.scrollTop = logDiv.scrollHeight;
                                }
                            }
                        }
                    } else {
                        console.error('Missing inventory payload in inventory-update message');
                    }
                    break;
                case 'inject-story':
                    if (msg.payload && msg.payload.story) {
                        logEntries.push(`Inject Story: ${msg.payload.story}`);
                        renderLog();
                    }
                    break;
                case 'inject': // Add handler for inject messages from leader
                    if (msg.payload && msg.payload.inject && msg.payload.inject.story) {
                        // First, log the story
                        logEntries.push(`Inject Story: ${msg.payload.inject.story}`);
                        
                        // Then log the item loss if any
                        if (msg.payload.inject.item) {
                            const itemCode = msg.payload.inject.item;
                            logEntries.push(`Inject: Lost 1 ${itemNames[itemCode]} (${itemEmojis[itemCode]})`);
                        } else {
                            logEntries.push('Inject: No items to lose.');
                        }
                        
                        // Update inventory from the payload if available
                        if (msg.payload.inventory) {
                            inventory = { ...msg.payload.inventory };
                            renderInventory();
                        }
                        
                        renderLog();
                    }
                    break;
                case "move":
                    console.log('[Team] Handling "move" message:', msg.payload);
                    if (msg.payload && msg.payload.move && msg.payload.state) { // Ensure state exists
                        console.log('[Team] Applying state from move message:', msg.payload.state);

                        // Process inventory changes if inventory exists in the state
                        if (msg.payload.state.inventory) { 
                            const oldInventory = {...inventory};
                            const newInventory = msg.payload.state.inventory;
                            const changes = [];
                            Object.keys(newInventory).forEach(key => {
                                const diff = newInventory[key] - (oldInventory[key] || 0);
                                if (diff !== 0) {
                                    changes.push(`${diff > 0 ? '+' : ''}${diff} ${itemNames[key]} (${itemEmojis[key]})`);
                                }
                            });
                            inventory = { ...newInventory }; // Update inventory 
                            if (changes.length > 0) {
                                const updateMessage = `Inventory updated: ${changes.join(', ')}`;
                                const logDiv = document.getElementById('log-content');
                                if (logDiv) {
                                    const msgElement = document.createElement('div');
                                    msgElement.className = 'log-bubble log-system';
                                    msgElement.style.background = '#e6ffe6';
                                    msgElement.style.borderLeft = '5px solid #4CAF50';
                                    msgElement.textContent = updateMessage;
                                    logDiv.appendChild(msgElement);
                                    logDiv.scrollTop = logDiv.scrollHeight;
                                }
                                logEntries.push(updateMessage);
                            }
                        } // End inventory processing

                        // Update position and visited cells
                        if (msg.payload.state.curr) curr = msg.payload.state.curr;
                        if (msg.payload.state.visited) visited = new Set(msg.payload.state.visited);
                        
                        // Render UI elements
                        renderInventory();
                        renderGrid();
                        console.log('[Team] Finished renderGrid/renderInventory after move.');
                        
                    } else {
                        console.warn('[Team] Received "move" message without full payload/state.');
                    }
                    break;
            }

            if (updateNeeded) {
                renderInventory();
                renderLog(); // Render filtered log
                renderTimers();
                if (mapUpdateNeeded) { 
                     // Logging removed;
                     renderGrid();
                }
            }
        } catch (error) {
            console.error('[Team] Failed to parse WebSocket message:', event.data, error);
        }
    };

    ws.onerror = (error) => {
        console.error('[Team] !!! WebSocket ERROR:', error);
    };

    ws.onclose = (event) => {
        console.log('[Team] !!! WebSocket CLOSED:', event.code, event.reason);
        ws = null;
    };

    // Assign reflection button handler
    if (reflectionBtn) {
        reflectionBtn.onclick = function() {
            console.log('[Team] Reflection submitted');
            const text = reflectionArea.value;
            if (!reflectionSubmittedThisRound) {
                logEntries.push(`Reflection Submitted (R${currentRoundNumber}): ${text || '[Empty]'}`); 
                reflectionArea.value = ''; 
                renderLog();
                reflectionSubmittedThisRound = true; 
                reflectionArea.disabled = true;
                reflectionBtn.disabled = true;
                safeSendWS({
                    sessionId,
                    type: 'reflection',
                    payload: { playerId, text, roundNum: currentRoundNumber } 
                });
            }
        };
    }

    // Assign player role in UI
    if (playerRoleElement) playerRoleElement.textContent = role;

    // Initialize dashboard with gameStarted = false
    initializeTeamDashboard();
});

// Example: Simulate receiving updates from leader every 10s
// setInterval(() => {
//     receiveFromLeader({
//         roundNum: Math.floor(Math.random()*8)+1,
//         sessionSeconds: Math.floor(Math.random()*2400),
//         roundSeconds: Math.floor(Math.random()*10),
//         inventory: { W: Math.floor(Math.random()*5), M: Math.floor(Math.random()*5), F: Math.floor(Math.random()*5), S: Math.floor(Math.random()*5) },
//         logEntries: [ ...logEntries, 'Inject Story: ' + injectStories[Math.floor(Math.random()*injectStories.length)] ]
//     });
// }, 10000); 

// Fix the showBigModal function to ensure all team member modals have OK buttons
function showBigModal({emoji, main, sub, okText, onOk, borderColor, eventType}) {
    // Remove existing modals first
    document.querySelectorAll('.modal-popup').forEach(m => m.remove());

    const modal = document.createElement('div');
    // Use a class for easier removal and styling
    modal.className = 'modal-popup'; 
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
    
    // For team dashboard, always show OK button
    const actualOkText = okText || 'OK'; // Default to "OK" if not provided

    modal.innerHTML = `<div style="background:#fff;padding:2.5em 3em;border-radius:28px;box-shadow:0 2px 24px #0003;text-align:center;min-width:320px;border:2.5px solid ${borderColor || '#e0e0e0'};">
        ${(eventType ? `<div style='color:#888;font-size:0.95em;margin-bottom:0.7em;'>${eventType}</div>` : '')}
        <div style='font-size:2.5em;margin-bottom:0.5em;'>${emoji || ''}</div>
        <div style='font-size:1.5em;font-weight:bold;margin-bottom:0.7em;'>${main}</div>
        <div style='font-size:1.1em;color:#444;margin-bottom:1.2em;'>${sub || ''}</div>
        <button class='modal-ok-btn' style='font-size:1.2em;padding:0.7em 2.5em;margin-top:1em;border-radius:18px;border:2px solid #222;background:#e0e0e0;color:#222;font-weight:600;cursor:pointer;'>${actualOkText}</button>
    </div>`;
    document.body.appendChild(modal);
    
    // Always attach handler to close the modal for team members
    const okBtn = modal.querySelector('.modal-ok-btn');
    if (okBtn) {
        okBtn.addEventListener('click', () => {
            modal.remove();
            if (typeof onOk === 'function') onOk();
        });
    }
} 

// Add back the missing functions that were removed
function renderInventory() {
    const ul = document.getElementById('inventory-list');
    if (!ul) {
        console.error('RENDER INVENTORY: inventory-list element not found!');
        return;
    }
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
    if (!logDiv) {
        console.error('RENDER LOG: log-content element not found!');
        return;
    }
    
    logDiv.innerHTML = '';
    logEntries.forEach((entry, index) => {
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
        } else if (entry.startsWith('Reflection Submitted')) {
            msg.classList.add('log-user');
        } else if (entry.startsWith('Reflection Missed')) {
            msg.classList.add('log-missed-reflection');
            msg.style.background = '#ffecec';
            msg.style.borderLeft = '5px solid #ff5757';
        } else if (entry.startsWith('Reflection Penalty:')) {
            msg.classList.add('log-penalty');
            msg.style.background = '#fff0f0';
            msg.style.borderLeft = '5px solid #ff4500';
        } else if (entry.startsWith('Inventory updated:')) {
            msg.classList.add('log-system');
            msg.style.background = '#e6ffe6';  // Light green background
            msg.style.borderLeft = '5px solid #4CAF50';  // Green border
        }
        
        msg.textContent = entry;
        logDiv.appendChild(msg);
    });
    
    // Force scroll to bottom to ensure new messages are visible
    setTimeout(() => {
        logDiv.scrollTop = logDiv.scrollHeight;
    }, 50);
}

// Function to update the objective box
function updateObjectiveBox() {
    const objectiveBox = document.getElementById('objective-box');
    if (!objectiveBox) return;
    objectiveBox.textContent = 'Elder Chew: ' + introductoryMessage;
}

// Function to log messages
function log(msg) {
    logEntries.push(msg);
    renderLog(); 
}

// Modify startLocalUITimer to prevent multiple missed reflection reports
function startLocalUITimer() {
    console.log('[Team] startLocalUITimer called.', { sessionStartTime });
    if (timerInterval) clearInterval(timerInterval);
    if (!sessionStartTime) {
        console.error('No sessionStartTime set!');
        return;
    }
    
    // Add Elder Chew message for Round 1 if needed
    if (currentRoundNumber === 1 && roleSpecificElderChewMessages && roleSpecificElderChewMessages.length > 0) {
        const round1Msg = `Elder Chew: ${roleSpecificElderChewMessages[0]}`;
        if (!logEntries.includes(round1Msg)) {
            logEntries.push(round1Msg);
        }
    }
    renderLog();

    const reportedMissedRounds = new Set();
    timerInterval = setInterval(() => {
        const now = Date.now();
        const elapsed = Math.round((now - sessionStartTime) / 1000);
        const sessionDuration = totalRounds * roundDuration;
        const remainingSession = Math.max(0, sessionDuration - elapsed);
        const clampedRoundNum = Math.min(currentRoundNumber, totalRounds);
        const roundElapsed = elapsed - (clampedRoundNum - 1) * roundDuration;
        const remainingRound = Math.max(0, roundDuration - roundElapsed);
        renderTimers(remainingSession, remainingRound, clampedRoundNum);

        if (remainingRound === 0 && clampedRoundNum < totalRounds) {
            // Only report missed reflections if we haven't already reported for this round
            if (!reflectionSubmittedThisRound && !reportedMissedRounds.has(clampedRoundNum)) {
                const text = reflectionArea.value;
                logEntries.push(`Reflection Missed (R${clampedRoundNum}): ${text || '[Empty]'}`); 
                reflectionArea.value = '';
                renderLog(); 
                
                // Mark this round as reported
                reportedMissedRounds.add(clampedRoundNum);
                
                ws.send(JSON.stringify({
                    sessionId,
                    type: 'reflection-missing',
                    payload: { playerId, roundNum: clampedRoundNum, text }
                }));
            }
            currentRoundNumber++;
            reflectionSubmittedThisRound = false; 
            if(reflectionArea) reflectionArea.disabled = false;
            if(reflectionBtn) reflectionBtn.disabled = false;
            logEntries.push(`--- Round ${currentRoundNumber} ---`); 
            
            // Add Elder Chew message for NEW round  
            if (roleSpecificElderChewMessages && roleSpecificElderChewMessages.length > 0) {
                const index = (currentRoundNumber - 1) % roleSpecificElderChewMessages.length;
                const message = roleSpecificElderChewMessages[index];
                logEntries.push(`Elder Chew: ${message}`);
            }
            
            renderLog(); 
        }

        if (remainingSession === 0 || (remainingRound === 0 && clampedRoundNum >= totalRounds)) {
            // Only report missed reflection for final round if we haven't already
            if (clampedRoundNum === totalRounds && !reflectionSubmittedThisRound && !reportedMissedRounds.has(clampedRoundNum)) {
                const text = reflectionArea.value;
                logEntries.push(`Reflection Missed (R${clampedRoundNum}): ${text || '[Empty]'}`); 
                reflectionArea.value = ''; 
                renderLog(); 
                
                // Mark this round as reported
                reportedMissedRounds.add(clampedRoundNum);
                
                ws.send(JSON.stringify({
                    sessionId,
                    type: 'reflection-missing',
                    payload: { playerId, roundNum: clampedRoundNum, text }
                }));
            }
            clearInterval(timerInterval);
            renderTimers(remainingSession, remainingRound, clampedRoundNum);
        }
    }, 250);
}

function renderTimers(currentSessionSec, currentRoundSec, displayRoundNum) {
    const sessionTimerEl = document.getElementById('primary-timer');
    const roundTimerEl = document.getElementById('secondary-timer');
    const roundNumberEl = document.getElementById('turn-counter');

    // Defensive: Only show timers if sessionStartTime is a valid number and > 0
    if (typeof sessionStartTime !== 'number' || sessionStartTime <= 0) {
        if (sessionTimerEl) sessionTimerEl.textContent = 'Session: --:--';
        if (roundTimerEl) roundTimerEl.textContent = 'Round Timer: --:--';
        if (roundNumberEl) roundNumberEl.textContent = `- / -`;
        return;
    }

    const roundToShow = displayRoundNum !== undefined ? displayRoundNum : currentRoundNumber;
    // Calculate remaining times if not provided (e.g., for initial render)
    if (currentSessionSec === undefined || currentRoundSec === undefined) {
        const now = Date.now();
        // Always use sessionStartTime from the leader for all math
        const elapsedSession = sessionStartTime ? (now - sessionStartTime) / 1000 : 0; // in seconds
        const sessionDuration = totalRounds * roundDuration; // in seconds
        const initialRoundNum = sessionStartTime ? Math.min(totalRounds, Math.floor(elapsedSession / roundDuration) + 1) : roundToShow;
        const roundStartTime = sessionStartTime + (initialRoundNum - 1) * roundDuration * 1000; // ms
        currentRoundSec = sessionStartTime ? Math.max(0, Math.round((roundStartTime + roundDuration * 1000 - now) / 1000)) : 0;
        currentSessionSec = sessionStartTime
            ? Math.max(0, Math.round(sessionStartTime / 1000 + sessionDuration - now / 1000))
            : 0;
    }

    const sessionMinutes = Math.floor(currentSessionSec / 60);
    const sessionSeconds = currentSessionSec % 60;
    const roundMinutes = Math.floor(currentRoundSec / 60);
    const roundSeconds = currentRoundSec % 60;

    if (sessionTimerEl) sessionTimerEl.textContent = `Session: ${pad(sessionMinutes)}:${pad(sessionSeconds)}`;
    if (roundTimerEl) {
        roundTimerEl.textContent = `Round Timer: ${pad(roundMinutes)}:${pad(roundSeconds)}`;
        roundTimerEl.style.color = currentRoundSec <= 5 ? 'red' : 'inherit';
    }
    if (roundNumberEl) roundNumberEl.textContent = `${roundToShow} / ${totalRounds}`;
}

function pad(n) { return n < 10 ? '0' + n : n; }

function renderGrid() {
    console.log('[Team] renderGrid called.');
    if (!gridEl) gridEl = document.getElementById('grid'); // Try assigning again
    console.log(`[Team] renderGrid: gridEl? ${!!gridEl}, N=${N}, itemsGrid keys=${itemsGrid ? Object.keys(itemsGrid).length : 'null'}`);

    if (!gridEl) { 
        console.error("renderGrid Error: Grid element not found!"); 
        return; 
    }
    if (typeof N !== 'number' || N <= 0) {
        console.error(`renderGrid Error: Invalid grid size N=${N}`);
        return;
    }
    if (!itemsGrid || typeof itemsGrid !== 'object') {
        console.error(`renderGrid Error: Invalid itemsGrid=${itemsGrid}`);
        return;
    }

    gridEl.innerHTML = '';
    gridEl.style.gridTemplateColumns = `repeat(${N}, 1fr)`;
    gridEl.style.gridTemplateRows = `repeat(${N}, 1fr)`;
    gridEl.style.display = 'grid';

    for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
            const cell = document.createElement('div');
            cell.className = 'cell'; 
            cell.dataset.r = r;
            cell.dataset.c = c;
            const key = `${r},${c}`;

            // Add 'visited' class if the cell key is in the visited set
            if (visited.has(key)) {
                cell.classList.add('visited');
            }

            if (curr && r === curr.r && c === curr.c) {
                cell.classList.add('current');
                cell.textContent = PLAYER;
            } else if (itemsGrid[key] && !visited.has(key)) { // Show item only if not visited
                // Use itemEmojis for consistent display
                cell.textContent = itemEmojis[itemsGrid[key]];
            }
            
            gridEl.appendChild(cell);
        }
    }
}

// Modify initializeTeamDashboard
function initializeTeamDashboard() {
    gridEl = document.getElementById('grid');
    
    // Only show game elements if the game has started
    if (gameStarted) {
        renderInventory();
        renderLog(); // Renders initial log (with intro message)
        renderTimers();
        renderGrid(); // Ensure grid renders AFTER state is likely set
        
        // Show grid element
        if (gridEl) {
            gridEl.style.display = 'grid';
        }
    } else {
        // Hide grid when game hasn't started
        if (gridEl) {
            gridEl.style.display = 'none';
        }
        
        // Show Elder Chew intro message with waiting context
        const logDiv = document.getElementById('log-content');
        if (logDiv) {
            // If we already have the introductory message, show it with a waiting message
            if (introductoryMessage && introductoryMessage !== "Awaiting role assignment...") {
                logDiv.innerHTML = `
                    <div class="log-bubble log-elder">Elder Chew: ${introductoryMessage}</div>
                    <div class="log-bubble log-system">Waiting for leader to start the game...</div>
                `;
            } else {
                // Fallback if intro message not loaded yet
                logDiv.innerHTML = '<div class="log-bubble log-system">Waiting for leader to start the game...</div>';
            }
        }
    }
    
    document.getElementById('player-role').textContent = role;
}

// Add reflection button handler
document.addEventListener('DOMContentLoaded', () => {
    const reflectionBtn = document.getElementById('submit-reflection');
    const reflectionArea = document.getElementById('reflection-area');
    
    if (reflectionBtn) {
        reflectionBtn.onclick = function() {
            const text = reflectionArea.value;
            if (!reflectionSubmittedThisRound) {
                logEntries.push(`Reflection Submitted (R${currentRoundNumber}): ${text || '[Empty]'}`); 
                reflectionArea.value = ''; 
                renderLog();
                reflectionSubmittedThisRound = true; 
                reflectionArea.disabled = true;
                reflectionBtn.disabled = true;
                safeSendWS({
                    sessionId,
                    type: 'reflection',
                    payload: { playerId, text, roundNum: currentRoundNumber } 
                });
            }
        };
    }
}); 

// Add the updateInventoryDisplay function that's referenced in the reflection-penalty handler
function updateInventoryDisplay(inventoryData) {
    // Update the inventory data
    inventory = { ...inventoryData };
    
    // Add this to logEntries so we have a record of what happened
    const lostItemText = inventoryData && Object.keys(inventoryData).length > 0
        ? `Inventory updated: ${Object.entries(inventoryData).map(([k, v]) => `${itemEmojis[k]}: ${v}`).join(', ')}`
        : 'Inventory updated';
    
    // Add to log entries
    logEntries.push(lostItemText);
    
    // Update the UI
    renderInventory();
    renderLog();
} 

window.addEventListener('beforeunload', function (e) {
    e.preventDefault();
    e.returnValue = '';
}); 
const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const cors = require('cors');
const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const { logAction } = require('./db');

const app = express();
const PORT = process.env.PORT || 8080;

// In-memory session/role store
const sessions = {};

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

const configPath = path.join(__dirname, 'config', 'params.json');
const gameConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));

// Place this after static file serving
app.get('/api/game-config', (req, res) => {
  res.json(gameConfig);
});

// Claim role endpoint
app.post('/api/claim-role', (req, res) => {
  const { sessionId, playerId, role } = req.body;
  if (!sessionId || !playerId || !role) {
    return res.json({ success: false, message: 'Missing required fields.' });
  }
  if (!gameConfig.ROLES.includes(role)) {
    return res.json({ success: false, message: 'Invalid role.' });
  }
  if (!sessions[sessionId]) {
    sessions[sessionId] = createSession(sessionId);
  }
  // Check if role is already taken
  const taken = Object.entries(sessions[sessionId].roles).find(([r, id]) => r === role);
  if (taken) {
    return res.json({ success: false, message: 'Role already taken.' });
  }
  // Check if player already claimed a role
  const alreadyClaimed = Object.entries(sessions[sessionId].roles).find(([r, id]) => id === playerId);
  if (alreadyClaimed) {
    return res.json({ success: false, message: 'Player already claimed a role.' });
  }
  // Assign role
  sessions[sessionId].roles[role] = playerId;
  return res.json({ success: true, message: 'Role claimed.' });
});

// Serve index.html for the root path
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Admin Console route - Serve the admin console page
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin-console.html'));
});

// Results viewer route - Serve the actions viewer page
app.get('/results', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'actions-viewer.html'));
});

// API endpoint to check admin authentication
app.post('/api/check-admin-auth', (req, res) => {
  // Always return success (no password required)
  return res.status(200).send('Authentication successful');
});

// API endpoint to save configuration
app.post('/api/save-config', (req, res) => {
  // No authentication check required
  try {
    // Get updated config from request body
    const updatedConfig = req.body;
    
    // Validate the updated config (basic validation)
    if (!updatedConfig || typeof updatedConfig !== 'object') {
      return res.status(400).send('Invalid configuration format');
    }
    
    // Required fields that must be present in the config
    const requiredFields = [
      'ROUND_COUNT', 
      'ROUND_DURATION_SEC', 
      'SESSION_DURATION_SEC', 
      'GRID_SIZE', 
      'MAX_STEPS_PER_ROUND',
      'ITEMS',
      'ROLES',
      'TEXT_TEMPLATES'
    ];
    
    // Check if all required fields are present
    for (const field of requiredFields) {
      if (!(field in updatedConfig)) {
        return res.status(400).send(`Missing required field: ${field}`);
      }
    }
    
    // Make sure config directory exists
    if (!fs.existsSync(path.join(__dirname, 'config'))) {
      fs.mkdirSync(path.join(__dirname, 'config'), { recursive: true });
      console.log('Created config directory');
    }
    
    // Check file access permissions before trying to write
    try {
      fs.accessSync(path.dirname(configPath), fs.constants.W_OK);
    } catch (err) {
      console.error('Config directory is not writable:', err);
      return res.status(500).send('Server configuration directory is not writable');
    }
    
    // Check if params.json exists, create it with default content if it doesn't
    if (!fs.existsSync(configPath)) {
      console.log('Config file does not exist, creating with default content');
      fs.writeFileSync(configPath, JSON.stringify(gameConfig, null, 2));
    }
    
    // Make a backup of the current config (timestamp in the filename)
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = path.join(__dirname, 'config', `params-backup-${timestamp}.json`);
      fs.writeFileSync(backupPath, fs.readFileSync(configPath));
      console.log(`Config backup created at ${backupPath}`);
    } catch (backupErr) {
      console.error('Failed to create backup:', backupErr);
      // Continue even if backup fails
    }
    
    // Write the updated config to the file
    try {
      fs.writeFileSync(configPath, JSON.stringify(updatedConfig, null, 2));
      console.log('Successfully wrote updated configuration to file');
    } catch (writeErr) {
      console.error('Failed to write to config file:', writeErr);
      return res.status(500).send(`Failed to write to config file: ${writeErr.message}`);
    }
    
    // Update the in-memory gameConfig
    Object.assign(gameConfig, updatedConfig);
    
    // Send success response
    res.json({ success: true, message: 'Configuration saved successfully' });
    
    console.log(`[${new Date().toISOString()}] Configuration updated by admin`);
  } catch (error) {
    console.error('Error saving configuration:', error);
    res.status(500).send(`Error saving configuration: ${error.message}`);
  }
});

// Static files are already served by app.use(express.static(...))
// The fallback app.get('*') is removed as it might catch API routes otherwise

// Create a single HTTP server for both Express and WebSocket
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`WebSocket server running on ws://localhost:${PORT}`);
});

// Function to create a new session with consistent structure
function createSession(id) {
    return {
        id,
        clients: [],
        roles: {},
        started: false,
        state: { inventory: { A: 0, W: 0, S: 0, C: 0 } },
        log: [],
        reflections: {},
        penaltyAppliedForRound: {}, // Track if penalty was applied for a round
        gameInstance: ''
    };
}

wss.on('connection', function connection(ws) {
    console.log(`[${new Date().toISOString()}] New client connected`);
    ws.on('message', function incoming(message) {
        let data;
        try {
            data = JSON.parse(message);
        } catch (e) {
            // Log and ignore non-JSON messages (like keepalive pings)
            if (typeof message === 'string' || Buffer.isBuffer(message)) {
                const msgStr = Buffer.isBuffer(message) ? message.toString('utf8') : message;
                if (msgStr.trim().toLowerCase() === 'keepalive') {
                    // Optionally log or just silently ignore
                    // console.log('Received keepalive ping, ignoring.');
                    return;
                }
            }
            console.error("Failed to parse message:", message, e);
            return;
        }
        const { sessionId, type, payload } = data;
        if (!sessionId) { console.log("Message without sessionId received"); return; }

        // Register session and client using the createSession function
        if (!sessions[sessionId]) {
            sessions[sessionId] = createSession(sessionId);
            console.log(`[${sessionId}] New session created`);
        }
        const session = sessions[sessionId];
        ws.sessionId = sessionId; // Assign sessionId to the ws connection

        // Assign playerId to the connection for logging
        if (payload && payload.playerId) {
            ws.playerId = payload.playerId;
        } else if (!ws.playerId && type === 'session-start' && payload.role === 'Charlie') {
             ws.playerId = payload.playerId; // Capture leader's ID on start
        }

        // --- NEW: Register role on 'register' message ---
        if (type === 'register' && payload && payload.role && payload.playerId) {
            if (!session.roles[payload.role] || session.roles[payload.role] !== payload.playerId) {
                session.roles[payload.role] = payload.playerId;
                console.log(`[${sessionId}] Registered role: ${payload.role} for player ${payload.playerId}`);
            }
            // --- NEW: If session already started, send current state to this client ---
            if (session.started && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    type: 'session-started',
                    payload: { state: session.state, roles: session.roles }
                }));
                console.log(`[${sessionId}] Sent session-started to late-joining client ${payload.playerId}`);
            }
        }

        if (!session.clients.some(client => client === ws)) { // Use some() for better check
            session.clients.push(ws);
            console.log(`[${sessionId}] Client ${ws.playerId || 'Unknown'} added. Total clients: ${session.clients.length}`);
        }

        // Log received message type and sender
        console.log(`[${sessionId}] Received '${type}' from ${ws.playerId || 'Unknown'}`);

        // Logging for who joined (first message with sessionId)
        if (type === 'session-start') {
            console.log(`[${sessionId}] Leader started session (playerId: ${payload.playerId})`);
            if (payload.role === 'Charlie') {
                session.started = true;
                session.state = payload.state || {};
                session.log = [];
                session.penaltyAppliedForRound = {}; // Reset penalties for new game
                
                // Explicitly register Leader role if not done already
                if (!session.roles['Charlie'] || session.roles['Charlie'] !== payload.playerId) {
                    session.roles['Charlie'] = payload.playerId;
                    console.log(`[${sessionId}] Explicitly registered Leader role for ${payload.playerId}`);
                }
                
                // Generate a new gameInstance (HH:MM in GMT+8)
                const now = new Date();
                const gmt8 = new Date(now.getTime() + 8 * 60 * 60 * 1000);
                const hh = String(gmt8.getUTCHours()).padStart(2, '0');
                const mm = String(gmt8.getUTCMinutes()).padStart(2, '0');
                session.gameInstance = `${hh}:${mm}`;
                console.log(`[${sessionId}] New gameInstance: ${session.gameInstance}`);
                console.log(`[${sessionId}] Leader started session. Initial state received with end times:`, session.state.sessionEndTime, session.state.roundEndTime);
                
                // Log roles mapping for this session (after all roles are claimed)
                const playerIdToRole = {};
                for (const [roleName, pid] of Object.entries(session.roles)) {
                  if (pid) playerIdToRole[pid] = roleName;
                }
                logAction({
                  sessionId,
                  roundNum: 0,
                  playerId: payload.playerId,
                  actionType: 'roles',
                  actionData: { roles: playerIdToRole },
                  gameInstance: session.gameInstance || ''
                });
                broadcast(sessionId, { type: 'session-started', payload: { state: session.state, roles: session.roles } }, ws); // Send initial state
            }
            return;
        }
        // --- Reflection submitted ---
        if (type === 'reflection') {
            const { playerId, roundNum, text } = payload;
            logAction({
                sessionId,
                roundNum,
                playerId,
                actionType: 'reflection',
                actionData: { text },
                gameInstance: session.gameInstance || ''
            });
            // (Optional: store in session.reflections if needed)
            return;
        }
        if (type === 'move' || type === 'inject' || type === 'inventory-update') {
            console.log(`[${sessionId}] ${type} in session ${sessionId} by ${payload.playerId || 'leader'}`);
        }
        if (type === 'reflection-missing') {
            const { playerId, roundNum, text } = payload;
            logAction({
                sessionId,
                roundNum,
                playerId,
                actionType: 'reflection-missing',
                actionData: { text },
                gameInstance: session.gameInstance || ''
            });
            const currentRound = roundNum || session.state.roundNum; 
            console.log(`[${sessionId}] Received reflection-missing for round ${currentRound} from ${playerId}. Checking penalty status...`);
            
            // TEAM PENALTY LOGIC: 
            // The first player to miss a reflection in a round triggers a penalty for the entire team
            // We track this with session.penaltyAppliedForRound to ensure only one penalty per round
            const penaltyAlreadyApplied = session.penaltyAppliedForRound[currentRound]; 
            console.log(`[${sessionId}] Penalty already applied for round ${currentRound}? ${penaltyAlreadyApplied}`);
            
            if (!penaltyAlreadyApplied) {
                 // Apply penalty - lose one random item from inventory
                 let lostItem = null;
                 const inv = session.state.inventory || {};
                 
                 console.log(`[${sessionId}] Current inventory before penalty:`, inv);
                 
                 // Get non-empty inventory items
                 const availableItems = Object.entries(inv)
                     .filter(([code, qty]) => qty > 0)
                     .map(([code]) => code);
                 
                 console.log(`[${sessionId}] Available items for penalty:`, availableItems);
                 
                 if (availableItems.length > 0) {
                     // Select random item to remove
                     lostItem = availableItems[Math.floor(Math.random() * availableItems.length)];
                     inv[lostItem]--;
                     console.log(`[${sessionId}] Penalty: Lost 1 ${lostItem} due to missed reflection in round ${currentRound}`);
                 } else {
                     console.log(`[${sessionId}] Penalty: No item to lose for missed reflection in round ${currentRound}`);
                 }
                 
                 // Mark this round as having had a penalty applied to prevent multiple penalties
                 session.penaltyAppliedForRound[currentRound] = true;
                 
                 // Update the server's state record with the new inventory
                 session.state.inventory = { ...inv };
                 
                 let reason = 'A reflection was missed.';
                 
                 // Notify ALL team members about the penalty (entire team is penalized)
                 console.log(`[${sessionId}] Broadcasting reflection-penalty to all clients. Lost item: ${lostItem}`);
                 
                 session.clients.forEach(client => {
                     if (client.readyState === WebSocket.OPEN) {
                         console.log(`[${sessionId}] Sending reflection-penalty to client ${client.playerId}:`, { itemCode: lostItem, reason, inventory: { ...inv } });
                         client.send(JSON.stringify({
                             type: 'reflection-penalty',
                             payload: { itemCode: lostItem, reason, inventory: { ...inv } }
                         }));
                     }
                 });
                 
                 // Log the penalty action with correct structure
                 logAction({
                     sessionId,
                     roundNum: currentRound,
                     playerId: 'server',
                     actionType: 'penalty',
                     actionData: { reason, lostItem, inventory: { ...inv } },
                     gameInstance: session.gameInstance || ''
                 });
            } else {
                console.log(`[${sessionId}] Penalty already applied for round ${currentRound}, ignoring duplicate reflection-missing from ${playerId}`);
            }
            return;
        }

        // --- Role selection ---
        if (type === 'role-select') {
            // payload: { playerId, role }
            if (!session.roles[payload.role]) {
                session.roles[payload.role] = payload.playerId;
                // Broadcast updated roles
                broadcast(sessionId, { type: 'role-update', payload: { roles: session.roles } }, ws);
            } else {
                // Role already taken, notify this client
                ws.send(JSON.stringify({ type: 'role-taken', payload: { role: payload.role } }));
            }
            return;
        }

        // --- Leader move ---
        if (type === 'move') {
            // payload: { move, state }
            session.state = { ...session.state, ...payload.state };
            session.log.push({ type: 'move', move: payload.move, playerId: ws.playerId });
            console.log(`[${sessionId}] About to broadcast type 'move'. Sender ws instance provided?`, !!ws); // Log if 'ws' is defined
            broadcast(sessionId, { type: 'move', payload: { move: payload.move, state: session.state } }, ws);
            console.log(`[${sessionId}] About to broadcast state after move. Sender ws instance provided?`, !!ws); // Log if 'ws' is defined
            broadcastState(sessionId, ws);
            logAction({ sessionId, roundNum: session.state.roundNum, playerId: ws.playerId, actionType: 'move', actionData: payload, gameInstance: session.gameInstance || '' });
            return;
        }

        // --- Inject event ---
        if (type === 'inject') {
            // payload: { inject, state }
            session.state = { ...session.state, ...payload.state };
            session.log.push({ type: 'inject', inject: payload.inject, playerId: ws.playerId });
            console.log(`[${sessionId}] About to broadcast type 'inject'. Sender ws instance provided?`, !!ws); // Log if 'ws' is defined
            broadcast(sessionId, { type: 'inject', payload: { inject: payload.inject, state: session.state } }, ws);
            console.log(`[${sessionId}] About to broadcast state after inject. Sender ws instance provided?`, !!ws); // Log if 'ws' is defined
            broadcastState(sessionId, ws);
            logAction({ sessionId, roundNum: session.state.roundNum, playerId: ws.playerId, actionType: 'inject', actionData: payload, gameInstance: session.gameInstance || '' });
            return;
        }

        // --- Inventory update (e.g., leader collects item) ---
        if (type === 'inventory-update') {
            // payload: { inventory, state }
            session.state = { ...session.state, ...payload.state };
            session.log.push({ type: 'inventory-update', inventory: payload.inventory, playerId: ws.playerId });
            console.log(`[${sessionId}] About to broadcast type 'inventory-update'. Sender ws instance provided?`, !!ws); // Log if 'ws' is defined
            broadcast(sessionId, { type: 'inventory-update', payload: { inventory: payload.inventory, state: session.state } }, ws);
            console.log(`[${sessionId}] About to broadcast state after inventory update. Sender ws instance provided?`, !!ws); // Log if 'ws' is defined
            broadcastState(sessionId, ws);
            logAction({ sessionId, roundNum: session.state.roundNum, playerId: ws.playerId, actionType: 'inventory-update', actionData: payload, gameInstance: session.gameInstance || '' });
            return;
        }

        // --- Log message from leader ---
        if (type === 'log') {
            session.log.push({ type: 'log', playerId: payload.playerId, msg: payload.msg });
            console.log(`[${sessionId}] About to broadcast type 'log'. Sender ws instance provided?`, !!ws); // Log if 'ws' is defined
            broadcast(sessionId, { type: 'log', payload: { playerId: payload.playerId, msg: payload.msg } }, ws);
            console.log(`[${sessionId}] About to broadcast state after log. Sender ws instance provided?`, !!ws); // Log if 'ws' is defined
            broadcastState(sessionId, ws);
            logAction({ sessionId, roundNum: session.state.roundNum, playerId: ws.playerId, actionType: 'log', actionData: payload, gameInstance: session.gameInstance || '' });
            return;
        }

        // --- Pickup Choices Shown ---
        if (type === 'pickup-choices-shown') {
            console.log(`[${sessionId}] Leader presented pickup choices.`);
            // Broadcast to others
            broadcast(sessionId, { type: 'pickup-choices-shown', payload: payload }, ws);
            // No need to broadcast full state here
            return;
        }

        // --- Show Modal --- 
        if (type === 'show-modal') {
            console.log(`[${sessionId}] Leader triggered modal: ${payload.main}`);
            // Broadcast to others
            broadcast(sessionId, { type: 'show-modal', payload: payload }, ws);
            // No need to broadcast full state here
            return;
        }

        // --- Timer Update --- Remove this, leader no longer sends it
        /*
        if (type === 'timer-update') {
            // ... old logic ...
            return;
        }
        */
       // Ensure session-start payload includes end times
       // Ensure move/inject/inventory-update payloads include end times
       // broadcastState should naturally include end times if they are in session.state

       // Update stored state with end times if received in other messages
       if (type === 'move' || type === 'inject' || type === 'inventory-update') {
            if (payload.state) {
                session.state = { ...session.state, ...payload.state }; // This merges new state, including potential new roundEndTime
                console.log(`[${sessionId}] State updated via ${type}. New roundEndTime: ${session.state.roundEndTime}`);
            }
            session.log.push({ type: type, payload: payload, playerId: ws.playerId });
            broadcast(sessionId, { type: type, payload: payload }, ws); // Broadcast specific event
            broadcastState(sessionId, ws); // Broadcast full state update
            logAction({ sessionId, roundNum: session.state.roundNum, playerId: ws.playerId, actionType: type, actionData: payload, gameInstance: session.gameInstance || '' });
            return;
        }

        // --- Member Clicked ---
        if (type === 'member-clicked') {
            console.log(`[${sessionId}] Handling member-clicked. session.roles:`, session.roles);
            const leaderId = Object.entries(session.roles).find(([role, id]) => role === 'Charlie')?.[1];
            console.log(`[${sessionId}] Computed leaderId:`, leaderId);
            session.clients.forEach((client, idx) => {
                console.log(`[${sessionId}] Client[${idx}] playerId:`, client.playerId);
            });
            const leaderClient = session.clients.find(client => client.playerId === leaderId);
            if (leaderClient && leaderClient.readyState === WebSocket.OPEN) {
                leaderClient.send(JSON.stringify({
                    type: 'show-alert',
                    payload: { message: `Member ${payload.playerId} clicked the button!` }
                }));
                console.log(`[${sessionId}] Sent show-alert to leader (${leaderId})`);
            } else {
                console.log(`[${sessionId}] Could not find open leader client for leaderId:`, leaderId);
            }
            return;
        }

        // --- HELLO message from team member ---
        if (type === 'hello') {
            // Find the leader's playerId for this session
            const leaderId = Object.entries(session.roles).find(([role, id]) => role === 'Charlie')?.[1];
            // Find the leader's WebSocket connection
            const leaderClient = session.clients.find(client => client.playerId === leaderId);
            if (leaderClient && leaderClient.readyState === WebSocket.OPEN) {
                leaderClient.send(JSON.stringify({
                    type: 'hello',
                    payload: { from: payload.playerId }
                }));
                console.log(`[${sessionId}] Forwarded HELLO from ${payload.playerId} to leader (${leaderId})`);
            } else {
                console.log(`[${sessionId}] Could not find open leader client for leaderId:`, leaderId);
            }
            return;
        }

        // --- Check Reflections (Triggered by Leader at Round End) ---
         /* COMMENTED OUT FOR SIMPLIFICATION
        if (type === 'check-reflections') {
            const { roundNumToCheck } = payload;
            console.log(`[${sessionId}] Leader triggered check-reflections for round ${roundNumToCheck}`);
            
            if (session.penaltyAppliedForRound[roundNumToCheck]) {
                 console.log(`[${sessionId}] Penalty already applied for round ${roundNumToCheck}, skipping check.`);
                 broadcastState(sessionId); // Still broadcast state for round advance
                 return;
            }

            const reflectionsForRound = session.reflections[roundNumToCheck] || {};
            const submittedPlayerIds = Object.keys(reflectionsForRound);
            const expectedPlayerIds = session.clients.map(client => client.playerId).filter(Boolean);
            console.log(`[${sessionId}] Checking reflections. Expected: ${expectedPlayerIds.join(', ')}. Submitted: ${submittedPlayerIds.join(', ')}`);
            
            let allSubmitted = true;
            for (const expectedId of expectedPlayerIds) {
                if (!submittedPlayerIds.includes(expectedId)) {
                    allSubmitted = false;
                    console.log(`[${sessionId}] Reflection missing for player ${expectedId} in round ${roundNumToCheck}.`);
                    break;
                }
            }

            if (!allSubmitted) {
                console.log(`[${sessionId}] Not all reflections submitted for round ${roundNumToCheck}. Applying penalty.`);
                let lostItem = null;
                const inv = session.state.inventory;
                for (const code of Object.keys(inv)) {
                    if (inv[code] > 0) {
                        inv[code]--;
                        lostItem = code;
                        break;
                    }
                }
                let reason = `Not all reflections submitted for round ${roundNumToCheck}.`;
                if (lostItem) {
                    console.log(`[${sessionId}] Penalty: Lost 1 ${lostItem}`);
                } else {
                    console.log(`[${sessionId}] Penalty: No item to lose.`);
                }
                session.penaltyAppliedForRound[roundNumToCheck] = true;
                session.clients.forEach(client => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({
                            type: 'reflection-penalty',
                            payload: { itemCode: lostItem, reason, inventory: { ...inv } }
                        }));
                    }
                });
            } else {
                 console.log(`[${sessionId}] All reflections submitted for round ${roundNumToCheck}. No penalty.`);
            }
            
            broadcastState(sessionId); 
            return;
        }
        */

        // --- Reset session on leader request ---
        if (type === 'reset-session') {
            sessions[sessionId] = createSession(sessionId);
            console.log(`[${sessionId}] Session reset by ${payload.playerId}`);
            broadcast(sessionId, { type: 'session-reset' });
            return;
        }
    });

    ws.on('close', function() {
        const sessionId = ws.sessionId || 'UnknownSession';
        const playerId = ws.playerId || 'UnknownPlayer';
        console.log(`[${new Date().toISOString()}] Client ${playerId} disconnected from session ${sessionId}`);
        // Remove from session
        if (ws.sessionId && sessions[ws.sessionId]) {
            sessions[ws.sessionId].clients = sessions[ws.sessionId].clients.filter(client => client !== ws);
             console.log(`[${ws.sessionId}] Client removed. Remaining clients: ${sessions[ws.sessionId].clients.length}`);
        }
    });

     ws.onerror = function(error) {
        console.error(`[${new Date().toISOString()}] WebSocket error for client ${ws.playerId || 'Unknown'}:`, error);
    };
});

function broadcast(sessionId, msg, excludeClient) {
    const session = sessions[sessionId];
    if (!session) { console.log(`[${sessionId}] Broadcast ERR: Session not found`); return; }
    const excludeId = excludeClient ? excludeClient.playerId || 'Unknown' : 'None';
    console.log(`[${sessionId}] BROADCAST START: type='${msg.type}', excludeClient provided? ${!!excludeClient}. Excluding: ${excludeId}`);
    let sentCount = 0;
    session.clients.forEach((client, index) => {
        const targetId = client.playerId || 'Unknown';
        const isExcluded = client === excludeClient;
        console.log(`  -> Checking client ${index} (${targetId}): isExcluded=${isExcluded}, readyState=${client.readyState}`);
        if (!isExcluded && client.readyState === WebSocket.OPEN) {
            console.log(`     SENDING to client ${index} (${targetId})`);
            client.send(JSON.stringify(msg));
            sentCount++;
         } else if (isExcluded) {
             console.log(`     SKIPPING excluded client ${index} (${targetId})`);
        } else {
             console.log(`     SKIPPING client ${index} (${targetId}) (not OPEN)`);
         }
    });
     console.log(`[${sessionId}] BROADCAST END: type='${msg.type}'. Sent to ${sentCount} clients.`);
}

function broadcastState(sessionId, excludeClient) {
    const session = sessions[sessionId];
    if (!session) { console.log(`[${sessionId}] BroadcastState ERR: Session not found`); return; }
    const excludeId = excludeClient ? excludeClient.playerId || 'Unknown' : 'None';
    console.log(`[${sessionId}] BROADCAST STATE START: excludeClient provided? ${!!excludeClient}. Excluding: ${excludeId}`);
    let sentCount = 0;
    const stateMsg = {
        type: 'state-update',
        payload: {
            state: session.state,
            roles: session.roles,
            log: session.log,
            reflections: session.reflections
        }
    };
    session.clients.forEach((client, index) => {
        const targetId = client.playerId || 'Unknown';
        const isExcluded = client === excludeClient;
        console.log(`  -> Checking client ${index} (${targetId}): isExcluded=${isExcluded}, readyState=${client.readyState}`);
        if (!isExcluded && client.readyState === WebSocket.OPEN) {
            console.log(`     SENDING state to client ${index} (${targetId})`);
            client.send(JSON.stringify(stateMsg));
            sentCount++;
         } else if (isExcluded) {
             console.log(`     SKIPPING excluded client ${index} (${targetId})`);
        } else {
             console.log(`     SKIPPING client ${index} (${targetId}) (not OPEN)`);
         }
    });
     console.log(`[${sessionId}] BROADCAST STATE END. Sent to ${sentCount} clients.`);
}

app.get('/api/actions', (req, res) => {
  const sessionId = req.query.session_id;
  let sql = 'SELECT * FROM actions';
  let params = [];
  if (sessionId) {
    sql += ' WHERE session_id = ?';
    params.push(sessionId);
  }
  sql += ' ORDER BY timestamp ASC';
  const { db } = require('./db');
  db.all(sql, params, (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
    } else {
      res.json(rows);
    }
  });
});  
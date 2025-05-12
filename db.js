const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Ensure data directory exists
const dataDir = process.env.PROJECT_DATA_DIR || path.join(__dirname, '.data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir);
}

const dbPath = path.join(dataDir, 'game.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS actions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT,
    round_num INTEGER,
    player_id TEXT,
    action_type TEXT,
    action_data TEXT,
    game_instance TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
});

function logAction({ sessionId, roundNum, playerId, actionType, actionData, gameInstance }) {
  db.run(
    `INSERT INTO actions (session_id, round_num, player_id, action_type, action_data, game_instance) VALUES (?, ?, ?, ?, ?, ?)` ,
    [sessionId, roundNum, playerId, actionType, JSON.stringify(actionData), gameInstance],
    (err) => {
      if (err) console.error('DB log error:', err);
    }
  );
}

module.exports = { logAction, db }; 
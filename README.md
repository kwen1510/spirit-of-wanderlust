# Spirit of Wanderlust Game

## Quick Start instructions

1. **Install Node.js** (if not already installed): https://nodejs.org/
2. **Open a terminal and navigate to the project directory:**
   ```bash
   cd path/to/Spirit_of_Wanderlust
   ```
3. **Install dependencies:**
   ```bash
   npm install
   ```
4. **Start the server:**
   ```bash
   npm start
   ```
   (Alternatively, for development, you can use `nodemon server.js` or `npx nodemon server.js` if not installed globally)
5. **Open your browser and go to:**
   [http://localhost:8080](http://localhost:8080)
6. **Follow the on-screen instructions to join a session and play!** (You'll start by selecting a Day, Group, and entering your Player Name).

---

## Description

Spirit of Wanderlust is a cooperative, web-based multiplayer game where players take on specific roles (Charlie - Leader, Wally - Team, Leo - Team, Luca - Team) to navigate a grid, gather resources (Spirit Ash 🔥, Moonwood 🌲, Storm-Iron ⚡, Coral Runes 🌀), and achieve objectives set by "Elder Chew". The game emphasizes teamwork, strategic movement (controlled by the Leader), and reflection on actions taken during timed rounds. All game activity is logged for later review and analysis.

## Features

*   Real-time multiplayer gameplay via WebSockets.
*   Distinct player roles with specific functions.
*   Grid-based map navigation.
*   Resource gathering and inventory management.
*   Timed game sessions and rounds.
*   In-game events ("Injects") that can affect inventory.
*   End-of-round reflection prompts for players.
*   Configurable game parameters (durations, items, prompts, etc.).
*   Persistent logging of all game actions to an SQLite database (`data/game.db`).
*   Web-based viewer (`actions-viewer.html`) to review past game sessions.

## Setup and Installation

To run the Spirit of Wanderlust game server locally:

1.  **Prerequisites:** Ensure you have Node.js and npm installed on your system.
2.  **Navigate to Directory:** Open your terminal or command prompt and navigate to the `Spirit_of_Wanderlust` directory:
    ```bash
    cd path/to/Spirit_of_Wanderlust
    ```
3.  **Install Dependencies:** Install the required Node.js packages:
    ```bash
    npm install
    ```
4.  **Start the Server:** Run the server application:
   ```bash
   npm start
   ```
   (Or use `node server.js`. For development, `nodemon server.js` is recommended for automatic restarts on file changes.)
5.  **Access the Game:** The server will start, typically listening on port 8080. Players can access the game by opening their web browser and navigating to `http://localhost:8080`.

## How to Play

1.  **Start Server:** Make sure the game server is running (see Setup).
2.  **Access Entry Page:** Each player navigates to `http://localhost:8080`.
3.  **Enter Session and Player Details:**
    *   Players will see a page (`index.html`) to select a "Day" (e.g., D1, D2, D3).
    *   Select a "Group" (e.g., G01, G02, dynamically populated based on `MAX_CONCURRENT_GROUPS` in `config/params.json`).
    *   Enter a unique "Player Name".
    *   Clicking "Next" submits these details and redirects to the role selection page with `sessionId` (Day + Group) and `playerId` (Player Name) as URL parameters. The `sessionId` is validated against `public/session-ids.json`.
4.  **Select Role:** Players choose one of the available roles: Charlie (Leader), Wally (Team), Leo (Team), or Luca (Team). Roles are unique per session. After selecting a role, a "Prologue" modal will appear with introductory text before redirecting to the respective dashboard.
5.  **Wait for Leader:** Team members (Wally, Leo, Luca) are redirected to the Team Dashboard and wait. If a team member attempts to refresh or close the page, a confirmation dialog ("Leave site? Changes you made may not be saved.") will appear.
6.  **Leader Starts Game:** The Leader (Charlie) is redirected to the Leader Dashboard. If the leader refreshes the page, they will be prompted to confirm if they want to reset the game. Only the Leader sees the game grid and can initiate the game by clicking the "Start Game" button.
7.  **Gameplay:**
    *   **Movement:** The Leader clicks cells on the grid to move the team. Movement is limited by steps per round.
    *   **Objectives:** Follow the instructions provided by "Elder Chew" displayed on the dashboard. These messages are now specific to each character (Charlie, Wally, Leo, Luca) and cycle per round.
    *   **Resources:** Moving onto certain cells may trigger resource pickups (Spirit Ash 🔥, Moonwood 🌲, Storm-Iron ⚡, Coral Runes 🌀) or inject events (potentially causing item loss).
    *   **Timers:** The game progresses in rounds with specific time limits for both the overall session and each round.
    *   **Inventory:** All players see the team's shared inventory.
    *   **Reflections:** At the end of each round (or when prompted), team members must submit reflections via the text area on their dashboard. Missing reflections can trigger penalties (item loss).
8.  **Game End:** The game ends when the total session time runs out or all rounds are completed.

## Configuration

Game parameters can be modified by editing the JSON files within the `config` and `public` directories.

1.  **Core Game Parameters (`config/params.json`):**
    *   `ROUND_COUNT`: Total number of rounds per game.
    *   `ROUND_DURATION_SEC`: Duration of each round in seconds.
    *   `SESSION_DURATION_SEC`: Total duration for the entire game session in seconds.
    *   `GRID_SIZE`: The dimension of the square game grid (e.g., 5 means 5x5).
    *   `MAX_STEPS_PER_ROUND`: Maximum number of cells the Leader can move the team within a single round.
    *   `MAX_CONCURRENT_GROUPS`: Defines the number of groups (e.g., G01, G02, ...) available for selection on the entry page.
    *   `ITEMS`: Array defining the gatherable items. Example: `{"code": "A", "name": "Spirit Ash", "emoji": "🔥"}`. Updated to reflect new items.
    *   `ROLES`: Array defining the available player roles. Example: `{"id": "charlie", "name": "Charlie", "type": "Leader"}`. Updated to reflect new character names and their roles.
    *   `INJECT_*_PERCENTAGE`: Probabilities for random events occurring.
    *   `PICKUP_*_QTY`: Amount of resources gained during pickups.
    *   `TEXT_TEMPLATES`: Customizable text strings used for various game messages and logs.
    *   Note: The `DB_PATH` field in this file is not used; the database is always stored at `data/game.db`.

2.  **Valid Session IDs (`public/session-ids.json`):**
    *   This file contains a simple JSON array of strings.
    *   Edit this list to define which Session IDs are considered valid when players join.

3.  **Game Text and Prompts (`public/text/`):**
    *   `role-introductions.json`: Contains introductory text for each character role (keyed by lowercase character name: charlie, wally, leo, luca).
    *   `elder-chew-messages.json`: Contains the objective/prompt text given by Elder Chew for each character, for each round (keyed by lowercase character name: charlie, wally, leo, luca). This file replaced the individual `elder-chew-X.json` files.
    *   Other files in this directory might contain role-specific prompts or dialogues used during the game.
    *   Only the `public/text/` directory is used for serving these files to the browser.

*Remember to restart the Node.js server (`npm start` or `node server.js`) after making changes to `config/params.json` for them to take effect.* Changes to files in `public/` (like `session-ids.json` or files in `public/text/`) are typically reflected immediately on browser refresh.

## Admin Console

The Spirit of Wanderlust Game includes an administrative console that allows you to edit game configurations through a user-friendly web interface, eliminating the need to manually edit JSON files.

### Accessing the Admin Console

1. **Make sure the game server is running** (see Setup instructions above).
2. **Open your browser and navigate to:**
   ```
   http://localhost:8080/admin
   ```
3. This will directly open the admin console interface with full access to game configuration.

### Features of the Admin Console

The admin console provides an intuitive interface to modify all game parameters:

* **General Settings:** Modify core game parameters like round count, durations, grid size, etc.
* **Game Items:** Add, edit, or remove resource items that players can collect.
* **Text Templates:** Customize all in-game messages and prompts.
* **Inject Events:** Create and edit random event stories that occur during gameplay.
* **Raw JSON:** For advanced users, directly edit the full configuration in JSON format.

### Backup System

When saving configuration changes through the admin console, the system automatically creates a backup of the previous configuration in the `config` directory with a timestamp in the filename (e.g., `params-backup-2023-09-15T12-45-30-000Z.json`). This allows you to restore previous configurations if needed.

## Endpoints

Here are the primary URLs and connection points for the game:

*   **Player Entry Point:** `http://localhost:8080/`
    *   Serves the `public/index.html` page. Players select Day, Group, and enter Player Name.
    *   On submission, redirects to `public/role-select.html` with session and player info as URL parameters.
*   **Role Selection:** `http://localhost:8080/role-select.html` (Accessed via `index.html`)
    *   Players select their character (Charlie, Wally, Leo, or Luca).
    *   Client-side JavaScript handles redirection to the appropriate dashboard (`leader-dashboard.html` or `team-dashboard.html`) after role selection and showing a prologue.
*   **Leader Dashboard:** `http://localhost:8080/leader-dashboard.html` (Accessed via redirection)
    *   Interface for the Leader player (Charlie), showing the map, inventory, logs, and controls.
*   **Team Dashboard:** `http://localhost:8080/team-dashboard.html` (Accessed via redirection)
    *   Interface for Team players (Wally, Leo, Luca), showing inventory, logs, objectives, and the reflection submission area.
*   **Actions Viewer:** `http://localhost:8080/actions-viewer.html` or `http://localhost:8080/results`
    *   A separate tool to view detailed logs and summaries of past game sessions stored in the database.
*   **Admin Console:** `http://localhost:8080/admin`
    *   Administrative interface to edit game configurations.
*   **WebSocket:** `ws://localhost:8080`
    *   The core communication channel for real-time game state updates between the server and all connected players' dashboards.
*   **API (Primarily for internal use by the frontend):**
    *   `GET /api/game-config`: Provides the contents of `config/params.json` to the client.
    *   `POST /api/claim-role`: Used by `role-select.html` to register a player's role choice with the server.
    *   `GET /api/actions`: Used by `actions-viewer.html` to fetch logged game data from the database.
    *   `POST /api/save-config`: Used by the admin console to save configuration changes.
    *   `GET /session-ids.json`: Used by `public/index.html` (indirectly via `role-select.js` logic which is now initiated after `index.html`) to validate the constructed Session ID.
    *   `GET /text/...`: Used by dashboards to load role introductions (`role-introductions.json`), Elder Chew prompts (`elder-chew-messages.json`), etc. (served from `public/text/`).

## Data Storage

All game actions, player reflections, and significant events are logged chronologically to an SQLite database file located at `data/game.db`. This allows for persistent storage and later analysis of gameplay via the Actions Viewer.

## Troubleshooting

If you encounter issues with the game, here are some common problems and their solutions:

1. **WebSocket Connection Issues**: If team members cannot connect or dashboards don't sync, check:
    *   All players started from `http://localhost:8080/`, correctly entered their Day, Group, and Player Name.
    *   The constructed Session ID (Day + Group) matches an entry in `public/session-ids.json`.
    *   The server is running properly (check terminal for errors).

2. **UI Problems**:
   - **Modal Windows Not Closing**: Team dashboard has been updated to ensure all modal windows have functional "OK" buttons.
   - **Reflection Input Not Working**: Recent fixes ensure that reflection textareas are properly enabled when needed.
   - **Incorrect Player/Item Names or Emojis**: Ensure `config/params.json`, `public/text/elder-chew-messages.json`, `public/text/role-introductions.json`, and relevant HTML/JS files have been updated with the latest character (Charlie, Wally, Leo, Luca) and item (Spirit Ash 🔥, Moonwood 🌲, Storm-Iron ⚡, Coral Runes 🌀) details.

3. **Penalty System Issues**: If reflection penalties don't seem to be working correctly, verify that the leader dashboard is showing the correct inventory changes after penalties are applied. The server logic in `server.js` handles penalty application.

4. **JavaScript Loading Errors**: If you see "Uncaught SyntaxError: Unexpected token '<'" errors in the console:
   - Ensure proper MIME type specifications in server.js
   - Try clearing your browser cache or using incognito mode
   - Check that all script tags in HTML files have correct paths

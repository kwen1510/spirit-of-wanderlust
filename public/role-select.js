// role-select.js
// localStorage.clear(); // Remove this line, allow storage to persist
let config = null;

async function loadConfig() {
  const response = await fetch('/api/game-config');
  config = await response.json();
  if (!config || !config.ROLES) {
    console.error('Failed to load or invalid config structure:', config);
    throw new Error('Configuration error.');
  }
  return config;
}

// Removed promptForSessionId and promptForPlayerId functions

const wsProtocol = window.location.protocol === "https:" ? "wss" : "ws";
const wsHost = window.location.host;
// WebSocket connection is initiated after role claim, so it's not needed here globally yet.

// Initialize the page
async function initialize() {
  let roles = [];
  const roleBtns = document.querySelectorAll('.role-btn');
  const sessionIdDisplay = document.getElementById('session-id-display');
  const playerIdDisplay = document.getElementById('player-id-display');

  try {
    await loadConfig();
    roles = config.ROLES;

    // Get session ID and player ID from URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const sessionId = urlParams.get('sessionId');
    const playerId = urlParams.get('playerId');

    if (!sessionId || !playerId) {
      alert('Session ID or Player ID is missing. Please start from the session selection page.');
      // Optionally redirect back to index.html
      // window.location.href = 'index.html';
      throw new Error("Missing session/player ID from URL.");
    }

    // Validate sessionId against session-ids.json
    const response = await fetch('/session-ids.json');
    if (!response.ok) {
      throw new Error(`Failed to load session IDs: ${response.statusText}`);
    }
    const validSessionIds = await response.json();
    if (!validSessionIds.includes(sessionId)) {
      alert(`Invalid Session ID: ${sessionId}. Please select a valid session from the previous page or contact the administrator.`);
      // window.location.href = 'index.html'; // Redirect back
      throw new Error("Invalid Session ID.");
    }

    // Update the UI with session and player IDs
    if(sessionIdDisplay) sessionIdDisplay.textContent = sessionId;
    if(playerIdDisplay) playerIdDisplay.textContent = playerId;

    // Set up role buttons
    roleBtns.forEach(btn => {
      btn.onclick = async function() {
        const role = btn.dataset.role;
        if (!roles.includes(role)) {
            alert(`Invalid role selected: ${role}`);
            return;
        }
        const buttonText = btn.textContent;
        btn.textContent = `Selecting...`;
        btn.disabled = true; // Disable button while processing

        try {
          const res = await fetch('/api/claim-role', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId, playerId, role })
          });

          if (!res.ok) {
            // Attempt to parse error message from server if JSON
            let errorMsg = `Server error: ${res.statusText}`;
            try {
                const errorData = await res.json();
                if (errorData && errorData.message) errorMsg = errorData.message;
            } catch (e) { /* Ignore if not JSON */ }
            throw new Error(errorMsg);
          }

          const data = await res.json();

          if (data.success) {
            btn.textContent = `✓ ${role}`;
            localStorage.setItem('sessionId', sessionId);
            localStorage.setItem('playerId', playerId);
            localStorage.setItem('role', role);

            // Disable other buttons
            roleBtns.forEach(otherBtn => {
              if (otherBtn !== btn) {
                otherBtn.disabled = true;
                otherBtn.classList.add('taken'); // Style as taken
              }
            });

            // Show Prologue Modal
            showPrologueModal(() => {
              // Redirect after modal is closed
              const params = new URLSearchParams();
              params.append('sessionId', sessionId);
              params.append('playerId', playerId);
              params.append('role', role);

              if (role === config.ROLES[0]) { // Assuming first role in config is leader
                window.location.href = `leader-dashboard.html?${params.toString()}`;
              } else {
                window.location.href = `team-dashboard.html?${params.toString()}`;
              }
            });
          } else {
            btn.textContent = buttonText; // Reset button text
            btn.disabled = false; // Re-enable button
            alert(`Failed to select role: ${data.message || 'Role might be taken or player already claimed.'}`);
          }
        } catch (error) {
          console.error('Error claiming role:', error);
          btn.textContent = buttonText; // Reset button text
          btn.disabled = false; // Re-enable button
          alert(`Error: ${error.message}. Please check connection and try again.`);
        }
      };
    });
  } catch (error) {
    console.error('Initialization error:', error);
    alert(`Error: ${error.message}. Please refresh to try again, or return to the session selection page.`);
    // Optionally disable role buttons or show a persistent error message in the UI
    roleBtns.forEach(btn => btn.disabled = true);
  }
}

// Start the initialization process when the page loads
document.addEventListener('DOMContentLoaded', initialize);

// Function to show the Prologue Modal
function showPrologueModal(onCloseCallback) {
  const modalId = 'prologue-modal';
  // Remove existing modal if any to prevent duplicates
  const existingModal = document.getElementById(modalId);
  if (existingModal) {
    existingModal.remove();
  }

  const modal = document.createElement('div');
  modal.id = modalId;
  modal.style.position = 'fixed';
  modal.style.left = '0';
  modal.style.top = '0';
  modal.style.width = '100%';
  modal.style.height = '100%';
  modal.style.backgroundColor = 'rgba(0, 0, 0, 0.4)'; // Lighter overlay
  modal.style.display = 'flex';
  modal.style.alignItems = 'center';
  modal.style.justifyContent = 'center';
  modal.style.zIndex = '2000'; // Ensure it's on top

  const prologueText = `Hear me, young leaders of five proud tribes—yet only four now stand upon this sand.<br><br>Divide the burden, share the risk. When one of you falters, three must lift. When doubt darkens one heart, the other hearts must blaze brighter. For the sea shows no mercy to the lone or the proud, and the island will keep all who linger.<br><br>Fail to weave your strengths, and the jungle vines will grow through your dreams until you call this place a grave. Succeed, and the tide itself will carry you to the skies where dragons roam—and to the one who waits.<br><br>Choose unity. Choose escape. Or choose to watch the sun set on your hopes for all time.`;

  modal.innerHTML = `
    <div style="background: #fff; color: #222; padding: 2rem; border-radius: 18px; width: 90%; max-width: 600px; box-shadow: 0 2px 12px rgba(0,0,0,0.1); border: 1.5px solid #e0e0e0; display: flex; flex-direction: column; max-height: 80vh;">
      <h2 style="color: #222; text-align: center; margin-top: 0; margin-bottom: 1.5rem; font-size: 1.8rem;">Prologue</h2>
      <div style="font-size: 1rem; line-height: 1.6; margin-bottom: 2rem; overflow-y: auto; flex-grow: 1; text-align: left; padding: 1rem; background: #f7f7f7; border-radius: 12px;">
        ${prologueText.replace(/\n/g, '<br><br>')}
      </div>
      <button id="prologue-ok-btn" style="font-size: 1.1rem; padding: 0.8rem 2rem; border-radius: 18px; border: none; background: #e0e0e0; color: #222; cursor: pointer; transition: background 0.3s; align-self: center; font-weight: 600;">OK</button>
    </div>
  `;

  document.body.appendChild(modal);

  document.getElementById('prologue-ok-btn').addEventListener('click', () => {
    modal.remove();
    if (typeof onCloseCallback === 'function') {
      onCloseCallback();
    }
  });
} 
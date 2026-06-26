// hub_multiplayer.js

let liveDamaUnsubscribe = null;
let liveDotsUnsubscribe = null;
let damaRooms = [];
let dotsRooms = [];

function loadLiveRooms() {
    const listContainer = document.getElementById('liveRoomsList');
    if (!listContainer) return;

    // Check if firestore is available (set by firebaseSDK.js)
    if (typeof firestore === 'undefined' || !firestore) {
        listContainer.innerHTML = `<div style="text-align:center; color:#ff6b6b; padding: 20px;"><i class="fas fa-exclamation-triangle" style="margin-right:8px;"></i>${window.getTranslation('hub_db_error', 'Database not connected. Cannot fetch live rooms.')}</div>`;
        return;
    }

    listContainer.innerHTML = `<div style="text-align:center; color:#ccc; padding: 20px;"><i class="fas fa-spinner fa-spin" style="margin-right:8px;"></i>${window.getTranslation('hub_fetching', 'Fetching live games...')}</div>`;

    if (liveDamaUnsubscribe) {
        liveDamaUnsubscribe();
        liveDamaUnsubscribe = null;
    }
    if (liveDotsUnsubscribe) {
        liveDotsUnsubscribe();
        liveDotsUnsubscribe = null;
    }

    damaRooms = [];
    dotsRooms = [];

    function updateHubUI() {
        listContainer.innerHTML = '';
        const allRooms = [...damaRooms, ...dotsRooms];
        allRooms.sort((a, b) => b.createdAt - a.createdAt);

        let activeRoomsCount = 0;
        allRooms.forEach(room => {
            // Skip fully finished games
            if (room.gameOver) return;

            const isDots = room.roomId.startsWith('dots_');
            const gameTitle = isDots ? window.getTranslation('games_dots_and_boxes_title', 'Dots and Boxes') : window.getTranslation('hub_game_title', 'Dama Game');
            const iconClass = isDots ? 'fas fa-th' : 'fas fa-chess-board';

            let status = window.getTranslation('hub_game_status_waiting', 'Waiting for player');
            let statusColor = '#4CAF50';
            let actionBtn = `<button onclick="joinRoomHub('${room.roomId}')" style="background:#4CAF50; color:white; border:none; padding:8px 15px; border-radius:5px; cursor:pointer;"><i class="fas fa-sign-in-alt" style="margin-right:5px;"></i>${window.getTranslation('hub_action_join', 'Join')}</button>`;

            if (room.gameStarted) {
                // Live game in progress — show spectate button
                status = window.getTranslation('hub_game_status_live', 'Live Game');
                statusColor = '#f44336';
                actionBtn = `<button onclick="viewLiveGame('${room.roomId}')" style="background:#2196F3; color:white; border:none; padding:8px 15px; border-radius:5px; cursor:pointer;"><i class="fas fa-eye" style="margin-right:5px;"></i>${window.getTranslation('hub_action_view', 'View')}</button>`;
            } else if (room.creatorId) {
                // Waiting for a player to join (joinerId may or may not be set)
                if (room.joinerId) {
                    // Both players matched but game not started yet
                    status = window.getTranslation('hub_game_status_starting', 'Starting...');
                    statusColor = '#ff9800';
                    actionBtn = `<button disabled style="background:#555; color:#aaa; border:none; padding:8px 15px; border-radius:5px; cursor:not-allowed;"><i class="fas fa-hourglass-half" style="margin-right:5px;"></i>${window.getTranslation('hub_game_status_starting', 'Starting...')}</button>`;
                }
            } else {
                // No creatorId — incomplete/abandoned room, skip
                return;
            }

            activeRoomsCount++;

            const card = document.createElement('div');
            card.style.cssText = 'background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.15); border-radius: 12px; padding: 15px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; backdrop-filter: blur(15px); -webkit-backdrop-filter: blur(15px); box-shadow: 0 8px 32px rgba(0,0,0,0.2);';
            card.innerHTML = `
                <div style="display: flex; flex-direction: column;">
                    <span style="color: white; font-size: 1.1rem; font-weight: bold; margin-bottom: 5px;">
                        <i class="${iconClass}" style="color: #ffd966; margin-right: 8px;"></i>${gameTitle}
                    </span>
                    <span style="color: #ccc; font-size: 0.9rem;">
                        ${window.getTranslation('hub_creator', 'Creator: ')}<strong>${room.creatorUsername || 'Unknown'}</strong>
                    </span>
                    <span style="color: ${statusColor}; font-size: 0.8rem; margin-top: 5px;">
                        <i class="fas fa-circle" style="font-size: 0.6rem; margin-right: 4px;"></i>${status}
                    </span>
                </div>
                <div>
                    ${actionBtn}
                </div>
            `;

            listContainer.appendChild(card);
        });

        if (activeRoomsCount === 0) {
            listContainer.innerHTML = `<div style="text-align:center; color:#ccc; padding: 20px;"><i class="fas fa-moon" style="margin-right:8px;"></i>${window.getTranslation('hub_no_rooms', 'No live games available at the moment.')}</div>`;
        }
    }

    liveDamaUnsubscribe = firestore.collection('dama_rooms')
        .orderBy('createdAt', 'desc')
        .limit(15)
        .onSnapshot((snapshot) => {
            damaRooms = [];
            snapshot.forEach(doc => damaRooms.push(doc.data()));
            updateHubUI();
        }, (error) => {
            console.error("Error fetching Dama live rooms: ", error);
        });

    liveDotsUnsubscribe = firestore.collection('dots_and_boxes_rooms')
        .orderBy('createdAt', 'desc')
        .limit(15)
        .onSnapshot((snapshot) => {
            dotsRooms = [];
            snapshot.forEach(doc => dotsRooms.push(doc.data()));
            updateHubUI();
        }, (error) => {
            console.error("Error fetching Dots live rooms: ", error);
        });
}

async function joinRoomHub(roomId) {
    const isDots = roomId.startsWith('dots_');
    if (isDots) {
        showSection('dots_and_boxes');
        if (typeof showDotsMultiplayerModeScreen === 'function') {
            showDotsMultiplayerModeScreen();
        } else if (typeof showDotsScreen === 'function') {
            showDotsScreen('dots_multiplayerModeScreen');
        }

        const input = document.getElementById('dots_joinRoomId');
        if (input) input.value = roomId;

        await new Promise(resolve => setTimeout(resolve, 150));

        if (typeof window.dotsMultiplayer !== 'undefined' && typeof window.dotsMultiplayer.joinRoom === 'function') {
            if (typeof showDotsScreen === 'function') {
                showDotsScreen('dots_waitingScreen');
            }
            const joined = await window.dotsMultiplayer.joinRoom(roomId);
            if (joined) {
                const colorSpan = document.getElementById('dots_playerColorSpan');
                if (colorSpan) {
                    colorSpan.textContent = window.getTranslation(window.dotsMultiplayer.playerColor.toLowerCase() === 'white' ? 'dama_color_white' : 'dama_color_black', window.dotsMultiplayer.playerColor);
                }
            } else {
                if (typeof showDotsScreen === 'function') {
                    showDotsScreen('dots_multiplayerModeScreen');
                }
            }
        }
    } else {
        showSection('dama');
        if (typeof showMultiplayerModeScreen === 'function') {
            showMultiplayerModeScreen();
        } else if (typeof showScreen === 'function') {
            showScreen('multiplayerModeScreen');
        }

        const input = document.getElementById('joinRoomId');
        if (input) input.value = roomId;

        await new Promise(resolve => setTimeout(resolve, 50));

        if (typeof joinRoom === 'function') {
            const joined = await joinRoom(roomId);
            if (joined) {
                const colorSpan = document.getElementById('playerColorSpan');
                if (colorSpan) {
                    colorSpan.textContent = window.getTranslation(multiplayer.playerColor.toLowerCase() === 'white' ? 'dama_color_white' : 'dama_color_black', multiplayer.playerColor);
                }
                setTimeout(() => {
                    if (!multiplayer.gameStarted && typeof showScreen === 'function') {
                        showScreen('waitingScreen');
                    }
                }, 150);
            }
        }
    }
}

function viewLiveGame(roomId) {
    const isDots = roomId.startsWith('dots_');
    if (isDots) {
        showSection('dots_and_boxes');
        if (typeof window.dotsMultiplayer !== 'undefined' && typeof window.dotsMultiplayer.spectateRoom === 'function') {
            window.dotsMultiplayer.spectateRoom(roomId);
        } else {
            console.error("spectateRoom is not implemented in dots_multiplayer");
        }
    } else {
        showSection('dama');
        if (typeof spectateRoom === 'function') {
            spectateRoom(roomId);
        } else {
            console.error("spectateRoom is not implemented in multiplayer.js");
        }
    }
}

// Background listener for available rooms to update the home page badge
let damaBadgeUnsubscribe = null;
let dotsBadgeUnsubscribe = null;
let damaBadgeActive = false;
let dotsBadgeActive = false;

function setupMultiplayerBadgeListener() {
    if (typeof firestore === 'undefined' || !firestore) {
        // Retry setup if Firebase is not ready yet
        setTimeout(setupMultiplayerBadgeListener, 1000);
        return;
    }

    if (damaBadgeUnsubscribe) { damaBadgeUnsubscribe(); damaBadgeUnsubscribe = null; }
    if (dotsBadgeUnsubscribe) { dotsBadgeUnsubscribe(); dotsBadgeUnsubscribe = null; }

    function updateBadgeUI() {
        const badge = document.getElementById('multiplayerBtnBadge');
        if (badge) {
            if (damaBadgeActive || dotsBadgeActive) {
                badge.classList.remove('hidden');
            } else {
                badge.classList.add('hidden');
            }
        }
    }

    damaBadgeUnsubscribe = firestore.collection('dama_rooms')
        .onSnapshot((snapshot) => {
            damaBadgeActive = false;
            snapshot.forEach(doc => {
                const room = doc.data();
                if (!room.gameOver && (room.gameStarted || room.creatorId)) {
                    damaBadgeActive = true;
                }
            });
            updateBadgeUI();
        }, (error) => {
            console.error("Error listening to Dama rooms for badge: ", error);
        });

    dotsBadgeUnsubscribe = firestore.collection('dots_and_boxes_rooms')
        .onSnapshot((snapshot) => {
            dotsBadgeActive = false;
            snapshot.forEach(doc => {
                const room = doc.data();
                if (!room.gameOver && (room.gameStarted || room.creatorId)) {
                    dotsBadgeActive = true;
                }
            });
            updateBadgeUI();
        }, (error) => {
            console.error("Error listening to Dots rooms for badge: ", error);
        });
}

// Start listener after DOM content loads
document.addEventListener('DOMContentLoaded', () => {
    // Wait slightly to let firebase SDK load
    setTimeout(setupMultiplayerBadgeListener, 1500);
});

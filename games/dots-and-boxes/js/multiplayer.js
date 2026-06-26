/* =====================================================
   DOTS AND BOXES (پێنج پێنج) - MULTIPLAYER NETCODE MODULE
   ===================================================== */

(function () {
    // Unique ID helper
    function generatePlayerId() {
        return 'player_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
    }

    // Avatar/profile helper (mirrors dama multiplayer)
    function getDotsAvatarFile(username) {
        if (!username) return 'avatar-default.png';
        try {
            const pd = JSON.parse(localStorage.getItem('playerData_' + username) || 'null');
            if (pd && pd.avatar) return pd.avatar;
        } catch (e) {}
        return 'avatar-default.png';
    }

    function getDotsProfileLevel(username) {
        if (!username) return 1;
        try {
            const pd = JSON.parse(localStorage.getItem('playerData_' + username) || 'null');
            const score = pd?.stats?.totalScore || 0;
            if (typeof calculateLevelFromScore === 'function') return calculateLevelFromScore(score).level;
            return Math.max(1, Math.floor(score / 100) + 1);
        } catch (e) { return 1; }
    }

    // Build the rich VS banner HTML matching Dama's design
    function buildVsBannerHTML(p1Name, p1Avatar, p1Level, p1ProfileUsername, p2Name, p2Avatar, p2Level, p2ProfileUsername) {
        const imgStyle = 'width:50px;height:50px;border-radius:50%;object-fit:cover;border:2px solid #ffd966;box-shadow:0 4px 10px rgba(0,0,0,0.3);';
        const cardStyle = 'display:flex;align-items:center;gap:8px;background:rgba(255,255,255,0.1);padding:5px 12px;border-radius:20px;backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,0.2);cursor:pointer;';
        return `
            <div style="${cardStyle}" onclick="if(typeof showGlobalProfile==='function'&&'${p1ProfileUsername}')showGlobalProfile('${p1ProfileUsername}')">
                <img src="assets/images/${p1Avatar}" onerror="this.src='assets/images/avatar-default.png'" style="${imgStyle}">
                <div style="display:flex;flex-direction:column;line-height:1.2;">
                    <span style="color:#fff;font-size:14px;font-weight:bold;">${p1Name}</span>
                    <span style="color:#ccc;font-size:11px;">Lv ${p1Level}</span>
                </div>
            </div>
            <div style="color:#ffd966;font-weight:bold;font-size:20px;">${window.getTranslation('vs_label','VS')}</div>
            <div style="${cardStyle}" onclick="if(typeof showGlobalProfile==='function'&&'${p2ProfileUsername}')showGlobalProfile('${p2ProfileUsername}')">
                <div style="display:flex;flex-direction:column;line-height:1.2;text-align:right;">
                    <span style="color:#fff;font-size:14px;font-weight:bold;">${p2Name}</span>
                    <span style="color:#ccc;font-size:11px;">Lv ${p2Level}</span>
                </div>
                <img src="assets/images/${p2Avatar}" onerror="this.src='assets/images/avatar-default.png'" style="${imgStyle}">
            </div>
        `;
    }

    let firebaseAvailable = false;
    checkFirestoreAvailability();

    async function checkFirestoreAvailability() {
        try {
            if (typeof firebase === 'undefined' || typeof firestore === 'undefined') {
                throw new Error('Firebase is not initialized');
            }
            const roomsQuery = firestore.collection('dots_and_boxes_rooms').limit(1);
            await roomsQuery.get();
            firebaseAvailable = true;
            console.log('[Dots Multiplayer] Firestore connection successful');
            // Start room cleanup when Firestore becomes available
            runInitialCleanup();
            startRoomCleanupSchedule();
        } catch (error) {
            firebaseAvailable = false;
            console.warn('[Dots Multiplayer] Firestore not available:', error.message);
        }
    }

    // Periodic cleanup for inactive rooms (5 minutes inactivity threshold)
    const INACTIVITY_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
    let cleanupInterval = null;

    async function cleanupInactiveRooms() {
        if (!firebaseAvailable) return;

        try {
            const now = Date.now();
            const cutoffTime = now - INACTIVITY_THRESHOLD_MS;

            // Query for all waiting rooms (Firestore requires filtering on client for compound queries)
            const waitingRooms = await firestore.collection('dots_and_boxes_rooms')
                .where('status', '==', 'waiting')
                .limit(50)
                .get();

            // Filter on client side and delete inactive rooms
            for (const doc of waitingRooms.docs) {
                const roomData = doc.data();
                if (roomData.lastActivity && roomData.lastActivity < cutoffTime) {
                    try {
                        await doc.ref.delete();
                        console.log(`[Dots Cleanup] Deleted inactive waiting room: ${doc.id}`);
                    } catch (e) {
                        console.error(`[Dots Cleanup] Failed to delete room ${doc.id}:`, e);
                    }
                }
            }

            // Also query for rooms in playing status (more lenient - 10 minute threshold)
            const PLAYING_INACTIVITY_THRESHOLD_MS = 10 * 60 * 1000;
            const playingCutoffTime = now - PLAYING_INACTIVITY_THRESHOLD_MS;

            const playingRooms = await firestore.collection('dots_and_boxes_rooms')
                .where('status', '==', 'playing')
                .limit(50)
                .get();

            // Filter on client side and delete abandoned playing rooms
            for (const doc of playingRooms.docs) {
                const roomData = doc.data();
                if (roomData.lastActivity && roomData.lastActivity < playingCutoffTime) {
                    try {
                        await doc.ref.delete();
                        console.log(`[Dots Cleanup] Deleted abandoned playing room: ${doc.id}`);
                    } catch (e) {
                        console.error(`[Dots Cleanup] Failed to delete room ${doc.id}:`, e);
                    }
                }
            }

            // Also clean up finished rooms that are older than 30 minutes
            const FINISHED_CLEANUP_THRESHOLD_MS = 30 * 60 * 1000;
            const finishedCutoffTime = now - FINISHED_CLEANUP_THRESHOLD_MS;

            const finishedRooms = await firestore.collection('dots_and_boxes_rooms')
                .where('status', '==', 'finished')
                .limit(50)
                .get();

            // Filter on client side and delete old finished rooms
            for (const doc of finishedRooms.docs) {
                const roomData = doc.data();
                if (roomData.lastActivity && roomData.lastActivity < finishedCutoffTime) {
                    try {
                        await doc.ref.delete();
                        console.log(`[Dots Cleanup] Deleted old finished room: ${doc.id}`);
                    } catch (e) {
                        console.error(`[Dots Cleanup] Failed to delete room ${doc.id}:`, e);
                    }
                }
            }

        } catch (error) {
            console.error('[Dots Cleanup] Error during room cleanup:', error);
        }
    }

    function startRoomCleanupSchedule() {
        if (cleanupInterval) return; // Already running
        // Run cleanup every 2 minutes
        cleanupInterval = setInterval(cleanupInactiveRooms, 2 * 60 * 1000);
        console.log('[Dots Multiplayer] Room cleanup scheduler started');
    }

    function stopRoomCleanupSchedule() {
        if (cleanupInterval) {
            clearInterval(cleanupInterval);
            cleanupInterval = null;
            console.log('[Dots Multiplayer] Room cleanup scheduler stopped');
        }
    }

    // Run initial cleanup on page load
    async function runInitialCleanup() {
        if (!firebaseAvailable) return;
        console.log('[Dots Cleanup] Running initial cleanup on page load...');
        await cleanupInactiveRooms();
    }

    // Multiplayer State Container
    const multiplayer = {
        playerId: generatePlayerId(),
        roomId: null,
        playerRole: null, // 'creator' or 'joiner'
        playerColor: null, // 'player1' (creator) or 'player2' (joiner)
        opponentId: null,
        opponentColor: null,
        opponentUsername: null,
        opponentAvatar: null,
        opponentLevel: null,
        creatorAvatar: null,
        creatorLevel: null,
        joinerAvatar: null,
        joinerLevel: null,
        gameMode: null, // 'online'
        isPlayerTurn: false,
        gameStarted: false,
        roomListener: null,
        timerInterval: null,
        turnTimeRemaining: 20,
        maxTurnTime: 20,
        gridSize: 'normal',
        lastRoomState: null
    };

    window.dots_multiplayer = multiplayer;
    window.dotsMultiplayer = multiplayer; // Alias for hub_multiplayer.js compatibility

    // Helper to get selected items
    function getPlayerStoreItems() {
        try {
            if (window.playerDataManager) {
                const data = window.playerDataManager.get() || {};
                // Use data.avatar (actual filename e.g. 'avatar-kurd.png') not the item ID
                const avatarFile = data.avatar || 'avatar-default.png';
                // Level is NOT stored as data.level — it is computed from stats.totalScore.
                // Always derive it via calculateLevelFromScore so it matches what the profile shows.
                const totalScore = data.stats?.totalScore || 0;
                let level = 1;
                if (typeof calculateLevelFromScore === 'function') {
                    level = calculateLevelFromScore(totalScore).level;
                } else {
                    level = Math.max(1, Math.floor(totalScore / 100) + 1);
                }
                return {
                    avatar: avatarFile,
                    level: level,
                    board: data.selectedItems?.dots_and_boxes_lines || 'dots_lines_default',
                    piece: data.selectedItems?.dots_and_boxes_boxes || 'dots_boxes_default',
                    background: data.selectedItems?.global_background || 'global_bg_default'
                };
            }
        } catch (e) {
            console.log(e);
        }
        return { avatar: 'avatar-default.png', level: 1, board: 'dots_lines_default', piece: 'dots_boxes_default', background: 'global_bg_default' };
    }

    // Create Room
    async function createRoom(gameMode, gridSize) {
        try {
            const currentUserRaw = localStorage.getItem('currentUser');
            if (!currentUserRaw) {
                alert(window.getTranslation('mp_login_required', 'You must create an account first to play online! Opening Profile.'));
                if (typeof showSection === 'function') showSection('profile');
                return null;
            }
            const user = JSON.parse(currentUserRaw);
            const username = user.username;

            if (!firebaseAvailable) {
                alert(window.getTranslation('mp_db_unavailable', 'Firestore not available. Please check internet connection.'));
                return null;
            }

            multiplayer.gameMode = gameMode;
            multiplayer.gridSize = gridSize;
            multiplayer.playerRole = 'creator';
            multiplayer.playerColor = 'player1';
            multiplayer.opponentColor = 'player2';

            // Generate Room ID prefixed with dots_ for separation
            const randomSuffix = Math.floor(Math.random() * 1000);
            const roomId = `dots_${username}_${randomSuffix}`;
            multiplayer.roomId = roomId;

            const storeItems = getPlayerStoreItems();
            multiplayer.creatorAvatar = storeItems.avatar;
            multiplayer.creatorLevel = storeItems.level;

            const roomData = {
                roomId: roomId,
                creatorId: multiplayer.playerId,
                creatorUsername: username,
                creator: username,
                creatorAvatar: storeItems.avatar,
                creatorLevel: storeItems.level,
                creatorColor: 'player1',
                creatorBoard: storeItems.board,
                creatorPiece: storeItems.piece,
                creatorBackground: storeItems.background,
                joiner: null,
                joinerId: null,
                joinerUsername: null,
                joinerAvatar: null,
                joinerLevel: null,
                joinerColor: 'player2',
                gridSize: gridSize,
                hLines: {},
                vLines: {},
                boxes: {},
                scores: { player1: 0, player2: 0 },
                currentPlayer: Math.random() < 0.5 ? 'player1' : 'player2', // Randomly pick who goes first
                gameStarted: false,
                gameOver: false,
                status: 'waiting', // 'waiting', 'starting', 'playing', 'finished'
                createdAt: Date.now(),
                turnStartedAt: Date.now(),
                turnDuration: multiplayer.maxTurnTime,
                lastActivity: Date.now(),
                winner: null,
                lastMove: null
            };

            await firestore.collection('dots_and_boxes_rooms').doc(roomId).set(roomData);
            
            // Render waiting screen ID display
            document.getElementById('dots_roomIdDisplay').textContent = roomId;
            document.getElementById('dots_playerColorSpan').textContent = window.getTranslation('dots_player_color_p1', 'P1 (Blue)');
            
            // Switch screen to waiting
            document.querySelectorAll('#dots_and_boxes .dots-game-screen').forEach(el => el.classList.remove('active'));
            document.getElementById('dots_waitingScreen').classList.add('active');

            listenToRoom(roomId);

        } catch (e) {
            console.error('Error creating dots room:', e);
        }
    }
    multiplayer.createRoom = createRoom;

    // Listen to Room Document
    function listenToRoom(roomId) {
        if (multiplayer.roomListener) {
            multiplayer.roomListener();
        }

        multiplayer.roomListener = firestore.collection('dots_and_boxes_rooms').doc(roomId).onSnapshot(doc => {
            if (!doc.exists) {
                console.log('Room document was deleted or does not exist');
                handleOpponentDisconnect();
                return;
            }

            const data = doc.data();
            multiplayer.lastRoomState = data;

            if (data.status === 'waiting') {
                // Still waiting
            } else if (data.status === 'starting') {
                // Match ready countdown starts
                if (!multiplayer.gameStarted && !document.getElementById('dots_onlineMatchStartSplashScreen').classList.contains('active')) {
                    startMatchReadyCountdown(data);
                }
            } else if (data.status === 'playing') {
                // Actively playing
                handleRoomUpdateInGame(data);
            } else if (data.status === 'finished') {
                // Game completed online
                handleGameEndOnline(data);
            }
        });
    }

    // Countdown Splash screen
    function startMatchReadyCountdown(roomData) {
        document.querySelectorAll('#dots_and_boxes .dots-game-screen').forEach(el => el.classList.remove('active'));
        const splash = document.getElementById('dots_onlineMatchStartSplashScreen');
        splash.classList.add('active');

        // Set VS info
        const meCreator = multiplayer.playerRole === 'creator';
        const p1Name = roomData.creator;
        const p2Name = roomData.joiner;
        
        multiplayer.opponentUsername = meCreator ? roomData.joiner : roomData.creator;
        multiplayer.opponentAvatar = meCreator ? roomData.joinerAvatar : roomData.creatorAvatar;
        multiplayer.opponentLevel = meCreator ? roomData.joinerLevel : roomData.creatorLevel;

        const infoDiv = document.getElementById('dots_onlineMatchPlayersInfo');
        infoDiv.innerHTML = `
            <div style="text-align: center; border-right: 1px solid rgba(255,255,255,0.1); padding-right: 20px;">
                <div style="font-size: 14px; opacity: 0.8;">${window.getTranslation('dots_player_1', 'Player 1')} (${window.getTranslation('creator_label','Creator')})</div>
                <div style="font-size: 20px; font-weight: bold; color: #2196F3;">${p1Name}</div>
                <div style="font-size: 12px; color: #aaa;">${window.getTranslation('modal_profile_lvl','Level ')}${roomData.creatorLevel}</div>
            </div>
            <div style="text-align: center; padding-left: 20px;">
                <div style="font-size: 14px; opacity: 0.8;">${window.getTranslation('dots_player_2', 'Player 2')} (${window.getTranslation('joiner_label','Joiner')})</div>
                <div style="font-size: 20px; font-weight: bold; color: #F44336;">${p2Name}</div>
                <div style="font-size: 12px; color: #aaa;">${window.getTranslation('modal_profile_lvl','Level ')}${roomData.joinerLevel || 1}</div>
            </div>
        `;

        let countdown = 5;
        const countSpan = document.getElementById('dots_onlineMatchCountdown');
        countSpan.textContent = countdown;

        const interval = setInterval(async () => {
            countdown--;
            countSpan.textContent = countdown;
            if (countdown <= 0) {
                clearInterval(interval);
                // Transitions status to playing (only creator does this to avoid double updates)
                if (multiplayer.playerRole === 'creator') {
                    await firestore.collection('dots_and_boxes_rooms').doc(multiplayer.roomId).update({
                        status: 'playing',
                        gameStarted: true,
                        turnStartedAt: Date.now(),
                        lastActivity: Date.now()
                    });
                }
            }
        }, 1000);
    }

    // In-game Sync Logic
    function handleRoomUpdateInGame(roomData) {
        if (!multiplayer.gameStarted) {
            multiplayer.gameStarted = true;

            // FIX: Set playerColor BEFORE openDotsAndBoxesGame so that
            // updateUIElements() inside setupBoard reads the correct value
            // and doesn't show "Your Turn" to both players simultaneously.
            if (window.dots_gameState) {
                window.dots_gameState.playerColor = multiplayer.playerColor;
            }

            // Open local game screen scoped for online mode
            window.openDotsAndBoxesGame('online', roomData.gridSize);

            // Set isPlayerTurn immediately after opening game so timer logic
            // is correct from the very first snapshot.
            multiplayer.isPlayerTurn = roomData.currentPlayer === multiplayer.playerColor;

            // Populate rich opponent info widget on top-bar (Dama-style with avatars)
            const vsInfo = document.getElementById('dots_multiplayerVsInfo');
            if (vsInfo) {
                vsInfo.style.display = 'flex';
                const creatorName = roomData.creator || 'Creator';
                const joinerName = roomData.joiner || 'Joiner';
                const creatorAvatar = roomData.creatorAvatar || getDotsAvatarFile(creatorName);
                const joinerAvatar = roomData.joinerAvatar || getDotsAvatarFile(joinerName);
                const creatorLevel = roomData.creatorLevel || getDotsProfileLevel(creatorName);
                const joinerLevel = roomData.joinerLevel || getDotsProfileLevel(joinerName);
                vsInfo.innerHTML = buildVsBannerHTML(
                    creatorName, creatorAvatar, creatorLevel, creatorName,
                    joinerName, joinerAvatar, joinerLevel, joinerName
                );
            }

            // Adjust skins based on creator choice
            if (window.dots_gameState) {
                window.dots_gameState.selectedLineSkin = roomData.creatorBoard || 'dots_lines_default';
                window.dots_gameState.selectedBoxSkin = roomData.creatorPiece || 'dots_boxes_default';
                window.dots_gameState.selectedBoardSkin = roomData.creatorBackground || 'global_bg_default';
                // Update score card colors to match creator's line skin
                if (typeof window.updateScoreCardColors === 'function') {
                    window.updateScoreCardColors();
                }
                // Apply creator's background customization
                if (typeof window.applyCreatorBackground === 'function') {
                    window.applyCreatorBackground(roomData.creatorBackground);
                }
                // Redraw board to apply creator's customization skins
                if (typeof window.dots_drawBoard === 'function') {
                    window.dots_drawBoard();
                }
            }
        }

        // Apply external moves to local board state
        const gs = window.dots_gameState;
        if (!gs) return;

        let stateChanged = false;

        // Apply H Lines (only in online mode — syncs opponent moves to local board)
        for (let r = 0; r < gs.rows; r++) {
            for (let c = 0; c < gs.cols - 1; c++) {
                const key = `${r}_${c}`;
                if (roomData.hLines[key] && !gs.hLines[r][c]) {
                    // Apply directly to state without going through makeMove (avoids AI triggers)
                    gs.hLines[r][c] = true;
                    const owner = roomData.hLines[key];
                    if (typeof window.dots_markLineOwner === 'function') window.dots_markLineOwner('h', r, c, owner);
                    stateChanged = true;
                }
            }
        }

        // Apply V Lines
        for (let r = 0; r < gs.rows - 1; r++) {
            for (let c = 0; c < gs.cols; c++) {
                const key = `${r}_${c}`;
                if (roomData.vLines[key] && !gs.vLines[r][c]) {
                    gs.vLines[r][c] = true;
                    if (typeof window.dots_markLineOwner === 'function') window.dots_markLineOwner('v', r, c, roomData.vLines[key]);
                    stateChanged = true;
                }
            }
        }

        // Apply Claimed Boxes
        for (let r = 0; r < gs.rows - 1; r++) {
            for (let c = 0; c < gs.cols - 1; c++) {
                const key = `${r}_${c}`;
                if (roomData.boxes[key] && !gs.boxes[r][c]) {
                    gs.boxes[r][c] = roomData.boxes[key];
                    stateChanged = true;
                }
            }
        }

        // Sync Scores and Current Player turn index
        gs.scores.player1 = roomData.scores.player1;
        gs.scores.player2 = roomData.scores.player2;

        const previousTurnPlayer = gs.currentPlayer;
        gs.currentPlayer = roomData.currentPlayer;

        // Always update turnInfo and highlights on EVERY snapshot so both players
        // see the correct "Your Turn" / "Opponent's Turn" text from the very start.
        {
            if (roomData.lastMove) {
                gs.lastMove = roomData.lastMove;
            }

            const p1 = document.getElementById('dotsPlayer1Score');
            const p2 = document.getElementById('dotsPlayer2Score');
            if (p1) p1.textContent = gs.scores.player1;
            if (p2) p2.textContent = gs.scores.player2;

            const card1 = document.getElementById('dotsPlayer1ScoreCard');
            const card2 = document.getElementById('dotsPlayer2ScoreCard');
            const turnInfo = document.getElementById('dots_turnInfo');

            card1.classList.remove('active-turn');
            card2.classList.remove('active-turn');

            if (gs.currentPlayer === 'player1') {
                card1.classList.add('active-turn');
                if (turnInfo) turnInfo.textContent = multiplayer.playerColor === 'player1'
                    ? window.getTranslation('dots_turn_your', 'Your Turn')
                    : window.getTranslation('dots_turn_opponent', "Opponent's Turn");
            } else {
                card2.classList.add('active-turn');
                if (turnInfo) turnInfo.textContent = multiplayer.playerColor === 'player2'
                    ? window.getTranslation('dots_turn_your', 'Your Turn')
                    : window.getTranslation('dots_turn_opponent', "Opponent's Turn");
            }

            if (stateChanged && typeof window.dots_drawBoard === 'function') {
                window.dots_drawBoard();
            }
        }

        // Handle timer — BOTH players run a local countdown so both see the clock ticking.
        // Always derive isPlayerTurn from Firestore authoritative state.
        multiplayer.isPlayerTurn = roomData.currentPlayer === multiplayer.playerColor;
        const elapsed = Math.floor((Date.now() - roomData.turnStartedAt) / 1000);
        multiplayer.turnTimeRemaining = Math.max(0, multiplayer.maxTurnTime - elapsed);
        startTimerCountdown(multiplayer.isPlayerTurn);
    }

    // Submit Move Placement
    async function sendLinePlacement(type, r, c, isClaim) {
        if (!multiplayer.roomId || !firebaseAvailable) return;

        try {
            const key = `${r}_${c}`;
            const myColor = multiplayer.playerColor;

            const roomRef = firestore.collection('dots_and_boxes_rooms').doc(multiplayer.roomId);
            
            // Build updates maps
            const updateData = {
                currentPlayer: isClaim ? myColor : (myColor === 'player1' ? 'player2' : 'player1'),
                scores: window.dots_gameState.scores,
                turnStartedAt: Date.now(),
                lastActivity: Date.now(),
                lastMove: { type, r, c, player: myColor }
            };

            if (type === 'h') {
                updateData[`hLines.${key}`] = myColor;
            } else {
                updateData[`vLines.${key}`] = myColor;
            }

            // Sync newly captured boxes mapping
            for (let br = 0; br < window.dots_gameState.rows - 1; br++) {
                for (let bc = 0; bc < window.dots_gameState.cols - 1; bc++) {
                    if (window.dots_gameState.boxes[br][bc] === myColor) {
                        updateData[`boxes.${br}_${bc}`] = myColor;
                    }
                }
            }

            await roomRef.update(updateData);

            // NOTE: Do NOT call stopTurnTimer() here.
            // Firestore's local SDK fires the listener synchronously during the await above,
            // which calls startTimerCountdown and starts a new interval.
            // Calling stopTurnTimer() after the await would immediately kill that new interval,
            // causing the timer to freeze on every turn after the first.
            // The timer is managed entirely by handleRoomUpdateInGame via startTimerCountdown.

            // Sync local winning status locally if board is filled
            const maxBoxes = (window.dots_gameState.rows - 1) * (window.dots_gameState.cols - 1);
            const total = window.dots_gameState.scores.player1 + window.dots_gameState.scores.player2;
            if (total >= maxBoxes) {
                const s1 = window.dots_gameState.scores.player1;
                const s2 = window.dots_gameState.scores.player2;
                let winnerOutcome = 'draw';
                if (s1 > s2) winnerOutcome = 'player1';
                else if (s2 > s1) winnerOutcome = 'player2';

                await roomRef.update({
                    status: 'finished',
                    gameOver: true,
                    winner: winnerOutcome,
                    lastActivity: Date.now()
                });
            }

        } catch (e) {
            console.error('Error submitting dots line:', e);
        }
    }
    multiplayer.sendLinePlacement = sendLinePlacement;

    // Timer functions
    // Unified countdown: runs for BOTH my turn (isMyTurn=true) and opponent turn (isMyTurn=false)
    // so both players always see a live ticking timer.
    function startTimerCountdown(isMyTurn) {
        if (multiplayer.timerInterval) clearInterval(multiplayer.timerInterval);
        updateTimerDisplay(isMyTurn);
        multiplayer.timerInterval = setInterval(() => {
            multiplayer.turnTimeRemaining = Math.max(0, multiplayer.turnTimeRemaining - 1);
            updateTimerDisplay(isMyTurn);
            if (multiplayer.turnTimeRemaining <= 0) {
                clearInterval(multiplayer.timerInterval);
                multiplayer.timerInterval = null;
                // Only the player whose turn it is submits a timeout move
                if (isMyTurn) handleTurnTimeout();
            }
        }, 1000);
    }

    // Legacy alias kept so sendLinePlacement can still call it
    function startTurnTimer() { startTimerCountdown(true); }

    // Stop countdown but keep timer visible (for opponent's turn)
    function stopTurnTimerKeepVisible() {
        if (multiplayer.timerInterval) {
            clearInterval(multiplayer.timerInterval);
            multiplayer.timerInterval = null;
        }
    }

    function stopTurnTimer() {
        if (multiplayer.timerInterval) {
            clearInterval(multiplayer.timerInterval);
            multiplayer.timerInterval = null;
        }
        // Only fully hide the timer in non-online modes (single player / offline)
        if (!multiplayer.gameStarted) {
            const wrap = document.getElementById('dots_timerDisplay');
            if (wrap) wrap.style.display = 'none';
        }
    }

    function updateTimerDisplay(isMyTurn) {
        const wrap = document.getElementById('dots_timerDisplay');
        const count = document.getElementById('dots_turnTimer');
        const label = document.getElementById('dots_timerLabel');
        if (wrap && count) {
            wrap.style.display = 'block';
            const val = Math.max(0, multiplayer.turnTimeRemaining);
            count.textContent = val;
            // Red when urgent (≤5s), gold for my turn, light-blue for opponent
            if (val <= 5) {
                count.style.color = '#ff3d00';
            } else {
                count.style.color = isMyTurn ? '#ffd700' : '#aee8ff';
            }
            if (label) label.textContent = isMyTurn ? window.getTranslation('dots_timer_label_my', 'Your Time:') : window.getTranslation('dots_timer_label_opp', 'Opp Time:');
        }
    }

    // Update timer display for opponent's turn (kept for any legacy calls)
    function updateTimerDisplayOpponent() {
        updateTimerDisplay(false);
    }

    // Auto placement on turn expiry
    function handleTurnTimeout() {
        // FIX #2: Double-check server state before executing timeout move
        // to prevent the timeout from firing for both players simultaneously.
        if (!multiplayer.isPlayerTurn) return;
        if (multiplayer.lastRoomState && multiplayer.lastRoomState.currentPlayer !== multiplayer.playerColor) return;
        console.log('Turn time expired! Drawing random line');

        const gs = window.dots_gameState;
        if (!gs || gs.gameOver) return;

        // Fetch all legal moves
        const list = [];
        for (let r = 0; r < gs.rows; r++) {
            for (let c = 0; c < gs.cols - 1; c++) {
                if (!gs.hLines[r][c]) list.push({ type: 'h', r, c });
            }
        }
        for (let r = 0; r < gs.rows - 1; r++) {
            for (let c = 0; c < gs.cols; c++) {
                if (!gs.vLines[r][c]) list.push({ type: 'v', r, c });
            }
        }

        if (list.length > 0) {
            const randomChoice = list[Math.floor(Math.random() * list.length)];
            window.dots_makeMoveDirect(randomChoice.type, randomChoice.r, randomChoice.c);
        }
    }

    // Matchmaking Rooms Visualizer
    function listenToAvailableRooms() {
        const list = document.getElementById('dots_roomsList');
        if (!list) return;

        if (!firebaseAvailable) {
            list.innerHTML = `<p class="error-text">${window.getTranslation('rooms_db_error', 'Database connection failed')}</p>`;
            return;
        }

        list.innerHTML = `<p class="loading-text">${window.getTranslation('rooms_scanning', 'Scanning rooms...')}</p>`;

        // Query rooms in waiting status (no orderBy to prevent Firestore index requirements)
        firestore.collection('dots_and_boxes_rooms')
            .where('status', '==', 'waiting')
            .limit(20)
            .onSnapshot(snapshot => {
                list.innerHTML = '';
                if (snapshot.empty) {
                    list.innerHTML = `<p style="text-align:center; color:#888;">${window.getTranslation('rooms_no_active', 'No active rooms found. Create one to play!')}</p>`;
                    return;
                }

                const rooms = [];
                snapshot.forEach(doc => rooms.push(doc.data()));
                // Sort in memory
                rooms.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

                rooms.forEach(data => {
                    const item = document.createElement('div');
                    item.className = 'room-item';
                    item.innerHTML = `
                        <div class="room-info">
                            <span class="room-creator">${data.creator}</span>
                            <span class="room-details">${window.getTranslation(data.gridSize === 'normal' ? 'dots_type_label_normal' : 'dots_type_label_large', data.gridSize === 'normal' ? 'Normal' : 'Large')} | ${window.getTranslation('modal_profile_lvl', 'Level ')}${data.creatorLevel || 1}</span>
                        </div>
                        <button class="btn-join" onclick="dotsMultiplayer.joinRoom('${data.roomId}')">${window.getTranslation('hub_action_join', 'Join')}</button>
                    `;
                    list.appendChild(item);
                });
            }, error => {
                console.error('Error fetching rooms:', error);
                list.innerHTML = `<p class="error-text">${window.getTranslation('rooms_fetch_failed', 'Failed to fetch active rooms.')}</p>`;
            });
    }
    multiplayer.listenToAvailableRooms = listenToAvailableRooms;

    // Join Room
    async function joinRoom(roomId) {
        try {
            const currentUserRaw = localStorage.getItem('currentUser');
            if (!currentUserRaw) {
                alert(window.getTranslation('mp_login_required', 'You must create an account first!'));
                if (typeof showSection === 'function') showSection('profile');
                return;
            }
            const user = JSON.parse(currentUserRaw);
            const username = user.username;

            multiplayer.gameMode = 'online';
            multiplayer.playerRole = 'joiner';
            multiplayer.playerColor = 'player2';
            multiplayer.opponentColor = 'player1';
            multiplayer.roomId = roomId;

            const storeItems = getPlayerStoreItems();
            multiplayer.joinerAvatar = storeItems.avatar;
            multiplayer.joinerLevel = storeItems.level;

            // Atomically join room doc
            const roomRef = firestore.collection('dots_and_boxes_rooms').doc(roomId);
            await roomRef.update({
                joiner: username,
                joinerId: multiplayer.playerId,
                joinerUsername: username,
                joinerAvatar: storeItems.avatar,
                joinerLevel: storeItems.level,
                status: 'starting',
                lastActivity: Date.now()
            });

            listenToRoom(roomId);
            return true;

        } catch (e) {
            console.error('Error joining dots room:', e);
            alert(window.getTranslation('mp_failed_join', 'Failed to join room. Please try again.'));
            return false;
        }
    }
    multiplayer.joinRoom = joinRoom;

    // Cancel Room
    async function cancelWaitingRoom() {
        if (multiplayer.roomListener) {
            multiplayer.roomListener();
            multiplayer.roomListener = null;
        }

        if (multiplayer.roomId && firebaseAvailable) {
            try {
                await firestore.collection('dots_and_boxes_rooms').doc(multiplayer.roomId).delete();
            } catch (e) {
                console.error(e);
            }
        }

        multiplayer.roomId = null;
        multiplayer.gameStarted = false;
    }
    multiplayer.cancelWaitingRoom = cancelWaitingRoom;

    // Leave Room
    async function leaveRoom() {
        stopTurnTimer();
        if (multiplayer.roomListener) {
            multiplayer.roomListener();
            multiplayer.roomListener = null;
        }

        if (multiplayer.roomId && firebaseAvailable) {
            try {
                // If owner deletes the room, or if joiner removes themselves
                if (multiplayer.playerRole === 'creator') {
                    await firestore.collection('dots_and_boxes_rooms').doc(multiplayer.roomId).delete();
                } else if (multiplayer.playerRole === 'joiner') {
                    const doc = await firestore.collection('dots_and_boxes_rooms').doc(multiplayer.roomId).get();
                    if (doc.exists && doc.data().status === 'playing') {
                        // Mark match finished and creator won due to abandonment
                        await firestore.collection('dots_and_boxes_rooms').doc(multiplayer.roomId).update({
                            status: 'finished',
                            gameOver: true,
                            winner: 'player1'
                        });
                    }
                }
            } catch (e) {
                console.log(e);
            }
        }

        multiplayer.roomId = null;
        multiplayer.gameStarted = false;
        
        // Return to home SPA section
        if (typeof showSection === 'function') {
            showSection('home');
        }
    }
    multiplayer.leaveRoom = leaveRoom;

    // Spectate Room
    async function spectateRoom(roomId) {
        try {
            if (!firebaseAvailable) {
                alert(window.getTranslation('mp_db_unavailable', 'Firestore not available'));
                return false;
            }

            const roomRef = firestore.collection('dots_and_boxes_rooms').doc(roomId);
            const roomSnap = await roomRef.get();

            if (!roomSnap.exists) {
                alert(window.getTranslation('mp_room_not_exists', 'Room no longer exists.'));
                return false;
            }

            const room = roomSnap.data();
            if (!room.gameStarted) {
                alert(window.getTranslation('mp_game_not_started', 'Game has not started yet.'));
                return false;
            }

            multiplayer.roomId = roomId;
            multiplayer.playerRole = 'spectator';
            multiplayer.gameStarted = true;
            multiplayer.lastRoomState = room;

            // Open game screen for online
            window.openDotsAndBoxesGame('online', room.gridSize);

            // Apply creator's customization to the spectated game
            if (window.dots_gameState) {
                window.dots_gameState.selectedLineSkin = room.creatorBoard || 'dots_lines_default';
                window.dots_gameState.selectedBoxSkin = room.creatorPiece || 'dots_boxes_default';
                window.dots_gameState.selectedBoardSkin = room.creatorBackground || 'global_bg_default';
                if (typeof window.updateScoreCardColors === 'function') {
                    window.updateScoreCardColors();
                }
                if (typeof window.applyCreatorBackground === 'function') {
                    window.applyCreatorBackground(room.creatorBackground);
                }
                if (typeof window.dots_drawBoard === 'function') {
                    window.dots_drawBoard();
                }
            }

            // Hide normal control buttons since spectator can't take action
            const backBtn = document.getElementById('dots_gameBackButton');
            if (backBtn) backBtn.style.display = 'none';
            const newGameBtn = document.getElementById('dots_newGameButton');
            if (newGameBtn) newGameBtn.style.display = 'none';

            // Show spectator stop button
            const leaveBtn = document.getElementById('dots_leaveGameButton');
            if (leaveBtn) {
                leaveBtn.style.display = 'inline-flex';
                leaveBtn.innerHTML = `<i class="fas fa-sign-out-alt"></i> ${window.getTranslation('hub_action_stop_spectating', 'Stop Spectating')}`;
                leaveBtn.onclick = function () {
                    leaveRoom();
                };
            }

            // Sync visual details/vs panel (Dama-style with avatars, levels, clickable profiles)
            const vsInfo = document.getElementById('dots_multiplayerVsInfo');
            if (vsInfo) {
                vsInfo.style.display = 'flex';
                const creatorName = room.creator || 'Creator';
                const joinerName = room.joiner || 'Joiner';
                const creatorAvatar = room.creatorAvatar || getDotsAvatarFile(creatorName);
                const joinerAvatar = room.joinerAvatar || getDotsAvatarFile(joinerName);
                const creatorLevel = room.creatorLevel || getDotsProfileLevel(creatorName);
                const joinerLevel = room.joinerLevel || getDotsProfileLevel(joinerName);
                vsInfo.innerHTML = buildVsBannerHTML(
                    creatorName, creatorAvatar, creatorLevel, creatorName,
                    joinerName, joinerAvatar, joinerLevel, joinerName
                );
            }

            listenToRoom(roomId);

            return true;
        } catch (error) {
            console.error('[spectateRoom] Error spectating room:', error);
            alert(window.getTranslation('mp_failed_spectate', 'Failed to spectate room.'));
            return false;
        }
    }
    multiplayer.spectateRoom = spectateRoom;

    // Handles opponent disconnect mid-game
    function handleOpponentDisconnect() {
        stopTurnTimer();
        if (multiplayer.gameStarted && !window.dots_gameState.gameOver) {
            alert(window.getTranslation('dots_opp_left', 'Opponent has left or disconnected. You win!'));
            // Increment profiles wins
            saveOnlineResultStats(true);
        }

        multiplayer.gameStarted = false;
        multiplayer.roomId = null;
        if (multiplayer.roomListener) {
            multiplayer.roomListener();
            multiplayer.roomListener = null;
        }

        // Return to menu
        if (typeof showSection === 'function') {
            showSection('home');
        }
    }

    // Handles match completed online
    async function handleGameEndOnline(roomData) {
        stopTurnTimer();
        if (multiplayer.roomListener) {
            multiplayer.roomListener();
            multiplayer.roomListener = null;
        }

        const isWinner = roomData.winner === multiplayer.playerColor;
        const isDraw = roomData.winner === 'draw';

        saveOnlineResultStats(isWinner && !isDraw);

        const s1 = roomData.scores.player1;
        const s2 = roomData.scores.player2;

        const rewardPoints = isWinner && !isDraw ? 45 : 10;
        const coinsEarned = isWinner && !isDraw ? 50 : 15;
        const elapsedSeconds = roomData.createdAt ? Math.floor((Date.now() - roomData.createdAt) / 1000) : 0;
        const timePlayed = `${Math.floor(elapsedSeconds / 60)}m ${elapsedSeconds % 60}s`;

        const splashScreen = document.getElementById('dots_winnerSplashScreen');
        const titleEl = document.getElementById('dots_winnerSplashTitle');
        const messageEl = document.getElementById('dots_winnerSplashMessage');

        const p1Name = roomData.creator;
        const p2Name = roomData.joiner || window.getTranslation('opponent_label', 'Opponent');
        // Use avatar stored in roomData (the correct filenames saved at room creation/join time)
        const p1AvatarFile = roomData.creatorAvatar || getDotsAvatarFile(p1Name);
        const p2AvatarFile = roomData.joinerAvatar || getDotsAvatarFile(p2Name);
        const p1Avatar = `assets/images/${p1AvatarFile}`;
        const p2Avatar = `assets/images/${p2AvatarFile}`;
        // Use levels stored in roomData — they were saved correctly at room creation/join
        const p1Level = roomData.creatorLevel || getDotsProfileLevel(p1Name);
        const p2Level = roomData.joinerLevel || getDotsProfileLevel(p2Name);

        const p1Status = roomData.winner === 'player1' ? window.getTranslation('dots_status_winner', 'Winner') : (isDraw ? 'Draw' : window.getTranslation('dots_status_loser', 'Loser'));
        const p2Status = roomData.winner === 'player2' ? window.getTranslation('dots_status_winner', 'Winner') : (isDraw ? 'Draw' : window.getTranslation('dots_status_loser', 'Loser'));

        titleEl.innerHTML = isWinner && !isDraw
            ? `<i class="fas fa-trophy" style="color: #FFD700; margin-right: 10px;"></i>${window.getTranslation('dots_victory', 'Victory!')}`
            : (isDraw ? `<i class="fas fa-handshake" style="color: #FFD700; margin-right: 10px;"></i>${window.getTranslation('dots_draw_title', 'Draw Game!')}` : `<i class="fas fa-flag-checkered" style="color: #FF6B6B; margin-right: 10px;"></i>${window.getTranslation('dots_defeated', 'Defeated')}`);
        titleEl.style.color = isWinner && !isDraw ? '#4CAF50' : (isDraw ? '#FFD700' : '#FF6B6B');

        messageEl.innerHTML = `
            <div style="display: grid; gap: 20px;">
                <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; margin-bottom: 15px;">
                    <div style="background: rgba(255,255,255,0.12); border: 1px solid rgba(255,255,255,0.15); border-radius: 14px; padding: 20px; text-align: center;">
                        <img src="${p1Avatar}" onerror="this.src='assets/images/avatar-default.png'" alt="${p1Name}" style="width: 60px; height: 60px; border-radius: 50%; object-fit: cover; margin-bottom: 8px; border: 2px solid #ffd966;">
                        <h3 style="margin: 0 0 8px; font-size: 18px;">${p1Name}</h3>
                        <p style="margin: 0 0 6px; color: #fff;">${window.getTranslation('modal_profile_lvl', 'Level ')}${p1Level}</p>
                        <p style="margin: 0; color: ${roomData.winner === 'player1' ? '#4CAF50' : (isDraw ? '#FFD700' : '#FF6B6B')}; font-weight: 700;">${p1Status}</p>
                        <p style="margin: 5px 0 0; font-size: 14px; opacity:0.8;">${window.getTranslation('dots_score_label','Score:')} ${s1}</p>
                    </div>
                    <div style="background: rgba(255,255,255,0.12); border: 1px solid rgba(255,255,255,0.15); border-radius: 14px; padding: 20px; text-align: center;">
                        <img src="${p2Avatar}" onerror="this.src='assets/images/avatar-default.png'" alt="${p2Name}" style="width: 60px; height: 60px; border-radius: 50%; object-fit: cover; margin-bottom: 8px; border: 2px solid #ffd966;">
                        <h3 style="margin: 0 0 8px; font-size: 18px;">${p2Name}</h3>
                        <p style="margin: 0 0 6px; color: #fff;">${window.getTranslation('modal_profile_lvl', 'Level ')}${p2Level}</p>
                        <p style="margin: 0; color: ${roomData.winner === 'player2' ? '#4CAF50' : (isDraw ? '#FFD700' : '#FF6B6B')}; font-weight: 700;">${p2Status}</p>
                        <p style="margin: 5px 0 0; font-size: 14px; opacity:0.8;">${window.getTranslation('dots_score_label','Score:')} ${s2}</p>
                    </div>
                </div>
                <div style="background: rgba(0,0,0,0.15); padding: 22px; border-radius: 14px; border: 1px solid rgba(255,255,255,0.12); text-align: center;">
                    <div style="font-size: 20px; color: #FFD700; margin-bottom: 14px; font-weight: bold; display: inline-flex; align-items: center; gap: 10px;"><i class="fas fa-star"></i> ${window.getTranslation('dots_points', 'Points: +')}${rewardPoints}</div>
                    <div style="font-size: 16px; color: #fff; margin: 10px 0; display: inline-flex; align-items: center; gap: 10px;"><i class="fas fa-coins"></i> ${window.getTranslation('dots_coins_earned', 'Coins: +')}${coinsEarned}</div>
                    <div style="font-size: 16px; color: #7dd3fc; margin-top: 8px; display: inline-flex; align-items: center; gap: 10px;"><i class="fas fa-hourglass-end"></i> ${window.getTranslation('dots_time', 'Time: ')}${timePlayed}</div>
                </div>
                <div style="text-align: center; color: #ddd; font-size: 14px;">${window.getTranslation('dama_waiting_seconds', 'Waiting for <strong>{sec} seconds</strong>...').replace('{sec}', '5')}</div>
                <div style="text-align: center; font-size: 28px; color: #ffd966; font-weight: 700;" id="dots_resultCountdown">5</div>
            </div>
            <div style="margin-top: 20px; display: flex; gap: 12px; justify-content: center; flex-wrap: wrap;">
                <button id="dots_splashLeaveGameButton" disabled style="padding: 12px 30px; font-size: 16px; background: #777; color: white; border: none; border-radius: 5px; cursor: not-allowed; opacity: 0.6;">
                    <i class="fas fa-arrow-left"></i> ${window.getTranslation('dots_exit', 'Exit')}
                </button>
            </div>
        `;

        if (typeof window.showDotsScreen === 'function') {
            window.showDotsScreen('dots_winnerSplashScreen');
        } else {
            document.querySelectorAll('#dots_and_boxes .dots-game-screen').forEach(el => el.classList.remove('active'));
            splashScreen.classList.add('active');
        }

        let countdown = 5;
        const countdownEl = document.getElementById('dots_resultCountdown');
        const leaveGameButton = document.getElementById('dots_splashLeaveGameButton');
        const interval = setInterval(() => {
            countdown -= 1;
            if (countdownEl) countdownEl.textContent = countdown.toString();
            if (countdown <= 0) {
                clearInterval(interval);
                if (leaveGameButton) {
                    leaveGameButton.removeAttribute('disabled');
                    leaveGameButton.style.background = '#f44336';
                    leaveGameButton.style.cursor = 'pointer';
                    leaveGameButton.style.opacity = '1';
                    leaveGameButton.onclick = () => {
                        splashScreen.classList.remove('active');
                        multiplayer.leaveRoom();
                    };
                }
            }
        }, 1000);
    }

    // Save online scores and profile increments
    function saveOnlineResultStats(won) {
        try {
            const scoreEarned = won ? 45 : 10;
            const coinsEarned = won ? 50 : 15;

            if (typeof updatePlayerStats === 'function') {
                updatePlayerStats('online', won ? 'win' : 'loss', scoreEarned, coinsEarned, 3);
            }

            if (typeof updateGameStats === 'function') {
                updateGameStats('dots_and_boxes', won ? 'online-win' : 'online-loss', scoreEarned, {
                    capturedBoxes: window.dots_gameState ? window.dots_gameState.scores[multiplayer.playerColor] : 0,
                    lastPlayed: new Date().toLocaleString()
                });
            }
        } catch (e) {
            console.log('Error updating profile database:', e);
        }
    }

    // Expose cleanup functions globally for manual/admin use
    multiplayer.cleanupInactiveRooms = cleanupInactiveRooms;
    multiplayer.startRoomCleanupSchedule = startRoomCleanupSchedule;
    multiplayer.stopRoomCleanupSchedule = stopRoomCleanupSchedule;
    multiplayer.INACTIVITY_THRESHOLD_MS = INACTIVITY_THRESHOLD_MS;
})();

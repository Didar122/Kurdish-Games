/* =====================================================
   DOTS AND BOXES (پێنج پێنج) - MAIN GAME PLAY LOGIC
   ===================================================== */

(function () {
    // Ensure multiplayer module namespace exists
    if (typeof window.dots_multiplayer === 'undefined') {
        console.warn('Waiting for multiplayer.js to load');
    }

    // Expose Dots Game State & Controls globally
    const dots_gameState = {
        boardSize: 'normal', // 'normal' (6x6 dots) or 'large' (20x20 dots)
        rows: 6,
        cols: 6,
        hLines: [], // horizontal lines rows x (cols - 1)
        vLines: [], // vertical lines (rows - 1) x cols
        boxes: [],  // claimed boxes (rows - 1) x (cols - 1), stores 'player1', 'player2' or null
        currentPlayer: 'player1', // 'player1' (blue/human/creator) or 'player2' (red/AI/joiner)
        playerColor: 'player1',   // Current local player color/id
        aiColor: 'player2',
        gameMode: 'single-player', // 'single-player', 'two-player', 'online'
        aiDifficulty: 'medium',    // 'easy', 'medium', 'hard', 'extreme'
        scores: { player1: 0, player2: 0 },
        gameOver: false,
        winner: null,
        startTime: null,
        otherPlayerUsername: null,
        selectedLineSkin: 'dots_lines_default',
        selectedBoxSkin: 'dots_boxes_default',
        selectedBoardSkin: 'dots_board_white',

        // Viewport transformations for panning and zooming (Large Grid Mode)
        zoom: {
            scale: 1,
            offsetX: 0,
            offsetY: 0,
            isDragging: false,
            startX: 0,
            startY: 0
        },

        // Last move made for visual indicator
        lastMove: null // { type: 'h'|'v', r, c }
    };

    window.dots_gameState = dots_gameState;

    // Canvas rendering context and animation frames
    let canvas = null;
    let ctx = null;
    let hoveredLine = null; // { type: 'h'|'v', r, c, distance }
    let animationFrameId = null;
    let linesAnimationList = []; // list of lines animating their birth { type, r, c, startTime, duration }
    let boxesAnimationList = []; // list of boxes animating their birth { r, c, startTime, duration }
    const ANIMATION_DURATION = 250; // ms

    // FIX #3: Guard flag to prevent AI from making multiple concurrent moves
    // (ghost lines bug). Set true while AI is computing/executing its move.
    let aiThinking = false;

    // FIX #2/#8: Timestamp of last placed line. Used to debounce rapid clicks
    // that would place two lines in the same gesture.
    let lastMovePlacedAt = 0;
    const MOVE_COOLDOWN_MS = 350; // minimum ms between accepted moves

    // Store skin properties
    const skins = {
        lines: {
            dots_lines_default: { color1: '#2a2a2a', color2: '#704020', width: 6, glow: false },
            dots_lines_blue_red: { color1: '#2196F3', color2: '#F44336', width: 6, glow: false },
            // ===== GOLDEN SAND SET (750 coins) =====
            dots_lines_golden_sand: { color1: '#F2C45A', color2: '#A76E10', width: 6, glow: false },
            // ===== CRYSTAL FROST SET (75 diamonds) =====
            dots_lines_crystal_frost: { color1: '#8CE6FF', color2: '#006B94', width: 6, glow: true },
            // ===== NEON PULSE SET (150 diamonds - LEGENDARY) =====
            dots_lines_neon_pulse: { color1: '#FF00FF', color2: '#00FFFF', width: 6, glow: true, animation: 'pulse' }
        },
        boxes: {
            dots_boxes_default: { fill1: 'rgba(40, 40, 40, 0.2)', fill2: 'rgba(112, 64, 32, 0.2)' },
            dots_boxes_blue_red: { fill1: 'rgba(33, 150, 243, 0.25)', fill2: 'rgba(244, 67, 54, 0.25)' },
            // ===== GOLDEN SAND SET (750 coins) =====
            dots_boxes_golden_sand: { fill1: 'rgba(245, 207, 113, 0.35)', fill2: 'rgba(149, 99, 18, 0.35)' },
            // ===== CRYSTAL FROST SET (75 diamonds) =====
            dots_boxes_crystal_frost: { fill1: 'rgba(175, 240, 255, 0.35)', fill2: 'rgba(12, 128, 168, 0.35)', glow: true, animation: 'pulse' },
            // ===== NEON PULSE SET (150 diamonds - LEGENDARY) =====
            dots_boxes_neon_pulse: { fill1: 'rgba(255, 0, 255, 0.35)', fill2: 'rgba(0, 255, 255, 0.35)', glow: true, animation: 'pulse' }
        },
        boards: {
            dots_board_white: { background: '#ffffff' },
            dots_board_black: { background: '#1a1a1a' },
            // ===== GOLDEN SAND SET (750 coins) =====
            dots_board_sandy: { gradient: true, color1: '#FFF2A1', color2: '#B88D18', color3: '#FFE28B', shine: true },
            // ===== CRYSTAL FROST SET (75 diamonds) =====
            dots_board_frosted: { gradient: true, color1: '#EAF7FF', color2: '#B6E2F5', color3: '#F7FCFF', shine: true },
            // ===== NEON PULSE SET (150 diamonds - LEGENDARY) =====
            dots_board_neon_pulse: { gradient: true, color1: '#090a14', color2: '#110b24', color3: '#1a112f', glow: true, animation: 'pulse' }
        }
    };

    // Initialize Game Sections
    function initializeDotsGame() {
        canvas = document.getElementById('dotsCanvas');
        if (!canvas) return;
        ctx = canvas.getContext('2d');

        // Setup resize event
        window.addEventListener('resize', resizeCanvas);
        setupInteractionEvents();

        // Listen for store modifications
        if (window.playerDataManager) {
            window.playerDataManager.subscribe(() => {
                loadSelectedSkins();
                drawBoard();
            });
        }
        loadSelectedSkins();
        loadGlobalBackground();
    }

    // Load store customizations
    function loadSelectedSkins() {
        try {
            let data = {};
            if (window.playerDataManager) {
                data = window.playerDataManager.get() || {};
            } else {
                data = JSON.parse(localStorage.getItem('playerData') || '{}');
            }
            dots_gameState.selectedLineSkin = data.selectedItems?.dots_and_boxes_lines || 'dots_lines_default';
            dots_gameState.selectedBoxSkin = data.selectedItems?.dots_and_boxes_boxes || 'dots_boxes_default';
            dots_gameState.selectedBoardSkin = data.selectedItems?.dots_and_boxes_boards || 'dots_board_white';
            
            // Update score card colors to match selected line skin
            updateScoreCardColors();

            // Trigger animation loop if neon pulse items are selected
            const lineSkin = skins.lines[dots_gameState.selectedLineSkin] || skins.lines.dots_lines_default;
            const boardSkin = skins.boards[dots_gameState.selectedBoardSkin] || skins.boards.dots_board_white;
            const hasPulseAnimation = (lineSkin.animation === 'pulse') || (boardSkin.animation === 'pulse');
            if (hasPulseAnimation && !animationFrameId) {
                runAnimationLoop();
            }
        } catch (e) {
            console.log('Error loading selected skins:', e);
        }
    }
    
    // Update score card border colors to match selected line skin
    function updateScoreCardColors() {
        const lineSkin = skins.lines[dots_gameState.selectedLineSkin] || skins.lines.dots_lines_default;
        
        const card1 = document.getElementById('dotsPlayer1ScoreCard');
        const card2 = document.getElementById('dotsPlayer2ScoreCard');
        
        if (card1) {
            card1.style.borderColor = lineSkin.color1;
        }
        if (card2) {
            card2.style.borderColor = lineSkin.color2;
        }
    }
    // Expose globally so multiplayer can call it
    window.updateScoreCardColors = updateScoreCardColors;

    // Load background
    function loadGlobalBackground() {
        try {
            let bgId = null;
            if (window.playerDataManager) {
                const d = window.playerDataManager.get() || {};
                bgId = d.selectedItems?.global_background;
            }
            if (bgId) {
                const bgMap = {
                    'global_bg_default': 'assets/images/bg-desktop.png',
                    'global_bg_mandala': 'assets/images/bg-mandala-desktop.png',
                    'global_bg_sunset': 'assets/images/bg-sunset-desktop.png',
                    'global_bg_midnight': 'assets/images/bg-midnight-desktop.png'
                };
                const path = bgMap[bgId];
                if (path) {
                    ['dots_modeBackground', 'dots_typeBackground', 'dots_difficultyBackground', 'dots_gameBackground', 'dots_roomActionBackground', 'dots_roomListBackground', 'dots_waitingBackground', 'dots_multiplayerModeBackground'].forEach(id => {
                        const el = document.getElementById(id);
                        if (el) el.style.backgroundImage = `url('${path}')`;
                    });
                }
            }
        } catch (e) {
            console.log(e);
        }
    }

    // Apply creator's background customization in multiplayer
    window.applyCreatorBackground = function(bgId) {
        try {
            const bgMap = {
                'global_bg_default': 'assets/images/bg-desktop.png',
                'global_bg_mandala': 'assets/images/bg-mandala-desktop.png',
                'global_bg_sunset': 'assets/images/bg-sunset-desktop.png',
                'global_bg_midnight': 'assets/images/bg-midnight-desktop.png'
            };
            const path = bgMap[bgId || 'global_bg_default'];
            if (path) {
                ['dots_modeBackground', 'dots_typeBackground', 'dots_difficultyBackground', 'dots_gameBackground', 'dots_roomActionBackground', 'dots_roomListBackground', 'dots_waitingBackground', 'dots_multiplayerModeBackground'].forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.style.backgroundImage = `url('${path}')`;
                });
            }
        } catch (e) {
            console.log(e);
        }
    };

    // SPA helper to switch screens inside Dots & Boxes section
    function showDotsScreen(screenId) {
        // Post-game result screens overlay the game board transparently.
        // Keep the game board active underneath so it shows through the dark dimmed overlay.
        const RESULT_SPLASH_SCREENS = new Set([
            'dots_winnerSplashScreen',
            'dots_opponentLeftSplashScreen'
        ]);
        const isResultSplash = RESULT_SPLASH_SCREENS.has(screenId);

        document.querySelectorAll('#dots_and_boxes .dots-game-screen').forEach(el => {
            // If showing a result splash, keep the game board visible behind it
            if (isResultSplash && el.id === 'dots_gameScreen') return;
            el.classList.remove('active');
        });
        const target = document.getElementById(screenId);
        if (target) {
            target.classList.add('active');
            target.scrollTop = 0;
        }

        // Handle game active screen resize
        if (screenId === 'dots_gameScreen') {
            setTimeout(() => {
                resizeCanvas();
                resetCamera();
            }, 50);
        }
    }

    // Core Board Setup
    function setupBoard(size) {
        dots_gameState.boardSize = size;
        if (size === 'large') {
            dots_gameState.rows = 20;
            dots_gameState.cols = 20;
            document.getElementById('dots_cameraHint').style.display = 'block';
        } else {
            dots_gameState.rows = 6;
            dots_gameState.cols = 6;
            document.getElementById('dots_cameraHint').style.display = 'none';
        }

        const r = dots_gameState.rows;
        const c = dots_gameState.cols;

        // Initialize empty matrix
        dots_gameState.hLines = Array(r).fill().map(() => Array(c - 1).fill(false));
        dots_gameState.vLines = Array(r - 1).fill().map(() => Array(c).fill(false));
        dots_gameState.boxes = Array(r - 1).fill().map(() => Array(c - 1).fill(null));

        dots_gameState.scores = { player1: 0, player2: 0 };
        dots_gameState.gameOver = false;
        dots_gameState.winner = null;
        dots_gameState.currentPlayer = 'player1';
        dots_gameState.lastMove = null;

        linesAnimationList = [];
        boxesAnimationList = [];
        aiThinking = false; // FIX #3: Reset AI thinking flag on new game
        lastMovePlacedAt = 0; // FIX #2: Reset click debounce on new game

        updateUIElements();
        resetCamera();
        resizeCanvas();
    }

    function resetCamera() {
        dots_gameState.zoom.scale = 1.0;
        dots_gameState.zoom.offsetX = 0;
        dots_gameState.zoom.offsetY = 0;
    }

    function resizeCanvas() {
        if (!canvas) return;
        const container = document.getElementById('dotsBoardContainer');
        if (!container) return;

        // Get container size
        const size = Math.min(container.clientWidth, container.clientHeight || 480);
        canvas.width = size * window.devicePixelRatio;
        canvas.height = size * window.devicePixelRatio;
        ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
        canvas.style.width = size + 'px';
        canvas.style.height = size + 'px';

        drawBoard();
    }

    // UI Updater
    function updateUIElements() {
        // Names display
        const p1Name = document.getElementById('dotsPlayer1Name');
        const p2Name = document.getElementById('dotsPlayer2Name');
        
        if (dots_gameState.gameMode === 'single-player') {
            p1Name.textContent = window.getTranslation('profile_name', 'You');
            p2Name.textContent = `${window.getTranslation('dots_ai_label', 'AI')} (${dots_gameState.aiDifficulty.toUpperCase()})`;
        } else if (dots_gameState.gameMode === 'two-player') {
            p1Name.textContent = window.getTranslation('dots_player_1', 'Player 1');
            p2Name.textContent = window.getTranslation('dots_player_2', 'Player 2');
        } else {
            // Online multiplayer sets names externally
        }

        // Scores
        document.getElementById('dotsPlayer1Score').textContent = dots_gameState.scores.player1;
        document.getElementById('dotsPlayer2Score').textContent = dots_gameState.scores.player2;

        // Update Turn info indicator and score card highlights
        const turnInfo = document.getElementById('dots_turnInfo');
        const card1 = document.getElementById('dotsPlayer1ScoreCard');
        const card2 = document.getElementById('dotsPlayer2ScoreCard');

        card1.classList.remove('active-turn');
        card2.classList.remove('active-turn');

        const activePlayer = dots_gameState.currentPlayer;

            if (activePlayer === 'player1') {
            card1.classList.add('active-turn');
            if (dots_gameState.gameMode === 'online') {
                turnInfo.textContent = dots_gameState.playerColor === 'player1' ? window.getTranslation('dots_turn_your', 'Your Turn') : window.getTranslation('dots_turn_opponent', "Opponent's Turn");
            } else {
                turnInfo.textContent = dots_gameState.gameMode === 'single-player' ? window.getTranslation('dots_turn_your', 'Your Turn') : window.getTranslation('dots_turn_player1', "Player 1's Turn");
            }
        } else {
            card2.classList.add('active-turn');
            if (dots_gameState.gameMode === 'online') {
                turnInfo.textContent = dots_gameState.playerColor === 'player2' ? window.getTranslation('dots_turn_your', 'Your Turn') : window.getTranslation('dots_turn_opponent', "Opponent's Turn");
            } else {
                turnInfo.textContent = dots_gameState.gameMode === 'single-player' ? window.getTranslation('dots_turn_ai', "AI's Turn") : window.getTranslation('dots_turn_player2', "Player 2's Turn");
            }
        }

        // Meta labels (localize)
        document.getElementById('dots_gameTypeLabel').textContent = dots_gameState.boardSize === 'normal' ? window.getTranslation('dots_type_label_normal', 'Normal (6x6)') : window.getTranslation('dots_type_label_large', 'Large (20x20)');
        document.getElementById('dots_difficultyLabel').textContent = dots_gameState.gameMode === 'single-player' ? window.getTranslation(`dots_diff_${dots_gameState.aiDifficulty}`, dots_gameState.aiDifficulty.toUpperCase()) : window.getTranslation('dots_mode_local', 'LOCAL');
    }

    // =====================================================
    // CANVAS RENDERING ENGINE
    // =====================================================

    // Convert screen coordinates to matrix coordinates based on current zoom/pan transform
    function screenToGridCoords(screenX, screenY) {
        const bounds = canvas.getBoundingClientRect();
        const mx = screenX - bounds.left;
        const my = screenY - bounds.top;

        // Apply inverse camera transformations
        const bx = (mx - dots_gameState.zoom.offsetX) / dots_gameState.zoom.scale;
        const by = (my - dots_gameState.zoom.offsetY) / dots_gameState.zoom.scale;

        return { x: bx, y: by };
    }

    // Layout configuration
    const PADDING = 45; // Canvas border spacing

    function getGridMetrics() {
        const size = canvas.width / window.devicePixelRatio;
        const rows = dots_gameState.rows;
        const cols = dots_gameState.cols;
        const usableWidth = size - 2 * PADDING;
        const spacing = usableWidth / (cols - 1);
        return { padding: PADDING, spacing: spacing, size: size };
    }

    function getBoxLetter(owner) {
        if (owner === 'player1') {
            if (dots_gameState.gameMode === 'online') {
                if (window.dots_multiplayer && window.dots_multiplayer.lastRoomState) {
                    const creatorName = window.dots_multiplayer.lastRoomState.creator;
                    if (creatorName) return creatorName.charAt(0).toUpperCase();
                }
            }
            try {
                const currentUserRaw = localStorage.getItem('currentUser');
                if (currentUserRaw) {
                    const user = JSON.parse(currentUserRaw);
                    if (user && user.username) {
                        return user.username.charAt(0).toUpperCase();
                    }
                }
            } catch (e) {}
            return 'P';
        } else {
            if (dots_gameState.gameMode === 'online') {
                if (window.dots_multiplayer && window.dots_multiplayer.lastRoomState) {
                    const joinerName = window.dots_multiplayer.lastRoomState.joiner;
                    if (joinerName) return joinerName.charAt(0).toUpperCase();
                }
                return 'O';
            } else if (dots_gameState.gameMode === 'single-player') {
                return 'A';
            } else {
                return 'P';
            }
        }
    }

    function showDotsGameResultSplash(playerWon, rewardPoints, coinsEarned, timePlayed, player1Name, player2Name) {
        const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
        const splashScreen = document.getElementById('dots_winnerSplashScreen');
        const title = document.getElementById('dots_winnerSplashTitle');
        const message = document.getElementById('dots_winnerSplashMessage');

        let player1DisplayName, player2DisplayName, player1AvatarPath, player2AvatarPath;

        function getDotsAvatarImagePath(avatarFile) {
            return `assets/images/${avatarFile}`;
        }

        if (dots_gameState.gameMode === 'single-player') {
            player1DisplayName = currentUser?.username || window.getTranslation('dots_player', 'Player');
            player2DisplayName = window.getTranslation('dots_ai_label', 'AI');
            player1AvatarPath = getDotsAvatarImagePath(getAvatarFile(currentUser?.username || window.getTranslation('dots_player', 'Player')));
            player2AvatarPath = getDotsAvatarImagePath('avatar-default.png');
        } else if (dots_gameState.gameMode === 'two-player') {
            player1DisplayName = window.getTranslation('dots_player_1', 'Player 1');
            player2DisplayName = window.getTranslation('dots_player_2', 'Player 2');
            player1AvatarPath = getDotsAvatarImagePath('avatar-default.png');
            player2AvatarPath = getDotsAvatarImagePath('avatar-default.png');
        } else if (dots_gameState.gameMode === 'online') {
            player1DisplayName = window.dots_multiplayer.playerRole === 'creator' 
                ? (currentUser?.username || window.getTranslation('creator_label', 'Creator')) 
                : (window.dots_multiplayer.opponentUsername || window.getTranslation('dots_player', 'Player'));
            player2DisplayName = window.dots_multiplayer.playerRole === 'creator' 
                ? (window.dots_multiplayer.opponentUsername || window.getTranslation('dots_player', 'Player'))
                : (currentUser?.username || window.getTranslation('creator_label', 'Creator'));
            player1AvatarPath = getDotsAvatarImagePath(getAvatarFile(player1DisplayName));
            player2AvatarPath = getDotsAvatarImagePath(getAvatarFile(player2DisplayName));
        } else {
            player1DisplayName = player1Name || currentUser?.username || 'Player 1';
            player2DisplayName = player2Name || 'Player 2';
            player1AvatarPath = getDotsAvatarImagePath('avatar-default.png');
            player2AvatarPath = getDotsAvatarImagePath('avatar-default.png');
        }

        const player1Level = typeof getProfileLevel === 'function' ? getProfileLevel(player1DisplayName) : 1;
        const player2Level = dots_gameState.gameMode === 'single-player' && player2DisplayName === 'AI' 
            ? 1 
            : (typeof getProfileLevel === 'function' ? getProfileLevel(player2DisplayName) : 1);
        
        const player1Status = playerWon ? window.getTranslation('dots_status_winner', 'Winner') : window.getTranslation('dots_status_loser', 'Loser');
        const player2Status = playerWon ? window.getTranslation('dots_status_loser', 'Loser') : window.getTranslation('dots_status_winner', 'Winner');
        const statusColor = playerWon ? '#4CAF50' : '#FF6B6B';

        title.innerHTML = playerWon
            ? `<i class="fas fa-trophy" style="color: #FFD700; margin-right: 10px;"></i>${window.getTranslation('dots_victory', 'Victory!')}`
            : `<i class="fas fa-flag-checkered" style="color: #FF6B6B; margin-right: 10px;"></i>${window.getTranslation('dots_defeated', 'Defeated')}`;
        title.style.color = statusColor;

        message.innerHTML = `
            <div style="display: grid; gap: 20px;">
                <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; margin-bottom: 15px;">
                    <div style="background: rgba(255,255,255,0.12); border: 1px solid rgba(255,255,255,0.15); border-radius: 14px; padding: 20px; text-align: center;">
                        <img src="${player1AvatarPath}" onerror="this.src='assets/images/avatar-default.png'" alt="${player1DisplayName}" class="dots-splash-avatar" style="width:60px; height:60px; border-radius:50%; margin-bottom:8px; border:2px solid #ffd700;">
                        <h3 style="margin: 0 0 8px; font-size: 18px;">${player1DisplayName}</h3>
                        <p style="margin: 0 0 6px; color: #fff;">${window.getTranslation('modal_profile_lvl', 'Level ')}${player1Level}</p>
                        <p style="margin: 0; color: ${playerWon ? '#4CAF50' : '#FF6B6B'}; font-weight: 700;">${player1Status}</p>
                    </div>
                    <div style="background: rgba(255,255,255,0.12); border: 1px solid rgba(255,255,255,0.15); border-radius: 14px; padding: 20px; text-align: center;">
                        <img src="${player2AvatarPath}" onerror="this.src='assets/images/avatar-default.png'" alt="${player2DisplayName}" class="dots-splash-avatar" style="width:60px; height:60px; border-radius:50%; margin-bottom:8px; border:2px solid #ffd700;">
                        <h3 style="margin: 0 0 8px; font-size: 18px;">${player2DisplayName}</h3>
                        <p style="margin: 0 0 6px; color: #fff;">${window.getTranslation('modal_profile_lvl', 'Level ')}${player2Level}</p>
                        <p style="margin: 0; color: ${!playerWon ? '#4CAF50' : '#FF6B6B'}; font-weight: 700;">${player2Status}</p>
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
                <button id="dots_playAgainButton" disabled style="padding: 12px 30px; font-size: 16px; background: #777; color: white; border: none; border-radius: 5px; cursor: not-allowed; opacity: 0.6;">
                    <i class="fas fa-redo"></i> ${window.getTranslation('dots_play_again', 'Play Again')}
                </button>
                <button id="dots_homeButton" disabled style="padding: 12px 30px; font-size: 16px; background: #777; color: white; border: none; border-radius: 5px; cursor: not-allowed; opacity: 0.6;">
                    <i class="fas fa-home"></i> ${window.getTranslation('dots_exit', 'Exit')}
                </button>
            </div>
        `;

        showDotsScreen('dots_winnerSplashScreen');

        let countdown = 5;
        const countdownEl = document.getElementById('dots_resultCountdown');
        const playAgainButton = document.getElementById('dots_playAgainButton');
        const homeButton = document.getElementById('dots_homeButton');

        const interval = setInterval(() => {
            countdown--;
            if (countdownEl) countdownEl.textContent = countdown;
            if (countdown <= 0) {
                clearInterval(interval);
                if (playAgainButton) {
                    playAgainButton.removeAttribute('disabled');
                    playAgainButton.style.background = '#4CAF50';
                    playAgainButton.style.cursor = 'pointer';
                    playAgainButton.style.opacity = '1';
                    playAgainButton.onclick = () => {
                        splashScreen.classList.remove('active');
                        resetDotsGame();
                    };
                }
                if (homeButton) {
                    homeButton.removeAttribute('disabled');
                    homeButton.style.background = '#2196F3';
                    homeButton.style.cursor = 'pointer';
                    homeButton.style.opacity = '1';
                    homeButton.onclick = () => {
                        splashScreen.classList.remove('active');
                        exitToDotsHome();
                    };
                }
            }
        }, 1000);
    }

    function drawBoard() {
        if (!ctx || !canvas) return;

        const metrics = getGridMetrics();
        const spacing = metrics.spacing;
        const pad = metrics.padding;

        // Draw Board Background
        const boardSkinName = dots_gameState.selectedBoardSkin;
        const boardColors = skins.boards[boardSkinName] || skins.boards.dots_board_white;
        if (boardColors.gradient) {
            const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
            gradient.addColorStop(0, boardColors.color1 || '#ffffff');
            gradient.addColorStop(0.5, boardColors.color2 || '#f4e4c1');
            gradient.addColorStop(1, boardColors.color3 || '#ffffff');
            ctx.fillStyle = gradient;
        } else {
            ctx.fillStyle = boardColors.background;
        }
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Apply Zoom & Pan translations
        ctx.save();
        ctx.translate(dots_gameState.zoom.offsetX, dots_gameState.zoom.offsetY);
        ctx.scale(dots_gameState.zoom.scale, dots_gameState.zoom.scale);

        // 1. Draw Captured Boxes Fill Colors
        const boxSkinName = dots_gameState.selectedBoxSkin;
        const boxColors = skins.boxes[boxSkinName] || skins.boxes.dots_boxes_default;
        const lineSkinName = dots_gameState.selectedLineSkin;
        const lineSkin = skins.lines[lineSkinName] || skins.lines.dots_lines_default;

        for (let r = 0; r < dots_gameState.rows - 1; r++) {
            for (let c = 0; c < dots_gameState.cols - 1; c++) {
                const owner = dots_gameState.boxes[r][c];
                if (owner) {
                    // Check if this box is currently animating
                    let scale = 1.0;
                    const anim = boxesAnimationList.find(b => b.r === r && b.c === c);
                    if (anim) {
                        const elapsed = Date.now() - anim.startTime;
                        const pct = Math.min(elapsed / anim.duration, 1.0);
                        // Elastic scale bounce effect
                        scale = pct === 1.0 ? 1.0 : Math.sin(pct * Math.PI / 2);
                    }

                    const x = pad + c * spacing;
                    const y = pad + r * spacing;

                    ctx.save();
                    // Translate to box center to scale it up during birth
                    ctx.translate(x + spacing / 2, y + spacing / 2);
                    ctx.scale(scale, scale);

                    // Add glow effect for neon and crystal frost items
                    if (boxColors.glow) {
                        const glowColor = owner === 'player1' ? lineSkin.color1 : lineSkin.color2;
                        ctx.shadowColor = glowColor;
                        // Enhanced glow for neon pulse items
                        const glowIntensity = boxColors.animation === 'pulse' 
                            ? 8 + Math.sin(Date.now() / 300) * 3 
                            : 4;
                        ctx.shadowBlur = glowIntensity;
                    }

                    ctx.fillStyle = owner === 'player1' ? boxColors.fill1 : boxColors.fill2;
                    ctx.fillRect(-spacing / 2 + 1, -spacing / 2 + 1, spacing - 2, spacing - 2);

                    // Add dynamic subtle glowing neon border inside claimed boxes using line skin colors
                    const borderColor = owner === 'player1' ? lineSkin.color1 : lineSkin.color2;
                    ctx.strokeStyle = borderColor.includes('rgba') ? borderColor.replace(/0\.25/, '0.5') : borderColor.replace('rgb', 'rgba').replace(')', ', 0.5)');
                    ctx.lineWidth = Math.max(0.5, spacing * 0.02);
                    if (boxColors.glow || boxColors.animation === 'pulse') {
                        ctx.shadowColor = borderColor;
                        const glowIntensity = boxColors.animation === 'pulse' 
                            ? 8 + Math.sin(Date.now() / 300) * 2 
                            : 4;
                        ctx.shadowBlur = glowIntensity;
                    }
                    ctx.strokeRect(-spacing / 2 + 2, -spacing / 2 + 2, spacing - 4, spacing - 4);

                    // Draw inner initials using box skin colors for captured boxes
                    let letterColor = owner === 'player1' ? normalizeColorAlpha(boxColors.fill1, 1) : normalizeColorAlpha(boxColors.fill2, 1);
                    // If the selected board is Neon Pulse, force black initials for contrast
                    if (boardSkinName === 'dots_board_neon_pulse') {
                        letterColor = '#000000';
                    }
                    ctx.font = `bold ${Math.max(6, Math.floor(spacing * 0.35))}px Poppins`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.lineWidth = 2;
                    ctx.strokeStyle = 'rgba(0, 0, 0, 0.65)';
                    ctx.strokeText(getBoxLetter(owner), 0, 0);
                    ctx.fillStyle = letterColor;
                    ctx.fillText(getBoxLetter(owner), 0, 0);

                    ctx.restore();
                }
            }
        }

        // 2. Draw Hover Preview Line (Low opacity indicator)
        if (hoveredLine && !dots_gameState.gameOver && isLocalTurn()) {
            const r = hoveredLine.r;
            const c = hoveredLine.c;
            const type = hoveredLine.type;

            ctx.save();
            // Use selected line skin colors for hover preview
            const hoverColor = dots_gameState.currentPlayer === 'player1' ? lineSkin.color1 : lineSkin.color2;
            ctx.fillStyle = normalizeColorAlpha(hoverColor, 0.25);
            
            const lWidth = 6;
            if (type === 'h') {
                const x = pad + c * spacing;
                const y = pad + r * spacing;
                drawCapsule(x + 2, y - lWidth / 2, spacing - 4, lWidth);
            } else {
                const x = pad + c * spacing;
                const y = pad + r * spacing;
                drawCapsule(x - lWidth / 2, y + 2, lWidth, spacing - 4);
            }
            ctx.restore();
        }

        // 3. Draw Placed Lines
        const baseWidth = (lineSkin.width / 6) * Math.max(3, spacing * 0.12);

        // Horizontal Lines
        for (let r = 0; r < dots_gameState.rows; r++) {
            for (let c = 0; c < dots_gameState.cols - 1; c++) {
                if (dots_gameState.hLines[r][c]) {
                    const isLast = dots_gameState.lastMove && dots_gameState.lastMove.type === 'h' && dots_gameState.lastMove.r === r && dots_gameState.lastMove.c === c;
                    const owner = isHorizontalLineOwner(r, c); // Custom check based on surrounding claiming turn
                    const color = owner === 'player1' ? lineSkin.color1 : lineSkin.color2;

                    let widthMultiplier = 1.0;
                    const anim = linesAnimationList.find(l => l.type === 'h' && l.r === r && l.c === c);
                    if (anim) {
                        const elapsed = Date.now() - anim.startTime;
                        const pct = Math.min(elapsed / anim.duration, 1.0);
                        widthMultiplier = pct;
                    }

                    const x = pad + c * spacing;
                    const y = pad + r * spacing;

                    ctx.save();
                    if (lineSkin.glow || isLast) {
                        ctx.shadowColor = color;
                        // Enhanced glow for neon pulse items
                        const glowIntensity = lineSkin.animation === 'pulse' 
                            ? 12 + Math.sin(Date.now() / 300) * 4 
                            : (isLast ? 14 : 8);
                        ctx.shadowBlur = glowIntensity;
                    }
                    ctx.fillStyle = color;
                    const lw = baseWidth * widthMultiplier;
                    drawCapsule(x + 2, y - lw / 2, spacing - 4, lw);
                    ctx.restore();
                }
            }
        }

        // Vertical Lines
        for (let r = 0; r < dots_gameState.rows - 1; r++) {
            for (let c = 0; c < dots_gameState.cols; c++) {
                if (dots_gameState.vLines[r][c]) {
                    const isLast = dots_gameState.lastMove && dots_gameState.lastMove.type === 'v' && dots_gameState.lastMove.r === r && dots_gameState.lastMove.c === c;
                    const owner = isVerticalLineOwner(r, c);
                    const color = owner === 'player1' ? lineSkin.color1 : lineSkin.color2;

                    let widthMultiplier = 1.0;
                    const anim = linesAnimationList.find(l => l.type === 'v' && l.r === r && l.c === c);
                    if (anim) {
                        const elapsed = Date.now() - anim.startTime;
                        const pct = Math.min(elapsed / anim.duration, 1.0);
                        widthMultiplier = pct;
                    }

                    const x = pad + c * spacing;
                    const y = pad + r * spacing;

                    ctx.save();
                    if (lineSkin.glow || isLast) {
                        ctx.shadowColor = color;
                        // Enhanced glow for neon pulse items
                        const glowIntensity = lineSkin.animation === 'pulse' 
                            ? 12 + Math.sin(Date.now() / 300) * 4 
                            : (isLast ? 14 : 8);
                        ctx.shadowBlur = glowIntensity;
                    }
                    ctx.fillStyle = color;
                    const lw = baseWidth * widthMultiplier;
                    drawCapsule(x - lw / 2, y + 2, lw, spacing - 4);
                    ctx.restore();
                }
            }
        }

        // 4. Draw Circular Grid Dots (supports gradient boards and Neon Pulse animation)
        const boardSkin = skins.boards[boardSkinName] || skins.boards.dots_board_white;
        const isDarkBoard = boardSkin.background && (boardSkin.background.toLowerCase() === '#000000' || boardSkin.background.toLowerCase() === '#1a1a1a');
        const dotGlow = boardSkin.glow || false;
        const dotPulse = boardSkin.animation === 'pulse';

        // Helper: interpolate two hex colors
        function hexToRgb(hex) {
            const h = hex.replace('#','');
            const full = h.length === 3 ? h.split('').map(c=>c+c).join('') : h;
            const bigint = parseInt(full,16);
            return [(bigint>>16)&255, (bigint>>8)&255, bigint&255];
        }
        function rgbToHex(r,g,b){
            return '#' + [r,g,b].map(v=>{ const s = v.toString(16); return s.length===1? '0'+s : s; }).join('');
        }
        function lerpHex(a,b,t){
            const A = hexToRgb(a); const B = hexToRgb(b);
            const R = Math.round(A[0] + (B[0]-A[0])*t);
            const G = Math.round(A[1] + (B[1]-A[1])*t);
            const Bc = Math.round(A[2] + (B[2]-A[2])*t);
            return rgbToHex(R,G,Bc);
        }

        // Neon colors for pulse (magenta <-> cyan)
        const neonA = '#FF00FF';
        const neonB = '#00FFFF';

        for (let r = 0; r < dots_gameState.rows; r++) {
            for (let c = 0; c < dots_gameState.cols; c++) {
                const x = pad + c * spacing;
                const y = pad + r * spacing;

                ctx.save();
                ctx.beginPath();
                const baseRadius = dots_gameState.boardSize === 'large' ? 4 : 6;

                // For Neon Pulse board, animate color and glow per-dot for a lively effect
                if (dotPulse) {
                    const t = (Math.sin(Date.now() / 200 + (r + c) * 0.35) + 1) / 2; // 0..1 oscillation
                    const fillCol = lerpHex(neonA, neonB, t);
                    const glowCol = lerpHex(neonB, neonA, 1 - t);
                    const radius = baseRadius + Math.sin(Date.now() / 300 + (r + c) * 0.25) * 1.2;
                    ctx.arc(x, y, Math.max(1.5, radius), 0, 2 * Math.PI);
                    const glowIntensity = 6 + Math.sin(Date.now() / 200 + (r + c) * 0.4) * 3;
                    ctx.shadowColor = glowCol;
                    ctx.shadowBlur = glowIntensity;
                    ctx.shadowOffsetY = 0;
                    ctx.fillStyle = fillCol;
                } else if (dotGlow) {
                    ctx.arc(x, y, baseRadius, 0, 2 * Math.PI);
                    ctx.shadowColor = '#ffffff';
                    ctx.shadowBlur = 4;
                    ctx.shadowOffsetY = 0;
                    ctx.fillStyle = isDarkBoard ? '#ffffff' : '#000000';
                } else {
                    ctx.arc(x, y, baseRadius, 0, 2 * Math.PI);
                    ctx.shadowColor = isDarkBoard ? '#ffffff' : '#000000';
                    ctx.shadowBlur = 4;
                    ctx.shadowOffsetY = 1;
                    ctx.fillStyle = isDarkBoard ? '#ffffff' : '#000000';
                }

                ctx.fill();
                ctx.restore();
            }
        }

        ctx.restore();
    }

    function drawCapsule(x, y, w, h) {
        ctx.beginPath();
        ctx.roundRect(x, y, w, h, Math.min(w, h) / 2);
        ctx.fill();
    }

    function normalizeColorAlpha(color, alpha) {
        if (color.startsWith('rgba')) {
            return color.replace(/rgba\(([^,]+),([^,]+),([^,]+),[^)]+\)/, `rgba($1,$2,$3,${alpha})`);
        }
        if (color.startsWith('rgb')) {
            return color.replace(/rgb\(([^,]+),([^,]+),([^,]+)\)/, `rgba($1,$2,$3,${alpha})`);
        }
        // For hex colors, convert manually
        if (color.startsWith('#')) {
            const hex = color.slice(1);
            const bigint = parseInt(hex.length === 3 ? hex.split('').map(c => c + c).join('') : hex, 16);
            const r = (bigint >> 16) & 255;
            const g = (bigint >> 8) & 255;
            const b = bigint & 255;
            return `rgba(${r},${g},${b},${alpha})`;
        }
        return color;
    }

    // Workaround owners helper. In simple structure, line color corresponds to who placed it
    // We attach placements mapping
    const linesOwnership = {}; // key format: "h_r_c" or "v_r_c" -> 'player1'|'player2'

    function markLineOwner(type, r, c, player) {
        linesOwnership[`${type}_${r}_${c}`] = player;
    }
    // FIX #2: Expose markLineOwner globally so multiplayer sync can record ownership
    // without going through makeMove (which would trigger AI / turn logic incorrectly)
    window.dots_markLineOwner = markLineOwner;
    // Expose drawBoard so multiplayer sync can trigger a canvas redraw after state changes
    window.dots_drawBoard = () => drawBoard();

    function isHorizontalLineOwner(r, c) {
        return linesOwnership[`h_${r}_${c}`] || 'player1';
    }

    function isVerticalLineOwner(r, c) {
        return linesOwnership[`v_${r}_${c}`] || 'player1';
    }

    // Helper to determine if it is the local user's active turn
    function isLocalTurn() {
        // Spectators can never take a turn
        if (window.dots_multiplayer && window.dots_multiplayer.playerRole === 'spectator') {
            return false;
        }
        if (dots_gameState.gameMode === 'online') {
            return dots_gameState.currentPlayer === dots_gameState.playerColor;
        }
        if (dots_gameState.gameMode === 'single-player') {
            return dots_gameState.currentPlayer === 'player1';
        }
        return true; // local pass-and-play
    }

    // =====================================================
    // EVENT HANDLING & GESTURES
    // =====================================================

    function setupInteractionEvents() {
        let isPointerDown = false;
        let dragOriginX = 0;
        let dragOriginY = 0;
        let isCameraPanning = false;

        // Mouse & Touch Combined listeners
        canvas.addEventListener('pointerdown', (e) => {
            isPointerDown = true;
            isCameraPanning = false;

            // Pan start capture (only in large mode or if zoomed in)
            if (dots_gameState.boardSize === 'large' || dots_gameState.zoom.scale > 1.0) {
                dots_gameState.zoom.isDragging = true;
                dots_gameState.zoom.startX = e.clientX - dots_gameState.zoom.offsetX;
                dots_gameState.zoom.startY = e.clientY - dots_gameState.zoom.offsetY;
                dragOriginX = e.clientX;
                dragOriginY = e.clientY;
            }
        });

        canvas.addEventListener('pointermove', (e) => {
            if (!isPointerDown) {
                // Not dragging, just hover indicator updates
                updateHoverState(e.clientX, e.clientY);
                return;
            }

            // Determine if panning threshold met
            if (dots_gameState.zoom.isDragging) {
                const dist = Math.hypot(e.clientX - dragOriginX, e.clientY - dragOriginY);
                if (dist > 5) {
                    isCameraPanning = true;
                    const size = canvas.width / window.devicePixelRatio;
                    const maxOffset = size * (dots_gameState.zoom.scale - 1);
                    dots_gameState.zoom.offsetX = Math.max(-maxOffset, Math.min(0, e.clientX - dots_gameState.zoom.startX));
                    dots_gameState.zoom.offsetY = Math.max(-maxOffset, Math.min(0, e.clientY - dots_gameState.zoom.startY));
                    drawBoard();
                }
            }
        });

        canvas.addEventListener('pointerup', (e) => {
            isPointerDown = false;
            dots_gameState.zoom.isDragging = false;

            if (isCameraPanning) {
                isCameraPanning = false;
                return;
            }

            // FIX #2/#8: Debounce: ignore clicks that come within MOVE_COOLDOWN_MS of the last move.
            // This prevents a second line being placed when the user clicks quickly
            // (hover suggestion changes immediately after first line, second tap hits new suggestion).
            const now = Date.now();
            if (now - lastMovePlacedAt < MOVE_COOLDOWN_MS) return;

            // Perform Line placement action
            if (!dots_gameState.gameOver && isLocalTurn()) {
                handleBoardClick(e.clientX, e.clientY);
            }
        });

        canvas.addEventListener('pointerleave', () => {
            isPointerDown = false;
            dots_gameState.zoom.isDragging = false;
            hoveredLine = null;
            drawBoard();
        });

        // Zoom wheel listener
        canvas.addEventListener('wheel', (e) => {
            if (dots_gameState.boardSize !== 'large') return;
            e.preventDefault();

            const zoomFactor = 1.1;
            const mouseCoords = screenToGridCoords(e.clientX, e.clientY);

            const oldScale = dots_gameState.zoom.scale;
            if (e.deltaY < 0) {
                dots_gameState.zoom.scale = Math.min(dots_gameState.zoom.scale * zoomFactor, 3.8);
            } else {
                dots_gameState.zoom.scale = Math.max(dots_gameState.zoom.scale / zoomFactor, 1.0);
            }

            // Adjust offset to zoom centered on mouse cursor location
            const scaleRatio = dots_gameState.zoom.scale / oldScale;
            const bounds = canvas.getBoundingClientRect();
            const mx = e.clientX - bounds.left;
            const my = e.clientY - bounds.top;

            dots_gameState.zoom.offsetX = mx - (mx - dots_gameState.zoom.offsetX) * scaleRatio;
            dots_gameState.zoom.offsetY = my - (my - dots_gameState.zoom.offsetY) * scaleRatio;

            // Constrain zoom offset bounds
            const size = canvas.width / window.devicePixelRatio;
            const maxOffset = size * (dots_gameState.zoom.scale - 1);
            dots_gameState.zoom.offsetX = Math.max(-maxOffset, Math.min(0, dots_gameState.zoom.offsetX));
            dots_gameState.zoom.offsetY = Math.max(-maxOffset, Math.min(0, dots_gameState.zoom.offsetY));

            drawBoard();
        }, { passive: false });

        // Double click reset zoom
        canvas.addEventListener('dblclick', () => {
            if (dots_gameState.boardSize === 'large') {
                resetCamera();
                drawBoard();
            }
        });
    }

    // Detect closest grid line based on transformed cursor coordinate
    function getClosestLine(screenX, screenY) {
        const metrics = getGridMetrics();
        const spacing = metrics.spacing;
        const pad = metrics.padding;

        const coords = screenToGridCoords(screenX, screenY);
        const bx = coords.x;
        const by = coords.y;

        let closest = null;
        let minDistance = spacing * 0.45; // Max threshold distance

        // Check horizontal lines
        for (let r = 0; r < dots_gameState.rows; r++) {
            for (let c = 0; c < dots_gameState.cols - 1; c++) {
                if (dots_gameState.hLines[r][c]) continue;
                
                const lx1 = pad + c * spacing;
                const ly1 = pad + r * spacing;
                const lx2 = lx1 + spacing;
                
                // Point-to-segment distance
                const dist = distToSegment(bx, by, lx1, ly1, lx2, ly1);
                if (dist < minDistance) {
                    minDistance = dist;
                    closest = { type: 'h', r: r, c: c, distance: dist };
                }
            }
        }

        // Check vertical lines
        for (let r = 0; r < dots_gameState.rows - 1; r++) {
            for (let c = 0; c < dots_gameState.cols; c++) {
                if (dots_gameState.vLines[r][c]) continue;

                const lx1 = pad + c * spacing;
                const ly1 = pad + r * spacing;
                const ly2 = ly1 + spacing;

                const dist = distToSegment(bx, by, lx1, ly1, lx1, ly2);
                if (dist < minDistance) {
                    minDistance = dist;
                    closest = { type: 'v', r: r, c: c, distance: dist };
                }
            }
        }

        return closest;
    }

    // Distance math helpers
    function distToSegment(px, py, x1, y1, x2, y2) {
        const l2 = Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2);
        if (l2 === 0) return Math.hypot(px - x1, py - y1);
        let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
        t = Math.max(0, Math.min(1, t));
        return Math.hypot(px - (x1 + t * (x2 - x1)), py - (y1 + t * (y2 - y1)));
    }

    function updateHoverState(screenX, screenY) {
        if (dots_gameState.gameOver || !isLocalTurn()) {
            hoveredLine = null;
            return;
        }

        const line = getClosestLine(screenX, screenY);
        if (line) {
            if (!hoveredLine || hoveredLine.type !== line.type || hoveredLine.r !== line.r || hoveredLine.c !== line.c) {
                hoveredLine = line;
                drawBoard();
            }
        } else if (hoveredLine) {
            hoveredLine = null;
            drawBoard();
        }
    }

    // Trigger local move placement
    function handleBoardClick(screenX, screenY) {
        const line = getClosestLine(screenX, screenY);
        if (!line) return;

        makeMove(line.type, line.r, line.c);
    }

    // Core Game Move Action
    function makeMove(type, r, c) {
        const activePlayer = dots_gameState.currentPlayer;

        // FIX #2/#8: Record timestamp of this move for click debounce
        lastMovePlacedAt = Date.now();
        // Clear hover immediately so a queued pointer event can't re-trigger
        hoveredLine = null;

        if (type === 'h') {
            if (dots_gameState.hLines[r][c]) return;
            dots_gameState.hLines[r][c] = true;
        } else {
            if (dots_gameState.vLines[r][c]) return;
            dots_gameState.vLines[r][c] = true;
        }

        markLineOwner(type, r, c, activePlayer);
        dots_gameState.lastMove = { type: type, r: r, c: c };

        // Play line animation
        linesAnimationList.push({ type: type, r: r, c: c, startTime: Date.now(), duration: ANIMATION_DURATION });

        // Check if boxes were completed
        const boxesCompleted = checkBoxesCompleted(type, r, c, activePlayer);
        
        // Visual redraw triggers
        if (animationFrameId) cancelAnimationFrame(animationFrameId);
        runAnimationLoop();

        // If online mode, sync placement data directly to firebase database
        // (only for non-box-completing moves; box-completing moves call sendLinePlacement after score update below)
        if (dots_gameState.gameMode === 'online' && boxesCompleted.length === 0) {
            if (activePlayer === dots_gameState.playerColor) {
                window.dots_multiplayer.sendLinePlacement(type, r, c, false);
            }
        }

        if (boxesCompleted.length > 0) {
            // Player gets a bonus turn!
            dots_gameState.scores[activePlayer] += boxesCompleted.length;
            
            // Register box animations
            boxesCompleted.forEach(b => {
                boxesAnimationList.push({ r: b.r, c: b.c, startTime: Date.now(), duration: ANIMATION_DURATION });
            });

            // Update DOM counters
            updateUIElements();

            // If online mode, sync placement data AFTER score update so the total is correct
            if (dots_gameState.gameMode === 'online') {
                if (activePlayer === dots_gameState.playerColor) {
                    window.dots_multiplayer.sendLinePlacement(type, r, c, true);
                }
                // Online game-end is handled by Firestore via sendLinePlacement; skip local declareWinner
                return;
            }

            // Check game win end criteria (offline modes only)
            if (checkGameFinished()) {
                declareWinner();
                return;
            }

            // FIX #1: AI bonus turn — release aiThinking BEFORE calling triggerAiOrTurnCycle
            // so the AI can make its next move. Without this release, aiThinking=true blocks
            // the bonus-turn trigger and the AI freezes after capturing a box.
            if (activePlayer === 'player2') {
                aiThinking = false;
            }
            triggerAiOrTurnCycle();
        } else {
            // Alternate turn to the opponent
            dots_gameState.currentPlayer = activePlayer === 'player1' ? 'player2' : 'player1';
            updateUIElements();

            if (dots_gameState.gameMode === 'online') {
                // Online multiplayer handles synchronization externally via listener ticks
            } else {
                // FIX #3: If AI just finished its turn (activePlayer was player2), release flag
                if (activePlayer === 'player2') {
                    aiThinking = false;
                }
                triggerAiOrTurnCycle();
            }
        }
    }
    // FIX #2/#8: Guard makeMoveDirect so leftover listeners can't ghost-move in offline games
    window.dots_makeMoveDirect = function(type, r, c) {
        if (dots_gameState.gameMode !== 'online') return; // Only allow in online mode
        makeMove(type, r, c);
    };


    function runAnimationLoop() {
        const now = Date.now();
        
        // Remove finished animations
        linesAnimationList = linesAnimationList.filter(l => now - l.startTime < l.duration);
        boxesAnimationList = boxesAnimationList.filter(b => now - b.startTime < b.duration);

        drawBoard();

        // Continue animation loop if there are animations OR if we have neon pulse items selected
        const lineSkinName = dots_gameState.selectedLineSkin;
        const boardSkinName = dots_gameState.selectedBoardSkin;
        const lineSkin = skins.lines[lineSkinName] || skins.lines.dots_lines_default;
        const boardSkin = skins.boards[boardSkinName] || skins.boards.dots_board_white;
        const hasNeonAnimation = (lineSkin.animation === 'pulse') || (boardSkin.animation === 'pulse');

        if (linesAnimationList.length > 0 || boxesAnimationList.length > 0 || hasNeonAnimation) {
            animationFrameId = requestAnimationFrame(runAnimationLoop);
        } else {
            animationFrameId = null;
        }
    }

    // Helper to evaluate box completion status
    function checkBoxesCompleted(type, r, c, activePlayer) {
        const completed = [];
        
        if (type === 'h') {
            // Horizontal line affects box above and box below
            // Box above: row = r-1, col = c
            if (r > 0) {
                if (isBoxFilled(r - 1, c)) {
                    dots_gameState.boxes[r - 1][c] = activePlayer;
                    completed.push({ r: r - 1, c: c });
                }
            }
            // Box below: row = r, col = c
            if (r < dots_gameState.rows - 1) {
                if (isBoxFilled(r, c)) {
                    dots_gameState.boxes[r][c] = activePlayer;
                    completed.push({ r: r, c: c });
                }
            }
        } else {
            // Vertical line affects box left and box right
            // Box left: row = r, col = c-1
            if (c > 0) {
                if (isBoxFilled(r, c - 1)) {
                    dots_gameState.boxes[r][c - 1] = activePlayer;
                    completed.push({ r: r, c: c - 1 });
                }
            }
            // Box right: row = r, col = c
            if (c < dots_gameState.cols - 1) {
                if (isBoxFilled(r, c)) {
                    dots_gameState.boxes[r][c] = activePlayer;
                    completed.push({ r: r, c: c });
                }
            }
        }

        return completed;
    }

    function isBoxFilled(r, c) {
        return dots_gameState.hLines[r][c] &&
               dots_gameState.hLines[r + 1][c] &&
               dots_gameState.vLines[r][c] &&
               dots_gameState.vLines[r][c + 1];
    }

    // Check how many sides are already filled for a specific box (0-4)
    function getBoxSidesCount(r, c) {
        let count = 0;
        if (dots_gameState.hLines[r][c]) count++;
        if (dots_gameState.hLines[r + 1][c]) count++;
        if (dots_gameState.vLines[r][c]) count++;
        if (dots_gameState.vLines[r][c + 1]) count++;
        return count;
    }

    function checkGameFinished() {
        const maxBoxes = (dots_gameState.rows - 1) * (dots_gameState.cols - 1);
        const claimed = dots_gameState.scores.player1 + dots_gameState.scores.player2;
        return claimed >= maxBoxes;
    }

    function declareWinner() {
        dots_gameState.gameOver = true;
        if (dots_gameState.scores.player1 > dots_gameState.scores.player2) {
            dots_gameState.winner = 'player1';
        } else if (dots_gameState.scores.player2 > dots_gameState.scores.player1) {
            dots_gameState.winner = 'player2';
        } else {
            dots_gameState.winner = 'draw';
        }

        // Update user stats and trigger Dama-style result splash screen
        saveStatsToProfile();

        const elapsedSeconds = dots_gameState.startTime ? Math.floor((Date.now() - dots_gameState.startTime) / 1000) : 0;
        const timePlayed = `${Math.floor(elapsedSeconds / 60)}m ${elapsedSeconds % 60}s`;
        
        // Dynamic coins/score mapping
        const diffMap = { easy: 5, medium: 10, hard: 18, extreme: 30 };
        const coinsEarned = dots_gameState.winner === 'player1' ? (diffMap[dots_gameState.aiDifficulty] || 10) : 2;
        const scoreEarned = dots_gameState.winner === 'player1' ? 30 : 5;

        setTimeout(() => {
            showDotsGameResultSplash(
                dots_gameState.winner === 'player1',
                scoreEarned,
                coinsEarned,
                timePlayed,
                dots_gameState.gameMode === 'single-player' ? (JSON.parse(localStorage.getItem('currentUser') || '{}').username || window.getTranslation('dots_player', 'Player')) : window.getTranslation('dots_player_1', 'Player 1'),
                dots_gameState.gameMode === 'single-player' ? window.getTranslation('dots_ai_label', 'AI') : window.getTranslation('dots_player_2', 'Player 2')
            );
        }, 600);
    }

    // Save final scores and increments
    function saveStatsToProfile() {
        try {
            if (dots_gameState.gameMode === 'online') {
                // Online matchmaking updates profile statistics directly in network room callbacks
                return;
            }

            const meWon = dots_gameState.winner === 'player1';
            const draw = dots_gameState.winner === 'draw';
            const elapsedSeconds = dots_gameState.startTime ? Math.floor((Date.now() - dots_gameState.startTime) / 1000) : 0;
            const elapsedMinutes = Math.max(1, Math.round(elapsedSeconds / 60));

            // Dynamic coins mapping
            const diffMap = { easy: 5, medium: 10, hard: 18, extreme: 30 };
            const coinsEarned = meWon ? (diffMap[dots_gameState.aiDifficulty] || 10) : 2;
            const scoreEarned = meWon ? 30 : 5;

            // Global updater updates
            if (typeof updatePlayerStats === 'function') {
                updatePlayerStats(dots_gameState.gameMode, meWon ? 'win' : (draw ? 'draw' : 'loss'), scoreEarned, coinsEarned, elapsedMinutes);
            }

            if (typeof updateGameStats === 'function') {
                updateGameStats('dots_and_boxes', meWon ? 'win' : (draw ? 'draw' : 'loss'), scoreEarned, {
                    capturedBoxes: dots_gameState.scores.player1,
                    lastPlayed: new Date().toLocaleString()
                });
            }
        } catch (e) {
            console.log('Error writing profiles database:', e);
        }
    }

    // Turn cycling: check if AI is due to run
    function triggerAiOrTurnCycle() {
        if (dots_gameState.gameOver) return;

        if (dots_gameState.gameMode === 'single-player' && dots_gameState.currentPlayer === 'player2') {
            // FIX #3: Prevent concurrent AI calls (ghost lines bug)
            if (aiThinking) return;
            aiThinking = true;
            // Trigger AI line computation after artificial delay
            setTimeout(() => {
                computeAiMove();
            }, 550);
        }
    }

    // =====================================================
    // SINGLE PLAYER AI IMPLEMENTATION
    // =====================================================

    function computeAiMove() {
        if (dots_gameState.gameOver) return;
        if (dots_gameState.currentPlayer !== 'player2') {
            // FIX #3: Guard to prevent AI from playing out of turn; release flag
            aiThinking = false;
            return;
        }
        const legalMoves = getLegalMoves();
        if (legalMoves.length === 0) {
            aiThinking = false;
            return;
        }

        let selected = null;
        const diff = dots_gameState.aiDifficulty;

        if (diff === 'easy') {
            selected = selectEasyMove(legalMoves);
        } else if (diff === 'medium') {
            selected = selectMediumMove(legalMoves);
        } else if (diff === 'hard') {
            selected = selectHardMove(legalMoves);
        } else {
            selected = selectExtremeMove(legalMoves);
        }

        if (selected) {
            makeMove(selected.type, selected.r, selected.c);
            // Note: aiThinking is released in makeMove -> else branch when player switches back to player1
        } else {
            aiThinking = false;
        }
    }

    // Fetch all undrawn grid lines
    // FIX #5: Shuffle the list so AI doesn't always start from the same corner
    function getLegalMoves() {
        const list = [];
        
        // H lines
        for (let r = 0; r < dots_gameState.rows; r++) {
            for (let c = 0; c < dots_gameState.cols - 1; c++) {
                if (!dots_gameState.hLines[r][c]) {
                    list.push({ type: 'h', r: r, c: c });
                }
            }
        }

        // V lines
        for (let r = 0; r < dots_gameState.rows - 1; r++) {
            for (let c = 0; c < dots_gameState.cols; c++) {
                if (!dots_gameState.vLines[r][c]) {
                    list.push({ type: 'v', r: r, c: c });
                }
            }
        }

        // Shuffle so AI starts in different positions each game
        for (let i = list.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [list[i], list[j]] = [list[j], list[i]];
        }

        return list;
    }

    // 1. Easy: Makes random legal moves (completely random)
    function selectEasyMove(legalMoves) {
        return legalMoves[Math.floor(Math.random() * legalMoves.length)];
    }

    // 2. Medium: FIX #6 - Genuinely easier than Hard.
    // Will claim boxes when possible, but 40% of the time makes a random move,
    // and does NOT avoid giving away 3-sided boxes (no safe-move filtering).
    function selectMediumMove(legalMoves) {
        // 40% chance to just make a completely random move (makes mistakes)
        if (Math.random() < 0.40) {
            return legalMoves[Math.floor(Math.random() * legalMoves.length)];
        }

        // Claim boxes if immediately available
        const claimMoves = findClaimingMoves(legalMoves);
        if (claimMoves.length > 0) {
            return claimMoves[Math.floor(Math.random() * claimMoves.length)];
        }

        // Otherwise pick a random legal move (no safe filtering — will often give away boxes)
        return legalMoves[Math.floor(Math.random() * legalMoves.length)];
    }

    // 3. Hard: FIX #6 - This is the original Medium behavior. Claims boxes,
    // avoids giving away 3-sided boxes (safe moves), sacrifices smallest chain if forced.
    function selectHardMove(legalMoves) {
        const claimMoves = findClaimingMoves(legalMoves);
        if (claimMoves.length > 0) {
            return claimMoves[0];
        }

        const safeMoves = filterSafeMoves(legalMoves);
        if (safeMoves.length > 0) {
            // Pick randomly from safe moves to add some variation
            return safeMoves[Math.floor(Math.random() * safeMoves.length)];
        }

        // Giving away is inevitable — find the move that gives the opponent the smallest chain
        return findOptimalSacrificeMove(legalMoves);
    }

    // 4. Extreme: FIX #5 - Full chain analysis with double-cross, but now starts
    // at random positions (getLegalMoves is shuffled) and picks randomly from safe moves
    // instead of always taking safeMoves[0].
    function selectExtremeMove(legalMoves) {
        const claimMoves = findClaimingMoves(legalMoves);
        
        // Double-cross logic: If we are capturing a chain, and we are at the last 2 boxes,
        // and there are other closed chains left, we can "double-cross" (leave 2 boxes) to force opponent to move first.
        if (claimMoves.length > 0) {
            const chains = detectAllChains();
            const currentChain = chains.find(ch => ch.some(b => isBoxThreeSided(b.r, b.c)));
            
            if (currentChain && currentChain.length >= 2) {
                // If this is the last chain, just capture it completely
                const activeChainsCount = chains.filter(ch => ch.length > 0).length;
                
                if (activeChainsCount > 1) {
                    // Check if we are down to the last 2 boxes of the current chain
                    const remainingInChain = currentChain.filter(b => getBoxSidesCount(b.r, b.c) === 3);
                    if (remainingInChain.length === 2) {
                        // Double cross! Draw a line that keeps them at 3 sides but doesn't complete either,
                        // giving opponent 2 boxes but making them play first next turn.
                        const doubleCrossLine = findDoubleCrossLine(remainingInChain);
                        if (doubleCrossLine) {
                            return doubleCrossLine;
                        }
                    }
                }
            }
            return claimMoves[0];
        }

        const safeMoves = filterSafeMoves(legalMoves);
        if (safeMoves.length > 0) {
            // FIX #5: Pick randomly from safe moves rather than always [0]
            // This ensures AI doesn't always build in the same corner/direction.
            return safeMoves[Math.floor(Math.random() * Math.max(1, Math.ceil(safeMoves.length * 0.4)))];
        }

        // Sacrifice smallest chain
        return findOptimalSacrificeMove(legalMoves);
    }

    // Heuristics Helper logic for AI solver
    function findClaimingMoves(legalMoves) {
        const claims = [];
        legalMoves.forEach(m => {
            if (doesLineCompleteBox(m.type, m.r, m.c)) {
                claims.push(m);
            }
        });
        return claims;
    }

    function doesLineCompleteBox(type, r, c) {
        if (type === 'h') {
            if (r > 0 && getBoxSidesCount(r - 1, c) === 3) return true;
            if (r < dots_gameState.rows - 1 && getBoxSidesCount(r, c) === 3) return true;
        } else {
            if (c > 0 && getBoxSidesCount(r, c - 1) === 3) return true;
            if (c < dots_gameState.cols - 1 && getBoxSidesCount(r, c) === 3) return true;
        }
        return false;
    }

    function isBoxThreeSided(r, c) {
        return getBoxSidesCount(r, c) === 3;
    }

    // Filter lines where drawing them will not make any adjacent box have 3 sides drawn
    function filterSafeMoves(legalMoves) {
        return legalMoves.filter(m => {
            // Temporarily apply line
            if (m.type === 'h') {
                dots_gameState.hLines[m.r][m.c] = true;
            } else {
                dots_gameState.vLines[m.r][m.c] = true;
            }

            let unsafe = false;
            if (m.type === 'h') {
                if (m.r > 0 && getBoxSidesCount(m.r - 1, m.c) === 3) unsafe = true;
                if (m.r < dots_gameState.rows - 1 && getBoxSidesCount(m.r, m.c) === 3) unsafe = true;
            } else {
                if (m.c > 0 && getBoxSidesCount(m.r, m.c - 1) === 3) unsafe = true;
                if (m.c < dots_gameState.cols - 1 && getBoxSidesCount(m.r, m.c) === 3) unsafe = true;
            }

            // Undo placement
            if (m.type === 'h') {
                dots_gameState.hLines[m.r][m.c] = false;
            } else {
                dots_gameState.vLines[m.r][m.c] = false;
            }

            return !unsafe;
        });
    }

    // Returns a line move that gives the opponent the shortest capture chain
    function findOptimalSacrificeMove(legalMoves) {
        let bestMove = legalMoves[0];
        let minChainLength = Infinity;

        legalMoves.forEach(m => {
            // Apply line
            if (m.type === 'h') {
                dots_gameState.hLines[m.r][m.c] = true;
            } else {
                dots_gameState.vLines[m.r][m.c] = true;
            }

            // Calculate chain size created
            const chains = detectAllChains();
            // Count total three-sided boxes that can now be taken
            let currentChainSize = 0;
            chains.forEach(ch => {
                const openCount = ch.filter(b => getBoxSidesCount(b.r, b.c) === 3).length;
                if (openCount > currentChainSize) {
                    currentChainSize = openCount;
                }
            });

            if (currentChainSize < minChainLength) {
                minChainLength = currentChainSize;
                bestMove = m;
            }

            // Revert
            if (m.type === 'h') {
                dots_gameState.hLines[m.r][m.c] = false;
            } else {
                dots_gameState.vLines[m.r][m.c] = false;
            }
        });

        return bestMove;
    }

    // Double-cross: Draw a line inside one of the two boxes of a chain that makes both boxes have 3 sides,
    // but does NOT complete either, leaving them for the opponent.
    function findDoubleCrossLine(twoBoxes) {
        const box1 = twoBoxes[0];
        const box2 = twoBoxes[1];

        // Find the shared line between the two boxes if they are adjacent
        // Otherwise draw a line on one of their borders that doesn't complete any box
        const legal = getLegalMoves();
        
        // Find a line that is shared or on the perimeter of these two boxes
        // We'll iterate through legal moves and see if they belong to box1 or box2 but DO NOT make sides count = 4
        for (let i = 0; i < legal.length; i++) {
            const m = legal[i];
            // Apply temporarily
            if (m.type === 'h') {
                dots_gameState.hLines[m.r][m.c] = true;
            } else {
                dots_gameState.vLines[m.r][m.c] = true;
            }

            const completesAny = doesLineCompleteBox(m.type, m.r, m.c);

            // Revert
            if (m.type === 'h') {
                dots_gameState.hLines[m.r][m.c] = false;
            } else {
                dots_gameState.vLines[m.r][m.c] = false;
            }

            if (!completesAny) {
                // Check if this line is on one of the boxes
                if (isLineInBox(m, box1) || isLineInBox(m, box2)) {
                    return m;
                }
            }
        }
        return null;
    }

    function isLineInBox(m, box) {
        const r = box.r;
        const c = box.c;
        if (m.type === 'h') {
            return (m.r === r && m.c === c) || (m.r === r + 1 && m.c === c);
        } else {
            return (m.r === r && m.c === c) || (m.r === r && m.c === c + 1);
        }
    }

    // Traverse board to group boxes into chains (connected lines)
    function detectAllChains() {
        const visited = Array(dots_gameState.rows - 1).fill().map(() => Array(dots_gameState.cols - 1).fill(false));
        const chains = [];

        for (let r = 0; r < dots_gameState.rows - 1; r++) {
            for (let c = 0; c < dots_gameState.cols - 1; c++) {
                if (dots_gameState.boxes[r][c] || visited[r][c]) continue;

                // Simple BFS/DFS traversal to find connected chain of 3-sided boxes
                const chain = [];
                traverseChain(r, c, visited, chain);
                if (chain.length > 0) {
                    chains.push(chain);
                }
            }
        }
        return chains;
    }

    function traverseChain(r, c, visited, chain) {
        if (r < 0 || r >= dots_gameState.rows - 1 || c < 0 || c >= dots_gameState.cols - 1) return;
        if (dots_gameState.boxes[r][c] || visited[r][c]) return;

        // In Dots & Boxes, chain links are 3-sided boxes or elements connected by shared walls
        const sides = getBoxSidesCount(r, c);
        if (sides >= 2) {
            visited[r][c] = true;
            chain.push({ r: r, c: c });

            // Check adjacent boxes if they share an open/closed wall
            // Above
            if (!dots_gameState.hLines[r][c]) traverseChain(r - 1, c, visited, chain);
            // Below
            if (!dots_gameState.hLines[r + 1][c]) traverseChain(r + 1, c, visited, chain);
            // Left
            if (!dots_gameState.vLines[r][c]) traverseChain(r, c - 1, visited, chain);
            // Right
            if (!dots_gameState.vLines[r][c + 1]) traverseChain(r, c + 1, visited, chain);
        }
    }

    // =====================================================
    // ROUTING & MENU ACTION BUTTON HANDLERS
    // =====================================================

    window.showDotsMultiplayerModeScreen = function () {
        dots_gameState.gameMode = 'online';
        showDotsScreen('dots_multiplayerModeScreen');
    };

    window.backToDotsModeScreen = function () {
        showDotsScreen('dots_modeScreen');
    };

    window.backToDotsTypeScreen = function () {
        showDotsScreen('dots_typeScreen');
    };

    window.backToDotsMultiplayerModeScreen = function () {
        showDotsScreen('dots_multiplayerModeScreen');
    };

    window.resetDotsGame = function () {
        setupBoard(dots_gameState.boardSize);
        dots_gameState.startTime = Date.now();
        document.getElementById('dots_gameOverModal').classList.remove('active');
        updateUIElements();
        // FIX #4: Navigate back to game screen (prevents black page after Play Again)
        showDotsScreen('dots_gameScreen');
    };

    window.newDotsGame = function () {
        document.getElementById('dots_gameOverModal').classList.remove('active');
        window.resetDotsGame();
    };

    window.exitToDotsHome = function () {
        document.getElementById('dots_gameOverModal').classList.remove('active');
        showDotsScreen('dots_modeScreen');
    };

    window.showDotsRoomActionScreen = function (action) {
        window.dotsRoomActionType = action; // 'create' or 'join'
            if (action === 'create') {
            document.getElementById('dots_roomActionTitle').textContent = window.getTranslation('dots_create_room', 'Create Room');
            document.getElementById('dots_roomActionSubtitle').textContent = window.getTranslation('dots_select_type', 'Select Grid Size');
            showDotsScreen('dots_roomActionScreen');
        } else {
            showDotsScreen('dots_roomListScreen');
            if (window.dots_multiplayer) {
                window.dots_multiplayer.listenToAvailableRooms();
            }
        }
    };

    window.handleDotsRoomAction = function (gridSize) {
        setupBoard(gridSize);
        if (window.dotsRoomActionType === 'create') {
            if (window.dots_multiplayer) {
                window.dots_multiplayer.createRoom('online', gridSize);
            }
        }
    };

    window.cancelDotsWaiting = function () {
        if (window.dots_multiplayer) {
            window.dots_multiplayer.cancelWaitingRoom();
        }
        showDotsScreen('dots_multiplayerModeScreen');
    };

    window.leaveDotsMultiplayerGame = function () {
        if (window.dots_multiplayer) {
            window.dots_multiplayer.leaveRoom();
        }
        showDotsScreen('dots_multiplayerModeScreen');
    };

    // SPA game launcher binding
    window.openDotsAndBoxesSection = function () {
        // Setup initial home layout
        initializeDotsGame();
        
        // Deactivate Dama sections if any active
        document.querySelectorAll('#dama .game-screen').forEach(el => el.classList.remove('active'));
        
        // Reset sub game states
        showDotsScreen('dots_modeScreen');

        // Setup menu bindings
        setupMenuRouting();
    };

    window.openDotsAndBoxesGame = function (mode, gridSize, diff) {
        dots_gameState.gameMode = mode;
        dots_gameState.aiDifficulty = diff || 'medium';
        
        // FIX #2/#8: If starting an offline game, disconnect any leftover multiplayer
        // Firestore listener from a previous online session. Without this, the listener
        // would fire and call makeMoveDirect on the offline board, causing ghost lines.
        if (mode !== 'online' && window.dots_multiplayer && window.dots_multiplayer.roomListener) {
            window.dots_multiplayer.roomListener(); // Unsubscribe
            window.dots_multiplayer.roomListener = null;
            window.dots_multiplayer.gameStarted = false;
        }

        setupBoard(gridSize || 'normal');
        dots_gameState.startTime = Date.now();

        // Control buttons display
        document.getElementById('dots_gameBackButton').style.display = mode === 'online' ? 'none' : 'inline-flex';
        document.getElementById('dots_newGameButton').style.display = mode === 'online' ? 'none' : 'inline-flex';
        document.getElementById('dots_leaveGameButton').style.display = mode === 'online' ? 'inline-flex' : 'none';
        // Timer: only visible in online mode (controlled by multiplayer.js)
        document.getElementById('dots_timerDisplay').style.display = 'none';
        // VS header: only visible in online mode; hide it for single/two-player
        const vsInfo = document.getElementById('dots_multiplayerVsInfo');
        if (vsInfo) vsInfo.style.display = mode === 'online' ? 'flex' : 'none';

        showDotsScreen('dots_gameScreen');
    };

    // Setup hooks on game selection and profile
    function setupMenuRouting() {
        // Normal game modes
        const btnSingle = document.querySelector('#dots_modeScreen .dots-mode-button[data-mode="single-player"]');
        if (btnSingle) {
            btnSingle.onclick = () => {
                dots_gameState.gameMode = 'single-player';
                showDotsScreen('dots_typeScreen');
                
                // Configure clicks on grid sizes
                const sizes = document.querySelectorAll('#dots_typeScreen .dots-type-button');
                sizes[0].onclick = () => {
                    dots_gameState.boardSize = 'normal';
                    showDotsScreen('dots_difficultyScreen');
                };
                sizes[1].onclick = () => {
                    dots_gameState.boardSize = 'large';
                    showDotsScreen('dots_difficultyScreen');
                };

                // Configure clicks on difficulty
                const diffs = document.querySelectorAll('#dots_difficultyScreen .dots-difficulty-button');
                diffs.forEach(btn => {
                    btn.onclick = () => {
                        const level = btn.getAttribute('data-difficulty') || 'medium';
                        window.openDotsAndBoxesGame('single-player', dots_gameState.boardSize, level);
                    };
                });
            };
        }

        const btnTwoPlayer = document.querySelector('#dots_modeScreen .dots-mode-button[data-mode="two-player"]');
        if (btnTwoPlayer) {
            btnTwoPlayer.onclick = () => {
                dots_gameState.gameMode = 'two-player';
                showDotsScreen('dots_typeScreen');

                const sizes = document.querySelectorAll('#dots_typeScreen .dots-type-button');
                sizes[0].onclick = () => {
                    window.openDotsAndBoxesGame('two-player', 'normal');
                };
                sizes[1].onclick = () => {
                    window.openDotsAndBoxesGame('two-player', 'large');
                };
            };
        }
    }

    // Expose main initializer
    window.openDotsSection = window.openDotsAndBoxesSection;

    // Load setup when DOM loaded
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeDotsGame);
    } else {
        initializeDotsGame();
    }
})();

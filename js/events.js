/* =====================================================
   KURDISH GAMES - EVENT PAGE LOGIC & STATE MANAGEMENT
   ===================================================== */

(function () {
    // --------------------------------------------------
    // CONFIGURATIONS & MATRICES
    // --------------------------------------------------

    // Daily Login Rewards definition
    const DAILY_REWARDS = [
        { day: 1, type: 'coins', amount: 100 },
        { day: 2, type: 'diamonds', amount: 1 },
        { day: 3, type: 'coins', amount: 300 },
        { day: 4, type: 'diamonds', amount: 3 },
        { day: 5, type: 'coins', amount: 750 },
        { day: 6, type: 'diamonds', amount: 5 },
        { day: 7, type: 'chest', amount: 1 } // Day 7 is a Premium Treasure Chest
    ];

    // Legendary store items lists for challenge validation
    const LEGENDARY_ITEMS = {
        backgrounds: ['global_bg_sunset', 'global_bg_midnight'],
        avatars: ['global_avatar_warrior', 'global_avatar_eagle'],
        songs: ['global_song_kurdsat'],
        boards: ['dama_board_neon', 'dama_board_royal', 'dama_board_cosmic'],
        pieces: ['dama_piece_neon', 'dama_piece_royal', 'dama_piece_cosmic']
    };

    // Treasure Chest Possible prizes with weight classes:
    // Common: 45%, Rare: 35%, Epic: 18%, Legendary: 2%
    const CHEST_PRIZES = {
        common: [
            { type: 'coins', amount: 50, rarity: 'common' },
            { type: 'coins', amount: 150, rarity: 'common' },
            { type: 'diamonds', amount: 1, rarity: 'common' }
        ],
        rare: [
            { type: 'coins', amount: 300, rarity: 'rare' },
            { type: 'diamonds', amount: 2, rarity: 'rare' },
            { type: 'diamonds', amount: 3, rarity: 'rare' }
        ],
        epic: [
            { type: 'coins', amount: 500, rarity: 'epic' },
            { type: 'diamonds', amount: 4, rarity: 'epic' },
            { type: 'diamonds', amount: 5, rarity: 'epic' }
        ],
        legendary: [
            { type: 'coins', amount: 2999, rarity: 'legendary' },
            { type: 'diamonds', amount: 20, rarity: 'legendary' }
        ]
    };

    // All possible prizes consolidated for the roller reel cycling
    const ALL_ROLLER_PRIZES = [
        ...CHEST_PRIZES.common,
        ...CHEST_PRIZES.rare,
        ...CHEST_PRIZES.epic,
        ...CHEST_PRIZES.legendary
    ];

    // Challenge pool definition (at least 15 diverse variants)
    const CHALLENGE_POOL = [
        {
            id: 'ch_easy_1',
            textKey: 'challenge_text_1',
            difficulty: 'easy',
            target: 1,
            rewardType: 'coins',
            rewardAmount: 50,
            checkFn: (match) => match.mode === 'single-player' && match.type === 'standard' && match.difficulty === 'easy' && match.outcome === 'win'
        },
        {
            id: 'ch_easy_2',
            textKey: 'challenge_text_2',
            difficulty: 'easy',
            target: 1,
            rewardType: 'coins',
            rewardAmount: 75,
            checkFn: (match) => match.type === 'standard'
        },
        {
            id: 'ch_easy_3',
            textKey: 'challenge_text_3',
            difficulty: 'easy',
            target: 5,
            rewardType: 'coins',
            rewardAmount: 100,
            checkFn: (match) => match.captures >= 5
        },
        {
            id: 'ch_medium_1',
            textKey: 'challenge_text_4',
            difficulty: 'medium',
            target: 2,
            rewardType: 'diamonds',
            rewardAmount: 1,
            checkFn: (match) => match.mode === 'online-multiplayer' && match.equipped.backgroundIsLegendary
        },
        {
            id: 'ch_medium_2',
            textKey: 'challenge_text_5',
            difficulty: 'medium',
            target: 1,
            rewardType: 'coins',
            rewardAmount: 200,
            checkFn: (match) => match.mode === 'single-player' && match.difficulty === 'medium' && match.outcome === 'win'
        },
        {
            id: 'ch_medium_3',
            textKey: 'challenge_text_6',
            difficulty: 'medium',
            target: 2,
            rewardType: 'coins',
            rewardAmount: 250,
            checkFn: (match) => match.kingPromotions >= 2
        },
        {
            id: 'ch_medium_4',
            textKey: 'challenge_text_7',
            difficulty: 'medium',
            target: 1,
            rewardType: 'coins',
            rewardAmount: 180,
            checkFn: (match) => match.mode === 'two-player' && match.type === 'standard' && match.outcome === 'win'
        },
        {
            id: 'ch_hard_1',
            textKey: 'challenge_text_8',
            difficulty: 'hard',
            target: 1,
            rewardType: 'diamonds',
            rewardAmount: 2,
            checkFn: (match) => match.mode === 'online-multiplayer' && match.type === 'compulsory' && match.outcome === 'win'
        },
        {
            id: 'ch_hard_2',
            textKey: 'challenge_text_9',
            difficulty: 'hard',
            target: 1,
            rewardType: 'coins',
            rewardAmount: 500,
            checkFn: (match) => match.mode === 'single-player' && match.difficulty === 'hard' && match.type === 'compulsory' && match.outcome === 'win'
        },
        {
            id: 'ch_hard_3',
            textKey: 'challenge_text_10',
            difficulty: 'hard',
            target: 2,
            rewardType: 'diamonds',
            rewardAmount: 2,
            checkFn: (match) => match.mode === 'online-multiplayer' && match.equipped.avatarIsLegendary
        },
        {
            id: 'ch_hard_4',
            textKey: 'challenge_text_11',
            difficulty: 'hard',
            target: 2,
            rewardType: 'coins',
            rewardAmount: 400,
            checkFn: (match) => match.type === 'standard' && (match.difficulty === 'medium' || match.difficulty === 'hard' || match.difficulty === 'extreme') && match.outcome === 'win'
        },
        {
            id: 'ch_extreme_1',
            textKey: 'challenge_text_12',
            difficulty: 'extreme',
            target: 1,
            rewardType: 'coins',
            rewardAmount: 969,
            checkFn: (match) => match.mode === 'single-player' && match.difficulty === 'extreme' && match.type === 'compulsory' && match.equipped.pieceIsLegendary && match.outcome === 'win'
        },
        {
            id: 'ch_extreme_2',
            textKey: 'challenge_text_13',
            difficulty: 'extreme',
            target: 1,
            rewardType: 'diamonds',
            rewardAmount: 3,
            checkFn: (match) => match.mode === 'online-multiplayer' && match.type === 'compulsory' && match.equipped.boardIsLegendary && match.outcome === 'win'
        },
        {
            id: 'ch_extreme_3',
            textKey: 'challenge_text_14',
            difficulty: 'extreme',
            target: 2,
            rewardType: 'coins',
            rewardAmount: 900,
            checkFn: (match) => match.mode === 'single-player' && (match.difficulty === 'hard' || match.difficulty === 'extreme') && match.equipped.songIsLegendary && match.outcome === 'win'
        },
        {
            id: 'ch_extreme_4',
            textKey: 'challenge_text_15',
            difficulty: 'extreme',
            target: 1,
            rewardType: 'diamonds',
            rewardAmount: 3,
            checkFn: (match) => match.mode === 'single-player' && match.difficulty === 'extreme' && match.type === 'standard' && match.outcome === 'win'
        }
    ];

    // Dots & Boxes Daily Challenge Pool
    const DOTS_CHALLENGE_POOL = [
        {
            id: 'dots_easy_1',
            textKey: 'dots_challenge_text_1',
            text: 'Win a Dots & Boxes game vs AI (any difficulty)',
            difficulty: 'easy',
            target: 1,
            rewardType: 'coins',
            rewardAmount: 80,
            checkFn: (match) => match.gameId === 'dots_and_boxes' && match.mode === 'single-player' && match.outcome === 'win'
        },
        {
            id: 'dots_easy_2',
            textKey: 'dots_challenge_text_2',
            text: 'Capture 10 or more boxes in a single game',
            difficulty: 'easy',
            target: 1,
            rewardType: 'coins',
            rewardAmount: 100,
            checkFn: (match) => match.gameId === 'dots_and_boxes' && match.capturedBoxes >= 10
        },
        {
            id: 'dots_easy_3',
            textKey: 'dots_challenge_text_3',
            text: 'Play a Dots & Boxes game (any mode)',
            difficulty: 'easy',
            target: 1,
            rewardType: 'coins',
            rewardAmount: 50,
            checkFn: (match) => match.gameId === 'dots_and_boxes'
        },
        {
            id: 'dots_medium_1',
            textKey: 'dots_challenge_text_4',
            text: 'Beat the Medium AI in Dots & Boxes',
            difficulty: 'medium',
            target: 1,
            rewardType: 'coins',
            rewardAmount: 200,
            checkFn: (match) => match.gameId === 'dots_and_boxes' && match.mode === 'single-player' && match.difficulty === 'medium' && match.outcome === 'win'
        },
        {
            id: 'dots_medium_2',
            textKey: 'dots_challenge_text_5',
            text: 'Win an Online Dots & Boxes match',
            difficulty: 'medium',
            target: 1,
            rewardType: 'diamonds',
            rewardAmount: 1,
            checkFn: (match) => match.gameId === 'dots_and_boxes' && match.mode === 'online' && match.outcome === 'win'
        },
        {
            id: 'dots_medium_3',
            textKey: 'dots_challenge_text_6',
            text: 'Capture 15 or more boxes in a single game',
            difficulty: 'medium',
            target: 1,
            rewardType: 'coins',
            rewardAmount: 250,
            checkFn: (match) => match.gameId === 'dots_and_boxes' && match.capturedBoxes >= 15
        },
        {
            id: 'dots_hard_1',
            textKey: 'dots_challenge_text_7',
            text: 'Beat the Hard AI in Dots & Boxes',
            difficulty: 'hard',
            target: 1,
            rewardType: 'coins',
            rewardAmount: 420,
            checkFn: (match) => match.gameId === 'dots_and_boxes' && match.mode === 'single-player' && match.difficulty === 'hard' && match.outcome === 'win'
        },
        {
            id: 'dots_hard_2',
            textKey: 'dots_challenge_text_8',
            text: 'Win 2 Online Dots & Boxes matches today',
            difficulty: 'hard',
            target: 2,
            rewardType: 'diamonds',
            rewardAmount: 2,
            checkFn: (match) => match.gameId === 'dots_and_boxes' && match.mode === 'online' && match.outcome === 'win'
        },
        {
            id: 'dots_extreme_1',
            textKey: 'dots_challenge_text_9',
            text: 'Beat the Extreme AI in Dots & Boxes',
            difficulty: 'extreme',
            target: 1,
            rewardType: 'coins',
            rewardAmount: 888,
            checkFn: (match) => match.gameId === 'dots_and_boxes' && match.mode === 'single-player' && match.difficulty === 'extreme' && match.outcome === 'win'
        },
        {
            id: 'dots_extreme_2',
            textKey: 'dots_challenge_text_10',
            text: 'Capture 20+ boxes on the Large grid',
            difficulty: 'extreme',
            target: 1,
            rewardType: 'diamonds',
            rewardAmount: 3,
            checkFn: (match) => match.gameId === 'dots_and_boxes' && match.capturedBoxes >= 20 && match.gridSize === 'large'
        }
    ];
    let eventsState = null;
    let chestWonPrize = null;
    let isRollingChest = false;

    // Seeded Random Helper
    function mulberry32(a) {
        return function() {
          let t = a += 0x6D2B79F5;
          t = Math.imul(t ^ (t >>> 15), t | 1);
          t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
          return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        }
    }

    // --------------------------------------------------
    // EVENT INITIALIZER & REGISTRATION
    // --------------------------------------------------
    document.addEventListener('DOMContentLoaded', function () {
        initializeEvents();
        setupEventsTabSwitcher();
    });

    // Hook events page initialization on page showSection transition
    const originalShowSection = window.showSection;
    window.showSection = function (sectionId, fromBack) {
        if (originalShowSection) {
            originalShowSection(sectionId, fromBack);
        }

        if (sectionId === 'events') {
            setTimeout(() => {
                renderEventsPage();
            }, 80);
        } else if (sectionId === 'home') {
            // Check badges on home navigation
            setTimeout(() => {
                updateEventsRedDot();
            }, 80);
        }
    };

    // central subscriber callback to sync badges when player data shifts
    if (window.playerDataManager) {
        window.playerDataManager.subscribe(function () {
            updateEventsRedDot();
            // If events page is currently open, refresh its tabs
            const eventsSection = document.getElementById('eventsSection');
            if (eventsSection && !eventsSection.classList.contains('hidden')) {
                renderEventsPage();
            }
        });
    }

    function initializeEvents() {
        // Run red dot evaluation at boot
        updateEventsRedDot();
    }

    function setupEventsTabSwitcher() {
        document.querySelectorAll('.events-tab-btn').forEach(btn => {
            btn.addEventListener('click', function () {
                const targetTab = this.getAttribute('data-event-tab');
                
                // Switch sidebar tab buttons active state
                document.querySelectorAll('.events-tab-btn').forEach(b => b.classList.remove('active'));
                this.classList.add('active');

                // Switch tab content containers
                document.querySelectorAll('.event-tab-content').forEach(content => {
                    content.classList.remove('active');
                });
                const targetContent = document.getElementById(`${targetTab}Section`);
                if (targetContent) {
                    targetContent.classList.add('active');
                }

                // Force re-render of active tab content to prevent blank screen issues
                const user = getLoggedInUser();
                if (user && user.username && eventsState) {
                    if (targetTab === 'dailyLogin') {
                        renderDailyLoginGrid();
                    } else if (targetTab === 'dailyChallenge') {
                        renderDailyChallenge();
                    }
                }
            });
        });
    }

    // --------------------------------------------------
    // AUTHENTICATION GUARD & CENTRAL RENDER
    // --------------------------------------------------
    function getLoggedInUser() {
        try {
            return JSON.parse(localStorage.getItem('currentUser') || 'null');
        } catch (e) {
            return null;
        }
    }

    function renderEventsPage() {
        const user = getLoggedInUser();
        const authGuard = document.getElementById('eventsAuthGuard');
        const activeContent = document.getElementById('eventsActiveContent');

        if (!user || !user.username) {
            // Logged out: Show guard page
            if (authGuard) authGuard.classList.remove('hidden');
            if (activeContent) activeContent.classList.add('hidden');
            return;
        }

        // Logged in: Render system
        if (authGuard) authGuard.classList.add('hidden');
        if (activeContent) activeContent.classList.remove('hidden');

        // Sync local object state from playerDataManager
        loadEventsState(user.username);

        // Render sections
        renderDailyLoginGrid();
        renderDailyChallenge();
        renderDotsDailyChallenge();
        updateEventsRedDot();
    }

    // Load state node from player profile
    function loadEventsState(username) {
        if (window.playerDataManager) {
            const data = window.playerDataManager.get();
            
            // If events key doesn't exist, create default schema
            if (!data.events) {
                window.playerDataManager.update(d => {
                    d.events = {
                        dailyLogin: {
                            lastClaimDate: null,
                            streak: 0
                        },
                        dailyChallenge: {
                            date: null,
                            challengeId: null,
                            progress: 0,
                            target: 1,
                            completed: false,
                            claimed: false,
                            textKey: "",
                            rewardType: "coins",
                            rewardAmount: 50
                        },
                        dots_dailyChallenge: {
                            date: null,
                            challengeId: null,
                            progress: 0,
                            target: 1,
                            completed: false,
                            claimed: false,
                            textKey: "",
                            rewardType: "coins",
                            rewardAmount: 80
                        }
                    };
                });
            } else if (!data.events.dots_dailyChallenge) {
                // Migrate existing accounts: add dots challenge key if missing
                window.playerDataManager.update(d => {
                    d.events.dots_dailyChallenge = {
                        date: null, challengeId: null, progress: 0, target: 1,
                        completed: false, claimed: false, textKey: "", rewardType: "coins", rewardAmount: 80
                    };
                });
            }
            eventsState = window.playerDataManager.get().events;
        } else {
            // Fallback anonymous memory mockup
            eventsState = eventsState || {
                dailyLogin: { lastClaimDate: null, streak: 0 },
                dailyChallenge: { date: null, challengeId: null, progress: 0, target: 1, completed: false, claimed: false },
                dots_dailyChallenge: { date: null, challengeId: null, progress: 0, target: 1, completed: false, claimed: false }
            };
        }
    }

    // --------------------------------------------------
    // FEATURE 1: 7-DAY LOGIN STREAK SYSTEM
    // --------------------------------------------------
    function renderDailyLoginGrid() {
        const grid = document.getElementById('dailyLoginGrid');
        if (!grid || !eventsState) return;

        grid.innerHTML = '';
        const todayStr = new Date().toISOString().split('T')[0];
        const lastClaimDate = eventsState.dailyLogin.lastClaimDate;
        const currentStreak = eventsState.dailyLogin.streak || 0;
        const hasClaimedToday = (lastClaimDate === todayStr);

        DAILY_REWARDS.forEach((reward) => {
            const card = document.createElement('div');
            card.className = 'day-card';
            
            // Determine state of the day card
            let stateClass = 'locked';
            let indicatorHTML = '<i class="fas fa-lock"></i>';
            let onClickHandler = null;

            if (reward.day <= currentStreak) {
                stateClass = 'claimed';
                indicatorHTML = '<i class="fas fa-check-circle"></i>';
            } else if (reward.day === currentStreak + 1 && !hasClaimedToday) {
                stateClass = 'claimable';
                indicatorHTML = '<i class="fas fa-exclamation-circle"></i>';
                onClickHandler = () => claimDailyLogin(reward.day);
            } else {
                stateClass = 'locked';
                indicatorHTML = '<i class="fas fa-lock"></i>';
            }

            if (reward.day === 7) {
                card.classList.add('day7');
            }
            card.classList.add(stateClass);

            // Reward icons and names localization (COMPACT FORMAT)
            let rewardIcon = '';
            let rewardName = '';
            if (reward.type === 'coins') {
                rewardIcon = '<i class="fas fa-coins" style="color: #ffd700;"></i>';
                rewardName = `+${reward.amount}`;
            } else if (reward.type === 'diamonds') {
                rewardIcon = '<i class="fas fa-gem" style="color: #ff69b4;"></i>';
                rewardName = `+${reward.amount}`;
            } else if (reward.type === 'chest') {
                rewardIcon = '<i class="fas fa-box-open" style="color: #ffd700;"></i>';
                rewardName = window.getTranslation('reward_chest', 'Treasure Chest');
            }

            const dayLabelText = window.getTranslation('day_label', 'Day');

            card.innerHTML = `
                <span class="day-title">${dayLabelText} ${reward.day}</span>
                <div class="day-reward-icon">${rewardIcon}</div>
                <span class="day-reward-amount">${rewardName}</span>
                <span class="status-indicator">${indicatorHTML}</span>
            `;

            if (onClickHandler) {
                card.addEventListener('click', onClickHandler);
            }

            grid.appendChild(card);
        });
    }

    function claimDailyLogin(day) {
        const user = getLoggedInUser();
        if (!user || !eventsState) return;

        const todayStr = new Date().toISOString().split('T')[0];
        const currentStreak = eventsState.dailyLogin.streak || 0;
        const lastClaimDate = eventsState.dailyLogin.lastClaimDate;

        // Guard double claims or sequence skips
        if (lastClaimDate === todayStr) return;
        if (day !== currentStreak + 1) return;

        const reward = DAILY_REWARDS.find(r => r.day === day);
        if (!reward) return;

        if (reward.type === 'chest') {
            // Trigger Day 7 modal roulette roll picker
            openTreasureChest();
        } else {
            // Regular Coins/Diamonds claims
            if (window.playerDataManager) {
                window.playerDataManager.update(d => {
                    d[reward.type] = (d[reward.type] || 0) + reward.amount;
                    d.events.dailyLogin.lastClaimDate = todayStr;
                    d.events.dailyLogin.streak = day;
                });
            }
            eventsState = window.playerDataManager.get().events;
            
            // Show claim feedback
            showToast(window.getTranslation('events_claim_toast', 'Reward claimed successfully!'));
            renderEventsPage();
            updateEventsRedDot();
            
            // Trigger home profile metrics synchronization
            if (typeof window.syncSettingsUI === 'function') window.syncSettingsUI();
            if (typeof window.loadUserProfile === 'function') window.loadUserProfile();
        }
    }

    // --------------------------------------------------
    // FEATURE 1 SUBSECTION: TREASURE CHEST MODAL ROLLER
    // --------------------------------------------------
    function openTreasureChest() {
        const modal = document.getElementById('treasureChestModal');
        const overlay = modal?.querySelector('.global-modal-overlay');
        if (!modal) return;

        // Reset elements to preparation state
        modal.classList.remove('hidden');
        if (overlay) overlay.style.display = 'block';

        const title = document.getElementById('chestModalTitle');
        const boxIcon = document.getElementById('chestBoxIcon');
        const rollerContainer = document.getElementById('pickerRollerContainer');
        const resultDisplay = document.getElementById('chestResultDisplay');

        if (title) title.textContent = window.getTranslation('chest_modal_title', 'Opening Treasure Chest...');
        if (boxIcon) {
            boxIcon.className = 'fas fa-gift chest-icon-animated shake';
        }
        if (rollerContainer) rollerContainer.style.display = 'flex';
        if (resultDisplay) resultDisplay.classList.add('hidden');

        isRollingChest = true;

        // 1. Pick won prize using weighted logic:
        // Common (45%), Rare (35%), Epic (18%), Legendary (2%)
        const roll = Math.random() * 100;
        let tier = 'common';
        if (roll < 45) {
            tier = 'common';
        } else if (roll < 80) {
            tier = 'rare';
        } else if (roll < 98) {
            tier = 'epic';
        } else {
            tier = 'legendary';
        }

        const pool = CHEST_PRIZES[tier];
        chestWonPrize = pool[Math.floor(Math.random() * pool.length)];

        // 2. Setup picker roulette reel
        const track = document.getElementById('pickerRollerTrack');
        if (!track) return;
        track.innerHTML = '';
        track.style.transition = 'none';
        track.style.transform = 'translateX(0)';

        // Populate track with 40 randomized items
        const totalItemsCount = 40;
        const itemWidth = 88; // 76px + 12px gap
        
        for (let i = 0; i < totalItemsCount; i++) {
            const el = document.createElement('div');
            el.className = 'reel-item';

            // Seed index 35 as the target won prize
            let prize = ALL_ROLLER_PRIZES[Math.floor(Math.random() * ALL_ROLLER_PRIZES.length)];
            if (i === 35) {
                prize = chestWonPrize;
            }

            if (prize.rarity === 'legendary') el.classList.add('gold-tier');
            if (prize.rarity === 'epic') el.classList.add('purple-tier');

            const iconClass = prize.type === 'coins' ? 'fas fa-coins' : 'fas fa-gem';
            const iconColor = prize.type === 'coins' ? '#ffd700' : '#ff69b4';

            el.innerHTML = `
                <i class="${iconClass}" style="color: ${iconColor};"></i>
                <span>${prize.amount}</span>
            `;
            track.appendChild(el);
        }

        // 3. Trigger roulette roll animation in the next tick
        setTimeout(() => {
            // Scroll to center index 35 inside container
            track.style.transition = 'transform 4.5s cubic-bezier(0.1, 0.8, 0.15, 1.01)';
            
            // Scroll X: (index * width) - container half-offset to center indicator pointer
            const containerWidth = rollerContainer.clientWidth;
            const scrollOffset = (35 * itemWidth) - (containerWidth / 2) + (76 / 2) + 12; // centering target item
            track.style.transform = `translateX(-${scrollOffset}px)`;
        }, 80);

        // 4. On animation end, reveal final reward card
        setTimeout(() => {
            isRollingChest = false;
            
            // Update chest icon class to Open state
            if (boxIcon) {
                boxIcon.className = 'fas fa-box-open chest-icon-animated open';
            }
            if (title) title.textContent = window.getTranslation('dama_victory', 'Victory!');
            
            // Build won item card
            const wonCard = document.getElementById('wonPrizeCard');
            if (wonCard) {
                const iconClass = chestWonPrize.type === 'coins' ? 'fas fa-coins' : 'fas fa-gem';
                const iconColor = chestWonPrize.type === 'coins' ? '#ffd700' : '#ff69b4';
                const prizeName = chestWonPrize.type === 'coins' ? window.getTranslation('reward_coins', 'Coins') : window.getTranslation('reward_diamonds', 'Diamonds');
                const rarityLabel = window.getTranslation('rank_' + chestWonPrize.rarity, chestWonPrize.rarity.toUpperCase());

                wonCard.innerHTML = `
                    <i class="${iconClass} prize-icon" style="color: ${iconColor};"></i>
                    <div class="prize-text">+${chestWonPrize.amount} ${prizeName}</div>
                    <span class="prize-rarity ${chestWonPrize.rarity}">${rarityLabel}</span>
                `;
            }

            // Hide spinner and display result
            if (rollerContainer) rollerContainer.style.display = 'none';
            if (resultDisplay) resultDisplay.classList.remove('hidden');

        }, 4800);
    }

    window.closeTreasureChestModal = function () {
        if (isRollingChest) return; // block exit during spin
        const modal = document.getElementById('treasureChestModal');
        if (modal) modal.classList.add('hidden');
    };

    window.claimChestReward = function () {
        if (!chestWonPrize || !eventsState) return;

        const todayStr = new Date().toISOString().split('T')[0];

        // Apply final prize and reset streak cycle to 0
        if (window.playerDataManager) {
            window.playerDataManager.update(d => {
                d[chestWonPrize.type] = (d[chestWonPrize.type] || 0) + chestWonPrize.amount;
                d.events.dailyLogin.lastClaimDate = todayStr;
                d.events.dailyLogin.streak = 0; // wrap streak cycle
            });
        }
        eventsState = window.playerDataManager.get().events;

        // Close modal and render page
        window.closeTreasureChestModal();
        renderEventsPage();
        updateEventsRedDot();

        // Refresh UI currencies
        if (typeof window.syncSettingsUI === 'function') window.syncSettingsUI();
        if (typeof window.loadUserProfile === 'function') window.loadUserProfile();
        
        chestWonPrize = null;
    };

    // --------------------------------------------------
    // FEATURE 2: DAMA GAMES DAILY CHALLENGES SYSTEM
    // --------------------------------------------------
    function getCalendarSeed() {
        const todayStr = new Date().toISOString().split('T')[0];
        // Parse date characters to generate numeric seed
        let numericSum = 0;
        for (let i = 0; i < todayStr.length; i++) {
            if (todayStr[i] !== '-') {
                numericSum += parseInt(todayStr[i]);
            }
        }
        return numericSum;
    }

    function rollDailyChallengeForToday() {
        const todayStr = new Date().toISOString().split('T')[0];
        const seed = getCalendarSeed();
        const rand = mulberry32(seed);

        // Pick challenge from pool using date seed
        const poolIndex = Math.floor(rand() * CHALLENGE_POOL.length);
        const challengeTemplate = CHALLENGE_POOL[poolIndex];

        // Rarity-based coin scaling: Easy (50), Medium (150-250), Hard (400-666), Extreme (800-969)
        // Rarity-based diamond scaling: Easy (0), Medium (1), Hard (2), Extreme (3)
        // Map rewards dynamically to match specifications
        let rewardType = challengeTemplate.rewardType;
        let rewardAmount = challengeTemplate.rewardAmount;

        // Apply scaling constraints
        if (rewardType === 'coins') {
            rewardAmount = Math.max(50, Math.min(969, rewardAmount));
        } else {
            rewardAmount = Math.max(1, Math.min(3, rewardAmount));
        }

        return {
            date: todayStr,
            challengeId: challengeTemplate.id,
            progress: 0,
            target: challengeTemplate.target,
            completed: false,
            claimed: false,
            textKey: challengeTemplate.textKey,
            rewardType: rewardType,
            rewardAmount: rewardAmount,
            difficulty: challengeTemplate.difficulty
        };
    }

    function renderDailyChallenge() {
        const cardContainer = document.getElementById('dailyChallengeCard');
        if (!cardContainer || !eventsState) return;

        const todayStr = new Date().toISOString().split('T')[0];
        const challenge = eventsState.dailyChallenge;

        // Roll new challenge if not present, date is stale, or schema is missing vital fields
        const isChallengeInvalid = !challenge || 
                                   challenge.date !== todayStr || 
                                   !challenge.challengeId || 
                                   !challenge.difficulty || 
                                   !challenge.textKey ||
                                   challenge.progress === undefined;

        if (isChallengeInvalid) {
            const rolled = rollDailyChallengeForToday();
            if (window.playerDataManager) {
                window.playerDataManager.update(d => {
                    d.events.dailyChallenge = rolled;
                });
            }
            eventsState = window.playerDataManager.get().events;
        }

        const activeChallenge = eventsState.dailyChallenge;
        const progressPercent = Math.max(0, Math.min(100, Math.floor((activeChallenge.progress / activeChallenge.target) * 100)));

        const difficultyLabel = window.getTranslation(`difficulty_${activeChallenge.difficulty || 'medium'}`, (activeChallenge.difficulty || 'medium').toUpperCase());
        const difficultyClass = `difficulty-${activeChallenge.difficulty || 'medium'}`;
        const descriptionText = window.getTranslation(activeChallenge.textKey, "Active Daily Dama Challenge");

        let rewardHTML = '';
        if (activeChallenge.rewardType === 'coins') {
            rewardHTML = `<div class="challenge-reward-badge coins"><i class="fas fa-coins"></i> <span>+${activeChallenge.rewardAmount}</span></div>`;
        } else {
            rewardHTML = `<div class="challenge-reward-badge diamonds"><i class="fas fa-gem"></i> <span>+${activeChallenge.rewardAmount}</span></div>`;
        }

        // Determine action button state with unified premium button classes
        let actionBtnHTML = '';
        if (activeChallenge.claimed) {
            actionBtnHTML = `<button class="btn btn-primary" disabled style="background: rgba(255,255,255,0.15) !important; border: 1px solid rgba(255,255,255,0.08) !important; color: rgba(255,255,255,0.4) !important; cursor: not-allowed; box-shadow: none !important;"><i class="fas fa-check-double"></i> ${window.getTranslation('challenge_status_claimed', 'Claimed')}</button>`;
        } else if (activeChallenge.completed) {
            actionBtnHTML = `<button class="btn btn-primary claim-challenge-btn" onclick="claimDailyChallengeReward()"><i class="fas fa-gift"></i> ${window.getTranslation('challenge_btn_claim', 'Claim Reward')}</button>`;
        } else {
            actionBtnHTML = `<button class="btn btn-primary" onclick="showSection('dama')"><i class="fas fa-play"></i> ${window.getTranslation('challenge_btn_play', 'Play Dama')}</button>`;
        }

        cardContainer.innerHTML = `
            <div class="challenge-header">
                <span class="challenge-difficulty-badge ${difficultyClass}">${difficultyLabel}</span>
                ${rewardHTML}
            </div>
            <div class="challenge-details">
                <h3>${descriptionText}</h3>
                <div class="challenge-progress-container">
                    <div class="challenge-progress-meta">
                        <span>${window.getTranslation('leaderboards_loading', 'Progress')}</span>
                        <span>${activeChallenge.progress} / ${activeChallenge.target}</span>
                    </div>
                    <div class="challenge-progress-outer">
                        <div class="challenge-progress-inner" style="width: ${progressPercent}%;"></div>
                    </div>
                </div>
            </div>
            <div class="challenge-action">
                ${actionBtnHTML}
            </div>
        `;
    }

    window.claimDailyChallengeReward = function () {
        if (!eventsState || !eventsState.dailyChallenge) return;
        const challenge = eventsState.dailyChallenge;

        if (!challenge.completed || challenge.claimed) return;

        // Credit rewards
        if (window.playerDataManager) {
            window.playerDataManager.update(d => {
                const activeChallenge = d.events.dailyChallenge;
                d[activeChallenge.rewardType] = (d[activeChallenge.rewardType] || 0) + activeChallenge.rewardAmount;
                activeChallenge.claimed = true;
            });
        }
        eventsState = window.playerDataManager.get().events;

        // UI Refresh
        showToast(window.getTranslation('events_claim_toast', 'Reward claimed successfully!'));
        renderEventsPage();
        updateEventsRedDot();

        if (typeof window.syncSettingsUI === 'function') window.syncSettingsUI();
        if (typeof window.loadUserProfile === 'function') window.loadUserProfile();
    };

    // --------------------------------------------------
    // DAMA GAME HOOK: CHECK AND UPDATE CHALLENGES
    // --------------------------------------------------
    window.checkDailyChallengeCompletion = function (gameId, result, score, stats) {
        const user = getLoggedInUser();
        if (!user || !eventsState || !eventsState.dailyChallenge) return;
        
        const challenge = eventsState.dailyChallenge;
        if (challenge.completed || challenge.claimed) return;

        // 1. Gather all equipped item ids
        const pData = window.playerDataManager ? window.playerDataManager.get() : {};
        const selections = pData.selectedItems || {};
        
        const bgId = selections['global_background'] || 'global_bg_default';
        const avatarId = selections['global_avatar'] || 'global_avatar_default';
        const songId = selections['global_songs'] || 'global_song_jalsa';
        const boardId = selections['dama_board'] || 'dama_board_default';
        const pieceId = selections['dama_piece'] || 'dama_piece_default';

        // 2. Map customizations flags
        const equippedFlags = {
            backgroundIsLegendary: LEGENDARY_ITEMS.backgrounds.includes(bgId),
            avatarIsLegendary: LEGENDARY_ITEMS.avatars.includes(avatarId),
            songIsLegendary: LEGENDARY_ITEMS.songs.includes(songId),
            boardIsLegendary: LEGENDARY_ITEMS.boards.includes(boardId),
            pieceIsLegendary: LEGENDARY_ITEMS.pieces.includes(pieceId)
        };

        // 3. Build match description context
        let gameMode = 'single-player'; // local vs AI
        if (result.includes('online')) {
            gameMode = 'online-multiplayer';
        } else if (result.includes('loss') || result.includes('win')) {
            // standard offline dama could be single player or two player local.
            // Let's resolve mode from the active dama gameState inside dama.js
            try {
                if (typeof window.gameState !== 'undefined' && window.gameState.gameMode) {
                    gameMode = window.gameState.gameMode;
                }
            } catch (err) {}
        }

        // Determine outcome
        const outcome = (result.includes('win') || result === 'win') ? 'win' : 'loss';

        // Read difficulty from gameState if single-player
        let difficulty = 'medium';
        try {
            if (typeof window.gameState !== 'undefined' && window.gameState.aiDifficulty) {
                difficulty = window.gameState.aiDifficulty;
            }
        } catch (err) {}

        // Read game type (standard vs compulsory/hukum)
        let gameType = 'standard';
        try {
            if (typeof window.gameState !== 'undefined' && window.gameState.gameType) {
                gameType = window.gameState.gameType;
            }
        } catch (err) {}

        const matchContext = {
            gameId,
            mode: gameMode,
            outcome,
            difficulty,
            type: gameType,
            captures: stats.captures || 0,
            kingPromotions: stats.kingPromotions || 0,
            equipped: equippedFlags
        };

        // 4. Find active template checking function
        const template = CHALLENGE_POOL.find(p => p.id === challenge.challengeId);
        if (!template) return;

        // 5. Evaluate completion check
        const isCompleted = template.checkFn(matchContext);
        if (isCompleted) {
            window.playerDataManager.update(d => {
                const activeChallenge = d.events.dailyChallenge;
                activeChallenge.progress = Math.min(activeChallenge.target, activeChallenge.progress + 1);
                if (activeChallenge.progress >= activeChallenge.target) {
                    activeChallenge.completed = true;
                    // Trigger a system notification toast for complete challenge
                    setTimeout(() => {
                        showToast(window.getTranslation('challenge_status_completed', 'Challenge Completed!'));
                    }, 500);
                }
            });
            eventsState = window.playerDataManager.get().events;
            
            // Sync Badges
            updateEventsRedDot();
        }
    };

    // --------------------------------------------------
    // FEATURE 3: DOTS & BOXES DAILY CHALLENGE SYSTEM
    // --------------------------------------------------
    function rollDotsDailyChallengeForToday() {
        const todayStr = new Date().toISOString().split('T')[0];
        const seed = getCalendarSeed() + 31; // offset seed so it differs from Dama challenge
        const rand = mulberry32(seed);
        const poolIndex = Math.floor(rand() * DOTS_CHALLENGE_POOL.length);
        const tmpl = DOTS_CHALLENGE_POOL[poolIndex];
        return {
            date: todayStr,
            challengeId: tmpl.id,
            progress: 0,
            target: tmpl.target,
            completed: false,
            claimed: false,
            textKey: tmpl.textKey,
            text: tmpl.text,
            rewardType: tmpl.rewardType,
            rewardAmount: tmpl.rewardAmount,
            difficulty: tmpl.difficulty
        };
    }

    function renderDotsDailyChallenge() {
        const cardContainer = document.getElementById('dotsDailyChallengeCard');
        if (!cardContainer || !eventsState) return;

        const todayStr = new Date().toISOString().split('T')[0];
        const challenge = eventsState.dots_dailyChallenge;

        const isChallengeInvalid = !challenge ||
                                   challenge.date !== todayStr ||
                                   !challenge.challengeId ||
                                   !challenge.difficulty ||
                                   !challenge.textKey ||
                                   challenge.progress === undefined;

        if (isChallengeInvalid) {
            const rolled = rollDotsDailyChallengeForToday();
            if (window.playerDataManager) {
                window.playerDataManager.update(d => { d.events.dots_dailyChallenge = rolled; });
            }
            eventsState = window.playerDataManager.get().events;
        }

        const ac = eventsState.dots_dailyChallenge;
        const progressPercent = Math.max(0, Math.min(100, Math.floor((ac.progress / ac.target) * 100)));
        const difficultyLabel = window.getTranslation(`difficulty_${ac.difficulty || 'easy'}`, (ac.difficulty || 'easy').toUpperCase());
        const difficultyClass = `difficulty-${ac.difficulty || 'easy'}`;
        // Prefer translation key for Dots & Boxes challenge text, fallback to stored English text
        const descText = window.getTranslation(ac.textKey, ac.text || 'Active Daily Dots & Boxes Challenge');

        let rewardHTML = ac.rewardType === 'coins'
            ? `<div class="challenge-reward-badge coins"><i class="fas fa-coins"></i> <span>+${ac.rewardAmount}</span></div>`
            : `<div class="challenge-reward-badge diamonds"><i class="fas fa-gem"></i> <span>+${ac.rewardAmount}</span></div>`;

        let actionBtnHTML = '';
        if (ac.claimed) {
            actionBtnHTML = `<button class="btn btn-primary" disabled style="background:rgba(255,255,255,0.15)!important;border:1px solid rgba(255,255,255,0.08)!important;color:rgba(255,255,255,0.4)!important;cursor:not-allowed;box-shadow:none!important;"><i class="fas fa-check-double"></i> ${window.getTranslation('challenge_status_claimed', 'Claimed')}</button>`;
        } else if (ac.completed) {
            actionBtnHTML = `<button class="btn btn-primary claim-challenge-btn" onclick="claimDotsDailyChallengeReward()"><i class="fas fa-gift"></i> ${window.getTranslation('challenge_btn_claim', 'Claim Reward')}</button>`;
        } else {
            actionBtnHTML = `<button class="btn btn-primary" onclick="showSection('dots_and_boxes')"><i class="fas fa-play"></i> ${window.getTranslation('challenge_btn_play_dots', 'Play Dots &amp; Boxes')}</button>`;
        }

        cardContainer.innerHTML = `
            <div class="challenge-header">
                <span class="challenge-difficulty-badge ${difficultyClass}">${difficultyLabel}</span>
                ${rewardHTML}
            </div>
            <div class="challenge-details">
                <h3>${descText}</h3>
                <div class="challenge-progress-container">
                    <div class="challenge-progress-meta">
                        <span>${window.getTranslation('leaderboards_loading', 'Progress')}</span>
                        <span>${ac.progress} / ${ac.target}</span>
                    </div>
                    <div class="challenge-progress-outer">
                        <div class="challenge-progress-inner" style="width: ${progressPercent}%;"></div>
                    </div>
                </div>
            </div>
            <div class="challenge-action">
                ${actionBtnHTML}
            </div>
        `;
    }

    window.claimDotsDailyChallengeReward = function () {
        if (!eventsState || !eventsState.dots_dailyChallenge) return;
        const challenge = eventsState.dots_dailyChallenge;
        if (!challenge.completed || challenge.claimed) return;

        if (window.playerDataManager) {
            window.playerDataManager.update(d => {
                const ac = d.events.dots_dailyChallenge;
                d[ac.rewardType] = (d[ac.rewardType] || 0) + ac.rewardAmount;
                ac.claimed = true;
            });
        }
        eventsState = window.playerDataManager.get().events;
        showToast(window.getTranslation('events_claim_toast', 'Reward claimed successfully!'));
        renderEventsPage();
        updateEventsRedDot();
        if (typeof window.syncSettingsUI === 'function') window.syncSettingsUI();
        if (typeof window.loadUserProfile === 'function') window.loadUserProfile();
    };

    // Check dots challenge completion after each game
    window.checkDotsDailyChallengeCompletion = function (gameId, result, score, stats) {
        const user = getLoggedInUser();
        if (!user || !eventsState || !eventsState.dots_dailyChallenge) return;
        const challenge = eventsState.dots_dailyChallenge;
        if (challenge.completed || challenge.claimed) return;

        const gs = window.dots_gameState || {};
        const matchContext = {
            gameId,
            mode: gs.gameMode || 'single-player',
            outcome: (result === 'win' || (result || '').includes('win')) ? 'win' : 'loss',
            difficulty: gs.aiDifficulty || 'easy',
            gridSize: gs.boardSize || 'normal',
            capturedBoxes: stats.capturedBoxes || 0
        };

        const template = DOTS_CHALLENGE_POOL.find(p => p.id === challenge.challengeId);
        if (!template) return;

        if (template.checkFn(matchContext)) {
            window.playerDataManager.update(d => {
                const ac = d.events.dots_dailyChallenge;
                ac.progress = Math.min(ac.target, ac.progress + 1);
                if (ac.progress >= ac.target) {
                    ac.completed = true;
                    setTimeout(() => showToast(window.getTranslation('challenge_status_completed', 'Dots & Boxes Challenge Completed! 🎉')), 500);
                }
            });
            eventsState = window.playerDataManager.get().events;
            updateEventsRedDot();
        }
    };

    // Preserve any existing updateGameStats implementation so we can delegate to it.
    const originalUpdateGameStats = window.updateGameStats || null;

    window.updateGameStats = async function (gameId, result, score = 0, stats = {}) {
        if (originalUpdateGameStats) {
            await originalUpdateGameStats(gameId, result, score, stats);
        }
        // Dama challenge check
        if (typeof window.checkDailyChallengeCompletion === 'function') {
            window.checkDailyChallengeCompletion(gameId, result, score, stats);
        }
        // Dots & Boxes challenge check
        if (gameId === 'dots_and_boxes' && typeof window.checkDotsDailyChallengeCompletion === 'function') {
            window.checkDotsDailyChallengeCompletion(gameId, result, score, stats);
        }
    };

    // --------------------------------------------------
    // VISUAL NOTIFICATION PULSING RED DOT BADGE
    // --------------------------------------------------
    function updateEventsRedDot() {
        const user = getLoggedInUser();
        const menuBadge = document.getElementById('eventsBtnBadge');
        const loginTabBadge = document.getElementById('dailyLoginTabBadge');
        const challengeTabBadge = document.getElementById('dailyChallengeTabBadge');

        // Hide badges for guest state
        if (!user || !user.username) {
            if (menuBadge) menuBadge.classList.add('hidden');
            if (loginTabBadge) loginTabBadge.classList.add('hidden');
            if (challengeTabBadge) challengeTabBadge.classList.add('hidden');
            return;
        }

        // Read player events state node
        let localState = null;
        if (window.playerDataManager) {
            const data = window.playerDataManager.get();
            localState = data.events;
        }

        if (!localState) return;

        const todayStr = new Date().toISOString().split('T')[0];
        const lastClaimDate = localState.dailyLogin.lastClaimDate;
        const loginIncomplete = (lastClaimDate !== todayStr);

        const challenge = localState.dailyChallenge;
        const damaIncomplete = challenge && !challenge.claimed;
        const dotsChallenge = localState.dots_dailyChallenge;
        const dotsIncomplete = dotsChallenge && !dotsChallenge.claimed;
        const challengeIncomplete = damaIncomplete || dotsIncomplete;

        // Toggle badges visibility
        if (loginTabBadge) {
            if (loginIncomplete) {
                loginTabBadge.classList.remove('hidden');
            } else {
                loginTabBadge.classList.add('hidden');
            }
        }

        if (challengeTabBadge) {
            if (challengeIncomplete) {
                challengeTabBadge.classList.remove('hidden');
            } else {
                challengeTabBadge.classList.add('hidden');
            }
        }

        if (menuBadge) {
            if (loginIncomplete || challengeIncomplete) {
                menuBadge.classList.remove('hidden');
            } else {
                menuBadge.classList.add('hidden');
            }
        }
    }
    window.updateEventsRedDot = updateEventsRedDot;

    // Helper: Show standard alert toast
    function showToast(message) {
        // reuse profile welcome toast style structure
        const existing = document.getElementById('eventsSystemToast');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.id = 'eventsSystemToast';
        
        // style locally for modularity
        Object.assign(toast.style, {
            position: 'fixed',
            bottom: '80px',
            left: '50%',
            transform: 'translateX(-50%) translateY(20px)',
            background: 'rgba(16, 185, 129, 0.95)',
            border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: '12px',
            color: 'white',
            padding: '12px 24px',
            fontSize: '1rem',
            fontWeight: '700',
            zIndex: '100000000',
            boxShadow: '0 8px 30px rgba(0,0,0,0.3)',
            transition: 'all 0.3s ease',
            opacity: '0',
            pointerEvents: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: '10px'
        });

        toast.innerHTML = `<i class="fas fa-check-circle"></i><span>${message}</span>`;
        document.body.appendChild(toast);

        // animate in
        requestAnimationFrame(() => {
            toast.style.opacity = '1';
            toast.style.transform = 'translateX(-50%) translateY(0)';
        });

        // fade out
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(-50%) translateY(20px)';
            setTimeout(() => toast.remove(), 350);
        }, 3000);
    }
})();

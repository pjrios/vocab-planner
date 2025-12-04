import { $, $$, createElement, fetchJSON, notifications } from './main.js';
import { ReportGenerator } from './reportGenerator.js';
import {
    firebaseAuthService,
    getDocs,
    collection,
    doc,
    getDoc,
    setDoc,
    serverTimestamp,
    addDoc,
    query,
    where,
    orderBy,
    limit
} from './firebaseService.js';
import { imageDB } from './db.js';
// Import modular components
import { StudentAuth } from './student/studentAuth.js';
import { StudentProgress } from './student/studentProgress.js';
import { StudentActivities } from './student/studentActivities.js';
import { StudentGames } from './student/studentGames.js';

class StudentManager {
    constructor() {
        this.currentVocab = null;
        this.manifest = null;
        this.studentProfile = {
            firstName: '',
            lastName: '',
            name: '',
            grade: '',
            studentId: '',
            email: ''
        };
        this.progressData = {};
        this.activityInstance = null;
        this.currentUser = null;
        this.coins = 0; // Legacy support - will be replaced by coinData
        this.coinData = {
            balance: 0,
            giftCoins: 0,
            totalEarned: 0,
            totalSpent: 0,
            totalGifted: 0
        };
        this.coinHistory = [];
        this.currentRole = 'student';

        // Game variables
        this.currentGame = null;
        this.gameTimeRemaining = 0;
        this.gameTimerInterval = null;

        // Leaderboard variables
        this.games = [
            { id: 'galactic-breaker', name: 'Galactic Breaker', icon: '🧱', desc: 'Break bricks in space!' },
            { id: 'snake', name: 'Snake', icon: '🐍', desc: 'Grow and avoid yourself!' },
            { id: 'flappy-bird', name: 'Flappy Bird', icon: '🐦', desc: 'Fly through pipes!' },
            { id: 'space-invaders', name: 'Space Invaders', icon: '👾', desc: 'Defend Earth!' },
            { id: 'target-shooter', name: 'Target Shooter', icon: '🎯', desc: 'Hit the targets!' },
            { id: 'pong', name: 'Pong', icon: '🏓', desc: 'Use W/S keys to move!' },
            { id: 'whack-a-mole', name: 'Whack-a-Mole', icon: '🎪', desc: 'Whack the moles!' },
            { id: 'level-devil', name: 'Level Devil', icon: '👺', desc: 'Expect the unexpected!' },
            { id: 'ball-roll-3d', name: '3D Ball Roll', icon: '⚽', desc: 'Roll the ball in 3D!' },
            { id: 'appel', name: 'Appel', icon: '🍎', desc: 'Catch the apples!' },
            { id: 'ball-blast', name: 'Ball Blast', icon: '💥', desc: 'Blast the balls!' },
            { id: 'radius-raid', name: 'Radius Raid', icon: '🚀', desc: 'Blast enemies in space!' },
            { id: 'packabunchas', name: 'Packabunchas', icon: '🧩', desc: 'Solve tiling puzzles!' },
            { id: 'spacepi', name: 'SpacePi', icon: '🛡️', desc: 'Defend your base!' }
        ];
        // HTML/Scratch games that don't have leaderboards (Level Devil has leaderboard now)
        this.htmlGames = ['ball-roll-3d', 'appel', 'ball-blast', 'radius-raid', 'packabunchas', 'spacepi'];
        this.currentGameIndex = 0;
        this.authInitialized = false;
        this.cloudVocabs = [];
        this.cloudSaveTimeout = null;
        this.unitImages = {};

        // Initialize modular components
        this.auth = new StudentAuth(this);
        this.progress = new StudentProgress(this);
        this.activities = new StudentActivities(this);
        this.games = new StudentGames(this);

        this.init();
    }

    async init() {
        // Attach listeners first so buttons work immediately
        this.initListeners();

        // Default view/state
        this.switchView('loading-view');

        // Check if we expect to be logged in
        const wasLoggedIn = localStorage.getItem('was_logged_in') === 'true';
        const hasLocalProfile = this.studentProfile && (this.studentProfile.firstName || this.studentProfile.name);

        if (wasLoggedIn && hasLocalProfile) {
            this.auth.setAuthStatus('Resuming session...');
            this.auth.updateHeader();
            this.activities.renderDashboard();
            this.switchView('main-menu-view');
            // We still let initFirebaseAuth run to verify token and sync
        } else if (wasLoggedIn) {
            this.auth.setAuthStatus('Resuming session...');
        } else {
            this.auth.setAuthStatus('Guest Mode');
            this.auth.updateGuestStatus(true);
            this.switchView('main-menu-view');
        }

        // Load manifest and local data
        await this.activities.loadManifest();
        
        // Try to load cloud vocabularies (may fail offline)
        try {
            await this.activities.loadCloudVocabularies();
        } catch (error) {
            console.error('Failed to load cloud vocabularies (may be offline):', error);
            // Continue with local/manifest vocabularies
        }
        
        this.progress.loadLocalProgress();
        this.auth.updateHeader();

        await this.auth.initFirebaseAuth();
    }

    // DEPRECATED: Use this.progress.migrateCoinData() instead
    migrateCoinData(data) {
        return this.progress.migrateCoinData(data);
    }

    // DEPRECATED: Use this.progress.loadLocalProgress() instead
    loadLocalProgress() {
        return this.progress.loadLocalProgress();
    }

    // DEPRECATED: Use this.progress.saveLocalProgress() instead
    saveLocalProgress(skipCloud = false) {
        return this.progress.saveLocalProgress(skipCloud);
    }

    // DEPRECATED: Use this.auth.updateHeader() instead
    updateHeader() {
        return this.auth.updateHeader();
    }

    // DEPRECATED: Use this.auth.checkProfile() instead
    checkProfile(force = false) {
        return this.auth.checkProfile(force);
    }

    // DEPRECATED: Use this.activities.loadManifest() instead
    async loadManifest() {
        return this.activities.loadManifest();
    }

    // DEPRECATED: Use this.activities.renderDashboard() instead
    renderDashboard() {
        return this.activities.renderDashboard();
    }

    // DEPRECATED: Use this.activities.loadVocabulary() instead
    async loadVocabulary(vocabMeta) {
        return this.activities.loadVocabulary(vocabMeta);
    }

    // DEPRECATED: Use this.activities.showActivityMenu() instead
    showActivityMenu() {
        return this.activities.showActivityMenu();
    }

    // DEPRECATED: Use this.auth.initFirebaseAuth() instead
    async initFirebaseAuth() {
        return this.auth.initFirebaseAuth();
    }

    // DEPRECATED: Use this.activities.loadCloudVocabularies() instead
    async loadCloudVocabularies() {
        return this.activities.loadCloudVocabularies();
    }

    // DEPRECATED: Use this.progress.loadCloudProgress() instead
    async loadCloudProgress() {
        return this.progress.loadCloudProgress();
    }

    // OLD METHOD - Keeping for reference during migration
    async _loadCloudProgress_OLD() {
        if (!this.currentUser) return;
        try {
            const db = firebaseAuthService.getFirestore();
            const docRef = doc(db, 'studentProgress', this.currentUser.uid);
            const snapshot = await getDoc(docRef);

            if (snapshot.exists()) {
                const data = snapshot.data();

                // Migrate coin data from cloud
                const cloudCoinData = this.progress.migrateCoinData(data);
                const cloudGiftCoins = cloudCoinData.coinData.giftCoins || 0;
                const localGiftCoins = this.coinData.giftCoins || 0;

                // Merge coin data - preserve local earned/spent, but use cloud giftCoins
                // For balance: if we have recent local transactions, prefer local (more recent)
                // Otherwise, use max to prevent losing coins
                const localRecentTransactions = this.coinHistory.slice(-10).some(h => 
                    h.type === 'spend' || h.type === 'earn' || h.type === 'accept'
                );
                const mergedBalance = localRecentTransactions 
                    ? this.coinData.balance  // Use local if we have recent activity
                    : Math.max(this.coinData.balance, cloudCoinData.coinData.balance);
                
                this.coinData = {
                    balance: mergedBalance,
                    giftCoins: cloudGiftCoins, // Always use cloud giftCoins (teacher updates)
                    totalEarned: Math.max(this.coinData.totalEarned, cloudCoinData.coinData.totalEarned),
                    totalSpent: Math.max(this.coinData.totalSpent, cloudCoinData.coinData.totalSpent),
                    totalGifted: Math.max(this.coinData.totalGifted, cloudCoinData.coinData.totalGifted)
                };

                // Check for new gifts
                if (cloudGiftCoins > localGiftCoins) {
                    const newGifts = cloudGiftCoins - localGiftCoins;
                    this.showNotificationBadge();
                    // Don't auto-accept, wait for user to click accept
                }

                // Legacy support
                this.coins = this.coinData.balance;

                this.progressData = {
                    studentProfile: data.studentProfile || this.studentProfile,
                    units: data.units || {},
                    coins: this.coins,
                    coinData: this.coinData,
                    coinHistory: data.coinHistory || this.coinHistory || []
                };
                this.coinHistory = this.progressData.coinHistory;
                this.progress.updateCoinDisplay();
                this.studentProfile = this.progressData.studentProfile || this.studentProfile;
                await this.progress.restoreImagesFromProgress();
                this.progress.saveLocalProgress(true);

                // Sync if local balance is higher
                if (this.coinData.balance > cloudCoinData.coinData.balance) {
                    await this.progress.saveProgressToCloud();
                } else {
                    this.auth.setAuthStatus('☁️ Synced');
                }
            } else {
                // New user or no cloud data - Welcome Bonus
                if (this.coinData.balance === 0) {
                    this.coinData.balance = 100;
                    this.coinData.totalEarned = 100;
                    this.progress.addCoinHistory('earn', 100, 'welcome', 'Welcome bonus!');
                    this.coins = 100; // Legacy
                    this.progress.updateCoinDisplay();
                    this.showToast('🎉 Welcome! You received 100 starting coins!');
                    this.progress.saveLocalProgress();
                    await this.progress.saveProgressToCloud();
                }
                this.auth.setAuthStatus('☁️ Ready');
            }
        } catch (error) {
            console.error('Failed to load cloud progress:', error);
            this.auth.setAuthStatus('⚠️ Cloud load failed');
            notifications.warning('Could not load progress from cloud. Using local data.');
        }
    }

    showToast(message, duration = 3000) {
        let toast = document.getElementById('student-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'student-toast';
            toast.style.cssText = `
                position: fixed;
                top: 20px;
                left: 50%;
                transform: translateX(-50%);
                background: rgba(16, 185, 129, 0.95);
                color: white;
                padding: 12px 24px;
                border-radius: 50px;
                font-weight: bold;
                box-shadow: 0 10px 25px rgba(0,0,0,0.2);
                z-index: 10000;
                opacity: 0;
                transition: opacity 0.3s, transform 0.3s;
                pointer-events: none;
            `;
            document.body.appendChild(toast);
        }

        toast.textContent = message;
        toast.style.opacity = '1';
        toast.style.transform = 'translateX(-50%) translateY(0)';

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(-50%) translateY(-20px)';
        }, duration);
    }

    scheduleCloudSync() {
        if (!this.currentUser) return;
        this.auth.setAuthStatus('☁️ Saving...');
        clearTimeout(this.cloudSaveTimeout);
        this.cloudSaveTimeout = setTimeout(() => this.progress.saveProgressToCloud(), 1000);
    }

    // DEPRECATED: Use this.progress.addCoinHistory() instead
    addCoinHistory(type, amount, source, description = '') {
        return this.progress.addCoinHistory(type, amount, source, description);
    }

    // DEPRECATED: Use this.progress.saveProgressToCloud() instead
    async saveProgressToCloud() {
        return this.progress.saveProgressToCloud();
    }

    // DEPRECATED: Use this.progress.restoreImagesFromProgress() instead
    async restoreImagesFromProgress() {
        return this.progress.restoreImagesFromProgress();
    }

    // DEPRECATED: Use this.progress.dataURLToBlob() instead
    dataURLToBlob(dataUrl) {
        return this.progress.dataURLToBlob(dataUrl);
    }

    // DEPRECATED: Use this.auth.fetchAndSetRole() instead
    async fetchAndSetRole(user) {
        return this.auth.fetchAndSetRole(user);
    }

    // DEPRECATED: Use this.auth.handleFirebaseSignIn() instead
    async handleFirebaseSignIn(user) {
        return this.auth.handleFirebaseSignIn(user);
    }

    // DEPRECATED: Use this.auth.handleFirebaseSignOut() instead
    handleFirebaseSignOut() {
        return this.auth.handleFirebaseSignOut();
    }

    switchView(viewId) {
        $$('.view').forEach(el => {
            el.classList.add('hidden');
            el.classList.remove('active');
        });

        const targetView = $(`#${viewId}`);
        if (targetView) {
            targetView.classList.remove('hidden');
            targetView.classList.add('active');
        }
    }

    initListeners() {
        // Navigation
        this.addListener('#back-to-vocab', 'click', () => {
            this.currentVocab = null;
            this.switchView('vocab-selection-view');
        });

        this.addListener('#menu-vocab-btn', 'click', () => {
            this.switchView('vocab-selection-view');
        });

        // Arcade Navigation
        this.addListener('#menu-arcade-btn', 'click', () => {
            this.switchView('arcade-view');
            this.games.updateArcadeUI();
            this.games.updateGameSelectionUI();
            // Load initial leaderboard (or hide if HTML game)
            this.games.updateLeaderboardGame();
        });

        this.addListener('#back-to-main-menu-btn', 'click', () => {
            this.switchView('main-menu-view');
        });

        this.addListener('#back-from-arcade-btn', 'click', () => {
            this.switchView('main-menu-view');
        });

        // Leaderboard Navigation
        // Removed prev-game-btn and next-game-btn listeners

        // Game Selection Navigation
        this.addListener('#prev-game-select-btn', 'click', () => {
            this.currentGameIndex = (this.currentGameIndex - 1 + this.games.length) % this.games.length;
            this.games.updateGameSelectionUI();
            this.games.updateLeaderboardGame();
        });

        this.addListener('#next-game-select-btn', 'click', () => {
            this.currentGameIndex = (this.currentGameIndex + 1) % this.games.length;
            this.games.updateGameSelectionUI();
            this.games.updateLeaderboardGame();
        });

        // Note: #play-current-game-btn listener is attached dynamically in updateGameSelectionUI()


        this.addListener('#add-time-btn', 'click', async () => {
            const settings = (this.currentVocab && this.currentVocab.activitySettings) ? this.currentVocab.activitySettings : {};
            const exchangeRate = settings.exchangeRate !== undefined ? settings.exchangeRate : 10;
            const extensionSeconds = 60;

            if (await this.progress.deductCoins(exchangeRate)) {
                this.games.addGameTime(extensionSeconds);
            } else {
                notifications.warning(`You need ${exchangeRate} coins to add time.`);
            }
        });

        this.addListener('#exit-game-btn', 'click', () => {
            this.games.stopCurrentGame();
            $('#game-stage').classList.add('hidden');
            $('#game-selection').classList.remove('hidden');
        });

        this.addListener('#back-to-menu-btn', 'click', () => {
            this.switchView('activity-menu-view');
            // Clear activity container
            $('#activity-container').innerHTML = '';
        });

        // Google Sign-In (Firebase)
        const loginBtn = $('#google-login-btn');
        if (loginBtn) {
            loginBtn.addEventListener('click', async () => {
                const originalText = loginBtn.innerHTML;
                loginBtn.innerHTML = '⏳ Signing in...';
                loginBtn.disabled = true;
                this.auth.showLoginError('');

                try {
                    await firebaseAuthService.signInWithGoogle();
                } catch (e) {
                    console.error('Sign in error:', e);
                    this.showLoginError('Sign-in failed. Please try again.');
                } finally {
                    setTimeout(() => {
                        loginBtn.innerHTML = originalText;
                        loginBtn.disabled = false;
                    }, 1200);
                }
            });
        } else {
            console.error('ERROR: Login button not found!');
            this.showLoginError('Sign-in button unavailable. Please refresh.');
        }

        // Skip Login (Guest Mode)
        this.addListener('#skip-login-link', 'click', (e) => {
            e.preventDefault();
            this.switchView('vocab-selection-view');
            this.auth.checkProfile(); // Proceed to profile check -> dashboard
        });

        // Guest Sign In Button
        this.addListener('#guest-signin-btn', 'click', () => {
            this.switchView('login-view');
        });

        this.addListener('#google-sign-out-btn', 'click', async () => {
            try {
                await firebaseAuthService.signOut();
            } catch (error) {
                console.error('Sign out error:', error);
            }
        });

        // Activity Selection
        $$('.activity-card').forEach(card => {
            card.addEventListener('click', () => {
                const activityType = card.dataset.activity;
                this.activities.startActivity(activityType);
            });
        });



        // Generate Final Report
        this.addListener('#generate-final-report-btn', 'click', () => {
            if (this.currentVocab) {
                // First, save the current activity's score if there's one active
                if (this.currentActivityInstance && typeof this.currentActivityInstance.getScore === 'function' && this.currentActivityType) {
                    const result = this.currentActivityInstance.getScore();
                    this.unitScores[this.currentActivityType] = result;
                    this.saveLocalProgress();
                }

                ReportGenerator.generateReport(this.studentProfile, this.currentVocab.name, this.unitScores);
            }
        });

        this.addListener('#edit-profile-btn', 'click', () => {
            this.checkProfile(true);
        });

        // Profile Save
        this.addListener('#save-profile-btn', 'click', () => {
            const firstName = $('#student-firstname').value.trim();
            const lastName = $('#student-lastname').value.trim();
            let grade = $('#student-grade').value.trim();
            let group = $('#student-group').value.trim();
            const isLoginViewVisible = $('#login-view') && !$('#login-view').classList.contains('hidden');

            if (!firstName) {
                notifications.warning('Please enter your first name.');
                return;
            }

            // Validate grade: only numbers
            if (grade && !/^\d+$/.test(grade)) {
                notifications.warning('Grade must contain only numbers (e.g., 6, 7, 8).');
                return;
            }

            // Validate and normalize group: single letter, convert to uppercase
            if (group) {
                if (!/^[a-zA-Z]$/.test(group)) {
                    notifications.warning('Group must be a single letter (e.g., A, B, C).');
                    return;
                }
                group = group.toUpperCase();
            }

            this.studentProfile = {
                firstName,
                lastName,
                name: `${firstName} ${lastName}`.trim(), // For backward compatibility
                grade,
                group
            };
            this.progress.saveLocalProgress(); // Save to local storage

            $('#profile-modal').classList.add('hidden');
            this.auth.updateHeader();
            this.activities.renderDashboard();
            if (isLoginViewVisible) {
                this.activities.renderDashboard();
                if (isLoginViewVisible) {
                    this.switchView('main-menu-view');
                }
            }
        });
    }

    // DEPRECATED: Use this.activities.handleAutoSave() instead
    handleAutoSave(scoreData) {
        return this.activities.handleAutoSave(scoreData);
    }

    // DEPRECATED: Use this.activities.handleIllustrationSave() instead
    handleIllustrationSave(vocabName, word, dataUrl) {
        return this.activities.handleIllustrationSave(vocabName, word, dataUrl);
    }

    // DEPRECATED: Use this.activities.handleStateSave() instead
    handleStateSave(stateData) {
        return this.activities.handleStateSave(stateData);
    }

    updateGuestStatus(isGuest) {
        const guestEl = $('#guest-status');
        if (guestEl) {
            guestEl.style.display = isGuest ? 'flex' : 'none';
        }
        const userInfo = $('#google-user-info');
        if (userInfo && isGuest) {
            userInfo.style.display = 'none';
        } else if (userInfo && !isGuest) {
            userInfo.style.display = 'flex';
        }
    }

    setAuthStatus(text) {
        const statusEl = $('#auth-status');
        if (statusEl) {
            statusEl.textContent = text;
        }
    }

    addListener(selector, event, handler) {
        const element = $(selector);
        if (!element) {
            console.warn(`Element not found for listener: ${selector}`);
            return null;
        }
        element.addEventListener(event, handler);
        return element;
    }

    showLoginError(message) {
        const errorEl = $('#login-error');
        if (errorEl) {
            if (message) {
                errorEl.textContent = message;
                errorEl.style.display = 'block';
            } else {
                errorEl.textContent = '';
                errorEl.style.display = 'none';
            }
        }
    }

    // DEPRECATED: Use this.activities.startActivity() instead
    startActivity(type) {
        return this.activities.startActivity(type);
    }


    // Initialize immediately if DOM is already ready, otherwise wait


    // DEPRECATED: Use this.progress.addCoins() instead
    addCoins(amount, source = 'activity', description = '') {
        return this.progress.addCoins(amount, source, description);
    }

    // DEPRECATED: Use this.progress.deductCoins() instead
    async deductCoins(amount) {
        return this.progress.deductCoins(amount);
    }

    // DEPRECATED: Use this.progress.acceptGiftCoins() instead
    async acceptGiftCoins() {
        return this.progress.acceptGiftCoins();
    }

    // DEPRECATED: Use this.games.formatTime() instead
    formatTime(seconds) {
        return this.games.formatTime(seconds);
    }

    // DEPRECATED: Use this.progress.updateCoinDisplay() instead
    updateCoinDisplay() {
        return this.progress.updateCoinDisplay();
    }

    showNotificationBadge() {
        // Only show if there are actually gift coins
        if (this.coinData.giftCoins <= 0) {
            this.hideNotificationBadge();
            return;
        }

        let badge = $('#coin-notification-badge');
        if (!badge) {
            // Create badge element
            const coinEl = $('#coin-balance');
            if (coinEl && coinEl.parentElement) {
                badge = document.createElement('div');
                badge.id = 'coin-notification-badge';
                badge.style.cssText = `
                    position: absolute;
                    top: -8px;
                    left: -8px;
                    background: #ef4444;
                    color: white;
                    border-radius: 50%;
                    width: 22px;
                    height: 22px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 11px;
                    font-weight: bold;
                    cursor: pointer;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.2);
                    z-index: 100;
                    border: 2px solid white;
                `;
                badge.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.showNotificationPanel();
                });
                coinEl.parentElement.style.position = 'relative';
                coinEl.parentElement.appendChild(badge);
            }
        }
        if (badge) {
            badge.textContent = this.coinData.giftCoins > 99 ? '99+' : this.coinData.giftCoins;
            badge.style.display = 'flex';
        }
    }

    hideNotificationBadge() {
        const badge = $('#coin-notification-badge');
        if (badge) {
            badge.style.display = 'none';
        }
    }

    showNotificationPanel() {
        // Remove existing panel if any
        let panel = $('#coin-notification-panel');
        if (panel) {
            panel.remove();
        }

        if (this.coinData.giftCoins <= 0) {
            return;
        }

        // Create notification panel
        panel = document.createElement('div');
        panel.id = 'coin-notification-panel';
        panel.style.cssText = `
            position: fixed;
            top: 60px;
            right: 20px;
            background: white;
            border-radius: 12px;
            box-shadow: 0 10px 25px rgba(0,0,0,0.2);
            padding: 1.5rem;
            min-width: 300px;
            max-width: 400px;
            z-index: 10000;
            animation: slideIn 0.3s ease-out;
        `;

        panel.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                <h3 style="margin: 0; color: var(--primary-color);">💰 Pending Coins</h3>
                <button id="close-notification-panel" style="background: none; border: none; font-size: 24px; cursor: pointer; color: #666;">&times;</button>
            </div>
            <div style="margin-bottom: 1rem; padding: 1rem; background: #f0f9ff; border-radius: 8px; border-left: 4px solid #3b82f6;">
                <div style="font-size: 18px; font-weight: bold; color: #1e40af; margin-bottom: 0.5rem;">
                    +${this.coinData.giftCoins} Coins
                </div>
                <div style="color: #64748b; font-size: 14px;">
                    From your teacher
                </div>
            </div>
            <button id="accept-gift-coins" class="btn primary-btn" style="width: 100%; padding: 0.75rem; font-size: 16px; font-weight: bold;">
                Accept ${this.coinData.giftCoins} Coins
            </button>
        `;

        // Add animation
        const style = document.createElement('style');
        style.textContent = `
            @keyframes slideIn {
                from {
                    opacity: 0;
                    transform: translateY(-20px);
                }
                to {
                    opacity: 1;
                    transform: translateY(0);
                }
            }
        `;
        document.head.appendChild(style);

        document.body.appendChild(panel);

        // Event listeners
        $('#close-notification-panel').addEventListener('click', () => panel.remove());
        $('#accept-gift-coins').addEventListener('click', async () => {
                    await this.progress.acceptGiftCoins();
            panel.remove();
        });

        // Close on outside click
        setTimeout(() => {
            document.addEventListener('click', function closePanel(e) {
                if (!panel.contains(e.target) && e.target.id !== 'coin-notification-badge') {
                    panel.remove();
                    document.removeEventListener('click', closePanel);
                }
            });
        }, 100);
    }

    // DEPRECATED: Use this.games.updateArcadeUI() instead
    updateArcadeUI() {
        return this.games.updateArcadeUI();
    }

    // DEPRECATED: Use this.games.updateGameSelectionUI() instead
    updateGameSelectionUI() {
        return this.games.updateGameSelectionUI();
    }

    // DEPRECATED: Use this.games.saveHighScore() instead
    async saveHighScore(gameId, score, metadata = null) {
        return this.games.saveHighScore(gameId, score, metadata);
    }

    // DEPRECATED: Use this.games.updateLeaderboardGame() instead
    updateLeaderboardGame() {
        return this.games.updateLeaderboardGame();
    }

    // DEPRECATED: Use this.games.loadLeaderboard() instead
    async loadLeaderboard(gameId) {
        return this.games.loadLeaderboard(gameId);
    }

    // DEPRECATED: Use this.games.loadHTMLGame() instead
    loadHTMLGame(gameId, htmlFile, scoreMessageType, gameOverCallback, canvas, gameStage) {
        return this.games.loadHTMLGame(gameId, htmlFile, scoreMessageType, gameOverCallback, canvas, gameStage);
    }

    // DEPRECATED: Use this.games.startGame() instead
    async startGame(type) {
        return this.games.startGame(type);
    }

    // DEPRECATED: Use this.games.stopCurrentGame() instead
    stopCurrentGame() {
        return this.games.stopCurrentGame();
    }

    // DEPRECATED: Use this.games.pauseGame() instead
    async pauseGame() {
        return this.games.pauseGame();
    }

    // DEPRECATED: Use this.games.addGameTime() instead
    addGameTime(seconds = 60) {
        return this.games.addGameTime(seconds);
    }

    // DEPRECATED: Use this.games.updateGameTimer() instead
    updateGameTimer() {
        return this.games.updateGameTimer();
    }
}

// Initialize immediately if DOM is already ready, otherwise wait
const startStudentApp = () => {
    if (!window.studentApp) {
        window.studentApp = new StudentManager();
    }
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startStudentApp, { once: true });
} else {
    startStudentApp();
}

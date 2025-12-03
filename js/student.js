import { $, $$, createElement, fetchJSON } from './main.js';
import { MatchingActivity } from './activities/matching.js';
import { FlashcardsActivity } from './activities/flashcards.js';
import { QuizActivity } from './activities/quiz.js';
import { IllustrationActivity } from './activities/illustration.js';
import { SynonymAntonymActivity } from './activities/synonymAntonym.js';
import { WordSearchActivity } from './activities/wordSearch.js';
import { CrosswordActivity } from './activities/crossword.js';
import { HangmanActivity } from './activities/hangman.js';
import { ScrambleActivity } from './activities/scramble.js';
import { SpeedMatchActivity } from './activities/speedMatch.js';
import { FillInBlankActivity } from './activities/fillInBlank.js';
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
            { id: 'ball-blast', name: 'Ball Blast', icon: '💥', desc: 'Blast the balls!' }
        ];
        // HTML/Scratch games that don't have leaderboards
        this.htmlGames = ['level-devil', 'ball-roll-3d', 'appel', 'ball-blast'];
        this.currentGameIndex = 0;
        this.authInitialized = false;
        this.cloudVocabs = [];
        this.cloudSaveTimeout = null;
        this.unitImages = {};

        this.init();
    }

    async init() {
        console.log('StudentManager init started');

        // Attach listeners first so buttons work immediately
        this.initListeners();
        console.log('Listeners attached');

        // Default view/state
        // Default view/state
        this.switchView('loading-view');

        // Check if we expect to be logged in
        const wasLoggedIn = localStorage.getItem('was_logged_in') === 'true';
        const hasLocalProfile = this.studentProfile && (this.studentProfile.firstName || this.studentProfile.name);

        if (wasLoggedIn && hasLocalProfile) {
            console.log('Optimistic login: showing dashboard immediately');
            this.setAuthStatus('Resuming session...');
            this.updateHeader();
            this.renderDashboard();
            this.switchView('main-menu-view');
            // We still let initFirebaseAuth run to verify token and sync
        } else if (wasLoggedIn) {
            this.setAuthStatus('Resuming session...');
        } else {
            this.setAuthStatus('Guest Mode');
            this.updateGuestStatus(true);
            this.switchView('main-menu-view');
        }

        // Load manifest and local data
        await this.loadManifest();
        await this.loadCloudVocabularies();
        this.loadLocalProgress();
        this.updateHeader();

        await this.initFirebaseAuth();
    }

    // Migrate old coin structure to new structure
    migrateCoinData(data) {
        // If already new format, return as-is
        if (data.coinData) {
            return {
                coinData: data.coinData,
                coinHistory: data.coinHistory || []
            };
        }

        // Migrate from old format
        const oldCoins = data.coins || 0;
        return {
            coinData: {
                balance: oldCoins,
                giftCoins: 0,
                totalEarned: oldCoins, // Estimate - assume all were earned
                totalSpent: 0,
                totalGifted: 0
            },
            coinHistory: []
        };
    }

    loadLocalProgress() {
        try {
            const saved = localStorage.getItem('student_progress');
            if (saved) {
                const parsed = JSON.parse(saved);
                if (parsed && typeof parsed === 'object') {
                    this.progressData = parsed;
                    if (this.progressData.studentProfile && this.progressData.studentProfile.name) {
                        this.studentProfile = this.progressData.studentProfile;
                    }
                    
                    // Migrate coin data
                    const migrated = this.migrateCoinData(parsed);
                    this.coinData = migrated.coinData;
                    this.coinHistory = migrated.coinHistory;
                    
                    // Legacy support
                    this.coins = this.coinData.balance;
                    this.updateCoinDisplay();
                }
            }
        } catch (e) {
            console.error('Error loading progress:', e);
            // Reset if corrupt
            this.progressData = { studentProfile: {}, units: {} };
            this.coinData = {
                balance: 0,
                giftCoins: 0,
                totalEarned: 0,
                totalSpent: 0,
                totalGifted: 0
            };
            this.coinHistory = [];
        }
    }

    saveLocalProgress(skipCloud = false) {
        try {
            this.progressData.studentProfile = this.studentProfile;
            // Save both old and new format for compatibility
            this.coins = this.coinData.balance; // Legacy support
            this.progressData.coins = this.coins;
            this.progressData.coinData = this.coinData;
            this.progressData.coinHistory = this.coinHistory;
            localStorage.setItem('student_progress', JSON.stringify(this.progressData));
            if (!skipCloud) {
                this.scheduleCloudSync();
            }
        } catch (e) {
            console.error('Error saving progress:', e);
        }
    }

    updateHeader() {
        const headerTitle = $('.header-left h1');
        const fullName = this.studentProfile.firstName && this.studentProfile.lastName
            ? `${this.studentProfile.firstName} ${this.studentProfile.lastName}`
            : this.studentProfile.name || 'Student';
        headerTitle.textContent = `Welcome, ${fullName}`;

        const editButton = $('#edit-profile-btn');
        if (editButton) {
            editButton.style.display = 'inline-flex';
        }
    }

    checkProfile(force = false) {
        const isComplete = Boolean(
            this.studentProfile.firstName &&
            this.studentProfile.lastName &&
            this.studentProfile.grade &&
            this.studentProfile.group
        );

        if (isComplete && !force) {
            return;
        }

        const modal = $('#profile-modal');

        if (this.studentProfile.firstName) {
            $('#student-firstname').value = this.studentProfile.firstName;
            $('#student-lastname').value = this.studentProfile.lastName || '';
            $('#student-grade').value = this.studentProfile.grade;
            $('#student-group').value = this.studentProfile.group;
        } else if (this.studentProfile.name) {
            const nameParts = this.studentProfile.name.split(' ');
            $('#student-firstname').value = nameParts[0] || '';
            $('#student-lastname').value = nameParts.slice(1).join(' ') || '';
            $('#student-grade').value = this.studentProfile.grade;
            $('#student-group').value = this.studentProfile.group;
        } else {
            $('#student-firstname').value = '';
            $('#student-lastname').value = '';
            $('#student-grade').value = '';
            $('#student-group').value = '';
        }

        modal.classList.remove('hidden');
    }

    async loadManifest() {
        const data = await fetchJSON('vocabularies/manifest.json');
        if (data) {
            this.manifest = data;
        } else {
            // Fallback or error handling
            console.error('Could not load manifest');
            $('#vocab-list').innerHTML = '<p class="error">Failed to load vocabulary list.</p>';
        }
    }

    renderDashboard() {
        const container = $('#vocab-list');
        container.innerHTML = '';

        let vocabs = [];

        if (Array.isArray(this.cloudVocabs) && this.cloudVocabs.length > 0) {
            vocabs = vocabs.concat(this.cloudVocabs);
        }

        if (this.manifest && Array.isArray(this.manifest.vocabularies)) {
            const manifestVocabs = this.manifest.vocabularies.map(v => ({
                ...v,
                __source: 'manifest'
            }));
            vocabs = vocabs.concat(manifestVocabs);
        }

        try {
            const localStored = localStorage.getItem('teacher_vocab_library');
            if (localStored) {
                const localVocabs = JSON.parse(localStored);
                if (Array.isArray(localVocabs)) {
                    const normalized = localVocabs.map(v => ({
                        ...v,
                        __source: 'local'
                    }));
                    vocabs = vocabs.concat(normalized);
                }
            }
        } catch (e) {
            console.error("Error loading local vocabularies", e);
        }

        if (vocabs.length === 0) {
            container.innerHTML = '<p>No vocabularies found.</p>';
            return;
        }

        // Filter by grade if set
        const studentGrade = this.studentProfile.grade ? String(this.studentProfile.grade).trim() : '';

        if (studentGrade) {
            vocabs = vocabs.filter(v => {
                // Check 'grades' array first
                if (v.grades && Array.isArray(v.grades)) {
                    return v.grades.some(g => String(g).trim() === studentGrade);
                }
                // Fallback to 'grade' field
                if (v.grade) {
                    return String(v.grade).trim() === studentGrade;
                }
                // If no grade specified on vocab, show it by default
                return true;
            });
        }

        if (vocabs.length === 0) {
            container.innerHTML = `<p>No vocabularies found for Grade ${studentGrade}. <br><small>Try clearing your grade in profile to see all.</small></p>`;
            return;
        }



        vocabs.forEach(vocab => {
            const card = createElement('div', 'card option-card');
            const sourceLabel = vocab.__source === 'cloud'
                ? '☁️ Cloud'
                : vocab.__source === 'local'
                    ? '💾 Local'
                    : '📁 Repo';

            card.innerHTML = `
                <div class="icon">${vocab.__source === 'cloud' ? '☁️' : '📚'}</div>
                <h3>${vocab.name}</h3>
                <p>${vocab.description || ''}</p>
                ${vocab.grades ? `<small>Grade: ${vocab.grades.join(', ')}</small>` : ''}
                <small style="color:var(--text-muted); display:block; margin-top:0.5rem;">${sourceLabel}</small>
            `;
            card.addEventListener('click', () => this.loadVocabulary(vocab));
            container.appendChild(card);
        });
    }

    async loadVocabulary(vocabMeta) {
        // ... (existing load logic) ...
        let vocabData = null;

        if (vocabMeta.path) {
            vocabData = await fetchJSON(vocabMeta.path);
        } else {
            vocabData = vocabMeta;
        }

        if (!vocabData) {
            console.error('Failed to load vocabulary data for:', vocabMeta);
            alert('Failed to load vocabulary data. Please try again or contact your teacher.');
            return;
        }

        this.currentVocab = vocabData;

        // Restore scores from persistence
        if (!this.progressData.units) this.progressData.units = {};

        // Initialize unit entry if not exists, but preserve existing scores
        if (!this.progressData.units[this.currentVocab.name]) {
            this.progressData.units[this.currentVocab.name] = {
                scores: {},
                images: {},
                states: {}
            };
        }

        // Load scores into current session (reference to the stored object)
        this.unitScores = this.progressData.units[this.currentVocab.name].scores;
        this.unitImages = this.progressData.units[this.currentVocab.name].images || {};
        this.unitStates = this.progressData.units[this.currentVocab.name].states || {};

        this.showActivityMenu();
    }

    showActivityMenu() {
        $('#current-unit-title').textContent = this.currentVocab.name;

        // Update progress on cards
        const cards = $$('.activity-card');
        cards.forEach(card => {
            const type = card.dataset.activity;
            const scoreData = this.unitScores[type];
            let progress = 0;
            let isComplete = false;

            if (scoreData) {
                progress = scoreData.score || 0;
                isComplete = scoreData.isComplete || (progress >= 100);
            }

            // Remove existing badge if any
            const existingBadge = card.querySelector('.progress-badge');
            if (existingBadge) existingBadge.remove();

            if (scoreData) {
                const badge = createElement('div', 'progress-badge');
                badge.textContent = `${progress}%`;
                if (isComplete) badge.classList.add('complete');
                card.appendChild(badge);
            }
        });

        this.switchView('activity-menu-view');
    }

    async initFirebaseAuth() {
        try {
            await firebaseAuthService.init();
            firebaseAuthService.onAuthStateChanged(async (user) => {
                if (user) {
                    await this.handleFirebaseSignIn(user);
                } else {
                    this.handleFirebaseSignOut();
                }
            });
        } catch (error) {
            console.error('Firebase auth init failed:', error);
            this.showLoginError('Authentication service unavailable. Continue as guest.');
            this.setManualSaveVisibility(true);
        }
    }

    async loadCloudVocabularies() {
        try {
            await firebaseAuthService.init();
            const db = firebaseAuthService.getFirestore();
            const snapshot = await getDocs(collection(db, 'vocabularies'));
            this.cloudVocabs = snapshot.docs.map(docSnap => ({
                id: docSnap.id,
                ...docSnap.data(),
                __source: 'cloud'
            }));
        } catch (error) {
            console.error('Failed to load cloud vocabularies:', error);
            this.cloudVocabs = [];
        }
    }

    async loadCloudProgress() {
        if (!this.currentUser) return;
        try {
            const db = firebaseAuthService.getFirestore();
            const docRef = doc(db, 'studentProgress', this.currentUser.uid);
            const snapshot = await getDoc(docRef);

            if (snapshot.exists()) {
                const data = snapshot.data();

                // Migrate coin data from cloud
                const cloudCoinData = this.migrateCoinData(data);
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
                this.updateCoinDisplay();
                this.studentProfile = this.progressData.studentProfile || this.studentProfile;
                await this.restoreImagesFromProgress();
                this.saveLocalProgress(true);

                // Sync if local balance is higher
                if (this.coinData.balance > cloudCoinData.coinData.balance) {
                    await this.saveProgressToCloud();
                } else {
                    this.setAuthStatus('☁️ Synced');
                }
            } else {
                // New user or no cloud data - Welcome Bonus
                if (this.coinData.balance === 0) {
                    this.coinData.balance = 100;
                    this.coinData.totalEarned = 100;
                    this.addCoinHistory('earn', 100, 'welcome', 'Welcome bonus!');
                    this.coins = 100; // Legacy
                    this.updateCoinDisplay();
                    this.showToast('🎉 Welcome! You received 100 starting coins!');
                    this.saveLocalProgress();
                    await this.saveProgressToCloud();
                }
                this.setAuthStatus('☁️ Ready');
            }
        } catch (error) {
            console.error('Failed to load cloud progress:', error);
            this.setAuthStatus('⚠️ Cloud load failed');
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
        this.setAuthStatus('☁️ Saving...');
        clearTimeout(this.cloudSaveTimeout);
        this.cloudSaveTimeout = setTimeout(() => this.saveProgressToCloud(), 1000);
    }

    // Add entry to coin history
    addCoinHistory(type, amount, source, description = '') {
        const entry = {
            type: type, // 'gift', 'earn', 'spend', 'accept'
            amount: amount,
            timestamp: new Date().toISOString(),
            source: source, // 'teacher', 'activity', 'game', 'welcome'
            description: description
        };
        this.coinHistory.push(entry);
        // Keep only last 100 entries to prevent bloat
        if (this.coinHistory.length > 100) {
            this.coinHistory = this.coinHistory.slice(-100);
        }
    }

    async saveProgressToCloud() {
        if (!this.currentUser) return;
        try {
            const db = firebaseAuthService.getFirestore();
            const docRef = doc(db, 'studentProgress', this.currentUser.uid);

            // Get current cloud data first to prevent overwriting newer data
            const snapshot = await getDoc(docRef);
            let cloudCoinData = null;
            if (snapshot.exists()) {
                const data = snapshot.data();
                cloudCoinData = this.migrateCoinData(data);
            }

            // Merge coin data - preserve cloud giftCoins (teacher updates), but use local if we just accepted
            // If local giftCoins is 0 and cloud has giftCoins, keep cloud (teacher just added)
            // If local giftCoins is 0 and cloud is 0, use 0 (already accepted)
            // If local giftCoins > 0, use local (shouldn't happen, but handle it)
            let mergedGiftCoins = cloudCoinData?.coinData.giftCoins || this.coinData.giftCoins;
            // If we just accepted (local is 0 but was > 0 before), use 0
            if (this.coinData.giftCoins === 0 && cloudCoinData?.coinData.giftCoins > 0) {
                // Check if we recently accepted by looking at history
                const recentAccept = this.coinHistory.slice(-5).some(h => h.type === 'accept');
                if (recentAccept) {
                    mergedGiftCoins = 0; // We just accepted, save 0 to cloud
                }
            }
            
            // Determine which balance to use
            // If we have recent transactions (spend/earn), use local balance (more recent)
            // Otherwise, use the higher balance (to prevent losing coins)
            const recentTransactions = this.coinHistory.slice(-10).some(h => 
                h.type === 'spend' || h.type === 'earn' || h.type === 'accept'
            );
            let mergedBalance;
            if (recentTransactions) {
                // Recent activity - use local balance (it's more up-to-date)
                mergedBalance = this.coinData.balance;
            } else {
                // No recent activity - use max to prevent losing coins
                mergedBalance = Math.max(this.coinData.balance, cloudCoinData?.coinData.balance || 0);
            }
            
            const mergedCoinData = {
                balance: mergedBalance,
                giftCoins: mergedGiftCoins,
                totalEarned: Math.max(this.coinData.totalEarned, cloudCoinData?.coinData.totalEarned || 0),
                totalSpent: Math.max(this.coinData.totalSpent, cloudCoinData?.coinData.totalSpent || 0),
                totalGifted: Math.max(this.coinData.totalGifted, cloudCoinData?.coinData.totalGifted || 0)
            };

            // Only update local if cloud had more balance AND we don't have recent transactions
            if (cloudCoinData && cloudCoinData.coinData.balance > this.coinData.balance && !recentTransactions) {
                this.coinData.balance = cloudCoinData.coinData.balance;
            }

            // Merge coin history (keep both, deduplicate by timestamp)
            const mergedHistory = [...(cloudCoinData?.coinHistory || []), ...this.coinHistory]
                .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
                .slice(-100); // Keep last 100

            const payload = {
                studentProfile: this.studentProfile,
                units: this.progressData.units || {},
                coins: mergedCoinData.balance, // Legacy support
                coinData: mergedCoinData,
                coinHistory: mergedHistory,
                email: this.currentUser?.email || this.studentProfile.email || '',
                role: this.currentRole || 'student',
                updatedAt: serverTimestamp()
            };
            await setDoc(docRef, payload, { merge: true });

            // Update local
            this.coinData = mergedCoinData;
            this.coinHistory = mergedHistory;
            this.coins = this.coinData.balance; // Legacy
            this.updateCoinDisplay();

            this.setAuthStatus('☁️ Synced');
        } catch (error) {
            console.error('Failed to save progress to cloud:', error);
            this.setAuthStatus('⚠️ Cloud save failed');
        }
    }

    async restoreImagesFromProgress() {
        if (!this.progressData.units) return;
        for (const [unitName, unitData] of Object.entries(this.progressData.units)) {
            if (!unitData.images) continue;
            for (const [word, dataUrl] of Object.entries(unitData.images)) {
                try {
                    const blob = await this.dataURLToBlob(dataUrl);
                    await imageDB.saveDrawing(unitName, word, blob);
                } catch (error) {
                    console.error('Failed to restore image', unitName, word, error);
                }
            }
        }
    }

    dataURLToBlob(dataUrl) {
        return fetch(dataUrl).then(res => res.blob());
    }

    async fetchAndSetRole(user) {
        this.currentRole = 'student';
        if (!user) return this.currentRole;
        try {
            const db = firebaseAuthService.getFirestore();
            const roleRef = doc(db, 'userRoles', user.uid);
            const snap = await getDoc(roleRef);
            if (snap.exists()) {
                const data = snap.data();
                this.currentRole = data.role || 'student';
            } else {
                // Try to create as teacher (rules allow only allowlisted), fallback to student
                let created = false;
                try {
                    await setDoc(roleRef, { role: 'teacher', email: user.email || '' }, { merge: true });
                    this.currentRole = 'teacher';
                    created = true;
                } catch (err) {
                    // ignore
                }
                if (!created) {
                    try {
                        await setDoc(roleRef, { role: 'student', email: user.email || '' }, { merge: true });
                        this.currentRole = 'student';
                    } catch (err) {
                        console.error('Failed to create role doc', err);
                    }
                }
            }
        } catch (err) {
            console.error('Failed to load role', err);
            this.currentRole = 'student';
        }
        return this.currentRole;
    }

    async handleFirebaseSignIn(user) {
        this.currentUser = user;
        localStorage.setItem('was_logged_in', 'true');
        await this.fetchAndSetRole(user);
        this.setAuthStatus('🔐 Signed in');
        this.updateGuestStatus(false);

        const name = user.displayName || user.email || 'Signed in';
        const avatar = $('#google-user-avatar');
        if (avatar) {
            avatar.src = user.photoURL || '';
        }
        const nameEl = $('#google-user-name');
        if (nameEl) {
            nameEl.textContent = name;
        }

        await this.loadCloudProgress();

        this.updateHeader();
        this.renderDashboard();
        this.updateHeader();
        this.renderDashboard();
        this.switchView('main-menu-view');
        const requiresProfile = !(
            this.studentProfile.firstName &&
            this.studentProfile.lastName &&
            this.studentProfile.grade &&
            this.studentProfile.group
        );

        if (requiresProfile) {
            this.checkProfile(true);
        }
    }

    handleFirebaseSignOut() {
        this.currentUser = null;
        localStorage.removeItem('was_logged_in');
        if (this.cloudSaveTimeout) {
            clearTimeout(this.cloudSaveTimeout);
            this.cloudSaveTimeout = null;
        }
        this.updateGuestStatus(true);
        this.setAuthStatus('Guest mode (local only)');
        this.switchView('main-menu-view');
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
            this.updateArcadeUI();
            this.updateGameSelectionUI();
            // Load initial leaderboard (or hide if HTML game)
            this.updateLeaderboardGame();
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
            this.updateGameSelectionUI();
            this.updateLeaderboardGame();
        });

        this.addListener('#next-game-select-btn', 'click', () => {
            this.currentGameIndex = (this.currentGameIndex + 1) % this.games.length;
            this.updateGameSelectionUI();
            this.updateLeaderboardGame();
        });

        // Note: #play-current-game-btn listener is attached dynamically in updateGameSelectionUI()


        this.addListener('#add-time-btn', 'click', async () => {
            const settings = (this.currentVocab && this.currentVocab.activitySettings) ? this.currentVocab.activitySettings : {};
            const exchangeRate = settings.exchangeRate !== undefined ? settings.exchangeRate : 10;
            const extensionSeconds = 60;

            if (await this.deductCoins(exchangeRate)) {
                this.addGameTime(extensionSeconds);
            } else {
                alert(`You need ${exchangeRate} coins to add time.`);
            }
        });

        this.addListener('#exit-game-btn', 'click', () => {
            this.stopCurrentGame();
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
                this.showLoginError('');

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
            this.checkProfile(); // Proceed to profile check -> dashboard
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
                this.startActivity(activityType);
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
                alert('Please enter your first name.');
                return;
            }

            // Validate grade: only numbers
            if (grade && !/^\d+$/.test(grade)) {
                alert('Grade must contain only numbers (e.g., 6, 7, 8).');
                return;
            }

            // Validate and normalize group: single letter, convert to uppercase
            if (group) {
                if (!/^[a-zA-Z]$/.test(group)) {
                    alert('Group must be a single letter (e.g., A, B, C).');
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
            this.saveLocalProgress(); // Save to local storage

            $('#profile-modal').classList.add('hidden');
            this.updateHeader();
            this.renderDashboard();
            if (isLoginViewVisible) {
                this.renderDashboard();
                if (isLoginViewVisible) {
                    this.switchView('main-menu-view');
                }
            }
        });
    }

    handleAutoSave(scoreData) {
        if (this.currentVocab && this.currentActivityType) {
            // Calculate coin rewards
            const oldScoreData = this.unitScores[this.currentActivityType];
            const oldScore = oldScoreData ? (oldScoreData.score || 0) : 0;
            const newScore = scoreData.score || 0;

            if (newScore > oldScore) {
                const settings = this.currentVocab.activitySettings || {};
                const progressReward = settings.progressReward !== undefined ? settings.progressReward : 1;
                const completionBonus = settings.completionBonus !== undefined ? settings.completionBonus : 50;

                // Coins per 10% progress
                const stepsOld = Math.floor(oldScore / 10);
                const stepsNew = Math.floor(newScore / 10);
                const stepsGained = stepsNew - stepsOld;

                let totalReward = Math.max(0, stepsGained * progressReward);

                // Completion bonus
                if (newScore === 100 && oldScore < 100) {
                    totalReward += completionBonus;
                }

                if (totalReward > 0) {
                    this.addCoins(totalReward);
                }
            }

            this.unitScores[this.currentActivityType] = scoreData;
            this.saveLocalProgress();

            // Update in-game progress indicator
            const indicator = $('#activity-progress-indicator');
            if (indicator) {
                const percent = scoreData.score || 0;
                indicator.textContent = `Progress: ${percent}%`;
                indicator.classList.remove('hidden');
            }
        }
    }

    handleIllustrationSave(vocabName, word, dataUrl) {
        const unitName = vocabName || (this.currentVocab ? this.currentVocab.name : null);
        if (!unitName) return;
        if (!this.progressData.units) this.progressData.units = {};
        if (!this.progressData.units[unitName]) {
            this.progressData.units[unitName] = { scores: {}, images: {} };
        }
        if (!this.progressData.units[unitName].images) {
            this.progressData.units[unitName].images = {};
        }
        this.progressData.units[unitName].images[word] = dataUrl;
        if (this.currentVocab && this.currentVocab.name === unitName) {
            this.unitImages = this.progressData.units[unitName].images;
        }
        this.saveLocalProgress();
    }

    handleStateSave(stateData) {
        if (this.currentVocab && this.currentActivityType) {
            if (!this.progressData.units[this.currentVocab.name].states) {
                this.progressData.units[this.currentVocab.name].states = {};
            }
            this.progressData.units[this.currentVocab.name].states[this.currentActivityType] = stateData;
            this.unitStates = this.progressData.units[this.currentVocab.name].states;
            this.saveLocalProgress();
        }
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

    startActivity(type) {
        // $('#activity-title').textContent = type.charAt(0).toUpperCase() + type.slice(1);
        this.currentActivityType = type; // Track current activity type
        this.switchView('activity-view');

        const container = $('#activity-container');
        container.innerHTML = ''; // Clear previous



        const onProgress = this.handleAutoSave.bind(this);
        const onSaveState = this.handleStateSave.bind(this);
        const initialState = this.unitStates ? this.unitStates[type] : null;
        const settings = this.currentVocab.activitySettings || {};

        switch (type) {
            case 'matching':
                const matchingLimit = settings.matching || 10;
                const matchingWords = this.currentVocab.words.filter(w => w.word.length >= 2).slice(0, matchingLimit);
                this.currentActivityInstance = new MatchingActivity(container, matchingWords, onProgress);
                break;
            case 'flashcards':
                const flashcardsLimit = settings.flashcards || this.currentVocab.words.length;
                const flashcardsWords = this.currentVocab.words.slice(0, flashcardsLimit);
                this.currentActivityInstance = new FlashcardsActivity(container, flashcardsWords, onProgress, onSaveState, initialState);
                break;
            case 'quiz':
                const quizLimit = settings.quiz || 10;
                const quizWords = this.currentVocab.words.slice(0, quizLimit);
                this.currentActivityInstance = new QuizActivity(container, quizWords, onProgress);
                break;
            case 'synonym-antonym':
                const synonymLimit = settings.synonymAntonym || 10;
                const synonymWords = this.currentVocab.words.slice(0, synonymLimit);
                this.currentActivityInstance = new SynonymAntonymActivity(container, synonymWords, onProgress);
                break;
            case 'illustration':
                const illustrationLimit = settings.illustration || 10;
                const illustrationWords = this.currentVocab.words.slice(0, illustrationLimit);
                this.currentActivityInstance = new IllustrationActivity(
                    container,
                    illustrationWords,
                    this.currentVocab.name,
                    onProgress,
                    this.handleIllustrationSave.bind(this)
                );
                break;
            case 'word-search':
                const wordSearchLimit = settings.wordSearch || 10;
                const wordSearchWords = this.currentVocab.words.filter(w => w.word.length >= 4).slice(0, wordSearchLimit);
                // Pass vocab ID (or name as fallback) for stable persistence
                const vocabID = this.currentVocab.id || this.currentVocab.name;
                this.currentActivityInstance = new WordSearchActivity(container, wordSearchWords, onProgress, vocabID);
                break;
            case 'crossword':
                this.currentActivityInstance = new CrosswordActivity(container, this.currentVocab.words, onProgress, onSaveState, initialState);
                break;
            case 'hangman':
                this.currentActivityInstance = new HangmanActivity(container, this.currentVocab.words, onProgress, onSaveState, initialState);
                break;
            case 'scramble':
                this.currentActivityInstance = new ScrambleActivity(container, this.currentVocab.words, onProgress, onSaveState, initialState);
                break;
            case 'speed-match':
                this.currentActivityInstance = new SpeedMatchActivity(container, this.currentVocab.words, onProgress, onSaveState, initialState);
                break;
            case 'fill-in-blank':
                this.currentActivityInstance = new FillInBlankActivity(container, this.currentVocab.words, onProgress, onSaveState, initialState);
                break;
            default:
                container.innerHTML = `<p>Activity ${type} not implemented yet.</p>`;
                this.currentActivityInstance = null;
        }
    }


    // Initialize immediately if DOM is already ready, otherwise wait


    addCoins(amount, source = 'activity', description = '') {
        this.coinData.balance += amount;
        this.coinData.totalEarned += amount;
        this.coins = this.coinData.balance; // Legacy support
        this.addCoinHistory('earn', amount, source, description);
        this.updateCoinDisplay();
        this.saveLocalProgress();

        // Visual feedback (could be improved with animation)
        const coinEl = $('#coin-balance');
        if (coinEl) {
            coinEl.classList.add('pulse');
            setTimeout(() => coinEl.classList.remove('pulse'), 500);
        }
    }

    async deductCoins(amount) {
        if (this.coinData.balance >= amount) {
            this.coinData.balance -= amount;
            this.coinData.totalSpent += amount;
            this.coins = this.coinData.balance; // Legacy support
            this.addCoinHistory('spend', amount, 'game', 'Spent on game');
            this.updateCoinDisplay();
            this.saveLocalProgress();
            
            // Immediately save to cloud to prevent sync issues
            try {
                await this.saveProgressToCloud();
            } catch (error) {
                console.error('Error saving coin deduction to cloud:', error);
                // Don't fail the deduction if cloud save fails
            }
            
            return true;
        }
        return false;
    }

    async acceptGiftCoins() {
        if (this.coinData.giftCoins <= 0) {
            this.hideNotificationBadge();
            return;
        }

        const amount = this.coinData.giftCoins;
        
        // Immediately hide badge to prevent multiple clicks
        this.hideNotificationBadge();
        
        // Update coin data
        this.coinData.balance += amount;
        this.coinData.totalGifted += amount;
        this.addCoinHistory('accept', amount, 'teacher', 'Accepted gift from teacher');
        
        // Reset giftCoins BEFORE saving
        this.coinData.giftCoins = 0;
        this.coins = this.coinData.balance; // Legacy support
        
        // Update display immediately
        this.updateCoinDisplay();
        this.showToast(`🎉 You received ${amount} coins!`);
        
        // Save to cloud immediately with giftCoins = 0
        try {
            const db = firebaseAuthService.getFirestore();
            const docRef = doc(db, 'studentProgress', this.currentUser.uid);
            
            // Get current data
            const snapshot = await getDoc(docRef);
            let existingCoinData = this.coinData;
            if (snapshot.exists()) {
                const data = snapshot.data();
                if (data.coinData) {
                    existingCoinData = data.coinData;
                }
            }
            
            // Save with giftCoins explicitly set to 0
            await setDoc(docRef, {
                coinData: {
                    balance: this.coinData.balance,
                    giftCoins: 0, // Explicitly set to 0
                    totalEarned: this.coinData.totalEarned,
                    totalSpent: this.coinData.totalSpent,
                    totalGifted: this.coinData.totalGifted
                },
                coinHistory: this.coinHistory.slice(-100),
                coins: this.coinData.balance, // Legacy support
                updatedAt: serverTimestamp()
            }, { merge: true });
            
            this.saveLocalProgress();
        } catch (error) {
            console.error('Error saving after accepting coins:', error);
            // If save fails, restore the gift coins so user can try again
            this.coinData.giftCoins = amount;
            this.coinData.balance -= amount;
            this.coinData.totalGifted -= amount;
            this.coins = this.coinData.balance;
            this.updateCoinDisplay();
            this.showToast('Error saving. Please try again.', 5000);
        }
    }

    updateCoinDisplay() {
        const coinEl = $('#coin-balance');
        if (coinEl) {
            coinEl.textContent = `🪙 ${this.coinData.balance} `;
            coinEl.style.display = this.currentUser ? 'flex' : 'none';
        }
        
        // Update notification badge
        if (this.coinData.giftCoins > 0) {
            this.showNotificationBadge();
        } else {
            this.hideNotificationBadge();
        }
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
            await this.acceptGiftCoins();
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

    updateArcadeUI() {
        // Use default settings if no vocab selected (or maybe fetch global settings later)
        // For now, fallback to defaults if accessed from Main Menu without a vocab context
        const settings = (this.currentVocab && this.currentVocab.activitySettings) ? this.currentVocab.activitySettings : {};
        const exchangeRate = settings.exchangeRate !== undefined ? settings.exchangeRate : 10;

        const costEl = $('#galactic-breaker-cost');
        if (costEl) costEl.textContent = `${exchangeRate} Coins / min`;

        const addTimeBtn = $('#add-time-btn');
        if (addTimeBtn) addTimeBtn.textContent = `+1 Min (${exchangeRate} Coins)`;
    }

    updateGameSelectionUI() {
        const game = this.games[this.currentGameIndex];
        const container = $('#current-game-card');
        if (!container) return;

        const settings = (this.currentVocab && this.currentVocab.activitySettings) ? this.currentVocab.activitySettings : {};
        const exchangeRate = settings.exchangeRate !== undefined ? settings.exchangeRate : 10;

        container.innerHTML = `
            <div class="game-icon" style="font-size: 4rem; text-align: center; margin: 1rem 0;">${game.icon}</div>
            <h3 style="text-align: center;">${game.name}</h3>
            <p style="text-align: center; color: var(--text-muted);">${game.desc}</p>
            <div class="game-cost" style="text-align: center; margin: 1rem 0; font-weight: bold;">${exchangeRate} Coins / min</div>
            <button id="play-current-game-btn" class="btn primary-btn" style="width: 100%;">Play</button>
        `;

        // Re-attach the play button listener
        this.addListener('#play-current-game-btn', 'click', () => {
            this.startGame(game.id);
        });
    }

    async saveHighScore(gameId, score) {
        // Skip leaderboard for HTML/Scratch games
        if (this.htmlGames.includes(gameId)) {
            console.log('Skipping leaderboard save for HTML game:', gameId);
            return;
        }
        if (!this.currentUser) {
            console.log('Cannot save score: not logged in');
            return; // Only save if logged in
        }
        if (!this.studentProfile.grade) {
            console.log('Cannot save score: no grade set');
            return; // Need grade for leaderboard
        }

        try {
            const db = firebaseAuthService.getFirestore();
            const scoresRef = collection(db, 'scores');

            // Use a deterministic document ID: userId-gameId
            // This ensures each player has only one entry per game
            const scoreDocId = `${this.currentUser.uid}-${gameId}`;
            const scoreDocRef = doc(scoresRef, scoreDocId);

            // Check if we already have a score
            const existingDoc = await getDoc(scoreDocRef);

            // Only update if this is a new high score or first time playing
            const existingScore = existingDoc.exists() ? (existingDoc.data().score || 0) : 0;
            if (!existingDoc.exists() || score > existingScore) {
                await setDoc(scoreDocRef, {
                    userId: this.currentUser.uid,
                    name: this.studentProfile.name || 'Anonymous',
                    grade: this.studentProfile.grade,
                    gameId: gameId,
                    score: score,
                    timestamp: serverTimestamp()
                });

                console.log('Score saved!', score, 'Previous:', existingScore);
                // Refresh leaderboard if we're viewing this game
                if (this.games && this.games[this.currentGameIndex] && this.games[this.currentGameIndex].id === gameId) {
                    this.loadLeaderboard(gameId);
                }
            } else {
                console.log('Score not high enough to update. Current:', score, 'Existing:', existingScore);
            }
        } catch (error) {
            console.error('Error saving score:', error);
        }
    }

    updateLeaderboardGame() {
        const game = this.games[this.currentGameIndex];
        const nameEl = $('#current-game-name');
        if (nameEl) nameEl.textContent = game.name;
        
        // Hide leaderboard for HTML/Scratch games
        const leaderboardContainer = $('#leaderboard-container');
        if (this.htmlGames.includes(game.id)) {
            if (leaderboardContainer) leaderboardContainer.style.display = 'none';
        } else {
            if (leaderboardContainer) leaderboardContainer.style.display = 'block';
            this.loadLeaderboard(game.id);
        }
    }

    async loadLeaderboard(gameId) {
        const container = $('#leaderboard-list');
        if (!container) return;

        // Only show if we have a grade to filter by
        if (!this.studentProfile.grade) {
            container.innerHTML = '<p style="text-align: center; color: var(--text-muted);">Update your profile grade to see the leaderboard!</p>';
            return;
        }

        container.innerHTML = '<div class="loading-spinner">Loading scores...</div>';


        try {
            const db = firebaseAuthService.getFirestore();
            const scoresRef = collection(db, 'scores');

            // Query: Same grade, same game, order by score desc, limit 5
            // Note: This requires a composite index in Firestore. 
            // If it fails, check console for index creation link.
            const q = query(
                scoresRef,
                where('grade', '==', this.studentProfile.grade),
                where('gameId', '==', gameId),
                orderBy('score', 'desc'),
                limit(5)
            );

            const querySnapshot = await getDocs(q);

            container.innerHTML = '';

            if (querySnapshot.empty) {
                container.innerHTML = '<p style="text-align: center; color: var(--text-muted);">No scores yet. Be the first!</p>';
                return;
            }

            let rank = 1;
            querySnapshot.forEach((doc) => {
                const data = doc.data();
                const isMe = this.currentUser && data.userId === this.currentUser.uid;

                const row = document.createElement('div');
                row.className = `leaderboard-row ${isMe ? 'highlight' : ''}`;
                row.style.display = 'flex';
                row.style.justifyContent = 'space-between';
                row.style.padding = '0.5rem 1rem';
                row.style.background = isMe ? 'rgba(139, 92, 246, 0.1)' : 'var(--surface-color)';
                row.style.borderRadius = '8px';
                row.style.border = '1px solid var(--border-color)';

                row.innerHTML = `
                    <span style="font-weight: bold; width: 30px;">#${rank}</span>
                    <span style="flex-grow: 1;">${data.name}</span>
                    <span style="font-weight: bold; color: var(--primary-color);">${data.score}</span>
                `;

                container.appendChild(row);
                rank++;
            });

        } catch (error) {
            console.error('Error loading leaderboard:', error);
            container.innerHTML = '<p style="text-align: center; color: var(--danger-color);">Could not load leaderboard. (Index might be building)</p>';
        }
    }

    /**
     * Helper function to load HTML games via iframe
     * @param {string} gameId - The game ID
     * @param {string} htmlFile - Path to the HTML file
     * @param {string} scoreMessageType - Optional message type for score reporting (e.g., 'level-devil-score')
     * @param {Function} gameOverCallback - Callback when game ends
     * @param {HTMLElement} canvas - Canvas element to hide
     * @param {HTMLElement} gameStage - Game stage container
     */
    loadHTMLGame(gameId, htmlFile, scoreMessageType, gameOverCallback, canvas, gameStage) {
        // Hide canvas and create iframe for the HTML game
        canvas.style.display = 'none';
        
        // Remove existing iframe if any
        const existingIframe = gameStage.querySelector(`#${gameId}-iframe`);
        if (existingIframe) {
            existingIframe.remove();
        }
        
        // Create iframe for the HTML game
        const iframe = document.createElement('iframe');
        iframe.id = `${gameId}-iframe`;
        iframe.src = htmlFile;
        iframe.style.width = '100%';
        iframe.style.height = '600px';
        iframe.style.border = 'none';
        iframe.style.borderRadius = '8px';
        iframe.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1)';
        iframe.style.maxWidth = '100%';
        iframe.style.display = 'block';
        
        // Insert iframe after the canvas
        canvas.parentNode.insertBefore(iframe, canvas.nextSibling);
        
        // Set up message listener for score reporting (if scoreMessageType is provided)
        let messageHandler = null;
        if (scoreMessageType) {
            messageHandler = (event) => {
                // Verify message is from our iframe (security check)
                if (event.data && event.data.type === scoreMessageType) {
                    const score = event.data.score || 0;
                    const isGameOver = event.data.gameOver || false;
                    
                    console.log(`${gameId} score received:`, score, 'gameOver:', isGameOver);
                    
                    // Update score display dynamically
                    const scoreDisplay = $('#game-score');
                    if (scoreDisplay) {
                        scoreDisplay.style.display = 'block';
                        scoreDisplay.textContent = `Score: ${score.toLocaleString()}`;
                    }
                    
                    // Store current score for final reporting
                    this.currentGameScore = Math.max(this.currentGameScore || 0, score);
                    
                    // Save score periodically (not just on game over) to ensure it's saved
                    if (score > 0 && score !== (this.lastSavedScore || 0)) {
                        this.lastSavedScore = score;
                        this.saveHighScore(gameId, score).catch(err => {
                            console.error('Error saving score:', err);
                        });
                    }
                    
                    if (isGameOver) {
                        // Game completed - call the callback with final score
                        gameOverCallback(score);
                        // Remove listener after game over
                        window.removeEventListener('message', messageHandler);
                    }
                }
            };
            
            window.addEventListener('message', messageHandler);
        }
        
        // Initialize score tracking
        this.currentGameScore = 0;
        this.lastSavedScore = 0;
        
        // Store reference for cleanup
        this.currentGame = {
            gameType: gameId,
            iframe: iframe,
            messageHandler: messageHandler,
            stop: () => {
                // Remove message listener
                if (messageHandler) {
                    window.removeEventListener('message', messageHandler);
                }
                if (iframe && iframe.parentNode) {
                    iframe.remove();
                }
                canvas.style.display = 'block';
                // Hide score display
                const scoreDisplay = $('#game-score');
                if (scoreDisplay) {
                    scoreDisplay.style.display = 'none';
                }
            }
        };
    }

    async startGame(type) {
        // Use default settings if no vocab selected (accessed from Main Menu)
        const settings = (this.currentVocab && this.currentVocab.activitySettings) ? this.currentVocab.activitySettings : {};
        const exchangeRate = settings.exchangeRate !== undefined ? settings.exchangeRate : 10;

        if (this.coins < exchangeRate) {
            alert(`You need at least ${exchangeRate} coins to play!`);
            return;
        }

        if (await this.deductCoins(exchangeRate)) {
            $('#game-selection').classList.add('hidden');
            $('#game-stage').classList.remove('hidden');

            this.gameTimeRemaining = 60;
            this.updateGameTimer();

            // Start Timer
            this.gameTimerInterval = setInterval(() => {
                this.gameTimeRemaining--;
                this.updateGameTimer();
                if (this.gameTimeRemaining <= 0) {
                    this.pauseGame();
                }
            }, 1000);

            // Initialize Game Logic
            const canvas = $('#game-canvas');
            const gameStage = $('#game-stage');

            // Create a callback that offers replay if time remains
            const gameOverCallback = (score) => {
                this.saveHighScore(type, score);

                // If there's time remaining, offer to play again
                if (this.gameTimeRemaining > 0) {
                    const playAgain = confirm(`Game Over! Score: ${score}\n\nYou have ${Math.floor(this.gameTimeRemaining / 60)}:${(this.gameTimeRemaining % 60).toString().padStart(2, '0')} remaining.\n\nPlay again?`);

                    if (playAgain) {
                        // Restart the same game
                        this.currentGame = null;
                        this.startGame(type);
                    } else {
                        // Exit game
                        this.stopCurrentGame();
                    }
                } else {
                    // No time left, just exit
                    this.stopCurrentGame();
                }
            };

            if (type === 'galactic-breaker') {
                import('./games/galacticBreaker.js').then(module => {
                    this.currentGame = new module.GalacticBreaker(canvas, gameOverCallback);
                    this.currentGame.start();
                });
            } else if (type === 'snake') {
                import('./games/snake.js').then(module => {
                    this.currentGame = new module.Snake(canvas, gameOverCallback);
                    this.currentGame.start();
                });
            } else if (type === 'flappy-bird') {
                import('./games/flappyBird.js').then(module => {
                    this.currentGame = new module.FlappyBird(canvas, gameOverCallback);
                    this.currentGame.start();
                });
            } else if (type === 'space-invaders') {
                import('./games/spaceInvaders.js').then(module => {
                    this.currentGame = new module.SpaceInvaders(canvas, gameOverCallback);
                    this.currentGame.start();
                });
            } else if (type === 'target-shooter') {
                import('./games/targetShooter.js').then(module => {
                    this.currentGame = new module.TargetShooter(canvas, gameOverCallback);
                    this.currentGame.start();
                });
            } else if (type === 'pong') {
                import('./games/pong.js').then(module => {
                    this.currentGame = new module.Pong(canvas, gameOverCallback);
                    this.currentGame.start();
                });
            } else if (type === 'whack-a-mole') {
                import('./games/whackAMole.js').then(module => {
                    this.currentGame = new module.WhackAMole(canvas, gameOverCallback);
                    this.currentGame.start();
                });
            } else if (type === 'level-devil') {
                this.loadHTMLGame(
                    'level-devil',
                    'js/games/Level Devil - NOT A Troll Game.html',
                    'level-devil-score',
                    gameOverCallback,
                    canvas,
                    gameStage
                );
            } else if (type === 'ball-roll-3d') {
                this.loadHTMLGame(
                    'ball-roll-3d',
                    encodeURI('js/games/[3D]ボールころころ2.html'),
                    null, // No score reporting for this game
                    gameOverCallback,
                    canvas,
                    gameStage
                );
            } else if (type === 'appel') {
                this.loadHTMLGame(
                    'appel',
                    encodeURI('js/games/Appel v1.html'),
                    null, // No score reporting for this game
                    gameOverCallback,
                    canvas,
                    gameStage
                );
            } else if (type === 'ball-blast') {
                this.loadHTMLGame(
                    'ball-blast',
                    encodeURI('js/games/Ball Blast - Mobile friendly.html'),
                    null, // No score reporting for this game
                    gameOverCallback,
                    canvas,
                    gameStage
                );
            }
        }
    }

    stopCurrentGame() {
        // Store current game type before cleanup for score saving
        const currentGameType = this.currentGame?.gameType || null;
        
        if (this.currentGame) {
            if (typeof this.currentGame.stop === 'function') {
                this.currentGame.stop();
            }
            // Also clean up message handler if it exists
            if (this.currentGame.messageHandler) {
                window.removeEventListener('message', this.currentGame.messageHandler);
            }
            // Report final score if available (for games with score reporting)
            if (this.currentGameScore !== undefined && this.currentGameScore > 0 && currentGameType) {
                this.saveHighScore(currentGameType, this.currentGameScore);
            }
            this.currentGame = null;
            this.currentGameScore = 0;
        }
        
        // Clean up any remaining iframes (fallback cleanup)
        const iframes = document.querySelectorAll('[id$="-iframe"]');
        iframes.forEach(iframe => {
            if (iframe.parentNode) {
                iframe.remove();
            }
        });
        
        // Show canvas again
        const canvas = $('#game-canvas');
        if (canvas) {
            canvas.style.display = 'block';
        }
        
        // Hide score display
        const scoreDisplay = $('#game-score');
        if (scoreDisplay) {
            scoreDisplay.style.display = 'none';
        }
        
        if (this.gameTimerInterval) {
            clearInterval(this.gameTimerInterval);
            this.gameTimerInterval = null;
        }
    }

    async pauseGame() {
        if (!this.currentGame) return;

        // Check if we can auto-extend BEFORE pausing
        const settings = (this.currentVocab && this.currentVocab.activitySettings) ? this.currentVocab.activitySettings : {};
        const exchangeRate = settings.exchangeRate !== undefined ? settings.exchangeRate : 10;

        if (this.coins >= exchangeRate) {
            // Auto-deduct and add time - NO PAUSE, game continues seamlessly
            await this.deductCoins(exchangeRate);
            this.addGameTime(60);

            // Visual feedback for extension (non-blocking)
            const timerEl = $('#game-timer');
            const originalColor = timerEl.style.color;
            timerEl.style.color = '#4ade80'; // Green
            timerEl.textContent = 'Time Extended! -' + exchangeRate + ' Coins';
            setTimeout(() => {
                timerEl.style.color = originalColor;
                this.updateGameTimer();
            }, 1500);

            return; // Continue game without any interruption
        }

        // Only pause if not enough coins
        this.currentGame.pause();
        this.isGamePaused = true;

        // Stop the timer
        if (this.gameTimerInterval) {
            clearInterval(this.gameTimerInterval);
            this.gameTimerInterval = null;
        }

        // Not enough coins - end game
        alert('Time up! Not enough coins to continue.');
        this.stopCurrentGame();
        $('#game-stage').classList.add('hidden');
        $('#game-selection').classList.remove('hidden');
    }

    addGameTime(seconds = 60) {
        const increment = Number.isFinite(seconds) ? seconds : 0;
        this.gameTimeRemaining = Math.max(0, this.gameTimeRemaining + increment);
        this.updateGameTimer();
    }

    updateGameTimer() {
        const mins = Math.floor(this.gameTimeRemaining / 60);
        const secs = this.gameTimeRemaining % 60;
        $('#game-timer').textContent = `Time: ${mins}:${secs.toString().padStart(2, '0')}`;
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

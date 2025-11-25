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
        this.coins = 0;
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
            { id: 'pong', name: 'Pong', icon: '🏓', desc: 'Classic paddle game!' },
            { id: 'whack-a-mole', name: 'Whack-a-Mole', icon: '🎪', desc: 'Whack the moles!' }
        ];
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
        this.switchView('loading-view');
        this.setAuthStatus('Guest Mode');
        this.updateGuestStatus(true);

        // Load manifest and local data
        await this.loadManifest();
        await this.loadCloudVocabularies();
        this.loadLocalProgress();
        this.updateHeader();

        await this.initFirebaseAuth();
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
                    this.coins = this.progressData.coins || 0;
                    this.updateCoinDisplay();
                }
            }
        } catch (e) {
            console.error('Error loading progress:', e);
            // Reset if corrupt
            this.progressData = { studentProfile: {}, units: {} };
        }
    }

    saveLocalProgress(skipCloud = false) {
        try {
            this.progressData.studentProfile = this.studentProfile;
            this.progressData.coins = this.coins;
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
                this.progressData = {
                    studentProfile: data.studentProfile || this.studentProfile,
                    units: data.units || {},
                    coins: data.coins || 0
                };
                this.coins = this.progressData.coins;
                this.updateCoinDisplay();
                this.studentProfile = this.progressData.studentProfile || this.studentProfile;
                await this.restoreImagesFromProgress();
                this.saveLocalProgress(true);
                this.setAuthStatus('☁️ Synced');
            } else {
                this.setAuthStatus('☁️ Ready');
            }
        } catch (error) {
            console.error('Failed to load cloud progress:', error);
            this.setAuthStatus('⚠️ Cloud load failed');
        }
    }

    scheduleCloudSync() {
        if (!this.currentUser) return;
        this.setAuthStatus('☁️ Saving...');
        clearTimeout(this.cloudSaveTimeout);
        this.cloudSaveTimeout = setTimeout(() => this.saveProgressToCloud(), 1000);
    }

    async saveProgressToCloud() {
        if (!this.currentUser) return;
        try {
            const db = firebaseAuthService.getFirestore();
            const docRef = doc(db, 'studentProgress', this.currentUser.uid);
            const payload = {
                studentProfile: this.studentProfile,
                units: this.progressData.units || {},
                coins: this.coins,
                email: this.currentUser?.email || this.studentProfile.email || '',
                role: this.currentRole || 'student',
                updatedAt: serverTimestamp()
            };
            await setDoc(docRef, payload, { merge: true });
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
        if (this.cloudSaveTimeout) {
            clearTimeout(this.cloudSaveTimeout);
            this.cloudSaveTimeout = null;
        }
        this.updateGuestStatus(true);
        this.setAuthStatus('Guest mode (local only)');
        this.switchView('login-view');
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
            // Load initial leaderboard
            this.loadLeaderboard(this.games[this.currentGameIndex].id);
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


        this.addListener('#add-time-btn', 'click', () => {
            const settings = (this.currentVocab && this.currentVocab.activitySettings) ? this.currentVocab.activitySettings : {};
            const exchangeRate = settings.exchangeRate !== undefined ? settings.exchangeRate : 10;
            const extensionSeconds = 60;

            if (this.deductCoins(exchangeRate)) {
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
            guestEl.style.display = isGuest ? 'block' : 'none';
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


    addCoins(amount) {
        this.coins += amount;
        this.updateCoinDisplay();
        this.saveLocalProgress();

        // Visual feedback (could be improved with animation)
        const coinEl = $('#coin-balance');
        if (coinEl) {
            coinEl.classList.add('pulse');
            setTimeout(() => coinEl.classList.remove('pulse'), 500);
        }
    }

    deductCoins(amount) {
        if (this.coins >= amount) {
            this.coins -= amount;
            this.updateCoinDisplay();
            this.saveLocalProgress();
            return true;
        }
        return false;
    }

    updateCoinDisplay() {
        const coinEl = $('#coin-balance');
        if (coinEl) {
            coinEl.textContent = `🪙 ${this.coins} `;
            coinEl.style.display = this.currentUser ? 'flex' : 'none';
        }
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
        if (!this.currentUser) return; // Only save if logged in
        if (!this.studentProfile.grade) return; // Need grade for leaderboard

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
            if (!existingDoc.exists() || score > (existingDoc.data().score || 0)) {
                await setDoc(scoreDocRef, {
                    userId: this.currentUser.uid,
                    name: this.studentProfile.name || 'Anonymous',
                    grade: this.studentProfile.grade,
                    gameId: gameId,
                    score: score,
                    timestamp: serverTimestamp()
                });

                console.log('New high score saved!', score);
                // Refresh leaderboard if we're viewing this game
                if (this.games[this.currentGameIndex].id === gameId) {
                    this.loadLeaderboard(gameId);
                }
            } else {
                console.log('Score not high enough to update:', score);
            }
        } catch (error) {
            console.error('Error saving score:', error);
        }
    }

    updateLeaderboardGame() {
        const game = this.games[this.currentGameIndex];
        const nameEl = $('#current-game-name');
        if (nameEl) nameEl.textContent = game.name;
        this.loadLeaderboard(game.id);
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

    startGame(type) {
        // Use default settings if no vocab selected (accessed from Main Menu)
        const settings = (this.currentVocab && this.currentVocab.activitySettings) ? this.currentVocab.activitySettings : {};
        const exchangeRate = settings.exchangeRate !== undefined ? settings.exchangeRate : 10;

        if (this.coins < exchangeRate) {
            alert(`You need at least ${exchangeRate} coins to play!`);
            return;
        }

        if (this.deductCoins(exchangeRate)) {
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
            }
        }
    }

    stopCurrentGame() {
        if (this.currentGame) {
            this.currentGame.stop();
            this.currentGame = null;
        }
        if (this.gameTimerInterval) {
            clearInterval(this.gameTimerInterval);
            this.gameTimerInterval = null;
        }
    }

    pauseGame() {
        if (!this.currentGame) return;

        this.currentGame.pause();
        this.isGamePaused = true;

        // Stop the timer
        if (this.gameTimerInterval) { // Changed from gameTimer to gameTimerInterval to match existing property
            clearInterval(this.gameTimerInterval);
            this.gameTimerInterval = null;
        }

        // Check if we can auto-extend
        // Use default settings if no vocab selected (arcade mode)
        const settings = (this.currentVocab && this.currentVocab.activitySettings) ? this.currentVocab.activitySettings : {};
        const exchangeRate = settings.exchangeRate !== undefined ? settings.exchangeRate : 10;

        if (this.coins >= exchangeRate) {
            // Auto-deduct and add time without pausing
            this.deductCoins(exchangeRate);
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

            return; // Continue game without interruption
        }

        // If not enough coins, pause and notify
        if (this.currentGame) this.currentGame.pause();
        clearInterval(this.gameTimerInterval);

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

import { $, $$, createElement, fetchJSON } from './main.js';
import { QuizMaker } from './quizMaker.js';
import {
    firebaseAuthService,
    doc,
    setDoc,
    deleteDoc,
    getDoc,
    getDocs,
    collection,
    serverTimestamp
} from './firebaseService.js';

class TeacherManager {
    constructor() {
        this.vocabSet = {
            id: '',
            name: '',
            description: '',
            grade: '',
            activitySettings: {},
            words: []
        };
        this.currentQuiz = null;
        this.allStudentData = [];
        this.filteredStudentData = [];
        this.editingWordIndex = -1;
        this.isAuthenticated = false;
        this.currentUser = null;
        this.cloudSaveTimeout = null;
        this.VOCAB_COLLECTION = 'vocabularies';
        this.activeStudentId = null;
        this.currentQuiz = null;
        this.currentRole = 'student';

        this.init();
    }

    async init() {
        this.initListeners();
        this.showLoginView();
        await this.initAuth();
    }

    async initAuth() {
        try {
            await firebaseAuthService.init();
            firebaseAuthService.onAuthStateChanged((user) => {
                if (user) {
                    this.handleAuthWithRole(user);
                } else {
                    this.isAuthenticated = false;
                    this.currentUser = null;
                    this.updateAuthUI(null);
                    this.showLoginView();
                }
            });
        } catch (error) {
            console.error('Failed to initialize teacher auth:', error);
            this.showAuthError('Authentication unavailable. Please refresh to try again.');
            this.showLoginView();
        }
    }

    async handleAuthWithRole(user) {
        try {
            const role = await this.fetchUserRole(user);
            this.currentRole = role;
            if (role !== 'teacher') {
                alert('Access restricted to teachers.');
                await firebaseAuthService.signOut();
                return;
            }
            this.isAuthenticated = true;
            this.currentUser = user;
            this.updateAuthUI(user);
            this.showDashboard();
            this.loadLibrary();
        } catch (err) {
            console.error('Role check failed:', err);
            this.showAuthError('Could not verify teacher role.');
            this.showLoginView();
        }
    }

    async fetchUserRole(user) {
        let role = 'student';
        try {
            const db = firebaseAuthService.getFirestore();
            const roleRef = doc(db, 'userRoles', user.uid);
            const snap = await getDoc(roleRef);
            if (snap.exists()) {
                role = snap.data().role || 'student';
            } else {
                // Try to create as teacher (if allowlisted), otherwise fallback to student
                let created = false;
                try {
                    await setDoc(roleRef, { role: 'teacher', email: user.email || '' }, { merge: true });
                    role = 'teacher';
                    created = true;
                } catch (err) {
                    // ignore
                }
                if (!created) {
                    try {
                        await setDoc(roleRef, { role: 'student', email: user.email || '' }, { merge: true });
                        role = 'student';
                    } catch (err) {
                        console.error('Failed to create role doc', err);
                    }
                }
            }
        } catch (err) {
            console.error('Failed to fetch role', err);
            role = 'student';
        }
        return role;
    }

    switchView(viewId) {
        const views = ['teacher-login-view', 'teacher-dashboard-view', 'teacher-editor-view', 'teacher-progress-view', 'quiz-maker-view'];
        views.forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            if (id === viewId) {
                el.classList.remove('hidden');
                el.classList.add('active');
            } else {
                el.classList.add('hidden');
                el.classList.remove('active');
            }
        });
    }

    showDashboard() {
        if (!this.ensureAuthenticated(false)) return;
        this.switchView('teacher-dashboard-view');
        $('#export-btn').classList.add('hidden');
    }

    showEditor() {
        if (!this.ensureAuthenticated(false)) return;
        this.switchView('teacher-editor-view');
        $('#export-btn').classList.remove('hidden');
    }

    showLoginView() {
        this.switchView('teacher-login-view');
        $('#export-btn').classList.add('hidden');
    }

    updateAuthUI(user) {
        const headerLoginBtn = $('#teacher-login-btn');
        const signOutBtn = $('#teacher-sign-out-btn');
        const userInfo = $('#teacher-user-info');
        const userName = $('#teacher-user-name');
        const avatar = $('#teacher-user-avatar');
        const loginViewBtn = $('#teacher-login-view-btn');

        if (user) {
            if (headerLoginBtn) headerLoginBtn.style.display = 'none';
            if (signOutBtn) signOutBtn.style.display = 'inline-flex';
            if (userInfo) {
                userInfo.style.display = 'flex';
                if (userName) userName.textContent = user.displayName || user.email || '';
                if (avatar) avatar.src = user.photoURL || '';
            }
            if (loginViewBtn) {
                loginViewBtn.disabled = false;
                loginViewBtn.innerHTML = '🔐 Sign in with Google';
            }
            this.showAuthError('');
            this.setCloudStatus('☁️ Ready', 'info');
        } else {
            if (headerLoginBtn) headerLoginBtn.style.display = 'inline-flex';
            if (signOutBtn) signOutBtn.style.display = 'none';
            if (userInfo) userInfo.style.display = 'none';
            if (loginViewBtn) {
                loginViewBtn.disabled = false;
                loginViewBtn.innerHTML = '🔐 Sign in with Google';
            }
            this.setCloudStatus('☁️ Offline', 'muted');
        }
    }

    showAuthError(message) {
        const errorEl = $('#teacher-login-error');
        if (!errorEl) return;
        if (message) {
            errorEl.textContent = message;
            errorEl.style.display = 'block';
        } else {
            errorEl.textContent = '';
            errorEl.style.display = 'none';
        }
    }

    setCloudStatus(text, state = 'info') {
        const el = $('#teacher-cloud-status');
        if (!el) return;
        const colors = {
            info: 'var(--text-muted)',
            success: 'var(--accent-color)',
            error: 'var(--danger-color)',
            muted: 'var(--text-muted)'
        };
        el.textContent = text;
        el.style.color = colors[state] || colors.info;
    }

    ensureAuthenticated(showAlert = true) {
        if (!this.isAuthenticated) {
            if (showAlert) {
                alert('Please sign in to use the teacher tools.');
            }
            this.showLoginView();
            return false;
        }
        return true;
    }

    async loadLibrary() {
        const list = $('#library-list');
        if (!list) return;

        if (!this.isAuthenticated) {
            list.innerHTML = '<p>Please sign in to view the library.</p>';
            return;
        }

        list.innerHTML = '<div class="loading-spinner">Loading library...</div>';

        try {
            const [cloudVocabs, manifestData] = await Promise.all([
                this.fetchCloudVocabs(),
                fetchJSON('vocabularies/manifest.json')
            ]);

            const remoteVocabs = manifestData && manifestData.vocabularies ? manifestData.vocabularies : [];
            const localVocabs = this.getLocalVocabs();

            list.innerHTML = '';

            if (cloudVocabs.length === 0 && remoteVocabs.length === 0 && localVocabs.length === 0) {
                list.innerHTML = '<p>No vocabularies found.</p>';
                return;
            }

            cloudVocabs.forEach(vocab => {
                this.createLibraryCard(list, vocab, 'cloud');
            });

            remoteVocabs.forEach(vocab => {
                this.createLibraryCard(list, vocab, 'remote');
            });

            localVocabs.forEach(vocab => {
                this.createLibraryCard(list, vocab, 'local');
            });
        } catch (error) {
            console.error('Failed to load vocabularies:', error);
            list.innerHTML = '<p>Failed to load vocabulary list.</p>';
        }
    }

    async fetchCloudVocabs() {
        if (!this.ensureAuthenticated(false)) return [];

        try {
            const db = firebaseAuthService.getFirestore();
            const snapshot = await getDocs(collection(db, this.VOCAB_COLLECTION));
            this.setCloudStatus('☁️ Ready', 'info');
            return snapshot.docs.map(docSnap => {
                const data = docSnap.data();
                return {
                    id: docSnap.id,
                    ...data,
                    source: 'cloud'
                };
            });
        } catch (error) {
            console.error('Failed to fetch cloud vocabularies:', error);
            this.setCloudStatus('⚠️ Cloud load failed', 'error');
            return [];
        }
    }

    getLocalVocabs() {
        const stored = localStorage.getItem('teacher_vocab_library');
        return stored ? JSON.parse(stored) : [];
    }

    saveToLocal(vocab) {
        if (!vocab.id) return; // Don't save without ID
        const { __source, ...rest } = vocab;
        const cleanVocab = { ...rest };

        let vocabs = this.getLocalVocabs();
        const index = vocabs.findIndex(v => v.id === vocab.id);

        if (index >= 0) {
            vocabs[index] = cleanVocab;
        } else {
            vocabs.push(cleanVocab);
        }

        localStorage.setItem('teacher_vocab_library', JSON.stringify(vocabs));
        console.log('Auto-saved to local storage:', vocab.id);
    }

    createLibraryCard(container, vocab, type) {
        const card = createElement('div', 'card option-card');
        card.style.width = 'auto';
        card.style.margin = '0';
        card.style.cursor = 'pointer';
        card.style.position = 'relative';

        const badgeStyles = {
            remote: { color: 'var(--primary-color)', text: 'Repo' },
            local: { color: 'var(--accent-color)', text: 'Local' },
            cloud: { color: 'var(--primary-hover)', text: 'Cloud' }
        };

        const badge = badgeStyles[type] || badgeStyles.remote;

        let deleteBtnHtml = '';
        if (type === 'local' || type === 'cloud') {
            const label = type === 'cloud' ? 'Delete Cloud' : 'Delete Local';
            deleteBtnHtml = `<button class="delete-vocab-btn" style="position:absolute; bottom:10px; right:10px; background:transparent; border:none; color:red; cursor:pointer; font-size:1.2rem;" title="${label}">🗑️</button>`;
        }

        card.innerHTML = `
            <div class="badge" style="position:absolute; top:10px; right:10px; background:${badge.color}; color:white; padding:2px 6px; border-radius:4px; font-size:0.7rem;">${badge.text}</div>
            <div class="icon">${type === 'cloud' ? '☁️' : '📝'}</div>
            <h3>${vocab.name || 'Untitled'}</h3>
            <small style="color:var(--text-muted)">${vocab.id}</small>
            ${deleteBtnHtml}
        `;

        card.addEventListener('click', (e) => {
            // Prevent click if deleting
            if (e.target.closest('.delete-vocab-btn')) return;

            if (type === 'remote') {
                this.loadVocabularyFromPath(vocab.path);
            } else if (type === 'cloud') {
                this.vocabSet.source = 'cloud';
                this.loadVocabularyObject(vocab);
            } else {
                this.loadLocalVocabulary(vocab);
            }
        });

        if (type === 'local' || type === 'cloud') {
            const deleteBtn = card.querySelector('.delete-vocab-btn');
            if (deleteBtn) {
                deleteBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const label = type === 'cloud' ? 'cloud' : 'local';
                    if (confirm(`Delete ${label} vocabulary "${vocab.name}"? This cannot be undone.`)) {
                        if (type === 'local') {
                            this.deleteLocalVocab(vocab.id);
                        } else {
                            await this.deleteCloudVocab(vocab.id);
                        }
                        this.loadLibrary(); // Refresh
                    }
                });
            }
        }
        container.appendChild(card);
    }

    deleteLocalVocab(id) {
        let vocabs = this.getLocalVocabs();
        vocabs = vocabs.filter(v => v.id !== id);
        localStorage.setItem('teacher_vocab_library', JSON.stringify(vocabs));
    }

    async deleteCloudVocab(id) {
        if (!this.ensureAuthenticated()) return;
        try {
            const db = firebaseAuthService.getFirestore();
            const ref = doc(db, this.VOCAB_COLLECTION, id);
            await deleteDoc(ref);
        } catch (err) {
            console.error('Failed to delete cloud vocab', err);
            alert('Could not delete cloud vocabulary.');
        }
    }

    loadLocalVocabulary(vocab) {
        if (!this.ensureAuthenticated()) return;
        this.loadVocabularyObject(vocab);
    }

    async loadVocabularyFromPath(path) {
        if (!this.ensureAuthenticated()) return;
        const data = await fetchJSON(path);
        if (data) {
            this.loadVocabularyObject(data);
        } else {
            alert('Failed to load vocabulary file.');
        }
    }

    loadVocabularyObject(vocab) {
        const clone = JSON.parse(JSON.stringify(vocab));
        delete clone.__source;
        this.vocabSet = clone;
        this.updateFormUI();
        this.renderWords();
        this.showEditor();
    }

    // Helper to trigger auto-save
    triggerAutoSave() {
        if (!this.vocabSet.id) return;

        if (this.vocabSet.source === 'cloud') {
            this.queueCloudSave();
        } else {
            this.saveToLocal(this.vocabSet);
            this.queueCloudSave();
        }
    }

    queueCloudSave() {
        if (!this.isAuthenticated || !this.vocabSet.id) return;
        clearTimeout(this.cloudSaveTimeout);
        this.setCloudStatus('☁️ Saving...', 'info');
        this.cloudSaveTimeout = setTimeout(() => {
            this.saveToCloud();
        }, 800);
    }

    async saveToCloud() {
        if (!this.ensureAuthenticated(false)) return;
        if (!this.vocabSet.id) return;

        try {
            const db = firebaseAuthService.getFirestore();
            const docRef = doc(db, this.VOCAB_COLLECTION, this.vocabSet.id);
            const { __source, ...rest } = this.vocabSet;
            const payload = {
                ...rest,
                ownerId: this.currentUser ? this.currentUser.uid : null,
                updatedAt: serverTimestamp()
            };
            await setDoc(docRef, payload);
            console.log('Saved vocabulary to Firebase:', this.vocabSet.id);
            this.setCloudStatus('✅ Saved to cloud', 'success');
            setTimeout(() => this.setCloudStatus('☁️ Ready', 'info'), 1500);
        } catch (error) {
            console.error('Failed to save vocabulary to Firebase:', error);
            this.setCloudStatus('⚠️ Save failed', 'error');
            alert('Cloud save failed: ' + error.message + '\nCheck Firebase rules to ensure authenticated users can write to the vocabularies collection.');
        }
    }

    startNewVocab() {
        if (!this.ensureAuthenticated()) return;
        this.vocabSet = { id: `custom_${Date.now()}`, name: 'New Vocabulary', description: '', grades: [], words: [] };
        this.updateFormUI();
        this.renderWords();
        this.triggerAutoSave(); // Save immediately so it appears in library
        this.showEditor();
    }

    updateFormUI() {
        $('#vocab-id').value = this.vocabSet.id || '';
        $('#vocab-name').value = this.vocabSet.name || '';
        $('#vocab-desc').value = this.vocabSet.description || '';
        $('#vocab-grade').value = this.vocabSet.grades ? this.vocabSet.grades.join(', ') : (this.vocabSet.grade || '');

        // Load activity settings
        const settings = this.vocabSet.activitySettings || {};
        $('#setting-flashcards').value = settings.flashcards || '';
        $('#setting-matching').value = settings.matching || 10;
        $('#setting-quiz').value = settings.quiz || 10;
        $('#setting-synonym-antonym').value = settings.synonymAntonym || 10;
        $('#setting-word-search').value = settings.wordSearch || 10;
        $('#setting-illustration').value = settings.illustration || 10;
        $('#setting-crossword').value = settings.crossword || 10;
        $('#setting-hangman').value = settings.hangman || 10;
        $('#setting-scramble').value = settings.scramble || 10;
        $('#setting-speed-match').value = settings.speedMatch || 10;
        $('#setting-fill-in-blank').value = settings.fillInBlank || 10;

        // Gamification Settings
        $('#setting-completion-bonus').value = settings.completionBonus !== undefined ? settings.completionBonus : 50;
        $('#setting-exchange-rate').value = settings.exchangeRate !== undefined ? settings.exchangeRate : 10;
        $('#setting-progress-reward').value = settings.progressReward !== undefined ? settings.progressReward : 1;

        this.renderWords();
    }

    initListeners() {
        const loginButtons = ['#teacher-login-btn', '#teacher-login-view-btn'];
        loginButtons.forEach(selector => {
            const btn = $(selector);
            if (!btn) return;
            btn.addEventListener('click', async () => {
                const originalText = btn.innerHTML;
                btn.disabled = true;
                btn.innerHTML = '⏳ Signing in...';
                this.showAuthError('');
                try {
                    await firebaseAuthService.signInWithGoogle();
                } catch (error) {
                    console.error('Teacher sign-in failed:', error);
                    this.showAuthError('Sign-in failed. Please try again.');
                } finally {
                    btn.innerHTML = originalText;
                    btn.disabled = false;
                }
            });
        });

        const signOutBtn = $('#teacher-sign-out-btn');
        if (signOutBtn) {
            signOutBtn.addEventListener('click', async () => {
                try {
                    await firebaseAuthService.signOut();
                } catch (error) {
                    console.error('Sign out error:', error);
                }
            });
        }

        // Dashboard Actions
        $('#create-new-btn').addEventListener('click', () => {
            this.startNewVocab();
        });

        $('#view-progress-btn').addEventListener('click', () => {
            this.showProgressView();
        });

        $('#back-to-dashboard').addEventListener('click', () => {
            if (!this.ensureAuthenticated(false)) return;
            // Auto-save before leaving
            this.triggerAutoSave();
            this.loadLibrary(); // Refresh library list
            this.showDashboard();
        });

        $('#back-to-dashboard-from-progress').addEventListener('click', () => {
            this.showDashboard();
        });

        // Progress Filters
        $('#filter-grade').addEventListener('change', () => this.applyFilters());
        $('#filter-group').addEventListener('change', () => this.applyFilters());
        $('#filter-search').addEventListener('input', () => this.applyFilters());

        // Detail Modal
        $('#close-detail-modal').addEventListener('click', () => {
            $('#student-detail-modal').classList.add('hidden');
            this.activeStudentId = null;
        });
        $('#coin-adjust-btn').addEventListener('click', () => this.handleCoinAdjust());
        $$('.quick-coin-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const amt = parseInt(btn.dataset.amount, 10) || 0;
                $('#coin-adjust-input').value = amt;
                this.handleCoinAdjust();
            });
        });

        // Meta fields
        $('#vocab-id').addEventListener('input', (e) => { this.vocabSet.id = e.target.value; this.triggerAutoSave(); });
        $('#vocab-name').addEventListener('input', (e) => { this.vocabSet.name = e.target.value; this.triggerAutoSave(); });
        $('#vocab-desc').addEventListener('input', (e) => { this.vocabSet.description = e.target.value; this.triggerAutoSave(); });
        $('#vocab-grade').addEventListener('input', (e) => {
            // Parse comma separated values into array of numbers/strings
            const val = e.target.value;
            this.vocabSet.grades = val.split(',').map(s => s.trim()).filter(s => s !== '');
            this.triggerAutoSave();
        });

        // Activity Settings
        $('#setting-flashcards').addEventListener('input', (e) => {
            if (!this.vocabSet.activitySettings) this.vocabSet.activitySettings = {};
            this.vocabSet.activitySettings.flashcards = parseInt(e.target.value) || null;
            this.triggerAutoSave();
        });
        $('#setting-matching').addEventListener('input', (e) => {
            if (!this.vocabSet.activitySettings) this.vocabSet.activitySettings = {};
            this.vocabSet.activitySettings.matching = parseInt(e.target.value) || 10;
            this.triggerAutoSave();
        });
        $('#setting-quiz').addEventListener('input', (e) => {
            if (!this.vocabSet.activitySettings) this.vocabSet.activitySettings = {};
            this.vocabSet.activitySettings.quiz = parseInt(e.target.value) || 10;
            this.triggerAutoSave();
        });
        $('#setting-synonym-antonym').addEventListener('input', (e) => {
            if (!this.vocabSet.activitySettings) this.vocabSet.activitySettings = {};
            this.vocabSet.activitySettings.synonymAntonym = parseInt(e.target.value) || 10;
            this.triggerAutoSave();
        });
        $('#setting-word-search').addEventListener('input', (e) => {
            if (!this.vocabSet.activitySettings) this.vocabSet.activitySettings = {};
            this.vocabSet.activitySettings.wordSearch = parseInt(e.target.value) || 10;
            this.triggerAutoSave();
        });
        $('#setting-illustration').addEventListener('input', (e) => {
            if (!this.vocabSet.activitySettings) this.vocabSet.activitySettings = {};
            this.vocabSet.activitySettings.illustration = parseInt(e.target.value) || 10;
            this.triggerAutoSave();
        });
        $('#setting-crossword').addEventListener('input', (e) => {
            if (!this.vocabSet.activitySettings) this.vocabSet.activitySettings = {};
            this.vocabSet.activitySettings.crossword = parseInt(e.target.value) || 10;
            this.triggerAutoSave();
        });
        $('#setting-hangman').addEventListener('input', (e) => {
            if (!this.vocabSet.activitySettings) this.vocabSet.activitySettings = {};
            this.vocabSet.activitySettings.hangman = parseInt(e.target.value) || 10;
            this.triggerAutoSave();
        });
        $('#setting-scramble').addEventListener('input', (e) => {
            if (!this.vocabSet.activitySettings) this.vocabSet.activitySettings = {};
            this.vocabSet.activitySettings.scramble = parseInt(e.target.value) || 10;
            this.triggerAutoSave();
        });
        $('#setting-speed-match').addEventListener('input', (e) => {
            if (!this.vocabSet.activitySettings) this.vocabSet.activitySettings = {};
            this.vocabSet.activitySettings.speedMatch = parseInt(e.target.value) || 10;
            this.triggerAutoSave();
        });
        $('#setting-fill-in-blank').addEventListener('input', (e) => {
            if (!this.vocabSet.activitySettings) this.vocabSet.activitySettings = {};
            this.vocabSet.activitySettings.fillInBlank = parseInt(e.target.value) || 10;
            this.triggerAutoSave();
        });

        // Gamification Settings
        $('#setting-completion-bonus').addEventListener('input', (e) => {
            if (!this.vocabSet.activitySettings) this.vocabSet.activitySettings = {};
            this.vocabSet.activitySettings.completionBonus = parseInt(e.target.value) || 50;
            this.triggerAutoSave();
        });
        $('#setting-exchange-rate').addEventListener('input', (e) => {
            if (!this.vocabSet.activitySettings) this.vocabSet.activitySettings = {};
            this.vocabSet.activitySettings.exchangeRate = parseInt(e.target.value) || 10;
            this.triggerAutoSave();
        });
        $('#setting-progress-reward').addEventListener('input', (e) => {
            if (!this.vocabSet.activitySettings) this.vocabSet.activitySettings = {};
            this.vocabSet.activitySettings.progressReward = parseInt(e.target.value) || 1;
            this.triggerAutoSave();
        });

        // Add Word
        $('#add-word-btn').addEventListener('click', () => {
            if (!this.ensureAuthenticated()) return;
            this.openWordModal();
        });
        $('#generate-quiz-btn').addEventListener('click', () => {
            if (!this.ensureAuthenticated()) return;
            this.handleGenerateQuiz();
        });

        // Modal Actions
        $$('.close-modal').forEach(btn => {
            btn.addEventListener('click', () => {
                $('#word-modal').classList.add('hidden');
                this.editingWordIndex = -1;
            });
        });
        $('#close-quiz-modal').addEventListener('click', () => {
            $('#quiz-modal').classList.add('hidden');
        });
        $('#refresh-quiz-btn').addEventListener('click', () => this.handleGenerateQuiz(true));
        $('#print-quiz-btn').addEventListener('click', () => this.printQuiz());

        $('#save-word-btn').addEventListener('click', () => {
            if (!this.ensureAuthenticated()) return;
            this.saveWord();
            this.triggerAutoSave();
        });

        // Image Preview
        $('#image-input').addEventListener('input', (e) => {
            this.updateImagePreview(e.target.value);
        });

        // Export
        $('#export-btn').addEventListener('click', () => {
            if (!this.ensureAuthenticated()) return;
            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(this.vocabSet, null, 2));
            const downloadAnchorNode = document.createElement('a');
            downloadAnchorNode.setAttribute("href", dataStr);
            downloadAnchorNode.setAttribute("download", (this.vocabSet.id || "vocabulary") + ".json");
            document.body.appendChild(downloadAnchorNode);
            downloadAnchorNode.click();
            downloadAnchorNode.remove();
        });

        // Import
        $('#import-file').addEventListener('change', async (e) => {
            if (!this.ensureAuthenticated()) {
                e.target.value = '';
                return;
            }
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const data = JSON.parse(e.target.result);
                    this.vocabSet = data;

                    this.updateFormUI();
                    this.renderWords();
                    this.triggerAutoSave(); // Save imported file to localStorage
                    this.showEditor();

                    // Auto-download for repository
                    await this.downloadForRepository(data);
                } catch (err) {
                    alert('Error parsing JSON file');
                    console.error(err);
                }
            };
            reader.readAsText(file);
            // Reset input
            e.target.value = '';
        });

        // Quiz generation
        $('#generate-quiz-btn').addEventListener('click', () => {
            if (!this.ensureAuthenticated()) return;
            // New Quiz Maker Flow
            this.openQuizMaker();
        });
        // Disable old modal listeners or redirect them
        $('#close-quiz-modal').addEventListener('click', () => {
            $('#quiz-modal').classList.add('hidden');
        });
        // These buttons are inside the old modal, so they shouldn't be reachable if we don't open it.
        // But just in case:
        $('#refresh-quiz-btn').addEventListener('click', () => {
            // Redirect to new quiz maker if somehow clicked? 
            // Or just leave as is for legacy support if needed, but we want to hide the modal.
            // this.currentQuiz = this.generateSummativeQuiz();
            // this.renderQuizPreview();
        });
        $('#print-quiz-btn').addEventListener('click', () => {
            // this.printQuiz();
        });
    }

    openQuizMaker() {
        this.switchView('quiz-maker-view');
        // Initialize QuizMaker with current vocab
        this.quizMaker = new QuizMaker(this.vocabSet, () => {
            this.showEditor();
        });
    }

    // -------------------- Quiz Generation --------------------
    handleGenerateQuiz(force = false) {
        if (!this.vocabSet || !this.vocabSet.words || this.vocabSet.words.length === 0) {
            alert('Load a vocabulary set with words before generating a quiz.');
            return;
        }
        if (!force && this.currentQuiz && this.currentQuiz.vocabId === this.vocabSet.id) {
            // Redirect to new quiz maker instead of showing old preview
            this.openQuizMaker();
        } else {
            // Redirect to new quiz maker
            this.openQuizMaker();
        }
        // $('#quiz-modal').classList.remove('hidden'); // Disable old modal opening
    }

    buildSummativeQuiz(vocab) {
        const words = (vocab.words || []).filter(w => w.word && w.definition);
        const takeRandom = (arr, n) => {
            const copy = [...arr];
            const out = [];
            while (copy.length && out.length < n) {
                const idx = Math.floor(Math.random() * copy.length);
                out.push(copy.splice(idx, 1)[0]);
            }
            return out;
        };

        // True/False
        const tfStatements = [];
        takeRandom(words, Math.min(10, words.length)).forEach(w => {
            const isTrue = Math.random() > 0.5;
            let statement = `${w.word} means "${w.definition}".`;
            if (!isTrue) {
                const wrong = words.find(o => o.word !== w.word);
                if (wrong) statement = `${w.word} means "${wrong.definition}".`;
            }
            tfStatements.push({ text: statement, answer: isTrue ? 'T' : 'F' });
        });

        // Multiple choice
        const mcQuestions = [];
        takeRandom(words, Math.min(10, words.length)).forEach(w => {
            const distractors = takeRandom(words.filter(o => o.word !== w.word), 2);
            const options = [w.word, ...(distractors.map(d => d.word))];
            // shuffle
            const shuffled = options
                .map(val => ({ val, sort: Math.random() }))
                .sort((a, b) => a.sort - b.sort)
                .map(o => o.val);
            mcQuestions.push({
                prompt: w.definition,
                options: shuffled,
                answer: w.word
            });
        });

        // Fill-ins
        const fillIns = [];
        takeRandom(words, Math.min(5, words.length)).forEach(w => {
            fillIns.push({
                prompt: `If I need ${w.definition.toLowerCase()}, I need a ____________________.`,
                answer: w.word
            });
        });

        const theme = vocab.name || 'the unit';

        return {
            vocabId: vocab.id,
            title: `${vocab.name || 'Summative Activity'} - Summative #1`,
            criteria: [
                { label: 'Name and date', points: 1 },
                { label: 'Follow Instructions', points: 1 },
                { label: 'Order', points: 1 },
                { label: 'Correct use of tools', points: 1 },
                { label: 'Content', points: 36 }
            ],
            parts: {
                tf: { pointsPer: 1, totalPoints: 10, items: tfStatements },
                mc: { pointsPer: 1, totalPoints: 10, items: mcQuestions },
                fill: { pointsPer: 2, totalPoints: 10, items: fillIns },
                open: { points: 6, prompt: `Using your imagination, design something related to ${theme} and describe its function.` }
            },
            meta: {
                teacher: this.currentUser ? (this.currentUser.displayName || this.currentUser.email || '') : 'Teacher',
                gradeLabel: vocab.grade || (vocab.grades ? vocab.grades.join(', ') : ''),
                date: '______________',
                name: '___________________________',
                activityNumber: '1',
                totalPoints: 40
            }
        };
    }

    renderQuizPreview(quiz) {
        const container = $('#quiz-preview');
        if (!container || !quiz) return;
        const criteriaRows = quiz.criteria.map(c => `<div>${c.label}: ${c.points}pts</div>`).join('');
        const tfHtml = quiz.parts.tf.items.map((item, idx) =>
            `<div class="quiz-question">${idx + 1}. ${item.text} ______</div>`
        ).join('');
        const mcHtml = quiz.parts.mc.items.map((item, idx) => {
            const opts = item.options.map((opt, i) => {
                const letter = String.fromCharCode(65 + i);
                return `<div style="margin-left:1rem;">${letter}) ${opt}</div>`;
            }).join('');
            return `<div class="quiz-question">${idx + 1}. ${item.prompt}<div>${opts}</div></div>`;
        }).join('');
        const fillHtml = quiz.parts.fill.items.map((item, idx) =>
            `<div class="quiz-question">${idx + 1}. ${item.prompt}</div>`
        ).join('');

        container.innerHTML = `
            <div class="quiz-print-area">
                <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #333; padding-bottom:0.4rem;">
                    <div>
                        <div style="font-weight:bold; font-size:1.1rem;">ACADEMIA INTERNACIONAL DE DAVID</div>
                        <div>TECHNOLOGY SUMMATIVE ACTIVITY # ${quiz.meta.activityNumber}</div>
                    </div>
                    <div style="text-align:right; font-size:0.9rem;">
                        Grade: ${quiz.meta.gradeLabel || '____'}<br>
                        Teacher: ${quiz.meta.teacher}
                    </div>
                </div>
                <div class="quiz-header-grid">
                    <div>Name: ${quiz.meta.name}</div>
                    <div>Date: ${quiz.meta.date}</div>
                    <div>Total: ${quiz.meta.totalPoints}pts</div>
                </div>
                <div class="quiz-criteria">
                    ${criteriaRows}
                </div>
                <div class="quiz-section">
                    <h3>PART I: TRUE OR FALSE. (10pts / 1pt each)</h3>
                    ${tfHtml}
                </div>
                <div class="quiz-section">
                    <h3>PART II: CHOOSE THE BEST OPTION. (10pts / 1pt each)</h3>
                    ${mcHtml}
                </div>
                    <div class="quiz-section">
                    <h3>PART III: COMPLETE THE FOLLOWING IF SITUATIONS. (10pts / 2pts each)</h3>
                    ${fillHtml}
                </div>
                <div class="quiz-section">
                    <h3>PART IV: OPEN RESPONSE. (6pts)</h3>
                    <div style="margin:0.5rem 0;">${quiz.parts.open.prompt}</div>
                    <div style="border:1px solid #999; height:120px; margin-top:0.5rem;"></div>
                </div>
            </div>
        `;
    }

    printQuiz() {
        const area = document.querySelector('.quiz-print-area');
        if (!area) return;
        const win = window.open('', '_blank', 'width=900,height=1200');
        win.document.write(`<html><head><title>Summative Quiz</title><style>${document.querySelector('style') ? document.querySelector('style').innerHTML : ''}</style></head><body>${area.outerHTML}</body></html>`);
        win.document.close();
        win.focus();
        win.print();
    }

    async downloadForRepository(vocab) {
        // Confirm with user
        const shouldDownload = confirm(
            `Do you want to download files for the repository?\n\n` +
            `This will download:\n` +
            `1. ${vocab.id}.json (place in vocabularies/)\n` +
            `2. manifest.json (replace in vocabularies/)\n\n` +
            `Then commit and push to GitHub.`
        );

        if (!shouldDownload) return;

        // 1. Download vocabulary JSON file
        const vocabDataStr = JSON.stringify(vocab, null, 2);
        const vocabBlob = new Blob([vocabDataStr], { type: 'application/json' });
        const vocabUrl = URL.createObjectURL(vocabBlob);

        const vocabLink = document.createElement('a');
        vocabLink.href = vocabUrl;
        vocabLink.download = `${vocab.id}.json`;
        document.body.appendChild(vocabLink);
        vocabLink.click();
        document.body.removeChild(vocabLink);
        URL.revokeObjectURL(vocabUrl);

        // 2. Load current manifest and update it
        try {
            let manifest = await fetchJSON('vocabularies/manifest.json');
            if (!manifest) {
                manifest = { vocabularies: [] };
            }

            // Check if vocabulary already exists in manifest
            const existingIndex = manifest.vocabularies.findIndex(v => v.id === vocab.id);

            const manifestEntry = {
                id: vocab.id,
                name: vocab.name,
                description: vocab.description || '',
                grades: vocab.grades || (vocab.grade ? [vocab.grade] : []),
                path: `vocabularies/${vocab.id}.json`
            };

            if (existingIndex >= 0) {
                manifest.vocabularies[existingIndex] = manifestEntry;
            } else {
                manifest.vocabularies.push(manifestEntry);
            }

            // Download updated manifest
            const manifestDataStr = JSON.stringify(manifest, null, 2);
            const manifestBlob = new Blob([manifestDataStr], { type: 'application/json' });
            const manifestUrl = URL.createObjectURL(manifestBlob);

            const manifestLink = document.createElement('a');
            manifestLink.href = manifestUrl;
            manifestLink.download = 'manifest.json';
            document.body.appendChild(manifestLink);
            manifestLink.click();
            document.body.removeChild(manifestLink);
            URL.revokeObjectURL(manifestUrl);

            // Show instructions
            setTimeout(() => {
                alert(
                    `✅ Files downloaded!\n\n` +
                    `Next steps:\n` +
                    `1. Move ${vocab.id}.json to vocabularies/ folder\n` +
                    `2. Replace vocabularies/manifest.json\n` +
                    `3. Commit and push to GitHub\n\n` +
                    `The vocabulary will then be available everywhere!`
                );
            }, 500);

        } catch (err) {
            console.error('Error updating manifest:', err);
            alert('Downloaded vocabulary file, but could not update manifest. You may need to add it manually.');
        }
    }

    renderWords() {
        const container = $('#words-container');
        container.innerHTML = '';

        this.vocabSet.words.forEach((word, index) => {
            const card = createElement('div', 'word-card');
            card.innerHTML = `
                <div class="word-header" style="display:flex; justify-content:space-between; align-items:center;">
                    <h3>${word.word}</h3>
                    <div class="actions">
                        <button class="btn text-btn edit-btn" data-index="${index}">✏️</button>
                        <button class="btn text-btn delete-btn" data-index="${index}" style="color:var(--danger-color)">🗑️</button>
                    </div>
                </div>
                <span class="pos-tag">${word.part_of_speech}</span>
                <p>${word.definition}</p>
                ${word.image ? `<div style="margin-top:0.5rem; font-size:0.8rem; color:var(--text-muted)">🖼️ ${word.image}</div>` : ''}
            `;

            card.querySelector('.edit-btn').addEventListener('click', () => this.openWordModal(index));
            card.querySelector('.delete-btn').addEventListener('click', () => this.deleteWord(index));

            container.appendChild(card);
        });
    }

    openWordModal(index = -1) {
        this.editingWordIndex = index;
        const modal = $('#word-modal');
        const title = $('#modal-title');

        // Reset fields
        $('#word-input').value = '';
        $('#pos-input').value = 'noun';
        $('#def-input').value = '';
        $('#example-input').value = '';
        $('#image-input').value = '';
        this.updateImagePreview('');

        if (index > -1) {
            const word = this.vocabSet.words[index];
            title.textContent = 'Edit Word';
            $('#word-input').value = word.word;
            $('#pos-input').value = word.part_of_speech;
            $('#def-input').value = word.definition;
            $('#example-input').value = word.example || '';
            $('#image-input').value = word.image || '';
            this.updateImagePreview(word.image || '');
        } else {
            title.textContent = 'Add New Word';
        }

        modal.classList.remove('hidden');
    }

    closeModal() {
        $('#word-modal').classList.add('hidden');
        this.editingWordIndex = -1;
    }

    saveWord() {
        const newWord = {
            word: $('#word-input').value.trim(),
            part_of_speech: $('#pos-input').value,
            definition: $('#def-input').value.trim(),
            example: $('#example-input').value.trim(),
            image: $('#image-input').value.trim(),
            difficulty: 1, // Default
            synonyms: [], // TODO: Add UI for this
            antonyms: []  // TODO: Add UI for this
        };

        if (!newWord.word || !newWord.definition) {
            alert('Word and Definition are required!');
            return;
        }

        if (this.editingWordIndex > -1) {
            this.vocabSet.words[this.editingWordIndex] = newWord;
        } else {
            this.vocabSet.words.push(newWord);
        }

        this.closeModal();
        this.renderWords();
    }

    deleteWord(index) {
        if (confirm('Are you sure you want to delete this word?')) {
            this.vocabSet.words.splice(index, 1);
            this.renderWords();
        }
    }

    updateImagePreview(path) {
        const previewBox = $('#image-preview');
        if (!path) {
            previewBox.textContent = 'No Image';
            previewBox.innerHTML = 'No Image';
            return;
        }

        // In a real repo, this would point to the relative path
        // We can try to load it. If it fails, show error.
        const img = document.createElement('img');
        img.src = path;
        img.onerror = () => {
            previewBox.innerHTML = `<span style="color:var(--danger-color)">Image not found at path</span>`;
        };
        img.onload = () => {
            previewBox.innerHTML = '';
            previewBox.appendChild(img);
        };
    }

    exportJSON() {
        if (!this.vocabSet.id) {
            alert('Please provide a Vocabulary ID before exporting.');
            return;
        }

        const dataStr = JSON.stringify(this.vocabSet, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `${this.vocabSet.id}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    importJSON(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                this.vocabSet = data;

                this.updateFormUI();
                this.renderWords();
                this.showEditor();
            } catch (err) {
                alert('Error parsing JSON file');
                console.error(err);
            }
        };
        reader.readAsText(file);
    }

    async showProgressView() {
        if (!this.ensureAuthenticated(false)) return;
        this.switchView('teacher-progress-view');
        $('#export-btn').classList.add('hidden');

        const loadingEl = $('#progress-loading');
        const listEl = $('#student-progress-list');
        if (loadingEl) loadingEl.classList.remove('hidden');
        if (listEl) listEl.innerHTML = '';

        await this.fetchAllStudentProgress();
        this.populateFilters();
        this.applyFilters();
        this.renderProgressStats();

        if (loadingEl) loadingEl.classList.add('hidden');
    }

    async fetchAllStudentProgress() {
        try {
            const db = firebaseAuthService.getFirestore();
            const snapshot = await getDocs(collection(db, 'studentProgress'));
            this.allStudentData = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            this.filteredStudentData = [...this.allStudentData];
        } catch (error) {
            console.error('Error fetching student progress:', error);
            alert('Failed to load student data.');
        }
    }

    populateFilters() {
        const grades = new Set();
        const groups = new Set();

        this.allStudentData.forEach(student => {
            const profile = student.studentProfile || {};
            if (profile.grade) grades.add(profile.grade);
            if (profile.group) groups.add(profile.group);
        });

        const gradeSelect = $('#filter-grade');
        const groupSelect = $('#filter-group');

        if (gradeSelect) {
            gradeSelect.innerHTML = '<option value="">All Grades</option>';
            Array.from(grades).sort().forEach(g => {
                const opt = createElement('option');
                opt.value = g;
                opt.textContent = g;
                gradeSelect.appendChild(opt);
            });
        }

        if (groupSelect) {
            groupSelect.innerHTML = '<option value="">All Groups</option>';
            Array.from(groups).sort().forEach(g => {
                const opt = createElement('option');
                opt.value = g;
                opt.textContent = g;
                groupSelect.appendChild(opt);
            });
        }
    }

    applyFilters() {
        const grade = $('#filter-grade').value;
        const group = $('#filter-group').value;
        const search = $('#filter-search').value.toLowerCase();

        this.filteredStudentData = this.allStudentData.filter(student => {
            const profile = student.studentProfile || {};
            const name = (profile.firstName + ' ' + profile.lastName).toLowerCase();

            const matchGrade = !grade || profile.grade === grade;
            const matchGroup = !group || profile.group === group;
            const matchSearch = !search || name.includes(search);

            return matchGrade && matchGroup && matchSearch;
        });

        this.renderProgressTable();
    }

    renderProgressTable() {
        const tbody = $('#student-progress-list');
        if (!tbody) return;
        tbody.innerHTML = '';

        this.filteredStudentData.forEach(student => {
            const profile = student.studentProfile || {};
            const tr = createElement('tr');

            const name = profile.firstName && profile.lastName
                ? `${profile.firstName} ${profile.lastName}`
                : (profile.name || 'Unknown');

            const lastActive = student.updatedAt
                ? new Date(student.updatedAt.seconds * 1000).toLocaleDateString()
                : '-';

            tr.innerHTML = `
                <td style="padding: 1rem;">${name}</td>
                <td style="padding: 1rem; color: var(--text-muted);">${student.email || profile.email || '-'}</td>
                <td style="padding: 1rem;">${profile.grade || '-'}</td>
                <td style="padding: 1rem;">${profile.group || '-'}</td>
                <td style="padding: 1rem;">🪙 ${student.coins || 0}</td>
                <td style="padding: 1rem;">${lastActive}</td>
                <td style="padding: 1rem;">
                    <button class="btn text-btn view-details-btn" data-id="${student.id}">View Details</button>
                    <button class="btn secondary-btn add-coins-btn" data-id="${student.id}" style="margin-left:0.5rem;">Add Coins</button>
                </td>
            `;
            tbody.appendChild(tr);
        });

        // Add listeners to new buttons
        $$('.view-details-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.target.dataset.id;
                const student = this.allStudentData.find(s => s.id === id);
                if (student) this.showStudentDetails(student);
            });
        });
        $$('.add-coins-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.target.dataset.id;
                const student = this.allStudentData.find(s => s.id === id);
                if (student) {
                    this.showStudentDetails(student);
                    $('#coin-adjust-input').focus();
                }
            });
        });
    }

    showStudentDetails(student) {
        const modal = $('#student-detail-modal');
        const profile = student.studentProfile || {};
        this.activeStudentId = student.id;
        this.updateCoinStatus('');

        $('#detail-student-name').textContent = profile.firstName && profile.lastName
            ? `${profile.firstName} ${profile.lastName}`
            : (profile.name || 'Unknown');
        $('#detail-student-grade').textContent = profile.grade || '-';
        $('#detail-student-group').textContent = profile.group || '-';
        $('#detail-student-coins').textContent = student.coins || 0;
        const lastActiveDate = student.updatedAt
            ? new Date((student.updatedAt.seconds || 0) * 1000).toLocaleString()
            : '-';
        $('#detail-last-active').textContent = lastActiveDate;

        const list = $('#detail-activity-list');
        list.innerHTML = '';

        const units = student.units || {};
        let totalScores = 0;
        let scoreCount = 0;
        let totalActivities = 0;
        if (Object.keys(units).length === 0) {
            list.innerHTML = '<p style="color: var(--text-muted);">No activity data recorded.</p>';
        } else {
            for (const [unitName, unitData] of Object.entries(units)) {
                const card = createElement('div', 'card');
                card.style.padding = '1rem';

                let scoresHtml = '';
                if (unitData.scores) {
                    for (const [activity, data] of Object.entries(unitData.scores)) {
                        totalActivities++;
                        if (data.score !== undefined) {
                            totalScores += data.score;
                            scoreCount++;
                        }
                        scoresHtml += `
                            <div style="display: flex; justify-content: space-between; margin-top: 0.5rem; font-size: 0.9rem;">
                                <span style="text-transform: capitalize;">${activity}</span>
                                <span style="font-weight: bold; color: var(--primary-color);">${data.score}%</span>
                            </div>
                        `;
                    }
                }

                card.innerHTML = `
                    <h4 style="margin-bottom: 0.5rem;">${unitName}</h4>
                    <div style="border-top: 1px solid var(--border-color); padding-top: 0.5rem;">
                        ${scoresHtml || '<span style="color: var(--text-muted); font-size: 0.9rem;">No scores yet</span>'}
                    </div>
                `;
                list.appendChild(card);
            }
        }
        const avgScore = scoreCount ? Math.round(totalScores / scoreCount) : '-';
        $('#detail-avg-score').textContent = avgScore === '-' ? '-' : `${avgScore}%`;
        $('#detail-total-activities').textContent = totalActivities || '-';

        modal.classList.remove('hidden');
    }

    updateCoinStatus(message, state = 'muted') {
        const el = $('#coin-adjust-status');
        if (!el) return;
        const colors = {
            success: 'var(--accent-color)',
            muted: 'var(--text-muted)',
            error: 'var(--danger-color)'
        };
        el.style.color = colors[state] || colors.muted;
        el.textContent = message;
    }

    async handleCoinAdjust() {
        if (!this.activeStudentId) return;
        const input = $('#coin-adjust-input');
        const amount = parseInt(input.value, 10) || 0;
        if (amount <= 0) {
            this.updateCoinStatus('Enter a positive number.', 'error');
            return;
        }
        this.updateCoinStatus('Saving...', 'muted');
        try {
            await this.adjustStudentCoins(this.activeStudentId, amount);
            this.updateCoinStatus(`Added ${amount} coins.`, 'success');
            $('#coin-adjust-input').value = '10';
        } catch (err) {
            console.error('Failed to adjust coins', err);
            this.updateCoinStatus('Failed to update coins.', 'error');
        }
    }

    async adjustStudentCoins(studentId, amount) {
        const student = this.allStudentData.find(s => s.id === studentId);
        if (!student) throw new Error('Student not found');
        const newTotal = Math.max(0, (student.coins || 0) + amount);

        const db = firebaseAuthService.getFirestore();
        const ref = doc(db, 'studentProgress', studentId);
        await setDoc(ref, { coins: newTotal, updatedAt: serverTimestamp() }, { merge: true });

        student.coins = newTotal;
        // sync filtered list item
        const filteredItem = this.filteredStudentData.find(s => s.id === studentId);
        if (filteredItem) filteredItem.coins = newTotal;

        $('#detail-student-coins').textContent = newTotal;
        this.renderProgressTable();
        this.renderProgressStats();
    }

    renderProgressStats() {
        const total = this.allStudentData.length;
        const now = Date.now();
        const active = this.allStudentData.filter(s => {
            if (!s.updatedAt) return false;
            const date = s.updatedAt.seconds ? s.updatedAt.seconds * 1000 : s.updatedAt;
            return now - date <= 7 * 24 * 60 * 60 * 1000;
        }).length;
        const avgCoins = total ? Math.round(this.allStudentData.reduce((sum, s) => sum + (s.coins || 0), 0) / total) : 0;
        const top = this.allStudentData
            .slice()
            .sort((a, b) => (b.coins || 0) - (a.coins || 0))[0];

        $('#stat-total-students').textContent = total || '--';
        $('#stat-active').textContent = active || '0';
        $('#stat-avg-coins').textContent = `${avgCoins}`;
        const topProfile = top && top.studentProfile ? `${top.studentProfile.firstName || ''} ${top.studentProfile.lastName || ''}`.trim() : '';
        $('#stat-top-student').textContent = top ? `${topProfile || (top.studentProfile?.name) || '—'} (${top.coins || 0})` : '--';
    }

    generateSummativeQuiz() {
        const vocab = this.vocabSet;
        if (!vocab || !Array.isArray(vocab.words) || vocab.words.length === 0) {
            alert('Load a vocabulary with words before generating a quiz.');
            return null;
        }

        const words = vocab.words.map(w => ({
            term: w.word || w.term || '',
            definition: w.definition || w.def || '',
            example: w.example || ''
        })).filter(w => w.term && w.definition);

        if (words.length < 4) {
            alert('Need at least 4 words with definitions to build a quiz.');
            return null;
        }

        const shuffle = (arr) => arr.map(a => ({ sort: Math.random(), value: a })).sort((a, b) => a.sort - b.sort).map(a => a.value);
        const pickDifferent = (arr, exceptIndex) => {
            const filtered = arr.filter((_, i) => i !== exceptIndex);
            return filtered[Math.floor(Math.random() * filtered.length)];
        };

        // Part I: True/False
        const tfItems = [];
        shuffle(words).slice(0, Math.min(10, words.length)).forEach((w, idx) => {
            const isTrue = idx % 2 === 0;
            let statement = `${w.term} ${w.definition}`;
            if (!isTrue) {
                const other = pickDifferent(words, idx);
                statement = `${w.term} ${other.definition}`;
            }
            tfItems.push({ statement, isTrue });
        });

        // Part II: Multiple choice
        const mcItems = [];
        shuffle(words).slice(0, Math.min(10, words.length)).forEach((w) => {
            const distractors = shuffle(words.filter(other => other.term !== w.term)).slice(0, 2);
            const options = shuffle([
                { label: 'A', text: distractors[0] ? distractors[0].term : 'Option A' },
                { label: 'B', text: w.term },
                { label: 'C', text: distractors[1] ? distractors[1].term : 'Option C' }
            ]);
            mcItems.push({
                prompt: `Which word matches: ${w.definition}`,
                options
            });
        });

        // Part III: Fill-ins
        const fillItems = [];
        shuffle(words).slice(0, Math.min(5, words.length)).forEach((w) => {
            fillItems.push({
                prompt: `If I need ${w.definition.toLowerCase()}, I need _____________________.`,
                answer: w.term
            });
        });

        // Part IV: Open response
        const openPrompt = `Using your own imagination, design a concept using the terms in this unit (${words.slice(0, 4).map(w => w.term).join(', ')}). Describe its function.`;

        const header = {
            school: 'ACADEMIA INTERNACIONAL DE DAVID',
            title: 'TECHNOLOGY SUMMATIVE ACTIVITY #1',
            nameLine: 'NAME: ___________________________   DATE: ________________',
            gradeLine: 'Grade: A   B   C',
            teacher: 'TEACHER: ____________________',
            total: 'TOTAL: 40pts'
        };

        const criteria = [
            { label: 'Name and date', points: 1 },
            { label: 'Follow Instructions', points: 1 },
            { label: 'Order', points: 1 },
            { label: 'Correct use of tools', points: 1 },
            { label: 'CONTENT', points: 36 },
            { label: 'TOTAL', points: 40 }
        ];

        return {
            header,
            criteria,
            instructions: 'This is an individual summative activity. Write clearly, follow directions, and answer each section carefully.',
            parts: {
                tf: { instructions: 'PART I: TRUE OR FALSE. Put T or F. (10pts – 1pt each).', items: tfItems },
                mc: { instructions: 'PART II: CHOOSE THE BEST OPTION. Circle the correct letter. (10pts – 1pt each).', items: mcItems },
                fill: { instructions: 'PART III: COMPLETE THE FOLLOWING. (10pts – 2pts each).', items: fillItems },
                open: { instructions: 'PART IV: DESIGN. (6pts)', prompt: openPrompt }
            }
        };
    }

    renderQuizPreview() {
        if (!this.currentQuiz) return;
        const container = $('#quiz-preview');
        if (!container) return;
        const q = this.currentQuiz;

        const criteriaRows = q.criteria.map(c => `<tr><td>${c.label}</td><td style="text-align:right;">${c.points} pts</td></tr>`).join('');

        const tfHtml = q.parts.tf.items.map((item, idx) => `<div class="quiz-question">${idx + 1}. ${item.statement} ________</div>`).join('');
        const mcHtml = q.parts.mc.items.map((item, idx) => `
            <div class="quiz-question">
                ${idx + 1}. ${item.prompt}
                <div class="quiz-options">
                    ${item.options.map(opt => `<div>${opt.label}) ${opt.text}</div>`).join('')}
                </div>
            </div>
        `).join('');
        const fillHtml = q.parts.fill.items.map((item, idx) => `<div class="quiz-question">${idx + 1}. ${item.prompt}</div>`).join('');

        container.innerHTML = `
            <div class="quiz-print-area">
                <div class="quiz-sheet">
                    <div class="quiz-band">
                        <div class="quiz-logo"><img src="./logo.jpeg" alt="Logo"></div>
                        <div class="quiz-band-title">
                            <h2 style="font-weight:700;">${q.header ? q.header.school : 'School Name'}</h2>
                            <h3 style="margin-top:0.2rem; font-weight:600;">${q.header ? q.header.title : 'Quiz Title'}</h3>
                        </div>
                        <div class="quiz-total-box">${q.header ? q.header.total : '0'}</div>
                    </div>
                    <div class="quiz-topline">
                        <div><label>Name:</label><span class="fill">&nbsp;</span></div>
                        <div><label>Date:</label><span class="fill">&nbsp;</span></div>
                        <div><label>Teacher:</label><span class="fill">&nbsp;</span></div>
                        <div><label>Grade:</label><span class="fill">&nbsp;</span></div>
                    </div>
                    <div class="quiz-instructions">
                        <strong>Instructions:</strong>
                        <div style="margin-top:0.35rem;">${q.instructions}</div>
                    </div>
                    <div class="quiz-criteria">
                        <table>
                            <thead><tr><th>Criteria</th><th style="text-align:right;">Points</th></tr></thead>
                            <tbody>${criteriaRows}</tbody>
                        </table>
                    </div>
                    <div class="quiz-section">
                        <h3>${q.parts.tf.instructions}</h3>
                        ${tfHtml}
                    </div>
                    <div class="quiz-section">
                        <h3>${q.parts.mc.instructions}</h3>
                        ${mcHtml}
                    </div>
                    <div class="quiz-section">
                        <h3>${q.parts.fill.instructions}</h3>
                        ${fillHtml}
                    </div>
                    <div class="quiz-section">
                        <h3>${q.parts.open.instructions}</h3>
                        <div style="margin-bottom:0.5rem;">${q.parts.open.prompt}</div>
                        <div style="height:140px; border:1px solid #d1d5db; border-radius:12px; margin-top:0.5rem; background:#fff;"></div>
                    </div>
                </div>
            </div>
        `;
    }

    printQuiz() {
        const preview = $('#quiz-preview');
        if (!preview) return;
        const printWindow = window.open('', '_blank', 'width=900,height=1000');
        if (!printWindow) return;
        printWindow.document.write(`
            <html>
                <head>
                    <title>Summative Quiz</title>
                    <style>
                        body { font-family: 'Inter', 'Times New Roman', serif; margin:20px; color:#111; background:#f5f6fb; }
                        .quiz-sheet { width:8.5in; max-width:100%; background:#fff; padding:0.6in; border:1px solid #e5e7eb; border-radius:22px; box-shadow:0 18px 40px -24px rgba(0,0,0,0.2); margin:0 auto; }
                        .quiz-band { display:grid; grid-template-columns:88px 1fr 110px; gap:14px; align-items:center; padding:14px 18px; border-radius:18px; border:1px solid rgba(15,23,42,0.08); background:linear-gradient(135deg,#f8fafc,#eef2ff); }
                        .quiz-logo { width:82px; height:82px; border-radius:18px; background:#fff; border:1px dashed #cbd5e1; display:flex; align-items:center; justify-content:center; overflow:hidden; }
                        .quiz-logo img { width:100%; height:100%; object-fit:contain; }
                        .quiz-total-box { text-align:right; font-weight:700; border:1px solid #e5e7eb; border-radius:12px; padding:0.5rem 0.65rem; background:#f8fafc; }
                        .quiz-topline { display:grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap:0.55rem; margin:0.75rem 0; }
                        .quiz-topline .fill { display:block; padding:0.65rem 0.75rem; border:1px dashed #cbd5e1; border-radius:14px; background:#f8fafc; min-height:40px; }
                        .quiz-topline label { font-size:0.85rem; color:#475569; }
                        .quiz-instructions { border:1px solid #e5e7eb; border-radius:14px; padding:0.75rem 0.9rem; background:#fafafa; margin-bottom:0.75rem; line-height:1.4; }
                        .quiz-criteria { margin: 12px 0 16px; }
                        .quiz-criteria table { width:100%; border-collapse: collapse; }
                        .quiz-criteria th, .quiz-criteria td { border:1px solid #111; padding:6px; text-align:left; }
                        .quiz-section { margin-top:16px; padding:12px; border:1px solid #e5e7eb; border-radius:12px; background:#fafbff; }
                        .quiz-question { margin:6px 0; line-height:1.35; }
                        .quiz-options { margin-left:16px; }
                    </style>
                </head>
                <body>${preview.innerHTML}</body>
            </html>
        `);
        printWindow.document.close();
        printWindow.focus();
        printWindow.print();
    }
}

// Initialize
const startTeacherApp = () => {
    if (!window.teacherApp) {
        window.teacherApp = new TeacherManager();
    }
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startTeacherApp);
} else {
    startTeacherApp();
}

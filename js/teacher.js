import { $, $$, createElement, fetchJSON, notifications } from './main.js';
import { QuizMaker } from './quizMaker.js';
import {
    firebaseAuthService,
    doc,
    setDoc,
    deleteDoc,
    getDoc,
    getDocs,
    collection,
    serverTimestamp,
    query,
    where,
    addDoc
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
        this.selectedStudents = new Set();
        this.dataViewerInitialized = false;

        this.init();
    }

    async init() {
        this.initListeners();
        this.initListeners();

        // Optimistic UI check
        if (localStorage.getItem('was_logged_in') === 'true') {
            this.updateAuthUI({ displayName: 'Resuming...', email: '...' }); // Placeholder UI
            this.showDashboard();
            this.loadLibrary();
        } else {
            this.showLoginView();
        }

        await this.initAuth();
    }

    async initAuth() {
        try {
            await firebaseAuthService.init();
            
            // Check for email link sign-in first (highest priority)
            // This handles when user clicks the magic link in their email
            if (firebaseAuthService.isEmailSignInLink()) {
                console.log('Email sign-in link detected, completing sign-in...');
                try {
                    const result = await firebaseAuthService.completeEmailSignIn();
                    console.log('Email link sign-in successful:', result.user.email);
                    await this.handleAuthWithRole(result.user);
                    return; // Don't continue with other auth checks
                } catch (error) {
                    if (error.message === 'EMAIL_REQUIRED') {
                        // User opened link on different device, show email confirmation prompt
                        this.showEmailConfirmPrompt();
                        return;
                    }
                    console.error('Email link sign-in failed:', error);
                    this.showAuthError('Email sign-in failed. Please try again.');
                }
            }
            
            // Check for redirect result (when using signInWithRedirect)
            // This must be called before onAuthStateChanged
            const redirectResult = await firebaseAuthService.handleRedirectResult();
            let redirectProcessed = false;
            if (redirectResult?.user) {
                console.log('Processing redirect sign-in result for teacher...');
                await this.handleAuthWithRole(redirectResult.user);
                redirectProcessed = true;
            }
            
            firebaseAuthService.onAuthStateChanged((user) => {
                if (user) {
                    // Only handle if we didn't already process redirect result
                    if (!redirectProcessed || !redirectResult?.user || redirectResult.user.uid !== user.uid) {
                        this.handleAuthWithRole(user);
                    }
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
    
    // Show email confirmation prompt for cross-device sign-in
    showEmailConfirmPrompt() {
        const form = $('#email-signin-form');
        const sentConfirmation = $('#email-sent-confirmation');
        const confirmPrompt = $('#email-confirm-prompt');
        
        if (form) form.style.display = 'none';
        if (sentConfirmation) sentConfirmation.style.display = 'none';
        if (confirmPrompt) confirmPrompt.style.display = 'block';
    }
    
    // Handle email link sign-in with confirmed email (cross-device)
    async completeEmailSignInWithEmail(email) {
        try {
            const result = await firebaseAuthService.completeEmailSignIn(email);
            console.log('Email link sign-in completed:', result.user.email);
            await this.handleAuthWithRole(result.user);
        } catch (error) {
            console.error('Email sign-in with confirmation failed:', error);
            this.showAuthError('Sign-in failed. The link may have expired. Please request a new one.');
            this.showLoginView();
            // Reset UI
            const form = $('#email-signin-form');
            const confirmPrompt = $('#email-confirm-prompt');
            if (form) form.style.display = 'block';
            if (confirmPrompt) confirmPrompt.style.display = 'none';
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
            localStorage.setItem('was_logged_in', 'true');
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
        const views = ['teacher-login-view', 'teacher-dashboard-view', 'teacher-editor-view', 'teacher-progress-view', 'quiz-maker-view', 'teacher-data-management-view'];
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
        this.loadGamificationSettings();
    }
    
    async loadGamificationSettings() {
        try {
            const db = firebaseAuthService.getFirestore();
            const settingsRef = doc(db, 'appSettings', 'gamification');
            const settingsSnap = await getDoc(settingsRef);
            
            if (settingsSnap.exists()) {
                const settings = settingsSnap.data();
                const exchangeRateInput = $('#global-exchange-rate');
                const completionBonusInput = $('#global-completion-bonus');
                const progressRewardInput = $('#global-progress-reward');
                
                if (exchangeRateInput && settings.exchangeRate !== undefined) {
                    exchangeRateInput.value = settings.exchangeRate;
                }
                if (completionBonusInput && settings.completionBonus !== undefined) {
                    completionBonusInput.value = settings.completionBonus;
                }
                if (progressRewardInput && settings.progressReward !== undefined) {
                    progressRewardInput.value = settings.progressReward;
                }
            }
        } catch (error) {
            console.error('Error loading gamification settings:', error);
        }
    }
    
    async saveGamificationSettings() {
        const exchangeRate = parseInt($('#global-exchange-rate')?.value) || 10;
        const completionBonus = parseInt($('#global-completion-bonus')?.value) || 50;
        const progressReward = parseInt($('#global-progress-reward')?.value) || 1;
        
        const statusEl = $('#gamification-save-status');
        const saveBtn = $('#save-gamification-btn');
        
        try {
            if (saveBtn) {
                saveBtn.disabled = true;
                saveBtn.innerHTML = '⏳ Saving...';
            }
            if (statusEl) statusEl.textContent = 'Saving settings...';
            
            const db = firebaseAuthService.getFirestore();
            const settingsRef = doc(db, 'appSettings', 'gamification');
            await setDoc(settingsRef, {
                exchangeRate,
                completionBonus,
                progressReward,
                updatedAt: serverTimestamp(),
                updatedBy: this.currentUser?.email || 'unknown'
            }, { merge: true });
            
            if (statusEl) {
                statusEl.style.color = 'var(--success-color)';
                statusEl.textContent = '✅ Settings saved successfully!';
                setTimeout(() => {
                    statusEl.textContent = '';
                    statusEl.style.color = 'var(--text-muted)';
                }, 3000);
            }
            
            notifications.success('Gamification settings saved!');
        } catch (error) {
            console.error('Error saving gamification settings:', error);
            if (statusEl) {
                statusEl.style.color = 'var(--danger-color)';
                statusEl.textContent = '❌ Failed to save settings. Check permissions.';
            }
            notifications.error('Failed to save settings.');
        } finally {
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.innerHTML = '💾 Save Settings';
            }
        }
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

    showElectronAuthMessage(loginBtn) {
        // Hide the regular login button
        if (loginBtn) {
            loginBtn.style.display = 'none';
        }
        
        // Check if message already exists
        let electronMsg = $('#electron-auth-message');
        if (electronMsg) {
            electronMsg.style.display = 'block';
            return;
        }
        
        // Create a helpful message for Electron/Cursor users
        electronMsg = document.createElement('div');
        electronMsg.id = 'electron-auth-message';
        electronMsg.style.cssText = `
            background: linear-gradient(135deg, rgba(99, 102, 241, 0.15), rgba(139, 92, 246, 0.15));
            border: 1px solid rgba(99, 102, 241, 0.3);
            border-radius: 12px;
            padding: 1.5rem;
            margin: 1rem auto;
            text-align: center;
            max-width: 400px;
        `;
        
        // Get the current URL (works for both localhost and deployed)
        const deployedUrl = window.location.href.split('?')[0]; // Remove query params if any
        
        electronMsg.innerHTML = `
            <div style="font-size: 2rem; margin-bottom: 0.5rem;">🌐</div>
            <h3 style="margin: 0 0 0.75rem 0; color: var(--text-main, #f8fafc);">Sign In via Browser</h3>
            <p style="margin: 0 0 1rem 0; color: var(--text-muted, #94a3b8); font-size: 0.9rem; line-height: 1.5;">
                Google Sign-In doesn't work in the Cursor browser. Please use one of these options:
            </p>
            <div style="display: flex; flex-direction: column; gap: 0.75rem;">
                <a href="${deployedUrl}" target="_blank" 
                   style="display: inline-flex; align-items: center; justify-content: center; gap: 0.5rem; 
                          background: var(--primary-color, #6366f1); color: white; padding: 0.75rem 1.5rem; 
                          border-radius: 8px; text-decoration: none; font-weight: 600; transition: all 0.2s;">
                    🔗 Open in Browser
                </a>
                <button id="copy-url-btn" 
                        style="display: inline-flex; align-items: center; justify-content: center; gap: 0.5rem;
                               background: transparent; border: 1px solid var(--border-color, rgba(255,255,255,0.2)); 
                               color: var(--text-main, #f8fafc); padding: 0.75rem 1.5rem; border-radius: 8px; 
                               cursor: pointer; font-weight: 500; transition: all 0.2s;">
                    📋 Copy URL
                </button>
            </div>
        `;
        
        // Insert after login button's parent
        const loginSection = loginBtn?.closest('.login-section') || loginBtn?.parentNode;
        if (loginSection) {
            loginSection.appendChild(electronMsg);
        }
        
        // Add copy URL functionality
        setTimeout(() => {
            const copyBtn = $('#copy-url-btn');
            if (copyBtn) {
                copyBtn.addEventListener('click', async () => {
                    try {
                        await navigator.clipboard.writeText(deployedUrl);
                        copyBtn.innerHTML = '✅ Copied!';
                        setTimeout(() => {
                            copyBtn.innerHTML = '📋 Copy URL';
                        }, 2000);
                    } catch (err) {
                        // Fallback for older browsers
                        const textArea = document.createElement('textarea');
                        textArea.value = deployedUrl;
                        document.body.appendChild(textArea);
                        textArea.select();
                        document.execCommand('copy');
                        document.body.removeChild(textArea);
                        copyBtn.innerHTML = '✅ Copied!';
                        setTimeout(() => {
                            copyBtn.innerHTML = '📋 Copy URL';
                        }, 2000);
                    }
                });
            }
        }, 0);
        
        // Clear any error message
        this.showAuthError('');
    }
    
    // ========== EMAIL LINK AUTHENTICATION LISTENERS ==========
    initEmailLinkListeners() {
        // Send email sign-in link button
        const sendEmailBtn = $('#send-email-link-btn');
        const emailInput = $('#teacher-email-input');
        
        if (sendEmailBtn && emailInput) {
            sendEmailBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                const email = emailInput.value.trim();
                
                if (!email) {
                    this.showAuthError('Please enter your email address.');
                    emailInput.focus();
                    return;
                }
                
                // Basic email validation
                const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                if (!emailRegex.test(email)) {
                    this.showAuthError('Please enter a valid email address.');
                    emailInput.focus();
                    return;
                }
                
                const originalText = sendEmailBtn.innerHTML;
                sendEmailBtn.disabled = true;
                sendEmailBtn.innerHTML = '⏳ Sending...';
                this.showAuthError('');
                
                try {
                    await firebaseAuthService.sendEmailSignInLink(email);
                    
                    // Show success message
                    const form = $('#email-signin-form');
                    const sentConfirmation = $('#email-sent-confirmation');
                    const sentEmailDisplay = $('#sent-email-display');
                    
                    if (form) form.style.display = 'none';
                    if (sentConfirmation) sentConfirmation.style.display = 'block';
                    if (sentEmailDisplay) sentEmailDisplay.textContent = email;
                    
                } catch (error) {
                    console.error('Failed to send email link:', error);
                    let errorMessage = 'Failed to send sign-in link. Please try again.';
                    
                    if (error.code === 'auth/invalid-email') {
                        errorMessage = 'Invalid email address.';
                    } else if (error.code === 'auth/network-request-failed') {
                        errorMessage = 'Network error. Please check your connection.';
                    }
                    
                    this.showAuthError(errorMessage);
                    sendEmailBtn.innerHTML = originalText;
                    sendEmailBtn.disabled = false;
                }
            });
            
            // Allow pressing Enter to submit
            emailInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    sendEmailBtn.click();
                }
            });
        }
        
        // Resend email button
        const resendBtn = $('#resend-email-btn');
        if (resendBtn) {
            resendBtn.addEventListener('click', () => {
                // Show the form again
                const form = $('#email-signin-form');
                const sentConfirmation = $('#email-sent-confirmation');
                
                if (form) form.style.display = 'block';
                if (sentConfirmation) sentConfirmation.style.display = 'none';
            });
        }
        
        // Confirm email button (for cross-device sign-in)
        const confirmEmailBtn = $('#confirm-email-btn');
        const confirmEmailInput = $('#confirm-email-input');
        
        if (confirmEmailBtn && confirmEmailInput) {
            confirmEmailBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                const email = confirmEmailInput.value.trim();
                
                if (!email) {
                    this.showAuthError('Please enter your email address.');
                    confirmEmailInput.focus();
                    return;
                }
                
                const originalText = confirmEmailBtn.innerHTML;
                confirmEmailBtn.disabled = true;
                confirmEmailBtn.innerHTML = '⏳ Signing in...';
                this.showAuthError('');
                
                await this.completeEmailSignInWithEmail(email);
                
                confirmEmailBtn.innerHTML = originalText;
                confirmEmailBtn.disabled = false;
            });
            
            // Allow pressing Enter to submit
            confirmEmailInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    confirmEmailBtn.click();
                }
            });
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
            this.setCloudStatus('✅ Saved to cloud', 'success');
            setTimeout(() => this.setCloudStatus('☁️ Ready', 'info'), 1500);
        } catch (error) {
            console.error('Failed to save vocabulary to Firebase:', error);
            this.setCloudStatus('⚠️ Save failed', 'error');
            notifications.error('Cloud save failed. Check Firebase rules to ensure authenticated users can write to the vocabularies collection.');
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
        // ========== EMAIL LINK SIGN-IN LISTENERS ==========
        this.initEmailLinkListeners();
        
        // ========== GOOGLE SIGN-IN LISTENERS ==========
        const loginButtons = ['#teacher-login-btn', '#teacher-login-view-btn'];
        loginButtons.forEach(selector => {
            const btn = $(selector);
            if (!btn) {
                console.warn(`Login button not found: ${selector}`);
                return;
            }
            btn.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                
                console.log('Teacher login button clicked!', selector);
                const originalText = btn.innerHTML;
                btn.disabled = true;
                btn.innerHTML = '⏳ Signing in...';
                this.showAuthError('');
                
                try {
                    console.log('Calling signInWithGoogle for teacher...');
                    const result = await firebaseAuthService.signInWithGoogle();
                    console.log('signInWithGoogle returned:', result);
                    
                    // If using redirect, the page will navigate away, so don't reset button
                    if (result) {
                        // Popup succeeded, reset button after delay
                        setTimeout(() => {
                            btn.innerHTML = originalText;
                            btn.disabled = false;
                        }, 1200);
                    } else {
                        console.log('Redirect mode - page should navigate away');
                        btn.innerHTML = '⏳ Redirecting to Google...';
                    }
                } catch (error) {
                    console.error('Teacher sign-in failed:', error);
                    console.error('Error details:', {
                        code: error.code,
                        message: error.message,
                        stack: error.stack
                    });
                    
                    // Check if this is an Electron/popup issue
                    if (error.message === 'ELECTRON_NO_POPUP' || error.message === 'POPUP_BLOCKED_MANUAL_AUTH' || 
                        error.code === 'auth/cancelled-popup-request' || error.code === 'auth/popup-blocked') {
                        this.showElectronAuthMessage(btn);
                        btn.innerHTML = originalText;
                        btn.disabled = false;
                        return;
                    }
                    
                    let errorMessage = 'Sign-in failed. Please try again.';
                    if (error.code === 'auth/network-request-failed') {
                        errorMessage = 'Network error. Please check your connection.';
                    } else if (error.message) {
                        errorMessage = `Sign-in failed: ${error.message}`;
                    }
                    this.showAuthError(errorMessage);
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
                } finally {
                    localStorage.removeItem('was_logged_in');
                    window.location.reload(); // Reload to clear state cleanly
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
        
        // Gamification Settings
        const saveGamificationBtn = $('#save-gamification-btn');
        if (saveGamificationBtn) {
            saveGamificationBtn.addEventListener('click', () => {
                this.saveGamificationSettings();
            });
        }

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

        // Data Management View Navigation
        $('#open-data-management-btn')?.addEventListener('click', () => {
            this.showDataManagementView();
        });

        $('#back-to-progress-from-data')?.addEventListener('click', () => {
            this.showProgressView();
        });
        $('#coin-adjust-btn').addEventListener('click', () => this.handleCoinAdjust());
        $$('.quick-coin-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const amt = parseInt(btn.dataset.amount, 10) || 0;
                $('#coin-adjust-input').value = amt;
                this.handleCoinAdjust();
            });
        });

        // Bulk Coin Distribution
        $('#select-all-students')?.addEventListener('change', (e) => {
            this.handleSelectAll(e.target.checked);
        });

        $('#bulk-add-coins-btn')?.addEventListener('click', () => {
            this.handleBulkCoinAdjust();
        });

        $('#bulk-clear-selection-btn')?.addEventListener('click', () => {
            this.clearSelection();
        });

        // Role Change Listener
        $('#detail-student-role')?.addEventListener('change', (e) => {
            this.updateStudentRole(e.target.value);
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
        this.initExportListeners();
        this.populateExportGradeSelect();
        this.initDataViewer();

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
            notifications.error('Failed to load student data.');
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

            // Add selected class if student is selected
            if (this.selectedStudents.has(student.id)) {
                tr.classList.add('selected');
            }

            const name = profile.firstName && profile.lastName
                ? `${profile.firstName} ${profile.lastName}`
                : (profile.name || 'Unknown');

            const lastActive = student.updatedAt
                ? new Date(student.updatedAt.seconds * 1000).toLocaleDateString()
                : '-';

            tr.innerHTML = `
                <td style="padding: 1rem;">
                    <input type="checkbox" class="student-checkbox" data-id="${student.id}" ${this.selectedStudents.has(student.id) ? 'checked' : ''}>
                </td>
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

        // Add listeners to new buttons and checkboxes
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
        $$('.student-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                const id = e.target.dataset.id;
                if (e.target.checked) {
                    this.selectedStudents.add(id);
                } else {
                    this.selectedStudents.delete(id);
                }
                this.updateBulkToolbar();
                this.updateSelectAllCheckbox();
                // Update row highlighting
                const row = e.target.closest('tr');
                if (e.target.checked) {
                    row.classList.add('selected');
                } else {
                    row.classList.remove('selected');
                }
            });
        });
    }

    async showStudentDetails(student) {
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

        // Fetch and set current role
        const roleSelect = $('#detail-student-role');
        roleSelect.value = 'student'; // Default
        roleSelect.disabled = true; // Disable until loaded

        try {
            const db = firebaseAuthService.getFirestore();
            const roleRef = doc(db, 'userRoles', student.id);
            const snap = await getDoc(roleRef);
            if (snap.exists()) {
                roleSelect.value = snap.data().role || 'student';
            }
        } catch (e) {
            console.error('Error fetching role:', e);
        } finally {
            roleSelect.disabled = false;
        }

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

    async updateStudentRole(role) {
        if (!this.activeStudentId) return;
        if (!confirm(`Are you sure you want to change this user's role to "${role}"?`)) {
            // Revert selection if cancelled
            const roleSelect = $('#detail-student-role');
            roleSelect.value = role === 'teacher' ? 'student' : 'teacher';
            return;
        }

        try {
            const db = firebaseAuthService.getFirestore();
            const roleRef = doc(db, 'userRoles', this.activeStudentId);
            // Get email from already loaded student data if available
            const student = this.allStudentData.find(s => s.id === this.activeStudentId);
            const email = student?.email || student?.studentProfile?.email || '';
            await setDoc(roleRef, { role: role, email: email }, { merge: true });
            notifications.success(`Role updated to ${role}. The user must sign out and sign back in to access teacher features.`);
            // Refresh the student details to show updated role
            if (student) {
                await this.showStudentDetails(student);
            }
        } catch (e) {
            console.error('Error updating role:', e);
            notifications.error('Failed to update role. Make sure Firestore rules are deployed.');
        }
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

    async adjustStudentCoins(studentId, amount, message = '') {
        const student = this.allStudentData.find(s => s.id === studentId);
        if (!student) throw new Error('Student not found');

        const db = firebaseAuthService.getFirestore();
        const ref = doc(db, 'studentProgress', studentId);
        
        // Get current coin data
        const snapshot = await getDoc(ref);
        let coinData = {
            balance: 0,
            giftCoins: 0,
            totalEarned: 0,
            totalSpent: 0,
            totalGifted: 0
        };
        
        if (snapshot.exists()) {
            const data = snapshot.data();
            if (data.coinData) {
                coinData = data.coinData;
            } else {
                // Migrate old format
                const oldCoins = data.coins || 0;
                coinData = {
                    balance: oldCoins,
                    giftCoins: 0,
                    totalEarned: oldCoins,
                    totalSpent: 0,
                    totalGifted: 0
                };
            }
        }

        // Add to giftCoins instead of balance
        coinData.giftCoins = (coinData.giftCoins || 0) + amount;
        
        // Update coin history
        const coinHistory = snapshot.data()?.coinHistory || [];
        coinHistory.push({
            type: 'gift',
            amount: amount,
            timestamp: new Date().toISOString(),
            source: 'teacher',
            description: message || 'Gift from teacher'
        });

        await setDoc(ref, {
            coinData: coinData,
            coinHistory: coinHistory.slice(-100), // Keep last 100
            coins: coinData.balance, // Legacy support
            updatedAt: serverTimestamp()
        }, { merge: true });

        // Update local student data (for display)
        student.coins = coinData.balance; // Show current balance, not including pending gifts
        const filteredItem = this.filteredStudentData.find(s => s.id === studentId);
        if (filteredItem) filteredItem.coins = coinData.balance;

        $('#detail-student-coins').textContent = coinData.balance;
        this.renderProgressTable();
        this.renderProgressStats();
    }

    handleSelectAll(checked) {
        if (checked) {
            // Select all filtered students
            this.filteredStudentData.forEach(student => {
                this.selectedStudents.add(student.id);
            });
        } else {
            // Deselect all
            this.selectedStudents.clear();
        }
        this.renderProgressTable();
        this.updateBulkToolbar();
    }

    clearSelection() {
        this.selectedStudents.clear();
        const selectAllCheckbox = $('#select-all-students');
        if (selectAllCheckbox) selectAllCheckbox.checked = false;
        this.renderProgressTable();
        this.updateBulkToolbar();
    }

    updateBulkToolbar() {
        const toolbar = $('#bulk-action-toolbar');
        const count = $('#bulk-selected-count');

        if (this.selectedStudents.size > 0) {
            toolbar?.classList.remove('hidden');
            if (count) {
                count.textContent = `${this.selectedStudents.size} student${this.selectedStudents.size > 1 ? 's' : ''} selected`;
            }
        } else {
            toolbar?.classList.add('hidden');
        }
    }

    updateSelectAllCheckbox() {
        const selectAllCheckbox = $('#select-all-students');
        if (!selectAllCheckbox) return;

        const visibleStudentIds = this.filteredStudentData.map(s => s.id);
        const allVisibleSelected = visibleStudentIds.length > 0 &&
            visibleStudentIds.every(id => this.selectedStudents.has(id));

        selectAllCheckbox.checked = allVisibleSelected;
        selectAllCheckbox.indeterminate = !allVisibleSelected &&
            visibleStudentIds.some(id => this.selectedStudents.has(id));
    }

    async handleBulkCoinAdjust() {
        if (this.selectedStudents.size === 0) {
            alert('Please select at least one student.');
            return;
        }

        const input = $('#bulk-coin-input');
        const amount = parseInt(input?.value, 10) || 0;

        if (amount <= 0) {
            alert('Please enter a positive number of coins.');
            return;
        }

        const confirmed = confirm(
            `Add ${amount} coins to ${this.selectedStudents.size} selected student${this.selectedStudents.size > 1 ? 's' : ''}?`
        );

        if (!confirmed) return;

        try {
            const db = firebaseAuthService.getFirestore();
            const { writeBatch } = await import('./firebaseService.js');
            const batch = writeBatch(db);

            // First, fetch all student data
            const studentSnapshots = await Promise.all(
                Array.from(this.selectedStudents).map(studentId => 
                    getDoc(doc(db, 'studentProgress', studentId))
                )
            );

            // Update each selected student
            let index = 0;
            for (const studentId of this.selectedStudents) {
                const student = this.allStudentData.find(s => s.id === studentId);
                if (!student) {
                    index++;
                    continue;
                }

                const snapshot = studentSnapshots[index];
                const ref = doc(db, 'studentProgress', studentId);
                
                let coinData = {
                    balance: 0,
                    giftCoins: 0,
                    totalEarned: 0,
                    totalSpent: 0,
                    totalGifted: 0
                };
                
                if (snapshot.exists()) {
                    const data = snapshot.data();
                    if (data.coinData) {
                        coinData = { ...data.coinData }; // Clone to avoid mutation
                    } else {
                        // Migrate old format
                        const oldCoins = data.coins || 0;
                        coinData = {
                            balance: oldCoins,
                            giftCoins: 0,
                            totalEarned: oldCoins,
                            totalSpent: 0,
                            totalGifted: 0
                        };
                    }
                }

                // Add to giftCoins
                coinData.giftCoins = (coinData.giftCoins || 0) + amount;
                
                // Update coin history
                const coinHistory = [...(snapshot.data()?.coinHistory || [])];
                coinHistory.push({
                    type: 'gift',
                    amount: amount,
                    timestamp: new Date().toISOString(),
                    source: 'teacher',
                    description: 'Bulk gift from teacher'
                });

                batch.set(ref, {
                    coinData: coinData,
                    coinHistory: coinHistory.slice(-100),
                    coins: coinData.balance, // Legacy support
                    updatedAt: serverTimestamp()
                }, { merge: true });

                // Update local data
                student.coins = coinData.balance;
                const filteredItem = this.filteredStudentData.find(s => s.id === studentId);
                if (filteredItem) filteredItem.coins = coinData.balance;
                
                index++;
            }

            await batch.commit();

            alert(`Successfully gifted ${amount} coins to ${this.selectedStudents.size} student${this.selectedStudents.size > 1 ? 's' : ''}! They will receive a notification when they log in.`);

            // Clear selection and refresh UI
            this.clearSelection();
            this.renderProgressTable();
            this.renderProgressStats();
        } catch (error) {
            console.error('Bulk coin adjustment failed:', error);
            alert('Failed to update coins. Please try again.');
        }
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
            notifications.warning('Load a vocabulary with words before generating a quiz.');
            return null;
        }

        const words = vocab.words.map(w => ({
            term: w.word || w.term || '',
            definition: w.definition || w.def || '',
            example: w.example || ''
        })).filter(w => w.term && w.definition);

        if (words.length < 4) {
            notifications.warning('Need at least 4 words with definitions to build a quiz.');
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

// ============================================
// Data Export & Reset Functions
// ============================================

// Add these methods to TeacherManager class
Object.assign(TeacherManager.prototype, {
    populateExportGradeSelect() {
        const gradeSelect = $('#export-grade-select');
        if (!gradeSelect) return;
        
        const grades = new Set();
        this.allStudentData.forEach(student => {
            const profile = student.studentProfile || {};
            if (profile.grade) grades.add(profile.grade);
        });
        
        gradeSelect.innerHTML = '<option value="">Select grade...</option>';
        Array.from(grades).sort().forEach(g => {
            const opt = createElement('option');
            opt.value = g;
            opt.textContent = g;
            gradeSelect.appendChild(opt);
        });
    },

    initExportListeners() {
        // Student selection radio buttons
        const studentSelectionRadios = document.querySelectorAll('input[name="student-selection"]');
        studentSelectionRadios.forEach(radio => {
            radio.addEventListener('change', () => {
                const gradeSelect = $('#export-grade-select');
                if (radio.value === 'grade') {
                    if (gradeSelect) gradeSelect.disabled = false;
                } else {
                    if (gradeSelect) gradeSelect.disabled = true;
                }
            });
        });

        // Preview button
        const previewBtn = $('#preview-data-btn');
        if (previewBtn) {
            previewBtn.addEventListener('click', () => this.previewData());
        }

        // Export buttons
        const exportJsonBtn = $('#export-json-btn');
        if (exportJsonBtn) {
            exportJsonBtn.addEventListener('click', () => this.exportData('json'));
        }

        const exportCsvBtn = $('#export-csv-btn');
        if (exportCsvBtn) {
            exportCsvBtn.addEventListener('click', () => this.exportData('csv'));
        }
    },

    getSelectedStudentIds() {
        const selection = document.querySelector('input[name="student-selection"]:checked')?.value || 'all';
        
        if (selection === 'all') {
            return this.allStudentData.map(s => s.id);
        } else if (selection === 'grade') {
            const grade = $('#export-grade-select')?.value;
            if (!grade) return [];
            return this.allStudentData
                .filter(s => (s.studentProfile || {}).grade === grade)
                .map(s => s.id);
        } else if (selection === 'specific') {
            return Array.from(this.selectedStudents);
        }
        return [];
    },

    getSelectedDataTypes() {
        const types = [];
        if ($('#export-progress')?.checked) types.push('studentProgress');
        if ($('#export-scores')?.checked) types.push('scores');
        if ($('#export-roles')?.checked) types.push('userRoles');
        return types;
    },

    async previewData() {
        const studentIds = this.getSelectedStudentIds();
        const dataTypes = this.getSelectedDataTypes();
        
        if (studentIds.length === 0) {
            notifications.warning('Please select at least one student.');
            return;
        }
        
        if (dataTypes.length === 0) {
            notifications.warning('Please select at least one data type to preview.');
            return;
        }

        const previewSection = $('#data-preview-section');
        const previewSummary = $('#preview-summary');
        const previewTables = $('#preview-tables');
        
        if (!previewSection || !previewSummary || !previewTables) return;

        previewSection.style.display = 'block';
        previewSummary.innerHTML = '<div class="loading-spinner">Loading preview...</div>';
        previewTables.innerHTML = '';

        try {
            const preview = await this.fetchPreviewData(studentIds, dataTypes);
            this.renderPreview(preview, previewSummary, previewTables);
        } catch (error) {
            console.error('Error previewing data:', error);
            notifications.error('Failed to load preview. Please try again.');
            previewSummary.innerHTML = '<p style="color: var(--danger-color);">Error loading preview.</p>';
        }
    },

    async fetchPreviewData(studentIds, dataTypes) {
        const db = firebaseAuthService.getFirestore();
        const preview = {
            studentProgress: [],
            scores: [],
            userRoles: [],
            summary: {
                totalStudents: studentIds.length,
                totalProgressRecords: 0,
                totalScores: 0,
                totalRoles: 0,
                dateRange: { start: null, end: null },
                totalCoins: 0,
                gamesPlayed: new Set()
            }
        };

        if (dataTypes.includes('studentProgress')) {
            for (const studentId of studentIds) {
                try {
                    const docRef = doc(db, 'studentProgress', studentId);
                    const docSnap = await getDoc(docRef);
                    if (docSnap.exists()) {
                        const data = { studentId, ...docSnap.data() };
                        preview.studentProgress.push(data);
                        preview.summary.totalProgressRecords++;
                        
                        // Calculate statistics
                        const coinData = data.coinData || {};
                        preview.summary.totalCoins += (coinData.balance || 0);
                        
                        if (data.updatedAt) {
                            const date = data.updatedAt.toDate ? data.updatedAt.toDate() : new Date(data.updatedAt.seconds * 1000);
                            if (!preview.summary.dateRange.start || date < preview.summary.dateRange.start) {
                                preview.summary.dateRange.start = date;
                            }
                            if (!preview.summary.dateRange.end || date > preview.summary.dateRange.end) {
                                preview.summary.dateRange.end = date;
                            }
                        }
                    }
                } catch (error) {
                    console.error(`Error fetching progress for ${studentId}:`, error);
                }
            }
        }

        if (dataTypes.includes('scores')) {
            const scoresRef = collection(db, 'scores');
            for (const studentId of studentIds) {
                try {
                    const q = query(scoresRef, where('userId', '==', studentId));
                    const snapshot = await getDocs(q);
                    snapshot.forEach(doc => {
                        preview.scores.push({ scoreId: doc.id, ...doc.data() });
                        preview.summary.totalScores++;
                        if (doc.data().gameId) {
                            preview.summary.gamesPlayed.add(doc.data().gameId);
                        }
                    });
                } catch (error) {
                    console.error(`Error fetching scores for ${studentId}:`, error);
                }
            }
        }

        if (dataTypes.includes('userRoles')) {
            for (const studentId of studentIds) {
                try {
                    const docRef = doc(db, 'userRoles', studentId);
                    const docSnap = await getDoc(docRef);
                    if (docSnap.exists()) {
                        preview.userRoles.push({ userId: studentId, ...docSnap.data() });
                        preview.summary.totalRoles++;
                    }
                } catch (error) {
                    console.error(`Error fetching role for ${studentId}:`, error);
                }
            }
        }

        return preview;
    },

    renderPreview(preview, summaryEl, tablesEl) {
        // Render summary
        const dateRange = preview.summary.dateRange;
        const dateStr = dateRange.start && dateRange.end
            ? `${dateRange.start.toLocaleDateString()} to ${dateRange.end.toLocaleDateString()}`
            : 'N/A';

        // Count vocabulary units
        let totalVocabUnits = 0;
        if (preview.studentProgress.length > 0) {
            preview.studentProgress.forEach(item => {
                if (item.units) {
                    totalVocabUnits += Object.keys(item.units).length;
                }
            });
        }

        summaryEl.innerHTML = `
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1rem; padding: 1rem; background: rgba(15, 23, 42, 0.4); border-radius: 8px; border: 1px solid var(--border-color, rgba(255, 255, 255, 0.125));">
                <div>
                    <div style="font-size: 0.8rem; color: var(--text-muted, #cbd5f5);">Total Students</div>
                    <div style="font-size: 1.5rem; font-weight: 600; color: var(--text-main, #f8fafc);">${preview.summary.totalStudents}</div>
                </div>
                ${preview.summary.totalProgressRecords > 0 ? `
                <div>
                    <div style="font-size: 0.8rem; color: var(--text-muted, #cbd5f5);">Progress Records</div>
                    <div style="font-size: 1.5rem; font-weight: 600; color: var(--text-main, #f8fafc);">${preview.summary.totalProgressRecords}</div>
                </div>
                ${totalVocabUnits > 0 ? `
                <div>
                    <div style="font-size: 0.8rem; color: var(--text-muted, #cbd5f5);">Vocabulary Units</div>
                    <div style="font-size: 1.5rem; font-weight: 600; color: var(--text-main, #f8fafc);">${totalVocabUnits}</div>
                </div>
                ` : ''}
                <div>
                    <div style="font-size: 0.8rem; color: var(--text-muted, #cbd5f5);">Total Coins</div>
                    <div style="font-size: 1.5rem; font-weight: 600; color: var(--text-main, #f8fafc);">${preview.summary.totalCoins.toLocaleString()}</div>
                </div>
                ` : ''}
                ${preview.summary.totalScores > 0 ? `
                <div>
                    <div style="font-size: 0.8rem; color: var(--text-muted, #cbd5f5);">Game Scores</div>
                    <div style="font-size: 1.5rem; font-weight: 600; color: var(--text-main, #f8fafc);">${preview.summary.totalScores}</div>
                </div>
                ` : ''}
                <div>
                    <div style="font-size: 0.8rem; color: var(--text-muted, #cbd5f5);">Date Range</div>
                    <div style="font-size: 0.9rem; font-weight: 600; color: var(--text-main, #f8fafc);">${dateStr}</div>
                </div>
            </div>
        `;

        // Render tables
        let tablesHTML = '';
        
        if (preview.studentProgress.length > 0) {
            tablesHTML += `
                <h5 style="margin-top: 1.5rem; margin-bottom: 0.5rem;">Student Progress (${preview.studentProgress.length} records)</h5>
                <table style="width: 100%; border-collapse: collapse; margin-bottom: 1.5rem;">
                    <thead>
                        <tr style="border-bottom: 2px solid var(--border-color);">
                            <th style="padding: 0.75rem; text-align: left;">Student ID</th>
                            <th style="padding: 0.75rem; text-align: left;">Name</th>
                            <th style="padding: 0.75rem; text-align: left;">Grade</th>
                            <th style="padding: 0.75rem; text-align: right;">Coins</th>
                            <th style="padding: 0.75rem; text-align: left;">Last Active</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${preview.studentProgress.slice(0, 10).map(item => {
                            const profile = item.studentProfile || {};
                            const name = profile.firstName && profile.lastName
                                ? `${profile.firstName} ${profile.lastName}`
                                : (profile.name || 'Unknown');
                            const coins = (item.coinData || {}).balance || 0;
                            const lastActive = item.updatedAt
                                ? (item.updatedAt.toDate ? item.updatedAt.toDate() : new Date(item.updatedAt.seconds * 1000)).toLocaleDateString()
                                : '-';
                            return `
                                <tr style="border-bottom: 1px solid var(--border-color);">
                                    <td style="padding: 0.75rem;">${item.studentId}</td>
                                    <td style="padding: 0.75rem;">${name}</td>
                                    <td style="padding: 0.75rem;">${profile.grade || '-'}</td>
                                    <td style="padding: 0.75rem; text-align: right;">${coins}</td>
                                    <td style="padding: 0.75rem;">${lastActive}</td>
                                </tr>
                            `;
                        }).join('')}
                        ${preview.studentProgress.length > 10 ? `
                            <tr>
                                <td colspan="5" style="padding: 0.75rem; text-align: center; color: var(--text-muted);">
                                    ... and ${preview.studentProgress.length - 10} more records
                                </td>
                            </tr>
                        ` : ''}
                    </tbody>
                </table>
            `;
        }

        if (preview.scores.length > 0) {
            tablesHTML += `
                <h5 style="margin-top: 1.5rem; margin-bottom: 0.5rem;">Leaderboard Scores (${preview.scores.length} records)</h5>
                <table style="width: 100%; border-collapse: collapse; margin-bottom: 1.5rem;">
                    <thead>
                        <tr style="border-bottom: 2px solid var(--border-color);">
                            <th style="padding: 0.75rem; text-align: left;">Student</th>
                            <th style="padding: 0.75rem; text-align: left;">Game</th>
                            <th style="padding: 0.75rem; text-align: right;">Score</th>
                            <th style="padding: 0.75rem; text-align: left;">Date</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${preview.scores.slice(0, 10).map(item => {
                            const date = item.timestamp
                                ? (item.timestamp.toDate ? item.timestamp.toDate() : new Date(item.timestamp.seconds * 1000)).toLocaleDateString()
                                : '-';
                            return `
                                <tr style="border-bottom: 1px solid var(--border-color);">
                                    <td style="padding: 0.75rem;">${item.name || item.userId}</td>
                                    <td style="padding: 0.75rem;">${item.gameId || '-'}</td>
                                    <td style="padding: 0.75rem; text-align: right;">${(item.score || 0).toLocaleString()}</td>
                                    <td style="padding: 0.75rem;">${date}</td>
                                </tr>
                            `;
                        }).join('')}
                        ${preview.scores.length > 10 ? `
                            <tr>
                                <td colspan="4" style="padding: 0.75rem; text-align: center; color: var(--text-muted);">
                                    ... and ${preview.scores.length - 10} more records
                                </td>
                            </tr>
                        ` : ''}
                    </tbody>
                </table>
            `;
        }

        tablesEl.innerHTML = tablesHTML || '<p style="color: var(--text-muted);">No data to display.</p>';
    },

    async exportData(format) {
        const studentIds = this.getSelectedStudentIds();
        const dataTypes = this.getSelectedDataTypes();
        
        if (studentIds.length === 0) {
            notifications.warning('Please select at least one student.');
            return;
        }
        
        if (dataTypes.length === 0) {
            notifications.warning('Please select at least one data type to export.');
            return;
        }

        // Show loading indicator
        const loadingEl = $('#export-loading');
        const loadingText = $('#export-loading-text');
        const progressBar = $('#export-progress-bar');
        const jsonBtn = $('#export-json-btn');
        const csvBtn = $('#export-csv-btn');
        
        if (loadingEl) loadingEl.style.display = 'block';
        if (jsonBtn) jsonBtn.disabled = true;
        if (csvBtn) csvBtn.disabled = true;
        
        const updateProgress = (percent, text) => {
            if (progressBar) progressBar.style.width = `${percent}%`;
            if (loadingText) loadingText.textContent = text;
        };

        try {
            updateProgress(5, 'Starting export...');
            
            const exportData = {};
            const totalSteps = dataTypes.length;
            let currentStep = 0;
            
            if (dataTypes.includes('studentProgress')) {
                updateProgress(10 + (currentStep / totalSteps) * 70, `Exporting student progress (${studentIds.length} students)...`);
                exportData.studentProgress = await this.exportStudentProgress(studentIds);
                currentStep++;
            }
            
            if (dataTypes.includes('scores')) {
                updateProgress(10 + (currentStep / totalSteps) * 70, 'Exporting leaderboard scores...');
                exportData.scores = await this.exportScores(studentIds);
                currentStep++;
            }
            
            if (dataTypes.includes('userRoles')) {
                updateProgress(10 + (currentStep / totalSteps) * 70, 'Exporting user roles...');
                exportData.userRoles = await this.exportUserRoles(studentIds);
                currentStep++;
            }

            updateProgress(85, 'Preparing download...');

            if (format === 'json') {
                this.downloadJSON(exportData, `data-export-${Date.now()}.json`);
            } else if (format === 'csv') {
                this.downloadCSV(exportData, `data-export-${Date.now()}.csv`);
            }

            updateProgress(95, 'Finalizing...');

            // Mark export as complete
            await this.markExportComplete(dataTypes, studentIds, format);
            
            updateProgress(100, 'Export complete!');
            
            // Hide loading after a brief delay to show completion
            setTimeout(() => {
                if (loadingEl) loadingEl.style.display = 'none';
                if (jsonBtn) jsonBtn.disabled = false;
                if (csvBtn) csvBtn.disabled = false;
            }, 500);
            
            notifications.success('Data exported successfully!');
        } catch (error) {
            console.error('Error exporting data:', error);
            
            // Hide loading on error
            if (loadingEl) loadingEl.style.display = 'none';
            if (jsonBtn) jsonBtn.disabled = false;
            if (csvBtn) csvBtn.disabled = false;
            
            notifications.error('Failed to export data. Please try again.');
        }
    },

    async exportStudentProgress(studentIds) {
        const db = firebaseAuthService.getFirestore();
        const progressData = [];
        
        for (const studentId of studentIds) {
            try {
                const docRef = doc(db, 'studentProgress', studentId);
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    progressData.push({
                        studentId: studentId,
                        ...docSnap.data()
                    });
                }
            } catch (error) {
                console.error(`Error exporting progress for ${studentId}:`, error);
            }
        }
        
        return progressData;
    },

    async exportScores(studentIds) {
        const db = firebaseAuthService.getFirestore();
        const scoresRef = collection(db, 'scores');
        const allScores = [];
        
        for (const studentId of studentIds) {
            try {
                const q = query(scoresRef, where('userId', '==', studentId));
                const snapshot = await getDocs(q);
                snapshot.forEach(doc => {
                    allScores.push({
                        scoreId: doc.id,
                        ...doc.data()
                    });
                });
            } catch (error) {
                console.error(`Error exporting scores for ${studentId}:`, error);
            }
        }
        
        return allScores;
    },

    async exportUserRoles(studentIds) {
        const db = firebaseAuthService.getFirestore();
        const rolesData = [];
        
        for (const studentId of studentIds) {
            try {
                const docRef = doc(db, 'userRoles', studentId);
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    rolesData.push({
                        userId: studentId,
                        ...docSnap.data()
                    });
                }
            } catch (error) {
                console.error(`Error exporting role for ${studentId}:`, error);
            }
        }
        
        return rolesData;
    },

    downloadJSON(data, filename) {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    },

    downloadCSV(data, filename) {
        // Convert to CSV format
        let csv = '';
        
        if (data.studentProgress && data.studentProgress.length > 0) {
            csv += 'Student Progress (includes vocabulary progress, scores, coins, images)\n';
            csv += 'Student ID,Name,Grade,Coins,Total Earned,Vocab Units,Last Active\n';
            data.studentProgress.forEach(item => {
                const profile = item.studentProfile || {};
                const name = profile.firstName && profile.lastName
                    ? `${profile.firstName} ${profile.lastName}`
                    : (profile.name || 'Unknown');
                const coins = (item.coinData || {}).balance || 0;
                const totalEarned = (item.coinData || {}).totalEarned || 0;
                const vocabUnits = item.units ? Object.keys(item.units).length : 0;
                const lastActive = item.updatedAt
                    ? (item.updatedAt.toDate ? item.updatedAt.toDate() : new Date(item.updatedAt.seconds * 1000)).toISOString()
                    : '';
                csv += `"${item.studentId}","${name}","${profile.grade || ''}",${coins},${totalEarned},${vocabUnits},"${lastActive}"\n`;
            });
            csv += '\n';
            
            // Add vocabulary progress details
            csv += 'Vocabulary Progress Details\n';
            csv += 'Student ID,Vocabulary Name,Activity,Score,Last Updated\n';
            data.studentProgress.forEach(item => {
                if (item.units) {
                    Object.entries(item.units).forEach(([vocabName, unitData]) => {
                        if (unitData.scores) {
                            Object.entries(unitData.scores).forEach(([activity, scoreData]) => {
                                const score = scoreData.score || 0;
                                const updated = scoreData.updatedAt
                                    ? (scoreData.updatedAt.toDate ? scoreData.updatedAt.toDate() : new Date(scoreData.updatedAt.seconds * 1000)).toISOString()
                                    : '';
                                csv += `"${item.studentId}","${vocabName}","${activity}",${score},"${updated}"\n`;
                            });
                        }
                    });
                }
            });
            csv += '\n';
        }
        
        if (data.scores && data.scores.length > 0) {
            csv += 'Leaderboard Scores\n';
            csv += 'Student,Game,Score,Grade,Date\n';
            data.scores.forEach(item => {
                const date = item.timestamp
                    ? (item.timestamp.toDate ? item.timestamp.toDate() : new Date(item.timestamp.seconds * 1000)).toISOString()
                    : '';
                csv += `"${item.name || item.userId}","${item.gameId || ''}",${item.score || 0},"${item.grade || ''}","${date}"\n`;
            });
            csv += '\n';
        }
        
        if (data.userRoles && data.userRoles.length > 0) {
            csv += 'User Roles\n';
            csv += 'User ID,Role,Email\n';
            data.userRoles.forEach(item => {
                csv += `"${item.userId}","${item.role || ''}","${item.email || ''}"\n`;
            });
        }
        
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    },

    async markExportComplete(dataTypes, studentIds, exportFormat) {
        const exportRecord = {
            timestamp: new Date().toISOString(),
            teacherId: this.currentUser?.uid || '',
            dataTypes: dataTypes,
            studentCount: studentIds.length,
            format: exportFormat,
            filename: `export-${Date.now()}.${exportFormat}`
        };
        
        // Store in localStorage
        localStorage.setItem('lastExport', JSON.stringify(exportRecord));
        
        // Update UI
        const exportStatus = $('#export-status');
        const exportStatusText = $('#export-status-text');
        if (exportStatus && exportStatusText) {
            exportStatus.style.display = 'block';
            exportStatusText.textContent = `Export completed: ${exportRecord.filename}`;
        }
        
        // Enable reset section
        this.enableResetSection();
        
        // Log to Firestore (optional audit)
        try {
            const db = firebaseAuthService.getFirestore();
            await addDoc(collection(db, 'exportLogs'), {
                ...exportRecord,
                timestamp: serverTimestamp()
            });
        } catch (error) {
            console.error('Error logging export:', error);
            // Don't fail if audit logging fails
        }
    },

    enableResetSection() {
        const resetSection = $('#data-reset-section');
        const resetBtn = $('#reset-data-btn');
        const resetStatus = $('#reset-export-status');
        
        if (resetSection && resetBtn && resetStatus) {
            resetSection.style.opacity = '1';
            resetSection.style.pointerEvents = 'auto';
            resetBtn.disabled = false;
            resetStatus.innerHTML = '<span style="color: var(--success-color);">✅ Export completed. Reset is now enabled.</span>';
        }
    },

    // ============================================
    // Data Viewer Functions
    // ============================================
    
    initDataViewer() {
        // Check if already initialized to prevent duplicate listeners
        if (this.dataViewerInitialized) return;
        this.dataViewerInitialized = true;

        // Tab switching
        const tabButtons = document.querySelectorAll('.data-tab-btn');
        tabButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const tab = btn.dataset.tab;
                this.switchDataTab(tab);
            });
        });
        
        // Dashboard grade filter
        const dashboardGradeFilter = $('#dashboard-grade-filter');
        if (dashboardGradeFilter) {
            dashboardGradeFilter.addEventListener('change', () => {
                this.loadDashboardData();
            });
        }

        // File input
        const fileInput = $('#load-json-file');
        const chooseFileBtn = $('#choose-file-btn');
        const clearFileBtn = $('#clear-file-btn');
        
        if (chooseFileBtn && fileInput) {
            chooseFileBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (fileInput) {
                    fileInput.click();
                }
            });
        }

        if (fileInput) {
            fileInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) {
                    this.loadJSONFile(file);
                    // Reset input so same file can be selected again
                    e.target.value = '';
                }
            });
        }

        if (clearFileBtn) {
            clearFileBtn.addEventListener('click', () => {
                this.clearLoadedData();
            });
        }

        // Drag and drop
        const fileLoader = $('#file-loader');
        if (fileLoader) {
            fileLoader.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.stopPropagation();
                fileLoader.style.borderColor = 'var(--primary-color, #6366f1)';
                fileLoader.style.background = 'rgba(99, 102, 241, 0.2)';
            });

            fileLoader.addEventListener('dragleave', (e) => {
                e.preventDefault();
                e.stopPropagation();
                fileLoader.style.borderColor = 'var(--border-color, rgba(255, 255, 255, 0.125))';
                fileLoader.style.background = 'rgba(15, 23, 42, 0.3)';
            });

            fileLoader.addEventListener('drop', (e) => {
                e.preventDefault();
                e.stopPropagation();
                fileLoader.style.borderColor = 'var(--border-color, rgba(255, 255, 255, 0.125))';
                fileLoader.style.background = 'rgba(15, 23, 42, 0.3)';
                
                const file = e.dataTransfer.files[0];
                if (file && (file.type === 'application/json' || file.name.endsWith('.json'))) {
                    this.loadJSONFile(file);
                } else {
                    notifications.warning('Please drop a JSON file.');
                }
            });
        }
    },

    switchDataTab(tab) {
        // Update tab buttons
        document.querySelectorAll('.data-tab-btn').forEach(btn => {
            if (btn.dataset.tab === tab) {
                btn.classList.add('active');
                btn.style.borderBottomColor = 'var(--primary-color, #6366f1)';
                btn.style.color = 'var(--text-main, #f8fafc)';
            } else {
                btn.classList.remove('active');
                btn.style.borderBottomColor = 'transparent';
                btn.style.color = 'var(--text-muted, #cbd5f5)';
            }
        });

        // Update tab content
        document.querySelectorAll('.data-tab-content').forEach(content => {
            content.style.display = 'none';
        });

        if (tab === 'dashboard') {
            $('#data-dashboard-section').style.display = 'block';
            this.loadDashboardData();
        } else if (tab === 'export') {
            $('#data-export-section').style.display = 'block';
        } else if (tab === 'view') {
            $('#data-viewer-section').style.display = 'block';
        } else if (tab === 'reset') {
            $('#data-reset-section').style.display = 'block';
        }
    },

    showDataManagementView() {
        if (!this.ensureAuthenticated(false)) return;
        this.switchView('teacher-data-management-view');
        // Initialize data viewer if not already done
        if (!this.dataViewerInitialized) {
            this.initDataViewer();
        }
        // Switch to dashboard tab by default
        this.switchDataTab('dashboard');
    },

    async loadDashboardData() {
        // Ensure student data is loaded
        if (this.allStudentData.length === 0) {
            await this.fetchAllStudentProgress();
        }
        
        // Populate grade filter dropdown
        this.populateDashboardGradeFilter();
        
        // Get filtered data based on selected grade
        const filteredData = this.getDashboardFilteredData();
        
        // Load summary stats
        const totalStudents = filteredData.length;
        const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
        const activeStudents = filteredData.filter(s => {
            const lastActive = s.updatedAt?.toMillis?.() || s.updatedAt || 0;
            return lastActive > sevenDaysAgo;
        }).length;
        
        const totalCoins = filteredData.reduce((sum, s) => {
            const coins = s.coinData?.balance || s.coins || 0;
            return sum + coins;
        }, 0);
        const avgCoins = totalStudents > 0 ? Math.round(totalCoins / totalStudents) : 0;

        // Update summary cards
        $('#dashboard-total-students').textContent = totalStudents;
        $('#dashboard-active-students').textContent = activeStudents;
        $('#dashboard-avg-coins').textContent = avgCoins.toLocaleString();
        
        // Load vocabulary count
        try {
            const db = firebaseAuthService.getFirestore();
            const vocabSnapshot = await getDocs(collection(db, 'vocabularies'));
            $('#dashboard-vocab-count').textContent = vocabSnapshot.size;
        } catch (err) {
            console.error('Error loading vocab count:', err);
            $('#dashboard-vocab-count').textContent = '--';
        }

        // Load charts
        this.renderDashboardCharts();
        this.renderRecentActivity();
    },
    
    populateDashboardGradeFilter() {
        const gradeFilter = $('#dashboard-grade-filter');
        if (!gradeFilter) return;
        
        // Get unique grades from student data (grade is in studentProfile.grade)
        const grades = new Set();
        this.allStudentData.forEach(student => {
            const profile = student.studentProfile || {};
            const grade = profile.grade || '';
            if (grade) grades.add(grade);
        });
        
        // Sort grades (handle both numeric and string grades)
        const sortedGrades = Array.from(grades).sort((a, b) => {
            const numA = parseInt(a);
            const numB = parseInt(b);
            if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
            return String(a).localeCompare(String(b));
        });
        
        // Preserve current selection
        const currentValue = gradeFilter.value;
        
        // Clear and rebuild options
        gradeFilter.innerHTML = '<option value="">All Grades</option>';
        sortedGrades.forEach(grade => {
            const option = document.createElement('option');
            option.value = grade;
            option.textContent = `Grade ${grade}`;
            gradeFilter.appendChild(option);
        });
        
        // Restore selection if still valid
        if (currentValue && sortedGrades.includes(currentValue)) {
            gradeFilter.value = currentValue;
        }
    },
    
    getDashboardFilteredData() {
        const gradeFilter = $('#dashboard-grade-filter');
        const selectedGrade = gradeFilter?.value || '';
        
        if (!selectedGrade) {
            return this.allStudentData;
        }
        
        return this.allStudentData.filter(student => {
            const profile = student.studentProfile || {};
            const studentGrade = profile.grade || '';
            return String(studentGrade) === String(selectedGrade);
        });
    },

    renderDashboardCharts() {
        // Activity Completion Chart
        const activityCtx = document.getElementById('activity-chart')?.getContext('2d');
        if (activityCtx && typeof Chart !== 'undefined') {
            const activityData = this.calculateActivityCompletion();
            if (this.activityChart) this.activityChart.destroy();
            this.activityChart = new Chart(activityCtx, {
                type: 'bar',
                data: {
                    labels: Object.keys(activityData),
                    datasets: [{
                        label: 'Completion Rate (%)',
                        data: Object.values(activityData),
                        backgroundColor: 'rgba(99, 102, 241, 0.6)',
                        borderColor: 'rgba(99, 102, 241, 1)',
                        borderWidth: 1
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: {
                            beginAtZero: true,
                            max: 100,
                            ticks: { color: '#cbd5f5' },
                            grid: { color: 'rgba(255, 255, 255, 0.1)' }
                        },
                        x: {
                            ticks: { color: '#cbd5f5' },
                            grid: { color: 'rgba(255, 255, 255, 0.1)' }
                        }
                    },
                    plugins: {
                        legend: { labels: { color: '#cbd5f5' } }
                    }
                }
            });
        }

        // Progress by Grade Chart
        const gradeCtx = document.getElementById('grade-progress-chart')?.getContext('2d');
        if (gradeCtx && typeof Chart !== 'undefined') {
            const gradeData = this.calculateGradeProgress();
            if (this.gradeChart) this.gradeChart.destroy();
            this.gradeChart = new Chart(gradeCtx, {
                type: 'doughnut',
                data: {
                    labels: Object.keys(gradeData),
                    datasets: [{
                        data: Object.values(gradeData),
                        backgroundColor: [
                            'rgba(99, 102, 241, 0.6)',
                            'rgba(16, 185, 129, 0.6)',
                            'rgba(251, 191, 36, 0.6)',
                            'rgba(239, 68, 68, 0.6)',
                            'rgba(139, 92, 246, 0.6)'
                        ]
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { labels: { color: '#cbd5f5' }, position: 'bottom' }
                    }
                }
            });
        }

        // Coin Distribution Chart
        const coinCtx = document.getElementById('coin-distribution-chart')?.getContext('2d');
        if (coinCtx && typeof Chart !== 'undefined') {
            const coinData = this.calculateCoinDistribution();
            if (this.coinChart) this.coinChart.destroy();
            this.coinChart = new Chart(coinCtx, {
                type: 'line',
                data: {
                    labels: coinData.labels,
                    datasets: [{
                        label: 'Students',
                        data: coinData.data,
                        borderColor: 'rgba(99, 102, 241, 1)',
                        backgroundColor: 'rgba(99, 102, 241, 0.1)',
                        tension: 0.4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: { color: '#cbd5f5' },
                            grid: { color: 'rgba(255, 255, 255, 0.1)' }
                        },
                        x: {
                            ticks: { color: '#cbd5f5' },
                            grid: { color: 'rgba(255, 255, 255, 0.1)' }
                        }
                    },
                    plugins: {
                        legend: { labels: { color: '#cbd5f5' } }
                    }
                }
            });
        }

        // Activity Usage Chart
        const usageCtx = document.getElementById('activity-usage-chart')?.getContext('2d');
        if (usageCtx && typeof Chart !== 'undefined') {
            const usageData = this.calculateActivityUsage();
            if (this.usageChart) this.usageChart.destroy();
            this.usageChart = new Chart(usageCtx, {
                type: 'pie',
                data: {
                    labels: Object.keys(usageData),
                    datasets: [{
                        data: Object.values(usageData),
                        backgroundColor: [
                            'rgba(99, 102, 241, 0.6)',
                            'rgba(16, 185, 129, 0.6)',
                            'rgba(251, 191, 36, 0.6)',
                            'rgba(239, 68, 68, 0.6)',
                            'rgba(139, 92, 246, 0.6)',
                            'rgba(236, 72, 153, 0.6)'
                        ]
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { labels: { color: '#cbd5f5' }, position: 'bottom' }
                    }
                }
            });
        }
    },

    calculateActivityCompletion() {
        const filteredData = this.getDashboardFilteredData();
        const activityLabels = {
            matching: 'Matching',
            flashcards: 'Flashcards',
            quiz: 'Quiz',
            hangman: 'Hangman',
            fillInBlank: 'Fill in Blank',
            wordSearch: 'Word Search',
            crossword: 'Crossword'
        };
        const completion = {};
        
        Object.entries(activityLabels).forEach(([activityKey, activityLabel]) => {
            let completed = 0;
            let total = 0;
            
            filteredData.forEach(student => {
                const units = student.units || {};
                Object.values(units).forEach(unit => {
                    // Scores are stored in unit.scores[activityKey]
                    const scores = unit.scores || {};
                    const activityData = scores[activityKey];
                    if (activityData) {
                        total++;
                        if (activityData.completed || activityData.score > 0) {
                            completed++;
                        }
                    }
                });
            });
            
            completion[activityLabel] = total > 0 ? Math.round((completed / total) * 100) : 0;
        });
        
        console.log('Activity Completion Data:', completion);
        return completion;
    },

    calculateGradeProgress() {
        const filteredData = this.getDashboardFilteredData();
        const gradeCounts = {};
        filteredData.forEach(student => {
            const grade = student.studentProfile?.grade || student.grade || 'Unknown';
            gradeCounts[grade] = (gradeCounts[grade] || 0) + 1;
        });
        return gradeCounts;
    },

    calculateCoinDistribution() {
        const filteredData = this.getDashboardFilteredData();
        const ranges = [
            { label: '0-100', min: 0, max: 100 },
            { label: '101-500', min: 101, max: 500 },
            { label: '501-1000', min: 501, max: 1000 },
            { label: '1001-5000', min: 1001, max: 5000 },
            { label: '5000+', min: 5001, max: Infinity }
        ];
        
        const distribution = ranges.map(range => {
            return filteredData.filter(student => {
                const coins = student.coinData?.balance || student.coins || 0;
                return coins >= range.min && coins <= range.max;
            }).length;
        });
        
        return {
            labels: ranges.map(r => r.label),
            data: distribution
        };
    },

    calculateActivityUsage() {
        const filteredData = this.getDashboardFilteredData();
        const activityLabels = {
            matching: 'Matching',
            flashcards: 'Flashcards',
            quiz: 'Quiz',
            hangman: 'Hangman',
            fillInBlank: 'Fill in Blank',
            wordSearch: 'Word Search',
            crossword: 'Crossword'
        };
        const usage = {};
        
        Object.values(activityLabels).forEach(label => {
            usage[label] = 0;
        });
        
        filteredData.forEach(student => {
            const units = student.units || {};
            Object.values(units).forEach(unit => {
                // Scores are stored in unit.scores[activityKey]
                const scores = unit.scores || {};
                Object.entries(activityLabels).forEach(([activityKey, activityLabel]) => {
                    const activityData = scores[activityKey];
                    if (activityData && (activityData.completed || activityData.score > 0)) {
                        usage[activityLabel] = (usage[activityLabel] || 0) + 1;
                    }
                });
            });
        });
        
        console.log('Activity Usage Data:', usage);
        return usage;
    },

    renderRecentActivity() {
        const filteredData = this.getDashboardFilteredData();
        const table = $('#recent-activity-table');
        if (!table) return;
        
        // Get recent vocabulary activity completions (not coin history)
        const recentActivities = [];
        const activityNames = {
            matching: 'Matching',
            flashcards: 'Flashcards',
            quiz: 'Quiz',
            hangman: 'Hangman',
            fillInBlank: 'Fill in Blank',
            wordSearch: 'Word Search',
            crossword: 'Crossword',
            scramble: 'Word Scramble',
            speedMatch: 'Speed Match',
            synonymAntonym: 'Synonym/Antonym',
            illustration: 'Image Hunt'
        };
        
        filteredData.forEach(student => {
            const profile = student.studentProfile || {};
            const studentName = profile.firstName && profile.lastName 
                ? `${profile.firstName} ${profile.lastName}` 
                : (profile.name || student.email || 'Unknown');
            
            const units = student.units || {};
            Object.entries(units).forEach(([unitId, unitData]) => {
                // Scores are stored in unitData.scores[activityKey]
                const scores = unitData.scores || {};
                Object.entries(activityNames).forEach(([activityKey, activityLabel]) => {
                    const activityData = scores[activityKey];
                    if (activityData && (activityData.completed || activityData.score > 0)) {
                        const timestamp = activityData.completedAt || activityData.lastAttempt || activityData.timestamp || student.updatedAt;
                        let date = null;
                        if (timestamp) {
                            // Handle Firestore timestamp or regular timestamp
                            if (timestamp.toDate) {
                                date = timestamp.toDate();
                            } else if (timestamp.toMillis) {
                                date = new Date(timestamp.toMillis());
                            } else if (typeof timestamp === 'number') {
                                date = new Date(timestamp);
                            } else {
                                date = new Date(timestamp);
                            }
                        }
                        
                        recentActivities.push({
                            student: studentName,
                            unit: unitId.replace(/_/g, ' '),
                            activity: activityLabel,
                            score: activityData.score !== undefined ? `${activityData.score}%` : (activityData.completed ? '✓' : '-'),
                            date: date,
                            dateStr: date && !isNaN(date) ? date.toLocaleDateString() : '-'
                        });
                    }
                });
            });
        });
        
        // Sort by date (most recent first)
        recentActivities.sort((a, b) => {
            if (!a.date) return 1;
            if (!b.date) return -1;
            return b.date - a.date;
        });
        recentActivities.splice(30); // Keep only 30 most recent
        
        if (recentActivities.length === 0) {
            table.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 2rem;">No vocabulary activity completed yet</p>';
            return;
        }
        
        table.innerHTML = `
            <table style="width: 100%; border-collapse: collapse;">
                <thead>
                    <tr style="border-bottom: 1px solid var(--border-color);">
                        <th style="padding: 0.75rem; text-align: left; color: var(--text-muted);">Student</th>
                        <th style="padding: 0.75rem; text-align: left; color: var(--text-muted);">Vocabulary</th>
                        <th style="padding: 0.75rem; text-align: left; color: var(--text-muted);">Activity</th>
                        <th style="padding: 0.75rem; text-align: right; color: var(--text-muted);">Score</th>
                        <th style="padding: 0.75rem; text-align: right; color: var(--text-muted);">Date</th>
                    </tr>
                </thead>
                <tbody>
                    ${recentActivities.map(activity => `
                        <tr style="border-bottom: 1px solid rgba(255, 255, 255, 0.05);">
                            <td style="padding: 0.75rem;">${activity.student}</td>
                            <td style="padding: 0.75rem; color: var(--text-muted); font-size: 0.9rem;">${activity.unit}</td>
                            <td style="padding: 0.75rem;">${activity.activity}</td>
                            <td style="padding: 0.75rem; text-align: right; color: var(--primary-color);">${activity.score}</td>
                            <td style="padding: 0.75rem; text-align: right; color: var(--text-muted);">${activity.dateStr}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    },

    async loadJSONFile(file) {
        // Hide previous errors
        const errorDiv = $('#file-error');
        if (errorDiv) errorDiv.style.display = 'none';

        // Show loading
        notifications.info('Loading file...');

        try {
            const text = await file.text();
            const data = JSON.parse(text);

            // Validate structure
            this.validateJSONStructure(data);

            // Store loaded data
            this.loadedData = this.processLoadedData(data);

            // Show file info
            this.showFileInfo(file);

            // Render summary and tables
            this.renderViewerSummary();
            this.renderViewerTables();

            notifications.success('File loaded successfully!');
        } catch (error) {
            console.error('Error loading JSON file:', error);
            this.showFileError(error.message || 'Failed to load file. Please check the file format.');
            notifications.error('Failed to load file. Please check the file format.');
        }
    },

    validateJSONStructure(data) {
        if (!data) {
            throw new Error('File is empty or invalid JSON');
        }

        if (!data.studentProgress && !data.scores && !data.userRoles) {
            throw new Error('Invalid export format: file must contain studentProgress, scores, or userRoles');
        }

        if (data.studentProgress && !Array.isArray(data.studentProgress)) {
            throw new Error('Invalid format: studentProgress must be an array');
        }

        if (data.scores && !Array.isArray(data.scores)) {
            throw new Error('Invalid format: scores must be an array');
        }
    },

    processLoadedData(data) {
        return {
            students: data.studentProgress || [],
            scores: data.scores || [],
            roles: data.userRoles || [],
            metadata: data.metadata || {},
            summary: this.calculateViewerSummary(data)
        };
    },

    calculateViewerSummary(data) {
        const students = data.studentProgress || [];
        let totalVocabUnits = 0;
        let totalCoins = 0;
        let dateRange = { start: null, end: null };

        students.forEach(student => {
            if (student.units) {
                totalVocabUnits += Object.keys(student.units).length;
            }
            if (student.coinData) {
                totalCoins += student.coinData.balance || 0;
            }
            if (student.updatedAt) {
                const date = student.updatedAt.toDate ? student.updatedAt.toDate() : new Date(student.updatedAt.seconds * 1000);
                if (!dateRange.start || date < dateRange.start) {
                    dateRange.start = date;
                }
                if (!dateRange.end || date > dateRange.end) {
                    dateRange.end = date;
                }
            }
        });

        return {
            totalStudents: students.length,
            totalProgressRecords: students.length,
            totalVocabUnits,
            totalCoins,
            totalScores: (data.scores || []).length,
            dateRange
        };
    },

    showFileInfo(file) {
        const fileInfo = $('#file-info');
        const fileName = $('#file-name');
        const fileSize = $('#file-size');

        if (fileInfo && fileName && fileSize) {
            fileName.textContent = file.name;
            fileSize.textContent = `Size: ${(file.size / 1024).toFixed(2)} KB`;
            fileInfo.style.display = 'block';
        }
    },

    showFileError(message) {
        const errorDiv = $('#file-error');
        const errorMessage = $('#error-message');

        if (errorDiv && errorMessage) {
            errorMessage.textContent = message;
            errorDiv.style.display = 'block';
        }
    },

    clearLoadedData() {
        this.loadedData = null;
        const fileInput = $('#load-json-file');
        if (fileInput) fileInput.value = '';

        $('#file-info').style.display = 'none';
        $('#file-error').style.display = 'none';
        $('#viewer-summary').style.display = 'none';
        $('#viewer-tables').style.display = 'none';
    },

    renderViewerSummary() {
        if (!this.loadedData) return;

        const summary = this.loadedData.summary;
        const dateRange = summary.dateRange;
        const dateStr = dateRange.start && dateRange.end
            ? `${dateRange.start.toLocaleDateString()} to ${dateRange.end.toLocaleDateString()}`
            : 'N/A';

        const summaryEl = $('#viewer-summary-stats');
        if (!summaryEl) return;

        summaryEl.innerHTML = `
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1rem; padding: 1rem; background: rgba(15, 23, 42, 0.4); border-radius: 8px; border: 1px solid var(--border-color, rgba(255, 255, 255, 0.125));">
                <div>
                    <div style="font-size: 0.8rem; color: var(--text-muted, #cbd5f5);">Total Students</div>
                    <div style="font-size: 1.5rem; font-weight: 600; color: var(--text-main, #f8fafc);">${summary.totalStudents}</div>
                </div>
                ${summary.totalProgressRecords > 0 ? `
                <div>
                    <div style="font-size: 0.8rem; color: var(--text-muted, #cbd5f5);">Progress Records</div>
                    <div style="font-size: 1.5rem; font-weight: 600; color: var(--text-main, #f8fafc);">${summary.totalProgressRecords}</div>
                </div>
                ${summary.totalVocabUnits > 0 ? `
                <div>
                    <div style="font-size: 0.8rem; color: var(--text-muted, #cbd5f5);">Vocabulary Units</div>
                    <div style="font-size: 1.5rem; font-weight: 600; color: var(--text-main, #f8fafc);">${summary.totalVocabUnits}</div>
                </div>
                ` : ''}
                <div>
                    <div style="font-size: 0.8rem; color: var(--text-muted, #cbd5f5);">Total Coins</div>
                    <div style="font-size: 1.5rem; font-weight: 600; color: var(--text-main, #f8fafc);">${summary.totalCoins.toLocaleString()}</div>
                </div>
                ` : ''}
                ${summary.totalScores > 0 ? `
                <div>
                    <div style="font-size: 0.8rem; color: var(--text-muted, #cbd5f5);">Game Scores</div>
                    <div style="font-size: 1.5rem; font-weight: 600; color: var(--text-main, #f8fafc);">${summary.totalScores}</div>
                </div>
                ` : ''}
                <div>
                    <div style="font-size: 0.8rem; color: var(--text-muted, #cbd5f5);">Date Range</div>
                    <div style="font-size: 0.9rem; font-weight: 600; color: var(--text-main, #f8fafc);">${dateStr}</div>
                </div>
            </div>
        `;

        $('#viewer-summary').style.display = 'block';
    },

    renderViewerTables() {
        if (!this.loadedData || !this.loadedData.students.length) return;

        const tablesContent = $('#viewer-tables-content');
        if (!tablesContent) return;

        let html = '';

        // Student Progress Table
        if (this.loadedData.students.length > 0) {
            html += `
                <h5 style="margin: 0 0 1rem 0; font-size: 1.1rem; font-weight: 600; color: var(--text-main, #f8fafc);">Student Progress (${this.loadedData.students.length} records)</h5>
                <table style="width: 100%; border-collapse: collapse; margin-bottom: 1.5rem;">
                    <thead>
                        <tr style="border-bottom: 2px solid var(--border-color, rgba(255, 255, 255, 0.125));">
                            <th style="padding: 0.75rem; text-align: left; color: var(--text-main, #f8fafc);">Student ID</th>
                            <th style="padding: 0.75rem; text-align: left; color: var(--text-main, #f8fafc);">Name</th>
                            <th style="padding: 0.75rem; text-align: left; color: var(--text-main, #f8fafc);">Grade</th>
                            <th style="padding: 0.75rem; text-align: right; color: var(--text-main, #f8fafc);">Coins</th>
                            <th style="padding: 0.75rem; text-align: left; color: var(--text-main, #f8fafc);">Vocab Units</th>
                            <th style="padding: 0.75rem; text-align: left; color: var(--text-main, #f8fafc);">Last Active</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${this.loadedData.students.map(item => {
                            const profile = item.studentProfile || {};
                            const name = profile.firstName && profile.lastName
                                ? `${profile.firstName} ${profile.lastName}`
                                : (profile.name || 'Unknown');
                            const coins = (item.coinData || {}).balance || 0;
                            const vocabUnits = item.units ? Object.keys(item.units).length : 0;
                            const lastActive = item.updatedAt
                                ? (item.updatedAt.toDate ? item.updatedAt.toDate() : new Date(item.updatedAt.seconds * 1000)).toLocaleDateString()
                                : '-';
                            return `
                                <tr style="border-bottom: 1px solid var(--border-color, rgba(255, 255, 255, 0.125));">
                                    <td style="padding: 0.75rem; color: var(--text-main, #f8fafc);">${item.studentId}</td>
                                    <td style="padding: 0.75rem; color: var(--text-main, #f8fafc);">${name}</td>
                                    <td style="padding: 0.75rem; color: var(--text-main, #f8fafc);">${profile.grade || '-'}</td>
                                    <td style="padding: 0.75rem; text-align: right; color: var(--text-main, #f8fafc);">${coins}</td>
                                    <td style="padding: 0.75rem; color: var(--text-main, #f8fafc);">${vocabUnits}</td>
                                    <td style="padding: 0.75rem; color: var(--text-main, #f8fafc);">${lastActive}</td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            `;
        }

        // Game Scores Table
        if (this.loadedData.scores.length > 0) {
            html += `
                <h5 style="margin: 1.5rem 0 1rem 0; font-size: 1.1rem; font-weight: 600; color: var(--text-main, #f8fafc);">Game Scores (${this.loadedData.scores.length} records)</h5>
                <table style="width: 100%; border-collapse: collapse;">
                    <thead>
                        <tr style="border-bottom: 2px solid var(--border-color, rgba(255, 255, 255, 0.125));">
                            <th style="padding: 0.75rem; text-align: left; color: var(--text-main, #f8fafc);">Student</th>
                            <th style="padding: 0.75rem; text-align: left; color: var(--text-main, #f8fafc);">Game</th>
                            <th style="padding: 0.75rem; text-align: right; color: var(--text-main, #f8fafc);">Score</th>
                            <th style="padding: 0.75rem; text-align: left; color: var(--text-main, #f8fafc);">Date</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${this.loadedData.scores.slice(0, 50).map(item => {
                            const date = item.timestamp
                                ? (item.timestamp.toDate ? item.timestamp.toDate() : new Date(item.timestamp.seconds * 1000)).toLocaleDateString()
                                : '-';
                            return `
                                <tr style="border-bottom: 1px solid var(--border-color, rgba(255, 255, 255, 0.125));">
                                    <td style="padding: 0.75rem; color: var(--text-main, #f8fafc);">${item.name || item.userId}</td>
                                    <td style="padding: 0.75rem; color: var(--text-main, #f8fafc);">${item.gameId || '-'}</td>
                                    <td style="padding: 0.75rem; text-align: right; color: var(--text-main, #f8fafc);">${(item.score || 0).toLocaleString()}</td>
                                    <td style="padding: 0.75rem; color: var(--text-main, #f8fafc);">${date}</td>
                                </tr>
                            `;
                        }).join('')}
                        ${this.loadedData.scores.length > 50 ? `
                            <tr>
                                <td colspan="4" style="padding: 0.75rem; text-align: center; color: var(--text-muted, #cbd5f5);">
                                    ... and ${this.loadedData.scores.length - 50} more records
                                </td>
                            </tr>
                        ` : ''}
                    </tbody>
                </table>
            `;
        }

        tablesContent.innerHTML = html || '<p style="color: var(--text-muted, #cbd5f5);">No data to display.</p>';
        $('#viewer-tables').style.display = 'block';
    }
});

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startTeacherApp);
} else {
    startTeacherApp();
}

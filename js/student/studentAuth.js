/**
 * Student Authentication Module
 * Handles Firebase authentication, user profile, and auth state
 */

import { $ } from '../main.js';
import { notifications } from '../notifications.js';
import { firebaseAuthService, doc, getDoc } from '../firebaseService.js';

export class StudentAuth {
    constructor(studentManager) {
        this.sm = studentManager; // Reference to StudentManager instance
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
            this.sm.showLoginError('Authentication service unavailable. Continue as guest.');
            this.sm.setManualSaveVisibility(true);
        }
    }

    async handleFirebaseSignIn(user) {
        this.sm.currentUser = user;
        localStorage.setItem('was_logged_in', 'true');
        
        // Update UI immediately (works offline)
        this.sm.setAuthStatus('🔐 Signed in');
        this.sm.updateGuestStatus(false);

        const name = user.displayName || user.email || 'Signed in';
        const avatar = $('#google-user-avatar');
        if (avatar) {
            avatar.src = user.photoURL || '';
        }
        const nameEl = $('#google-user-name');
        if (nameEl) {
            nameEl.textContent = name;
        }

        // Try to fetch role and progress (may fail offline)
        try {
            await this.fetchAndSetRole(user);
        } catch (error) {
            console.error('Failed to fetch role (may be offline):', error);
            // Use cached role if available
            const cachedRole = localStorage.getItem(`userRole_${user.uid}`);
            if (cachedRole) {
                this.sm.currentRole = cachedRole;
            } else {
                this.sm.currentRole = 'student'; // Default
            }
            this.sm.setAuthStatus('🔐 Signed in (Offline)');
        }

        // Try to load cloud progress (may fail offline)
        try {
            await this.sm.progress.loadCloudProgress();
        } catch (error) {
            console.error('Failed to load cloud progress (may be offline):', error);
            // Use local progress instead
            this.sm.progress.loadLocalProgress();
            this.sm.setAuthStatus('🔐 Signed in (Offline - Using local data)');
        }

        this.sm.updateHeader();
        this.sm.renderDashboard();
        this.sm.switchView('main-menu-view');
        const requiresProfile = !(
            this.sm.studentProfile.firstName &&
            this.sm.studentProfile.lastName &&
            this.sm.studentProfile.grade &&
            this.sm.studentProfile.group
        );

        if (requiresProfile) {
            this.sm.checkProfile(true);
        }
    }

    handleFirebaseSignOut() {
        this.sm.currentUser = null;
        localStorage.removeItem('was_logged_in');
        if (this.sm.cloudSaveTimeout) {
            clearTimeout(this.sm.cloudSaveTimeout);
            this.sm.cloudSaveTimeout = null;
        }
        this.sm.updateGuestStatus(true);
        this.sm.setAuthStatus('Guest mode (local only)');
        this.sm.switchView('main-menu-view');
    }

    async fetchAndSetRole(user) {
        try {
            const db = firebaseAuthService.getFirestore();
            const roleDoc = await getDoc(doc(db, 'userRoles', user.uid));
            if (roleDoc.exists()) {
                this.sm.currentRole = roleDoc.data().role || 'student';
                // Cache role for offline use
                localStorage.setItem(`userRole_${user.uid}`, this.sm.currentRole);
            } else {
                this.sm.currentRole = 'student';
                localStorage.setItem(`userRole_${user.uid}`, 'student');
            }
        } catch (error) {
            console.error('Error fetching role:', error);
            // Try to use cached role if available
            const cachedRole = localStorage.getItem(`userRole_${user.uid}`);
            if (cachedRole) {
                this.sm.currentRole = cachedRole;
            } else {
                this.sm.currentRole = 'student';
            }
            // Re-throw to let caller know we're offline
            throw error;
        }
        return this.sm.currentRole;
    }

    updateHeader() {
        const headerTitle = $('.header-left h1');
        const fullName = this.sm.studentProfile.firstName && this.sm.studentProfile.lastName
            ? `${this.sm.studentProfile.firstName} ${this.sm.studentProfile.lastName}`
            : this.sm.studentProfile.name || 'Student';
        headerTitle.textContent = `Welcome, ${fullName}`;

        const editButton = $('#edit-profile-btn');
        if (editButton) {
            editButton.style.display = 'inline-flex';
        }
    }

    checkProfile(force = false) {
        const isComplete = Boolean(
            this.sm.studentProfile.firstName &&
            this.sm.studentProfile.lastName &&
            this.sm.studentProfile.grade &&
            this.sm.studentProfile.group
        );

        if (isComplete && !force) {
            return;
        }

        const modal = $('#profile-modal');

        if (this.sm.studentProfile.firstName) {
            $('#student-firstname').value = this.sm.studentProfile.firstName;
            $('#student-lastname').value = this.sm.studentProfile.lastName || '';
            $('#student-grade').value = this.sm.studentProfile.grade;
            $('#student-group').value = this.sm.studentProfile.group;
        } else if (this.sm.studentProfile.name) {
            const nameParts = this.sm.studentProfile.name.split(' ');
            $('#student-firstname').value = nameParts[0] || '';
            $('#student-lastname').value = nameParts.slice(1).join(' ') || '';
            $('#student-grade').value = this.sm.studentProfile.grade;
            $('#student-group').value = this.sm.studentProfile.group;
        } else {
            $('#student-firstname').value = '';
            $('#student-lastname').value = '';
            $('#student-grade').value = '';
            $('#student-group').value = '';
        }

        modal.classList.remove('hidden');
    }

    setAuthStatus(text) {
        const statusEl = $('#auth-status');
        if (statusEl) {
            statusEl.textContent = text;
        }
    }

    updateGuestStatus(isGuest) {
        const guestStatus = $('#guest-status');
        const googleUserInfo = $('#google-user-info');
        if (guestStatus) guestStatus.style.display = isGuest ? 'flex' : 'none';
        if (googleUserInfo) googleUserInfo.style.display = isGuest ? 'none' : 'flex';
    }

    showLoginError(message) {
        const errorEl = $('#login-error');
        if (errorEl) {
            errorEl.textContent = message;
            errorEl.style.display = 'block';
            setTimeout(() => {
                errorEl.style.display = 'none';
            }, 5000);
        }
    }
}


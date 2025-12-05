import { FIREBASE_CONFIG } from '../config/firebase-config.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import {
    getAuth,
    GoogleAuthProvider,
    signInWithPopup,
    signInWithRedirect,
    getRedirectResult,
    signOut as firebaseSignOut,
    onAuthStateChanged as firebaseOnAuthStateChanged,
    sendSignInLinkToEmail,
    isSignInWithEmailLink,
    signInWithEmailLink
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import {
    getFirestore,
    doc,
    setDoc,
    addDoc,
    getDoc,
    getDocs,
    deleteDoc,
    collection,
    query,
    where,
    orderBy,
    limit,
    serverTimestamp,
    writeBatch
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

class FirebaseAuthService {
    constructor() {
        this.app = null;
        this.auth = null;
        this.provider = null;
        this.db = null;
        this.initPromise = null;
    }

    // Get current user
    getCurrentUser() {
        return this.auth?.currentUser || null;
    }

    async init() {
        if (this.auth) return this.auth;
        if (this.initPromise) return this.initPromise;

        this.initPromise = new Promise((resolve, reject) => {
            try {
                this.validateConfig();
                if (!this.app) {
                    this.app = initializeApp(FIREBASE_CONFIG);
                }
                this.auth = getAuth(this.app);
                this.provider = new GoogleAuthProvider();
                this.db = getFirestore(this.app);
                resolve(this.auth);
            } catch (error) {
                console.error('Firebase initialization failed:', error);
                reject(error);
            }
        });

        return this.initPromise;
    }

    validateConfig() {
        if (!FIREBASE_CONFIG || !FIREBASE_CONFIG.apiKey || FIREBASE_CONFIG.apiKey.includes('YOUR_FIREBASE_API_KEY')) {
            throw new Error('Firebase configuration is missing or still contains placeholder values.');
        }
    }

    async ensureInitialized() {
        if (this.auth) return this.auth;
        return this.init();
    }

    getFirestore() {
        if (!this.db) {
            throw new Error('Firestore not initialized');
        }
        return this.db;
    }

    isCursorBrowser() {
        // Detect Cursor browser or other browsers that might block popups
        const userAgent = navigator.userAgent.toLowerCase();
        const isCursor = userAgent.includes('cursor') || 
                        userAgent.includes('electron') ||
                        window.navigator.standalone === true; // iOS standalone mode
        
        console.log('Browser detection:', {
            userAgent,
            isCursor,
            isElectron: userAgent.includes('electron')
        });
        
        return isCursor;
    }

    async signInWithGoogle() {
        console.log('=== signInWithGoogle called ===');
        await this.ensureInitialized();
        console.log('Firebase initialized, auth object:', this.auth);
        console.log('Provider:', this.provider);
        
        // Check if we should use redirect (but NOT for Electron - redirect doesn't work well in Electron)
        const isCursor = this.isCursorBrowser();
        const forceRedirect = localStorage.getItem('forceRedirectAuth') === 'true';
        // Don't use redirect for Electron - use popup instead
        const useRedirect = forceRedirect && !isCursor;
        
        console.log('Auth mode decision:', {
            isCursor,
            forceRedirect,
            useRedirect,
            note: isCursor ? 'Using popup for Electron browser' : 'Using normal flow'
        });
        
        // For Electron/Cursor, popups don't work - show message to use regular browser
        if (isCursor) {
            console.log('Electron detected - popups not supported');
            throw new Error('ELECTRON_NO_POPUP');
        }
        
        // For non-Electron browsers, use redirect if forced, otherwise try popup
        if (useRedirect) {
            console.log('Using redirect mode for sign-in...');
            try {
                console.log('Calling signInWithRedirect...');
                await signInWithRedirect(this.auth, this.provider);
                console.log('✅ signInWithRedirect completed - page should redirect now');
                // Return a promise that never resolves (page will redirect)
                return new Promise(() => {});
            } catch (error) {
                console.error('❌ Redirect sign-in error:', error);
                console.error('Error code:', error?.code);
                console.error('Error message:', error?.message);
                
                // If redirect fails, try popup as fallback
                console.log('Attempting popup as fallback...');
                try {
                    return await signInWithPopup(this.auth, this.provider);
                } catch (popupError) {
                    console.error('Popup fallback also failed:', popupError);
                    throw error; // Throw original redirect error
                }
            }
        }
        
        // Try popup first for other browsers, fallback to redirect if popup is blocked
        console.log('Trying popup mode first...');
        try {
            console.log('Calling signInWithPopup...');
            const result = await signInWithPopup(this.auth, this.provider);
            console.log('✅ Popup sign-in successful');
            return result;
        } catch (error) {
            console.error('❌ Popup sign-in error:', error);
            console.error('Error code:', error.code);
            console.error('Error message:', error.message);
            
            // If popup is blocked or fails, use redirect instead
            if (error.code === 'auth/popup-blocked' || 
                error.code === 'auth/popup-closed-by-user' || 
                error.code === 'auth/cancelled-popup-request' ||
                error.code === 'auth/operation-not-allowed') {
                console.log('Popup blocked or not allowed, using redirect instead...');
                try {
                    console.log('Calling signInWithRedirect as fallback...');
                    await signInWithRedirect(this.auth, this.provider);
                    console.log('✅ Redirect initiated after popup failure');
                    // Return a promise that never resolves (page will redirect)
                    return new Promise(() => {});
                } catch (redirectError) {
                    console.error('❌ Redirect also failed:', redirectError);
                    throw redirectError;
                }
            }
            throw error;
        }
    }

    async getManualAuthUrl() {
        try {
            await this.ensureInitialized();
            // Get the OAuth URL that would be used for redirect
            const authDomain = this.auth.config.authDomain;
            const apiKey = FIREBASE_CONFIG.apiKey;
            const continueUrl = encodeURIComponent(window.location.href);
            const oauthUrl = `https://${authDomain}/__/auth/handler?apiKey=${apiKey}&authType=signInWithRedirect&providerId=google.com&continueUrl=${continueUrl}`;
            console.log('Manual OAuth URL generated:', oauthUrl);
            return oauthUrl;
        } catch (error) {
            console.error('Error generating manual auth URL:', error);
            return null;
        }
    }

    async handleRedirectResult() {
        await this.ensureInitialized();
        try {
            console.log('Checking for redirect result...');
            const result = await getRedirectResult(this.auth);
            if (result) {
                console.log('Redirect sign-in successful:', result.user.email);
                console.log('User:', result.user);
            } else {
                console.log('No redirect result found');
            }
            return result;
        } catch (error) {
            console.error('Error handling redirect result:', error);
            console.error('Error code:', error.code);
            console.error('Error message:', error.message);
            // Don't throw - just return null so auth state listener can handle it
            return null;
        }
    }

    // ========== EMAIL LINK AUTHENTICATION (Passwordless) ==========
    
    /**
     * Send a sign-in link to the user's email address.
     * The user clicks the link to authenticate - no password needed, no popups.
     * @param {string} email - The user's email address
     * @returns {Promise<void>}
     */
    async sendEmailSignInLink(email) {
        await this.ensureInitialized();
        
        const actionCodeSettings = {
            // URL to redirect to after the user clicks the email link.
            // Must be whitelisted in Firebase Console > Authentication > Settings > Authorized domains
            url: window.location.origin + '/teacher.html',
            handleCodeInApp: true,
        };
        
        try {
            await sendSignInLinkToEmail(this.auth, email, actionCodeSettings);
            // Save the email locally to complete sign-in on the same device
            window.localStorage.setItem('emailForSignIn', email);
            console.log('Email sign-in link sent to:', email);
            return { success: true };
        } catch (error) {
            console.error('Error sending email sign-in link:', error);
            throw error;
        }
    }
    
    /**
     * Check if the current URL is a sign-in email link
     * @returns {boolean}
     */
    isEmailSignInLink() {
        if (!this.auth) return false;
        return isSignInWithEmailLink(this.auth, window.location.href);
    }
    
    /**
     * Complete the email link sign-in process.
     * Call this when the page loads if isEmailSignInLink() returns true.
     * @param {string} [email] - Optional email if not stored locally
     * @returns {Promise<UserCredential>}
     */
    async completeEmailSignIn(email) {
        await this.ensureInitialized();
        
        if (!isSignInWithEmailLink(this.auth, window.location.href)) {
            throw new Error('This is not a valid email sign-in link');
        }
        
        // Get email from localStorage or use provided email
        let emailToUse = email || window.localStorage.getItem('emailForSignIn');
        
        if (!emailToUse) {
            // If email is not available, prompt the user
            // This can happen if the user opens the link on a different device
            throw new Error('EMAIL_REQUIRED');
        }
        
        try {
            const result = await signInWithEmailLink(this.auth, emailToUse, window.location.href);
            // Clear the email from storage
            window.localStorage.removeItem('emailForSignIn');
            console.log('Email link sign-in successful:', result.user.email);
            
            // Clean up the URL by removing the sign-in parameters
            if (window.history && window.history.replaceState) {
                window.history.replaceState({}, document.title, window.location.pathname);
            }
            
            return result;
        } catch (error) {
            console.error('Error completing email sign-in:', error);
            throw error;
        }
    }

    async signOut() {
        if (!this.auth) return;
        await firebaseSignOut(this.auth);
    }

    onAuthStateChanged(callback) {
        this.ensureInitialized()
            .then(() => firebaseOnAuthStateChanged(this.auth, callback))
            .catch((error) => {
                console.error('Unable to attach auth state listener:', error);
                if (typeof callback === 'function') callback(null);
            });
    }
}

export const firebaseAuthService = new FirebaseAuthService();
export {
    doc,
    setDoc,
    addDoc,
    getDoc,
    getDocs,
    deleteDoc,
    collection,
    query,
    where,
    orderBy,
    limit,
    serverTimestamp,
    writeBatch
};

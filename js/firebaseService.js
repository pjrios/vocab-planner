import { FIREBASE_CONFIG } from '../config/firebase-config.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import {
    getAuth,
    GoogleAuthProvider,
    signInWithPopup,
    signOut as firebaseSignOut,
    onAuthStateChanged as firebaseOnAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import {
    getFirestore,
    doc,
    setDoc,
    addDoc,
    getDoc,
    getDocs,
    collection,
    query,
    where,
    orderBy,
    limit,
    serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

class FirebaseAuthService {
    constructor() {
        this.app = null;
        this.auth = null;
        this.provider = null;
        this.db = null;
        this.initPromise = null;
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

    async signInWithGoogle() {
        await this.ensureInitialized();
        return signInWithPopup(this.auth, this.provider);
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
    collection,
    query,
    where,
    orderBy,
    limit,
    serverTimestamp
};

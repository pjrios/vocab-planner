import { GOOGLE_CONFIG } from '../config/google-config.js';
import { notifications } from './notifications.js';

class GoogleDriveService {
    constructor() {
        this.isInitialized = false;
        this.isSignedIn = false;
        this.userProfile = null;
        this.gapiLoaded = false;
        this.tokenClient = null;
        this.accessToken = null;
    }

    async init() {
        if (this.isInitialized) return true;

        try {
            // Wait for gapi to load
            await this.loadGapi();

            // Initialize gapi client
            await gapi.client.init({
                discoveryDocs: GOOGLE_CONFIG.DISCOVERY_DOCS,
            });

            // Initialize Google Identity Services
            this.initTokenClient();

            this.isInitialized = true;
            return true;
        } catch (error) {
            console.error('Error initializing Google Drive service:', error);
            notifications.error('Google Drive initialization failed. Please check your connection.');
            return false;
        }
    }

    loadGapi() {
        return new Promise((resolve, reject) => {
            if (typeof gapi !== 'undefined') {
                gapi.load('client', () => {
                    this.gapiLoaded = true;
                    resolve();
                });
            } else {
                reject(new Error('Google API not loaded'));
            }
        });
    }

    initTokenClient() {
        if (!GOOGLE_CONFIG.CLIENT_ID || GOOGLE_CONFIG.CLIENT_ID.includes('YOUR_CLIENT_ID')) {
            console.error('CRITICAL: Invalid Client ID in config!');
            notifications.error('Configuration Error: Please set a valid Client ID in config/google-config.js');
            return;
        }

        try {
            this.tokenClient = google.accounts.oauth2.initTokenClient({
                client_id: GOOGLE_CONFIG.CLIENT_ID,
                scope: GOOGLE_CONFIG.SCOPES,
                callback: (response) => {
                    if (response.error) {
                        console.error('Token error:', response);
                        notifications.error('Google authentication failed. Please try again.');
                        return;
                    }
                    this.accessToken = response.access_token;
                    this.isSignedIn = true;
                    this.loadUserProfile();

                    // Trigger sign-in event
                    window.dispatchEvent(new CustomEvent('googleSignInSuccess', {
                        detail: { profile: this.userProfile }
                    }));
                },
            });
        } catch (e) {
            console.error('Failed to init Token Client:', e);
            notifications.error('Failed to initialize Google authentication.');
        }
    }

    async signIn() {
        if (!this.isInitialized) {
            const success = await this.init();
            if (!success) {
                notifications.error('Google Drive initialization failed.');
                return;
            }
        }

        if (!this.tokenClient) {
            console.error('Token client is null');
            notifications.warning('Google authentication not ready. Please refresh the page.');
            return;
        }

        // Request access token
        try {
            this.tokenClient.requestAccessToken({ prompt: 'consent' });
        } catch (e) {
            console.error('Token request failed:', e);
            notifications.error('Failed to authenticate with Google.');
        }
    }

    signOut() {
        if (this.accessToken) {
            google.accounts.oauth2.revoke(this.accessToken, () => {
                // Token revoked
            });
        }

        this.isSignedIn = false;
        this.accessToken = null;
        this.userProfile = null;

        window.dispatchEvent(new Event('googleSignOut'));
    }

    async loadUserProfile() {
        try {
            const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
                headers: { Authorization: `Bearer ${this.accessToken}` }
            });
            this.userProfile = await response.json();
        } catch (error) {
            console.error('Error loading user profile:', error);
        }
    }

    async saveProgress(progressData, images = []) {
        if (!this.isSignedIn) {
            throw new Error('Not signed in to Google');
        }

        try {
            // Save progress JSON
            await this.saveFile(
                GOOGLE_CONFIG.PROGRESS_FILE,
                JSON.stringify(progressData, null, 2),
                'application/json'
            );

            // Save images in parallel batches to avoid rate limits while being faster
            const BATCH_SIZE = 5;
            for (let i = 0; i < images.length; i += BATCH_SIZE) {
                const batch = images.slice(i, i + BATCH_SIZE);
                await Promise.all(batch.map(({ vocabName, word, blob }) => {
                    const fileName = `${vocabName}_${word}.png`;
                    return this.saveImageFile(fileName, blob);
                }));
            }

            return true;
        } catch (error) {
            console.error('Error saving to Drive:', error);
            throw error;
        }
    }

    async loadProgress() {
        if (!this.isSignedIn) {
            throw new Error('Not signed in to Google');
        }

        try {
            // Load progress JSON
            const progressFile = await this.findFile(GOOGLE_CONFIG.PROGRESS_FILE);
            if (!progressFile) {
                return null;
            }

            const progressData = await this.downloadFile(progressFile.id);

            // Load images
            const imageFiles = await this.listFiles('name contains ".png"');
            const images = [];

            for (const file of imageFiles) {
                const blob = await this.downloadFileAsBlob(file.id);
                // Parse filename: "vocabName_word.png"
                const nameParts = file.name.replace('.png', '').split('_');
                if (nameParts.length >= 2) {
                    const word = nameParts.pop();
                    const vocabName = nameParts.join('_');
                    images.push({ vocabName, word, blob });
                }
            }

            return { progress: JSON.parse(progressData), images };
        } catch (error) {
            console.error('Error loading from Drive:', error);
            throw error;
        }
    }

    async saveFile(fileName, content, mimeType = 'application/json') {
        // Check if file exists
        const existingFile = await this.findFile(fileName);

        const metadata = {
            name: fileName,
            mimeType: mimeType,
            parents: ['appDataFolder']
        };

        const file = new Blob([content], { type: mimeType });
        const form = new FormData();
        form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
        form.append('file', file);

        const url = existingFile
            ? `https://www.googleapis.com/upload/drive/v3/files/${existingFile.id}?uploadType=multipart`
            : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';

        const response = await fetch(url, {
            method: existingFile ? 'PATCH' : 'POST',
            headers: {
                Authorization: `Bearer ${this.accessToken}`
            },
            body: form
        });

        return await response.json();
    }

    async saveImageFile(fileName, blob) {
        const existingFile = await this.findFile(fileName);

        const metadata = {
            name: fileName,
            mimeType: 'image/png',
            parents: ['appDataFolder']
        };

        const form = new FormData();
        form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
        form.append('file', blob);

        const url = existingFile
            ? `https://www.googleapis.com/upload/drive/v3/files/${existingFile.id}?uploadType=multipart`
            : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';

        const response = await fetch(url, {
            method: existingFile ? 'PATCH' : 'POST',
            headers: {
                Authorization: `Bearer ${this.accessToken}`
            },
            body: form
        });

        return await response.json();
    }

    async findFile(fileName) {
        const response = await gapi.client.drive.files.list({
            spaces: 'appDataFolder',
            q: `name='${fileName}'`,
            fields: 'files(id, name)',
            pageSize: 1
        });

        return response.result.files?.[0] || null;
    }

    async listFiles(query = '') {
        let files = [];
        let pageToken = null;

        do {
            const response = await gapi.client.drive.files.list({
                spaces: 'appDataFolder',
                q: query,
                fields: 'nextPageToken, files(id, name, mimeType)',
                pageSize: 100,
                pageToken: pageToken
            });

            const result = response.result;
            if (result.files) {
                files = files.concat(result.files);
            }
            pageToken = result.nextPageToken;
        } while (pageToken);

        return files;
    }

    async downloadFile(fileId) {
        const response = await fetch(
            `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
            {
                headers: { Authorization: `Bearer ${this.accessToken}` }
            }
        );

        return await response.text();
    }

    async downloadFileAsBlob(fileId) {
        const response = await fetch(
            `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
            {
                headers: { Authorization: `Bearer ${this.accessToken}` }
            }
        );

        return await response.blob();
    }

    getAuthStatus() {
        return {
            isSignedIn: this.isSignedIn,
            userProfile: this.userProfile
        };
    }
}

export const googleDriveService = new GoogleDriveService();

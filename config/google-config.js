// Google OAuth and Drive API Configuration
// 
// SETUP INSTRUCTIONS:
// 1. Go to https://console.cloud.google.com
// 2. Create a new project (or select existing)
// 3. Enable Google Drive API
// 4. Create OAuth 2.0 credentials (Web application)
// 5. Add authorized JavaScript origins:
//    - http://localhost:8000 (for local testing)
//    - https://yourusername.github.io (for GitHub Pages)
// 6. Replace CLIENT_ID below with your actual Client ID

export const GOOGLE_CONFIG = {
    // Replace this with your actual Client ID from Google Cloud Console
    CLIENT_ID: '895905792736-vig18vrt6rker1697vvohbll58u7vqnh.apps.googleusercontent.com',

    // Scopes: permissions we're requesting
    // - drive.appdata: Store app data in user's hidden app folder
    // - drive.file: Access files created by this app
    SCOPES: 'https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/drive.file',

    // Discovery doc for Drive API v3
    DISCOVERY_DOCS: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'],

    // App folder name (visible to user in Drive)
    APP_FOLDER_NAME: 'VocabularyLearningApp',

    // File names
    PROGRESS_FILE: 'vocab-progress.json',
    IMAGES_FOLDER: 'images'
};

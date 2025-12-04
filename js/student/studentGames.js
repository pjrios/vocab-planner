/**
 * Student Games & Arcade Module
 * Handles game lifecycle, leaderboards, timer management, and HTML game loading
 */

import { $ } from '../main.js';
import { notifications } from '../notifications.js';
import {
    firebaseAuthService,
    getDocs,
    collection,
    doc,
    getDoc,
    setDoc,
    serverTimestamp,
    query,
    where,
    orderBy,
    limit
} from '../firebaseService.js';

export class StudentGames {
    constructor(studentManager) {
        this.sm = studentManager; // Reference to StudentManager instance
    }

    formatTime(seconds) {
        if (!seconds) return '0s';
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        if (mins > 0) {
            return `${mins}m ${secs}s`;
        }
        return `${secs}s`;
    }

    updateArcadeUI() {
        // Use default settings if no vocab selected (or maybe fetch global settings later)
        // For now, fallback to defaults if accessed from Main Menu without a vocab context
        const settings = (this.sm.currentVocab && this.sm.currentVocab.activitySettings) ? this.sm.currentVocab.activitySettings : {};
        const exchangeRate = settings.exchangeRate !== undefined ? settings.exchangeRate : 10;

        const costEl = $('#galactic-breaker-cost');
        if (costEl) costEl.textContent = `${exchangeRate} Coins / min`;

        const addTimeBtn = $('#add-time-btn');
        if (addTimeBtn) addTimeBtn.textContent = `+1 Min (${exchangeRate} Coins)`;
    }

    updateGameSelectionUI() {
        const game = this.sm.gamesList[this.sm.currentGameIndex];
        const container = $('#current-game-card');
        if (!container) return;

        const settings = (this.sm.currentVocab && this.sm.currentVocab.activitySettings) ? this.sm.currentVocab.activitySettings : {};
        const exchangeRate = settings.exchangeRate !== undefined ? settings.exchangeRate : 10;

        container.innerHTML = `
            <div class="game-icon" style="font-size: 4rem; text-align: center; margin: 1rem 0;">${game.icon}</div>
            <h3 style="text-align: center;">${game.name}</h3>
            <p style="text-align: center; color: var(--text-muted);">${game.desc}</p>
            <div class="game-cost" style="text-align: center; margin: 1rem 0; font-weight: bold;">${exchangeRate} Coins / min</div>
            <button id="play-current-game-btn" class="btn primary-btn" style="width: 100%;">Play</button>
        `;

        // Re-attach the play button listener
        this.sm.addListener('#play-current-game-btn', 'click', () => {
            this.startGame(game.id);
        });
    }

    async saveHighScore(gameId, score, metadata = null) {
        // Games with leaderboards enabled
        const gamesWithLeaderboard = ['level-devil', 'radius-raid', 'packabunchas', 'spacepi'];
        
        // Only save scores for games with leaderboards enabled
        if (!gamesWithLeaderboard.includes(gameId)) {
            return; // This game doesn't have leaderboard support
        }
        if (!this.sm.currentUser) {
            return; // Only save if logged in
        }
        if (!this.sm.studentProfile.grade) {
            return; // Need grade for leaderboard
        }

        // Ensure score is a number
        const numericScore = typeof score === 'number' ? score : Number(score) || 0;
        if (numericScore <= 0 && gameId !== 'spacepi') {
            // Don't save zero or negative scores (except for SpacePi where lower can be better)
            return;
        }

        try {
            const db = firebaseAuthService.getFirestore();
            const scoresRef = collection(db, 'scores');

            // Use a deterministic document ID: userId-gameId
            // This ensures each player has only one entry per game
            const scoreDocId = `${this.sm.currentUser.uid}-${gameId}`;
            const scoreDocRef = doc(scoresRef, scoreDocId);

            // Check if we already have a score
            const existingDoc = await getDoc(scoreDocRef);

            // Only update if this is a new high score or first time playing
            // Note: SpacePi uses "lower is better" scoring, so invert the comparison
            const existingScore = existingDoc.exists() ? (Number(existingDoc.data().score) || 0) : 0;
            const isLowerBetter = gameId === 'spacepi';
            const isNewHighScore = isLowerBetter 
                ? (!existingDoc.exists() || numericScore < existingScore)
                : (!existingDoc.exists() || numericScore > existingScore);
            
            if (isNewHighScore) {
                const scoreData = {
                    userId: this.sm.currentUser.uid,
                    name: this.sm.studentProfile.name || 'Anonymous',
                    grade: this.sm.studentProfile.grade,
                    gameId: gameId,
                    score: numericScore, // Ensure we save as number
                    timestamp: serverTimestamp()
                };
                
                // Add metadata for Level Devil
                if (gameId === 'level-devil' && metadata) {
                    scoreData.metadata = {
                        level: metadata.level || 0,
                        deaths: metadata.deaths || 0,
                        time: metadata.time || 0
                    };
                }
                
                await setDoc(scoreDocRef, scoreData);
                console.log(`[Leaderboard] Saved score for ${gameId}: ${numericScore} (previous: ${existingScore})`);

                // Refresh leaderboard if we're viewing this game
                if (this.sm.gamesList && this.sm.gamesList[this.sm.currentGameIndex] && this.sm.gamesList[this.sm.currentGameIndex].id === gameId) {
                    this.loadLeaderboard(gameId);
                }
            } else {
                console.log(`[Leaderboard] Score not saved for ${gameId}: ${numericScore} is not better than ${existingScore} (isLowerBetter: ${isLowerBetter})`);
            }
        } catch (error) {
            console.error('Error saving score:', error);
            notifications.warning('Could not save your score to the leaderboard. Your progress is still saved locally.');
        }
    }

    updateLeaderboardGame() {
        const game = this.sm.gamesList[this.sm.currentGameIndex];
        const nameEl = $('#current-game-name');
        if (nameEl) nameEl.textContent = game.name;
        
        // Games with score reporting enabled should show leaderboard
        const gamesWithLeaderboard = ['level-devil', 'radius-raid', 'packabunchas', 'spacepi', 
                                      'black-hole-square', 'glitch-buster', 'callisto', 'js13k2021',
                                      'mystic-valley', 'slash-knight'];
        
        // Update leaderboard button visibility
        const leaderboardBtn = $('#show-leaderboard-btn');
        if (leaderboardBtn) {
            if (gamesWithLeaderboard.includes(game.id) || !this.sm.htmlGames.includes(game.id)) {
                leaderboardBtn.style.display = 'inline-block';
            } else {
                leaderboardBtn.style.display = 'none';
            }
        }
        
        // Load leaderboard data (will be shown when modal opens)
        if (gamesWithLeaderboard.includes(game.id) || !this.sm.htmlGames.includes(game.id)) {
            this.loadLeaderboard(game.id);
        }
    }
    
    showLeaderboardModal() {
        const modal = $('#leaderboard-modal');
        if (modal) {
            modal.classList.remove('hidden');
            // Reload leaderboard for current game
            const game = this.sm.gamesList[this.sm.currentGameIndex];
            if (game) {
                this.loadLeaderboard(game.id);
            }
        }
    }
    
    hideLeaderboardModal() {
        const modal = $('#leaderboard-modal');
        if (modal) {
            modal.classList.add('hidden');
        }
    }
    
    showGameSelection() {
        // Helper function to show game selection
        $('#game-stage').classList.add('hidden');
        $('#game-selection').classList.remove('hidden');
        // Update leaderboard button visibility
        this.updateLeaderboardGame();
    }

    async loadLeaderboard(gameId) {
        const container = $('#leaderboard-list');
        if (!container) return; // Modal might not be in DOM yet
        if (!container) return;

        // Only show if we have a grade to filter by
        if (!this.sm.studentProfile.grade) {
            container.innerHTML = '<p style="text-align: center; color: var(--text-muted);">Update your profile grade to see the leaderboard!</p>';
            return;
        }

        container.innerHTML = '<div class="loading-spinner">Loading scores...</div>';

        try {
            const db = firebaseAuthService.getFirestore();
            const scoresRef = collection(db, 'scores');

            // Query: Same grade, same game, order by score (desc for higher=better, asc for lower=better)
            // Note: This requires a composite index in Firestore. 
            // If it fails, check console for index creation link.
            // SpacePi uses "lower is better" scoring
            const isLowerBetter = gameId === 'spacepi';
            const q = query(
                scoresRef,
                where('grade', '==', this.sm.studentProfile.grade),
                where('gameId', '==', gameId),
                orderBy('score', isLowerBetter ? 'asc' : 'desc'),
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
                // Ensure score is a number for display
                const score = Number(data.score) || 0;
                const isMe = this.sm.currentUser && data.userId === this.sm.currentUser.uid;

                const row = document.createElement('div');
                row.className = `leaderboard-row ${isMe ? 'highlight' : ''}`;
                row.style.display = 'flex';
                row.style.flexDirection = 'column';
                row.style.padding = '0.75rem 1rem';
                row.style.background = isMe ? 'rgba(139, 92, 246, 0.1)' : 'var(--surface-color)';
                row.style.borderRadius = '8px';
                row.style.border = '1px solid var(--border-color)';
                row.style.marginBottom = '0.5rem';

                // For Level Devil, show metadata
                if (gameId === 'level-devil' && data.metadata) {
                    const meta = data.metadata;
                    row.innerHTML = `
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.25rem;">
                            <span style="font-weight: bold; width: 30px;">#${rank}</span>
                            <span style="flex-grow: 1; font-weight: 500;">${data.name}</span>
                            <span style="font-weight: bold; color: var(--primary-color); font-size: 0.9rem;">Score: ${score.toLocaleString()}</span>
                        </div>
                        <div style="display: flex; gap: 1rem; font-size: 0.85rem; color: var(--text-muted); margin-left: 30px;">
                            <span>Level: <strong>${meta.level || 0}</strong></span>
                            <span>Deaths: <strong>${meta.deaths || 0}</strong></span>
                            <span>Time: <strong>${this.formatTime(meta.time || 0)}</strong></span>
                        </div>
                    `;
                } else {
                    // Regular game display
                    row.style.flexDirection = 'row';
                    row.style.justifyContent = 'space-between';
                    row.innerHTML = `
                        <span style="font-weight: bold; width: 30px;">#${rank}</span>
                        <span style="flex-grow: 1;">${data.name}</span>
                        <span style="font-weight: bold; color: var(--primary-color);">${score.toLocaleString()}</span>
                    `;
                }

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
    async loadHTMLGame(gameId, htmlFile, scoreMessageType, gameOverCallback, canvas, gameStage) {
        // Hide canvas and create iframe for the HTML game
        canvas.style.display = 'none';
        
        // Remove existing iframe if any
        const existingIframe = gameStage.querySelector(`#${gameId}-iframe`);
        if (existingIframe) {
            existingIframe.remove();
        }
        
        // All games now have standalone HTML files, no build checks needed
        
        // Create iframe for the HTML game
        const iframe = document.createElement('iframe');
        iframe.id = `${gameId}-iframe`;
        iframe.src = htmlFile;
        
        // Style game-stage container to center content
        if (gameStage) {
            gameStage.style.display = 'flex';
            gameStage.style.flexDirection = 'column';
            gameStage.style.alignItems = 'center';
            gameStage.style.justifyContent = 'center';
            gameStage.style.width = '100%';
            gameStage.style.minWidth = '80%'; // Prevent container from becoming too narrow
        }
        
        // Games take the width they need and are centered
        // All games should take at least 80% of container width
        // SpacePi: 960x600 game area
        if (gameId === 'spacepi') {
            iframe.style.width = '960px';
            iframe.style.minWidth = '80%';
            iframe.style.maxWidth = '100%';
            iframe.style.height = '600px';
            iframe.style.display = 'block';
            iframe.style.overflow = 'auto';
        } else if (gameId === 'radius-raid') {
            // Radius Raid: 800x600 canvas + 10px padding each side = 820x620
            iframe.style.width = '820px';
            iframe.style.minWidth = '80%';
            iframe.style.maxWidth = '100%';
            iframe.style.height = '620px';
            iframe.style.display = 'block';
            iframe.style.overflow = 'auto';
        } else if (gameId === 'mystic-valley' || gameId === 'slash-knight') {
            // Full-screen Scratch/TurboWarp games - let them size themselves
            iframe.style.width = '100%';
            iframe.style.minWidth = '80%';
            iframe.style.height = '100%';
            iframe.style.minHeight = '600px';
            iframe.style.display = 'block';
            iframe.style.overflow = 'hidden';
        } else if (gameId === 'black-hole-square' || gameId === 'glitch-buster' || gameId === 'callisto' || gameId === 'js13k2021') {
            // Responsive games - let them size themselves but center them
            iframe.style.width = 'auto';
            iframe.style.minWidth = '80%';
            iframe.style.maxWidth = '100%';
            iframe.style.height = '600px';
            iframe.style.minHeight = '400px';
            iframe.style.display = 'block';
            iframe.style.overflow = 'auto';
        } else {
            // Default: let game size itself, centered
            iframe.style.width = 'auto';
            iframe.style.minWidth = '80%';
            iframe.style.maxWidth = '100%';
            iframe.style.height = '600px';
            iframe.style.display = 'block';
        }
        
        iframe.style.border = 'none';
        iframe.style.borderRadius = '8px';
        iframe.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1)';
        iframe.style.margin = '0 auto'; // Center the iframe
        
        // Insert iframe after the canvas
        canvas.parentNode.insertBefore(iframe, canvas.nextSibling);
        
        // Set up iframe onload handler for optimizations and score reporting
        const originalOnload = iframe.onload;
        iframe.onload = () => {
            try {
                const iframeWindow = iframe.contentWindow;
                const iframeDoc = iframe.contentDocument || iframeWindow.document;
                
                // Performance optimizations for TurboWarp games
                if (gameId === 'mystic-valley') {
                    // Try multiple times to catch the VM when it's ready
                    let attempts = 0;
                    const maxAttempts = 20; // Try for up to 4 seconds (20 * 200ms)
                    
                    const optimizePerformance = () => {
                        attempts++;
                        try {
                            let vm = null;
                            
                            // Try to find VM in various locations
                            if (iframeWindow.vm) {
                                vm = iframeWindow.vm;
                            } else if (iframeWindow.Scratch && iframeWindow.Scratch.vm) {
                                vm = iframeWindow.Scratch.vm;
                            } else if (iframeWindow.packager && iframeWindow.packager.vm) {
                                vm = iframeWindow.packager.vm;
                            }
                            
                            if (vm) {
                                // Don't enable turbo mode (game may not support it)
                                // Just increase framerate from 10 to 60 FPS for better performance
                                if (vm.setFramerate) {
                                    vm.setFramerate(30);
                                    console.log(`[${gameId}] Framerate set to 60 FPS`);
                                }
                                
                                // Enable interpolation for smoother animation
                                if (vm.setInterpolation) {
                                    vm.setInterpolation(true);
                                    console.log(`[${gameId}] Interpolation enabled`);
                                }
                                
                                return true; // Success
                            }
                        } catch (error) {
                            // Silently continue trying
                        }
                        
                        // Try again if we haven't exceeded max attempts
                        if (attempts < maxAttempts) {
                            setTimeout(optimizePerformance, 200);
                        } else {
                            console.warn(`[${gameId}] Could not optimize performance after ${maxAttempts} attempts`);
                        }
                        return false;
                    };
                    
                    // Start trying after a short delay
                    setTimeout(optimizePerformance, 500);
                }
                
                // Inject score reporting script (if scoreMessageType is provided)
                if (scoreMessageType) {
                    try {
                        const script = iframeDoc.createElement('script');
                        script.textContent = this.getScoreMonitoringScript(gameId, scoreMessageType);
                        iframeDoc.body.appendChild(script);
                    } catch (error) {
                        console.warn(`Could not inject score monitoring for ${gameId}:`, error);
                    }
                }
            } catch (error) {
                // Cross-origin restrictions may prevent access
                console.warn(`Could not access iframe content for ${gameId}:`, error);
            }
            
            // Call original onload if it exists
            if (originalOnload) {
                originalOnload();
            }
        };
        
        // Set up message listener for score reporting (if scoreMessageType is provided)
        let messageHandler = null;
        if (scoreMessageType) {
            messageHandler = (event) => {
                // Verify message is from our iframe (security check)
                if (event.data && event.data.type === scoreMessageType) {
                    // Ensure score is a number
                    const score = Number(event.data.score) || 0;
                    const isGameOver = event.data.gameOver || false;
                    
                    // Extract metadata for Level Devil
                    const metadata = {
                        level: event.data.level,
                        deaths: event.data.deaths,
                        time: event.data.time,
                        originalScore: event.data.originalScore
                    };
                    
                    // Update score display dynamically
                    const scoreDisplay = $('#game-score');
                    if (scoreDisplay) {
                        scoreDisplay.style.display = 'block';
                        // For Level Devil, show formatted info
                        if (gameId === 'level-devil' && metadata.level) {
                            scoreDisplay.textContent = `Level ${metadata.level} | Deaths: ${metadata.deaths} | Time: ${this.formatTime(metadata.time)}`;
                        } else {
                            scoreDisplay.textContent = `Score: ${score.toLocaleString()}`;
                        }
                    }
                    
                    // Store current score for final reporting (ensure it's a number)
                    const currentScore = Number(this.sm.currentGameScore) || 0;
                    this.sm.currentGameScore = Math.max(currentScore, score);
                    this.sm.currentGameMetadata = metadata; // Store metadata
                    
                    // Save score periodically (not just on game over) to ensure it's saved
                    // Compare as numbers to avoid string comparison issues
                    const lastSaved = Number(this.sm.lastSavedScore) || 0;
                    if (score > 0 && score !== lastSaved) {
                        this.sm.lastSavedScore = score;
                        console.log(`[Game] Saving score for ${gameId}: ${score} (previous saved: ${lastSaved})`);
                        this.saveHighScore(gameId, score, metadata).catch(err => {
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
        this.sm.currentGameScore = 0;
        this.sm.lastSavedScore = 0;
        this.sm.currentGameMetadata = null;
        
        // Store reference for cleanup
        this.sm.currentGame = {
            gameType: gameId,
            iframe: iframe,
            messageHandler: messageHandler,
            stop: () => {
                if (messageHandler) {
                    window.removeEventListener('message', messageHandler);
                }
                if (iframe && iframe.parentNode) {
                    iframe.remove();
                }
                canvas.style.display = 'block';
                canvas.style.margin = '0 auto'; // Center the canvas
            }
        };
    }

    /**
     * Generate score monitoring script for a specific game
     * @param {string} gameId - The game ID
     * @param {string} messageType - The postMessage type to use
     * @returns {string} JavaScript code to inject
     */
    getScoreMonitoringScript(gameId, messageType) {
        if (gameId === 'radius-raid') {
            return `
                (function() {
                    let lastScore = 0;
                    let lastState = '';
                    let checkInterval = setInterval(function() {
                        try {
                            // Radius Raid uses $.score and $.state
                            if (typeof $ !== 'undefined' && $.score !== undefined) {
                                const currentScore = $.score || 0;
                                const currentState = $.state || '';
                                
                                // Report score updates
                                if (currentScore !== lastScore) {
                                    lastScore = currentScore;
                                    window.parent.postMessage({
                                        type: '${messageType}',
                                        score: currentScore,
                                        gameOver: false
                                    }, '*');
                                }
                                
                                // Check for game over (state changes to 'gameover' or 'menu')
                                if (currentState === 'gameover' && lastState !== 'gameover') {
                                    // Final score is stored in $.storage['score']
                                    const finalScore = (typeof $.storage !== 'undefined' && $.storage['score']) 
                                        ? Math.max($.storage['score'], $.score) 
                                        : $.score;
                                    
                                    window.parent.postMessage({
                                        type: '${messageType}',
                                        score: finalScore || 0,
                                        gameOver: true
                                    }, '*');
                                    
                                    clearInterval(checkInterval);
                                }
                                
                                lastState = currentState;
                            }
                        } catch (e) {
                            console.warn('Score monitoring error:', e);
                        }
                    }, 500); // Check every 500ms
                    
                    // Cleanup on unload
                    window.addEventListener('beforeunload', function() {
                        clearInterval(checkInterval);
                    });
                })();
            `;
        } else if (gameId === 'spacepi') {
            return `
                (function() {
                    let lastScore = -1;
                    let lastLevel = -1;
                    let lastMenuMode = true;
                    let checkInterval = setInterval(function() {
                        try {
                            // SpacePi uses sp.levelStats.score and sp.level
                            // The game instance is stored as 'sp' in global scope
                            let game = null;
                            if (typeof sp !== 'undefined' && sp.levelStats) {
                                game = sp;
                            } else {
                                // Try to find it in window
                                for (let key in window) {
                                    if (window[key] && typeof window[key] === 'object' && window[key].levelStats) {
                                        game = window[key];
                                        break;
                                    }
                                }
                            }
                            
                            if (game && game.levelStats) {
                                const currentScore = Math.round(game.levelStats.score || 0);
                                const currentLevel = game.level !== undefined ? game.level : -1;
                                const currentMenuMode = game.menuMode !== undefined ? game.menuMode : true;
                                
                                // When level ends (menuMode changes from false to true), report final score
                                if (lastMenuMode === false && currentMenuMode === true && lastLevel >= 0) {
                                    // Level just ended - report the final score
                                    window.parent.postMessage({
                                        type: '${messageType}',
                                        score: lastScore > 0 ? lastScore : currentScore,
                                        level: lastLevel + 1,
                                        gameOver: false
                                    }, '*');
                                }
                                
                                // Report score updates during gameplay
                                if (currentScore !== lastScore && !currentMenuMode && game.levelPlaying) {
                                    lastScore = currentScore;
                                    window.parent.postMessage({
                                        type: '${messageType}',
                                        score: currentScore,
                                        level: currentLevel + 1,
                                        gameOver: false
                                    }, '*');
                                }
                                
                                // Track level changes
                                if (currentLevel !== lastLevel) {
                                    lastLevel = currentLevel;
                                }
                                
                                lastMenuMode = currentMenuMode;
                            }
                        } catch (e) {
                            console.warn('Score monitoring error:', e);
                        }
                    }, 500); // Check every 500ms for more responsive updates
                    
                    // Cleanup on unload
                    window.addEventListener('beforeunload', function() {
                        clearInterval(checkInterval);
                    });
                })();
            `;
        } else if (gameId === 'packabunchas') {
            return `
                (function() {
                    let lastScore = 0;
                    let checkInterval = setInterval(function() {
                        try {
                            // Packabunchas - need to find the score variable
                            // Check common patterns
                            let score = 0;
                            
                            // Try to access game object
                            if (typeof game !== 'undefined' && game.score !== undefined) {
                                score = game.score;
                            } else if (typeof Game !== 'undefined' && Game.score !== undefined) {
                                score = Game.score;
                            } else {
                                // Try to find score in global scope
                                for (let key in window) {
                                    if (window[key] && typeof window[key] === 'object' && window[key].score !== undefined) {
                                        score = window[key].score;
                                        break;
                                    }
                                }
                            }
                            
                            if (score !== lastScore) {
                                lastScore = score;
                                window.parent.postMessage({
                                    type: '${messageType}',
                                    score: score,
                                    gameOver: false
                                }, '*');
                            }
                        } catch (e) {
                            console.warn('Score monitoring error:', e);
                        }
                    }, 1000); // Check every second
                    
                    // Cleanup on unload
                    window.addEventListener('beforeunload', function() {
                        clearInterval(checkInterval);
                    });
                })();
            `;
        }
        
        return ''; // No script for unknown games
    }

    async startGame(type) {
        // Use default settings if no vocab selected (accessed from Main Menu)
        const settings = (this.sm.currentVocab && this.sm.currentVocab.activitySettings) ? this.sm.currentVocab.activitySettings : {};
        const exchangeRate = settings.exchangeRate !== undefined ? settings.exchangeRate : 10;

        if (this.sm.coins < exchangeRate) {
            notifications.warning(`You need at least ${exchangeRate} coins to play!`);
            return;
        }

        if (await this.sm.progress.deductCoins(exchangeRate)) {
            $('#game-selection').classList.add('hidden');
            const gameStage = $('#game-stage');
            gameStage.classList.remove('hidden');
            
            // Ensure game-stage is centered for all games
            gameStage.style.display = 'flex';
            gameStage.style.flexDirection = 'column';
            gameStage.style.alignItems = 'center';
            gameStage.style.justifyContent = 'center';
            gameStage.style.width = '100%';
            gameStage.style.minWidth = '80%'; // Prevent container from becoming too narrow

            this.sm.gameTimeRemaining = 60;
            this.updateGameTimer();

            // Start Timer
            this.sm.gameTimerInterval = setInterval(() => {
                this.sm.gameTimeRemaining--;
                this.updateGameTimer();
                if (this.sm.gameTimeRemaining <= 0) {
                    this.pauseGame();
                }
            }, 1000);

            // Initialize Game Logic
            const canvas = $('#game-canvas');

            // Create a callback that offers replay if time remains
            const gameOverCallback = (score) => {
                this.saveHighScore(type, score);

                // If there's time remaining, offer to play again
                if (this.sm.gameTimeRemaining > 0) {
                    const playAgain = confirm(`Game Over! Score: ${score}\n\nYou have ${Math.floor(this.sm.gameTimeRemaining / 60)}:${(this.sm.gameTimeRemaining % 60).toString().padStart(2, '0')} remaining.\n\nPlay again?`);

                    if (playAgain) {
                        // Restart the same game
                        this.sm.currentGame = null;
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
                import('../games/galacticBreaker.js').then(module => {
                    this.sm.currentGame = new module.GalacticBreaker(canvas, gameOverCallback);
                    this.sm.currentGame.start();
                });
            } else if (type === 'snake') {
                import('../games/snake.js').then(module => {
                    this.sm.currentGame = new module.Snake(canvas, gameOverCallback);
                    this.sm.currentGame.start();
                });
            } else if (type === 'flappy-bird') {
                import('../games/flappyBird.js').then(module => {
                    this.sm.currentGame = new module.FlappyBird(canvas, gameOverCallback);
                    this.sm.currentGame.start();
                });
            } else if (type === 'space-invaders') {
                import('../games/spaceInvaders.js').then(module => {
                    this.sm.currentGame = new module.SpaceInvaders(canvas, gameOverCallback);
                    this.sm.currentGame.start();
                });
            } else if (type === 'target-shooter') {
                import('../games/targetShooter.js').then(module => {
                    this.sm.currentGame = new module.TargetShooter(canvas, gameOverCallback);
                    this.sm.currentGame.start();
                });
            } else if (type === 'pong') {
                import('../games/pong.js').then(module => {
                    this.sm.currentGame = new module.Pong(canvas, gameOverCallback);
                    this.sm.currentGame.start();
                });
            } else if (type === 'whack-a-mole') {
                import('../games/whackAMole.js').then(module => {
                    this.sm.currentGame = new module.WhackAMole(canvas, gameOverCallback);
                    this.sm.currentGame.start();
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
            } else if (type === 'radius-raid') {
                this.loadHTMLGame(
                    'radius-raid',
                    'js/games/radius-raid-master/index.html',
                    'radius-raid-score', // Score reporting enabled
                    gameOverCallback,
                    canvas,
                    gameStage
                );
            } else if (type === 'packabunchas') {
                this.loadHTMLGame(
                    'packabunchas',
                    'js/games/packabunchas-main/index.html',
                    'packabunchas-score', // Score reporting enabled
                    gameOverCallback,
                    canvas,
                    gameStage
                );
            } else if (type === 'spacepi') {
                this.loadHTMLGame(
                    'spacepi',
                    'js/games/spacepi-master/index.html',
                    'spacepi-score', // Score reporting enabled
                    gameOverCallback,
                    canvas,
                    gameStage
                );
            } else if (type === 'mystic-valley') {
                this.loadHTMLGame(
                    'mystic-valley',
                    encodeURI('js/games/Mystic Valley.html'),
                    null, // No score reporting initially
                    gameOverCallback,
                    canvas,
                    gameStage
                );
            } else if (type === 'slash-knight') {
                this.loadHTMLGame(
                    'slash-knight',
                    encodeURI('js/games/Slash Knight.html'),
                    null, // No score reporting initially
                    gameOverCallback,
                    canvas,
                    gameStage
                );
            } else if (type === 'black-hole-square') {
                this.loadHTMLGame(
                    'black-hole-square',
                    'js/games/black-hole-square-master/public/index.html',
                    null, // No score reporting initially
                    gameOverCallback,
                    canvas,
                    gameStage
                );
            } else if (type === 'glitch-buster') {
                // Glitch Buster - using standalone HTML file
                const glitchPath = 'js/games/glitch-buster-master/glitch buster.html';
                this.loadHTMLGame(
                    'glitch-buster',
                    glitchPath,
                    null, // No score reporting initially
                    gameOverCallback,
                    canvas,
                    gameStage
                );
            } else if (type === 'callisto') {
                // Callisto - using standalone HTML file
                const callistoPath = 'js/games/js13k-callisto-main/index.html';
                this.loadHTMLGame(
                    'callisto',
                    callistoPath,
                    null, // No score reporting initially
                    gameOverCallback,
                    canvas,
                    gameStage
                );
            } else if (type === 'js13k2021') {
                // Galaxy Rider (JS13K 2021) - using standalone HTML file
                const js13kPath = 'js/games/galaxy_rider.html';
                this.loadHTMLGame(
                    'js13k2021',
                    js13kPath,
                    null, // No score reporting initially
                    gameOverCallback,
                    canvas,
                    gameStage
                );
            }
        }
    }

    stopCurrentGame() {
        // Store current game type before cleanup for score saving
        const currentGameType = this.sm.currentGame?.gameType || null;
        
        if (this.sm.currentGame) {
            if (typeof this.sm.currentGame.stop === 'function') {
                this.sm.currentGame.stop();
            }
            // Also clean up message handler if it exists
            if (this.sm.currentGame.messageHandler) {
                window.removeEventListener('message', this.sm.currentGame.messageHandler);
            }
            // Report final score if available (for games with score reporting)
            if (this.sm.currentGameScore !== undefined && this.sm.currentGameScore > 0 && currentGameType) {
                this.saveHighScore(currentGameType, this.sm.currentGameScore, this.sm.currentGameMetadata);
            }
            this.sm.currentGame = null;
            this.sm.currentGameScore = 0;
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
            canvas.style.margin = '0 auto'; // Center the canvas
        }
        
        // Hide score display
        const scoreDisplay = $('#game-score');
        if (scoreDisplay) {
            scoreDisplay.style.display = 'none';
        }
        
        if (this.sm.gameTimerInterval) {
            clearInterval(this.sm.gameTimerInterval);
            this.sm.gameTimerInterval = null;
        }
    }

    async pauseGame() {
        if (!this.sm.currentGame) return;

        // Check if we can auto-extend BEFORE pausing
        const settings = (this.sm.currentVocab && this.sm.currentVocab.activitySettings) ? this.sm.currentVocab.activitySettings : {};
        const exchangeRate = settings.exchangeRate !== undefined ? settings.exchangeRate : 10;

        if (this.sm.coins >= exchangeRate) {
            // Auto-deduct and add time - NO PAUSE, game continues seamlessly
            await this.sm.progress.deductCoins(exchangeRate);
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
        if (this.sm.currentGame.pause) {
            this.sm.currentGame.pause();
        }
        this.sm.isGamePaused = true;

        // Stop the timer
        if (this.sm.gameTimerInterval) {
            clearInterval(this.sm.gameTimerInterval);
            this.sm.gameTimerInterval = null;
        }

        // Not enough coins - end game
        notifications.warning('Time up! Not enough coins to continue.');
        this.stopCurrentGame();
        this.showGameSelection();
    }

    addGameTime(seconds = 60) {
        const increment = Number.isFinite(seconds) ? seconds : 0;
        this.sm.gameTimeRemaining = Math.max(0, this.sm.gameTimeRemaining + increment);
        this.updateGameTimer();
    }

    updateGameTimer() {
        const mins = Math.floor(this.sm.gameTimeRemaining / 60);
        const secs = this.sm.gameTimeRemaining % 60;
        $('#game-timer').textContent = `Time: ${mins}:${secs.toString().padStart(2, '0')}`;
    }
}


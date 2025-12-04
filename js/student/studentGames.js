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
        const game = this.sm.games[this.sm.currentGameIndex];
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
        // Level Devil is special - it has leaderboard with metadata
        if (gameId === 'level-devil') {
            // Continue to save Level Devil scores
        } else if (this.sm.htmlGames.includes(gameId)) {
            return; // HTML games don't have leaderboards
        }
        if (!this.sm.currentUser) {
            return; // Only save if logged in
        }
        if (!this.sm.studentProfile.grade) {
            return; // Need grade for leaderboard
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
            const existingScore = existingDoc.exists() ? (existingDoc.data().score || 0) : 0;
            if (!existingDoc.exists() || score > existingScore) {
                const scoreData = {
                    userId: this.sm.currentUser.uid,
                    name: this.sm.studentProfile.name || 'Anonymous',
                    grade: this.sm.studentProfile.grade,
                    gameId: gameId,
                    score: score,
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

                // Refresh leaderboard if we're viewing this game
                if (this.sm.games && this.sm.games[this.sm.currentGameIndex] && this.sm.games[this.sm.currentGameIndex].id === gameId) {
                    this.loadLeaderboard(gameId);
                }
            }
        } catch (error) {
            console.error('Error saving score:', error);
            notifications.warning('Could not save your score to the leaderboard. Your progress is still saved locally.');
        }
    }

    updateLeaderboardGame() {
        const game = this.sm.games[this.sm.currentGameIndex];
        const nameEl = $('#current-game-name');
        if (nameEl) nameEl.textContent = game.name;
        
        // Show leaderboard for Level Devil, hide for other HTML games
        const leaderboardContainer = $('#leaderboard-container');
        if (game.id === 'level-devil') {
            // Level Devil has leaderboard
            if (leaderboardContainer) leaderboardContainer.style.display = 'block';
            this.loadLeaderboard(game.id);
        } else if (this.sm.htmlGames.includes(game.id)) {
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
        if (!this.sm.studentProfile.grade) {
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
                where('grade', '==', this.sm.studentProfile.grade),
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
                            <span style="font-weight: bold; color: var(--primary-color); font-size: 0.9rem;">Score: ${data.score.toLocaleString()}</span>
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
                        <span style="font-weight: bold; color: var(--primary-color);">${data.score.toLocaleString()}</span>
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
                    
                    // Store current score for final reporting
                    this.sm.currentGameScore = Math.max(this.sm.currentGameScore || 0, score);
                    this.sm.currentGameMetadata = metadata; // Store metadata
                    
                    // Save score periodically (not just on game over) to ensure it's saved
                    if (score > 0 && score !== (this.sm.lastSavedScore || 0)) {
                        this.sm.lastSavedScore = score;
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
            }
        };
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
            $('#game-stage').classList.remove('hidden');

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
            const gameStage = $('#game-stage');

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
                    null, // No score reporting for this game
                    gameOverCallback,
                    canvas,
                    gameStage
                );
            } else if (type === 'packabunchas') {
                this.loadHTMLGame(
                    'packabunchas',
                    'js/games/packabunchas-main/index.html',
                    null, // No score reporting for this game
                    gameOverCallback,
                    canvas,
                    gameStage
                );
            } else if (type === 'spacepi') {
                this.loadHTMLGame(
                    'spacepi',
                    'js/games/spacepi-master/index.html',
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
        $('#game-stage').classList.add('hidden');
        $('#game-selection').classList.remove('hidden');
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


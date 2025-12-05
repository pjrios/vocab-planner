
import { createElement, $ } from '../main.js';

export class SpeedMatchActivity {
    constructor(container, words, onProgress, onSaveState, initialState) {
        this.container = container;
        this.words = words;
        this.onProgress = onProgress;
        this.onSaveState = onSaveState;
        this.initialState = initialState;

        this.score = 0;
        this.lives = 3;
        this.isPlaying = false;
        this.fallingWords = [];
        this.spawnRate = 2000;
        this.lastSpawn = 0;
        this.animationFrame = null;
        this.currentDefinition = null;
        this.highScore = 0;

        this.init();
    }

    init() {
        this.restoreState();
        this.container.innerHTML = `
            <div class="speed-match-intro">
                <h2>Speed Match</h2>
                <p>Match the falling words to the definition shown!</p>
                <p>High Score: ${this.highScore}</p>
                <button id="start-speed-match" class="btn primary-btn">Start Game</button>
            </div>
        `;

        $('#start-speed-match').addEventListener('click', () => this.startGame());
    }

    restoreState() {
        if (this.initialState && typeof this.initialState === 'number') {
            this.highScore = this.initialState;
            return;
        } else if (this.initialState && this.initialState.highScore) {
            this.highScore = this.initialState.highScore;
            return;
        }

        const key = `speedmatch_highscore_${this.words.length} `;
        const saved = localStorage.getItem(key);
        if (saved) {
            this.highScore = parseInt(saved, 10) || 0;
        }
    }

    saveState() {
        const key = `speedmatch_highscore_${this.words.length} `;
        if (this.score > this.highScore) {
            this.highScore = this.score;
            localStorage.setItem(key, this.highScore);

            if (this.onSaveState) {
                this.onSaveState({ highScore: this.highScore });
            }
        }
    }

    startGame() {
        this.score = 0;
        this.lives = 3;
        this.isPlaying = true;
        this.fallingWords = [];
        this.container.innerHTML = '';

        // Game UI
        const wrapper = createElement('div', 'speed-match-wrapper');

        const hud = createElement('div', 'speed-match-hud');
        hud.innerHTML = `
            <span>Score: <span id="sm-score">0</span></span>
            <span>Lives: <span id="sm-lives">❤️❤️❤️</span></span>
        `;
        wrapper.appendChild(hud);

        const defDisplay = createElement('div', 'speed-match-definition');
        this.defText = createElement('h3');
        defDisplay.appendChild(this.defText);
        wrapper.appendChild(defDisplay);

        const gameArea = createElement('div', 'speed-match-area');
        this.gameArea = gameArea;
        wrapper.appendChild(gameArea);

        this.container.appendChild(wrapper);

        this.pickNewDefinition();
        this.loop();
    }

    pickNewDefinition() {
        const randomWord = this.words[Math.floor(Math.random() * this.words.length)];
        this.currentDefinition = randomWord;
        this.defText.textContent = randomWord.definition;
    }

    spawnWord() {
        // 30% chance to spawn correct word, 70% random wrong word
        let wordObj;
        if (Math.random() < 0.3) {
            wordObj = this.currentDefinition;
        } else {
            wordObj = this.words[Math.floor(Math.random() * this.words.length)];
            // Avoid accidental correct word if possible (though duplicates are fine for chaos)
        }

        const el = createElement('div', 'falling-word', wordObj.word);
        el.style.left = Math.random() * (this.gameArea.offsetWidth - 100) + 'px';
        el.style.top = '-50px';

        // Store data
        const wordData = {
            el,
            y: -50,
            speed: 1 + Math.random() * 1.5 + (this.score / 10), // Speed increases with score
            word: wordObj.word,
            isCorrect: wordObj.word === this.currentDefinition.word
        };

        el.addEventListener('mousedown', () => this.handleWordClick(wordData));
        // Touch support
        el.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.handleWordClick(wordData);
        });

        this.gameArea.appendChild(el);
        this.fallingWords.push(wordData);
    }

    handleWordClick(wordData) {
        if (!this.isPlaying) return;

        if (wordData.isCorrect) {
            this.score++;
            this.updateHUD();
            // Remove all words and pick new definition
            this.clearFallingWords();
            this.pickNewDefinition();
            // Feedback
            this.showFeedback('Correct!', 'success');
        } else {
            this.lives--;
            this.updateHUD();
            this.showFeedback('Wrong!', 'danger');
            // Remove just this word
            this.removeWord(wordData);
            if (this.lives <= 0) this.endGame();
        }
    }

    removeWord(wordData) {
        if (wordData.el.parentNode) {
            wordData.el.parentNode.removeChild(wordData.el);
        }
        this.fallingWords = this.fallingWords.filter(w => w !== wordData);
    }

    clearFallingWords() {
        this.fallingWords.forEach(w => {
            if (w.el.parentNode) w.el.parentNode.removeChild(w.el);
        });
        this.fallingWords = [];
    }

    updateHUD() {
        $('#sm-score').textContent = this.score;
        $('#sm-lives').textContent = '❤️'.repeat(this.lives);
    }

    showFeedback(text, type) {
        const fb = createElement('div', `sm-feedback ${type}`, text);
        this.gameArea.appendChild(fb);
        setTimeout(() => {
            if (fb.parentNode) fb.parentNode.removeChild(fb);
        }, 1000);
    }

    loop(timestamp) {
        if (!this.isPlaying) return;

        if (!this.lastSpawn) this.lastSpawn = timestamp;

        if (timestamp - this.lastSpawn > this.spawnRate) {
            this.spawnWord();
            this.lastSpawn = timestamp;
            // Decrease spawn rate slightly
            this.spawnRate = Math.max(800, 2000 - (this.score * 50));
        }

        // Move words
        this.fallingWords.forEach(w => {
            w.y += w.speed;
            w.el.style.top = w.y + 'px';

            // Check bounds
            if (w.y > this.gameArea.offsetHeight) {
                // Missed word
                if (w.isCorrect) {
                    this.lives--;
                    this.updateHUD();
                    this.pickNewDefinition(); // Switch def if missed
                    this.clearFallingWords(); // Reset screen
                    this.showFeedback('Missed!', 'danger');
                    if (this.lives <= 0) this.endGame();
                } else {
                    // Just remove wrong words that fell off
                    this.removeWord(w);
                }
            }
        });

        this.animationFrame = requestAnimationFrame((t) => this.loop(t));
    }

    endGame() {
        this.isPlaying = false;
        cancelAnimationFrame(this.animationFrame);

        this.saveState(); // Save high score

        const isNewHighScore = this.score > 0 && this.score >= this.highScore;
        
        this.container.innerHTML = `
            <div class="completion-screen">
                <h2>${isNewHighScore ? '🏆 New High Score!' : 'Game Over!'}</h2>
                <p>Final Score: ${this.score}</p>
                <p>High Score: ${this.highScore}</p>
                <button id="restart-speed-match" class="btn primary-btn">🔄 Play Again</button>
            </div>
        `;

        $('#restart-speed-match').addEventListener('click', () => {
            // Notify progress system of new session
            if (this.onProgress) {
                this.onProgress({ score: 0, details: 'Score: 0', isComplete: false, isReplay: true });
            }
            this.startGame();
        });

        if (this.onProgress) {
            this.onProgress(this.getScore());
        }
    }

    getScore() {
        return {
            score: this.score * 10, // Arbitrary scaling
            details: `Score: ${this.score} `,
            isComplete: true // Always "complete" when game over
        };
    }
}

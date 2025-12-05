
import { createElement, $, notifications } from '../main.js';

export class FillInBlankActivity {
    constructor(container, words, onProgress, onSaveState, initialState) {
        this.container = container;
        this.words = words;
        this.onProgress = onProgress;
        this.onSaveState = onSaveState;
        this.initialState = initialState;

        this.currentIndex = 0;
        this.score = 0;
        this.currentWord = null;
        this.attempts = 0;

        this.init();
    }

    init() {
        if (!this.restoreState()) {
            this.words.sort(() => Math.random() - 0.5);
            this.startRound();
        } else {
            this.render();
        }
    }

    restoreState() {
        if (this.initialState) {
            const state = this.initialState;
            this.currentIndex = state.currentIndex;
            this.score = state.score;
            this.attempts = state.attempts;

            if (state.shuffledWords) {
                this.words = state.shuffledWords;
            }

            this.currentWord = this.words[this.currentIndex];
            return true;
        }

        const key = `fib_state_${this.words.length} `;
        const saved = localStorage.getItem(key);
        if (saved) {
            try {
                const state = JSON.parse(saved);
                this.currentIndex = state.currentIndex;
                this.score = state.score;
                this.attempts = state.attempts;

                if (state.shuffledWords) {
                    this.words = state.shuffledWords;
                }

                this.currentWord = this.words[this.currentIndex];
                return true;
            } catch (e) {
                console.error('Failed to restore fib state', e);
            }
        }
        return false;
    }

    saveState() {
        const state = {
            currentIndex: this.currentIndex,
            score: this.score,
            attempts: this.attempts,
            shuffledWords: this.words
        };

        if (this.onSaveState) {
            this.onSaveState(state);
        }

        const key = `fib_state_${this.words.length} `;
        localStorage.setItem(key, JSON.stringify(state));
    }

    startRound() {
        if (this.currentIndex >= this.words.length) {
            this.container.innerHTML = `
                <div class="completion-screen">
                    <h2>🎉 All Words Completed!</h2>
                    <p>You completed ${this.words.length} words!</p>
                    <button id="replay-fib" class="btn primary-btn" style="margin-top: 1rem;">🔄 Play Again</button>
                </div>
            `;
            
            // Add replay button listener
            const replayBtn = this.container.querySelector('#replay-fib');
            if (replayBtn) {
                replayBtn.addEventListener('click', () => this.restart());
            }
            return;
        }

        this.currentWord = this.words[this.currentIndex];
        this.attempts = 0;
        this.render();
    }

    getScore() {
        const progress = Math.round((this.currentIndex / this.words.length) * 100);
        return {
            score: progress,
            details: `${this.currentIndex}/${this.words.length} words completed`,
            isComplete: this.currentIndex === this.words.length
        };
    }

    checkAnswer() {
        const input = this.container.querySelector('.fib-input');
        const val = input.value.trim().toLowerCase();
        const correct = this.currentWord.word.toLowerCase();

        if (val === correct) {
            // Correct
            input.classList.add('correct');
            setTimeout(() => {
                notifications.success('Correct!');
                this.currentIndex++;
                this.checkProgress();
                this.startRound();
                this.saveState();
            }, 500);
        } else {
            // Wrong
            input.classList.add('wrong');
            this.attempts++;
            this.saveState();
            setTimeout(() => {
                input.classList.remove('wrong');
                input.value = '';
                input.focus();
            }, 1000);

            if (this.attempts >= 3) {
                // Show hint or move on?
                // Let's show the answer
                notifications.info(`The correct word was: ${this.currentWord.word}`);
                this.currentIndex++;
                this.checkProgress();
                this.startRound();
                this.saveState();
            }
        }
    }

    checkProgress() {
        if (this.onProgress) {
            this.onProgress(this.getScore());
        }
    }

    restart() {
        // Clear saved state
        const key = `fib_state_${this.words.length}`;
        localStorage.removeItem(key);
        localStorage.removeItem(key.trim());
        
        // Reset game state
        this.currentIndex = 0;
        this.score = 0;
        this.currentWord = null;
        this.attempts = 0;
        
        // Reshuffle words for variety
        this.words.sort(() => Math.random() - 0.5);
        
        // Notify progress system of new session
        if (this.onProgress) {
            this.onProgress({ score: 0, details: '0/0 words completed', isComplete: false, isReplay: true });
        }
        
        this.startRound();
        this.saveState();
    }

    render() {
        this.container.innerHTML = '';

        const wrapper = createElement('div', 'fib-wrapper');

        // Construct sentence
        let sentence = '';
        if (this.currentWord.example) {
            // Replace word in example (case insensitive)
            const regex = new RegExp(this.currentWord.word, 'gi');
            sentence = this.currentWord.example.replace(regex, '_____');
        } else {
            // Fallback to definition
            sentence = `A(n) _____ is ${this.currentWord.definition}`;
        }

        const sentenceEl = createElement('div', 'fib-sentence');

        // Split by placeholder to inject input
        const parts = sentence.split('_____');
        if (parts.length > 1) {
            sentenceEl.appendChild(document.createTextNode(parts[0]));

            const input = createElement('input', 'fib-input');
            input.type = 'text';
            input.placeholder = '?';
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') this.checkAnswer();
            });
            sentenceEl.appendChild(input);

            sentenceEl.appendChild(document.createTextNode(parts[1]));
        } else {
            sentenceEl.textContent = sentence; // Fallback if replace failed
        }

        wrapper.appendChild(sentenceEl);

        const btn = createElement('button', 'btn primary-btn', 'Check Answer');
        btn.addEventListener('click', () => this.checkAnswer());
        wrapper.appendChild(btn);

        // Hint button
        const hintBtn = createElement('button', 'btn text-btn', 'Show Hint');
        hintBtn.addEventListener('click', () => {
            alert(`Definition: ${this.currentWord.definition}`);
        });
        wrapper.appendChild(hintBtn);

        this.container.appendChild(wrapper);

        // Focus input
        setTimeout(() => {
            const inp = this.container.querySelector('.fib-input');
            if (inp) inp.focus();
        }, 100);
    }
}

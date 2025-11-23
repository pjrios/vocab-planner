import { createElement, $ } from '../main.js';

export class ScrambleActivity {
    constructor(container, words, onProgress, onSaveState, initialState) {
        this.container = container;
        this.words = words;
        this.onProgress = onProgress;
        this.onSaveState = onSaveState;
        this.initialState = initialState;

        this.currentIndex = 0;
        this.score = 0;
        this.currentWord = null;
        this.shuffledLetters = [];
        this.userAnswer = [];

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
            this.currentWord = state.currentWord;
            this.shuffledLetters = state.shuffledLetters;
            this.userAnswer = state.userAnswer;

            if (state.shuffledWords) {
                this.words = state.shuffledWords;
            }

            if (!this.currentWord) {
                this.startRound();
            }
            return true;
        }

        const key = `scramble_state_${this.words.length}`;
        const saved = localStorage.getItem(key);
        if (saved) {
            try {
                const state = JSON.parse(saved);
                this.currentIndex = state.currentIndex;
                this.score = state.score;
                this.currentWord = state.currentWord;
                this.shuffledLetters = state.shuffledLetters;
                this.userAnswer = state.userAnswer;

                if (state.shuffledWords) {
                    this.words = state.shuffledWords;
                }

                // If we are mid-round, currentWord should be set.
                // If we finished a round but didn't start next, we might need to call startRound?
                // But startRound resets userAnswer. So we should only call it if we don't have active state.
                // If we have userAnswer/shuffledLetters, we are mid-round.
                if (!this.currentWord) {
                    this.startRound();
                }

                return true;
            } catch (e) {
                console.error('Failed to restore scramble state', e);
            }
        }
        return false;
    }

    saveState() {
        const state = {
            currentIndex: this.currentIndex,
            score: this.score,
            currentWord: this.currentWord,
            shuffledLetters: this.shuffledLetters,
            userAnswer: this.userAnswer,
            shuffledWords: this.words
        };

        if (this.onSaveState) {
            this.onSaveState(state);
        }

        const key = `scramble_state_${this.words.length}`;
        localStorage.setItem(key, JSON.stringify(state));
    }

    startRound() {
        if (this.currentIndex >= this.words.length) {
            this.container.innerHTML = `
                <div class="completion-screen">
                    <h2>All Words Unscrambled!</h2>
                    <p>Final Score: ${this.score}%</p>
                </div>
            `;
            return;
        }

        this.currentWord = this.words[this.currentIndex];
        this.userAnswer = [];

        // Shuffle letters
        const letters = this.currentWord.word.split('');
        // Ensure it's actually shuffled
        do {
            this.shuffledLetters = letters.sort(() => Math.random() - 0.5).map((char, id) => ({ char, id: Math.random().toString(36).substr(2, 9) }));
        } while (this.shuffledLetters.map(l => l.char).join('') === this.currentWord.word && letters.length > 1);

        this.render();
    }

    getScore() {
        const progress = Math.round((this.currentIndex / this.words.length) * 100);
        return {
            score: progress,
            details: `${this.currentIndex}/${this.words.length} words unscrambled`,
            isComplete: this.currentIndex === this.words.length
        };
    }

    handlePoolClick(letterObj) {
        this.userAnswer.push(letterObj);
        this.shuffledLetters = this.shuffledLetters.filter(l => l.id !== letterObj.id);
        this.render();
        this.saveState();
        this.checkAnswer();
    }

    handleAnswerClick(letterObj) {
        this.shuffledLetters.push(letterObj);
        this.userAnswer = this.userAnswer.filter(l => l.id !== letterObj.id);
        this.render();
        this.saveState();
    }

    checkAnswer() {
        const currentString = this.userAnswer.map(l => l.char).join('');
        if (currentString.length === this.currentWord.word.length) {
            if (currentString === this.currentWord.word) {
                // Correct
                setTimeout(() => {
                    alert('Correct!');
                    this.currentIndex++;
                    this.checkProgress();
                    this.startRound();
                    this.saveState();
                }, 300);
            } else {
                // Wrong - visual feedback?
                // For now just let them fix it
            }
        }
    }

    checkProgress() {
        if (this.onProgress) {
            this.onProgress(this.getScore());
        }
    }

    render() {
        this.container.innerHTML = '';

        const wrapper = createElement('div', 'scramble-wrapper');

        // Hint/Definition
        const hint = createElement('div', 'scramble-hint');
        hint.innerHTML = `<strong>Definition:</strong> ${this.currentWord.definition}`;
        wrapper.appendChild(hint);

        // Answer Area
        const answerArea = createElement('div', 'scramble-answer-area');
        // Create slots for expected length
        for (let i = 0; i < this.currentWord.word.length; i++) {
            const slot = createElement('div', 'scramble-slot');
            if (this.userAnswer[i]) {
                const tile = createElement('button', 'scramble-tile', this.userAnswer[i].char);
                tile.addEventListener('click', () => this.handleAnswerClick(this.userAnswer[i]));
                slot.appendChild(tile);
            }
            answerArea.appendChild(slot);
        }
        wrapper.appendChild(answerArea);

        // Pool Area
        const poolArea = createElement('div', 'scramble-pool-area');
        this.shuffledLetters.forEach(l => {
            const tile = createElement('button', 'scramble-tile', l.char);
            tile.addEventListener('click', () => this.handlePoolClick(l));
            poolArea.appendChild(tile);
        });
        wrapper.appendChild(poolArea);

        this.container.appendChild(wrapper);
    }
}

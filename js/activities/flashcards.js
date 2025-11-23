import { createElement, $ } from '../main.js';

export class FlashcardsActivity {
    constructor(container, words, onProgress, onSaveState, initialState) {
        this.container = container;
        this.words = words;
        this.onProgress = onProgress;
        this.onSaveState = onSaveState;
        this.initialState = initialState;

        this.currentIndex = 0;
        this.isFlipped = false;
        this.viewedCards = new Set(); // Empty start, only add on flip

        this.init();
    }

    init() {
        if (!this.restoreState()) {
            // New game defaults
        }
        this.render();
        this.reportProgress();
    }

    restoreState() {
        if (this.initialState) {
            this.currentIndex = this.initialState.currentIndex || 0;
            this.viewedCards = new Set(this.initialState.viewedCards || []);
            return true;
        }

        const key = `flashcards_state_${this.words.length}`;
        const saved = localStorage.getItem(key);
        if (saved) {
            try {
                const state = JSON.parse(saved);
                this.currentIndex = state.currentIndex || 0;
                this.viewedCards = new Set(state.viewedCards || []);
                return true;
            } catch (e) {
                console.error('Failed to restore flashcards state', e);
            }
        }
        return false;
    }

    saveState() {
        const state = {
            currentIndex: this.currentIndex,
            viewedCards: Array.from(this.viewedCards),
            score: this.getScore().score
        };

        if (this.onSaveState) {
            this.onSaveState(state);
        }

        const key = `flashcards_state_${this.words.length}`;
        localStorage.setItem(key, JSON.stringify(state));
    }

    reportProgress() {
        if (this.onProgress) {
            this.onProgress(this.getScore());
        }
    }

    getScore() {
        const viewedCount = this.viewedCards.size;
        const total = this.words.length;
        const percentage = total === 0 ? 0 : Math.round((viewedCount / total) * 100);

        return {
            score: percentage,
            details: `Viewed: ${viewedCount}/${total} cards`,
            isComplete: percentage === 100
        };
    }

    render() {
        this.container.innerHTML = '';

        const wrapper = createElement('div', 'flashcard-wrapper');

        // Card Container
        const cardScene = createElement('div', 'card-scene');
        const card = createElement('div', 'flashcard');
        if (this.isFlipped) card.classList.add('is-flipped');

        // Front
        const front = createElement('div', 'card-face card-front');
        const w = this.words[this.currentIndex];

        front.innerHTML = `
            <div class="card-content">
                <h2>${w.word}</h2>
                <p class="hint" style="margin-top: auto;">Tap to reveal the definition</p>
            </div>
        `;

        // Back
        const back = createElement('div', 'card-face card-back');
        back.innerHTML = `
            <div class="card-content">
                <span class="pos-tag">${this.words[this.currentIndex].part_of_speech}</span>
                <p class="definition">${this.words[this.currentIndex].definition}</p>
                <p class="example">"${this.words[this.currentIndex].example}"</p>
            </div>
        `;

        card.appendChild(front);
        card.appendChild(back);
        cardScene.appendChild(card);

        // Controls
        const controls = createElement('div', 'controls');
        controls.innerHTML = `
            <button id="prev-card" class="btn secondary-btn" ${this.currentIndex === 0 ? 'disabled' : ''}>← Previous</button>
            <span class="progress">${this.currentIndex + 1} / ${this.words.length}</span>
            <button id="next-card" class="btn primary-btn" ${this.currentIndex === this.words.length - 1 ? 'disabled' : ''}>Next →</button>
        `;

        wrapper.appendChild(cardScene);
        wrapper.appendChild(controls);
        this.container.appendChild(wrapper);

        // Events
        card.addEventListener('click', () => {
            card.classList.toggle('is-flipped');
            this.isFlipped = !this.isFlipped;

            // Mark as viewed ONLY on flip (if not already viewed)
            if (this.isFlipped) {
                if (!this.viewedCards.has(this.currentIndex)) {
                    this.viewedCards.add(this.currentIndex);
                    this.reportProgress();
                }
            }
            this.saveState();
        });

        wrapper.querySelector('#prev-card').addEventListener('click', (e) => {
            e.stopPropagation();
            if (this.currentIndex > 0) {
                this.currentIndex--;
                this.isFlipped = false;
                this.render();
                this.saveState();
            }
        });

        wrapper.querySelector('#next-card').addEventListener('click', (e) => {
            e.stopPropagation();
            if (this.currentIndex < this.words.length - 1) {
                this.currentIndex++;
                this.isFlipped = false;
                this.render();
                this.saveState();
            }
        });
    }
}

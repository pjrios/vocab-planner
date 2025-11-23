import { createElement, $ } from '../main.js';

export class MatchingActivity {
    constructor(container, words, onProgress) {
        this.container = container;
        // Words are pre-filtered by student.js based on settings
        this.words = words;
        this.onProgress = onProgress;
        this.completedIds = new Set();
        this.attempts = 0;
        this.cards = [];

        // Try to restore state first
        this.restoreState();

        // If no cards loaded from state, generate and shuffle
        if (this.cards.length === 0) {
            this.words.forEach((w, i) => {
                this.cards.push({ type: 'word', content: w.word, id: i });
                this.cards.push({ type: 'def', content: w.definition, id: i });
            });
            // Shuffle
            this.cards.sort(() => Math.random() - 0.5);
            this.pruneCompletedCards();
        }

        this.render();
    }

    restoreState() {
        const key = `matching_state_${this.words[0].word}_${this.words.length}`;
        const saved = localStorage.getItem(key);
        if (!saved) return;
        try {
            const state = JSON.parse(saved);
            if (state.matchedIds && Array.isArray(state.matchedIds)) {
                this.completedIds = new Set(state.matchedIds.map(id => parseInt(id)));
            } else if (state.matchedPairs && Array.isArray(state.matchedPairs) && Array.isArray(state.cards)) {
                // Legacy format migration
                const derivedIds = new Set();
                state.matchedPairs.forEach(idx => {
                    const card = state.cards[idx];
                    if (card && typeof card.id !== 'undefined') {
                        derivedIds.add(parseInt(card.id));
                    }
                });
                this.completedIds = derivedIds;
            }
            this.attempts = state.attempts || 0;
            if (state.cards) {
                this.cards = state.cards;
            }
            this.pruneCompletedCards();
        } catch (e) {
            console.error('Error restoring matching state:', e);
            // If error, we'll just start fresh (cards array is empty)
        }
    }

    pruneCompletedCards() {
        if (!this.cards || this.cards.length === 0) return;
        if (!this.completedIds || this.completedIds.size === 0) return;
        this.cards = this.cards.filter(card => !this.completedIds.has(card.id));
    }

    saveState() {
        const key = `matching_state_${this.words[0].word}_${this.words.length}`;
        const state = {
            matchedIds: Array.from(this.completedIds),
            attempts: this.attempts,
            cards: this.cards
        };
        localStorage.setItem(key, JSON.stringify(state));
    }

    getScore() {
        // Calculate accuracy
        // Minimum attempts = words.length (perfect game)
        // Score = (matches / attempts) * 100
        // If attempts is 0 (start), score is 100? Or 0? Let's say 0.
        if (this.attempts === 0) return { score: 0, details: 'No attempts made', isComplete: false };

        const matches = this.completedIds.size;
        const accuracy = Math.round((matches / this.attempts) * 100);
        const isComplete = matches === this.words.length;

        return {
            score: accuracy,
            details: `Accuracy: ${accuracy}% (${matches}/${this.words.length} matches)`,
            isComplete: isComplete
        };
    }

    render() {
        this.container.innerHTML = '';

        // Info Bar
        const infoBar = createElement('div', 'info-bar');
        infoBar.innerHTML = `<p>Attempts: <span id="attempts-count">${this.attempts}</span></p>`;
        this.container.appendChild(infoBar);

        const grid = createElement('div', 'matching-grid');

        this.cards.forEach((card, index) => {
            if (this.completedIds.has(card.id)) {
                return;
            }
            const cardEl = createElement('div', 'card matching-card');
            cardEl.dataset.index = index;
            cardEl.dataset.type = card.type;
            cardEl.dataset.id = card.id;

            // Content
            if (card.type === 'word') {
                cardEl.textContent = card.content;
            } else {
                // Definition or Image
                if (card.content.startsWith('images/')) {
                    const img = document.createElement('img');
                    img.src = card.content;
                    img.style.maxWidth = '100%';
                    cardEl.appendChild(img);
                } else {
                    cardEl.textContent = card.content;
                }
            }

            cardEl.addEventListener('click', () => this.handleCardClick(cardEl, index));
            grid.appendChild(cardEl);
        });

        this.container.appendChild(grid);
    }

    handleCardClick(card, index) {
        if (this.lockBoard) return;
        if (card === this.firstCard) return;
        if (this.completedIds.has(parseInt(card.dataset.id))) return;

        card.classList.add('flipped');
        card.style.background = 'rgba(99, 102, 241, 0.4)';
        card.style.color = '#f8fafc';

        if (!this.firstCard) {
            this.firstCard = card;
            return;
        }

        this.secondCard = card;
        this.attempts++;
        this.updateStats();
        this.checkForMatch();
    }

    updateStats() {
        const attemptsCountElement = $('#attempts-count');
        if (attemptsCountElement) {
            attemptsCountElement.textContent = this.attempts;
        }
        this.saveState();
        if (this.onProgress) {
            this.onProgress(this.getScore());
        }
    }

    checkForMatch() {
        let isMatch = this.firstCard.dataset.id === this.secondCard.dataset.id;

        if (isMatch) {
            this.disableCards();
        } else {
            this.unflipCards();
        }
    }

    disableCards() {
        this.lockBoard = true; // Lock immediately to prevent clicks

        // Add correct style
        this.firstCard.classList.add('correct');
        this.secondCard.classList.add('correct');

        const matchedId = parseInt(this.firstCard.dataset.id);
        this.completedIds.add(matchedId);

        setTimeout(() => {
            this.resetBoard();
            this.cards = this.cards.filter(card => card.id !== matchedId);
            this.render();
            this.saveState();

            if (this.completedIds.size === this.words.length) {
                setTimeout(() => alert('All matched! Great job!'), 300);
            }
        }, 450);
    }

    unflipCards() {
        this.lockBoard = true;

        // Add wrong style
        this.firstCard.classList.add('wrong');
        this.secondCard.classList.add('wrong');

        setTimeout(() => {
            this.firstCard.classList.remove('flipped', 'wrong');
            this.secondCard.classList.remove('flipped', 'wrong');
            this.firstCard.style.background = '#0f172a';
            this.firstCard.style.color = '#f8fafc';
            this.secondCard.style.background = '#0f172a';
            this.secondCard.style.color = '#f8fafc';
            this.resetBoard();
        }, 800); // Faster animation
    }

    resetBoard() {
        [this.hasFlippedCard, this.lockBoard] = [false, false];
        [this.firstCard, this.secondCard] = [null, null];
    }
}

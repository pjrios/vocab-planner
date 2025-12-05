import { createElement, $ } from '../main.js';

export class SynonymAntonymActivity {
    constructor(container, words, onProgress) {
        this.container = container;
        this.words = words;
        this.onProgress = onProgress;
        this.currentIndex = 0;
        this.score = 0;
        this.questions = this.generateQuestions();
        this.totalQuestions = this.questions.length;
        this.isFinished = false;

        this.render();
    }

    generateQuestions() {
        const questions = [];

        this.words.forEach(word => {
            // Try to create a Synonym question
            if (word.synonyms && word.synonyms.length > 0) {
                const correct = word.synonyms[0]; // Pick first one for simplicity
                const distractors = this.getDistractors(word, 'synonyms');

                if (distractors.length >= 3) {
                    questions.push({
                        type: 'Synonym',
                        word: word.word,
                        correctAnswer: correct,
                        options: this.shuffle([correct, ...distractors])
                    });
                }
            }

            // Try to create an Antonym question
            if (word.antonyms && word.antonyms.length > 0) {
                const correct = word.antonyms[0];
                const distractors = this.getDistractors(word, 'antonyms');

                if (distractors.length >= 3) {
                    questions.push({
                        type: 'Antonym',
                        word: word.word,
                        correctAnswer: correct,
                        options: this.shuffle([correct, ...distractors])
                    });
                }
            }
        });

        return this.shuffle(questions);
    }

    getDistractors(targetWord, type) {
        const distractors = [];
        const otherWords = this.shuffle(this.words.filter(w => w !== targetWord));

        for (const w of otherWords) {
            if (w[type] && w[type].length > 0) {
                distractors.push(w[type][0]);
            }
            if (distractors.length === 3) break;
        }

        // If not enough, fill with random words? Or just skip. 
        // For now, let's assume we have enough data or we skip the question.
        return distractors;
    }

    shuffle(array) {
        return array.sort(() => Math.random() - 0.5);
    }

    getScore() {
        if (this.totalQuestions === 0) return { score: 0, details: 'No questions available' };

        const percentage = Math.round((this.score / this.totalQuestions) * 100);
        return {
            score: percentage,
            details: `Correct: ${this.score}/${this.totalQuestions}`
        };
    }

    render() {
        this.container.innerHTML = '';

        if (this.questions.length === 0) {
            this.container.innerHTML = '<p style="text-align:center; padding:2rem;">Not enough data for this activity. Need more words with synonyms/antonyms.</p>';
            return;
        }

        if (this.isFinished) {
            this.renderSummary();
            return;
        }

        const question = this.questions[this.currentIndex];

        const quizContainer = createElement('div', 'quiz-container');
        quizContainer.style.maxWidth = '600px';
        quizContainer.style.margin = '0 auto';
        quizContainer.style.textAlign = 'center';

        // Progress
        const progress = createElement('div', 'quiz-progress');
        progress.textContent = `Question ${this.currentIndex + 1} of ${this.totalQuestions}`;
        progress.style.marginBottom = '1rem';
        progress.style.color = 'var(--text-muted)';
        quizContainer.appendChild(progress);

        // Question Card
        const card = createElement('div', 'card');
        card.style.padding = '2rem';
        card.style.marginBottom = '2rem';

        const typeLabel = createElement('span', 'pos-tag');
        typeLabel.textContent = question.type;
        typeLabel.style.background = question.type === 'Synonym' ? 'var(--primary-color)' : 'var(--accent-color)';
        typeLabel.style.color = 'white';
        typeLabel.style.marginBottom = '1rem';
        card.appendChild(typeLabel);

        const questionText = createElement('h2');
        questionText.textContent = `What is a ${question.type.toLowerCase()} for "${question.word}"?`;
        questionText.style.marginTop = '1rem';
        questionText.style.marginBottom = '1.5rem';
        card.appendChild(questionText);

        // Options
        const optionsGrid = createElement('div', 'options-grid');
        optionsGrid.style.display = 'grid';
        optionsGrid.style.gap = '1rem';

        question.options.forEach(option => {
            const btn = createElement('button', 'btn secondary-btn option-btn');
            btn.textContent = option;
            btn.style.whiteSpace = 'normal';
            btn.style.height = 'auto';
            btn.style.padding = '1rem';
            btn.style.textAlign = 'left';

            btn.addEventListener('click', () => this.handleAnswer(btn, option, question.correctAnswer));
            optionsGrid.appendChild(btn);
        });

        card.appendChild(optionsGrid);
        quizContainer.appendChild(card);
        this.container.appendChild(quizContainer);
    }

    handleAnswer(btn, selected, correct) {
        const buttons = this.container.querySelectorAll('.option-btn');
        buttons.forEach(b => b.disabled = true);

        if (selected === correct) {
            btn.classList.add('correct');
            btn.style.backgroundColor = '#10b981';
            btn.style.color = 'white';
            this.score++;
        } else {
            btn.classList.add('wrong');
            btn.style.backgroundColor = '#ef4444';
            btn.style.color = 'white';

            buttons.forEach(b => {
                if (b.textContent === correct) {
                    b.style.backgroundColor = '#10b981';
                    b.style.color = 'white';
                }
            });
        }

        if (this.onProgress) {
            this.onProgress(this.getScore());
        }

        setTimeout(() => {
            if (this.currentIndex < this.totalQuestions - 1) {
                this.currentIndex++;
                this.render();
            } else {
                this.isFinished = true;
                this.render();
            }
        }, 1500);
    }

    renderSummary() {
        const summary = createElement('div', 'quiz-summary');
        summary.style.textAlign = 'center';

        const result = this.getScore();

        summary.innerHTML = `
            <h2>🎉 Challenge Complete!</h2>
            <div style="font-size: 4rem; font-weight: bold; color: var(--primary); margin: 2rem 0;">
                ${result.score}%
            </div>
            <p style="font-size: 1.5rem; margin-bottom: 2rem;">${result.details}</p>
            <button id="restart-quiz" class="btn primary-btn">🔄 Play Again</button>
        `;

        this.container.appendChild(summary);

        $('#restart-quiz').addEventListener('click', () => this.restart());
    }
    
    restart() {
        // Reset game state
        this.currentIndex = 0;
        this.score = 0;
        this.isFinished = false;
        
        // Regenerate questions with new shuffle
        this.questions = this.generateQuestions();
        
        // Notify progress system of new session
        if (this.onProgress) {
            this.onProgress({ score: 0, details: 'Correct: 0/0', isComplete: false, isReplay: true });
        }
        
        this.render();
    }
}

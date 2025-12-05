import { createElement, $ } from '../main.js';

export class QuizActivity {
    constructor(container, words, onProgress) {
        this.container = container;
        this.words = words;
        this.onProgress = onProgress;
        this.currentIndex = 0;
        this.score = 0;
        this.totalQuestions = words.length;
        this.questions = this.generateQuestions();
        this.isFinished = false;

        this.render();
    }

    generateQuestions() {
        // Create a question for each word
        return this.words.map(word => {
            // Find distractors (other definitions)
            const otherWords = this.words.filter(w => w !== word);
            // Shuffle other words to pick random distractors
            otherWords.sort(() => Math.random() - 0.5);

            // Pick up to 3 distractors
            const distractors = otherWords.slice(0, 3).map(w => w.definition);

            // Combine correct answer and distractors
            const options = [word.definition, ...distractors];

            // Shuffle options
            options.sort(() => Math.random() - 0.5);

            return {
                word: word.word,
                correctAnswer: word.definition,
                options: options
            };
        });
    }

    getScore() {
        if (this.totalQuestions === 0) return { score: 0, details: 'No questions' };

        const percentage = Math.round((this.score / this.totalQuestions) * 100);
        return {
            score: percentage,
            details: `Correct: ${this.score}/${this.totalQuestions}`
        };
    }

    render() {
        this.container.innerHTML = '';

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

        const questionText = createElement('h2');
        questionText.textContent = `What is the definition of "${question.word}"?`;
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
        // Disable all buttons
        const buttons = this.container.querySelectorAll('.option-btn');
        buttons.forEach(b => b.disabled = true);

        if (selected === correct) {
            btn.classList.add('correct'); // You might need to add CSS for this
            btn.style.backgroundColor = '#10b981'; // Green
            btn.style.color = 'white';
            this.score++;
        } else {
            btn.classList.add('wrong');
            btn.style.backgroundColor = '#ef4444'; // Red
            btn.style.color = 'white';

            // Highlight correct answer
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

        // Wait and move to next
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
            <h2>🎉 Quiz Complete!</h2>
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

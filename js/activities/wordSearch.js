import { createElement, $ } from '../main.js';

export class WordSearchActivity {
    constructor(container, words, onProgress, vocabID) {
        this.container = container;
        // Words are pre-filtered by student.js based on settings
        this.words = words;
        this.onProgress = onProgress;
        this.vocabID = vocabID || 'default'; // Use ID for stable persistence
        this.gridSize = 15;
        this.grid = [];
        this.wordPositions = [];
        this.foundWords = new Set();
        this.isSelecting = false;
        this.selectedCells = [];

        // Try to restore state first
        this.restoreState();

        // If no state was restored, generate new grid
        if (this.grid.length === 0) {
            this.generateGrid();
        }

        this.render();
    }

    restoreState() {
        // Use vocabID in key for stability
        const key = `word_search_state_${this.vocabID}`;
        const saved = localStorage.getItem(key);

        if (saved) {
            try {
                const state = JSON.parse(saved);
                // Only restore if word count matches (basic validation)
                if (state.wordsLength === this.words.length) {
                    this.grid = state.grid;
                    this.wordPositions = state.wordPositions;
                    this.foundWords = new Set(state.foundWords);
                }
            } catch (e) {
                console.error('Error restoring word search state:', e);
            }
        }
    }

    saveState() {
        const key = `word_search_state_${this.vocabID}`;
        const state = {
            grid: this.grid,
            wordPositions: this.wordPositions,
            foundWords: Array.from(this.foundWords),
            wordsLength: this.words.length
        };
        localStorage.setItem(key, JSON.stringify(state));
    }

    generateGrid() {
        // Initialize empty grid - use explicit loops to avoid fill() issues
        this.grid = [];
        for (let i = 0; i < this.gridSize; i++) {
            this.grid[i] = [];
            for (let j = 0; j < this.gridSize; j++) {
                this.grid[i][j] = '';
            }
        }

        // Directions: [rowDelta, colDelta]
        const directions = [
            [0, 1],   // Right
            [1, 0],   // Down
            [1, 1],   // Diagonal down-right
            [1, -1],  // Diagonal down-left
            [0, -1],  // Left
            [-1, 0],  // Up
            [-1, -1], // Diagonal up-left
            [-1, 1]   // Diagonal up-right
        ];

        // Try to place each word
        for (const wordObj of this.words) {
            // Remove spaces for multi-word terms (e.g., "sound sensor" -> "soundsensor")
            const word = wordObj.word.toUpperCase().replace(/\s+/g, '');
            let placed = false;
            let attempts = 0;
            const maxAttempts = 100;

            while (!placed && attempts < maxAttempts) {
                attempts++;
                const dir = directions[Math.floor(Math.random() * directions.length)];
                const row = Math.floor(Math.random() * this.gridSize);
                const col = Math.floor(Math.random() * this.gridSize);

                if (this.canPlaceWord(word, row, col, dir)) {
                    this.placeWord(word, row, col, dir);
                    placed = true;
                }
            }
        }

        // Fill ALL empty cells with random letters
        const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        for (let r = 0; r < this.gridSize; r++) {
            for (let c = 0; c < this.gridSize; c++) {
                if (!this.grid[r][c] || this.grid[r][c] === '' || this.grid[r][c] === null || this.grid[r][c] === undefined) {
                    this.grid[r][c] = letters[Math.floor(Math.random() * letters.length)];
                }
            }
        }

        // Save initial state
        this.saveState();
    }

    canPlaceWord(word, row, col, dir) {
        const [dr, dc] = dir;

        // Check if word fits in grid
        const endRow = row + dr * (word.length - 1);
        const endCol = col + dc * (word.length - 1);

        if (endRow < 0 || endRow >= this.gridSize ||
            endCol < 0 || endCol >= this.gridSize) {
            return false;
        }

        // Check if cells are empty or match the letter
        for (let i = 0; i < word.length; i++) {
            const r = row + dr * i;
            const c = col + dc * i;
            if (this.grid[r][c] !== '' && this.grid[r][c] !== word[i]) {
                return false;
            }
        }

        return true;
    }

    placeWord(word, row, col, dir) {
        const [dr, dc] = dir;
        const positions = [];

        for (let i = 0; i < word.length; i++) {
            const r = row + dr * i;
            const c = col + dc * i;
            this.grid[r][c] = word[i];
            positions.push({ row: r, col: c });
        }

        this.wordPositions.push({
            word: word,
            positions: positions
        });
    }

    render() {
        this.container.innerHTML = '';

        const wrapper = createElement('div', 'word-search-wrapper');
        wrapper.style.maxWidth = '900px';
        wrapper.style.margin = '0 auto';
        wrapper.style.display = 'flex';
        wrapper.style.gap = '2rem';

        // Left side: Word list
        const wordList = this.renderWordList();
        wrapper.appendChild(wordList);

        // Right side: Grid
        const gridContainer = this.renderGrid();
        wrapper.appendChild(gridContainer);

        this.container.appendChild(wrapper);

        // Restore highlights for found words after rendering
        this.restoreHighlights();
    }

    restoreHighlights() {
        // Re-apply visual highlighting to found words
        for (const wordPos of this.wordPositions) {
            if (this.foundWords.has(wordPos.word)) {
                this.markWordAsFound(wordPos);
            }
        }
    }

    renderWordList() {
        const listContainer = createElement('div', 'word-list-container');
        listContainer.style.flex = '0 0 200px';
        listContainer.style.padding = '1rem';
        listContainer.style.background = '#f9fafb';
        listContainer.style.borderRadius = '0.5rem';
        listContainer.style.height = 'fit-content';

        const heading = createElement('h3');
        heading.textContent = 'Find These Words';
        heading.style.marginBottom = '1rem';
        heading.style.fontSize = '1.125rem';
        heading.style.fontWeight = '600';
        listContainer.appendChild(heading);

        const progress = createElement('p');
        progress.id = 'word-search-progress';
        progress.textContent = `${this.foundWords.size} / ${this.words.length} found`;
        progress.style.marginBottom = '1rem';
        progress.style.color = '#6b7280';
        progress.style.fontSize = '0.875rem';
        listContainer.appendChild(progress);

        const list = createElement('ul');
        list.style.listStyle = 'none';
        list.style.padding = '0';
        list.style.margin = '0';

        this.words.forEach(wordObj => {
            // Remove spaces for display consistency
            const word = wordObj.word.toUpperCase().replace(/\s+/g, '');
            const item = createElement('li');
            item.style.padding = '0.5rem';
            item.style.marginBottom = '0.25rem';
            item.style.borderRadius = '0.25rem';
            item.style.fontSize = '0.875rem';
            item.style.fontWeight = '500';
            item.dataset.word = word;

            if (this.foundWords.has(word)) {
                item.style.textDecoration = 'line-through';
                item.style.color = '#10b981';
                item.textContent = `✓ ${word}`;
            } else {
                item.style.color = '#374151';
                item.textContent = word;
            }

            list.appendChild(item);
        });

        listContainer.appendChild(list);
        return listContainer;
    }

    renderGrid() {
        const gridContainer = createElement('div', 'word-search-grid-container');
        gridContainer.style.flex = '1';

        const grid = createElement('div', 'word-search-grid');
        grid.style.display = 'grid';
        grid.style.gridTemplateColumns = `repeat(${this.gridSize}, 1fr)`;
        grid.style.gap = '2px';
        grid.style.background = '#e5e7eb';
        grid.style.padding = '2px';
        grid.style.borderRadius = '0.5rem';
        grid.style.userSelect = 'none';

        for (let r = 0; r < this.gridSize; r++) {
            for (let c = 0; c < this.gridSize; c++) {
                const cell = createElement('div', 'word-search-cell');
                // Safeguard: ensure cell always has content
                const cellContent = this.grid[r][c] || 'X';
                cell.textContent = cellContent;
                cell.dataset.row = r;
                cell.dataset.col = c;
                cell.style.background = '#0f172a';
                cell.style.color = '#f8fafc';
                cell.style.display = 'flex';
                cell.style.alignItems = 'center';
                cell.style.justifyContent = 'center';
                cell.style.aspectRatio = '1';
                cell.style.fontWeight = '600';
                cell.style.fontSize = '0.875rem';
                cell.style.cursor = 'pointer';
                cell.style.transition = 'all 0.15s';

                // Mouse events
                cell.addEventListener('mousedown', (e) => this.handleMouseDown(e, r, c));
                cell.addEventListener('mouseenter', () => this.handleMouseEnter(r, c));
                cell.addEventListener('mouseup', () => this.handleMouseUp());

                grid.appendChild(cell);
            }
        }

        // Global mouse up (in case mouse leaves grid)
        document.addEventListener('mouseup', () => this.handleMouseUp());

        gridContainer.appendChild(grid);
        return gridContainer;
    }

    handleMouseDown(e, row, col) {
        e.preventDefault();
        this.isSelecting = true;
        this.selectedCells = [{ row, col }];
        this.updateCellSelection();
    }

    handleMouseEnter(row, col) {
        if (!this.isSelecting) return;

        const last = this.selectedCells[this.selectedCells.length - 1];

        // Check if continuing in same direction or starting new selection
        if (this.selectedCells.length === 1 || this.isInLine(this.selectedCells[0], last, row, col)) {
            // Only add if not already in selection
            if (!this.selectedCells.some(c => c.row === row && c.col === col)) {
                this.selectedCells.push({ row, col });
                this.updateCellSelection();
            }
        }
    }

    isInLine(start, current, newRow, newCol) {
        // Check if new cell continues the line from start through current
        if (this.selectedCells.length === 1) return true; // Any direction is fine for second cell

        const dr = Math.sign(current.row - start.row);
        const dc = Math.sign(current.col - start.col);
        const expectedRow = current.row + dr;
        const expectedCol = current.col + dc;

        return newRow === expectedRow && newCol === expectedCol;
    }

    updateCellSelection() {
        // Clear previous selection highlighting
        const allCells = document.querySelectorAll('.word-search-cell');
        allCells.forEach(cell => {
            if (!cell.classList.contains('found')) {
                cell.style.background = '#0f172a';
                cell.style.color = '#f8fafc';
            }
        });

        // Highlight currently selected cells
        this.selectedCells.forEach(({ row, col }) => {
            const cell = document.querySelector(`.word-search-cell[data-row="${row}"][data-col="${col}"]`);
            if (cell && !cell.classList.contains('found')) {
                cell.style.background = '#dbeafe';
                cell.style.color = '#0f172a';
            }
        });
    }

    handleMouseUp() {
        if (!this.isSelecting) return;

        this.isSelecting = false;

        // Get selected word
        const selectedWord = this.selectedCells
            .map(({ row, col }) => this.grid[row][col])
            .join('');

        // Check if it matches any word (forward or backward)
        const reverseWord = selectedWord.split('').reverse().join('');

        let matchedWord = null;
        for (const wordPos of this.wordPositions) {
            if (wordPos.word === selectedWord || wordPos.word === reverseWord) {
                matchedWord = wordPos;
                break;
            }
        }

        if (matchedWord && !this.foundWords.has(matchedWord.word)) {
            this.foundWords.add(matchedWord.word);
            this.markWordAsFound(matchedWord);
            this.updateWordList();

            // Save state after finding word
            this.saveState();

            if (this.onProgress) {
                this.onProgress(this.getScore());
            }
        } else {
            // Clear selection if not a valid word
            this.updateCellSelection();
        }

        this.selectedCells = [];
    }

    markWordAsFound(wordPos) {
        wordPos.positions.forEach(({ row, col }) => {
            const cell = document.querySelector(`.word-search-cell[data-row="${row}"][data-col="${col}"]`);
            if (cell) {
                cell.classList.add('found');
                cell.style.background = '#d1fae5';
                cell.style.color = '#0f172a';
            }
        });
    }

    updateWordList() {
        const wordListContainer = document.querySelector('.word-list-container');
        if (wordListContainer) {
            const newWordList = this.renderWordList();
            wordListContainer.parentNode.replaceChild(newWordList, wordListContainer);
        }
    }

    getScore() {
        const percentage = Math.round((this.foundWords.size / this.words.length) * 100);
        const isComplete = this.foundWords.size === this.words.length;
        
        // Show replay button when complete
        if (isComplete && !this.container.querySelector('#replay-wordsearch')) {
            setTimeout(() => this.showCompletionOverlay(), 500);
        }
        
        return {
            score: percentage,
            details: `Found ${this.foundWords.size} of ${this.words.length} words`,
            isComplete
        };
    }
    
    showCompletionOverlay() {
        const overlay = document.createElement('div');
        overlay.className = 'completion-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0,0,0,0.8);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
        `;
        overlay.innerHTML = `
            <div class="completion-screen" style="background: var(--card-bg, #1e293b); padding: 2rem; border-radius: 1rem; text-align: center;">
                <h2>🎉 All Words Found!</h2>
                <p>You found all ${this.words.length} words!</p>
                <button id="replay-wordsearch" class="btn primary-btn" style="margin-top: 1rem;">🔄 Play Again</button>
                <button id="close-wordsearch" class="btn secondary-btn" style="margin-top: 0.5rem; margin-left: 0.5rem;">Close</button>
            </div>
        `;
        
        document.body.appendChild(overlay);
        
        overlay.querySelector('#replay-wordsearch').addEventListener('click', () => {
            document.body.removeChild(overlay);
            this.restart();
        });
        
        overlay.querySelector('#close-wordsearch').addEventListener('click', () => {
            document.body.removeChild(overlay);
        });
    }
    
    restart() {
        // Clear saved state
        const key = `word_search_state_${this.vocabID}`;
        localStorage.removeItem(key);
        
        // Reset game state
        this.grid = [];
        this.wordPositions = [];
        this.foundWords = new Set();
        this.isSelecting = false;
        this.selectedCells = [];
        
        // Generate new grid
        this.generateGrid();
        
        // Notify progress system of new session
        if (this.onProgress) {
            this.onProgress({ score: 0, details: 'Found 0 of ' + this.words.length + ' words', isComplete: false, isReplay: true });
        }
        
        this.render();
    }
}

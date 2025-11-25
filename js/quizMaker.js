import { $, createElement } from './main.js';

export class QuizMaker {
    constructor(vocabSet, onClose) {
        this.vocabSet = vocabSet;
        this.onClose = onClose;
        this.questions = [];
        this.meta = {
            title: `${vocabSet.name || 'Quiz'}`,
            instructions: 'This is an individual summative activity. This sheet must be filled out in pen (black or blue). Follow the instructions given by the teacher, stay seated and focused on your activity at all times during this assignment.',
            schoolName: 'ACADEMIA INTERNACIONAL DE DAVID',
            showBorder: true,
            fontFamily: "'Inter', sans-serif",
            rubric: [
                { title: 'Date and Name:', desc: 'Complete Name and Date (short date) in the correct English format.', points: 2 },
                { title: 'Follows instructions:', desc: 'The student follows the assignment guidelines and teacher\'s directions.', points: 1 },
                { title: 'Content:', desc: '', points: 45 },
                { title: 'Punctuality and responsibility:', desc: 'Brings necessary implements, works hard, focuses on his workshop and submits work in time.', points: 2 }
            ],
            date: '',
            name: '',
            score: ''
        };
        this.dragSrcEl = null;

        this.init();
    }

    init() {
        this.renderEditor();
        this.attachGlobalListeners();
    }

    attachGlobalListeners() {
        $('#quiz-maker-close-btn').onclick = () => this.onClose();
        $('#quiz-maker-print-btn').onclick = () => this.printQuiz();
        const imageBtn = $('#quiz-maker-image-btn');
        if (imageBtn) {
            imageBtn.onclick = () => this.exportAsImage();
        }
        const pdfBtn = $('#quiz-maker-pdf-btn');
        if (pdfBtn) {
            pdfBtn.onclick = () => this.exportAsPDF();
        }

        // Generate Questions Button
        $('#generate-questions-btn').onclick = () => {
            const counts = {
                mc: parseInt($('#mc-count').value) || 0,
                tf: parseInt($('#tf-count').value) || 0,
                matching: parseInt($('#match-count').value) || 0,
                short: parseInt($('#short-count').value) || 0,
                synonym: parseInt($('#synonym-count').value) || 0,
                wordsearch: parseInt($('#wordsearch-count').value) || 0,
                crossword: parseInt($('#crossword-count').value) || 0
            };

            this.typePoints = {
                mc: parseInt($('#mc-points').value) || 1,
                tf: parseInt($('#tf-points').value) || 1,
                matching: parseInt($('#match-points').value) || 1,
                short: parseInt($('#short-points').value) || 1,
                synonym: parseInt($('#synonym-points').value) || 1,
                wordsearch: parseInt($('#wordsearch-points').value) || 1,
                crossword: parseInt($('#crossword-points').value) || 1
            };

            this.typeOrder = {};
            this.typeOrderList.forEach((type, idx) => {
                this.typeOrder[type] = idx + 1;
            });

            // Clear existing questions
            this.questions = [];

            // Add questions for each type (only if count > 0)
            Object.entries(counts).forEach(([type, count]) => {
                if (count > 0) {
                    this.addQuestions(type, count, this.typePoints[type]);
                }
            });

            // Sort questions by chosen order
            this.questions.sort((a, b) => {
                const orderA = this.typeOrder[a.type === 'matching_section' ? 'matching' : a.type] || 99;
                const orderB = this.typeOrder[b.type === 'matching_section' ? 'matching' : b.type] || 99;
                return orderA - orderB;
            });
            this.renderEditor();
        };

        // Meta inputs
        $('#quiz-title-input').value = this.meta.title;
        $('#quiz-title-input').oninput = (e) => this.meta.title = e.target.value;

        $('#quiz-instructions-input').value = this.meta.instructions || 'This is an individual summative activity. This sheet must be filled out in pen (black or blue). Follow the instructions given by the teacher, stay seated and focused on your activity at all times during this assignment.';
        $('#quiz-instructions-input').oninput = (e) => this.meta.instructions = e.target.value;

        // New Settings
        $('#quiz-school-input').value = this.meta.schoolName;
        $('#quiz-school-input').oninput = (e) => this.meta.schoolName = e.target.value;

        $('#quiz-border-toggle').checked = this.meta.showBorder;
        $('#quiz-border-toggle').onchange = (e) => this.meta.showBorder = e.target.checked;

        $('#quiz-font-select').value = this.meta.fontFamily;
        $('#quiz-font-select').onchange = (e) => this.meta.fontFamily = e.target.value;

        $('#edit-rubric-btn').onclick = () => this.editRubric();

        // Order handling
        this.typeOrderList = ['mc','tf','matching','short','synonym','wordsearch','crossword'];

        const updateOrderUI = () => {
            const container = document.getElementById('quiz-type-list');
            if (container) {
                this.typeOrderList.forEach(type => {
                    const row = document.querySelector(`.quiz-row[data-type="${type}"]`);
                    if (row) container.appendChild(row);
                });
            }
        };

        document.querySelectorAll('.order-up').forEach(btn => {
            btn.onclick = () => {
                const type = btn.dataset.type;
                const idx = this.typeOrderList.indexOf(type);
                if (idx > 0) {
                    [this.typeOrderList[idx - 1], this.typeOrderList[idx]] = [this.typeOrderList[idx], this.typeOrderList[idx - 1]];
                    updateOrderUI();
                }
            };
        });

        document.querySelectorAll('.order-down').forEach(btn => {
            btn.onclick = () => {
                const type = btn.dataset.type;
                const idx = this.typeOrderList.indexOf(type);
                if (idx >= 0 && idx < this.typeOrderList.length - 1) {
                    [this.typeOrderList[idx], this.typeOrderList[idx + 1]] = [this.typeOrderList[idx + 1], this.typeOrderList[idx]];
                    updateOrderUI();
                }
            };
        });

        updateOrderUI();
    }

    async exportAsImage() {
        const target = $('#quiz-questions-list');
        if (!target) {
            alert('Preview not ready to export.');
            return;
        }
        if (typeof html2canvas === 'undefined') {
            alert('html2canvas not loaded.');
            return;
        }

        const pages = Array.from(target.querySelectorAll('.document-page')).filter(Boolean);
        if (pages.length === 0) {
            alert('No pages to export.');
            return;
        }

        const captures = [];
        for (const page of pages) {
            const clone = page.cloneNode(true);
            clone.style.background = '#fff';
            clone.style.padding = '1in';
            clone.style.width = '8.5in';
            clone.style.minHeight = '11in';
            clone.style.boxSizing = 'border-box';
            clone.style.position = 'absolute';
            clone.style.left = '-9999px';
            document.body.appendChild(clone);

            try {
                const canvas = await html2canvas(clone, {
                    scale: 2,
                    backgroundColor: '#ffffff',
                    width: clone.offsetWidth,
                    height: clone.offsetHeight,
                    useCORS: true
                });
                captures.push(canvas.toDataURL('image/png'));
            } catch (err) {
                console.error('Export image failed:', err);
                alert('Could not export image.');
            } finally {
                document.body.removeChild(clone);
            }
        }

        if (!captures.length) return;

        // Show preview overlay with pagination and download
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position:fixed; inset:0; background:rgba(0,0,0,0.55);
            display:flex; align-items:center; justify-content:center;
            z-index:10000; padding:2rem; box-sizing:border-box;
        `;

        const pagesHtml = captures.map((src, idx) => `
            <div class="image-page" data-idx="${idx}" style="display:${idx === 0 ? 'block' : 'none'};">
                <img src="${src}" alt="Quiz page ${idx + 1}" style="max-width:100%; height:auto; display:block; margin:0 auto;">
                <div style="text-align:center; margin-top:0.5rem; color:#555;">Page ${idx + 1} of ${captures.length}</div>
            </div>
        `).join('');

        overlay.innerHTML = `
            <div style="background:#fff; width:90vw; max-width:1000px; max-height:90vh; padding:1rem; border-radius:10px; box-shadow:0 10px 40px rgba(0,0,0,0.3); display:flex; flex-direction:column; gap:0.75rem;">
                <div style="display:flex; justify-content:space-between; align-items:center; gap:1rem;">
                    <strong>Image Preview</strong>
                    <div style="display:flex; gap:0.5rem; align-items:center;">
                        <button id="quiz-image-prev" class="btn secondary-btn" style="padding:0.3rem 0.75rem;">Prev</button>
                        <button id="quiz-image-next" class="btn secondary-btn" style="padding:0.3rem 0.75rem;">Next</button>
                        <button id="quiz-image-download" class="btn primary-btn">Download PNGs</button>
                        <button id="quiz-image-close" class="btn text-btn">Close</button>
                    </div>
                </div>
                <div id="quiz-image-pages" style="overflow:auto; max-height:75vh; text-align:center;">
                    ${pagesHtml}
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        const pageEls = Array.from(overlay.querySelectorAll('.image-page'));
        let current = 0;
        const showPage = (idx) => {
            pageEls.forEach((p, i) => p.style.display = i === idx ? 'block' : 'none');
        };

        overlay.querySelector('#quiz-image-prev').onclick = () => {
            current = (current - 1 + pageEls.length) % pageEls.length;
            showPage(current);
        };
        overlay.querySelector('#quiz-image-next').onclick = () => {
            current = (current + 1) % pageEls.length;
            showPage(current);
        };
        overlay.querySelector('#quiz-image-close').onclick = () => overlay.remove();
        overlay.querySelector('#quiz-image-download').onclick = () => {
            captures.forEach((src, idx) => {
                const link = document.createElement('a');
                link.href = src;
                link.download = `${this.meta.title || 'quiz'}-page-${idx + 1}.png`;
                link.click();
            });
        };

        showPage(0);
    }

    async exportAsPDF() {
        const target = $('#quiz-questions-list');
        if (!target) {
            alert('Preview not ready to export.');
            return;
        }
        if (typeof html2canvas === 'undefined') {
            alert('html2canvas not loaded.');
            return;
        }

        const pages = Array.from(target.querySelectorAll('.document-page')).filter(Boolean);
        if (pages.length === 0) {
            alert('No pages to export.');
            return;
        }

        const pageImages = [];
        for (const page of pages) {
            const clone = page.cloneNode(true);
            clone.style.background = '#fff';
            clone.style.padding = '1in';
            clone.style.width = '8.5in';
            clone.style.minHeight = '11in';
            clone.style.boxSizing = 'border-box';
            clone.style.position = 'absolute';
            clone.style.left = '-9999px';
            document.body.appendChild(clone);

            try {
                const canvas = await html2canvas(clone, {
                    scale: 2,
                    backgroundColor: '#ffffff',
                    width: clone.offsetWidth,
                    height: clone.offsetHeight,
                    useCORS: true
                });
                pageImages.push(canvas.toDataURL('image/jpeg', 0.95));
            } catch (err) {
                console.error('Export PDF failed:', err);
                alert('Could not export PDF.');
            } finally {
                document.body.removeChild(clone);
            }
        }

        if (!pageImages.length) return;

        // Build a simple PDF using window.print in a new window with pages as imgs
        const pdfWindow = window.open('', '_blank');
        const title = this.meta.title || 'quiz';
        pdfWindow.document.write(`
            <html>
                <head>
                    <title>${title}</title>
                    <style>
                        @page { size: 8.5in 11in; margin: 0; }
                        body { margin:0; padding:0; }
                        .page { width:8.5in; height:11in; display:flex; align-items:center; justify-content:center; page-break-after: always; }
                        img { width:100%; height:auto; }
                    </style>
                </head>
                <body>
                    ${pageImages.map(src => `<div class="page"><img src="${src}"></div>`).join('')}
                </body>
            </html>
        `);
        pdfWindow.document.close();
        pdfWindow.focus();
        setTimeout(() => pdfWindow.print(), 400);
    }

    editRubric() {
        // Simple prompt based editing for now, or a small modal overlay
        // Let's use a simple prompt loop for MVP or a small custom dialog
        // For better UX, let's inject a small modal into the DOM temporarily
        const modalHtml = `
            <div id="rubric-modal" style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); display:flex; align-items:center; justify-content:center; z-index:1000;">
                <div style="background:white; padding:2rem; border-radius:8px; width:400px; max-width:90%;">
                    <h3>Edit Rubric</h3>
                    <div id="rubric-rows" style="margin-bottom:1rem;">
                    <div id="rubric-rows" style="margin-bottom:1rem; max-height:300px; overflow-y:auto;">
                        ${this.meta.rubric.map((r, i) => `
                            <div class="rubric-row-edit" style="display:flex; flex-direction:column; gap:0.2rem; margin-bottom:0.8rem; border-bottom:1px solid #eee; padding-bottom:0.5rem;">
                                <div style="display:flex; gap:0.5rem;">
                                    <input type="text" value="${r.title}" class="r-title" placeholder="Title" style="flex:2; padding:0.3rem; font-weight:bold;">
                                    <input type="number" value="${r.points}" class="r-points" placeholder="Pts" style="width:60px; padding:0.3rem;">
                                </div>
                                <textarea class="r-desc" placeholder="Description" rows="2" style="width:100%; padding:0.3rem; font-size:0.9rem;">${r.desc || ''}</textarea>
                            </div>
                        `).join('')}
                    </div>
                    <div style="display:flex; justify-content:flex-end; gap:0.5rem;">
                        <button id="close-rubric-btn" class="btn text-btn">Cancel</button>
                        <button id="save-rubric-btn" class="btn primary-btn">Save</button>
                    </div>
                </div>
            </div>
        `;
        const el = createElement('div');
        el.innerHTML = modalHtml;
        document.body.appendChild(el);

        el.querySelector('#close-rubric-btn').onclick = () => el.remove();
        el.querySelector('#save-rubric-btn').onclick = () => {
            const rows = el.querySelectorAll('.rubric-row-edit');
            const newRubric = [];
            rows.forEach(row => {
                const title = row.querySelector('.r-title').value;
                const desc = row.querySelector('.r-desc').value;
                const points = parseInt(row.querySelector('.r-points').value) || 0;
                if (title.trim()) {
                    newRubric.push({ title, desc, points });
                }
            });
            this.meta.rubric = newRubric;
            el.remove();
            this.renderEditor(); // Re-render to show changes
        };
    }

    addQuestions(type, count, basePoints = 1) {
        const newQuestions = this.generateQuestions(type, count, basePoints);
        this.questions = [...this.questions, ...newQuestions];
    }

    generateQuestions(type, count, basePoints = 1) {
        const words = this.vocabSet.words.filter(w => w.word && w.definition);
        if (words.length === 0) {
            alert('No valid words in this vocabulary set.');
            return [];
        }

        const generated = [];
        for (let i = 0; i < count; i++) {
            const w = words[Math.floor(Math.random() * words.length)];
            const id = Date.now() + Math.random().toString(36).substr(2, 9);

            let q = { id, type, points: basePoints };

            if (type === 'mc') {
                const distractors = this.getDistractors(w, words, 3);
                const options = this.shuffle([w.word, ...distractors]);
                q.prompt = w.definition;
                q.options = options;
                q.answer = w.word;
                q.points = basePoints;
            } else if (type === 'tf') {
                const isTrue = Math.random() > 0.5;
                let text = `${w.word} means "${w.definition}".`;
                if (!isTrue) {
                    const wrong = this.getDistractors(w, words, 1)[0];
                    text = `${w.word} means "${wrong}".`; // wrong is just the word string from getDistractors? No, need definition.
                    // Fix getDistractors to return objects or handle this better.
                    // Let's redo getDistractors to return word objects.
                    const wrongWord = words.find(o => o.word !== w.word) || w;
                    text = `${w.word} means "${wrongWord.definition}".`;
                }
                q.prompt = text;
                q.answer = isTrue ? 'True' : 'False';
                q.points = basePoints;
            } else if (type === 'matching') {
                // Matching Section logic
                // We create ONE question object that contains multiple pairs
                // But the loop above creates 'count' questions. 
                // We should break the loop if type is matching and just create one section with 'count' pairs.

                const pairs = [];
                // Get 'count' random words
                const selectedWords = this.shuffle(words).slice(0, count);
                selectedWords.forEach(w => {
                    pairs.push({ term: w.word, def: w.definition });
                });

                q = {
                    id,
                    type: 'matching_section',
                    points: basePoints || count, // use configured points or number of pairs
                    pairs: pairs,
                    prompt: 'Match the terms with their definitions.'
                };

                generated.push(q);
                break; // Exit loop since we created the section
            } else if (type === 'short') {
                q.prompt = `Describe the meaning of "${w.word}" in your own words.`;
                q.answer = w.definition;
                q.points = basePoints;
            } else if (type === 'synonym') {
                // Synonym/Antonym MC question
                const isSynonym = Math.random() > 0.5;
                const distractors = this.getDistractors(w, words, 3);
                const options = this.shuffle([w.word, ...distractors]);
                q.prompt = isSynonym ?
                    `Which word is a SYNONYM (similar meaning) of "${w.definition}"?` :
                    `Which word is an ANTONYM (opposite meaning) of "${w.definition}"?`;
                q.options = options;
                q.answer = w.word;
                q.type = 'synonym'; // Render like MC but keep its own section
                q.points = basePoints;
            } else if (type === 'wordsearch') {
                // Word Search - create one puzzle with multiple words
                const selectedWords = this.shuffle(words).slice(0, Math.min(15, words.length));
                const wordList = selectedWords.map(w => w.word);
                const puzzleData = this.generateWordSearchGrid(wordList, 15);

                q = {
                    id,
                    type: 'wordsearch',
                    points: 10,
                    grid: puzzleData.grid,
                    words: puzzleData.words,
                    prompt: 'Find all the vocabulary words in the word search below.'
                };
                generated.push(q);
                break; // Only create one word search
            } else if (type === 'crossword') {
                // Crossword - create one puzzle with multiple words
                const selectedWords = this.shuffle(words).slice(0, Math.min(10, words.length));
                const wordData = selectedWords.map(w => ({ word: w.word, clue: w.definition }));
                const puzzleData = this.generateCrosswordLayout(wordData, 15);

                q = {
                    id,
                    type: 'crossword',
                    points: 10,
                    grid: puzzleData.grid,
                    clues: puzzleData.clues,
                    prompt: 'Complete the crossword puzzle using the clues provided.'
                };
                generated.push(q);
                break; // Only create one crossword
            }

            generated.push(q);
        }
        return generated;
    }

    generateWordSearchGrid(words, size = 15) {
        // Create empty grid
        const grid = Array(size).fill(null).map(() => Array(size).fill(''));
        const placedWords = [];

        // Directions: right, down, diagonal-down-right
        const directions = [
            { dx: 1, dy: 0 },   // horizontal
            { dx: 0, dy: 1 },   // vertical
            { dx: 1, dy: 1 },   // diagonal
        ];

        // Try to place each word
        words.forEach(word => {
            const upperWord = word.toUpperCase();
            let placed = false;
            let attempts = 0;

            while (!placed && attempts < 50) {
                attempts++;
                const dir = directions[Math.floor(Math.random() * directions.length)];
                const startX = Math.floor(Math.random() * size);
                const startY = Math.floor(Math.random() * size);

                // Check if word fits
                let fits = true;
                for (let i = 0; i < upperWord.length; i++) {
                    const x = startX + dir.dx * i;
                    const y = startY + dir.dy * i;

                    if (x >= size || y >= size || (grid[y][x] !== '' && grid[y][x] !== upperWord[i])) {
                        fits = false;
                        break;
                    }
                }

                // Place word if it fits
                if (fits) {
                    for (let i = 0; i < upperWord.length; i++) {
                        const x = startX + dir.dx * i;
                        const y = startY + dir.dy * i;
                        grid[y][x] = upperWord[i];
                    }
                    placedWords.push(word);
                    placed = true;
                }
            }
        });

        // Fill empty cells with random letters
        const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                if (grid[y][x] === '') {
                    grid[y][x] = letters[Math.floor(Math.random() * letters.length)];
                }
            }
        }

        return { grid, words: placedWords };
    }

    generateCrosswordLayout(wordData, size = 15) {
        // Simple crossword layout - place words in a grid pattern
        const grid = Array(size).fill(null).map(() => Array(size).fill(null));
        const clues = { across: [], down: [] };
        let clueNumber = 1;

        // Sort words by length (longest first)
        const sorted = wordData.sort((a, b) => b.word.length - a.word.length);

        // Place first word horizontally in the middle
        if (sorted.length > 0) {
            const firstWord = sorted[0].word.toUpperCase();
            const startY = Math.floor(size / 2);
            const startX = Math.floor((size - firstWord.length) / 2);

            for (let i = 0; i < firstWord.length; i++) {
                grid[startY][startX + i] = { letter: firstWord[i], number: i === 0 ? clueNumber : null };
            }
            clues.across.push({ number: clueNumber, clue: sorted[0].clue, answer: sorted[0].word });
            clueNumber++;
        }

        // Try to place remaining words
        for (let i = 1; i < Math.min(sorted.length, 8); i++) {
            const word = sorted[i].word.toUpperCase();
            const isHorizontal = i % 2 === 0;
            let placed = false;

            // Try to find intersection point
            for (let y = 1; y < size - 1 && !placed; y++) {
                for (let x = 1; x < size - 1 && !placed; x++) {
                    if (grid[y][x] && grid[y][x].letter) {
                        const letter = grid[y][x].letter;
                        const letterIndex = word.indexOf(letter);

                        if (letterIndex >= 0) {
                            // Try to place word through this intersection
                            let fits = true;
                            const positions = [];

                            if (isHorizontal) {
                                const startX = x - letterIndex;
                                if (startX >= 0 && startX + word.length <= size) {
                                    for (let j = 0; j < word.length; j++) {
                                        const cell = grid[y][startX + j];
                                        if (cell && cell.letter && cell.letter !== word[j]) {
                                            fits = false;
                                            break;
                                        }
                                        positions.push({ x: startX + j, y });
                                    }

                                    if (fits) {
                                        positions.forEach((pos, idx) => {
                                            grid[pos.y][pos.x] = {
                                                letter: word[idx],
                                                number: idx === 0 ? clueNumber : (grid[pos.y][pos.x]?.number || null)
                                            };
                                        });
                                        clues.across.push({ number: clueNumber, clue: sorted[i].clue, answer: sorted[i].word });
                                        clueNumber++;
                                        placed = true;
                                    }
                                }
                            } else {
                                const startY = y - letterIndex;
                                if (startY >= 0 && startY + word.length <= size) {
                                    for (let j = 0; j < word.length; j++) {
                                        const cell = grid[startY + j][x];
                                        if (cell && cell.letter && cell.letter !== word[j]) {
                                            fits = false;
                                            break;
                                        }
                                        positions.push({ x, y: startY + j });
                                    }

                                    if (fits) {
                                        positions.forEach((pos, idx) => {
                                            grid[pos.y][pos.x] = {
                                                letter: word[idx],
                                                number: idx === 0 ? clueNumber : (grid[pos.y][pos.x]?.number || null)
                                            };
                                        });
                                        clues.down.push({ number: clueNumber, clue: sorted[i].clue, answer: sorted[i].word });
                                        clueNumber++;
                                        placed = true;
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        return { grid, clues };
    }

    getDistractors(targetWord, allWords, count) {
        const others = allWords.filter(w => w.word !== targetWord.word);
        const shuffled = this.shuffle(others);
        return shuffled.slice(0, count).map(w => w.word);
    }

    shuffle(array) {
        return array.sort(() => Math.random() - 0.5);
    }

    renderEditor() {
        const container = $('#quiz-questions-list');
        container.innerHTML = '';

        // Auto-scale preview
        const parentWidth = container.parentElement.offsetWidth;
        const docWidth = 816; // 8.5in
        if (parentWidth < docWidth) {
            const scale = (parentWidth - 40) / docWidth;
            container.style.setProperty('--preview-scale', scale);
        } else {
            container.style.setProperty('--preview-scale', 1);
        }

        // Helper to create a new page
        const createPage = (pageIndex) => {
            const page = createElement('div', 'document-page');
            page.id = `page-${pageIndex}`;
            if (pageIndex > 0) page.style.pageBreakBefore = 'always';
            container.appendChild(page);
            return page;
        };

        let currentPageIndex = 0;
        let currentPage = createPage(currentPageIndex);

        // Helper to append and check overflow
        const appendToPage = (element) => {
            currentPage.appendChild(element);

            // Check overflow (threshold ~960px for 10in usable height)
            const contentHeight = Array.from(currentPage.children).reduce((acc, child) => {
                const style = window.getComputedStyle(child);
                return acc + child.offsetHeight + parseInt(style.marginTop) + parseInt(style.marginBottom);
            }, 0);

            if (contentHeight > 980) {
                currentPage.removeChild(element);
                currentPageIndex++;
                currentPage = createPage(currentPageIndex);
                currentPage.appendChild(element);
            }
        };

        // 1. Header
        const header = createElement('div', 'band');
        header.innerHTML = `
            <div class="logo">
                <img src="logo.jpeg" alt="Logo">
            </div>
            <div>
                <h3>${this.meta.schoolName}</h3>
                <h3>${this.meta.title}</h3>
                <div class="meta">
                    Teacher: <span contenteditable="true" class="editable-field" id="teacher-name-field">${this.meta.teacherName || 'Porfirio Rios'}</span> 
                    • Grade: ${this.vocabSet.grade || 'N/A'}
                </div>
            </div>
            <div class="grade-note"></div>
        `;
        appendToPage(header);

        // Add listener for teacher name edit
        const teacherNameField = header.querySelector('#teacher-name-field');
        if (teacherNameField) {
            teacherNameField.addEventListener('blur', (e) => {
                this.meta.teacherName = e.target.textContent;
            });
        }

        // 2. Instructions
        if (this.meta.instructions) {
            const instr = createElement('div', 'doc-instructions');
            instr.innerHTML = `<h4>Instructions:</h4><p>${this.meta.instructions}</p>`;
            appendToPage(instr);
        }

        // 3. Student Info
        const infoRow = createElement('div', 'doc-info-row');
        infoRow.innerHTML = `
            <div class="doc-info-pill"><span class="doc-info-label">Name:</span></div>
            <div class="doc-info-pill"><span class="doc-info-label">Date:</span></div>
            <div class="doc-info-pill"><span class="doc-info-label">Grade:</span></div>
        `;
        appendToPage(infoRow);

        // 4. Rubric
        if (this.meta.rubric && this.meta.rubric.length > 0) {
            const rubricContainer = createElement('div', 'doc-rubric-grid');
            let rubricHTML = '';
            this.meta.rubric.forEach(r => {
                rubricHTML += `
                    <div class="doc-rubric-item">
                        <div class="rubric-title">${r.title}</div>
                        <div class="rubric-desc">${r.desc} <span class="rubric-pts">${r.points} pts</span></div>
                    </div>
                `;
            });
            const rubricTotal = this.meta.rubric.reduce((a, b) => a + b.points, 0);
            rubricHTML += `
                <div class="doc-rubric-total">
                    Total points. ${rubricTotal} pts.
                </div>
            `;
            rubricContainer.innerHTML = rubricHTML;
            appendToPage(rubricContainer);
        }

        // 5. Questions - Group by type and add section headers
        const questionsByType = this.groupQuestionsByType();
        let partNumber = 1;

        questionsByType.forEach(section => {
            // Group header + content together; force new page for puzzles
            const sectionContainer = createElement('div', 'section-container');
            sectionContainer.style.cssText = `page-break-inside: avoid; break-inside: avoid;`;
            if (section.type === 'wordsearch' || section.type === 'crossword') {
                sectionContainer.style.pageBreakBefore = 'always';
                sectionContainer.style.breakBefore = 'page';
            }

            // Add section header
            const sectionHeader = createElement('div', 'section-header');
            sectionHeader.style.cssText = `margin: 2rem 0 1rem 0; page-break-inside: avoid;`;
            sectionHeader.innerHTML = `
                <h3 style="margin: 0 0 0.5rem 0; font-size: 1rem; font-weight: bold;">Part ${partNumber}: ${section.title}</h3>
                <p style="margin: 0; font-size: 1rem; font-style: italic;">${section.instructions}</p>
            `;
            sectionContainer.appendChild(sectionHeader);
            partNumber++;

            // Add questions in this section
            section.questions.forEach((q, sectionIndex) => {
                const globalIndex = this.questions.indexOf(q);
                const qCard = this.renderQuestionCard(q, sectionIndex + 1); // Use 1-based section numbering
                qCard.classList.add('doc-q-card');
                qCard.dataset.globalIndex = globalIndex; // Store global index for drag/drop
                // Re-attach drag events
                qCard.draggable = true;
                qCard.addEventListener('dragstart', (e) => this.handleDragStart(e, globalIndex));
                qCard.addEventListener('dragover', this.handleDragOver.bind(this));
                qCard.addEventListener('drop', (e) => this.handleDrop(e, globalIndex));
                qCard.addEventListener('dragend', this.handleDragEnd.bind(this));
                qCard.style.pageBreakInside = 'avoid';
                sectionContainer.appendChild(qCard);
            });

            appendToPage(sectionContainer);
        });

        this.updateTotalPoints();
    }

    groupQuestionsByType() {
        const sections = [];
        const typeMap = {
            'mc': { title: 'Multiple Choice', instructions: 'Choose the best answer for each question.' },
            'tf': { title: 'True or False', instructions: 'Indicate whether the statement is true or false by writing T for True or F for False.' },
            'matching_section': { title: 'Matching', instructions: 'Match each term with its correct definition.' },
            'short': { title: 'Short Answer', instructions: 'Answer each question in complete sentences.' },
            'synonym': { title: 'Synonyms & Antonyms', instructions: 'Choose the synonym or antonym that best fits.' },
            'wordsearch': { title: 'Word Search', instructions: 'Find all the vocabulary words in the grid.' },
            'crossword': { title: 'Crossword Puzzle', instructions: 'Complete the crossword using the clues provided.' }
        };

        // Group consecutive questions of the same type
        let currentType = null;
        let currentSection = null;

        this.questions.forEach(q => {
            const qType = q.type;
            if (qType !== currentType) {
                if (currentSection) {
                    sections.push(currentSection);
                }
                currentType = qType;
                currentSection = {
                    type: qType,
                    title: typeMap[qType]?.title || 'Questions',
                    instructions: typeMap[qType]?.instructions || 'Answer the following questions.',
                    questions: [q]
                };
            } else {
                currentSection.questions.push(q);
            }
        });

        if (currentSection) {
            sections.push(currentSection);
        }

        return sections;
    }

    updateTotalPoints() {
        // Calculate total from questions
        const questionsTotal = this.questions.reduce((a, b) => a + b.points, 0);

        // Find and update the "Content" rubric item to match questions total
        const contentRubricItem = this.meta.rubric.find(r => r.title.toLowerCase().includes('content'));
        if (contentRubricItem) {
            contentRubricItem.points = questionsTotal;
        }

        // Calculate grand total from all rubric items (which now includes updated content)
        const grandTotal = this.meta.rubric.reduce((a, b) => a + b.points, 0);

        // Update the rubric total display in the document
        const rubricTotalElement = document.querySelector('.doc-rubric-total');
        if (rubricTotalElement) {
            rubricTotalElement.textContent = `Total points. ${grandTotal} pts.`;
        }

        // Update the content rubric item display if it exists
        const rubricItems = document.querySelectorAll('.doc-rubric-item');
        rubricItems.forEach(item => {
            const titleElement = item.querySelector('.rubric-title');
            if (titleElement && titleElement.textContent.toLowerCase().includes('content')) {
                const ptsElement = item.querySelector('.rubric-pts');
                if (ptsElement) {
                    ptsElement.textContent = `${questionsTotal} pts`;
                }
            }
        });
    }

    renderQuestionsList() {
        // Redundant in doc view
    }

    renderQuestionCard(q, index) {
        const card = createElement('div', 'doc-q-card');
        const pts = q.points !== undefined ? `(${q.points} pts)` : '';

        const renderMC = () => `
            <div class="q-prompt"><strong>${index}.</strong> ${q.prompt} ${pts}</div>
            <div class="q-options" style="margin-left: 1.5rem;">
                ${q.options.map((opt, i) => `
                    <div class="q-option" style="margin-bottom: 0.35rem;">
                        <span style="display:inline-block; width:22px;">${String.fromCharCode(65 + i)}.</span> ${opt}
                    </div>
                `).join('')}
            </div>
        `;

        const renderTF = () => `
            <div class="q-prompt"><strong>${index}.</strong> ${q.prompt} ${pts}</div>
            <div style="margin-left: 1.5rem; margin-top: 0.35rem;">
                <span style="display:inline-block; border-bottom: 1px solid #000; min-width: 40px;">&nbsp;</span>
            </div>
        `;

        const renderFill = () => `
            <div class="q-prompt"><strong>${index}.</strong> ${q.prompt} ${pts}</div>
            <div style="margin-left: 1.5rem; border-bottom: 1px solid #000; min-height: 24px; margin-top: 0.5rem;"></div>
        `;

        const renderShort = () => `
            <div class="q-prompt" style="margin-bottom: 0.5rem;"><strong>${index}.</strong> ${q.prompt} ${pts}</div>
            <div style="margin-left: 1.5rem;">
                <div style="border-bottom: 1px solid #000; min-height: 80px;"></div>
            </div>
        `;

        const renderMatching = () => {
            const left = q.pairs.map((pair, i) => `<div style="margin-bottom:0.5rem;"><strong>${i + 1}.</strong> ${pair.term}</div>`).join('');
            const right = q.pairs.map((pair, i) => `<div style="margin-bottom:0.5rem;"><strong>${String.fromCharCode(65 + i)}.</strong> ${pair.def}</div>`).join('');
            return `
                <div class="q-prompt" style="margin-bottom: 0.5rem;"><strong>${index}.</strong> Matching Section ${pts}</div>
                <div style="margin-left:1.5rem; display:grid; grid-template-columns: 1fr 1fr; gap:1rem;">
                    <div class="terms">${left}</div>
                    <div class="defs">${right}</div>
                </div>
            `;
        };

        const renderWordSearch = () => `
            <div class="q-prompt" style="margin-bottom:0.5rem;"><strong>${index}.</strong> ${q.prompt || 'Find all the words'} ${pts}</div>
            <div style="margin: 1rem 0;">
                <table style="border-collapse: collapse; margin: 0 auto; width: 100%; max-width: 600px;">
                    ${q.grid.map(row => `
                        <tr>
                            ${row.map(letter => `
                                <td style="width: 6.67%; height: 32px; border: 1px solid #000; text-align: center; font-weight: bold; font-size: 16px;">
                                    ${letter}
                                </td>
                            `).join('')}
                        </tr>
                    `).join('')}
                </table>
            </div>
            <div style="margin-top: 0.5rem; font-size: 0.95rem;">
                <strong>Words to find:</strong>
                <div style="column-count: 3; column-gap: 1.5rem; margin-top: 0.35rem; line-height: 1.6;">
                    ${q.words.map(word => `<div>${word}</div>`).join('')}
                </div>
            </div>
        `;

        const renderCrossword = () => `
            <div class="q-prompt" style="margin-bottom:0.5rem;"><strong>${index}.</strong> ${q.prompt || 'Complete the crossword using the clues.'} ${pts}</div>
            <div style="margin: 1rem 0;">
                <table style="border-collapse: collapse; margin: 0 auto;">
                    ${q.grid.map(row => `
                        <tr>
                            ${row.map(cell => {
                                if (cell && cell.letter) {
                                    return `
                                        <td style="width: 30px; height: 30px; border: 1px solid #000; position: relative; background: white;">
                                            ${cell.number ? `<span style="position: absolute; top: 1px; left: 2px; font-size: 8px;">${cell.number}</span>` : ''}
                                            <div style="width: 100%; height: 100%;"></div>
                                        </td>
                                    `;
                                }
                                return `<td style="width: 30px; height: 30px; background: #e5e7eb; border: 1px solid #e5e7eb;"></td>`;
                            }).join('')}
                        </tr>
                    `).join('')}
                </table>
            </div>
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 1.25rem; margin-top: 1rem;">
                <div>
                    <h4 style="margin: 0 0 0.5rem 0;">Across</h4>
                    ${q.clues.across.map(clue => `<div style="margin-bottom:0.35rem;">${clue.number}. ${clue.clue}</div>`).join('')}
                </div>
                <div>
                    <h4 style="margin: 0 0 0.5rem 0;">Down</h4>
                    ${q.clues.down.map(clue => `<div style="margin-bottom:0.35rem;">${clue.number}. ${clue.clue}</div>`).join('')}
                </div>
            </div>
        `;

        const typeMap = {
            mc: renderMC,
            tf: renderTF,
            short: renderShort,
            synonym: renderMC,
            matching_section: renderMatching,
            wordsearch: renderWordSearch,
            crossword: renderCrossword
        };

        const renderer = typeMap[q.type] || (() => `
            <div class="q-prompt"><strong>${index}.</strong> ${q.prompt || ''} ${pts}</div>
        `);

        card.innerHTML = renderer();
        if (q.type === 'wordsearch' || q.type === 'crossword') {
            card.style.pageBreakInside = 'avoid';
        }
        return card;
    }

    handleDragStart(e) {
        this.dragSrcEl = e.target.closest('.question-card');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/html', this.dragSrcEl.innerHTML);
        this.dragSrcEl.classList.add('dragging');
    }

    handleDragOver(e) {
        if (e.preventDefault) e.preventDefault();
        return false;
    }

    handleDrop(e) {
        if (e.stopPropagation) e.stopPropagation();
        const target = e.target.closest('.question-card');
        if (this.dragSrcEl !== target) {
            const srcIdx = parseInt(this.dragSrcEl.dataset.index);
            const tgtIdx = parseInt(target.dataset.index);

            // Swap in array
            const item = this.questions.splice(srcIdx, 1)[0];
            this.questions.splice(tgtIdx, 0, item);

            this.renderQuestionsList();
            this.updateTotalPoints();
        }
        return false;
    }

    handleDragEnd(e) {
        this.questions.forEach((q, i) => {
            const card = document.querySelector(`.question-card[data-index="${i}"]`);
            if (card) card.classList.remove('dragging');
        });
        // Also remove from the source element if we can find it
        if (this.dragSrcEl) {
            this.dragSrcEl.classList.remove('dragging');
        }
    }

    printQuiz() {
        // Clone the preview content directly for perfect WYSIWYG
        const editorContent = $('#quiz-questions-list').cloneNode(true);

        // Remove artificial page containers - extract all content from .document-page divs
        const pages = editorContent.querySelectorAll('.document-page');
        const allContent = document.createDocumentFragment();

        pages.forEach(page => {
            // Move all children from page container to fragment
            while (page.firstChild) {
                allContent.appendChild(page.firstChild);
            }
        });

        // Clear the editor content and append flattened content
        editorContent.innerHTML = '';
        editorContent.appendChild(allContent);

        // Remove any edit mode elements and interactions
        editorContent.querySelectorAll('.btn-icon').forEach(el => el.remove());
        editorContent.querySelectorAll('[draggable="true"]').forEach(el => {
            el.removeAttribute('draggable');
        });

        // Remove edit mode classes
        editorContent.querySelectorAll('.edit-mode').forEach(el => {
            el.classList.remove('edit-mode');
        });

        // Convert form controls into print-friendly static markup
        const toTextElement = (oldEl, text, className = '') => {
            const div = document.createElement('div');
            if (className) div.className = className;
            div.innerHTML = text;
            oldEl.replaceWith(div);
        };

        // Headers: swap points input for static text
        editorContent.querySelectorAll('.q-header').forEach(header => {
            const typeText = header.querySelector('.q-type')?.textContent || '';
            const pointsInput = header.querySelector('.q-points');
            const pts = pointsInput ? (pointsInput.value || pointsInput.getAttribute('value') || '') : '';
            header.innerHTML = `
                <span class="q-type">${typeText}</span>
                <span style="margin-left:auto; font-weight:bold;">${pts ? `${pts} pts` : ''}</span>
            `;
        });

        // Prompts: replace textareas with divs
        editorContent.querySelectorAll('textarea.q-prompt').forEach(area => {
            const text = area.value || '';
            toTextElement(area, text, 'q-prompt');
        });

        // Answer inputs: replace with blank line
        editorContent.querySelectorAll('.q-answer-row').forEach(row => {
            const label = row.querySelector('label')?.textContent || 'Answer:';
            row.innerHTML = `
                <label>${label}</label>
                <span style="display:inline-block; border-bottom: 1px solid #000; min-width: 140px; height: 1.4rem;"></span>
            `;
        });

        // MC options: turn option rows into static text
        editorContent.querySelectorAll('.q-options').forEach(optionsEl => {
            const rows = Array.from(optionsEl.querySelectorAll('.option-row'));
            if (rows.length === 0) return;
            const staticHtml = rows.map((row, idx) => {
                const text = row.querySelector('.option-input')?.value || '';
                const letter = String.fromCharCode(65 + idx);
                return `
                    <div class="q-option" style="margin-bottom: 0.25rem;">
                        <span style="display:inline-block; width:20px;">${letter}.</span> ${text}
                    </div>
                `;
            }).join('');
            optionsEl.innerHTML = staticHtml;
        });

        // Matching pairs: render inputs as static text
        editorContent.querySelectorAll('.q-pairs').forEach(pairsEl => {
            const rows = Array.from(pairsEl.querySelectorAll('.pair-row'));
            if (rows.length === 0) return;
            const leftCol = [];
            const rightCol = [];
            rows.forEach((row, idx) => {
                const term = row.querySelector('.pair-term')?.value || '';
                const def = row.querySelector('.pair-def')?.value || '';
                leftCol.push(`<div style="margin-bottom: 0.5rem;"><strong>${idx + 1}.</strong> ${term}</div>`);
                rightCol.push(`<div style="margin-bottom: 0.5rem;"><strong>${String.fromCharCode(65 + idx)}.</strong> ${def}</div>`);
            });
            pairsEl.innerHTML = `
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                    <div class="terms">${leftCol.join('')}</div>
                    <div class="defs">${rightCol.join('')}</div>
                </div>
            `;
        });

        const printWindow = window.open('', '_blank');

        printWindow.document.write(`
            <html>
            <head>
                <title>${this.meta.title}</title>
                <style>
                    body { 
                        font-family: ${this.meta.fontFamily}; 
                        padding: 0; 
                        margin: 0; 
                        width: 100%;
                    }
                    
                    /* Print-specific */
                <style>
                    @page {
                        size: letter;
                        margin: 0.5in;
                    }
                    
                    body { 
                        font-family: ${this.meta.fontFamily}; 
                        padding: 0; 
                        margin: 0; 
                        width: 100%;
                    }

                    /* Header styles */
                    .band {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        padding: 0.5rem 0;
                        border-bottom: 2px solid #000;
                        margin-bottom: 1rem;
                        page-break-inside: avoid;
                        page-break-after: avoid;
                    }
                    
                    .logo {
                        display: flex;
                        align-items: center;
                        gap: 0.75rem;
                    }
                    
                    .logo img {
                        width: 60px;
                        height: 60px;
                        object-fit: contain;
                    }
                    
                    .logo .meta {
                        display: flex;
                        flex-direction: column;
                        gap: 0.1rem;
                    }
                    
                    .logo h3 {
                        margin: 0;
                        font-size: 1rem;
                        font-weight: bold;
                    }
                    
                    .logo p {
                        margin: 0;
                        font-size: 0.85rem;
                    }
                    
                    .grade-note {
                        width: 80px;
                        height: 60px;
                        border: 2px solid #000;
                        border-radius: 4px;
                    }

                    /* Instructions */
                    .doc-instructions {
                        margin: 1rem 0;
                        font-weight: bold;
                        page-break-inside: avoid;
                    }

                    /* Info section */
                    .doc-info {
                        display: grid;
                        grid-template-columns: repeat(3, 1fr);
                        gap: 1rem;
                        margin: 1rem 0;
                        page-break-inside: avoid;
                        page-break-after: avoid;
                    }
                    
                    .doc-info-item {
                        display: flex;
                        align-items: center;
                        gap: 0.5rem;
                    }
                    
                    .doc-info-item strong {
                        white-space: nowrap;
                    }
                    
                    .doc-info-item span {
                        flex: 1;
                        border-bottom: 1px solid #000;
                        min-width: 100px;
                    }

                    /* Rubric */
                    .doc-rubric-grid {
                        display: grid;
                        grid-template-columns: 1fr 1fr;
                        gap: 0.5rem;
                        margin: 1rem 0;
                        padding: 0.5rem;
                        border: 1px solid #ddd;
                        page-break-inside: avoid;
                    }
                    
                    .doc-rubric-item {
                        display: flex;
                        flex-direction: column;
                        gap: 0.25rem;
                    }
                    
                    .rubric-title {
                        font-weight: bold;
                        font-size: 0.9rem;
                    }
                    
                    .rubric-desc {
                        font-size: 0.85rem;
                        color: #333;
                    }
                    
                    .rubric-pts {
                        font-weight: bold;
                    }
                    
                    .doc-rubric-total {
                        grid-column: 1 / -1;
                        text-align: right;
                        font-weight: bold;
                        padding-top: 0.5rem;
                        border-top: 2px solid #000;
                    }

                    /* Section headers */
                    .section-header {
                        margin: 2rem 0 1rem 0;
                        page-break-inside: avoid;
                        page-break-after: avoid;
                    }
                    
                    .section-header h3 {
                        margin: 0 0 0.5rem 0;
                        font-size: 1rem;
                        font-weight: bold;
                    }
                    
                    .section-header p {
                        margin: 0;
                        font-size: 1rem;
                        font-style: italic;
                    }

                    /* Question styles */
                    .doc-q-card {
                        margin-bottom: 1.5rem;
                        page-break-inside: avoid;
                    }
                    
                    .q-prompt {
                        margin-bottom: 0.5rem;
                        line-height: 1.6;
                    }
                    
                    .q-options {
                        margin-left: 1.5rem;
                    }
                    
                    .q-option {
                        margin-bottom: 0.25rem;
                    }
                    
                    /* Keep section header with first question */
                    .section-header + .doc-q-card {
                        page-break-before: avoid;
                    }
                </style>
            </head>
            <body>
                ${editorContent.innerHTML}
                <script>
                    // Wait for images to load before printing?
                    setTimeout(() => {
                        window.print();
                    }, 250);
                </script>
            </body>
            </html>
        `);
        printWindow.document.close();
        printWindow.focus();

        // Wait for images to load before printing
        setTimeout(() => {
            printWindow.print();
        }, 250);
    }
}

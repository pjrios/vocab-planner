import { createElement, $ } from '../main.js';
import { imageDB } from '../db.js';

export class IllustrationActivity {
    constructor(container, words, vocabName, onProgress, onImageSave) {
        this.container = container;
        this.words = words;
        this.vocabName = vocabName;
        this.onProgress = onProgress;
        this.onImageSave = onImageSave;
        this.currentIndex = 0;
        this.savedImagesCount = 0;

        this.init();
    }

    async init() {
        this.container.innerHTML = '';
        const word = this.words[this.currentIndex];

        const wrapper = createElement('div', 'illustration-wrapper');
        wrapper.style.maxWidth = '800px';
        wrapper.style.margin = '0 auto';
        wrapper.style.textAlign = 'center';

        // Header / Navigation
        const header = createElement('div', 'illustration-header');
        header.style.display = 'flex';
        header.style.justifyContent = 'space-between';
        header.style.alignItems = 'center';
        header.style.marginBottom = '0.75rem';

        const prevBtn = createElement('button', 'btn secondary-btn');
        prevBtn.textContent = '← Prev';
        prevBtn.disabled = this.currentIndex === 0;
        prevBtn.onclick = () => this.navigate(-1);

        const title = createElement('h2');
        title.textContent = `Find Image: ${word.word}`;

        const nextBtn = createElement('button', 'btn secondary-btn');
        nextBtn.textContent = this.currentIndex === this.words.length - 1 ? 'Finish' : 'Next →';
        nextBtn.onclick = () => this.navigate(1);

        header.appendChild(prevBtn);
        header.appendChild(title);
        header.appendChild(nextBtn);
        wrapper.appendChild(header);

        const definitionBox = createElement('div', 'illustration-definition');
        definitionBox.style.background = 'rgba(15, 23, 42, 0.5)';
        definitionBox.style.border = '1px solid rgba(255, 255, 255, 0.15)';
        definitionBox.style.borderRadius = '0.75rem';
        definitionBox.style.padding = '1rem 1.25rem';
        definitionBox.style.textAlign = 'left';
        definitionBox.innerHTML = `
            <p style="font-size: 0.95rem; color: var(--text-muted); margin-bottom: 0.5rem;">Definition</p>
            <p style="font-size: 1.05rem; color: var(--text-main);">${word.definition}</p>
        `;
        wrapper.appendChild(definitionBox);

        // Search Button
        const searchBtn = createElement('a', 'btn primary-btn');
        searchBtn.textContent = '🔍 Search Google Images';
        searchBtn.href = `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(word.word)}`;
        searchBtn.target = '_blank';
        searchBtn.style.display = 'inline-block';
        searchBtn.style.marginBottom = '1rem';
        wrapper.appendChild(searchBtn);

        // Upload Area
        const uploadArea = createElement('div', 'upload-area');
        uploadArea.style.border = '2px dashed rgba(255, 255, 255, 0.3)';
        uploadArea.style.padding = '2rem';
        uploadArea.style.borderRadius = '1rem';
        uploadArea.style.background = 'rgba(15, 23, 42, 0.6)';
        uploadArea.style.marginBottom = '1rem';
        uploadArea.style.position = 'relative';

        const instruction = createElement('p');
        instruction.textContent = 'Paste image here (Ctrl+V) or click to upload';
        instruction.style.pointerEvents = 'none';
        instruction.style.color = 'var(--text-muted)';
        uploadArea.appendChild(instruction);

        const fileInput = createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'image/*';
        fileInput.style.position = 'absolute';
        fileInput.style.top = '0';
        fileInput.style.left = '0';
        fileInput.style.width = '100%';
        fileInput.style.height = '100%';
        fileInput.style.opacity = '0';
        fileInput.style.cursor = 'pointer';

        fileInput.addEventListener('change', (e) => this.handleFileSelect(e));
        uploadArea.appendChild(fileInput);

        // Paste Handler (Global for simplicity when this view is active, but better on container)
        // We'll attach it to the document but need to be careful to remove it.
        // For now, let's rely on the user clicking the area to focus? 
        // Actually, a div isn't focusable by default.
        // Let's make the upload area focusable or just listen on window.

        wrapper.appendChild(uploadArea);

        // Image Preview
        const previewContainer = createElement('div', 'preview-container');
        previewContainer.style.minHeight = '300px';
        previewContainer.style.display = 'flex';
        previewContainer.style.justifyContent = 'center';
        previewContainer.style.alignItems = 'center';
        previewContainer.style.border = '1px solid rgba(255, 255, 255, 0.2)';
        previewContainer.style.background = 'rgba(15, 23, 42, 0.6)';
        previewContainer.style.borderRadius = '0.75rem';

        this.previewImage = createElement('img');
        this.previewImage.style.maxWidth = '100%';
        this.previewImage.style.maxHeight = '400px';
        this.previewImage.style.display = 'none';

        previewContainer.appendChild(this.previewImage);
        wrapper.appendChild(previewContainer);

        this.container.appendChild(wrapper);

        // Load existing image
        await this.loadImage();

        // Paste listener
        this.pasteHandler = (e) => this.handlePaste(e);
        window.addEventListener('paste', this.pasteHandler);
    }

    // Cleanup listener when navigating away or destroying
    // Since we don't have a clear 'destroy' hook in the current architecture, 
    // we might accumulate listeners if we aren't careful.
    // Ideally, the StudentManager should call a destroy method.
    // For now, we'll remove it on navigate.

    async handleFileSelect(e) {
        const file = e.target.files[0];
        if (file) {
            await this.processAndSaveImage(file);
        }
    }

    async handlePaste(e) {
        const items = (e.clipboardData || e.originalEvent.clipboardData).items;
        for (const item of items) {
            if (item.type.indexOf('image') === 0) {
                const blob = item.getAsFile();
                await this.processAndSaveImage(blob);
                break;
            }
        }
    }

    async processAndSaveImage(file) {
        try {
            const { blob, dataUrl } = await this.resizeImage(file);
            const word = this.words[this.currentIndex].word;
            await imageDB.saveDrawing(this.vocabName, word, blob);
            this.displayImage(blob);

            if (typeof this.onImageSave === 'function') {
                this.onImageSave(this.vocabName, word, dataUrl);
            }

            // Update progress
            await this.updateProgressCount(); // First update the count
            this.checkProgress(); // Then trigger the onProgress callback
        } catch (err) {
            console.error('Error processing image:', err);
            alert('Failed to process image.');
        }
    }

    resizeImage(file) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.src = URL.createObjectURL(file);
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 360;
                const MAX_HEIGHT = 240;
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > MAX_WIDTH) {
                        height *= MAX_WIDTH / width;
                        width = MAX_WIDTH;
                    }
                } else {
                    if (height > MAX_HEIGHT) {
                        width *= MAX_HEIGHT / height;
                        height = MAX_HEIGHT;
                    }
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                const dataUrl = canvas.toDataURL('image/webp', 0.75);
                canvas.toBlob((blob) => {
                    resolve({ blob, dataUrl });
                }, 'image/webp', 0.75);
            };
            img.onerror = reject;
        });
    }

    async loadImage() {
        const blob = await imageDB.getDrawing(this.vocabName, this.words[this.currentIndex].word);
        if (blob) {
            this.displayImage(blob);
        } else {
            this.previewImage.style.display = 'none';
        }
        // Check progress on load to ensure count is correct
        await this.updateProgressCount();
    }

    async updateProgressCount() {
        let count = 0;
        for (const word of this.words) {
            const blob = await imageDB.getDrawing(this.vocabName, word.word);
            if (blob) count++;
        }
        this.savedImagesCount = count;
    }

    checkProgress() {
        // Count how many words have images in IndexedDB
        // Since checking DB is async, we might need to track count separately or just update when we save/load.
        // We are already tracking `savedImagesCount` in `processAndSaveImage` and `loadImage`.

        // Just trigger update
        if (this.onProgress) {
            this.onProgress(this.getScore());
        }
    }

    displayImage(blob) {
        this.previewImage.src = URL.createObjectURL(blob);
        this.previewImage.style.display = 'block';
    }

    navigate(direction) {
        window.removeEventListener('paste', this.pasteHandler);

        const newIndex = this.currentIndex + direction;
        if (newIndex >= 0 && newIndex < this.words.length) {
            this.currentIndex = newIndex;
            this.init();
        } else if (newIndex >= this.words.length) {
            alert('All images saved!');
            // Trigger finish?
        }
    }

    getScore() {
        const total = this.words.length;
        const count = this.savedImagesCount || 0;
        const percentage = Math.round((count / total) * 100);

        return {
            score: percentage,
            details: `Found ${count} of ${total} images`
        };
    }
}

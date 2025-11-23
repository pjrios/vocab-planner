import { imageDB } from './db.js';

export const SaveSystem = {
    async save(data, filename = 'student_vocab_progress.zip') {
        try {
            // Create a new ZIP
            const zip = new JSZip();

            // Add progress JSON
            zip.file('progress.json', JSON.stringify(data, null, 2));

            // Get all images from IndexedDB
            const allImages = await imageDB.getAll();

            // Add images to ZIP
            const imagesFolder = zip.folder('images');
            for (const record of allImages) {
                // record has: { id, vocabName, word, blob, date }
                const filename = `${record.vocabName}/${record.word}.png`;
                imagesFolder.file(filename, record.blob);
            }

            // Generate ZIP blob
            const zipBlob = await zip.generateAsync({ type: 'blob' });

            // Download
            const url = URL.createObjectURL(zipBlob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            return true;
        } catch (err) {
            console.error('Error saving progress:', err);
            alert('Failed to save progress with images.');
            return false;
        }
    },

    async load(file) {
        try {
            // Load ZIP
            const zip = await JSZip.loadAsync(file);

            // Extract progress.json
            const progressFile = zip.file('progress.json');
            if (!progressFile) {
                throw new Error('progress.json not found in ZIP');
            }

            const progressText = await progressFile.async('text');
            const data = JSON.parse(progressText);

            // Extract and restore images
            const imagesFolder = zip.folder('images');
            if (imagesFolder) {
                const imageFiles = [];
                imagesFolder.forEach((relativePath, file) => {
                    imageFiles.push({ path: relativePath, file: file });
                });

                // Restore each image to IndexedDB
                for (const { path, file } of imageFiles) {
                    const blob = await file.async('blob');

                    // Parse path: "vocabName/word.png"
                    const parts = path.split('/');
                    if (parts.length >= 2) {
                        const vocabName = parts[0];
                        const wordWithExt = parts[parts.length - 1];
                        const word = wordWithExt.replace('.png', '');

                        await imageDB.saveDrawing(vocabName, word, blob);
                    }
                }
            }

            return data;
        } catch (err) {
            console.error('Error loading progress:', err);
            throw new Error('Failed to load progress file. Make sure it\'s a valid ZIP export.');
        }
    }
};

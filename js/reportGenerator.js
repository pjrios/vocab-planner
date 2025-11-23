import { createElement, $ } from './main.js';
import { imageDB } from './db.js';

export class ReportGenerator {
    static async generateReport(studentProfile, vocabName, scores) {
        const fullName = studentProfile.firstName && studentProfile.lastName
            ? `${studentProfile.firstName} ${studentProfile.lastName}`
            : studentProfile.name || 'Student';
        const grade = studentProfile.grade || '';
        const group = studentProfile.group || '';

        // Create a temporary report element
        const reportCard = createElement('div', 'report-card');
        reportCard.style.padding = '3rem';
        reportCard.style.background = 'white';
        reportCard.style.color = '#1f2937';
        reportCard.style.borderRadius = '0'; // Document style
        reportCard.style.width = '800px'; // Letter width approx
        reportCard.style.fontFamily = "'Inter', sans-serif";
        reportCard.style.position = 'fixed';
        reportCard.style.top = '-9999px'; // Hide off-screen
        reportCard.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1)';

        // Helper to format score row
        const renderRow = (activity, data) => {
            let status = 'Not Started';
            let score = '-';
            let details = '-';
            let color = '#9ca3af';
            let statusColor = '#f3f4f6';
            let statusTextColor = '#374151';

            if (data) {
                score = `${data.score}%`;
                details = data.details;
                color = data.score >= 80 ? '#10b981' : (data.score >= 50 ? '#f59e0b' : '#ef4444');

                // Determine status
                let isCompleted = false;
                if (data.isComplete !== undefined) {
                    isCompleted = data.isComplete;
                } else {
                    // Fallback for activities without explicit isComplete (like Quiz/Flashcards where score implies progress/completion)
                    // Actually, Quiz score is accuracy. Flashcards score is progress.
                    // Let's assume if score is 100, it's completed.
                    isCompleted = data.score >= 100;
                }

                if (isCompleted) {
                    status = 'Completed';
                    statusColor = '#d1fae5';
                    statusTextColor = '#065f46';
                } else {
                    status = 'In Progress';
                    statusColor = '#dbeafe';
                    statusTextColor = '#1e40af';
                }
            }

            return `
                <tr style="border-bottom: 1px solid #e5e7eb;">
                    <td style="padding: 1rem; font-weight: 500;">${activity}</td>
                    <td style="padding: 1rem; color: ${color}; font-weight: bold;">${score}</td>
                    <td style="padding: 1rem; color: #4b5563;">${details}</td>
                    <td style="padding: 1rem;">
                        <span style="background: ${statusColor}; color: ${statusTextColor}; padding: 0.25rem 0.75rem; border-radius: 9999px; font-size: 0.875rem;">
                            ${status}
                        </span>
                    </td>
                </tr>
            `;
        };

        reportCard.innerHTML = `
            <div style="border-bottom: 2px solid #4f46e5; padding-bottom: 1.5rem; margin-bottom: 2rem; display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <h1 style="font-size: 2rem; font-weight: 800; color: #111827; margin: 0;">Vocabulary Report</h1>
                    <p style="color: #6b7280; margin-top: 0.5rem;">Generated on ${new Date().toLocaleDateString()}</p>
                </div>
                <div style="text-align: right;">
                    <div style="font-size: 1.5rem; font-weight: bold; color: #4f46e5;">${vocabName}</div>
                </div>
            </div>

            <div style="margin-bottom: 3rem; background: #f9fafb; padding: 1.5rem; border-radius: 0.5rem;">
                <h2 style="font-size: 1.25rem; font-weight: 600; margin-bottom: 1rem; color: #374151;">Student Information</h2>
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem;">
                    <div>
                        <p style="font-size: 0.875rem; color: #6b7280; margin-bottom: 0.25rem;">Name</p>
                        <p style="font-size: 1.125rem; font-weight: 500;">${fullName}</p>
                    </div>
                    <div>
                        <p style="font-size: 0.875rem; color: #6b7280; margin-bottom: 0.25rem;">Grade</p>
                        <p style="font-size: 1.125rem; font-weight: 500;">${grade || '-'}</p>
                    </div>
                    <div>
                        <p style="font-size: 0.875rem; color: #6b7280; margin-bottom: 0.25rem;">Group</p>
                        <p style="font-size: 1.125rem; font-weight: 500;">${group || '-'}</p>
                    </div>
                </div>
            </div>

            <div style="margin-bottom: 2rem;">
                <h2 style="font-size: 1.25rem; font-weight: 600; margin-bottom: 1rem; color: #374151;">Activity Performance</h2>
                <table style="width: 100%; border-collapse: collapse; text-align: left;">
                    <thead>
                        <tr style="background: #f3f4f6; border-bottom: 2px solid #e5e7eb;">
                            <th style="padding: 1rem; font-weight: 600; color: #374151;">Activity</th>
                            <th style="padding: 1rem; font-weight: 600; color: #374151;">Score</th>
                            <th style="padding: 1rem; font-weight: 600; color: #374151;">Details</th>
                            <th style="padding: 1rem; font-weight: 600; color: #374151;">Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${renderRow('Flashcards', scores.flashcards)}
                        ${renderRow('Matching', scores.matching)}
                        ${renderRow('Quiz', scores.quiz)}
                        ${renderRow('Synonym & Antonym', scores['synonym-antonym'])}
                        ${renderRow('Word Search', scores['word-search'])}
                        ${renderRow('Crossword', scores.crossword)}
                        ${renderRow('Hangman', scores.hangman)}
                        ${renderRow('Word Scramble', scores.scramble)}
                        ${renderRow('Speed Match', scores['speed-match'])}
                        ${renderRow('Fill in Blank', scores['fill-in-blank'])}
                        ${renderRow('Image Hunt', scores.illustration)}
                    </tbody>
                </table>
            </div>

            <div id="activity-details" style="margin-top: 3rem;">
                <!-- Activity details will be inserted here -->
            </div>

            <div style="margin-top: 4rem; text-align: center; color: #9ca3af; font-size: 0.875rem;">
                <p>Vocabulary Learning App • Automated Report</p>
            </div>
        `;

        document.body.appendChild(reportCard);

        // Add detailed activity sections
        const detailsContainer = reportCard.querySelector('#activity-details');
        await this.renderActivityDetails(detailsContainer, vocabName, scores);

        try {
            // Ensure html2canvas is loaded
            if (typeof html2canvas === 'undefined') {
                throw new Error('html2canvas library not loaded');
            }

            const canvas = await html2canvas(reportCard);
            const imgData = canvas.toDataURL('image/png');

            // Download
            const link = document.createElement('a');
            link.download = `vocab-report-${Date.now()}.png`;
            link.href = imgData;
            link.click();

        } catch (err) {
            console.error('Report generation failed:', err);
            alert('Failed to generate report image.');
        } finally {
            document.body.removeChild(reportCard);
        }
    }

    static async renderActivityDetails(container, vocabName, scores) {
        container.innerHTML = '';

        // Image Hunt Details
        if (scores.illustration && scores.illustration.score > 0) {
            const section = createElement('div');
            section.style.marginBottom = '2rem';
            section.style.pageBreakBefore = 'always'; // For printing

            const heading = createElement('h2');
            heading.textContent = 'Image Hunt - Uploaded Images';
            heading.style.fontSize = '1.25rem';
            heading.style.fontWeight = '600';
            heading.style.marginBottom = '1rem';
            heading.style.color = '#374151';
            heading.style.borderBottom = '2px solid #e5e7eb';
            heading.style.paddingBottom = '0.5rem';
            section.appendChild(heading);

            const gallery = createElement('div');
            gallery.style.display = 'grid';
            gallery.style.gridTemplateColumns = 'repeat(3, 1fr)';
            gallery.style.gap = '1rem';

            try {
                // Get all words from the current vocab
                // We need to pass this info or fetch it. For now, let's try to get from imageDB
                const words = await this.getWordsFromImageDB(vocabName);

                for (const word of words) {
                    const blob = await imageDB.getDrawing(vocabName, word);
                    if (blob) {
                        const imgCard = createElement('div');
                        imgCard.style.border = '1px solid #e5e7eb';
                        imgCard.style.borderRadius = '0.5rem';
                        imgCard.style.overflow = 'hidden';
                        imgCard.style.background = '#f9fafb';

                        const img = createElement('img');
                        img.src = URL.createObjectURL(blob);
                        img.style.width = '100%';
                        img.style.height = '150px';
                        img.style.objectFit = 'cover';
                        imgCard.appendChild(img);

                        const label = createElement('div');
                        label.textContent = word;
                        label.style.padding = '0.75rem';
                        label.style.fontWeight = '500';
                        label.style.textAlign = 'center';
                        label.style.background = 'white';
                        imgCard.appendChild(label);

                        gallery.appendChild(imgCard);
                    }
                }

                if (gallery.children.length === 0) {
                    gallery.innerHTML = '<p style="color: #6b7280; text-align: center;">No images uploaded yet.</p>';
                }
            } catch (err) {
                console.error('Error loading images for report:', err);
                gallery.innerHTML = '<p style="color: #ef4444; text-align: center;">Error loading images.</p>';
            }

            section.appendChild(gallery);
            container.appendChild(section);
        }
    }

    static async getWordsFromImageDB(vocabName) {
        // Get all keys from imageDB that match this vocab
        const allKeys = await imageDB.getAllKeys();
        const words = [];

        for (const key of allKeys) {
            // Keys are stored as "vocabName_word"
            if (key.startsWith(`${vocabName}_`)) {
                const word = key.substring(vocabName.length + 1);
                words.push(word);
            }
        }

        return words;
    }
}

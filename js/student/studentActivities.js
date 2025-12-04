/**
 * Student Activities Module
 * Handles vocabulary loading, activity management, and progress tracking
 */

import { $, $$, createElement, fetchJSON } from '../main.js';
import { notifications } from '../notifications.js';
import { firebaseAuthService, getDocs, collection } from '../firebaseService.js';
import { MatchingActivity } from '../activities/matching.js';
import { FlashcardsActivity } from '../activities/flashcards.js';
import { QuizActivity } from '../activities/quiz.js';
import { IllustrationActivity } from '../activities/illustration.js';
import { SynonymAntonymActivity } from '../activities/synonymAntonym.js';
import { WordSearchActivity } from '../activities/wordSearch.js';
import { CrosswordActivity } from '../activities/crossword.js';
import { HangmanActivity } from '../activities/hangman.js';
import { ScrambleActivity } from '../activities/scramble.js';
import { SpeedMatchActivity } from '../activities/speedMatch.js';
import { FillInBlankActivity } from '../activities/fillInBlank.js';

export class StudentActivities {
    constructor(studentManager) {
        this.sm = studentManager; // Reference to StudentManager instance
    }

    async loadManifest() {
        const data = await fetchJSON('vocabularies/manifest.json');
        if (data) {
            this.sm.manifest = data;
        } else {
            // Fallback or error handling
            console.error('Could not load manifest');
            $('#vocab-list').innerHTML = '<p class="error">Failed to load vocabulary list.</p>';
        }
    }

    async loadCloudVocabularies() {
        try {
            await firebaseAuthService.init();
            const db = firebaseAuthService.getFirestore();
            const snapshot = await getDocs(collection(db, 'vocabularies'));
            this.sm.cloudVocabs = snapshot.docs.map(docSnap => ({
                id: docSnap.id,
                ...docSnap.data(),
                __source: 'cloud'
            }));
        } catch (error) {
            console.error('Failed to load cloud vocabularies:', error);
            const isOffline = !navigator.onLine;
            if (isOffline) {
                // Silently fail offline - we'll use local/manifest vocabularies
                this.sm.cloudVocabs = [];
            } else {
                notifications.warning('Could not load cloud vocabularies. Using local versions.');
                this.sm.cloudVocabs = [];
            }
            // Re-throw to let caller know we failed
            throw error;
        }
    }

    renderDashboard() {
        const container = $('#vocab-list');
        container.innerHTML = '';

        let vocabs = [];

        if (Array.isArray(this.sm.cloudVocabs) && this.sm.cloudVocabs.length > 0) {
            vocabs = vocabs.concat(this.sm.cloudVocabs);
        }

        if (this.sm.manifest && Array.isArray(this.sm.manifest.vocabularies)) {
            const manifestVocabs = this.sm.manifest.vocabularies.map(v => ({
                ...v,
                __source: 'manifest'
            }));
            vocabs = vocabs.concat(manifestVocabs);
        }

        try {
            const localStored = localStorage.getItem('teacher_vocab_library');
            if (localStored) {
                const localVocabs = JSON.parse(localStored);
                if (Array.isArray(localVocabs)) {
                    const normalized = localVocabs.map(v => ({
                        ...v,
                        __source: 'local'
                    }));
                    vocabs = vocabs.concat(normalized);
                }
            }
        } catch (e) {
            console.error("Error loading local vocabularies", e);
        }

        if (vocabs.length === 0) {
            container.innerHTML = '<p>No vocabularies found.</p>';
            return;
        }

        // Filter by grade if set
        const studentGrade = this.sm.studentProfile.grade ? String(this.sm.studentProfile.grade).trim() : '';

        if (studentGrade) {
            vocabs = vocabs.filter(v => {
                // Check 'grades' array first
                if (v.grades && Array.isArray(v.grades)) {
                    return v.grades.some(g => String(g).trim() === studentGrade);
                }
                // Fallback to 'grade' field
                if (v.grade) {
                    return String(v.grade).trim() === studentGrade;
                }
                // If no grade specified on vocab, show it by default
                return true;
            });
        }

        if (vocabs.length === 0) {
            container.innerHTML = `<p>No vocabularies found for Grade ${studentGrade}. <br><small>Try clearing your grade in profile to see all.</small></p>`;
            return;
        }

        vocabs.forEach(vocab => {
            const card = createElement('div', 'card option-card');
            const sourceLabel = vocab.__source === 'cloud'
                ? '☁️ Cloud'
                : vocab.__source === 'local'
                    ? '💾 Local'
                    : '📁 Repo';

            card.innerHTML = `
                <div class="icon">${vocab.__source === 'cloud' ? '☁️' : '📚'}</div>
                <h3>${vocab.name}</h3>
                <p>${vocab.description || ''}</p>
                ${vocab.grades ? `<small>Grade: ${vocab.grades.join(', ')}</small>` : ''}
                <small style="color:var(--text-muted); display:block; margin-top:0.5rem;">${sourceLabel}</small>
            `;
            card.addEventListener('click', () => this.loadVocabulary(vocab));
            container.appendChild(card);
        });
    }

    async loadVocabulary(vocabMeta) {
        let vocabData = null;

        if (vocabMeta.path) {
            vocabData = await fetchJSON(vocabMeta.path);
        } else {
            vocabData = vocabMeta;
        }

        if (!vocabData) {
            console.error('Failed to load vocabulary data for:', vocabMeta);
            notifications.error('Failed to load vocabulary data. Please try again or contact your teacher.');
            return;
        }

        this.sm.currentVocab = vocabData;

        // Restore scores from persistence
        if (!this.sm.progressData.units) this.sm.progressData.units = {};

        // Initialize unit entry if not exists, but preserve existing scores
        if (!this.sm.progressData.units[this.sm.currentVocab.name]) {
            this.sm.progressData.units[this.sm.currentVocab.name] = {
                scores: {},
                images: {},
                states: {}
            };
        }

        // Load scores into current session (reference to the stored object)
        this.sm.unitScores = this.sm.progressData.units[this.sm.currentVocab.name].scores;
        this.sm.unitImages = this.sm.progressData.units[this.sm.currentVocab.name].images || {};
        this.sm.unitStates = this.sm.progressData.units[this.sm.currentVocab.name].states || {};

        this.showActivityMenu();
    }

    showActivityMenu() {
        $('#current-unit-title').textContent = this.sm.currentVocab.name;

        // Update progress on cards
        const cards = $$('.activity-card');
        cards.forEach(card => {
            const type = card.dataset.activity;
            const scoreData = this.sm.unitScores[type];
            let progress = 0;
            let isComplete = false;

            if (scoreData) {
                progress = scoreData.score || 0;
                isComplete = scoreData.isComplete || (progress >= 100);
            }

            // Remove existing badge if any
            const existingBadge = card.querySelector('.progress-badge');
            if (existingBadge) existingBadge.remove();

            if (scoreData) {
                const badge = createElement('div', 'progress-badge');
                badge.textContent = `${progress}%`;
                if (isComplete) badge.classList.add('complete');
                card.appendChild(badge);
            }
        });

        this.sm.switchView('activity-menu-view');
    }

    startActivity(type) {
        this.sm.currentActivityType = type; // Track current activity type
        this.sm.switchView('activity-view');

        const container = $('#activity-container');
        container.innerHTML = ''; // Clear previous

        const onProgress = this.handleAutoSave.bind(this);
        const onSaveState = this.handleStateSave.bind(this);
        const initialState = this.sm.unitStates ? this.sm.unitStates[type] : null;
        const settings = this.sm.currentVocab.activitySettings || {};

        switch (type) {
            case 'matching':
                const matchingLimit = settings.matching || 10;
                const matchingWords = this.sm.currentVocab.words.filter(w => w.word.length >= 2).slice(0, matchingLimit);
                this.sm.activityInstance = new MatchingActivity(container, matchingWords, onProgress);
                break;
            case 'flashcards':
                const flashcardsLimit = settings.flashcards || this.sm.currentVocab.words.length;
                const flashcardsWords = this.sm.currentVocab.words.slice(0, flashcardsLimit);
                this.sm.activityInstance = new FlashcardsActivity(container, flashcardsWords, onProgress, onSaveState, initialState);
                break;
            case 'quiz':
                const quizLimit = settings.quiz || 10;
                const quizWords = this.sm.currentVocab.words.slice(0, quizLimit);
                this.sm.activityInstance = new QuizActivity(container, quizWords, onProgress);
                break;
            case 'synonym-antonym':
                const synonymLimit = settings.synonymAntonym || 10;
                const synonymWords = this.sm.currentVocab.words.slice(0, synonymLimit);
                this.sm.activityInstance = new SynonymAntonymActivity(container, synonymWords, onProgress);
                break;
            case 'illustration':
                const illustrationLimit = settings.illustration || 10;
                const illustrationWords = this.sm.currentVocab.words.slice(0, illustrationLimit);
                this.sm.activityInstance = new IllustrationActivity(
                    container,
                    illustrationWords,
                    this.sm.currentVocab.name,
                    onProgress,
                    this.handleIllustrationSave.bind(this)
                );
                break;
            case 'word-search':
                const wordSearchLimit = settings.wordSearch || 10;
                const wordSearchWords = this.sm.currentVocab.words.filter(w => w.word.length >= 4).slice(0, wordSearchLimit);
                // Pass vocab ID (or name as fallback) for stable persistence
                const vocabID = this.sm.currentVocab.id || this.sm.currentVocab.name;
                this.sm.activityInstance = new WordSearchActivity(container, wordSearchWords, onProgress, vocabID);
                break;
            case 'crossword':
                this.sm.activityInstance = new CrosswordActivity(container, this.sm.currentVocab.words, onProgress, onSaveState, initialState);
                break;
            case 'hangman':
                this.sm.activityInstance = new HangmanActivity(container, this.sm.currentVocab.words, onProgress, onSaveState, initialState);
                break;
            case 'scramble':
                this.sm.activityInstance = new ScrambleActivity(container, this.sm.currentVocab.words, onProgress, onSaveState, initialState);
                break;
            case 'speed-match':
                this.sm.activityInstance = new SpeedMatchActivity(container, this.sm.currentVocab.words, onProgress, onSaveState, initialState);
                break;
            case 'fill-in-blank':
                this.sm.activityInstance = new FillInBlankActivity(container, this.sm.currentVocab.words, onProgress, onSaveState, initialState);
                break;
            default:
                container.innerHTML = `<p>Activity ${type} not implemented yet.</p>`;
                this.sm.activityInstance = null;
        }
    }

    handleAutoSave(scoreData) {
        if (this.sm.currentVocab && this.sm.currentActivityType) {
            // Calculate coin rewards
            const oldScoreData = this.sm.unitScores[this.sm.currentActivityType];
            const oldScore = oldScoreData ? (oldScoreData.score || 0) : 0;
            const newScore = scoreData.score || 0;

            if (newScore > oldScore) {
                const settings = this.sm.currentVocab.activitySettings || {};
                const progressReward = settings.progressReward !== undefined ? settings.progressReward : 1;
                const completionBonus = settings.completionBonus !== undefined ? settings.completionBonus : 50;

                // Coins per 10% progress
                const stepsOld = Math.floor(oldScore / 10);
                const stepsNew = Math.floor(newScore / 10);
                const stepsGained = stepsNew - stepsOld;

                let totalReward = Math.max(0, stepsGained * progressReward);

                // Completion bonus
                if (newScore === 100 && oldScore < 100) {
                    totalReward += completionBonus;
                }

                if (totalReward > 0) {
                    this.sm.progress.addCoins(totalReward);
                }
            }

            this.sm.unitScores[this.sm.currentActivityType] = scoreData;
            this.sm.progress.saveLocalProgress();

            // Update in-game progress indicator
            const indicator = $('#activity-progress-indicator');
            if (indicator) {
                const percent = scoreData.score || 0;
                indicator.textContent = `Progress: ${percent}%`;
                indicator.classList.remove('hidden');
            }
        }
    }

    handleIllustrationSave(vocabName, word, dataUrl) {
        const unitName = vocabName || (this.sm.currentVocab ? this.sm.currentVocab.name : null);
        if (!unitName) return;
        if (!this.sm.progressData.units) this.sm.progressData.units = {};
        if (!this.sm.progressData.units[unitName]) {
            this.sm.progressData.units[unitName] = { scores: {}, images: {} };
        }
        if (!this.sm.progressData.units[unitName].images) {
            this.sm.progressData.units[unitName].images = {};
        }
        this.sm.progressData.units[unitName].images[word] = dataUrl;
        if (this.sm.currentVocab && this.sm.currentVocab.name === unitName) {
            this.sm.unitImages = this.sm.progressData.units[unitName].images;
        }
        this.sm.progress.saveLocalProgress();
    }

    handleStateSave(stateData) {
        if (this.sm.currentVocab && this.sm.currentActivityType) {
            if (!this.sm.progressData.units[this.sm.currentVocab.name].states) {
                this.sm.progressData.units[this.sm.currentVocab.name].states = {};
            }
            this.sm.progressData.units[this.sm.currentVocab.name].states[this.sm.currentActivityType] = stateData;
            this.sm.unitStates = this.sm.progressData.units[this.sm.currentVocab.name].states;
            this.sm.progress.saveLocalProgress();
        }
    }
}


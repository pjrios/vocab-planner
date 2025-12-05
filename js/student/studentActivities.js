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
        this.wordCoverage = {}; // Track which words have been used in each activity
    }
    
    // Initialize word coverage tracking for current vocabulary
    initWordCoverage() {
        if (!this.sm.currentVocab) return;
        
        const vocabName = this.sm.currentVocab.name;
        
        // Load from progress data or initialize
        if (!this.sm.progressData.wordCoverage) {
            this.sm.progressData.wordCoverage = {};
        }
        
        if (!this.sm.progressData.wordCoverage[vocabName]) {
            this.sm.progressData.wordCoverage[vocabName] = {};
        }
        
        this.wordCoverage = this.sm.progressData.wordCoverage[vocabName];
    }
    
    // Get words that haven't been practiced in a specific activity
    getUnpracticedWords(activityType, allWords) {
        if (!this.wordCoverage[activityType]) {
            this.wordCoverage[activityType] = {};
        }
        
        const practiced = this.wordCoverage[activityType];
        const unpracticed = allWords.filter(w => !practiced[w.word]);
        
        // If all words have been practiced, reset and return all
        if (unpracticed.length === 0) {
            this.wordCoverage[activityType] = {};
            return [...allWords];
        }
        
        return unpracticed;
    }
    
    // Mark words as practiced for an activity
    markWordsPracticed(activityType, words) {
        if (!this.wordCoverage[activityType]) {
            this.wordCoverage[activityType] = {};
        }
        
        words.forEach(w => {
            const word = typeof w === 'string' ? w : w.word;
            this.wordCoverage[activityType][word] = {
                practicedAt: new Date().toISOString(),
                count: (this.wordCoverage[activityType][word]?.count || 0) + 1
            };
        });
        
        // Save coverage data
        if (this.sm.currentVocab) {
            const vocabName = this.sm.currentVocab.name;
            if (!this.sm.progressData.wordCoverage) {
                this.sm.progressData.wordCoverage = {};
            }
            this.sm.progressData.wordCoverage[vocabName] = this.wordCoverage;
            this.sm.progress.saveLocalProgress();
        }
    }
    
    // Get word coverage statistics for display
    getWordCoverageStats() {
        if (!this.sm.currentVocab) return null;
        
        const totalWords = this.sm.currentVocab.words.length;
        const activities = ['matching', 'quiz', 'synonym-antonym', 'word-search', 'crossword', 
                          'hangman', 'scramble', 'speed-match', 'fill-in-blank'];
        
        const stats = {};
        
        activities.forEach(activity => {
            const practiced = this.wordCoverage[activity] ? Object.keys(this.wordCoverage[activity]).length : 0;
            stats[activity] = {
                practiced,
                total: totalWords,
                percentage: Math.round((practiced / totalWords) * 100)
            };
        });
        
        // Overall coverage (words practiced in at least one activity)
        const allPracticed = new Set();
        activities.forEach(activity => {
            if (this.wordCoverage[activity]) {
                Object.keys(this.wordCoverage[activity]).forEach(word => allPracticed.add(word));
            }
        });
        
        stats.overall = {
            practiced: allPracticed.size,
            total: totalWords,
            percentage: Math.round((allPracticed.size / totalWords) * 100)
        };
        
        return stats;
    }
    
    // Get words prioritized by least practiced
    getPrioritizedWords(activityType, limit = 10) {
        if (!this.sm.currentVocab) return [];
        
        const allWords = [...this.sm.currentVocab.words];
        const practiced = this.wordCoverage[activityType] || {};
        
        // Sort by practice count (ascending) then shuffle within same count
        allWords.sort((a, b) => {
            const countA = practiced[a.word]?.count || 0;
            const countB = practiced[b.word]?.count || 0;
            if (countA !== countB) return countA - countB;
            return Math.random() - 0.5; // Random within same count
        });
        
        return allWords.slice(0, limit);
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
        
        // Initialize word coverage tracking
        this.initWordCoverage();

        this.showActivityMenu();
    }

    showActivityMenu() {
        $('#current-unit-title').textContent = this.sm.currentVocab.name;

        // Get word coverage stats
        const coverageStats = this.getWordCoverageStats();

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

            // Remove existing badges
            const existingBadge = card.querySelector('.progress-badge');
            if (existingBadge) existingBadge.remove();
            const existingCoverage = card.querySelector('.coverage-badge');
            if (existingCoverage) existingCoverage.remove();
            const existingPlays = card.querySelector('.plays-badge');
            if (existingPlays) existingPlays.remove();

            if (scoreData) {
                const badge = createElement('div', 'progress-badge');
                badge.textContent = `${progress}%`;
                if (isComplete) badge.classList.add('complete');
                card.appendChild(badge);
                
                // Show plays count for replayable activities
                const nonReplayable = ['flashcards', 'illustration'];
                if (!nonReplayable.includes(type) && scoreData.plays > 0) {
                    const playsBadge = createElement('div', 'plays-badge');
                    playsBadge.textContent = `${scoreData.plays} plays`;
                    playsBadge.style.cssText = 'position: absolute; bottom: 0.5rem; right: 0.5rem; font-size: 0.7rem; color: var(--text-muted); background: rgba(0,0,0,0.3); padding: 0.2rem 0.4rem; border-radius: 4px;';
                    card.appendChild(playsBadge);
                }
            }
            
            // Show word coverage for activities that track it
            if (coverageStats && coverageStats[type] && !['flashcards', 'illustration'].includes(type)) {
                const coverage = coverageStats[type];
                if (coverage.practiced > 0) {
                    const coverageBadge = createElement('div', 'coverage-badge');
                    coverageBadge.textContent = `📚 ${coverage.practiced}/${coverage.total}`;
                    coverageBadge.title = `${coverage.percentage}% of words practiced`;
                    coverageBadge.style.cssText = 'position: absolute; bottom: 0.5rem; left: 0.5rem; font-size: 0.7rem; color: var(--text-muted); background: rgba(0,0,0,0.3); padding: 0.2rem 0.4rem; border-radius: 4px;';
                    card.appendChild(coverageBadge);
                }
            }
        });
        
        // Update overall coverage display if element exists
        this.updateOverallCoverageDisplay(coverageStats);

        this.sm.switchView('activity-menu-view');
    }
    
    updateOverallCoverageDisplay(coverageStats) {
        // Create or update overall coverage indicator
        let coverageIndicator = $('#overall-coverage-indicator');
        
        if (!coverageIndicator) {
            // Create the indicator if it doesn't exist
            const header = document.querySelector('#activity-menu-view .section-header');
            if (header) {
                coverageIndicator = createElement('div', 'overall-coverage');
                coverageIndicator.id = 'overall-coverage-indicator';
                coverageIndicator.style.cssText = 'display: flex; align-items: center; gap: 0.5rem; font-size: 0.85rem; color: var(--text-muted); margin-left: auto;';
                header.appendChild(coverageIndicator);
            }
        }
        
        if (coverageIndicator && coverageStats?.overall) {
            const { practiced, total, percentage } = coverageStats.overall;
            coverageIndicator.innerHTML = `
                <span title="Words practiced across all activities">📖 Word Coverage: ${practiced}/${total} (${percentage}%)</span>
                <div style="width: 60px; height: 6px; background: rgba(255,255,255,0.2); border-radius: 3px; overflow: hidden;">
                    <div style="width: ${percentage}%; height: 100%; background: var(--primary-color, #6366f1); transition: width 0.3s;"></div>
                </div>
            `;
        }
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
        
        // Helper to get prioritized words (least practiced first)
        const getPrioritized = (limit, filter = null) => {
            let words = filter 
                ? this.sm.currentVocab.words.filter(filter)
                : [...this.sm.currentVocab.words];
            return this.getPrioritizedWords(type, Math.min(limit, words.length));
        };

        switch (type) {
            case 'matching':
                const matchingLimit = settings.matching || 10;
                const matchingWords = getPrioritized(matchingLimit, w => w.word.length >= 2);
                this.sm.activityInstance = new MatchingActivity(container, matchingWords, onProgress);
                // Mark words as used when activity starts
                this.markWordsPracticed(type, matchingWords);
                break;
            case 'flashcards':
                // Flashcards: use all words (non-replayable, study mode)
                const flashcardsLimit = settings.flashcards || this.sm.currentVocab.words.length;
                const flashcardsWords = this.sm.currentVocab.words.slice(0, flashcardsLimit);
                this.sm.activityInstance = new FlashcardsActivity(container, flashcardsWords, onProgress, onSaveState, initialState);
                break;
            case 'quiz':
                const quizLimit = settings.quiz || 10;
                const quizWords = getPrioritized(quizLimit);
                this.sm.activityInstance = new QuizActivity(container, quizWords, onProgress);
                this.markWordsPracticed(type, quizWords);
                break;
            case 'synonym-antonym':
                const synonymLimit = settings.synonymAntonym || 10;
                const synonymWords = getPrioritized(synonymLimit, w => (w.synonyms?.length > 0 || w.antonyms?.length > 0));
                this.sm.activityInstance = new SynonymAntonymActivity(container, synonymWords, onProgress);
                this.markWordsPracticed(type, synonymWords);
                break;
            case 'illustration':
                // Illustration: non-replayable, use sequential words
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
                const wordSearchWords = getPrioritized(wordSearchLimit, w => w.word.length >= 4);
                // Pass vocab ID (or name as fallback) for stable persistence
                const vocabID = this.sm.currentVocab.id || this.sm.currentVocab.name;
                this.sm.activityInstance = new WordSearchActivity(container, wordSearchWords, onProgress, vocabID);
                this.markWordsPracticed(type, wordSearchWords);
                break;
            case 'crossword':
                const crosswordWords = getPrioritized(this.sm.currentVocab.words.length);
                this.sm.activityInstance = new CrosswordActivity(container, crosswordWords, onProgress, onSaveState, initialState);
                this.markWordsPracticed(type, crosswordWords);
                break;
            case 'hangman':
                const hangmanWords = getPrioritized(this.sm.currentVocab.words.length);
                this.sm.activityInstance = new HangmanActivity(container, hangmanWords, onProgress, onSaveState, initialState);
                this.markWordsPracticed(type, hangmanWords);
                break;
            case 'scramble':
                const scrambleWords = getPrioritized(this.sm.currentVocab.words.length);
                this.sm.activityInstance = new ScrambleActivity(container, scrambleWords, onProgress, onSaveState, initialState);
                this.markWordsPracticed(type, scrambleWords);
                break;
            case 'speed-match':
                // Speed match uses all words randomly during gameplay
                this.sm.activityInstance = new SpeedMatchActivity(container, this.sm.currentVocab.words, onProgress, onSaveState, initialState);
                // Mark all words as potentially practiced
                this.markWordsPracticed(type, this.sm.currentVocab.words);
                break;
            case 'fill-in-blank':
                const fibWords = getPrioritized(this.sm.currentVocab.words.length, w => w.example);
                this.sm.activityInstance = new FillInBlankActivity(container, fibWords, onProgress, onSaveState, initialState);
                this.markWordsPracticed(type, fibWords);
                break;
            default:
                container.innerHTML = `<p>Activity ${type} not implemented yet.</p>`;
                this.sm.activityInstance = null;
        }
    }

    handleAutoSave(scoreData) {
        if (this.sm.currentVocab && this.sm.currentActivityType) {
            const activityType = this.sm.currentActivityType;
            const settings = this.sm.currentVocab.activitySettings || {};
            const progressReward = settings.progressReward !== undefined ? settings.progressReward : 1;
            const completionBonus = settings.completionBonus !== undefined ? settings.completionBonus : 50;
            
            // Non-replayable activities (flashcards, illustration) - only reward first-time progress
            const nonReplayable = ['flashcards', 'illustration'];
            
            if (nonReplayable.includes(activityType)) {
                // Original behavior: only reward if new score > old score
                const oldScoreData = this.sm.unitScores[activityType];
                const oldScore = oldScoreData ? (oldScoreData.score || 0) : 0;
                const newScore = scoreData.score || 0;

                if (newScore > oldScore) {
                    const stepsOld = Math.floor(oldScore / 10);
                    const stepsNew = Math.floor(newScore / 10);
                    const stepsGained = stepsNew - stepsOld;
                    let totalReward = Math.max(0, stepsGained * progressReward);

                    if (newScore === 100 && oldScore < 100) {
                        totalReward += completionBonus;
                    }

                    if (totalReward > 0) {
                        this.sm.progress.addCoins(totalReward);
                    }
                }
                
                this.sm.unitScores[activityType] = scoreData;
            } else {
                // Replayable activities: track best score + total plays + earn coins on each play
                const oldScoreData = this.sm.unitScores[activityType] || { score: 0, plays: 0, totalEarned: 0 };
                const oldScore = oldScoreData.score || 0;
                const newScore = scoreData.score || 0;
                
                // Track session progress for coin rewards
                if (!this.sm.sessionProgress) this.sm.sessionProgress = {};
                if (!this.sm.sessionProgress[activityType]) {
                    this.sm.sessionProgress[activityType] = { lastScore: 0 };
                }
                
                const sessionLastScore = this.sm.sessionProgress[activityType].lastScore;
                
                // Award coins for progress within this session
                if (newScore > sessionLastScore) {
                    const stepsOld = Math.floor(sessionLastScore / 10);
                    const stepsNew = Math.floor(newScore / 10);
                    const stepsGained = stepsNew - stepsOld;
                    let totalReward = Math.max(0, stepsGained * progressReward);

                    // Completion bonus only once per session
                    if (newScore === 100 && sessionLastScore < 100) {
                        totalReward += completionBonus;
                    }

                    if (totalReward > 0) {
                        this.sm.progress.addCoins(totalReward);
                        oldScoreData.totalEarned = (oldScoreData.totalEarned || 0) + totalReward;
                    }
                }
                
                this.sm.sessionProgress[activityType].lastScore = newScore;
                
                // Update best score and increment plays on completion
                if (scoreData.isComplete) {
                    oldScoreData.plays = (oldScoreData.plays || 0) + 1;
                    this.sm.sessionProgress[activityType].lastScore = 0; // Reset for next play
                }
                
                // Keep best score
                oldScoreData.score = Math.max(oldScore, newScore);
                oldScoreData.details = scoreData.details;
                oldScoreData.isComplete = oldScoreData.isComplete || scoreData.isComplete;
                oldScoreData.lastPlayed = new Date().toISOString();
                
                this.sm.unitScores[activityType] = oldScoreData;
            }
            
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
    
    // Reset activity state for replay
    resetActivityState(activityType) {
        if (!this.sm.currentVocab) return;
        
        const vocabName = this.sm.currentVocab.name;
        const vocabID = this.sm.currentVocab.id || vocabName;
        
        // Clear localStorage state
        const stateKeys = [
            `hangman_state_${this.sm.currentVocab.words.length}`,
            `scramble_state_${this.sm.currentVocab.words.length}`,
            `crossword_state_${this.sm.currentVocab.words.length}`,
            `fib_state_${this.sm.currentVocab.words.length}`,
            `matching_state_${this.sm.currentVocab.words[0]?.word}_${this.sm.currentVocab.words.length}`,
            `word_search_state_${vocabID}`,
            `speedmatch_highscore_${this.sm.currentVocab.words.length}`
        ];
        
        stateKeys.forEach(key => {
            localStorage.removeItem(key);
            localStorage.removeItem(key.trim()); // Handle keys with trailing spaces
        });
        
        // Clear saved state in progress data
        if (this.sm.unitStates && this.sm.unitStates[activityType]) {
            delete this.sm.unitStates[activityType];
        }
        
        // Reset session progress
        if (this.sm.sessionProgress && this.sm.sessionProgress[activityType]) {
            this.sm.sessionProgress[activityType].lastScore = 0;
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


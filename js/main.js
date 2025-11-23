/**
 * Main JavaScript file for common utilities
 */

// Helper to select elements
export const $ = (selector) => document.querySelector(selector);
export const $$ = (selector) => document.querySelectorAll(selector);

// Helper to create elements
export const createElement = (tag, className, text) => {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text) el.textContent = text;
    return el;
};

// Simple state management
export const store = {
    vocabularies: [],
    currentVocab: null,
    studentProgress: {},
    
    saveProgress() {
        // TODO: Implement save logic
        console.log('Saving progress...');
    },
    
    loadProgress(json) {
        // TODO: Implement load logic
        console.log('Loading progress...');
    }
};

// Utility to fetch JSON
export async function fetchJSON(path) {
    try {
        const response = await fetch(path);
        if (!response.ok) throw new Error(`Failed to load ${path}`);
        return await response.json();
    } catch (error) {
        console.error('Error fetching JSON:', error);
        return null;
    }
}

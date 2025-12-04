/**
 * Main JavaScript file for common utilities
 */

import { notifications } from './notifications.js';

// Helper to select elements
export const $ = (selector) => document.querySelector(selector);
export const $$ = (selector) => document.querySelectorAll(selector);

// Export notifications for convenience
export { notifications };

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
        // Progress saving is handled by Firebase/Drive services
    },
    
    loadProgress(json) {
        // TODO: Implement load logic
        // Progress loading is handled by Firebase/Drive services
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
        notifications.error(`Failed to load ${path}. Please check your connection.`);
        return null;
    }
}

// Consistent error handler utility
export function handleError(error, userMessage = null, context = '') {
    const message = userMessage || (error?.message || 'An unexpected error occurred');
    
    // Log error with context for debugging
    if (context) {
        console.error(`[${context}]`, error);
    } else {
        console.error(error);
    }
    
    // Show user-friendly notification
    notifications.error(message);
    
    // Return error for potential further handling
    return error;
}

// Safe async wrapper for operations that should never fail silently
export async function safeAsync(fn, errorMessage = 'Operation failed', context = '') {
    try {
        return await fn();
    } catch (error) {
        handleError(error, errorMessage, context);
        return null;
    }
}

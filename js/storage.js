/**
 * Storage Module
 * Handles localStorage operations for projects, history, and settings
 */

import { DEFAULT_MONITOR_TEMPLATE, DEFAULT_PAGE_TITLE } from './config.js';
import { mergeDefaults, cloneDefaultValue } from './utils.js';

/**
 * Create a fresh default monitor object
 * @returns {Object} - Default monitor configuration
 */
export function createDefaultMonitor() {
    const monitorTemplateJSON = JSON.stringify(DEFAULT_MONITOR_TEMPLATE);
    return JSON.parse(monitorTemplateJSON);
}

/**
 * Ensure all projects have monitor defaults
 * @param {Array} projects - Array of project objects
 * @returns {boolean} - True if any changes were made
 */
export function ensureMonitorDefaults(projects) {
    if (!Array.isArray(projects)) return false;
    let changed = false;

    projects.forEach(project => {
        if (!project || typeof project !== "object") return;

        if (!project.monitor) {
            project.monitor = createDefaultMonitor();
            changed = true;
            return;
        }

        if (mergeDefaults(project.monitor, DEFAULT_MONITOR_TEMPLATE)) {
            changed = true;
        }
    });

    return changed;
}

/**
 * Load projects data from localStorage
 * @returns {Array} - Array of project objects
 */
export function loadProjectsData() {
    const storedProjects = localStorage.getItem('projectsData');
    if (storedProjects) {
        try {
            const projects = JSON.parse(storedProjects);
            ensureMonitorDefaults(projects);
            return projects;
        } catch (e) {
            console.error("Error loading projects data:", e);
            return [];
        }
    }
    return null; // null indicates no data in localStorage
}

/**
 * Save projects data to localStorage
 * @param {Array} projects - Array of project objects
 * @returns {boolean} - True if save was successful
 */
export function saveProjectsData(projects) {
    try {
        localStorage.setItem('projectsData', JSON.stringify(projects));
        return true;
    } catch (error) {
        console.warn('Failed to save projectsData to localStorage:', error);
        return false;
    }
}

/**
 * Load page title from localStorage
 * @returns {string} - Page title or default
 */
export function loadPageTitle() {
    return localStorage.getItem('pageTitle') || DEFAULT_PAGE_TITLE;
}

/**
 * Save page title to localStorage
 * @param {string} title - Page title
 */
export function savePageTitle(title) {
    localStorage.setItem('pageTitle', title);
}

/**
 * Load dark mode preference from localStorage
 * @returns {boolean} - True if dark mode is enabled
 */
export function loadDarkMode() {
    return localStorage.getItem('darkMode') === 'true';
}

/**
 * Save dark mode preference to localStorage
 * @param {boolean} isDark - True if dark mode is enabled
 */
export function saveDarkMode(isDark) {
    localStorage.setItem('darkMode', isDark);
}

/**
 * Load project history from localStorage
 * @returns {Array} - Array of history entries
 */
export function loadHistory() {
    const savedHistory = localStorage.getItem('projectHistory');
    if (savedHistory) {
        try {
            return JSON.parse(savedHistory);
        } catch (e) {
            console.error("Error loading history:", e);
            return [];
        }
    }
    return [];
}

/**
 * Save project history to localStorage
 * @param {Array} history - Array of history entries
 */
export function saveHistory(history) {
    try {
        localStorage.setItem('projectHistory', JSON.stringify(history));
    } catch (e) {
        console.warn("Failed to save history to localStorage:", e);
    }
}

/**
 * Add entry to history
 * @param {Array} history - Current history array
 * @param {string} type - Type of change (e.g., "Edit", "Add", "Delete")
 * @param {string} details - Details of the change
 * @returns {Array} - Updated history array
 */
export function addToHistory(history, type, details) {
    const entry = {
        date: new Date().toLocaleString('he-IL'),
        type: type,
        details: details
    };
    const newHistory = [entry, ...history];
    saveHistory(newHistory);
    return newHistory;
}

/**
 * Clear all localStorage data
 */
export function clearAllData() {
    localStorage.removeItem('projectsData');
    localStorage.removeItem('projectHistory');
    localStorage.removeItem('pageTitle');
}

/**
 * ==============================================================================
 * HISTORY SERVICE MODULE
 * ==============================================================================
 *
 * Manages project history tracking and audit logging.
 *
 * Dependencies:
 * - state-global.js: projectHistory
 * - SafeStorage.js: localStorage wrapper
 *
 * Functions exported to global scope:
 * - addToHistory(type, description)
 *
 * ==============================================================================
 */

/**
 * Add entry to project history log
 *
 * @param {string} type - Type of change (Edit, Add, Delete, etc.)
 * @param {string} description - Description of the change
 */
function addToHistory(type, description) {
    const now = new Date();
    const formattedDate = `${now.toLocaleDateString()} ${now.toLocaleTimeString()}`;

    const historyItem = {
        date: formattedDate,
        type: type,
        description: description
    };

    projectHistory.push(historyItem);

    // Persist history in localStorage
    SafeStorage.setJSON('projectHistory', projectHistory);
}

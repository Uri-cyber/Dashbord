/**
 * ==============================================================================
 * SAFE STORAGE - ERROR-HANDLED LOCALSTORAGE WRAPPER
 * ==============================================================================
 *
 * Provides safe localStorage operations with comprehensive error handling.
 * Prevents silent failures and provides user feedback.
 *
 * Common localStorage failures:
 * - QuotaExceededError: Storage limit exceeded (5-10MB typical)
 * - SecurityError: Private browsing mode or cross-origin
 * - Browser doesn't support localStorage
 * - localStorage is disabled by user
 *
 * Usage:
 *   SafeStorage.setItem('key', 'value');
 *   const value = SafeStorage.getItem('key');
 *   SafeStorage.setJSON('projects', projectsArray);
 *   const projects = SafeStorage.getJSON('projects');
 *
 * @class SafeStorage
 */

class SafeStorage {
    /**
     * Check if localStorage is available and working
     * @private
     * @returns {boolean}
     */
    static #isAvailable() {
        try {
            const testKey = '__storage_test__';
            localStorage.setItem(testKey, 'test');
            localStorage.removeItem(testKey);
            return true;
        } catch (e) {
            return false;
        }
    }

    /**
     * Show user-friendly error toast
     * @private
     * @param {string} operation - Operation that failed (save, load, etc.)
     * @param {Error} error - The error object
     */
    static #showError(operation, error) {
        console.error(`SafeStorage: ${operation} failed:`, error);

        let message = `Failed to ${operation} data`;

        if (error.name === 'QuotaExceededError') {
            message = 'Storage quota exceeded. Please clear some data.';
        } else if (error.name === 'SecurityError') {
            message = 'Storage access denied. Check browser settings.';
        } else if (!this.#isAvailable()) {
            message = 'Storage is not available. Enable localStorage in browser.';
        }

        // Try to show toast notification if available
        if (typeof showMonitorToast === 'function') {
            showMonitorToast('fail', 'Storage Error', message);
        } else {
            // Fallback to console warn
            console.warn(`SafeStorage: ${message}`);
        }
    }

    /**
     * Safely save a string value to localStorage
     *
     * @param {string} key - Storage key
     * @param {string} value - String value to store
     * @returns {boolean} - True if successful, false otherwise
     */
    static setItem(key, value) {
        try {
            if (!key || typeof key !== 'string') {
                console.warn('SafeStorage: Invalid key provided');
                return false;
            }

            if (value === null || value === undefined) {
                // Null/undefined treated as removal
                return this.removeItem(key);
            }

            if (!this.#isAvailable()) {
                this.#showError('save', new Error('localStorage not available'));
                return false;
            }

            localStorage.setItem(key, String(value));
            return true;
        } catch (error) {
            this.#showError('save', error);
            return false;
        }
    }

    /**
     * Safely retrieve a string value from localStorage
     *
     * @param {string} key - Storage key
     * @param {string} [defaultValue=null] - Default value if key doesn't exist
     * @returns {string|null} - Stored value or default
     */
    static getItem(key, defaultValue = null) {
        try {
            if (!key || typeof key !== 'string') {
                console.warn('SafeStorage: Invalid key provided');
                return defaultValue;
            }

            if (!this.#isAvailable()) {
                return defaultValue;
            }

            const value = localStorage.getItem(key);
            return value !== null ? value : defaultValue;
        } catch (error) {
            console.error('SafeStorage: Failed to retrieve item:', error);
            return defaultValue;
        }
    }

    /**
     * Safely save an object as JSON to localStorage
     *
     * @param {string} key - Storage key
     * @param {*} data - Data to serialize and store (object, array, etc.)
     * @returns {boolean} - True if successful, false otherwise
     */
    static setJSON(key, data) {
        try {
            if (!key || typeof key !== 'string') {
                console.warn('SafeStorage: Invalid key provided');
                return false;
            }

            if (data === null || data === undefined) {
                return this.removeItem(key);
            }

            const json = JSON.stringify(data);
            return this.setItem(key, json);
        } catch (error) {
            if (error instanceof TypeError && error.message.includes('circular')) {
                this.#showError('save', new Error('Cannot save circular structure'));
            } else {
                this.#showError('save', error);
            }
            return false;
        }
    }

    /**
     * Safely retrieve and parse JSON from localStorage
     *
     * @param {string} key - Storage key
     * @param {*} [defaultValue=null] - Default value if key doesn't exist or parse fails
     * @returns {*} - Parsed data or default value
     */
    static getJSON(key, defaultValue = null) {
        try {
            if (!key || typeof key !== 'string') {
                console.warn('SafeStorage: Invalid key provided');
                return defaultValue;
            }

            const json = this.getItem(key);

            if (json === null || json === undefined) {
                return defaultValue;
            }

            return JSON.parse(json);
        } catch (error) {
            console.error('SafeStorage: Failed to parse JSON:', error);
            // Don't show toast for parse errors (data corruption, not user issue)
            return defaultValue;
        }
    }

    /**
     * Safely remove an item from localStorage
     *
     * @param {string} key - Storage key
     * @returns {boolean} - True if successful
     */
    static removeItem(key) {
        try {
            if (!key || typeof key !== 'string') {
                console.warn('SafeStorage: Invalid key provided');
                return false;
            }

            if (!this.#isAvailable()) {
                return false;
            }

            localStorage.removeItem(key);
            return true;
        } catch (error) {
            console.error('SafeStorage: Failed to remove item:', error);
            return false;
        }
    }

    /**
     * Safely clear all localStorage
     *
     * @returns {boolean} - True if successful
     */
    static clear() {
        try {
            if (!this.#isAvailable()) {
                this.#showError('clear', new Error('localStorage not available'));
                return false;
            }

            localStorage.clear();
            return true;
        } catch (error) {
            this.#showError('clear', error);
            return false;
        }
    }

    /**
     * Check if a key exists in localStorage
     *
     * @param {string} key - Storage key
     * @returns {boolean} - True if key exists
     */
    static hasItem(key) {
        try {
            if (!key || typeof key !== 'string') {
                return false;
            }

            if (!this.#isAvailable()) {
                return false;
            }

            return localStorage.getItem(key) !== null;
        } catch (error) {
            console.error('SafeStorage: Failed to check item existence:', error);
            return false;
        }
    }

    /**
     * Get all keys in localStorage
     *
     * @returns {string[]} - Array of all storage keys
     */
    static keys() {
        try {
            if (!this.#isAvailable()) {
                return [];
            }

            return Object.keys(localStorage);
        } catch (error) {
            console.error('SafeStorage: Failed to get keys:', error);
            return [];
        }
    }

    /**
     * Get storage usage information
     *
     * @returns {Object} - Storage usage stats
     */
    static getUsage() {
        try {
            if (!this.#isAvailable()) {
                return {
                    available: false,
                    bytesUsed: 0,
                    itemCount: 0
                };
            }

            let bytesUsed = 0;
            const keys = Object.keys(localStorage);

            keys.forEach(key => {
                const value = localStorage.getItem(key);
                // Approximate bytes (UTF-16, so 2 bytes per char)
                bytesUsed += (key.length + (value ? value.length : 0)) * 2;
            });

            return {
                available: true,
                bytesUsed: bytesUsed,
                kilobytesUsed: Math.round(bytesUsed / 1024),
                itemCount: keys.length,
                keys: keys
            };
        } catch (error) {
            console.error('SafeStorage: Failed to get usage:', error);
            return {
                available: false,
                bytesUsed: 0,
                itemCount: 0,
                error: error.message
            };
        }
    }

    /**
     * Test localStorage functionality
     *
     * @returns {Object} - Test results
     */
    static test() {
        const results = {
            available: false,
            canWrite: false,
            canRead: false,
            canDelete: false,
            errors: []
        };

        try {
            results.available = this.#isAvailable();

            if (results.available) {
                const testKey = '__safe_storage_test__';
                const testValue = 'test_value_123';

                // Test write
                results.canWrite = this.setItem(testKey, testValue);

                // Test read
                const retrieved = this.getItem(testKey);
                results.canRead = retrieved === testValue;

                // Test delete
                results.canDelete = this.removeItem(testKey);
            }
        } catch (error) {
            results.errors.push(error.message);
        }

        return results;
    }
}

// Freeze the class to prevent modifications
Object.freeze(SafeStorage);

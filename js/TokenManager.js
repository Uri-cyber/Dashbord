/**
 * ==============================================================================
 * TOKEN MANAGER - SECURE IN-MEMORY TOKEN STORAGE
 * ==============================================================================
 *
 * Provides secure, in-memory storage for authentication tokens.
 * Fixes security vulnerability: Tokens no longer stored in localStorage.
 *
 * Security Features:
 * - In-memory storage only (cleared on page reload/tab close)
 * - Auto-expiration after configured timeout
 * - No persistence to localStorage (prevents XSS attacks)
 * - Project-scoped token isolation
 *
 * Usage:
 *   TokenManager.setToken(projectIndex, token, tokenKind);
 *   const token = TokenManager.getToken(projectIndex);
 *   TokenManager.clearToken(projectIndex);
 *   TokenManager.clearAll();
 *
 * @class TokenManager
 */

class TokenManager {
    /**
     * Initialize token storage
     * @private
     */
    static #tokens = new Map();

    /**
     * Default token expiration time (30 minutes in milliseconds)
     * @private
     */
    static #DEFAULT_EXPIRATION_MS = 30 * 60 * 1000;

    /**
     * Store a token for a specific project
     *
     * @param {number} projectIndex - Index of the project
     * @param {string} token - Authentication token value
     * @param {string} tokenKind - Type of token (e.g., 'Bearer', 'jwt')
     * @param {number} [expirationMs] - Optional custom expiration time in milliseconds
     * @returns {boolean} - True if token was stored successfully
     */
    static setToken(projectIndex, token, tokenKind, expirationMs = this.#DEFAULT_EXPIRATION_MS) {
        try {
            if (projectIndex === null || projectIndex === undefined) {
                console.warn('TokenManager: Invalid projectIndex provided');
                return false;
            }

            if (!token || typeof token !== 'string') {
                console.warn('TokenManager: Invalid token provided');
                return false;
            }

            const storedAt = Date.now();
            const expiresAt = storedAt + expirationMs;

            this.#tokens.set(projectIndex, {
                token: token,
                tokenKind: tokenKind || 'Bearer',
                storedAt: storedAt,
                expiresAt: expiresAt
            });

            // Set a timeout to auto-clear the token when it expires
            setTimeout(() => {
                this.clearToken(projectIndex);
            }, expirationMs);

            return true;
        } catch (error) {
            console.error('TokenManager: Error storing token:', error);
            return false;
        }
    }

    /**
     * Retrieve a token for a specific project
     *
     * @param {number} projectIndex - Index of the project
     * @returns {Object|null} - Token object with {token, tokenKind, storedAt} or null if not found/expired
     */
    static getToken(projectIndex) {
        try {
            if (projectIndex === null || projectIndex === undefined) {
                return null;
            }

            const tokenData = this.#tokens.get(projectIndex);

            if (!tokenData) {
                return null;
            }

            // Check if token has expired
            const now = Date.now();
            if (now >= tokenData.expiresAt) {
                // Token expired, clear it
                this.clearToken(projectIndex);
                return null;
            }

            return {
                token: tokenData.token,
                tokenKind: tokenData.tokenKind,
                storedAt: tokenData.storedAt
            };
        } catch (error) {
            console.error('TokenManager: Error retrieving token:', error);
            return null;
        }
    }

    /**
     * Check if a valid (non-expired) token exists for a project
     *
     * @param {number} projectIndex - Index of the project
     * @returns {boolean} - True if valid token exists
     */
    static hasToken(projectIndex) {
        return this.getToken(projectIndex) !== null;
    }

    /**
     * Clear token for a specific project
     *
     * @param {number} projectIndex - Index of the project
     * @returns {boolean} - True if token was cleared
     */
    static clearToken(projectIndex) {
        try {
            if (projectIndex === null || projectIndex === undefined) {
                return false;
            }

            return this.#tokens.delete(projectIndex);
        } catch (error) {
            console.error('TokenManager: Error clearing token:', error);
            return false;
        }
    }

    /**
     * Clear all stored tokens
     *
     * @returns {void}
     */
    static clearAll() {
        try {
            this.#tokens.clear();
        } catch (error) {
            console.error('TokenManager: Error clearing all tokens:', error);
        }
    }

    /**
     * Get count of currently stored tokens
     *
     * @returns {number} - Number of stored tokens
     */
    static getCount() {
        return this.#tokens.size;
    }

    /**
     * Get diagnostic information (for debugging)
     * Does NOT expose actual token values
     *
     * @returns {Array} - Array of token metadata (without actual tokens)
     */
    static getDiagnostics() {
        const diagnostics = [];
        const now = Date.now();

        this.#tokens.forEach((tokenData, projectIndex) => {
            diagnostics.push({
                projectIndex: projectIndex,
                tokenKind: tokenData.tokenKind,
                storedAt: new Date(tokenData.storedAt).toISOString(),
                expiresAt: new Date(tokenData.expiresAt).toISOString(),
                isExpired: now >= tokenData.expiresAt,
                ageSeconds: Math.floor((now - tokenData.storedAt) / 1000)
            });
        });

        return diagnostics;
    }

    /**
     * Update token expiration time for a project
     *
     * @param {number} projectIndex - Index of the project
     * @param {number} additionalMs - Additional milliseconds to add to expiration
     * @returns {boolean} - True if expiration was extended
     */
    static extendExpiration(projectIndex, additionalMs) {
        try {
            const tokenData = this.#tokens.get(projectIndex);

            if (!tokenData) {
                return false;
            }

            tokenData.expiresAt += additionalMs;
            this.#tokens.set(projectIndex, tokenData);

            return true;
        } catch (error) {
            console.error('TokenManager: Error extending expiration:', error);
            return false;
        }
    }
}

// Freeze the class to prevent modifications
Object.freeze(TokenManager);

/**
 * ==============================================================================
 * UTILITY HELPERS - COMMON UTILITY FUNCTIONS
 * ==============================================================================
 *
 * Collection of utility functions for common operations:
 * - Debounce: Delay function execution until after a pause
 * - Throttle: Limit function execution rate
 * - ElementCache: Cache DOM element lookups for performance
 * - Performance utilities
 *
 * @module UtilityHelpers
 */

/**
 * Debounce a function - delays execution until after wait time has elapsed
 * since the last time it was invoked.
 *
 * Useful for: search input, window resize, scroll events
 *
 * @param {Function} func - Function to debounce
 * @param {number} wait - Time to wait in milliseconds
 * @param {boolean} [immediate=false] - Trigger on leading edge instead of trailing
 * @returns {Function} - Debounced function
 *
 * @example
 * const debouncedSearch = debounce((query) => {
 *     performSearch(query);
 * }, 300);
 *
 * searchInput.addEventListener('input', (e) => {
 *     debouncedSearch(e.target.value);
 * });
 */
function debounce(func, wait, immediate = false) {
    let timeout;

    return function executedFunction(...args) {
        const context = this;

        const later = function() {
            timeout = null;
            if (!immediate) func.apply(context, args);
        };

        const callNow = immediate && !timeout;

        clearTimeout(timeout);
        timeout = setTimeout(later, wait);

        if (callNow) func.apply(context, args);
    };
}

/**
 * Throttle a function - ensures function is called at most once per specified time period
 *
 * Useful for: scroll events, button clicks, API calls
 *
 * @param {Function} func - Function to throttle
 * @param {number} limit - Minimum time between calls in milliseconds
 * @returns {Function} - Throttled function
 *
 * @example
 * const throttledScroll = throttle(() => {
 *     updateScrollPosition();
 * }, 100);
 *
 * window.addEventListener('scroll', throttledScroll);
 */
function throttle(func, limit) {
    let inThrottle;
    let lastResult;

    return function(...args) {
        const context = this;

        if (!inThrottle) {
            lastResult = func.apply(context, args);
            inThrottle = true;

            setTimeout(() => {
                inThrottle = false;
            }, limit);
        }

        return lastResult;
    };
}

/**
 * ElementCache - Cache DOM element lookups for better performance
 *
 * Caches querySelector results to avoid repeated DOM lookups
 *
 * @class ElementCache
 *
 * @example
 * const cache = new ElementCache();
 * const button = cache.get('#my-button'); // First call: queries DOM
 * const button2 = cache.get('#my-button'); // Second call: returns cached
 *
 * cache.clear(); // Clear all cached elements
 * cache.refresh('#my-button'); // Refresh specific element
 */
class ElementCache {
    constructor() {
        this.cache = new Map();
        this.hits = 0;
        this.misses = 0;
    }

    /**
     * Get element by selector (cached)
     *
     * @param {string} selector - CSS selector
     * @param {Element} [context=document] - Context to search within
     * @returns {Element|null} - Cached or queried element
     */
    get(selector, context = document) {
        const key = `${selector}:${context === document ? 'doc' : 'ctx'}`;

        if (this.cache.has(key)) {
            this.hits++;
            return this.cache.get(key);
        }

        this.misses++;
        const element = context.querySelector(selector);
        this.cache.set(key, element);

        return element;
    }

    /**
     * Get all elements by selector (not cached)
     *
     * @param {string} selector - CSS selector
     * @param {Element} [context=document] - Context to search within
     * @returns {NodeList} - All matching elements
     */
    getAll(selector, context = document) {
        return context.querySelectorAll(selector);
    }

    /**
     * Refresh a cached element (re-query DOM)
     *
     * @param {string} selector - CSS selector
     * @param {Element} [context=document] - Context to search within
     * @returns {Element|null} - Refreshed element
     */
    refresh(selector, context = document) {
        const key = `${selector}:${context === document ? 'doc' : 'ctx'}`;
        this.cache.delete(key);
        return this.get(selector, context);
    }

    /**
     * Clear entire cache
     */
    clear() {
        this.cache.clear();
        this.hits = 0;
        this.misses = 0;
    }

    /**
     * Get cache statistics
     *
     * @returns {Object} - Cache stats
     */
    getStats() {
        const total = this.hits + this.misses;
        const hitRate = total > 0 ? (this.hits / total * 100).toFixed(2) : 0;

        return {
            size: this.cache.size,
            hits: this.hits,
            misses: this.misses,
            total: total,
            hitRate: `${hitRate}%`
        };
    }

    /**
     * Remove specific element from cache
     *
     * @param {string} selector - CSS selector
     * @param {Element} [context=document] - Context
     * @returns {boolean} - True if removed
     */
    remove(selector, context = document) {
        const key = `${selector}:${context === document ? 'doc' : 'ctx'}`;
        return this.cache.delete(key);
    }
}

/**
 * Retry a function with exponential backoff
 *
 * @param {Function} fn - Async function to retry
 * @param {Object} [options] - Retry options
 * @param {number} [options.maxRetries=3] - Maximum number of retries
 * @param {number} [options.initialDelay=1000] - Initial delay in ms
 * @param {number} [options.maxDelay=10000] - Maximum delay in ms
 * @param {Function} [options.onRetry] - Callback on retry
 * @returns {Promise} - Promise that resolves with function result
 *
 * @example
 * const data = await retryWithBackoff(async () => {
 *     return await fetch('/api/data');
 * }, { maxRetries: 3, initialDelay: 1000 });
 */
async function retryWithBackoff(fn, options = {}) {
    const {
        maxRetries = 3,
        initialDelay = 1000,
        maxDelay = 10000,
        onRetry = null
    } = options;

    let lastError;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;

            if (attempt === maxRetries) {
                throw error;
            }

            // Calculate delay with exponential backoff
            const delay = Math.min(
                initialDelay * Math.pow(2, attempt),
                maxDelay
            );

            if (onRetry) {
                onRetry(attempt + 1, delay, error);
            }

            // Wait before retrying
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    throw lastError;
}

/**
 * Create a simple performance timer
 *
 * @param {string} label - Timer label
 * @returns {Object} - Timer object with stop method
 *
 * @example
 * const timer = performanceTimer('Data Processing');
 * // ... do work ...
 * const elapsed = timer.stop(); // Logs: "Data Processing: 123.45ms"
 */
function performanceTimer(label) {
    const start = performance.now();

    return {
        stop: function() {
            const end = performance.now();
            const elapsed = end - start;
            console.log(`${label}: ${elapsed.toFixed(2)}ms`);
            return elapsed;
        },
        get elapsed() {
            return performance.now() - start;
        }
    };
}

/**
 * Deep clone an object (simple implementation)
 *
 * @param {*} obj - Object to clone
 * @returns {*} - Cloned object
 *
 * @example
 * const copy = deepClone(originalObject);
 */
function deepClone(obj) {
    if (obj === null || typeof obj !== 'object') {
        return obj;
    }

    if (obj instanceof Date) {
        return new Date(obj.getTime());
    }

    if (obj instanceof Array) {
        return obj.map(item => deepClone(item));
    }

    if (obj instanceof Object) {
        const clonedObj = {};
        for (const key in obj) {
            if (Object.prototype.hasOwnProperty.call(obj, key)) {
                clonedObj[key] = deepClone(obj[key]);
            }
        }
        return clonedObj;
    }
}

/**
 * Format bytes to human readable string
 *
 * @param {number} bytes - Bytes to format
 * @param {number} [decimals=2] - Number of decimal places
 * @returns {string} - Formatted string (e.g., "1.50 MB")
 *
 * @example
 * formatBytes(1536); // "1.50 KB"
 * formatBytes(1048576); // "1.00 MB"
 */
function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];

    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * Sleep for specified milliseconds
 *
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise} - Promise that resolves after sleep
 *
 * @example
 * await sleep(1000); // Wait 1 second
 * console.log('1 second later...');
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Check if element is visible in viewport
 *
 * @param {Element} element - DOM element to check
 * @param {number} [threshold=0] - Percentage of element that must be visible (0-1)
 * @returns {boolean} - True if visible
 *
 * @example
 * if (isElementVisible(myElement, 0.5)) {
 *     // At least 50% of element is visible
 * }
 */
function isElementVisible(element, threshold = 0) {
    if (!element) return false;

    const rect = element.getBoundingClientRect();
    const windowHeight = window.innerHeight || document.documentElement.clientHeight;
    const windowWidth = window.innerWidth || document.documentElement.clientWidth;

    const vertInView = (rect.top <= windowHeight) && ((rect.top + rect.height) >= 0);
    const horInView = (rect.left <= windowWidth) && ((rect.left + rect.width) >= 0);

    if (!vertInView || !horInView) {
        return false;
    }

    if (threshold === 0) {
        return true;
    }

    // Calculate percentage visible
    const visibleHeight = Math.min(rect.bottom, windowHeight) - Math.max(rect.top, 0);
    const visibleWidth = Math.min(rect.right, windowWidth) - Math.max(rect.left, 0);
    const visibleArea = visibleHeight * visibleWidth;
    const totalArea = rect.height * rect.width;

    return (visibleArea / totalArea) >= threshold;
}

// Freeze functions to prevent modifications
Object.freeze(debounce);
Object.freeze(throttle);
Object.freeze(ElementCache);
Object.freeze(retryWithBackoff);
Object.freeze(performanceTimer);
Object.freeze(deepClone);
Object.freeze(formatBytes);
Object.freeze(sleep);
Object.freeze(isElementVisible);

/**
 * Utility Functions Module
 * Contains helper functions used throughout the application
 */

import { TEXT_LIMITS } from './config.js';

/**
 * Escape HTML to prevent XSS when injecting into innerHTML/attributes
 * @param {string} str - String to escape
 * @returns {string} - Escaped string
 */
export function escapeHTML(str) {
    if (str === null || str === undefined) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

/**
 * Truncate text to a maximum length
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum length (default: 20)
 * @returns {string} - Truncated text
 */
export function truncateText(text, maxLength = 20) {
    if (!text) return "";
    const t = (text.length <= maxLength) ? text : (text.substring(0, maxLength) + "...");
    return escapeHTML(t);
}

/**
 * Format date/time for monitor last run display
 * @param {string} value - ISO date string
 * @returns {string} - Formatted date string (dd/mm, HH:MM)
 */
export function formatMonitorLastRun(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return '';
    }
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${day}/${month}, ${hours}:${minutes}`;
}

/**
 * Check if a value is a plain object
 * @param {*} value - Value to check
 * @returns {boolean}
 */
export function isPlainObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Clone a default value (deep clone for objects and arrays)
 * @param {*} value - Value to clone
 * @returns {*} - Cloned value
 */
export function cloneDefaultValue(value) {
    if (Array.isArray(value)) {
        return value.map(cloneDefaultValue);
    }
    if (isPlainObject(value)) {
        const clone = {};
        Object.keys(value).forEach(key => {
            clone[key] = cloneDefaultValue(value[key]);
        });
        return clone;
    }
    return value;
}

/**
 * Merge default values into a target object
 * @param {Object} target - Target object
 * @param {Object} defaults - Default values
 * @returns {boolean} - True if any changes were made
 */
export function mergeDefaults(target, defaults) {
    let changed = false;
    Object.keys(defaults).forEach(key => {
        const defaultValue = defaults[key];
        const hasOwn = Object.prototype.hasOwnProperty.call(target, key);
        const currentValue = target[key];

        if (!hasOwn || currentValue === undefined) {
            target[key] = cloneDefaultValue(defaultValue);
            changed = true;
            return;
        }

        if (isPlainObject(defaultValue)) {
            if (!isPlainObject(currentValue)) {
                target[key] = cloneDefaultValue(defaultValue);
                changed = true;
            } else if (mergeDefaults(currentValue, defaultValue)) {
                changed = true;
            }
            return;
        }

        if (Array.isArray(defaultValue) && !Array.isArray(currentValue)) {
            target[key] = cloneDefaultValue(defaultValue);
            changed = true;
        }
    });
    return changed;
}

/**
 * Normalize monitor string (trim and handle undefined/null)
 * @param {string} value - String value
 * @returns {string} - Normalized string
 */
export function normalizeMonitorString(value) {
    if (value === undefined || value === null) return '';
    return String(value).trim();
}

/**
 * Render template with variable substitution
 * @param {string} template - Template string with ${variable} syntax
 * @param {Object} project - Project object
 * @param {Object} context - Context object with runtime values
 * @returns {string} - Rendered string
 */
export function renderTemplate(template, project, context) {
    if (template === null || template === undefined) {
        return '';
    }
    const str = String(template);
    if (!str.includes('${')) {
        return str;
    }
    const monitor = project && project.monitor ? project.monitor : {};
    const login = monitor.login || {};
    const replacements = {
        username: login.username || '',
        password: login.password || '',
        token: context && context.token ? String(context.token) : '',
        timestamp: context && context.startedAt ? context.startedAt : new Date().toISOString(),
        random: String(Math.floor(Math.random() * 1000000)),
        lastCreatedId: context && context.lastCreatedId !== undefined && context.lastCreatedId !== null ? String(context.lastCreatedId) : ''
    };
    return str.replace(/\$\{([a-zA-Z0-9_]+)\}/g, (match, key) => {
        if (Object.prototype.hasOwnProperty.call(replacements, key)) {
            return replacements[key];
        }
        return '';
    });
}

/**
 * Build full URL from base URL and path
 * @param {string} baseUrl - Base URL
 * @param {string} path - Path to append
 * @returns {string} - Full URL
 */
export function buildMonitorUrl(baseUrl, path) {
    const trimmedBase = (baseUrl || '').trim();
    const normalizedBase = trimmedBase.endsWith('/') ? trimmedBase.slice(0, -1) : trimmedBase;
    if (!path) {
        return normalizedBase;
    }
    let normalizedPath = String(path).trim();
    if (!normalizedPath.startsWith('/')) {
        normalizedPath = '/' + normalizedPath;
    }
    return normalizedBase + normalizedPath;
}

/**
 * Extract value from JSON using dot notation path
 * @param {Object} target - Target object
 * @param {string} path - Dot notation path (e.g., "data.token")
 * @returns {*} - Extracted value or undefined
 */
export function extractJsonPath(target, path) {
    if (!target || !path) return undefined;
    const segments = String(path).split('.').map((segment) => segment.trim()).filter(Boolean);
    if (!segments.length) return undefined;
    let current = target;
    for (let i = 0; i < segments.length; i += 1) {
        if (current === undefined || current === null) {
            return undefined;
        }
        const segment = segments[i];
        if (Array.isArray(current) && /^\d+$/.test(segment)) {
            current = current[Number(segment)];
        } else if (Object.prototype.hasOwnProperty.call(current, segment)) {
            current = current[segment];
        } else {
            return undefined;
        }
    }
    return current;
}

/**
 * Build HTTP headers from multiple sources
 * @param {*} baseHeaders - Base headers (object, array, or Headers)
 * @param {*} extraHeaders - Extra headers to merge
 * @returns {Headers} - Headers object
 */
export function buildHeaders(baseHeaders, extraHeaders) {
    const headers = new Headers();
    [baseHeaders, extraHeaders].forEach((source) => {
        if (!source) return;
        if (source instanceof Headers) {
            source.forEach((value, key) => {
                headers.set(key, value);
            });
            return;
        }
        if (Array.isArray(source)) {
            source.forEach((entry) => {
                if (!entry) return;
                if (Array.isArray(entry) && entry.length >= 2) {
                    const [key, value] = entry;
                    if (key !== undefined && value !== undefined && value !== null) {
                        headers.set(String(key).trim(), String(value));
                    }
                } else if (typeof entry === 'object') {
                    Object.entries(entry).forEach(([key, value]) => {
                        if (key === undefined || value === undefined || value === null) return;
                        headers.set(String(key).trim(), String(value));
                    });
                } else if (typeof entry === 'string') {
                    const separator = entry.indexOf(':');
                    if (separator !== -1) {
                        const key = entry.slice(0, separator).trim();
                        const value = entry.slice(separator + 1).trim();
                        if (key) {
                            headers.set(key, value);
                        }
                    }
                }
            });
            return;
        }
        if (typeof source === 'object') {
            Object.entries(source).forEach(([key, value]) => {
                if (key === undefined || value === undefined || value === null) return;
                headers.set(String(key).trim(), String(value));
            });
        }
    });
    return headers;
}

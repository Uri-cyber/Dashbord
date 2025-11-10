/**
 * ==============================================================================
 * VALIDATION SERVICE - CENTRALIZED INPUT VALIDATION
 * ==============================================================================
 *
 * Provides comprehensive validation for all user inputs and configuration.
 * Centralizes validation logic to ensure consistency across the application.
 *
 * Usage:
 *   const result = ValidationService.validateURL('https://api.example.com');
 *   if (!result.valid) {
 *       showError(result.error);
 *   }
 *
 * @class ValidationService
 */

class ValidationService {
    /**
     * Validate a URL
     *
     * @param {string} url - URL to validate
     * @param {Object} [options] - Validation options
     * @param {boolean} [options.allowEmpty=false] - Allow empty string
     * @param {boolean} [options.requireProtocol=true] - Require http/https
     * @returns {Object} - {valid: boolean, error: string|null, sanitized: string|null}
     */
    static validateURL(url, options = {}) {
        const opts = {
            allowEmpty: false,
            requireProtocol: true,
            ...options
        };

        if (!url || typeof url !== 'string') {
            if (opts.allowEmpty && url === '') {
                return { valid: true, error: null, sanitized: '' };
            }
            return { valid: false, error: 'URL is required', sanitized: null };
        }

        const trimmed = url.trim();

        if (trimmed === '') {
            if (opts.allowEmpty) {
                return { valid: true, error: null, sanitized: '' };
            }
            return { valid: false, error: 'URL cannot be empty', sanitized: null };
        }

        // Check for protocol
        if (opts.requireProtocol && !trimmed.match(/^https?:\/\//i)) {
            return { valid: false, error: 'URL must start with http:// or https://', sanitized: null };
        }

        // Basic URL validation
        try {
            new URL(trimmed);
            return { valid: true, error: null, sanitized: trimmed };
        } catch (e) {
            return { valid: false, error: 'Invalid URL format', sanitized: null };
        }
    }

    /**
     * Validate a URL path (starts with /)
     *
     * @param {string} path - Path to validate
     * @param {Object} [options] - Validation options
     * @param {boolean} [options.allowEmpty=false] - Allow empty string
     * @returns {Object} - {valid: boolean, error: string|null, sanitized: string|null}
     */
    static validatePath(path, options = {}) {
        const opts = {
            allowEmpty: false,
            ...options
        };

        if (!path || typeof path !== 'string') {
            if (opts.allowEmpty && path === '') {
                return { valid: true, error: null, sanitized: '' };
            }
            return { valid: false, error: 'Path is required', sanitized: null };
        }

        const trimmed = path.trim();

        if (trimmed === '') {
            if (opts.allowEmpty) {
                return { valid: true, error: null, sanitized: '' };
            }
            return { valid: false, error: 'Path cannot be empty', sanitized: null };
        }

        // Path should start with /
        if (!trimmed.startsWith('/')) {
            return { valid: false, error: 'Path must start with /', sanitized: null };
        }

        return { valid: true, error: null, sanitized: trimmed };
    }

    /**
     * Validate schedule interval in seconds
     *
     * @param {number} intervalSec - Interval in seconds
     * @returns {Object} - {valid: boolean, error: string|null, sanitized: number|null}
     */
    static validateInterval(intervalSec) {
        if (intervalSec === null || intervalSec === undefined) {
            return { valid: false, error: 'Interval is required', sanitized: null };
        }

        const num = Number(intervalSec);

        if (!Number.isFinite(num)) {
            return { valid: false, error: 'Interval must be a number', sanitized: null };
        }

        if (num < INTERVALS.MIN_SCHEDULE_SEC || num > INTERVALS.MAX_SCHEDULE_SEC) {
            return {
                valid: false,
                error: `Interval must be between ${INTERVALS.MIN_SCHEDULE_SEC}-${INTERVALS.MAX_SCHEDULE_SEC} seconds`,
                sanitized: null
            };
        }

        return { valid: true, error: null, sanitized: num };
    }

    /**
     * Validate token location (json:path or header:name)
     *
     * @param {string} tokenLocation - Token location string
     * @returns {Object} - {valid: boolean, error: string|null, sanitized: string|null}
     */
    static validateTokenLocation(tokenLocation) {
        if (!tokenLocation || typeof tokenLocation !== 'string') {
            return { valid: false, error: 'Token location is required', sanitized: null };
        }

        const trimmed = tokenLocation.trim();

        if (!VALIDATION_PATTERNS.TOKEN_LOCATION.test(trimmed)) {
            return {
                valid: false,
                error: 'Token location must be "json:path" or "header:name"',
                sanitized: null
            };
        }

        return { valid: true, error: null, sanitized: trimmed };
    }

    /**
     * Validate HTTP method
     *
     * @param {string} method - HTTP method
     * @returns {Object} - {valid: boolean, error: string|null, sanitized: string|null}
     */
    static validateHTTPMethod(method) {
        const validMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

        if (!method || typeof method !== 'string') {
            return { valid: false, error: 'HTTP method is required', sanitized: null };
        }

        const upper = method.toUpperCase();

        if (!validMethods.includes(upper)) {
            return {
                valid: false,
                error: `Invalid HTTP method. Must be one of: ${validMethods.join(', ')}`,
                sanitized: null
            };
        }

        return { valid: true, error: null, sanitized: upper };
    }

    /**
     * Validate expected status codes (comma-separated string or array)
     *
     * @param {string|Array} statusCodes - Status codes
     * @returns {Object} - {valid: boolean, error: string|null, sanitized: Array|null}
     */
    static validateStatusCodes(statusCodes) {
        let codes = [];

        if (typeof statusCodes === 'string') {
            const trimmed = statusCodes.trim();
            if (trimmed === '') {
                return { valid: true, error: null, sanitized: HTTP_STATUS.DEFAULT_EXPECTED };
            }
            codes = trimmed.split(',').map(c => c.trim());
        } else if (Array.isArray(statusCodes)) {
            codes = statusCodes;
        } else {
            return { valid: false, error: 'Status codes must be string or array', sanitized: null };
        }

        const numbers = [];
        for (const code of codes) {
            const num = Number(code);
            if (!Number.isFinite(num) || num < 100 || num >= 600) {
                return {
                    valid: false,
                    error: `Invalid status code: ${code}. Must be 100-599`,
                    sanitized: null
                };
            }
            numbers.push(num);
        }

        if (numbers.length === 0) {
            return { valid: true, error: null, sanitized: HTTP_STATUS.DEFAULT_EXPECTED };
        }

        return { valid: true, error: null, sanitized: numbers };
    }

    /**
     * Validate headers text (key:value per line)
     *
     * @param {string} headersText - Headers as text
     * @param {Object} [options] - Validation options
     * @param {boolean} [options.allowEmpty=true] - Allow empty string
     * @returns {Object} - {valid: boolean, error: string|null, sanitized: Object|null, lines: Array}
     */
    static validateHeaders(headersText, options = {}) {
        const opts = {
            allowEmpty: true,
            ...options
        };

        if (!headersText || typeof headersText !== 'string') {
            if (opts.allowEmpty) {
                return { valid: true, error: null, sanitized: {}, lines: [] };
            }
            return { valid: false, error: 'Headers text is required', sanitized: null, lines: [] };
        }

        const trimmed = headersText.trim();

        if (trimmed === '') {
            if (opts.allowEmpty) {
                return { valid: true, error: null, sanitized: {}, lines: [] };
            }
            return { valid: false, error: 'Headers cannot be empty', sanitized: null, lines: [] };
        }

        const headers = {};
        const lines = trimmed.split('\n').filter(line => line.trim() !== '');
        const errors = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            const colonIndex = line.indexOf(':');

            if (colonIndex === -1) {
                errors.push(`Line ${i + 1}: Missing colon separator`);
                continue;
            }

            const key = line.substring(0, colonIndex).trim();
            const value = line.substring(colonIndex + 1).trim();

            if (!key) {
                errors.push(`Line ${i + 1}: Header name is empty`);
                continue;
            }

            if (!value) {
                errors.push(`Line ${i + 1}: Header value is empty`);
                continue;
            }

            headers[key] = value;
        }

        if (errors.length > 0) {
            return {
                valid: false,
                error: errors.join('; '),
                sanitized: null,
                lines: lines
            };
        }

        return { valid: true, error: null, sanitized: headers, lines: lines };
    }

    /**
     * Validate project name
     *
     * @param {string} name - Project name
     * @returns {Object} - {valid: boolean, error: string|null, sanitized: string|null}
     */
    static validateProjectName(name) {
        if (!name || typeof name !== 'string') {
            return { valid: false, error: 'Project name is required', sanitized: null };
        }

        const trimmed = name.trim();

        if (trimmed === '') {
            return { valid: false, error: 'Project name cannot be empty', sanitized: null };
        }

        if (trimmed.length > TEXT_LIMITS.PROJECT_NAME) {
            return {
                valid: false,
                error: `Project name too long (max ${TEXT_LIMITS.PROJECT_NAME} characters)`,
                sanitized: null
            };
        }

        return { valid: true, error: null, sanitized: trimmed };
    }

    /**
     * Validate field name
     *
     * @param {string} name - Field name
     * @param {Object} [options] - Validation options
     * @param {boolean} [options.allowEmpty=false] - Allow empty string
     * @returns {Object} - {valid: boolean, error: string|null, sanitized: string|null}
     */
    static validateFieldName(name, options = {}) {
        const opts = {
            allowEmpty: false,
            ...options
        };

        if (!name || typeof name !== 'string') {
            if (opts.allowEmpty && name === '') {
                return { valid: true, error: null, sanitized: '' };
            }
            return { valid: false, error: 'Field name is required', sanitized: null };
        }

        const trimmed = name.trim();

        if (trimmed === '') {
            if (opts.allowEmpty) {
                return { valid: true, error: null, sanitized: '' };
            }
            return { valid: false, error: 'Field name cannot be empty', sanitized: null };
        }

        if (trimmed.length > TEXT_LIMITS.FIELD_NAME) {
            return {
                valid: false,
                error: `Field name too long (max ${TEXT_LIMITS.FIELD_NAME} characters)`,
                sanitized: null
            };
        }

        return { valid: true, error: null, sanitized: trimmed };
    }

    /**
     * Validate test configuration object
     *
     * @param {Object} test - Test configuration
     * @returns {Object} - {valid: boolean, errors: Array, warnings: Array}
     */
    static validateTest(test) {
        const errors = [];
        const warnings = [];

        if (!test || typeof test !== 'object') {
            return { valid: false, errors: ['Test must be an object'], warnings: [] };
        }

        // Validate name
        if (!test.name || typeof test.name !== 'string' || test.name.trim() === '') {
            errors.push('Test name is required');
        }

        // Validate method
        const methodResult = this.validateHTTPMethod(test.method);
        if (!methodResult.valid) {
            errors.push(methodResult.error);
        }

        // Validate path
        const pathResult = this.validatePath(test.path);
        if (!pathResult.valid) {
            errors.push(`Path: ${pathResult.error}`);
        }

        // Validate expected status (optional)
        if (test.expectedStatus !== undefined && test.expectedStatus !== null) {
            const statusResult = this.validateStatusCodes(test.expectedStatus);
            if (!statusResult.valid) {
                errors.push(`Expected status: ${statusResult.error}`);
            }
        }

        // Validate headers (optional)
        if (test.headers && typeof test.headers !== 'object') {
            errors.push('Headers must be an object');
        }

        // Warnings for best practices
        if (!test.id) {
            warnings.push('Test missing unique ID');
        }

        if (test.bodyTemplate && test.method === 'GET') {
            warnings.push('GET requests typically should not have a body');
        }

        return {
            valid: errors.length === 0,
            errors: errors,
            warnings: warnings
        };
    }

    /**
     * Validate monitor configuration object
     *
     * @param {Object} monitor - Monitor configuration
     * @returns {Object} - {valid: boolean, errors: Array, warnings: Array}
     */
    static validateMonitor(monitor) {
        const errors = [];
        const warnings = [];

        if (!monitor || typeof monitor !== 'object') {
            return { valid: false, errors: ['Monitor must be an object'], warnings: [] };
        }

        // Validate base URL
        const urlResult = this.validateURL(monitor.baseUrl);
        if (!urlResult.valid) {
            errors.push(`Base URL: ${urlResult.error}`);
        }

        // Validate tests array
        if (!Array.isArray(monitor.tests)) {
            errors.push('Tests must be an array');
        } else if (monitor.tests.length === 0) {
            warnings.push('No tests configured');
        } else {
            // Validate each test
            monitor.tests.forEach((test, index) => {
                const testResult = this.validateTest(test);
                if (!testResult.valid) {
                    testResult.errors.forEach(err => {
                        errors.push(`Test ${index + 1}: ${err}`);
                    });
                }
                testResult.warnings.forEach(warn => {
                    warnings.push(`Test ${index + 1}: ${warn}`);
                });
            });
        }

        // Validate schedule (optional)
        if (monitor.schedule) {
            if (monitor.schedule.enabled && monitor.schedule.intervalSec) {
                const intervalResult = this.validateInterval(monitor.schedule.intervalSec);
                if (!intervalResult.valid) {
                    errors.push(`Schedule: ${intervalResult.error}`);
                }
            }
        }

        // Validate login (optional)
        if (monitor.login && monitor.login.enabled) {
            if (!monitor.login.username) {
                warnings.push('Login enabled but no username provided');
            }
            if (!monitor.login.password) {
                warnings.push('Login enabled but no password provided');
            }
            if (monitor.login.tokenLocation) {
                const tokenResult = this.validateTokenLocation(monitor.login.tokenLocation);
                if (!tokenResult.valid) {
                    errors.push(`Login: ${tokenResult.error}`);
                }
            }
        }

        return {
            valid: errors.length === 0,
            errors: errors,
            warnings: warnings
        };
    }

    /**
     * Show validation error in UI (helper method)
     *
     * @param {HTMLElement} element - Input element
     * @param {string} message - Error message
     */
    static showFieldError(element, message) {
        if (!element) return;

        // Add error class
        element.classList.add('input-error');

        // Remove error class after animation
        setTimeout(() => {
            element.classList.remove('input-error');
        }, 3000);

        // Show toast if available
        if (typeof showMonitorToast === 'function') {
            showMonitorToast('fail', 'Validation Error', message);
        } else {
            console.warn(`Validation Error: ${message}`);
        }
    }
}

// Freeze the class to prevent modifications
Object.freeze(ValidationService);

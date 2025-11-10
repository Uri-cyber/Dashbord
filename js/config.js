/**
 * Configuration and Constants Module
 * Contains all application constants, default templates, and configuration values
 */

// Default Monitor Template
export const DEFAULT_MONITOR_TEMPLATE = Object.freeze({
    baseUrl: "",
    login: {
        enabled: false,
        path: "/auth/login",
        method: "POST",
        username: "",
        password: "",
        bodyTemplate: "{\"user\":\"${username}\",\"password\":\"${password}\"}",
        tokenLocation: "json:token",
        tokenHeaderName: "Authorization",
        tokenPrefix: "Bearer ",
        persistPassword: true
    },
    tests: [],
    schedule: {
        enabled: false,
        intervalSec: 3600
    },
    state: {
        lastRunAt: null,
        overall: "unknown",
        tests: {},
        failures: [],
        token: null,
        tokenKind: null,
        tokenStoredAt: null,
        lastCreatedId: null
    }
});

// Monitor Configuration
export const MONITOR_CONFIG = {
    REQUEST_TIMEOUT_MS: 15000,
    SCHEDULE_POLL_INTERVAL_MS: 10000,
    MAX_TOOLTIP_TESTS_DESKTOP: 7,
    MAX_TOOLTIP_TESTS_MOBILE: 5
};

// HTTP Methods
export const HTTP_METHODS = {
    GET: 'GET',
    POST: 'POST',
    PUT: 'PUT',
    PATCH: 'PATCH',
    DELETE: 'DELETE'
};

export const MONITOR_METHODS_WITH_BODY = new Set([
    HTTP_METHODS.POST,
    HTTP_METHODS.PUT,
    HTTP_METHODS.PATCH,
    HTTP_METHODS.DELETE
]);

export const MONITOR_KNOWN_METHODS = new Set([
    HTTP_METHODS.GET,
    HTTP_METHODS.POST,
    HTTP_METHODS.PUT,
    HTTP_METHODS.PATCH,
    HTTP_METHODS.DELETE
]);

// Status Labels
export const MONITOR_RUN_STATUS_LABELS = {
    pass: 'Pass',
    partial: 'Partial',
    fail: 'Fail',
    unknown: 'Unknown'
};

export const MONITOR_TEST_STATUS_LABELS = {
    pass: 'Pass',
    fail: 'Fail',
    unknown: 'Unknown'
};

export const MONITOR_STATUS_LABELS = {
    pass: 'All tests passed',
    partial: 'Some tests failed',
    fail: 'Required tests failed',
    unknown: 'Not run'
};

export const MONITOR_STATUS_CLASSES = [
    'monitor-pass',
    'monitor-partial',
    'monitor-fail',
    'monitor-unknown'
];

// UI Text Limits
export const TEXT_LIMITS = {
    PROJECT_NAME: 20,
    FIELD_NAME: 15,
    FIELD_VALUE: 20,
    PAGE_TITLE: 45
};

// Default page title
export const DEFAULT_PAGE_TITLE = 'צוות בדיקות - סטטוס פרויקטים';

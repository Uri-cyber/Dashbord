/**
 * ==============================================================================
 * GLOBAL STATE - APPLICATION STATE MANAGEMENT
 * ==============================================================================
 *
 * Central location for all global state variables and constants used
 * throughout the application. This file must be loaded first.
 *
 * @module state-global
 */

// ============================================================================
// GLOBAL STATE VARIABLES
// ============================================================================

/** @type {Array} Stores all project entries */
let projectsData = [];

/** @type {string} Stores the page title */
let pageTitle = 'צוות בדיקות - סטטוס פרויקטים';

/** @type {number|null} Tracks the project currently being edited */
let currentProjectIndex = null;

/** @type {Array} Keeps the activity history log */
let projectHistory = [];

// ============================================================================
// MONITOR DEFAULT TEMPLATE
// ============================================================================

/**
 * Default monitor configuration template
 * Frozen to prevent accidental modifications
 */
const DEFAULT_MONITOR_TEMPLATE = Object.freeze({
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
        intervalSec: INTERVALS.MAX_SCHEDULE_SEC
    },
    state: {
        lastRunAt: null,
        overall: "unknown",
        tests: {},
        failures: [],
        // NOTE: Tokens NO LONGER stored in state (security fix)
        // Tokens now managed by TokenManager (in-memory only)
        lastCreatedId: null
    }
});

/** Cached JSON string for fast cloning */
const monitorTemplateJSON = JSON.stringify(DEFAULT_MONITOR_TEMPLATE);

/**
 * Create a fresh copy of the default monitor template
 *
 * @returns {Object} - Fresh monitor configuration object
 */
function createDefaultMonitor() {
    return JSON.parse(monitorTemplateJSON);
}

// ============================================================================
// MONITOR RUNTIME STATE
// ============================================================================

/** Monitor request timeout in milliseconds */
const MONITOR_REQUEST_TIMEOUT_MS = TIMEOUTS.REQUEST_MS;

/** Monitor schedule polling interval in milliseconds */
const MONITOR_SCHEDULE_POLL_INTERVAL_MS = TIMEOUTS.SCHEDULE_POLL_MS;

/** @type {number|null} Timer ID for scheduled monitor runs */
let monitorScheduleTimerId = null;

/** @type {Map} Stores AbortController instances for each running monitor */
const monitorRunControllers = new Map();

/** @type {Set} Tracks which projects have active monitor runs */
const monitorRunningProjects = new Set();

/** @type {Map} Stores runtime context for each monitor run */
const monitorRunContexts = new Map();

/** @type {Object} Toast notification container state */
const monitorToastState = { container: null };

// ============================================================================
// MONITOR CONSTANTS
// ============================================================================

/**
 * Human-readable labels for monitor run statuses
 */
const MONITOR_RUN_STATUS_LABELS = {
    pass: 'Pass',
    partial: 'Partial',
    fail: 'Fail',
    unknown: 'Unknown'
};

/**
 * Human-readable labels for individual test statuses
 */
const MONITOR_TEST_STATUS_LABELS = {
    pass: 'Pass',
    fail: 'Fail',
    unknown: 'Unknown'
};

/**
 * HTTP methods that support request bodies
 */
const MONITOR_METHODS_WITH_BODY = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Allowed HTTP methods for monitor tests
 */
const MONITOR_ALLOWED_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

// Freeze global constants to prevent modifications
Object.freeze(MONITOR_RUN_STATUS_LABELS);
Object.freeze(MONITOR_TEST_STATUS_LABELS);
Object.freeze(MONITOR_ALLOWED_METHODS);

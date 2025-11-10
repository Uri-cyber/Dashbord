/**
 * ==============================================================================
 * CONFIGURATION CONSTANTS
 * ==============================================================================
 *
 * Central location for all magic numbers and configuration values used
 * throughout the application. This improves maintainability and makes it
 * easy to adjust application behavior.
 *
 * Usage: Include this file before script.js in your HTML:
 * <script src="js/config-constants.js"></script>
 * <script src="script.js"></script>
 *
 * @module config-constants
 */

// ============================================================================
// TIMEOUTS & DELAYS
// ============================================================================

/**
 * Timeout durations in milliseconds
 */
const TIMEOUTS = {
    /** HTTP request timeout */
    REQUEST_MS: 15000,

    /** Toast notification display duration */
    TOAST_DISPLAY_MS: 6000,

    /** Toast fade out animation duration */
    TOAST_FADE_DURATION_MS: 240,

    /** Standard UI animation delay */
    ANIMATION_STANDARD_MS: 200,

    /** Quick UI animation delay */
    ANIMATION_QUICK_MS: 150,

    /** Very quick UI animation delay */
    ANIMATION_FAST_MS: 100,

    /** Monitor scheduler polling interval */
    SCHEDULE_POLL_MS: 10000,
};

// ============================================================================
// INTERVALS
// ============================================================================

/**
 * Schedule interval limits in seconds
 */
const INTERVALS = {
    /** Minimum allowed schedule interval (30 seconds) */
    MIN_SCHEDULE_SEC: 30,

    /** Maximum allowed schedule interval (1 hour) */
    MAX_SCHEDULE_SEC: 3600,

    /** Default schedule interval (5 minutes) */
    DEFAULT_SCHEDULE_SEC: 300,
};

// ============================================================================
// TEXT & INPUT LIMITS
// ============================================================================

/**
 * Maximum length constraints for text inputs
 */
const TEXT_LIMITS = {
    /** Maximum project name length */
    PROJECT_NAME: 20,

    /** Maximum field name length */
    FIELD_NAME: 15,

    /** Maximum field value length */
    FIELD_VALUE: 20,

    /** Maximum page title length */
    PAGE_TITLE: 45,

    /** Generic text truncation length */
    GENERIC_TEXT: 20,
};

// ============================================================================
// FIELD LIMITS
// ============================================================================

/**
 * Limits for dynamic fields
 */
const FIELD_LIMITS = {
    /** Maximum number of dynamic info fields per project */
    MAX_FIELDS: 4,

    /** Minimum number of dynamic info fields per project */
    MIN_FIELDS: 1,
};

// ============================================================================
// DISPLAY LIMITS
// ============================================================================

/**
 * UI display limits based on device type
 */
const DISPLAY_LIMITS = {
    /** Maximum tests to show in tooltip on desktop */
    TOOLTIP_TESTS_DESKTOP: 7,

    /** Maximum tests to show in tooltip on mobile */
    TOOLTIP_TESTS_MOBILE: 5,

    /** Maximum failed tests to show on desktop */
    FAILED_TESTS_DESKTOP: 5,

    /** Maximum failed tests to show on mobile */
    FAILED_TESTS_MOBILE: 3,

    /** Maximum test names to show in summary */
    SUMMARY_TEST_NAMES: 3,

    /** Maximum test names to show in short summary */
    SUMMARY_TEST_NAMES_SHORT: 2,
};

// ============================================================================
// BREAKPOINTS
// ============================================================================

/**
 * Responsive design breakpoints in pixels
 */
const BREAKPOINTS = {
    /** Mobile/tablet breakpoint */
    MOBILE: 768,
};

// ============================================================================
// HTTP STATUS CODES
// ============================================================================

/**
 * Common HTTP status codes
 */
const HTTP_STATUS = {
    /** Standard success response */
    OK: 200,

    /** Created resource response */
    CREATED: 201,

    /** No content response */
    NO_CONTENT: 204,

    /** Default expected status codes */
    DEFAULT_EXPECTED: [200],
};

// ============================================================================
// UI SPACING
// ============================================================================

/**
 * Spacing and padding values in pixels
 */
const SPACING = {
    /** Standard spacing unit */
    STANDARD: 8,

    /** Edge padding for tooltips */
    EDGE_PADDING: 8,

    /** Tooltip offset from target element */
    TOOLTIP_OFFSET: 8,
};

// ============================================================================
// VALIDATION PATTERNS
// ============================================================================

/**
 * Regular expression patterns for validation
 */
const VALIDATION_PATTERNS = {
    /** Token location pattern (json:path or header:name) */
    TOKEN_LOCATION: /^(json:[A-Za-z0-9_\.]+|header:[A-Za-z0-9\-]+)$/,
};

// ============================================================================
// INDICES & SPECIAL VALUES
// ============================================================================

/**
 * Special index values and constants
 */
const INDICES = {
    /** Invalid/not found index */
    NOT_FOUND: -1,

    /** First index */
    FIRST: 0,

    /** First field number (1-based counting) */
    FIELD_START: 1,
};

// ============================================================================
// FORMATTING
// ============================================================================

/**
 * Formatting constants
 */
const FORMATTING = {
    /** JSON stringify indentation */
    JSON_INDENT: 4,

    /** Date string padding length */
    DATE_PAD_LENGTH: 2,

    /** Date string padding character */
    DATE_PAD_CHAR: '0',

    /** Textarea default rows */
    TEXTAREA_ROWS: 3,
};

// ============================================================================
// RANDOM GENERATION
// ============================================================================

/**
 * Random number generation ranges
 */
const RANDOM = {
    /** Maximum random value for unique IDs */
    MAX_ID_RANDOM: 1000000,

    /** Maximum random value for test IDs */
    MAX_TEST_RANDOM: 1000,
};

// ============================================================================
// ACCESSIBILITY
// ============================================================================

/**
 * Accessibility-related constants
 */
const A11Y = {
    /** Tab index for focusable elements */
    FOCUSABLE: 0,

    /** Tab index for non-focusable elements */
    NOT_FOCUSABLE: -1,
};

// ============================================================================
// TEST DEFAULTS
// ============================================================================

/**
 * Default values for API tests
 */
const TEST_DEFAULTS = {
    /** Default expected status codes */
    EXPECTED_STATUS: [200],

    /** Default status code list as CSV */
    EXPECTED_STATUS_CSV: '200,204',
};

// ============================================================================
// MONITOR STATE
// ============================================================================

/**
 * Monitor state default values
 */
const MONITOR_STATE = {
    /** Initial test counts */
    INITIAL_COUNTS: {
        total: 0,
        pass: 0,
        fail: 0,
        unknown: 0,
        requiredFail: 0,
    },

    /** Initial project counts */
    INITIAL_PROJECT: {
        totalTests: 0,
        passedTests: 0,
    },
};

// ============================================================================
// NAVIGATION
// ============================================================================

/**
 * Keyboard navigation constants
 */
const NAVIGATION = {
    /** Direction: forward/next */
    FORWARD: 1,

    /** Direction: backward/previous */
    BACKWARD: -1,

    /** Direction: none/neutral */
    NONE: 0,
};

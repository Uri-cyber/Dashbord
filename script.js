/**
 * ==============================================================================
 * DASHBOARD APPLICATION - MAIN SCRIPT
 * ==============================================================================
 * 
 * Description: API Monitoring & Testing Dashboard
 * Version: 2.0.0 (Refactored)
 * Last Updated: 2025-11-10
 * 
 * ==============================================================================
 * FILE ORGANIZATION
 * ==============================================================================
 * 
 * This file contains ~4000 lines organized into the following sections:
 * 
 * 1. GLOBAL VARIABLES & STATE (lines 1-100)
 *    - projectsData: Array of project objects
 *    - pageTitle: Dashboard title
 *    - currentProjectIndex: Currently edited project
 *    - projectHistory: Change history log
 *    - Monitor state management
 * 
 * 2. CONFIGURATION & CONSTANTS (lines 100-500)
 *    - DEFAULT_MONITOR_TEMPLATE: Monitor configuration template
 *    - MONITOR_CONFIG: Timeouts and intervals
 *    - HTTP_METHODS: HTTP method constants
 *    - Status labels and UI text
 * 
 * 3. MONITOR & API TESTING (lines 500-1500)
 *    - Monitor run management
 *    - API request execution
 *    - Test result processing
 *    - Login/authentication handling
 *    - Token management
 * 
 * 4. UI MANAGEMENT & RENDERING (lines 1500-2500)
 *    - Project card rendering
 *    - Status indicator updates
 *    - Tooltip management
 *    - Tab system
 *    - Toast notifications
 * 
 * 5. MODAL HANDLERS (lines 2500-3500)
 *    - Edit project modal
 *    - Add project modal
 *    - History modal
 *    - Monitor tabs UI
 *    - Form handling
 * 
 * 6. EVENT LISTENERS & INITIALIZATION (lines 3500-4030)
 *    - Theme toggle
 *    - File upload/download
 *    - Window load event
 *    - Connectivity checking
 *    - Scheduler initialization
 * 
 * ==============================================================================
 * MODULAR COMPONENTS (Optional)
 * ==============================================================================
 * 
 * For better organization, some functionality has been extracted to modules:
 * 
 * - js/config.js:   Configuration constants (optional import)
 * - js/utils.js:    Utility functions (optional import)
 * - js/storage.js:  localStorage operations (optional import)
 * 
 * These modules can be imported using ES6 modules for better code organization.
 * See REFACTORING.md for migration guide.
 * 
 * ==============================================================================
 * KEY FEATURES
 * ==============================================================================
 * 
 * - Project Management: CRUD operations for projects
 * - API Monitoring: Automated API health checks
 * - Test Automation: Run test suites against APIs
 * - Authentication: JWT token management
 * - Scheduling: Automatic test runs at intervals
 * - History Tracking: Audit log of all changes
 * - Dark Mode: Theme toggle support
 * - RTL Support: Hebrew language support
 * - Mobile Responsive: Works on all devices
 * 
 * ==============================================================================
 * SECURITY NOTES
 * ==============================================================================
 * 
 * - All user input is sanitized via escapeHTML()
 * - Tokens stored in localStorage (non-production only)
 * - CORS-aware requests
 * - No eval() or unsafe code execution
 * 
 * ==============================================================================
 */

// Global Variables
let projectsData = []; // Stores all project entries
let pageTitle = 'צוות בדיקות - סטטוס פרויקטים'; // Stores the page title
let currentProjectIndex = null; // Tracks the project currently being edited
let projectHistory = []; // Keeps the activity history log

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

const monitorTemplateJSON = JSON.stringify(DEFAULT_MONITOR_TEMPLATE);

function createDefaultMonitor() {
    return JSON.parse(monitorTemplateJSON);
}

const MONITOR_REQUEST_TIMEOUT_MS = TIMEOUTS.REQUEST_MS;
const MONITOR_SCHEDULE_POLL_INTERVAL_MS = TIMEOUTS.SCHEDULE_POLL_MS;
let monitorScheduleTimerId = null;
const monitorRunControllers = new Map();
const monitorRunningProjects = new Set();
const monitorRunContexts = new Map();
const monitorToastState = { container: null };
const MONITOR_RUN_STATUS_LABELS = {
    pass: 'Pass',
    partial: 'Partial',
    fail: 'Fail',
    unknown: 'Unknown'
};
const MONITOR_TEST_STATUS_LABELS = {
    pass: 'Pass',
    fail: 'Fail',
    unknown: 'Unknown'
};
const MONITOR_METHODS_WITH_BODY = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
function getMonitorRunContext(index) {
    let context = monitorRunContexts.get(index);
    if (!context) {
        context = {
            index,
            buttons: { card: null, modal: null },
            controllers: new Set(),
            startedAt: null,
            token: null,
            tokenKind: null,
            lastCreatedId: null,
            aborted: false,
            mode: 'manual',
            loginResult: null,
            runController: null,
            source: 'card'
        };
        monitorRunContexts.set(index, context);
    } else {
        context.index = index;
    }
    return context;
}

function resetMonitorRunContext(context, mode) {
    context.mode = mode || 'manual';
    context.startedAt = new Date().toISOString();
    context.token = null;
    context.tokenKind = null;
    context.lastCreatedId = null;
    context.loginResult = null;
    context.aborted = false;
    context.source = 'card';
    if (!context.controllers) {
        context.controllers = new Set();
    } else {
        const pending = Array.from(context.controllers);
        pending.forEach((entry) => {
            if (!entry) return;
            window.clearTimeout(entry.timeoutId);
        });
        context.controllers.clear();
    }
}

function trackMonitorRunController(context, controller) {
    if (!context.controllers) {
        context.controllers = new Set();
    }
    const entry = {
        controller,
        timedOut: false,
        timeoutId: null,
        abortHandler: null
    };
    entry.timeoutId = window.setTimeout(() => {
        entry.timedOut = true;
        try {
            controller.abort();
        } catch (error) {
            console.warn('Failed to abort timed-out request:', error);
        }
    }, MONITOR_REQUEST_TIMEOUT_MS);
    const runController = context.runController;
    if (runController) {
        if (runController.signal.aborted) {
            controller.abort();
        } else {
            entry.abortHandler = () => {
                try {
                    controller.abort();
                } catch (error) {
                    console.warn('Failed to abort request via run controller:', error);
                }
            };
            runController.signal.addEventListener('abort', entry.abortHandler);
        }
    }
    context.controllers.add(entry);
    return entry;
}

function releaseMonitorRunController(context, entry) {
    if (!entry) return;
    window.clearTimeout(entry.timeoutId);
    if (entry.abortHandler && context.runController) {
        try {
            context.runController.signal.removeEventListener('abort', entry.abortHandler);
        } catch (error) {
            console.warn('Failed to detach abort handler:', error);
        }
    }
    if (context.controllers) {
        context.controllers.delete(entry);
    }
}

function getMonitorRunButtons(index) {
    const context = monitorRunContexts.get(index);
    if (!context || !context.buttons) {
        return [];
    }
    const buttons = [];
    const { card, modal } = context.buttons;
    if (card && card.isConnected) {
        buttons.push(card);
    }
    if (modal && modal.isConnected) {
        buttons.push(modal);
    }
    return buttons;
}

function applyMonitorRunButtonState(button, isRunning) {
    if (!button) return;
    const label = button.querySelector('.monitor-run-label');
    if (label) {
        label.textContent = isRunning ? 'Running...' : 'Run Now';
    }
    button.classList.toggle('is-running', Boolean(isRunning));
    button.disabled = Boolean(isRunning);
    if (isRunning) {
        button.setAttribute('aria-busy', 'true');
    } else {
        button.removeAttribute('aria-busy');
    }
}

function syncMonitorRunButtons(index) {
    const buttons = getMonitorRunButtons(index);
    const isRunning = monitorRunningProjects.has(index);
    buttons.forEach((button) => {
        if (!button) return;
        applyMonitorRunButtonState(button, isRunning);
        // Preview badge in modal when editing
        if (button.dataset.monitorRunSource === 'modal') {
            const existing = button.querySelector('.monitor-preview-badge');
            const shouldShow = Boolean(monitorEditContext && monitorEditContext.isEditing);
            if (shouldShow && !existing) {
                const badge = document.createElement('span');
                badge.className = 'monitor-preview-badge';
                badge.textContent = 'Preview';
                button.appendChild(badge);
            } else if (!shouldShow && existing) {
                existing.remove();
            }
        }
    });
}

function registerMonitorRunButton(index, button, source) {
    if (!button) return;
    const context = getMonitorRunContext(index);
    if (!context.buttons) {
        context.buttons = { card: null, modal: null };
    }
    if (source === 'modal') {
        context.buttons.modal = button;
    } else {
        context.buttons.card = button;
    }
    button.dataset.projectIndex = String(index);
    button.dataset.monitorRunSource = source || 'card';
    if (!button.dataset.monitorRunBound) {
        button.addEventListener('click', (event) => {
            const target = event.currentTarget;
            if (!target) return;
            const idx = Number(target.dataset.projectIndex);
            if (Number.isNaN(idx)) return;
            const src = target.dataset.monitorRunSource || 'card';
            event.preventDefault();
            if (src === 'card') {
                event.stopPropagation();
            }
            // If running from modal while editing, perform a preview run without saving
            if (src === 'modal' && monitorEditContext && monitorEditContext.isEditing) {
                runProjectPreview(idx);
                return;
            }
            handleMonitorRunClick(idx, { mode: 'manual', source: src });
        });
        button.dataset.monitorRunBound = 'true';
    }
    applyMonitorRunButtonState(button, monitorRunningProjects.has(index));
    // In preview mode we keep the button enabled in the modal
}

function ensureMonitorToastContainer() {
    if (monitorToastState.container && document.body.contains(monitorToastState.container)) {
        return monitorToastState.container;
    }
    const container = document.createElement('div');
    container.className = 'monitor-toast-container';
    document.body.appendChild(container);
    monitorToastState.container = container;
    return container;
}

function removeMonitorToast(toast, delay) {
    if (!toast) return;
    window.setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(8px)';
        window.setTimeout(() => {
            if (toast.parentElement) {
                const parent = toast.parentElement;
                parent.removeChild(toast);
                if (!parent.childElementCount && parent === monitorToastState.container) {
                    parent.remove();
                    monitorToastState.container = null;
                }
            }
        }, TIMEOUTS.TOAST_FADE_DURATION_MS);
    }, delay);
}

function showMonitorToast(status, title, body) {
    try {
        const container = ensureMonitorToastContainer();
        const toast = document.createElement('div');
        const variant = MONITOR_RUN_STATUS_LABELS[status] ? status : 'unknown';
        toast.className = `monitor-toast monitor-toast--${variant}`;
        const titleEl = document.createElement('div');
        titleEl.className = 'monitor-toast__title';
        titleEl.textContent = title;
        toast.appendChild(titleEl);
        if (body) {
            const bodyEl = document.createElement('div');
            bodyEl.className = 'monitor-toast__body';
            bodyEl.textContent = body;
            toast.appendChild(bodyEl);
        }
        container.appendChild(toast);
        removeMonitorToast(toast, TIMEOUTS.TOAST_DISPLAY_MS);
    } catch (error) {
        console.warn('Failed to show monitor toast:', error);
    }
}

function isMonitorRunActive(index) {
    return monitorRunningProjects.has(index);
}

function beginMonitorRun(index, context) {
    monitorRunningProjects.add(index);
    context.runController = new AbortController();
    monitorRunControllers.set(index, context.runController);
    syncMonitorRunButtons(index);
}

function endMonitorRun(index, context) {
    monitorRunningProjects.delete(index);
    monitorRunControllers.delete(index);
    if (context.controllers && context.controllers.size) {
        const entries = Array.from(context.controllers);
        entries.forEach((entry) => {
            releaseMonitorRunController(context, entry);
        });
        context.controllers.clear();
    }
    context.runController = null;
    syncMonitorRunButtons(index);
}

function cancelMonitorRun(index, reason) {
    const context = monitorRunContexts.get(index);
    if (!context || !monitorRunningProjects.has(index)) {
        return;
    }
    context.aborted = true;
    const runController = monitorRunControllers.get(index) || context.runController;
    if (runController && !runController.signal.aborted) {
        try {
            runController.abort();
        } catch (error) {
            console.warn('Failed to abort run controller:', error);
        }
    }
    if (context.controllers && context.controllers.size) {
        context.controllers.forEach((entry) => {
            if (!entry) return;
            window.clearTimeout(entry.timeoutId);
            try {
                entry.controller.abort();
            } catch (error) {
                console.warn('Failed to abort request during cancel:', error);
            }
        });
        context.controllers.clear();
    }
}


function renderMonitorTemplate(template, project, context) {
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
        random: String(Math.floor(Math.random() * RANDOM.MAX_ID_RANDOM)),
        lastCreatedId: context && context.lastCreatedId !== undefined && context.lastCreatedId !== null ? String(context.lastCreatedId) : ''
    };
    return str.replace(/\$\{([a-zA-Z0-9_]+)\}/g, (match, key) => {
        if (Object.prototype.hasOwnProperty.call(replacements, key)) {
            return replacements[key];
        }
        return '';
    });
}

function buildMonitorUrl(baseUrl, path) {
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

function buildHeaders(baseHeaders, extraHeaders) {
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

function extractJsonPath(target, path) {
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

function summarizeMonitorResults(results) {
    const summary = {
        total: 0,
        pass: 0,
        fail: 0,
        unknown: 0,
        requiredFail: 0
    };
    if (!Array.isArray(results) || !results.length) {
        return summary;
    }
    summary.total = results.length;
    results.forEach((result) => {
        if (!result) return;
        if (result.status === 'pass') {
            summary.pass += 1;
        } else if (result.status === 'fail') {
            summary.fail += 1;
            if (result.required) {
                summary.requiredFail += 1;
            }
        } else {
            summary.unknown += 1;
        }
    });
    return summary;
}

function computeOverall(results) {
    if (!Array.isArray(results) || results.length === 0) {
        return 'unknown';
    }
    
    // 1. אם יש טסט required שנפל → FAIL
    const hasRequiredFail = results.some((result) => result && result.required && result.status === 'fail');
    if (hasRequiredFail) {
        return 'fail';
    }
    
    // 2. אם כל הטסטים עברו (כולל non-required) → PASS
    const allPass = results.every((result) => result && result.status === 'pass');
    if (allPass) {
        return 'pass';
    }
    
    // 3. אם כל ה-required עברו אבל יש non-required שנפלו → PARTIAL
    const allRequiredPass = results
        .filter((result) => result && result.required)
        .every((result) => result.status === 'pass');
    
    const hasNonRequiredFail = results.some((result) => 
        result && !result.required && result.status === 'fail'
    );
    
    if (allRequiredPass && hasNonRequiredFail) {
        return 'partial';  // אזהרה: יש non-required שנפלו
    }
    
    // 4. אם כל ה-required עברו וגם אין non-required שנפלו → PASS
    if (allRequiredPass) {
        return 'pass';
    }
    
    // 5. אחרת → unknown
    return 'unknown';
}

function persistRunResult(project, index, results, context) {
    if (!project.monitor) {
        project.monitor = createDefaultMonitor();
    }
    const monitor = project.monitor;
    if (!monitor.state) {
        monitor.state = {};
    }
    const finishedAt = new Date().toISOString();
    const overall = computeOverall(results);
    const failures = [];
    const testsState = {};
    if (Array.isArray(results)) {
        results.forEach((result) => {
            if (!result) return;
            testsState[result.id] = {
                status: result.status,
                lastCode: result.lastCode === undefined ? null : result.lastCode,
                lastError: result.lastError || null
            };
            if (result.status !== 'pass') {
                failures.push({
                    id: result.id,
                    name: result.name || result.id,
                    code: result.lastCode === undefined ? null : result.lastCode,
                    error: result.lastError || null
                });
            }
        });
    }
    monitor.state.lastRunAt = finishedAt;
    monitor.state.overall = overall;
    monitor.state.failures = failures;
    monitor.state.tests = testsState;
    monitor.state.lastCreatedId = context.lastCreatedId ?? null;
    
    // SECURITY FIX: Use TokenManager for secure in-memory token storage
    // Tokens are NO LONGER stored in localStorage (prevents XSS attacks)
    if (context.token) {
        TokenManager.setToken(index, context.token, context.tokenKind);
    } else {
        // Clear token if no new token was obtained
        TokenManager.clearToken(index);
    }

    // Remove legacy token fields from state (no longer used)
    delete monitor.state.token;
    delete monitor.state.tokenKind;
    delete monitor.state.tokenStoredAt;
    
    // Use SafeStorage for error-handled localStorage operations
    SafeStorage.setJSON('projectsData', projectsData);
    updateMonitorIndicatorsForProject(index);
}

function updateMonitorIndicatorsForProject(index) {
    const project = projectsData[index];
    if (!project) return;
    
    // עדכון אינדיקטור הנורה הקיימת
    const cards = document.querySelectorAll('.card');
    cards.forEach((card) => {
        const cardIndex = parseInt(card.dataset.index || '-1');
        if (cardIndex === index) {
            // מעדכנים את הנורה ליד הכותרת
            const statusIndicator = card.querySelector('.status-indicator');
            if (statusIndicator) {
                statusIndicator.classList.remove('url-up', 'url-down', 'url-unknown');
                
                // בדיקת סטטוס ה-URL
                if (project.url && project.url.trim()) {
                    statusIndicator.classList.add('url-up');
                    statusIndicator.title = 'URL is reachable';
                } else {
                    statusIndicator.classList.add('url-unknown');
                    statusIndicator.title = 'No URL configured';
                }
            }
            
            // מעדכנים את שורת ה-Tests
            const testsRow = card.querySelector('.monitor-tests-status');
            if (testsRow) {
                const testsStatus = determineMonitorStatus(project);
                const testsValue = testsRow.querySelector('.monitor-tests-value');
                if (testsValue) {
                    testsValue.className = `monitor-tests-value status-${testsStatus.status.toLowerCase().replace('_', '-')}`;
                    testsValue.textContent = testsStatus.label;
                    testsValue.removeAttribute('title');
                    testsValue.setAttribute('aria-label', testsStatus.tooltip);
                }
                
                // עדכון זמן ריצה אחרונה
                let lastRunTime = testsRow.querySelector('.monitor-last-run-time');
                if (project.monitor && project.monitor.state && project.monitor.state.lastRunAt) {
                    const formatted = formatMonitorLastRun(project.monitor.state.lastRunAt);
                    if (lastRunTime) {
                        lastRunTime.textContent = formatted ? `Last run: ${formatted}` : '';
                    } else {
                        // אם אין אלמנט, ניצור אותו
                        lastRunTime = document.createElement('span');
                        lastRunTime.className = 'monitor-last-run-time';
                        lastRunTime.textContent = formatted ? `Last run: ${formatted}` : '';
                        testsRow.appendChild(lastRunTime);
                    }
                } else if (lastRunTime) {
                    // אם אין lastRunAt, נסיר את האלמנט
                    lastRunTime.remove();
                }
            }
        }
    });
    
    // עדכון אינדיקטורים ישנים (למקרה שיש)
    const indicators = document.querySelectorAll(`.monitor-indicator[data-monitor-index="${index}"]`);
    indicators.forEach((indicator) => {
        const card = indicator.closest('.card');
        const lastRunEl = card ? card.querySelector('.monitor-last-run') : null;
        updateMonitorIndicator(project, indicator, lastRunEl);
    });
}

async function monitorFetch(url, options, context) {
    const fetchOptions = { ...options };
    const controller = new AbortController();
    const entry = trackMonitorRunController(context, controller);
    fetchOptions.signal = controller.signal;
    let response;
    let errorResult = null;
    try {
        response = await fetch(url, fetchOptions);
        if (response.type === 'opaque') {
            errorResult = { error: 'cors-opaque' };
        }
    } catch (error) {
        if (error && error.name === 'AbortError') {
            if (entry.timedOut) {
                errorResult = { error: 'timeout' };
            } else if (context.aborted) {
                errorResult = { error: 'aborted' };
            } else {
                errorResult = { error: 'timeout' };
            }
        } else {
            errorResult = { error: 'network' };
        }
    } finally {
        releaseMonitorRunController(context, entry);
    }
    if (errorResult) {
        return errorResult;
    }
    return { response };
}

async function performLogin(project, context) {
    const monitor = project.monitor || {};
    const login = monitor.login || {};
    if (!login.enabled) {
        const skipped = { status: 'skipped' };
        context.loginResult = skipped;
        return skipped;
    }
    if (!monitor.baseUrl) {
        const missing = { status: 'error', error: 'missing-base-url' };
        context.loginResult = missing;
        return missing;
    }
    const method = (login.method || 'POST').toUpperCase();
    const path = renderMonitorTemplate(login.path || '', project, context);
    const url = buildMonitorUrl(monitor.baseUrl, path);
    const headers = buildHeaders(login.headers || null, null);
    const requestInit = {
        method,
        headers
    };
    if (MONITOR_METHODS_WITH_BODY.has(method)) {
        const body = renderMonitorTemplate(login.bodyTemplate || '', project, context).trim();
        if (body) {
            requestInit.body = body;
            if (headers instanceof Headers && !headers.has('Content-Type')) {
                if (body.startsWith('{') || body.startsWith('[')) {
                    headers.set('Content-Type', 'application/json');
                }
            }
        }
    }
    
    // DEBUG: Log login request details
    console.log('🔐 Login Request:', {
        url,
        method,
        body: requestInit.body,
        headers: headers instanceof Headers ? Object.fromEntries(headers.entries()) : headers
    });
    const { response, error } = await monitorFetch(url, requestInit, context);
    if (error) {
        const loginError = { status: 'error', error };
        if (error === 'aborted') {
            context.aborted = true;
        }
        context.token = null;
        context.tokenKind = null;
        context.loginResult = loginError;
        return loginError;
    }
    if (!response.ok) {
        const failResult = { status: 'error', error: `http-${response.status}`, code: response.status };
        context.token = null;
        context.tokenKind = null;
        context.loginResult = failResult;
        return failResult;
    }
    const tokenLocation = (login.tokenLocation || '').trim();
    let token = null;
    if (tokenLocation.startsWith('json:')) {
        const selector = tokenLocation.slice(5);
        try {
            const data = await response.clone().json();
            token = extractJsonPath(data, selector);
        } catch (parseError) {
            console.warn('Failed to parse login JSON payload:', parseError);
        }
    } else if (tokenLocation.startsWith('header:')) {
        const headerName = tokenLocation.slice(7).trim();
        if (headerName) {
            token = response.headers.get(headerName);
        }
    }
    if (token) {
        context.token = String(token);
        context.tokenKind = tokenLocation;
        const success = { status: 'success', code: response.status };
        context.loginResult = success;
        return success;
    }
    const missingToken = { status: 'error', error: 'token-missing', code: response.status };
    context.token = null;
    context.tokenKind = null;
    context.loginResult = missingToken;
    return missingToken;
}

async function executeTest(project, test, context, index) {
    const monitor = project.monitor || {};
    const baseUrl = monitor.baseUrl;
    const testId = test && test.id ? test.id : `test-${index + 1}`;
    const testName = test && test.name ? test.name : testId;
    const required = Boolean(test && test.required);
    const requiresLogin = Boolean(test && test.requiresLogin);
    if (!baseUrl) {
        return {
            id: testId,
            name: testName,
            required,
            status: 'unknown',
            lastCode: null,
            lastError: 'missing-base-url'
        };
    }
    if (requiresLogin) {
        if (!context.loginResult || context.loginResult.status !== 'success' || !context.token) {
            const errorLabel = context.loginResult && context.loginResult.error ? context.loginResult.error : 'auth-missing';
            return {
                id: testId,
                name: testName,
                required,
                status: 'unknown',
                lastCode: null,
                lastError: errorLabel
            };
        }
    }
    const method = (test.method || 'GET').toUpperCase();
    const path = renderMonitorTemplate(test.path || '', project, context);
    const url = buildMonitorUrl(baseUrl, path);
    const headers = buildHeaders(monitor.headers || null, test.headers || null);
    const login = monitor.login || {};
    if (requiresLogin && context.token && login.tokenHeaderName) {
        headers.set(login.tokenHeaderName, `${login.tokenPrefix || ''}${context.token}`);
    }
    const requestInit = {
        method,
        headers
    };
    if (MONITOR_METHODS_WITH_BODY.has(method)) {
        const body = renderMonitorTemplate(test.bodyTemplate || '', project, context);
        if (body) {
            requestInit.body = body;
            if (headers instanceof Headers && !headers.has('Content-Type')) {
                const trimmed = body.trim();
                if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
                    headers.set('Content-Type', 'application/json');
                }
            }
        }
    }
    const { response, error } = await monitorFetch(url, requestInit, context);
    if (error) {
        if (error === 'aborted') {
            context.aborted = true;
        }
        return {
            id: testId,
            name: testName,
            required,
            status: 'unknown',
            lastCode: null,
            lastError: error
        };
    }
    let expectedStatuses = Array.isArray(test.expectedStatus) && test.expectedStatus.length ? test.expectedStatus.map((value) => Number(value)).filter((value) => Number.isFinite(value)) : HTTP_STATUS.DEFAULT_EXPECTED;
    if (!expectedStatuses.length) {
        expectedStatuses = HTTP_STATUS.DEFAULT_EXPECTED;
    }
    const statusCode = response.status;
    const passed = expectedStatuses.includes(statusCode);
    const result = {
        id: testId,
        name: testName,
        required,
        status: passed ? 'pass' : 'fail',
        lastCode: statusCode,
        lastError: passed ? null : 'unexpected-status'
    };
    if (passed && MONITOR_CREATION_METHODS.has(method)) {
        try {
            const contentType = response.headers.get('content-type') || '';
            if (contentType.includes('application/json')) {
                const payload = await response.clone().json();
                const identifier = payload && (payload.id ?? extractJsonPath(payload, 'id'));
                if (identifier !== undefined && identifier !== null) {
                    context.lastCreatedId = identifier;
                }
            }
        } catch (parseError) {
            console.warn('Failed to parse test response JSON:', parseError);
        }
    }
    return result;
}

async function handleMonitorRunClick(index, options) {
    // Use MonitorQueue to prevent race conditions
    const opts = options || { mode: 'manual' };

    try {
        await MonitorQueue.enqueue(index, async () => {
            return await runProjectChecks(index, opts);
        }, opts);
    } catch (error) {
        console.error('Manual run failed:', error);
        monitorRunningProjects.delete(index);
        showMonitorToast('fail', 'Run failed', 'Unexpected error during manual run.');
        syncMonitorRunButtons(index);
    }
}

/**
 * Prepare monitor run - validate project and setup context
 *
 * @param {number} index - Project index
 * @param {Object} options - Run options (mode, source, preview)
 * @returns {Object|null} - { project, monitor, context, isPreview } or null if invalid
 */
function prepareMonitorRun(index, options = {}) {
    const project = projectsData[index];
    if (!project) {
        showMonitorToast('unknown', 'Run skipped', 'Project not found.');
        return null;
    }
    if (!project.monitor) {
        showMonitorToast('unknown', 'Run skipped', 'Monitor is not configured for this project.');
        return null;
    }

    const isPreview = Boolean(options && options.preview);
    const context = getMonitorRunContext(index);
    resetMonitorRunContext(context, options.mode || 'manual');
    context.source = options && options.source ? options.source : 'card';

    // SECURITY FIX: Load existing token from TokenManager (secure in-memory storage)
    const storedToken = TokenManager.getToken(index);
    console.log('🔍 Checking for existing token in TokenManager:', {
        hasToken: !!storedToken,
        tokenKind: storedToken?.tokenKind
    });

    if (storedToken) {
        context.token = storedToken.token;
        context.tokenKind = storedToken.tokenKind;
        console.log('✅ Loaded existing token from TokenManager');
    } else {
        console.log('❌ No existing token found in TokenManager');
    }

    beginMonitorRun(index, context);

    return {
        project,
        monitor: project.monitor,
        context,
        isPreview
    };
}

/**
 * Execute login if configured for the monitor
 *
 * @param {Object} project - Project data
 * @param {Object} context - Monitor run context
 * @returns {Promise<boolean>} - True if successful or not needed, false if aborted
 */
async function executeLoginIfNeeded(project, context) {
    await performLogin(project, context);
    return !context.aborted;
}

/**
 * Execute all monitor tests
 *
 * @param {Object} project - Project data
 * @param {Array} tests - Array of test configurations
 * @param {Object} context - Monitor run context
 * @param {Object} monitor - Monitor configuration
 * @returns {Promise<Object>} - { results, shortCircuitReason }
 */
async function executeAllMonitorTests(project, tests, context, monitor) {
    const results = [];
    let shortCircuitReason = null;

    if (!monitor.baseUrl) {
        shortCircuitReason = 'missing-base-url';
        results.push({
            id: 'base-url',
            name: 'Base URL not configured',
            required: true,
            status: 'unknown',
            lastCode: null,
            lastError: 'missing-base-url'
        });
        return { results, shortCircuitReason };
    }

    const loginSuccess = await executeLoginIfNeeded(project, context);
    if (!loginSuccess) {
        return { results, shortCircuitReason };
    }

    if (!tests.length) {
        results.push({
            id: 'no-tests',
            name: 'No tests configured',
            required: false,
            status: 'unknown',
            lastCode: null,
            lastError: 'no-tests'
        });
    } else {
        for (let i = 0; i < tests.length; i += 1) {
            const test = tests[i];
            const result = await executeTest(project, test, context, i);
            results.push(result);
            if (context.aborted) {
                break;
            }
        }
    }

    return { results, shortCircuitReason };
}

/**
 * Finalize monitor run - persist results and show notifications
 *
 * @param {Object} project - Project data
 * @param {number} index - Project index
 * @param {Array} results - Test results array
 * @param {Object} context - Monitor run context
 * @param {Error|null} runError - Run error if any
 * @param {string|null} shortCircuitReason - Short circuit reason
 * @param {boolean} isPreview - Preview mode flag
 */
function finalizeMonitorRun(project, index, results, context, runError, shortCircuitReason, isPreview) {
    if (context.aborted) {
        showMonitorToast('unknown', 'Run canceled', 'Manual run was canceled.');
        return;
    }

    if (runError) {
        console.error('Manual monitor run failed:', runError);
        showMonitorToast('fail', 'Run failed', 'Unexpected error during manual run.');
        return;
    }

    if (shortCircuitReason === 'missing-base-url') {
        if (!isPreview) {
            persistRunResult(project, index, results, context);
        }
        showMonitorToast('unknown', 'Run incomplete', 'Base URL is missing for this project.');
        return;
    }

    if (!isPreview) {
        persistRunResult(project, index, results, context);
    }

    const overall = computeOverall(results);
    const summary = summarizeMonitorResults(results);
    const overallLabel = MONITOR_RUN_STATUS_LABELS[overall] || overall;
    const failedTests = Array.isArray(results) ? results.filter(r => r && r.status === 'fail') : [];
    const unknownTests = Array.isArray(results) ? results.filter(r => r && r.status === 'unknown') : [];

    let toastBody = `${summary.pass}/${summary.total} passed (${summary.fail} failed, ${summary.unknown} unknown)`;
    if (failedTests.length > 0) {
        const names = failedTests.slice(0, 2).map(r => r.name || r.id).filter(Boolean);
        const total = failedTests.length;
        if (total <= 2) {
            toastBody = `Failed: ${names.join(', ')}`;
        } else {
            toastBody = `Failed: ${names.join(', ')} (${total} total)`;
        }
    } else if (unknownTests.length > 0) {
        toastBody = `${summary.pass}/${summary.total} passed, ${unknownTests.length} unknown`;
    }

    showMonitorToast(overall, `Run completed: ${overallLabel}`, toastBody);
}

/**
 * Run all monitor checks for a project
 *
 * Orchestrates the complete monitor run by calling specialized helper functions.
 *
 * @param {number} index - Project index
 * @param {Object} options - Run options (mode, source, preview)
 */
async function runProjectChecks(index, options = {}) {
    // Prepare monitor run - validate and setup context
    const prepared = prepareMonitorRun(index, options);
    if (!prepared) {
        return;
    }

    const { project, monitor, context, isPreview } = prepared;
    const tests = Array.isArray(monitor.tests) ? monitor.tests : [];
    let results = [];
    let runError = null;
    let shortCircuitReason = null;

    try {
        // Execute all tests (includes login if needed)
        const testResult = await executeAllMonitorTests(project, tests, context, monitor);
        results = testResult.results;
        shortCircuitReason = testResult.shortCircuitReason;
    } catch (error) {
        runError = error;
    } finally {
        endMonitorRun(index, context);
    }

    // Finalize monitor run - persist and notify
    finalizeMonitorRun(project, index, results, context, runError, shortCircuitReason, isPreview);
}

function runScheduledMonitorCycle() {
    if (!Array.isArray(projectsData) || !projectsData.length) {
        return;
    }
    const now = Date.now();
    projectsData.forEach((project, index) => {
        if (!project || typeof project !== 'object') return;
        const monitor = project.monitor;
        if (!monitor) return;
        const schedule = monitor.schedule;
        if (!schedule || !schedule.enabled) return;
        // Use MonitorQueue instead of manual check to prevent race conditions
        if (MonitorQueue.isRunning(index)) return;
        if (monitorEditContext && monitorEditContext.isEditing && monitorEditContext.projectIndex === index) return;
        const intervalSec = Number(schedule.intervalSec);
        if (!Number.isFinite(intervalSec) || intervalSec <= 0) return;
        const intervalMs = Math.max(intervalSec, INTERVALS.MIN_SCHEDULE_SEC) * 1000;
        const state = monitor.state || {};
        const lastRunAt = state.lastRunAt ? Date.parse(state.lastRunAt) : null;
        const due = !lastRunAt || Number.isNaN(lastRunAt) || (now - lastRunAt) >= intervalMs;
        if (!due) return;

        // Use MonitorQueue to prevent race conditions
        MonitorQueue.enqueue(index, async () => {
            return await runProjectChecks(index, { mode: 'schedule', source: 'schedule' });
        }, { mode: 'schedule', source: 'schedule' }).catch((error) => {
            console.error('Scheduled monitor run failed:', error);
        });
    });
}

function startMonitorScheduler() {
    if (monitorScheduleTimerId !== null) {
        return;
    }
    monitorScheduleTimerId = window.setInterval(runScheduledMonitorCycle, MONITOR_SCHEDULE_POLL_INTERVAL_MS);
    runScheduledMonitorCycle();
}

function stopMonitorScheduler() {
    if (monitorScheduleTimerId !== null) {
        window.clearInterval(monitorScheduleTimerId);
        monitorScheduleTimerId = null;
    }
}

const MONITOR_CREATION_METHODS = new Set(['POST']);

// ============== Monitor Tests Tooltip Management ==============
const monitorTestsTooltipState = {
    activeTooltip: null,
    activeButton: null,
    closeTimer: null
};

/**
 * Closes all open monitor tests tooltips
 */
function closeAllMonitorTestsTooltips() {
    if (monitorTestsTooltipState.closeTimer) {
        clearTimeout(monitorTestsTooltipState.closeTimer);
        monitorTestsTooltipState.closeTimer = null;
    }
    
    if (monitorTestsTooltipState.activeTooltip) {
        if (monitorTestsTooltipState.activeTooltip.parentElement) {
            monitorTestsTooltipState.activeTooltip.remove();
        }
        monitorTestsTooltipState.activeTooltip = null;
    }
    
    if (monitorTestsTooltipState.activeButton) {
        monitorTestsTooltipState.activeButton.setAttribute('aria-expanded', 'false');
        monitorTestsTooltipState.activeButton = null;
    }
}

/**
 * Builds the tooltip content for monitor tests status
 */
function buildMonitorTestsTooltip(project, statusInfo) {
    const tooltip = document.createElement('div');
    tooltip.className = 'monitor-tests-tooltip';
    tooltip.setAttribute('role', 'tooltip');
    tooltip.id = `monitor-tooltip-${Date.now()}`;
    
    // Header
    const header = document.createElement('div');
    header.className = 'monitor-tests-tooltip__header';
    header.textContent = `Tests: ${statusInfo.label}`;
    tooltip.appendChild(header);
    
    // Body - show failures or summary
    const body = document.createElement('div');
    body.className = 'monitor-tests-tooltip__body';
    
    if (statusInfo.status === 'NO_TESTS') {
        const msg = document.createElement('div');
        msg.className = 'monitor-tests-tooltip__message';
        msg.textContent = 'No tests configured for this project.';
        body.appendChild(msg);
    } else if (statusInfo.status === 'NOT_RUN') {
        const msg = document.createElement('div');
        msg.className = 'monitor-tests-tooltip__message';
        msg.textContent = `${statusInfo.totalTests} test${statusInfo.totalTests !== 1 ? 's' : ''} configured but not yet run.`;
        body.appendChild(msg);
    } else if (statusInfo.status === 'PASS') {
        const msg = document.createElement('div');
        msg.className = 'monitor-tests-tooltip__message monitor-tests-tooltip__message--success';
        msg.textContent = `✓ All ${statusInfo.totalTests} test${statusInfo.totalTests !== 1 ? 's' : ''} passed!`;
        body.appendChild(msg);
    } else if ((statusInfo.status === 'FAIL' || statusInfo.status === 'PARTIAL') && statusInfo.failedTests.length > 0) {
        const summary = document.createElement('div');
        summary.className = 'monitor-tests-tooltip__summary';
        summary.textContent = `${statusInfo.passedTests}/${statusInfo.totalTests} passed, ${statusInfo.failedTests.length} failed`;
        body.appendChild(summary);
        
        const failuresList = document.createElement('div');
        failuresList.className = 'monitor-tests-tooltip__failures';
        
        // Show up to 5 failures on desktop, 3 on mobile
        const isMobile = window.innerWidth <= BREAKPOINTS.MOBILE;
        const maxShow = isMobile ? DISPLAY_LIMITS.FAILED_TESTS_MOBILE : DISPLAY_LIMITS.FAILED_TESTS_DESKTOP;
        const failuresToShow = statusInfo.failedTests.slice(0, maxShow);
        
        failuresToShow.forEach(failure => {
            const item = document.createElement('div');
            item.className = 'monitor-tests-tooltip__failure-item';
            
            const name = document.createElement('div');
            name.className = 'monitor-tests-tooltip__failure-name';
            name.textContent = `✗ ${failure.name}`;
            item.appendChild(name);
            
            if (failure.error || failure.code) {
                const details = document.createElement('div');
                details.className = 'monitor-tests-tooltip__failure-details';
                const parts = [];
                if (failure.code) parts.push(`HTTP ${failure.code}`);
                if (failure.error) parts.push(failure.error);
                details.textContent = parts.join(' - ');
                item.appendChild(details);
            }
            
            failuresList.appendChild(item);
        });
        
        body.appendChild(failuresList);
        
        if (statusInfo.failedTests.length > maxShow) {
            const more = document.createElement('div');
            more.className = 'monitor-tests-tooltip__more';
            more.textContent = `... +${statusInfo.failedTests.length - maxShow} more. Open editor for details.`;
            body.appendChild(more);
        }
    }
    
    tooltip.appendChild(body);
    
    // Footer with last run time
    if (project.monitor && project.monitor.state && project.monitor.state.lastRunAt) {
        const footer = document.createElement('div');
        footer.className = 'monitor-tests-tooltip__footer';
        const formatted = formatMonitorLastRun(project.monitor.state.lastRunAt);
        footer.textContent = `Last run: ${formatted || 'Unknown'}`;
        tooltip.appendChild(footer);
    }
    
    return tooltip;
}

/**
 * Positions the tooltip relative to the trigger element
 */
function positionMonitorTestsTooltip(tooltip, triggerElement) {
    const triggerRect = triggerElement.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    const viewportWidth = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
    const viewportHeight = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0);
    
    const spacing = 8;
    const edgePadding = 8;
    
    let top = 0;
    let left = 0;
    
    // Vertical positioning: Try above first, then below if not enough space
    const spaceAbove = triggerRect.top;
    const spaceBelow = viewportHeight - triggerRect.bottom;
    
    if (spaceAbove >= tooltipRect.height + spacing || spaceAbove > spaceBelow) {
        // Position above
        top = triggerRect.top - tooltipRect.height - spacing;
        tooltip.classList.add('monitor-tests-tooltip--above');
        tooltip.classList.remove('monitor-tests-tooltip--below');
    } else {
        // Position below
        top = triggerRect.bottom + spacing;
        tooltip.classList.add('monitor-tests-tooltip--below');
        tooltip.classList.remove('monitor-tests-tooltip--above');
    }
    
    // Horizontal positioning: RTL-aware, align to right edge
    const isRTL = document.documentElement.dir === 'rtl' || document.body.dir === 'rtl';
    
    if (isRTL) {
        // RTL: Align to right edge of trigger
        left = triggerRect.right - tooltipRect.width;
        
        // Keep within viewport
        if (left < edgePadding) {
            left = edgePadding;
        }
        if (left + tooltipRect.width > viewportWidth - edgePadding) {
            left = viewportWidth - tooltipRect.width - edgePadding;
        }
    } else {
        // LTR: Align to left edge of trigger
        left = triggerRect.left;
        
        // Keep within viewport
        if (left + tooltipRect.width > viewportWidth - edgePadding) {
            left = viewportWidth - tooltipRect.width - edgePadding;
        }
        if (left < edgePadding) {
            left = edgePadding;
        }
    }
    
    // Ensure top is within viewport
    if (top < edgePadding) {
        top = edgePadding;
    }
    if (top + tooltipRect.height > viewportHeight - edgePadding) {
        top = viewportHeight - tooltipRect.height - edgePadding;
    }
    
    tooltip.style.position = 'fixed';
    tooltip.style.top = `${top}px`;
    tooltip.style.left = `${left}px`;
}

/**
 * Shows the monitor tests tooltip for a project
 */
function showMonitorTestsTooltip(button, project) {
    // Close any existing tooltip
    closeAllMonitorTestsTooltips();
    
    // Get status info
    const statusInfo = determineMonitorStatus(project);
    
    // Build tooltip
    const tooltip = buildMonitorTestsTooltip(project, statusInfo);
    
    // Add to DOM
    document.body.appendChild(tooltip);
    
    // Position it
    positionMonitorTestsTooltip(tooltip, button);
    
    // Update state
    monitorTestsTooltipState.activeTooltip = tooltip;
    monitorTestsTooltipState.activeButton = button;
    
    // Update ARIA
    button.setAttribute('aria-expanded', 'true');
    button.setAttribute('aria-describedby', tooltip.id);
    
    // Animate in
    requestAnimationFrame(() => {
        tooltip.classList.add('monitor-tests-tooltip--visible');
    });
}

/**
 * Sets up event listeners for a monitor tests status button
 */
function bindMonitorTestsTooltip(button, projectIndex) {
    if (!button || button.dataset.tooltipBound === 'true') return;
    
    const getProject = () => projectsData[projectIndex];
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    
    // Click/Touch handler
    button.addEventListener('click', (e) => {
        e.stopPropagation();
        const project = getProject();
        if (!project) return;
        
        if (monitorTestsTooltipState.activeTooltip && monitorTestsTooltipState.activeButton === button) {
            closeAllMonitorTestsTooltips();
        } else {
            showMonitorTestsTooltip(button, project);
        }
    });
    
    // Desktop: Hover with delay
    if (!isTouchDevice) {
        button.addEventListener('mouseenter', () => {
            const project = getProject();
            if (!project) return;
            
            monitorTestsTooltipState.closeTimer = setTimeout(() => {
                showMonitorTestsTooltip(button, project);
            }, 200);
        });
        
        button.addEventListener('mouseleave', () => {
            if (monitorTestsTooltipState.closeTimer) {
                clearTimeout(monitorTestsTooltipState.closeTimer);
                monitorTestsTooltipState.closeTimer = null;
            }
            
            // Close after a short delay to allow moving to tooltip
            setTimeout(() => {
                if (monitorTestsTooltipState.activeButton === button) {
                    closeAllMonitorTestsTooltips();
                }
            }, 150);
        });
    }
    
    // Keyboard: Enter/Space to toggle, Escape to close
    button.addEventListener('keydown', (e) => {
        const project = getProject();
        if (!project) return;
        
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
            e.preventDefault();
            if (monitorTestsTooltipState.activeTooltip && monitorTestsTooltipState.activeButton === button) {
                closeAllMonitorTestsTooltips();
                button.focus();
            } else {
                showMonitorTestsTooltip(button, project);
            }
        } else if (e.key === 'Escape') {
            if (monitorTestsTooltipState.activeTooltip && monitorTestsTooltipState.activeButton === button) {
                closeAllMonitorTestsTooltips();
                button.focus();
            }
        }
    });
    
    button.dataset.tooltipBound = 'true';
}

// Global event listeners for tooltip management
(function setupMonitorTestsTooltipGlobalListeners() {
    // Close on outside click
    document.addEventListener('click', (e) => {
        if (!monitorTestsTooltipState.activeTooltip) return;
        
        const tooltip = monitorTestsTooltipState.activeTooltip;
        const button = monitorTestsTooltipState.activeButton;
        
        if (!tooltip.contains(e.target) && (!button || !button.contains(e.target))) {
            closeAllMonitorTestsTooltips();
        }
    }, true);
    
    // Close on Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && monitorTestsTooltipState.activeTooltip) {
            const button = monitorTestsTooltipState.activeButton;
            closeAllMonitorTestsTooltips();
            if (button) {
                button.focus();
            }
        }
    });
    
    // Close on scroll
    let scrollTimer = null;
    window.addEventListener('scroll', () => {
        if (!monitorTestsTooltipState.activeTooltip) return;
        
        if (scrollTimer) clearTimeout(scrollTimer);
        scrollTimer = setTimeout(() => {
            closeAllMonitorTestsTooltips();
        }, 100);
    }, { passive: true });
    
    // Close on resize
    let resizeTimer = null;
    window.addEventListener('resize', () => {
        if (!monitorTestsTooltipState.activeTooltip) return;
        
        if (resizeTimer) clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            closeAllMonitorTestsTooltips();
        }, 100);
    });
    
    // Close when opening modal
    const originalOpenEditModal = window.openEditModal;
    if (typeof originalOpenEditModal === 'function') {
        window.openEditModal = function(...args) {
            closeAllMonitorTestsTooltips();
            return originalOpenEditModal.apply(this, args);
        };
    }
})();

// ============== End Monitor Tests Tooltip Management ==============

const MONITOR_STATUS_CLASSES = ['monitor-pass', 'monitor-partial', 'monitor-fail', 'monitor-unknown'];
const MONITOR_STATUS_LABELS = {
    pass: 'Pass',
    partial: 'Partial',
    fail: 'Fail',
    unknown: 'Not checked'
};

/**
 * Determines monitor status based on project monitor state
 * @param {Object} project - Project object with monitor configuration
 * @returns {Object} Status information {status: string, label: string, tooltip: string, failedTests: Array}
 */
function determineMonitorStatus(project) {
    const result = {
        status: 'NOT_RUN',
        label: 'NOT RUN',
        tooltip: 'Tests have not been run yet',
        failedTests: [],
        totalTests: 0,
        passedTests: 0
    };

    if (!project || !project.monitor) {
        result.status = 'NO_TESTS';
        result.label = 'NO TESTS';
        result.tooltip = 'No tests configured for this project';
        return result;
    }

    const monitor = project.monitor;
    const tests = Array.isArray(monitor.tests) ? monitor.tests : [];
    const state = monitor.state || {};

    result.totalTests = tests.length;

    // NO_TESTS: אין בדיקות מוגדרות
    if (tests.length === 0) {
        result.status = 'NO_TESTS';
        result.label = 'NO TESTS';
        result.tooltip = 'No tests configured';
        return result;
    }

    // NOT_RUN: יש בדיקות אבל מעולם לא רצו
    if (!state.lastRunAt || !state.tests || Object.keys(state.tests).length === 0) {
        result.status = 'NOT_RUN';
        result.label = 'NOT RUN';
        result.tooltip = `${tests.length} test${tests.length > 1 ? 's' : ''} configured but not yet run`;
        return result;
    }

    // ספירת תוצאות
    const testsState = state.tests || {};
    const failures = [];
    let passed = 0;
    let failed = 0;

    tests.forEach(test => {
        const testId = test.id;
        const testState = testsState[testId];
        
        if (testState) {
            if (testState.status === 'pass') {
                passed++;
            } else if (testState.status === 'fail') {
                failed++;
                failures.push({
                    id: testId,
                    name: test.name || testId,
                    error: testState.lastError,
                    code: testState.lastCode
                });
            }
        }
    });

    result.passedTests = passed;
    result.failedTests = failures;

    // ✅ FIX: השתמש ב-overall מה-state במקום לחשב מחדש!
    const overall = state.overall || 'unknown';
    
    if (overall === 'pass') {
        result.status = 'PASS';
        result.label = 'PASSED';
        result.tooltip = `All ${tests.length} test${tests.length > 1 ? 's' : ''} passed`;
        return result;
    }
    
    if (overall === 'partial') {
        result.status = 'PARTIAL';
        result.label = 'PARTIAL';
        const failedNames = failures.slice(0, 3).map(f => f.name).join(', ');
        const moreCount = failures.length > 3 ? ` +${failures.length - 3} more` : '';
        result.tooltip = `${passed} passed, ${failed} failed (non-critical): ${failedNames}${moreCount}`;
        return result;
    }
    
    if (overall === 'fail') {
        result.status = 'FAIL';
        result.label = 'FAILED';
        const failedNames = failures.slice(0, 3).map(f => f.name).join(', ');
        const moreCount = failures.length > 3 ? ` +${failures.length - 3} more` : '';
        result.tooltip = `${failed} of ${tests.length} tests failed: ${failedNames}${moreCount}`;
        return result;
    }

    // ברירת מחדל
    result.status = 'NOT_RUN';
    result.label = 'NOT RUN';
    result.tooltip = 'Test status unclear';
    return result;
}

function decorateCardWithMonitorStatus(card, project, index) {
    const cardBody = card.querySelector('.card-body');
    if (!cardBody) return;

    // שורת Tests חדשה - בתחתית הכרטיס
    const testsStatus = determineMonitorStatus(project);
    
    const testsRow = document.createElement('div');
    testsRow.className = 'monitor-tests-status';
    testsRow.dataset.projectIndex = String(index);
    testsRow.setAttribute('role', 'button');
    testsRow.setAttribute('tabindex', '0');
    testsRow.setAttribute('aria-label', `Tests: ${testsStatus.label}`);
    testsRow.setAttribute('aria-expanded', 'false');
    
    const testsValue = document.createElement('span');
    testsValue.className = `monitor-tests-value status-${testsStatus.status.toLowerCase().replace('_', '-')}`;
    testsValue.textContent = testsStatus.label;
    testsValue.removeAttribute('title');
    testsValue.setAttribute('aria-label', testsStatus.tooltip);
    
    testsRow.appendChild(testsValue);
    
    // הוספת זמן ריצה אחרונה
    if (project.monitor && project.monitor.state && project.monitor.state.lastRunAt) {
        const lastRunTime = document.createElement('span');
        lastRunTime.className = 'monitor-last-run-time';
        const formatted = formatMonitorLastRun(project.monitor.state.lastRunAt);
        lastRunTime.textContent = formatted ? `Last run: ${formatted}` : '';
        testsRow.appendChild(lastRunTime);
    }
    
    cardBody.appendChild(testsRow);
    
    // Add click handler to open modal and show tests tab
    testsRow.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent card click
        openEditModal(index);
        // Wait for modal to open, then switch to Tests tab
        setTimeout(() => {
            const testsTab = document.getElementById('monitor-tab-tests');
            if (testsTab) {
                testsTab.click();
            }
        }, 100);
    });
    
    // Bind tooltip functionality
    bindMonitorTestsTooltip(testsRow, index);
}

function updateMonitorIndicator(project, indicatorEl, lastRunEl) {
    if (!indicatorEl) return;

    let status = 'unknown';
    const tooltipLines = ['Test status: ' + MONITOR_STATUS_LABELS.unknown];
    let lastRunLabel = 'Last check: -';

    const monitor = project && project.monitor ? project.monitor : null;
    const state = monitor && monitor.state ? monitor.state : null;

    if (state) {
        if (state.overall && MONITOR_STATUS_CLASSES.includes('monitor-' + state.overall)) {
            status = state.overall;
            tooltipLines[0] = 'Test status: ' + (MONITOR_STATUS_LABELS[status] || MONITOR_STATUS_LABELS.unknown);
        }

        if (state.lastRunAt) {
            const formatted = formatMonitorLastRun(state.lastRunAt);
            if (formatted) {
                lastRunLabel = 'Last check: ' + formatted;
            }
        }

        if (Array.isArray(state.failures) && state.failures.length) {
            const failureNames = state.failures.map(entry => {
                if (!entry) return 'Test';
                if (typeof entry === 'string') return entry;
                if (typeof entry === 'object') {
                    if (entry.name) return entry.name;
                    if (entry.id) return entry.id;
                }
                return 'Test';
            });
            tooltipLines.push('Failed tests: ' + failureNames.join(', '));
        }
    }

    indicatorEl.classList.remove(...MONITOR_STATUS_CLASSES);
    indicatorEl.classList.add('monitor-' + status);
    indicatorEl.title = tooltipLines.join('\n');

    if (lastRunEl) {
        lastRunEl.textContent = lastRunLabel;
    }

    // We keep cards a fixed size: tooltip only.
    const card = indicatorEl.closest('.card');
    if (card) {
        const failuresEl = card.querySelector('.monitor-failures');
        if (failuresEl) failuresEl.remove();
    }
}

// Tooltip state (single open tooltip at a time)
let monitorOpenTooltip = null;
function closeMonitorTooltip() {
    if (monitorOpenTooltip && monitorOpenTooltip.parentElement) {
        monitorOpenTooltip.parentElement.removeChild(monitorOpenTooltip);
    }
    monitorOpenTooltip = null;
}

function buildChipTooltipContent(project) {
    const container = document.createElement('div');
    container.className = 'monitor-tooltip';
    container.setAttribute('role', 'tooltip');
    const header = document.createElement('div');
    header.className = 'monitor-tooltip__header';
    const monitor = project && project.monitor ? project.monitor : null;
    const state = monitor && monitor.state ? monitor.state : null;
    const overall = state && state.overall ? state.overall : 'unknown';
    header.textContent = 'Test status: ' + (MONITOR_STATUS_LABELS[overall] || 'Unknown');
    container.appendChild(header);

    // Build test list from configured tests and state
    const tests = Array.isArray(monitor && monitor.tests) ? monitor.tests : [];
    const testsState = (state && state.tests) ? state.tests : {};
    const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    const limit = isTouch ? DISPLAY_LIMITS.TOOLTIP_TESTS_MOBILE : DISPLAY_LIMITS.TOOLTIP_TESTS_DESKTOP;
    let shown = 0;
    tests.forEach((t) => {
        if (shown >= limit) return;
        const st = t && t.id ? testsState[t.id] : null;
        const s = st && st.status ? st.status : 'unknown';
        const line = document.createElement('div');
        line.className = 'monitor-tooltip__item';
        const prefix = s === 'pass' ? '✓' : (s === 'fail' ? '✗' : '•');
        line.textContent = `${prefix} ${t && t.name ? t.name : (t && t.id ? t.id : 'Test')}`;
        container.appendChild(line);
        shown += 1;
    });
    if (tests.length > shown) {
        const more = document.createElement('div');
        more.className = 'monitor-tooltip__item';
        more.textContent = `... +${tests.length - shown} more. Open editor for details`;
        container.appendChild(more);
    }
    const footer = document.createElement('div');
    footer.className = 'monitor-tooltip__footer';
    // We don't reliably know URL status; show simple label derived from edit URL presence
    footer.textContent = 'URL status: ' + (project && project.url ? '✓' : '•');
    container.appendChild(footer);
    return container;
}

function bindMonitorChipTooltip(chip, index) {
    if (!chip) return;
    const getProject = () => projectsData[index];
    const open = () => {
        closeMonitorTooltip();
        const tooltip = buildChipTooltipContent(getProject());
        document.body.appendChild(tooltip);
        // Position near chip
        const rect = chip.getBoundingClientRect();
        let left = rect.left;
        let top = rect.bottom + 8;
        const vw = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
        const vh = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0);
        if (left + tooltip.offsetWidth > vw - 8) {
            left = Math.max(8, vw - tooltip.offsetWidth - 8);
        }
        if (top + tooltip.offsetHeight > vh - 8) {
            top = Math.max(8, rect.top - tooltip.offsetHeight - 8);
        }
        tooltip.style.left = `${left}px`;
        tooltip.style.top = `${top}px`;
        monitorOpenTooltip = tooltip;
    };
    const close = () => closeMonitorTooltip();

    let hoverTimer = null;
    chip.addEventListener('mouseenter', () => { if (!('ontouchstart' in window)) open(); });
    chip.addEventListener('mouseleave', () => { if (!('ontouchstart' in window)) close(); });
    chip.addEventListener('click', (e) => { e.stopPropagation(); if ('ontouchstart' in window) { if (monitorOpenTooltip) close(); else open(); } });
    chip.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') { e.preventDefault(); open(); } });
    document.addEventListener('click', (e) => { if (monitorOpenTooltip) close(); }, { capture: true });
    window.addEventListener('scroll', () => { if (monitorOpenTooltip) close(); }, { passive: true });
    window.addEventListener('resize', () => { if (monitorOpenTooltip) close(); });
}

function formatMonitorLastRun(value) {
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

const monitorTabsState = new WeakMap();
function activateMonitorTab(container, tab) {
    const state = monitorTabsState.get(container);
    if (!state || !tab) return;
    const targetId = tab.getAttribute('aria-controls');
    if (!targetId) return;
    state.tabs.forEach((candidate) => {
        const isActive = candidate === tab;
        candidate.classList.toggle('is-active', isActive);
        candidate.setAttribute('aria-selected', isActive ? 'true' : 'false');
        candidate.setAttribute('tabindex', isActive ? '0' : '-1');
    });
    state.panels.forEach((panel) => {
        const isActivePanel = panel.id === targetId;
        panel.classList.toggle('is-active', isActivePanel);
        panel.hidden = !isActivePanel;
        // Force visibility to avoid CSS conflicts
        try {
            panel.style.display = isActivePanel ? 'flex' : 'none';
        } catch (e) {}
        panel.setAttribute('tabindex', isActivePanel ? '0' : '-1');
        if (isActivePanel) {
            panel.setAttribute('aria-labelledby', tab.id);
        }
    });
    container.dataset.activeTab = tab.id;

    // Also ensure the Tests editor UI is only visible on the Tests tab
    try {
        const testsActive = targetId === 'monitor-panel-tests';
        const testsEditor = document.getElementById('monitor-tests-editor');
        const testsControls = document.getElementById('monitor-tests-controls');
        const testsList = document.getElementById('monitor-tests-list');
        if (testsEditor) testsEditor.hidden = !testsActive;
        if (testsControls) testsControls.hidden = !testsActive;
        // When leaving Tests, keep list hidden to avoid flicker
        if (!testsActive && testsList) testsList.hidden = true;
    } catch (e) {}
}
function setupMonitorTabs(container) {
    if (!container) return;
    teardownMonitorTabs(container);
    const tablist = container.querySelector('.monitor-tablist');
    const tabs = tablist ? Array.from(tablist.querySelectorAll('.monitor-tab')) : [];
    const panels = Array.from(container.querySelectorAll('.monitor-panel'));
    if (!tablist || !tabs.length || !panels.length) return;
    tablist.setAttribute('role', 'tablist');
    if (!tablist.getAttribute('aria-orientation')) {
        tablist.setAttribute('aria-orientation', 'horizontal');
    }
    tabs.forEach((tab, index) => {
        if (!tab.id) {
            tab.id = 'monitor-tab-' + index;
        }
        const controls = tab.getAttribute('aria-controls') || tab.dataset.monitorTarget;
        if (controls) {
            tab.setAttribute('aria-controls', controls);
        }
        tab.setAttribute('role', 'tab');
        tab.setAttribute('aria-selected', 'false');
        tab.setAttribute('tabindex', '-1');
        tab.classList.remove('is-active');
    });
    panels.forEach((panel, index) => {
        if (!panel.id) {
            panel.id = 'monitor-panel-' + index;
        }
        panel.setAttribute('role', 'tabpanel');
        panel.setAttribute('tabindex', '-1');
        panel.hidden = true;
        panel.classList.remove('is-active');
        if (!panel.getAttribute('aria-labelledby')) {
            const owner = tabs.find((tab) => tab.getAttribute('aria-controls') === panel.id);
            if (owner) {
                panel.setAttribute('aria-labelledby', owner.id);
            }
        }
    });
    const state = {
        tabs,
        panels,
        handleClick: (event) => {
            event.preventDefault();
            const targetTab = event.currentTarget;
            activateMonitorTab(container, targetTab);
        },
        handleKeydown: (event) => {
            const key = event.key;
            const currentTab = event.currentTarget;
            if (key === 'Enter' || key === ' ' || key === 'Spacebar' || key === 'Space') {
                event.preventDefault();
                activateMonitorTab(container, currentTab);
                return;
            }
            let direction = 0;
            if (key === 'ArrowRight' || key === 'ArrowDown') {
                direction = 1;
            } else if (key === 'ArrowLeft' || key === 'ArrowUp') {
                direction = -1;
            }
            if (direction !== 0) {
                event.preventDefault();
                const currentIndex = tabs.indexOf(currentTab);
                if (currentIndex === -1) return;
                const nextIndex = (currentIndex + direction + tabs.length) % tabs.length;
                tabs[nextIndex].focus();
            }
        }
    };
    tabs.forEach((tab) => {
        tab.addEventListener('click', state.handleClick);
        tab.addEventListener('keydown', state.handleKeydown);
    });
    monitorTabsState.set(container, state);
    container.dataset.tabsMounted = 'true';
}
function resetMonitorTabs(container) {
    if (!container) return;
    const state = monitorTabsState.get(container);
    if (!state) return;
    const defaultTab = state.tabs.find((tab) => tab.dataset.defaultTab === 'true') || state.tabs[0];
    if (defaultTab) {
        activateMonitorTab(container, defaultTab);
    }
}
function teardownMonitorTabs(container) {
    if (!container) return;
    const state = monitorTabsState.get(container);
    const tabs = state ? state.tabs : Array.from(container.querySelectorAll('.monitor-tab'));
    const panels = state ? state.panels : Array.from(container.querySelectorAll('.monitor-panel'));
    if (state) {
        tabs.forEach((tab) => {
            tab.removeEventListener('click', state.handleClick);
            tab.removeEventListener('keydown', state.handleKeydown);
        });
        monitorTabsState.delete(container);
    }
    tabs.forEach((tab) => {
        tab.classList.remove('is-active');
        tab.setAttribute('aria-selected', 'false');
        tab.setAttribute('tabindex', '-1');
    });
    panels.forEach((panel) => {
        panel.classList.remove('is-active');
        panel.hidden = true;
        panel.setAttribute('tabindex', '-1');
    });
    delete container.dataset.activeTab;
    delete container.dataset.tabsMounted;
}

const MONITOR_EMPTY_VALUE = 'Not set';
const MONITOR_KNOWN_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);

function getMonitorField(id) {
    return document.getElementById(id);
}

function setMonitorTextValue(id, value) {
    const field = getMonitorField(id);
    if (!field) return;
    if (value === null || value === undefined) {
        field.value = '';
        return;
    }
    if (typeof value === 'string') {
        field.value = value;
        return;
    }
    field.value = String(value);
}

function setMonitorTextareaValue(id, value) {
    const field = getMonitorField(id);
    if (!field) return;
    if (value === null || value === undefined) {
        field.value = '';
        return;
    }
    field.value = String(value);
}

function setMonitorCheckboxValue(id, value) {
    const field = getMonitorField(id);
    if (!field) return;
    field.checked = Boolean(value);
}

function setMonitorSelectValue(id, value) {
    const select = getMonitorField(id);
    if (!select) return;
    Array.from(select.querySelectorAll('option[data-custom-option="true"]')).forEach((option) => option.remove());
    let normalized = '';
    if (typeof value === 'string') {
        normalized = value;
    } else if (value !== null && value !== undefined) {
        normalized = String(value);
    }
    if (normalized) {
        const hasOption = Array.from(select.options).some((option) => option.value === normalized);
        if (!hasOption) {
            const option = document.createElement('option');
            option.value = normalized;
            option.textContent = normalized;
            option.dataset.customOption = 'true';
            select.appendChild(option);
        }
        select.value = normalized;
    } else if (select.options.length > 0) {
        select.selectedIndex = 0;
    } else {
        select.value = '';
    }
}

function clearMonitorTabs() {
    const textIds = ['monitor-base-url', 'monitor-login-path', 'monitor-login-username', 'monitor-login-password', 'monitor-token-header', 'monitor-token-prefix', 'monitor-schedule-interval'];
    textIds.forEach((id) => {
        const field = getMonitorField(id);
        if (field) {
            field.value = '';
        }
    });
    const textarea = getMonitorField('monitor-login-body');
    if (textarea) {
        textarea.value = '';
    }
    const selectIds = ['monitor-login-method', 'monitor-token-location'];
    selectIds.forEach((id) => {
        const select = getMonitorField(id);
        if (!select) return;
        Array.from(select.querySelectorAll('option[data-custom-option="true"]')).forEach((option) => option.remove());
        if (select.options.length > 0) {
            select.selectedIndex = 0;
        } else {
            select.value = '';
        }
    });
    const checkboxIds = ['monitor-login-enabled', 'monitor-persist-password', 'monitor-schedule-enabled'];
    checkboxIds.forEach((id) => {
        const checkbox = getMonitorField(id);
        if (checkbox) {
            checkbox.checked = false;
        }
    });
    const testsList = getMonitorField('monitor-tests-list');
    if (testsList) {
        while (testsList.firstChild) {
            testsList.removeChild(testsList.firstChild);
        }
        testsList.hidden = true;
    }
    const testsEditor = getMonitorField('monitor-tests-editor');
    if (testsEditor) {
        testsEditor.innerHTML = '';
        testsEditor.hidden = true;
    }
    const testsControls = getMonitorField('monitor-tests-controls');
    if (testsControls) {
        testsControls.hidden = true;
    }
    const emptyState = getMonitorField('monitor-tests-empty');
    if (emptyState) {
        emptyState.hidden = false;
    }
}


function formatMonitorBoolean(value) {
    return value ? 'Yes' : 'No';
}

function normalizeMonitorString(value) {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return value.trim();
    if (typeof value === 'number') return String(value);
    return '';
}

function formatMonitorExpectedStatus(value) {
    if (Array.isArray(value)) {
        const parts = value.map((item) => normalizeMonitorString(item)).filter(Boolean);
        return parts.join(',');
    }
    return normalizeMonitorString(value);
}

function formatMonitorHeaders(headers) {
    if (!headers) return '';
    if (Array.isArray(headers)) {
        const lines = headers.map((entry) => {
            if (!entry) return '';
            if (typeof entry === 'string') {
                return entry.trim();
            }
            if (typeof entry === 'object') {
                return Object.entries(entry)
                    .map(([key, val]) => `${String(key)}:${val === undefined || val === null ? '' : String(val)}`)
                    .join('\n');
            }
            return '';
        }).filter(Boolean);
        return lines.join('\n');
    }
    if (typeof headers === 'object') {
        return Object.entries(headers)
            .map(([key, val]) => `${String(key)}:${val === undefined || val === null ? '' : String(val)}`)
            .join('\n');
    }
    return String(headers);
}

function appendMonitorTestField(card, label, value, options) {
    const field = document.createElement('div');
    field.className = 'monitor-test-card__field';
    if (options && options.multiline) {
        field.classList.add('monitor-test-card__field--multiline');
    }
    const labelEl = document.createElement('span');
    labelEl.className = 'monitor-test-card__label';
    labelEl.textContent = label;
    const valueEl = document.createElement('div');
    valueEl.className = 'monitor-test-card__value';
    if (options && options.multiline) {
        valueEl.classList.add('monitor-test-card__value--multiline');
    }
    valueEl.textContent = value || MONITOR_EMPTY_VALUE;
    field.appendChild(labelEl);
    field.appendChild(valueEl);
    card.appendChild(field);
}

function renderMonitorTests(tests) {
    const list = getMonitorField('monitor-tests-list');
    const emptyState = getMonitorField('monitor-tests-empty');
    const editor = getMonitorField('monitor-tests-editor');
    const controls = getMonitorField('monitor-tests-controls');
    if (editor) {
        editor.innerHTML = '';
        editor.hidden = true;
    }
    if (controls) {
        controls.hidden = true;
    }
    if (!list || !emptyState) return;
    while (list.firstChild) {
        list.removeChild(list.firstChild);
    }
    if (!Array.isArray(tests) || tests.length === 0) {
        list.hidden = true;
        emptyState.hidden = false;
        return;
    }
    emptyState.hidden = true;
    list.hidden = false;
    tests.forEach((test, index) => {
        const card = document.createElement('article');
        card.className = 'monitor-test-card';
        const title = document.createElement('h4');
        title.className = 'monitor-test-card__title';
        const name = normalizeMonitorString(test && test.name);
        title.textContent = name || `Test ${index + 1}`;
        card.appendChild(title);
        const methodSource = normalizeMonitorString(test && test.method);
        const methodCandidate = methodSource ? methodSource.toUpperCase() : '';
        const methodValue = methodCandidate && MONITOR_KNOWN_METHODS.has(methodCandidate) ? methodCandidate : methodSource;
        appendMonitorTestField(card, 'Method', methodValue);
        const path = normalizeMonitorString(test && test.path);
        appendMonitorTestField(card, 'Path', path);
        appendMonitorTestField(card, 'Required', formatMonitorBoolean(Boolean(test && test.required)));
        appendMonitorTestField(card, 'Requires Login', formatMonitorBoolean(Boolean(test && test.requiresLogin)));
        const expectedStatus = formatMonitorExpectedStatus(test && test.expectedStatus);
        appendMonitorTestField(card, 'Expected Status', expectedStatus);
        const bodyTemplate = normalizeMonitorString(test && test.bodyTemplate);
        appendMonitorTestField(card, 'Body Template', bodyTemplate, { multiline: true });
        const headersText = formatMonitorHeaders(test && test.headers);
        appendMonitorTestField(card, 'Headers', headersText, { multiline: true });
        list.appendChild(card);
    });
}



const MONITOR_ALLOWED_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

const monitorEditContext = {
    isEditing: false,
    dirty: false,
    hasValidationErrors: false,
    projectIndex: null,
    originalMonitor: null,
    tests: [],
    boundListeners: []
};

function getMonitorModalElements() {
    const modal = document.getElementById('edit-modal');
    return {
        modal,
        tabsContainer: document.getElementById('monitor-tabs'),
        header: document.getElementById('monitor-edit-header'),
        cancelButton: document.getElementById('monitor-cancel-button'),
        deleteButton: document.getElementById('monitor-delete-button'),
        legacySaveButton: document.getElementById('edit-form-save-button'),
        testsList: document.getElementById('monitor-tests-list'),
        testsEmpty: document.getElementById('monitor-tests-empty'),
        testsEditor: document.getElementById('monitor-tests-editor'),
        testsControls: document.getElementById('monitor-tests-controls'),
        addTestButton: document.getElementById('monitor-tests-add-button')
    };
}

function updateMonitorActionButtons() {
    const { cancelButton } = getMonitorModalElements();
    if (!cancelButton) return;
    // כפתור Cancel תמיד גלוי!
    cancelButton.hidden = false;
    cancelButton.disabled = false;
}

function monitorEditModeActive() {
    return Boolean(monitorEditContext && monitorEditContext.isEditing);
}

function setLegacySaveDisabled(isDisabled) {
    const { legacySaveButton } = getMonitorModalElements();
    if (!legacySaveButton) return;
    const disabled = Boolean(isDisabled);
    legacySaveButton.disabled = disabled;
    legacySaveButton.hidden = disabled;
}

function addMonitorEditListener(element, event, handler) {
    if (!element) return;
    element.addEventListener(event, handler);
    monitorEditContext.boundListeners.push({ element, event, handler });
}

function removeMonitorEditListeners() {
    monitorEditContext.boundListeners.forEach(({ element, event, handler }) => {
        element.removeEventListener(event, handler);
    });
    monitorEditContext.boundListeners = [];
}

function setMonitorDirty(isDirty) {
    monitorEditContext.dirty = Boolean(isDirty);
    updateMonitorActionButtons();
}

function clearMonitorValidation() {
    document.querySelectorAll('.monitor-input-error').forEach((field) => {
        field.classList.remove('monitor-input-error');
        field.removeAttribute('aria-invalid');
    });
    document.querySelectorAll('.monitor-field-error').forEach((helper) => {
        helper.textContent = '';
        helper.hidden = true;
    });
    monitorEditContext.hasValidationErrors = false;
    updateMonitorActionButtons();
}

function showFieldError(field, message) {
    if (!field) return;
    field.classList.add('monitor-input-error');
    field.setAttribute('aria-invalid', 'true');
    let helper = field.closest('.monitor-field-group')?.querySelector('.monitor-field-error');
    if (!helper) {
        helper = document.createElement('p');
        helper.className = 'monitor-field-error';
        const container = field.closest('.monitor-field-group') || field.parentElement;
        container?.appendChild(helper);
    }
    helper.textContent = message;
    helper.hidden = false;
    monitorEditContext.hasValidationErrors = true;
    updateMonitorActionButtons();
}

function clearFieldError(field) {
    if (!field) return;
    field.classList.remove('monitor-input-error');
    field.removeAttribute('aria-invalid');
    const helper = field.closest('.monitor-field-group')?.querySelector('.monitor-field-error');
    if (helper) {
        helper.textContent = '';
        helper.hidden = true;
    }
    if (!document.querySelector('.monitor-input-error')) {
        monitorEditContext.hasValidationErrors = false;
        updateMonitorActionButtons();
    }
}

function generateTestId() {
    return `test-${Date.now()}-${Math.floor(Math.random() * RANDOM.MAX_TEST_RANDOM)}`;
}

function headersObjectToText(headers) {
    if (!headers) return '';
    const serializeEntry = (entry) => {
        if (!entry) return '';
        if (typeof entry === 'string') return entry;
        if (typeof entry === 'object') {
            return Object.entries(entry)
                .map(([key, val]) => `${String(key)}:${val === undefined || val === null ? '' : String(val)}`)
                .join('\n');
        }
        return '';
    };
    if (Array.isArray(headers)) {
        return headers.map(serializeEntry).filter(Boolean).join('\n');
    }
    if (typeof headers === 'object') {
        return Object.entries(headers)
            .map(([key, val]) => `${String(key)}:${val === undefined || val === null ? '' : String(val)}`)
            .join('\n');
    }
    return String(headers);
}

function prepareMonitorTestsForEdit(monitor) {
    const tests = Array.isArray(monitor?.tests) ? monitor.tests : [];
    console.log('prepareMonitorTestsForEdit - tests from monitor:', tests);
    return tests.map((test) => {
        const methodSource = normalizeMonitorString(test?.method) || 'GET';
        return {
            id: test?.id || generateTestId(),
            name: normalizeMonitorString(test?.name),
            required: Boolean(test?.required),
            requiresLogin: Boolean(test?.requiresLogin),
            method: MONITOR_ALLOWED_METHODS.includes(methodSource.toUpperCase()) ? methodSource.toUpperCase() : 'GET',
            path: normalizeMonitorString(test?.path),
            expectedStatusRaw: Array.isArray(test?.expectedStatus) ? test.expectedStatus.join(',') : normalizeMonitorString(test?.expectedStatus),
            bodyTemplate: normalizeMonitorString(test?.bodyTemplate),
            headersRaw: headersObjectToText(test?.headers)
        };
    });
}

function renderMonitorTestsEditor() {
    const { testsEditor, testsList, testsEmpty, testsControls } = getMonitorModalElements();
    if (!testsEditor || !testsList || !testsEmpty || !testsControls) {
        console.error('renderMonitorTestsEditor - Missing elements!', { testsEditor, testsList, testsEmpty, testsControls });
        return;
    }
    const projectIndex = monitorEditContext && typeof monitorEditContext.projectIndex === 'number' ? monitorEditContext.projectIndex : null;
    const projectForStates = projectIndex !== null ? projectsData[projectIndex] : null;
    const lastStates = projectForStates && projectForStates.monitor && projectForStates.monitor.state && projectForStates.monitor.state.tests ? projectForStates.monitor.state.tests : {};
    
    console.log('renderMonitorTestsEditor - tests count:', monitorEditContext.tests.length);
    console.log('renderMonitorTestsEditor - tests:', monitorEditContext.tests);
    
    testsEditor.innerHTML = '';
    if (monitorEditContext.tests.length === 0) {
        testsEmpty.hidden = false;
        console.log('renderMonitorTestsEditor - No tests, showing empty state');
    } else {
        testsEmpty.hidden = true;
        console.log('renderMonitorTestsEditor - Rendering', monitorEditContext.tests.length, 'tests');
        monitorEditContext.tests.forEach((test, index) => {
            console.log('renderMonitorTestsEditor - Creating card for test', index, test);
            const card = createTestEditorCard(test, index);
            try {
                const st = lastStates && test && test.id ? lastStates[test.id] : null;
                if (st && st.status === 'fail') {
                    card.classList.add('monitor-test-card--failed');
                }
            } catch (e) { /* ignore */ }
            console.log('renderMonitorTestsEditor - Created card:', card);
            testsEditor.appendChild(card);
        });
    }
    testsEditor.hidden = false;
    testsControls.hidden = false;
    testsList.hidden = true;
    
    // עדכון הבאדג'
    updateTestsBadge(monitorEditContext.tests.length);
    
    console.log('renderMonitorTestsEditor - Final state:', {
        testsEditorHidden: testsEditor.hidden,
        testsEmptyHidden: testsEmpty.hidden,
        testsListHidden: testsList.hidden,
        testsControlsHidden: testsControls.hidden,
        editorChildCount: testsEditor.children.length
    });
}

function updateTestsBadge(count) {
    const badge = document.getElementById('monitor-tab-tests-badge');
    if (badge) {
        badge.textContent = String(count);
        badge.style.display = count > 0 ? 'inline-flex' : 'none';
    }
}

function updateAuthStatus() {
    const statusEl = document.getElementById('monitor-tab-auth-status');
    if (!statusEl) return;
    
    const baseUrl = document.getElementById('monitor-base-url')?.value?.trim();
    const loginEnabled = document.getElementById('monitor-login-enabled')?.checked;
    const username = document.getElementById('monitor-login-username')?.value?.trim();
    const password = document.getElementById('monitor-login-password')?.value?.trim();
    
    if (!baseUrl) {
        statusEl.textContent = '✗';
        statusEl.style.color = '#ff4f62';
        statusEl.title = 'Base URL is required';
    } else if (loginEnabled && (!username || !password)) {
        statusEl.textContent = '⚠';
        statusEl.style.color = '#f5a623';
        statusEl.title = 'Login enabled but credentials incomplete';
    } else {
        statusEl.textContent = '✓';
        statusEl.style.color = '#25c06d';
        statusEl.title = 'API configuration complete';
    }
}

function updateScheduleStatus() {
    const statusEl = document.getElementById('monitor-tab-schedule-status');
    if (!statusEl) return;
    
    const scheduleEnabled = document.getElementById('monitor-schedule-enabled')?.checked;
    const interval = document.getElementById('monitor-schedule-interval')?.value;
    
    if (scheduleEnabled && interval) {
        statusEl.textContent = '✓';
        statusEl.style.color = '#25c06d';
        statusEl.title = `Schedule active: every ${interval}s`;
    } else {
        statusEl.textContent = '⏰';
        statusEl.style.color = '#95a5a6';
        statusEl.title = 'Schedule inactive';
    }
}

function createTestEditorCard(test, index) {
    const wrapper = document.createElement('article');
    wrapper.className = 'monitor-test-editor';
    wrapper.dataset.testIndex = String(index);

    const header = document.createElement('div');
    header.className = 'monitor-test-editor__header';

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'monitor-test-editor__name';
    nameInput.placeholder = 'Test name';
    nameInput.value = test.name || '';
    nameInput.dataset.testIndex = String(index);
    nameInput.dataset.field = 'name';
    addMonitorEditListener(nameInput, 'input', (event) => {
        monitorEditContext.tests[index].name = event.target.value;
        clearFieldError(event.target);
        setMonitorDirty(true);
    });

    const actions = document.createElement('div');
    actions.className = 'monitor-test-editor__actions';

    // כפתור הזזה למעלה
    const moveUpButton = document.createElement('button');
    moveUpButton.type = 'button';
    moveUpButton.className = 'monitor-test-editor__action';
    moveUpButton.textContent = '↑';
    moveUpButton.title = 'Move Up';
    moveUpButton.disabled = index === 0;
    addMonitorEditListener(moveUpButton, 'click', () => {
        handleTestMoveUp(index);
    });

    // כפתור הזזה למטה
    const moveDownButton = document.createElement('button');
    moveDownButton.type = 'button';
    moveDownButton.className = 'monitor-test-editor__action';
    moveDownButton.textContent = '↓';
    moveDownButton.title = 'Move Down';
    moveDownButton.disabled = index === monitorEditContext.tests.length - 1;
    addMonitorEditListener(moveDownButton, 'click', () => {
        handleTestMoveDown(index);
    });

    const duplicateButton = document.createElement('button');
    duplicateButton.type = 'button';
    duplicateButton.className = 'monitor-test-editor__action';
    duplicateButton.textContent = 'Duplicate';
    addMonitorEditListener(duplicateButton, 'click', () => {
        handleTestDuplicate(index);
    });

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'monitor-test-editor__action monitor-test-editor__action--danger';
    deleteButton.textContent = 'Delete';
    addMonitorEditListener(deleteButton, 'click', () => {
        handleTestDelete(index);
    });

    actions.appendChild(moveUpButton);
    actions.appendChild(moveDownButton);
    actions.appendChild(duplicateButton);
    actions.appendChild(deleteButton);

    header.appendChild(nameInput);
    header.appendChild(actions);
    wrapper.appendChild(header);

    wrapper.appendChild(createTestFieldGroup('Method', createTestMethodSelect(test, index)));
    wrapper.appendChild(createTestFieldGroup('Path', createTestTextInput(test, index, 'path', 'Path')));
    wrapper.appendChild(createTestCheckboxGroup(test, index, 'required', 'Required'));
    wrapper.appendChild(createTestCheckboxGroup(test, index, 'requiresLogin', 'Requires login'));
    wrapper.appendChild(createTestFieldGroup('Expected status (CSV)', createTestTextInput(test, index, 'expectedStatusRaw', '200,204')));
    wrapper.appendChild(createTestFieldGroup('Body template', createTestTextarea(test, index, 'bodyTemplate', 3)));
    wrapper.appendChild(createTestFieldGroup('Headers (key:value per line)', createTestTextarea(test, index, 'headersRaw', 3)));

    return wrapper;
}

function createTestFieldGroup(labelText, field) {
    const group = document.createElement('div');
    group.className = 'monitor-field-group';
    const label = document.createElement('label');
    label.textContent = labelText;
    group.appendChild(label);
    group.appendChild(field);
    const error = document.createElement('p');
    error.className = 'monitor-field-error';
    error.hidden = true;
    group.appendChild(error);
    return group;
}

function createTestCheckboxGroup(test, index, fieldName, labelText) {
    const wrapper = document.createElement('div');
    wrapper.className = 'monitor-field-group monitor-field-group--checkbox';
    const label = document.createElement('label');
    label.className = 'monitor-checkbox-line';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = Boolean(test[fieldName]);
    checkbox.dataset.testIndex = String(index);
    checkbox.dataset.field = fieldName;
    // Tooltip to explain behavior
    checkbox.setAttribute('title', fieldName === 'required'
        ? 'Critical test — overall run becomes Fail if this test fails'
        : 'Requires authentication — adds token from login flow');
    addMonitorEditListener(checkbox, 'change', (event) => {
        monitorEditContext.tests[index][fieldName] = event.target.checked;
        setMonitorDirty(true);
    });
    label.appendChild(checkbox);
    const text = document.createElement('span');
    text.textContent = labelText;
    label.appendChild(text);
    wrapper.appendChild(label);
    const error = document.createElement('p');
    error.className = 'monitor-field-error';
    error.hidden = true;
    wrapper.appendChild(error);
    return wrapper;
}

function createTestMethodSelect(test, index) {
    const select = document.createElement('select');
    select.dataset.testIndex = String(index);
    select.dataset.field = 'method';
    MONITOR_ALLOWED_METHODS.forEach((method) => {
        const option = document.createElement('option');
        option.value = method;
        option.textContent = method;
        select.appendChild(option);
    });
    select.value = MONITOR_ALLOWED_METHODS.includes(test.method) ? test.method : 'GET';
    addMonitorEditListener(select, 'change', (event) => {
        monitorEditContext.tests[index].method = event.target.value;
        clearFieldError(event.target);
        setMonitorDirty(true);
    });
    return select;
}

function createTestTextInput(test, index, fieldName, placeholder) {
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = placeholder;
    input.value = test[fieldName] || '';
    input.dataset.testIndex = String(index);
    input.dataset.field = fieldName;
    addMonitorEditListener(input, 'input', (event) => {
        monitorEditContext.tests[index][fieldName] = event.target.value;
        clearFieldError(event.target);
        setMonitorDirty(true);
    });
    return input;
}

function createTestTextarea(test, index, fieldName, rows) {
    const textarea = document.createElement('textarea');
    textarea.rows = rows;
    textarea.value = test[fieldName] || '';
    textarea.dataset.testIndex = String(index);
    textarea.dataset.field = fieldName;
    addMonitorEditListener(textarea, 'input', (event) => {
        monitorEditContext.tests[index][fieldName] = event.target.value;
        clearFieldError(event.target);
        setMonitorDirty(true);
    });
    return textarea;
}

function handleTestAdd(event) {
    try { event?.preventDefault?.(); event?.stopPropagation?.(); } catch (_) {}
    const newTest = {
        id: generateTestId(),
        name: '',
        required: false,
        requiresLogin: false,
        method: 'GET',
        path: '',
        expectedStatusRaw: '',
        bodyTemplate: '',
        headersRaw: ''
    };
    monitorEditContext.tests.push(newTest);
    setMonitorDirty(true);
    renderMonitorTestsEditor();
}

function handleTestDelete(index) {
    if (confirm('Are you sure you want to delete this test?')) {
        monitorEditContext.tests.splice(index, 1);
        setMonitorDirty(true);
        renderMonitorTestsEditor();
    }
}

function handleTestDuplicate(index) {
    const source = monitorEditContext.tests[index];
    const clone = { ...source, id: generateTestId(), name: source.name ? `${source.name} Copy` : '' };
    monitorEditContext.tests.splice(index + 1, 0, clone);
    setMonitorDirty(true);
    renderMonitorTestsEditor();
}

function handleTestMoveUp(index) {
    if (index === 0) return;
    const temp = monitorEditContext.tests[index];
    monitorEditContext.tests[index] = monitorEditContext.tests[index - 1];
    monitorEditContext.tests[index - 1] = temp;
    setMonitorDirty(true);
    renderMonitorTestsEditor();
}

function handleTestMoveDown(index) {
    if (index === monitorEditContext.tests.length - 1) return;
    const temp = monitorEditContext.tests[index];
    monitorEditContext.tests[index] = monitorEditContext.tests[index + 1];
    monitorEditContext.tests[index + 1] = temp;
    setMonitorDirty(true);
    renderMonitorTestsEditor();
}

/**
 * Validate and collect base URL from monitor form
 *
 * @param {HTMLElement} modal - Modal element containing form
 * @param {Array} errors - Error array to append to
 * @param {HTMLElement|null} firstInvalid - First invalid field (or null)
 * @returns {Object} - { baseUrl: string, firstInvalid: HTMLElement|null }
 */
function validateAndCollectBaseUrl(modal, errors, firstInvalid) {
    const baseUrlInput = modal.querySelector('#monitor-base-url');
    const baseUrlValue = baseUrlInput ? baseUrlInput.value.trim() : '';
    let baseUrl = '';

    if (baseUrlValue) {
        try {
            const parsedUrl = new URL(baseUrlValue);
            baseUrl = parsedUrl.toString();
        } catch (error) {
            showFieldError(baseUrlInput, 'Invalid URL');
            if (!firstInvalid) firstInvalid = baseUrlInput;
            errors.push('baseUrl');
        }
    }

    return { baseUrl, firstInvalid };
}

/**
 * Validate and collect login configuration from monitor form
 *
 * @param {HTMLElement} modal - Modal element containing form
 * @param {Array} errors - Error array to append to
 * @param {HTMLElement|null} firstInvalid - First invalid field (or null)
 * @returns {Object} - { loginConfig: object, firstInvalid: HTMLElement|null }
 */
function validateAndCollectLogin(modal, errors, firstInvalid) {
    const loginPathInput = modal.querySelector('#monitor-login-path');
    const loginMethodSelect = modal.querySelector('#monitor-login-method');
    const loginUsernameInput = modal.querySelector('#monitor-login-username');
    const loginPasswordInput = modal.querySelector('#monitor-login-password');
    const loginBodyInput = modal.querySelector('#monitor-login-body');
    const tokenLocationSelect = modal.querySelector('#monitor-token-location');
    const tokenHeaderInput = modal.querySelector('#monitor-token-header');
    const tokenPrefixInput = modal.querySelector('#monitor-token-prefix');
    const loginEnabledCheckbox = modal.querySelector('#monitor-login-enabled');
    const persistPasswordCheckbox = modal.querySelector('#monitor-persist-password');

    // Validate login method
    const loginMethod = (loginMethodSelect?.value || 'GET').toUpperCase();
    if (!MONITOR_ALLOWED_METHODS.includes(loginMethod)) {
        showFieldError(loginMethodSelect, 'Method must be GET/POST/PUT/PATCH/DELETE');
        if (!firstInvalid) firstInvalid = loginMethodSelect;
        errors.push('login.method');
    } else if (loginMethodSelect) {
        loginMethodSelect.value = loginMethod;
    }

    // Validate token location
    const tokenLocationValue = tokenLocationSelect?.value ? tokenLocationSelect.value.trim() : '';
    if (tokenLocationValue) {
        const tokenResult = ValidationService.validateTokenLocation(tokenLocationValue);
        if (!tokenResult.valid) {
            showFieldError(tokenLocationSelect, tokenResult.error);
            if (!firstInvalid) firstInvalid = tokenLocationSelect;
            errors.push('login.tokenLocation');
        }
    }

    const loginConfig = {
        enabled: Boolean(loginEnabledCheckbox?.checked),
        path: loginPathInput?.value.trim() || '',
        method: loginMethod,
        username: loginUsernameInput?.value || '',
        password: loginPasswordInput?.value || '',
        bodyTemplate: loginBodyInput?.value || '',
        tokenLocation: tokenLocationValue,
        tokenHeaderName: tokenHeaderInput?.value || '',
        tokenPrefix: tokenPrefixInput?.value || '',
        persistPassword: Boolean(persistPasswordCheckbox?.checked)
    };

    return { loginConfig, firstInvalid };
}

/**
 * Validate and collect schedule configuration from monitor form
 *
 * @param {HTMLElement} modal - Modal element containing form
 * @param {Array} errors - Error array to append to
 * @param {HTMLElement|null} firstInvalid - First invalid field (or null)
 * @returns {Object} - { scheduleConfig: object, firstInvalid: HTMLElement|null }
 */
function validateAndCollectSchedule(modal, errors, firstInvalid) {
    const scheduleEnabledCheckbox = modal.querySelector('#monitor-schedule-enabled');
    const scheduleIntervalInput = modal.querySelector('#monitor-schedule-interval');
    let intervalValue = Number(scheduleIntervalInput?.value || 0);

    // Validate interval only when schedule is enabled
    if (Boolean(scheduleEnabledCheckbox?.checked)) {
        const intervalResult = ValidationService.validateInterval(intervalValue);
        if (!intervalResult.valid) {
            showFieldError(scheduleIntervalInput, intervalResult.error);
            if (!firstInvalid) firstInvalid = scheduleIntervalInput;
            errors.push('schedule.intervalSec');
        }
    }

    const scheduleConfig = {
        enabled: Boolean(scheduleEnabledCheckbox?.checked),
        intervalSec: intervalValue
    };

    return { scheduleConfig, firstInvalid };
}

/**
 * Validate and collect all tests from monitor edit context
 *
 * @param {Array} errors - Error array to append to
 * @param {HTMLElement|null} firstInvalid - First invalid field (or null)
 * @returns {Object} - { tests: array, firstInvalid: HTMLElement|null }
 */
function validateAndCollectTests(errors, firstInvalid) {
    const tests = [];

    monitorEditContext.tests.forEach((test, index) => {
        const method = (test.method || 'GET').toUpperCase();
        const methodField = document.querySelector(`select[data-test-index="${index}"][data-field="method"]`);
        const methodResult = ValidationService.validateHTTPMethod(method);
        if (!methodResult.valid) {
            showFieldError(methodField, methodResult.error);
            if (!firstInvalid) firstInvalid = methodField;
            errors.push(`tests[${index}].method`);
        }

        const expectedField = document.querySelector(`input[data-test-index="${index}"][data-field="expectedStatusRaw"]`);
        const expectedStatusResult = ValidationService.validateStatusCodes(test.expectedStatusRaw || '');
        let expectedNumbers = [];
        if (!expectedStatusResult.valid) {
            showFieldError(expectedField, expectedStatusResult.error);
            if (!firstInvalid) firstInvalid = expectedField;
            errors.push(`tests[${index}].expectedStatus`);
        } else {
            expectedNumbers = expectedStatusResult.sanitized;
        }

        const headersField = document.querySelector(`textarea[data-test-index="${index}"][data-field="headersRaw"]`);
        const headersResult = ValidationService.validateHeaders(test.headersRaw || '', { allowEmpty: true });
        let headersObject = {};
        if (!headersResult.valid) {
            showFieldError(headersField, headersResult.error);
            if (!firstInvalid) firstInvalid = headersField;
            errors.push(`tests[${index}].headers`);
        } else {
            headersObject = headersResult.sanitized;
        }

        tests.push({
            id: test.id || generateTestId(),
            name: test.name || '',
            required: Boolean(test.required),
            requiresLogin: Boolean(test.requiresLogin),
            method,
            path: test.path || '',
            expectedStatus: expectedNumbers,
            bodyTemplate: test.bodyTemplate || '',
            headers: headersObject
        });
    });

    return { tests, firstInvalid };
}

/**
 * Collect and validate all monitor configuration from form
 *
 * Orchestrates validation by calling specialized helper functions for each section.
 *
 * @param {HTMLElement} modal - Modal element containing form
 * @param {Object} project - Project data (currently unused)
 * @returns {Object|null} - Monitor configuration object or null if validation fails
 */
function collectMonitorFromForm(modal, project) {
    clearMonitorValidation();
    const errors = [];
    let firstInvalid = null;

    // Validate and collect each section using helper functions
    const baseUrlResult = validateAndCollectBaseUrl(modal, errors, firstInvalid);
    firstInvalid = baseUrlResult.firstInvalid;

    const loginResult = validateAndCollectLogin(modal, errors, firstInvalid);
    firstInvalid = loginResult.firstInvalid;

    const scheduleResult = validateAndCollectSchedule(modal, errors, firstInvalid);
    firstInvalid = scheduleResult.firstInvalid;

    const testsResult = validateAndCollectTests(errors, firstInvalid);
    firstInvalid = testsResult.firstInvalid;

    // Handle validation errors
    if (errors.length) {
        monitorEditContext.hasValidationErrors = true;
        updateMonitorActionButtons();
        if (firstInvalid && typeof firstInvalid.focus === 'function') {
            firstInvalid.focus();
        }
        return null;
    }

    // All validation passed - return complete monitor configuration
    monitorEditContext.hasValidationErrors = false;
    updateMonitorActionButtons();
    return {
        baseUrl: baseUrlResult.baseUrl,
        login: loginResult.loginConfig,
        tests: testsResult.tests,
        schedule: scheduleResult.scheduleConfig
    };
}

function cloneMonitorData(source) {
    return JSON.parse(JSON.stringify(source || {}));
}

function countMonitorDifferences(previousMonitor, nextMonitor) {
    const stack = [[previousMonitor, nextMonitor]];
    let diffCount = 0;
    while (stack.length) {
        const [prev, next] = stack.pop();
        if (prev === next) continue;
        if (typeof prev !== 'object' || typeof next !== 'object' || prev === null || next === null) {
            if (prev !== next) diffCount += 1;
            continue;
        }
        const keys = new Set([...Object.keys(prev), ...Object.keys(next)]);
        keys.forEach((key) => {
            stack.push([prev[key], next[key]]);
        });
    }
    return diffCount;
}

function enterMonitorEditMode(project) {
    console.log('enterMonitorEditMode - project.monitor:', project.monitor);
    console.log('enterMonitorEditMode - project.monitor.tests:', project.monitor?.tests);
    
    monitorEditContext.isEditing = true;
    monitorEditContext.dirty = false;
    monitorEditContext.hasValidationErrors = false;
    monitorEditContext.originalMonitor = cloneMonitorData(project.monitor || createDefaultMonitor());
    monitorEditContext.tests = prepareMonitorTestsForEdit(project.monitor || {});
    
    console.log('enterMonitorEditMode - monitorEditContext.tests:', monitorEditContext.tests);
    
    clearMonitorValidation();
    removeMonitorEditListeners();
    const modal = document.getElementById('edit-modal');
    if (modal) {
        addMonitorEditListener(modal, 'input', (event) => {
            clearFieldError(event.target);
            setMonitorDirty(true);
            
            // עדכון סטטוסים
            if (event.target.id?.startsWith('monitor-base-url') || 
                event.target.id?.startsWith('monitor-login')) {
                updateAuthStatus();
            }
            if (event.target.id?.startsWith('monitor-schedule')) {
                updateScheduleStatus();
            }
        });
        addMonitorEditListener(modal, 'change', (event) => {
            clearFieldError(event.target);
            setMonitorDirty(true);
            
            // עדכון סטטוסים
            if (event.target.id?.startsWith('monitor-base-url') || 
                event.target.id?.startsWith('monitor-login')) {
                updateAuthStatus();
            }
            if (event.target.id?.startsWith('monitor-schedule')) {
                updateScheduleStatus();
            }
        });
    }
    renderMonitorTestsEditor();
    const { testsList, testsEditor, testsControls } = getMonitorModalElements();
    if (testsList) testsList.hidden = true;
    if (testsEditor) testsEditor.hidden = false;
    if (testsControls) testsControls.hidden = false;
    
    // כפתור Save הישן תמיד גלוי!
    setLegacySaveDisabled(false);
    
    // עדכון סטטוסים ראשוני
    updateAuthStatus();
    updateScheduleStatus();
    
    updateMonitorActionButtons();
    if (monitorEditContext.projectIndex !== null) {
        syncMonitorRunButtons(monitorEditContext.projectIndex);
    }
}

function exitMonitorEditMode(options = {}) {
    const { restoreOriginal = false, silent = false } = options;
    if (!monitorEditContext.isEditing && !silent) {
        updateMonitorActionButtons();
        return;
    }
    removeMonitorEditListeners();
    monitorEditContext.isEditing = false;
    clearMonitorValidation();
    monitorEditContext.dirty = false;
    monitorEditContext.tests = [];
    const { testsList, testsEditor, testsControls } = getMonitorModalElements();
    if (testsEditor) {
        testsEditor.innerHTML = '';
        testsEditor.hidden = true;
    }
    if (testsControls) {
        testsControls.hidden = true;
    }
    if (testsList) {
        testsList.hidden = false;
    }
    setLegacySaveDisabled(false);
    updateMonitorActionButtons();
    if (monitorEditContext.projectIndex !== null) {
        syncMonitorRunButtons(monitorEditContext.projectIndex);
    }
    if (restoreOriginal && monitorEditContext.originalMonitor && monitorEditContext.projectIndex !== null) {
        const project = projectsData[monitorEditContext.projectIndex];
        if (project) {
            project.monitor = cloneMonitorData(monitorEditContext.originalMonitor);
            mergeDefaults(project.monitor, DEFAULT_MONITOR_TEMPLATE);
            populateMonitorTabs(project);
        }
    }
    monitorEditContext.originalMonitor = null;
}
function handleMonitorDelete() {
    const index = monitorEditContext.projectIndex;
    if (index === null || index < 0 || index >= projectsData.length) {
        return;
    }
    confirmDelete(index);
}


function initializeMonitorUI() {
    const { cancelButton, deleteButton, addTestButton, legacySaveButton } = getMonitorModalElements();
    if (cancelButton) {
        cancelButton.addEventListener('click', closeEditModal);
    }
    if (deleteButton) {
        deleteButton.addEventListener('click', handleMonitorDelete);
        deleteButton.hidden = true;
        deleteButton.disabled = false;
    }
    if (addTestButton) {
        addTestButton.addEventListener('click', handleTestAdd);
    }
    if (legacySaveButton) {
        legacySaveButton.addEventListener('click', (event) => {
            try { event?.preventDefault?.(); event?.stopPropagation?.(); } catch (_) {}
            saveEdit();
        });
    }
    // Bind example loader button in empty state
    const loadExampleBtn = document.getElementById('load-example-button');
    if (loadExampleBtn && !loadExampleBtn.dataset.bound) {
        loadExampleBtn.addEventListener('click', loadMonitorExample);
        loadExampleBtn.dataset.bound = 'true';
    }
    const editForm = document.getElementById('edit-form');
    if (editForm) {
        editForm.addEventListener('submit', (e) => {
            e.preventDefault();
        });
    }
    updateMonitorActionButtons();
}

function loadMonitorExample() {
    try {
        if (!monitorEditContext || !monitorEditContext.isEditing) return;
        const exampleConfig = {
            baseUrl: "https://jsonplaceholder.typicode.com",
            login: {
                enabled: false,
                path: "/auth/login",
                method: "POST",
                username: "",
                password: "",
                bodyTemplate: "",
                tokenLocation: "json:token",
                tokenHeaderName: "Authorization",
                tokenPrefix: "Bearer ",
                persistPassword: false
            },
            tests: [
                {
                    id: generateTestId(),
                    name: "Get Posts",
                    method: "GET",
                    path: "/posts",
                    expectedStatus: HTTP_STATUS.DEFAULT_EXPECTED,
                    bodyTemplate: "",
                    headers: {},
                    required: true,
                    requiresLogin: false
                },
                {
                    id: generateTestId(),
                    name: "Create Post",
                    method: "POST",
                    path: "/posts",
                    expectedStatus: [HTTP_STATUS.CREATED],
                    bodyTemplate: '{"title":"Test Post","body":"Example content","userId":1}',
                    headers: { "Content-Type": "application/json" },
                    required: true,
                    requiresLogin: false
                },
                {
                    id: generateTestId(),
                    name: "Delete Post",
                    method: "DELETE",
                    path: "/posts/1",
                    expectedStatus: HTTP_STATUS.DEFAULT_EXPECTED,
                    bodyTemplate: "",
                    headers: {},
                    required: false,
                    requiresLogin: false
                }
            ],
            schedule: { enabled: false, intervalSec: INTERVALS.DEFAULT_SCHEDULE_SEC }
        };

        setMonitorTextValue('monitor-base-url', exampleConfig.baseUrl);
        // Load tests into edit context
        monitorEditContext.tests = prepareMonitorTestsForEdit({ tests: exampleConfig.tests });
        setMonitorDirty(true);
        renderMonitorTestsEditor();
        showMonitorToast('pass', 'Example Loaded', 'JSONPlaceholder demo configuration loaded. Click Save to apply.');
    } catch (err) {
        console.warn('Failed to load monitor example:', err);
        showMonitorToast('fail', 'Example load failed', 'Could not load demo configuration.');
    }
}

async function runProjectPreview(index) {
    try {
        const modal = document.getElementById('edit-modal');
        if (!modal) return;
        const project = projectsData[index];
        if (!project) return;
        // Validate and collect current form without saving
        const collected = collectMonitorFromForm(modal, project);
        if (!collected) {
            showMonitorToast('unknown', 'Cannot run', 'Fix validation errors before running.');
            return;
        }
        const original = project.monitor ? cloneMonitorData(project.monitor) : createDefaultMonitor();
        const tempMonitor = {
            ...cloneMonitorData(original),
            baseUrl: collected.baseUrl,
            login: { ...original.login, ...collected.login },
            tests: collected.tests,
            schedule: { ...original.schedule, ...collected.schedule }
        };
        mergeDefaults(tempMonitor, DEFAULT_MONITOR_TEMPLATE);
        // Swap to temporary monitor
        project.monitor = tempMonitor;
        try {
            await runProjectChecks(index, { mode: 'manual', source: 'modal', preview: true });
        } finally {
            // Restore original monitor configuration
            project.monitor = original;
        }
    } catch (e) {
        console.warn('Preview run failed:', e);
        showMonitorToast('fail', 'Run failed', 'Unexpected error during preview run.');
    }
}


function populateMonitorTabs(project) {
    if (!project || !project.monitor) {
        clearMonitorTabs();
        return;
    }
    const monitor = project.monitor;
    const login = monitor.login || {};
    const schedule = monitor.schedule || {};
    setMonitorTextValue('monitor-base-url', monitor.baseUrl);
    setMonitorCheckboxValue('monitor-login-enabled', login.enabled);
    setMonitorTextValue('monitor-login-path', login.path);
    const methodSource = normalizeMonitorString(login.method);
    const methodCandidate = methodSource ? methodSource.toUpperCase() : '';
    const methodValue = methodCandidate && MONITOR_KNOWN_METHODS.has(methodCandidate) ? methodCandidate : methodSource;
    setMonitorSelectValue('monitor-login-method', methodValue);
    setMonitorTextValue('monitor-login-username', login.username);
    setMonitorTextValue('monitor-login-password', login.password);
    setMonitorTextareaValue('monitor-login-body', login.bodyTemplate);
    setMonitorSelectValue('monitor-token-location', normalizeMonitorString(login.tokenLocation));
    setMonitorTextValue('monitor-token-header', login.tokenHeaderName);
    setMonitorTextValue('monitor-token-prefix', login.tokenPrefix);
    setMonitorCheckboxValue('monitor-persist-password', login.persistPassword);
    
    // כניסה אוטומטית למצב עריכה של טסטים!
    enterMonitorEditMode(project);
    
    // הטאב Tests כבר הראשוני ב-HTML, לא צריך מעבר ידני
    
    setMonitorCheckboxValue('monitor-schedule-enabled', schedule.enabled);
    setMonitorTextValue('monitor-schedule-interval', schedule.intervalSec);
}

function isPlainObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function cloneDefaultValue(value) {
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

function mergeDefaults(target, defaults) {
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

function ensureMonitorDefaults(projects) {
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
// Theme Toggle - toggle app theme
document.getElementById("toggle-theme").addEventListener("click", () => {
    document.body.classList.toggle("dark");
    // Persist theme preference in localStorage
    const isDarkMode = document.body.classList.contains("dark");
    SafeStorage.setItem('darkMode', isDarkMode);
});

document.getElementById("fileInput").addEventListener("change", handleFileUpload);

function truncateText(text, maxLength = 20) {
    if (!text) return "";
    const t = (text.length <= maxLength) ? text : (text.substring(0, maxLength) + "...");
    return escapeHTML(t);
}

// Escape HTML to prevent XSS when injecting into innerHTML/attributes
function escapeHTML(str) {
    if (str === null || str === undefined) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function renderHotItems() {
    const hotTicker = document.getElementById("hot-items-ticker");
    if (!hotTicker || !projectsData.length) return;

    const names = projectsData.map(item => item.name).join(" • ");
    hotTicker.textContent = names;
}

function handleFileUpload(event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function (e) {
            try {
                const data = JSON.parse(e.target.result);
                
                // בדיקה אם זה פורמט חדש (עם pageTitle) או ישן (רק מערך)
                if (Array.isArray(data)) {
                    // פורמט ישן - רק מערך של פרויקטים
                    projectsData = data;
                } else if (data.projects && Array.isArray(data.projects)) {
                    // פורמט חדש - אובייקט עם pageTitle ו-projects
                    projectsData = data.projects;
                    if (data.pageTitle) {
                        pageTitle = data.pageTitle;
                        const titleElement = document.getElementById('page-title');
                        if (titleElement) {
                            titleElement.textContent = pageTitle;
                        }
                        SafeStorage.setItem('pageTitle', pageTitle);
                    }
                } else {
                    throw new Error('Invalid JSON structure');
                }
                
                ensureMonitorDefaults(projectsData);
                // Persist to localStorage
                SafeStorage.setJSON('projectsData', projectsData);
                // Log history entry
                addToHistory('Import projects', 'All projects replaced from file');
                // Re-render projects
                renderProjects(projectsData);
                renderHotItems();
            } catch (error) {
                console.error("Invalid JSON file:", error);
                alert('The uploaded file is not valid JSON.');
            }
        };
        reader.readAsText(file);
    }
}

function renderProjects(projects) {
    const container = document.getElementById("projects-container");
    if (!container) {
        console.error("שגיאה: לא נמצא האלמנט projects-container!");
        return;
    }
    
    container.innerHTML = "";
    
    const noProjectsMessage = document.getElementById("no-projects-message");
    
    if (!projects || projects.length === 0) {
        if (noProjectsMessage) {
            noProjectsMessage.style.display = "block";
        }
        return;
    }
    
    if (noProjectsMessage) {
        noProjectsMessage.style.display = "none";
    }

    projects.forEach((project, index) => {
        const card = document.createElement("div");
        card.className = "card";
        card.dataset.index = String(index); // FIX: Add data-index to card for updateMonitorIndicatorsForProject

        const truncatedName = truncateText(project.name, TEXT_LIMITS.PROJECT_NAME);

        let fieldsHTML = "";
        let hasAnyField = false;
        
        // בדיקה אם יש לפחות שדה אחד עם מידע
        for (let i = INDICES.FIELD_START; i <= FIELD_LIMITS.MAX_FIELDS; i++) {
            const fieldValue = project.fields?.[i];
            if (fieldValue && fieldValue.trim() !== "" && fieldValue.trim().toLowerCase() !== "no value") {
                hasAnyField = true;
                break;
            }
        }

        if (!hasAnyField) {
            // אין שום מידע - הצג הודעה במקום השורה הראשונה, ושאר השורות נסתרות
            fieldsHTML = `<p class="card-text" style="text-align: center; color: rgba(0, 0, 0, 0.4); font-style: italic; margin: 0;">אין מידע זמין על הפרויקט</p>`;
            // הוסף 3 שורות נסתרות נוספות כדי לשמור על גובה הכרטיס
            for (let i = INDICES.FIRST; i < (FIELD_LIMITS.MAX_FIELDS - 1); i++) {
                fieldsHTML += `<p class="card-text" style="visibility: hidden;">&nbsp;</p>`;
            }
        } else {
            // יש מידע - הצג שדות
            for (let i = INDICES.FIELD_START; i <= FIELD_LIMITS.MAX_FIELDS; i++) {
                const fieldValue = project.fields?.[i];
                // Skip if no value or "No value"
                if (!fieldValue || fieldValue.trim() === "" || fieldValue.trim().toLowerCase() === "no value") {
                    // Add empty placeholder to maintain card height
                    fieldsHTML += `<p class="card-text" style="visibility: hidden;">&nbsp;</p>`;
                    continue;
                }
                const fieldName = truncateText(project.fieldNames?.[i] || `Field ${i}`, TEXT_LIMITS.FIELD_NAME);
                const truncatedValue = truncateText(fieldValue, TEXT_LIMITS.FIELD_VALUE);
                fieldsHTML += `<p class="card-text"><strong>${fieldName}:</strong> ${truncatedValue}</p>`;
            }
        }


        card.innerHTML = `
        <div class="card-body">
            <h3 class="card-title" title="${truncatedName}">${truncatedName}</h3>
            ${fieldsHTML}
            <div class="status-indicator" data-index="${index}" title="Not checked"></div>
        </div>
        `;
        const accessibleName = (project && typeof project.name === 'string' && project.name.trim()) ? project.name.trim() : `Project ${index + 1}`;
        card.classList.add('card--interactive');
        card.tabIndex = 0;
        card.setAttribute('role', 'button');
        card.setAttribute('aria-label', `Edit project ${accessibleName}`);
        card.addEventListener('click', () => {
            openEditModal(index);
        });
        card.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                openEditModal(index);
            }
        });


        // Ensure safe title attribute without breaking HTML
        const titleEl = card.querySelector('.card-title');
        if (titleEl) {
            const nameVal = (project.name && typeof project.name === 'string') ? project.name : '';
            const titleText = nameVal.length <= 20 ? nameVal : (nameVal.substring(0, 20) + '...');
            titleEl.setAttribute('title', titleText);
        }

        container.appendChild(card);
        decorateCardWithMonitorStatus(card, project, index);

    });
    checkProjectStatuses();
    runScheduledMonitorCycle();
}

/**
 * Validate project index before opening edit modal
 *
 * @param {number} index - Project index to validate
 * @returns {boolean} - True if valid, false otherwise
 */
function validateProjectIndexForEdit(index) {
    if (index < 0 || index >= projectsData.length) {
        alert('Invalid project index.');
        return false;
    }
    return true;
}

/**
 * Setup monitor tabs for editing a project
 *
 * @param {Object} project - Project data
 */
function setupMonitorTabsForEdit(project) {
    const monitorTabsContainer = document.getElementById('monitor-tabs');
    if (monitorTabsContainer) {
        clearMonitorTabs();
        setupMonitorTabs(monitorTabsContainer);
        resetMonitorTabs(monitorTabsContainer);
        populateMonitorTabs(project);
        monitorTabsContainer.hidden = false;
    }
}

/**
 * Setup modal buttons (cancel, delete, save, run) for edit modal
 *
 * @param {number} index - Project index
 */
function setupEditModalButtons(index) {
    const {
        header: monitorHeader,
        cancelButton: monitorCancelButton,
        deleteButton: monitorDeleteButton,
        legacySaveButton
    } = getMonitorModalElements();

    monitorEditContext.projectIndex = index;

    const modalRunButton = document.getElementById('monitor-run-button');
    if (modalRunButton) {
        registerMonitorRunButton(index, modalRunButton, 'modal');
    }

    if (monitorHeader) {
        monitorHeader.hidden = false;
    }

    setMonitorDirty(false);

    if (monitorCancelButton) {
        monitorCancelButton.hidden = false;
        monitorCancelButton.disabled = false;
    }

    if (monitorDeleteButton) {
        monitorDeleteButton.hidden = false;
        monitorDeleteButton.disabled = false;
    }

    if (legacySaveButton) {
        legacySaveButton.hidden = false;
        legacySaveButton.disabled = false;
    }
}

/**
 * Populate basic project fields (name, URL) in edit modal
 *
 * @param {Object} project - Project data
 */
function populateBasicEditFields(project) {
    const editName = document.getElementById("edit-name");
    if (editName) {
        editName.value = project.name || "";
        editName.setAttribute('maxlength', String(TEXT_LIMITS.PROJECT_NAME));
    }

    const editURL = document.getElementById("edit-url");
    if (editURL) {
        editURL.value = project.url || "";
    }
}

/**
 * Setup dynamic fields editor with add/remove functionality
 *
 * @param {Object} project - Project data
 * @param {HTMLElement} fieldsContainer - Container for dynamic fields
 * @returns {boolean} - True if setup successful, false otherwise
 */
function setupDynamicFieldsEditor(project, fieldsContainer) {
    if (!fieldsContainer) {
        console.error("שגיאה: לא נמצא האלמנט edit-fields-container!");
        return false;
    }

    // Compute initial field count based on existing data
    const computeInitialCount = () => {
        let count = 0;
        for (let i = INDICES.FIELD_START; i <= FIELD_LIMITS.MAX_FIELDS; i++) {
            const hasName = project.fieldNames && project.fieldNames[i];
            const hasVal = project.fields && project.fields[i];
            if (hasName || hasVal) count = i;
        }
        return Math.max(1, count);
    };

    // Render single field block
    const renderFieldBlock = (i, nameVal, valueVal) => `
            <label for="edit-field-name-${i}">שם שדה ${i}:</label>
            <input type="text" id="edit-field-name-${i}" value="${escapeHTML(nameVal ?? `Field ${i}`)}" maxlength="${TEXT_LIMITS.FIELD_NAME}">

            <label for="edit-field-value-${i}">ערך שדה ${i}:</label>
            <input type="text" id="edit-field-value-${i}" value="${escapeHTML(valueVal ?? 'No value')}" maxlength="${TEXT_LIMITS.FIELD_VALUE}">
        `;

    // Build initial HTML for all fields
    let fieldsHTML = "";
    const initialCount = computeInitialCount();
    for (let i = 1; i <= initialCount; i++) {
        const fieldName = project.fieldNames?.[i] ?? `Field ${i}`;
        const fieldValue = project.fields?.[i] ?? 'No value';
        fieldsHTML += renderFieldBlock(i, fieldName, fieldValue);
    }
    fieldsHTML += `
        <div class="dynamic-add-wrapper">
            <button type="button" id="edit-add-field-button" class="monitor-ghost-button dynamic-plus" aria-label="Add field">+</button>
            <button type="button" id="edit-remove-field-button" class="monitor-ghost-button dynamic-minus" aria-label="Remove field">–</button>
        </div>
    `;

    fieldsContainer.innerHTML = fieldsHTML;

    // Wire up add/remove button handlers
    const editPlus = document.getElementById('edit-add-field-button');
    const editMinus = document.getElementById('edit-remove-field-button');
    const getEditCount = () => fieldsContainer.querySelectorAll('input[id^="edit-field-name-"]').length;
    const updateEditButtons = () => {
        const count = getEditCount();
        if (editPlus) editPlus.style.display = count >= FIELD_LIMITS.MAX_FIELDS ? 'none' : '';
        if (editMinus) editMinus.disabled = count <= FIELD_LIMITS.MIN_FIELDS;
    };

    if (editPlus) {
        editPlus.addEventListener('click', (e) => {
            try { e?.preventDefault?.(); e?.stopPropagation?.(); } catch(_) {}
            const current = getEditCount();
            if (current >= FIELD_LIMITS.MAX_FIELDS) return;
            const idx = current + 1;
            const fragment = document.createElement('div');
            fragment.innerHTML = renderFieldBlock(idx, `Field ${idx}`, 'No value');
            const wrapper = fieldsContainer.querySelector('.dynamic-add-wrapper');
            if (wrapper) {
                const nodes = Array.from(fragment.childNodes);
                nodes.forEach(node => fieldsContainer.insertBefore(node, wrapper));
            }
            updateEditButtons();
        });
    }

    if (editMinus) {
        editMinus.addEventListener('click', (e) => {
            try { e?.preventDefault?.(); e?.stopPropagation?.(); } catch(_) {}
            const current = getEditCount();
            if (current <= FIELD_LIMITS.MIN_FIELDS) return;
            const idx = current;
            const nameInput = document.getElementById(`edit-field-name-${idx}`);
            const valueInput = document.getElementById(`edit-field-value-${idx}`);
            const nameLabel = fieldsContainer.querySelector(`label[for="edit-field-name-${idx}"]`);
            const valueLabel = fieldsContainer.querySelector(`label[for="edit-field-value-${idx}"]`);
            [nameInput, valueInput, nameLabel, valueLabel].forEach(el => el && el.remove());
            updateEditButtons();
        });
    }

    updateEditButtons();
    return true;
}

/**
 * Open edit modal for a project
 *
 * Orchestrates modal setup by calling specialized helper functions.
 *
 * @param {number} index - Project index to edit
 */
function openEditModal(index) {
    // Validate project index
    if (!validateProjectIndexForEdit(index)) {
        return;
    }

    currentProjectIndex = index;
    const project = projectsData[index];

    // Setup monitor tabs
    setupMonitorTabsForEdit(project);

    // Setup modal buttons
    setupEditModalButtons(index);

    // Populate basic fields (name, URL)
    populateBasicEditFields(project);

    // Setup dynamic fields editor
    const fieldsContainer = document.getElementById("edit-fields-container");
    if (!setupDynamicFieldsEditor(project, fieldsContainer)) {
        return;
    }

    // Show the modal
    const editModal = document.getElementById('edit-modal');
    if (editModal) {
        editModal.style.display = 'flex';
    }
}

/**
 * Validate edit modal inputs before saving
 *
 * @returns {Object|null} - { project, oldName } or null if invalid
 */
function validateEditInputs() {
    if (currentProjectIndex === null || currentProjectIndex < 0 || currentProjectIndex >= projectsData.length) {
        alert('Invalid project index.');
        return null;
    }

    const editName = document.getElementById("edit-name");
    if (!editName || !editName.value.trim()) {
        alert('Project name is required.');
        return null;
    }

    const project = projectsData[currentProjectIndex];
    const oldName = project.name;

    return { project, oldName };
}

/**
 * Collect basic project fields from edit form
 *
 * @param {Object} project - Project to update
 */
function collectBasicProjectFields(project) {
    const editName = document.getElementById("edit-name");
    if (editName) {
        project.name = editName.value.trim();
    }

    const editURL = document.getElementById("edit-url");
    if (editURL) {
        project.url = editURL.value.trim();
    }

    // Update custom fields
    for (let i = INDICES.FIELD_START; i <= FIELD_LIMITS.MAX_FIELDS; i++) {
        const fieldNameInput = document.getElementById(`edit-field-name-${i}`);
        const fieldValueInput = document.getElementById(`edit-field-value-${i}`);

        if (fieldNameInput && fieldValueInput) {
            project.fieldNames[i] = fieldNameInput.value.trim() || `Field ${i}`;
            project.fields[i] = fieldValueInput.value.trim() || "";
        }
    }
}

/**
 * Collect and merge monitor configuration data
 *
 * @param {Object} project - Project to update
 * @param {HTMLElement} editModal - Edit modal element
 * @returns {boolean} - True if successful, false if validation failed
 */
function collectAndMergeMonitorData(project, editModal) {
    if (!project.monitor) {
        project.monitor = createDefaultMonitor();
    }

    if (!editModal) {
        return true;
    }

    const collectedMonitor = collectMonitorFromForm(editModal, project);
    if (!collectedMonitor) {
        // Validation failed - collectMonitorFromForm already showed errors
        return false;
    }

    // Merge collected monitor data with existing state
    const existingMonitor = cloneMonitorData(project.monitor);
    const updatedMonitor = {
        ...existingMonitor,
        baseUrl: collectedMonitor.baseUrl,
        login: { ...existingMonitor.login, ...collectedMonitor.login },
        tests: collectedMonitor.tests,
        schedule: { ...existingMonitor.schedule, ...collectedMonitor.schedule }
    };

    // Preserve state data
    updatedMonitor.state = existingMonitor.state || {};

    // Ensure all defaults are present
    mergeDefaults(updatedMonitor, DEFAULT_MONITOR_TEMPLATE);

    project.monitor = updatedMonitor;

    // Validate and fix schedule interval
    const schedule = project.monitor.schedule || {};
    if (schedule.intervalSec !== undefined) {
        const interval = Number(schedule.intervalSec);
        if (!Number.isNaN(interval)) {
            schedule.intervalSec = Math.min(Math.max(interval, INTERVALS.MIN_SCHEDULE_SEC), INTERVALS.MAX_SCHEDULE_SEC);
        }
    }
    project.monitor.schedule = schedule;

    // Final merge to ensure consistency
    mergeDefaults(project.monitor, DEFAULT_MONITOR_TEMPLATE);

    return true;
}

/**
 * Finalize and persist edit changes
 *
 * @param {Object} project - Updated project
 * @param {string} oldName - Original project name
 */
function finalizeAndPersistEdit(project, oldName) {
    // Restart scheduler if needed
    runScheduledMonitorCycle();

    // Persist to localStorage
    SafeStorage.setJSON('projectsData', projectsData);

    // Add to history
    addToHistory("עריכה", `עריכת פרויקט: ${oldName} -> ${project.name}`);

    // Re-render projects
    renderProjects(projectsData);
    renderHotItems();

    // Reset dirty flag
    setMonitorDirty(false);

    // Close modal
    closeEditModal();
}

/**
 * Save all project data including Monitor configuration
 *
 * Orchestrates save by calling specialized helper functions.
 */
function saveEdit() {
    // Validate inputs
    const validated = validateEditInputs();
    if (!validated) {
        return;
    }

    const { project, oldName } = validated;

    // Collect basic project fields
    collectBasicProjectFields(project);

    // Collect and merge monitor configuration
    const editModal = document.getElementById('edit-modal');
    if (!collectAndMergeMonitorData(project, editModal)) {
        return; // Validation failed
    }

    // Finalize and persist changes
    finalizeAndPersistEdit(project, oldName);
}

// Helper functions for modal management
function closeEditModal() {
    const editModal = document.getElementById('edit-modal');
    if (editModal) {
        editModal.style.display = 'none';
    }
    currentProjectIndex = null;
    exitMonitorEditMode({ restoreOriginal: false, silent: true });
}

function forceCloseEditModal() {
    closeEditModal();
}

function openAddModal() {
    const addModal = document.getElementById('add-modal');
    if (!addModal) return;

    // Clear previous inputs
    const addName = document.getElementById('add-name');
    if (addName) addName.value = '';

    const addURL = document.getElementById('add-url');
    if (addURL) addURL.value = '';

    for (let i = INDICES.FIELD_START; i <= FIELD_LIMITS.MAX_FIELDS; i++) {
        const fieldNameInput = document.getElementById(`add-field-name-${i}`);
        const fieldValueInput = document.getElementById(`add-field-value-${i}`);
        if (fieldNameInput) fieldNameInput.value = '';
        if (fieldValueInput) fieldValueInput.value = '';
    }

    // Generate dynamic field inputs (start with one, allow up to 4)
    const addFieldsContainer = document.getElementById('add-fields-container');
    if (addFieldsContainer) {
        const renderAddBlock = (i) => `
            <label for="add-field-name-${i}">שם שדה ${i}:</label>
            <input type="text" id="add-field-name-${i}" maxlength="${TEXT_LIMITS.FIELD_NAME}" placeholder="Field ${i}">
            <label for="add-field-value-${i}">ערך שדה ${i}:</label>
            <input type="text" id="add-field-value-${i}" maxlength="${TEXT_LIMITS.FIELD_VALUE}" placeholder="No value">
        `;
        addFieldsContainer.innerHTML = renderAddBlock(1) + `
            <div class="dynamic-add-wrapper">
                <button type="button" id="add-add-field-button" class="monitor-ghost-button dynamic-plus" aria-label="Add field">+</button>
                <button type="button" id="add-remove-field-button" class="monitor-ghost-button dynamic-minus" aria-label="Remove field">–</button>
            </div>
        `;
        const addPlus = document.getElementById('add-add-field-button');
        const addMinus = document.getElementById('add-remove-field-button');
        const getAddCount = () => addFieldsContainer.querySelectorAll('input[id^="add-field-name-"]').length;
        const updateAddButtons = () => {
            const count = getAddCount();
            if (addPlus) addPlus.style.display = count >= FIELD_LIMITS.MAX_FIELDS ? 'none' : '';
            if (addMinus) addMinus.disabled = count <= FIELD_LIMITS.MIN_FIELDS;
        };
        if (addPlus) {
            addPlus.addEventListener('click', (e) => {
                try { e?.preventDefault?.(); e?.stopPropagation?.(); } catch(_) {}
                const current = getAddCount();
                if (current >= FIELD_LIMITS.MAX_FIELDS) return;
                const idx = current + 1;
                const frag = document.createElement('div');
                frag.innerHTML = renderAddBlock(idx);
                const wrapper = addFieldsContainer.querySelector('.dynamic-add-wrapper');
                if (wrapper) {
                    const nodes = Array.from(frag.childNodes);
                    nodes.forEach(n => addFieldsContainer.insertBefore(n, wrapper));
                }
                updateAddButtons();
            });
        }
        if (addMinus) {
            addMinus.addEventListener('click', (e) => {
                try { e?.preventDefault?.(); e?.stopPropagation?.(); } catch(_) {}
                const current = getAddCount();
                if (current <= FIELD_LIMITS.MIN_FIELDS) return;
                const idx = current;
                const nameInput = document.getElementById(`add-field-name-${idx}`);
                const valueInput = document.getElementById(`add-field-value-${idx}`);
                const nameLabel = addFieldsContainer.querySelector(`label[for="add-field-name-${idx}"]`);
                const valueLabel = addFieldsContainer.querySelector(`label[for="add-field-value-${idx}"]`);
                [nameInput, valueInput, nameLabel, valueLabel].forEach(el => el && el.remove());
                updateAddButtons();
            });
        }
        updateAddButtons();
    }

    addModal.style.display = 'flex';
}

function closeAddModal() {
    const addModal = document.getElementById('add-modal');
    if (addModal) {
        addModal.style.display = 'none';
    }
}

function openHistoryModal() {
    const historyModal = document.getElementById('history-modal');
    const historyContainer = document.getElementById('history-container');

    if (!historyModal || !historyContainer) return;

    // Clear previous content
    historyContainer.innerHTML = '';

    if (!projectHistory || projectHistory.length === 0) {
        historyContainer.innerHTML = '<p style="text-align: center; color: gray;">אין היסטוריה להצגה.</p>';
    } else {
        let historyHTML = '<ul class="history-list">';
        projectHistory.slice().reverse().forEach(item => {
            const escapedDate = escapeHTML(item.date);
            const escapedType = escapeHTML(item.type);
            const escapedDesc = escapeHTML(item.description);
            historyHTML += `
                <li class="history-item">
                    <strong>${escapedDate}</strong> - 
                    <span class="history-type">${escapedType}</span>: 
                    ${escapedDesc}
                </li>
            `;
        });
        historyHTML += '</ul>';
        historyContainer.innerHTML = historyHTML;
    }

    historyModal.style.display = 'flex';
}

function closeHistoryModal() {
    const historyModal = document.getElementById('history-modal');
    if (historyModal) {
        historyModal.style.display = 'none';
    }
}

function downloadUpdatedJSON() {
    // שמירה בפורמט חדש עם pageTitle
    const dataToSave = {
        pageTitle: pageTitle,
        projects: projectsData
    };
    
    const dataStr = JSON.stringify(dataToSave, null, 4);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'projects.json';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    addToHistory('Export', 'Projects exported to JSON file');
}

function saveNewProject() {
    const nameInput = document.getElementById("add-name");
    if (!nameInput) {
        console.error("שגיאה: לא נמצא האלמנט add-name!");
        return;
    }
    
    const projectName = nameInput.value.trim();
    
    if (!projectName) {
        alert('Please provide a project name.');
        return;
    }
    

    const newProject = {
        name: projectName,
        fieldNames: {},
        fields: {},
        monitor: createDefaultMonitor()
    };
    

    for (let i = INDICES.FIELD_START; i <= FIELD_LIMITS.MAX_FIELDS; i++) {
        const fieldNameInput = document.getElementById(`add-field-name-${i}`);
        const fieldValueInput = document.getElementById(`add-field-value-${i}`);
        
        if (fieldNameInput && fieldValueInput) {
            newProject.fieldNames[i] = fieldNameInput.value.trim() || `Field ${i}`;
            newProject.fields[i] = fieldValueInput.value.trim() || "No value";
        }
    }
    
    const urlInput = document.getElementById("add-url");
    newProject.url = urlInput?.value.trim() || "";

    projectsData.push(newProject);
    
    // Persist projects data in localStorage
    SafeStorage.setJSON('projectsData', projectsData);
    

    addToHistory('Add', `Project added: ${projectName}`);
    

    renderProjects(projectsData);
    renderHotItems();
    

    closeAddModal();
}

function confirmDelete(index) {
    if (index < 0 || index >= projectsData.length) {
        alert('Invalid project index.');
        return;
    }
    
    const projectName = projectsData[index].name;
    
    if (confirm(`Are you sure you want to delete the project "${projectName}"?`)) {

        const deletedProjectName = projectsData[index].name;
        const shouldCloseModal = monitorEditContext.projectIndex === index;
        if (shouldCloseModal) {
            forceCloseEditModal();
        }

        projectsData.splice(index, 1);
        
        // Persist projects data in localStorage
        SafeStorage.setJSON('projectsData', projectsData);
        

        addToHistory('Delete', `Project deleted: ${deletedProjectName}`);
        

        renderProjects(projectsData);
        renderHotItems();
    }
}

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

function addTextLengthLimit() {

    const addNameInput = document.getElementById('add-name');
    if (addNameInput) {
        addNameInput.setAttribute('maxlength', String(TEXT_LIMITS.PROJECT_NAME));
    }


    const editNameInput = document.getElementById('edit-name');
    if (editNameInput) {
        editNameInput.setAttribute('maxlength', String(TEXT_LIMITS.PROJECT_NAME));
    }


    for (let i = 1; i <= FIELD_LIMITS.MAX_FIELDS; i++) {

        const addFieldNameInput = document.getElementById(`add-field-name-${i}`);
        const addFieldValueInput = document.getElementById(`add-field-value-${i}`);

        if (addFieldNameInput) {
            addFieldNameInput.setAttribute('maxlength', String(TEXT_LIMITS.FIELD_NAME));
        }

        if (addFieldValueInput) {
            addFieldValueInput.setAttribute('maxlength', String(TEXT_LIMITS.FIELD_VALUE));
        }


        const editFieldNameInput = document.getElementById(`edit-field-name-${i}`);
        const editFieldValueInput = document.getElementById(`edit-field-value-${i}`);

        if (editFieldNameInput) {
            editFieldNameInput.setAttribute('maxlength', String(TEXT_LIMITS.FIELD_NAME));
        }

        if (editFieldValueInput) {
            editFieldValueInput.setAttribute('maxlength', String(TEXT_LIMITS.FIELD_VALUE));
        }
    }
}

window.addEventListener('load', () => {
    SafeStorage.removeItem('enableMonitorUI');
    initializeMonitorUI();
    startMonitorScheduler();

    // טעינת כותרת שמורה
    const savedTitle = SafeStorage.getItem('pageTitle');
    const titleElement = document.getElementById('page-title');
    if (savedTitle && titleElement) {
        titleElement.textContent = savedTitle;
    }
    
    // הוספת מאזין לשמירת כותרת
    if (titleElement) {
        // הגבלת תווים ל-45
        titleElement.addEventListener('input', () => {
            const text = titleElement.textContent;
            if (text.length > 45) {
                titleElement.textContent = text.substring(0, 45);
                // הזז את הסמן לסוף
                const range = document.createRange();
                const sel = window.getSelection();
                range.selectNodeContents(titleElement);
                range.collapse(false);
                sel.removeAllRanges();
                sel.addRange(range);
            }
        });
        
        titleElement.addEventListener('blur', () => {
            const newTitle = titleElement.textContent.trim();
            if (newTitle) {
                SafeStorage.setItem('pageTitle', newTitle);
                addToHistory('עדכון כותרת', `הכותרת שונתה ל: ${newTitle}`);
            }
        });
        
        // שמירה גם ב-Enter
        titleElement.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                titleElement.blur();
            }
        });
    }

    const savedDarkMode = SafeStorage.getItem('darkMode');
    if (savedDarkMode === 'true') {
        document.body.classList.add('dark');
    }


    // Load project history with SafeStorage
    projectHistory = SafeStorage.getJSON('projectHistory', []);


    // Load projects data with SafeStorage
    projectsData = SafeStorage.getJSON('projectsData');

    if (projectsData) {
        const migrated = ensureMonitorDefaults(projectsData);
        if (migrated) {
            SafeStorage.setJSON('projectsData', projectsData);
        }
        renderProjects(projectsData);
        renderHotItems();
    } else {
        // Try to load from projects.json, but handle failure gracefully
        fetch("projects.json")
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                projectsData = data;
                ensureMonitorDefaults(projectsData);
                SafeStorage.setJSON('projectsData', projectsData);
                renderProjects(projectsData);
                renderHotItems();
                addToHistory("טעינה ראשונית", "טעינת נתונים מקובץ ברירת מחדל");
            })
            .catch(error => {
                console.info("ℹ️ Starting with empty project list (projects.json not found - this is normal for first use or incognito mode)");
                // Start with empty project list - this is normal in incognito mode or first use
                projectsData = [];
                renderProjects(projectsData);
                renderHotItems();
            });
    }
	addTextLengthLimit();
});

window.addEventListener('beforeunload', () => {
    stopMonitorScheduler();
});

function checkProjectStatuses() {
    projectsData.forEach((project, index) => {
        const indicator = document.querySelector(`.url-indicator[data-index="${index}"]`) || document.querySelector(`.status-indicator[data-index="${index}"]`);
        if (!indicator) return;

        const setStatus = (color, title) => {
            // switch by classes instead of inline colors when possible
            indicator.classList.remove('url-up', 'url-down', 'url-unknown');
            if (color === '#8DC71E' || color === 'up') {
                indicator.classList.add('url-up');
            } else if (color === '#ff0033' || color === 'down') {
                indicator.classList.add('url-down');
            } else {
                indicator.classList.add('url-unknown');
            }
            if (title) indicator.title = title;
        };

        if (!project.url || !project.url.trim()) {
            setStatus('unknown', 'לא הוזנה כתובת לבדיקה');
            return;
        }

        let targetUrl;
        try {
            targetUrl = new URL(project.url);
        } catch (error) {
            setStatus('unknown', 'כתובת URL אינה תקינה');
            return;
        }

        fetch(targetUrl.toString(), { method: 'HEAD', mode: 'no-cors' })
            .then(() => {
                setStatus('up', 'האתר זמין (בדיקת no-cors)');
            })
            .catch(() => {
                setStatus('down', 'לא ניתן לפנות לכתובת (שגיאת רשת או חסימת CORS)');
            });
    });
}


setTimeout(checkProjectStatuses, 1500);
setInterval(checkProjectStatuses, 60000);

function checkLocalConnectivity() {
    const dnsServers = ["https://dns.google", "https://8.8.8.8", "https://8.8.4.4"];
    const banner = document.getElementById("connectivity-warning");
    let success = false;

    Promise.allSettled(
        dnsServers.map(server =>
            fetch(server, { method: "HEAD", mode: "no-cors" })
        )
    ).then(results => {
        success = results.some(result => result.status === "fulfilled");

        if (!success) {
            document.body.classList.add("connection-lost");
            if (banner) banner.style.display = "block";
        } else {
            document.body.classList.remove("connection-lost");
            if (banner) banner.style.display = "none";
        }
    }).catch(() => {
        document.body.classList.add("connection-lost");
        if (banner) banner.style.display = "block";
    });
}


setTimeout(checkLocalConnectivity, 2000);
setInterval(checkLocalConnectivity, 60000);

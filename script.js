// Global Variables
let projectsData = []; // Stores all project entries
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
        intervalSec: 3600
    },
    state: {
        lastRunAt: null,
        overall: "unknown",
        tests: {},
        failures: [],
        tokenStoredAt: null,
        lastCreatedId: null
    }
});

const monitorTemplateJSON = JSON.stringify(DEFAULT_MONITOR_TEMPLATE);

function createDefaultMonitor() {
    return JSON.parse(monitorTemplateJSON);
}

const MONITOR_REQUEST_TIMEOUT_MS = 15000;
const MONITOR_SCHEDULE_POLL_INTERVAL_MS = 10000;
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
        }, 240);
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
        removeMonitorToast(toast, 6000);
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
    const hasRequiredFail = results.some((result) => result && result.required && result.status === 'fail');
    if (hasRequiredFail) {
        return 'fail';
    }
    const hasAnyFail = results.some((result) => result && result.status === 'fail');
    if (hasAnyFail) {
        return 'partial';
    }
    const allPass = results.every((result) => result && result.status === 'pass');
    if (allPass) {
        return 'pass';
    }
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
    if (context.token) {
        monitor.state.tokenStoredAt = finishedAt;
    } else if (!monitor.state.tokenStoredAt) {
        monitor.state.tokenStoredAt = null;
    }
    try {
        localStorage.setItem('projectsData', JSON.stringify(projectsData));
    } catch (error) {
        console.warn('Failed to persist projectsData after manual run:', error);
    }
    updateMonitorIndicatorsForProject(index);
}

function updateMonitorIndicatorsForProject(index) {
    const project = projectsData[index];
    if (!project) return;
    
    console.log('🔄 Updating monitors for project', index, 'Status:', determineMonitorStatus(project));
    
    // עדכון אינדיקטור הנורה הקיימת
    const cards = document.querySelectorAll('.card');
    cards.forEach((card) => {
        const cardIndex = parseInt(card.dataset.index || '-1');
        if (cardIndex === index) {
            console.log('📍 Found card for project', index);
            
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
            
            // מעדכנים את שורת ה-Tests - זה החלק הקריטי!
            const testsRow = card.querySelector('.monitor-tests-status');
            console.log('🔍 Looking for .monitor-tests-status:', testsRow);
            
            if (testsRow) {
                const testsStatus = determineMonitorStatus(project);
                console.log('✅ Tests status determined:', testsStatus);
                
                const testsValue = testsRow.querySelector('.monitor-tests-value');
                console.log('🎯 Tests value element:', testsValue);
                
                if (testsValue) {
                    // עדכון קלאסים
                    const newClass = `monitor-tests-value status-${testsStatus.status.toLowerCase().replace('_', '-')}`;
                    console.log('📝 Setting new class:', newClass);
                    testsValue.className = newClass;
                    
                    // עדכון טקסט
                    console.log('📝 Setting new text:', testsStatus.label);
                    testsValue.textContent = testsStatus.label;
                    
                    // עדכון ARIA
                    testsValue.removeAttribute('title');
                    testsValue.setAttribute('aria-label', testsStatus.tooltip);
                    
                    console.log('✨ Tests status updated successfully!');
                } else {
                    console.warn('⚠️ Could not find .monitor-tests-value inside testsRow');
                }
            } else {
                console.warn('⚠️ Could not find .monitor-tests-status in card');
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
    let expectedStatuses = Array.isArray(test.expectedStatus) && test.expectedStatus.length ? test.expectedStatus.map((value) => Number(value)).filter((value) => Number.isFinite(value)) : [200];
    if (!expectedStatuses.length) {
        expectedStatuses = [200];
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

function handleMonitorRunClick(index, options) {
    if (monitorRunningProjects.has(index)) {
        return;
    }
    runProjectChecks(index, options || { mode: 'manual' }).catch((error) => {
        console.error('Manual run failed:', error);
        monitorRunningProjects.delete(index);
        showMonitorToast('fail', 'Run failed', 'Unexpected error during manual run.');
        syncMonitorRunButtons(index);
    });
}

async function runProjectChecks(index, options = {}) {
    const project = projectsData[index];
    if (!project) {
        showMonitorToast('unknown', 'Run skipped', 'Project not found.');
        return;
    }
    if (!project.monitor) {
        showMonitorToast('unknown', 'Run skipped', 'Monitor is not configured for this project.');
        return;
    }
    const isPreview = Boolean(options && options.preview);
    const context = getMonitorRunContext(index);
    resetMonitorRunContext(context, options.mode || 'manual');
    context.source = options && options.source ? options.source : 'card';
    beginMonitorRun(index, context);
    const monitor = project.monitor;
    const tests = Array.isArray(monitor.tests) ? monitor.tests : [];
    const results = [];
    let runError = null;
    let shortCircuitReason = null;
    try {
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
        } else {
            await performLogin(project, context);
            if (context.aborted) {
                return;
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
        }
    } catch (error) {
        runError = error;
    } finally {
        endMonitorRun(index, context);
    }
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
    console.log('🚦 Run complete! isPreview:', isPreview, 'Project:', index, 'Results:', results.length);
    
    if (!isPreview) {
        console.log('✅ Calling persistRunResult...');
        persistRunResult(project, index, results, context);
        console.log('✅ persistRunResult completed!');
    } else {
        console.warn('⚠️ PREVIEW MODE - not persisting results!');
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
        if (monitorRunningProjects.has(index)) return;
        if (monitorEditContext && monitorEditContext.isEditing && monitorEditContext.projectIndex === index) return;
        const intervalSec = Number(schedule.intervalSec);
        if (!Number.isFinite(intervalSec) || intervalSec <= 0) return;
        const intervalMs = Math.max(intervalSec, 30) * 1000;
        const state = monitor.state || {};
        const lastRunAt = state.lastRunAt ? Date.parse(state.lastRunAt) : null;
        const due = !lastRunAt || Number.isNaN(lastRunAt) || (now - lastRunAt) >= intervalMs;
        if (!due) return;
        runProjectChecks(index, { mode: 'schedule', source: 'schedule' }).catch((error) => {
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

// ============== Auto-refresh UI from localStorage ==============
let uiRefreshTimerId = null;
const UI_REFRESH_INTERVAL_MS = 5000; // רענן כל 5 שניות

function refreshUIFromStorage() {
    try {
        const storedData = localStorage.getItem('projectsData');
        if (!storedData) return;
        
        const parsedData = JSON.parse(storedData);
        if (!Array.isArray(parsedData)) return;
        
        console.log('🔄 Refreshing UI from localStorage...');
        
        // עדכון כל הכרטיסים
        parsedData.forEach((project, index) => {
            if (index < projectsData.length) {
                // עדכן רק את ה-state של המוניטור, לא את כל הפרוייקט
                if (project.monitor && project.monitor.state) {
                    if (!projectsData[index].monitor) {
                        projectsData[index].monitor = createDefaultMonitor();
                    }
                    projectsData[index].monitor.state = project.monitor.state;
                    
                    // עדכן את הכרטיס ב-UI
                    updateMonitorIndicatorsForProject(index);
                }
            }
        });
        
        console.log('✅ UI refresh completed!');
    } catch (error) {
        console.warn('⚠️ Failed to refresh UI from storage:', error);
    }
}

function startUIRefresh() {
    if (uiRefreshTimerId !== null) {
        return;
    }
    console.log('🚀 Starting UI auto-refresh (every 5 seconds)...');
    uiRefreshTimerId = window.setInterval(refreshUIFromStorage, UI_REFRESH_INTERVAL_MS);
}

function stopUIRefresh() {
    if (uiRefreshTimerId !== null) {
        window.clearInterval(uiRefreshTimerId);
        uiRefreshTimerId = null;
        console.log('🛑 Stopped UI auto-refresh');
    }
}
// ============== End Auto-refresh UI ==============


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
    } else if (statusInfo.status === 'FAIL' && statusInfo.failedTests.length > 0) {
        const summary = document.createElement('div');
        summary.className = 'monitor-tests-tooltip__summary';
        summary.textContent = `${statusInfo.passedTests}/${statusInfo.totalTests} passed, ${statusInfo.failedTests.length} failed`;
        body.appendChild(summary);
        
        const failuresList = document.createElement('div');
        failuresList.className = 'monitor-tests-tooltip__failures';
        
        // Show up to 5 failures on desktop, 3 on mobile
        const isMobile = window.innerWidth <= 768;
        const maxShow = isMobile ? 3 : 5;
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

    // PASS: כל הבדיקות עברו
    if (passed === tests.length) {
        result.status = 'PASS';
        result.label = 'PASSED';
        result.tooltip = `All ${tests.length} test${tests.length > 1 ? 's' : ''} passed`;
        return result;
    }

    // FAIL: יש כשלים (partial נחשב גם כ-FAIL)
    if (failed > 0) {
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
    
    const testsLabel = document.createElement('span');
    testsLabel.className = 'monitor-tests-label';
    testsLabel.textContent = 'Tests:';
    
    const testsValue = document.createElement('span');
    testsValue.className = `monitor-tests-value status-${testsStatus.status.toLowerCase().replace('_', '-')}`;
    testsValue.textContent = testsStatus.label;
    // testsValue.title = testsStatus.tooltip;
    testsValue.removeAttribute('title');
    testsValue.setAttribute('aria-label', testsStatus.tooltip);
    
    testsRow.appendChild(testsLabel);
    testsRow.appendChild(testsValue);
    
    cardBody.appendChild(testsRow);
    
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
    const limit = isTouch ? 5 : 7;
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
    return date.toLocaleString('en-US', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
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
    return `test-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
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

function collectMonitorFromForm(modal, project) {
    clearMonitorValidation();
    const errors = [];
    let firstInvalid = null;

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

    const loginMethod = (loginMethodSelect?.value || 'GET').toUpperCase();
    if (!MONITOR_ALLOWED_METHODS.includes(loginMethod)) {
        showFieldError(loginMethodSelect, 'Method must be GET/POST/PUT/PATCH/DELETE');
        if (!firstInvalid) firstInvalid = loginMethodSelect;
        errors.push('login.method');
    } else if (loginMethodSelect) {
        loginMethodSelect.value = loginMethod;
    }

    const tokenLocationValue = tokenLocationSelect?.value ? tokenLocationSelect.value.trim() : '';
    const tokenPattern = /^(json:[A-Za-z0-9_\.]+|header:[A-Za-z0-9\-]+)$/;
    if (tokenLocationValue && !tokenPattern.test(tokenLocationValue)) {
        showFieldError(tokenLocationSelect, 'Use json:path.to.token or header:Authorization.');
        if (!firstInvalid) firstInvalid = tokenLocationSelect;
        errors.push('login.tokenLocation');
    }

    const scheduleEnabledCheckbox = modal.querySelector('#monitor-schedule-enabled');
    const scheduleIntervalInput = modal.querySelector('#monitor-schedule-interval');
    let intervalValue = Number(scheduleIntervalInput?.value || 0);
    // Validate interval only when schedule is enabled; otherwise skip validation
    if (Boolean(scheduleEnabledCheckbox?.checked)) {
        if (Number.isNaN(intervalValue) || intervalValue < 30 || intervalValue > 3600) {
            showFieldError(scheduleIntervalInput, 'Interval must be 30-3600 seconds');
            if (!firstInvalid) firstInvalid = scheduleIntervalInput;
            errors.push('schedule.intervalSec');
        }
    }

    const tests = [];
    monitorEditContext.tests.forEach((test, index) => {
        const method = (test.method || 'GET').toUpperCase();
        const methodField = document.querySelector(`select[data-test-index="${index}"][data-field="method"]`);
        if (!MONITOR_ALLOWED_METHODS.includes(method)) {
            showFieldError(methodField, 'Method must be GET/POST/PUT/PATCH/DELETE');
            if (!firstInvalid) firstInvalid = methodField;
            errors.push(`tests[${index}].method`);
        }

        const expectedField = document.querySelector(`input[data-test-index="${index}"][data-field="expectedStatusRaw"]`);
        const expectedStatus = (test.expectedStatusRaw || '').split(',').map((value) => value.trim()).filter(Boolean);
        const expectedNumbers = [];
        let expectedValid = true;
        expectedStatus.forEach((value) => {
            if (!/^\d+$/.test(value)) {
                expectedValid = false;
            } else {
                expectedNumbers.push(Number(value));
            }
        });
        if (!expectedValid) {
            showFieldError(expectedField, 'Expected status must be numbers (CSV)');
            if (!firstInvalid) firstInvalid = expectedField;
            errors.push(`tests[${index}].expectedStatus`);
        }

        const headersField = document.querySelector(`textarea[data-test-index="${index}"][data-field="headersRaw"]`);
        const headersLines = (test.headersRaw || '').split('\n').map((line) => line.trim()).filter(Boolean);
        const headersObject = {};
        let headersValid = true;
        headersLines.forEach((line) => {
            const separatorIndex = line.indexOf(':');
            if (separatorIndex === -1) {
                headersValid = false;
                return;
            }
            const key = line.slice(0, separatorIndex).trim();
            const value = line.slice(separatorIndex + 1).trim();
            if (!key) {
                headersValid = false;
                return;
            }
            headersObject[key] = value;
        });
        if (!headersValid) {
            showFieldError(headersField, 'Header line must be key:value');
            if (!firstInvalid) firstInvalid = headersField;
            errors.push(`tests[${index}].headers`);
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

    if (errors.length) {
        monitorEditContext.hasValidationErrors = true;
        updateMonitorActionButtons();
        if (firstInvalid && typeof firstInvalid.focus === 'function') {
            firstInvalid.focus();
        }
        return null;
    }

    monitorEditContext.hasValidationErrors = false;
    updateMonitorActionButtons();
    return {
        baseUrl,
        login: {
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
        },
        tests,
        schedule: {
            enabled: Boolean(scheduleEnabledCheckbox?.checked),
            intervalSec: intervalValue
        }
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
                    expectedStatus: [200],
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
                    expectedStatus: [201],
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
                    expectedStatus: [200],
                    bodyTemplate: "",
                    headers: {},
                    required: false,
                    requiresLogin: false
                }
            ],
            schedule: { enabled: false, intervalSec: 300 }
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
    localStorage.setItem('darkMode', isDarkMode);
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
                projectsData = data; // Update the in-memory array
                ensureMonitorDefaults(projectsData);
                // Persist to localStorage
                localStorage.setItem('projectsData', JSON.stringify(projectsData));
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

        const truncatedName = truncateText(project.name, 20);

        let fieldsHTML = "";
        for (let i = 1; i <= 4; i++) {
            const fieldName = truncateText(project.fieldNames?.[i] || `Field ${i}`, 15);
            const fieldValue = truncateText(project.fields?.[i] || "No value", 20);
            fieldsHTML += `<p class="card-text"><strong>${fieldName}:</strong> ${fieldValue}</p>`;
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

function openEditModal(index) {
    if (index < 0 || index >= projectsData.length) {
        alert('Invalid project index.');
        return;
    }

    currentProjectIndex = index;
    const project = projectsData[index];
    const monitorTabsContainer = document.getElementById('monitor-tabs');
    if (monitorTabsContainer) {
        clearMonitorTabs();
        setupMonitorTabs(monitorTabsContainer);
        resetMonitorTabs(monitorTabsContainer);
        populateMonitorTabs(project);
        monitorTabsContainer.hidden = false;
    }

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

    const editName = document.getElementById("edit-name");
    if (editName) {
        editName.value = project.name || "";
        editName.setAttribute('maxlength', '20');
    }

    const fieldsContainer = document.getElementById("edit-fields-container");
    if (!fieldsContainer) {
        console.error("שגיאה: לא נמצא האלמנט edit-fields-container!");
        return;
    }

    // Dynamic informative fields (up to 4). Start with existing count or at least 1
    const computeInitialCount = () => {
        let count = 0;
        for (let i = 1; i <= 4; i++) {
            const hasName = project.fieldNames && project.fieldNames[i];
            const hasVal = project.fields && project.fields[i];
            if (hasName || hasVal) count = i;
        }
        return Math.max(1, count);
    };
    const renderFieldBlock = (i, nameVal, valueVal) => `
            <label for="edit-field-name-${i}">שם שדה ${i}:</label>
            <input type="text" id="edit-field-name-${i}" value="${escapeHTML(nameVal ?? `Field ${i}`)}" maxlength="15">

            <label for="edit-field-value-${i}">ערך שדה ${i}:</label>
            <input type="text" id="edit-field-value-${i}" value="${escapeHTML(valueVal ?? 'No value')}" maxlength="20">
        `;

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
        
    const editURL = document.getElementById("edit-url");
    if (editURL) {
        editURL.value = project.url || "";
    }
    fieldsContainer.innerHTML = fieldsHTML;
    // Wire the plus/minus buttons to add/remove fields (1..4)
    const editPlus = document.getElementById('edit-add-field-button');
    const editMinus = document.getElementById('edit-remove-field-button');
    const getEditCount = () => fieldsContainer.querySelectorAll('input[id^="edit-field-name-"]').length;
    const updateEditButtons = () => {
        const count = getEditCount();
        if (editPlus) editPlus.style.display = count >= 4 ? 'none' : '';
        if (editMinus) editMinus.disabled = count <= 1;
    };
    if (editPlus) {
        editPlus.addEventListener('click', (e) => {
            try { e?.preventDefault?.(); e?.stopPropagation?.(); } catch(_) {}
            const current = getEditCount();
            if (current >= 4) return;
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
            if (current <= 1) return;
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

    // Show the modal
    const editModal = document.getElementById('edit-modal');
    if (editModal) {
        editModal.style.display = 'flex';
    }
}

// NEW FUNCTION: saveEdit() - Save all project data including Monitor configuration
function saveEdit() {
    if (currentProjectIndex === null || currentProjectIndex < 0 || currentProjectIndex >= projectsData.length) {
        alert('Invalid project index.');
        return;
    }

    const project = projectsData[currentProjectIndex];
    const oldName = project.name;

    // Get basic project fields
    const editName = document.getElementById("edit-name");
    if (!editName || !editName.value.trim()) {
        alert('Project name is required.');
        return;
    }

    project.name = editName.value.trim();

    const editURL = document.getElementById("edit-url");
    if (editURL) {
        project.url = editURL.value.trim();
    }

    // Update custom fields
    for (let i = 1; i <= 4; i++) {
        const fieldNameInput = document.getElementById(`edit-field-name-${i}`);
        const fieldValueInput = document.getElementById(`edit-field-value-${i}`);

        if (fieldNameInput && fieldValueInput) {
            project.fieldNames[i] = fieldNameInput.value.trim() || `Field ${i}`;
            project.fields[i] = fieldValueInput.value.trim() || "";
        }
    }

    // Collect Monitor data from form
    const editModal = document.getElementById('edit-modal');
    if (!project.monitor) {
        project.monitor = createDefaultMonitor();
    }

    if (editModal) {
        const collectedMonitor = collectMonitorFromForm(editModal, project);
        if (!collectedMonitor) {
            // Validation failed - collectMonitorFromForm already showed errors
            return;
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
    }

    // Validate and fix schedule interval
    const schedule = project.monitor.schedule || {};
    if (schedule.intervalSec !== undefined) {
        const interval = Number(schedule.intervalSec);
        if (!Number.isNaN(interval)) {
            schedule.intervalSec = Math.min(Math.max(interval, 30), 3600);
        }
    }
    project.monitor.schedule = schedule;

    // Final merge to ensure consistency
    mergeDefaults(project.monitor, DEFAULT_MONITOR_TEMPLATE);

    // Restart scheduler if needed
    runScheduledMonitorCycle();

    // Persist to localStorage
    localStorage.setItem('projectsData', JSON.stringify(projectsData));

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

    for (let i = 1; i <= 4; i++) {
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
            <input type="text" id="add-field-name-${i}" maxlength="15" placeholder="Field ${i}">
            <label for="add-field-value-${i}">ערך שדה ${i}:</label>
            <input type="text" id="add-field-value-${i}" maxlength="20" placeholder="No value">
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
            if (addPlus) addPlus.style.display = count >= 4 ? 'none' : '';
            if (addMinus) addMinus.disabled = count <= 1;
        };
        if (addPlus) {
            addPlus.addEventListener('click', (e) => {
                try { e?.preventDefault?.(); e?.stopPropagation?.(); } catch(_) {}
                const current = getAddCount();
                if (current >= 4) return;
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
                if (current <= 1) return;
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
    const dataStr = JSON.stringify(projectsData, null, 4);
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
    

    for (let i = 1; i <= 4; i++) {
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
    localStorage.setItem('projectsData', JSON.stringify(projectsData));
    

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
        localStorage.setItem('projectsData', JSON.stringify(projectsData));
        

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
    localStorage.setItem('projectHistory', JSON.stringify(projectHistory));
}

function addTextLengthLimit() {

    const addNameInput = document.getElementById('add-name');
    if (addNameInput) {
        addNameInput.setAttribute('maxlength', '20');
    }
    

    const editNameInput = document.getElementById('edit-name');
    if (editNameInput) {
        editNameInput.setAttribute('maxlength', '20');
    }
    

    for (let i = 1; i <= 4; i++) {

        const addFieldNameInput = document.getElementById(`add-field-name-${i}`);
        const addFieldValueInput = document.getElementById(`add-field-value-${i}`);
        
        if (addFieldNameInput) {
            addFieldNameInput.setAttribute('maxlength', '15');
        }
        
        if (addFieldValueInput) {
            addFieldValueInput.setAttribute('maxlength', '20');
        }
        

        const editFieldNameInput = document.getElementById(`edit-field-name-${i}`);
        const editFieldValueInput = document.getElementById(`edit-field-value-${i}`);
        
        if (editFieldNameInput) {
            editFieldNameInput.setAttribute('maxlength', '15');
        }
        
        if (editFieldValueInput) {
            editFieldValueInput.setAttribute('maxlength', '20');
        }
    }
}

window.addEventListener('load', () => {
    localStorage.removeItem('enableMonitorUI');
    initializeMonitorUI();
    startMonitorScheduler();


    const savedDarkMode = localStorage.getItem('darkMode');
    if (savedDarkMode === 'true') {
        document.body.classList.add('dark');
    }
    

    const savedHistory = localStorage.getItem('projectHistory');
    if (savedHistory) {
        try {
            projectHistory = JSON.parse(savedHistory);
        } catch (e) {
            console.error("שגיאה בטעינת היסטוריה:", e);
            projectHistory = [];
        }
    }
    

    const storedProjects = localStorage.getItem('projectsData');

    if (storedProjects) {
        try {
            projectsData = JSON.parse(storedProjects);
            const migrated = ensureMonitorDefaults(projectsData);
            if (migrated) {
                localStorage.setItem('projectsData', JSON.stringify(projectsData));
            }
            renderProjects(projectsData);
            renderHotItems();
        } catch (e) {
            console.error("שגיאה בטעינת נתוני פרויקטים:", e);
            projectsData = [];
            renderProjects(projectsData);
        }
    } else {

        fetch("projects.json")
            .then(response => response.json())
            .then(data => {
                projectsData = data;
                ensureMonitorDefaults(projectsData);
                localStorage.setItem('projectsData', JSON.stringify(projectsData));
                renderProjects(projectsData);
                renderHotItems();
                

                addToHistory("טעינה ראשונית", "טעינת נתונים מקובץ ברירת מחדל");
            })
            .catch(error => {
                console.error("שגיאה בטעינת JSON:", error);
                projectsData = [];
                renderProjects(projectsData);
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

refreshUIFromStorage();
refreshUIFromStorage();
refreshUIFromStorage();
refreshUIFromStorage();
refreshUIFromStorage();
refreshUIFromStorage();
refreshUIFromStorage();
refreshUIFromStorage();
refreshUIFromStorage();
refreshUIFromStorage();
refreshUIFromStorage();
refreshUIFromStorage();
refreshUIFromStorage();
refreshUIFromStorage();
refreshUIFromStorage();
refreshUIFromStorage();
refreshUIFromStorage();
refreshUIFromStorage();refreshUIFromStorage();
refreshUIFromStorage();
refreshUIFromStorage();
refreshUIFromStorage();
refreshUIFromStorage();
refreshUIFromStorage();
refreshUIFromStorage();
refreshUIFromStorage();
refreshUIFromStorage();refreshUIFromStorage();
refreshUIFromStorage();
refreshUIFromStorage();
refreshUIFromStorage();
refreshUIFromStorage();
refreshUIFromStorage();
refreshUIFromStorage();
refreshUIFromStorage();
refreshUIFromStorage();refreshUIFromStorage();
refreshUIFromStorage();
refreshUIFromStorage();
refreshUIFromStorage();
refreshUIFromStorage();
refreshUIFromStorage();
refreshUIFromStorage();
refreshUIFromStorage();
refreshUIFromStorage();refreshUIFromStorage();
refreshUIFromStorage();
refreshUIFromStorage();
refreshUIFromStorage();
refreshUIFromStorage();
refreshUIFromStorage();
refreshUIFromStorage();
refreshUIFromStorage();
refreshUIFromStorage();refreshUIFromStorage();
refreshUIFromStorage();
refreshUIFromStorage();
refreshUIFromStorage();
refreshUIFromStorage();
refreshUIFromStorage();
refreshUIFromStorage();
refreshUIFromStorage();
refreshUIFromStorage();refreshUIFromStorage();
refreshUIFromStorage();
refreshUIFromStorage();
refreshUIFromStorage();
refreshUIFromStorage();
refreshUIFromStorage();
refreshUIFromStorage();
refreshUIFromStorage();
refreshUIFromStorage();
setTimeout(checkLocalConnectivity, 2000);
setInterval(checkLocalConnectivity, 60000);

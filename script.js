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
        intervalSec: 300
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

const ENABLE_MONITOR_UI_KEY = 'enableMonitorUI';

function isMonitorUIEnabled() {
    try {
        const stored = localStorage.getItem(ENABLE_MONITOR_UI_KEY);
        if (stored === null) {
            return false;
        }
        return stored === 'true';
    } catch (error) {
        console.warn('Failed to read enableMonitorUI flag:', error);
        return false;
    }
}

function setMonitorUIEnabled(value) {
    try {
        localStorage.setItem(ENABLE_MONITOR_UI_KEY, value ? 'true' : 'false');
    } catch (error) {
        console.warn('Failed to persist enableMonitorUI flag:', error);
    }
}

if (typeof window !== 'undefined') {
    window.setMonitorUIEnabled = setMonitorUIEnabled;
    window.isMonitorUIEnabled = isMonitorUIEnabled;
}

const MONITOR_REQUEST_TIMEOUT_MS = 15000;
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
        button.hidden = !isMonitorUIEnabled();
        applyMonitorRunButtonState(button, isRunning);
        if (button.dataset.monitorRunSource === 'modal' && monitorEditContext && monitorEditContext.isEditing) {
            button.disabled = true;
            button.classList.remove('is-running');
            button.removeAttribute('aria-busy');
            const label = button.querySelector('.monitor-run-label');
            if (label) {
                label.textContent = 'Run Now';
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
            handleMonitorRunClick(idx, { mode: 'manual', source: src });
        });
        button.dataset.monitorRunBound = 'true';
    }
    button.hidden = !isMonitorUIEnabled();
    applyMonitorRunButtonState(button, monitorRunningProjects.has(index));
    if (source === 'modal' && monitorEditContext && monitorEditContext.isEditing) {
        button.disabled = true;
        button.classList.remove('is-running');
        const label = button.querySelector('.monitor-run-label');
        if (label) {
            label.textContent = 'Run Now';
        }
    }
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
    if (!isMonitorUIEnabled()) {
        alert('Run Now is available behind the feature flag.');
        return;
    }
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
    if (!isMonitorUIEnabled()) {
        return;
    }
    const project = projectsData[index];
    if (!project) {
        showMonitorToast('unknown', 'Run skipped', 'Project not found.');
        return;
    }
    if (!project.monitor) {
        showMonitorToast('unknown', 'Run skipped', 'Monitor is not configured for this project.');
        return;
    }
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
        persistRunResult(project, index, results, context);
        showMonitorToast('unknown', 'Run incomplete', 'Base URL is missing for this project.');
        return;
    }
    persistRunResult(project, index, results, context);
    const overall = computeOverall(results);
    const summary = summarizeMonitorResults(results);
    const overallLabel = MONITOR_RUN_STATUS_LABELS[overall] || overall;
    const body = `${summary.pass}/${summary.total} passed, ${summary.fail} failed, ${summary.unknown} unknown`;
    showMonitorToast(overall, `Run completed: ${overallLabel}`, body);
}







const MONITOR_CREATION_METHODS = new Set(['POST']);

const MONITOR_STATUS_CLASSES = ['monitor-pass', 'monitor-partial', 'monitor-fail', 'monitor-unknown'];
const MONITOR_STATUS_LABELS = {
    pass: 'Pass',
    partial: 'Partial',
    fail: 'Fail',
    unknown: 'Not checked'
};

function decorateCardWithMonitorStatus(card, project, index) {
    const cardBody = card.querySelector('.card-body');
    if (!cardBody) return;

    card.classList.add('monitor-ui-enabled');

    let urlIndicator = card.querySelector(`.status-indicator[data-index="${index}"]`);
    if (urlIndicator) {
        urlIndicator.removeAttribute('style');
        urlIndicator.classList.add('status-indicator-url');
        urlIndicator.title = 'URL status: Not checked';
    } else {
        urlIndicator = document.createElement('div');
        urlIndicator.className = 'status-indicator status-indicator-url';
        urlIndicator.dataset.index = String(index);
        urlIndicator.title = 'URL status: Not checked';
    }

    const statusGroup = document.createElement('div');
    statusGroup.className = 'status-indicator-group';
    statusGroup.appendChild(urlIndicator);

    const monitorIndicator = document.createElement('div');
    monitorIndicator.className = 'status-indicator monitor-indicator monitor-unknown';
    monitorIndicator.dataset.monitorIndex = String(index);
    statusGroup.appendChild(monitorIndicator);

    const statusBar = document.createElement('div');
    statusBar.className = 'card-status-bar';
    statusBar.appendChild(statusGroup);

    const lastRunInfo = document.createElement('span');
    lastRunInfo.className = 'monitor-last-run';
    lastRunInfo.textContent = 'Last check: -';
    statusBar.appendChild(lastRunInfo);

    cardBody.appendChild(statusBar);

    updateMonitorIndicator(project, monitorIndicator, lastRunInfo);
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
        panel.setAttribute('tabindex', isActivePanel ? '0' : '-1');
        if (isActivePanel) {
            panel.setAttribute('aria-labelledby', tab.id);
        }
    });
    container.dataset.activeTab = tab.id;
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

function enforceMonitorReadonlyState() {
    const textIds = ['monitor-base-url', 'monitor-login-path', 'monitor-login-username', 'monitor-login-password', 'monitor-token-header', 'monitor-token-prefix', 'monitor-schedule-interval'];
    textIds.forEach((id) => {
        const field = getMonitorField(id);
        if (field) {
            field.readOnly = true;
            field.setAttribute('aria-readonly', 'true');
        }
    });
    const textarea = getMonitorField('monitor-login-body');
    if (textarea) {
        textarea.readOnly = true;
        textarea.setAttribute('aria-readonly', 'true');
    }
    const selectIds = ['monitor-login-method', 'monitor-token-location'];
    selectIds.forEach((id) => {
        const select = getMonitorField(id);
        if (select) {
            select.disabled = true;
            select.setAttribute('aria-disabled', 'true');
            select.tabIndex = -1;
        }
    });
    const checkboxIds = ['monitor-login-enabled', 'monitor-persist-password', 'monitor-schedule-enabled'];
    checkboxIds.forEach((id) => {
        const checkbox = getMonitorField(id);
        if (checkbox) {
            checkbox.disabled = true;
            checkbox.setAttribute('aria-disabled', 'true');
        }
    });
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
        badge: document.getElementById('monitor-mode-badge'),
        toggleButton: document.getElementById('monitor-edit-toggle'),
        saveButton: document.getElementById('monitor-save-button'),
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

function setMonitorModeBadge(label, isEditing) {
    const { badge } = getMonitorModalElements();
    if (!badge) return;
    badge.textContent = label;
    badge.classList.toggle('monitor-mode-badge--editing', Boolean(isEditing));
}

function updateMonitorToggleLabel(isEditing) {
    const { toggleButton } = getMonitorModalElements();
    if (!toggleButton) return;
    toggleButton.textContent = isEditing ? 'Back to read-only' : 'Edit monitor (behind flag)';
    toggleButton.setAttribute('aria-pressed', isEditing ? 'true' : 'false');
}

function updateMonitorActionButtons() {
    const { saveButton, cancelButton } = getMonitorModalElements();
    if (!saveButton || !cancelButton) return;
    const flagEnabled = isMonitorUIEnabled();
    const shouldDisableSave = !monitorEditContext.isEditing || !monitorEditContext.dirty || monitorEditContext.hasValidationErrors;
    saveButton.hidden = !flagEnabled;
    cancelButton.hidden = !flagEnabled || !monitorEditContext.isEditing;
    saveButton.disabled = shouldDisableSave;
}

function setLegacySaveDisabled(isDisabled) {
    const { legacySaveButton } = getMonitorModalElements();
    if (!legacySaveButton) return;
    const disabled = Boolean(isDisabled);
    legacySaveButton.disabled = disabled;
    if (isMonitorUIEnabled()) {
        legacySaveButton.hidden = disabled;
    } else {
        legacySaveButton.hidden = false;
    }
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

function enableMonitorFormEditing() {
    const textIds = ['monitor-base-url', 'monitor-login-path', 'monitor-login-username', 'monitor-login-password', 'monitor-token-header', 'monitor-token-prefix', 'monitor-schedule-interval'];
    textIds.forEach((id) => {
        const field = getMonitorField(id);
        if (field) {
            field.readOnly = false;
            field.removeAttribute('aria-readonly');
        }
    });
    const textarea = getMonitorField('monitor-login-body');
    if (textarea) {
        textarea.readOnly = false;
        textarea.removeAttribute('aria-readonly');
    }
    const selectIds = ['monitor-login-method', 'monitor-token-location'];
    selectIds.forEach((id) => {
        const select = getMonitorField(id);
        if (select) {
            select.disabled = false;
            select.removeAttribute('aria-disabled');
            select.tabIndex = 0;
        }
    });
    const checkboxIds = ['monitor-login-enabled', 'monitor-persist-password', 'monitor-schedule-enabled'];
    checkboxIds.forEach((id) => {
        const checkbox = getMonitorField(id);
        if (checkbox) {
            checkbox.disabled = false;
            checkbox.removeAttribute('aria-disabled');
        }
    });
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
    if (!testsEditor || !testsList || !testsEmpty || !testsControls) return;
    testsEditor.innerHTML = '';
    if (monitorEditContext.tests.length === 0) {
        testsEmpty.hidden = false;
    } else {
        testsEmpty.hidden = true;
        monitorEditContext.tests.forEach((test, index) => {
            testsEditor.appendChild(createTestEditorCard(test, index));
        });
    }
    testsEditor.hidden = false;
    testsControls.hidden = false;
    testsList.hidden = true;
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

function handleTestAdd() {
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
    monitorEditContext.tests.splice(index, 1);
    setMonitorDirty(true);
    renderMonitorTestsEditor();
}

function handleTestDuplicate(index) {
    const source = monitorEditContext.tests[index];
    const clone = { ...source, id: generateTestId(), name: source.name ? `${source.name} Copy` : '' };
    monitorEditContext.tests.splice(index + 1, 0, clone);
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
    if (Number.isNaN(intervalValue) || intervalValue < 30 || intervalValue > 3600) {
        showFieldError(scheduleIntervalInput, 'Interval must be 30-3600 seconds');
        if (!firstInvalid) firstInvalid = scheduleIntervalInput;
        errors.push('schedule.intervalSec');
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
    monitorEditContext.isEditing = true;
    monitorEditContext.dirty = false;
    monitorEditContext.hasValidationErrors = false;
    monitorEditContext.originalMonitor = cloneMonitorData(project.monitor || createDefaultMonitor());
    monitorEditContext.tests = prepareMonitorTestsForEdit(project.monitor || {});
    clearMonitorValidation();
    removeMonitorEditListeners();
    enableMonitorFormEditing();
    const modal = document.getElementById('edit-modal');
    if (modal) {
        addMonitorEditListener(modal, 'input', (event) => {
            clearFieldError(event.target);
            setMonitorDirty(true);
        });
        addMonitorEditListener(modal, 'change', (event) => {
            clearFieldError(event.target);
            setMonitorDirty(true);
        });
    }
    renderMonitorTestsEditor();
    setMonitorModeBadge('Edit mode', true);
    updateMonitorToggleLabel(true);
    const { testsList, testsEditor, testsControls } = getMonitorModalElements();
    if (testsList) testsList.hidden = true;
    if (testsEditor) testsEditor.hidden = false;
    if (testsControls) testsControls.hidden = false;
    setLegacySaveDisabled(true);
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
    enableMonitorFormEditing();
    enforceMonitorReadonlyState();
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
    setMonitorModeBadge('Read-only mode', false);
    updateMonitorToggleLabel(false);
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

function handleMonitorToggle() {
    if (monitorEditContext.projectIndex === null) return;
    const project = projectsData[monitorEditContext.projectIndex];
    if (!project) return;
    if (!monitorEditContext.isEditing) {
        enterMonitorEditMode(project);
    } else if (monitorEditContext.dirty && !confirm('Discard monitor changes?')) {
        return;
    } else {
        exitMonitorEditMode({ restoreOriginal: true });
        populateMonitorTabs(project);
        updateMonitorToggleLabel(false);
        updateMonitorActionButtons();
    }
}

function handleMonitorCancel() {
    if (monitorEditContext.dirty && !confirm('Discard monitor changes?')) {
        return;
    }
    if (monitorEditContext.projectIndex !== null) {
        const project = projectsData[monitorEditContext.projectIndex];
        if (project) {
            exitMonitorEditMode({ restoreOriginal: true });
            populateMonitorTabs(project);
        }
    } else {
        exitMonitorEditMode({ restoreOriginal: true });
    }
    updateMonitorToggleLabel(false);
    updateMonitorActionButtons();
}

function handleMonitorDelete() {
    const index = monitorEditContext.projectIndex;
    if (index === null || index < 0 || index >= projectsData.length) {
        return;
    }
    confirmDelete(index);
}


function handleMonitorSave() {
    if (monitorEditContext.projectIndex === null) {
        return;
    }
    const project = projectsData[monitorEditContext.projectIndex];
    if (!project) {
        return;
    }
    const modal = document.getElementById('edit-modal');
    if (!modal) return;
    const collected = collectMonitorFromForm(modal, project);
    if (!collected) {
        return;
    }
    const existingMonitor = project.monitor ? cloneMonitorData(project.monitor) : createDefaultMonitor();
    const updatedMonitor = {
        ...existingMonitor,
        baseUrl: collected.baseUrl,
        login: { ...existingMonitor.login, ...collected.login },
        tests: collected.tests,
        schedule: { ...existingMonitor.schedule, ...collected.schedule }
    };
    updatedMonitor.state = existingMonitor.state || {};
    mergeDefaults(updatedMonitor, DEFAULT_MONITOR_TEMPLATE);
    const baseline = monitorEditContext.originalMonitor || existingMonitor;
    const diffCount = countMonitorDifferences(baseline, updatedMonitor);
    project.monitor = updatedMonitor;
    monitorEditContext.hasValidationErrors = false;
    const historyLabel = diffCount === 1 ? 'monitor updated (1 change)' : `monitor updated (${diffCount} changes)`;
    addToHistory('Monitor edited', historyLabel);
    localStorage.setItem('projectsData', JSON.stringify(projectsData));
    renderProjects(projectsData);
    renderHotItems();
    exitMonitorEditMode({ restoreOriginal: false });
    populateMonitorTabs(project);
    setMonitorDirty(false);
    updateMonitorActionButtons();
    setMonitorModeBadge('Saved', false);
    updateMonitorToggleLabel(false);
    window.setTimeout(() => {
        if (!monitorEditContext.isEditing) {
            setMonitorModeBadge('Read-only mode', false);
            updateMonitorToggleLabel(false);
        }
    }, 2000);
}


function initializeMonitorUI() {
    const { toggleButton, saveButton, cancelButton, deleteButton, addTestButton } = getMonitorModalElements();
    if (toggleButton) {
        toggleButton.addEventListener('click', handleMonitorToggle);
    }
    if (saveButton) {
        saveButton.addEventListener('click', handleMonitorSave);
    }
    if (cancelButton) {
        cancelButton.addEventListener('click', handleMonitorCancel);
    }
    if (deleteButton) {
        deleteButton.addEventListener('click', handleMonitorDelete);
        deleteButton.hidden = true;
        deleteButton.disabled = false;
    }
    if (addTestButton) {
        addTestButton.addEventListener('click', handleTestAdd);
    }
    updateMonitorToggleLabel(false);
    updateMonitorActionButtons();
}


function populateMonitorTabs(project) {
    enforceMonitorReadonlyState();
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
    renderMonitorTests(Array.isArray(monitor.tests) ? monitor.tests : []);
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
    const monitorUIEnabled = isMonitorUIEnabled();

    
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
            <div class="card-buttons">
                <button class="edit-button" onclick="openEditModal(${index})">Edit</button>
            </div>
            <div class="status-indicator" data-index="${index}" title="Not checked"></div>
        </div>
        `;


        // Ensure safe title attribute without breaking HTML
        const titleEl = card.querySelector('.card-title');
        if (titleEl) {
            const nameVal = (project.name && typeof project.name === 'string') ? project.name : '';
            const titleText = nameVal.length <= 20 ? nameVal : (nameVal.substring(0, 20) + '...');
            titleEl.setAttribute('title', titleText);
        }

        container.appendChild(card);
        if (monitorUIEnabled) {

            decorateCardWithMonitorStatus(card, project, index);

        }

    });
}

function openEditModal(index) {
    if (index < 0 || index >= projectsData.length) {
        alert('Invalid project index.');
        return;
    }

    currentProjectIndex = index;
    const project = projectsData[index];
    const monitorUIEnabled = isMonitorUIEnabled();

    const monitorTabsContainer = document.getElementById('monitor-tabs');
    if (monitorTabsContainer) {
        clearMonitorTabs();
        if (monitorUIEnabled) {
            monitorTabsContainer.hidden = false;
            setupMonitorTabs(monitorTabsContainer);
            resetMonitorTabs(monitorTabsContainer);
            populateMonitorTabs(project);
        } else {
            teardownMonitorTabs(monitorTabsContainer);
            monitorTabsContainer.hidden = true;
        }
    }

    const {
        header: monitorHeader,
        toggleButton: monitorToggleButton,
        saveButton: monitorSaveButton,
        cancelButton: monitorCancelButton,
        deleteButton: monitorDeleteButton,
        legacySaveButton
    } = getMonitorModalElements();
    if (monitorHeader && monitorToggleButton && monitorSaveButton && monitorCancelButton) {
        if (monitorUIEnabled) {
            monitorHeader.hidden = false;
            monitorToggleButton.disabled = false;
            exitMonitorEditMode({ restoreOriginal: false });
            monitorEditContext.projectIndex = index;
            const modalRunButton = document.getElementById('monitor-run-button');
            if (modalRunButton) {
                if (monitorUIEnabled) {
                    registerMonitorRunButton(index, modalRunButton, 'modal');
                } else {
                    modalRunButton.hidden = true;
                    modalRunButton.disabled = true;
                    modalRunButton.classList.remove('is-running');
                    modalRunButton.removeAttribute('aria-busy');
                    const label = modalRunButton.querySelector('.monitor-run-label');
                    if (label) {
                        label.textContent = 'Run Now';
                    }
                }
            }
            setMonitorModeBadge('Read-only mode', false);
            updateMonitorToggleLabel(false);
            updateMonitorActionButtons();
            setMonitorDirty(false);
            monitorSaveButton.hidden = false;
            monitorSaveButton.disabled = true;
            monitorCancelButton.hidden = true;
        } else {
            monitorHeader.hidden = true;
            monitorToggleButton.disabled = true;
            monitorEditContext.projectIndex = null;
            exitMonitorEditMode({ restoreOriginal: false });
            updateMonitorToggleLabel(false);
            monitorSaveButton.hidden = true;
            monitorCancelButton.hidden = true;
        }
    }
    if (monitorDeleteButton) {
        monitorDeleteButton.hidden = !monitorUIEnabled;
        monitorDeleteButton.disabled = !monitorUIEnabled;
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

    let fieldsHTML = "";
    for (let i = 1; i <= 4; i++) {
        const fieldName = project.fieldNames?.[i] || `שדה ${i}`;
        const fieldValue = project.fields?.[i] || "";

        fieldsHTML += `
            <label for="edit-field-name-${i}">שם שדה ${i}:</label>
            <input type="text" id="edit-field-name-${i}" value="${escapeHTML(fieldName)}" maxlength="15">

            <label for="edit-field-value-${i}">ערך שדה ${i}:</label>
            <input type="text" id="edit-field-value-${i}" value="${escapeHTML(fieldValue)}" maxlength="20">
        `;
    }
        
    const editURL = document.getElementById("edit-url");
    if (editURL) {
        editURL.value = project.url || "";
    }
    fieldsContainer.innerHTML = fieldsHTML;
    
    const editModal = document.getElementById("edit-modal");
    if (editModal) {
        editModal.style.display = "block";
    }
    
}

function forceCloseEditModal() {
    monitorEditContext.dirty = false;
    exitMonitorEditMode({ restoreOriginal: false, silent: true });
    monitorEditContext.projectIndex = null;
    currentProjectIndex = null;
    const modal = document.getElementById('edit-modal');
    if (modal) {
        modal.style.display = 'none';
    }
    const monitorTabsContainer = document.getElementById('monitor-tabs');
    if (monitorTabsContainer) {
        clearMonitorTabs();
        teardownMonitorTabs(monitorTabsContainer);
        monitorTabsContainer.hidden = true;
    }
    const { deleteButton: monitorDeleteButton } = getMonitorModalElements();
    if (monitorDeleteButton) {
        monitorDeleteButton.hidden = true;
        monitorDeleteButton.disabled = false;
    }
}

function closeEditModal() {
    if (monitorEditContext.isEditing && monitorEditContext.dirty) {
        const discard = confirm('Discard monitor changes?');
        if (!discard) {
            return;
        }
    }
    const wasEditing = monitorEditContext.isEditing;
    if (monitorEditContext.projectIndex !== null && monitorRunningProjects.has(monitorEditContext.projectIndex)) {
        const runContext = monitorRunContexts.get(monitorEditContext.projectIndex);
        if (runContext && runContext.source === 'modal') {
            cancelMonitorRun(monitorEditContext.projectIndex, 'modal-close');
        }
    }
    if (monitorEditContext.projectIndex !== null) {
        exitMonitorEditMode({ restoreOriginal: wasEditing });
        monitorEditContext.projectIndex = null;
    } else {
        exitMonitorEditMode({ restoreOriginal: wasEditing });
    }
    const modal = document.getElementById("edit-modal");
    if (modal) {
        modal.style.display = "none";
    }
    currentProjectIndex = null;
    const monitorTabsContainer = document.getElementById('monitor-tabs');
    if (monitorTabsContainer) {
        clearMonitorTabs();
        teardownMonitorTabs(monitorTabsContainer);
        monitorTabsContainer.hidden = true;
    }
    const { deleteButton: monitorDeleteButton } = getMonitorModalElements();
    if (monitorDeleteButton) {
        monitorDeleteButton.hidden = true;
        monitorDeleteButton.disabled = false;
    }
}

function openAddModal() {

    const nameInput = document.getElementById("add-name");
    if (nameInput) {
        nameInput.value = "";
        nameInput.setAttribute('maxlength', '20');
    }
    
    const fieldsContainer = document.getElementById("add-fields-container");
    if (!fieldsContainer) {
        console.error("שגיאה: לא נמצא האלמנט add-fields-container!");
        return;
    }
    
    let fieldsHTML = "";
    for (let i = 1; i <= 4; i++) {
        fieldsHTML += `
            <label for="add-field-name-${i}">שם שדה ${i}:</label>
            <input type="text" id="add-field-name-${i}" value="שדה ${i}" maxlength="15">

            <label for="add-field-value-${i}">ערך שדה ${i}:</label>
            <input type="text" id="add-field-value-${i}" maxlength="20">
        `;
    }
    
    fieldsContainer.innerHTML = fieldsHTML;
    
    const addModal = document.getElementById("add-modal");
    if (addModal) {
        addModal.style.display = "block";
    }
}

function closeAddModal() {
    const modal = document.getElementById("add-modal");
    if (modal) {
        modal.style.display = "none";
    }
}

function openHistoryModal() {
    const historyContainer = document.getElementById("history-container");
    if (!historyContainer) {
        console.error("שגיאה: לא נמצא האלמנט history-container!");
        return;
    }
    
    if (projectHistory.length === 0) {
        historyContainer.innerHTML = "<p>אין היסטוריית שינויים זמינה.</p>";
    } else {
        let historyHTML = "";
        

        for (let i = projectHistory.length - 1; i >= 0; i--) {
            const item = projectHistory[i];
            let typeClass = '';
            
            if (item.type.includes('עריכה')) typeClass = 'history-edit';
            else if (item.type.includes('הוספה')) typeClass = 'history-add';
            else if (item.type.includes('מחיקה')) typeClass = 'history-delete';
            
            historyHTML += `
                <div class="history-item">
                    <span class="history-date">${escapeHTML(item.date)}</span>
                    <span class="history-type ${typeClass}">${escapeHTML(item.type)}</span>
                    <p>${escapeHTML(item.description)}</p>
                </div>
            `;
        }
        
        historyContainer.innerHTML = historyHTML;
    }
    
    const historyModal = document.getElementById("history-modal");
    if (historyModal) {
        historyModal.style.display = "block";
    }
}

function closeHistoryModal() {
    const modal = document.getElementById("history-modal");
    if (modal) {
        modal.style.display = "none";
    }
}

function downloadUpdatedJSON() {
    if (projectsData.length === 0) {
        alert("אין נתונים להורדה!");
        return;
    }

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(projectsData, null, 4));
    const downloadAnchorNode = document.createElement("a");
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "projects.json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    document.body.removeChild(downloadAnchorNode);
    

    addToHistory("הורדת קובץ", "הורדת נתוני הפרויקטים כקובץ JSON");
}

function saveEdit() {
    if (currentProjectIndex !== null) {
        const project = projectsData[currentProjectIndex];
        const oldName = project.name;
        
        const nameInput = document.getElementById("edit-name");
        if (nameInput) {

            project.name = nameInput.value.trim();
        }

        const urlInput = document.getElementById("edit-url");
        if (urlInput) {
            project.url = urlInput.value.trim();
        }

        if (!project.fieldNames) project.fieldNames = {};
        if (!project.fields) project.fields = {};

        for (let i = 1; i <= 4; i++) {
            const fieldNameInput = document.getElementById(`edit-field-name-${i}`);
            const fieldValueInput = document.getElementById(`edit-field-value-${i}`);

            if (fieldNameInput && fieldValueInput) {
                project.fieldNames[i] = fieldNameInput.value.trim() || `שדה ${i}`;
                project.fields[i] = fieldValueInput.value.trim() || "לא זמין";
            }
        }

        // Persist projects data in localStorage
        localStorage.setItem('projectsData', JSON.stringify(projectsData));
        

        addToHistory("עריכה", `עריכת פרויקט: ${oldName} -> ${project.name}`);

        renderProjects(projectsData);
        renderHotItems();

        closeEditModal();
    }
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
    initializeMonitorUI();


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

function checkProjectStatuses() {
    const currentOrigin = window.location.origin;
    projectsData.forEach((project, index) => {
        const indicator = document.querySelector(`.status-indicator[data-index="${index}"]`);
        if (!indicator) return;

        if (!project.url || !project.url.startsWith('http')) {
            indicator.style.backgroundColor = '#e0e0e0';
            indicator.title = 'No endpoint URL provided';
            return;
        }

        let targetUrl;
        try {
            targetUrl = new URL(project.url);
        } catch (error) {
            indicator.style.backgroundColor = '#e0e0e0';
            indicator.title = 'Invalid endpoint URL';
            return;
        }

        if (targetUrl.origin !== currentOrigin) {
            indicator.style.backgroundColor = '#f1c40f';
            indicator.title = 'External endpoints are not checked from this preview';
            return;
        }

        fetch(targetUrl.toString(), { method: 'HEAD' })
            .then(() => {
                indicator.style.backgroundColor = '#8DC71E';
                indicator.title = 'Endpoint reachable';
            })
            .catch(() => {
                indicator.style.backgroundColor = '#ff0033';
                indicator.title = 'Endpoint unreachable';
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





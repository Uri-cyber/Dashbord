/**
 * ==============================================================================
 * MONITOR EXECUTION - API CALLS, LOGIN, AND TEST EXECUTION
 * ==============================================================================
 *
 * Core monitor execution logic: API fetching, authentication, test running,
 * result processing, and scheduling.
 *
 * Dependencies:
 * - state-global.js (projectsData, monitorRunContexts, MONITOR_* constants)
 * - monitor-context.js (context management, button states, toasts)
 * - config-constants.js (TIMEOUTS, INTERVALS, HTTP_STATUS, RANDOM)
 * - TokenManager.js (secure token storage)
 * - SafeStorage.js (localStorage operations)
 * - MonitorQueue.js (race condition prevention)
 *
 * @module monitor-execution
 */

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


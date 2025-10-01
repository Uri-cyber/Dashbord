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

const MONITOR_STATUS_CLASSES = ['monitor-pass', 'monitor-partial', 'monitor-fail', 'monitor-unknown'];
const MONITOR_STATUS_LABELS = {
    pass: '\u05e2\u05d1\u05e8 \u05d1\u05d4\u05e6\u05dc\u05d7\u05d4',
    partial: '\u05e2\u05d1\u05e8 \u05d7\u05dc\u05e7\u05d9\u05ea',
    fail: '\u05e0\u05db\u05e9\u05dc',
    unknown: '\u05dc\u05d0 \u05e0\u05d1\u05d3\u05e7'
};

function decorateCardWithMonitorStatus(card, project, index) {
    const cardBody = card.querySelector('.card-body');
    if (!cardBody) return;

    card.classList.add('monitor-ui-enabled');

    let urlIndicator = card.querySelector(`.status-indicator[data-index="${index}"]`);
    if (urlIndicator) {
        urlIndicator.removeAttribute('style');
        urlIndicator.classList.add('status-indicator-url');
        urlIndicator.title = '\u05e1\u05d8\u05d8\u05d5\u05e1 URL: \u05dc\u05d0 \u05e0\u05d1\u05d3\u05e7';
    } else {
        urlIndicator = document.createElement('div');
        urlIndicator.className = 'status-indicator status-indicator-url';
        urlIndicator.dataset.index = String(index);
        urlIndicator.title = '\u05e1\u05d8\u05d8\u05d5\u05e1 URL: \u05dc\u05d0 \u05e0\u05d1\u05d3\u05e7';
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
    lastRunInfo.textContent = '\u05d1\u05d3\u05d9\u05e7\u05d4 \u05d0\u05d7\u05e8\u05d5\u05e0\u05d4: \u2014';
    statusBar.appendChild(lastRunInfo);

    cardBody.appendChild(statusBar);

    updateMonitorIndicator(project, monitorIndicator, lastRunInfo);
}

function updateMonitorIndicator(project, indicatorEl, lastRunEl) {
    if (!indicatorEl) return;

    let status = 'unknown';
    const tooltipLines = ['\u05e1\u05d8\u05d8\u05d5\u05e1 \u05d1\u05d3\u05d9\u05e7\u05d5\u05ea: ' + MONITOR_STATUS_LABELS.unknown];
    let lastRunLabel = '\u05d1\u05d3\u05d9\u05e7\u05d4 \u05d0\u05d7\u05e8\u05d5\u05e0\u05d4: \u2014';

    const monitor = project && project.monitor ? project.monitor : null;
    const state = monitor && monitor.state ? monitor.state : null;

    if (state) {
        if (state.overall && MONITOR_STATUS_CLASSES.includes('monitor-' + state.overall)) {
            status = state.overall;
            tooltipLines[0] = '\u05e1\u05d8\u05d8\u05d5\u05e1 \u05d1\u05d3\u05d9\u05e7\u05d5\u05ea: ' + (MONITOR_STATUS_LABELS[status] || MONITOR_STATUS_LABELS.unknown);
        }

        if (state.lastRunAt) {
            const formatted = formatMonitorLastRun(state.lastRunAt);
            if (formatted) {
                lastRunLabel = '\u05d1\u05d3\u05d9\u05e7\u05d4 \u05d0\u05d7\u05e8\u05d5\u05e0\u05d4: ' + formatted;
            }
        }

        if (Array.isArray(state.failures) && state.failures.length) {
            const failureNames = state.failures.map(entry => {
                if (!entry) return '\u05d1\u05d3\u05d9\u05e7\u05d4';
                if (typeof entry === 'string') return entry;
                if (typeof entry === 'object') {
                    if (entry.name) return entry.name;
                    if (entry.id) return entry.id;
                }
                return '\u05d1\u05d3\u05d9\u05e7\u05d4';
            });
            tooltipLines.push('\u05d1\u05d3\u05d9\u05e7\u05d5\u05ea \u05e9\u05e0\u05db\u05e9\u05dc\u05d5: ' + failureNames.join(', '));
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
    return date.toLocaleString('he-IL', {
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
                addToHistory("העלאת קובץ", "כל הפרויקטים הוחלפו מקובץ");
                // Re-render projects
                renderProjects(projectsData);
                renderHotItems();
            } catch (error) {
                console.error("Invalid JSON file:", error);
                alert("הקובץ שהועלה אינו JSON תקין.");
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
            const fieldName = truncateText(project.fieldNames?.[i] || `שדה ${i}`, 15);
            const fieldValue = truncateText(project.fields?.[i] || "לא זמין", 20);
            fieldsHTML += `<p class="card-text"><strong>${fieldName}:</strong> ${fieldValue}</p>`;
        }


        card.innerHTML = `
        <div class="card-body">
            <h3 class="card-title" title="${truncatedName}">${truncatedName}</h3>
            ${fieldsHTML}
            <div class="card-buttons">
                <button class="delete-button" onclick="confirmDelete(${index})">מחק</button>
                <button class="edit-button" onclick="openEditModal(${index})">עריכה</button>
            </div>
            <div class="status-indicator" data-index="${index}" title="לא נבדק"></div>
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
        alert("מספר פרויקט לא תקין.");
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

function closeEditModal() {
    const modal = document.getElementById("edit-modal");
    if (modal) {
        modal.style.display = "none";
    }
    const monitorTabsContainer = document.getElementById('monitor-tabs');
    if (monitorTabsContainer) {
        clearMonitorTabs();
        teardownMonitorTabs(monitorTabsContainer);
        monitorTabsContainer.hidden = true;
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
        alert("אנא הזן שם לפרויקט");
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
            newProject.fieldNames[i] = fieldNameInput.value.trim() || `שדה ${i}`;
            newProject.fields[i] = fieldValueInput.value.trim() || "לא זמין";
        }
    }
    
    const urlInput = document.getElementById("add-url");
    newProject.url = urlInput?.value.trim() || "";

    projectsData.push(newProject);
    
    // Persist projects data in localStorage
    localStorage.setItem('projectsData', JSON.stringify(projectsData));
    

    addToHistory("הוספה", `הוספת פרויקט חדש: ${projectName}`);
    

    renderProjects(projectsData);
    renderHotItems();
    

    closeAddModal();
}

function confirmDelete(index) {
    if (index < 0 || index >= projectsData.length) {
        alert("מספר פרויקט לא תקין.");
        return;
    }
    
    const projectName = projectsData[index].name;
    
    if (confirm(`האם אתה בטוח שברצונך למחוק את הפרויקט "${projectName}"?`)) {

        const deletedProjectName = projectsData[index].name;
        

        projectsData.splice(index, 1);
        
        // Persist projects data in localStorage
        localStorage.setItem('projectsData', JSON.stringify(projectsData));
        

        addToHistory("מחיקה", `נמחק פרויקט: ${deletedProjectName}`);
        

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

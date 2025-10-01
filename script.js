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
// Theme Toggle - החלפת ערכת נושא
document.getElementById("toggle-theme").addEventListener("click", () => {
    document.body.classList.toggle("dark");
    // שמירת העדפת הערכה ב-localStorage
    const isDarkMode = document.body.classList.contains("dark");
    localStorage.setItem('darkMode', isDarkMode);
});

// Handle File Upload - טיפול בהעלאת קובץ
document.getElementById("fileInput").addEventListener("change", handleFileUpload);

// פונקציה לקיצור טקסט ארוך והוספת שלוש נקודות
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

// רינדור של הפריטים בטיקר
function renderHotItems() {
    const hotTicker = document.getElementById("hot-items-ticker");
    if (!hotTicker || !projectsData.length) return;

    const names = projectsData.map(item => item.name).join(" • ");
    hotTicker.textContent = names;
}

// פונקציה לטיפול בהעלאת קובץ
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

// פונקציה לרינדור הפרויקטים
function renderProjects(projects) {
    const container = document.getElementById("projects-container");
    if (!container) {
        console.error("שגיאה: לא נמצא האלמנט projects-container!");
        return;
    }
    
    container.innerHTML = ""; // ניקוי תוכן קיים
    
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

        // קיצור שם הפרויקט אם הוא ארוך מדי
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

// פתיחת מודל עריכה
// פתיחת מודל עריכה
function openEditModal(index) {
    if (index < 0 || index >= projectsData.length) {
        alert("מספר פרויקט לא תקין.");
        return;
    }

    currentProjectIndex = index;
    const project = projectsData[index];
    const monitorUIEnabled = isMonitorUIEnabled();

    const monitorTabsContainer = document.getElementById("monitor-tabs");
    if (monitorTabsContainer) {
        if (monitorUIEnabled) {
            monitorTabsContainer.hidden = false;
            setupMonitorTabs(monitorTabsContainer);
            resetMonitorTabs(monitorTabsContainer);
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

// סגירת מודל עריכה
function closeEditModal() {
    const modal = document.getElementById("edit-modal");
    if (modal) {
        modal.style.display = "none";
    }
    const monitorTabsContainer = document.getElementById("monitor-tabs");
    if (monitorTabsContainer) {
        teardownMonitorTabs(monitorTabsContainer);
        monitorTabsContainer.hidden = true;
    }
}

// פתיחת מודל הוספה
function openAddModal() {
    // הכנת הטופס להוספת פרויקט חדש
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

// סגירת מודל הוספה
function closeAddModal() {
    const modal = document.getElementById("add-modal");
    if (modal) {
        modal.style.display = "none";
    }
}

// פתיחת מודל היסטוריה
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
        
        // הצגת ההיסטוריה בסדר הפוך (מהחדש לישן)
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

// סגירת מודל היסטוריה
function closeHistoryModal() {
    const modal = document.getElementById("history-modal");
    if (modal) {
        modal.style.display = "none";
    }
}

// הורדת ה-JSON המעודכן
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
    
    // הוספה להיסטוריה
    addToHistory("הורדת קובץ", "הורדת נתוני הפרויקטים כקובץ JSON");
}

// שמירת פרויקט בעריכה
function saveEdit() {
    if (currentProjectIndex !== null) {
        const project = projectsData[currentProjectIndex];
        const oldName = project.name; // שמירת השם הישן לרישום בהיסטוריה
        
        const nameInput = document.getElementById("edit-name");
        if (nameInput) {
            // שמירת שם הפרויקט
            project.name = nameInput.value.trim();
        }

        // איסוף כתובת האתר
        const urlInput = document.getElementById("edit-url");
        if (urlInput) {
            project.url = urlInput.value.trim();
        }

        // יצירת מבנה נתונים במקרה שהוא חסר
        if (!project.fieldNames) project.fieldNames = {};
        if (!project.fields) project.fields = {};

        // שמירת שמות השדות והערכים שלהם
        for (let i = 1; i <= 4; i++) {
            const fieldNameInput = document.getElementById(`edit-field-name-${i}`);
            const fieldValueInput = document.getElementById(`edit-field-value-${i}`);

            if (fieldNameInput && fieldValueInput) {
                project.fieldNames[i] = fieldNameInput.value.trim() || `שדה ${i}`;
                project.fields[i] = fieldValueInput.value.trim() || "לא זמין";
            }
        }

        // שמירת הנתונים ב-LocalStorage
        localStorage.setItem('projectsData', JSON.stringify(projectsData));
        
        // הוספה להיסטוריה
        addToHistory("עריכה", `עריכת פרויקט: ${oldName} -> ${project.name}`);

        // עדכון התצוגה מחדש
        renderProjects(projectsData);
        renderHotItems();

        // סגירת חלון העריכה
        closeEditModal();
    }
}

// שמירת פרויקט חדש
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
    
    // יצירת אובייקט פרויקט חדש
    const newProject = {
        name: projectName,
        fieldNames: {},
        fields: {},
        monitor: createDefaultMonitor()
    };
    
    // איסוף שמות השדות והערכים
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

    // הוספת הפרויקט למערך הנתונים
    projectsData.push(newProject);
    
    // שמירת הנתונים ב-LocalStorage
    localStorage.setItem('projectsData', JSON.stringify(projectsData));
    
    // הוספה להיסטוריה
    addToHistory("הוספה", `הוספת פרויקט חדש: ${projectName}`);
    
    // עדכון התצוגה
    renderProjects(projectsData);
    renderHotItems();
    
    // סגירת חלון ההוספה
    closeAddModal();
}

// אישור מחיקת פרויקט
function confirmDelete(index) {
    if (index < 0 || index >= projectsData.length) {
        alert("מספר פרויקט לא תקין.");
        return;
    }
    
    const projectName = projectsData[index].name;
    
    if (confirm(`האם אתה בטוח שברצונך למחוק את הפרויקט "${projectName}"?`)) {
        // שמירת שם הפרויקט לפני המחיקה לצורך רישום בהיסטוריה
        const deletedProjectName = projectsData[index].name;
        
        // מחיקת הפרויקט מהמערך
        projectsData.splice(index, 1);
        
        // שמירת הנתונים ב-LocalStorage
        localStorage.setItem('projectsData', JSON.stringify(projectsData));
        
        // הוספה להיסטוריה
        addToHistory("מחיקה", `נמחק פרויקט: ${deletedProjectName}`);
        
        // עדכון התצוגה
        renderProjects(projectsData);
        renderHotItems();
    }
}

// הוספת אירוע להיסטוריה
function addToHistory(type, description) {
    const now = new Date();
    const formattedDate = `${now.toLocaleDateString()} ${now.toLocaleTimeString()}`;
    
    const historyItem = {
        date: formattedDate,
        type: type,
        description: description
    };
    
    // הוספת האירוע להיסטוריה
    projectHistory.push(historyItem);
    
    // שמירת ההיסטוריה ב-LocalStorage
    localStorage.setItem('projectHistory', JSON.stringify(projectHistory));
}

// פונקציה להגבלת אורך הטקסט בשדות קלט
function addTextLengthLimit() {
    // הגבלת אורך בשדות של הוספת פרויקט
    const addNameInput = document.getElementById('add-name');
    if (addNameInput) {
        addNameInput.setAttribute('maxlength', '20');
    }
    
    // הגבלת אורך בשדות של עריכת פרויקט
    const editNameInput = document.getElementById('edit-name');
    if (editNameInput) {
        editNameInput.setAttribute('maxlength', '20');
    }
    
    // הגבלת אורך בשדות נוספים
    for (let i = 1; i <= 4; i++) {
        // שדות בטופס הוספה
        const addFieldNameInput = document.getElementById(`add-field-name-${i}`);
        const addFieldValueInput = document.getElementById(`add-field-value-${i}`);
        
        if (addFieldNameInput) {
            addFieldNameInput.setAttribute('maxlength', '15');
        }
        
        if (addFieldValueInput) {
            addFieldValueInput.setAttribute('maxlength', '20');
        }
        
        // שדות בטופס עריכה
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

// טעינת נתונים מ-LocalStorage בטעינת הדף
window.addEventListener('load', () => {
    // טעינת העדפת ערכת נושא
    const savedDarkMode = localStorage.getItem('darkMode');
    if (savedDarkMode === 'true') {
        document.body.classList.add('dark');
    }
    
    // טעינת היסטוריית שינויים
    const savedHistory = localStorage.getItem('projectHistory');
    if (savedHistory) {
        try {
            projectHistory = JSON.parse(savedHistory);
        } catch (e) {
            console.error("שגיאה בטעינת היסטוריה:", e);
            projectHistory = [];
        }
    }
    
    // טעינת נתוני פרויקטים
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
        // אם אין נתונים ב-localStorage, ננסה לטעון מקובץ ברירת מחדל
        fetch("projects.json")
            .then(response => response.json())
            .then(data => {
                projectsData = data;
                ensureMonitorDefaults(projectsData);
                localStorage.setItem('projectsData', JSON.stringify(projectsData));
                renderProjects(projectsData);
                renderHotItems();
                
                // הוספה להיסטוריה
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
    projectsData.forEach((project, index) => {
        const indicator = document.querySelector(`.status-indicator[data-index="${index}"]`);
        if (!indicator) return;

        if (!project.url || !project.url.startsWith("http")) {
            indicator.style.backgroundColor = "white";
            indicator.title = "לא הוזנה כתובת אתר";
            return;
        }

        fetch(project.url, { method: "HEAD", mode: "no-cors" })
            .then(() => {
                indicator.style.backgroundColor = "#8DC71E";
                indicator.title = "האתר זמין";
            })
            .catch(() => {
                indicator.style.backgroundColor = "#ff0033";
                indicator.title = "שגיאה בגישה לאתר";
            });
    });
}

// הפעלת בדיקה ראשונית ודור עתידי כל 60 שניות
setTimeout(checkProjectStatuses, 1500); // פעם אחת עם טעינה
setInterval(checkProjectStatuses, 60000); // כל דקה

// פונקציה לבדוק חיבוריות מקומית
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


// בדיקה ראשונית אחרי טעינה + כל דקה
setTimeout(checkLocalConnectivity, 2000);
setInterval(checkLocalConnectivity, 60000);

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

// ============================================================================
// GLOBAL STATE & CONSTANTS
// ============================================================================
//
// Global variables and constants have been extracted to js/state-global.js
//
// This includes:
// - projectsData, pageTitle, currentProjectIndex, projectHistory
// - DEFAULT_MONITOR_TEMPLATE, createDefaultMonitor()
// - Monitor runtime state (monitorRunControllers, monitorRunningProjects, etc.)
// - Monitor constants (MONITOR_RUN_STATUS_LABELS, MONITOR_TEST_STATUS_LABELS, etc.)
//
// Make sure js/state-global.js is loaded before this file in index.html
// ============================================================================
// ============================================================================
// MONITOR CONTEXT & RUN LIFECYCLE
// ============================================================================
//
// Monitor context management functions have been extracted to js/monitor-context.js
//
// This includes:
// - getMonitorRunContext(), resetMonitorRunContext()
// - trackMonitorRunController(), releaseMonitorRunController()
// - getMonitorRunButtons(), applyMonitorRunButtonState(), syncMonitorRunButtons()
// - registerMonitorRunButton()
// - ensureMonitorToastContainer(), removeMonitorToast(), showMonitorToast()
// - isMonitorRunActive(), beginMonitorRun(), endMonitorRun(), cancelMonitorRun()
//
// Make sure js/monitor-context.js is loaded before this file in index.html
// ============================================================================

// ============================================================================
// MONITOR EXECUTION - API CALLS, LOGIN, TESTS, SCHEDULING
// ============================================================================
//
// Monitor execution functions have been extracted to js/monitor-execution.js
//
// This includes:
// - Template rendering: renderMonitorTemplate()
// - URL/header building: buildMonitorUrl(), buildHeaders(), extractJsonPath()
// - Result processing: summarizeMonitorResults(), computeOverall(), persistRunResult()
// - Update indicators: updateMonitorIndicatorsForProject()
// - API fetching: monitorFetch()
// - Login: performLogin()
// - Test execution: executeTest()
// - Run orchestration: handleMonitorRunClick(), prepareMonitorRun(),
//   executeLoginIfNeeded(), executeAllMonitorTests(), finalizeMonitorRun(),
//   runProjectChecks()
// - Scheduling: runScheduledMonitorCycle(), startMonitorScheduler(),
//   stopMonitorScheduler()
// - Constants: MONITOR_CREATION_METHODS
//
// Make sure js/monitor-execution.js is loaded before this file in index.html
// ============================================================================


// ============================================================================
// MONITOR UI - TOOLTIPS, STATUS, TABS, FORMS
// ============================================================================
//
// All monitor UI functions have been extracted to js/monitor-ui.js
//
// This includes a massive amount of UI code (~2141 lines):
// - Tooltip management: monitor tests tooltips, status tooltips
// - Status determination: determineMonitorStatus(), status display logic
// - Tab system: monitor tabs for editing (setup, reset, activate)
// - Form fields: getters/setters for monitor form fields
// - Edit mode: monitorEditContext, edit mode lifecycle
// - Validation: form validation and error display
// - Test editor: dynamic test cards, add/remove/reorder
// - Form collection: collectMonitorFromForm() and helpers
// - Preview: runProjectPreview()
// - And much more UI-related functionality
//
// Make sure js/monitor-ui.js is loaded before this file in index.html
// ============================================================================

// ============================================================================
// PROJECT OPERATIONS & CRUD
// ============================================================================
//
// Project operations have been extracted to js/project-operations.js
//
// This includes a significant amount of code (~853 lines):
// - Rendering: renderProjects(), renderHotItems()
// - Edit modal: openEditModal(), closeEditModal(), saveEdit()
// - Add modal: openAddModal(), closeAddModal(), saveNewProject()
// - Delete: confirmDelete()
// - History: openHistoryModal(), closeHistoryModal()
// - File operations: handleFileUpload(), downloadUpdatedJSON()
// - Validation and field collection helpers
// - Dynamic field editors for add/edit modals
// - Status checking: checkProjectStatuses()
// - Utility: addTextLengthLimit()
//
// Make sure js/project-operations.js is loaded before this file in index.html
// ============================================================================

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

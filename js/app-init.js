/**
 * ==============================================================================
 * APPLICATION INITIALIZATION MODULE
 * ==============================================================================
 * 
 * Handles application startup, data loading, and event listener setup.
 * 
 * Dependencies:
 * - state-global.js: projectsData, projectHistory, pageTitle
 * - SafeStorage.js: localStorage wrapper
 * - monitor-ui.js: initializeMonitorUI()
 * - monitor-execution.js: startMonitorScheduler()
 * - project-operations.js: renderProjects(), renderHotItems(), addTextLengthLimit()
 * 
 * Functions:
 * - Window load event handler
 * - Window beforeunload event handler
 * - Page title editing
 * - Dark mode restoration
 * - Project data loading
 * - History loading
 * 
 * ==============================================================================
 */

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

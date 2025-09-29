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

        const statusIndicator = `<div class="status-indicator" data-index="${index}" style="background-color: white;" title="לא נבדק"></div>`;

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

/**
 * ==============================================================================
 * PROJECT OPERATIONS MODULE
 * ==============================================================================
 * 
 * Handles all project-related CRUD operations, rendering, and modal management.
 * 
 * Dependencies:
 * - state-global.js: projectsData, currentProjectIndex, pageTitle
 * - SafeStorage.js: localStorage wrapper
 * - UtilityHelpers.js: escapeHTML, truncateText
 * - monitor-ui.js: Monitor UI functions
 * - monitor-execution.js: Monitor execution functions
 * 
 * Functions exported to global scope:
 * - renderProjects(projects)
 * - openEditModal(index)
 * - closeEditModal()
 * - forceCloseEditModal()
 * - saveEdit()
 * - openAddModal()
 * - closeAddModal()
 * - saveNewProject()
 * - confirmDelete(index)
 * - openHistoryModal()
 * - closeHistoryModal()
 * - handleFileUpload(event)
 * - downloadUpdatedJSON()
 * - renderHotItems()
 * - addTextLengthLimit()
 * - checkProjectStatuses()
 * 
 * ==============================================================================
 */

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

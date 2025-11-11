/**
 * ==============================================================================
 * MONITOR UI - TOOLTIPS, STATUS, TABS, AND FORM EDITING
 * ==============================================================================
 *
 * All monitor UI components including tooltips, status determination,
 * tab management, and form editing functionality.
 *
 * Dependencies:
 * - state-global.js (monitorEditContext, projectsData, etc.)
 * - monitor-context.js (context and button functions)
 * - monitor-execution.js (execution functions)
 * - config-constants.js (limits, timeouts, etc.)
 * - ValidationService.js (validation functions)
 *
 * @module monitor-ui
 */

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


// MONITOR_ALLOWED_METHODS now defined in js/state-global.js

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


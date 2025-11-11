/**
 * ==============================================================================
 * MONITOR CONTEXT - RUN STATE MANAGEMENT
 * ==============================================================================
 *
 * Manages the runtime context and state for monitor test runs.
 * Handles button states, toast notifications, and run lifecycle.
 *
 * Dependencies:
 * - state-global.js (monitorRunContexts, monitorRunningProjects, etc.)
 * - config-constants.js (TIMEOUTS)
 *
 * @module monitor-context
 */

// ============================================================================
// CONTEXT MANAGEMENT
// ============================================================================

/**
 * Get or create monitor run context for a project
 *
 * @param {number} index - Project index
 * @returns {Object} - Monitor run context
 */
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

/**
 * Reset monitor run context for a new run
 *
 * @param {Object} context - Monitor run context
 * @param {string} mode - Run mode ('manual' or 'schedule')
 */
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

// ============================================================================
// ABORT CONTROLLER MANAGEMENT
// ============================================================================

/**
 * Track an AbortController for a monitor request
 *
 * @param {Object} context - Monitor run context
 * @param {AbortController} controller - AbortController instance
 * @returns {Object} - Controller entry
 */
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

/**
 * Release and cleanup an AbortController entry
 *
 * @param {Object} context - Monitor run context
 * @param {Object} entry - Controller entry
 */
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

// ============================================================================
// BUTTON STATE MANAGEMENT
// ============================================================================

/**
 * Get all run buttons for a project
 *
 * @param {number} index - Project index
 * @returns {Array<HTMLElement>} - Array of button elements
 */
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

/**
 * Apply running/idle state to a run button
 *
 * @param {HTMLElement} button - Button element
 * @param {boolean} isRunning - True if run is active
 */
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

/**
 * Sync all run buttons for a project
 *
 * @param {number} index - Project index
 */
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

/**
 * Register a run button with the monitor system
 *
 * @param {number} index - Project index
 * @param {HTMLElement} button - Button element
 * @param {string} source - Button source ('card' or 'modal')
 */
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

// ============================================================================
// TOAST NOTIFICATIONS
// ============================================================================

/**
 * Ensure toast container exists in DOM
 *
 * @returns {HTMLElement} - Toast container element
 */
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

/**
 * Remove a toast notification after delay
 *
 * @param {HTMLElement} toast - Toast element
 * @param {number} delay - Delay in milliseconds
 */
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
        }, TIMEOUTS.TOAST_FADE_DURATION_MS);
    }, delay);
}

/**
 * Show a toast notification
 *
 * @param {string} status - Status ('pass', 'fail', 'partial', 'unknown')
 * @param {string} title - Toast title
 * @param {string} body - Toast body text
 */
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
        removeMonitorToast(toast, TIMEOUTS.TOAST_DISPLAY_MS);
    } catch (error) {
        console.warn('Failed to show monitor toast:', error);
    }
}

// ============================================================================
// RUN LIFECYCLE
// ============================================================================

/**
 * Check if a monitor run is currently active
 *
 * @param {number} index - Project index
 * @returns {boolean} - True if run is active
 */
function isMonitorRunActive(index) {
    return monitorRunningProjects.has(index);
}

/**
 * Begin a monitor run
 *
 * @param {number} index - Project index
 * @param {Object} context - Monitor run context
 */
function beginMonitorRun(index, context) {
    monitorRunningProjects.add(index);
    context.runController = new AbortController();
    monitorRunControllers.set(index, context.runController);
    syncMonitorRunButtons(index);
}

/**
 * End a monitor run
 *
 * @param {number} index - Project index
 * @param {Object} context - Monitor run context
 */
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

/**
 * Cancel a monitor run
 *
 * @param {number} index - Project index
 * @param {string} reason - Cancellation reason
 */
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

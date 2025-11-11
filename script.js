/**
 * ==============================================================================
 * DASHBOARD APPLICATION - MAIN SCRIPT
 * ==============================================================================
 *
 * Description: API Monitoring & Testing Dashboard
 * Version: 2.0.0 (Refactored - Modular)
 * Last Updated: 2025-11-11
 *
 * ==============================================================================
 * ARCHITECTURE OVERVIEW
 * ==============================================================================
 *
 * This application has been fully modularized for better maintainability.
 * The original 4,403-line monolithic script has been split into focused modules.
 *
 * MODULE STRUCTURE:
 * -----------------
 *
 * 1. js/config-constants.js (Configuration)
 *    - TIMEOUTS, INTERVALS, TEXT_LIMITS, FIELD_LIMITS, INDICES constants
 *
 * 2. js/state-global.js (State Management)
 *    - projectsData: Array of project objects
 *    - pageTitle: Dashboard title
 *    - currentProjectIndex: Currently edited project
 *    - projectHistory: Change history log
 *    - DEFAULT_MONITOR_TEMPLATE: Monitor configuration template
 *    - Monitor runtime state and constants
 *
 * 3. js/monitor-context.js (Monitor Lifecycle)
 *    - Monitor run context management
 *    - Button state synchronization
 *    - Toast notifications
 *    - Run lifecycle: begin, end, cancel
 *
 * 4. js/monitor-execution.js (Monitor Logic)
 *    - Template rendering
 *    - API fetching and authentication
 *    - Test execution
 *    - Result processing and persistence
 *    - Scheduling
 *
 * 5. js/monitor-ui.js (Monitor UI)
 *    - Tab system for editing
 *    - Form fields and validation
 *    - Test editor (add/remove/reorder)
 *    - Status determination and tooltips
 *    - Preview functionality
 *
 * 6. js/project-operations.js (Project CRUD)
 *    - Project rendering
 *    - Edit/Add/Delete modals
 *    - History modal
 *    - File upload/download
 *    - Status checking
 *
 * 7. js/TokenManager.js (Security)
 *    - In-memory token storage
 *
 * 8. js/SafeStorage.js (Storage)
 *    - Safe localStorage wrapper
 *
 * 9. js/ValidationService.js (Validation)
 *    - Centralized validation logic
 *
 * 10. js/MonitorQueue.js (Concurrency)
 *     - Prevents race conditions
 *
 * 11. js/UtilityHelpers.js (Utilities)
 *     - Helper functions (escapeHTML, truncateText, etc.)
 *
 * 12. js/connectivity-checker.js (Network)
 *     - Internet connectivity monitoring
 *
 * 13. js/history-service.js (History)
 *     - History tracking and audit logging
 *
 * 14. js/app-init.js (Initialization)
 *     - Application startup
 *     - Data loading
 *     - Event listener setup
 *
 * 15. script.js (THIS FILE - Main Entry Point)
 *     - Minimal orchestration
 *     - Scheduling setup
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
 * - Tokens stored in-memory (TokenManager.js)
 * - CORS-aware requests
 * - No eval() or unsafe code execution
 *
 * ==============================================================================
 */

// ============================================================================
// MODULAR ARCHITECTURE
// ============================================================================
//
// All functionality has been extracted to specialized modules.
// This file now serves as a minimal entry point for scheduling and orchestration.
//
// Module loading order is defined in index.html:
// 1. config-constants.js
// 2. state-global.js
// 3. monitor-context.js
// 4. monitor-execution.js
// 5. monitor-ui.js
// 6. project-operations.js
// 7. TokenManager.js
// 8. SafeStorage.js
// 9. ValidationService.js
// 10. MonitorQueue.js
// 11. UtilityHelpers.js
// 12. connectivity-checker.js
// 13. history-service.js
// 14. app-init.js
// 15. script.js (this file)
//
// ============================================================================

// ============================================================================
// SCHEDULED TASKS
// ============================================================================
//
// All application logic has been extracted to modules.
// This file only contains scheduled task initialization.
//
// ============================================================================

// Schedule periodic project status checks
// Runs after 1.5s delay, then every 60 seconds
setTimeout(checkProjectStatuses, 1500);
setInterval(checkProjectStatuses, 60000);

// Schedule periodic connectivity checks
// Runs after 2s delay, then every 60 seconds
setTimeout(checkLocalConnectivity, 2000);
setInterval(checkLocalConnectivity, 60000);

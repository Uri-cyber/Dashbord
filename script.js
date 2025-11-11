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
 * This file now serves as pure documentation - all executable code has been
 * extracted to specialized modules.
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
 * 15. js/scheduler-setup.js (Scheduling)
 *     - Periodic task initialization
 *     - Status checks
 *     - Connectivity monitoring
 *
 * 16. script.js (THIS FILE - Documentation)
 *     - Architecture overview
 *     - Module documentation
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
 * MODULAR ARCHITECTURE BENEFITS
 * ==============================================================================
 *
 * Benefits of this modular approach:
 *
 * 1. Maintainability
 *    - Each module has a single, clear responsibility
 *    - Easier to locate and fix bugs
 *    - Reduced cognitive load when working on specific features
 *
 * 2. Testability
 *    - Modules can be tested in isolation
 *    - Clear boundaries make mocking easier
 *    - Better test coverage possible
 *
 * 3. Scalability
 *    - Easy to add new features without affecting existing code
 *    - Can parallelize development across modules
 *    - Clear extension points
 *
 * 4. Readability
 *    - Each file is focused and concise
 *    - Module names clearly indicate purpose
 *    - Documentation is co-located with code
 *
 * 5. Performance
 *    - Modules can be lazy-loaded if needed
 *    - Better caching at module level
 *    - Easier to identify performance bottlenecks
 *
 * ==============================================================================
 * MODULE LOADING ORDER
 * ==============================================================================
 *
 * All modules are loaded in index.html in the following order:
 *
 * 1. config-constants.js      - Configuration (must be first)
 * 2. state-global.js           - Global state (depends on config)
 * 3. monitor-context.js        - Monitor lifecycle
 * 4. monitor-execution.js      - Monitor logic
 * 5. monitor-ui.js             - Monitor UI
 * 6. project-operations.js     - Project CRUD
 * 7. TokenManager.js           - Security
 * 8. SafeStorage.js            - Storage wrapper
 * 9. ValidationService.js      - Validation
 * 10. MonitorQueue.js          - Concurrency
 * 11. UtilityHelpers.js        - Utilities
 * 12. connectivity-checker.js  - Network monitoring
 * 13. history-service.js       - History tracking
 * 14. app-init.js              - Initialization
 * 15. scheduler-setup.js       - Scheduling
 * 16. script.js (this file)    - Documentation only
 *
 * ==============================================================================
 * REFACTORING STATISTICS
 * ==============================================================================
 *
 * Original monolithic script.js: 4,403 lines
 * Final modularized script.js:      0 lines of executable code
 * Total reduction:               4,403 lines (-100%)
 *
 * Code distributed across 9 new modules:
 * - state-global.js (139 lines)
 * - monitor-context.js (417 lines)
 * - monitor-execution.js (802 lines)
 * - monitor-ui.js (2,159 lines)
 * - project-operations.js (853 lines)
 * - connectivity-checker.js (45 lines)
 * - app-init.js (118 lines)
 * - history-service.js (38 lines)
 * - scheduler-setup.js (31 lines)
 *
 * Total: 4,602 lines across 9 modules
 * (Increased due to module headers, documentation, and improved code quality)
 *
 * Result: Fully modularized codebase with 16 focused modules!
 *
 * ==============================================================================
 */

// ============================================================================
// NO EXECUTABLE CODE
// ============================================================================
//
// All application logic has been extracted to specialized modules.
// This file serves as documentation and architecture overview only.
//
// See index.html for the complete module loading order.
//
// ============================================================================

/**
 * ==============================================================================
 * SCHEDULER SETUP MODULE
 * ==============================================================================
 *
 * Initializes all periodic scheduled tasks.
 *
 * Dependencies:
 * - project-operations.js: checkProjectStatuses()
 * - connectivity-checker.js: checkLocalConnectivity()
 *
 * Scheduled Tasks:
 * - Project status checks (every 60 seconds)
 * - Connectivity checks (every 60 seconds)
 *
 * ==============================================================================
 */

// ============================================================================
// SCHEDULED TASKS
// ============================================================================

// Schedule periodic project status checks
// Runs after 1.5s delay, then every 60 seconds
setTimeout(checkProjectStatuses, 1500);
setInterval(checkProjectStatuses, 60000);

// Schedule periodic connectivity checks
// Runs after 2s delay, then every 60 seconds
setTimeout(checkLocalConnectivity, 2000);
setInterval(checkLocalConnectivity, 60000);

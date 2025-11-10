/**
 * ==============================================================================
 * MONITOR QUEUE - PREVENTS CONCURRENT RUN RACE CONDITIONS
 * ==============================================================================
 *
 * Ensures only one monitor run per project at a time, preventing data corruption
 * and race conditions when multiple run requests occur simultaneously.
 *
 * Race Condition Fixed:
 * - User clicks "Run" button multiple times quickly
 * - Scheduled run triggers while manual run is in progress
 * - Multiple tabs running same monitor simultaneously
 *
 * Solution:
 * - Queue system ensures sequential execution
 * - One run at a time per project
 * - Automatic queuing of concurrent requests
 *
 * Usage:
 *   await MonitorQueue.enqueue(projectIndex, async () => {
 *       // Your monitor run logic here
 *       return result;
 *   });
 *
 * @class MonitorQueue
 */

class MonitorQueue {
    /**
     * Map of project index -> queue of pending operations
     * @private
     */
    static #queues = new Map();

    /**
     * Set of project indices currently running
     * @private
     */
    static #running = new Set();

    /**
     * Map of project index -> current operation info (for diagnostics)
     * @private
     */
    static #currentOps = new Map();

    /**
     * Enqueue an operation for a project
     * Ensures only one operation runs at a time per project
     *
     * @param {number} projectIndex - Index of the project
     * @param {Function} operation - Async operation to execute
     * @param {Object} [options] - Operation options
     * @param {string} [options.source] - Source of the request (manual, schedule, etc.)
     * @param {string} [options.mode] - Run mode
     * @returns {Promise} - Promise that resolves with operation result
     */
    static async enqueue(projectIndex, operation, options = {}) {
        if (projectIndex === null || projectIndex === undefined) {
            throw new Error('MonitorQueue: projectIndex is required');
        }

        if (typeof operation !== 'function') {
            throw new Error('MonitorQueue: operation must be a function');
        }

        // Create queue for this project if it doesn't exist
        if (!this.#queues.has(projectIndex)) {
            this.#queues.set(projectIndex, []);
        }

        const queue = this.#queues.get(projectIndex);

        // Create a promise that will be resolved when the operation completes
        return new Promise((resolve, reject) => {
            const queuedOp = {
                operation: operation,
                resolve: resolve,
                reject: reject,
                enqueuedAt: Date.now(),
                source: options.source || 'unknown',
                mode: options.mode || 'manual'
            };

            // Add to queue
            queue.push(queuedOp);

            // Start processing if not already running
            if (!this.#running.has(projectIndex)) {
                this.#processQueue(projectIndex);
            } else {
                console.log(`MonitorQueue: Operation queued for project ${projectIndex} (${queue.length} in queue)`);
            }
        });
    }

    /**
     * Process the queue for a project
     * @private
     * @param {number} projectIndex - Index of the project
     */
    static async #processQueue(projectIndex) {
        const queue = this.#queues.get(projectIndex);

        if (!queue || queue.length === 0) {
            // No more operations, clean up
            this.#running.delete(projectIndex);
            this.#currentOps.delete(projectIndex);
            return;
        }

        // Mark as running
        this.#running.add(projectIndex);

        // Get next operation
        const queuedOp = queue.shift();

        // Store current operation info
        this.#currentOps.set(projectIndex, {
            enqueuedAt: queuedOp.enqueuedAt,
            startedAt: Date.now(),
            source: queuedOp.source,
            mode: queuedOp.mode
        });

        try {
            // Execute the operation
            const result = await queuedOp.operation();

            // Resolve the promise
            queuedOp.resolve(result);
        } catch (error) {
            // Reject the promise
            queuedOp.reject(error);
            console.error(`MonitorQueue: Operation failed for project ${projectIndex}:`, error);
        } finally {
            // Remove from running set
            this.#running.delete(projectIndex);
            this.#currentOps.delete(projectIndex);

            // Process next operation in queue
            if (queue.length > 0) {
                // Use setTimeout to avoid deep call stack
                setTimeout(() => this.#processQueue(projectIndex), 0);
            }
        }
    }

    /**
     * Check if a project is currently running
     *
     * @param {number} projectIndex - Index of the project
     * @returns {boolean} - True if project is running
     */
    static isRunning(projectIndex) {
        return this.#running.has(projectIndex);
    }

    /**
     * Get queue length for a project
     *
     * @param {number} projectIndex - Index of the project
     * @returns {number} - Number of operations in queue (excluding currently running)
     */
    static getQueueLength(projectIndex) {
        const queue = this.#queues.get(projectIndex);
        return queue ? queue.length : 0;
    }

    /**
     * Get current operation info for a project
     *
     * @param {number} projectIndex - Index of the project
     * @returns {Object|null} - Operation info or null if not running
     */
    static getCurrentOperation(projectIndex) {
        return this.#currentOps.get(projectIndex) || null;
    }

    /**
     * Clear queue for a project (cancels pending operations)
     *
     * @param {number} projectIndex - Index of the project
     * @returns {number} - Number of operations cancelled
     */
    static clearQueue(projectIndex) {
        const queue = this.#queues.get(projectIndex);

        if (!queue) {
            return 0;
        }

        const count = queue.length;

        // Reject all queued operations
        queue.forEach(queuedOp => {
            queuedOp.reject(new Error('Operation cancelled'));
        });

        // Clear the queue
        queue.length = 0;

        console.log(`MonitorQueue: Cleared ${count} queued operations for project ${projectIndex}`);

        return count;
    }

    /**
     * Clear all queues (cancels all pending operations)
     *
     * @returns {number} - Total number of operations cancelled
     */
    static clearAllQueues() {
        let totalCount = 0;

        this.#queues.forEach((queue, projectIndex) => {
            totalCount += this.clearQueue(projectIndex);
        });

        return totalCount;
    }

    /**
     * Get diagnostics for all projects
     *
     * @returns {Array} - Array of diagnostic info
     */
    static getDiagnostics() {
        const diagnostics = [];

        // Get all project indices (running + queued)
        const allIndices = new Set([
            ...this.#running,
            ...this.#queues.keys()
        ]);

        allIndices.forEach(projectIndex => {
            const queue = this.#queues.get(projectIndex);
            const currentOp = this.#currentOps.get(projectIndex);
            const isRunning = this.#running.has(projectIndex);

            diagnostics.push({
                projectIndex: projectIndex,
                isRunning: isRunning,
                queueLength: queue ? queue.length : 0,
                currentOperation: currentOp ? {
                    source: currentOp.source,
                    mode: currentOp.mode,
                    enqueuedAt: new Date(currentOp.enqueuedAt).toISOString(),
                    startedAt: new Date(currentOp.startedAt).toISOString(),
                    runningFor: Date.now() - currentOp.startedAt
                } : null
            });
        });

        return diagnostics;
    }

    /**
     * Get count of currently running operations
     *
     * @returns {number} - Number of projects currently running
     */
    static getRunningCount() {
        return this.#running.size;
    }

    /**
     * Get total queued operations across all projects
     *
     * @returns {number} - Total number of queued operations
     */
    static getTotalQueuedCount() {
        let total = 0;
        this.#queues.forEach(queue => {
            total += queue.length;
        });
        return total;
    }

    /**
     * Wait for a project to finish running
     *
     * @param {number} projectIndex - Index of the project
     * @param {number} [timeout=30000] - Maximum time to wait in ms
     * @returns {Promise<boolean>} - True if finished, false if timeout
     */
    static async waitForCompletion(projectIndex, timeout = 30000) {
        const startTime = Date.now();

        while (this.isRunning(projectIndex)) {
            if (Date.now() - startTime > timeout) {
                return false; // Timeout
            }

            // Wait 100ms before checking again
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        return true; // Completed
    }
}

// Freeze the class to prevent modifications
Object.freeze(MonitorQueue);

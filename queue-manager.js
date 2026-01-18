// queue-manager.js - Advanced Queue Management with Priority and Fair Distribution
// Part of FacebookPro Blaster Multi-Account Concurrency System

/**
 * Priority levels for task queuing
 */
const PRIORITY = {
  HIGH: 3,
  NORMAL: 2,
  LOW: 1
};

/**
 * PriorityQueue - Manages tasks with priority ordering and round-robin within same priority
 */
class PriorityQueue {
  constructor() {
    this.queues = {
      [PRIORITY.HIGH]: [],
      [PRIORITY.NORMAL]: [],
      [PRIORITY.LOW]: []
    };
    this.accountRoundRobin = new Map(); // Track last index per priority level
  }

  /**
   * Add task to appropriate priority queue
   */
  enqueue(task, priority = PRIORITY.NORMAL) {
    const queue = this.queues[priority];
    if (!queue) {
      throw new Error(`Invalid priority: ${priority}`);
    }

    task.priority = priority;
    task.enqueuedAt = Date.now();
    queue.push(task);
  }

  /**
   * Get next task using priority + round-robin
   */
  dequeue() {
    // Check priorities in order: HIGH -> NORMAL -> LOW
    for (const priority of [PRIORITY.HIGH, PRIORITY.NORMAL, PRIORITY.LOW]) {
      const queue = this.queues[priority];
      if (queue.length > 0) {
        // Round-robin within same priority to ensure fair account distribution
        const task = this._roundRobinPick(queue, priority);
        return task;
      }
    }
    return null;
  }

  /**
   * Round-robin selection within a priority queue
   * Ensures different accounts get turns even within same priority
   */
  _roundRobinPick(queue, priority) {
    if (queue.length === 1) {
      return queue.shift();
    }

    // Group by account
    const accountGroups = new Map();
    queue.forEach((task, index) => {
      if (!accountGroups.has(task.accountId)) {
        accountGroups.set(task.accountId, []);
      }
      accountGroups.get(task.accountId).push({ task, index });
    });

    // Get last served account for this priority
    const lastAccount = this.accountRoundRobin.get(priority);
    const accounts = Array.from(accountGroups.keys());

    // Find next account in round-robin order
    let nextAccount;
    if (!lastAccount) {
      nextAccount = accounts[0];
    } else {
      const lastIndex = accounts.indexOf(lastAccount);
      nextAccount = accounts[(lastIndex + 1) % accounts.length];
    }

    // Update round-robin tracker
    this.accountRoundRobin.set(priority, nextAccount);

    // Pick first task from selected account
    const selectedGroup = accountGroups.get(nextAccount);
    const { task, index } = selectedGroup[0];

    // Remove from queue
    queue.splice(index, 1);

    return task;
  }

  /**
   * Peek at next task without removing
   */
  peek() {
    for (const priority of [PRIORITY.HIGH, PRIORITY.NORMAL, PRIORITY.LOW]) {
      const queue = this.queues[priority];
      if (queue.length > 0) {
        return queue[0];
      }
    }
    return null;
  }

  /**
   * Get total queue size
   */
  size() {
    return Object.values(this.queues).reduce((sum, q) => sum + q.length, 0);
  }

  /**
   * Check if queue is empty
   */
  isEmpty() {
    return this.size() === 0;
  }

  /**
   * Get queue statistics
   */
  getStats() {
    const stats = {
      total: this.size(),
      byPriority: {
        high: this.queues[PRIORITY.HIGH].length,
        normal: this.queues[PRIORITY.NORMAL].length,
        low: this.queues[PRIORITY.LOW].length
      },
      byAccount: {},
      oldestTask: null,
      avgWaitTime: 0
    };

    // Calculate per-account stats and wait times
    const allTasks = [
      ...this.queues[PRIORITY.HIGH],
      ...this.queues[PRIORITY.NORMAL],
      ...this.queues[PRIORITY.LOW]
    ];

    const now = Date.now();
    let totalWaitTime = 0;
    let oldestTime = 0;

    allTasks.forEach(task => {
      // Count by account
      stats.byAccount[task.accountId] = (stats.byAccount[task.accountId] || 0) + 1;

      // Track wait times
      const waitTime = now - task.enqueuedAt;
      totalWaitTime += waitTime;

      if (waitTime > oldestTime) {
        oldestTime = waitTime;
        stats.oldestTask = {
          accountId: task.accountId,
          botName: task.botName,
          waitTime: Math.floor(waitTime / 1000) // seconds
        };
      }
    });

    if (allTasks.length > 0) {
      stats.avgWaitTime = Math.floor(totalWaitTime / allTasks.length / 1000); // seconds
    }

    return stats;
  }

  /**
   * Clear all queues
   */
  clear() {
    Object.keys(this.queues).forEach(priority => {
      this.queues[priority] = [];
    });
    this.accountRoundRobin.clear();
  }

  /**
   * Remove specific task from queue
   */
  remove(accountId, botName) {
    let removed = false;
    Object.values(this.queues).forEach(queue => {
      const index = queue.findIndex(t =>
        t.accountId === accountId && t.botName === botName
      );
      if (index !== -1) {
        queue.splice(index, 1);
        removed = true;
      }
    });
    return removed;
  }
}

/**
 * QueueManager - Main queue management class
 */
class QueueManager {
  constructor(maxConcurrency = 3) {
    this.maxConcurrency = maxConcurrency;
    this.queue = new PriorityQueue();
    this.stats = {
      totalEnqueued: 0,
      totalDequeued: 0,
      totalProcessed: 0,
      totalTimeout: 0
    };
    this.config = {
      queueTimeout: parseInt(process.env.QUEUE_TIMEOUT) || 300000, // 5 minutes
      maxQueueSize: parseInt(process.env.QUEUE_MAX_SIZE) || 100
    };
  }

  /**
   * Add task to queue
   */
  enqueue(task, priority = 'normal') {
    // Convert string priority to number
    const numPriority = this._getPriorityValue(priority);

    // Check queue size limit
    if (this.queue.size() >= this.config.maxQueueSize) {
      throw new Error(`Queue full (max: ${this.config.maxQueueSize})`);
    }

    this.queue.enqueue(task, numPriority);
    this.stats.totalEnqueued++;
  }

  /**
   * Get next task from queue
   */
  dequeue() {
    const task = this.queue.dequeue();
    if (task) {
      this.stats.totalDequeued++;

      // Check if task timed out
      const waitTime = Date.now() - task.enqueuedAt;
      if (waitTime > this.config.queueTimeout) {
        this.stats.totalTimeout++;
        console.warn(`[QueueManager] Task timeout: ${task.accountId}:${task.botName} (waited ${Math.floor(waitTime / 1000)}s)`);
        return null; // Skip timed out task
      }
    }
    return task;
  }

  /**
   * Enqueue task with delay (for retries)
   */
  async enqueueDelayed(task, delayMs) {
    return new Promise(resolve => {
      setTimeout(() => {
        this.enqueue(task, task.priority);
        resolve();
      }, delayMs);
    });
  }

  /**
   * Get queue status
   */
  getStatus() {
    const queueStats = this.queue.getStats();
    return {
      ...queueStats,
      maxConcurrency: this.maxConcurrency,
      stats: { ...this.stats },
      config: { ...this.config }
    };
  }

  /**
   * Convert string priority to number
   */
  _getPriorityValue(priority) {
    const map = {
      'high': PRIORITY.HIGH,
      'normal': PRIORITY.NORMAL,
      'low': PRIORITY.LOW
    };
    // Handle non-string priorities
    if (!priority || typeof priority !== 'string') {
      return PRIORITY.NORMAL;
    }
    return map[priority.toLowerCase()] || PRIORITY.NORMAL;
  }

  /**
   * Clear queue
   */
  clear() {
    this.queue.clear();
  }

  /**
   * Get queue size
   */
  size() {
    return this.queue.size();
  }

  /**
   * Check if queue is empty
   */
  isEmpty() {
    return this.queue.isEmpty();
  }
}

module.exports = {
  QueueManager,
  PriorityQueue,
  PRIORITY
};

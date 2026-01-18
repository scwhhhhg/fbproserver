// account-rotation.js - Fair Account Rotation Strategy
// Part of FacebookPro Blaster Multi-Account Concurrency System

/**
 * AccountRotation - Ensures even distribution of tasks across accounts
 */
class AccountRotation {
    constructor(cooldownMs = 60000) {
        this.accountOrder = []; // Circular buffer for account ordering
        this.lastProcessed = new Map(); // accountId -> timestamp
        this.processCount = new Map(); // accountId -> count
        this.cooldownMs = cooldownMs; // Minimum time between same account tasks
        this.currentIndex = 0;
    }

    /**
     * Register an account for rotation
     */
    registerAccount(accountId) {
        if (!this.accountOrder.includes(accountId)) {
            this.accountOrder.push(accountId);
            this.processCount.set(accountId, 0);
        }
    }

    /**
     * Get next account to process from available accounts
     * Uses round-robin with cooldown consideration
     */
    getNextAccount(availableAccounts) {
        if (!availableAccounts || availableAccounts.length === 0) {
            return null;
        }

        // If only one available, return it
        if (availableAccounts.length === 1) {
            return availableAccounts[0];
        }

        // Filter out accounts still in cooldown
        const now = Date.now();
        const readyAccounts = availableAccounts.filter(accountId => {
            const lastTime = this.lastProcessed.get(accountId);
            if (!lastTime) return true; // Never processed
            return (now - lastTime) >= this.cooldownMs;
        });

        // If no accounts ready (all in cooldown), pick least recently processed
        if (readyAccounts.length === 0) {
            return this._getLeastRecentlyProcessed(availableAccounts);
        }

        // Round-robin among ready accounts
        return this._roundRobinSelect(readyAccounts);
    }

    /**
     * Round-robin selection from available accounts
     */
    _roundRobinSelect(accounts) {
        // Find accounts in rotation order
        const sortedAccounts = accounts.sort((a, b) => {
            const indexA = this.accountOrder.indexOf(a);
            const indexB = this.accountOrder.indexOf(b);

            // Put unregistered accounts last
            if (indexA === -1) return 1;
            if (indexB === -1) return -1;

            return indexA - indexB;
        });

        // Pick next in rotation
        for (let i = 0; i < sortedAccounts.length; i++) {
            const accountId = sortedAccounts[(this.currentIndex + i) % sortedAccounts.length];
            if (accounts.includes(accountId)) {
                this.currentIndex = (this.currentIndex + i + 1) % this.accountOrder.length;
                return accountId;
            }
        }

        return sortedAccounts[0]; // fallback
    }

    /**
     * Get account with longest time since last process
     */
    _getLeastRecentlyProcessed(accounts) {
        let oldestAccount = accounts[0];
        let oldestTime = this.lastProcessed.get(oldestAccount) || 0;

        accounts.forEach(accountId => {
            const time = this.lastProcessed.get(accountId) || 0;
            if (time < oldestTime) {
                oldestTime = time;
                oldestAccount = accountId;
            }
        });

        return oldestAccount;
    }

    /**
     * Record task completion for an account
     */
    recordCompletion(accountId) {
        // Register if not in rotation (do this FIRST to initialize counter)
        if (!this.accountOrder.includes(accountId)) {
            this.registerAccount(accountId);
        }

        this.lastProcessed.set(accountId, Date.now());
        this.processCount.set(accountId, (this.processCount.get(accountId) || 0) + 1);
    }

    /**
     * Get rotation statistics
     */
    getStats() {
        const now = Date.now();
        const stats = {
            totalAccounts: this.accountOrder.length,
            processCount: {},
            lastProcessed: {},
            inCooldown: [],
            readyAccounts: []
        };

        // Build stats for each account
        this.accountOrder.forEach(accountId => {
            const count = this.processCount.get(accountId) || 0;
            const lastTime = this.lastProcessed.get(accountId);

            stats.processCount[accountId] = count;

            if (lastTime) {
                const timeSince = now - lastTime;
                stats.lastProcessed[accountId] = {
                    timestamp: new Date(lastTime).toISOString(),
                    secondsAgo: Math.floor(timeSince / 1000)
                };

                // Check cooldown status
                if (timeSince < this.cooldownMs) {
                    stats.inCooldown.push({
                        accountId,
                        remainingMs: this.cooldownMs - timeSince
                    });
                } else {
                    stats.readyAccounts.push(accountId);
                }
            } else {
                stats.lastProcessed[accountId] = { timestamp: 'never', secondsAgo: -1 };
                stats.readyAccounts.push(accountId);
            }
        });

        // Calculate distribution fairness (standard deviation)
        const counts = Array.from(this.processCount.values());
        if (counts.length > 0) {
            const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
            const variance = counts.reduce((sum, x) => sum + Math.pow(x - mean, 2), 0) / counts.length;
            stats.fairness = {
                mean: Math.floor(mean * 100) / 100,
                stdDev: Math.floor(Math.sqrt(variance) * 100) / 100,
                // Lower stdDev = more fair distribution
                fairnessScore: counts.length > 1 ? Math.max(0, 100 - Math.sqrt(variance) * 10) : 100
            };
        }

        return stats;
    }

    /**
     * Reset all counters (for testing or maintenance)
     */
    reset() {
        this.lastProcessed.clear();
        this.processCount.clear();
        this.currentIndex = 0;
    }

    /**
     * Remove account from rotation
     */
    removeAccount(accountId) {
        const index = this.accountOrder.indexOf(accountId);
        if (index !== -1) {
            this.accountOrder.splice(index, 1);
            this.lastProcessed.delete(accountId);
            this.processCount.delete(accountId);
        }
    }

    /**
     * Get account with minimum processes (for load balancing)
     */
    getLeastProcessedAccount(availableAccounts) {
        if (!availableAccounts || availableAccounts.length === 0) {
            return null;
        }

        let minAccount = availableAccounts[0];
        let minCount = this.processCount.get(minAccount) || 0;

        availableAccounts.forEach(accountId => {
            const count = this.processCount.get(accountId) || 0;
            if (count < minCount) {
                minCount = count;
                minAccount = accountId;
            }
        });

        return minAccount;
    }
}

module.exports = AccountRotation;

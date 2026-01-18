#!/usr/bin/env node
// concurrency-monitor.js - Real-time Concurrency Monitoring Dashboard
// Part of FacebookPro Blaster Multi-Account System

const BotExecutor = require('./executor');
const { QueueManager } = require('./queue-manager');
const AccountRotation = require('./account-rotation');

class ConcurrencyMonitor {
    constructor() {
        this.executor = new BotExecutor();
        this.refreshInterval = parseInt(process.env.MONITOR_REFRESH_INTERVAL) || 5000; // 5 seconds
        this.running = false;
    }

    async initialize() {
        await this.executor.initialize();
    }

    clearScreen() {
        process.stdout.write('\x1Bc'); // Clear terminal
    }

    formatBytes(bytes) {
        return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
    }

    formatDuration(seconds) {
        if (seconds < 60) return `${seconds}s`;
        if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
        const hours = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        return `${hours}h ${mins}m`;
    }

    renderHeader() {
        const now = new Date().toLocaleString('id-ID');
        console.log('╔══════════════════════════════════════════════════════════╗');
        console.log('║     FacebookPro Blaster - Concurrency Monitor           ║');
        console.log('╚══════════════════════════════════════════════════════════╝');
        console.log(`⏰ ${now}\n`);
    }

    renderConcurrencyStatus(status) {
        const current = status.runningProcesses || 0;
        const max = this.executor.config.maxConcurrentGlobal || 3;
        const available = max - current;
        const utilization = max > 0 ? Math.round((current / max) * 100) : 0;

        console.log('⚡ CONCURRENCY STATUS');
        console.log('─'.repeat(60));
        console.log(`   Current:     ${current}/${max} (${utilization}%)  ${'█'.repeat(current)}${'░'.repeat(available)}`);
        console.log(`   Available:   ${available} slots`);
        console.log(`   Queued:      ${status.queuedTasks || 0} tasks`);
        console.log('');
    }

    renderQueueStats() {
        const queueStatus = this.executor.queueManager.getStatus();

        console.log('📊 QUEUE DISTRIBUTION');
        console.log('─'.repeat(60));
        console.log(`   Total:       ${queueStatus.total} tasks`);
        console.log(`   HIGH:        ${queueStatus.byPriority.high} tasks`);
        console.log(`   NORMAL:      ${queueStatus.byPriority.normal} tasks`);
        console.log(`   LOW:         ${queueStatus.byPriority.low} tasks`);

        if (queueStatus.oldestTask) {
            console.log(`   Oldest:      ${queueStatus.oldestTask.accountId}:${queueStatus.oldestTask.botName} (${queueStatus.oldestTask.waitTime}s)`);
        }

        if (queueStatus.avgWaitTime > 0) {
            console.log(`   Avg Wait:    ${queueStatus.avgWaitTime}s`);
        }
        console.log('');
    }

    renderAccountDistribution() {
        const rotationStats = this.executor.accountRotation.getStats();

        console.log('👥 ACCOUNT DISTRIBUTION');
        console.log('─'.repeat(60));
        console.log(`   Total Accounts: ${rotationStats.totalAccounts}`);
        console.log(`   Ready:          ${rotationStats.readyAccounts.length}`);
        console.log(`   In Cooldown:    ${rotationStats.inCooldown.length}`);

        if (rotationStats.fairness) {
            console.log(`   Fairness Score: ${Math.round(rotationStats.fairness.fairnessScore)}% (σ=${rotationStats.fairness.stdDev})`);
        }

        // Show top processed accounts
        const sorted = Object.entries(rotationStats.processCount)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);

        if (sorted.length > 0) {
            console.log('\n   Top Accounts:');
            sorted.forEach(([accountId, count], idx) => {
                const lastProcessed = rotationStats.lastProcessed[accountId];
                const timeAgo = lastProcessed && lastProcessed.secondsAgo >= 0
                    ? `${lastProcessed.secondsAgo}s ago`
                    : 'never';
                console.log(`   ${idx + 1}. ${accountId.padEnd(15)} ${count} tasks (${timeAgo})`);
            });
        }
        console.log('');
    }

    renderRunningProcesses(status) {
        if (!status.running || status.running.length === 0) {
            console.log('🏃 RUNNING PROCESSES');
            console.log('─'.repeat(60));
            console.log('   No processes currently running');
            console.log('');
            return;
        }

        console.log('🏃 RUNNING PROCESSES');
        console.log('─'.repeat(60));
        status.running.forEach((proc, idx) => {
            const runtime = this.formatDuration(proc.runtime);
            console.log(`   ${idx + 1}. ${proc.task.padEnd(30)} ${runtime}`);
        });
        console.log('');
    }

    renderPerformanceMetrics(status) {
        console.log('⏱️  PERFORMANCE METRICS');
        console.log('─'.repeat(60));

        if (status.memory) {
            console.log(`   Memory Peak:   ${this.formatBytes(status.memory.peak)}`);
            console.log(`   Memory Current: ${this.formatBytes(status.memory.current)}`);
        }

        // Calculate tasks per hour (if we have running processes)
        if (status.running && status.running.length > 0) {
            const avgRuntime = status.running.reduce((sum, p) => sum + p.runtime, 0) / status.running.length;
            if (avgRuntime > 0) {
                const tasksPerHour = Math.round((3600 / avgRuntime) * this.executor.config.maxConcurrentGlobal);
                console.log(`   Est. Tasks/Hour: ~${tasksPerHour}`);
            }
        }

        console.log('');
    }

    renderFooter() {
        console.log('─'.repeat(60));
        console.log('Press Ctrl+C to exit  |  Refresh: ' + (this.refreshInterval / 1000) + 's');
    }

    async render() {
        const status = this.executor.getStatus();

        this.clearScreen();
        this.renderHeader();
        this.renderConcurrencyStatus(status);
        this.renderQueueStats();
        this.renderAccountDistribution();
        this.renderRunningProcesses(status);
        this.renderPerformanceMetrics(status);
        this.renderFooter();
    }

    async start() {
        console.log('🚀 Starting Concurrency Monitor...');
        await this.initialize();

        this.running = true;

        // Initial render
        await this.render();

        // Set up refresh interval
        this.intervalId = setInterval(async () => {
            if (this.running) {
                await this.render();
            }
        }, this.refreshInterval);

        // Handle graceful shutdown
        process.on('SIGINT', () => {
            this.stop();
        });

        process.on('SIGTERM', () => {
            this.stop();
        });
    }

    stop() {
        console.log('\n\n🛑 Stopping monitor...');
        this.running = false;
        if (this.intervalId) {
            clearInterval(this.intervalId);
        }
        process.exit(0);
    }
}

// CLI Usage
if (require.main === module) {
    const monitor = new ConcurrencyMonitor();
    monitor.start().catch(error => {
        console.error('❌ Monitor error:', error.message);
        process.exit(1);
    });
}

module.exports = ConcurrencyMonitor;

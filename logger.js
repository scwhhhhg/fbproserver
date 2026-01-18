/**
 * Centralized Logger Module for FacebookPro Blaster
 * Provides consistent, formatted logging across all bot scripts
 */

const fs = require('fs');
const path = require('path');

// ANSI color codes for terminal output
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',

    // Foreground colors
    black: '\x1b[30m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
    gray: '\x1b[90m',

    // Background colors
    bgRed: '\x1b[41m',
    bgGreen: '\x1b[42m',
    bgYellow: '\x1b[43m',
    bgBlue: '\x1b[44m',
};

// Log level configuration
const LOG_LEVELS = {
    DEBUG: { priority: 0, emoji: '🔍', color: colors.gray, label: 'DEBUG' },
    INFO: { priority: 1, emoji: 'ℹ️ ', color: colors.cyan, label: 'INFO ' },
    SUCCESS: { priority: 2, emoji: '✅', color: colors.green, label: 'OK   ' },
    WARNING: { priority: 3, emoji: '⚠️ ', color: colors.yellow, label: 'WARN ' },
    ERROR: { priority: 4, emoji: '❌', color: colors.red, label: 'ERROR' },
    CRITICAL: { priority: 5, emoji: '🔥', color: colors.bgRed + colors.white, label: 'CRIT ' },
};

class Logger {
    constructor(context = 'system', options = {}) {
        this.context = context;
        this.minLevel = options.minLevel || (process.env.LOG_LEVEL || 'INFO');
        this.enableColors = options.enableColors !== false && process.stdout.isTTY;
        this.enableEmoji = options.enableEmoji !== false;
        this.logToFile = options.logToFile || null;
        // Disable timestamps in console by default, but keep in files
        this.includeTimestamp = options.includeTimestamp !== undefined ? options.includeTimestamp : false;
        this.includeTimestampInFile = options.includeTimestampInFile !== false;
        this.timezone = options.timezone || 'Asia/Jakarta';

        // Create log file stream if specified
        if (this.logToFile) {
            try {
                const logDir = path.dirname(this.logToFile);
                if (!fs.existsSync(logDir)) {
                    fs.mkdirSync(logDir, { recursive: true });
                }
                this.fileStream = fs.createWriteStream(this.logToFile, { flags: 'a' });
            } catch (error) {
                console.error(`Failed to create log file: ${error.message}`);
                this.fileStream = null;
            }
        }
    }

    /**
     * Format timestamp in Jakarta timezone
     */
    getTimestamp() {
        const date = new Date();
        const options = {
            timeZone: this.timezone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        };

        const formatter = new Intl.DateTimeFormat('id-ID', options);
        const parts = formatter.formatToParts(date);

        const get = (type) => parts.find(p => p.type === type)?.value || '';

        return `${get('day')}/${get('month')}/${get('year')} ${get('hour')}:${get('minute')}:${get('second')}`;
    }

    /**
     * Check if log level should be displayed
     */
    shouldLog(level) {
        const currentPriority = LOG_LEVELS[level]?.priority ?? 0;
        const minPriority = LOG_LEVELS[this.minLevel]?.priority ?? 0;
        return currentPriority >= minPriority;
    }

    /**
     * Format log message with consistent structure
     */
    formatMessage(level, message, data = null) {
        let processedMessage = message;

        // Filter ASCII art if NO_ASCII env var is set
        if (process.env.NO_ASCII === 'true') {
            // Remove box drawing characters
            processedMessage = processedMessage.replace(/[╔╗╚╝║═╠╣╦╩╬─│┌┐└┘├┤┬┴┼]/g, '');
            // Remove lines that are only whitespace after filtering
            if (processedMessage.trim() === '') {
                return null;  // Skip this message
            }
        }

        const levelConfig = LOG_LEVELS[level] || LOG_LEVELS.INFO;
        const timestamp = this.getTimestamp();
        const emoji = this.enableEmoji ? levelConfig.emoji : '';
        const label = levelConfig.label;
        const contextStr = this.context ? `[${this.context}]` : '';

        // Build colored console message (context first, no timestamp by default)
        let consoleMsg = '';
        if (this.enableColors) {
            const timestampPart = this.includeTimestamp ? `${colors.dim}[${timestamp}]${colors.reset} ` : '';
            // Format: [context] emoji LEVEL message
            consoleMsg = `${colors.bright}${contextStr}${colors.reset} ${emoji} ${levelConfig.color}${label}${colors.reset} ${processedMessage}`;
        } else {
            const timestampPart = this.includeTimestamp ? `[${timestamp}] ` : '';
            consoleMsg = `${contextStr} ${emoji} ${label} ${processedMessage}`;
        }

        // Build plain message for file logging (always includes timestamp)
        let plainMsg = `[${timestamp}] ${contextStr} ${label} ${processedMessage}`;

        // Add data if provided
        if (data !== null && data !== undefined) {
            const dataStr = typeof data === 'object' ? JSON.stringify(data, null, 2) : String(data);
            consoleMsg += `\n${colors.dim}${dataStr}${colors.reset}`;
            plainMsg += `\n${dataStr}`;
        }

        return { consoleMsg, plainMsg };
    }

    /**
     * Write log to console and file
     */
    log(level, message, data = null) {
        if (!this.shouldLog(level)) return;

        const formatted = this.formatMessage(level, message, data);

        // Skip if message was filtered (ASCII art)
        if (!formatted) return;

        const { consoleMsg, plainMsg } = formatted;

        // Write to console
        if (level === 'ERROR' || level === 'CRITICAL') {
            console.error(consoleMsg);
        } else {
            console.log(consoleMsg);
        }

        // Write to file if enabled
        if (this.fileStream) {
            this.fileStream.write(plainMsg + '\n');
        }
    }

    // Convenience methods for each log level
    debug(message, data = null) {
        this.log('DEBUG', message, data);
    }

    info(message, data = null) {
        this.log('INFO', message, data);
    }

    success(message, data = null) {
        this.log('SUCCESS', message, data);
    }

    warn(message, data = null) {
        this.log('WARNING', message, data);
    }

    error(message, data = null) {
        this.log('ERROR', message, data);
    }

    critical(message, data = null) {
        this.log('CRITICAL', message, data);
    }

    /**
     * Log a step in a multi-step process
     * @param {number} current - Current step number
     * @param {number} total - Total number of steps
     * @param {string} message - Step description
     */
    step(current, total, message) {
        const stepMsg = `Step ${current}/${total}: ${message}`;
        this.info(stepMsg);
    }

    /**
     * Create a child logger with additional context
     */
    child(additionalContext) {
        const newContext = this.context ? `${this.context}/${additionalContext}` : additionalContext;
        return new Logger(newContext, {
            minLevel: this.minLevel,
            enableColors: this.enableColors,
            enableEmoji: this.enableEmoji,
            logToFile: this.logToFile,
            includeTimestamp: this.includeTimestamp,
            includeTimestampInFile: this.includeTimestampInFile,
            timezone: this.timezone
        });
    }

    /**
     * Log a separator line
     */
    separator(char = '=', length = 60) {
        const line = char.repeat(length);
        console.log(this.enableColors ? `${colors.dim}${line}${colors.reset}` : line);
        if (this.fileStream) {
            this.fileStream.write(line + '\n');
        }
    }

    /**
     * Log a header with separator
     */
    header(title) {
        this.separator();
        this.info(title);
        this.separator();
    }

    /**
     * Close file stream
     */
    close() {
        if (this.fileStream) {
            this.fileStream.end();
        }
    }
}

/**
 * Create a logger instance
 * @param {string} context - Context identifier (e.g., 'executor', 'bot/reply', 'account/john')
 * @param {object} options - Logger options
 * @returns {Logger}
 */
function createLogger(context, options = {}) {
    return new Logger(context, options);
}

/**
 * Default logger instance
 */
const defaultLogger = new Logger('system');

module.exports = {
    Logger,
    createLogger,
    defaultLogger,
    LOG_LEVELS
};

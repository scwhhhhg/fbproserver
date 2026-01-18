// notify.js - Telegram Notification System
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { createLogger } = require('./logger');
const logger = createLogger('notify');

// ========================================
// LOAD CONFIGURATION FROM FILE
// ========================================
let TELEGRAM_CONFIG = {
  botToken: '',
  chatId: '',
  enabled: true,
  timeout: 10000,
  retryAttempts: 3,
  retryDelay: 2000,
  useThread: false,
  threadId: null
};

// Load config from config/telegram.json
try {
  const configPath = path.join(__dirname, '../config/telegram.json');
  if (fs.existsSync(configPath)) {
    const configData = fs.readFileSync(configPath, 'utf8');
    const config = JSON.parse(configData);

    TELEGRAM_CONFIG.botToken = config.botToken || '';
    TELEGRAM_CONFIG.chatId = config.chatId ? config.chatId.toString() : '';
  } else {
    // Try legacy path for backward compatibility
    const legacyPath = path.join(__dirname, '../telegram.json');
    if (fs.existsSync(legacyPath)) {
      const configData = fs.readFileSync(legacyPath, 'utf8');
      const config = JSON.parse(configData);

      TELEGRAM_CONFIG.botToken = config.botToken || '';
      TELEGRAM_CONFIG.chatId = config.chatId ? config.chatId.toString() : '';
    }
  }
} catch (error) {
  // Use console.error at module level (logger not available yet)
  console.error('⚠️  Failed to load telegram.json, using defaults:', error.message);
}

// Notification settings
const NOTIFICATION_SETTINGS = {
  success: {
    enabled: true,
    emoji: '✅',
    format: 'minimal' // minimal, detailed, full
  },
  error: {
    enabled: true,
    emoji: '❌',
    format: 'detailed',
    includeStackTrace: false
  },
  warning: {
    enabled: true,
    emoji: '⚠️',
    format: 'minimal'
  },
  info: {
    enabled: true,
    emoji: 'ℹ️',
    format: 'minimal'
  },
  cookieStatus: {
    enabled: true,
    emoji: '🪙',
    format: 'minimal'
  },
  systemAlert: {
    enabled: true,
    emoji: '🔔',
    format: 'detailed'
  }
};

// Rate limiting to prevent spam
const rateLimiter = {
  lastNotification: {},
  minInterval: 5000, // 5 seconds minimum between same notifications
  maxPerMinute: 20,
  notificationCount: 0,
  lastReset: Date.now()
};

// Notification cache to prevent duplicates
const notificationCache = new Map();
const CACHE_DURATION = 60000; // 1 minute

// ========================================
// HELPER FUNCTIONS
// ========================================

function getJakartaTime() {
  const date = new Date();
  return date.toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    hour12: false
  });
}

function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

function escapeMarkdown(text) {
  if (!text) return '';
  // Only escape characters that actually break Telegram Markdown
  // Don't escape: . ! - ( ) as they're commonly used in normal text
  return text.toString()
    .replace(/\\_/g, '\\_')      // Underscore (italic)
    .replace(/\*/g, '\\*')       // Asterisk (bold)
    .replace(/\[/g, '\\[')       // Square brackets (links)
    .replace(/\]/g, '\\]')
    .replace(/`/g, '\\`')        // Backtick (code)
    .replace(/_/g, '\\_');       // Underscore
}

function generateNotificationHash(type, accountId, botName, message) {
  const crypto = require('crypto');
  const content = `${type}_${accountId}_${botName}_${message}`.substring(0, 200);
  return crypto.createHash('md5').update(content).digest('hex');
}

function isDuplicate(hash) {
  if (notificationCache.has(hash)) {
    const timestamp = notificationCache.get(hash);
    if (Date.now() - timestamp < CACHE_DURATION) {
      return true;
    }
  }
  notificationCache.set(hash, Date.now());
  return false;
}

function cleanupCache() {
  const now = Date.now();
  for (const [hash, timestamp] of notificationCache.entries()) {
    if (now - timestamp > CACHE_DURATION) {
      notificationCache.delete(hash);
    }
  }
}

function shouldRateLimit(key) {
  const now = Date.now();

  // Reset counter every minute
  if (now - rateLimiter.lastReset > 60000) {
    rateLimiter.notificationCount = 0;
    rateLimiter.lastReset = now;
  }

  // Check max per minute
  if (rateLimiter.notificationCount >= rateLimiter.maxPerMinute) {
    // Rate limit reached
    return true;
  }

  // Check minimum interval between same notifications
  if (rateLimiter.lastNotification[key]) {
    const timeSinceLastNotification = now - rateLimiter.lastNotification[key];
    if (timeSinceLastNotification < rateLimiter.minInterval) {
      // Rate limited
      return true;
    }
  }

  rateLimiter.lastNotification[key] = now;
  rateLimiter.notificationCount++;
  return false;
}

// ========================================
// CORE NOTIFICATION FUNCTION
// ========================================

async function sendTelegramNotification(message, options = {}) {
  if (!TELEGRAM_CONFIG.enabled) {
    // Notifications disabled
    return { success: false, reason: 'disabled' };
  }

  const {
    parseMode = 'Markdown',
    disablePreview = true,
    silent = false,
    retryOnFail = true
  } = options;

  // Cleanup old cache entries
  cleanupCache();

  const url = `https://api.telegram.org/bot${TELEGRAM_CONFIG.botToken}/sendMessage`;

  const payload = {
    chat_id: TELEGRAM_CONFIG.chatId,
    text: message,
    parse_mode: parseMode,
    disable_web_page_preview: disablePreview,
    disable_notification: silent
  };

  // Add thread support if enabled
  if (TELEGRAM_CONFIG.useThread && TELEGRAM_CONFIG.threadId) {
    payload.message_thread_id = TELEGRAM_CONFIG.threadId;
  }

  let attempts = 0;
  const maxAttempts = retryOnFail ? TELEGRAM_CONFIG.retryAttempts : 1;

  while (attempts < maxAttempts) {
    attempts++;

    try {
      const response = await axios.post(url, payload, {
        timeout: TELEGRAM_CONFIG.timeout
      });

      if (response.data.ok) {
        return { success: true, messageId: response.data.result.message_id };
      } else {
        throw new Error(response.data.description || 'Unknown Telegram API error');
      }

    } catch (error) {
      // Notification attempt failed

      if (attempts >= maxAttempts) {
        return {
          success: false,
          error: error.message,
          attempts: attempts
        };
      }

      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, TELEGRAM_CONFIG.retryDelay * attempts));
    }
  }

  return { success: false, error: 'Max retry attempts reached' };
}

// ========================================
// NOTIFICATION BUILDERS
// ========================================

function buildSuccessNotification(accountId, botName, details = '', format = 'minimal') {
  const emoji = NOTIFICATION_SETTINGS.success.emoji;
  const time = getJakartaTime();

  let message = `${emoji} *SUCCESS*\n`;
  message += `━━━━━━━━━━━━━━━━━━━━\n`;
  message += `📱 Account: \`${escapeMarkdown(accountId)}\`\n`;
  message += `🤖 Bot: \`${escapeMarkdown(botName)}\`\n`;

  if (details) {
    message += `📊 Result: ${escapeMarkdown(details)}\n`;
  }

  if (format === 'detailed' || format === 'full') {
    message += `⏰ Time: \`${time}\`\n`;
  }

  return message;
}

function buildErrorNotification(accountId, botName, error, format = 'detailed') {
  const emoji = NOTIFICATION_SETTINGS.error.emoji;
  const time = getJakartaTime();

  let message = `${emoji} *ERROR*\n`;
  message += `━━━━━━━━━━━━━━━━━━━━\n`;
  message += `📱 Account: \`${escapeMarkdown(accountId)}\`\n`;
  message += `🤖 Bot: \`${escapeMarkdown(botName)}\`\n`;
  message += `❌ Error: ${escapeMarkdown(error.substring(0, 200))}\n`;

  if (format === 'detailed' || format === 'full') {
    message += `⏰ Time: \`${time}\`\n`;
  }

  return message;
}

function buildWarningNotification(accountId, botName, warning, format = 'minimal') {
  const emoji = NOTIFICATION_SETTINGS.warning.emoji;
  const time = getJakartaTime();

  let message = `${emoji} *WARNING*\n`;
  message += `━━━━━━━━━━━━━━━━━━━━\n`;
  message += `📱 Account: \`${escapeMarkdown(accountId)}\`\n`;
  message += `🤖 Bot: \`${escapeMarkdown(botName)}\`\n`;
  message += `⚠️ Warning: ${escapeMarkdown(warning.substring(0, 200))}\n`;

  if (format === 'detailed' || format === 'full') {
    message += `⏰ Time: \`${time}\`\n`;
  }

  return message;
}

function buildCookieNotification(accountId, status, details = '', format = 'minimal') {
  const emoji = NOTIFICATION_SETTINGS.cookieStatus.emoji;
  const time = getJakartaTime();

  let statusEmoji = '❓';
  if (status === 'valid') statusEmoji = '✅';
  else if (status === 'invalid' || status === 'expired') statusEmoji = '❌';
  else if (status === 'refreshed') statusEmoji = '🔄';

  let message = `${emoji} *COOKIE STATUS*\n`;
  message += `━━━━━━━━━━━━━━━━━━━━\n`;
  message += `📱 Account: \`${escapeMarkdown(accountId)}\`\n`;
  message += `${statusEmoji} Status: ${escapeMarkdown(status.toUpperCase())}\n`;

  if (details) {
    message += `ℹ️ Details: ${escapeMarkdown(details)}\n`;
  }

  if (format === 'detailed' || format === 'full') {
    message += `⏰ Time: \`${time}\`\n`;
  }

  return message;
}

function buildSystemNotification(component, message, format = 'detailed') {
  const emoji = NOTIFICATION_SETTINGS.systemAlert.emoji;
  const time = getJakartaTime();

  let msg = `${emoji} *SYSTEM ALERT*\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `🔧 Component: \`${escapeMarkdown(component)}\`\n`;
  msg += `📝 Message: ${escapeMarkdown(message.substring(0, 300))}\n`;

  if (format === 'detailed' || format === 'full') {
    msg += `⏰ Time: \`${time}\`\n`; // Use code block, no escaping needed
  }

  return msg;
}

// ========================================
// PUBLIC API
// ========================================

// Track pending notifications to merge duplicates
const pendingNotifications = new Map();
const MERGE_WINDOW = 3000; // 3 seconds window to merge notifications

async function success(accountId, botName, details = '') {
  if (!NOTIFICATION_SETTINGS.success.enabled) {
    return { success: false, reason: 'disabled' };
  }

  const key = `success_${accountId}_${botName}`;
  
  // Check if there's a pending notification for this account/bot
  if (pendingNotifications.has(key)) {
    const pending = pendingNotifications.get(key);
    
    // Merge details if within merge window
    if (Date.now() - pending.timestamp < MERGE_WINDOW) {
      // Merge the details
      if (details && !pending.details.includes(details)) {
        pending.details += (pending.details ? ' | ' : '') + details;
      }
      
      // Update timestamp to extend the merge window
      pending.timestamp = Date.now();
      
      // Return without sending - will be sent when timer expires
      return { success: false, reason: 'merged' };
    } else {
      // Window expired, send the pending notification first
      clearTimeout(pending.timer);
      await sendPendingNotification(key);
    }
  }

  // Create new pending notification
  const pending = {
    accountId,
    botName,
    details,
    timestamp: Date.now(),
    timer: null
  };

  // Set timer to send after merge window
  pending.timer = setTimeout(async () => {
    await sendPendingNotification(key);
  }, MERGE_WINDOW);

  pendingNotifications.set(key, pending);
  
  return { success: true, reason: 'pending_merge' };
}

async function sendPendingNotification(key) {
  const pending = pendingNotifications.get(key);
  if (!pending) return;

  pendingNotifications.delete(key);

  const hash = generateNotificationHash('success', pending.accountId, pending.botName, pending.details);
  if (isDuplicate(hash)) {
    // Duplicate notification blocked
    return { success: false, reason: 'duplicate' };
  }

  if (shouldRateLimit(key)) {
    return { success: false, reason: 'rate_limited' };
  }

  const message = buildSuccessNotification(
    pending.accountId,
    pending.botName,
    pending.details,
    NOTIFICATION_SETTINGS.success.format
  );

  return await sendTelegramNotification(message);
}

async function error(accountId, botName, errorMessage, screenshotPath = null) {
  if (!NOTIFICATION_SETTINGS.error.enabled) {
    return { success: false, reason: 'disabled' };
  }

  const hash = generateNotificationHash('error', accountId, botName, errorMessage);
  if (isDuplicate(hash)) {
    // Duplicate error notification blocked
    return { success: false, reason: 'duplicate' };
  }

  const key = `error_${accountId}_${botName}`;
  if (shouldRateLimit(key)) {
    return { success: false, reason: 'rate_limited' };
  }

  const message = buildErrorNotification(
    accountId,
    botName,
    errorMessage,
    NOTIFICATION_SETTINGS.error.format
  );

  const result = await sendTelegramNotification(message);

  // TODO: Add screenshot upload support if needed
  // if (screenshotPath && result.success) {
  //   await uploadScreenshot(screenshotPath);
  // }

  return result;
}

async function warning(accountId, botName, warningMessage) {
  if (!NOTIFICATION_SETTINGS.warning.enabled) {
    return { success: false, reason: 'disabled' };
  }

  const hash = generateNotificationHash('warning', accountId, botName, warningMessage);
  if (isDuplicate(hash)) {
    // Duplicate warning notification blocked
    return { success: false, reason: 'duplicate' };
  }

  const key = `warning_${accountId}_${botName}`;
  if (shouldRateLimit(key)) {
    return { success: false, reason: 'rate_limited' };
  }

  const message = buildWarningNotification(
    accountId,
    botName,
    warningMessage,
    NOTIFICATION_SETTINGS.warning.format
  );

  return await sendTelegramNotification(message);
}

async function info(accountId, botName, infoMessage) {
  if (!NOTIFICATION_SETTINGS.info.enabled) {
    return { success: false, reason: 'disabled' };
  }

  const key = `info_${accountId}_${botName}`;
  if (shouldRateLimit(key)) {
    return { success: false, reason: 'rate_limited' };
  }

  const emoji = NOTIFICATION_SETTINGS.info.emoji;
  const time = getJakartaTime();

  let message = `${emoji} *INFO*\n`;
  message += `━━━━━━━━━━━━━━━━━━━━\n`;
  message += `📱 Account: \`${escapeMarkdown(accountId)}\`\n`;
  message += `🤖 Bot: \`${escapeMarkdown(botName)}\`\n`;
  message += `ℹ️ Info: ${escapeMarkdown(infoMessage)}\n`;

  if (NOTIFICATION_SETTINGS.info.format === 'detailed') {
    message += `⏰ Time: \`${time}\`\n`;
  }

  return await sendTelegramNotification(message);
}

async function cookieStatus(accountId, status, details = '') {
  if (!NOTIFICATION_SETTINGS.cookieStatus.enabled) {
    return { success: false, reason: 'disabled' };
  }

  const hash = generateNotificationHash('cookie', accountId, status, details);
  if (isDuplicate(hash)) {
    // Duplicate cookie notification blocked
    return { success: false, reason: 'duplicate' };
  }

  const key = `cookie_${accountId}_${status}`;
  if (shouldRateLimit(key)) {
    return { success: false, reason: 'rate_limited' };
  }

  const message = buildCookieNotification(
    accountId,
    status,
    details,
    NOTIFICATION_SETTINGS.cookieStatus.format
  );

  return await sendTelegramNotification(message);
}

async function systemAlert(component, message) {
  if (!NOTIFICATION_SETTINGS.systemAlert.enabled) {
    return { success: false, reason: 'disabled' };
  }

  const hash = generateNotificationHash('system', component, '', message);
  if (isDuplicate(hash)) {
    // Duplicate system notification blocked
    return { success: false, reason: 'duplicate' };
  }

  const key = `system_${component}`;
  if (shouldRateLimit(key)) {
    return { success: false, reason: 'rate_limited' };
  }

  const msg = buildSystemNotification(
    component,
    message,
    NOTIFICATION_SETTINGS.systemAlert.format
  );

  return await sendTelegramNotification(msg);
}

// Custom notification for advanced use
async function custom(message, options = {}) {
  const key = `custom_${Date.now()}`;
  if (shouldRateLimit(key)) {
    return { success: false, reason: 'rate_limited' };
  }

  return await sendTelegramNotification(message, options);
}

// ========================================
// UTILITY FUNCTIONS
// ========================================

function getConfig() {
  return {
    telegram: { ...TELEGRAM_CONFIG, botToken: '***HIDDEN***' },
    notifications: NOTIFICATION_SETTINGS,
    rateLimit: {
      minInterval: rateLimiter.minInterval,
      maxPerMinute: rateLimiter.maxPerMinute,
      currentCount: rateLimiter.notificationCount
    }
  };
}

function setEnabled(enabled) {
  TELEGRAM_CONFIG.enabled = enabled;
  // Notifications status changed
}

function setNotificationType(type, enabled) {
  if (NOTIFICATION_SETTINGS[type]) {
    NOTIFICATION_SETTINGS[type].enabled = enabled;
    // Notification type status changed
  }
}

function clearCache() {
  notificationCache.clear();
  // Cache cleared
}

function getStats() {
  return {
    cacheSize: notificationCache.size,
    notificationsThisMinute: rateLimiter.notificationCount,
    lastReset: new Date(rateLimiter.lastReset).toISOString(),
    enabled: TELEGRAM_CONFIG.enabled
  };
}

// ========================================
// EXPORTS
// ========================================

module.exports = {
  // Main notification functions
  success,
  error,
  warning,
  info,
  cookieStatus,
  systemAlert,
  custom,

  // Utility functions
  getConfig,
  setEnabled,
  setNotificationType,
  clearCache,
  getStats
};

// ========================================
// INITIALIZATION
// ========================================

// Telegram Notify Module Ready

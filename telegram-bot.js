// --- HARDCODED VAULT CREDENTIALS (PRODUCTION) ---
// Credentials are Base64 encoded for additional security
// These are read-only credentials, safe even if discovered
const _decode = (s) => Buffer.from(s, 'base64').toString('utf8');
process.env.VAULT_ADDR = process.env.VAULT_ADDR || _decode('aHR0cHM6Ly9vcGVuYmFvLXByb2R1Y3Rpb24tMTg4NC51cC5yYWlsd2F5LmFwcA==');
process.env.VAULT_NAMESPACE = process.env.VAULT_NAMESPACE || _decode('ZmJwcm9ibGFzdGVy');
process.env.VAULT_ROLE_ID = process.env.VAULT_ROLE_ID || _decode('MjAwZGZhZTktMzQyNS03MmI5LWMxYzUtYzdlNjQ4OTIzZWUy');
process.env.VAULT_SECRET_ID = process.env.VAULT_SECRET_ID || _decode('ZjYzYmRjMzYtNDk3OS0xOTg3LTdjZTMtYzBhNTVkMTZhMjEw');

const TelegramBot = require('node-telegram-bot-api');
const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const os = require('os');

// Initialize logger first
const { createLogger } = require('./logger');
const logger = createLogger('telegram-bot');

// Load Telegram configuration from file
let BOT_TOKEN = '';
let ALLOWED_USER_IDS = [1088206273];

try {
  let configPath = path.join(__dirname, '../config/telegram.json');

  if (!fsSync.existsSync(configPath)) {
    // Try legacy path
    configPath = path.join(__dirname, '../telegram.json');
  }

  if (fsSync.existsSync(configPath)) {
    const configData = fsSync.readFileSync(configPath, 'utf8');
    const config = JSON.parse(configData);

    BOT_TOKEN = config.botToken;
    ALLOWED_USER_IDS = config.allowedUserIds || [config.chatId];
  } else {
    logger.info('⚠️  telegram.json not found, bot features disabled.');
  }
} catch (error) {
  logger.error('⚠️  Failed to load telegram.json:', error.message);
  // Continue execution instead of exit, to allow other features
}

// Dynamic Base Path for Binary Support
const isCompiled = path.basename(process.execPath).endsWith('.exe') && !process.execPath.toLowerCase().includes('node.exe') && !process.execPath.toLowerCase().includes('bun.exe');
const basePath = isCompiled ? path.dirname(process.execPath) : __dirname;
const ACCOUNTS_DIR = path.join(basePath, "../accounts");
const EXECUTOR_SCRIPT = path.join(__dirname, 'executor_wrapper.sh');
// Auto-detect executor path (with or without .js extension)
const executorWithoutExt = path.join(__dirname, 'executor');
const executorWithExt = path.join(__dirname, 'executor.js');
const EXECUTOR = fsSync.existsSync(executorWithoutExt) ? executorWithoutExt : executorWithExt;

// Auto-detect scheduler path (with or without .js extension)
const schedulerWithoutExt = path.join(__dirname, 'scheduler-cli');
const schedulerWithExt = path.join(__dirname, 'scheduler-cli.js');
const SCHEDULER_SCRIPT = fsSync.existsSync(schedulerWithoutExt) ? schedulerWithoutExt : schedulerWithExt;

const bot = new TelegramBot(BOT_TOKEN, { polling: true });
const commandSessions = new Map();

// ========================================
// HELPER FUNCTIONS
// ========================================

function isAuthorized(userId) {
  return ALLOWED_USER_IDS.includes(userId);
}

function getJakartaTime() {
  const date = new Date();
  return date.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
}

async function executeCommand(command, timeout = 120000) {
  try {
    // Executing command
    const { stdout, stderr } = await execAsync(command, {
      timeout: timeout,
      maxBuffer: 1024 * 1024 * 10,
      encoding: 'utf8'
    });
    const output = stdout || stderr || '';
    // Command output received
    return { success: true, output };
  } catch (error) {
    // Command error
    return { success: false, output: error.message };
  }
}

// Helper to execute executor commands with proper path handling
async function executeExecutorCommand(args, timeout = 120000) {
  try {
    // Detect OS
    const isWindows = os.platform() === 'win32';

    // Check if wrapper scripts exist
    const bashWrapper = path.join(__dirname, 'executor_wrapper.sh');
    const batWrapper = path.join(__dirname, 'executor_wrapper.bat');

    let command;

    // Prefer wrapper scripts if available (better for VPS/production)
    if (!isWindows && fsSync.existsSync(bashWrapper)) {
      // Linux/VPS: Use bash wrapper
      command = `bash "${bashWrapper}" ${args}`;
      logger.debug(`Using bash wrapper: ${command}`);
    } else if (isWindows && fsSync.existsSync(batWrapper)) {
      // Windows: Use batch wrapper
      command = `"${batWrapper}" ${args}`;
      logger.debug(`Using batch wrapper: ${command}`);
    } else {
      // Fallback: Direct execution (cross-platform)
      const executorPath = EXECUTOR.endsWith('.js') ? EXECUTOR : EXECUTOR;
      const quotedPath = executorPath.includes(' ') ? `"${executorPath}"` : executorPath;
      command = `node ${quotedPath} ${args}`;
      logger.debug(`Direct execution: ${command}`);
    }

    const { stdout, stderr } = await execAsync(command, {
      timeout: timeout,
      maxBuffer: 1024 * 1024 * 10,
      encoding: 'utf8',
      cwd: __dirname // Ensure we're in the right directory
    });

    const output = stdout || stderr || '';
    return { success: true, output };
  } catch (error) {
    logger.error(`Executor command failed: ${error.message}`);
    return { success: false, output: error.message };
  }
}

function escapeMarkdown(text) {
  if (!text) return '';
  return text.toString()
    .replace(/\*/g, '\\*')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/\~/g, '\\~')
    .replace(/\`/g, '\\`')
    .replace(/\>/g, '\\>')
    .replace(/\#/g, '\\#')
    .replace(/\+/g, '\\+')
    .replace(/\-/g, '\\-')
    .replace(/\=/g, '\\=')
    .replace(/\|/g, '\\|')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}')
    .replace(/\./g, '\\.')
    .replace(/\!/g, '\\!');
}

function formatStatus(status) {
  try {
    const jsonMatch = status.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      let msg = `📊 *SYSTEM STATUS*\n━━━━━━━━━━━━━━━━━━━━\n⏰ ${getJakartaTime()} WIB\n\n`;
      if (status.includes('runningProcesses')) {
        const runningMatch = status.match(/runningProcesses[:\s]+(\d+)/i);
        const queuedMatch = status.match(/queuedTasks[:\s]+(\d+)/i);
        const accountsMatch = status.match(/enabledAccounts[:\s]+(\d+)/i);
        const totalMatch = status.match(/totalAccounts[:\s]+(\d+)/i);

        if (runningMatch || queuedMatch) {
          msg += `*🤖 EXECUTOR*\n`;
          if (runningMatch) msg += `├ Running: ${runningMatch[1]}\n`;
          if (queuedMatch) msg += `├ Queued: ${queuedMatch[1]}\n`;
          if (accountsMatch && totalMatch) msg += `└ Accounts: ${accountsMatch[1]}/${totalMatch[1]}\n`;
          msg += '\n';
        }
      }
      if (msg.split('\n').length <= 5) {
        const escaped = status.substring(0, 500).replace(/`/g, '');
        msg += `\`\`\`\n${escaped}\n\`\`\``;
      }
      return msg;
    }

    const data = JSON.parse(jsonMatch[0]);
    let msg = `📊 *STATUS SISTEM*\n━━━━━━━━━━━━━━━━━━━━\n⏰ ${escapeMarkdown(data.timestamp || getJakartaTime())}\n\n`;

    if (data.scheduler) {
      msg += `*⏰ SCHEDULER*\n├ Jobs: ${data.scheduler.scheduledJobs || 0}\n├ Active: ${data.scheduler.activeSchedules || 0}\n├ Paused: ${data.scheduler.pausedSchedules || 0}\n└ Missed: ${data.scheduler.missedSchedules || 0}\n\n`;
    }

    if (data.executor || data.runningProcesses !== undefined) {
      const exec = data.executor || data;
      msg += `*🤖 EXECUTOR*\n├ Running: ${exec.runningProcesses || 0}\n├ Queued: ${exec.queuedTasks || 0}\n`;
      if (exec.enabledAccounts !== undefined && exec.totalAccounts !== undefined) {
        msg += `├ Accounts: ${exec.enabledAccounts}/${exec.totalAccounts}\n`;
      }
      if (exec.lockedAccounts !== undefined) msg += `└ Locked: ${exec.lockedAccounts}\n`;
      msg += '\n';

      if (exec.running && exec.running.length > 0) {
        msg += `*🏃 RUNNING TASKS*\n`;
        exec.running.slice(0, 5).forEach(task => {
          const taskName = escapeMarkdown(task.task || 'Unknown');
          msg += `├ ${taskName} (${task.runtime || 0}s)\n`;
        });
        msg += '\n';
      }
    }

    if (data.cookies || (data.executor && data.executor.cookies)) {
      const c = data.cookies || data.executor.cookies;
      msg += `*🍪 COOKIES*\n├ Valid: ${c.valid || 0}/${c.total || 0} ✅\n`;
      if (c.factuallyVerified !== undefined) msg += `├ Verified: ${c.factuallyVerified} 🔒\n`;
      msg += `├ Expired: ${c.expired || 0} ❌\n`;
      if (c.canRefresh !== undefined) msg += `└ Can Refresh: ${c.canRefresh} 🔄\n`;
    }

    return msg;
  } catch (error) {
    // Status format error
    const escaped = status.substring(0, 300).replace(/`/g, '');
    return `⚠️ *STATUS (Partial)*\n━━━━━━━━━━━━━━━━━━━━\n⏰ ${getJakartaTime()} WIB\n\nℹ️ Status data available but format issue\n\nError: ${escapeMarkdown(error.message)}\n\nRaw output:\n\`\`\`\n${escaped}\n\`\`\``;
  }
}

function formatAccountList(output) {
  try {
    let msg = `📋 *ACCOUNTS LIST*\n━━━━━━━━━━━━━━━━━━━━\n⏰ ${getJakartaTime()} WIB\n\n`;
    const lines = output.split('\n');
    let inSummary = false;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      if (trimmed.includes('===') || trimmed.startsWith('[')) continue;

      if (trimmed.includes('Summary')) {
        inSummary = true;
        msg += `\n*📊 SUMMARY*\n`;
        continue;
      }

      if (trimmed.includes('📱')) {
        const parts = trimmed.split('📱');
        msg += '📱' + escapeMarkdown(parts[1] || parts[0]) + '\n';
      } else if (inSummary && trimmed.includes(':')) {
        msg += escapeMarkdown(trimmed) + '\n';
      } else if (trimmed.startsWith('├') || trimmed.startsWith('└') || trimmed.startsWith('│')) {
        const symbol = trimmed.substring(0, 1);
        const content = trimmed.substring(1).trim();
        msg += symbol + ' ' + escapeMarkdown(content) + '\n';
      } else {
        msg += escapeMarkdown(trimmed) + '\n';
      }
    }

    return msg;
  } catch (error) {
    logger.error('[BOT] formatAccountList error:', error);
    const escaped = escapeMarkdown(output.substring(0, 3000));
    return `📋 *ACCOUNTS LIST*\n━━━━━━━━━━━━━━━━━━━━\n\n\`\`\`\n${escaped}\n\`\`\``;
  }
}

async function getAccounts() {
  try {
    const dirs = await fs.readdir(ACCOUNTS_DIR);
    const accounts = [];

    for (const dir of dirs) {
      const accountPath = path.join(ACCOUNTS_DIR, dir);
      const stat = await fs.stat(accountPath);

      if (stat.isDirectory()) {
        try {
          const configPath = path.join(accountPath, 'config.json');
          const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
          accounts.push({ id: dir, name: config.name || dir, enabled: config.enabled !== false });
        } catch (e) {
          accounts.push({ id: dir, name: dir, enabled: false });
        }
      }
    }
    return accounts;
  } catch (error) {
    // Accounts error
    return [];
  }
}

// ========================================
// KEYBOARD MENUS
// ========================================

function getMainMenu() {
  return {
    reply_markup: {
      keyboard: [
        [{ text: '📊 Status' }, { text: '🤖 Run Bot' }],
        [{ text: '📋 List Accounts' }, { text: '🍪 Cookie Status' }],
        [{ text: '📈 Concurrency' }, { text: '⏰ Scheduler' }],
        [{ text: '🍪 Generate Cookies' }, { text: '🔒 Locks' }],
        [{ text: '💻 VPS Info' }, { text: '🛑 Stop All' }],
        [{ text: '🔧 Tools' }, { text: '❓ Help' }]
      ],
      resize_keyboard: true
    }
  };
}

function getSettingsMenu() {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '➕ Add Account', callback_data: 'settings_add_account' },
          { text: '💻 CMD Access', callback_data: 'settings_cmd' }
        ],
        [
          { text: '📝 View Logs', callback_data: 'settings_logs' },
          { text: '🗑️ Cleanup', callback_data: 'settings_cleanup' }
        ],
        [
          { text: '🔔 Notifications', callback_data: 'settings_notify' }
        ],
        [
          { text: '🔙 Back', callback_data: 'back_main' }
        ]
      ]
    }
  };
}

function getBotMenu() {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '✏️ Update Status', callback_data: 'bot_updatestatus' },
          { text: '💬 Reply Comments', callback_data: 'bot_reply' }
        ],
        [
          { text: '🎬 Upload Reels', callback_data: 'bot_uploadreels' },
          { text: '🎥 Comment Videos', callback_data: 'bot_videocomment' }
        ],
        [
          { text: '👥 Comment Groups', callback_data: 'bot_groupcomment' },
          { text: '👤 Comment Timeline', callback_data: 'bot_timelinecomment' }
        ],
        [
          { text: '🔄 Share Reels', callback_data: 'bot_sharereels' },
          { text: '🔥 Scrape Reels', callback_data: 'bot_scrape' }
        ],
        [
          { text: '✅ Confirm Friends', callback_data: 'bot_confirm' }
        ],
        [
          { text: '🔙 Back', callback_data: 'back_main' }
        ]
      ]
    }
  };
}

async function getAccountMenu(action = null) {
  try {
    const accounts = await getAccounts();
    const keyboard = [];

    for (let i = 0; i < accounts.length; i += 2) {
      const row = [];
      const callbackPrefix = action || 'account';
      row.push({ text: `👤 ${accounts[i].id}`, callback_data: `${callbackPrefix}_${accounts[i].id}` });
      if (i + 1 < accounts.length) {
        row.push({ text: `👤 ${accounts[i + 1].id}`, callback_data: `${callbackPrefix}_${accounts[i + 1].id}` });
      }
      keyboard.push(row);
    }

    if (action && action.startsWith('run_')) {
      keyboard.push([{ text: '🔄 All Accounts', callback_data: `${action}_all` }]);
    }
    keyboard.push([{ text: '🔙 Back', callback_data: 'back_main' }]);

    return { reply_markup: { inline_keyboard: keyboard } };
  } catch (error) {
    return { reply_markup: { inline_keyboard: [[{ text: '🔙 Back', callback_data: 'back_main' }]] } };
  }
}

function getSchedulerMenu() {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '▶️ Start', callback_data: 'scheduler_start' },
          { text: '⏸️ Stop', callback_data: 'scheduler_stop' }
        ],
        [
          { text: '📊 Status', callback_data: 'scheduler_status' },
          { text: '🔄 Restart', callback_data: 'scheduler_restart' }
        ],
        [
          { text: '🔙 Back', callback_data: 'back_main' }
        ]
      ]
    }
  };
}

function getToolsMenu() {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '🍪 Cookie Generator', callback_data: 'tool_cookiegenerator' },
          { text: '➕ Account Setup', callback_data: 'tool_accountsetup' }
        ],
        [
          { text: '🔧 Maintenance', callback_data: 'tool_maintenance' },
          { text: '🔗 CTA Manager', callback_data: 'tool_ctamanager' }
        ],
        [
          { text: '🔙 Back', callback_data: 'back_main' }
        ]
      ]
    }
  };
}

function getMaintenanceMenu() {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '🍪 Check Cookies', callback_data: 'maint_check_cookies' },
          { text: '🔄 Refresh All', callback_data: 'maint_refresh_all' }
        ],
        [
          { text: '🧹 Cleanup Logs', callback_data: 'maint_cleanup_logs' },
          { text: '🗂️ Cleanup Temp', callback_data: 'maint_cleanup_temp' }
        ],
        [
          { text: '📊 Daily Report', callback_data: 'maint_daily_report' }
        ],
        [
          { text: '🔙 Back', callback_data: 'back_tools' }
        ]
      ]
    }
  };
}

// ========================================
// COMMAND HANDLERS
// ========================================

bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  if (!isAuthorized(userId)) return bot.sendMessage(chatId, '❌ Unauthorized access!');

  const welcomeMsg = `🚀 *FACEBOOKPRO BLASTER*
━━━━━━━━━━━━━━━━━━━━

Selamat datang di control panel!

✨ *AUTOMATION BOTS (9):*
├ ✏️ Update Status
├ 💬 Reply Comments
├ 🎬 Upload Reels
├ 🎥 Comment Videos
├ 👥 Comment Groups
├ 👤 Comment Timeline
├ 🔄 Share Reels
├ 🔥 Scrape Reels
└ ✅ Confirm Friends

🔧 *TOOLS:*
├ 🍪 Cookie Generator
├ ➕ Account Setup
├ 🔧 Maintenance
└ 🔗 CTA Manager

⚙️ *FEATURES:*
├ 📊 Real-time Status
├ 🍪 Cookie Management
├ ⏰ Smart Scheduler
├ 💻 VPS Monitoring
├ 🔒 Lock System
├ 💻 CMD Access
└ 🔔 Unified Notifications

⏰ *Time:* ${getJakartaTime()} WIB
🔔 *Status:* ✅ Active

Gunakan menu di bawah untuk memulai 👇`;

  bot.sendMessage(chatId, welcomeMsg, { parse_mode: 'Markdown', ...getMainMenu() });
});

bot.onText(/📊 Status/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  if (!isAuthorized(userId)) return;

  const loadingMsg = await bot.sendMessage(chatId, '⏳ Loading status...');
  try {
    const result = await executeExecutorCommand('status');
    if (result.success && result.output) {
      const statusMsg = formatStatus(result.output);
      await bot.editMessageText(statusMsg, { chat_id: chatId, message_id: loadingMsg.message_id, parse_mode: 'Markdown' });
    } else {
      await bot.editMessageText(`❌ Error: ${result.output || 'No output'}`, { chat_id: chatId, message_id: loadingMsg.message_id });
    }
  } catch (error) {
    // Status error
    await bot.editMessageText(`❌ Error: ${error.message}`, { chat_id: chatId, message_id: loadingMsg.message_id });
  }
});

bot.onText(/🤖 Run Bot/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  if (!isAuthorized(userId)) return;
  bot.sendMessage(chatId, '🤖 *SELECT BOT TO RUN*', { parse_mode: 'Markdown', ...getBotMenu() });
});

bot.onText(/📋 List Accounts/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  if (!isAuthorized(userId)) return;

  const loadingMsg = await bot.sendMessage(chatId, '⏳ Loading accounts...');
  try {
    const result = await executeExecutorCommand('list');

    if (result.success && result.output && result.output.trim()) {
      let accountMsg = formatAccountList(result.output);

      // Telegram message limit is 4096 characters
      const MAX_LENGTH = 4000;

      if (accountMsg.length > MAX_LENGTH) {
        accountMsg = accountMsg.substring(0, MAX_LENGTH - 100) + '\n\n...\n\n⚠️ _List truncated. Use /cmd for full output._';
      }

      try {
        await bot.editMessageText(accountMsg, {
          chat_id: chatId,
          message_id: loadingMsg.message_id,
          parse_mode: 'Markdown'
        });
      } catch (markdownError) {
        let plainMsg = `📋 ACCOUNTS LIST\n━━━━━━━━━━━━━━━━━━━━\n⏰ ${getJakartaTime()} WIB\n\n${result.output}`;

        if (plainMsg.length > MAX_LENGTH) {
          plainMsg = plainMsg.substring(0, MAX_LENGTH - 50) + '\n\n... (truncated)';
        }

        await bot.editMessageText(plainMsg, {
          chat_id: chatId,
          message_id: loadingMsg.message_id
        });
      }
    } else {
      await bot.editMessageText(`❌ No accounts found:\n${result.output || 'No output'}`, {
        chat_id: chatId,
        message_id: loadingMsg.message_id
      });
    }
  } catch (error) {
    await bot.editMessageText(`❌ Error: ${error.message}`, {
      chat_id: chatId,
      message_id: loadingMsg.message_id
    });
  }
});

bot.onText(/🔒 Locks/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  if (!isAuthorized(userId)) return;

  const loadingMsg = await bot.sendMessage(chatId, '⏳ Checking locks...');
  try {
    const result = await executeExecutorCommand('locks');

    let msg = `🔒 *ACTIVE LOCKS*\n━━━━━━━━━━━━━━━━━━━━\n⏰ ${getJakartaTime()} WIB\n\n`;

    if (result.output.includes('No active locks')) {
      msg += `✅ No active locks\n\nAll accounts are free to run.`;
    } else {
      msg += `\`\`\`\n${result.output}\n\`\`\`\n\n`;
      msg += `*Commands:*\n`;
      msg += `\`/cmd node bot/executor locks <account>\`\n`;
      msg += `\`/cmd node bot/executor  unlock <account>\``;
    }

    await bot.editMessageText(msg, {
      chat_id: chatId,
      message_id: loadingMsg.message_id,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '🔄 Refresh', callback_data: 'locks_refresh' },
            { text: '🔓 Unlock All', callback_data: 'locks_unlock_all' }
          ],
          [
            { text: '🔙 Back', callback_data: 'back_main' }
          ]
        ]
      }
    });
  } catch (error) {
    await bot.editMessageText(`❌ Error: ${error.message}`, {
      chat_id: chatId,
      message_id: loadingMsg.message_id
    });
  }
});

bot.onText(/🍪 Cookie Status/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  if (!isAuthorized(userId)) return;

  const loadingMsg = await bot.sendMessage(chatId, '⏳ Validating cookies...');
  try {
    const result = await executeExecutorCommand('validate-cookies');
    if (result.success && result.output) {
      let msg = `🍪 *COOKIE VALIDATION*\n━━━━━━━━━━━━━━━━━━━━\n⏰ ${getJakartaTime()} WIB\n\n`;
      const lines = result.output.split('\n').filter(l => l.trim() && l.includes(':'));
      lines.forEach(line => {
        if (line.includes('VALID')) msg += `✅ ${line}\n`;
        else if (line.includes('INVALID')) msg += `❌ ${line}\n`;
        else msg += `${line}\n`;
      });
      await bot.editMessageText(msg, { chat_id: chatId, message_id: loadingMsg.message_id, parse_mode: 'Markdown' });
    } else {
      await bot.editMessageText(`❌ Error: ${result.output || 'No output'}`, { chat_id: chatId, message_id: loadingMsg.message_id });
    }
  } catch (error) {
    await bot.editMessageText(`❌ Error: ${error.message}`, { chat_id: chatId, message_id: loadingMsg.message_id });
  }
});

bot.onText(/🍪 Generate Cookies/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  if (!isAuthorized(userId)) return;
  bot.sendMessage(chatId, '🍪 *GENERATE COOKIES*\n\nSelect account:', { parse_mode: 'Markdown', ...await getAccountMenu('generate-cookie') });
});

bot.onText(/⏰ Scheduler/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  if (!isAuthorized(userId)) return;
  bot.sendMessage(chatId, '⏰ *SMART SCHEDULER*', { parse_mode: 'Markdown', ...getSchedulerMenu() });
});

// 📈 Concurrency Monitor - NEW!
bot.onText(/📈 Concurrency/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  if (!isAuthorized(userId)) return;

  const loadingMsg = await bot.sendMessage(chatId, '⏳ Mengambil data concurrency...');

  try {
    // Get detailed status from executor
    const result = await executeExecutorCommand('status');

    if (result.success && result.output) {
      const output = result.output;

      // Extract concurrency metrics
      const runningMatch = output.match(/Running Processes:\s*(\d+)/);
      const queuedMatch = output.match(/Queued Tasks:\s*(\d+)/);
      const accountsMatch = output.match(/Enabled Accounts:\s*(\d+)/);

      const running = runningMatch ? parseInt(runningMatch[1]) : 0;
      const queued = queuedMatch ? parseInt(queuedMatch[1]) : 0;
      const accounts = accountsMatch ? parseInt(accountsMatch[1]) : 0;

      // Check for enhanced features
      const hasQueueStats = output.includes('queueStats') || output.includes('byPriority');
      const hasRotationStats = output.includes('rotationStats') || output.includes('fairness');

      let msg = `📈 *STATUS CONCURRENCY*\n━━━━━━━━━━━━━━━━━━━━\n⏰ ${getJakartaTime()} WIB\n\n`;

      // Concurrency Overview
      const maxConcurrent = process.env.MAX_CONCURRENT_GLOBAL || 3;
      const percentage = Math.round((running / maxConcurrent) * 100);
      const bars = Math.floor(percentage / 10);
      const progressBar = '█'.repeat(bars) + '░'.repeat(10 - bars);

      msg += `*⚡ CONCURRENCY*\n`;
      msg += `├ Berjalan: ${running}/${maxConcurrent} (${percentage}%)\n`;
      msg += `├ Progress: ${progressBar}\n`;
      msg += `├ Antrian: ${queued} task\n`;
      msg += `└ Status: ${running >= maxConcurrent ? '🔴 PENUH' : '🟢 Tersedia'}\n\n`;

      // Queue Distribution
      if (hasQueueStats) {
        const highMatch = output.match(/high[:\s]+(\d+)/i);
        const normalMatch = output.match(/normal[:\s]+(\d+)/i);
        const lowMatch = output.match(/low[:\s]+(\d+)/i);

        if (highMatch || normalMatch || lowMatch) {
          msg += `*📊 DISTRIBUSI ANTRIAN*\n`;
          if (highMatch && parseInt(highMatch[1]) > 0) msg += `├ HIGH: ${highMatch[1]} task\n`;
          if (normalMatch && parseInt(normalMatch[1]) > 0) msg += `├ NORMAL: ${normalMatch[1]} task\n`;
          if (lowMatch && parseInt(lowMatch[1]) > 0) msg += `└ LOW: ${lowMatch[1]} task\n`;
          msg += `\n`;
        }
      }

      // Account Info
      msg += `*👥 INFO AKUN*\n`;
      msg += `├ Total: ${accounts} akun\n`;

      // Fairness Score
      if (hasRotationStats) {
        const fairnessMatch = output.match(/fairness(?:Score)?[:\s]+(\d+)/i);
        if (fairnessMatch) {
          const score = parseInt(fairnessMatch[1]);
          let scoreIndicator = '⭐';
          if (score >= 90) scoreIndicator = '⭐⭐⭐';
          else if (score >= 80) scoreIndicator = '⭐⭐';
          else if (score >= 60) scoreIndicator = '⭐';
          else scoreIndicator = '⚠️';

          msg += `├ Fairness: ${score}% ${scoreIndicator}\n`;
        }

        const readyMatch = output.match(/ready(?:Accounts)?[:\s]+(\d+)/i);
        if (readyMatch) {
          msg += `├ Siap: ${readyMatch[1]} akun\n`;
        }
      }
      msg += `└ Rotasi: ${hasRotationStats ? '✅ Aktif' : '⚠️ Nonaktif'}\n\n`;

      // System Features
      msg += `*🎯 FITUR SISTEM*\n`;
      msg += `├ Enhanced Queue: ${hasQueueStats ? '✅ ON' : '⚠️ OFF'}\n`;
      msg += `├ Rotasi Akun: ${hasRotationStats ? '✅ ON' : '⚠️ OFF'}\n`;
      msg += `├ Priority System: ${hasQueueStats ? '✅ ON' : '⚠️ OFF'}\n`;
      msg += `└ Fair Distribution: ${hasRotationStats ? '✅ ON' : '⚠️ OFF'}\n\n`;

      // Quick Stats
      if (running > 0 || queued > 0) {
        msg += `*📌 STATISTIK CEPAT*\n`;
        if (queued > 0 && running > 0) {
          const avgWait = Math.round((queued / running) * 2);
          msg += `├ Est. Tunggu: ~${avgWait} menit\n`;
        }
        const throughput = running > 0 ? Math.round(60 / running) : 0;
        msg += `├ Task/Jam: ~${throughput}\n`;
        msg += `└ Utilisasi: ${percentage}%\n\n`;
      }

      msg += `💡 _Gunakan /cmd node bot/concurrency-monitor.js untuk dashboard real-time_`;

      await bot.editMessageText(msg, {
        chat_id: chatId,
        message_id: loadingMsg.message_id,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '🔄 Refresh', callback_data: 'refresh_concurrency' },
              { text: '📊 Detail', callback_data: 'concurrency_detail' }
            ],
            [
              { text: '🔙 Kembali', callback_data: 'back_main' }
            ]
          ]
        }
      });
    } else {
      await bot.editMessageText(`❌ Error: ${result.output}`, { chat_id: chatId, message_id: loadingMsg.message_id });
    }
  } catch (error) {
    await bot.editMessageText(`❌ Error: ${error.message}`, { chat_id: chatId, message_id: loadingMsg.message_id });
  }
});

bot.onText(/🛑 Stop All/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  if (!isAuthorized(userId)) return;
  bot.sendMessage(chatId, '⚠️ *STOP ALL PROCESSES*\n\nAre you sure?', {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [[
        { text: '✅ Yes, Stop All', callback_data: 'confirm_stop_all' },
        { text: '❌ Cancel', callback_data: 'back_main' }
      ]]
    }
  });
});

bot.onText(/💻 VPS Info/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  if (!isAuthorized(userId)) return;

  const loadingMsg = await bot.sendMessage(chatId, '⏳ Getting VPS info...');
  try {
    const cpuUsage = os.loadavg()[0].toFixed(2);
    const totalMem = (os.totalmem() / 1024 / 1024 / 1024).toFixed(2);
    const freeMem = (os.freemem() / 1024 / 1024 / 1024).toFixed(2);
    const usedMem = (totalMem - freeMem).toFixed(2);
    const memPercent = ((usedMem / totalMem) * 100).toFixed(1);
    const uptime = os.uptime();
    const days = Math.floor(uptime / 86400);
    const hours = Math.floor((uptime % 86400) / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const diskResult = await executeCommand('df -h / | tail -1');
    const diskInfo = diskResult.output.split(/\s+/);

    let msg = `💻 *VPS INFORMATION*\n━━━━━━━━━━━━━━━━━━━━\n⏰ ${getJakartaTime()} WIB\n\n`;
    msg += `*🖥 SYSTEM*\n├ OS: ${os.type()} ${os.release()}\n├ Arch: ${os.arch()}\n├ Hostname: ${os.hostname()}\n└ Uptime: ${days}d ${hours}h ${minutes}m\n\n`;
    msg += `*💻 CPU*\n├ Load: ${cpuUsage}%\n└ Cores: ${os.cpus().length}\n\n`;
    msg += `*🧠 MEMORY*\n├ Total: ${totalMem} GB\n├ Used: ${usedMem} GB\n├ Free: ${freeMem} GB\n└ Usage: ${memPercent}%\n\n`;
    if (diskInfo.length >= 5) {
      msg += `*💾 DISK*\n├ Total: ${diskInfo[1]}\n├ Used: ${diskInfo[2]}\n├ Free: ${diskInfo[3]}\n└ Usage: ${diskInfo[4]}\n`;
    }

    await bot.editMessageText(msg, { chat_id: chatId, message_id: loadingMsg.message_id, parse_mode: 'Markdown' });
  } catch (error) {
    await bot.editMessageText(`❌ Error: ${error.message}`, { chat_id: chatId, message_id: loadingMsg.message_id });
  }
});

bot.onText(/🔧 Tools/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  if (!isAuthorized(userId)) return;
  bot.sendMessage(chatId, '🔧 *TOOLS & UTILITIES*', { parse_mode: 'Markdown', ...getToolsMenu() });
});

bot.onText(/⚙️ Settings/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  if (!isAuthorized(userId)) return;
  bot.sendMessage(chatId, '⚙️ *SETTINGS*', { parse_mode: 'Markdown', ...getSettingsMenu() });
});

bot.onText(/❓ Help/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  if (!isAuthorized(userId)) return;

  const helpMsg = `❓ *HELP & COMMANDS*\n━━━━━━━━━━━━━━━━━━━━\n\n*🎯 MAIN FEATURES:*\n\n*📊 Status* - View real-time system status\n*🤖 Run Bot* - Execute automation bots\n*📋 List Accounts* - Show all accounts\n*🍪 Cookie Status* - Validate cookies\n*🔄 Refresh Cookies* - Refresh account cookies\n*⏰ Scheduler* - Manage scheduler\n*🔒 Locks* - View and manage locks\n*🛑 Stop All* - Stop all processes\n*💻 VPS Info* - Monitor server\n*🔧 Maintenance* - Maintenance tools\n\n*⚙️ Settings:*\n├ ➕ Add Account\n├ 💻 CMD Access\n├ 📝 View Logs\n├ 🗑️ Cleanup\n└ 🔔 Notifications\n\n*🔒LOCK SYSTEM:*\n✅ Prevents multiple bots running simultaneously\n✅ 5 second grace period between runs\n✅ Auto cleanup after 1 hour\n✅ Force unlock capability\n\n*🔔 UNIFIED NOTIFICATIONS:*\nBot menggunakan token yang sama dengan sistem notifikasi!\nSemua notifikasi dari executor akan muncul di chat ini.\n\n*💻 CMD ACCESS:*\n\`/cmd <command>\` - Execute commands\n\n*➕ ADD ACCOUNT:*\n\`/addaccount <id>\` - Create new account\n\n*📝 VIEW LOGS:*\n\`/viewlog <filename>\` - View specific log\n\n⏰ ${getJakartaTime()} WIB`;

  bot.sendMessage(chatId, helpMsg, { parse_mode: 'Markdown', ...getMainMenu() });
});

bot.onText(/\/cmd (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const command = match[1];
  if (!isAuthorized(userId)) return bot.sendMessage(chatId, '❌ Unauthorized access!');

  const loadingMsg = await bot.sendMessage(chatId, `💻 Executing command...\n\n\`${command}\``, { parse_mode: 'Markdown' });
  try {
    const result = await executeCommand(command, 60000);
    let msg = `💻 *COMMAND EXECUTION*\n━━━━━━━━━━━━━━━━━━━━\n\nCommand: \`${command}\`\nStatus: ${result.success ? '✅ Success' : '❌ Failed'}\n\nOutput:\n\`\`\`\n${result.output.substring(0, 3000)}\n\`\`\``;
    await bot.editMessageText(msg, { chat_id: chatId, message_id: loadingMsg.message_id, parse_mode: 'Markdown' });
  } catch (error) {
    await bot.editMessageText(`❌ Error: ${error.message}`, { chat_id: chatId, message_id: loadingMsg.message_id });
  }
});

bot.onText(/\/addaccount (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const accountId = match[1];
  if (!isAuthorized(userId)) return bot.sendMessage(chatId, '❌ Unauthorized access!');

  const sessionId = `add_account_${Date.now()}`;
  commandSessions.set(sessionId, { userId, chatId, accountId, step: 'confirm', data: {} });

  bot.sendMessage(chatId, `➕ *ADD NEW ACCOUNT*\n━━━━━━━━━━━━━━━━━━━━\n\nAccount ID: \`${accountId}\`\n\nThis will create a new account with default configuration.\n\nContinue?`, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [[
        { text: '✅ Yes', callback_data: `addacc_confirm_${sessionId}` },
        { text: '❌ Cancel', callback_data: `addacc_cancel_${sessionId}` }
      ]]
    }
  });
});

bot.onText(/\/viewlog (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const filename = match[1];
  if (!isAuthorized(userId)) return bot.sendMessage(chatId, '❌ Unauthorized access!');

  const logPath = path.join(__dirname, '../logs', filename);
  try {
    const result = await executeCommand(`tail -100 ${logPath}`);
    if (result.success) {
      const msg = `📝 *LOG: ${filename}*\n━━━━━━━━━━━━━━━━━━━━\n\n\`\`\`\n${result.output.substring(0, 3000)}\n\`\`\``;
      bot.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
    } else {
      bot.sendMessage(chatId, `❌ Error reading log: ${result.output}`);
    }
  } catch (error) {
    bot.sendMessage(chatId, `❌ Error: ${error.message}`);
  }
});

// ========================================
// CALLBACK QUERY HANDLERS
// ========================================

bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  const userId = query.from.id;
  const data = query.data;

  if (!isAuthorized(userId)) return bot.answerCallbackQuery(query.id, { text: '❌ Unauthorized!' });

  // Bot selection
  if (data.startsWith('bot_')) {
    const botName = data.replace('bot_', '');
    bot.editMessageText(`🤖 *${botName.toUpperCase()}*\n\nSelect account:`, {
      chat_id: chatId, message_id: messageId, parse_mode: 'Markdown', ...await getAccountMenu(`run_${botName}`)
    });
    bot.answerCallbackQuery(query.id);
    return;
  }

  // Run bot
  if (data.startsWith('run_')) {
    const remaining = data.substring(4); // Remove 'run_' prefix

    // List of valid bot names (with underscores)
    const validBotNames = [
      'reply',
      'confirm',
      'updatestatus',
      'sharereels',
      'uploadreels',
      'videocomment',
      'groupcomment',
      'timelinecomment',
      'scrape'
    ];

    let botName = null;
    let accountId = null;

    // Try to match with valid bot names first
    for (const validName of validBotNames) {
      if (remaining.startsWith(validName + '_')) {
        botName = validName;
        accountId = remaining.substring(validName.length + 1); // +1 for the underscore
        break;
      } else if (remaining === validName) {
        botName = validName;
        accountId = 'all'; // No account specified
        break;
      }
    }

    // Fallback: if no valid bot name found, use last underscore method
    if (!botName) {
      const lastUnderscoreIndex = remaining.lastIndexOf('_');
      if (lastUnderscoreIndex === -1) {
        botName = remaining;
        accountId = 'unknown';
      } else {
        botName = remaining.substring(0, lastUnderscoreIndex);
        accountId = remaining.substring(lastUnderscoreIndex + 1);
      }
    }

    // Run bot parsed

    bot.answerCallbackQuery(query.id, { text: '⏳ Starting...' });

    let command;
    if (accountId === 'all') {
      command = `${EXECUTOR_SCRIPT} run ${botName}`;
      bot.editMessageText(`🚀 Running *${botName}* for ALL accounts...\n\n⏳ Please wait...`, { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown' });
    } else {
      command = `${EXECUTOR_SCRIPT} run ${botName} ${accountId}`;
      bot.editMessageText(`🚀 Running *${botName}* for *${accountId}*...\n\n⏳ Please wait...`, { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown' });
    }

    // Executing command

    const result = await executeCommand(command);
    let msg = `📊 *EXECUTION RESULT*\n━━━━━━━━━━━━━━━━━━━━\n\nBot: ${escapeMarkdown(botName)}\nAccount: ${escapeMarkdown(accountId)}\nStatus: ${result.success ? '✅ Queued' : '❌ Failed'}\n\n`;
    msg += result.success ? `✅ Task has been added to queue.\nNotifications will be sent automatically when the bot completes.` : `❌ Error: ${escapeMarkdown(result.output.substring(0, 300))}`;

    bot.editMessageText(msg, { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '🔙 Back', callback_data: 'back_main' }]] } });
    return;
  }

  // Refresh cookies
  if (data.startsWith('refresh-cookie_')) {
    const accountId = data.replace('refresh-cookie_', '');
    bot.answerCallbackQuery(query.id, { text: '⏳ Refreshing...' });

    bot.editMessageText(`🔄 Refreshing cookies for *${accountId}*...\n\n⏳ Please wait...`, { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown' });
    const result = await executeExecutorCommand(`generate ${accountId}`, 180000);

    let msg = `🍪 *COOKIE REFRESH*\n━━━━━━━━━━━━━━━━━━━━\n\nAccount: ${accountId}\nStatus: ${result.success && result.output.includes('OK') ? '✅ Success' : '❌ Failed'}\n\n`;
    msg += result.success ? `✅ Cookies refreshed successfully!\nNotification sent automatically.` : `❌ Error: ${result.output.substring(0, 200)}`;

    bot.editMessageText(msg, { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '🔙 Back', callback_data: 'back_main' }]] } });
    return;
  }

  // Generate cookies
  if (data.startsWith('generate-cookie_')) {
    const accountId = data.replace('generate-cookie_', '');
    bot.answerCallbackQuery(query.id, { text: '⏳ Generating...' });

    bot.editMessageText(`🍪 Generating cookies for *${accountId}*...\n\n⏳ Please wait...`, { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown' });
    const result = await executeExecutorCommand(`generate ${accountId}`, 180000);

    let msg = `🍪 *COOKIE GENERATION*\n━━━━━━━━━━━━━━━━━━━━\n\nAccount: ${accountId}\nStatus: ${result.success && !result.output.includes('Failed') ? '✅ Success' : '❌ Failed'}\n\n`;
    msg += result.success && !result.output.includes('Failed') ? `✅ Cookies generated successfully!\nNotification sent automatically.` : `❌ Error: ${result.output.substring(0, 200)}`;

    bot.editMessageText(msg, { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '🔙 Back', callback_data: 'back_main' }]] } });
    return;
  }

  // Locks refresh
  if (data === 'locks_refresh') {
    bot.answerCallbackQuery(query.id, { text: '⏳ Refreshing...' });

    try {
      const result = await executeCommand(`${EXECUTOR.endsWith('.js') ? `node ${EXECUTOR}` : EXECUTOR} locks`);

      let msg = `🔒 *ACTIVE LOCKS*\n━━━━━━━━━━━━━━━━━━━━\n⏰ ${getJakartaTime()} WIB\n\n`;

      if (result.output.includes('No active locks')) {
        msg += `✅ No active locks\n\nAll accounts are free to run.`;
      } else {
        msg += `\`\`\`\n${result.output}\n\`\`\`\n\n`;
        msg += `*Commands:*\n\`/cmd node bot/executor unlock <account>\``;
      }

      await bot.editMessageText(msg, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '🔄 Refresh', callback_data: 'locks_refresh' },
              { text: '🔓 Unlock All', callback_data: 'locks_unlock_all' }
            ],
            [
              { text: '🔙 Back', callback_data: 'back_main' }
            ]
          ]
        }
      });
    } catch (error) {
      await bot.editMessageText(`❌ Error: ${error.message}`, {
        chat_id: chatId,
        message_id: messageId
      });
    }
    return;
  }

  // Locks unlock all
  if (data === 'locks_unlock_all') {
    bot.answerCallbackQuery(query.id);

    try {
      await bot.editMessageText(`⚠️ *UNLOCK ALL LOCKS*\n\nAre you sure you want to unlock all accounts?\n\nThis will force release all locks.`, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '✅ Yes, Unlock All', callback_data: 'confirm_unlock_all_locks' },
              { text: '❌ Cancel', callback_data: 'locks_refresh' }
            ]
          ]
        }
      });
    } catch (error) {
      await bot.editMessageText(`❌ Error: ${error.message}`, {
        chat_id: chatId,
        message_id: messageId
      });
    }
    return;
  }

  // Confirm unlock all locks
  if (data === 'confirm_unlock_all_locks') {
    bot.answerCallbackQuery(query.id, { text: '⏳ Unlocking...' });

    try {
      await bot.editMessageText(`🔓 Unlocking all accounts...\n\n⏳ Please wait...`, {
        chat_id: chatId,
        message_id: messageId
      });

      const accounts = await getAccounts();
      let unlockedCount = 0;

      for (const account of accounts) {
        const result = await executeCommand(`${EXECUTOR.endsWith('.js') ? `node ${EXECUTOR}` : EXECUTOR} unlock ${account.id}`);
        if (result.success && result.output.includes('Unlocked')) {
          const match = result.output.match(/Unlocked (\d+)/);
          if (match) {
            unlockedCount += parseInt(match[1]);
          }
        }
      }

      let msg = `🔓 *UNLOCK COMPLETED*\n━━━━━━━━━━━━━━━━━━━━\n\n`;
      msg += `✅ Unlocked ${unlockedCount} lock(s)\n\n`;
      msg += `All accounts are now free to run.`;

      await bot.editMessageText(msg, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '🔄 Check Locks', callback_data: 'locks_refresh' },
              { text: '🔙 Back', callback_data: 'back_main' }
            ]
          ]
        }
      });
    } catch (error) {
      await bot.editMessageText(`❌ Error: ${error.message}`, {
        chat_id: chatId,
        message_id: messageId
      });
    }
    return;
  }

  // Scheduler commands
  if (data.startsWith('scheduler_')) {
    const action = data.replace('scheduler_', '');
    bot.answerCallbackQuery(query.id, { text: '⏳ Processing...' });

    if (action === 'start') {
      const checkPm2 = await executeCommand('pm2 list | grep fbpro-scheduler');
      if (checkPm2.output.includes('online')) {
        bot.editMessageText(`⏰ *SCHEDULER*\n\n✅ Scheduler is already running!`, { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown', ...getSchedulerMenu() });
        return;
      }
      const result = await executeCommand(`pm2 start ${path.join(__dirname, 'ecosystem.config.js')}`);
      let msg = `⏰ *SCHEDULER STARTED*\n━━━━━━━━━━━━━━━━━━━━\n\n${result.success ? '✅ Scheduler started successfully!' : `❌ Error: ${result.output}`}`;
      bot.editMessageText(msg, { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown', ...getSchedulerMenu() });
    } else if (action === 'stop') {
      const result = await executeCommand('pm2 stop fbpro-scheduler');
      let msg = `⏰ *SCHEDULER STOPPED*\n━━━━━━━━━━━━━━━━━━━━\n\n${result.success ? '✅ Scheduler stopped successfully!' : `❌ Error: ${result.output}`}`;
      bot.editMessageText(msg, { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown', ...getSchedulerMenu() });
    } else if (action === 'restart') {
      const result = await executeCommand('pm2 restart fbpro-scheduler');
      let msg = `⏰ *SCHEDULER RESTARTED*\n━━━━━━━━━━━━━━━━━━━━\n\n${result.success ? '✅ Scheduler restarted!' : `❌ Error: ${result.output}`}`;
      bot.editMessageText(msg, { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown', ...getSchedulerMenu() });
    } else if (action === 'status') {
      const result = await executeCommand(`node ${SCHEDULER_SCRIPT} status`);
      if (result.success) {
        const statusMsg = formatStatus(result.output);
        bot.editMessageText(statusMsg, { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '🔙 Back', callback_data: 'back_scheduler' }]] } });
      }
    }
  }

  // Tool commands
  if (data.startsWith('tool_')) {
    const tool = data.replace('tool_', '');
    bot.answerCallbackQuery(query.id, { text: '⏳ Processing...' });

    if (tool === 'cookiegenerator') {
      bot.editMessageText(`🍪 *COOKIE GENERATOR*\n━━━━━━━━━━━━━━━━━━━━\n\nSelect account to generate cookies:`, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
        ...await getAccountMenu('cookiegen')
      });
      return;
    }

    if (tool === 'accountsetup') {
      const msg = `➕ *ACCOUNT SETUP*\n━━━━━━━━━━━━━━━━━━━━\n\nInteractive account setup wizard.\n\nTo create a new account, use:\n\`/addaccount <account_id>\`\n\nOr run the interactive setup:\n\`/cmd node bot/account-setup.js\``;
      bot.editMessageText(msg, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[{ text: '🔙 Back', callback_data: 'back_tools' }]] }
      });
      return;
    }

    if (tool === 'maintenance') {
      bot.editMessageText('🔧 *MAINTENANCE TOOLS*', {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
        ...getMaintenanceMenu()
      });
      return;
    }

    if (tool === 'ctamanager') {
      const msg = `🔗 *CTA MANAGER*\n━━━━━━━━━━━━━━━━━━━━\n\nManage Call-to-Action links for your accounts.\n\nTo use CTA Manager:\n\`/cmd node bot/ctamanager.js <account_id>\`\n\nThis will help you manage CTA links in your posts.`;
      bot.editMessageText(msg, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[{ text: '🔙 Back', callback_data: 'back_tools' }]] }
      });
      return;
    }
  }

  // Cookie generator for specific account
  if (data.startsWith('cookiegen_')) {
    const accountId = data.replace('cookiegen_', '');
    bot.answerCallbackQuery(query.id, { text: '⏳ Generating cookies...' });

    bot.editMessageText(`🍪 Generating cookies for *${accountId}*...\n\n⏳ This may take a few minutes...`, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'Markdown'
    });

    const result = await executeCommand(`node ${path.join(__dirname, 'cookiegenerator.js')} ${accountId}`, 300000);

    let msg = `🍪 *COOKIE GENERATOR*\n━━━━━━━━━━━━━━━━━━━━\n\nAccount: ${accountId}\nStatus: ${result.success ? '✅ Success' : '❌ Failed'}\n\n`;
    msg += result.success ? `✅ Cookies generated successfully!\n\n\`\`\`\n${result.output.substring(0, 1000)}\n\`\`\`` : `❌ Error: ${result.output.substring(0, 500)}`;

    bot.editMessageText(msg, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: [[{ text: '🔙 Back', callback_data: 'back_tools' }]] }
    });
    return;
  }

  // Maintenance commands
  if (data.startsWith('maint_')) {
    const action = data.replace('maint_', '');
    bot.answerCallbackQuery(query.id, { text: '⏳ Processing...' });
    bot.editMessageText(`🔧 Running maintenance task...\n\n⏳ Please wait...`, { chat_id: chatId, message_id: messageId });

    let command = '';
    let taskName = '';
    switch (action) {
      case 'check_cookies':
        command = `node ${path.join(__dirname, 'maintenance.js')} check-cookies`;
        taskName = 'Check Cookies';
        break;
      case 'refresh_all':
        command = `node ${path.join(__dirname, 'maintenance.js')} refresh-cookies`;
        taskName = 'Refresh All Cookies';
        break;
      case 'cleanup_logs':
        command = `node ${path.join(__dirname, 'maintenance.js')} cleanup-logs 7`;
        taskName = 'Cleanup Logs';
        break;
      case 'cleanup_temp':
        command = `node ${path.join(__dirname, 'maintenance.js')} cleanup-temp`;
        taskName = 'Cleanup Temp';
        break;
      case 'daily_report':
        command = `node ${path.join(__dirname, 'maintenance.js')} daily-report`;
        taskName = 'Daily Report';
        break;
    }

    const result = await executeCommand(command, 300000);
    let msg = `🔧 *${taskName.toUpperCase()}*\n━━━━━━━━━━━━━━━━━━━━\n\nStatus: ${result.success ? '✅ Success' : '❌ Failed'}\n\n`;
    msg += result.success ? `\`\`\`\n${result.output.substring(0, 1000)}\n\`\`\`` : `❌ Error: ${result.output.substring(0, 500)}`;

    bot.editMessageText(msg, { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '🔙 Back', callback_data: 'back_main' }]] } });
    return;
  }

  // Add account confirmation
  if (data.startsWith('addacc_confirm_')) {
    const sessionId = data.replace('addacc_confirm_', '');
    const session = commandSessions.get(sessionId);
    if (!session) return bot.answerCallbackQuery(query.id, { text: '❌ Session expired' });

    bot.answerCallbackQuery(query.id, { text: '⏳ Creating account...' });

    const accountPath = path.join(ACCOUNTS_DIR, session.accountId);
    try {
      if (fsSync.existsSync(accountPath)) {
        bot.editMessageText(`❌ Account \`${session.accountId}\` already exists!`, { chat_id: session.chatId, message_id: messageId, parse_mode: 'Markdown' });
        commandSessions.delete(sessionId);
        return;
      }

      await fs.mkdir(accountPath, { recursive: true });

      const defaultConfig = {
        enabled: true,
        name: session.accountId,
        bots: {
          updatestatus: { enabled: false, headless: true, minIntervalSeconds: 300, maxIntervalSeconds: 600 },
          videocomment: { enabled: false, headless: true, postsToComment: 5, minIntervalSeconds: 60, maxIntervalSeconds: 180, autoLike: true },
          groupcomment: { enabled: false, headless: true, postsToComment: 5, minIntervalSeconds: 60, maxIntervalSeconds: 180, autoLike: true },
          timelinecomment: { enabled: false, headless: true, postsToComment: 8, minIntervalSeconds: 45, maxIntervalSeconds: 120, autoLike: true },
          sharereels: { enabled: false, headless: true, minIntervalSeconds: 180, maxIntervalSeconds: 300 },
          uploadreels: { enabled: false, headless: true, maxUploadsPerRun: 3, minIntervalSeconds: 300, maxIntervalSeconds: 600 },
          reply: { enabled: false, headless: true, maxReplies: 10 },
          confirm: { enabled: false, headless: true, maxConfirms: 20 },
          scrape: { enabled: false, headless: true, maxScrolls: 10 }
        },
        safety: { maxRunsPerDay: 15, maxRunsPerHour: 3, cooldownOnFailure: 1800, quietHours: { enabled: true, start: 2, end: 6 } },
        timezone: "Asia/Jakarta",
        created: new Date().toISOString()
      };

      await fs.writeFile(path.join(accountPath, 'config.json'), JSON.stringify(defaultConfig, null, 2));

      const files = {
        'comments.txt': 'Keren banget!\n---\nMantap!',
        'cta_link.txt': '',
        'target_groups.txt': '',
        'reels_urls.txt': '',
        'gemini_keys.txt': '',
        'openrouter_keys.txt': '',
        'cookies.json': '[]',
        'memory.json': '{"history":[],"lastUpdate":"' + new Date().toISOString() + '"}'
      };

      for (const [filename, content] of Object.entries(files)) {
        await fs.writeFile(path.join(accountPath, filename), content);
      }

      const scheduleTemplate = { enabled: false, timezone: "Asia/Jakarta", runs: [] };
      await fs.writeFile(path.join(accountPath, 'schedule.json'), JSON.stringify(scheduleTemplate, null, 2));

      let msg = `✅ *ACCOUNT CREATED*\n━━━━━━━━━━━━━━━━━━━━\n\nAccount ID: \`${session.accountId}\`\nLocation: \`${accountPath}\`\n\n*Next steps:*\n1. Add Facebook cookies to \`cookies.json\`\n2. Configure bots in \`config.json\`\n3. Set up schedule in \`schedule.json\`\n4. Add comments, API keys, etc.\n\nUse /cmd to manage files directly!`;

      bot.editMessageText(msg, { chat_id: session.chatId, message_id: messageId, parse_mode: 'Markdown' });
      commandSessions.delete(sessionId);
    } catch (error) {
      bot.editMessageText(`❌ Error creating account: ${error.message}`, { chat_id: session.chatId, message_id: messageId });
      commandSessions.delete(sessionId);
    }
    return;
  }

  if (data.startsWith('addacc_cancel_')) {
    const sessionId = data.replace('addacc_cancel_', '');
    commandSessions.delete(sessionId);
    bot.answerCallbackQuery(query.id, { text: 'Cancelled' });
    bot.editMessageText('❌ Account creation cancelled', { chat_id: chatId, message_id: messageId });
    return;
  }

  // Stop all confirmation
  if (data === 'confirm_stop_all') {
    bot.answerCallbackQuery(query.id, { text: '⏳ Stopping...' });
    bot.editMessageText(`🛑 Stopping all processes...\n\n⏳ Please wait...`, { chat_id: chatId, message_id: messageId });
    const result = await executeCommand(`${EXECUTOR.endsWith('.js') ? `node ${EXECUTOR}` : EXECUTOR} stop`);
    let msg = `🛑 *STOP ALL*\n━━━━━━━━━━━━━━━━━━━━\n\n${result.success ? '✅ All processes stopped!' : `❌ Error: ${result.output}`}`;
    bot.editMessageText(msg, { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '🔙 Back', callback_data: 'back_main' }]] } });
    return;
  }

  // Settings - Notifications
  if (data === 'settings_notify') {
    bot.answerCallbackQuery(query.id);
    const msg = `🔔 *NOTIFICATION STATUS*\n━━━━━━━━━━━━━━━━━━━━\n\n✅ Notifications: Active\n🤖 Bot Token: Same as notify.js\n💬 Chat ID: ${ALLOWED_USER_IDS[0]}\n\nBot ini menggunakan token yang sama dengan sistem notifikasi.\nSemua notifikasi dari executor akan muncul di chat ini!\n\n*Notification Types:*\n├ ✅ Success - Bot completion\n├ ❌ Error - Process errors\n├ ⚠️ Warning - Validation warnings\n├ ℹ️ Info - System information\n└ 🍪 Cookie - Cookie status updates`;
    bot.editMessageText(msg, { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '🔙 Back', callback_data: 'back_settings' }]] } });
    return;
  }

  // Settings - CMD Access
  if (data === 'settings_cmd') {
    bot.answerCallbackQuery(query.id);
    const msg = `💻 *COMMAND LINE ACCESS*\n━━━━━━━━━━━━━━━━━━━━\n\nExecute commands directly on VPS:\n\n\`/cmd <command>\`\n\nExamples:\n\`/cmd ls -la\`\n\`/cmd pm2 list\`\n\`/cmd df -h\`\n\n⚠️ *Warning:* Use with caution!`;
    bot.editMessageText(msg, { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '🔙 Back', callback_data: 'back_settings' }]] } });
    return;
  }

  // Settings - Add Account
  if (data === 'settings_add_account') {
    bot.answerCallbackQuery(query.id);
    const msg = `➕ *ADD NEW ACCOUNT*\n━━━━━━━━━━━━━━━━━━━━\n\nTo add a new account, send:\n\n\`/addaccount <account_id>\`\n\nExample:\n\`/addaccount john\`\n\nThis will create a new account interactively.`;
    bot.editMessageText(msg, { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '🔙 Back', callback_data: 'back_settings' }]] } });
    return;
  }

  // Settings - View Logs
  if (data === 'settings_logs') {
    bot.answerCallbackQuery(query.id, { text: '⏳ Loading logs...' });
    const logsDir = path.join(__dirname, '../logs');
    const result = await executeCommand(`ls -lht ${logsDir} | head -20`);
    let msg = `📝 *RECENT LOGS*\n━━━━━━━━━━━━━━━━━━━━\n\n`;
    msg += result.success ? `\`\`\`\n${result.output}\n\`\`\`\n\nTo view a specific log:\n\`/viewlog <filename>\`` : `❌ Error: ${result.output}`;
    bot.editMessageText(msg, { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '🔙 Back', callback_data: 'back_settings' }]] } });
    return;
  }

  // Settings - Cleanup
  if (data === 'settings_cleanup') {
    bot.answerCallbackQuery(query.id);
    bot.editMessageText(`🗑️ *CLEANUP OPTIONS*`, {
      chat_id: chatId, message_id: messageId, parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '🗂️ Logs (7 days)', callback_data: 'cleanup_logs_7' },
            { text: '🗂️ Logs (30 days)', callback_data: 'cleanup_logs_30' }
          ],
          [
            { text: '📁 Temp Files', callback_data: 'cleanup_temp' },
            { text: '🗄️ Backups (30 days)', callback_data: 'cleanup_backups' }
          ],
          [
            { text: '🧹 Full Cleanup', callback_data: 'cleanup_full' }
          ],
          [
            { text: '🔙 Back', callback_data: 'back_settings' }
          ]
        ]
      }
    });
    return;
  }

  // Cleanup actions
  if (data.startsWith('cleanup_')) {
    const action = data.replace('cleanup_', '');
    bot.answerCallbackQuery(query.id, { text: '⏳ Cleaning up...' });

    let command = '';
    let taskName = '';
    switch (action) {
      case 'logs_7':
        command = `node ${path.join(__dirname, 'maintenance.js')} cleanup-logs 7`;
        taskName = 'Cleanup Logs (7 days)';
        break;
      case 'logs_30':
        command = `node ${path.join(__dirname, 'maintenance.js')} cleanup-logs 30`;
        taskName = 'Cleanup Logs (30 days)';
        break;
      case 'temp':
        command = `node ${path.join(__dirname, 'maintenance.js')} cleanup-temp`;
        taskName = 'Cleanup Temp Files';
        break;
      case 'backups':
        command = `find ${path.join(__dirname, '../backups')} -type f -mtime +30 -delete`;
        taskName = 'Cleanup Old Backups';
        break;
      case 'full':
        command = `node ${path.join(__dirname, 'maintenance.js')} cleanup-logs 7 && node ${path.join(__dirname, 'maintenance.js')} cleanup-temp`;
        taskName = 'Full Cleanup';
        break;
    }

    const result = await executeCommand(command, 180000);
    let msg = `🗑️ *${taskName.toUpperCase()}*\n━━━━━━━━━━━━━━━━━━━━\n\nStatus: ${result.success ? '✅ Success' : '❌ Failed'}\n\n`;
    msg += result.success ? result.output.substring(0, 500) : `❌ Error: ${result.output}`;

    bot.editMessageText(msg, { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '🔙 Back', callback_data: 'back_settings' }]] } });
    return;
  }

  // Back navigation
  if (data === 'back_main') {
    bot.editMessageText(`🤖 *MAIN MENU*\n\n⏰ ${getJakartaTime()} WIB`, {
      chat_id: chatId, message_id: messageId, parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '📊 Status', callback_data: 'quick_status' }, { text: '🤖 Run Bot', callback_data: 'quick_run' }],
          [{ text: '🍪 Cookies', callback_data: 'quick_cookies' }, { text: '⏰ Scheduler', callback_data: 'quick_scheduler' }],
          [{ text: '🔧 Maintenance', callback_data: 'quick_maintenance' }, { text: '⚙️ Settings', callback_data: 'quick_settings' }]
        ]
      }
    });
    bot.answerCallbackQuery(query.id);
    return;
  }

  if (data === 'back_settings') {
    bot.editMessageText('⚙️ *SETTINGS*', { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown', ...getSettingsMenu() });
    bot.answerCallbackQuery(query.id);
    return;
  }

  if (data === 'back_scheduler') {
    bot.editMessageText('⏰ *SMART SCHEDULER*', { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown', ...getSchedulerMenu() });
    bot.answerCallbackQuery(query.id);
    return;
  }

  if (data === 'back_tools') {
    bot.editMessageText('🔧 *TOOLS & UTILITIES*', { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown', ...getToolsMenu() });
    bot.answerCallbackQuery(query.id);
    return;
  }

  // Quick actions
  if (data === 'quick_status') {
    bot.answerCallbackQuery(query.id, { text: '⏳ Loading...' });
    const result = await executeExecutorCommand('status');
    if (result.success) {
      const statusMsg = formatStatus(result.output);
      bot.editMessageText(statusMsg, { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '🔙 Back', callback_data: 'back_main' }]] } });
    }
    return;
  }

  if (data === 'quick_run') {
    bot.editMessageText('🤖 *SELECT BOT TO RUN*', { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown', ...getBotMenu() });
    bot.answerCallbackQuery(query.id);
    return;
  }

  if (data === 'quick_cookies') {
    bot.answerCallbackQuery(query.id, { text: '⏳ Checking...' });
    const result = await executeExecutorCommand('validate-cookies');
    if (result.success) {
      let msg = `🍪 *COOKIE STATUS*\n━━━━━━━━━━━━━━━━━━━━\n⏰ ${getJakartaTime()} WIB\n\n`;
      const lines = result.output.split('\n').filter(l => l.includes(':'));
      lines.forEach(line => {
        if (line.includes('VALID')) msg += `✅ ${line}\n`;
        else if (line.includes('INVALID')) msg += `❌ ${line}\n`;
        else msg += `${line}\n`;
      });
      bot.editMessageText(msg, { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '🔙 Back', callback_data: 'back_main' }]] } });
    }
    return;
  }

  if (data === 'quick_scheduler') {
    bot.editMessageText('⏰ *SMART SCHEDULER*', { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown', ...getSchedulerMenu() });
    bot.answerCallbackQuery(query.id);
    return;
  }

  if (data === 'quick_maintenance') {
    bot.editMessageText('🔧 *TOOLS & UTILITIES*', { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown', ...getToolsMenu() });
    bot.answerCallbackQuery(query.id);
    return;
  }

  if (data === 'quick_settings') {
    bot.editMessageText('⚙️ *SETTINGS*', { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown', ...getSettingsMenu() });
    bot.answerCallbackQuery(query.id);
    return;
  }

  bot.answerCallbackQuery(query.id);
});

// ========================================
// CLEANUP OLD SESSIONS
// ========================================

setInterval(() => {
  const now = Date.now();
  for (const [sessionId, session] of commandSessions.entries()) {
    const sessionTime = parseInt(sessionId.split('_').pop());
    if (now - sessionTime > 600000) {
      commandSessions.delete(sessionId);
    }
  }
}, 60000);

// ========================================
// ERROR HANDLERS
// ========================================

bot.on('polling_error', (error) => {
  logger.error('❌ Polling error:', error.message);
});

process.on('unhandledRejection', (reason, promise) => {
  // Unhandled rejection
});

// ========================================
// START BOT
// ========================================

// License check before starting bot
async function startBot() {
  try {
    const { ensureLicense } = require('./sys-core');
    logger.info('🔐 Checking license...');
    await ensureLicense('Telegram Bot', true);

    logger.info('🚀 FacebookPro Blaster Started!');
    logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    logger.info(`⏰ Time: ${getJakartaTime()} WIB`);
    logger.info(`🔑 Bot Token: ${BOT_TOKEN.substring(0, 20)}...`);
    logger.info(`💬 Chat ID: ${ALLOWED_USER_IDS[0]}`);
    logger.info(`👥 Allowed Users: ${ALLOWED_USER_IDS.join(', ')}`);
    logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    logger.info('✅ FacebookPro Blaster is ready and waiting for commands...');
    console.log('');
    logger.info('🔔 UNIFIED NOTIFICATION SYSTEM:');
    logger.info('  ✅ Same token as notify.js');
    logger.info('  ✅ All notifications appear in this chat');
    logger.info('  ✅ Automatic notifications from executor');
    logger.info('  ✅ Command responses');
    logger.info('  ✅ Better error handling & logging');
    logger.info('  ✅ Complete features: Locks, Backup, Restore, Maintenance');
    logger.info('  ✅ All callback handlers properly async');
    console.log('');
  } catch (error) {
    logger.error('❌ License check failed:', error.message);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  startBot();
}

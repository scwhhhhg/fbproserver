// reply.js - FIXED VERSION dengan Memory & Self-Reply Filter

const puppeteer = require("puppeteer");
const fs = require("fs").promises;
const fsSync = require("fs");
const path = require("path");

// Import AI comment generator module
const { generateAiComment, typeCommentSafely, loadOpenRouterKeys } = require('./commentgenerator');

// Multi-account support
const ACCOUNT_ID = process.env.ACCOUNT_ID || 'default';
// Dynamic Base Path for Binary Support
const isCompiled = path.basename(process.execPath).endsWith('.exe') && !process.execPath.toLowerCase().includes('node.exe') && !process.execPath.toLowerCase().includes('bun.exe');
const basePath = isCompiled ? path.dirname(process.execPath) : __dirname;
const ACCOUNTS_DIR = path.join(basePath, "../accounts");
const BOT_NAME = process.env.BOT_NAME || 'reply';

console.log(`[DEBUG] Environment - ACCOUNT_ID: ${ACCOUNT_ID}, ACCOUNTS_DIR, ACCOUNT_ID: ${ACCOUNTS_DIR, ACCOUNT_ID}, BOT_NAME: ${BOT_NAME}`);

// Load config
let config;
try {
  const configPath = path.join(ACCOUNTS_DIR, ACCOUNT_ID, "bots", `${BOT_NAME}.json`);
  config = require(configPath);
} catch (e) {
  console.log(`[DEBUG] Could not load specific config, using defaults: ${e.message}`);
  config = {
    headless: "new",
    maxReplies: 10,
    minIntervalSeconds: 30,
    maxIntervalSeconds: 120,
    ai_replies: {
      enabled: false,
      use_openrouter: true,
      url_shortener_enabled: false,
      gemini_prompt: "Balas komentar ini dengan friendly dan natural. Komentar: '{COMMENT_TEXT}'. Buatlah balasan yang singkat, ramah, dan relevan dalam 1-2 kalimat. Gunakan bahasa Indonesia yang santai.",
      typing_delay_after_click: 3000
    },
    static_replies: [
      "Terima kasih komentar nya!",
      "Setuju banget!",
      "Thanks udah komen!",
      "Betul sekali!"
    ],
    skip_keywords: [
      "spam", "promo", "jual", "beli", "iklan", "follow back"
    ]
  };
}

// Paths
const COOKIES_PATH = path.join(ACCOUNTS_DIR, ACCOUNT_ID, "cookies.json");
const GEMINI_KEYS_PATH = path.join(ACCOUNTS_DIR, ACCOUNT_ID, "gemini_keys.txt");
const OPENROUTER_KEYS_PATH = path.join(ACCOUNTS_DIR, ACCOUNT_ID, "openrouter_keys.txt");
const ARTIFACTS_DIR = path.join(__dirname, "../artifacts", ACCOUNT_ID);
const LOG_PATH = path.join(ACCOUNTS_DIR, ACCOUNT_ID, "auto_reply_log.txt");
const REPLIED_COMMENTS_PATH = path.join(__dirname, "../accounts", ACCOUNT_ID, "replied_comments.json"); // NEW: Memory file

const notify = require('./notify');

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// NEW: Load replied comments history
async function loadRepliedComments() {
  try {
    const data = await fs.readFile(REPLIED_COMMENTS_PATH, "utf8");
    const history = JSON.parse(data);
    console.log(`[${ACCOUNT_ID}] Loaded ${Object.keys(history).length} replied comments from memory`);
    return history;
  } catch (error) {
    if (error.code === "ENOENT") {
      console.log(`[${ACCOUNT_ID}] No reply history found, starting fresh`);
      return {};
    }
    console.log(`[${ACCOUNT_ID}] Error loading reply history: ${error.message}`);
    return {};
  }
}

// NEW: Save replied comment to memory
async function saveRepliedComment(commentHash, commentData) {
  try {
    let history = {};
    try {
      const data = await fs.readFile(REPLIED_COMMENTS_PATH, "utf8");
      history = JSON.parse(data);
    } catch (e) {
      // File doesn't exist yet
    }
    
    history[commentHash] = {
      text: commentData.text.substring(0, 100),
      repliedAt: new Date().toISOString(),
      postUrl: commentData.postUrl || 'unknown'
    };
    
    // Keep only last 1000 entries to prevent file from growing too large
    const entries = Object.entries(history);
    if (entries.length > 1000) {
      // Sort by date and keep newest 1000
      entries.sort((a, b) => new Date(b[1].repliedAt) - new Date(a[1].repliedAt));
      history = Object.fromEntries(entries.slice(0, 1000));
    }
    
    await fs.writeFile(REPLIED_COMMENTS_PATH, JSON.stringify(history, null, 2));
    console.log(`[${ACCOUNT_ID}] Saved reply to memory: ${commentHash}`);
  } catch (error) {
    console.log(`[${ACCOUNT_ID}] Error saving to memory: ${error.message}`);
  }
}

// NEW: Generate hash for comment (for deduplication)
function generateCommentHash(commentText, postUrl) {
  const crypto = require('crypto');
  const content = `${commentText.substring(0, 100)}_${postUrl}`;
  return crypto.createHash('md5').update(content).digest('hex');
}

// NEW: Get account name from Facebook - UPDATED with priority selector
async function getAccountName(page) {
  try {
    const accountName = await page.evaluate(() => {
      // PRIMARY SELECTOR (highest priority)
      const primarySelector = 'span.x1lliihq.x6ikm8r.x10wlt62.x1n2onr6';
      const primaryElement = document.querySelector(primarySelector);
      
      if (primaryElement && primaryElement.textContent) {
        const text = primaryElement.textContent.trim();
        if (text.length > 0 && text.length < 100) {
          console.log(`Account name from primary selector: ${text}`);
          return text;
        }
      }
      
      // FALLBACK SELECTORS (if primary fails)
      const fallbackSelectors = [
        // Generic span with styles
        'span.x1lliihq',
        'span.x193iq5w',
        'span.x6ikm8r',

        // Profile menu selectors
        'a[href*="/me"] span',
        'div[aria-label*="Profil"] span',
        'a[aria-label*="Profil"] span',
        
        // Header selectors
        'span[dir="auto"]',
        'div[role="navigation"] span',
        
        // Account switcher selectors
        'div[aria-label*="Akun"] span',
        'div[data-visualcompletion="ignore-dynamic"] span'
      ];
      
      for (const selector of fallbackSelectors) {
        try {
          const elements = document.querySelectorAll(selector);
          console.log(`Trying fallback selector "${selector}": found ${elements.length} elements`);
          
          for (const element of elements) {
            const text = element.textContent.trim();
            
            // Validate text
            if (text.length > 0 && text.length < 100) {
              // Skip if it's a menu item or button text
              const lowerText = text.toLowerCase();
              if (lowerText.includes('home') ||
                  lowerText.includes('beranda') ||
                  lowerText.includes('watch') ||
                  lowerText.includes('marketplace') ||
                  lowerText.includes('groups') ||
                  lowerText.includes('gaming') ||
                  lowerText.includes('settings') ||
                  lowerText.includes('pengaturan') ||
                  lowerText.includes('log out') ||
                  lowerText.includes('keluar') ||
                  lowerText.includes('menu') ||
                  lowerText.includes('notification') ||
                  lowerText.includes('notifikasi')) {
                continue;
              }
              
              // Check if it looks like a name (has at least 2 words or is > 3 chars)
              const words = text.split(' ');
              if (words.length >= 2 || text.length > 3) {
                console.log(`Account name from fallback "${selector}": ${text}`);
                return text;
              }
            }
          }
        } catch (e) {
          console.log(`Fallback selector error: ${e.message}`);
          continue;
        }
      }
      
      // LAST RESORT: Extract from page title
      const title = document.title;
      if (title) {
        // Facebook title format: "(2) Name | Facebook" or "Name | Facebook"
        const patterns = [
          /\(\d+\)\s+(.+?)\s+\|/,  // Match: (2) Account Name | Facebook
          /^(.+?)\s+\|/,            // Match: Account Name | Facebook
          /^(.+?)\s+-\s+Facebook/   // Match: Account Name - Facebook
        ];
        
        for (const pattern of patterns) {
          const match = title.match(pattern);
          if (match && match[1]) {
            const name = match[1].trim();
            if (name.length > 0 && name.length < 100) {
              console.log(`Account name from page title: ${name}`);
              return name;
            }
          }
        }
      }
      
      console.log('Could not detect account name from any source');
      return null;
    });
    
    if (accountName) {
      console.log(`[${ACCOUNT_ID}] ✅ Account name detected: ${accountName}`);
      return accountName;
    }
    
    console.log(`[${ACCOUNT_ID}] ⚠️ Could not detect account name`);
    return null;
  } catch (error) {
    console.log(`[${ACCOUNT_ID}] ❌ Error detecting account name: ${error.message}`);
    return null;
  }
}

// UPDATED: More robust self-comment detection
async function shouldSkipComment(commentText, accountName) {
  const skipKeywords = config.skip_keywords || [];
  const lowerComment = commentText.toLowerCase();
  
  // Check skip keywords
  for (const keyword of skipKeywords) {
    if (lowerComment.includes(keyword.toLowerCase())) {
      console.log(`[${ACCOUNT_ID}] ⏭️ Skipping comment containing keyword: ${keyword}`);
      return true;
    }
  }
  
  // Check if too short
  if (commentText.trim().length < 3) {
    console.log(`[${ACCOUNT_ID}] ⏭️ Skipping too short comment`);
    return true;
  }
  
  // NEW: Enhanced self-comment detection
  if (accountName) {
    const accountNameLower = accountName.toLowerCase();
    const commentLower = commentText.toLowerCase();
    
    // Method 1: Check if comment starts with our name
    if (commentLower.startsWith(accountNameLower)) {
      console.log(`[${ACCOUNT_ID}] ⏭️ Skipping own comment (starts with: ${accountName})`);
      return true;
    }
    
    // Method 2: Check first 3 words contain our name
    const commentWords = commentText.split(' ');
    const firstThreeWords = commentWords.slice(0, 3).join(' ').toLowerCase();
    
    if (firstThreeWords.includes(accountNameLower)) {
      console.log(`[${ACCOUNT_ID}] ⏭️ Skipping own comment (name in first 3 words: ${accountName})`);
      return true;
    }
    
    // Method 3: Check if our name appears at the beginning (with tolerance for slight variations)
    // Example: "Account Name ok kk" vs "account name ok kk"
    const accountNameWords = accountName.toLowerCase().split(' ');
    const matchCount = accountNameWords.filter(word => 
      commentWords.slice(0, accountNameWords.length).some(cw => 
        cw.toLowerCase().includes(word) || word.includes(cw.toLowerCase())
      )
    ).length;
    
    // If more than half of our name words match in the beginning, it's probably our comment
    if (matchCount >= Math.ceil(accountNameWords.length / 2)) {
      console.log(`[${ACCOUNT_ID}] ⏭️ Skipping own comment (name match: ${matchCount}/${accountNameWords.length} words)`);
      return true;
    }
    
    // Method 4: Check exact match anywhere in first 50 characters
    const first50Chars = commentText.substring(0, 50).toLowerCase();
    if (first50Chars.includes(accountNameLower)) {
      console.log(`[${ACCOUNT_ID}] ⏭️ Skipping own comment (exact name in first 50 chars)`);
      return true;
    }
  }
  
  return false;
}

// UPDATED: Enhanced comment detection with self-filter
async function goToPostAndFindComments(page, postUrl, repliedComments, accountName) {
  console.log(`[${ACCOUNT_ID}] Going to post: ${postUrl}`);
  
  try {
    await page.goto(postUrl, {
      waitUntil: 'networkidle2',
      timeout: 30000
    });
    await delay(5000);

    console.log(`[${ACCOUNT_ID}] Loading comments...`);
    
    // Expand comments
    try {
      const expandClicked = await page.evaluate(() => {
        let clickCount = 0;
        const allElements = Array.from(document.querySelectorAll('*'));
        
        for (const el of allElements) {
          try {
            const text = el.textContent || '';
            if ((el.tagName === 'SPAN' || el.tagName === 'DIV') && 
                (text.includes('View more comments') || 
                 text.includes('Lihat komentar lainnya') ||
                 text.includes('more comments') ||
                 text.includes('lebih banyak'))) {
              el.click();
              clickCount++;
              if (clickCount >= 3) break;
            }
          } catch (e) {
            continue;
          }
        }
        return clickCount;
      });
      
      if (expandClicked > 0) {
        console.log(`[${ACCOUNT_ID}] Clicked ${expandClicked} expand buttons`);
        await delay(3000);
      } else {
        console.log(`[${ACCOUNT_ID}] No expand buttons found`);
      }
    } catch (e) {
      console.log(`[${ACCOUNT_ID}] Could not expand comments: ${e.message}`);
    }

    // Scroll
    for (let i = 0; i < 3; i++) {
      try {
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await delay(2000);
      } catch (e) {
        break;
      }
    }

    // UPDATED: Enhanced comment detection with self-filter
    const comments = await page.evaluate((postUrl, accountName) => {
      try { 
        const commentElements = [];
        console.log("Starting comment detection...");
        console.log(`Account name for filtering: ${accountName || 'Not detected'}`);
        
        // Strategy: Cari tombol "Balas" dulu, baru ambil text comment-nya
        const replyButtons = document.querySelectorAll(
          '[aria-label*="Balas"], [aria-label*="Reply"], ' +
          '[role="button"][aria-label*="sebagai"]'
        );
        
        console.log(`Found ${replyButtons.length} reply buttons`);
        
        for (const replyBtn of replyButtons) {
          try {
            const ariaLabel = replyBtn.getAttribute('aria-label') || '';
            
            // Skip jika bukan tombol balas comment
            if (!ariaLabel.toLowerCase().includes('balas') && 
                !ariaLabel.toLowerCase().includes('reply')) {
              continue;
            }
            
            // Cari comment text di sekitar tombol ini
            let commentElement = replyBtn;
            let commentText = '';
            let commentAuthor = ''; // NEW: Track comment author
            let attempts = 0;
            
            // Traverse ke parent untuk cari comment text
            while (commentElement && attempts < 8) {
              // PRIMARY: Cari nama dengan selector prioritas
              if (!commentAuthor) {
                const authorSpan = commentElement.querySelector('span.x1lliihq.x6ikm8r.x10wlt62.x1n2onr6');
                if (authorSpan && authorSpan.textContent) {
                  commentAuthor = authorSpan.textContent.trim();
                  console.log(`Found comment author: ${commentAuthor}`);
                }
              }
              
              // Cari div dengan dir="auto" yang kemungkinan berisi comment
              const textDivs = commentElement.querySelectorAll('div[dir="auto"]');
              
              for (const textDiv of textDivs) {
                const text = (textDiv.textContent || '').trim();
                
                if (text.length >= 5 && text.length <= 1000) {
                  // Skip jika ini menu text atau button text
                  if (text.toLowerCase().includes('write a comment') ||
                      text.toLowerCase().includes('tulis komentar') ||
                      text.toLowerCase().includes('like') ||
                      text.toLowerCase().includes('share') ||
                      text.toLowerCase().includes('comment') && text.length < 50 ||
                      text.toLowerCase().includes('balas') && text.length < 50) {
                    continue;
                  }
                  
                  // Ambil comment text terpanjang yang valid
                  if (text.length > commentText.length) {
                    commentText = text;
                  }
                }
              }
              
              commentElement = commentElement.parentElement;
              attempts++;
            }
            
            if (commentText && commentText.length >= 5) {
              // NEW: Filter by comment author (if detected)
              if (accountName && commentAuthor) {
                const authorLower = commentAuthor.toLowerCase();
                const accountLower = accountName.toLowerCase();
                
                if (authorLower === accountLower || 
                    authorLower.includes(accountLower) || 
                    accountLower.includes(authorLower)) {
                  console.log(`Skipping own comment by author: "${commentAuthor}"`);
                  continue;
                }
              }
              
              // Filter by comment text (starts with our name)
              if (accountName) {
                const commentLower = commentText.toLowerCase();
                const accountLower = accountName.toLowerCase();
                
                if (commentLower.startsWith(accountLower)) {
                  console.log(`Skipping own comment (starts with name): "${commentText.substring(0, 30)}"`);
                  continue;
                }
              }
              
              // Verifikasi ini bukan caption (caption biasanya di bagian atas)
              const rect = replyBtn.getBoundingClientRect();
              const isNotCaption = rect.top > 300; // Caption biasanya di top
              
              if (isNotCaption) {
                // Cek duplikat
                const isDuplicate = commentElements.some(item => 
                  item.text === commentText || 
                  item.text.substring(0, 50) === commentText.substring(0, 50)
                );
                
                if (!isDuplicate) {
                  console.log(`Adding comment: "${commentText.substring(0, 50)}..." (Author: ${commentAuthor || 'Unknown'})`);
                  commentElements.push({
                    text: commentText,
                    preview: commentText.substring(0, 100),
                    ariaLabel: ariaLabel,
                    postUrl: postUrl,
                    author: commentAuthor || 'Unknown'
                  });
                }
              } else {
                console.log(`Skipping caption at top: "${commentText.substring(0, 30)}..."`);
              }
            }
          } catch (e) {
            console.log(`Error processing reply button: ${e.message}`);
            continue;
          }
        }

        console.log(`Found ${commentElements.length} valid comments (after self-filter)`);
        return commentElements.slice(0, 5);
      
      } catch (e) {
        console.error("FATAL ERROR:", e.message);
        return [];
      }
    }, postUrl, accountName);

    // Filter out already replied comments
    const newComments = [];
    for (const comment of comments) {
      const hash = generateCommentHash(comment.text, postUrl);
      
      if (repliedComments[hash]) {
        console.log(`[${ACCOUNT_ID}] ⏭️ Skipping already replied comment: "${comment.text.substring(0, 50)}..."`);
        console.log(`[${ACCOUNT_ID}] 📅 Previously replied at: ${repliedComments[hash].repliedAt}`);
        continue;
      }
      
      newComments.push(comment);
    }

    console.log(`[${ACCOUNT_ID}] 📊 Found ${comments.length} total comments, ${newComments.length} new (not replied yet)`);
    
    if (newComments.length > 0) {
      newComments.forEach((c, i) => {
        console.log(`[${ACCOUNT_ID}] 💬 New Comment ${i+1} by ${c.author}: ${c.preview}...`);
      });
    } else {
      console.log(`[${ACCOUNT_ID}] ℹ️ No new comments to reply to`);
      
      try {
        if (!fsSync.existsSync(ARTIFACTS_DIR)) {
          await fs.mkdir(ARTIFACTS_DIR, { recursive: true });
        }
        const screenshot = path.join(ARTIFACTS_DIR, `debug_post_${Date.now()}.png`);
        await page.screenshot({ path: screenshot, fullPage: true });
        console.log(`[${ACCOUNT_ID}] Debug screenshot: ${screenshot}`);
      } catch (e) {
        // Continue
      }
    }
    
    return newComments;
    
  } catch (error) {
    console.log(`[${ACCOUNT_ID}] Error loading post: ${error.message}`);
    return [];
  }
}

async function loadCookiesFromFile() {
  try {
    const cookiesData = await fs.readFile(COOKIES_PATH, "utf8");
    const cookies = JSON.parse(cookiesData);
    return cookies.map(cookie => ({
      name: cookie.name,
      value: cookie.value,
      domain: cookie.domain || '.facebook.com',
      path: cookie.path || '/',
      httpOnly: !!cookie.httpOnly,
      secure: !!cookie.secure,
      sameSite: cookie.sameSite || 'Lax'
    }));
  } catch (error) {
    throw new Error(`[${ACCOUNT_ID}] Gagal load cookies: ${error.message}`);
  }
}

async function loadGeminiKeys() {
  try {
    const data = await fs.readFile(GEMINI_KEYS_PATH, "utf8");
    const keys = data.split("\n").map(k => k.trim()).filter(k => k.startsWith("AIzaSy"));
    if (keys.length === 0 && config.ai_replies?.enabled) {
      console.log(`[${ACCOUNT_ID}] Warning: Tidak ada API key Gemini, fallback ke balasan statis.`);
      return [];
    }
    return keys;
  } catch (error) {
    if (error.code === "ENOENT") {
      console.log(`[${ACCOUNT_ID}] Info: File gemini_keys.txt tidak ditemukan.`);
      return [];
    }
    return [];
  }
}

// UPDATED: Add self-comment detection
async function shouldSkipComment(commentText, accountName) {
  const skipKeywords = config.skip_keywords || [];
  const lowerComment = commentText.toLowerCase();
  
  // Check skip keywords
  for (const keyword of skipKeywords) {
    if (lowerComment.includes(keyword.toLowerCase())) {
      console.log(`[${ACCOUNT_ID}] Skipping comment containing keyword: ${keyword}`);
      return true;
    }
  }
  
  // Check if too short
  if (commentText.trim().length < 3) {
    console.log(`[${ACCOUNT_ID}] Skipping too short comment`);
    return true;
  }
  
  // NEW: Check if this is our own comment
  if (accountName) {
    // Extract name from comment (usually starts with name)
    const commentWords = commentText.split(' ');
    const firstWords = commentWords.slice(0, 3).join(' ').toLowerCase();
    
    if (firstWords.includes(accountName.toLowerCase())) {
      console.log(`[${ACCOUNT_ID}] Skipping own comment (contains our name: ${accountName})`);
      return true;
    }
    
    // Check if comment starts with our name
    if (commentText.toLowerCase().startsWith(accountName.toLowerCase())) {
      console.log(`[${ACCOUNT_ID}] Skipping own comment (starts with our name)`);
      return true;
    }
  }
  
  return false;
}

async function getNotifications(page) {
  console.log(`[${ACCOUNT_ID}] Checking notifications...`);
  
  await page.goto('https://www.facebook.com/notifications', {
    waitUntil: 'domcontentloaded',
    timeout: 30000
  });
  await delay(5000);

  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await delay(2000);
  }

  const notifications = await page.evaluate(() => {
    const notificationItems = [];
    console.log("Starting notification detection...");
    
    const notificationSelectors = [
      'div[role="article"]',
      'div[data-pagelet*="notification"]',
      'div[data-testid*="notification"]',
      'div[data-pressable-container="true"]',
      'div[tabindex="0"]',
      'div.xwib8y2',
      'div.x1n2onr6 > div',
      'div.x78zum5 > div'
    ];

    let allElements = new Set();
    
    notificationSelectors.forEach(selector => {
      try {
        const elements = document.querySelectorAll(selector);
        console.log(`Selector "${selector}" found ${elements.length} elements`);
        
        elements.forEach(el => {
          const text = el.textContent || '';
          if (text.length > 20 && text.length < 500) {
            allElements.add(el);
          }
        });
      } catch (e) {
        console.log(`Selector error: ${e.message}`);
      }
    });

    console.log(`Total potential elements: ${allElements.size}`);

    for (const element of allElements) {
      try {
        const originalText = element.textContent || '';
        const text = originalText.toLowerCase();
        
        if (text.includes('notifikasi semua') || 
            text.includes('belum dibaca notifikasi otomatis') ||
            text.includes('aktifkan notifikasi') ||
            text.length > 300) {
          continue;
        }
        
        const commentKeywords = [
          'commented', 'berkomentar', 'mengomentari', 'comment',
          'replied', 'membalas', 'replied to', 'balas',
        ];
        
        const mentionKeywords = [
          'mentioned', 'menyebut', 'menyebutkan', 'mention',
        ];
        
        const hasCommentKeyword = commentKeywords.some(keyword => text.includes(keyword));
        const hasMentionKeyword = mentionKeywords.some(keyword => text.includes(keyword));
        
        const hasTimeIndicator = /\d+\s*(min|hour|day|jam|hari|menit)\s*(ago|lalu|yang lalu)?/i.test(text);
        const hasPersonName = /[A-Za-z\s]{2,30}\s+(commented|mentioned|replied|berkomentar|menyebut)/i.test(text);
        
        if ((hasCommentKeyword && hasMentionKeyword) || 
            (hasCommentKeyword && hasTimeIndicator) ||
            (hasPersonName && hasMentionKeyword)) {
          
          const links = element.querySelectorAll('a[href*="facebook.com"]');
          let bestLink = null;
          
          for (const link of links) {
            const href = link.href;
            
            if ((href.includes('/posts/') || 
                 href.includes('/photo') || 
                 href.includes('/videos/') || 
                 href.includes('comment_id=') ||
                 href.includes('/permalink/') ||
                 href.includes('story_fbid=') ||
                 href.includes('/groups/')) &&
                !href.includes('/notifications') && 
                !href.includes('/settings/') &&
                !href.includes('/marketplace/') &&
                href !== 'https://www.facebook.com/') {
              bestLink = href;
              break;
            }
          }
          
          if (bestLink) {
            const isDuplicate = notificationItems.some(item => 
              item.link === bestLink || 
              item.text.substring(0, 50) === originalText.substring(0, 50)
            );
            
            if (!isDuplicate) {
              console.log(`Adding notification: "${originalText.substring(0, 50)}..."`);
              notificationItems.push({
                text: originalText.trim(),
                link: bestLink
              });
            }
          }
        }
      } catch (e) {
        console.log(`Error processing element: ${e.message}`);
        continue;
      }
    }

    console.log(`Found ${notificationItems.length} valid notifications`);
    return notificationItems.slice(0, 10);
  });

  console.log(`[${ACCOUNT_ID}] Found ${notifications.length} potential comment notifications`);
  
  if (notifications.length > 0) {
    notifications.forEach((notif, index) => {
      console.log(`[${ACCOUNT_ID}] Notification ${index + 1}:`);
      console.log(`  Text: ${notif.text.substring(0, 100)}...`);
      console.log(`  Link: ${notif.link}`);
    });
  } else {
    console.log(`[${ACCOUNT_ID}] No notifications found.`);
    
    try {
      if (!fsSync.existsSync(ARTIFACTS_DIR)) {
        fs.mkdir(ARTIFACTS_DIR, { recursive: true });
      }
      const debugScreenshot = path.join(ARTIFACTS_DIR, `debug_notifications_${Date.now()}.png`);
      await page.screenshot({ path: debugScreenshot, fullPage: true });
      console.log(`[${ACCOUNT_ID}] Debug screenshot saved: ${debugScreenshot}`);
    } catch (e) {
      console.log(`[${ACCOUNT_ID}] Could not save debug screenshot`);
    }
  }
  
  return notifications;
}

// UPDATED: Add postUrl and repliedComments check
async function goToPostAndFindComments(page, postUrl, repliedComments, accountName) {
  console.log(`[${ACCOUNT_ID}] Going to post: ${postUrl}`);
  
  try {
    await page.goto(postUrl, {
      waitUntil: 'networkidle2',
      timeout: 30000
    });
    await delay(5000);

    console.log(`[${ACCOUNT_ID}] Loading comments...`);
    
    // Expand comments
    try {
      const expandClicked = await page.evaluate(() => {
        let clickCount = 0;
        const allElements = Array.from(document.querySelectorAll('*'));
        
        for (const el of allElements) {
          try {
            const text = el.textContent || '';
            if ((el.tagName === 'SPAN' || el.tagName === 'DIV') && 
                (text.includes('View more comments') || 
                 text.includes('Lihat komentar lainnya') ||
                 text.includes('more comments') ||
                 text.includes('lebih banyak'))) {
              el.click();
              clickCount++;
              if (clickCount >= 3) break;
            }
          } catch (e) {
            continue;
          }
        }
        return clickCount;
      });
      
      if (expandClicked > 0) {
        console.log(`[${ACCOUNT_ID}] Clicked ${expandClicked} expand buttons`);
        await delay(3000);
      } else {
        console.log(`[${ACCOUNT_ID}] No expand buttons found`);
      }
    } catch (e) {
      console.log(`[${ACCOUNT_ID}] Could not expand comments: ${e.message}`);
    }

    // Scroll
    for (let i = 0; i < 3; i++) {
      try {
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await delay(2000);
      } catch (e) {
        break;
      }
    }

    // UPDATED: Find comments with memory check and self-filter
    const comments = await page.evaluate((postUrl, accountName) => {
      try { 
        const commentElements = [];
        console.log("Starting comment detection...");
        
        // Strategy: Cari tombol "Balas" dulu, baru ambil text comment-nya
        const replyButtons = document.querySelectorAll(
          '[aria-label*="Balas"], [aria-label*="Reply"], ' +
          '[role="button"][aria-label*="sebagai"]'
        );
        
        console.log(`Found ${replyButtons.length} reply buttons`);
        
        for (const replyBtn of replyButtons) {
          try {
            const ariaLabel = replyBtn.getAttribute('aria-label') || '';
            
            // Skip jika bukan tombol balas comment
            if (!ariaLabel.toLowerCase().includes('balas') && 
                !ariaLabel.toLowerCase().includes('reply')) {
              continue;
            }
            
            // Cari comment text di sekitar tombol ini
            let commentElement = replyBtn;
            let commentText = '';
            let attempts = 0;
            
            // Traverse ke parent untuk cari comment text
            while (commentElement && attempts < 8) {
              // Cari div dengan dir="auto" yang kemungkinan berisi comment
              const textDivs = commentElement.querySelectorAll('div[dir="auto"]');
              
              for (const textDiv of textDivs) {
                const text = (textDiv.textContent || '').trim();
                
                if (text.length >= 5 && text.length <= 1000) {
                  // Skip jika ini menu text atau button text
                  if (text.toLowerCase().includes('write a comment') ||
                      text.toLowerCase().includes('tulis komentar') ||
                      text.toLowerCase().includes('like') ||
                      text.toLowerCase().includes('share') ||
                      text.toLowerCase().includes('comment') && text.length < 50 ||
                      text.toLowerCase().includes('balas') && text.length < 50) {
                    continue;
                  }
                  
                  // NEW: Skip if comment starts with our account name
                  if (accountName && text.toLowerCase().startsWith(accountName.toLowerCase())) {
                    console.log(`Skipping own comment: "${text.substring(0, 30)}"`);
                    continue;
                  }
                  
                  // Ambil comment text terpanjang yang valid
                  if (text.length > commentText.length) {
                    commentText = text;
                  }
                }
              }
              
              commentElement = commentElement.parentElement;
              attempts++;
            }
            
            if (commentText && commentText.length >= 5) {
              // Verifikasi ini bukan caption (caption biasanya di bagian atas)
              const rect = replyBtn.getBoundingClientRect();
              const isNotCaption = rect.top > 300; // Caption biasanya di top
              
              if (isNotCaption) {
                // Cek duplikat
                const isDuplicate = commentElements.some(item => 
                  item.text === commentText || 
                  item.text.substring(0, 50) === commentText.substring(0, 50)
                );
                
                if (!isDuplicate) {
                  console.log(`Adding comment: "${commentText.substring(0, 50)}..."`);
                  commentElements.push({
                    text: commentText,
                    preview: commentText.substring(0, 100),
                    ariaLabel: ariaLabel,
                    postUrl: postUrl // Add postUrl for hash generation
                  });
                }
              } else {
                console.log(`Skipping caption at top: "${commentText.substring(0, 30)}..."`);
              }
            }
          } catch (e) {
            console.log(`Error processing reply button: ${e.message}`);
            continue;
          }
        }

        console.log(`Found ${commentElements.length} valid comments`);
        return commentElements.slice(0, 5);
      
      } catch (e) {
        console.error("FATAL ERROR:", e.message);
        return [];
      }
    }, postUrl, accountName);

    // NEW: Filter out already replied comments
    const newComments = [];
    for (const comment of comments) {
      const hash = generateCommentHash(comment.text, postUrl);
      
      if (repliedComments[hash]) {
        console.log(`[${ACCOUNT_ID}] Skipping already replied comment: "${comment.text.substring(0, 50)}..."`);
        console.log(`[${ACCOUNT_ID}] Previously replied at: ${repliedComments[hash].repliedAt}`);
        continue;
      }
      
      newComments.push(comment);
    }

    console.log(`[${ACCOUNT_ID}] Found ${comments.length} total comments, ${newComments.length} new (not replied yet)`);
    
    if (newComments.length > 0) {
      newComments.forEach((c, i) => {
        console.log(`[${ACCOUNT_ID}] New Comment ${i+1}: ${c.preview}...`);
      });
    } else {
      console.log(`[${ACCOUNT_ID}] No new comments to reply to`);
      
      try {
        if (!fsSync.existsSync(ARTIFACTS_DIR)) {
          await fs.mkdir(ARTIFACTS_DIR, { recursive: true });
        }
        const screenshot = path.join(ARTIFACTS_DIR, `debug_post_${Date.now()}.png`);
        await page.screenshot({ path: screenshot, fullPage: true });
        console.log(`[${ACCOUNT_ID}] Debug screenshot: ${screenshot}`);
      } catch (e) {
        // Continue
      }
    }
    
    return newComments;
    
  } catch (error) {
    console.log(`[${ACCOUNT_ID}] Error loading post: ${error.message}`);
    return [];
  }
}

async function replyToComment(page, comment, geminiKeys, openRouterKeys, staticReplies) {
  try {
    console.log(`[${ACCOUNT_ID}] Replying to: "${comment.text.substring(0, 50)}..."`);
    
    // STEP 1: Klik tombol "Balas" - IMPROVED METHOD
    console.log(`[${ACCOUNT_ID}] Looking for reply button...`);
    
    // Karena kita sudah punya ariaLabel dari deteksi comment, gunakan itu!
    let buttonClicked = await page.evaluate((commentData) => {
      try {
        console.log(`Searching for comment: "${commentData.text.substring(0, 30)}"`);
        console.log(`Expected aria-label: "${commentData.ariaLabel}"`);
        
        // METHOD 1: Cari menggunakan aria-label yang sudah kita simpan
        if (commentData.ariaLabel) {
          const exactButton = document.querySelector(`[aria-label="${commentData.ariaLabel}"]`);
          if (exactButton) {
            exactButton.scrollIntoView({ behavior: 'smooth', block: 'center' });
            exactButton.click();
            console.log('Reply button clicked using exact aria-label!');
            return true;
          }
        }
        
        // METHOD 2: Cari semua tombol Balas, cocokkan dengan comment text
        const allReplyButtons = document.querySelectorAll(
          '[aria-label*="Balas"], [aria-label*="Reply"]'
        );
        
        console.log(`Found ${allReplyButtons.length} reply buttons total`);
        
        for (const btn of allReplyButtons) {
          const ariaLabel = btn.getAttribute('aria-label') || '';
          
          // Skip jika bukan tombol balas
          if (!ariaLabel.toLowerCase().includes('balas') && 
              !ariaLabel.toLowerCase().includes('reply')) {
            continue;
          }
          
          // Cari comment text di sekitar tombol ini
          let parent = btn;
          for (let i = 0; i < 8; i++) {
            if (!parent) break;
            
            const parentText = parent.textContent || '';
            
            // Cocokkan dengan comment text kita (minimal 30 karakter pertama)
            if (parentText.includes(commentData.text.substring(0, 30))) {
              console.log(`Found matching comment near button`);
              console.log(`Button aria-label: "${ariaLabel}"`);
              
              // Scroll button into view
              btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
              
              // Klik tombol
              btn.click();
              console.log('Reply button clicked!');
              return true;
            }
            
            parent = parent.parentElement;
          }
        }
        
        // METHOD 3: Cari dengan XPath (fallback)
        const xpathResults = document.evaluate(
          "//div[@role='button' and contains(@aria-label, 'Balas')]",
          document,
          null,
          XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
          null
        );
        
        console.log(`XPath found ${xpathResults.snapshotLength} buttons`);
        
        for (let i = 0; i < xpathResults.snapshotLength; i++) {
          const btn = xpathResults.snapshotItem(i);
          let parent = btn;
          
          for (let j = 0; j < 8; j++) {
            if (!parent) break;
            
            const parentText = parent.textContent || '';
            if (parentText.includes(commentData.text.substring(0, 30))) {
              btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
              btn.click();
              console.log('Reply button clicked using XPath!');
              return true;
            }
            
            parent = parent.parentElement;
          }
        }
        
        console.log('Reply button not found with all methods');
        return false;
        
      } catch (e) {
        console.error('Error clicking reply button:', e.message);
        return false;
      }
    }, comment);
    
    if (!buttonClicked) {
      console.log(`[${ACCOUNT_ID}] Could not click reply button`);
      
      // ALTERNATIVE: Coba klik menggunakan Puppeteer selector
      try {
        console.log(`[${ACCOUNT_ID}] Trying alternative click method...`);
        
        // Tunggu tombol muncul
        await page.waitForSelector('[aria-label*="Balas"], [aria-label*="Reply"]', {
          timeout: 5000
        });
        
        // Coba klik semua tombol Balas sampai ketemu yang benar
        const buttons = await page.$$('[aria-label*="Balas"], [aria-label*="Reply"]');
        console.log(`[${ACCOUNT_ID}] Found ${buttons.length} reply buttons via Puppeteer`);
        
        for (const btn of buttons) {
          try {
            // Get button position and text
            const ariaLabel = await page.evaluate(el => el.getAttribute('aria-label'), btn);
            console.log(`[${ACCOUNT_ID}] Checking button: ${ariaLabel}`);
            
            // Check if this button is near our comment
            const isNearComment = await page.evaluate((element, commentText) => {
              let parent = element;
              for (let i = 0; i < 8; i++) {
                if (!parent) break;
                const text = parent.textContent || '';
                if (text.includes(commentText.substring(0, 30))) {
                  return true;
                }
                parent = parent.parentElement;
              }
              return false;
            }, btn, comment.text);
            
            if (isNearComment) {
              console.log(`[${ACCOUNT_ID}] Found correct button, clicking...`);
              
              // Scroll into view
              await btn.evaluate(el => el.scrollIntoView({ behavior: 'smooth', block: 'center' }));
              await delay(500);
              
              // Click
              await btn.click();
              console.log(`[${ACCOUNT_ID}] Alternative click successful!`);
              buttonClicked = true;
              break;
            }
          } catch (e) {
            console.log(`[${ACCOUNT_ID}] Button click attempt failed: ${e.message}`);
            continue;
          }
        }
        
        if (!buttonClicked) {
          console.log(`[${ACCOUNT_ID}] All alternative methods failed`);
          
          // Debug screenshot
          const screenshot = path.join(ARTIFACTS_DIR, `debug_reply_btn_${Date.now()}.png`);
          await page.screenshot({ path: screenshot, fullPage: true });
          console.log(`[${ACCOUNT_ID}] Debug screenshot: ${screenshot}`);
          
          return false;
        }
        
      } catch (e) {
        console.log(`[${ACCOUNT_ID}] Alternative method error: ${e.message}`);
        return false;
      }
    }
    
    // STEP 2: Tunggu textarea muncul
    console.log(`[${ACCOUNT_ID}] Waiting for textarea...`);
    await delay(3000);
    
    // STEP 3: Generate reply text
    let replyText;
    
    if (config.ai_replies?.enabled && (openRouterKeys.length > 0 || geminiKeys.length > 0)) {
      const aiPrompt = (config.ai_replies?.gemini_prompt || "Balas: {COMMENT_TEXT}")
        .replace('{COMMENT_TEXT}', comment.text);
      
      const result = await generateAiComment({
        caption: comment.text,
        ctaLink: "",
        prompt: aiPrompt,
        openRouterKeys: openRouterKeys,
        geminiKeys: geminiKeys,
        staticComments: staticReplies,
        geminiWorkingIndex: 0,
        accountId: ACCOUNT_ID
      });
      
      replyText = result.comment;
      console.log(`[${ACCOUNT_ID}] -> ${result.provider} reply${result.model ? ` (${result.model})` : ''}`);
    } else {
      replyText = staticReplies[Math.floor(Math.random() * staticReplies.length)];
      console.log(`[${ACCOUNT_ID}] -> Static reply`);
    }
    
    // STEP 4: Ketik reply - MULTIPLE METHODS
    console.log(`[${ACCOUNT_ID}] Typing: "${replyText}"`);
    
    let typed = false;
    
    // METHOD 1: Cari textarea dengan aria-label
    try {
      const textareaVisible = await page.waitForSelector(
        '[aria-label*="Balas"], [aria-label*="Reply"], div[contenteditable="true"]',
        { timeout: 5000, visible: true }
      );
      
      if (textareaVisible) {
        console.log(`[${ACCOUNT_ID}] Textarea found, clicking...`);
        
        // Klik textarea
        await page.click('[aria-label*="Balas sebagai"], [aria-label*="Reply as"], div[contenteditable="true"]');
        await delay(500);
        
        // Clear existing text (jika ada)
        await page.keyboard.down('Control');
        await page.keyboard.press('A');
        await page.keyboard.up('Control');
        await page.keyboard.press('Backspace');
        
        // Type text
        await page.keyboard.type(replyText, { delay: 50 });
        
        typed = true;
        console.log(`[${ACCOUNT_ID}] Typed successfully using Method 1`);
      }
      
    } catch (e) {
      console.log(`[${ACCOUNT_ID}] Method 1 failed: ${e.message}`);
    }
    
    // METHOD 2: Direct DOM manipulation
    if (!typed) {
      try {
        const textareaFilled = await page.evaluate((text) => {
          // Cari textarea yang visible
          const textareas = document.querySelectorAll(
            'div[contenteditable="true"], ' +
            'div.xzsf02u[contenteditable="true"], ' +
            'div[aria-label*="Balas"], ' +
            'div[aria-label*="Reply"]'
          );
          
          console.log(`Found ${textareas.length} potential textareas`);
          
          for (const textarea of textareas) {
            // Check if visible
            if (textarea.offsetParent === null) continue;
            
            const rect = textarea.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) continue;
            
            console.log('Found visible textarea');
            
            // Focus
            textarea.click();
            textarea.focus();
            
            // Clear existing content
            textarea.innerHTML = '';
            
            // Set text - try multiple methods
            const p = textarea.querySelector('p');
            if (p) {
              p.textContent = text;
            } else {
              textarea.textContent = text;
            }
            
            // Trigger events
            textarea.dispatchEvent(new Event('focus', { bubbles: true }));
            textarea.dispatchEvent(new Event('input', { bubbles: true }));
            textarea.dispatchEvent(new Event('change', { bubbles: true }));
            
            console.log('Textarea filled with DOM manipulation');
            return true;
          }
          
          return false;
        }, replyText);
        
        if (textareaFilled) {
          typed = true;
          console.log(`[${ACCOUNT_ID}] Typed successfully using Method 2`);
        }
      } catch (e) {
        console.log(`[${ACCOUNT_ID}] Method 2 failed: ${e.message}`);
      }
    }
    
    // METHOD 3: Focus and type (fallback)
    if (!typed) {
      try {
        await page.evaluate(() => {
          const textareas = document.querySelectorAll('div[contenteditable="true"]');
          for (const textarea of textareas) {
            if (textarea.offsetParent !== null) {
              textarea.focus();
              return;
            }
          }
        });
        
        await delay(500);
        await page.keyboard.type(replyText, { delay: 50 });
        
        typed = true;
        console.log(`[${ACCOUNT_ID}] Typed successfully using Method 3`);
        
      } catch (e) {
        console.log(`[${ACCOUNT_ID}] Method 3 failed: ${e.message}`);
      }
    }
    
    if (!typed) {
      console.log(`[${ACCOUNT_ID}] Could not type reply`);
      
      // Debug screenshot
      const screenshot = path.join(ARTIFACTS_DIR, `debug_type_fail_${Date.now()}.png`);
      await page.screenshot({ path: screenshot });
      console.log(`[${ACCOUNT_ID}] Debug screenshot: ${screenshot}`);
      
      return false;
    }
    
    // STEP 5: Kirim dengan Enter
    await delay(1000);
    await page.keyboard.press('Enter');
    await delay(3000);
    
    console.log(`[${ACCOUNT_ID}] Reply sent: "${replyText}"`);
    
    // NEW: Save to memory after successful reply
    const commentHash = generateCommentHash(comment.text, comment.postUrl);
    await saveRepliedComment(commentHash, comment);
    
    // Log
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] Replied to: "${comment.text.substring(0, 100)}" | Reply: "${replyText}"\n`;
    await fs.appendFile(LOG_PATH, logEntry);
    
    return true;
    
  } catch (error) {
    console.log(`[${ACCOUNT_ID}] Error replying: ${error.message}`);
    console.log(`[${ACCOUNT_ID}] Stack: ${error.stack}`);
    
    // Debug screenshot
    try {
      if (!fsSync.existsSync(ARTIFACTS_DIR)) {
        await fs.mkdir(ARTIFACTS_DIR, { recursive: true });
      }
      const screenshot = path.join(ARTIFACTS_DIR, `debug_error_${Date.now()}.png`);
      await page.screenshot({ path: screenshot, fullPage: true });
      console.log(`[${ACCOUNT_ID}] Error screenshot: ${screenshot}`);
    } catch (e) {
      // Continue
    }
    
    return false;
  }
}

async function main() {
  let browser = null;
  try {
    console.log(`[${ACCOUNT_ID}] === FacebookPro Blaster - Auto Reply Comments Bot (Enhanced) ===`);
    
    try {
      // Start notification removed (executor handles queue logging)
    } catch (e) {
      console.error(`[${ACCOUNT_ID}] Warning: Failed to send Telegram start notification`);
    }
    
    await fs.mkdir(ARTIFACTS_DIR, { recursive: true });
    
    console.log(`[${ACCOUNT_ID}] Loading cookies and API keys...`);
    const cookies = await loadCookiesFromFile();
    const geminiKeys = await loadGeminiKeys();
    
    let openRouterKeys = [];
    if (config.ai_replies?.use_openrouter !== false) {
      openRouterKeys = await loadOpenRouterKeys(OPENROUTER_KEYS_PATH);
      console.log(`[${ACCOUNT_ID}] Loaded ${openRouterKeys.length} OpenRouter API keys`);
    }
    
    console.log(`[${ACCOUNT_ID}] Loaded ${geminiKeys.length} Gemini API keys (fallback)`);
    
    // NEW: Load reply history
    const repliedComments = await loadRepliedComments();
    
    console.log(`[${ACCOUNT_ID}] Launching browser...`);
    browser = await puppeteer.launch({
      headless: config.headless === false ? false : (config.headless === true || config.headless === "new" ? "new" : "new"),
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage"
      ],
      defaultViewport: {
        width: 1280,
        height: 1024,
        deviceScaleFactor: 1  // **FIX**: Normal zoom level
      },
      timeout: 90000
    });
    
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 1024 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    await page.setCookie(...cookies);
    console.log(`[${ACCOUNT_ID}] Cookies loaded`);
    
    console.log(`[${ACCOUNT_ID}] Opening Facebook...`);
    await page.goto('https://www.facebook.com/', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });
    await delay(5000);
    
    const title = await page.title();
    if (title.includes('Log') || title.includes('login') || title.includes('Login')) {
      throw new Error(`[${ACCOUNT_ID}] Login gagal! Periksa cookies.json. Title: ${title}`);
    }
    console.log(`[${ACCOUNT_ID}] Login berhasil: ${title}`);
    
    // NEW: Get account name for self-reply filter
    const accountName = await getAccountName(page);
    
    const notifications = await getNotifications(page);
    if (notifications.length === 0) {
      console.log(`[${ACCOUNT_ID}] No comment notifications found`);
      try {
        await notify.success(ACCOUNT_ID, BOT_NAME, "No comment notifications to reply to");
      } catch (e) {
        console.error(`[${ACCOUNT_ID}] Warning: Failed to send Telegram success notification`);
      }
      return;
    }
    
    let totalReplies = 0;
    const maxReplies = config.maxReplies || 10;
    
    for (const notification of notifications) {
      if (totalReplies >= maxReplies) {
        console.log(`[${ACCOUNT_ID}] Reached maximum replies limit: ${maxReplies}`);
        break;
      }
      
      try {
        // UPDATED: Pass repliedComments and accountName
        const comments = await goToPostAndFindComments(page, notification.link, repliedComments, accountName);
        
        for (const comment of comments) {
          if (totalReplies >= maxReplies) break;
          
          // UPDATED: Pass accountName to skip check
          if (await shouldSkipComment(comment.text, accountName)) {
            continue;
          }
          
          const replied = await replyToComment(
            page, 
            comment, 
            geminiKeys, 
            openRouterKeys,
            config.static_replies || ["Terima kasih!"]
          );
          
          if (replied) {
            totalReplies++;
            
            const minInterval = (config.minIntervalSeconds || 30) * 1000;
            const maxInterval = (config.maxIntervalSeconds || 120) * 1000;
            const waitTime = Math.floor(Math.random() * (maxInterval - minInterval + 1)) + minInterval;
            console.log(`[${ACCOUNT_ID}] Waiting ${waitTime/1000} seconds...`);
            await delay(waitTime);
          }
        }
      } catch (error) {
        console.log(`[${ACCOUNT_ID}] Error processing notification: ${error.message}`);
        continue;
      }
    }
    
    console.log(`[${ACCOUNT_ID}] AUTO REPLY COMPLETED!`);
    console.log(`[${ACCOUNT_ID}] Total replies sent: ${totalReplies}`);
    console.log(`[${ACCOUNT_ID}] Total comments in memory: ${Object.keys(repliedComments).length + totalReplies}`);
    
    try {
      await notify.success(ACCOUNT_ID, BOT_NAME, `${totalReplies} replies sent`);
    } catch (e) {
      console.error(`[${ACCOUNT_ID}] Warning: Failed to send Telegram success notification`);
    }
    
    try {
      await page.screenshot({
        path: path.join(ARTIFACTS_DIR, `reply_success_${Date.now()}.png`)
      });
      console.log(`[${ACCOUNT_ID}] Success screenshot saved`);
    } catch (e) {
      console.error(`[${ACCOUNT_ID}] Warning: Failed to save success screenshot`);
    }
    
  } catch (error) {
    console.error(`[${ACCOUNT_ID}] ERROR:`, error.message);
    console.error(`[${ACCOUNT_ID}] Stack:`, error.stack);
    
    try {
      await notify.error(ACCOUNT_ID, BOT_NAME, error.message);
    } catch (e) {
      console.error(`[${ACCOUNT_ID}] Warning: Failed to send Telegram error notification`);
    }
    
    if (browser) {
      try {
        const pages = await browser.pages();
        const page = pages[0];
        const errorScreenshot = path.join(ARTIFACTS_DIR, `reply_error_${Date.now()}.png`);
        await page.screenshot({ path: errorScreenshot });
        console.log(`[${ACCOUNT_ID}] Screenshot error disimpan: ${errorScreenshot}`);
      } catch (e) {
        console.error(`[${ACCOUNT_ID}] Warning: Failed to take error screenshot`);
      }
    }
    
    process.exit(1);
  } finally {
    if (browser) {
      try {
        await browser.close();
        console.log(`[${ACCOUNT_ID}] Browser ditutup`);
      } catch (e) {
        console.error(`[${ACCOUNT_ID}] Warning: Error closing browser`);
      }
    }
  }
}

main();

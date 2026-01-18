const { createStealthBrowser, applyAntiDetection, humanDelay, dismissFacebookPopups } = require('./anti-detection');
const fs = require("fs").promises;
const path = require("path");

// Import AI comment generator module
const { generateAiComment, typeCommentSafely, loadOpenRouterKeys } = require('./commentgenerator');

// Multi-account support
const ACCOUNT_ID = process.argv[2] || process.env.ACCOUNT_ID || 'default';
const ACCOUNTS_DIR = process.env.ACCOUNTS_DIR || path.join(__dirname, "../accounts");
const BOT_NAME = process.env.BOT_NAME || 'timelinecomment';

// Load config
let config;
try {
  const configPath = path.join(ACCOUNTS_DIR, ACCOUNT_ID, "bots", `${BOT_NAME}.json`);
  config = require(configPath);
} catch (e) {
  config = {
    headless: "new",
    targetURL: "https://www.facebook.com/",
    postsToComment: 5,
    minIntervalSeconds: 60,
    maxIntervalSeconds: 180,
    autoLike: true,
    blockAds: true,
    blockKeywords: ["sponsored", "bersponsor"],
    ai_settings: {
      use_openrouter: true,
      url_shortener_enabled: false,
      gemini_prompt: "Buat komentar untuk postingan teman: {CAPTION_POSTINGAN}. Link: {LINK_CTA}. Friendly dan natural, 1-2 kalimat.",
      typing_delay_after_click: 2000,
      openrouter_model: "anthropic/claude-3.5-sonnet",
      openrouter_temperature: 0.7,
      openrouter_max_tokens: 150,
      openrouter_system_prompt: "You are a helpful assistant that generates natural, engaging Facebook comments in Indonesian language. Keep comments short, friendly, and relevant to the post content.",
      openrouter_fallback_comments: [
        "Menarik sekali! 👍",
        "Setuju banget dengan ini",
        "Terima kasih sudah berbagi",
        "Sangat informatif",
        "Keren! 🔥"
      ]
    }
  };
}

// Inline: Apply environment variable overrides (for Electron)
if (process.env.HEADLESS) {
  config.headless = process.env.HEADLESS;
}

// Paths
const COMMENTS_PATH = path.join(ACCOUNTS_DIR, ACCOUNT_ID, "comments.txt");
const CTA_LINK_PATH = path.join(ACCOUNTS_DIR, ACCOUNT_ID, "cta_link.txt");
const GEMINI_KEYS_PATH = path.join(ACCOUNTS_DIR, ACCOUNT_ID, "gemini_keys.txt");
const OPENROUTER_KEYS_PATH = path.join(ACCOUNTS_DIR, ACCOUNT_ID, "openrouter_keys.txt");
const ARTIFACTS_DIR = path.join(__dirname, "../artifacts", ACCOUNT_ID);
const COOKIES_PATH = path.join(ACCOUNTS_DIR, ACCOUNT_ID, "cookies.json");

// Telegram logger
const notify = require('./notify');

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const getRandomInterval = () => {
  const min = config.minIntervalSeconds || 60;
  const max = config.maxIntervalSeconds || 180;
  return 1000 * (Math.floor(Math.random() * (max - min + 1)) + min);
};

// Helper: Safe screenshot
async function safeScreenshot(page, filepath, options = {}) {
  try {
    if (!page || page.isClosed()) return false;
    await page.screenshot({ path: filepath, timeout: 5000, ...options });
    return true;
  } catch (error) {
    return false;
  }
}

// Helper: Check if error is fatal
function isFatalError(error) {
  const fatalMessages = ['Target closed', 'Session closed', 'Protocol error'];
  return fatalMessages.some(msg => error.message && error.message.includes(msg));
}

// Ad Blocker Functions - More precise detection
async function isPostSponsored(post) {
  try {
    // Method 1: Check for specific sponsored elements within the post only
    const sponsoredInPost = await post.evaluate(() => {
      // Look for sponsored indicators within this post only
      const sponsoredSelectors = [
        '[aria-label*="Sponsored"]',
        '[aria-label*="Bersponsor"]',
        'span:contains("Sponsored")',
        'span:contains("Bersponsor")',
        '[data-testid*="ad"]',
        '[data-ft*="ad"]',
        '.x1yztbdb.x1n2xrkh', // Common ad container class
        '.x1lliihq.x1k90msu' // Another ad container class
      ];

      for (const selector of sponsoredSelectors) {
        const elements = Array.from(document.querySelectorAll(selector));
        // Check if any of these elements are within this post
        for (const element of elements) {
          // Check if element is a descendant of the post
          if (element.closest('[role="article"], [aria-posinset]') === document.querySelector('[role="article"], [aria-posinset]')) {
            return true;
          }
        }
      }

      return false;
    });

    if (sponsoredInPost) {
      return true;
    }

    // Method 2: Check for sponsored text in the post content only
    const sponsoredTextInPost = await post.evaluate(() => {
      const text = document.body.textContent.toLowerCase();
      // Only consider it sponsored if the text appears multiple times or in specific contexts
      return (text.includes('sponsored') || text.includes('bersponsor')) &&
        (text.includes('advertiser') || text.includes('iklan') || text.includes('promoted'));
    });

    return sponsoredTextInPost;
  } catch (error) {
    return false;
  }
}

async function containsBlockedKeywords(post, keywords) {
  try {
    const postText = await post.evaluate(el => el.textContent || '');
    const lowerPostText = postText.toLowerCase();

    for (const keyword of keywords) {
      if (lowerPostText.includes(keyword.toLowerCase())) {
        return true;
      }
    }

    return false;
  } catch (error) {
    return false;
  }
}

async function shouldBlockPost(post, blockKeywords) {
  if (await isPostSponsored(post)) {
    console.log(`[${ACCOUNT_ID}] -> Post is SPONSORED - SKIPPING`);
    return true;
  }

  if (blockKeywords && blockKeywords.length > 0) {
    if (await containsBlockedKeywords(post, blockKeywords)) {
      console.log(`[${ACCOUNT_ID}] -> Post contains BLOCKED KEYWORDS - SKIPPING`);
      return true;
    }
  }

  return false;
}

// Enhanced caption extraction with UI element filtering
async function extractPostCaption(post) {
  try {
    // Primary selectors (prioritized)
    const primarySelectors = [
      'div[data-ad-rendering-role="story_message"]',
      'div[data-ad-comet-preview="message"]',
      'div[data-ad-preview="message"]'
    ];

    // Try primary selectors first
    for (const selector of primarySelectors) {
      try {
        const elements = await post.$$(selector);

        for (const element of elements) {
          const text = await element.evaluate(el => {
            const getAllText = (node) => {
              if (node.nodeType === Node.TEXT_NODE) {
                return node.textContent.trim();
              }

              if (node.nodeType === Node.ELEMENT_NODE) {
                const role = node.getAttribute('role');
                const ariaLabel = node.getAttribute('aria-label');

                if (role === 'button' ||
                  role === 'link' ||
                  ariaLabel?.includes('Like') ||
                  ariaLabel?.includes('Comment') ||
                  ariaLabel?.includes('Share')) {
                  return '';
                }

                let text = '';
                for (const child of node.childNodes) {
                  text += getAllText(child) + ' ';
                }
                return text;
              }

              return '';
            };

            return getAllText(el).trim();
          });

          if (text && text.length > 10 && !text.includes('Like') && !text.includes('Comment')) {
            return text;
          }
        }
      } catch (e) {
        continue;
      }
    }

    // Fallback selectors
    const fallbackSelectors = [
      '[data-testid="post_message"]',
      'div[data-testid="post_message"]',
      '.userContent',
      'div.xdj266r.x11i5rnm.xat24cr.x1mh8g0r',
      'div[dir="auto"][style*="text-align"]'
    ];

    for (const selector of fallbackSelectors) {
      try {
        const elements = await post.$$(selector);

        for (const element of elements) {
          const text = await element.evaluate(el => {
            const getAllText = (node) => {
              if (node.nodeType === Node.TEXT_NODE) {
                return node.textContent.trim();
              }

              if (node.nodeType === Node.ELEMENT_NODE) {
                const role = node.getAttribute('role');
                const ariaLabel = node.getAttribute('aria-label');

                if (role === 'button' ||
                  role === 'link' ||
                  ariaLabel?.includes('Like') ||
                  ariaLabel?.includes('Comment') ||
                  ariaLabel?.includes('Share')) {
                  return '';
                }

                let text = '';
                for (const child of node.childNodes) {
                  text += getAllText(child) + ' ';
                }
                return text;
              }

              return '';
            };

            return getAllText(el).trim();
          });

          if (text && text.length > 10 && !text.includes('Like') && !text.includes('Comment')) {
            return text;
          }
        }
      } catch (e) {
        continue;
      }
    }

    // Last resort: find post content within the post container only
    const postContent = await post.evaluate((postEl) => {
      // UI element patterns to exclude
      const uiPatterns = [
        /^\d+\s+(Obrolan|notifikasi|Chat|notification)/i,
        /Belum Dibaca|Unread/i,
        /Jumlah notifikasi/i,
        /ObrolanSemua|ChatAll/i,
        /Memiliki konten baru/i,
        /^\d+\s*:\s*\d+$/,
        /^\d+\s+(jam|menit|detik|hour|minute|second)/i,
        /^(Like|Comment|Share|Suka|Komentar|Bagikan)$/,
        /Pelajari selengkapnya|Learn more/i,
        /Sponsored|Bersponsor/i
      ];

      // Find all text-containing divs within this specific post
      const textDivs = Array.from(postEl.querySelectorAll('div[dir="auto"]'));

      let bestCandidate = '';
      let maxScore = 0;

      for (const div of textDivs) {
        // Get only direct text content
        let text = '';
        for (const child of div.childNodes) {
          if (child.nodeType === Node.TEXT_NODE) {
            text += child.textContent + ' ';
          } else if (child.nodeType === Node.ELEMENT_NODE && child.tagName === 'SPAN') {
            text += child.textContent + ' ';
          }
        }
        text = text.trim();

        // Skip if too short or matches UI patterns
        if (text.length < 15) continue;

        let isUIElement = false;
        for (const pattern of uiPatterns) {
          if (pattern.test(text)) {
            isUIElement = true;
            break;
          }
        }

        if (isUIElement) continue;

        // Skip if it's part of action bar
        const role = div.getAttribute('role');
        const ariaLabel = div.getAttribute('aria-label');
        if (role === 'button' || role === 'navigation' || role === 'toolbar') continue;
        if (ariaLabel && (ariaLabel.includes('Like') || ariaLabel.includes('Comment'))) continue;

        // Check if element is within post bounds
        const rect = div.getBoundingClientRect();
        const postRect = postEl.getBoundingClientRect();

        if (rect.left < postRect.left || rect.right > postRect.right) continue;

        // Score based on length and position
        let score = text.length;

        // Prefer text in upper-middle section
        const relativeTop = (rect.top - postRect.top) / postRect.height;
        if (relativeTop > 0.1 && relativeTop < 0.5) {
          score += 100;
        }

        // Prefer text with sentence structure
        if (/[.!?]/.test(text)) {
          score += 50;
        }

        if (score > maxScore) {
          maxScore = score;
          bestCandidate = text;
        }
      }

      return bestCandidate;
    });

    if (postContent && postContent.length > 15) {
      return postContent;
    }

    return "";

  } catch (error) {
    return "";
  }
}

async function likePost(page, post) {
  try {
    console.log(`[${ACCOUNT_ID}] -> Trying to like post...`);

    // Strategy 1: Find Like button within post scope using specific selectors
    const likeResult = await post.evaluate((postElement) => {
      // Function to check if element or its children contain Like/Suka
      const isLikeButton = (element) => {
        const ariaLabel = element.getAttribute('aria-label') || '';
        const text = element.textContent || '';

        // Check for like-related text
        const hasLikeText = ariaLabel.match(/^(suka|like|sukai)$/i) ||
          text.match(/^(suka|like|sukai)$/i);

        // Must not be already liked
        const isPressed = element.getAttribute('aria-pressed') === 'true';
        const alreadyLiked = ariaLabel.includes('Hapus suka') ||
          ariaLabel.includes('Unlike') ||
          ariaLabel.includes('Remove like');

        return hasLikeText && !isPressed && !alreadyLiked;
      };

      // Strategy 1a: Find by exact aria-label within post
      const likeByAriaLabel = Array.from(postElement.querySelectorAll('div[role="button"], span[role="button"]'))
        .find(btn => {
          const label = (btn.getAttribute('aria-label') || '').trim();
          return (label === 'Suka' || label === 'Like' || label === 'Sukai') &&
            btn.getAttribute('aria-pressed') !== 'true' &&
            btn.offsetParent !== null;
        });

      if (likeByAriaLabel) {
        const rect = likeByAriaLabel.getBoundingClientRect();
        if (rect.width > 20 && rect.height > 15) {
          likeByAriaLabel.click();
          return { success: true, method: 'aria-label', label: likeByAriaLabel.getAttribute('aria-label') };
        }
      }

      // Strategy 1b: Find first clickable button in reactions toolbar
      const toolbars = Array.from(postElement.querySelectorAll('div[role="toolbar"]'));
      for (const toolbar of toolbars) {
        // Get immediate child buttons only (not nested)
        const buttons = Array.from(toolbar.children).filter(child =>
          child.getAttribute('role') === 'button' ||
          child.tagName === 'DIV' && child.hasAttribute('tabindex')
        );

        if (buttons.length >= 2) { // Typically: Like, Comment, Share
          const firstBtn = buttons[0];

          // Verify it's a like button
          if (isLikeButton(firstBtn)) {
            const rect = firstBtn.getBoundingClientRect();
            if (rect.width > 20 && rect.height > 15 && firstBtn.offsetParent !== null) {
              firstBtn.click();
              return { success: true, method: 'toolbar-first', label: firstBtn.getAttribute('aria-label') || firstBtn.textContent };
            }
          }
        }
      }

      // Strategy 1c: Find by SVG icon (thumbs up) within clickable button
      const buttonsWithSvg = Array.from(postElement.querySelectorAll('div[role="button"], span[role="button"]'))
        .filter(btn => btn.querySelector('svg'));

      for (const btn of buttonsWithSvg) {
        if (isLikeButton(btn)) {
          const rect = btn.getBoundingClientRect();
          if (rect.width > 20 && rect.height > 15 && btn.offsetParent !== null) {
            btn.click();
            return { success: true, method: 'svg-icon', label: btn.getAttribute('aria-label') || 'Like' };
          }
        }
      }

      // Strategy 1d: Find by text content matching (last resort)
      const allInteractive = Array.from(postElement.querySelectorAll('div[role="button"], span[role="button"], div[tabindex="0"]'));

      for (const element of allInteractive) {
        const text = (element.textContent || '').trim();
        const ariaLabel = (element.getAttribute('aria-label') || '').trim();

        if ((text === 'Suka' || text === 'Like' || ariaLabel === 'Suka' || ariaLabel === 'Like') &&
          element.getAttribute('aria-pressed') !== 'true' &&
          !ariaLabel.includes('Hapus') &&
          !ariaLabel.includes('Unlike')) {

          const rect = element.getBoundingClientRect();
          if (rect.width > 20 && rect.height > 15 && element.offsetParent !== null) {
            element.click();
            return { success: true, method: 'text-match', label: ariaLabel || text };
          }
        }
      }

      return { success: false };
    });

    if (likeResult.success) {
      console.log(`[${ACCOUNT_ID}] -> Post liked`);
      await delay(1000);
      return true;
    }

    console.log(`[${ACCOUNT_ID}] -> Like button not found or already liked`);
    await delay(1000);
    return false;

  } catch (error) {
    console.log(`[${ACCOUNT_ID}] -> Failed to like: ${error.message}`);
    return false;
  }
}

async function loadCookiesFromFile() {
  try {
    console.log(`[${ACCOUNT_ID}] Loading cookies from: ${COOKIES_PATH}`);
    const cookiesData = await fs.readFile(COOKIES_PATH, "utf8");
    const cookies = JSON.parse(cookiesData);

    if (!Array.isArray(cookies) || cookies.length === 0) {
      throw new Error("Cookies file is empty or invalid format");
    }

    return cookies.map(cookie => ({
      name: cookie.name,
      value: cookie.value,
      domain: cookie.domain || '.facebook.com',
      path: cookie.path || '/',
      httpOnly: !!cookie.httpOnly,
      secure: !!cookie.secure,
      sameSite: ['Strict', 'Lax', 'None'].includes(cookie.sameSite) ? cookie.sameSite : 'Lax'
    }));
  } catch (error) {
    throw new Error(`[${ACCOUNT_ID}] Failed to load cookies: ${error.message}`);
  }
}

async function loadComments() {
  try {
    const data = await fs.readFile(COMMENTS_PATH, "utf8");
    const comments = data.split("---").map(comment => comment.trim()).filter(comment => comment);
    if (comments.length === 0) {
      throw new Error(`[${ACCOUNT_ID}] Comments file is empty`);
    }
    return comments;
  } catch (error) {
    if (error.code === "ENOENT") {
      console.log(`[${ACCOUNT_ID}] comments.txt not found, creating default...`);
      const defaultComments = [
        "Bagus banget ini!",
        "Keren! Thanks for sharing",
        "Mantap",
        "Nice post!",
        "Suka banget dengan konten ini"
      ].join("\n---\n");
      await fs.writeFile(COMMENTS_PATH, defaultComments, "utf8");
      return defaultComments.split("---").map(c => c.trim());
    }
    throw error;
  }
}

async function loadCtaLink() {
  try {
    const data = await fs.readFile(CTA_LINK_PATH, "utf8");
    return data.trim();
  } catch (error) {
    console.log(`[${ACCOUNT_ID}] cta_link.txt not found`);
    return "";
  }
}

async function loadGeminiApiKeys() {
  try {
    const data = await fs.readFile(GEMINI_KEYS_PATH, "utf8");
    const keys = data.split("\n").map(key => key.trim()).filter(key => key && key.startsWith("AIzaSy"));
    if (keys.length === 0) {
      console.log(`[${ACCOUNT_ID}] Warning: No valid Gemini API keys found`);
      return [];
    }
    return keys;
  } catch (error) {
    if (error.code === "ENOENT") {
      console.log(`[${ACCOUNT_ID}] Warning: gemini_keys.txt not found`);
      return [];
    }
    throw error;
  }
}

async function main() {
  let browser;

  try {
    console.log(`[${ACCOUNT_ID}] === FacebookPro Blaster - Auto Comment Timeline (No Logging) ===`);
    console.log(`[${ACCOUNT_ID}] Ad Blocking: ${config.blockAds !== false ? 'Enabled' : 'Disabled'}`);
    console.log(`[${ACCOUNT_ID}] Auto-like: ${config.autoLike !== false ? 'Yes' : 'No'}`);

    if (config.blockAds !== false && config.blockKeywords) {
      console.log(`[${ACCOUNT_ID}] Blocked keywords: ${config.blockKeywords.join(', ')}`);
    }

    await fs.mkdir(ARTIFACTS_DIR, { recursive: true });

    const comments = await loadComments();
    console.log(`[${ACCOUNT_ID}] Loaded ${comments.length} static comments`);

    let ctaLink = "";
    let geminiKeys = [];
    let openRouterKeys = [];

    const potentialAI = (await fs.access(OPENROUTER_KEYS_PATH).then(() => true).catch(() => false)) ||
      (await fs.access(GEMINI_KEYS_PATH).then(() => true).catch(() => false));

    if (potentialAI) {
      ctaLink = await loadCtaLink();
      geminiKeys = await loadGeminiApiKeys();
      openRouterKeys = await loadOpenRouterKeys(OPENROUTER_KEYS_PATH);

      console.log(`[${ACCOUNT_ID}] Loaded ${openRouterKeys.length} OpenRouter API keys`);
      console.log(`[${ACCOUNT_ID}] Loaded ${geminiKeys.length} Gemini API keys (fallback)`);
    }

    const useAI = (openRouterKeys.length > 0 || geminiKeys.length > 0);

    if (!useAI && comments.length === 0) {
      throw new Error(`[${ACCOUNT_ID}] No AI keys and comments.txt is empty!`);
    }


    // Determine headless mode
    const isProduction = process.env.NODE_ENV === 'production';
    const headlessMode = isProduction
      ? 'new'
      : (config.headless !== undefined ? config.headless : 'new');

    // Removed verbose logs to reduce clutter
    // console.log(`[${ACCOUNT_ID}] Environment: ${isProduction ? 'PRODUCTION' : 'DEVELOPMENT'}`);
    // console.log(`[${ACCOUNT_ID}] Headless mode: ${headlessMode} ${isProduction ? '(forced for VPS)' : '(from config)'}`);

    // Create stealth browser with anti-detection
    const stealthResult = await createStealthBrowser({
      headless: headlessMode,
      timeout: 90000,
      protocolTimeout: 180000,
      defaultTimeout: 60000,
      navigationTimeout: 90000
    }, ACCOUNT_ID);

    browser = stealthResult.browser;
    const page = stealthResult.page;

    console.log(`[${ACCOUNT_ID}] Loading cookies...`);
    const cookies = await loadCookiesFromFile();
    await page.setCookie(...cookies);
    console.log(`[${ACCOUNT_ID}] ${cookies.length} cookies loaded`);

    console.log(`[${ACCOUNT_ID}] Navigating to: ${config.targetURL}`);
    try {
      await page.goto(config.targetURL, {
        waitUntil: "domcontentloaded",
        timeout: 90000
      });
    } catch (navError) {
      console.log(`[${ACCOUNT_ID}] Navigation timeout, continuing...`);
    }

    console.log(`[${ACCOUNT_ID}] Waiting for initial content load (15s)...`);
    await delay(15000);

    // Dismiss any popups
    await dismissFacebookPopups(page, ACCOUNT_ID);

    const title = await page.title();
    if (title.includes('Log') || title.includes('login')) {
      throw new Error(`[${ACCOUNT_ID}] Login failed! Check cookies.json`);
    }

    console.log(`[${ACCOUNT_ID}] Page ready: ${title}`);

    // Additional stabilization to ensure posts are fully rendered
    console.log(`[${ACCOUNT_ID}] Ensuring timeline posts are fully rendered...`);
    await delay(3000);

    const processedPosts = new Set();
    let commentIndex = 0;
    let commentsPosted = 0;
    let postsLikedOnly = 0;
    let adsBlocked = 0;
    console.log(`[${ACCOUNT_ID}] Target: ${config.postsToComment} comments`);

    let geminiWorkingIndex = 0;
    let currentPostIndex = 1; // Start with aria-posinset="1"
    let noNewPostsCount = 0;

    // Circuit breaker to prevent infinite loop
    let consecutiveNotFound = 0;
    let maxConsecutiveNotFound = 10; // Exit after 10 consecutive failures
    let totalScrollAttempts = 0;
    let maxScrollAttempts = 50; // Max 50 scroll attempts total
    let lastPostCount = 0;
    let samePostCountStreak = 0;

    // Function to scroll to next post - moved inside main to access page
    async function scrollToNextPost(currentPos) {
      try {
        const nextPos = currentPos + 1;
        console.log(`[${ACCOUNT_ID}] -> Scrolling to next container (aria-posinset="${nextPos}")`);

        const scrolled = await page.evaluate((targetPos) => {
          const nextPost = document.querySelector(`div[aria-posinset="${targetPos}"]`);
          if (nextPost) {
            nextPost.scrollIntoView({ behavior: 'smooth', block: 'center' });
            return true;
          }
          return false;
        }, nextPos);

        if (!scrolled) {
          console.log(`[${ACCOUNT_ID}] -> Next container not found, using fallback scroll`);
          await page.evaluate(() => {
            window.scrollBy(0, window.innerHeight * 0.7);
          });
        }

        await delay(2000);
        return true;
      } catch (error) {
        console.log(`[${ACCOUNT_ID}] -> Failed to scroll to next post: ${error.message}`);
        return false;
      }
    }

    while (commentsPosted < config.postsToComment) {
      // Get all visible posts
      const posts = await page.$$("div[role='article'], div[aria-posinset]");

      console.log(`[${ACCOUNT_ID}] === Loop iteration: commentsPosted=${commentsPosted}/${config.postsToComment}, currentPostIndex=${currentPostIndex} ===`);

      if (posts.length === 0) {
        console.log(`[${ACCOUNT_ID}] ⚠️  No posts found with selectors: div[role='article'], div[aria-posinset]`);
        console.log(`[${ACCOUNT_ID}] Waiting 10s and retrying...`);
        await delay(10000);
        noNewPostsCount++;
        if (noNewPostsCount > 5) {
          console.log(`[${ACCOUNT_ID}] ❌ No posts found after ${noNewPostsCount} attempts. Exiting.`);
          break;
        }
        continue;
      }

      console.log(`[${ACCOUNT_ID}] ✓ Found ${posts.length} potential posts on page`);

      // Reset counter when we find posts
      noNewPostsCount = 0;

      // Find post with current aria-posinset
      const post = await page.$(`div[aria-posinset="${currentPostIndex}"]`);

      if (!post) {
        consecutiveNotFound++;
        totalScrollAttempts++;

        console.log(`[${ACCOUNT_ID}] ⚠️  No post found with aria-posinset="${currentPostIndex}". Scrolling for more content... (Attempt ${consecutiveNotFound}/${maxConsecutiveNotFound}, Total scrolls: ${totalScrollAttempts}/${maxScrollAttempts})`);

        // Circuit breaker: Check if we should exit
        if (consecutiveNotFound >= maxConsecutiveNotFound) {
          console.log(`[${ACCOUNT_ID}] ⚠️ Circuit breaker triggered: ${maxConsecutiveNotFound} consecutive posts not found`);
          console.log(`[${ACCOUNT_ID}] Likely reached end of feed. Exiting gracefully.`);
          break;
        }

        if (totalScrollAttempts >= maxScrollAttempts) {
          console.log(`[${ACCOUNT_ID}] ⚠️ Circuit breaker triggered: Maximum scroll attempts (${maxScrollAttempts}) reached`);
          console.log(`[${ACCOUNT_ID}] Exiting to prevent infinite loop.`);
          break;
        }

        // Check if we're seeing the same number of posts repeatedly (stuck)
        const currentPostsCount = posts.length;
        if (currentPostsCount === lastPostCount) {
          samePostCountStreak++;
          if (samePostCountStreak >= 5) {
            console.log(`[${ACCOUNT_ID}] ⚠️ Circuit breaker triggered: Same post count (${currentPostsCount}) for ${samePostCountStreak} iterations`);
            console.log(`[${ACCOUNT_ID}] Feed appears stuck. Exiting.`);
            break;
          }
        } else {
          samePostCountStreak = 0;
        }
        lastPostCount = currentPostsCount;

        await page.evaluate(() => {
          window.scrollBy(0, window.innerHeight * 0.7);
        });
        await delay(3000);

        // Try to find post again after scrolling
        const newPost = await page.$(`div[aria-posinset="${currentPostIndex}"]`);
        if (!newPost) {
          console.log(`[${ACCOUNT_ID}] ⚠️  Still not found after scroll. Moving to next index.`);
          // If still not found, increment index and continue
          currentPostIndex++;
          if (currentPostIndex > 20) {
            // Reset if we've gone too far
            console.log(`[${ACCOUNT_ID}] ⚠️  Index too high (${currentPostIndex}), resetting to 1...`);
            currentPostIndex = 1;
            await page.evaluate(() => {
              window.scrollTo(0, 0);
            });
            await delay(2000);
          }
          continue;
        } else {
          // Found post after scrolling, reset consecutive counter
          consecutiveNotFound = 0;
        }
      } else {
        // Post found, reset consecutive counter
        consecutiveNotFound = 0;
      }

      // Declare postId outside try block so it's accessible in catch
      let postId;

      try {
        // Skip if already marked as processed
        const alreadyMarked = await post.evaluate(el => {
          return el.getAttribute('data-bot-processed') === 'true';
        });

        if (alreadyMarked) {
          console.log(`[${ACCOUNT_ID}] → Post ${currentPostIndex} already processed (marked), skipping`);
          currentPostIndex++;
          continue;
        }

        // Get unique post ID
        postId = await post.evaluate(el => {
          const posinset = el.getAttribute("aria-posinset");
          const testid = el.getAttribute("data-testid");
          const id = el.getAttribute("id");

          if (posinset) return `pos_${posinset}`;

          const links = el.querySelectorAll('a[href*="/posts/"], a[href*="/permalink/"]');
          for (const link of links) {
            const href = link.getAttribute('href');
            if (href) {
              const match = href.match(/\/posts\/(\d+)|\/permalink\/(\d+)/);
              if (match) return `post_${match[1] || match[2]}`;
            }
          }

          if (testid) return `test_${testid}`;
          if (id) return `id_${id}`;

          const content = el.textContent || '';
          return `hash_${content.substring(0, 100).replace(/\s/g, '')}`;
        });

        if (!postId) {
          console.log(`[${ACCOUNT_ID}] → Post ${currentPostIndex} has no valid ID, skipping`);
          currentPostIndex++;
          continue;
        }

        // Check if already processed in this session
        if (processedPosts.has(postId)) {
          console.log(`[${ACCOUNT_ID}] → Post ${currentPostIndex} (ID: ${postId.substring(0, 20)}) already in processedPosts, skipping`);
          currentPostIndex++;
          continue;
        }

        console.log(`[${ACCOUNT_ID}] → Processing post ${currentPostIndex} (ID: ${postId.substring(0, 30)}...)`);

        // Ensure post is in viewport
        await post.evaluate(el => {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });

        // Wait longer for post elements to render
        console.log(`[${ACCOUNT_ID}] -> Waiting for post to fully render...`);
        await delay(4000);

        // Check if post should be blocked
        if (config.blockAds !== false) {
          const shouldBlock = await shouldBlockPost(post, config.blockKeywords);
          if (shouldBlock) {
            processedPosts.add(postId);
            currentPostIndex++;
            adsBlocked++;
            console.log(`[${ACCOUNT_ID}] -> Post SKIPPED (ads/suggested)`);
            continue;
          }
        }

        // Extract caption
        const caption = await extractPostCaption(post);

        // Check if caption is valid
        if (!caption || caption.length < 10) {
          console.log(`[${ACCOUNT_ID}] -> ⚠️  Caption not readable (${caption ? caption.length : 0} chars)`);
          console.log(`[${ACCOUNT_ID}] -> Action: LIKE ONLY (no comment)`);

          // Auto-like
          if (config.autoLike !== false) {
            await likePost(page, post);
          }

          processedPosts.add(postId);
          currentPostIndex++;
          postsLikedOnly++;

          // Mark post as processed
          await post.evaluate(el => {
            el.setAttribute('data-bot-processed', 'true');
            el.style.opacity = '0.7';
          });

          // Clear focus
          await page.evaluate(() => {
            if (document.activeElement) {
              document.activeElement.blur();
            }
            if (window.getSelection) {
              window.getSelection().removeAllRanges();
            }
          });
          await delay(1000);

          // Scroll to next post BEFORE waiting
          await scrollToNextPost(currentPostIndex);

          // Wait shorter interval for like-only
          const shortInterval = Math.floor(getRandomInterval() / 2);
          console.log(`[${ACCOUNT_ID}] Waiting ${shortInterval / 1000}s before next post...`);
          await delay(shortInterval);

          continue;
        }

        console.log(`[${ACCOUNT_ID}] -> ✓ Caption extracted (${caption.length} chars): "${caption.substring(0, 60)}..."`);

        let comment;

        // Generate or select comment
        if (useAI) {
          const result = await generateAiComment({
            caption: caption,
            ctaLink: ctaLink,
            prompt: config.ai_settings?.gemini_prompt || "Buat komentar untuk: {CAPTION_POSTINGAN}. Link: {LINK_CTA}. 1-2 kalimat.",
            openRouterKeys: openRouterKeys,
            geminiKeys: geminiKeys,
            staticComments: comments,
            geminiWorkingIndex: geminiWorkingIndex,
            accountId: ACCOUNT_ID,
            urlShortenerEnabled: config.ai_settings?.url_shortener_enabled === true
          });

          comment = result.comment;
          geminiWorkingIndex = result.workingIndex;

          if (!comment) {
            console.log(`[${ACCOUNT_ID}] -> Failed to generate comment, skipping`);
            processedPosts.add(postId);
            currentPostIndex++;
            continue;
          }

          console.log(`[${ACCOUNT_ID}] -> Using ${result.provider} comment${result.model ? ` (${result.model})` : ''}`);
        } else {
          comment = comments[commentIndex % comments.length];
          console.log(`[${ACCOUNT_ID}] -> Using static comment`);
        }

        // Find and click comment button
        let commentClicked = false;

        // Strategy 1: Look for comment button with aria-label
        const commentButtonSelectors = [
          "div[aria-label='Beri komentar']",
          "div[aria-label='Comment']",
          "div[aria-label='Write a comment']",
          "div[role='button'][aria-label*='comment']",
          "div[role='button'][aria-label*='Comment']",
          "div[role='button'][aria-label*='komentar']"
        ];

        for (const selector of commentButtonSelectors) {
          try {
            const button = await post.$(selector);
            if (button) {
              const isVisible = await button.boundingBox();
              if (isVisible && isVisible.height > 10) {
                await button.click({ delay: 100 });
                console.log(`[${ACCOUNT_ID}] -> Comment button clicked`);
                commentClicked = true;
                await delay(config.ai_settings?.typing_delay_after_click || 2000);
                break;
              }
            }
          } catch (e) {
            continue;
          }
        }

        // Strategy 2: Look for existing comment text area (already expanded)
        if (!commentClicked) {
          const textAreaSelectors = [
            "div[contenteditable='true'][role='textbox']",
            "div[contenteditable='true'][aria-label*='comment']",
            "div[contenteditable='true'][aria-label*='Write']",
            "div[contenteditable='true']",
            "p.xdj266r.x14z9mp.xat24cr.x1lziwak",
            "textarea[placeholder*='comment']",
            "textarea[placeholder*='komentar']"
          ];

          for (const selector of textAreaSelectors) {
            try {
              const area = await post.$(selector);
              if (area) {
                const isVisible = await area.boundingBox();
                if (isVisible && isVisible.width > 100 && isVisible.height > 20) {
                  await area.click({ delay: 100 });
                  console.log(`[${ACCOUNT_ID}] -> Comment area clicked (${selector})`);
                  commentClicked = true;
                  await delay(config.ai_settings?.typing_delay_after_click || 2000);
                  break;
                }
              }
            } catch (e) {
              continue;
            }
          }
        }

        // Strategy 3: Try to find by text content "Comment" or "Komentar"
        if (!commentClicked) {
          commentClicked = await post.evaluate(() => {
            const commentTexts = ['Comment', 'Komentar', 'Beri komentar', 'Write a comment'];
            const allButtons = Array.from(document.querySelectorAll('div[role="button"], span[role="button"]'));

            for (const btn of allButtons) {
              const text = (btn.textContent || '').trim();
              const ariaLabel = btn.getAttribute('aria-label') || '';

              for (const commentText of commentTexts) {
                if (text.includes(commentText) || ariaLabel.includes(commentText)) {
                  const rect = btn.getBoundingClientRect();
                  if (rect.width > 30 && rect.height > 15 && btn.offsetParent !== null) {
                    btn.click();
                    return true;
                  }
                }
              }
            }
            return false;
          });

          if (commentClicked) {
            console.log(`[${ACCOUNT_ID}] -> Comment button clicked (text search)`);
            await delay(config.ai_settings?.typing_delay_after_click || 2000);
          }
        }

        // If still not found, skip this post but still like it
        if (!commentClicked) {
          console.log(`[${ACCOUNT_ID}] -> Comment area not found, doing LIKE ONLY`);

          // Auto-like
          if (config.autoLike !== false) {
            await likePost(page, post);
          }

          processedPosts.add(postId);
          currentPostIndex++;
          postsLikedOnly++;

          // Mark post as processed
          await post.evaluate(el => {
            el.setAttribute('data-bot-processed', 'true');
            el.style.opacity = '0.7';
          });

          // Clear focus
          await page.evaluate(() => {
            if (document.activeElement) {
              document.activeElement.blur();
            }
            if (window.getSelection) {
              window.getSelection().removeAllRanges();
            }
          });
          await delay(1000);

          // Scroll to next post BEFORE waiting
          await scrollToNextPost(currentPostIndex);

          // Wait shorter interval
          const shortInterval = Math.floor(getRandomInterval() / 2);
          console.log(`[${ACCOUNT_ID}] Waiting ${shortInterval / 1000}s before next post...`);
          await delay(shortInterval);

          continue;
        }

        // Wait for comment box to be fully ready and focused
        await delay(1000);

        // Clear any existing focus and ensure we're starting fresh
        await page.evaluate(() => {
          // Clear any selection
          if (window.getSelection) {
            window.getSelection().removeAllRanges();
          }

          // Find the active element (should be the comment box)
          const activeEl = document.activeElement;
          if (activeEl && activeEl.isContentEditable) {
            // Clear any existing content
            activeEl.textContent = '';
          }
        });

        await delay(500);

        // Type comment with safe delays
        console.log(`[${ACCOUNT_ID}] -> Typing comment: "${comment}"`);

        await typeCommentSafely(page, comment, {
          delayAfterClick: 0, // Already waited above
          typingDelay: 100,
          accountId: ACCOUNT_ID
        });

        await delay(1000);

        // Send comment
        await page.keyboard.press("Enter");
        console.log(`[${ACCOUNT_ID}] -> Comment sent`);

        // Auto-like
        await delay(2000);
        if (config.autoLike !== false) {
          await likePost(page, post);
        }

        // Close any dialogs
        await delay(2000);
        await page.keyboard.press("Escape");
        await delay(800);
        await page.keyboard.press("Escape");
        await delay(800);

        // Force blur and clear selection
        await page.evaluate(() => {
          if (document.activeElement) {
            document.activeElement.blur();
          }
          if (window.getSelection) {
            window.getSelection().removeAllRanges();
          }
          document.body.click();
        });
        await delay(500);

        processedPosts.add(postId);
        currentPostIndex++;
        commentsPosted++;

        if (!useAI) {
          commentIndex++;
        }

        // MARK this post as processed immediately
        await post.evaluate(el => {
          el.setAttribute('data-bot-processed', 'true');
          el.style.opacity = '0.7'; // Visual indicator (optional)
        });

        // Clear focus
        await page.evaluate(() => {
          if (document.activeElement) {
            document.activeElement.blur();
          }
          if (window.getSelection) {
            window.getSelection().removeAllRanges();
          }
        });
        await delay(1000);

        // Scroll to next post BEFORE waiting
        await scrollToNextPost(currentPostIndex);

        // Check if we've reached the target
        if (commentsPosted >= config.postsToComment) {
          console.log(`[${ACCOUNT_ID}] Target reached: ${commentsPosted}/${config.postsToComment}`);
          break;
        }

        // Wait random interval before processing next post
        const interval = getRandomInterval();
        console.log(`[${ACCOUNT_ID}] Waiting ${interval / 1000}s before next comment...`);
        await delay(interval);

      } catch (error) {
        console.error(`[${ACCOUNT_ID}] -> Failed to interact: ${error.message}`);

        try {
          const errorScreenshot = path.join(ARTIFACTS_DIR, `timeline_error_${Date.now()}.png`);
          await page.screenshot({ path: errorScreenshot, fullPage: false });
          console.log(`[${ACCOUNT_ID}] -> Error screenshot: ${errorScreenshot}`);
        } catch (screenshotError) {
          console.log(`[${ACCOUNT_ID}] -> Failed to take screenshot`);
        }

        // Mark as processed to avoid infinite loop
        if (postId) {
          processedPosts.add(postId);
        }
        currentPostIndex++;

        continue;
      }
    }

    console.log(`[${ACCOUNT_ID}] === COMPLETE ===`);
    console.log(`[${ACCOUNT_ID}] Total comments posted: ${commentsPosted}/${config.postsToComment}`);
    console.log(`[${ACCOUNT_ID}] Total posts liked only (no caption): ${postsLikedOnly}`);
    console.log(`[${ACCOUNT_ID}] Total ads blocked: ${adsBlocked}`);
    console.log(`[${ACCOUNT_ID}] Total scroll attempts: ${totalScrollAttempts}`);
    console.log(`[${ACCOUNT_ID}] Circuit breaker status: ${consecutiveNotFound}/${maxConsecutiveNotFound} consecutive failures`);

    const successDetails = `Comments: ${commentsPosted}/${config.postsToComment} | Liked Only: ${postsLikedOnly} | Blocked: ${adsBlocked} | Scrolls: ${totalScrollAttempts}`;
    await notify.success(ACCOUNT_ID, BOT_NAME, successDetails);

  } catch (error) {
    console.error(`[${ACCOUNT_ID}] Fatal error:`, error.message);
    await notify.error(ACCOUNT_ID, BOT_NAME, error.message);

    if (browser) {
      try {
        const pages = await browser.pages();
        const page = pages[0] || await browser.newPage();
        const errorScreenshot = path.join(ARTIFACTS_DIR, `fatal_error_${Date.now()}.png`);
        await page.screenshot({ path: errorScreenshot, fullPage: true });
        console.log(`[${ACCOUNT_ID}] Error screenshot: ${errorScreenshot}`);
      } catch (screenshotError) {
        console.log(`[${ACCOUNT_ID}] -> Failed to take screenshot`);
      }
    }

    process.exit(1);
  } finally {
    if (browser) {
      try {
        const pages = await browser.pages();
        for (const page of pages) {
          try {
            await page.close();
          } catch (e) {
            // Ignore
          }
        }

        await delay(2000);

        await browser.close();
        console.log(`[${ACCOUNT_ID}] Browser closed`);

        await delay(3000);

      } catch (e) {
        console.log(`[${ACCOUNT_ID}] Cleanup error: ${e.message}`);
      }
    }
  }
}

process.on('SIGINT', () => {
  console.log(`\n[${ACCOUNT_ID}] Bot stopped by user`);
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log(`\n[${ACCOUNT_ID}] Received SIGTERM, shutting down...`);
  process.exit(0);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error(`[${ACCOUNT_ID}] Unhandled Rejection:`, reason);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error(`[${ACCOUNT_ID}] Uncaught Exception:`, error);
  process.exit(1);
});

main();

const { createStealthBrowser, applyAntiDetection, humanDelay, dismissFacebookPopups } = require('./anti-detection');
const fs = require("fs").promises;
const path = require("path");

// Import AI comment generator module
const { generateAiComment, typeCommentSafely, loadOpenRouterKeys } = require('./commentgenerator');

// Multi-account support
const ACCOUNT_ID = process.argv[2] || process.env.ACCOUNT_ID || 'default';
// Dynamic Base Path for Binary Support
const isCompiled = path.basename(process.execPath).endsWith('.exe') && !process.execPath.toLowerCase().includes('node.exe') && !process.execPath.toLowerCase().includes('bun.exe');
const basePath = isCompiled ? path.dirname(process.execPath) : __dirname;
const ACCOUNTS_DIR = path.join(basePath, "../accounts");
const BOT_NAME = process.env.BOT_NAME || 'groupcomment';

// Load config
let config;
try {
  const configPath = path.join(ACCOUNTS_DIR, ACCOUNT_ID, "bots", `${BOT_NAME}.json`);
  config = require(configPath);
} catch (e) {
  config = {
    headless: "new",
    targetURL: "https://www.facebook.com/groups/feed/",
    postsToComment: 5,
    minIntervalSeconds: 60,
    maxIntervalSeconds: 180,
    autoLike: true,
    ai_settings: {
      use_openrouter: true,
      url_shortener_enabled: true,
      gemini_prompt: "Buat komentar untuk postingan grup ini: {CAPTION_POSTINGAN}. Link: {LINK_CTA}. Santai dan engaging, 1-2 kalimat.",
      typing_delay_after_click: 3000
    }
  };
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
const getRandomInterval = () => 1000 * (Math.floor(Math.random() * (config.maxIntervalSeconds - config.minIntervalSeconds + 1)) + config.minIntervalSeconds);

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
    // Try to get path from config first (new method)
    if (config.paths && config.paths.cta_link) {
      const data = await fs.readFile(config.paths.cta_link, "utf8");
      return data.trim();
    }

    // Fallback to old method
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
    console.log(`[${ACCOUNT_ID}] === FacebookPro Blaster - Auto Comment Group (Enhanced) ===`);
    console.log(`[${ACCOUNT_ID}] Auto-like enabled: ${config.autoLike !== false ? 'Yes' : 'No'}`);

    await fs.mkdir(ARTIFACTS_DIR, { recursive: true });

    const comments = await loadComments();
    console.log(`[${ACCOUNT_ID}] Loaded ${comments.length} static comments`);

    let ctaLink = "";
    let geminiKeys = [];
    let openRouterKeys = [];

    // Check if we should use AI
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

    // Create stealth browser with anti-detection
    const stealthResult = await createStealthBrowser({
      headless: config.headless,
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

    // CRITICAL: Wait for page to stabilize
    console.log(`[${ACCOUNT_ID}] Waiting for initial content load (15s)...`);
    await delay(15000);

    const title = await page.title();
    if (title.includes('Log') || title.includes('login')) {
      throw new Error(`[${ACCOUNT_ID}] Login failed! Check cookies.json`);
    }

    console.log(`[${ACCOUNT_ID}] Page ready: ${title}`);

    // Additional stabilization to ensure group posts are fully rendered
    console.log(`[${ACCOUNT_ID}] Ensuring group posts are fully rendered...`);
    await delay(3000);

    const processedPosts = new Set();
    let commentIndex = 0;
    let commentsPosted = 0;
    console.log(`[${ACCOUNT_ID}] Target: ${config.postsToComment} comments`);

    let geminiWorkingIndex = 0;
    let postsLikedOnly = 0; // Track posts that only get liked (no comment)
    let currentPostIndex = 0; // Array index (0-based)
    let noNewPostsCount = 0;

    // Circuit breaker to prevent infinite loop
    let consecutiveNotFound = 0;
    let maxConsecutiveNotFound = 10; // Exit after 10 consecutive failures
    let totalScrollAttempts = 0;
    let maxScrollAttempts = 50; // Max 50 scroll attempts total
    let lastPostCount = 0;
    let samePostCountStreak = 0;

    // Function to scroll to load more posts
    async function scrollToLoadMore() {
      try {
        console.log(`[${ACCOUNT_ID}] -> Scrolling to load more posts...`);

        await page.evaluate(() => {
          window.scrollBy(0, window.innerHeight * 0.7);
        });

        await delay(2000);
        return true;
      } catch (error) {
        console.log(`[${ACCOUNT_ID}] -> Failed to scroll: ${error.message}`);
        return false;
      }
    }

    // Function to scroll to next post
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
      // Get all visible posts using div[role="article"]
      const posts = await page.$$("div[role='article']");

      if (posts.length === 0) {
        console.log(`[${ACCOUNT_ID}] No posts found. Waiting...`);
        await delay(10000);
        noNewPostsCount++;
        if (noNewPostsCount > 5) {
          console.log(`[${ACCOUNT_ID}] No posts found after multiple attempts. Exiting.`);
          break;
        }
        continue;
      }

      console.log(`[${ACCOUNT_ID}] Found ${posts.length} posts (current index: ${currentPostIndex})`);

      // Reset counter when we find posts
      noNewPostsCount = 0;

      // Check if we need to scroll for more posts
      if (currentPostIndex >= posts.length) {
        console.log(`[${ACCOUNT_ID}] Current index ${currentPostIndex} >= posts.length ${posts.length}, scrolling for more...`);
        await scrollToLoadMore();
        totalScrollAttempts++;
        consecutiveNotFound++;

        if (consecutiveNotFound >= maxConsecutiveNotFound || totalScrollAttempts >= maxScrollAttempts) {
          console.log(`[${ACCOUNT_ID}] Reached scroll limit. Exiting.`);
          break;
        }
        continue;
      }

      // Get post by array index
      const post = posts[currentPostIndex];

      // Reset consecutive not found counter
      consecutiveNotFound = 0;

      try {
        // Skip if already marked as processed
        const alreadyMarked = await post.evaluate(el => {
          return el.getAttribute('data-bot-processed') === 'true';
        });

        if (alreadyMarked) {
          currentPostIndex++;
          continue;
        }
        // Generate unique post ID using array index and content hash
        const postId = await post.evaluate((el, index) => {
          // Get post content for hashing
          const textContent = el.textContent?.substring(0, 200) || '';
          const timestamp = el.querySelector('abbr')?.getAttribute('data-utime') || '';

          // Create a simple hash from content
          let hash = 0;
          for (let i = 0; i < textContent.length; i++) {
            const char = textContent.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
          }

          // Use array index + content hash for unique ID
          return `post_${index}_${Math.abs(hash).toString(36)}_${timestamp}`;
        }, currentPostIndex);

        // Check if already processed
        if (processedPosts.has(postId)) {
          console.log(`[${ACCOUNT_ID}] Post ${currentPostIndex} already processed (ID: ${postId.substring(0, 50)}...), skipping...`);
          currentPostIndex++;
          continue;
        }

        console.log(`[${ACCOUNT_ID}] Processing post ${currentPostIndex} (ID: ${postId.substring(0, 50)}...)`);

        // Ensure post is in viewport
        await post.evaluate(el => {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });

        // Wait longer for post elements to render
        console.log(`[${ACCOUNT_ID}] -> Waiting for post to fully render...`);
        await delay(4000);

        // Extract caption using enhanced function
        console.log(`[${ACCOUNT_ID}] -> Extracting caption from post...`);
        const caption = await extractPostCaption(post);

        // Check if caption is too short - if so, just like and skip commenting
        if (!caption || caption.length < 10) {
          console.log(`[${ACCOUNT_ID}] -> Caption too short (${caption?.length || 0} chars), will only like this post`);

          // Auto-like
          if (config.autoLike !== false) {
            await delay(1000);
            await likePost(page, post);
            postsLikedOnly++;
            console.log(`[${ACCOUNT_ID}] -> Post liked (no comment due to short caption)`);
          }

          processedPosts.add(postId);

          // Mark post as processed
          await post.evaluate(el => {
            el.setAttribute('data-bot-processed', 'true');
            el.style.opacity = '0.7';
          });

          // Clear focus
          console.log(`[${ACCOUNT_ID}] -> Clearing focus...`);
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
          currentPostIndex++;

          // Wait shorter interval
          const shortInterval = Math.floor(getRandomInterval() / 2);
          console.log(`[${ACCOUNT_ID}] Waiting ${shortInterval / 1000}s before next post...`);
          await delay(shortInterval);

          continue;
        }

        let comment;

        // Generate or select comment
        if (useAI) {
          const result = await generateAiComment({
            caption: caption,
            ctaLink: ctaLink,
            prompt: config.ai_settings.gemini_prompt || "Buat komentar untuk: {CAPTION_POSTINGAN}. Link: {LINK_CTA}. 1-2 kalimat.",
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
            processedPosts.add(postId);
            currentPostIndex++;
            continue;
          }

          console.log(`[${ACCOUNT_ID}] -> Using ${result.provider} comment${result.model ? ` (${result.model})` : ''}`);
        } else {
          comment = comments[commentIndex % comments.length];
          console.log(`[${ACCOUNT_ID}] -> Using static comment`);
        }

        // Find and click comment button - 3 STRATEGIES
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

        // If still not found, skip this post
        if (!commentClicked) {
          console.log(`[${ACCOUNT_ID}] -> Comment area not found`);
          processedPosts.add(postId);
          currentPostIndex++;
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
        console.log(`[${ACCOUNT_ID}] -> Closing dialog`);
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
        console.log(`[${ACCOUNT_ID}] -> Clearing focus...`);
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
        currentPostIndex++;

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
          const errorScreenshot = path.join(ARTIFACTS_DIR, `group_error_${Date.now()}.png`);
          await page.screenshot({ path: errorScreenshot, fullPage: false });
          console.log(`[${ACCOUNT_ID}] -> Error screenshot: ${errorScreenshot}`);
        } catch (screenshotError) {
          console.log(`[${ACCOUNT_ID}] -> Failed to take screenshot`);
        }

        currentPostIndex++;
        continue;
      }
    }

    console.log(`[${ACCOUNT_ID}] === COMPLETE ===`);
    console.log(`[${ACCOUNT_ID}] Total comments posted: ${commentsPosted}/${config.postsToComment}`);
    console.log(`[${ACCOUNT_ID}] Total posts liked only (no caption): ${postsLikedOnly}`);
    console.log(`[${ACCOUNT_ID}] Total scroll attempts: ${totalScrollAttempts}`);
    console.log(`[${ACCOUNT_ID}] Circuit breaker status: ${consecutiveNotFound}/${maxConsecutiveNotFound} consecutive failures`);

    const successDetails = `Comments: ${commentsPosted}/${config.postsToComment} | Liked Only: ${postsLikedOnly} | Scrolls: ${totalScrollAttempts}`;
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

        await notify.error(ACCOUNT_ID, BOT_NAME, error.message, errorScreenshot);
      } catch (screenshotError) {
        console.log(`[${ACCOUNT_ID}] Failed to take screenshot`);
      }
    }

    process.exit(1);
  } finally {
    if (browser) {
      try {
        // CRITICAL: Complete cleanup
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

        // CRITICAL: Extra delay between accounts
        await delay(3000);

      } catch (e) {
        console.log(`[${ACCOUNT_ID}] Cleanup error: ${e.message}`);
      }
    }
  }
}

// Graceful shutdown
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

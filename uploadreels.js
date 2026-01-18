const { createStealthBrowser, applyAntiDetection, humanDelay, dismissFacebookPopups } = require('./anti-detection');
const fs = require("fs").promises;
const path = require("path");
const axios = require("axios");

// Import AI caption generator
const { generateAiComment, loadOpenRouterKeys } = require('./commentgenerator');

// Multi-account support
const ACCOUNT_ID = process.env.ACCOUNT_ID || 'default';
// Dynamic Base Path for Binary Support
const isCompiled = path.basename(process.execPath).endsWith('.exe') && !process.execPath.toLowerCase().includes('node.exe') && !process.execPath.toLowerCase().includes('bun.exe');
const basePath = isCompiled ? path.dirname(process.execPath) : __dirname;
const ACCOUNTS_DIR = path.join(basePath, "../accounts");
const BOT_NAME = process.env.BOT_NAME || 'uploadreels';

// Load config
let config;
try {
  const configPath = path.join(ACCOUNTS_DIR, ACCOUNT_ID, "bots", `${BOT_NAME}.json`);
  config = require(configPath);
} catch (e) {
  config = {
    headless: "new",
    maxUploadsPerRun: 3,
    minIntervalSeconds: 300,
    maxIntervalSeconds: 600,
    videoSettings: {
      maxSizeGB: 4,
      allowedFormats: ['.mp4', '.mov', '.avi', '.mkv'],
      moveAfterUpload: true,
      uploadedFolder: "uploaded",
      use_local_videos: true, // Priority: local first
      auto_download: true, // Auto-download jika tidak ada video lokal
      download_source: "pexels", // pexels or pixabay
      video_orientation: "portrait", // portrait or landscape
      video_duration: "medium", // short (15s), medium (15-30s), long (30s+)
      search_queries: [
        "motivation",
        "success",
        "nature",
        "fitness",
        "lifestyle",
        "travel",
        "business",
        "inspiration"
      ]
    },
    ai_caption: {
      enabled: true,
      use_openrouter: true,
      prompt: "Buat caption menarik untuk video reels ini. Deskripsi: {VIDEO_DESCRIPTION}. Caption harus engaging, 1-2 kalimat dengan emoji yang sesuai.",
      fallback_caption: "Check this out! 🔥",
      add_quote: true,
      quote_style: "motivational" // motivational, inspirational, success, lifestyle
    },
    typing_delays: {
      after_video_upload: 8000,
      after_caption: 3000,
      typing_speed: 80,
      before_post: 2000
    },
    sound_settings: {
      enabled: false, // Manual control - set true to enable
      use_trending: true,
      fallback_sound: null
    },
    privacy: "public"
  };
}

// Paths
const COOKIES_PATH = path.join(ACCOUNTS_DIR, ACCOUNT_ID, "cookies.json");
const GEMINI_KEYS_PATH = path.join(ACCOUNTS_DIR, ACCOUNT_ID, "gemini_keys.txt");
const OPENROUTER_KEYS_PATH = path.join(ACCOUNTS_DIR, ACCOUNT_ID, "openrouter_keys.txt");
const PEXELS_KEYS_PATH = path.join(ACCOUNTS_DIR, ACCOUNT_ID, "pexels_keys.txt");
const PIXABAY_KEYS_PATH = path.join(ACCOUNTS_DIR, ACCOUNT_ID, "pixabay_keys.txt");
const ARTIFACTS_DIR = path.join(__dirname, "../artifacts", ACCOUNT_ID);
const LOCAL_VIDEOS_DIR = path.join(__dirname, "../videos");
const DOWNLOADED_VIDEOS_DIR = path.join(ARTIFACTS_DIR, "downloaded_videos");
const UPLOADED_VIDEOS_DIR = path.join(LOCAL_VIDEOS_DIR, config.videoSettings?.uploadedFolder || "uploaded");
const UPLOAD_LOG_PATH = path.join(ACCOUNTS_DIR, ACCOUNT_ID, "upload_log.txt");

// Telegram logger with error handling
let notify;
try {
  notify = require('./notify');
} catch (e) {
  console.error(`[${ACCOUNT_ID}] Failed to load telegram logger:`, e.message);
  notify = {
    success: async () => { },
    error: async () => { },
    warning: async () => { },
    systemAlert: async () => { }
  };
}

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Motivational quotes database
const QUOTES = {
  motivational: [
    "Success is not final, failure is not fatal 💪",
    "Dream big, work hard, stay focused 🎯",
    "Every day is a new beginning 🌅",
    "Believe you can and you're halfway there ✨",
    "The future belongs to those who believe 🚀",
    "Make it happen, shock everyone 💥",
    "Your only limit is you 🔥",
    "Stay hungry, stay foolish 🌟"
  ],
  inspirational: [
    "Be the energy you want to attract ✨",
    "Create the life you can't wait to wake up to 🌈",
    "Good vibes only 🌺",
    "Life is beautiful 🦋",
    "Choose happiness every day 😊",
    "Shine bright like a diamond 💎",
    "Live your best life 🌸",
    "Positive mind, positive vibes ☀️"
  ],
  success: [
    "Success starts with self-belief 👑",
    "Hustle until your haters ask if you're hiring 💼",
    "Work hard in silence, let success make the noise 📈",
    "The grind never stops 💯",
    "Boss mode activated 👔",
    "Building an empire 🏆",
    "Success is a journey, not a destination 🛤️",
    "Winners never quit 🥇"
  ],
  lifestyle: [
    "Living my best life 🎉",
    "Good times and tan lines ☀️",
    "Making memories 📸",
    "Life is short, make it sweet 🍭",
    "Collect moments, not things 🌍",
    "Adventure awaits 🗺️",
    "Enjoy the little things 🌼",
    "Life is better when you're laughing 😄"
  ]
};

async function loadCookiesFromFile() {
  try {
    console.log(`[${ACCOUNT_ID}] Reading cookies from: ${COOKIES_PATH}`);
    const cookiesData = await fs.readFile(COOKIES_PATH, "utf8");
    const cookies = JSON.parse(cookiesData);

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

async function loadGeminiKeys() {
  try {
    const data = await fs.readFile(GEMINI_KEYS_PATH, "utf8");
    const keys = data.split("\n").map(k => k.trim()).filter(k => k.startsWith("AIzaSy"));

    if (keys.length === 0) {
      throw new Error(`[${ACCOUNT_ID}] No valid Gemini API keys`);
    }

    return keys;
  } catch (error) {
    if (error.code === "ENOENT") {
      await fs.writeFile(GEMINI_KEYS_PATH, "# Add your Gemini API keys here\n# AIzaSy..._YOUR_KEY");
      throw new Error(`[${ACCOUNT_ID}] gemini_keys.txt not found. Template created.`);
    }
    throw new Error(`[${ACCOUNT_ID}] Failed to load Gemini keys: ${error.message}`);
  }
}

async function loadPexelsKeys() {
  try {
    const data = await fs.readFile(PEXELS_KEYS_PATH, "utf8");
    const keys = data.split("\n").map(k => k.trim()).filter(k => k && k.length > 10);
    return keys;
  } catch (error) {
    if (error.code === "ENOENT") {
      await fs.writeFile(PEXELS_KEYS_PATH, "# Add your Pexels API keys here\n# Get from: https://www.pexels.com/api/\n");
    }
    return [];
  }
}

async function loadPixabayKeys() {
  try {
    const data = await fs.readFile(PIXABAY_KEYS_PATH, "utf8");
    const keys = data.split("\n").map(k => k.trim()).filter(k => k && k.length > 10);
    return keys;
  } catch (error) {
    if (error.code === "ENOENT") {
      await fs.writeFile(PIXABAY_KEYS_PATH, "# Add your Pixabay API keys here\n# Get from: https://pixabay.com/api/docs/\n");
    }
    return [];
  }
}

async function downloadVideoFromPexels(query, apiKeys) {
  console.log(`[${ACCOUNT_ID}] Searching Pexels for: ${query}`);

  await fs.mkdir(DOWNLOADED_VIDEOS_DIR, { recursive: true });

  for (const apiKey of apiKeys) {
    try {
      const orientation = config.videoSettings?.video_orientation || 'portrait';

      const searchResponse = await axios.get('https://api.pexels.com/videos/search', {
        params: {
          query: query,
          orientation: orientation,
          size: 'medium',
          per_page: 15
        },
        headers: {
          'Authorization': apiKey
        },
        timeout: 15000
      });

      if (!searchResponse.data.videos || searchResponse.data.videos.length === 0) {
        console.log(`[${ACCOUNT_ID}] No videos found for: ${query}`);
        continue;
      }

      const videos = searchResponse.data.videos;
      const selectedVideo = videos[Math.floor(Math.random() * videos.length)];

      // Get video file based on quality
      let videoFile = selectedVideo.video_files.find(f => f.quality === 'hd' && f.width <= 1080);
      if (!videoFile) {
        videoFile = selectedVideo.video_files.find(f => f.quality === 'sd');
      }
      if (!videoFile) {
        videoFile = selectedVideo.video_files[0];
      }

      console.log(`[${ACCOUNT_ID}] Selected: ${selectedVideo.url}`);
      console.log(`[${ACCOUNT_ID}] Duration: ${selectedVideo.duration}s | Quality: ${videoFile.quality}`);

      // Download video
      const videoResponse = await axios.get(videoFile.link, {
        responseType: 'arraybuffer',
        timeout: 120000
      });

      const timestamp = Date.now();
      const fileName = `pexels_${query.replace(/\s+/g, '_')}_${timestamp}.mp4`;
      const filePath = path.join(DOWNLOADED_VIDEOS_DIR, fileName);

      await fs.writeFile(filePath, videoResponse.data);

      const stat = await fs.stat(filePath);

      console.log(`[${ACCOUNT_ID}] Downloaded: ${fileName} (${(stat.size / 1024 / 1024).toFixed(2)}MB)`);
      console.log(`[${ACCOUNT_ID}] Video by ${selectedVideo.user.name} on Pexels`);

      return {
        filename: fileName,
        path: filePath,
        size: stat.size,
        sizeGB: (stat.size / 1024 / 1024 / 1024).toFixed(2),
        source: 'pexels',
        attribution: {
          photographer: selectedVideo.user.name,
          photographer_url: selectedVideo.user.url,
          video_url: selectedVideo.url
        }
      };

    } catch (error) {
      console.log(`[${ACCOUNT_ID}] Pexels API failed: ${error.message}`);
      continue;
    }
  }

  throw new Error(`[${ACCOUNT_ID}] All Pexels API keys failed`);
}

async function downloadVideoFromPixabay(query, apiKeys) {
  console.log(`[${ACCOUNT_ID}] Searching Pixabay for: ${query}`);

  await fs.mkdir(DOWNLOADED_VIDEOS_DIR, { recursive: true });

  for (const apiKey of apiKeys) {
    try {
      const searchResponse = await axios.get('https://pixabay.com/api/videos/', {
        params: {
          key: apiKey,
          q: query,
          per_page: 20,
          safesearch: true
        },
        timeout: 15000
      });

      if (!searchResponse.data.hits || searchResponse.data.hits.length === 0) {
        console.log(`[${ACCOUNT_ID}] No videos found for: ${query}`);
        continue;
      }

      const videos = searchResponse.data.hits;
      const selectedVideo = videos[Math.floor(Math.random() * videos.length)];

      // Get best quality video
      let videoFile = selectedVideo.videos.large || selectedVideo.videos.medium || selectedVideo.videos.small;

      console.log(`[${ACCOUNT_ID}] Selected: Video ID ${selectedVideo.id}`);
      console.log(`[${ACCOUNT_ID}] Duration: ${selectedVideo.duration}s`);

      // Download video
      const videoResponse = await axios.get(videoFile.url, {
        responseType: 'arraybuffer',
        timeout: 120000
      });

      const timestamp = Date.now();
      const fileName = `pixabay_${query.replace(/\s+/g, '_')}_${timestamp}.mp4`;
      const filePath = path.join(DOWNLOADED_VIDEOS_DIR, fileName);

      await fs.writeFile(filePath, videoResponse.data);

      const stat = await fs.stat(filePath);

      console.log(`[${ACCOUNT_ID}] Downloaded: ${fileName} (${(stat.size / 1024 / 1024).toFixed(2)}MB)`);
      console.log(`[${ACCOUNT_ID}] Video by ${selectedVideo.user} on Pixabay`);

      return {
        filename: fileName,
        path: filePath,
        size: stat.size,
        sizeGB: (stat.size / 1024 / 1024 / 1024).toFixed(2),
        source: 'pixabay',
        attribution: {
          photographer: selectedVideo.user,
          video_url: selectedVideo.pageURL
        }
      };

    } catch (error) {
      console.log(`[${ACCOUNT_ID}] Pixabay API failed: ${error.message}`);
      continue;
    }
  }

  throw new Error(`[${ACCOUNT_ID}] All Pixabay API keys failed`);
}

async function getRandomQuote() {
  const quoteStyle = config.ai_caption?.quote_style || 'motivational';
  const quotes = QUOTES[quoteStyle] || QUOTES.motivational;
  return quotes[Math.floor(Math.random() * quotes.length)];
}

async function getLocalVideos() {
  try {
    console.log(`[${ACCOUNT_ID}] Scanning local videos: ${LOCAL_VIDEOS_DIR}`);

    await fs.mkdir(LOCAL_VIDEOS_DIR, { recursive: true });
    await fs.mkdir(UPLOADED_VIDEOS_DIR, { recursive: true });

    const files = await fs.readdir(LOCAL_VIDEOS_DIR);
    const allowedFormats = config.videoSettings?.allowedFormats || ['.mp4', '.mov', '.avi', '.mkv'];
    const maxSizeBytes = (config.videoSettings?.maxSizeGB || 4) * 1024 * 1024 * 1024;

    const videos = [];

    for (const file of files) {
      const ext = path.extname(file).toLowerCase();
      if (!allowedFormats.includes(ext)) continue;

      const filePath = path.join(LOCAL_VIDEOS_DIR, file);
      const stat = await fs.stat(filePath);

      if (!stat.isFile()) continue;
      if (stat.size > maxSizeBytes) {
        console.log(`[${ACCOUNT_ID}] Skipping ${file} (too large: ${(stat.size / 1024 / 1024 / 1024).toFixed(2)}GB)`);
        continue;
      }

      // Check if already uploaded
      const uploadLog = await getUploadLog();
      if (uploadLog.includes(file)) {
        console.log(`[${ACCOUNT_ID}] Skipping ${file} (already uploaded)`);
        continue;
      }

      videos.push({
        filename: file,
        path: filePath,
        size: stat.size,
        sizeGB: (stat.size / 1024 / 1024 / 1024).toFixed(2),
        source: 'local'
      });
    }

    console.log(`[${ACCOUNT_ID}] Found ${videos.length} local videos`);
    return videos;

  } catch (error) {
    console.log(`[${ACCOUNT_ID}] Error scanning videos: ${error.message}`);
    return [];
  }
}

async function selectVideo(pexelsKeys, pixabayKeys) {
  const useLocalVideos = config.videoSettings?.use_local_videos !== false;
  const autoDownload = config.videoSettings?.auto_download !== false; // Default true

  console.log(`[${ACCOUNT_ID}] Video selection mode:`);
  console.log(`[${ACCOUNT_ID}]   - Use local videos: ${useLocalVideos}`);
  console.log(`[${ACCOUNT_ID}]   - Auto download: ${autoDownload}`);
  console.log(`[${ACCOUNT_ID}]   - Pexels keys: ${pexelsKeys.length}`);
  console.log(`[${ACCOUNT_ID}]   - Pixabay keys: ${pixabayKeys.length}`);

  // Try local videos first
  if (useLocalVideos) {
    console.log(`[${ACCOUNT_ID}] Scanning for local videos...`);
    const localVideos = await getLocalVideos();
    if (localVideos.length > 0) {
      const selectedVideo = localVideos[Math.floor(Math.random() * localVideos.length)];
      console.log(`[${ACCOUNT_ID}] ✓ Selected local video: ${selectedVideo.filename}`);
      return selectedVideo;
    }
    console.log(`[${ACCOUNT_ID}] No local videos found in: ${LOCAL_VIDEOS_DIR}`);
  }

  // Auto-download if enabled
  if (!autoDownload) {
    throw new Error(`[${ACCOUNT_ID}] Auto-download is disabled and no local videos available`);
  }

  if (pexelsKeys.length === 0 && pixabayKeys.length === 0) {
    throw new Error(`[${ACCOUNT_ID}] No API keys available. Please add keys to:\n  - ${PEXELS_KEYS_PATH}\n  - ${PIXABAY_KEYS_PATH}`);
  }

  const queries = config.videoSettings?.search_queries || ["motivation", "success", "inspiration"];
  const randomQuery = queries[Math.floor(Math.random() * queries.length)];

  console.log(`[${ACCOUNT_ID}] Starting auto-download with query: "${randomQuery}"`);

  const downloadSource = config.videoSettings?.download_source || 'pexels';

  // Try preferred source first
  if (downloadSource === 'pexels' && pexelsKeys.length > 0) {
    try {
      console.log(`[${ACCOUNT_ID}] Attempting download from Pexels...`);
      return await downloadVideoFromPexels(randomQuery, pexelsKeys);
    } catch (e) {
      console.log(`[${ACCOUNT_ID}] Pexels failed: ${e.message}`);
      if (pixabayKeys.length > 0) {
        console.log(`[${ACCOUNT_ID}] Trying fallback to Pixabay...`);
        try {
          return await downloadVideoFromPixabay(randomQuery, pixabayKeys);
        } catch (e2) {
          console.log(`[${ACCOUNT_ID}] Pixabay also failed: ${e2.message}`);
        }
      }
    }
  } else if (downloadSource === 'pixabay' && pixabayKeys.length > 0) {
    try {
      console.log(`[${ACCOUNT_ID}] Attempting download from Pixabay...`);
      return await downloadVideoFromPixabay(randomQuery, pixabayKeys);
    } catch (e) {
      console.log(`[${ACCOUNT_ID}] Pixabay failed: ${e.message}`);
      if (pexelsKeys.length > 0) {
        console.log(`[${ACCOUNT_ID}] Trying fallback to Pexels...`);
        try {
          return await downloadVideoFromPexels(randomQuery, pexelsKeys);
        } catch (e2) {
          console.log(`[${ACCOUNT_ID}] Pexels also failed: ${e2.message}`);
        }
      }
    }
  } else {
    // No preferred source, try any available
    if (pexelsKeys.length > 0) {
      try {
        console.log(`[${ACCOUNT_ID}] Attempting download from Pexels...`);
        return await downloadVideoFromPexels(randomQuery, pexelsKeys);
      } catch (e) {
        console.log(`[${ACCOUNT_ID}] Pexels failed: ${e.message}`);
      }
    }

    if (pixabayKeys.length > 0) {
      try {
        console.log(`[${ACCOUNT_ID}] Attempting download from Pixabay...`);
        return await downloadVideoFromPixabay(randomQuery, pixabayKeys);
      } catch (e) {
        console.log(`[${ACCOUNT_ID}] Pixabay failed: ${e.message}`);
      }
    }
  }

  throw new Error(`[${ACCOUNT_ID}] All video sources failed. Please check:\n  1. Add videos to: ${LOCAL_VIDEOS_DIR}\n  2. Add API keys to: ${PEXELS_KEYS_PATH} or ${PIXABAY_KEYS_PATH}\n  3. Check your internet connection`);
}

async function getUploadLog() {
  try {
    const data = await fs.readFile(UPLOAD_LOG_PATH, "utf8");
    return data;
  } catch (error) {
    return "";
  }
}

async function logUpload(filename, caption) {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] ${filename} | Caption: ${caption}\n`;
  await fs.appendFile(UPLOAD_LOG_PATH, logEntry);
  console.log(`[${ACCOUNT_ID}] Upload logged`);
}

async function moveToUploaded(videoPath) {
  try {
    const filename = path.basename(videoPath);
    const destination = path.join(UPLOADED_VIDEOS_DIR, filename);
    await fs.rename(videoPath, destination);
    console.log(`[${ACCOUNT_ID}] Moved ${filename} to uploaded folder`);
  } catch (error) {
    console.error(`[${ACCOUNT_ID}] Failed to move video: ${error.message}`);
  }
}

async function generateCaption(videoInfo, openRouterKeys, geminiKeys) {
  let caption = "";

  // Add quote if enabled
  if (config.ai_caption?.add_quote) {
    const quote = await getRandomQuote();
    caption = quote + "\n\n";
    console.log(`[${ACCOUNT_ID}] Added quote: ${quote}`);
  }

  // Generate AI caption if enabled
  if (config.ai_caption?.enabled) {
    const baseFilename = path.basename(videoInfo.filename, path.extname(videoInfo.filename));
    const videoDescription = baseFilename.replace(/_/g, ' ').replace(/\d+$/, '').trim();

    console.log(`[${ACCOUNT_ID}] Generating AI caption for: ${videoDescription}`);

    try {
      const prompt = (config.ai_caption?.prompt || "Buat caption untuk video: {VIDEO_DESCRIPTION}")
        .replace('{VIDEO_DESCRIPTION}', videoDescription);

      const result = await generateAiComment({
        caption: videoDescription,
        ctaLink: "",
        prompt: prompt,
        openRouterKeys: openRouterKeys,
        geminiKeys: geminiKeys,
        staticComments: [config.ai_caption?.fallback_caption || "Check this out! 🔥"],
        geminiWorkingIndex: 0,
        accountId: ACCOUNT_ID
      });

      caption += result.comment;
      console.log(`[${ACCOUNT_ID}] AI caption via ${result.provider}${result.model ? ` (${result.model})` : ''}`);

    } catch (error) {
      console.log(`[${ACCOUNT_ID}] AI caption failed: ${error.message}, using fallback`);
      caption += config.ai_caption?.fallback_caption || "Check this out! 🔥";
    }
  } else {
    if (!caption) {
      caption = config.ai_caption?.fallback_caption || "Check this out! 🔥";
    }
  }

  // Add attribution if from downloaded source
  if (videoInfo.source !== 'local' && videoInfo.attribution) {
    caption += `\n\n📹 Video by ${videoInfo.attribution.photographer}`;
  }

  console.log(`[${ACCOUNT_ID}] Final caption: "${caption}"`);
  return caption;
}

async function addMentions(page, settings = {}) {
  const mentions = settings?.mentions || ['pengikut', 'sorotan'];
  const delayBetween = settings?.delay_between_mentions || 1500;
  const delayAfterTab = settings?.delay_after_tab || 1000;

  console.log(`[${ACCOUNT_ID}] 👥 Adding ${mentions.length} mentions...`);

  for (const mention of mentions) {
    try {
      console.log(`[${ACCOUNT_ID}] 👥 Typing @${mention}...`);

      // Type mention
      await page.keyboard.type(` @${mention}`, { delay: 100 });
      await delay(delayBetween);

      // Press Tab to select from dropdown
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Tab');
      await delay(delayAfterTab);

      console.log(`[${ACCOUNT_ID}] ✅ @${mention} added`);

    } catch (error) {
      console.log(`[${ACCOUNT_ID}] ⚠️ Failed to add @${mention}: ${error.message}`);
      // Continue with next mention
    }
  }

  console.log(`[${ACCOUNT_ID}] ✅ All mentions processed`);
  await delay(2000);
}

async function addHastags(page, settings = {}) {
  const hastags = settings?.hastags || ['fbpro', 'fblifestyle'];

  console.log(`[${ACCOUNT_ID}] 👥 Adding ${hastags.length} Hastags...`);

  for (const hastag of hastags) {
    try {
      console.log(`[${ACCOUNT_ID}] 👥 Typing @${hastag}...`);

      // Type hastag
      await page.keyboard.type(` #${hastag}`, { delay: 100 });
      await page.keyboard.press('Space');

      console.log(`[${ACCOUNT_ID}] ✅ #${hastag} added`);

    } catch (error) {
      console.log(`[${ACCOUNT_ID}] ⚠️ Failed to add @${hastag}: ${error.message}`);
      // Continue with next hastag
    }
  }

  console.log(`[${ACCOUNT_ID}] ✅ All hastags processed`);
  await delay(2000);
}

async function uploadReelsVideo(page, video, caption) {
  console.log(`[${ACCOUNT_ID}] === Uploading Reels Video ===`);
  console.log(`[${ACCOUNT_ID}] File: ${video.filename}`);
  console.log(`[${ACCOUNT_ID}] Size: ${video.sizeGB}GB`);
  console.log(`[${ACCOUNT_ID}] Source: ${video.source}`);
  console.log(`[${ACCOUNT_ID}] Caption: "${caption}"`);

  try {
    console.log(`[${ACCOUNT_ID}] [1/6] Navigating to Facebook...`);
    await page.setViewport({ width: 1280, height: 1024 });

    try {
      await page.goto('https://www.facebook.com/', {
        waitUntil: 'domcontentloaded',
        timeout: 90000
      });
    } catch (navError) {
      console.log(`[${ACCOUNT_ID}] Navigation timeout, but continuing...`);
    }

    await delay(5000);

    console.log(`[${ACCOUNT_ID}] [2/6] Uploading video file...`);
    const fileInputSelectors = [
      'input[type="file"][accept*="video"]',
      'input[type="file"]'
    ];

    let fileUploaded = false;

    for (const selector of fileInputSelectors) {
      try {
        await page.waitForSelector(selector, { timeout: 10000, visible: false });
        const fileInput = await page.$(selector);

        if (fileInput) {
          await fileInput.uploadFile(video.path);
          console.log(`[${ACCOUNT_ID}] Video file uploaded: ${video.filename}`);
          fileUploaded = true;

          const videoSizeMB = video.size / 1024 / 1024;
          const afterVideoUpload = config.typing_delays?.after_video_upload || 8000;
          const additionalWait = Math.max(0, videoSizeMB * 100);
          const waitTime = afterVideoUpload + additionalWait;

          console.log(`[${ACCOUNT_ID}] Waiting for video to process (${waitTime}ms)...`);
          await delay(waitTime);
          break;
        }
      } catch (e) {
        continue;
      }
    }

    if (!fileUploaded) {
      throw new Error("Failed to upload video file");
    }

    console.log(`[${ACCOUNT_ID}] [3/6] Adding caption...`);
    await delay(3000);

    const captionSelectors = [
      'div[contenteditable="true"]',
    ];

    let captionAdded = false;

    for (const selector of captionSelectors) {
      try {
        console.log(`[${ACCOUNT_ID}] Waiting for caption input selector: ${selector}`);
        await page.waitForSelector(selector, { timeout: 15000 });
        const captionInput = await page.$(selector);

        if (captionInput) {
          const isVisible = await captionInput.boundingBox();
          if (isVisible && isVisible.width > 0 && isVisible.height > 0) {
            await captionInput.click();
            await delay(1000);
            await captionInput.focus();

            const typingSpeed = config.typing_delays?.typing_speed || 80;
            await page.keyboard.type(caption, { delay: typingSpeed });
            console.log(`[${ACCOUNT_ID}] Caption added successfully`);
            await addMentions(page);
            console.log(`[${ACCOUNT_ID}] Adding mentions`);
            await addHastags(page);
            console.log(`[${ACCOUNT_ID}] Adding Hastags`);
            const afterCaption = config.typing_delays?.after_caption || 3000;
            await delay(afterCaption);

            captionAdded = true;
            break;
          }
        }
      } catch (e) {
        console.log(`[${ACCOUNT_ID}] Caption input failed: ${e.message}`);
        continue;
      }
    }

    if (!captionAdded) {
      console.log(`[${ACCOUNT_ID}] Warning: Could not add caption, continuing...`);
    }


    console.log(`[${ACCOUNT_ID}] [4/6] Clicking "Berikutnya"...`);

    const nextButtonSelector = 'div:nth-of-type(4) div.x1l90r2v span > span';
    try {
      await page.waitForSelector(nextButtonSelector, { timeout: 15000 });
      await page.click(nextButtonSelector);
      console.log(`[${ACCOUNT_ID}] Clicked "Berikutnya" button`);
    } catch (error) {
      console.log(`[${ACCOUNT_ID}] Failed to find "Berikutnya" button: ${error.message}`);
    }

    const beforePost = config.typing_delays?.before_post || 2000;
    await delay(beforePost);

    console.log(`[${ACCOUNT_ID}] [5/6] Clicking "Kirim"...`);

    const postButtonSelectors = [
      'div:nth-of-type(1) > div > div:nth-of-type(4) div.xod5an3 span > span',
      'div.xod5an3 span > span'
    ];

    let posted = false;

    for (const selector of postButtonSelectors) {
      try {
        const element = await page.$(selector);
        if (element) {
          const text = await element.evaluate(el => el.textContent);
          const isVisible = await element.boundingBox();

          if (isVisible && text && (text.includes('Kirim') || text.includes('Post') || text.includes('Posting'))) {
            await element.click();
            console.log(`[${ACCOUNT_ID}] Post clicked: "${text}"`);
            await delay(10000);
            posted = true;
            break;
          }
        }
      } catch (e) {
        continue;
      }
    }

    if (!posted) {
      const fallbackPosted = await page.evaluate(() => {
        const buttonTexts = ['Kirim', 'Post', 'Posting'];
        const buttons = document.querySelectorAll('div[role="button"], button, span');

        for (const button of buttons) {
          const text = (button.textContent || '').trim();
          const ariaLabel = button.getAttribute('aria-label') || '';

          for (const searchText of buttonTexts) {
            if (text === searchText || text.includes(searchText) || ariaLabel.includes(searchText)) {
              const rect = button.getBoundingClientRect();
              const isDisabled = button.disabled || button.getAttribute('aria-disabled') === 'true';

              if (rect.width > 30 && rect.height > 20 && !isDisabled && button.offsetParent !== null) {
                button.click();
                return { success: true, text: text || ariaLabel };
              }
            }
          }
        }
        return { success: false };
      });

      if (fallbackPosted.success) {
        console.log(`[${ACCOUNT_ID}] Post clicked (fallback): "${fallbackPosted.text}"`);
        posted = true;
      }
    }

    await delay(10000);

    console.log(`[${ACCOUNT_ID}] [6/6] Waiting for DOM content to load...`);
    try {
      await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 });
    } catch (e) {
      console.log(`[${ACCOUNT_ID}] Navigation timeout, checking current state...`);
    }

    console.log(`[${ACCOUNT_ID}] Waiting for upload to complete...`);
    await delay(15000);

    const currentUrl = page.url();
    console.log(`[${ACCOUNT_ID}] Current URL: ${currentUrl}`);

    if (currentUrl.includes('/reel/') || currentUrl === 'https://www.facebook.com/') {
      console.log(`[${ACCOUNT_ID}] UPLOAD SUCCESS!`);

      await logUpload(video.filename, caption);

      if (config.videoSettings?.moveAfterUpload !== false) {
        await moveToUploaded(video.path);
      }

      return true;
    } else {
      console.log(`[${ACCOUNT_ID}] Upload status unclear, assuming success`);

      await logUpload(video.filename, caption);

      if (config.videoSettings?.moveAfterUpload !== false) {
        await moveToUploaded(video.path);
      }

      return true;
    }

  } catch (error) {
    console.error(`[${ACCOUNT_ID}] Upload error: ${error.message}`);
    throw error;
  }
}

async function main() {
  let browser;

  try {
    console.log(`\n[${ACCOUNT_ID}] ======================================`);
    console.log(`[${ACCOUNT_ID}] FacebookPro Blaster - Auto Upload Reels Bot`);
    console.log(`[${ACCOUNT_ID}] Account: ${ACCOUNT_ID}`);
    console.log(`[${ACCOUNT_ID}] ======================================\n`);

    await fs.mkdir(ARTIFACTS_DIR, { recursive: true });
    await fs.mkdir(LOCAL_VIDEOS_DIR, { recursive: true });
    await fs.mkdir(DOWNLOADED_VIDEOS_DIR, { recursive: true });

    const geminiKeys = await loadGeminiKeys();
    let openRouterKeys = [];

    if (config.ai_caption?.use_openrouter !== false) {
      openRouterKeys = await loadOpenRouterKeys(OPENROUTER_KEYS_PATH);
      console.log(`[${ACCOUNT_ID}] Loaded ${openRouterKeys.length} OpenRouter key(s)`);
    }

    console.log(`[${ACCOUNT_ID}] Loaded ${geminiKeys.length} Gemini key(s)`);

    // Load video API keys
    const pexelsKeys = await loadPexelsKeys();
    const pixabayKeys = await loadPixabayKeys();
    console.log(`[${ACCOUNT_ID}] Loaded ${pexelsKeys.length} Pexels key(s)`);
    console.log(`[${ACCOUNT_ID}] Loaded ${pixabayKeys.length} Pixabay key(s)`);

    console.log(`[${ACCOUNT_ID}] Launching stealth browser...`);

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

    const cookies = await loadCookiesFromFile();
    await page.setCookie(...cookies);
    console.log(`[${ACCOUNT_ID}] Cookies loaded`);

    const maxUploads = config.maxUploadsPerRun || 3;
    let uploadedCount = 0;

    for (let i = 0; i < maxUploads; i++) {
      try {
        console.log(`\n[${ACCOUNT_ID}] --- Processing video ${i + 1}/${maxUploads} ---`);

        // Select video (local or auto-download)
        const video = await selectVideo(pexelsKeys, pixabayKeys);

        // Generate caption with quote
        const caption = await generateCaption(video, openRouterKeys, geminiKeys);

        await uploadReelsVideo(page, video, caption);

        uploadedCount++;
        console.log(`[${ACCOUNT_ID}] Progress: ${uploadedCount}/${maxUploads} videos uploaded`);

        if (i < maxUploads - 1) {
          const interval = 1000 * (Math.floor(Math.random() * (config.maxIntervalSeconds - config.minIntervalSeconds + 1)) + config.minIntervalSeconds);
          console.log(`[${ACCOUNT_ID}] Waiting ${interval / 1000}s before next upload...`);
          await delay(interval);
        }

      } catch (error) {
        console.error(`[${ACCOUNT_ID}] Failed to process video ${i + 1}: ${error.message}`);

        // Take error screenshot
        try {
          const screenshotPath = path.join(ARTIFACTS_DIR, `error_video_${i + 1}_${Date.now()}.png`);
          await page.screenshot({ path: screenshotPath, fullPage: false });
          console.log(`[${ACCOUNT_ID}] Error screenshot: ${screenshotPath}`);
        } catch (e) {
          console.log(`[${ACCOUNT_ID}] Failed to capture error screenshot`);
        }

        continue;
      }
    }

    console.log(`\n[${ACCOUNT_ID}] ======================================`);
    console.log(`[${ACCOUNT_ID}] AUTO-UPLOAD COMPLETED`);
    console.log(`[${ACCOUNT_ID}] Uploaded: ${uploadedCount}/${maxUploads} videos`);
    console.log(`[${ACCOUNT_ID}] ======================================\n`);

    await notify.success(ACCOUNT_ID, BOT_NAME, `Uploaded ${uploadedCount} reels videos`);

  } catch (error) {
    console.error(`\n[${ACCOUNT_ID}] ERROR: ${error.message}\n`);
    console.error(error.stack);

    await notify.error(ACCOUNT_ID, BOT_NAME, error.message);

    // Take error screenshot
    if (browser) {
      try {
        const pages = await browser.pages();
        if (pages.length > 0) {
          const page = pages[0];
          const screenshotPath = path.join(ARTIFACTS_DIR, `error_${ACCOUNT_ID}_${Date.now()}.png`);
          await page.screenshot({ path: screenshotPath, fullPage: false });
          console.log(`[${ACCOUNT_ID}] Error screenshot: ${screenshotPath}`);
        }
      } catch (e) {
        console.log(`[${ACCOUNT_ID}] Failed to capture error screenshot`);
      }
    }

    throw error;

  } finally {
    if (browser) {
      try {
        // CRITICAL: Complete cleanup
        const pages = await browser.pages();
        for (const page of pages) {
          try {
            await page.close();
          } catch (e) {
            // Ignore page close errors
          }
        }

        await delay(2000);

        await browser.close();
        console.log(`[${ACCOUNT_ID}] Browser closed`);

        // CRITICAL: Extra delay between sequential accounts
        await delay(3000);

      } catch (e) {
        console.log(`[${ACCOUNT_ID}] Error during cleanup: ${e.message}`);
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

main().catch(error => {
  console.error(`[${ACCOUNT_ID}] Fatal error:`, error);
  process.exit(1);
});

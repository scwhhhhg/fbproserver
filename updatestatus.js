// updatestatus.js - IMPROVED VERSION WITH PHOTO FALLBACK & LOGGING
const puppeteer = require("puppeteer");
const fs = require("fs").promises;
const path = require("path");
const axios = require("axios");

// ========================================
// CONFIGURATION
// ========================================
const ACCOUNT_ID = process.env.ACCOUNT_ID || 'default';
// Dynamic Base Path for Binary Support
const isCompiled = path.basename(process.execPath).endsWith('.exe') && !process.execPath.toLowerCase().includes('node.exe') && !process.execPath.toLowerCase().includes('bun.exe');
const basePath = isCompiled ? path.dirname(process.execPath) : __dirname;
const ACCOUNTS_DIR = path.join(basePath, "../accounts");
const BOT_NAME = process.env.BOT_NAME || 'updatestatus';

// Load config
let config;
try {
  const configPath = path.join(ACCOUNTS_DIR, ACCOUNT_ID, "bots", `${BOT_NAME}.json`);
  config = require(configPath);
  console.log(`[${ACCOUNT_ID}] ⚙️  Config loaded from: ${configPath}`);
} catch (e) {
  console.log(`[${ACCOUNT_ID}] ⚙️  Using default config (file not found)`);
  config = {
    headless: "new",
    minIntervalSeconds: 300,
    maxIntervalSeconds: 600,
    gemini_prompt: "Tulis status Facebook singkat (2-4 kalimat) dengan gaya bahasa santai dan personal seolah ditulis oleh seorang gadis muda berusia 20-an.",
    ai_settings: {
      use_openrouter: true,
      typing_delay_after_click: 2000
    },
    typing_delays: {
      after_click: 2000,
      after_clear: 800,
      typing_speed: 100,
      after_typing: 6000,
      long_text_extra: 3000,
      final_verification: 2000,
      after_photo_upload: 5000,
      before_caption: 3000
    },
    photo_settings: {
      enabled: true,
      use_local_photos: true,
      orientation: "landscape",
      per_page: 10,
      content_filter: "high"
    },
    memory_settings: {
      max_history: 50,
      min_similarity_threshold: 0.7,
      topics_to_track: true
    }
  };
}

// Override headless mode if FORCE_HEADLESS is set (from --headless flag)
if (process.env.FORCE_HEADLESS === 'false') {
  config.headless = false;
  console.log(`[${ACCOUNT_ID}] 🔍 Headless mode OVERRIDDEN: Browser will be visible (--headless flag)`);
}

console.log(`[${ACCOUNT_ID}] ⚙️  Photo settings:`, JSON.stringify(config.photo_settings, null, 2));

// Paths
const COOKIES_PATH = path.join(ACCOUNTS_DIR, ACCOUNT_ID, "cookies.json");
const GEMINI_KEYS_PATH = path.join(ACCOUNTS_DIR, ACCOUNT_ID, "gemini_keys.txt");
const OPENROUTER_KEYS_PATH = path.join(ACCOUNTS_DIR, ACCOUNT_ID, "openrouter_keys.txt");
const UNSPLASH_KEY_PATH = path.join(ACCOUNTS_DIR, ACCOUNT_ID, "unsplash_keys.txt");
const ARTIFACTS_DIR = path.join(__dirname, "../artifacts", ACCOUNT_ID);
const PHOTOS_DIR = path.join(ARTIFACTS_DIR, "downloaded_photos");
const LOCAL_PHOTOS_DIR = path.join(__dirname, "../photos");
const TEMP_PHOTOS_DIR = path.join(ACCOUNTS_DIR, ACCOUNT_ID, "photos"); // Folder temp untuk foto
const LOG_STATUS_PATH = path.join(ACCOUNTS_DIR, ACCOUNT_ID, "log_status.txt");
const LOG_PHOTOS_PATH = path.join(ACCOUNTS_DIR, ACCOUNT_ID, "log_photos.txt"); // Log foto yang sudah digunakan
const MEMORY_DB_PATH = path.join(__dirname, "../accounts", ACCOUNT_ID, "memory.json");

// Telegram logger
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

// ========================================
// PHOTO LOGGING SYSTEM
// ========================================
class PhotoLogger {
  constructor() {
    this.usedPhotos = new Set();
  }

  async load() {
    try {
      const data = await fs.readFile(LOG_PHOTOS_PATH, 'utf8');
      const lines = data.split('\n').filter(line => line.trim());
      lines.forEach(line => {
        // Format: [timestamp] filename
        const match = line.match(/\] (.+)$/);
        if (match) {
          this.usedPhotos.add(match[1]);
        }
      });
      console.log(`[${ACCOUNT_ID}] 📸 Loaded ${this.usedPhotos.size} used photos from log`);
    } catch (error) {
      console.log(`[${ACCOUNT_ID}] 📸 Creating new photo log`);
      this.usedPhotos = new Set();
    }
  }

  async logPhoto(filename) {
    this.usedPhotos.add(filename);
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${filename}\n`;
    await fs.appendFile(LOG_PHOTOS_PATH, logEntry);
  }

  isPhotoUsed(filename) {
    return this.usedPhotos.has(filename);
  }

  getUsedPhotosCount() {
    return this.usedPhotos.size;
  }
}

// ========================================
// MEMORY MANAGEMENT
// ========================================
class StatusMemory {
  constructor(maxHistory = 50) {
    this.maxHistory = maxHistory;
    this.history = [];
    this.topics = new Map();
  }

  async load() {
    try {
      const data = await fs.readFile(MEMORY_DB_PATH, 'utf8');
      const parsed = JSON.parse(data);
      this.history = parsed.history || [];
      this.topics = new Map(Object.entries(parsed.topics || {}));
      console.log(`[${ACCOUNT_ID}] 💾 Loaded ${this.history.length} status from memory`);
    } catch (error) {
      console.log(`[${ACCOUNT_ID}] 💾 Creating new memory database`);
      this.history = [];
      this.topics = new Map();
    }
  }

  async save() {
    const data = {
      history: this.history,
      topics: Object.fromEntries(this.topics),
      lastUpdated: new Date().toISOString()
    };
    await fs.writeFile(MEMORY_DB_PATH, JSON.stringify(data, null, 2), 'utf8');
    console.log(`[${ACCOUNT_ID}] 💾 Saved ${this.history.length} status to memory`);
  }

  addStatus(status, metadata = {}) {
    const entry = {
      status: status,
      timestamp: new Date().toISOString(),
      timeOfDay: metadata.timeOfDay || 'Unknown',
      provider: metadata.provider || 'unknown',
      topics: this.extractTopics(status)
    };

    this.history.unshift(entry);

    // Keep only last N entries
    if (this.history.length > this.maxHistory) {
      this.history = this.history.slice(0, this.maxHistory);
    }

    // Update topic frequency
    entry.topics.forEach(topic => {
      this.topics.set(topic, (this.topics.get(topic) || 0) + 1);
    });

    console.log(`[${ACCOUNT_ID}] 📝 Added to memory. Total: ${this.history.length}`);
  }

  extractTopics(text) {
    const topics = [];
    const lower = text.toLowerCase();

    // Common topics
    const topicKeywords = {
      'makanan': ['makan', 'lapar', 'masak', 'sarapan', 'makan siang', 'makan malam', 'kopi', 'nasi', 'ayam'],
      'cuaca': ['panas', 'hujan', 'dingin', 'cerah', 'mendung', 'gerimis'],
      'aktivitas': ['kerja', 'kuliah', 'belajar', 'meeting', 'tugas', 'deadline'],
      'hiburan': ['nonton', 'film', 'drama', 'musik', 'game', 'scrolling'],
      'perasaan': ['senang', 'sedih', 'lelah', 'capek', 'happy', 'bosan', 'semangat'],
      'weekend': ['weekend', 'sabtu', 'minggu', 'libur', 'santai'],
      'tidur': ['tidur', 'ngantuk', 'begadang', 'insomnia', 'mimpi'],
      'teman': ['teman', 'sahabat', 'bestie', 'ngobrol', 'hangout']
    };

    for (const [topic, keywords] of Object.entries(topicKeywords)) {
      if (keywords.some(keyword => lower.includes(keyword))) {
        topics.push(topic);
      }
    }

    return topics;
  }

  getRecentStatuses(count = 10) {
    return this.history.slice(0, count);
  }

  getOverusedTopics(threshold = 3) {
    const recent = this.history.slice(0, 10);
    const recentTopics = new Map();

    recent.forEach(entry => {
      entry.topics.forEach(topic => {
        recentTopics.set(topic, (recentTopics.get(topic) || 0) + 1);
      });
    });

    return Array.from(recentTopics.entries())
      .filter(([_, count]) => count >= threshold)
      .map(([topic, _]) => topic);
  }

  calculateSimilarity(str1, str2) {
    const words1 = str1.toLowerCase().split(/\s+/);
    const words2 = str2.toLowerCase().split(/\s+/);

    const set1 = new Set(words1);
    const set2 = new Set(words2);

    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);

    return intersection.size / union.size;
  }

  isTooSimilar(newStatus, threshold = 0.7) {
    const recent = this.history.slice(0, 5);

    for (const entry of recent) {
      const similarity = this.calculateSimilarity(newStatus, entry.status);
      if (similarity >= threshold) {
        console.log(`[${ACCOUNT_ID}] ⚠️ Too similar (${(similarity * 100).toFixed(0)}%): "${entry.status}"`);
        return true;
      }
    }

    return false;
  }

  getMemoryPrompt() {
    const recent = this.getRecentStatuses(10);
    const overusedTopics = this.getOverusedTopics(3);

    if (recent.length === 0) {
      return "\n🆕 Ini status pertama, bebas pilih topik!\n";
    }

    let prompt = "\n📚 MEMORY - STATUS YANG SUDAH PERNAH DIPOSTING:\n";
    prompt += "=".repeat(50) + "\n";

    recent.forEach((entry, idx) => {
      const time = new Date(entry.timestamp).toLocaleString('id-ID', {
        timeZone: 'Asia/Jakarta',
        hour: '2-digit',
        minute: '2-digit'
      });
      prompt += `${idx + 1}. [${entry.timeOfDay} - ${time}] "${entry.status}"\n`;
    });

    prompt += "=".repeat(50) + "\n";

    if (overusedTopics.length > 0) {
      prompt += `\n🚫 TOPIK YANG TERLALU SERING (HINDARI!):\n`;
      prompt += overusedTopics.map(t => `- ${t.toUpperCase()}`).join('\n');
      prompt += "\n";
    }

    prompt += `\n✅ ATURAN PENTING:\n`;
    prompt += `1. JANGAN tulis status yang mirip dengan 10 status di atas!\n`;
    prompt += `2. HINDARI topik yang sudah terlalu sering\n`;
    prompt += `3. Buat sesuatu yang BARU dan FRESH\n`;
    prompt += `4. Gunakan perspektif atau sudut pandang yang berbeda\n`;
    prompt += `5. Ekspresikan emosi atau pengalaman dengan cara unik\n\n`;

    return prompt;
  }

  getStats() {
    const topTopics = Array.from(this.topics.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    return {
      totalStatuses: this.history.length,
      topTopics
    };
  }
}

// ========================================
// API KEY LOADERS
// ========================================
async function loadKeys(filePath, validator = k => k.length > 10) {
  try {
    const data = await fs.readFile(filePath, "utf8");
    return data.split("\n")
      .map(k => k.trim())
      .filter(k => !k.startsWith('#') && validator(k));
  } catch (error) {
    return [];
  }
}

async function loadGeminiKeys() {
  const keys = await loadKeys(GEMINI_KEYS_PATH, k => k.startsWith("AIzaSy"));
  if (keys.length === 0) {
    await fs.writeFile(GEMINI_KEYS_PATH, "# Add Gemini API keys (one per line)\n# AIzaSy...");
  }
  return keys;
}

async function loadOpenRouterKeys() {
  return loadKeys(OPENROUTER_KEYS_PATH, k => k.startsWith("sk-or-"));
}

async function loadUnsplashKeys() {
  return loadKeys(UNSPLASH_KEY_PATH);
}

function getTimeContext() {
  const now = new Date();
  const hours = now.getHours();
  const minutes = now.getMinutes();
  const day = now.getDay();

  let timeOfDay;
  let timeDescription;

  if (hours >= 5 && hours < 10) {
    timeOfDay = 'Pagi';
    timeDescription = 'pagi hari (05:00-10:00)';
  } else if (hours >= 10 && hours < 15) {
    timeOfDay = 'Siang';
    timeDescription = 'siang hari (10:00-15:00)';
  } else if (hours >= 15 && hours < 18) {
    timeOfDay = 'Sore';
    timeDescription = 'sore hari (15:00-18:00)';
  } else if (hours >= 18 && hours < 22) {
    timeOfDay = 'Malam';
    timeDescription = 'malam hari (18:00-22:00)';
  } else {
    timeOfDay = 'Larut Malam';
    timeDescription = 'larut malam (22:00-05:00)';
  }

  const isWeekend = day === 0 || day === 6;
  const dayType = isWeekend ? 'akhir pekan' : 'hari kerja';

  return {
    hours,
    minutes,
    timeOfDay,
    timeDescription,
    isWeekend,
    dayType,
    fullTime: `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`
  };
}

async function generateWithGemini(basePrompt, memory) {
  const keys = await loadGeminiKeys();

  if (keys.length === 0) {
    throw new Error('No Gemini keys found');
  }

  const memoryPrompt = memory.getMemoryPrompt();
  const fullPrompt = basePrompt + memoryPrompt;

  for (let i = 0; i < keys.length; i++) {
    const apiKey = keys[i];
    try {
      console.log(`[${ACCOUNT_ID}] 🤖 Trying Gemini (key ${i + 1}/${keys.length})...`);

      const response = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`,
        {
          contents: [{
            parts: [{ text: fullPrompt }]
          }],
          generationConfig: {
            temperature: 0.9,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 200
          },
          safetySettings: [
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
          ]
        },
        { timeout: 30000 }
      );

      const text = response.data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      if (!text) {
        console.log(`[${ACCOUNT_ID}] ⚠️ Gemini returned empty response`);
        continue;
      }

      console.log(`[${ACCOUNT_ID}] ✅ Gemini success`);
      return { status: text, provider: 'Gemini' };

    } catch (error) {
      const errMsg = error.response?.data?.error?.message || error.message;
      const errCode = error.response?.status;
      console.log(`[${ACCOUNT_ID}] ⚠️ Gemini key ${i + 1} failed (${errCode}): ${errMsg}`);
      continue;
    }
  }

  throw new Error('All Gemini keys failed');
}

async function generateWithOpenRouter(basePrompt, memory) {
  const keys = await loadOpenRouterKeys();

  if (keys.length === 0) {
    throw new Error('No OpenRouter keys found');
  }

  const memoryPrompt = memory.getMemoryPrompt();
  const fullPrompt = basePrompt + memoryPrompt;

  const models = [
    'qwen/qwen-2.5-72b-instruct',  // Most stable, no :free suffix
    'meta-llama/llama-3.2-3b-instruct:free',
    'x-ai/grok-2-vision-1212:free',
    'google/gemma-2-9b-it:free',
    'mistralai/mistral-7b-instruct:free',
    'nousresearch/hermes-3-llama-3.1-405b:free'
  ];

  for (const apiKey of keys) {
    for (const model of models) {
      try {
        console.log(`[${ACCOUNT_ID}] 🤖 Trying OpenRouter (${model})...`);

        const response = await axios.post(
          'https://openrouter.ai/api/v1/chat/completions',
          {
            model,
            messages: [
              {
                role: 'user',
                content: fullPrompt
              }
            ]
          },
          {
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json'
            },
            timeout: 30000
          }
        );

        const text = response.data.choices?.[0]?.message?.content?.trim();
        if (!text) {
          console.log(`[${ACCOUNT_ID}] ⚠️ ${model} returned empty response`);
          continue;
        }

        console.log(`[${ACCOUNT_ID}] ✅ OpenRouter success with ${model}`);
        return { status: text, provider: `OpenRouter (${model})` };

      } catch (error) {
        console.log(`[${ACCOUNT_ID}] ⚠️ ${model} failed: ${error.message}`);
        continue;
      }
    }
  }

  throw new Error('All OpenRouter models failed');
}

async function generateTimeAwareStatus(context, memory) {
  const basePrompt = `${config.gemini_prompt}

⏰ KONTEKS WAKTU SAAT INI:
- Waktu: ${context.timeOfDay} (${context.fullTime} WIB)
- Detail: ${context.timeDescription}
- Tipe hari: ${context.dayType}

🎯 INSTRUKSI:
- Buat status yang SANGAT RELEVAN dengan waktu ${context.timeOfDay}
- Status harus natural dan sesuai aktivitas di jam ${context.fullTime}
- Gunakan konteks ${context.dayType} dalam status
- Jangan tulis meta-text seperti "Status:" atau "Caption:"
- Langsung tulis statusnya saja!

CONTOH STYLE (jangan copy, buat yang baru!):
- Pagi: "Bangun pagi enak bgt dengerin burung berkicau 🌤️"
- Siang: "Panasss bgt ga sanggup keluar rumah 😫"
- Sore: "Sore2 gini enaknya ngeteh sambil liat sunset ☕"
- Malam: "Nyantai dulu ah abis seharian cape 😌"

✏️ Tulis status yang benar-benar beda dari sebelumnya:`;

  const maxAttempts = 5;
  let attempts = 0;
  let geminiTried = false;

  while (attempts < maxAttempts) {
    attempts++;

    try {
      let result;

      // Try Gemini only once, then switch to OpenRouter
      if (!geminiTried) {
        try {
          console.log(`[${ACCOUNT_ID}] 🔄 Attempt ${attempts}/${maxAttempts}: Trying Gemini...`);
          result = await generateWithGemini(basePrompt, memory);
          geminiTried = true;
        } catch (geminiError) {
          console.log(`[${ACCOUNT_ID}] 📱 Gemini unavailable, switching to OpenRouter permanently`);
          geminiTried = true; // Don't try Gemini again
          result = await generateWithOpenRouter(basePrompt, memory);
        }
      } else {
        // Use OpenRouter for all subsequent attempts
        console.log(`[${ACCOUNT_ID}] 🔄 Attempt ${attempts}/${maxAttempts}: Using OpenRouter...`);
        result = await generateWithOpenRouter(basePrompt, memory);
      }

      // Clean up the status
      let cleanStatus = result.status
        .replace(/^(Status:|Caption:|Post:)\s*/gi, '')
        .replace(/^["']|["']$/g, '')
        .trim();

      // Check similarity
      if (memory.isTooSimilar(cleanStatus)) {
        console.log(`[${ACCOUNT_ID}] 🔄 Attempt ${attempts}/${maxAttempts}: Too similar, regenerating...`);
        await delay(2000);
        continue;
      }

      return { status: cleanStatus, provider: result.provider };

    } catch (error) {
      console.log(`[${ACCOUNT_ID}] ❌ Attempt ${attempts}/${maxAttempts} failed: ${error.message}`);

      if (attempts >= maxAttempts) {
        throw new Error('Failed to generate unique status after maximum attempts');
      }

      await delay(3000);
    }
  }

  throw new Error('Failed to generate status');
}

// ========================================
// PHOTO MANAGEMENT WITH LOGGING
// ========================================
async function getLocalPhotos() {
  try {
    console.log(`[${ACCOUNT_ID}] 📷 Checking local photos directory`);

    await fs.mkdir(LOCAL_PHOTOS_DIR, { recursive: true });
    const files = await fs.readdir(LOCAL_PHOTOS_DIR);

    const photoExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];

    const photoFiles = files.filter(f => {
      const ext = path.extname(f).toLowerCase();
      const isPhoto = photoExts.includes(ext);
      return isPhoto;
    });

    console.log(`[${ACCOUNT_ID}] 📷 Valid photo files: ${photoFiles.length}`);

    return photoFiles.map(f => path.join(LOCAL_PHOTOS_DIR, f));
  } catch (error) {
    console.log(`[${ACCOUNT_ID}] ⚠️ Error reading local photos: ${error.message}`);
    console.log(`[${ACCOUNT_ID}] ⚠️ Error stack: ${error.stack}`);
    return [];
  }
}

async function selectLocalPhoto(photoLogger) {
  const photos = await getLocalPhotos();

  if (photos.length === 0) {
    console.log(`[${ACCOUNT_ID}] 📷 No local photos found`);
    return null;
  }

  console.log(`[${ACCOUNT_ID}] 📷 Found ${photos.length} local photos`);

  // Filter out already used photos
  const unusedPhotos = photos.filter(photoPath => {
    const filename = path.basename(photoPath);
    return !photoLogger.isPhotoUsed(filename);
  });

  if (unusedPhotos.length === 0) {
    console.log(`[${ACCOUNT_ID}] ⚠️ All local photos have been used`);
    return null;
  }

  console.log(`[${ACCOUNT_ID}] 📷 ${unusedPhotos.length} unused photos available`);

  // Select random unused photo
  const selected = unusedPhotos[Math.floor(Math.random() * unusedPhotos.length)];
  const filename = path.basename(selected);

  // Copy to temp folder
  await fs.mkdir(TEMP_PHOTOS_DIR, { recursive: true });
  const tempPath = path.join(TEMP_PHOTOS_DIR, filename);
  await fs.copyFile(selected, tempPath);

  // Log the photo
  await photoLogger.logPhoto(filename);

  return {
    filePath: tempPath,
    attribution: { photographer: 'Local Upload', source: 'local' }
  };
}

async function downloadFromUnsplash(keywords, unsplashKeys) {
  await fs.mkdir(PHOTOS_DIR, { recursive: true });

  for (const key of unsplashKeys) {
    try {
      const { data } = await axios.get('https://api.unsplash.com/search/photos', {
        params: {
          query: keywords,
          orientation: config.photo_settings?.orientation || 'landscape',
          per_page: config.photo_settings?.per_page || 10
        },
        headers: { 'Authorization': `Client-ID ${key}` },
        timeout: 15000
      });

      if (data.results.length === 0) continue;

      const photo = data.results[Math.floor(Math.random() * data.results.length)];
      const photoData = await axios.get(photo.urls.regular, {
        responseType: 'arraybuffer',
        timeout: 30000
      });

      const fileName = `unsplash_${Date.now()}.jpg`;
      const filePath = path.join(PHOTOS_DIR, fileName);
      await fs.writeFile(filePath, photoData.data);

      console.log(`[${ACCOUNT_ID}] 📷 Unsplash: ${photo.user.name}`);

      return {
        filePath,
        attribution: {
          photographer: photo.user.name,
          source: 'unsplash'
        }
      };
    } catch (error) {
      continue;
    }
  }

  throw new Error('All Unsplash keys failed');
}

async function selectPhoto(photoLogger) {
  if (config.photo_settings?.enabled === false) {
    console.log(`[${ACCOUNT_ID}] 📷 Photos disabled in config`);
    return { filePath: null, attribution: { photographer: 'Text Only', source: 'none' } };
  }

  // Default to true if undefined (try local photos by default)
  const useLocalPhotos = config.photo_settings?.use_local_photos !== false;
  console.log(`[${ACCOUNT_ID}] 📷 Will use local photos: ${useLocalPhotos}`);

  // Try local photos first if enabled (default behavior)
  if (useLocalPhotos) {
    console.log(`[${ACCOUNT_ID}] 📷 Trying local photos...`);
    const local = await selectLocalPhoto(photoLogger);
    if (local) {
      console.log(`[${ACCOUNT_ID}] 📷 ✅ Local photo selected: ${path.basename(local.filePath)}`);
      return local;
    }

    console.log(`[${ACCOUNT_ID}] 📷 No local photos available, trying Unsplash...`);
  } else {
    console.log(`[${ACCOUNT_ID}] 📷 Local photos explicitly disabled in config, trying Unsplash...`);
  }

  // Try Unsplash as fallback
  const unsplashKeys = await loadUnsplashKeys();
  console.log(`[${ACCOUNT_ID}] 📷 Unsplash keys found: ${unsplashKeys.length}`);

  if (unsplashKeys.length > 0) {
    try {
      const unsplash = await downloadFromUnsplash('lifestyle positive', unsplashKeys);
      console.log(`[${ACCOUNT_ID}] 📷 ✅ Unsplash photo downloaded`);
      return unsplash;
    } catch (error) {
      console.log(`[${ACCOUNT_ID}] ❌ Unsplash failed: ${error.message}`);
    }
  }

  // PENTING: Selalu return object, jangan return null!
  console.log(`[${ACCOUNT_ID}] 📝 No photos available, will post text-only`);
  return { filePath: null, attribution: { photographer: 'Text Only', source: 'none' } };
}

// ========================================
// FACEBOOK AUTOMATION
// ========================================
async function loadCookiesFromFile() {
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
}

async function clickTextArea(page) {
  console.log(`[${ACCOUNT_ID}] 🖱️  Clicking text area...`);

  const selectors = [
    'div[role="button"][aria-label*="Apa yang Anda pikirkan"]',
    'div[aria-label*="Buat postingan"]',
    'div[role="button"][aria-label*="create"]',
    'div[role="button"][aria-label*="post"]',
    'div[aria-label*="Create"]'
  ];

  for (const selector of selectors) {
    try {
      const el = await page.$(selector);
      if (el) {
        await el.click();
        console.log(`[${ACCOUNT_ID}] ✅ Text area clicked`);
        await delay(3000); // Wait for dialog to fully open
        return true;
      }
    } catch (e) {
      continue;
    }
  }

  throw new Error('Could not find text area to click');
}

async function uploadPhoto(page, imagePath) {
  console.log(`[${ACCOUNT_ID}] 📤 Uploading photo...`);

  const photoButtonSelectors = [
    'input[type="file"][accept*="photo"]',
    'input[type="file"]'
  ];

  for (const selector of photoButtonSelectors) {
    try {
      const el = await page.$(selector);
      if (el) {
        await el.click();
        await delay(3000);
        break;
      }
    } catch (e) {
      continue;
    }
  }

  const fileInput = await page.$('input[type="file"]');
  if (!fileInput) {
    console.log(`[${ACCOUNT_ID}] ⚠️ File input not found, skipping photo upload`);
    return false;
  }

  await fileInput.uploadFile(imagePath);
  console.log(`[${ACCOUNT_ID}] ✅ Photo uploaded`);

  await delay(config.typing_delays?.after_photo_upload || 5000);
  return true;
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

async function typeCaption(page, caption) {

  await delay(config.typing_delays?.before_caption || 3000);
  await page.keyboard.type(caption, {
    delay: config.typing_delays?.typing_speed || 100
  });

  console.log(`[${ACCOUNT_ID}] ✅ Caption typed`);
  await delay(config.typing_delays?.after_typing || 6000);
  await addMentions(page);
  await addHastags(page);
}

async function clickNextButton(page) {
  console.log(`[${ACCOUNT_ID}] Finding Next button...`);

  await delay(5000);

  const nextButtonSelectors = [
    'div:nth-of-type(4) div.x1l90r2v span > span',
    'div.x1l90r2v span > span'
  ];

  for (const selector of nextButtonSelectors) {
    try {
      const element = await page.$(selector);
      if (element) {
        const text = await element.evaluate(el => el.textContent);
        const isVisible = await element.boundingBox();

        if (isVisible && text && (text.includes('Berikutnya') || text.includes('Next'))) {
          await element.click();
          console.log(`[${ACCOUNT_ID}] Next clicked: ${text}`);
          await delay(3000);
          return true;
        }
      }
    } catch (e) {
      continue;
    }
  }

  const fallbackNext = await page.evaluate(() => {
    const buttons = document.querySelectorAll('div[role="button"], button, span');
    for (const button of buttons) {
      const text = button.textContent || '';
      if (text.includes('Berikutnya') || text.includes('Next')) {
        const rect = button.getBoundingClientRect();
        if (rect.width > 30 && rect.height > 15 && button.offsetParent !== null) {
          button.click();
          return true;
        }
      }
    }
    return false;
  });

  if (fallbackNext) {
    console.log(`[${ACCOUNT_ID}] Next clicked (fallback)`);
    await delay(3000);
    return true;
  }

  console.log(`[${ACCOUNT_ID}] Next button not found, continuing...`);
  return false;
}

async function clickPostButton(page) {
  console.log(`[${ACCOUNT_ID}] Finding Post button...`);

  await delay(5000);

  const postButtonSelectors = [
    'div[aria-label="Posting"]',
    'div[aria-label="Kirim"]',
    'div[role="button"]:has-text("Bagikan")',
    'div.xod5an3 span > span'
  ];

  for (const selector of postButtonSelectors) {
    try {
      const element = await page.$(selector);
      if (element) {
        const text = await element.evaluate(el => el.textContent);
        const isVisible = await element.boundingBox();
        const isDisabled = await element.evaluate(el => {
          return el.disabled ||
            el.getAttribute('aria-disabled') === 'true' ||
            el.classList.contains('disabled');
        });

        if (isVisible && !isDisabled && text &&
          (text.includes('Kirim') || text.includes('Post') ||
            text.includes('Posting') || text.includes('Bagikan'))) {

          console.log(`[${ACCOUNT_ID}] Found button: "${text}"`);

          for (let attempt = 1; attempt <= 3; attempt++) {
            await element.click();
            console.log(`[${ACCOUNT_ID}] Click attempt ${attempt}/3`);
            await delay(2000);

            const dialogGone = await page.evaluate(() => {
              return !document.querySelector('div[role="dialog"]');
            });

            if (dialogGone) {
              console.log(`[${ACCOUNT_ID}] Dialog closed after click ${attempt}`);
              await delay(8000);
              return true;
            }
          }
        }
      }
    } catch (e) {
      continue;
    }
  }

  const fallbackPosted = await page.evaluate(() => {
    const buttonTexts = ['Kirim', 'Post', 'Posting'];
    const buttons = Array.from(document.querySelectorAll('div[role="button"], button, span'));

    buttons.sort((a, b) => {
      const rectA = a.getBoundingClientRect();
      const rectB = b.getBoundingClientRect();
      return (rectB.bottom + rectB.right) - (rectA.bottom + rectA.right);
    });

    for (const button of buttons) {
      const text = (button.textContent || '').trim();
      const ariaLabel = button.getAttribute('aria-label') || '';

      for (const searchText of buttonTexts) {
        if (text === searchText || text.includes(searchText) || ariaLabel.includes(searchText)) {
          const rect = button.getBoundingClientRect();
          const isDisabled = button.disabled ||
            button.getAttribute('aria-disabled') === 'true' ||
            button.classList.contains('disabled');

          if (rect.width > 50 && rect.height > 25 &&
            !isDisabled && button.offsetParent !== null &&
            rect.top >= 0 && rect.bottom <= window.innerHeight) {

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
    await delay(15000);
    return true;
  }

  console.log(`[${ACCOUNT_ID}] ⚠️ WARNING: Post button not found!`);
  return false;
}

async function verifyPostSuccess(page) {
  console.log(`[${ACCOUNT_ID}] Verifying post...`);

  await delay(5000);

  try {
    const isSuccess = await page.evaluate(() => {
      try {
        const dialogClosed = !document.querySelector('div[role="dialog"]');
        const backToTimeline = document.querySelector('[role="main"]') ||
          window.location.href === 'https://www.facebook.com/';
        const noErrors = !document.querySelector('[role="alert"]');
        const titleOk = document.title.includes('Facebook');

        const indicators = [dialogClosed, backToTimeline, noErrors, titleOk];
        const successCount = indicators.filter(Boolean).length;

        return {
          success: successCount >= 2,
          successCount
        };
      } catch (e) {
        return { success: false, error: e.message };
      }
    });

    if (isSuccess.success) {
      console.log(`[${ACCOUNT_ID}] Post verified (${isSuccess.successCount}/4 indicators)`);
      return true;
    } else {
      console.log(`[${ACCOUNT_ID}] Verification uncertain (${isSuccess.successCount}/4)`);
      return false;
    }
  } catch (error) {
    console.log(`[${ACCOUNT_ID}] Verification failed: ${error.message}`);
    return false;
  }
}

async function postStatus(page, status, photoInfo) {
  console.log(`[${ACCOUNT_ID}] 📝 Starting post process...`);

  // Upload foto langsung (ini akan membuka dialog)
  if (photoInfo.filePath) {
    await uploadPhoto(page, photoInfo.filePath);
  } else {
    // Hanya untuk text-only post, baru klik text area
    await clickTextArea(page);  // ← INI YANG HANDLE TEXT-ONLY
  }

  await typeCaption(page, status);
  await clickNextButton(page);
  await clickPostButton(page);
  await verifyPostSuccess(page);
}

// ========================================
// MAIN
// ========================================
async function main() {
  let browser;

  try {
    console.log(`\n[${ACCOUNT_ID}] ======================================`);
    console.log(`[${ACCOUNT_ID}] FacebookPro Blaster - Auto Post Bot with MEMORY`);
    console.log(`[${ACCOUNT_ID}] Priority: Gemini → OpenRouter`);
    console.log(`[${ACCOUNT_ID}] With Photo Logging & Fallback`);
    console.log(`[${ACCOUNT_ID}] ======================================\n`);

    await fs.mkdir(ARTIFACTS_DIR, { recursive: true });
    await fs.mkdir(TEMP_PHOTOS_DIR, { recursive: true });

    const memory = new StatusMemory(config.memory_settings?.max_history || 50);
    await memory.load();

    const photoLogger = new PhotoLogger();
    await photoLogger.load();

    const stats = memory.getStats();
    console.log(`[${ACCOUNT_ID}] 📊 Memory Stats:`);
    console.log(`[${ACCOUNT_ID}]   Total Statuses: ${stats.totalStatuses}`);
    console.log(`[${ACCOUNT_ID}]   Used Photos: ${photoLogger.getUsedPhotosCount()}`);
    if (stats.topTopics.length > 0) {
      console.log(`[${ACCOUNT_ID}]   Top Topics:`);
      stats.topTopics.forEach(([topic, count]) => {
        console.log(`[${ACCOUNT_ID}]     - ${topic}: ${count}x`);
      });
    }
    console.log('');

    const context = getTimeContext();
    const result = await generateTimeAwareStatus(context, memory);

    console.log(`[${ACCOUNT_ID}] 📝 Status: "${result.status}"`);
    console.log(`[${ACCOUNT_ID}] 🤖 Provider: ${result.provider}\n`);

    memory.addStatus(result.status, {
      timeOfDay: context.timeOfDay,
      provider: result.provider
    });
    await memory.save();

    const photoInfo = await selectPhoto(photoLogger);

    if (!photoInfo.filePath) {
      console.log(`[${ACCOUNT_ID}] 📝 Will post TEXT ONLY`);
    }

    // config.headless already overridden by FORCE_HEADLESS at top of file
    browser = await puppeteer.launch({
      headless: config.headless,
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
    await page.setViewport({ width: 1366, height: 768 });

    const cookies = await loadCookiesFromFile();
    await page.setCookie(...cookies);

    console.log(`[${ACCOUNT_ID}] 🌐 Navigating to Facebook...`);
    await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded' });
    await delay(15000);

    if (page.url().includes('/login')) {
      throw new Error('Cookies expired');
    }

    await postStatus(page, result.status, photoInfo);

    console.log(`\n[${ACCOUNT_ID}] ✅ SUCCESS!\n`);
    const successMsg = photoInfo.filePath
      ? `Posted with photo: ${result.status}`
      : `Posted text only: ${result.status}`;
    await notify.success(ACCOUNT_ID, BOT_NAME, successMsg);

  } catch (error) {
    console.error(`\n[${ACCOUNT_ID}] ❌ ERROR: ${error.message}\n`);
    await notify.error(ACCOUNT_ID, BOT_NAME, error.message);
    throw error;

  } finally {
    if (browser) {
      await browser.close();
      await delay(3000);
    }
  }
}

main().catch(error => {
  console.error(`[${ACCOUNT_ID}] Fatal: ${error.message}`);
  process.exit(1);
});

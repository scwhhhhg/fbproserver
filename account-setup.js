const fs = require("fs").promises;
const fsSync = require("fs");
const path = require("path");
const readline = require("readline");

class AccountSetup {
  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    this.accountsDir = path.join(__dirname, "../accounts");
    this.videosBaseDir = path.join(__dirname, "../videos");
    this.photosBaseDir = path.join(__dirname, "../photos");
  }

  async question(prompt) {
    return new Promise((resolve) => {
      this.rl.question(prompt, resolve);
    });
  }

  async setupNewAccount() {
    console.log("╔═══════════════════════════════════════════════════════════╗");
    console.log("║  FACEBOOKPRO BLASTER - ENHANCED ACCOUNT SETUP v3.0      ║");
    console.log("║  Separate Bot Configurations                             ║");
    console.log("║  Persona Handled by CommentGenerator                     ║");
    console.log("╚═══════════════════════════════════════════════════════════╝\n");
    console.log("🚀 Features:");
    console.log("   ✅ Auto-Login with Cookie Auto-Refresh");
    console.log("   ✅ OpenRouter AI (FREE models)");
    console.log("   ✅ Gemini AI (Fallback)");

    console.log("   ✅ Memory System (Anti-Monotony)");
    console.log("   ✅ Auto Upload Reels");
    console.log("   ✅ Telegram Notifications");
    console.log("   ✅ Smart Scheduler Integration");
    console.log("   ✅ Separate Bot Configurations");
    console.log("   ✅ Persona System (Handled by CommentGenerator)\n");

    const accountId = await this.question("📝 Enter account ID (e.g., account1, account2): ");

    if (!accountId || accountId.trim() === "") {
      throw new Error("Account ID cannot be empty");
    }

    const accountPath = path.join(this.accountsDir, accountId);
    const videosPath = path.join(this.videosBaseDir, accountId);
    const photosPath = path.join(this.photosBaseDir, accountId);

    if (fsSync.existsSync(accountPath)) {
      const overwrite = await this.question(`⚠️  Account ${accountId} exists. Overwrite? (y/N): `);
      if (overwrite.toLowerCase() !== 'y') {
        console.log("❌ Setup cancelled.");
        return;
      }
    }

    // Create directories
    await fs.mkdir(accountPath, { recursive: true });
    await fs.mkdir(videosPath, { recursive: true });
    await fs.mkdir(path.join(videosPath, "uploaded"), { recursive: true });
    await fs.mkdir(photosPath, { recursive: true });
    await fs.mkdir(path.join(accountPath, "bots"), { recursive: true }); // Create bots directory

    const accountName = await this.question("👤 Enter account display name: ") || accountId;
    const enabled = await this.question("🔛 Enable this account? (Y/n): ");
    const isEnabled = enabled.toLowerCase() !== 'n';

    // Persona Configuration
    console.log("\n╔═══════════════════════════════════════════════════════════╗");
    console.log("║  PERSONA CONFIGURATION                                     ║");
    console.log("╚═══════════════════════════════════════════════════════════╝");
    console.log("Choose AI persona for this account:");
    console.log("  1. friendly    - Ramah dan supportif (Default)");
    console.log("  2. professional- Formal tapi approachable");
    console.log("  3. humorous    - Fun dan menghibur");
    console.log("  4. motivational- Inspiratif dan empowering");
    console.log("  5. curious     - Ingin tahu dan exploratif\n");

    const personaChoice = await this.question("Select persona (1-5) [1]: ") || "1";
    const personaMap = {
      "1": "friendly",
      "2": "professional",
      "3": "humorous",
      "4": "motivational",
      "5": "curious"
    };

    const persona = {
      enabled: true,
      type: personaMap[personaChoice] || "friendly"
    };

    // Auto-Login Configuration
    console.log("\n╔═══════════════════════════════════════════════════════════╗");
    console.log("║  AUTO-LOGIN CONFIGURATION (Recommended!)                  ║");
    console.log("╚═══════════════════════════════════════════════════════════╝");
    console.log("💡 Benefits:");
    console.log("   ✅ Automatic cookie refresh (no manual update)");
    console.log("   ✅ Works with 2FA (Google Authenticator)");
    console.log("   ✅ Integrated with maintenance system");
    console.log("   ✅ Anti-detection measures\n");

    const setupLogin = await this.question("🔐 Setup auto-login? (Y/n): ");
    let loginConfig = null;

    if (setupLogin.toLowerCase() !== 'n') {
      loginConfig = await this.setupLoginConfiguration();
    }

    // OpenRouter AI Configuration
    console.log("\n╔═══════════════════════════════════════════════════════════╗");
    console.log("║  OPENROUTER AI CONFIGURATION (FREE Models!)               ║");
    console.log("╚═══════════════════════════════════════════════════════════╝");
    const aiSettings = await this.setupAIConfiguration();

    // Create main account config (without bots)
    const mainConfig = {
      enabled: isEnabled,
      name: accountName,
      persona: persona,
      safety: {
        maxRunsPerDay: 15,
        maxRunsPerHour: 3,
        cooldownOnFailure: 1800,
        quietHours: {
          enabled: true,
          start: 2,
          end: 6
        }
      },
      autoLogin: {
        enabled: !!loginConfig,
        cookieAutoRefresh: !!loginConfig
      },
      global_ai_settings: aiSettings,
      enhanced_features: {
        openrouter_ai: true,
        free_models: true,

        memory_system: true,
        auto_upload_reels: true,
        multi_model_fallback: true,
        telegram_notifications: true,
        persona_system: true
      },
      timezone: "Asia/Jakarta",
      created: new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }),
      version: "4.3.0-clean"
    };

    // Save main config
    await fs.writeFile(
      path.join(accountPath, "config.json"),
      JSON.stringify(mainConfig, null, 2)
    );

    // Save login config
    if (loginConfig) {
      await fs.writeFile(
        path.join(accountPath, "facebook_login.json"),
        JSON.stringify(loginConfig, null, 2)
      );
    }

    // Create separate bot configs (NO PERSONA-AWARE PROMPTS)
    await this.createSeparateBotConfigs(accountPath);

    // Create cookiegenerator config
    await this.createCookieGeneratorConfig();

    // Create data files
    await this.createEnhancedDataFiles(accountPath);
    await this.createCookiesTemplate(accountPath, !!loginConfig);
    await this.createScheduleTemplate(accountPath, accountId);

    // Setup Telegram
    console.log("\n╔═══════════════════════════════════════════════════════════╗");
    console.log("║  TELEGRAM CONFIGURATION                                    ║");
    console.log("╚═══════════════════════════════════════════════════════════╝");

    // Check if config/telegram.json exists
    const telegramConfigPath = path.join(__dirname, "../config/telegram.json");
    let telegramConfigured = false;

    if (fsSync.existsSync(telegramConfigPath)) {
      try {
        const configData = fsSync.readFileSync(telegramConfigPath, 'utf8');
        const config = JSON.parse(configData);
        if (config.botToken && config.chatId) {
          telegramConfigured = true;
          console.log("✅ Telegram is already configured in config/telegram.json");
        }
      } catch (e) {
        console.log("⚠️  Invalid telegram config file.");
      }
    } else if (fsSync.existsSync(path.join(__dirname, "../telegram.json"))) {
      // Check legacy path
      telegramConfigured = true;
      console.log("✅ Telegram is configured in (legacy) telegram.json");
    }

    if (!telegramConfigured) {
      console.log("💡 Configure Telegram for notifications:");
      const setupTelegram = await this.question("📱 Configure Telegram now? (Y/n): ");
      if (setupTelegram.toLowerCase() !== 'n') {
        const botToken = await this.question("   Bot Token: ");
        const chatId = await this.question("   Chat ID: ");

        if (botToken && chatId) {
          const configDir = path.join(__dirname, "../config");
          if (!fsSync.existsSync(configDir)) {
            fsSync.mkdirSync(configDir, { recursive: true });
          }

          const newConfig = {
            botToken: botToken.trim(),
            chatId: chatId.trim(),
            allowedUserIds: [parseInt(chatId.trim())]
          };

          await fs.writeFile(telegramConfigPath, JSON.stringify(newConfig, null, 2));
          console.log("✅ Telegram configuration saved to config/telegram.json");
          telegramConfigured = true;
        } else {
          console.log("⚠️  Skipping Telegram configuration (missing token/id).");
        }
      }
    }

    if (telegramConfigured) {
      // Test notification
      console.log("\n╔═══════════════════════════════════════════════════════════╗");
      console.log("║  TELEGRAM NOTIFICATION TEST                                ║");
      console.log("╚═══════════════════════════════════════════════════════════╝");

      const testNotif = await this.question("📱 Test Telegram notification? (Y/n): ");
      if (testNotif.toLowerCase() !== 'n') {
        try {
          // Clear module cache to ensure we load fresh config
          delete require.cache[require.resolve('./notify')];
          const notify = require('./notify');
          await notify.success(accountId, 'account-setup', `Account ${accountName} created successfully!`);
          console.log("✅ Telegram notification sent!");
        } catch (error) {
          console.log(`⚠️  Telegram test failed: ${error.message}`);
          console.log("   → Check notify.js configuration");
        }
      }
    }

    // Success summary
    console.log("\n╔═══════════════════════════════════════════════════════════╗");
    console.log("║  ✅ ACCOUNT CREATED SUCCESSFULLY!                         ║");
    console.log("╚═══════════════════════════════════════════════════════════╝");
    console.log(`\n📍 Account ID: ${accountId}`);
    console.log(`📂 Location: ${accountPath}`);
    console.log(`🎥 Videos: ${videosPath}`);
    console.log(`🖼️  Photos: ${photosPath}`);
    console.log(`🤖 Bot Configs: ${path.join(accountPath, "bots")}`);
    console.log(`🎭 Persona: ${persona.type} (handled by CommentGenerator)`);

    console.log("\n╔═══════════════════════════════════════════════════════════╗");
    console.log("║  📋 NEXT STEPS                                             ║");
    console.log("╚═══════════════════════════════════════════════════════════╝\n");

    if (loginConfig) {
      console.log("🔐 AUTO-LOGIN:");
      console.log("   1. Cookies will be auto-generated using login credentials");
      console.log("   2. Test: node bot/executor refresh-cookies " + accountId);
      console.log("   3. Auto-refresh runs every 6 hours via maintenance\n");
    } else {
      console.log("🍪 MANUAL COOKIES:");
      console.log("   1. Export cookies from browser (use EditThisCookie extension)");
      console.log("   2. Replace " + accountPath + "/cookies.json");
      console.log("   3. Format: [{name, value, domain, path, ...}]\n");
    }

    console.log("🤖 API KEYS:");
    console.log("   1. OpenRouter (Priority): https://openrouter.ai/keys");
    console.log("      → Add to: " + accountPath + "/openrouter_keys.txt");
    console.log("   2. Gemini (Fallback): https://makersuite.google.com/app/apikey");
    console.log("      → Add to: " + accountPath + "/gemini_keys.txt");
    console.log("   3. Unsplash (Photos): https://unsplash.com/oauth/applications");
    console.log("      → Add to: " + accountPath + "/unsplash_keys.txt\n");

    console.log("📝 CONTENT:");
    console.log("   1. Add comments to: " + accountPath + "/comments.txt");
    console.log("   2. Add target groups: " + accountPath + "/target_groups.txt");
    console.log("   3. Add videos: " + videosPath);
    console.log("   4. Add photos: " + photosPath + "\n");

    console.log("⚙️  BOT CONFIGURATIONS:");
    console.log("   1. Each bot has its own config file in: " + path.join(accountPath, "bots"));
    console.log("   2. Edit individual bot configs without affecting others");
    console.log("   3. Enable/disable bots in their respective config files");
    console.log("   4. 🎭 Persona is handled automatically by CommentGenerator\n");

    console.log("⏰ SCHEDULER:");
    console.log("   1. Edit schedule: " + accountPath + "/schedule.json");
    console.log("   2. Set enabled: true for each bot run");
    console.log("   3. Configure time, days, priority\n");

    console.log("▶️  MANUAL RUN:");
    console.log("   node bot/executor run uploadreels " + accountId);
    console.log("   node bot/executor run updatestatus " + accountId);
    console.log("   node bot/executor run videocomment " + accountId);
    console.log("   node bot/executor run autolike " + accountId + "\n");

    console.log("📅 SCHEDULED RUN:");
    console.log("   pm2 start bot/ecosystem.config.js");
    console.log("   pm2 logs fb-scheduler");
    console.log("   pm2 monit\n");

    console.log("🔧 MAINTENANCE:");
    console.log("   node bot/maintenance.js check-cookies");
    console.log("   node bot/maintenance.js refresh-cookies");
    console.log("   node bot/maintenance.js auto-maintenance\n");

    console.log("📱 TELEGRAM BOT:");
    console.log("   pm2 start bot/telegram-bot.js");
    console.log("   → Control panel via Telegram\n");

    console.log("╔═══════════════════════════════════════════════════════════╗");
    console.log("║  🎯 FACEBOOKPRO BLASTER KEY FEATURES ENABLED              ║");
    console.log("╚═══════════════════════════════════════════════════════════╝");
    console.log("   ✅ Auto Upload Reels - AI captions + video management");
    console.log("   ✅ Auto Update Status - Memory-based, no repetition");
    console.log("   ✅ Smart Comments - AI context-aware");
    console.log("   ✅ Auto-Login - Cookie auto-refresh");
    console.log("   ✅ Unified Notifications - All in one Telegram bot");
    console.log("   ✅ Smart Scheduler - Time & priority based");
    console.log("   ✅ Maintenance - Auto cookie refresh, cleanup");
    console.log("   ✅ Separate Bot Configs - Individual bot settings");
    console.log("   ✅ 🎭 Persona System - Automatic persona handling");
    console.log("");
  }

  async createSeparateBotConfigs(accountPath) {
    console.log("\n🤖 Creating separate bot configurations...");

    const botsDir = path.join(accountPath, "bots");

    // Define all bot configurations (NO PERSONA-AWARE PROMPTS)
    const botConfigs = {
      viewstory: {
        enabled: true,
        headless: "new",
        targetURL: "https://www.facebook.com/stories",
        storiesToView: 10,
        minIntervalSeconds: 5,
        maxIntervalSeconds: 15,
        autoLike: true,
        watchDuration: 8000
      },
      autolike: {
        enabled: true,
        headless: "new",
        targetURL: "https://www.facebook.com/",
        postsToLike: 5,
        minIntervalSeconds: 35,
        maxIntervalSeconds: 59,
        blockAds: true,
        blockKeywords: [
          "pelajari selengkapnya",
          "learn more",
          "slot",
          "gacor",
          "maxwin",
          "bet",
          "toto",
          "mahjong",
          "sponsored"
        ]
      },
      uploadreels: {
        enabled: true,
        headless: "new",
        maxUploadsPerRun: 3,
        minIntervalSeconds: 300,
        maxIntervalSeconds: 600,
        videoSettings: {
          maxSizeGB: 1,
          allowedFormats: [".mp4", ".mov", ".avi", ".mkv"],
          moveAfterUpload: true,
          uploadedFolder: "../temp"
        },
        ai_caption: {
          enabled: true,
          use_openrouter: true,
          prompt: "Buat caption viral untuk video reels ini. Deskripsi: '{VIDEO_DESCRIPTION}'. Caption harus engaging, pakai emoji, maksimal 2 kalimat, gaya santai anak muda!",
          fallback_caption: "Check this out! 🔥"
        },
        privacy: "public"
      },
      videocomment: {
        enabled: true,
        headless: "new",
        targetURL: "https://www.facebook.com/reel/",
        postsToComment: 5,
        minIntervalSeconds: 60,
        maxIntervalSeconds: 180,
        autoLike: true,
        ai_settings: {
          enabled: true,
          use_openrouter: true,
          typing_delay_after_click: 8000,
          url_shortener_enabled: true,
          gemini_prompt: "buatlah komentar facebook yang relevan dengan '{CAPTION_POSTINGAN}', harus terdengar relatable, friendly dan natural. 1-2 kalimat, 1-2 emoji. jangan tambahkan tanda kutip, jangan tambahkan penjelasan."
        }
      },
      sharereels: {
        enabled: true,
        headless: "new",
        minIntervalSeconds: 60,
        maxIntervalSeconds: 180,
        ai_caption: {
          enabled: true,
          static_text: "Lihat video ini! 🔥",
          current_style: "viral",
          prompts: {
            default: "Buat caption menarik untuk reels Facebook ini dalam bahasa Indonesia. Gaya santai, mengundang penasaran, 1-2 kalimat maksimal dengan 1 emoji yang relevan. Caption original video: '{VIDEO_CAPTION}'. jangan tambahkan tanda kutip, jangan tambahkan penjelasan.",
            viral: "Buat caption viral dan trending untuk reels ini: '{VIDEO_CAPTION}'. Gunakan bahasa anak muda, relatable, maksimal 2 kalimat + emoji yang hits. jangan tambahkan tanda kutip, jangan tambahkan penjelasan.",
            engaging: "Buat caption yang mengundang interaksi untuk video reels ini: '{VIDEO_CAPTION}'. Tambahkan pertanyaan atau call-to-action. Maksimal 2 kalimat + emoji. jangan tambahkan tanda kutip, jangan tambahkan penjelasan."
          },
          fallback_keywords: [
            "viral",
            "trending",
            "amazing",
            "keren",
            "must watch"
          ],
          max_video_caption_length: 200
        }
      },
      updatestatus: {
        enabled: true,
        headless: "new",
        minIntervalSeconds: 300,
        maxIntervalSeconds: 600,
        gemini_prompt: "Buat status Facebook singkat (1-2 kalimat) yang santai ala anak muda Jakarta (Bahasa Gaul/Jaksel style dikit boleh). Topik: Relevan dengan waktu sekarang (Pagi/Siang/Sore/Malam). Hindari bahasa puitis/baku! Gunakan kata-kata seperti: 'ngopi', 'gabut', 'otw', 'capek', 'semangat', 'bestie'. Contoh: 'Pagi-pagi udah kena macet, butuh asupan kopi nih ☕' atau 'Akhirnya weekend, waktunya hibernasi seharian 😴'. Langsung tulis statusnya saja tanpa pembuka.",
        ai_settings: {
          use_openrouter: true,
          use_gemini: true,
          prefer_provider: "openrouter",
          switch_on_failure: true
        },
        mention_settings: {
          enabled: true,
          mentions: ["pengikut", "sorotan"],
          delay_between_mentions: 1500,
          delay_after_tab: 1000
        },
        hastag_settings: {
          enabled: true,
          hastags: ["fbpro", "fblifestyle"]
        },
        memory_settings: {
          enabled: true,
          max_history: 50,
          min_similarity_threshold: 0.7,
          topics_to_track: true
        },
        photo_settings: {
          enabled: true,
          use_pollinations: true,
          use_local_faceswap: true,
          use_local_photos: true,
          orientation: "portrait",
          per_page: 10,
          content_filter: "high"
        },
        pollinations_settings: {
          model: "flux-pro",
          width: 1024,
          height: 1280,
          nologo: true,
          enhance: true,
          private: false,
          api_key: ""
        }
      },
      reply: {
        enabled: true,
        headless: "new",
        maxReplies: 5,
        ai_replies: {
          enabled: true,
          use_openrouter: true,
          typing_delay_after_click: 5000,
          url_shortener_enabled: false,
          gemini_prompt: "Balas komentar ini dengan friendly: '{COMMENT_TEXT}'"
        },
        static_replies: [
          "Thanks! 😊",
          "Setuju! 👍"
        ],
        skip_keywords: [
          "spam",
          "promo",
          "jual"
        ]
      },
      confirm: {
        enabled: true,
        headless: "new",
        maxConfirms: 5,
        minIntervalSeconds: 10,
        maxIntervalSeconds: 30,
        send_greeting_message: true,
        greeting_message: "Halo, salam kenal kak 😊",
        send_sticker_after_message: true
      },
      groupcomment: {
        enabled: true,
        headless: "new",
        targetURL: "https://www.facebook.com/groups/feed/",
        postsToComment: 5,
        minIntervalSeconds: 60,
        maxIntervalSeconds: 180,
        autoLike: true,
        ai_settings: {
          enabled: true,
          use_openrouter: true,
          typing_delay_after_click: 8000,
          url_shortener_enabled: false,
          gemini_prompt: "Buatlah komentar facebook yang relevan dengan status ini'{CAPTION_POSTINGAN}', harus terdengar relatable, friendly dan natural. 1-2 kalimat, 1-2 emoji, 1 saja, jangan tambahkan tanda kutip, jangan tambahkan penjelasan."
        }
      },
      timelinecomment: {
        enabled: true,
        headless: "new",
        targetURL: "https://www.facebook.com/",
        postsToComment: 5,
        minIntervalSeconds: 60,
        maxIntervalSeconds: 180,
        autoLike: true,
        blockAds: true,
        blockKeywords: [
          "ads",
          "learn more",
          "sponsored",
          "bersponsor",
          "pelajari selengkapnya",
          "shop now",
          "beli sekarang",
          "slot",
          "gacor",
          "maxwin",
          "bet",
          "toto",
          "mahjong"
        ],
        ai_settings: {
          enabled: true,
          use_openrouter: true,
          typing_delay_after_click: 8000,
          url_shortener_enabled: false,
          gemini_prompt: "Buatlah komentar facebook yang relevan dengan status ini'{CAPTION_POSTINGAN}', harus terdengar relatable, friendly dan natural. 1-2 kalimat, 1-2 emoji, jangan tambahkan tanda kutip, jangan tambahkan penjelasan."
        }
      },
      scrape: {
        enabled: true,
        headless: "new",
        targetURL: "https://www.facebook.com/profile.php?id=61555657594773&sk=reels_tab",
        maxScrolls: 10,
        retentionDays: 7,
        deduplication: {
          enabled: true,
          checkDuplicates: true,
          autoCleanup: true
        },
        navigation: {
          timeout: 90000,
          maxRetries: 3,
          waitBetweenRetries: 5000
        }
      }
    };

    // Save each bot configuration to separate file
    for (const [botName, config] of Object.entries(botConfigs)) {
      const botConfigPath = path.join(botsDir, `${botName}.json`);
      await fs.writeFile(botConfigPath, JSON.stringify(config, null, 2));
      console.log(`   ✅ Created ${botName}.json`);
    }
  }

  async setupAIConfiguration() {
    const enableAI = await this.question("🤖 Enable OpenRouter AI features? (Y/n): ");
    if (enableAI.toLowerCase() === 'n') {
      return { enabled: false };
    }

    const enableMemory = await this.question("💾 Enable Memory System (Anti-Monotony)? (Y/n): ");

    return {
      enabled: true,
      openrouter_integration: {
        enabled: true,
        primary_model: "google/gemini-2.0-flash-exp:free",
        secondary_model: "meta-llama/llama-3.1-70b-instruct:free",
        tertiary_model: "qwen/qwen-2.5-72b-instruct:free",
        fallback_model: "google/gemini-flash-1.5",
        max_retry_attempts: 3,
        timeout: 30000
      },
      memory_system: {
        enabled: enableMemory.toLowerCase() !== 'n',
        max_history: 50,
        diversity_check: true,
        anti_monotony: true,
        similarity_threshold: 0.7
      }
    };
  }

  async createEnhancedDataFiles(accountPath) {
    console.log("\n📁 Creating data files...");

    const files = {
      "comments.txt": [
        "Keren banget nih! 🔥",
        "---",
        "Mantap! Thanks for sharing 👍",
        "---",
        "Seru banget kontennya! 😄"
      ].join("\n"),

      "share_captions.txt": [
        "Wah seru banget nih! 🔥 Must watch!",
        "---",
        "Konten yang bagus! 💯 Kalian gimana?"
      ].join("\n"),

      "cta_link.txt": "",
      "target_groups.txt": "# Format: GROUP_URL|GROUP_NAME\n",
      "reels_urls.txt": "",
      "gemini_keys.txt": "# Get from: https://makersuite.google.com/app/apikey\n# AIzaSy...",
      "openrouter_keys.txt": "# Get from: https://openrouter.ai/keys\n# sk-or-v1-...",
      "pexels_keys.txt": "# Get from: https://www.pexels.com/api/\n",
      "pixabay_keys.txt": "# Get from: https://pixabay.com/api/docs/\n",
      "unsplash_keys.txt": "# Get from: https://unsplash.com/oauth/applications\n",
      "auto_reply_log.txt": "",
      "log_status.txt": "",
      "upload_log.txt": "",
      "replied_comments.json": JSON.stringify({}, null, 2),
      "memory.json": JSON.stringify({
        history: [],
        topics: {},
        lastUpdate: new Date().toISOString()
      }, null, 2)
    };

    for (const [filename, content] of Object.entries(files)) {
      await fs.writeFile(path.join(accountPath, filename), content);
      console.log(`   ✅ ${filename}`);
    }

    const subdirs = ["temp", "artifacts"];
    for (const subdir of subdirs) {
      await fs.mkdir(path.join(accountPath, subdir), { recursive: true });
      console.log(`   ✅ ${subdir}/`);
    }
  }

  async setupLoginConfiguration() {
    const email = await this.question("📧 Facebook email: ");
    if (!email || !email.includes('@')) {
      console.log("❌ Invalid email");
      return null;
    }

    const password = await this.question("🔑 Facebook password: ");
    if (!password) {
      console.log("❌ Password cannot be empty");
      return null;
    }

    const has2FA = await this.question("🔐 Enable 2FA (Google Authenticator)? (y/N): ");
    let twoFASecret = "";

    if (has2FA.toLowerCase() === 'y') {
      twoFASecret = await this.question("🔢 2FA Secret Key: ");
    }

    return {
      email: email,
      password: password,
      twoFA: {
        enabled: has2FA.toLowerCase() === 'y',
        secret: twoFASecret,
        method: "authenticator"
      },
      antiDetection: {
        enabled: true,
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
      },
      cookieValidityHours: 168,
      autoRefresh: true
    };
  }

  async createCookiesTemplate(accountPath, hasLoginConfig) {
    if (hasLoginConfig) {
      await fs.writeFile(
        path.join(accountPath, "cookies.json"),
        JSON.stringify([], null, 2)
      );
    } else {
      const exampleCookies = [
        {
          "domain": ".facebook.com",
          "name": "c_user",
          "value": "YOUR_USER_ID_HERE",
          "path": "/",
          "secure": true
        }
      ];

      await fs.writeFile(
        path.join(accountPath, "cookies.json"),
        JSON.stringify(exampleCookies, null, 2)
      );
    }
  }

  async createScheduleTemplate(accountPath, accountId) {
    const scheduleTemplate = {
      enabled: false,
      timezone: "Asia/Jakarta",
      runs: [
        {
          bot: "uploadreels",
          enabled: false,
          priority: "normal",
          time: "20:00",
          days: ["monday", "wednesday", "friday"],
          randomizeMinutes: 30,
          note: "Upload reels 3x per week"
        },
        {
          bot: "updatestatus",
          enabled: false,
          priority: "high",
          time: "17:30",
          days: ["daily"],
          randomizeMinutes: 15
        },
        {
          bot: "videocomment",
          enabled: false,
          priority: "normal",
          cron: "0 */4 * * *",
          randomizeMinutes: 5
        },
        {
          bot: "groupcomment",
          enabled: false,
          priority: "normal",
          cron: "0 19,20,21 * * *",
          randomizeMinutes: 30
        },
        {
          bot: "timelinecomment",
          enabled: false,
          priority: "normal",
          cron: "0 18,20 * * *",
          randomizeMinutes: 30
        },
        {
          bot: "scrape",
          enabled: false,
          priority: "low",
          cron: "30 23 * * *",
          randomizeMinutes: 5
        },
        {
          bot: "sharereels",
          enabled: false,
          priority: "normal",
          cron: "30 18 * * *",
          randomizeMinutes: 45
        },
        {
          bot: "reply",
          enabled: false,
          priority: "normal",
          cron: "0 */3 * * *",
          randomizeMinutes: 10
        },
        {
          bot: "confirm",
          enabled: false,
          priority: "low",
          time: "22:00",
          days: ["daily"],
          randomizeMinutes: 60
        }
      ]
    };

    await fs.writeFile(
      path.join(accountPath, "schedule.json"),
      JSON.stringify(scheduleTemplate, null, 2)
    );
    console.log(`   ✅ schedule.json`);
  }

  async createCookieGeneratorConfig() {
    const configDir = path.join(__dirname, "../config");
    const configPath = path.join(configDir, "cookiegenerator.json");

    // Only create if doesn't exist
    if (fsSync.existsSync(configPath)) {
      console.log(`   ℹ️  cookiegenerator.json already exists`);
      return;
    }

    // Ensure config directory exists
    if (!fsSync.existsSync(configDir)) {
      await fs.mkdir(configDir, { recursive: true });
    }

    const cookieGeneratorConfig = {
      headless: "new",
      timeout: 60000,
      slowMo: 50,
      viewport: {
        width: 1280,
        height: 1024,
        deviceScaleFactor: 1
      },
      navigationTimeout: 30000,
      autodetectVPS: true
    };

    await fs.writeFile(configPath, JSON.stringify(cookieGeneratorConfig, null, 2));
    console.log(`   ✅ config/cookiegenerator.json created`);
  }

  async close() {
    this.rl.close();
  }
}

async function main() {
  const setup = new AccountSetup();

  try {
    await setup.setupNewAccount();
  } catch (error) {
    console.error('\n❌ Error:', error.message);
  } finally {
    await setup.close();
  }
}

if (require.main === module) {
  main();
}

module.exports = { AccountSetup };

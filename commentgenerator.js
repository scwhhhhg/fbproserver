// commentgenerator.js - COMPLETE VERSION with Multiple CTA Links Support
const axios = require("axios");
const fs = require("fs").promises;
const path = require("path");

// ========================================
// PERSONA DEFINITIONS
// ========================================

const PERSONAS = {
  friendly: {
    traits: {
      tone: "ramah, hangat, dan approachable",
      style: "casual tapi sopan",
      emoji_usage: "sering (2-3 per pesan)",
      sentence_length: "pendek-menengah",
      enthusiasm_level: "tinggi"
    },
    personality_traits: [
      "Selalu melihat sisi positif",
      "Suka menggunakan emoji ekspresif",
      "Menggunakan bahasa gaul yang tidak berlebihan",
      "Sering bertanya pertanyaan retoris",
      "Memberikan pujian yang tulus"
    ],
    vocabulary: {
      positive: ["keren", "mantap", "bagus banget", "inspiring", "top"],
      enthusiasm: ["wah", "duh", "asli", "serius", "beneran"],
      agreement: ["setuju banget", "bener juga", "iya sih", "betul"],
      support: ["semangat", "good luck", "you got this", "pasti bisa"]
    },
    avoid_phrases: [
      "sangat menarik",
      "terima kasih atas postingannya",
      "konten yang bagus",
      "keep up the good work"
    ]
  },

  professional: {
    traits: {
      tone: "profesional tapi tidak kaku",
      style: "formal namun approachable",
      emoji_usage: "minimal (0-1 per pesan)",
      sentence_length: "menengah-panjang",
      enthusiasm_level: "sedang"
    },
    personality_traits: [
      "Memberikan perspektif mendalam",
      "Menggunakan bahasa yang terstruktur",
      "Fokus pada value dan insight",
      "Menghindari bahasa yang terlalu casual",
      "Memberikan komentar yang substansial"
    ],
    vocabulary: {
      positive: ["menarik", "insightful", "valuable", "relevan", "berkualitas"],
      enthusiasm: ["memang", "tentu", "pastinya", "jelas"],
      agreement: ["sependapat", "sejalan", "sesuai", "tepat"],
      support: ["sukses", "berhasil", "mencapai", "progress"]
    },
    avoid_phrases: [
      "mantap jiwa",
      "kece badai",
      "top banget",
      "gokil"
    ]
  },

  humorous: {
    traits: {
      tone: "playful dan menghibur",
      style: "santai dengan sentuhan humor",
      emoji_usage: "banyak (3-5 per pesan)",
      sentence_length: "pendek-menengah",
      enthusiasm_level: "sangat tinggi"
    },
    personality_traits: [
      "Suka menggunakan wordplay",
      "Menambahkan twist humor di akhir kalimat",
      "Menggunakan reference pop culture",
      "Ekspresif dengan emoji",
      "Tidak takut menggunakan bahasa gaul"
    ],
    vocabulary: {
      positive: ["gokil", "epic", "legendary", "masterpiece", "fire"],
      enthusiasm: ["anjir", "astaga", "ampun deh", "parah sih", "aduh"],
      agreement: ["sih iya juga", "no debat", "fix", "facts"],
      support: ["gas terus", "no kendor", "full power", "all out"]
    },
    avoid_phrases: [
      "dengan hormat",
      "sangat profesional",
      "terstruktur dengan baik",
      "insight yang mendalam"
    ]
  },

  motivational: {
    traits: {
      tone: "inspiratif dan memberdayakan",
      style: "encouraging dan uplifting",
      emoji_usage: "sedang (1-3 per pesan)",
      sentence_length: "menengah",
      enthusiasm_level: "tinggi positif"
    },
    personality_traits: [
      "Fokus pada growth dan development",
      "Memberikan encouragement yang genuine",
      "Menggunakan bahasa yang empowering",
      "Menghubungkan dengan tujuan besar",
      "Menekankan potensi dan kemampuan"
    ],
    vocabulary: {
      positive: ["luar biasa", "powerful", "inspiring", "amazing", "incredible"],
      enthusiasm: ["wow", "subhanallah", "masya Allah", "incredible"],
      agreement: ["absolutely", "exactly", "precisely", "totally"],
      support: ["you can do it", "terus berjuang", "jangan menyerah", "percaya diri"]
    },
    avoid_phrases: [
      "gokil abis",
      "parah sih",
      "ribet banget",
      "males deh"
    ]
  },

  curious: {
    traits: {
      tone: "ingin tahu dan exploratif",
      style: "bertanya dan diskusi",
      emoji_usage: "sedang (1-2 per pesan)",
      sentence_length: "menengah dengan pertanyaan",
      enthusiasm_level: "sedang-tinggi"
    },
    personality_traits: [
      "Sering mengajukan pertanyaan terbuka",
      "Menunjukkan genuine interest",
      "Menggali lebih dalam topik",
      "Membuat orang berpikir",
      "Mendorong diskusi"
    ],
    vocabulary: {
      positive: ["interesting", "intriguing", "menarik", "unik", "berbeda"],
      enthusiasm: ["wah menarik", "oh gitu", "kok bisa", "gimana caranya"],
      agreement: ["makes sense", "iya juga ya", "bener juga", "benar"],
      support: ["terus eksplorasi", "keep learning", "jangan berhenti", "terus coba"]
    },
    avoid_phrases: [
      "sudah pasti",
      "tidak perlu dipertanyakan",
      "jelas sekali",
      "obvious"
    ]
  }
};

// ========================================
// CTA LINK MANAGER
// ========================================

class CTALinkManager {
  constructor(accountId) {
    this.accountId = accountId;
    this.ctaLinks = [];
    this.usedLinks = new Set();
    this.lastResetTime = Date.now();
    this.resetInterval = 60 * 60 * 1000; // Reset every hour
  }

  async loadCTALinks(ctaLinkPath) {
    try {
      const data = await fs.readFile(ctaLinkPath, "utf8");
      const lines = data.split("\n")
        .map(line => line.trim())
        .filter(line => line && 
                line.startsWith("http") && 
                !line.startsWith("#") && 
                !line.includes("example.com"));
      
      this.ctaLinks = lines;
      console.log(`[${this.accountId}] [CTA Manager] Loaded ${this.ctaLinks.length} CTA links`);
      
      // Reset used links if it's been more than reset interval
      if (Date.now() - this.lastResetTime > this.resetInterval) {
        this.usedLinks.clear();
        this.lastResetTime = Date.now();
        console.log(`[${this.accountId}] [CTA Manager] Reset used links tracking`);
      }
      
      return this.ctaLinks;
    } catch (error) {
      if (error.code === "ENOENT") {
        console.log(`[${this.accountId}] [CTA Manager] CTA link file not found`);
        return [];
      }
      console.log(`[${this.accountId}] [CTA Manager] Error loading CTA links: ${error.message}`);
      return [];
    }
  }

  getRandomCTALink() {
    if (this.ctaLinks.length === 0) {
      return "";
    }

    // Filter out recently used links
    const availableLinks = this.ctaLinks.filter(link => !this.usedLinks.has(link));
    
    // If all links have been used recently, reset and use all
    const linksToUse = availableLinks.length > 0 ? availableLinks : this.ctaLinks;
    
    // Select random link
    const randomIndex = Math.floor(Math.random() * linksToUse.length);
    const selectedLink = linksToUse[randomIndex];
    
    // Add to used links
    this.usedLinks.add(selectedLink);
    
    // If we've used more than 70% of links, consider resetting soon
    if (this.usedLinks.size > this.ctaLinks.length * 0.7) {
      console.log(`[${this.accountId}] [CTA Manager] Used ${this.usedLinks.size}/${this.ctaLinks.length} links, consider reset soon`);
    }
    
    console.log(`[${this.accountId}] [CTA Manager] Selected CTA link: ${selectedLink.substring(0, 50)}...`);
    return selectedLink;
  }

  getLinkStats() {
    return {
      total: this.ctaLinks.length,
      used: this.usedLinks.size,
      available: this.ctaLinks.length - this.usedLinks.size,
      lastReset: new Date(this.lastResetTime).toISOString()
    };
  }
}

// ========================================
// CONTEXT MANAGER (for persona learning)
// ========================================

class PersonaContextManager {
  constructor(personaType, tempDir) {
    this.personaType = personaType;
    this.tempDir = tempDir;
    this.contextPath = path.join(tempDir, `persona_context_${personaType}.json`);
    this.context = {
      lastTopics: [],
      emotionalState: 'neutral',
      interactionCount: 0,
      lastInteractionTime: null,
      learnings: []
    };
    this.maxHistorySize = 50;
  }

  async initialize() {
    try {
      const data = await fs.readFile(this.contextPath, 'utf8');
      this.context = JSON.parse(data);
    } catch (error) {
      await this.saveContext();
    }
  }

  async saveContext() {
    try {
      await fs.writeFile(this.contextPath, JSON.stringify(this.context, null, 2));
    } catch (error) {
      // Silent fail
    }
  }

  addTopic(topic) {
    this.context.lastTopics.push({
      topic: topic.substring(0, 100),
      timestamp: new Date().toISOString()
    });
    
    if (this.context.lastTopics.length > this.maxHistorySize) {
      this.context.lastTopics.shift();
    }
  }

  updateEmotionalState(state) {
    const validStates = ['positive', 'neutral', 'excited', 'thoughtful', 'playful'];
    if (validStates.includes(state)) {
      this.context.emotionalState = state;
    }
  }

  incrementInteraction() {
    this.context.interactionCount++;
    this.context.lastInteractionTime = new Date().toISOString();
  }

  getRelevantContext() {
    return {
      recentTopics: this.context.lastTopics.slice(-5),
      currentMood: this.context.emotionalState,
      interactionLevel: this.context.interactionCount
    };
  }
}

// ========================================
// PERSONA MANAGER (Global instances)
// ========================================

const personaInstances = new Map();

async function getOrCreatePersona(accountId, personaType, tempDir) {
  const key = `${accountId}_${personaType}`;
  
  if (!personaInstances.has(key)) {
    const contextManager = new PersonaContextManager(personaType, tempDir);
    await contextManager.initialize();
    personaInstances.set(key, { contextManager, persona: PERSONAS[personaType] });
  }
  
  return personaInstances.get(key);
}

// ========================================
// URL SHORTENER
// ========================================

async function shortenUrl(longUrl) {
  if (!longUrl || longUrl.trim() === "" || longUrl === "https://example.com") {
    return longUrl;
  }
  
  console.log(`[URL Shortener] Shortening: ${longUrl}`);
  
  const services = [
    async () => {
      const response = await axios.get('https://is.gd/create.php', {
        params: { format: 'simple', url: longUrl },
        timeout: 10000
      });
      return response.data.trim();
    },
    async () => {
      const response = await axios.get('https://v.gd/create.php', {
        params: { format: 'simple', url: longUrl },
        timeout: 10000
      });
      return response.data.trim();
    },
    async () => {
      const response = await axios.get('https://tinyurl.com/api-create.php', {
        params: { url: longUrl },
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      return response.data.trim();
    }
  ];
  
  for (let i = 0; i < services.length; i++) {
    try {
      const shortUrl = await services[i]();
      
      if (shortUrl && shortUrl.startsWith('http') && shortUrl.length < longUrl.length) {
        console.log(`[URL Shortener] Success (service ${i + 1}): ${shortUrl}`);
        return shortUrl;
      }
    } catch (error) {
      console.log(`[URL Shortener] Service ${i + 1} failed: ${error.message}`);
      continue;
    }
  }
  
  console.log(`[URL Shortener] All services failed, using original URL`);
  return longUrl;
}

// ========================================
// API KEY LOADERS
// ========================================

async function loadOpenRouterKeys(filePath) {
  try {
    const data = await fs.readFile(filePath, "utf8");
    const keys = data.split("\n")
      .map(line => line.trim())
      .filter(line => line && !line.startsWith("#") && line.startsWith("sk-or-"));
    
    return keys;
  } catch (error) {
    if (error.code === "ENOENT") {
      console.log(`[OpenRouter] File not found: ${filePath}`);
      return [];
    }
    console.log(`[OpenRouter] Error loading keys: ${error.message}`);
    return [];
  }
}

async function loadGeminiKeys(filePath) {
  try {
    const data = await fs.readFile(filePath, "utf8");
    const keys = data.split("\n")
      .map(line => line.trim())
      .filter(line => line && !line.startsWith("#") && line.startsWith("AIza"));
    
    return keys;
  } catch (error) {
    if (error.code === "ENOENT") {
      console.log(`[Gemini] File not found: ${filePath}`);
      return [];
    }
    console.log(`[Gemini] Error loading keys: ${error.message}`);
    return [];
  }
}

// ========================================
// PROMPT GENERATOR (with persona)
// ========================================

function buildSystemPrompt(persona, actionType, context) {
  const basePersonality = actionType === 'caption' ? 'sebagai content creator yang engaging' :
                         actionType === 'reply' ? 'sebagai teman yang pengertian dan helpful' :
                         actionType === 'comment' ? persona.personality_traits[0] : 
                         'sebagai orang yang natural dalam berinteraksi';
  
  return `Kamu adalah seorang pengguna media sosial ${basePersonality}.

KARAKTERISTIK KEPRIBADIAN:
 ${persona.personality_traits.map(trait => `- ${trait}`).join('\n')}

GAYA BERKOMUNIKASI:
- Tone: ${persona.traits.tone}
- Style: ${persona.traits.style}
- Penggunaan emoji: ${persona.traits.emoji_usage}
- Panjang kalimat: ${persona.traits.sentence_length}
- Level antusiasme: ${persona.traits.enthusiasm_level}

VOCABULARY YANG SERING DIGUNAKAN:
- Kata positif: ${persona.vocabulary.positive.join(', ')}
- Kata antusiasme: ${persona.vocabulary.enthusiasm.join(', ')}
- Kata persetujuan: ${persona.vocabulary.agreement.join(', ')}
- Kata dukungan: ${persona.vocabulary.support.join(', ')}

HINDARI FRASA INI:
 ${persona.avoid_phrases.map(phrase => `- "${phrase}"`).join('\n')}

EMOTIONAL STATE SAAT INI: ${context.currentMood}
TOPIK TERAKHIR: ${context.recentTopics.length > 0 ? context.recentTopics.map(t => t.topic).slice(0, 2).join(', ') : 'belum ada'}

ATURAN PENTING:
1. Buat respons yang SANGAT natural dan BERVARIASI
2. JANGAN gunakan template atau pattern yang sama
3. Sesuaikan dengan konteks dan mood saat ini
4. Buat seolah-olah kamu benar-benar manusia dengan kepribadian unik
5. HINDARI repetisi dan frasa generik
6. Respons harus pendek (1-2 kalimat maksimal) kecuali untuk caption
7. Gunakan variasi kata dan struktur kalimat
8. Buat setiap respons terasa fresh dan authentic

Ingat: Kamu bukan AI yang membuat komentar, tapi manusia yang genuine dalam berinteraksi!`;
}

function buildUserPrompt(content, options = {}) {
  const {
    captionPostingan = '',
    linkCta = '',
    specificInstruction = '',
    previousComments = [],
    postType = 'unknown'
  } = options;

  let prompt = '';

  if (specificInstruction) {
    prompt += `${specificInstruction}\n\n`;
  }

  if (captionPostingan) {
    prompt += `KONTEN POSTINGAN:\n"${captionPostingan}"\n\n`;
  }

  if (linkCta && linkCta !== 'https://example.com') {
    prompt += `LINK CTA: ${linkCta}\n\n`;
  }

  if (previousComments.length > 0) {
    prompt += `KOMENTAR SEBELUMNYA YANG HARUS DIHINDARI:\n`;
    previousComments.forEach((comment, idx) => {
      prompt += `${idx + 1}. "${comment}"\n`;
    });
    prompt += `\nBuat komentar yang BERBEDA dari semua komentar di atas!\n\n`;
  }

  if (postType !== 'unknown') {
    prompt += `JENIS POSTINGAN: ${postType}\n\n`;
  }

  prompt += `Buat respons yang sesuai dengan kepribadian dan TIDAK TERLIHAT SEPERTI BOT!`;

  return prompt;
}

// ========================================
// AI GENERATION
// ========================================

async function generateFromOpenRouter(systemPrompt, userPrompt, apiKeys, accountId) {
  const freeModels = [
    "qwen/qwen-2.5-72b-instruct",
    "meta-llama/llama-3.2-3b-instruct:free",
    "x-ai/grok-2-vision-1212:free",
    "google/gemma-2-9b-it:free",
    "mistralai/mistral-7b-instruct:free",
    "nousresearch/hermes-3-llama-3.1-405b:free"
  ];

  for (const [keyIndex, apiKey] of apiKeys.entries()) {
    for (const [modelIndex, model] of freeModels.entries()) {
      try {
        console.log(`[${accountId}] [OpenRouter] Key #${keyIndex + 1}, Model: ${model}`);

        const response = await axios.post(
          "https://openrouter.ai/api/v1/chat/completions",
          {
            model: model,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt }
            ],
            max_tokens: 200,
            temperature: 0.95,
            top_p: 0.95,
            frequency_penalty: 0.8,
            presence_penalty: 0.6
          },
          {
            headers: {
              "Authorization": `Bearer ${apiKey}`,
              "Content-Type": "application/json",
              "HTTP-Referer": "https://github.com/facebook-automation",
              "X-Title": "Facebook Persona Bot"
            },
            timeout: 30000
          }
        );

        if (response.data?.choices?.[0]?.message?.content) {
          const rawResponse = response.data.choices[0].message.content.trim();
          const cleanResponse = cleanAIResponse(rawResponse);

          console.log(`[${accountId}] [OpenRouter] ✓ Success with ${model}`);
          console.log(`[${accountId}] [OpenRouter] "${cleanResponse.substring(0, 100)}..."`);

          return {
            response: cleanResponse,
            success: true,
            provider: 'openrouter',
            model: model
          };
        }

      } catch (error) {
        const errorMsg = error.response?.data?.error?.message || error.message;
        console.log(`[${accountId}] [OpenRouter] Failed - Key #${keyIndex + 1}, Model ${modelIndex + 1}: ${errorMsg}`);
        
        if (error.response?.status === 429 || errorMsg.includes('quota') || errorMsg.includes('rate limit')) {
          continue;
        }
        
        if (error.response?.status === 401) {
          break;
        }
      }
    }
  }

  return { success: false };
}

async function generateFromGemini(systemPrompt, userPrompt, apiKeys, accountId, startIndex = 0) {
  const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;

  for (let i = startIndex; i < apiKeys.length; i++) {
    try {
      console.log(`[${accountId}] [Gemini] Trying API Key #${i + 1}...`);

      const response = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKeys[i]}`,
        {
          contents: [{
            parts: [{ text: fullPrompt }]
          }],
          generationConfig: {
            temperature: 0.95,
            maxOutputTokens: 200,
            topP: 0.95
          }
        },
        {
          headers: { "Content-Type": "application/json" },
          timeout: 20000
        }
      );

      if (response.data?.candidates?.[0]?.content?.parts?.[0]?.text) {
        const rawResponse = response.data.candidates[0].content.parts[0].text.trim();
        const cleanResponse = cleanAIResponse(rawResponse);

        console.log(`[${accountId}] [Gemini] ✓ Success with API Key #${i + 1}`);
        console.log(`[${accountId}] [Gemini] "${cleanResponse.substring(0, 100)}..."`);

        return {
          response: cleanResponse,
          success: true,
          provider: 'gemini',
          workingIndex: i
        };
      }

    } catch (error) {
      console.log(`[${accountId}] [Gemini] Failed - API Key #${i + 1}: ${error.message}`);
      continue;
    }
  }

  return { success: false, workingIndex: apiKeys.length - 1 };
}

function cleanAIResponse(text) {
  return text
    .replace(/\*\*/g, '')
    .replace(/\*/g, '')
    .replace(/#{1,6}\s/g, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/^["']|["']$/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ========================================
// MAIN AI COMMENT GENERATOR (with persona)
// ========================================

async function generateAiComment(options) {
  const {
    caption = "",
    ctaLink = "", // This will be ignored, we'll load from file
    prompt = "",
    personaConfig = null,
    actionType = 'comment',
    postType = 'unknown',
    specificInstruction = '',
    openRouterKeys = [],
    geminiKeys = [],
    staticComments = [],
    geminiWorkingIndex = 0,
    accountId = "default",
    urlShortenerEnabled = false,
    tempDir = null
  } = options;

  console.log(`[${accountId}] [AI Comment Generator] Starting...`);

  // ========================================
  // CTA LINK MANAGEMENT
  // ========================================
  
  let ctaLinkPath;
  if (options.paths && options.paths.cta_link) {
    // New method: path from config
    ctaLinkPath = options.paths.cta_link;
  } else {
    // Fallback method: construct path
    ctaLinkPath = path.join(__dirname, `../accounts/${accountId}/cta_link.txt`);
  }
  
  // Initialize CTA Link Manager
  const ctaManager = new CTALinkManager(accountId);
  await ctaManager.loadCTALinks(ctaLinkPath);
  
  // Get random CTA link
  const selectedCTALink = ctaManager.getRandomCTALink();
  
  // Process caption
  let processedCaption = caption.trim();
  if (processedCaption.length > 500) {
    processedCaption = processedCaption.substring(0, 500) + "...";
  }
  if (!processedCaption) {
    processedCaption = "Postingan menarik ini";
  }

  // Shorten URL if enabled and we have a CTA link
  let shortLink = selectedCTALink;
  if (urlShortenerEnabled && selectedCTALink && selectedCTALink !== "https://example.com") {
    console.log(`[${accountId}] URL Shortener: Enabled for CTA link`);
    shortLink = await shortenUrl(selectedCTALink);
  } else if (selectedCTALink && selectedCTALink !== "https://example.com") {
    console.log(`[${accountId}] URL Shortener: Disabled, using original CTA link`);
  }

  // ========================================
  // PERSONA INTEGRATION
  // ========================================
  
  let finalPrompt = prompt;
  let systemPrompt = null;
  
  // Check if persona is enabled in config
  if (personaConfig && personaConfig.enabled) {
    const personaType = personaConfig.type || 'friendly';
    const tempDirectory = tempDir || path.join(__dirname, `../temp/${accountId}`);
    
    console.log(`[${accountId}] [Persona] Using persona: ${personaType}`);
    
    try {
      // Get or create persona instance
      const { contextManager, persona } = await getOrCreatePersona(accountId, personaType, tempDirectory);
      
      // Get context
      const context = contextManager.getRelevantContext();
      
      // Build prompts with persona
      systemPrompt = buildSystemPrompt(persona, actionType, context);
      finalPrompt = buildUserPrompt(processedCaption, {
        captionPostingan: processedCaption,
        linkCta: shortLink,
        specificInstruction: specificInstruction,
        previousComments: [],
        postType: postType
      });
      
      // Update context
      contextManager.addTopic(processedCaption);
      contextManager.incrementInteraction();
      await contextManager.saveContext();
      
    } catch (error) {
      console.log(`[${accountId}] [Persona] Error: ${error.message}, falling back to default`);
      // Fall back to default prompt if persona fails
      finalPrompt = prompt
        .replace("{CAPTION_POSTINGAN}", processedCaption)
        .replace("{LINK_CTA}", shortLink);
    }
  } else {
    // No persona, use traditional prompt
    finalPrompt = prompt
      .replace("{CAPTION_POSTINGAN}", processedCaption)
      .replace("{LINK_CTA}", shortLink);
      
    console.log(`[${accountId}] [Standard] Using default prompt (no persona)`);
  }

  console.log(`[${accountId}] Caption: "${processedCaption.substring(0, 50)}..."`);
  console.log(`[${accountId}] CTA Link: ${shortLink || 'No CTA link'}`);
  
  // Log CTA stats
  const ctaStats = ctaManager.getLinkStats();
  console.log(`[${accountId}] [CTA Stats] Total: ${ctaStats.total}, Used: ${ctaStats.used}, Available: ${ctaStats.available}`);

  // ========================================
  // AI GENERATION
  // ========================================

  // Try OpenRouter first
  if (openRouterKeys.length > 0) {
    const openRouterResult = systemPrompt 
      ? await generateFromOpenRouter(systemPrompt, finalPrompt, openRouterKeys, accountId)
      : await generateFromOpenRouterLegacy(finalPrompt, openRouterKeys, accountId);
      
    if (openRouterResult.success) {
      console.log(`[${accountId}] ✓ Using OpenRouter comment`);
      return {
        comment: openRouterResult.response,
        provider: 'openrouter',
        model: openRouterResult.model,
        workingIndex: geminiWorkingIndex,
        ctaLink: selectedCTALink,
        ctaStats: ctaStats
      };
    }
  }

  // Try Gemini as fallback
  if (geminiKeys.length > 0) {
    const geminiResult = systemPrompt
      ? await generateFromGemini(systemPrompt, finalPrompt, geminiKeys, accountId, geminiWorkingIndex)
      : await generateFromGeminiLegacy(finalPrompt, geminiKeys, accountId, geminiWorkingIndex);
      
    if (geminiResult.success) {
      console.log(`[${accountId}] ✓ Using Gemini comment (fallback)`);
      return {
        comment: geminiResult.response,
        provider: 'gemini',
        workingIndex: geminiResult.workingIndex,
        ctaLink: selectedCTALink,
        ctaStats: ctaStats
      };
    }
  }

  // Static fallback
  if (staticComments.length > 0) {
    const staticComment = staticComments[Math.floor(Math.random() * staticComments.length)];
    console.log(`[${accountId}] ✓ Using static comment (final fallback)`);
    return {
      comment: staticComment,
      provider: 'static',
      workingIndex: geminiWorkingIndex,
      ctaLink: selectedCTALink,
      ctaStats: ctaStats
    };
  }

  console.log(`[${accountId}] ✗ No comments available from any source`);
  return {
    comment: null,
    provider: 'none',
    workingIndex: geminiWorkingIndex,
    ctaLink: selectedCTALink,
    ctaStats: ctaStats
  };
}

// Legacy support (without system prompt)
async function generateFromOpenRouterLegacy(prompt, apiKeys, accountId) {
  const freeModels = [
    "qwen/qwen-2.5-72b-instruct",
    "meta-llama/llama-3.2-3b-instruct:free",
    "x-ai/grok-2-vision-1212:free",
    "google/gemma-2-9b-it:free",
    "mistralai/mistral-7b-instruct:free"
  ];

  for (const [keyIndex, apiKey] of apiKeys.entries()) {
    for (const [modelIndex, model] of freeModels.entries()) {
      try {
        const response = await axios.post(
          "https://openrouter.ai/api/v1/chat/completions",
          {
            model: model,
            messages: [
              {
                role: "system",
                content: "You are a friendly Indonesian social media user. Create natural, casual comments in Indonesian that sound authentic and human-like. Keep responses short (1-2 sentences) and conversational. Avoid repetitive phrases. Be creative and varied."
              },
              {
                role: "user",
                content: prompt
              }
            ],
            max_tokens: 150,
            temperature: 0.9,
            top_p: 0.95,
            frequency_penalty: 0.3,
            presence_penalty: 0.3
          },
          {
            headers: {
              "Authorization": `Bearer ${apiKey}`,
              "Content-Type": "application/json",
              "HTTP-Referer": "https://github.com/facebook-automation",
              "X-Title": "FacebookPro Blaster Comment Bot"
            },
            timeout: 30000
          }
        );

        if (response.data?.choices?.[0]?.message?.content) {
          const cleanResponse = cleanAIResponse(response.data.choices[0].message.content.trim());
          return {
            response: cleanResponse,
            success: true,
            provider: 'openrouter',
            model: model
          };
        }

      } catch (error) {
        continue;
      }
    }
  }

  return { success: false };
}

async function generateFromGeminiLegacy(prompt, apiKeys, accountId, startIndex = 0) {
  for (let i = startIndex; i < apiKeys.length; i++) {
    try {
      const response = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKeys[i]}`,
        {
          contents: [{
            parts: [{ text: prompt }]
          }],
          generationConfig: {
            temperature: 0.9,
            maxOutputTokens: 150,
            topP: 0.95
          }
        },
        {
          headers: { "Content-Type": "application/json" },
          timeout: 20000
        }
      );

      if (response.data?.candidates?.[0]?.content?.parts?.[0]?.text) {
        const cleanResponse = cleanAIResponse(response.data.candidates[0].content.parts[0].text.trim());
        return {
          response: cleanResponse,
          success: true,
          provider: 'gemini',
          workingIndex: i
        };
      }

    } catch (error) {
      continue;
    }
  }

  return { success: false, workingIndex: apiKeys.length - 1 };
}

// ========================================
// TYPE COMMENT SAFELY (with human-like variations)
// ========================================

async function typeCommentSafely(page, text, options = {}) {
  const {
    textAreaSelectors = [
      'div[contenteditable="true"]',
      'textarea',
      '[role="textbox"]',
      'p.xdj266r.x14z9mp.xat24cr.x1lziwak'
    ],
    delayAfterClick = 6000,
    typingDelay = 120,
    accountId = "default",
    maxRetries = 2,
    humanLike = true
  } = options;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      console.log(`[${accountId}] Typing comment (attempt ${attempt + 1}/${maxRetries})...`);
      
      // Find text area
      let textArea = null;
      for (const selector of textAreaSelectors) {
        try {
          const elements = await page.$$(selector);
          for (const element of elements) {
            const boundingBox = await element.boundingBox();
            if (boundingBox && boundingBox.width > 50 && boundingBox.height > 20) {
              textArea = element;
              console.log(`[${accountId}] Text area found`);
              break;
            }
          }
          if (textArea) break;
        } catch (e) {
          continue;
        }
      }
      
      if (!textArea) {
        console.log(`[${accountId}] Text area not found, using direct keyboard`);
        await typeWithVariation(page, text, typingDelay, humanLike);
        return;
      }
      
      await textArea.click();
      console.log(`[${accountId}] Text area clicked`);
      await new Promise(resolve => setTimeout(resolve, delayAfterClick));
      
      // Focus
      for (let i = 0; i < 3; i++) {
        try {
          await textArea.focus();
          await new Promise(resolve => setTimeout(resolve, 800));
          break;
        } catch (e) {
          if (i === 2) console.log(`[${accountId}] Focus warning`);
        }
      }
      
      // Clear
      try {
        await page.keyboard.down('Control');
        await page.keyboard.press('A');
        await page.keyboard.up('Control');
        await page.keyboard.press('Backspace');
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (e) {}
      
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Type with variations
      await typeWithVariation(page, text, typingDelay, humanLike);
      
      await new Promise(resolve => setTimeout(resolve, 3000));
      console.log(`[${accountId}] ✓ Comment typed successfully`);
      
      // Verification
      try {
        const enteredText = await page.evaluate((sel) => {
          const el = document.querySelector(sel);
          return el ? (el.textContent || el.innerText || '').trim() : '';
        }, textAreaSelectors[0]);
        
        const textToCheck = text.substring(0, Math.min(20, text.length));
        
        if (enteredText.includes(textToCheck)) {
          console.log(`[${accountId}] ✓ Text verification: SUCCESS`);
          return;
        } else if (attempt === maxRetries - 1) {
          console.log(`[${accountId}] Accepting result after ${maxRetries} attempts`);
          return;
        } else {
          throw new Error('Text verification failed');
        }
      } catch (e) {
        if (attempt === maxRetries - 1) {
          console.log(`[${accountId}] Max retries reached, proceeding`);
          return;
        }
        throw e;
      }
      
    } catch (error) {
      console.log(`[${accountId}] Typing attempt ${attempt + 1} failed: ${error.message}`);
      
      if (attempt === maxRetries - 1) {
        console.log(`[${accountId}] Using fallback typing`);
        await typeWithVariation(page, text, typingDelay, humanLike);
        return;
      }
      
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
}

async function typeWithVariation(page, text, baseDelay, humanLike) {
  const lines = text.split("\n");
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    for (const char of line) {
      if (humanLike) {
        const variation = Math.random() * 40 - 20;
        const delay = Math.max(50, baseDelay + variation);
        await page.keyboard.type(char, { delay: delay });
        
        if (Math.random() < 0.1) {
          await new Promise(resolve => setTimeout(resolve, 200 + Math.random() * 300));
        }
      } else {
        await page.keyboard.type(char, { delay: baseDelay });
      }
    }
    
    if (i < lines.length - 1) {
      await page.keyboard.down("Shift");
      await page.keyboard.press("Enter");
      await page.keyboard.up("Shift");
      await new Promise(resolve => setTimeout(resolve, 400));
    }
  }
}

// ========================================
// EXPORTS
// ========================================

module.exports = {
  generateAiComment,
  typeCommentSafely,
  shortenUrl,
  loadOpenRouterKeys,
  loadGeminiKeys,
  PERSONAS,
  CTALinkManager
};

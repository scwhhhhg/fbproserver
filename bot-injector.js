const path = require('path');
const Module = require('module');
const fs = require('fs');

// Configuration from remote-config.js
const WORKER_URL = process.env.REMOTE_CONFIG_URL || 'https://fbproblaster.server.workers.dev';
const AUTH_SECRET = process.env.REMOTE_CONFIG_SECRET || '@Vsowjew24';

const https = require('https');
const http = require('http');

async function runRemoteBot(botName) {
    // Keep the process alive while we fetch and compile
    const keepAlive = setInterval(() => { }, 1000);

    try {
        const accountId = process.env.ACCOUNT_ID || process.argv[3] || 'default';
        console.log(`[SECURE-RUN] Init: ${botName} for ${accountId}`);

        let scriptCode = null;

        // LOCAL OVERRIDE CHECK
        const localBotPath = path.join(__dirname, '..', 'bot', `${botName}.js`);
        if (fs.existsSync(localBotPath)) {
            console.log(`[SECURE-RUN] 🛠️  Using local override: ${localBotPath}`);
            try {
                scriptCode = fs.readFileSync(localBotPath, 'utf8');
            } catch (err) {
                console.log(`[SECURE-RUN] ⚠️  Local override failed to read: ${err.message}`);
            }
        }

        if (!scriptCode) {
            console.log(`[SECURE-RUN] 🌐 Fetching remote logic for ${botName}...`);
            const fetchScript = async (secret) => {
                return new Promise((resolve, reject) => {
                    const url = `${WORKER_URL}/script?name=${botName}`;
                    const protocol = url.startsWith('https') ? https : http;
                    const options = {
                        headers: { 'X-FBPro-Auth': secret },
                        timeout: 15000
                    };

                    protocol.get(url, options, (res) => {
                        let data = '';
                        res.on('data', (chunk) => data += chunk);
                        res.on('end', () => {
                            if (res.statusCode === 401) return reject(new Error('401'));
                            if (res.statusCode !== 200) return reject(new Error(`Server Error ${res.statusCode}`));
                            try {
                                const json = JSON.parse(data);
                                if (json.script) resolve(json.script);
                                else reject(new Error('No script content'));
                            } catch (e) { reject(new Error('JSON parse error')); }
                        });
                    }).on('error', (err) => reject(new Error(`Network error: ${err.message}`)));
                });
            };

            try {
                // Priority 1: Primary Secret
                scriptCode = await fetchScript(AUTH_SECRET);
            } catch (e) {
                if (e.message === '401') {
                    // Priority 2: Standard Fallback
                    try {
                        scriptCode = await fetchScript('fb-pro-secret-v2');
                    } catch (e2) {
                        if (e2.message === '401') {
                            // Priority 3: Placeholder Fallback
                            scriptCode = await fetchScript('PLACEHOLDER_SECRET');
                        } else throw e2;
                    }
                } else throw e;
            }
        }

        if (!scriptCode || scriptCode.length === 0) {
            throw new Error('No script content acquired (Local or Remote)');
        }

        console.log(`[SECURE-RUN] Logic acquired (${scriptCode.length} bytes). Executing...`);

        // Robust Module Compilation
        const m = new Module(botName, module.parent || module);
        m.filename = path.join(__dirname, `${botName}.js`);
        m.paths = Module._nodeModulePaths(__dirname);

        // Inject standard globals
        global.BOT_NAME = botName;
        global.ACCOUNT_ID = accountId;

        m._compile(scriptCode, m.filename);

        console.log(`[SECURE-RUN] Bot ${botName} engine started.`);

        // Safety anchor for Puppeteer launch
        setTimeout(() => clearInterval(keepAlive), 45000);

    } catch (error) {
        clearInterval(keepAlive);
        if (error.message === '401') {
            console.error('\n❌ [SECURE-RUN] AUTHENTICATION FAILED');
            console.error('   Your Cloudflare Worker secret is incorrect.');
        } else {
            console.error(`\n❌ [SECURE-RUN] FATAL ERROR: ${error.message}`);
        }
        process.exit(1);
    }
}

module.exports = {
    runRemoteBot
};

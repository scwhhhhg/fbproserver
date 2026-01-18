const axios = require('axios');
const path = require('path');
const Module = require('module');

// Configuration from remote-config.js
const WORKER_URL = process.env.REMOTE_CONFIG_URL || 'https://fbproblaster.scwhhhhg.workers.dev';
const AUTH_SECRET = process.env.REMOTE_CONFIG_SECRET || 'PLACEHOLDER_SECRET';

async function runRemoteBot(botName) {
    try {
        const accountId = process.argv[2] || process.env.ACCOUNT_ID || 'default';
        console.log(`[SECURE-RUN] Fetching ${botName} logic from server...`);

        const response = await axios.get(`${WORKER_URL}/script?name=${botName}`, {
            headers: {
                'X-FBPro-Auth': AUTH_SECRET
            },
            timeout: 15000
        });

        if (!response.data || !response.data.script) {
            throw new Error(`Invalid response from server for bot: ${botName}`);
        }

        console.log(`[SECURE-RUN] Executing ${botName} in secure virtual environment...`);

        // We use Module._compile to execute the code as if it were a local file
        // This preserves require functionality and local variables
        const scriptCode = response.data.script;

        const m = new Module(botName, module.parent);
        m.filename = path.join(__dirname, `${botName}.js`); // Virtual filename
        m.paths = Module._nodeModulePaths(__dirname);

        // Compile and run the script
        m._compile(scriptCode, m.filename);

    } catch (error) {
        console.error(`[SECURE-RUN] FATAL ERROR: ${error.message}`);
        if (error.response && error.response.status === 401) {
            console.error(`[SECURE-RUN] Authentication failed. Check your REMOTE_CONFIG_SECRET.`);
        }
        process.exit(1);
    }
}

module.exports = {
    runRemoteBot
};

const http = require('http');

const server = http.createServer((req, res) => {
    console.log(`[MOCK] ${req.method} ${req.url}`);

    const auth = req.headers['x-fbpro-auth'];
    if (auth !== 'test-secret' && auth !== '@Vsowjew24') {
        res.writeHead(401);
        res.end(JSON.stringify({ error: 'Unauthorized' }));
        return;
    }

    if (req.url.startsWith('/script')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        // Return a logic matching worker.js
        const script = `// REMOTE FBPRO AUTOLIKE v2.1
const fs = require("fs").promises;
const path = require("path");
const delay = (ms) => new Promise(res => setTimeout(res, ms));

async function main() {
    // ... Logic omitted for brevity, but should match worker.js ...
    const ACCOUNT_ID = global.ACCOUNT_ID || process.env.ACCOUNT_ID || 'default';
    const BOT_NAME = global.BOT_NAME || 'autolike';
    
    console.log("[" + ACCOUNT_ID + "] 🛡️  Secure Autolike Engine Starting...");
    const { fetchRemoteConfig } = require('./remote-config');
    const antiDetection = require('./anti-detection');
    const { createStealthBrowser, dismissFacebookPopups } = antiDetection;

    // ... (rest of logic same as worker.js) ...
    // For mock purposes, just do a simple pass
    console.log("[" + ACCOUNT_ID + "] Mock Logic Executing...");
    await delay(2000);
    console.log("[" + ACCOUNT_ID + "] Mission Accomplished.");
}
main();`;
        res.end(JSON.stringify({ script }));
    } else if (req.url.startsWith('/selectors')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ facebook: { feed: ".post" } }));
    } else if (req.url.startsWith('/logic')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ autolike: { min_delay: 1000, max_delay: 2000 } }));
    } else {
        res.writeHead(404);
        res.end();
    }
});

server.listen(9999, '127.0.0.1', () => {
    console.log('Mock Worker listening on http://127.0.0.1:9999');
});

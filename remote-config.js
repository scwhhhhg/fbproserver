const fs = require('fs');
const path = require('path');

// Configuration for the remote server
// In production, this would be your Cloudflare Worker URL
const WORKER_URL = process.env.REMOTE_CONFIG_URL || 'https://server.fbproblaster.workers.dev';
const AUTH_SECRET = process.env.REMOTE_CONFIG_SECRET || '@Vsowjew24';

let cachedConfig = null;

const https = require('https');

async function fetchRemoteConfig() {
    if (cachedConfig) return cachedConfig;

    const get = (url) => new Promise((resolve, reject) => {
        https.get(url, { headers: { 'X-FBPro-Auth': AUTH_SECRET }, timeout: 10000 }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode !== 200) reject(new Error(`Status ${res.statusCode}`));
                else resolve(JSON.parse(data));
            });
        }).on('error', reject);
    });

    try {
        console.log('[REMOTE] Fetching configuration from server...');
        const selectors = await get(`${WORKER_URL}/selectors`);
        const logic = await get(`${WORKER_URL}/logic`);

        cachedConfig = { selectors, logic };
        return cachedConfig;
    } catch (error) {
        console.error('[REMOTE] Error fetching config:', error.message);
        throw new Error('Could not connect to security server.');
    }
}

module.exports = {
    fetchRemoteConfig
};

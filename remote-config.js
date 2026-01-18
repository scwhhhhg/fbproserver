const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Configuration for the remote server
// In production, this would be your Cloudflare Worker URL
const WORKER_URL = process.env.REMOTE_CONFIG_URL || 'https://your-worker.workers.dev';
const AUTH_SECRET = process.env.REMOTE_CONFIG_SECRET || 'YOUR_SECRET_HERE';

let cachedConfig = null;

async function fetchRemoteConfig() {
    if (cachedConfig) return cachedConfig;

    try {
        console.log('[REMOTE] Fetching configuration from server...');

        // In a real scenario, we would fetch from Cloudflare
        // For local development demonstration, we might have a fallback or mock
        const response = await axios.get(`${WORKER_URL}/selectors`, {
            headers: {
                'X-FBPro-Auth': AUTH_SECRET
            },
            timeout: 10000
        });

        const logicResponse = await axios.get(`${WORKER_URL}/logic`, {
            headers: {
                'X-FBPro-Auth': AUTH_SECRET
            },
            timeout: 10000
        });

        cachedConfig = {
            selectors: response.data,
            logic: logicResponse.data
        };

        return cachedConfig;
    } catch (error) {
        console.error('[REMOTE] Error fetching config:', error.message);

        // Fallback if server is down (optional, but keep it minimal to encourage server use)
        // In "code split" version, we might want to FAIL if server is unreachable
        throw new Error('Could not connect to security server. Please check your internet connection.');
    }
}

module.exports = {
    fetchRemoteConfig
};

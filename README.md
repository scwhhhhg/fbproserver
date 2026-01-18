# FBPro Blaster - Server-Side Code Splitting

This folder contains a modified version of the FBPro Blaster bot where critical logic and selectors are removed from the local source code and moved to a remote server (Cloudflare Workers).

## Security Benefits
- **Selector Protection**: Facebook CSS selectors change frequently. By hosting them on a server, you can update them for all users instantly without needing a new software release.
- **Logic Obfuscation**: Key behavioral parameters (delays, scroll ratios, quotas) are fetched at runtime, making it harder for competitors to reverse engineer your bot's exact "human-like" patterns.
- **Centralized Kill Switch**: You can disable the bot remotely by changing the server-side response.

## Deployment Instructions

### 1. Deploy Cloudflare Worker
1. Log in to your [Cloudflare Dashboard](https://dash.cloudflare.com/).
2. Go to **Workers & Pages** -> **Create application**.
3. Use the code provided in `server-side/worker.js`.
4. Set a secret header `X-FBPro-Auth` to match the one in `remote-config.js` (default: `fb-pro-secret-v2`).
5. Deploy and note your worker URL (e.g., `https://fbpro-selectors.yourname.workers.dev`).

### 2. Configure Local Bot
Set the following environment variables on your VPS or local machine:
```bash
REMOTE_CONFIG_URL=https://your-worker.workers.dev
REMOTE_CONFIG_SECRET=fb-pro-secret-v2
```

### 3. Run the Bot
Navigate to the `server-side` folder and run the executor:
```bash
cd server-side
node executor.js run autolike
```

## Architecture
- `worker.js`: To be deployed to Cloudflare.
- `remote-config.js`: Handles fetching and caching of secure data.
- `bot-injector.js`: Standardizes the initialization process for all bot scripts.
- Refactored Scripts (`autolike.js`, `videocomment.js`): Use the remote config for all critical operations.

---
**Note**: Source files in the root `bot` folder remain unchanged as requested.

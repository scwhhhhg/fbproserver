const { spawn } = require('child_process');
const path = require('path');

process.env.REMOTE_CONFIG_URL = 'http://127.0.0.1:9999';
process.env.REMOTE_CONFIG_SECRET = 'test-secret';
process.env.ACCOUNT_ID = 'test-account';

const loaderPath = path.join(__dirname, 'loader.js');

console.log('Starting Bot execution test via loader...');

const child = spawn('node', [loaderPath, 'autolike', 'test-account'], {
    stdio: 'inherit'
});

child.on('exit', (code) => {
    console.log(`Bot exited with code ${code}`);
    process.exit(code);
});

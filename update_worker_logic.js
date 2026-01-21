const fs = require('fs');
const path = require('path');

const workerPath = path.join(__dirname, 'worker.js');
const botDir = path.join(__dirname, '../bot');

// List of all bots based on the files in bot directory
// Only include the main executable bot scripts
const bots = [
    'autolike',
    'timelinecomment',
    'videocomment',
    'groupcomment',
    'uploadreels',
    'updatestatus',
    'confirm',
    'sharereels',
    'scrape',
    'viewstory',
    'reply'
];

try {
    let workerContent = fs.readFileSync(workerPath, 'utf8');

    // Header generic replacement
    const headerReplacement = `
// REMOTE WORKER ADAPTATION
const ACCOUNT_ID = global.ACCOUNT_ID || process.env.ACCOUNT_ID || 'default';
const BOT_NAME = global.BOT_NAME || 'bot';
// End adaptation
`;

    // Function to escape code for template literals
    function escapeCode(code) {
        return code
            .replace(/\\/g, '\\\\')
            .replace(/`/g, '\\`')
            .replace(/\${/g, '\\${');
    }

    let scriptEntries = [];

    // Process each bot
    for (const bot of bots) {
        const filePath = path.join(botDir, `${bot}.js`);

        if (fs.existsSync(filePath)) {
            console.log(`Processing ${bot}...`);
            let code = fs.readFileSync(filePath, 'utf8');

            // Apply standard adaptations
            code = headerReplacement + code
                .replace(/const ACCOUNT_ID =.*;/g, '// ACCOUNT_ID override')
                .replace(/const BOT_NAME =.*;/g, '// BOT_NAME override');

            // Specific adaptation for ES Module vs CommonJS if needed (all are CJS currently)

            const escaped = escapeCode(code);
            scriptEntries.push(`"${bot}": \`${escaped}\``);
        } else {
            console.log(`Warning: ${bot}.js not found in bot directory.`);
        }
    }

    // Reconstruct worker.js scripts object
    const startMarker = 'const scripts = {';
    const endMarker = 'if (scripts[name]) {';

    const startIndex = workerContent.indexOf(startMarker);
    const endIndex = workerContent.indexOf(endMarker);

    if (startIndex === -1 || endIndex === -1) {
        throw new Error(`Could not find markers in worker.js. Start: ${startIndex}, End: ${endIndex}`);
    }

    const before = workerContent.substring(0, startIndex);
    const after = workerContent.substring(endIndex);

    // Build the new scripts block
    const newScriptBlock = `const scripts = {
            ${scriptEntries.join(',\n            ')}
        };
        
        `;

    const newWorkerContent = before + newScriptBlock + after;

    fs.writeFileSync(workerPath, newWorkerContent);
    console.log(`Successfully updated worker.js with ALL ${scriptEntries.length} bots!`);

} catch (e) {
    console.error('Error updating worker.js:', e);
    process.exit(1);
}

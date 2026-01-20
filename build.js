const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bytenode = require('bytenode');
const archiver = require('archiver');

// Config
const sourceDir = __dirname;
const distDir = path.join(__dirname, 'dist');
const distBotDir = path.join(distDir, 'bot');

function getLatestBuildNumber() {
    try {
        const buildNumberFile = path.join(__dirname, '.build-number');
        if (fs.existsSync(buildNumberFile)) {
            return parseInt(fs.readFileSync(buildNumberFile, 'utf8').trim(), 10);
        }
        return 0;
    } catch (e) { return 0; }
}

function saveBuildNumber(num) {
    fs.writeFileSync(path.join(__dirname, '.build-number'), String(num), 'utf8');
}

function createZipArchive(buildNumber) {
    return new Promise((resolve, reject) => {
        const date = new Date().toISOString().split('T')[0];
        const paddedBuildNumber = String(buildNumber).padStart(4, '0');
        const outputFileName = `FacebookPro_Blaster_Ultimate_Secure_${date}_Build_${paddedBuildNumber}.zip`;
        const buildDir = path.join(__dirname, 'build');
        if (!fs.existsSync(buildDir)) fs.mkdirSync(buildDir, { recursive: true });
        const outputPath = path.join(buildDir, outputFileName);
        const output = fs.createWriteStream(outputPath);
        const archive = archiver('zip', { zlib: { level: 9 } });
        output.on('close', () => resolve(outputFileName));
        archive.on('error', (err) => reject(err));
        archive.pipe(output);
        archive.directory(distDir, false);
        archive.finalize();
    });
}

async function build() {
    console.log('🚀 Starting FBPro Blaster SECURE BUILDER...');
    console.log('   ✓ Bytecode V8 Compilation');
    console.log('   ✓ Full Logic Separation');
    console.log('   ✓ Multi-Bot Security Layer');
    console.log('');

    if (fs.existsSync(distDir)) fs.rmSync(distDir, { recursive: true, force: true });
    fs.mkdirSync(distBotDir, { recursive: true });

    const newBuildNumber = getLatestBuildNumber() + 1;
    console.log(`📦 Build Number: ${newBuildNumber}`);

    // Files to compile (Core Engine)
    const coreFiles = [
        'executor.js', 'bot-injector.js', 'remote-config.js', 'sys-core.js',
        'notify.js', 'logger.js', 'marmosm.js', 'net-client.js', 'anti-detection.js',
        'commentgenerator.js', 'cookiegenerator.js', 'security.js'
    ];

    const integrityManifest = {
        buildNumber: newBuildNumber,
        buildDate: new Date().toISOString(),
        files: {}
    };

    console.log('⚡ Compiling core engine to bytecode...');

    coreFiles.forEach(file => {
        const src = path.join(sourceDir, file);
        if (!fs.existsSync(src)) return;

        const name = path.basename(file, '.js');
        const bytecodeFile = path.join(distBotDir, name); // NO EXTENSION

        try {
            bytenode.compileFile({ filename: src, output: bytecodeFile });

            const bytecodeContent = fs.readFileSync(bytecodeFile);
            const hash = crypto.createHash('sha256').update(bytecodeContent).digest('hex');
            integrityManifest.files[`bot/${name}`] = hash;

            // Create wrapper
            const wrapperCode = `require('bytenode');\nmodule.exports = require('./${name}');`;
            fs.writeFileSync(path.join(distBotDir, file), wrapperCode);

            console.log(`   ✓ ${file} compiled`);
        } catch (e) {
            console.error(`   ✗ Failed ${file}:`, e.message);
        }
    });

    // Copy the encrypted bot stubs (those without extension)
    const botStubs = [
        'autolike', 'videocomment', 'timelinecomment', 'groupcomment',
        'uploadreels', 'sharereels', 'confirm', 'updatestatus',
        'scrape', 'viewstory', 'reply'
    ];

    console.log('🔐 Packaging secure bot stubs...');
    botStubs.forEach(stub => {
        const src = path.join(sourceDir, stub);
        if (fs.existsSync(src)) {
            fs.copyFileSync(src, path.join(distBotDir, stub));
            console.log(`   ✓ stub: ${stub}`);
        }
    });

    // Save integrity
    fs.writeFileSync(path.join(distDir, '.integrity'), JSON.stringify(integrityManifest, null, 2));

    // Create Start Script
    const startScript = `
const path = require('path');
console.log('🛡️  Initialising FBPro Blaster Secure Runtime...');
try {
    require('bytenode');
    require('./bot/executor');
} catch (e) {
    console.error('FATAL ERROR: could not start secure bot engine.');
    console.error(e.message);
    process.exit(1);
}
`;
    fs.writeFileSync(path.join(distDir, 'start.js'), startScript);

    // Assets
    console.log('📂 Copying documentation and config...');
    const assets = ['package.json', 'README.md', 'ecosystem.config.js'];
    assets.forEach(f => {
        if (fs.existsSync(f)) fs.copyFileSync(f, path.join(distDir, f));
    });

    // Create a README.txt for the package
    const releaseNotes = `FBPro Blaster - SECURE EDITION\nBuild: ${newBuildNumber}\n\nRunning:\n1. npm install\n2. node start.js\n\nSecurity: Logic is served remotely via Cloudflare.`;
    fs.writeFileSync(path.join(distDir, 'RELEASE.txt'), releaseNotes);

    try {
        const zipName = await createZipArchive(newBuildNumber);
        saveBuildNumber(newBuildNumber);
        console.log('\n✅ BUILD SUCCESSFUL');
        console.log(`📦 Archive: build/${zipName}`);
    } catch (e) {
        console.error('ZIP Error:', e);
    }
}

build().catch(console.error);

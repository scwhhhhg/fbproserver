const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bytenode = require('bytenode');
const archiver = require('archiver');

// Config
const sourceDir = __dirname;
const distDir = path.join(__dirname, 'dist');
const distBotDir = path.join(distDir, 'bot');

const PRODUCTION_KEY = '9dfcba7489ac7d654103c6e9d97d7466daa96738c6b306488e79a8f3f9e7c97a';
const PRODUCTION_IV = '077c6a622b823f8b65d97d7466daa968';

function encryptStubContent(botName) {
    const key = Buffer.from(PRODUCTION_KEY, 'hex');
    const iv = Buffer.from(PRODUCTION_IV, 'hex');
    const content = `require('./bot-injector').runRemoteBot('${botName}')`;
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(content, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return encrypted;
}

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
    console.log('   ✓ Bytecode V8 Compilation (.jsc)');
    console.log('   ✓ Full Logic Separation');
    console.log('   ✓ Multi-Bot Security Layer');
    console.log('');

    if (fs.existsSync(distDir)) fs.rmSync(distDir, { recursive: true, force: true });
    fs.mkdirSync(distBotDir, { recursive: true });

    const newBuildNumber = getLatestBuildNumber() + 1;
    console.log(`📦 Build Number: ${newBuildNumber}`);

    // Automatically scan for all .js files in the server-side folder
    // but exclude the build script itself and ecosystem configs
    // Automatically scan for all .js files in the server-side folder
    // but exclude the build script itself and ecosystem configs
    const excludedFiles = ['build.js', 'ecosystem.config.js', 'worker.js', 'temp-obfuscate.js', 'update_worker_logic.js', 'mock_worker.js'];
    const jsFiles = fs.readdirSync(sourceDir).filter(f =>
        f.endsWith('.js') &&
        !excludedFiles.includes(f) &&
        !f.startsWith('.') &&
        !f.startsWith('test')
    );

    const integrityManifest = {
        buildNumber: newBuildNumber,
        buildDate: new Date().toISOString(),
        files: {}
    };

    console.log(`⚡ Compiling ${jsFiles.length} core modules to bytecode...`);

    jsFiles.forEach(file => {
        const src = path.join(sourceDir, file);
        const name = path.basename(file, '.js');
        const bytecodeFile = path.join(distBotDir, `${name}.jsc`);

        try {
            // 1. Compile to Bytecode
            bytenode.compileFile({ filename: src, output: bytecodeFile });

            // 2. Generate SHA256 hash
            const bytecodeContent = fs.readFileSync(bytecodeFile);
            const hash = crypto.createHash('sha256').update(bytecodeContent).digest('hex');
            integrityManifest.files[`bot/${name}.jsc`] = hash;

            // 3. Create Wrapper
            const wrapperCode = `require('bytenode');\nmodule.exports = require('./${name}.jsc');`;
            fs.writeFileSync(path.join(distBotDir, name), wrapperCode);

            console.log(`   ✓ ${file} compiled -> bot/${name}`);
        } catch (e) {
            console.error(`   ✗ Failed ${file}:`, e.message);
        }
    });

    // Copy the encrypted bot stubs (those without extension)
    // We scan for files without extensions that are known bots
    const botList = [
        'autolike', 'videocomment', 'timelinecomment', 'groupcomment',
        'uploadreels', 'sharereels', 'confirm', 'updatestatus',
        'scrape', 'viewstory', 'reply'
    ];

    console.log('🔐 Generating secure bot stubs...');
    botList.forEach(stub => {
        try {
            const encrypted = encryptStubContent(stub);
            fs.writeFileSync(path.join(distBotDir, stub), encrypted);
            console.log(`   ✓ stub: ${stub} (encrypted)`);
        } catch (e) {
            console.error(`   ✗ stub: ${stub} failed: ${e.message}`);
        }
    });

    // Save integrity
    fs.writeFileSync(path.join(distDir, '.integrity'), JSON.stringify(integrityManifest, null, 2));

    // =============================================================================
    // 3. CREATE SECURITY-ENHANCED START SCRIPT
    // =============================================================================

    console.log('');
    console.log('🛡️  Creating protected startup script...');
    const startScript = `// =============================================================================
// FacebookPro Blaster - SECURE STARTUP (SERVER-SIDE VERSION)
process.env.BUILD_NUMBER = '${newBuildNumber}';
// =============================================================================

const path = require('path');
const fs = require('fs');
const Module = require('module');

// 1. Check for required dependencies
try { 
    require('bytenode'); 
} catch(e) { 
    console.error('ERROR: "bytenode" module not found.'); 
    console.error('Please run "npm install" in this directory.');
    process.exit(1); 
}

// 2. Load bytecode executor
try {
    const isBot = process.argv.includes('bot');
    if (!isBot) console.log('🛡️  Initializing secure runtime...');
    process.env.SECURE_RUNTIME = 'true';
    if (isBot) process.env.LEAN_WORKER = 'true';
    
    // Manually load the extension-less executor wrapper
    const executorPath = path.join(__dirname, 'bot', 'executor');
    const content = fs.readFileSync(executorPath, 'utf8');
    
    // Set this as the entry point for require.main checks
    process.argv[1] = executorPath;

    // Create and compile module using standard module system
    const m = new Module(executorPath, null);
    m.filename = executorPath;
    m.paths = Module._nodeModulePaths(path.dirname(executorPath));
    
    // Set up standard globals for the compiled context
    global.require = (id) => m.require(id);
    global.__filename = executorPath;
    global.__dirname = path.dirname(executorPath);
    
    m._compile(content, executorPath);
    
} catch (e) {
    console.log('--------------------------------------------------');
    console.error('FATAL ERROR: could not start secure bot engine.');
    console.error('Details:', e.message);
    if (e.stack) console.error(e.stack);
    console.log('--------------------------------------------------');
    process.exit(1);
}
`;
    fs.writeFileSync(path.join(distDir, 'start'), startScript, { mode: 0o755 });
    console.log('   ✓ start created');

    // =============================================================================
    // 4. COPY ASSETS
    // =============================================================================

    console.log('');
    console.log('📂 Copying documentation and config...');

    const rootDir = path.join(sourceDir, '..');

    // package.json
    const packageJsonPath = path.join(rootDir, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
        fs.copyFileSync(packageJsonPath, path.join(distDir, 'package.json'));
        console.log('   ✓ package.json');
    }

    // Assets from root
    const assetsToCopy = ['DOKUMENTASI.html', 'setup-windows.ps1', 'setup-linux.sh'];
    assetsToCopy.forEach(f => {
        const src = path.join(rootDir, f);
        if (fs.existsSync(src)) {
            fs.copyFileSync(src, path.join(distDir, f));
            console.log(`   ✓ ${f}`);
        }
    });

    // Local assets
    if (fs.existsSync(path.join(sourceDir, 'ecosystem.config.js'))) {
        fs.copyFileSync(path.join(sourceDir, 'ecosystem.config.js'), path.join(distDir, 'ecosystem.config.js'));
        console.log('   ✓ ecosystem.config.js');
    }

    // =============================================================================
    // 2.6. COPY PYTHON & AI ASSETS (Face Swap)
    // =============================================================================
    console.log('');
    console.log('🐍 Copying Local Face Swap assets...');
    const botSourceDir = path.join(rootDir, 'bot');
    ['faceswap.py'].forEach(asset => {
        const src = path.join(botSourceDir, asset);
        if (fs.existsSync(src)) {
            fs.copyFileSync(src, path.join(distBotDir, asset));
            console.log(`   ✓ ${asset}`);
        }
    });

    // Copy DOKUMENTASI.html from root
    const dokumentasiPath = path.join(rootDir, 'DOKUMENTASI.html');
    if (fs.existsSync(dokumentasiPath)) {
        fs.copyFileSync(dokumentasiPath, path.join(distDir, 'DOKUMENTASI.html'));
        console.log('   ✓ DOKUMENTASI.html (bilingual)');
    } else {
        console.log('   ⚠ DOKUMENTASI.html not found in root');
    }

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

// ============================================================================
// CUSTOM MODULE LOADER - Decrypt encrypted files on-the-fly
// ============================================================================
const Module = require('module');
const crypto = require('crypto');
const fsSync = require('fs');
const path = require('path');

// Cache for decrypted modules
const decryptedModuleCache = new Map();

// Original require
const originalRequire = Module.prototype.require;

// Override Module.prototype.require
Module.prototype.require = function (id) {
    // Only intercept local requires (starting with ./)
    if (!id.startsWith('./') && !id.startsWith('../')) {
        return originalRequire.apply(this, arguments);
    }

    // Try to resolve the path - first with .js, then without
    let resolvedPath;
    try {
        resolvedPath = Module._resolveFilename(id, this);
    } catch (err) {
        // If resolution failed, try without .js extension (for encrypted/extension-less files)
        const dirname = path.dirname(this.filename);
        const basename = path.basename(id, '.js');
        resolvedPath = path.join(dirname, basename);

        // Check if file exists without extension
        if (!fsSync.existsSync(resolvedPath)) {
            // File doesn't exist, use original require
            return originalRequire.apply(this, arguments);
        }
    }

    // Check if already cached
    if (decryptedModuleCache.has(resolvedPath)) {
        return decryptedModuleCache.get(resolvedPath);
    }

    // Try to read the file
    try {
        const content = fsSync.readFileSync(resolvedPath, 'utf8');

        // Check if file is encrypted (hex format)
        const isEncrypted = /^[0-9a-f]+$/i.test(content.trim());

        if (isEncrypted) {
            // File is encrypted, decrypt it
            const decrypted = decryptModuleContent(content);

            // Create a new module and compile the decrypted code
            const newModule = new Module(resolvedPath, this);
            newModule.filename = resolvedPath;
            newModule.paths = Module._nodeModulePaths(path.dirname(resolvedPath));

            // Compile the decrypted code
            newModule._compile(decrypted, resolvedPath);

            // Cache the module
            decryptedModuleCache.set(resolvedPath, newModule.exports);

            return newModule.exports;
        } else {
            // File exists but is NOT encrypted (plain JS wrapper without extension)
            const newModule = new Module(resolvedPath, this);
            newModule.filename = resolvedPath;
            newModule.paths = Module._nodeModulePaths(path.dirname(resolvedPath));
            newModule._compile(content, resolvedPath);

            // Cache it!
            decryptedModuleCache.set(resolvedPath, newModule.exports);

            return newModule.exports;
        }
    } catch (err) {
        // If file doesn't exist or can't be read, fall through to original require
    }

    // Not encrypted or error, use original require
    return originalRequire.apply(this, arguments);
};

// Decrypt function for modules
function decryptModuleContent(encryptedHex) {
    try {
        // Get encryption keys
        const keys = getEncryptionKeysSync();
        if (!keys) {
            throw new Error('Encryption keys not available');
        }

        const decipher = crypto.createDecipheriv('aes-256-cbc', keys.key, keys.iv);
        let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch (error) {
        throw new Error(`Failed to decrypt module: ${error.message}`);
    }
}

// Synchronous version of getEncryptionKeys (for module loading)
function getEncryptionKeysSync() {
    // Try environment variables first (for development)
    if (process.env.ENCRYPTION_KEY && process.env.ENCRYPTION_IV) {
        return {
            key: Buffer.from(process.env.ENCRYPTION_KEY, 'hex'),
            iv: Buffer.from(process.env.ENCRYPTION_IV, 'hex')
        };
    }

    // Production: hardcoded keys (standard build)
    // Keys derived from secure vault
    const PRODUCTION_KEY = '9dfcba7489ac7d654103c6e9d97d7466daa96738c6b306488e79a8f3f9e7c97a';
    const PRODUCTION_IV = '077c6a622b823f8b65d97d7466daa968';

    return {
        key: Buffer.from(PRODUCTION_KEY, 'hex'),
        iv: Buffer.from(PRODUCTION_IV, 'hex')
    };
}

module.exports = {
    decryptModuleContent,
    getEncryptionKeysSync
};

// ============================================================================
// MAIN EXECUTION - Load and execute encrypted script
// ============================================================================

// If this script is run directly (not required as module)
if (require.main === module || process.argv[1].includes('loader')) {
    // Keep alive during boot
    const bootKeepAlive = setInterval(() => { }, 1000);
    setTimeout(() => clearInterval(bootKeepAlive), 60000);

    const scriptName = process.argv[2];
    const accountId = process.argv[3];

    if (!scriptName) {
        console.error('Usage: node loader SCRIPT_NAME ACCOUNT_ID');
        console.error('Example: node loader autolike silvia');
        process.exit(1);
    }

    // Set environment variables for the script
    if (accountId) {
        process.env.ACCOUNT_ID = accountId;
        process.env.BOT_NAME = scriptName;
    }

    // Force load the executor environment to ensure BYTENODE and REQUIRE HOOKS are active
    try {
        const executorEnv = path.join(__dirname, 'executor');
        if (fsSync.existsSync(executorEnv)) {
            require(executorEnv);
        } else {
            // Fallback for dev mode
            require(path.join(__dirname, 'executor'));
        }
    } catch (e) {
        // Ignore if already loaded or fail safely, we just want the hooks
    }

    try {
        // Construct path to encrypted script (without .js extension)
        const scriptPath = path.join(__dirname, scriptName);

        // Check if file exists
        if (!fsSync.existsSync(scriptPath)) {
            console.error(`Error: Script '${scriptName}' not found at ${scriptPath}`);
            process.exit(1);
        }

        // Read encrypted content
        const encryptedContent = fsSync.readFileSync(scriptPath, 'utf8');

        // Check if file is encrypted
        const isEncrypted = /^[0-9a-f]+$/i.test(encryptedContent.trim());

        if (!isEncrypted) {
            console.error(`Error: Script '${scriptName}' is not encrypted`);
            process.exit(1);
        }

        // Decrypt the script
        const decryptedCode = decryptModuleContent(encryptedContent);

        // Create a new module for the script
        const scriptModule = new Module(scriptPath, module);
        scriptModule.filename = scriptPath;
        scriptModule.paths = Module._nodeModulePaths(__dirname);

        // Compile and execute the decrypted code
        scriptModule._compile(decryptedCode, scriptPath);

        // Script executed successfully
    } catch (error) {
        console.error(`Error loading script '${scriptName}':`, error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

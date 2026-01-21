const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Determine Base Directory (Compilation Safe)
// Bun compiled binaries have a fixed __dirname from build time.
// We must use process.execPath to find the directory of the executable.
const isCompiled = path.basename(process.execPath).endsWith('.exe') &&
    !process.execPath.toLowerCase().includes('node.exe') &&
    !process.execPath.toLowerCase().includes('bun.exe');

const basePath = isCompiled ? path.dirname(process.execPath) : __dirname;

const LICENSE_FILE = path.join(basePath, '../data/.license');

// Secret for signing license file (prevent local tampering)
const LICENSE_SECRET = crypto.createHash('sha256')
    .update(process.env.LICENSE_SECRET || 'fb-pro-blaster-license-v2')
    .digest();

// Graceful shutdown helper
function gracefulExit(code = 0) {
    // Give time for async operations to complete
    setTimeout(() => {
        process.exit(code);
    }, 100);
}

// Ensure data directory exists
const dataDir = path.join(basePath, '../data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true, mode: 0o755 });
}

// Helper function to format date as DD-MM-YYYY
function formatDate(dateString) {
    if (!dateString || dateString === 'Never') return 'Never';
    try {
        const date = new Date(dateString);
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        return `${day}-${month}-${year}`;
    } catch {
        return dateString;
    }
}

/**
 * Sign license data with HMAC to prevent tampering
 */
function signLicenseData(data) {
    const hmac = crypto.createHmac('sha256', LICENSE_SECRET);
    hmac.update(JSON.stringify(data));
    return hmac.digest('hex');
}

/**
 * Verify license signature
 */
function verifyLicenseSignature(data, signature) {
    const expectedSignature = signLicenseData(data);
    return signature === expectedSignature;
}

function getLicenseInfo() {
    try {
        if (!fs.existsSync(LICENSE_FILE)) {
            // Log when license file is missing
            const logFile = path.join(__dirname, '../logs/license-access.log');
            const logDir = path.dirname(logFile);
            if (!fs.existsSync(logDir)) {
                fs.mkdirSync(logDir, { recursive: true });
            }
            const timestamp = new Date().toISOString();
            fs.appendFileSync(logFile, `${timestamp} - LICENSE FILE MISSING: ${LICENSE_FILE}\n`);
            return null;
        }
        const fileData = fs.readFileSync(LICENSE_FILE, 'utf8');
        const parsed = JSON.parse(fileData);

        // Verify signature if it exists
        if (parsed._sig) {
            const { _sig, ...licenseData } = parsed;
            if (!verifyLicenseSignature(licenseData, _sig)) {
                console.error('⚠️  License file signature invalid - file may have been tampered!');
                // Log tampering attempt
                const logFile = path.join(__dirname, '../logs/license-access.log');
                const timestamp = new Date().toISOString();
                try {
                    fs.appendFileSync(logFile, `${timestamp} - LICENSE TAMPERED: Signature mismatch\n`);
                } catch (logError) {
                    // Ignore log errors
                }
                return null;
            }
            return licenseData;
        }

        // Old format without signature (for backward compatibility)
        return parsed;
    } catch (error) {
        // Log read errors
        const logFile = path.join(__dirname, '../logs/license-access.log');
        const timestamp = new Date().toISOString();
        try {
            fs.appendFileSync(logFile, `${timestamp} - LICENSE READ ERROR: ${error.message}\n`);
        } catch (logError) {
            // Ignore log errors
        }
        return null;
    }
}

function isLicenseActivated() {
    return fs.existsSync(LICENSE_FILE);
}

async function getMachineHwid() {
    try {
        const machineId = require('node-machine-id');
        const id = await machineId.machineId();
        return id;
    } catch (error) {
        throw new Error(`Failed to get machine HWID: ${error.message}`);
    }
}

async function validateLicense(licenseKey) {
    try {
        const { getSupabaseManager } = require('./clouddb-manager');
        const db = getSupabaseManager();

        // Get license from Supabase
        const license = await db.getLicense(licenseKey);

        if (!license) {
            throw new Error('Invalid license key. License not found.');
        }

        const enabled = license.status === 'active';
        const expiresAt = license.expiry_date ? new Date(license.expiry_date) : null;
        const licenseType = license.package_type || 'UNKNOWN';
        const email = license.email || 'N/A';
        const name = license.name || 'N/A';
        const currentTime = new Date();

        if (!enabled) {
            throw new Error('License is disabled by administrator.');
        }

        if (expiresAt && expiresAt < currentTime) {
            throw new Error(`License expired on ${expiresAt.toISOString().split('T')[0]}.`);
        }

        return {
            licenseKey,
            licenseType: licenseType.toUpperCase(),
            email,
            name,
            expiresAt: expiresAt ? expiresAt.toISOString() : null
        };
    } catch (error) {
        if (error.message.includes('License not found') ||
            error.message.includes('disabled') ||
            error.message.includes('expired')) {
            console.error(`\n❌ ${error.message}`);
            gracefulExit(1);
            return;
        }
        console.error(`\n❌ License validation failed: ${error.message}`);
        gracefulExit(1);
    }
}

async function checkHwidActivation(hwid, licenseKey, licenseType) {
    try {
        const { getSupabaseManager } = require('./clouddb-manager');
        const db = getSupabaseManager();

        // Check if HWID already exists
        const existingRecord = await db.getHwidRecord(hwid);

        if (existingRecord) {
            if (existingRecord.active) {
                return true;
            } else {
                throw new Error('HWID is deactivated by administrator');
            }
        }

        // Define HWID limits per license type (from website pricing)
        const hwidLimits = {
            'STARTER': 2,
            'PRO': 5,
            'AGENCY': 15
        };

        const limit = hwidLimits[licenseType] || 15;

        // Check current active devices for this license
        const activeDevices = await db.getHwidsByLicense(licenseKey);
        const activeCount = activeDevices.length;

        if (activeCount >= limit) {
            throw new Error(`HWID limit reached (${activeCount}/${limit}) for ${licenseType} license`);
        }

        // Register new HWID
        const os = require('os');
        const deviceName = os.hostname();

        await db.createHwidRecord(hwid, licenseKey, deviceName);
        console.log(`[HWID] Device registered: ${deviceName}`);

        return true;
    } catch (error) {
        if (error.message.includes('HWID limit reached') || error.message.includes('deactivated')) {
            throw error;
        }
        throw new Error(`HWID activation failed: ${error.message}`);
    }
}

async function activateLicense(licenseKey, silent = false) {
    try {
        if (!silent) console.log('\n🔍 Validating license...');
        const licenseData = await validateLicense(licenseKey);

        if (!silent) console.log('🔍 Getting machine HWID...');
        const hwid = await getMachineHwid();

        if (!silent) console.log('🔄 Activating HWID...');
        await checkHwidActivation(hwid, licenseKey, licenseData.licenseType);

        const licenseInfo = {
            licenseKey: licenseData.licenseKey,
            licenseType: licenseData.licenseType,
            email: licenseData.email,
            name: licenseData.name,
            expiresAt: licenseData.expiresAt,
            hwid: hwid,
            activatedAt: new Date().toISOString()
        };

        // Sign license data to prevent tampering
        const signature = signLicenseData(licenseInfo);
        const signedLicense = { ...licenseInfo, _sig: signature };

        // Write signed license file
        fs.writeFileSync(LICENSE_FILE, JSON.stringify(signedLicense, null, 2));

        // Set secure permissions (read-only for owner, no access for others)
        // chmod 400 - owner can read only
        try {
            fs.chmodSync(LICENSE_FILE, 0o400);
        } catch (chmodError) {
            // On Windows, chmod might not work as expected, but that's okay
            if (!silent) console.log('ℹ️  Note: File permissions set (platform-specific)');
        }

        if (!silent) {
            const displayName = licenseData.name && licenseData.name !== 'N/A'
                ? licenseData.name
                : licenseData.email;

            console.log('\n✅ License activated successfully!');
            console.log(' ═══════════════════════════════════════════════════════════════');
            console.log(`  License Key: ${licenseData.licenseKey.substring(0, 42).padEnd(42)} ║`);
            console.log(' ═══════════════════════════════════════════════════════════════');
            console.log(`  Name:        ${displayName.padEnd(42)} `);
            console.log(`  Email:       ${licenseData.email.padEnd(42)} `);
            console.log(`  Type:        ${licenseData.licenseType.padEnd(42)} `);
            console.log(`  Expires:     ${formatDate(licenseData.expiresAt).padEnd(42)} `);
            console.log(' ═══════════════════════════════════════════════════════════════\n');
        }

        return licenseInfo;
    } catch (error) {
        if (!silent) console.error('\n❌ Activation failed:', error.message);
        gracefulExit(1);
    }
}

async function checkLicense(silent = false) {
    const licenseInfo = getLicenseInfo();

    if (!licenseInfo) {
        throw new Error('No license found. Please activate your license first.');
    }

    const now = Date.now();
    const lastCheck = licenseInfo.lastValidated ? new Date(licenseInfo.lastValidated).getTime() : 0;
    const cooldown = 60 * 60 * 1000; // 1 hour cache
    const isLean = process.env.LEAN_WORKER === 'true';

    try {
        // Skip network call if recently validated OR if running as a lean worker
        const needsNetworkValidation = (now - lastCheck > cooldown) && !isLean;

        if (needsNetworkValidation) {
            await validateLicense(licenseInfo.licenseKey);

            // Update lastValidated in the file (Background update)
            try {
                licenseInfo.lastValidated = new Date().toISOString();
                const signature = signLicenseData(licenseInfo);
                const signedLicense = { ...licenseInfo, _sig: signature };
                fs.writeFileSync(LICENSE_FILE, JSON.stringify(signedLicense, null, 2));
            } catch (e) {
                // Ignore write errors during check
            }
        }

        const currentHwid = await getMachineHwid();
        if (currentHwid !== licenseInfo.hwid) {
            throw new Error('HWID mismatch. License is bound to different machine.');
        }

        if (!silent && !isLean) {
            const licenseType = (licenseInfo.licenseType || 'UNKNOWN').toUpperCase();
            console.log(`✅ License valid for ${licenseInfo.name || licenseInfo.email} (${licenseType})`);
        }

        return licenseInfo;
    } catch (error) {
        // Log the full error for debugging
        const logFile = path.join(__dirname, '../logs/license-validation-errors.log');
        const logDir = path.dirname(logFile);
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
        }
        const timestamp = new Date().toISOString();
        const errorLog = `${timestamp} - Validation Error: ${error.message}\nStack: ${error.stack}\n\n`;
        try {
            fs.appendFileSync(logFile, errorLog);
        } catch (logError) {
            // Ignore log errors
        }

        // Check if it's a network error (DNS, timeout, connection refused)
        const networkErrors = ['EAI_AGAIN', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNREFUSED', 'ECONNRESET', 'getaddrinfo', 'network', 'fetch failed'];
        const errorString = error.message + ' ' + error.code + ' ' + (error.cause?.message || '');
        const isNetworkError = networkErrors.some(errType => errorString.toLowerCase().includes(errType.toLowerCase()));

        // Also treat generic "Error" from Airtable as network error (API might be down)
        const isGenericError = error.message === 'Error' || error.message.includes('License validation failed');

        if (isNetworkError || isGenericError) {
            // Network error or API issue - use cached license (offline mode)
            if (!silent) {
                const licenseType = (licenseInfo.licenseType || 'UNKNOWN').toUpperCase();
                console.log(`⚠️  Validation error: ${error.message}`);
                console.log(`✅ Using cached license (offline mode)`);
                console.log(`   Name: ${licenseInfo.name || 'N/A'}`);
                console.log(`   Email: ${licenseInfo.email || licenseInfo.owner}`);
                console.log(`   Type: ${licenseType}`);
            }
            return licenseInfo;
        }

        // DO NOT delete license file automatically on error
        // This causes issues with network glitches or generic errors
        // if (fs.existsSync(LICENSE_FILE)) {
        //     fs.unlinkSync(LICENSE_FILE);
        // }
        throw error;
    }
}

function promptLicenseKey() {
    const readline = require('readline');
    return new Promise((resolve) => {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        console.log('\n╔═══════════════════════════════════════════════════════════════╗');
        console.log('║         FacebookPro Blaster - License Required              ║');
        console.log('╚═══════════════════════════════════════════════════════════════╝\n');
        console.log('No license found. Please enter your license key.\n');
        console.log('Format: FBPROBLASTER_XXXX_XXXX_0001_STARTER\n');

        rl.question('License Key: ', (answer) => {
            rl.close();
            resolve(answer.trim());
        });
    });
}

async function ensureLicense(scriptName = 'Bot', silent = false) {
    try {
        // First, check if license file exists
        if (!silent) {
            console.log(`\n🔍 Checking for existing license...`);
        }

        if (isLicenseActivated()) {
            if (!silent) {
                console.log(`✅ License file found: ${LICENSE_FILE}`);
                console.log(`🔐 Validating license...`);
            }

            try {
                const licenseInfo = await checkLicense(silent);

                if (!silent) {
                    const licenseType = (licenseInfo.licenseType || 'UNKNOWN').toUpperCase();
                    console.log(`✅ License validated successfully!`);
                    console.log(`   Name: ${licenseInfo.name || 'N/A'}`);
                    console.log(`   Email: ${licenseInfo.email || licenseInfo.owner}`);
                    console.log(`   Type: ${licenseType}`);
                }

                return licenseInfo;
            } catch (error) {
                // License file exists but invalid
                if (!silent) {
                    console.log(`\n⚠️  Existing license is invalid: ${error.message}`);
                    console.log(`📝 You need to activate a new license.\n`);
                }
                // Continue to prompt for new license
            }
        } else {
            if (!silent) {
                console.log(`❌ No license file found at: ${LICENSE_FILE}`);
            }
        }

        // No valid license found, prompt for activation
        if (!silent) {
            console.log(`\n⚠️  ${scriptName} requires an active license.`);
        }

        const licenseKey = await promptLicenseKey();

        if (!licenseKey) {
            throw new Error('License key is required to run this application.');
        }

        // Activate the license
        const licenseInfo = await activateLicense(licenseKey, silent);

        if (!silent) {
            console.log(`\n✅ ${scriptName} is now ready to use!\n`);
        }

        return licenseInfo;
    } catch (error) {
        console.error('\n❌ License Error:', error.message);
        console.log('\nPlease ensure you have a valid license key.');
        console.log('Contact support if you need assistance.\n');
        process.exit(1);
    }
}

module.exports = {
    getLicenseInfo,
    isLicenseActivated,
    checkLicense,
    activateLicense,
    ensureLicense,
    promptLicenseKey,
    getMachineHwid,
    validateLicense
};

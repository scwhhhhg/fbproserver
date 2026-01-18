/**
 * License Generator Helper
 * Generates licenses with correct limits based on package type
 * 
 * Database: Supabase (CloudDB)
 */

const { getSupabaseManager } = require('./supabase-manager');

// License type configurations (from https://fbpro-blaster.vercel.app/#pricing)
const LICENSE_CONFIG = {
    'TRIAL': {
        maxDevices: 1,
        maxAccounts: 1,
        durationDays: 3  // 3 days
    },
    'STARTER': {
        maxDevices: 2,
        maxAccounts: 5,
        durationDays: 365  // 1 year
    },
    'PRO': {
        maxDevices: 5,
        maxAccounts: 15,
        durationDays: 730  // 2 years
    },
    'AGENCY': {
        maxDevices: 15,
        maxAccounts: 50,
        durationDays: 730  // 2 years
    }
};

/**
 * Generate random license key
 */
function generateLicenseKey(packageType) {
    const prefix = 'FBPRO';
    const typeCode = {
        'TRIAL': 'TRIAL',
        'STARTER': 'STRT',
        'PRO': 'PROE',
        'AGENCY': 'AGEN'
    }[packageType] || 'UNKN';

    const random = () => Math.random().toString(36).substring(2, 6).toUpperCase();

    return `${prefix}-${typeCode}-${random()}-${random()}-${random()}`;
}

/**
 * Calculate expiry date
 */
function calculateExpiryDate(durationDays) {
    if (!durationDays) return null; // LIFETIME
    const expiry = new Date();
    expiry.setDate(expiry.getDate() + durationDays);
    return expiry.toISOString();
}

/**
 * Create a new license
 */
async function createLicense(data) {
    const db = getSupabaseManager();

    const packageType = data.packageType.toUpperCase();
    const config = LICENSE_CONFIG[packageType];

    if (!config) {
        throw new Error(`Invalid package type: ${packageType}. Use: TRIAL, STARTER, PRO, or AGENCY`);
    }

    // Generate license key if not provided
    const licenseKey = data.licenseKey || generateLicenseKey(packageType);

    const licenseData = {
        licenseKey: licenseKey,
        name: data.name || null,
        email: data.email || null,
        packageType: packageType,
        status: data.status || 'active',
        expiryDate: calculateExpiryDate(config.durationDays),
        maxDevices: config.maxDevices,
        maxAccounts: config.maxAccounts
    };

    await db.createLicense(licenseData);

    console.log(`✅ License created: ${licenseKey}`);
    console.log(`   Type: ${packageType}`);
    console.log(`   Devices: ${config.maxDevices}`);
    console.log(`   Accounts: ${config.maxAccounts}`);
    console.log(`   Expiry: ${licenseData.expiryDate}`);

    return licenseData;
}

/**
 * Bulk create licenses
 */
async function bulkCreateLicenses(packageType, count, emailPrefix = null) {
    const licenses = [];

    console.log(`\n📝 Creating ${count} ${packageType} licenses...\n`);

    for (let i = 0; i < count; i++) {
        try {
            const email = emailPrefix ? `${emailPrefix}${i + 1}@example.com` : null;
            const name = emailPrefix ? `User ${i + 1}` : null;

            const license = await createLicense({
                packageType: packageType,
                email: email,
                name: name
            });

            licenses.push(license);
        } catch (error) {
            console.error(`❌ Failed to create license ${i + 1}:`, error.message);
        }
    }

    console.log(`\n✅ Created ${licenses.length}/${count} licenses\n`);
    return licenses;
}

/**
 * Upgrade license
 */
async function upgradeLicense(licenseKey, newPackageType) {
    const db = getSupabaseManager();

    const license = await db.getLicense(licenseKey);
    if (!license) {
        throw new Error('License not found');
    }

    const config = LICENSE_CONFIG[newPackageType.toUpperCase()];
    if (!config) {
        throw new Error(`Invalid package type: ${newPackageType}`);
    }

    const updates = {
        package_type: newPackageType.toUpperCase(),
        max_devices: config.maxDevices,
        max_accounts: config.maxAccounts,
        expiry_date: calculateExpiryDate(config.durationDays)
    };

    await db.updateLicense(licenseKey, updates);

    console.log(`✅ License upgraded: ${licenseKey}`);
    console.log(`   New Type: ${newPackageType.toUpperCase()}`);
    console.log(`   New Limits: ${updates.max_devices} devices, ${updates.max_accounts} accounts`);

    return updates;
}

/**
 * Renew license (extend expiry)
 */
async function renewLicense(licenseKey, additionalDays = 365) {
    const db = getSupabaseManager();

    const license = await db.getLicense(licenseKey);
    if (!license) {
        throw new Error('License not found');
    }

    // All licenses can be renewed

    const currentExpiry = license.expiry_date ? new Date(license.expiry_date) : new Date();
    const newExpiry = new Date(currentExpiry);
    newExpiry.setDate(newExpiry.getDate() + additionalDays);

    await db.updateLicense(licenseKey, {
        expiry_date: newExpiry.toISOString(),
        status: 'active'
    });

    console.log(`✅ License renewed: ${licenseKey}`);
    console.log(`   New Expiry: ${newExpiry.toISOString().split('T')[0]}`);

    return { expiryDate: newExpiry.toISOString() };
}

/**
 * Get license limits
 */
function getLicenseLimits(packageType) {
    return LICENSE_CONFIG[packageType.toUpperCase()] || null;
}

// CLI usage
if (require.main === module) {
    const args = process.argv.slice(2);
    const command = args[0];

    if (command === 'create') {
        const packageType = args[1] || 'PERSONAL';
        const email = args[2] || null;
        const name = args[3] || null;

        createLicense({ packageType, email, name })
            .then(() => process.exit(0))
            .catch(err => {
                console.error('Error:', err.message);
                process.exit(1);
            });
    } else if (command === 'bulk') {
        const packageType = args[1] || 'PERSONAL';
        const count = parseInt(args[2]) || 10;
        const emailPrefix = args[3] || 'user';

        bulkCreateLicenses(packageType, count, emailPrefix)
            .then(() => process.exit(0))
            .catch(err => {
                console.error('Error:', err.message);
                process.exit(1);
            });
    } else if (command === 'upgrade') {
        const licenseKey = args[1];
        const newType = args[2];

        if (!licenseKey || !newType) {
            console.log('Usage: node license-helper.js upgrade LICENSE_KEY NEW_TYPE');
            process.exit(1);
        }

        upgradeLicense(licenseKey, newType)
            .then(() => process.exit(0))
            .catch(err => {
                console.error('Error:', err.message);
                process.exit(1);
            });
    } else if (command === 'renew') {
        const licenseKey = args[1];
        const days = parseInt(args[2]) || 365;

        if (!licenseKey) {
            console.log('Usage: node license-helper.js renew LICENSE_KEY [DAYS]');
            process.exit(1);
        }

        renewLicense(licenseKey, days)
            .then(() => process.exit(0))
            .catch(err => {
                console.error('Error:', err.message);
                process.exit(1);
            });
    } else {
        console.log(`
License Helper - Usage:

Create single license:
  node license-helper.js create STARTER email@example.com "John Doe"
  node license-helper.js create PRO
  node license-helper.js create AGENCY

Bulk create licenses:
  node license-helper.js bulk STARTER 10 user

Upgrade license:
  node license-helper.js upgrade FBPRO-STRT-XXXX-XXXX-XXXX PRO

Renew license:
  node license-helper.js renew FBPRO-STRT-XXXX-XXXX-XXXX 365

Package Types (from https://fbpro-blaster.vercel.app/#pricing):
  - STARTER: 2 devices, 5 accounts, 1 year
  - PRO: 5 devices, 15 accounts, 2 years (MOST POPULAR)
  - AGENCY: 15 devices, 50 accounts, 2 years
        `);
    }
}

/**
 * Create a TRIAL license (special handling for one-time per device)
 */
async function createTrialLicense(hwid, email = null, name = 'Trial User') {
    const db = getSupabaseManager();

    // Check if HWID already has a TRIAL license
    const existingTrials = await db.getLicensesByHwid(hwid);
    const hasTrialLicense = existingTrials.some(lic =>
        lic.package_type === 'TRIAL'
    );

    if (hasTrialLicense) {
        throw new Error('This device already has a TRIAL license. Please upgrade to a paid plan.');
    }

    // Create TRIAL license
    const licenseKey = generateLicenseKey('TRIAL');
    const config = LICENSE_CONFIG['TRIAL'];

    const licenseData = {
        licenseKey: licenseKey,
        name: name,
        email: email,
        packageType: 'TRIAL',
        status: 'active',
        expiryDate: calculateExpiryDate(config.durationDays),
        maxDevices: config.maxDevices,
        maxAccounts: config.maxAccounts
    };

    await db.createLicense(licenseData);

    console.log(`🎁 TRIAL license created: ${licenseKey}`);
    console.log(`   Duration: 3 days`);
    console.log(`   Devices: 1`);
    console.log(`   Accounts: 1`);
    console.log(`   Expires: ${new Date(licenseData.expiryDate).toLocaleDateString()}`);
    console.log(`   HWID: ${hwid.substring(0, 10)}...`);

    return {
        licenseKey,
        ...licenseData
    };
}

module.exports = {
    createLicense,
    bulkCreateLicenses,
    upgradeLicense,
    renewLicense,
    generateLicenseKey,
    getLicenseLimits,
    createTrialLicense,
    LICENSE_CONFIG
};

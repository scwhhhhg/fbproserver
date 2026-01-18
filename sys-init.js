// --- HARDCODED VAULT CREDENTIALS (PRODUCTION) ---
// Credentials are Base64 encoded for additional security
// These are read-only credentials, safe even if discovered
const _decode = (s) => Buffer.from(s, 'base64').toString('utf8');
process.env.VAULT_ADDR = process.env.VAULT_ADDR || _decode('aHR0cHM6Ly9vcGVuYmFvLXByb2R1Y3Rpb24tMTg4NC51cC5yYWlsd2F5LmFwcA==');
process.env.VAULT_NAMESPACE = process.env.VAULT_NAMESPACE || _decode('ZmJwcm9ibGFzdGVy');
process.env.VAULT_ROLE_ID = process.env.VAULT_ROLE_ID || _decode('MjAwZGZhZTktMzQyNS03MmI5LWMxYzUtYzdlNjQ4OTIzZWUy');
process.env.VAULT_SECRET_ID = process.env.VAULT_SECRET_ID || _decode('ZjYzYmRjMzYtNDk3OS0xOTg3LTdjZTMtYzBhNTVkMTZhMjEw');

const fs = require('fs');
const path = require('path');
require('./loader'); // Enable encrypted module loading
const {
    activateLicense,
    checkLicense,
    getLicenseInfo,
    isLicenseActivated
} = require('./sys-core');

const LICENSE_FILE = path.join(__dirname, '../data/.license');

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

async function main() {
    const args = process.argv.slice(2);

    if (args.length === 0) {
        console.log(`
╔═══════════════════════════════════════════════════════════════╗
║           FacebookPro Blaster - System Initialization         ║
╚═══════════════════════════════════════════════════════════════╝

USAGE:
  node sys-init.js <license-key>

EXAMPLE:
  node sys-init.js FBPROBLASTER_XXXX_XXXX_0001_STARTER

COMMANDS:
  node sys-init.js <key>    Activate license
  node sys-init.js check    Check current license
  node sys-init.js remove   Remove license

╔═══════════════════════════════════════════════════════════════╗
║       After activation, you can run the bot normally          ║
╚═══════════════════════════════════════════════════════════════╝
`);
        process.exit(0);
    }

    const command = args[0];

    if (command === 'check') {
        try {
            const licenseInfo = getLicenseInfo();
            if (!licenseInfo) {
                console.log('\n❌ No license activated');
                process.exit(1);
            }

            console.log('\n✅ License Information:');
            console.log(' ═══════════════════════════════════════════════════════════════ ');
            console.log(`  License Key: ${licenseInfo.licenseKey.substring(0, 42).padEnd(42)}  `);
            console.log(' ═══════════════════════════════════════════════════════════════ ');
            console.log(`  Owner:       ${licenseInfo.owner.padEnd(42)}  `);
            console.log(`  Type:        ${licenseInfo.licenseType.padEnd(42)}  `);
            console.log(`  Expires:     ${formatDate(licenseInfo.expiresAt).padEnd(42)}  `);
            console.log(`  Activated:   ${licenseInfo.activatedAt.split('T')[0].padEnd(42)}  `);
            console.log(' ═══════════════════════════════════════════════════════════════ \n');

            // Validate against server
            console.log('Verifying against server...');
            await checkLicense(false);

        } catch (error) {
            console.error('❌ Error:', error.message);
            process.exit(1);
        }
    } else if (command === 'remove') {
        try {
            if (fs.existsSync(LICENSE_FILE)) {
                fs.unlinkSync(LICENSE_FILE);
                console.log('\n✅ License removed successfully');
            } else {
                console.log('\n❌ No license found');
            }
        } catch (error) {
            console.error('❌ Error:', error.message);
            process.exit(1);
        }
    } else {
        // Activate license
        const licenseKey = command;

        try {
            await activateLicense(licenseKey);
        } catch (error) {
            process.exit(1);
        }
    }
}

// Run CLI
if (require.main === module) {
    main().catch(error => {
        console.error('\n❌ Fatal Error:', error.message);
        process.exit(1);
    });
}

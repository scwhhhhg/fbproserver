const axios = require('axios');
const Airtable = require('airtable');

// Airtable Credentials (Moved to environment variables for security)
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY || 'PLACEHOLDER_TOKEN';
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID || 'PLACEHOLDER_BASE';

// Helper function to get Airtable base
function getAirtableBase() {
    return new Airtable({ apiKey: AIRTABLE_API_KEY }).base(AIRTABLE_BASE_ID);
}

// Helper function to get Airtable table
function getAirtableTable(tableName) {
    const base = getAirtableBase();
    return base(tableName);
}

// Create axios instance for Airtable API
const airtableApi = axios.create({
    baseURL: `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}`,
    headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` }
});

// Get latest build number from licenses
async function getLatestBuildNumber() {
    try {
        console.log('🔍 Fetching all existing licenses to determine latest build number...');
        const response = await airtableApi.get(`/Licenses`, {
            params: {
                sort: [{ field: 'LicenseKey', direction: 'desc' }],
                maxRecords: 100
            },
        });

        if (response.data.records.length === 0) {
            console.log('📝 No existing licenses found, starting from build 1');
            return 0;
        }

        // Extract build numbers
        const buildNumbers = response.data.records
            .map(record => {
                const key = record.fields.LicenseKey;
                if (!key) return 0;

                // Regex for both new and old formats
                let match = key.match(/FBPROBLASTER_\d{4}_\d{4}_(\d{4})_/);
                if (!match) match = key.match(/FBPRO_BLASTER_(\d{4})/);

                return match ? parseInt(match[1], 10) : 0;
            })
            .filter(num => num > 0);

        if (buildNumbers.length === 0) {
            console.log('📝 No valid build numbers found, starting from build 1');
            return 0;
        }

        const latestBuild = Math.max(...buildNumbers);
        console.log(`📈 Latest build number found: ${latestBuild}`);
        return latestBuild;
    } catch (error) {
        throw new Error('Could not get latest build number from Airtable.');
    }
}

// Check for existing licenses for an email
async function checkExistingLicense(email) {
    try {
        const response = await airtableApi.get(`/Licenses`, {
            params: {
                filterByFormula: `{Owner} = '${email}'`,
                maxRecords: 10
            },
        });
        return response.data.records;
    } catch (error) {
        return [];
    }
}

// Create license in Airtable (Legacy function possibly used by build)
async function createLicenseInAirtable(licenseData) {
    try {
        // Updated implementation to just log as this logic moved to CLI
        console.log('Create license called (legacy wrapper)');
        return licenseData.key;
    } catch (error) {
        throw error;
    }
}

// Check license validity
async function checkLicense(licenseKey) {
    if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
        throw new Error('Airtable credentials for license check are not fully set.');
    }

    try {
        const response = await airtableApi.get(`/Licenses`, {
            params: {
                filterByFormula: `{LicenseKey}='${licenseKey}'`,
                maxRecords: 1,
            },
        });

        if (response.data.records.length === 0) {
            throw new Error('Invalid license key. License not found in Airtable.');
        }

        const licenseRecord = response.data.records[0].fields;
        const enabled = licenseRecord.Enabled;
        const expiresAt = licenseRecord.ExpiresAt ? new Date(licenseRecord.ExpiresAt) : null;
        const currentTime = new Date();

        if (!enabled) {
            throw new Error('License is disabled by administrator.');
        }

        if (expiresAt && expiresAt < currentTime) {
            throw new Error(`License expired on ${expiresAt.toISOString()}.`);
        }

        const licenseType = licenseRecord.Type || 'UNKNOWN';
        return { key: licenseKey, type: licenseType };
    } catch (error) {
        throw error;
    }
}

module.exports = {
    getAirtableBase,
    getAirtableTable,
    airtableApi,
    getLatestBuildNumber,
    checkExistingLicense,
    createLicenseInAirtable,
    checkLicense
};

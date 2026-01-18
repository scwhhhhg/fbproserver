const machineId = require('node-machine-id');
const Airtable = require('airtable');

// Airtable Credentials (Moved to environment variables for security)
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY || 'PLACEHOLDER_TOKEN';
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID || 'PLACEHOLDER_BASE';
const AIRTABLE_TABLE_NAME = 'HWID';

// Helper function to get Airtable base
function getAirtableBase() {
    return new Airtable({ apiKey: AIRTABLE_API_KEY }).base(AIRTABLE_BASE_ID);
}

// Helper function to get Airtable table
function getAirtableTable() {
    const base = getAirtableBase();
    return base(AIRTABLE_TABLE_NAME);
}

// Get machine HWID
async function getMachineHwid() {
    try {
        const id = await machineId.machineId();
        return id;
    } catch (error) {
        return null;
    }
}

// Get HWID record from Airtable
async function getHwidRecord(hwid) {
    try {
        const table = getAirtableTable();
        const records = await table.select({
            filterByFormula: `{HWID} = '${hwid}'`,
            maxRecords: 1
        }).firstPage();

        return records.length > 0 ? records[0] : null;
    } catch (error) {
        return null;
    }
}

// Create new HWID record in Airtable
async function createHwidRecord(hwid, licenseKey) {
    try {
        const table = getAirtableTable();
        const record = await table.create([{
            fields: {
                HWID: hwid,
                Active: true,
                LicenseKey: licenseKey,
            },
        }]);
        return record[0];
    } catch (error) {
        return null;
    }
}

// Check if HWID is active for a license
async function isHwidActive(hwid, licenseKey, licenseType) {
    const record = await getHwidRecord(hwid);
    if (!record) {
        const table = getAirtableTable();
        const records = await table.select({
            filterByFormula: `AND({LicenseKey} = '${licenseKey}', {Active} = TRUE())`,
        }).firstPage();

        // Check limits based on tier
        let limit = 999;
        if (licenseType === 'STARTER') limit = 3;
        else if (licenseType === 'PRO') limit = 20;
        else if (licenseType === 'AGENCY') limit = 999;
        // Legacy support
        else if (licenseType === 'YEARLY') limit = 3;
        else if (licenseType === 'PERSONAL') limit = 3;
        else if (licenseType === 'BUSINESS') limit = 20;

        if (records.length >= limit) {
            return false;
        }

        const newRecord = await createHwidRecord(hwid, licenseKey);
        return !!newRecord;
    }

    return record.fields.Active;
}

module.exports = {
    getMachineHwid,
    getHwidRecord,
    createHwidRecord,
    isHwidActive
};

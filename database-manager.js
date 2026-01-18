/**
 * SQLite Database Manager
 * Replacement for Airtable - UNLIMITED & FREE
 * No API limits, no costs, completely local
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

class DatabaseManager {
    constructor() {
        const dbPath = path.join(__dirname, '..', 'data', 'fbpro.db');

        // Ensure data directory exists
        const dataDir = path.dirname(dbPath);
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }

        this.db = new Database(dbPath);
        this.db.pragma('journal_mode = WAL'); // Better performance

        this.initializeTables();
    }

    initializeTables() {
        // Create Licenses table
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS licenses (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                license_key TEXT UNIQUE NOT NULL,
                name TEXT,
                email TEXT,
                package_type TEXT,
                status TEXT DEFAULT 'active',
                expiry_date TEXT,
                max_devices INTEGER DEFAULT 3,
                max_accounts INTEGER DEFAULT 10,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Create HWID table
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS hwid (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                hwid TEXT UNIQUE NOT NULL,
                license_key TEXT NOT NULL,
                device_name TEXT,
                active INTEGER DEFAULT 1,
                registered_at TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (license_key) REFERENCES licenses(license_key)
            )
        `);

        // Create indexes for better performance
        this.db.exec(`
            CREATE INDEX IF NOT EXISTS idx_license_key ON licenses(license_key);
            CREATE INDEX IF NOT EXISTS idx_hwid ON hwid(hwid);
            CREATE INDEX IF NOT EXISTS idx_license_key_hwid ON hwid(license_key);
        `);

        console.log('[Database] Tables initialized');
    }

    // License operations
    getLicense(licenseKey) {
        const stmt = this.db.prepare('SELECT * FROM licenses WHERE license_key = ?');
        return stmt.get(licenseKey);
    }

    createLicense(data) {
        const stmt = this.db.prepare(`
            INSERT INTO licenses (license_key, name, email, package_type, status, expiry_date, max_devices, max_accounts)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);

        return stmt.run(
            data.licenseKey,
            data.name,
            data.email,
            data.packageType,
            data.status || 'active',
            data.expiryDate,
            data.maxDevices || 3,
            data.maxAccounts || 10
        );
    }

    updateLicense(licenseKey, data) {
        const fields = [];
        const values = [];

        if (data.status) {
            fields.push('status = ?');
            values.push(data.status);
        }
        if (data.expiryDate) {
            fields.push('expiry_date = ?');
            values.push(data.expiryDate);
        }

        fields.push('updated_at = CURRENT_TIMESTAMP');
        values.push(licenseKey);

        const stmt = this.db.prepare(`
            UPDATE licenses SET ${fields.join(', ')} WHERE license_key = ?
        `);

        return stmt.run(...values);
    }

    // HWID operations
    getHwidRecord(hwid) {
        const stmt = this.db.prepare('SELECT * FROM hwid WHERE hwid = ?');
        return stmt.get(hwid);
    }

    getHwidsByLicense(licenseKey) {
        const stmt = this.db.prepare('SELECT * FROM hwid WHERE license_key = ? AND active = 1');
        return stmt.all(licenseKey);
    }

    createHwidRecord(hwid, licenseKey, deviceName = null) {
        const stmt = this.db.prepare(`
            INSERT INTO hwid (hwid, license_key, device_name)
            VALUES (?, ?, ?)
        `);

        return stmt.run(hwid, licenseKey, deviceName);
    }

    deleteHwidRecord(hwid) {
        const stmt = this.db.prepare('UPDATE hwid SET active = 0 WHERE hwid = ?');
        return stmt.run(hwid);
    }

    // Utility functions
    getAllLicenses() {
        const stmt = this.db.prepare('SELECT * FROM licenses ORDER BY created_at DESC');
        return stmt.all();
    }

    searchLicenses(email) {
        const stmt = this.db.prepare('SELECT * FROM licenses WHERE email LIKE ?');
        return stmt.all(`%${email}%`);
    }

    // Statistics
    getStats() {
        const totalLicenses = this.db.prepare('SELECT COUNT(*) as count FROM licenses').get();
        const activeLicenses = this.db.prepare('SELECT COUNT(*) as count FROM licenses WHERE status = "active"').get();
        const totalDevices = this.db.prepare('SELECT COUNT(*) as count FROM hwid WHERE active = 1').get();

        return {
            totalLicenses: totalLicenses.count,
            activeLicenses: activeLicenses.count,
            totalDevices: totalDevices.count
        };
    }

    // Backup
    backup() {
        const backupPath = path.join(__dirname, '..', 'data', `backup_${Date.now()}.db`);
        this.db.backup(backupPath);
        console.log(`[Database] Backup created: ${backupPath}`);
        return backupPath;
    }

    close() {
        this.db.close();
    }
}

// Singleton instance
let instance = null;

function getDatabaseManager() {
    if (!instance) {
        instance = new DatabaseManager();
    }
    return instance;
}

module.exports = {
    DatabaseManager,
    getDatabaseManager
};

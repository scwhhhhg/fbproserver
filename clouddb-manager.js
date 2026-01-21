/**
 * CloudDB Manager (Obfuscated Supabase)
 * 
 * ⚠️ IMPORTANT - OBFUSCATION NOTES:
 * ==================================
 * This file manages Supabase but uses "CloudDB" terminology for obfuscation.
 * 
 * NAMING CONVENTIONS (DO NOT CHANGE):
 * - File: clouddb-manager.js (obfuscated name)
 * - Class: SupabaseManager (keep for code compatibility)
 * - Display: CloudDB (in logs and error messages)
 * - Vault Path: secret/clouddb (NOT secret/supabase)
 * - Env Vars: CLOUDDB_URL, CLOUDDB_SERVICE_KEY (NOT SUPABASE_*)
 * 
 * WHY OBFUSCATION:
 * - Hide technology stack from end users
 * - Make reverse engineering harder
 * - Generic naming for flexibility
 * 
 * VAULT STRUCTURE:
 * secret/clouddb {
 *   url: "https://xxx.supabase.co"
 *   key: "service_key_here"
 * }
 */

const { createClient } = require('@supabase/supabase-js');

/**
 * Supabase Manager (displayed as CloudDB to users)
 * Handles all database operations for licenses and HWID tracking
 */
class SupabaseManager {
    constructor() {
        this.client = null;
        this.enabled = false;
        this.initialized = false;
    }

    /**
     * Initialize CloudDB client
     * Uses hardcoded ANON_KEY for production (zero-config deployment)
     */
    async initialize() {
        if (this.initialized) return;

        // Hardcoded production credentials (ANON_KEY is safe to hardcode - RLS protected)
        const PRODUCTION_URL = 'https://cggkhpfyqwivqxzpdrnh.supabase.co';
        const PRODUCTION_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNnZ2tocGZ5cXdpdnF4enBkcm5oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYzMjQzNDMsImV4cCI6MjA4MTkwMDM0M30.DvHWJv0wbhI_LNVoJrMw70T3IC2g_irSNogN8Ff8FIo';

        // Use hardcoded values (with env var override for development)
        const clouddbUrl = process.env.CLOUDDB_URL || process.env.SUPABASE_URL || PRODUCTION_URL;
        const clouddbKey = process.env.CLOUDDB_ANON_KEY || process.env.SUPABASE_ANON_KEY || PRODUCTION_ANON_KEY;

        if (!clouddbUrl || !clouddbKey) {
            console.warn('[CloudDB] No credentials available');
            console.warn('[CloudDB] This should not happen - hardcoded credentials missing!');
            this.enabled = false;
            this.initialized = true;
            return;
        }

        this.client = createClient(clouddbUrl, clouddbKey);
        this.enabled = true;
        this.initialized = true;
        console.log('[CloudDB] Initialized successfully');
    }

    /**
     * Ensure initialized before any operation
     */
    async _ensureInitialized() {
        if (!this.initialized) {
            await this.initialize();
        }
        if (!this.enabled) {
            throw new Error('CloudDB not configured');
        }
    }

    /**
     * License Operations
     */
    async getLicense(licenseKey) {
        await this._ensureInitialized();

        const { data, error } = await this.client
            .from('licenses')
            .select('*')
            .eq('license_key', licenseKey)
            .single();

        if (error) {
            if (error.code === 'PGRST116') return null; // Not found
            throw error;
        }

        return data;
    }

    async createLicense(licenseData) {
        await this._ensureInitialized();

        const { data, error } = await this.client
            .from('licenses')
            .insert([licenseData])
            .select()
            .single();

        if (error) throw error;
        return data;
    }

    async updateLicense(licenseKey, updates) {
        await this._ensureInitialized();

        const { data, error } = await this.client
            .from('licenses')
            .update(updates)
            .eq('license_key', licenseKey)
            .select()
            .single();

        if (error) throw error;
        return data;
    }

    async deleteLicense(licenseKey) {
        await this._ensureInitialized();

        const { error } = await this.client
            .from('licenses')
            .delete()
            .eq('license_key', licenseKey);

        if (error) throw error;
        return true;
    }

    async getAllLicenses() {
        await this._ensureInitialized();

        const { data, error } = await this.client
            .from('licenses')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;
        return data || [];
    }

    async getActiveLicenses() {
        await this._ensureInitialized();

        const { data, error } = await this.client
            .from('licenses')
            .select('*')
            .eq('status', 'active')
            .order('created_at', { ascending: false });

        if (error) throw error;
        return data || [];
    }

    /**
     * HWID (Hardware ID) Operations
     */
    async getHwidRecord(hwid) {
        await this._ensureInitialized();

        const { data, error } = await this.client
            .from('hwid')
            .select('*')
            .eq('hwid', hwid)
            .single();

        if (error) {
            if (error.code === 'PGRST116') return null; // Not found
            throw error;
        }

        return data;
    }

    async getHwidsByLicense(licenseKey) {
        await this._ensureInitialized();

        const { data, error } = await this.client
            .from('hwid')
            .select('*')
            .eq('license_key', licenseKey)
            .eq('active', true);

        if (error) throw error;
        return data || [];
    }

    async createHwidRecord(hwid, licenseKey, deviceName = null) {
        if (!this.enabled) throw new Error('CloudDB not configured');

        const { data, error } = await this.client
            .from('hwid')
            .insert([{
                hwid: hwid,
                license_key: licenseKey,
                device_name: deviceName,
                active: true
            }])
            .select()
            .single();

        if (error) throw error;
        return data;
    }

    async updateHwidRecord(hwid, updates) {
        await this._ensureInitialized();

        const { data, error } = await this.client
            .from('hwid')
            .update(updates)
            .eq('hwid', hwid)
            .select()
            .single();

        if (error) throw error;
        return data;
    }

    async deactivateHwid(hwid) {
        return this.updateHwidRecord(hwid, { active: false });
    }

    async deleteHwidRecord(hwid) {
        await this._ensureInitialized();

        const { error } = await this.client
            .from('hwid')
            .delete()
            .eq('hwid', hwid);

        if (error) throw error;
        return true;
    }

    async getAllHwids() {
        await this._ensureInitialized();

        const { data, error } = await this.client
            .from('hwid')
            .select('*')
            .order('registered_at', { ascending: false });

        if (error) throw error;
        return data || [];
    }

    /**
     * Encryption Keys Operations
     * Get encryption keys from config table for decrypting bot scripts
     */
    async getEncryptionKeys() {
        await this._ensureInitialized();

        const { data, error } = await this.client
            .from('config')
            .select('value')
            .eq('key', 'encryption_keys')
            .single();

        if (error) {
            if (error.code === 'PGRST116') return null; // Not found
            throw error;
        }

        // data.value should be JSON: { key: "hex_string", iv: "hex_string" }
        if (data && data.value) {
            return {
                key: Buffer.from(data.value.key, 'hex'),
                iv: Buffer.from(data.value.iv, 'hex')
            };
        }

        return null;
    }

    /**
     * Statistics
     */
    async getLicenseStats() {
        await this._ensureInitialized();

        const { data, error } = await this.client
            .rpc('get_license_stats');

        if (error) throw error;
        return data;
    }
}

// Singleton instance
let instance = null;

/**
 * Get CloudDB Manager instance (singleton)
 * 
 * ⚠️ OBFUSCATION NOTE:
 * Function name uses "Supabase" for code compatibility
 * but displays as "CloudDB" to end users
 */
function getSupabaseManager() {
    if (!instance) {
        instance = new SupabaseManager();
    }
    return instance;
}

// Alias for obfuscated code compatibility
function getCloudDBManager() {
    return getSupabaseManager();
}

module.exports = {
    SupabaseManager,
    getSupabaseManager,
    getCloudDBManager  // Export both for compatibility
};

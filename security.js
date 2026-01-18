// =============================================================================
// SECURITY MANAGER - Anti-Debug, Integrity, Encryption
// =============================================================================

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

class SecurityManager {
    constructor() {
        this.debugCheckInterval = null;
        this.startTime = Date.now();
        this.lastCheck = Date.now();
        this.encryptionKey = process.env.SECURITY_KEY || 'fbpro-blaster-2026-secure';
    }

    // =============================================================================
    // ANTI-DEBUG PROTECTION
    // =============================================================================

    /**
     * Check for debugger presence
     */
    checkDebugger() {
        // Allow disabling for development/testing
        if (process.env.DISABLE_ANTI_DEBUG === 'true') {
            return;
        }

        // 1. Check execArgv for debug flags
        const debugFlags = ['--inspect', '--inspect-brk', '--debug', '--debug-brk', '--debug-port'];
        const hasDebugFlag = process.execArgv.some(arg =>
            debugFlags.some(flag => arg.includes(flag))
        );

        if (hasDebugFlag) {
            this._securityViolation('Debug mode detected');
        }

        // 2. Check if debugger is ACTIVELY attached (not just port defined)
        // Note: In Node v24+, debugPort is always defined (9229), so we skip this check
        // to avoid false positives. Debug flags check above is sufficient.
        // if (typeof process.debugPort !== 'undefined' && process.debugPort > 0) {
        //     this._securityViolation('Debugger port active');
        // }

        // 3. Timing-based detection (debugger makes execution slower)
        const now = Date.now();
        const timeSinceLastCheck = now - this.lastCheck;

        // If more than 2 seconds passed (should be ~5s interval), might be breakpoint
        if (timeSinceLastCheck > 7000 && this.lastCheck !== this.startTime) {
            this._securityViolation('Abnormal execution timing');
        }

        this.lastCheck = now;
    }

    /**
     * Start continuous anti-debug monitoring
     */
    startAntiDebug() {
        // Initial check
        this.checkDebugger();

        // Periodic check every 5 seconds
        this.debugCheckInterval = setInterval(() => {
            this.checkDebugger();
        }, 5000);

        // Prevent interval from keeping process alive unnecessarily
        if (this.debugCheckInterval.unref) {
            this.debugCheckInterval.unref();
        }
    }

    /**
     * Stop anti-debug monitoring
     */
    stopAntiDebug() {
        if (this.debugCheckInterval) {
            clearInterval(this.debugCheckInterval);
            this.debugCheckInterval = null;
        }
    }

    // =============================================================================
    // INTEGRITY VERIFICATION
    // =============================================================================

    /**
     * Verify file integrity using SHA256 hash
     */
    verifyIntegrity(filePath, expectedHash) {
        try {
            if (!fs.existsSync(filePath)) {
                this._securityViolation(`File not found: ${path.basename(filePath)}`);
            }

            const content = fs.readFileSync(filePath);
            const actualHash = crypto.createHash('sha256').update(content).digest('hex');

            if (actualHash !== expectedHash) {
                this._securityViolation(`Integrity violation: ${path.basename(filePath)}`);
            }

            return true;
        } catch (error) {
            this._securityViolation(`Integrity check error: ${error.message}`);
        }
    }

    /**
     * Load and verify integrity manifest
     */
    loadIntegrityManifest(manifestPath) {
        try {
            if (!fs.existsSync(manifestPath)) {
                console.warn('⚠️  Integrity manifest not found. Skipping verification.');
                return null;
            }

            const content = fs.readFileSync(manifestPath, 'utf8');
            return JSON.parse(content);
        } catch (error) {
            console.error('Failed to load integrity manifest:', error.message);
            return null;
        }
    }

    /**
     * Verify all files in manifest
     */
    verifyManifest(manifestPath) {
        const manifest = this.loadIntegrityManifest(manifestPath);
        if (!manifest) return false;

        const basePath = path.dirname(manifestPath);
        let verified = 0;

        for (const [file, hash] of Object.entries(manifest.files || {})) {
            const filePath = path.join(basePath, file);
            this.verifyIntegrity(filePath, hash);
            verified++;
        }

        return verified > 0;
    }

    // =============================================================================
    // STRING ENCRYPTION/DECRYPTION
    // =============================================================================

    /**
     * Encrypt sensitive string
     */
    encrypt(text) {
        try {
            const iv = crypto.randomBytes(16);
            const key = crypto.createHash('sha256').update(this.encryptionKey).digest();
            const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);

            let encrypted = cipher.update(text, 'utf8', 'hex');
            encrypted += cipher.final('hex');

            // Return IV + encrypted (IV needed for decryption)
            return iv.toString('hex') + ':' + encrypted;
        } catch (error) {
            throw new Error(`Encryption failed: ${error.message}`);
        }
    }

    /**
     * Decrypt encrypted string
     */
    decrypt(encrypted) {
        try {
            const parts = encrypted.split(':');
            if (parts.length !== 2) {
                throw new Error('Invalid encrypted format');
            }

            const iv = Buffer.from(parts[0], 'hex');
            const encryptedText = parts[1];
            const key = crypto.createHash('sha256').update(this.encryptionKey).digest();
            const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);

            let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
            decrypted += decipher.final('utf8');

            return decrypted;
        } catch (error) {
            throw new Error(`Decryption failed: ${error.message}`);
        }
    }

    /**
     * Helper to encrypt object properties
     */
    encryptObject(obj, keys) {
        const encrypted = { ...obj };
        for (const key of keys) {
            if (obj[key]) {
                encrypted[key] = this.encrypt(String(obj[key]));
            }
        }
        return encrypted;
    }

    /**
     * Helper to decrypt object properties
     */
    decryptObject(obj, keys) {
        const decrypted = { ...obj };
        for (const key of keys) {
            if (obj[key]) {
                try {
                    decrypted[key] = this.decrypt(obj[key]);
                } catch (error) {
                    // If decryption fails, might be plain text (backwards compatibility)
                    decrypted[key] = obj[key];
                }
            }
        }
        return decrypted;
    }

    // =============================================================================
    // CODE SPLITTING HELPERS
    // =============================================================================

    /**
     * Validate action with remote server (framework for future use)
     */
    async validateAction(action, params = {}) {
        // This is a placeholder for server-side validation
        // User can implement actual API call to validation server

        const validationEndpoint = process.env.VALIDATION_ENDPOINT;
        if (!validationEndpoint) {
            // If no endpoint configured, allow action (permissive mode)
            return { allowed: true };
        }

        try {
            // Example implementation (customize as needed)
            const response = await fetch(validationEndpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action,
                    params,
                    timestamp: Date.now(),
                    hwid: this._getHWID()
                })
            });

            return await response.json();
        } catch (error) {
            console.warn('Action validation failed, allowing by default:', error.message);
            return { allowed: true };
        }
    }

    // =============================================================================
    // PRIVATE HELPERS
    // =============================================================================

    _securityViolation(reason) {
        console.error('═══════════════════════════════════════════════════');
        console.error('🛡️  SECURITY VIOLATION DETECTED');
        console.error('═══════════════════════════════════════════════════');
        console.error(`Reason: ${reason}`);
        console.error('This application will now terminate.');
        console.error('═══════════════════════════════════════════════════');

        // Log to file if possible
        try {
            const logPath = path.join(__dirname, '../data/security.log');
            const logEntry = `[${new Date().toISOString()}] ${reason}\n`;
            fs.appendFileSync(logPath, logEntry);
        } catch (e) {
            // Ignore log errors
        }

        process.exit(1);
    }

    _getHWID() {
        try {
            const { machineIdSync } = require('node-machine-id');
            return machineIdSync();
        } catch (error) {
            return 'unknown';
        }
    }
}

// Export singleton instance
module.exports = new SecurityManager();

const crypto = require('crypto');

const PRODUCTION_KEY = '9dfcba7489ac7d654103c6e9d97d7466daa96738c6b306488e79a8f3f9e7c97a';
const PRODUCTION_IV = '077c6a622b823f8b65d97d7466daa968';
const encryptedHex = 'ff2f64c3f7525a0f8f15bc24afc9f7d637e52dbba0bea2a1d333e16946453d5c59e6ddfa21028870279dc02afff5117038a997a4a1d9677b56fbdd753c4e7584';

try {
    const key = Buffer.from(PRODUCTION_KEY, 'hex');
    const iv = Buffer.from(PRODUCTION_IV, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    console.log('Decrypted:', decrypted);
} catch (e) {
    console.error('Decryption failed:', e.message);
}

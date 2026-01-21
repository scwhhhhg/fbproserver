const https = require('https');

const secrets = ['fb-pro-secret-v2', 'PLACEHOLDER_SECRET', 'fbproblaster', 'scwhhhhg'];
const url = 'https://fbproblaster.scwhhhhg.workers.dev/script?name=autolike';

async function test() {
    for (const secret of secrets) {
        console.log(`Testing secret: ${secret}`);
        try {
            const result = await new Promise((resolve, reject) => {
                https.get(url, { headers: { 'X-FBPro-Auth': secret } }, (res) => {
                    let data = '';
                    res.on('data', d => data += d);
                    res.on('end', () => resolve({ code: res.statusCode, data }));
                }).on('error', reject);
            });
            console.log(`Result: ${result.code}`);
            if (result.code === 200) {
                console.log('✅ FOUND WORKING SECRET:', secret);
                return;
            }
        } catch (e) {
            console.log(`Error: ${e.message}`);
        }
    }
}

test();

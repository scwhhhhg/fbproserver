const bytenode = require('bytenode');
const fs = require('fs');
const path = require('path');

async function test() {
    console.log('Testing Bytecode Flow...');

    const testCode = 'console.log("HELLO FROM BYTECODE"); module.exports = { worked: true };';
    const testJs = path.join(__dirname, 'test_tmp.js');
    const testJsc = path.join(__dirname, 'test_tmp.jsc');

    fs.writeFileSync(testJs, testCode);

    console.log('Compiling...');
    bytenode.compileFile({
        filename: testJs,
        output: testJsc
    });

    console.log('Loading bytecode...');
    const result = require('./test_tmp.jsc');

    if (result.worked) {
        console.log('✅ Bytecode Load Successful');
    } else {
        console.log('❌ Bytecode Load Failed');
    }

    // Cleanup
    try {
        fs.unlinkSync(testJs);
        fs.unlinkSync(testJsc);
    } catch (e) { }
}

test().catch(console.error);

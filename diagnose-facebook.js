const { createStealthBrowser, dismissFacebookPopups } = require('./anti-detection');
const fs = require("fs").promises;
const path = require("path");

// Dynamic Base Path for Binary Support
const isCompiled = path.basename(process.execPath).endsWith('.exe') && !process.execPath.toLowerCase().includes('node.exe') && !process.execPath.toLowerCase().includes('bun.exe');
const basePath = isCompiled ? path.dirname(process.execPath) : __dirname;
const ACCOUNTS_DIR = path.join(basePath, isCompiled ? "./accounts" : "../accounts");

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function runDiagnose(accountId = 'JONI') {
    const cookiesPath = path.join(ACCOUNTS_DIR, accountId, "cookies.json");
    const artifactsDir = path.join(basePath, isCompiled ? "./artifacts" : "../artifacts", accountId);
    let browser;

    try {
        console.log(`\n=== FACEBOOK LOADING DIAGNOSTIC TOOL ===\n`);
        console.log(`Account: ${accountId}`);
        console.log(`This tool will help diagnose why Facebook is not loading properly.\n`);

        await fs.mkdir(artifactsDir, { recursive: true });

        // Load cookies
        const cookiesData = await fs.readFile(cookiesPath, "utf8");
        const cookies = JSON.parse(cookiesData).map(cookie => ({
            name: cookie.name,
            value: cookie.value,
            domain: cookie.domain || '.facebook.com',
            path: cookie.path || '/',
            httpOnly: !!cookie.httpOnly,
            secure: !!cookie.secure,
            sameSite: ['Strict', 'Lax', 'None'].includes(cookie.sameSite) ? cookie.sameSite : 'Lax'
        }));

        // Create browser with headless=false to see what's happening
        const stealthResult = await createStealthBrowser({
            headless: false,
            timeout: 90000
        }, accountId);

        browser = stealthResult.browser;
        const page = stealthResult.page;

        console.log(`✓ Browser launched`);
        await page.setCookie(...cookies);
        console.log(`✓ Loaded ${cookies.length} cookies`);

        // Navigate to Facebook
        console.log(`\n→ Navigating to Facebook...`);
        await page.goto('https://www.facebook.com/', {
            waitUntil: "domcontentloaded",
            timeout: 90000
        });

        console.log(`✓ Page loaded (domcontentloaded)`);

        // Take screenshot every 5 seconds and check page state
        for (let i = 0; i < 12; i++) {
            await delay(5000);

            const state = await page.evaluate(() => {
                return {
                    url: window.location.href,
                    title: document.title,
                    hasProgressBar: !!document.querySelector('[role="progressbar"]'),
                    hasArticles: document.querySelectorAll('div[role="article"]').length,
                    hasFeed: !!document.querySelector('div[role="feed"]'),
                    bodyTextLength: document.body.textContent.length,
                    hasLikeButtons: !!document.querySelector('div[role="button"][aria-label*="Like"], div[role="button"][aria-label*="Suka"]')
                };
            });

            console.log(`\n[${(i + 1) * 5}s] Page State:`);
            console.log(`  URL: ${state.url}`);
            console.log(`  Title: ${state.title}`);
            console.log(`  Loading Spinner: ${state.hasProgressBar ? '⚠️ YES (still loading)' : '✓ NO (loaded)'}`);
            console.log(`  Feed Element: ${state.hasFeed ? '✓ YES' : '❌ NO'}`);
            console.log(`  Articles: ${state.hasArticles}`);
            console.log(`  Like Buttons: ${state.hasLikeButtons ? '✓ YES' : '❌ NO'}`);
            console.log(`  Body Text Length: ${state.bodyTextLength} chars`);

            // Take screenshot
            const screenshot = path.join(artifactsDir, `diagnostic_${(i + 1) * 5}s.png`);
            await page.screenshot({ path: screenshot, fullPage: false });
            console.log(`  Screenshot: ${screenshot}`);

            // If feed is ready, break
            if (!state.hasProgressBar && state.hasFeed && state.hasArticles > 0) {
                console.log(`\n✅ Feed appears to be ready!`);
                break;
            }
        }

        // Dismiss popups
        console.log(`\n→ Dismissing popups...`);
        await dismissFacebookPopups(page, accountId);

        // Final state check
        console.log(`\n→ Final check after popup dismissal...`);
        await delay(3000);

        const finalState = await page.evaluate(() => {
            const articles = document.querySelectorAll('div[role="article"]');
            const likeButtons = [];

            articles.forEach((article, index) => {
                const likeBtn = article.querySelector('div[role="button"][aria-label*="Like"], div[role="button"][aria-label*="Suka"]');
                likeButtons.push({
                    postIndex: index,
                    found: !!likeBtn,
                    label: likeBtn ? likeBtn.getAttribute('aria-label') : null
                });
            });

            return {
                totalArticles: articles.length,
                likeButtons: likeButtons
            };
        });

        console.log(`\nFinal State:`);
        console.log(`  Total Articles: ${finalState.totalArticles}`);
        console.log(`  Like Buttons Found:`);
        finalState.likeButtons.forEach(btn => {
            console.log(`    Post ${btn.postIndex}: ${btn.found ? '✓ ' + btn.label : '❌ NOT FOUND'}`);
        });

        // Take final screenshot
        const finalScreenshot = path.join(artifactsDir, `diagnostic_final.png`);
        await page.screenshot({ path: finalScreenshot, fullPage: true });
        console.log(`\n✓ Final screenshot: ${finalScreenshot}`);

        console.log(`\n=== DIAGNOSTIC COMPLETE ===`);
        console.log(`\nPlease review the screenshots in: ${artifactsDir}`);
        console.log(`\nPress Ctrl+C to close the browser...`);

        // Keep browser open for manual inspection
        await delay(300000); // 5 minutes

    } catch (error) {
        console.error(`\n❌ Error:`, error.message);
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}

if (require.main === module) {
    runDiagnose(process.argv[2]);
}

module.exports = { runDiagnose };

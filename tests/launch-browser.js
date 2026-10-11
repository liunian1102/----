// 浏览器测试统一用这个启动浏览器:
// 环境变量 BROWSER_PATH 指定的可执行文件 → Edge(原开发机) → Playwright 自带 Chromium →
// PLAYWRIGHT_BROWSERS_PATH 里已装好的任一版本 Chromium(Playwright 版本与已装浏览器版本对不上时)
const fs = require('fs');
const path = require('path');

function installedChromiums() {
    const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
    if (!root || !fs.existsSync(root)) return [];
    const subs = { linux: ['chrome-linux/chrome', 'chrome-linux64/chrome'], darwin: ['chrome-mac/Chromium.app/Contents/MacOS/Chromium'], win32: ['chrome-win/chrome.exe'] }[process.platform] || [];
    return fs.readdirSync(root).filter(d => /^chromium-\d+$/.test(d)).sort().reverse()
        .flatMap(d => subs.map(s => path.join(root, d, s))).filter(p => fs.existsSync(p));
}

async function launchBrowser(chromium, opts = {}) {
    const tries = [];
    if (process.env.BROWSER_PATH) tries.push({ executablePath: process.env.BROWSER_PATH });
    tries.push({ channel: 'msedge' }, {});
    for (const p of installedChromiums()) tries.push({ executablePath: p });
    let last;
    for (const t of tries) {
        try { return await chromium.launch({ headless: true, ...opts, ...t }); } catch (e) { last = e; }
    }
    throw last;
}

// 测试截图输出目录(已在 .gitignore 里忽略,不会弄脏工作区)
launchBrowser.outDir = () => {
    const d = path.join(__dirname, 'output');
    fs.mkdirSync(d, { recursive: true });
    return d;
};

module.exports = launchBrowser;

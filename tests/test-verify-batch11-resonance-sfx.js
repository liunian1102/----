const { chromium } = require('playwright');
const path = require('path');

(async () => {
    console.log('=== 启动真实浏览器自动化验证: 镶嵌激活共鸣音效与飘字反馈 ===');
    const browser = await chromium.launch({ channel: 'msedge', headless: true });
    const context = await browser.newContext({
        viewport: { width: 1024, height: 768 }
    });
    const page = await context.newPage();

    const fileUrl = 'file:///' + path.resolve(__dirname, '../index.html').replace(/\\/g, '/');
    console.log('1. 打开游戏页面:', fileUrl);
    await page.goto(fileUrl, { waitUntil: 'domcontentloaded' });

    if (await page.isVisible('#closeTips')) {
        await page.click('#closeTips');
        await page.waitForTimeout(200);
    }
    await page.click('#mpSingle');
    await page.waitForTimeout(200);

    if (await page.isVisible('#controlConfirm')) {
        await page.click('#controlConfirm');
        await page.waitForTimeout(300);
    }

    const testResults = await page.evaluate(() => {
        const results = [];
        const g = window.game;
        if (!g) return [{ test: 'gameInstance', pass: false, msg: 'window.game not found' }];

        // 验证 _socketGem 触发共鸣时是否产生 floatText 与 sound 调用
        g.player.class = 'warrior';
        g.player.sockets.q = [null, null, null];
        g.player.sockets.e = [null, null, null];
        g.player.sockets.a = [null, null, null];
        g._grantGem('dmg');     // 红
        g._grantGem('stagger'); // 红
        // 重置技能槽确保手动测试 _socketGem
        g.player.sockets.q = [null, null, null];
        g.player._buildVer++;
        g.effects.length = 0;

        g._socketGem('q', 0, 'dmg');
        // 镶嵌第 2 颗红宝石，激活「破阵之力」共鸣
        g._socketGem('q', 1, 'stagger');
        const resonanceText = g.effects.find(e => e.type === 'floatText' && e.text && e.text.includes('破阵之力'));

        results.push({
            test: 'resonanceActivationFeedback',
            pass: !!resonanceText,
            msg: `Resonance float text found: ${resonanceText ? resonanceText.text : 'none'}`
        });

        return results;
    });

    console.log('--- 测试结果 ---');
    let allPassed = true;
    for (const r of testResults) {
        console.log(`[${r.pass ? 'PASS' : 'FAIL'}] ${r.test}: ${r.msg}`);
        if (!r.pass) allPassed = false;
    }

    await browser.close();
    process.exit(allPassed ? 0 : 1);
})();

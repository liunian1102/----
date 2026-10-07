const { chromium } = require('playwright');
const path = require('path');

(async () => {
    console.log('=== 启动真实浏览器自动化验证: 局外成就与星霓外观解锁 ===');
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

        // 1. 验证新成就 resonanceMaster 与 comboMaster 定义存在
        const achRes = ACHIEVEMENTS.find(a => a.id === 'resonanceMaster');
        const achCombo = ACHIEVEMENTS.find(a => a.id === 'comboMaster');
        const skinNebula = SKINS.find(s => s.id === 'nebula');

        results.push({
            test: 'achievementsAndSkinDefinitions',
            pass: !!(achRes && achCombo && skinNebula && skinNebula.need && skinNebula.need.ach === 'resonanceMaster'),
            msg: `achRes: ${!!achRes}, achCombo: ${!!achCombo}, skinNebula: ${!!skinNebula}`
        });

        // 2. 模拟共鸣达成后 _runStats 产出 resonanceCount 并成功触发成就
        g.player.class = 'warrior';
        g.player.sockets.q = [null, null, null];
        g._grantGem('dmg');     // 红
        g._grantGem('stagger'); // 红
        g._socketGem('q', 0, 'dmg');
        g._socketGem('q', 1, 'stagger');

        const stats = g._runStats();
        const hasResCount = stats.resonanceCount >= 1;
        const newAchs = Progress.checkAchievements(stats);
        const unlockedRes = newAchs.some(a => a.id === 'resonanceMaster');

        results.push({
            test: 'resonanceAchievementTrigger',
            pass: hasResCount && unlockedRes,
            msg: `resonanceCount: ${stats.resonanceCount}, unlockedRes: ${unlockedRes}`
        });

        // 3. 验证成就达成后「星霓」外观自动解锁
        const profile = Progress.load();
        const isNebulaUnlocked = Progress.skinUnlocked(skinNebula, profile);
        results.push({
            test: 'nebulaSkinUnlock',
            pass: isNebulaUnlocked,
            msg: `Nebula skin unlocked: ${isNebulaUnlocked}`
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

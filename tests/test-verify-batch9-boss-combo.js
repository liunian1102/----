const { chromium } = require('playwright');
const path = require('path');

(async () => {
    console.log('=== 启动真实浏览器自动化验证: 魔王前摇调优与连杀强化反馈 ===');
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

        // 1. 验证魔王出招前摇时长已调优（更合理的躲避反应窗口）
        g._spawnBoss();
        g.boss.atk = null;
        g.boss.atkCD = 0;
        const target = g._bossTarget();
        g._updateBossAttacks(target);
        const curAtk = g.boss.atk;
        const curDur = g.boss.atkDur;
        const durTable = { charge: 0.95, ring: 0.8, slam: 1.1, laser: 1.15, summon: 1.0, cross: 1.3 };
        const expectedBase = durTable[curAtk];
        results.push({
            test: 'bossTelegraphDuration',
            pass: !!(curAtk && curDur >= expectedBase * 0.95),
            msg: `Boss Atk: ${curAtk}, Telegraph Dur: ${curDur} (Expected >= ${expectedBase})`
        });

        // 2. 验证连杀 Combo 里程碑强化顿帧与震颤
        g.player.combo = 9;
        g.player.comboTimer = 3;
        g.hitStop = 0;
        g.screenShake = 0;
        const dummy = new Enemy(100, 100, 'chaser', 1);
        dummy.currentHealth = 0;
        g._registerCombo(dummy); // 达成 10 连杀里程碑
        results.push({
            test: 'comboMilestoneFeedback',
            pass: g.player.combo === 10 && g.hitStop > 0 && g.screenShake > 0,
            msg: `Combo: ${g.player.combo}, hitStop: ${g.hitStop}, screenShake: ${g.screenShake}`
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

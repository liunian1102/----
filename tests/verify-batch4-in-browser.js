const { chromium } = require('playwright');
const assert = require('assert');

(async () => {
    console.log('=== 启动真实 Edge 浏览器第四批缺陷实机联调验证 (Batch 4) ===\n');

    const browser = await chromium.launch({ channel: 'msedge', headless: true });
    const context = await browser.newContext({
        viewport: { width: 844, height: 390 },
        deviceScaleFactor: 2,
        hasTouch: true
    });
    const page = await context.newPage();

    let pageErrorCount = 0;
    page.on('pageerror', err => {
        pageErrorCount++;
        console.error('   [运行时错误]:', err.message);
    });

    await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(400);
    if (await page.isVisible('#closeTips')) await page.click('#closeTips');

    // -------------------------------------------------------------
    // 实机 1: Bug 17 验证 (深渊爬塔模式开局保护与传送门生成)
    // -------------------------------------------------------------
    console.log('1. 验证深渊模式开局保留 diffMode="abyss" 与传送门生成...');
    const abyssCheck = await page.evaluate(() => {
        const g = window.game;
        g.diffMode = 'abyss';
        g.startGame();

        // 模拟击杀足够小怪触发传送门
        g.abyssKillsThisFloor = 16;
        g.enemies = [];
        g.boss = null;
        g.bossState = 'idle';
        g._updateAbyssMode();
        g.render();

        const portal = g.abyssPortal;
        return {
            diffMode: g.diffMode,
            hasPortal: !!portal,
            floor: g.abyssFloor
        };
    });

    console.log('   深渊实机检测结果:', abyssCheck);
    assert.strictEqual(abyssCheck.diffMode, 'abyss', '【Bug 17 验证】深渊模式开局 diffMode 必须保留为 "abyss"');
    assert.strictEqual(abyssCheck.hasPortal, true, '【Bug 17 验证】达成目标击杀数后必须生成深渊传送门');
    console.log('✓ 【Bug 17 验证】深渊爬塔开局难度未被覆写，折跃传送门正常生成！\n');

    // -------------------------------------------------------------
    // 实机 2: Bug 18 验证 (暗金遗物【雷神指环】天雷轰顶即时触发)
    // -------------------------------------------------------------
    console.log('2. 验证暗金遗物【雷神指环】第 3 次命中天雷轰顶特效与打击...');
    const thunderCheck = await page.evaluate(() => {
        const g = window.game;
        const p = g.player;
        p.relics = ['thunder_ring'];
        p._relicThunderCount = 0;
        p._relicThunderActive = false;

        const dummyEnemy = new Enemy(p.x + 40, p.y, 'chaser', 1);
        g.enemies = [dummyEnemy];

        const effectsBefore = g.effects.length;
        // 模拟连续命中 3 次
        g._applyHitMods(p, dummyEnemy, 20);
        g._applyHitMods(p, dummyEnemy, 20);
        g._applyHitMods(p, dummyEnemy, 20);

        g.render();

        const effectsAfter = g.effects.length;
        const hasLightning = g.effects.some(e => e.type === 'lightning');
        const hasShockwave = g.effects.some(e => e.type === 'shockwave' && e.color === '#ffe14d');

        return {
            effectsBefore,
            effectsAfter,
            hasLightning,
            hasShockwave,
            relicCount: p._relicThunderCount
        };
    });

    console.log('   雷神指环实机检测结果:', thunderCheck);
    assert.ok(thunderCheck.effectsAfter > thunderCheck.effectsBefore, '【Bug 18 验证】第 3 次命中必须即时产生天雷特效');
    assert.strictEqual(thunderCheck.hasLightning, true, '【Bug 18 验证】必须生成天雷闪电 (lightning)');
    assert.strictEqual(thunderCheck.hasShockwave, true, '【Bug 18 验证】必须生成天雷震波 (shockwave)');
    console.log('✓ 【Bug 18 验证】暗金遗物【雷神指环】第 3 次命中天雷轰顶即时范围打击与特效生效！\n');

    assert.strictEqual(pageErrorCount, 0, '全程绝对不可发生任何未捕获 JavaScript 异常');
    await browser.close();

    console.log('========================================================');
    console.log('=== 第四批缺陷真实 Edge 浏览器实机联调 100% 验证通过！ ===');
    console.log('========================================================\n');
})().catch(err => {
    console.error('实机联调测试失败:', err);
    process.exit(1);
});

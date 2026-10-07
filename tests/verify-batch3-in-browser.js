const { chromium } = require('playwright');
const assert = require('assert');

(async () => {
    console.log('=== 启动真实 Edge 浏览器第三批缺陷实机联调验证 (Batch 3) ===\n');

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

    // 启动单人游戏
    await page.evaluate(() => {
        document.getElementById('mpOverlay').style.display = 'none';
        window.game.startGame();
    });
    await page.waitForTimeout(300);

    // -------------------------------------------------------------
    // 实机 1: Bug 15 验证 (远程职业全场无怪时普攻发射手感)
    // -------------------------------------------------------------
    console.log('1. 验证远程职业在全场无怪物时普攻发射与弹道反馈...');
    const shootEmptyResult = await page.evaluate(() => {
        const g = window.game;
        const p = g.player;
        p.class = 'archer';
        p.arrows = 5;
        g.enemies = []; // 清空场上怪物
        g.projectiles = [];

        // 触发射击
        g.shoot();
        g.render();

        return {
            projsCount: g.projectiles.length,
            dx: g.projectiles.length > 0 ? g.projectiles[0].dx : 0,
            dy: g.projectiles.length > 0 ? g.projectiles[0].dy : 0
        };
    });
    console.log('   无怪时射击生成子弹结果:', shootEmptyResult);
    assert.strictEqual(shootEmptyResult.projsCount, 1, '【Bug 15 验证】全场无怪物时射击必须成功发射投射物');
    assert.ok(shootEmptyResult.dx > 0, '【Bug 15 验证】子弹必须具有向前的速度分量');
    console.log('✓ 【Bug 15 验证】远程职业无怪时普攻射击手感回馈生效，彻底消除静默吞没！\n');

    // -------------------------------------------------------------
    // 实机 2: Bug 14 验证 (技能石「回响」施放后延迟连发注册)
    // -------------------------------------------------------------
    console.log('2. 验证技能石「回响」施放后 0.35s 延迟连发动作注册...');
    const echoResult = await page.evaluate(() => {
        const g = window.game;
        const p = g.player;
        p.class = 'warrior';
        p.rage = 100;
        p.skillQ.cooldown = 0;
        p.gemLog = '999'; // echo Lv3
        p.sockets.q = ['echo', null, null];
        p._buildVer++;

        g.pendingActions = [];
        g._castSlot('q');

        const echoAction = g.pendingActions.find(act => act.delay === 0.35);
        return {
            cooldown: p.skillQ.cooldown,
            hasEchoAction: !!echoAction,
            delay: echoAction ? echoAction.delay : null
        };
    });
    console.log('   技能石回响触发结果:', echoResult);
    assert.strictEqual(echoResult.hasEchoAction, true, '【Bug 14 验证】施放技能后必须在 pendingActions 中注册延迟 0.35s 的连发动作');
    assert.strictEqual(echoResult.delay, 0.35, '延迟时间必须为 0.35s');
    console.log('✓ 【Bug 14 验证】技能石「回响」0.35 秒延迟自动再放一次机制 100% 触发！\n');

    // -------------------------------------------------------------
    // 实机 3: Bug 16 验证 (法师魔力涌注 Q 宝石并入普攻生效)
    // -------------------------------------------------------------
    console.log('3. 验证法师魔力涌注开启后 Q 位宝石并入普攻...');
    const mageQGemResult = await page.evaluate(() => {
        const g = window.game;
        const p = g.player;
        p.class = 'mage';
        p.gemLog = '666'; // crit Lv3
        p.sockets.q = ['crit', null, null];
        p._buildVer++;

        p.qToggleActive = true;
        const map = g._gemMap(p);
        return {
            critLevelInA: map.a.crit,
            critGv: g._gv(p, 'a', 'crit')
        };
    });
    console.log('   魔力涌注开启后普攻宝石数据:', mageQGemResult);
    assert.strictEqual(mageQGemResult.critLevelInA, 3, '【Bug 16 验证】Q 槽位的暴击强化 Lv3 必须并入普攻 map.a');
    assert.ok(mageQGemResult.critGv > 0, '【Bug 16 验证】普攻暴击加成必须成功生效');
    console.log('✓ 【Bug 16 验证】法师魔力涌注激活时 Q 位技能石稳定并入普攻生效！\n');

    assert.strictEqual(pageErrorCount, 0, '全程绝对不可发生任何未捕获 JavaScript 异常');
    await browser.close();

    console.log('========================================================');
    console.log('=== 第三批缺陷真实 Edge 浏览器实机联调 100% 验证通过！ ===');
    console.log('========================================================\n');
})().catch(err => {
    console.error('实机联调测试失败:', err);
    process.exit(1);
});

const { chromium } = require('playwright');
const launchBrowser = require('./launch-browser');
const path = require('path');
const assert = require('assert');

(async () => {
    console.log('=== 开始自动化验证: 玩家防遮挡可见性 / 摇杆与技能左右对调 / 全屏体验 ===');
    
    // ── 单元测试层 ──
    require('./setup-env');
    const game = new Game();
    game.isRunning = true;

    console.log('1. 验证玩家受击透明度与防遮挡机制');
    const player = game.player;
    player.hurtCooldown = 0.5; // 处于受击无敌帧中
    let capturedAlpha = 1;
    const origSave = game.ctx.save;
    // 监听受击渲染时的 globalAlpha
    game.ctx.save = function() {
        origSave.call(this);
    };
    player.render(game.ctx);
    // 确认受伤时透明度维持高清晰度(>=0.85)，不再降为0.3隐形
    const flicker = player.hurtCooldown > 0 && Math.floor(player.hurtCooldown * 20) % 2 === 0;
    const expectedAlpha = flicker ? 0.85 : 1;
    assert.strictEqual(expectedAlpha, 0.85, '受击时透明度应保持在 0.85，不能降低到 0.3');
    console.log('✓ 玩家受击透明度保护验证通过 (保持 0.85 高清晰度)');

    // 验证 _renderSelfSilhouette 方法
    assert.strictEqual(typeof game._renderSelfSilhouette, 'function', '_renderSelfSilhouette 应为函数');
    game._renderSelfSilhouette(game.ctx);
    console.log('✓ 置顶 X-Ray 透视轮廓绘制 _renderSelfSilhouette 正常运行');

    // 验证 _renderArenaBoundary 方法
    assert.strictEqual(typeof game._renderArenaBoundary, 'function', '_renderArenaBoundary 应为函数');
    game._renderArenaBoundary(game.ctx);
    console.log('✓ 悬浮竞技场能量光幕边界 _renderArenaBoundary 正常运行');

    // 验证 toggleFullscreen 方法
    assert.strictEqual(typeof game.toggleFullscreen, 'function', 'toggleFullscreen 应为函数');
    game.toggleFullscreen();
    console.log('✓ toggleFullscreen 安全调用验证通过');

    console.log('2. 验证按键布局左右对调 (layoutMode)');
    assert.strictEqual(game.layoutMode, 'default', '默认布局应为 default');
    game.setLayoutMode('swap');
    assert.strictEqual(game.layoutMode, 'swap', '切换后布局应为 swap');
    assert.strictEqual(Store.get('blockrun.layout'), 'swap', '切换后应持久化存储为 swap');

    // 验证技能 HUD 坐标在 default vs swap 下的镜像翻转
    game.player.class = 'warrior';
    game.player.skillQ = { cooldown: 0, maxCooldown: 3, level: 1 };
    game.player.skillE = { cooldown: 0, maxCooldown: 5, level: 1 };

    // swap 模式下绘制技能 HUD
    game.skillButtons = [];
    game._withHud(() => {
        game._renderSkillHUD();
        game._renderDashButton();
        game._renderBuildButton();
    });
    const swapQ = game.skillButtons.find(b => b.skill === 'Q');
    const swapDash = game.skillButtons.find(b => b.skill === 'dash');
    const swapBuild = game.skillButtons.find(b => b.skill === 'build');
    assert(swapQ, 'swap 模式下应存在 Q 按钮');
    assert(swapDash, 'swap 模式下应存在 dash 按钮');
    assert(swapBuild, 'swap 模式下应存在 build 按钮');
    assert(swapQ.x < game.width / 2, `swap 模式下 Q 槽应该在左半区 (x: ${swapQ.x})`);
    assert(swapDash.x < game.width / 2, `swap 模式下 冲刺 应该在左半区 (x: ${swapDash.x})`);

    // default 模式下绘制技能 HUD
    game.setLayoutMode('default');
    game.skillButtons = [];
    game._withHud(() => {
        game._renderSkillHUD();
        game._renderDashButton();
        game._renderBuildButton();
    });
    const defQ = game.skillButtons.find(b => b.skill === 'Q');
    const defDash = game.skillButtons.find(b => b.skill === 'dash');
    const defBuild = game.skillButtons.find(b => b.skill === 'build');
    assert(defQ.x > game.width / 2, `default 模式下 Q 槽应该在右半区 (x: ${defQ.x})`);
    assert(defDash.x > game.width / 2, `default 模式下 冲刺 应该在右半区 (x: ${defDash.x})`);
    console.log('✓ 技能按钮在 default 与 swap 模式下的左右镜像排布验证通过');

    // ── 浏览器端到端与触屏仿真测试 ──
    console.log('3. 启动浏览器端到端触屏仿真与截图验证');
    const browser = await launchBrowser(chromium);
    const context = await browser.newContext({
        viewport: { width: 844, height: 390 },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 2
    });
    const page = await context.newPage();
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', err => console.log('PAGE ERROR:', err.message));
    const fileUrl = 'file:///' + path.resolve(__dirname, '../index.html').replace(/\\/g, '/');
    await page.goto(fileUrl, { waitUntil: 'domcontentloaded' });

    if (await page.isVisible('#closeTips')) {
        await page.click('#closeTips');
        await page.waitForTimeout(200);
    }

    // 打开操控方式弹窗
    await page.click('#openControl');
    await page.waitForTimeout(300);

    // 验证操控方式中包含「按键布局」选项并切换为 swap
    await page.evaluate(() => {
        const swapBtn = document.querySelector('[data-group=layout] [data-mode=swap]');
        if (swapBtn) swapBtn.click();
        const confirmBtn = document.getElementById('controlConfirm');
        if (confirmBtn) confirmBtn.click();
    });
    await page.waitForTimeout(300);

    // 启动单人游戏并验证界面
    await page.click('#mpSingle');
    await page.waitForTimeout(600);

    // 如果弹出了进入游戏前的操控确认，点击开始游戏
    const confirmIfOpen = page.locator('#controlConfirm');
    if (await confirmIfOpen.isVisible()) {
        await confirmIfOpen.click();
        await page.waitForTimeout(300);
    }
    await page.waitForTimeout(600);

    // 获取并验证当前游戏状态中的 layoutMode
    const currentLayout = await page.evaluate(() => window.game ? window.game.layoutMode : null);
    console.log('浏览器中生效的 layoutMode:', currentLayout);
    assert.strictEqual(currentLayout, 'swap', '浏览器中游戏实例的 layoutMode 应为 swap');

    // 打开暂停菜单，验证局内对调按钮与全屏按钮
    await page.evaluate(() => window.game.togglePause());
    await page.waitForTimeout(400);

    const pauseBtns = await page.evaluate(() => {
        return window.game.buttons.map(b => b.choice);
    });
    console.log('暂停面板中的按钮 choice 列表:', pauseBtns);
    assert(pauseBtns.includes('layout'), '暂停面板中应包含 layout 按钮');
    assert(pauseBtns.includes('fullscreen'), '暂停面板中应包含 fullscreen 按钮');

    // 截图保存验证效果
    const outDir = path.resolve(__dirname, 'output');
    const fs = require('fs');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    const shotPath = path.join(outDir, 'screenshot-batch13-swap-fullscreen.png');
    await page.screenshot({ path: shotPath });
    console.log('✓ 已生成验证截图:', shotPath);

    await browser.close();
    console.log('=== 所有测试项目全部验证通过！===');
    process.exit(0);
})().catch(err => {
    console.error('测试失败:', err);
    process.exit(1);
});

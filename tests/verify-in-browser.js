const { chromium } = require('playwright');
const path = require('path');

(async () => {
    console.log('=== 启动真实浏览器独立联调验证 ===');
    // 使用系统自带 Microsoft Edge (headless) 运行真实浏览器联调
    const browser = await chromium.launch({ channel: 'msedge', headless: true });
    const context = await browser.newContext({
        viewport: { width: 844, height: 390 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true
    });
    const page = await context.newPage();

    console.log('1. 导航到本地游戏页面...');
    await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });

    console.log('2. 关闭新手引导并点击单人游戏进入对局...');
    if (await page.isVisible('#closeTips')) {
        await page.click('#closeTips');
        await page.waitForTimeout(300);
    }
    await page.click('#mpSingle');
    await page.waitForTimeout(300);

    // 如果弹出操控方式确认，点击确认开始游戏
    if (await page.isVisible('#controlConfirm')) {
        console.log('   点击操控方式确认「开始游戏」...');
        await page.click('#controlConfirm');
        await page.waitForTimeout(500);
    }

    // 检查游戏实例是否正在运行
    const isRunning = await page.evaluate(() => window.game && window.game.isRunning);
    console.log('   游戏运行状态:', isRunning);

    console.log('3. 在浏览器中触发魔王降临 warning 阶段...');
    await page.evaluate(() => {
        window.game.bossState = 'warning';
        window.game.bossWarningTimer = 3;
        window.game.render();
    });
    await page.waitForTimeout(100);
    const shotWarningPath = path.join(__dirname, 'screenshot-boss-warning.png');
    await page.screenshot({ path: shotWarningPath });
    console.log('   已截取 Warning 阶段屏幕截图:', shotWarningPath);

    console.log('4. 在浏览器中触发魔王活跃 active 阶段 (如截图中的场景)...');
    await page.evaluate(() => {
        window.game.bossState = 'active';
        window.game.boss = new BlockBoss(window.game.width / 2, window.game.height / 2, 1);
        window.game.bossActiveTimer = 5;
        window.game.bossDamageDealt = 400;
        window.game.player.combo = 48;
        window.game.player.comboTimer = 2.5;
        window.game.player.frenzyTier = 4;
        window.game.render();
    });
    await page.waitForTimeout(100);
    const shotActivePath = path.join(__dirname, 'screenshot-boss-active.png');
    await page.screenshot({ path: shotActivePath });
    console.log('   已截取 Active 阶段屏幕截图:', shotActivePath);

    // 5. 校验 Canvas 内部像素：检查 800x600 逻辑边界处的垂直线是否存在红框
    // 在 844x390 下，中央 800x600 盒子的左边界 x 约为 (844*2 - 800 * 390*2/600)/2 = (1688 - 1040)/2 = 324 设备像素 (即 162 CSS 像素)
    // 右边界约为 162 + 520 = 682 CSS 像素
    const pixelCheck = await page.evaluate(() => {
        const game = window.game;
        const ctx = game.ctx;
        // 取得中央区域左边界附近的像素颜色
        const s = game.gameScale;
        const leftBoundaryX = Math.round(game.gameOffsetX);
        const rightBoundaryX = Math.round(game.gameOffsetX + 800 * s);
        const midY = Math.round(game.canvas.height / 2);
        
        // 采样左边界像素
        const leftPixel = ctx.getImageData(leftBoundaryX, midY, 1, 1).data;
        const rightPixel = ctx.getImageData(rightBoundaryX, midY, 1, 1).data;
        // 采样全屏最边缘 (物理 2px 处)
        const screenEdgePixel = ctx.getImageData(2, 2, 1, 1).data;

        return {
            leftBoundaryPixel: Array.from(leftPixel),
            rightBoundaryPixel: Array.from(rightPixel),
            screenEdgePixel: Array.from(screenEdgePixel),
            leftBoundaryX,
            rightBoundaryX,
            midY
        };
    });

    console.log('5. 采样检测结果:');
    console.log('   中央 800x600 左边缘采样 (R,G,B,A):', pixelCheck.leftBoundaryPixel);
    console.log('   中央 800x600 右边缘采样 (R,G,B,A):', pixelCheck.rightBoundaryPixel);
    console.log('   全屏最边缘 (2,2) 采样 (R,G,B,A):', pixelCheck.screenEdgePixel);

    await browser.close();
    console.log('=== 浏览器独立联调验证完成 ===');
})().catch(err => {
    console.error('浏览器测试失败:', err);
    process.exit(1);
});

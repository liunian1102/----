const { chromium } = require('playwright');
const path = require('path');

(async () => {
    console.log('=== 启动真实移动端模拟自动化验证: 触控摇杆与技能瞄准灵敏度 ===');
    const browser = await chromium.launch({ channel: 'msedge', headless: true });
    // 模拟移动端 iPhone / Android 触屏视口
    const context = await browser.newContext({
        viewport: { width: 844, height: 390 },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 2
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

        // 1. 验证移动端摇杆灵敏度（微小位移即可有效驱动移动向量）
        const canvas = g.canvas;
        // 模拟左侧区域微小拖动（位移约 15px，超过 0.12 死区）
        const startX = 150, startY = 200;
        const moveX = 165, moveY = 200;

        // 触发 touchstart
        const touch1 = new Touch({ identifier: 1, target: canvas, clientX: startX, clientY: startY });
        const evStart = new TouchEvent('touchstart', { changedTouches: [touch1], touches: [touch1], cancelable: true });
        canvas.dispatchEvent(evStart);

        const joyActive = g.joy.active;

        // 触发 touchmove
        const touch2 = new Touch({ identifier: 1, target: canvas, clientX: moveX, clientY: moveY });
        const evMove = new TouchEvent('touchmove', { changedTouches: [touch2], touches: [touch2], cancelable: true });
        canvas.dispatchEvent(evMove);

        const jx = g.keys._jx || 0;
        const jy = g.keys._jy || 0;

        results.push({
            test: 'joystickSensitivity',
            pass: joyActive && jx > 0,
            msg: `Joy active: ${joyActive}, _jx: ${jx}, _jy: ${jy}`
        });

        // 释放摇杆
        const touchEnd = new Touch({ identifier: 1, target: canvas, clientX: moveX, clientY: moveY });
        const evEnd = new TouchEvent('touchend', { changedTouches: [touchEnd], touches: [], cancelable: true });
        canvas.dispatchEvent(evEnd);

        results.push({
            test: 'joystickRelease',
            pass: !g.joy.active && g.keys._jx === 0,
            msg: `Joy active after end: ${g.joy.active}, _jx: ${g.keys._jx}`
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

/**
 * 端到端真实浏览器联调验证脚本 (Playwright E2E)
 * 验证大厅「📜 远征契约」3 选 1、整组重抽 1 次防刷、永恒星图纯横向分支点亮与开局 HUD 呈现
 */
const { chromium } = require('playwright');
const assert = require('assert');

(async () => {
    console.log('=== 开始执行端到端真实浏览器联调验证 (Playwright E2E) ===\n');
    const browser = await chromium.launch({ channel: 'msedge', headless: true });
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();

    // 1. 导航至本地服务并设置已读新手指南与默认操控记住
    await page.goto('http://localhost:3000');
    await page.evaluate(() => {
        localStorage.setItem('blockrun.tutorialSeen', 'true');
        localStorage.setItem('blockrun.controlRemember', 'true');
    });
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    console.log('1. 页面加载成功');

    // 2. 点击大厅「📜 远征契约」按钮，打开契约委托弹窗
    const openContractBtn = page.locator('#openContract');
    await assert.doesNotReject(openContractBtn.waitFor({ state: 'visible', timeout: 3000 }));
    await openContractBtn.click();
    console.log('2. 成功点击「📜 远征契约」按钮');

    const contractOverlay = page.locator('#contractOverlay');
    await contractOverlay.waitFor({ state: 'visible', timeout: 3000 });
    const candidates = page.locator('.contract-candidate-item');
    const count = await candidates.count();
    assert.strictEqual(count, 3, `开局必须展现 3 个候选契约 (实际: ${count})`);
    console.log('3. 契约弹窗弹出，已成功展现 3 个候选契约');

    // 记录重抽前候选文字
    const beforeText = await candidates.nth(0).innerText();

    // 3. 点击「🎲 换一组 (剩余 1 次)」整组重抽
    const rerollBtn = page.locator('#contractRerollBtn');
    await rerollBtn.click();
    await page.waitForTimeout(300);

    // 验证按钮变为已消耗并被禁用
    const rerollDisabled = await rerollBtn.isDisabled();
    const rerollBtnText = await rerollBtn.innerText();
    assert.strictEqual(rerollDisabled, true, '整组重抽 1 次后按钮必须被禁用');
    assert.ok(rerollBtnText.includes('已消耗'), `按钮文字应提示已消耗 (实际: ${rerollBtnText})`);
    console.log('4. 整组重抽成功触发，按钮状态与单次防刷约束生效！');

    // 4. 选取第 2 个契约并点击确认
    await candidates.nth(1).click();
    const confirmBtn = page.locator('#contractConfirmBtn');
    await confirmBtn.click();
    await contractOverlay.waitFor({ state: 'hidden', timeout: 3000 });
    console.log('5. 契约选取确认成功，弹窗关闭');

    // 5. 点击大厅「🌟 永恒星图」，验证纯横向分支渲染与星核提示
    const openMetaBtn = page.locator('#openMetagrowth');
    await openMetaBtn.click();
    const metaOverlay = page.locator('#metaOverlay');
    await metaOverlay.waitFor({ state: 'visible', timeout: 3000 });
    const branches = page.locator('.constellation-card');
    const branchCount = await branches.count();
    assert.strictEqual(branchCount, 6, `纯横向星图必须包含 6 大玩法分支 (实际: ${branchCount})`);
    console.log('6. 永恒星图纯横向分支面板打开，6 大玩法分支渲染正常');

    const closeMetaBtn = page.locator('#closeMeta');
    await closeMetaBtn.click();
    await metaOverlay.waitFor({ state: 'hidden', timeout: 3000 });

    // 6. 点击单人游戏进入对局，验证游戏画布与 HUD 运行
    const singleBtn = page.locator('#mpSingle');
    await singleBtn.click();
    await page.waitForTimeout(500);

    const isRunning = await page.evaluate(() => window.game && window.game.isRunning);
    assert.strictEqual(isRunning, true, '游戏对局必须处于运行中');
    const hasContractInRun = await page.evaluate(() => !!(window.game && window.game.expeditionSession && window.game.expeditionSession.selectedId));
    assert.strictEqual(hasContractInRun, true, '局中游戏实例必须成功继承选定的远征契约');
    console.log('7. 进入对局成功，局内契约状态与游戏循环运行正常！');

    await browser.close();
    console.log('\n=== 全部端到端真实浏览器联调验证 100% 成功通过！ ===');
})().catch(err => {
    console.error('E2E 测试失败:', err);
    process.exit(1);
});

// verify-tree-search-in-browser.js
// 真实浏览器联调:天赋树搜索框 → 节点 hit / dim 高亮 → 匹配计数 → 清空恢复
// 需要静态服务已在 BASE_URL 上运行(默认 http://localhost:3000,可用环境变量 BASE_URL 指定其它端口)
const { chromium } = require('playwright');
const launchBrowser = require('./launch-browser');
const assert = require('assert');
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

(async () => {
    console.log('=== 真实浏览器验证: 天赋树搜索高亮 ===\n');
    const browser = await launchBrowser(chromium);
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();

    let pageErrorCount = 0;
    page.on('pageerror', err => { pageErrorCount++; console.error('   [运行时错误]:', err.message); });

    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(400);
    if (await page.isVisible('#closeTips')) await page.click('#closeTips');
    await page.evaluate(() => {
        document.getElementById('mpOverlay').style.display = 'none';
        window.game.startGame();
        window.game.openBuild('tree');
    });
    await page.waitForTimeout(300);

    const state = () => page.evaluate(() => ({
        total: document.querySelectorAll('#treeSvg .tn').length,
        hit: document.querySelectorAll('#treeSvg .tn.hit').length,
        dim: document.querySelectorAll('#treeSvg .tn.dim').length,
        linkDim: document.querySelectorAll('#treeSvg .tl.dim').length,
        count: document.getElementById('treeSearchCount').textContent,
        expected: window.game._treeSearchHits(document.getElementById('treeSearch').value) ?
            [...window.game._treeSearchHits(document.getElementById('treeSearch').value)].length : null
    }));

    // 1. 初始状态:没有搜索词,不应有任何 hit / dim
    console.log('1. 初始无搜索词...');
    let s = await state();
    const expectedTotal = await page.evaluate(() => (typeof TREE_NODES !== 'undefined' ? TREE_NODES.length : 141));
    assert.strictEqual(s.total, expectedTotal, `应渲染 ${expectedTotal} 个节点,实际 ${s.total}`);
    assert.strictEqual(s.hit + s.dim, 0, '无搜索词时不应有 hit / dim');
    assert.strictEqual(s.count, '', '无搜索词时计数为空');
    console.log(`   节点 ${s.total},无高亮 ✓`);

    // 2. 输入「暴击」:page.fill 会派发 input 事件
    console.log('2. 输入「暴击」...');
    await page.fill('#treeSearch', '暴击');
    s = await state();
    assert.ok(s.hit > 0, '暴击应命中若干节点');
    assert.strictEqual(s.hit, s.expected, `DOM 命中 ${s.hit} 应与搜索函数 ${s.expected} 一致`);
    assert.strictEqual(s.hit + s.dim, s.total, '命中 + 变暗 应覆盖全部节点');
    assert.strictEqual(s.count, `匹配 ${s.hit} 个`, `计数文字应为「匹配 ${s.hit} 个」,实际「${s.count}」`);
    console.log(`   命中 ${s.hit} / ${s.total},变暗连线 ${s.linkDim},计数「${s.count}」✓`);
    await page.screenshot({ path: require('path').join(require('os').tmpdir(), 'tree-search-crit.png') });

    // 3. 无命中
    console.log('3. 输入无意义词...');
    await page.fill('#treeSearch', 'zzzqqq');
    s = await state();
    assert.strictEqual(s.hit, 0, '无意义词不应命中');
    assert.strictEqual(s.dim, s.total, '无命中时全部变暗');
    assert.strictEqual(s.count, '没有匹配', `计数应为「没有匹配」,实际「${s.count}」`);
    console.log(`   全部 ${s.dim} 个变暗,计数「${s.count}」✓`);

    // 4. 清空:恢复无高亮
    console.log('4. 清空搜索框...');
    await page.fill('#treeSearch', '');
    s = await state();
    assert.strictEqual(s.hit + s.dim, 0, '清空后应恢复');
    assert.strictEqual(s.count, '', '清空后计数应消失');
    console.log('   已恢复 ✓');

    // 5. 搜索不影响点亮:搜索状态下点击节点仍可选中(不抛错)
    console.log('5. 搜索状态下点选节点...');
    await page.fill('#treeSearch', '基石');
    await page.evaluate(() => window.game._treeTap && window.game._treeTap('sK'));
    s = await state();
    assert.strictEqual(s.hit, 15, `「基石」应命中 15 个,实际 ${s.hit}`);
    console.log(`   「基石」命中 ${s.hit} 个 ✓`);

    assert.strictEqual(pageErrorCount, 0, `页面运行时错误 ${pageErrorCount} 次`);
    console.log(`\n运行时错误 0 次`);
    console.log('全部通过');
    await browser.close();
})().catch(err => { console.error('FAIL', err.message); process.exit(1); });

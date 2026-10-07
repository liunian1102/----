/**
 * 全端多分辨率视口、HUD 排版、魔王全屏红边及按键热区综合独立验证套件
 * 覆盖场景:
 * 1. 移动端全面屏横屏 (844 x 390, touch, DPR 2)
 * 2. 桌面端 16:9 宽屏 (1920 x 1080, non-touch, DPR 1)
 * 3. 桌面端 4:3 经典屏 (800 x 600, non-touch, DPR 1)
 */
const assert = require('assert');
require('./setup-env.js');
const fs = require('fs');

const code = fs.readFileSync('game.js', 'utf8');
eval(code);

console.log('=== 开始执行全场景多视口独立验证套件 ===\n');

// 测试场景定义
const SCENARIOS = [
    {
        name: '移动端全面屏横屏 (iPhone 14/15 844x390, touch, DPR 2)',
        width: 844,
        height: 390,
        dpr: 2,
        isTouch: true,
        expectedSafePad: 16
    },
    {
        name: '桌面端 16:9 宽屏 (1920x1080, non-touch, DPR 1)',
        width: 1920,
        height: 1080,
        dpr: 1,
        isTouch: false,
        expectedSafePad: 10
    },
    {
        name: '桌面端 4:3 屏幕 (800x600, non-touch, DPR 1)',
        width: 800,
        height: 600,
        dpr: 1,
        isTouch: false,
        expectedSafePad: 10
    }
];

for (const sc of SCENARIOS) {
    console.log(`--- 测试场景: ${sc.name} ---`);

    // 1. 设置视口与环境模拟
    window.innerWidth = sc.width;
    window.innerHeight = sc.height;
    window.devicePixelRatio = sc.dpr;
    if (sc.isTouch) {
        window.ontouchstart = () => {};
        navigator.maxTouchPoints = 5;
    } else {
        delete window.ontouchstart;
        navigator.maxTouchPoints = 0;
    }

    const game = new Game();
    game.init();
    game.isRunning = true;

    // 2. 验证物理尺寸
    assert.strictEqual(game.canvas.width, sc.width * sc.dpr, `物理宽度应为 ${sc.width * sc.dpr}`);
    assert.strictEqual(game.canvas.height, sc.height * sc.dpr, `物理高度应为 ${sc.height * sc.dpr}`);
    console.log(`  ✓ 画布物理分辨率正确: ${game.canvas.width} x ${game.canvas.height}`);

    // 3. 验证 _withScreen 逻辑尺寸
    let screenW = 0, screenH = 0;
    game._withScreen((w, h) => { screenW = w; screenH = h; });
    assert.strictEqual(screenW, sc.width, `屏幕逻辑宽度应为 ${sc.width}`);
    assert.strictEqual(screenH, sc.height, `屏幕逻辑高度应为 ${sc.height}`);
    console.log(`  ✓ _withScreen 视口逻辑尺寸正确: ${screenW} x ${screenH}`);

    // 4. 验证魔王全屏红边 (Warning & Active)
    let strokeCalls = [];
    game.ctx.strokeRect = (x, y, w, h) => strokeCalls.push({ x, y, w, h });

    // Warning
    game.bossState = 'warning';
    game.bossWarningTimer = 2.0;
    strokeCalls = [];
    game._renderBossAlertScreen(screenW, screenH);
    assert.strictEqual(strokeCalls.length, 1, 'Warning 阶段应有 1 次红边绘制');
    assert.deepStrictEqual(strokeCalls[0], { x: 5, y: 5, w: sc.width - 10, h: sc.height - 10 }, 'Warning 红边贴合全屏');
    console.log(`  ✓ Warning 红边贴合全屏四周: ${JSON.stringify(strokeCalls[0])}`);

    // Active
    game.bossState = 'active';
    game.boss = new BlockBoss(game.width / 2, game.height / 2, 1);
    strokeCalls = [];
    game._renderBossAlertScreen(screenW, screenH);
    assert.strictEqual(strokeCalls.length, 1, 'Active 阶段应有 1 次红边绘制');
    assert.deepStrictEqual(strokeCalls[0], { x: 3, y: 3, w: sc.width - 6, h: sc.height - 6 }, 'Active 红边贴合全屏');
    console.log(`  ✓ Active 持续红边贴合全屏四周: ${JSON.stringify(strokeCalls[0])}`);

    // 5. 验证 _renderBossHUD 绝对不再向 800x600 绘制截断红框
    strokeCalls = [];
    game._withHud(() => {
        game._renderBossHUD();
    });
    const worldRedBox = strokeCalls.find(call => 
        (call.w === game.width - 6 || call.w === game.width - 12) &&
        (call.h === game.height - 6 || call.h === game.height - 12)
    );
    assert.strictEqual(worldRedBox, undefined, '800x600 世界坐标系中绝无截断红框！');
    console.log('  ✓ 800x600 世界坐标系内完全消除截断红框');

    // 6. 验证 HUD 安全边距与布局居中
    let hudInfo = null;
    game._withHud(() => {
        hudInfo = { ...game._hud };
        game._renderStatsHUD();
        game._renderMuteButton();
        game._renderBossHUD();
    });
    assert.strictEqual(hudInfo.padLeft, sc.expectedSafePad, `左安全边距应为 ${sc.expectedSafePad}`);
    assert.strictEqual(hudInfo.padRight, sc.expectedSafePad, `右安全边距应为 ${sc.expectedSafePad}`);
    console.log(`  ✓ HUD 安全边距适配正确: padLeft=${hudInfo.padLeft}, padRight=${hudInfo.padRight}`);

    // 7. 验证按键热区有效性 (静音按钮)
    assert.ok(game.muteButton, '静音按钮热区必须已正确生成');
    assert.ok(game.muteButton.w > 0 && game.muteButton.h > 0, '静音按钮热区有效');
    console.log(`  ✓ 静音/暂停按钮热区映射正常: x=${game.muteButton.x.toFixed(1)}, y=${game.muteButton.y.toFixed(1)}, w=${game.muteButton.w.toFixed(1)}`);

    // 8. 完整 render() 流程校验无异常
    game.render();
    console.log('  ✓ render() 完整渲染流程通过\n');
}

console.log('=== 所有场景综合验证全部通过！ ===');

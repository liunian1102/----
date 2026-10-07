/**
 * 针对移动端横屏/全面屏下魔王预警与活跃期中央红框、全屏特效视口错位的独立自动化验证
 */
const assert = require('assert');
require('./setup-env.js');
const fs = require('fs');

// 加载 game.js
const code = fs.readFileSync('game.js', 'utf8');
eval(code);

console.log('=== 开始独立验证：视口与魔王全屏警戒红边修复 ===');

// 1. 模拟移动端横屏环境 (iPhone 14 / 带鱼屏 844x390, DPR = 2)
window.innerWidth = 844;
window.innerHeight = 390;
window.devicePixelRatio = 2;

const game = new Game();
game.init();

// 验证 resizeCanvas 计算出的全屏物理像素和 letterbox
assert.strictEqual(game.canvas.width, 1688, '物理宽度应为 844 * 2 = 1688');
assert.strictEqual(game.canvas.height, 780, '物理高度应为 390 * 2 = 780');
assert.strictEqual(game.dpr, 2, 'DPR 应为 2');
console.log('✓ 1. 画布物理尺寸与 DPR 初始化正确');

// 2. 验证 _withScreen 逻辑视口
let capturedW = 0, capturedH = 0;
game._withScreen((scrW, scrH) => {
    capturedW = scrW;
    capturedH = scrH;
});
assert.strictEqual(capturedW, 844, '全屏逻辑宽度应为 844 CSS 像素');
assert.strictEqual(capturedH, 390, '全屏逻辑高度应为 390 CSS 像素');
console.log('✓ 2. _withScreen 全屏逻辑视口尺寸计算正确 (844 x 390)');

// 3. 验证 _renderBossHUD 不再向世界坐标系 (800x600) 输出全屏封闭红框 strokeRect
// 模拟魔王活跃状态
game.bossState = 'active';
game.boss = new BlockBoss(game.width / 2, game.height / 2, 1);

// 捕获 ctx 绘图调用
let strokeRectCalls = [];
game.ctx.strokeRect = (x, y, w, h) => {
    strokeRectCalls.push({ x, y, w, h });
};

// 执行世界坐标系下的 _renderBossHUD
strokeRectCalls = [];
game._renderBossHUD();
const worldRedBox = strokeRectCalls.find(call => 
    (call.w === game.width - 6 || call.w === game.width - 12) &&
    (call.h === game.height - 6 || call.h === game.height - 12)
);
assert.strictEqual(worldRedBox, undefined, '在 800x600 世界坐标系中绝对不应再绘制封闭红框！');
console.log('✓ 3. _renderBossHUD 内部已彻底移除 800x600 世界坐标系下的截断红框');

// 4. 验证 _renderBossAlertScreen 正确在全屏视口 (844x390) 边缘绘制全屏警戒红边
strokeRectCalls = [];
game._renderBossAlertScreen(capturedW, capturedH);
assert.strictEqual(strokeRectCalls.length, 1, '应有且仅有 1 次全屏持续红边绘制');
assert.deepStrictEqual(strokeRectCalls[0], { x: 3, y: 3, w: 844 - 6, h: 390 - 6 }, '持续红边应紧贴全屏四周 (844x390)');
console.log('✓ 4. 魔王活跃时持续红边已完美适配全屏边缘 (x:3, y:3, w:838, h:384)');

// 5. 验证魔王 Warning 状态
game.bossState = 'warning';
game.bossWarningTimer = 3.5;
strokeRectCalls = [];
game._renderBossAlertScreen(capturedW, capturedH);
assert.strictEqual(strokeRectCalls.length, 1, 'Warning 阶段应有 1 次全屏红边绘制');
assert.deepStrictEqual(strokeRectCalls[0], { x: 5, y: 5, w: 844 - 10, h: 390 - 10 }, 'Warning 红边应紧贴全屏四周');
console.log('✓ 5. 魔王预警时 Warning 红边已完美适配全屏边缘 (x:5, y:5, w:834, h:380)');

// 6. 验证全屏覆盖层 (受伤暗角、连杀狂热、冰冻滤镜) 在全屏视口下的行为
let fillRectCalls = [];
game.ctx.fillRect = (x, y, w, h) => {
    fillRectCalls.push({ x, y, w, h });
};

// 触发受击暗角
game.hurtVignette = 0.5;
fillRectCalls = [];
game._renderHurtVignette(capturedW, capturedH);
const hurtCall = fillRectCalls.find(c => c.w === capturedW && c.h === capturedH);
assert.ok(hurtCall, '受击暗角应覆盖全屏视口 (844x390)');
console.log('✓ 6. 受击暗角正确覆盖全屏视口 (844x390)');

// 触发连杀狂热
game.player.combo = 50;
fillRectCalls = [];
game._renderFrenzyVignette(capturedW, capturedH);
const frenzyCall = fillRectCalls.find(c => c.w === capturedW && c.h === capturedH);
assert.ok(frenzyCall, '连杀狂热火焰光晕应覆盖全屏视口 (844x390)');
console.log('✓ 7. 连杀狂热火焰光晕正确覆盖全屏视口 (844x390)');

// 7. 验证主渲染管线完整执行无报错
game.isRunning = true;
game.bossState = 'active';
game.render();
console.log('✓ 8. 完整 render() 管线执行成功，所有图层均平稳运行');

console.log('=== 全部测试项独立验证通过！ ===');

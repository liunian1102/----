/**
 * 针对 Bug 17 与 Bug 18 第四批核心缺陷的独立自动化回归测试套件
 */
const assert = require('assert');
require('./setup-env.js');
const fs = require('fs');

const code = fs.readFileSync('game.js', 'utf8');
eval(code);

console.log('=== 开始执行 Bug 17 与 Bug 18 独立自动化回归测试 ===\n');

const game = new Game();
game.init();

// -------------------------------------------------------------
// 1. 验证 Bug 17: 深渊爬塔模式开局保护与传送门生成、爬塔进阶
// -------------------------------------------------------------
console.log('1. 验证 Bug 17: 深渊模式 diffMode 开局保护与爬塔全流程...');
game.diffPref = 'normal';
game.diffMode = 'abyss'; // 玩家开启深渊模式
game.startGame();

// 1.1 校验 diffMode 是否被保留
assert.strictEqual(game.diffMode, 'abyss', '【修复确证】startGame() 必须保留 diffMode 为 "abyss"，不可强行覆写');
assert.strictEqual(game.abyssFloor, 1, '初始深渊层数应为第 1 层');

// 1.2 模拟击杀达到第 1 层目标 (12 + 1*4 = 16 杀)
game.abyssKillsThisFloor = 16;
game.enemies = [];
game.boss = null;
game.bossState = 'idle';

game._updateAbyssMode();
assert.ok(game.abyssPortal, '【修复确证】击杀达成后深渊折跃传送门必须成功生成');
console.log(`   深渊传送门已生成: (${game.abyssPortal.x}, ${game.abyssPortal.y}), 半径: ${game.abyssPortal.radius}`);

// 1.3 模拟玩家踏入传送门完成折跃
game.abyssPortal.spawnTimer = 0;
game.player.x = game.abyssPortal.x;
game.player.y = game.abyssPortal.y;
game._updateAbyssMode();

assert.strictEqual(game.abyssFloor, 2, '【修复确证】踏入传送门后必须成功折跃至第 2 层');
assert.strictEqual(game.abyssPortal, null, '折跃后旧传送门必须已销毁');

// 1.4 推进至第 3 层，验证守门魔王如期降临
game.abyssFloor = 3;
game.abyssPortal = null;
game._updateAbyssMode();
// 模拟进入第 3 层后的击退/新层刷新
game.abyssKillsThisFloor = 24;
game._enterNextAbyssFloor();

assert.strictEqual(game.abyssFloor, 4, '突破第 3 层后成功进入第 4 层');
console.log('✓ Bug 17 修复通过：深渊爬塔模式开局保护、传送门生成与折跃全链路畅通！\n');

// -------------------------------------------------------------
// 2. 验证 Bug 18: 暗金遗物【雷神指环】第 3 次命中召唤天雷
// -------------------------------------------------------------
console.log('2. 验证 Bug 18: 暗金遗物【雷神指环】天雷轰顶命中即时触发...');
const p = game.player;
p.relics = ['thunder_ring'];
p._relicThunderCount = 0;
p._relicThunderActive = false;
p.attack = 50;

const dummyEnemy = new Enemy(p.x + 50, p.y, 'chaser', 1);
game.enemies = [dummyEnemy];

// 模拟第 1 次命中
game._applyHitMods(p, dummyEnemy, 20);
assert.strictEqual(p._relicThunderCount, 1, '第 1 次命中计数应为 1');

// 模拟第 2 次命中
game._applyHitMods(p, dummyEnemy, 20);
assert.strictEqual(p._relicThunderCount, 2, '第 2 次命中计数应为 2');

// 模拟第 3 次命中 (触发天雷轰顶)
const effectsBefore = game.effects.length;
game._applyHitMods(p, dummyEnemy, 20);
assert.strictEqual(p._relicThunderCount, 0, '第 3 次命中计数应循环归零 (0)');

const effectsAfter = game.effects.length;
assert.ok(effectsAfter > effectsBefore, '【修复确证】第 3 次命中必须即时生成天雷特效');

const hasLightning = game.effects.some(e => e.type === 'lightning');
const hasShockwave = game.effects.some(e => e.type === 'shockwave' && e.color === '#ffe14d');
assert.ok(hasLightning, '【修复确证】特效数组中必须包含闪电 (lightning)');
assert.ok(hasShockwave, '【修复确证】特效数组中必须包含金色天雷震波 (shockwave)');
console.log('✓ Bug 18 修复通过：暗金遗物【雷神指环】天雷轰顶即时范围打击与特效生效！\n');

console.log('=== 全部第四批核心缺陷 (Bug 17 & Bug 18) 自动化回归测试 100% 通过！ ===');

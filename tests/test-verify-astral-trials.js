/**
 * 针对传奇星界试炼 (Astral Crucible: 多维机制挑战) 的独立自动化回归测试套件
 */
const assert = require('assert');
require('./setup-env.js');
const fs = require('fs');

const code = fs.readFileSync('game.js', 'utf8');
eval(code);

console.log('=== 开始执行 传奇星界试炼 (Astral Crucible) 自动化回归测试 ===\n');

const game = new Game();
game.init();

// -------------------------------------------------------------
// 1. 验证方尖碑降临与玩家主动引导激活
// -------------------------------------------------------------
console.log('1. 验证方尖碑降临机制与主动引导...');
game.level = 7;
game.trialObelisk = null;
game.activeTrial = null;
game.trialCooldown = 0;
game._spawnTrialObelisk();

assert.ok(game.trialObelisk, '【确证】Lv 7 触发召唤方尖碑');
assert.strictEqual(game.trialObelisk.radius, 46, '方尖碑半径应为 46');
assert.strictEqual(game.trialObelisk.charge, 0, '初始充能应为 0');
assert.strictEqual(game.trialObelisk.timer, 45, '初始倒计时应为 45 秒');

// 玩家站在方尖碑范围内，测试充能增加
const ob = game.trialObelisk;
game.player.x = ob.x - game.player.size / 2;
game.player.y = ob.y - game.player.size / 2;

// 推进数帧
for (let i = 0; i < 40; i++) {
    game._updateTrialObelisk();
}
assert.ok(ob.charge > 0, '【确证】玩家在光圈内引导时充能增加');

// 引导满进入试炼
ob.charge = ob.needTime;
const chosenType = ob.trialType;
game._updateTrialObelisk();
assert.strictEqual(game.trialObelisk, null, '【确证】破封后方尖碑实体销毁');
assert.ok(game.activeTrial, '【确证】成功进入传奇试炼模式');
assert.strictEqual(game.activeTrial.type, chosenType, '试炼类型应匹配');
console.log('✓ 1. 方尖碑降临与主动引导破封验证通过！\n');

// -------------------------------------------------------------
// 2. 验证【绝境回避 · 激光矩阵】(Matrix) 考验与受击判定
// -------------------------------------------------------------
console.log('2. 验证【绝境回避 · 激光矩阵】考验与受击限制...');
game._endAstralTrial(false); // 重置
game._startAstralTrial('matrix');

assert.strictEqual(game.activeTrial.type, 'matrix', '当前激活试炼应为 matrix');
assert.strictEqual(game.activeTrial.hitsTaken, 0, '初始擦碰次数应为 0');

// 模拟擦碰 1 次与 2 次
game.player.takeDamage(10, '敌方子弹');
assert.strictEqual(game.activeTrial.hitsTaken, 1, '第 1 次擦碰记录');
game.player.invincibleTimer = 0;

game.player.takeDamage(10, '敌方子弹');
assert.strictEqual(game.activeTrial.hitsTaken, 2, '第 2 次擦碰记录');
game.player.invincibleTimer = 0;

// 第 3 次擦碰应触发试炼失败受挫保护，但玩家绝不致死 Game Over
game.player.takeDamage(10, '敌方子弹');
assert.strictEqual(game.activeTrial, null, '【确证】3 次擦碰试炼结束');
assert.ok(game.player.currentHealth >= Math.floor(game.player.maxHealth * 0.25), '【不死保护】失败时血量保留至 25% 狼狈突围');
assert.ok(game.player.hurtCooldown > 1.0, '【不死保护】给予充分无敌帧突围');
console.log('✓ 2. 绝境回避矩阵擦碰判定与免死突围保护验证通过！\n');

// -------------------------------------------------------------
// 3. 验证【极限压榨 · 巨神破盾】(DPS) 考验与护盾爆发
// -------------------------------------------------------------
console.log('3. 验证【极限压榨 · 巨神破盾】考验...');
game._startAstralTrial('dps');
assert.strictEqual(game.activeTrial.type, 'dps');
const core = game.activeTrial.core;
assert.ok(core && core.isTrialCore, '【确证】场中央生成虚空晶核靶标');
assert.ok(core.currentHealth > 5000, '晶核应拥有巨额护盾');

// 玩家对晶核倾泻输出直到破盾 (考虑巨人的基础护甲扣减)
core.takeDamage(core.maxHealth + 100);
game._updateActiveTrial();

assert.strictEqual(game.activeTrial, null, '【确证】击碎晶核护盾即刻通关试炼');
assert.strictEqual(game.trialsCleared, 1, '【确证】trialsCleared 计数累加为 1');
console.log('✓ 3. 极限破盾爆发考验与通关判定验证通过！\n');

// -------------------------------------------------------------
// 4. 验证【借刀引爆 · 连携破甲】(Trick) 机制：免疫常规伤害，唯自爆可破
// -------------------------------------------------------------
console.log('4. 验证【借刀引爆 · 连携破甲】机制与怪物相克...');
game._startAstralTrial('trick');
assert.strictEqual(game.activeTrial.type, 'trick');
assert.strictEqual(game.activeTrial.golems.length, 3, '应生成 3 只重甲傀儡');

const golem = game.activeTrial.golems[0];
const hpBefore = golem.currentHealth;

// 玩家常规普通攻击打上去应被免疫
const dealt = golem.takeDamage(150, false);
assert.strictEqual(dealt, 0, '【确证】常规直接攻击无法对重甲傀儡造成伤害');
assert.strictEqual(golem.currentHealth, hpBefore, '【确证】重甲傀儡血量完好');

// 模拟自爆怪引爆冲击波（fromExplosion = true）
golem.takeDamage(200, true);
assert.strictEqual(golem.currentHealth, hpBefore - 200, '【确证】自爆冲击波造成 200 致命破甲伤害');

// 消灭全部傀儡，验证通关
for (const g of game.activeTrial.golems) {
    g.currentHealth = 0;
}
game._updateActiveTrial();
assert.strictEqual(game.activeTrial, null, '【确证】借助自爆消灭所有傀儡判定试炼成功');
assert.strictEqual(game.trialsCleared, 2, '【确证】trialsCleared 计数累加为 2');
console.log('✓ 4. 借刀引爆机制克制与连携破甲验证通过！\n');

// -------------------------------------------------------------
// 5. 验证【背水一战 · 幻影死斗】(Duel) 考验：锁血 1 点与受击保护
// -------------------------------------------------------------
console.log('5. 验证【背水一战 · 幻影死斗】考验...');
game._startAstralTrial('duel');
assert.strictEqual(game.activeTrial.type, 'duel');
assert.strictEqual(game.player.currentHealth, 1, '【确证】进入背水决斗玩家生命值强制锁死为 1 点');
assert.strictEqual(game.player.inDuelTrial, true, '背水死斗标记激活');

// 受到任意伤害触发破防受挫，但绝不直接死亡 Game Over
game.player.takeDamage(15, '敌人碰撞');
assert.strictEqual(game.activeTrial, null, '【确证】受到伤害背水破防，试炼中止');
assert.strictEqual(game.player.inDuelTrial, false, '背水死斗标记解除');
assert.ok(game.player.currentHealth > 1, '【确证】破防后恢复残血安全突围状态');
console.log('✓ 5. 背水一战锁血与破防紧急突围保护验证通过！\n');

// -------------------------------------------------------------
// 6. 验证星核产出、成就系统与结算汇总
// -------------------------------------------------------------
console.log('6. 验证星核产出与成就系统...');
const stats = game._runStats();
assert.strictEqual(stats.trialsCleared, 2, 'runStats 中应记录 2 次试炼突破');
assert.ok(stats.starCoresEarned >= 30, '2 次试炼应累计至少 30 颗星核收益');

// 验证成就解锁
const achs = Progress.checkAchievements(stats);
const achIds = achs.map(a => a.id);
assert.ok(achIds.includes('trialFirst'), '【成就确证】应解锁 trialFirst (星界破界者)');
assert.ok(achIds.includes('trialMaster'), '【成就确证】应解锁 trialMaster (四圣试炼王)');

// 验证战绩汇总面板
const summary = game._runSummaryRows();
const trialRow = summary.find(([k]) => k === '传奇试炼');
assert.ok(trialRow, '战绩面板中应展示【传奇试炼】条目');
assert.strictEqual(trialRow[1], '2 次突破', '展示文本应为「2 次突破」');

console.log('✓ 6. 星核产出、双重传奇成就与战绩面板展示全部验证通过！\n');

console.log('=== 🎉 所有传奇星界试炼机制独立自动化验证 100% 通过！===');

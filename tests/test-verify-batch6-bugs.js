/**
 * 针对 Bug 23 (近战与 AOE 范围攻击对环境危险物判定支持) 的独立自动化回归测试套件
 */
const assert = require('assert');
require('./setup-env.js');
const fs = require('fs');

const code = fs.readFileSync('game.js', 'utf8');
eval(code);

console.log('=== 开始执行 Bug 23 (近战破坏危险物) 独立自动化回归测试 ===\n');

const game = new Game();
game.init();
game.startGame();

const p = game.player;
p.class = 'warrior';
p.attack = 50;

// -------------------------------------------------------------
// 1. 验证战士近战普通挥砍攻击对身边易燃桶的打击与引爆
// -------------------------------------------------------------
console.log('1. 验证战士近战普通挥砍对身边易燃桶 (barrel) 的扣减与引爆...');
const barrel1 = { x: p.x + 25, y: p.y, type: 'barrel', hp: 2, maxHp: 2, hitFlash: 0, size: 28 };
game.hazards = [barrel1];

// 战士出刀 1 次
game._warriorMeleeAttack();
assert.strictEqual(barrel1.hp, 1, '【修复确证】近战出刀第 1 次必须成功扣减 barrel.hp (从 2 降至 1)');

// 战士出刀第 2 次 (耐久归零，触发引爆)
const effectsBefore = game.effects.length;
game._warriorMeleeAttack();

assert.strictEqual(barrel1.hp, 0, '耐久必须归零');
assert.strictEqual(game.hazards.length, 0, '【修复确证】引爆后易燃桶必须从 hazards 数组中移除');
assert.ok(game.effects.length > effectsBefore, '【修复确证】引爆必须产生烈焰冲击波特效');

const hasExplosionShockwave = game.effects.some(e => e.type === 'shockwave' && e.color === '#ff3d00');
assert.strictEqual(hasExplosionShockwave, true, '【修复确证】必须生成烈焰爆炸震波 (#ff3d00)');
console.log('✓ 近战普通挥砍成功扣减耐久并引爆易燃桶！\n');

// -------------------------------------------------------------
// 2. 验证战士旋风斩 (AOE 范围通过 _hitAround) 对身边易燃桶的打击与引爆
// -------------------------------------------------------------
console.log('2. 验证旋风斩 (AOE 范围攻击通过 _hitAround) 对身边易燃桶的打击...');
const barrel2 = { x: p.x + 40, y: p.y, type: 'barrel', hp: 1, maxHp: 1, hitFlash: 0, size: 28 };
game.hazards = [barrel2];
p.rage = 100;
p.skillQ.cooldown = 0;

// 释放旋风斩
game.castSkillQ();

assert.strictEqual(barrel2.hp, 0, '【修复确证】旋风斩 AOE 必须成功扣减易燃桶耐久');
assert.strictEqual(game.hazards.length, 0, '【修复确证】引爆后易燃桶必须从 hazards 列表中移除');
console.log('✓ 旋风斩 AOE 攻击成功命中并引爆易燃桶！\n');

// -------------------------------------------------------------
// 3. 验证圣骑士近战普通攻击对身边电浆水晶 (crystal) 的打击
// -------------------------------------------------------------
console.log('3. 验证圣骑士近战普攻对身边电浆水晶的打击与过载...');
p.class = 'paladin';
const crystal = { x: p.x + 30, y: p.y, type: 'crystal', hp: 1, maxHp: 1, hitFlash: 0, size: 28 };
game.hazards = [crystal];

// 圣锤攻击
game._paladinHammer();

assert.strictEqual(crystal.hp, 0, '【修复确证】圣骑士普攻必须成功破坏电浆水晶');
assert.strictEqual(game.hazards.length, 0, '【修复确证】过载后电浆水晶必须从 hazards 列表中移除');
console.log('✓ 圣骑士近战普攻成功命中并破坏电浆水晶！\n');

console.log('=== Bug 23 独立自动化回归测试 100% 验证通过！ ===');

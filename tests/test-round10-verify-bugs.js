// test-round10-verify-bugs.js
require('./setup-env.js');

console.log("=== 正在独立验证第 10 轮核心缺陷 ===");

// 验证 Bug 73: 法师冰霜碎冰伤害来源被记为 other
const g73 = new Game();
g73.init(); g73.startGame();
g73.player.class = 'mage';
g73.player.spec = 'frost';
const enemy73 = new Enemy(100, 100, 'chaser', 1);
enemy73.stunTimer = 1.0;
g73.enemies.push(enemy73);
g73._dealDamage(enemy73, 20); // 触发碎冰
console.log("法师碎冰后 dmgStats:", g73.player.dmgStats);
console.log("Bug 73 (法师碎冰伤害被错误归入 other):", (!g73.player.dmgStats.q && g73.player.dmgStats.other > 0) ? "PASS (缺陷存在)" : "FAIL");

// 验证 Bug 74: 圣光柱延迟动作未绑定伤害来源
const g74 = new Game();
g74.init(); g74.startGame();
g74.player.class = 'paladin';
g74.player.spec = 'crusader';
g74.player.awakened = true;
const enemy74 = new Enemy(g74.player.x + 20, g74.player.y, 'chaser', 1);
g74.enemies.push(enemy74);
g74._paladinHammer(); // 1
g74._paladinHammer(); // 2
g74._paladinHammer(); // 3
g74._paladinHammer(); // 4 (触发圣光柱)
// 执行 pendingActions 中的圣光柱
for (const act of g74.pendingActions) if (act.fn) act.fn();
console.log("圣光柱结算后 dmgStats.a:", g74.player.dmgStats.a);
console.log("Bug 74 (圣光柱伤害未成功落入 dmgStats.a):", !g74.player.dmgStats.a ? "PASS (缺陷存在)" : "FAIL");

process.exit(0);

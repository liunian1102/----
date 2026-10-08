// test-bug47-orb-evo-burn-owner.js
// 烈焰法球 Lv2 觉醒调用 _applyBurn 时参数顺序写反:施法者变成数字、灼烧每秒只有 2 点,烧死敌人时击杀结算崩溃
require('./setup-env.js');

const game = new Game();
game.init(); game.startGame();
const p = game.player;
p.attack = 100;
p.gear = { type: 'orb', level: 2, timer: 20, max: 20, cd: 0.3, angle: 0 };

const e = game._newEnemy(0, 0, 'giant');
e.currentHealth = e.maxHealth = 100000;
game.enemies = [e];

let crashed = null, burned = false;
for (let i = 0; i < 400 && !crashed; i++) {
    // 把敌人一直放在火球轨道上
    const a = (p.gear.angle || 0);
    e.x = p.x + p.size / 2 + Math.cos(a) * Game.ORB_RADIUS * 1.15 - e.size / 2;
    e.y = p.y + p.size / 2 + Math.sin(a) * Game.ORB_RADIUS * 1.15 - e.size / 2;
    try { game._tickGear(); } catch (err) { crashed = err; }
    if (e.burnT > 0) { burned = true; break; }
}
console.log('崩溃:', crashed ? crashed.message : '无', ' 是否点燃:', burned);
console.log('灼烧施法者是玩家:', e.burnOwner === p, ' 每秒灼烧:', e.burn);
// 把敌人血量压到即将烧死,结算一次燃烧击杀
e.currentHealth = 0.01;
let killCrash = null;
try { game.updateEnemies(); } catch (err) { killCrash = err; }
console.log('燃烧击杀结算崩溃:', killCrash ? killCrash.message : '无');
const ok = !crashed && !killCrash && burned && e.burnOwner === p && Math.abs(e.burn - p.attack * 0.25) < 1e-6;
console.log(ok ? 'PASS' : 'FAIL');
process.exit(ok ? 0 : 1);

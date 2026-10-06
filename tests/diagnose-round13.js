// diagnose-round13.js
require('./setup-env.js');

console.log("=== 开始第 13 轮深度探测 ===");

// -------------------------------------------------------------
// [探测 1] 普攻多重投射角度与伤害计算
// -------------------------------------------------------------
console.log("\n[探测 1] 多重投射投射物角度与伤害");
const g1 = new Game();
g1.init(); g1.startGame();
g1.player.class = 'archer';
g1.player.archerMultiShot = 3; // 扇形多发
const enemy1 = new Enemy(400, 300, 'chaser', 1);
g1.enemies.push(enemy1);
g1.player.x = 200; g1.player.y = 300;
g1.shoot();
console.log("多重射击生成投射物数量:", g1.projectiles.length);
const angles1 = g1.projectiles.map(p => Math.round(p.angle * 180 / Math.PI));
console.log("各箭矢发射角度 (度):", angles1);
console.log("是否存在 NaN 角度:", angles1.some(a => isNaN(a)));

// -------------------------------------------------------------
// [探测 2] 炎术师 Q 开关普攻伤害多次乘算检查
// -------------------------------------------------------------
console.log("\n[探测 2] 炎术师 Q 开关法术加伤计算");
const g2 = new Game();
g2.init(); g2.startGame();
g2.player.class = 'mage';
g2.player.spec = 'pyro';
g2.player.qToggleActive = true;
const enemy2 = new Enemy(400, 300, 'chaser', 1);
g2.enemies.push(enemy2);
g2.shoot();
console.log("炎术师 Q 开关生成投射物伤害:", g2.projectiles[0] ? g2.projectiles[0].damage : null);

// -------------------------------------------------------------
// [探测 3] 雷神指环命中魔王累加击退进度
// -------------------------------------------------------------
console.log("\n[探测 3] 雷神指环天雷命中魔王");
const g3 = new Game();
g3.init(); g3.startGame();
g3.player.relics = ['thunder_ring'];
g3._spawnBoss();
g3.bossDamageDealt = 0;
// 触发天雷
g3.player._relicThunderCount = 2;
g3._dealDamage(g3.boss, 10);
// 执行天雷
for (const act of g3.pendingActions) if (act.fn) act.fn();
console.log("雷神指环天雷命中魔王后 bossDamageDealt:", g3.bossDamageDealt);
console.log("天雷伤害是否成功累加进魔王击退进度:", g3.bossDamageDealt > 10);

// -------------------------------------------------------------
// [探测 4] 游侠 E 技能箭雨持续伤害
// -------------------------------------------------------------
console.log("\n[探测 4] 游侠 E 技能箭雨");
const g4 = new Game();
g4.init(); g4.startGame();
g4.player.class = 'archer';
const enemy4 = new Enemy(200, 200, 'chaser', 1);
g4.enemies.push(enemy4);
g4.castSkillE();
console.log("游侠 E 技能生成的 pendingActions 波数:", g4.pendingActions.length);

// -------------------------------------------------------------
// [探测 5] 静音与解除静音增益平滑过渡
// -------------------------------------------------------------
console.log("\n[探测 5] Sound 静音切换");
Sound.toggleMute();
console.log("当前 muted 状态:", Sound.muted, ", master.gain.value:", Sound.master ? Sound.master.gain.value : null);
Sound.toggleMute();
console.log("解除静音后 master.gain.value:", Sound.master ? Sound.master.gain.value : null);

// -------------------------------------------------------------
// [探测 6] restartGame 时客机端的 gemLog 清理
// -------------------------------------------------------------
console.log("\n[探测 6] restartGame 时技能石记录 gemLog 清理");
const g6 = new Game();
g6.init(); g6.startGame();
g6._grantGem('dmg');
console.log("开局前 gemLog:", g6.player.gemLog);
g6.restartGame();
console.log("restartGame 重新开局后 gemLog (应为 ''):", g6.player.gemLog);
console.log("gemLog 是否被清空:", g6.player.gemLog === '');

// -------------------------------------------------------------
// [探测 7] 宝藏方块溜走时网络快照标记
// -------------------------------------------------------------
console.log("\n[探测 7] 宝藏方块溜走事件状态");
const g7 = new Game();
g7.init(); g7.startGame();
g7._startEvent('treasure');
g7._endEvent({ type: 'treasure' });
console.log("宝藏方块溜走后 event 是否重置为 null:", g7.event === null);

// -------------------------------------------------------------
// [探测 8] 怪物死亡掉落金币与道具拾取动画
// -------------------------------------------------------------
console.log("\n[探测 8] 道具掉落下落时间 landTimer");
const item8 = new Item(200, 200, 'potion');
console.log("初始 landTimer:", item8.landTimer);
item8.update();
console.log("update 1 帧后 landTimer:", item8.landTimer);

process.exit(0);

// test-bug21-cross-laser-infinite-range.js
require('./setup-env.js');

const game = new Game();
game.init(); game.startGame();
game._spawnBoss();
game.boss.atk = 'cross';
game.boss.atkPhase = 1;
game.boss.atkAngle = 0;
game.boss.atkTimer = 0.5;
game.boss.atkDur = 1.0;

// 将玩家放置在远离魔王 5000 像素的位置 (沿 0 度角射线)
game.player.x = game.boss.x + 5000;
game.player.y = game.boss.y;
game.player.hurtCooldown = 0;
const hpBefore = game.player.currentHealth;

// 执行一次十字激光判定
game._bossCrossLaserTick(game.boss, game.boss.x + 40, game.boss.y + 40);

console.log("5000px 距离外玩家是否被命中扣血:", game.player.currentHealth < hpBefore);
const infiniteRange = game.player.currentHealth < hpBefore;
console.log("Bug 21 验证结果 (十字死光具有无限长攻击距离判定):", infiniteRange ? "PASS (成功捕获缺陷)" : "FAIL");

process.exit(infiniteRange ? 0 : 1);

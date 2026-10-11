// test-bug21-cross-laser-infinite-range.js
// 回归测试:缺陷已修复,修复仍有效时退出码为 0(原为「捕获缺陷」脚本,缺陷存在时才返回 0)
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
console.log("Bug 21 回归 (十字死光有攻击距离上限):", !infiniteRange ? "PASS" : "FAIL");

process.exit(!infiniteRange ? 0 : 1);

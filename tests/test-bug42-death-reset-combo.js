// test-bug42-death-reset-combo.js
require('./setup-env.js');

const game = new Game();
game.init(); game.startGame();
game.life = 2;
game.player.combo = 50;
game.player.frenzyTier = 5;
game.player.currentHealth = 0;
game.player.guardianCooldown = 90; // 冷却中,走直接扣命复活流程

// 触发死亡复活
game._checkLocalDeath();

console.log("扣命复活后玩家生命数:", game.life);
console.log("扣命复活后玩家 combo:", game.player.combo, ", frenzyTier:", game.player.frenzyTier);
console.log("死亡后 combo 是否未被清零:", game.player.combo > 0 || game.player.frenzyTier > 0);

process.exit(game.player.combo > 0 || game.player.frenzyTier > 0 ? 0 : 1);

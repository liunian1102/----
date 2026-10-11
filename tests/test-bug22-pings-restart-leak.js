// test-bug22-pings-restart-leak.js
// 回归测试:缺陷已修复,修复仍有效时退出码为 0(原为「捕获缺陷」脚本,缺陷存在时才返回 0)
require('./setup-env.js');

const game = new Game();
game.init(); game.startGame();

// 在场上放置 2 个战术标记
game._addTacticalPing(200, 200, 'danger');
game._addTacticalPing(300, 300, 'rally');
console.log("对局中战术标记数量:", game.tacticalPings.length);

// 玩家死亡并点击重新开始
game.restartGame();

console.log("restartGame 重新开局后, 战术标记数量:", game.tacticalPings ? game.tacticalPings.length : 0);
const leaked = game.tacticalPings && game.tacticalPings.length > 0;
console.log("Bug 22 回归 (重开后不残留上一局标记):", !leaked ? "PASS" : "FAIL");

process.exit(!leaked ? 0 : 1);

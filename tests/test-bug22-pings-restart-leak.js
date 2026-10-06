// test-bug22-pings-restart-leak.js
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
console.log("Bug 22 验证结果 (上一局标记跨局残留):", leaked ? "PASS (成功捕获缺陷)" : "FAIL");

process.exit(leaked ? 0 : 1);

// test-bug43-orb-evo-five-rings.js
require('./setup-env.js');

const game = new Game();
game.init(); game.startGame();
// 拾取两颗 orb 升阶为 Lv2 日冕星环
game._equipGear('orb');
game._equipGear('orb');

console.log("日冕星环装备状态:", game.player.gear);

// 在玩家周围不同象限放置 4 只怪物 (都在火球轨道半径 65px 内)
const cx = game.player.x + game.player.size / 2;
const cy = game.player.y + game.player.size / 2;
const enemies = [
    new Enemy(cx + 60, cy, 'chaser', 1),
    new Enemy(cx - 60, cy, 'chaser', 1),
    new Enemy(cx, cy + 60, 'chaser', 1),
    new Enemy(cx, cy - 60, 'chaser', 1)
];
game.enemies.push(...enemies);

// 模拟 1 帧更新 _tickGearInner
game._tickGearInner();

let hits = 0;
for (const e of enemies) {
    if (e.currentHealth < e.maxHealth) hits++;
}
console.log("日冕星环 5 重火球在 1 帧内同时命中的怪物数:", hits);
console.log("Bug 43 验证结果 (5重火环未实现,仅有单火球):", hits <= 1 ? "PASS (缺陷存在)" : "FAIL");

process.exit(hits <= 1 ? 0 : 1);

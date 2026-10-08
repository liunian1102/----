// test-bug45-thunder-ring-melee-index.js
// 雷神指环天雷在命中结算里同步打死周围敌人,战士近战按下标倒序遍历 enemies 时下标越界崩溃
require('./setup-env.js');

const game = new Game();
game.init(); game.startGame();
const p = game.player;
game._applyClassToPlayer(p, 'warrior');
p.relics = ['thunder_ring'];
p.attack = 500; // 一刀秒杀,天雷也秒杀

let crashed = null;
let maxEnemiesKilled = 0;
for (let round = 0; round < 30 && !crashed; round++) {
    game.enemies = [];
    // 一圈在近战范围内,外圈只在天雷范围内(会被天雷打死,让数组变短)
    const pcx = p.x + p.size / 2, pcy = p.y + p.size / 2;
    for (let k = 0; k < 8; k++) {
        const a = k / 8 * Math.PI * 2;
        for (const r of [40, 110]) {
            const e = game._newEnemy(0, 0, 'chaser');
            e.x = pcx + Math.cos(a) * r - e.size / 2;
            e.y = pcy + Math.sin(a) * r - e.size / 2;
            e.currentHealth = e.maxHealth = 10;
            game.enemies.push(e);
        }
    }
    const before = game.enemies.length;
    try {
        game._warriorMeleeAttack();
        for (let i = 0; i < 10; i++) game._tickPendingActions();
    } catch (e) { crashed = e; }
    maxEnemiesKilled = Math.max(maxEnemiesKilled, before - game.enemies.length);
}

// 被误删的活敌人:列表里不应该有已死的,也不应少删
const dead = game.enemies.filter(e => e.currentHealth <= 0).length;
console.log('崩溃:', crashed ? crashed.stack.split('\n').slice(0, 2).join(' | ') : '无');
console.log('单轮最多击杀:', maxEnemiesKilled, ' 列表中残留死敌:', dead);
const ok = !crashed && maxEnemiesKilled > 8 && dead === 0;
console.log(ok ? 'PASS' : 'FAIL');
process.exit(ok ? 0 : 1);

// test-bug46-cull-projectile-index.js
// 处决宝石在 _afterHit 里同步把目标移出 enemies:普攻投射物循环继续用 enemies[j] 读到别的敌人或 undefined 崩溃,
// 穿透箭则二次结算击杀并按旧下标误删一个活着的敌人
require('./setup-env.js');

const game = new Game();
game.init(); game.startGame();
const p = game.player;
game._applyClassToPlayer(p, 'archer');
game._grantGem('cull');
game._socketGem('a', 0, 'cull');
game._socketGem('q', 0, 'cull');

const mk = (x, y, hp) => {
    const e = game._newEnemy(x, y, 'chaser');
    e.currentHealth = hp; e.maxHealth = 100;
    return e;
};
let crashed = null, wrongRemoved = 0, doubleKills = 0;
for (let round = 0; round < 50 && !crashed; round++) {
    game.enemies = [];
    game.projectiles = [];
    game._withCtx(Game.CTX.a, () => {
        // 下标 0 的敌人不碰,下标 1 被子弹打到处决线以下,下标 2 是另一个活敌
        const keep = mk(50, 50, 100);
        const target = mk(400, 300, 6);
        const other = mk(700, 500, 100);
        game.enemies.push(keep, target, other);
        const proj = new Projectile(400 + target.size / 2 - 4, 300 + target.size / 2 - 4, 0, 0, 1);
        proj.owner = p; proj.ctx = Game.CTX.a;
        game.projectiles.push(proj);
    });
    const kills0 = p.killCount || 0;
    try { game.checkCollisions(); } catch (e) { crashed = e; break; }
    if (game.enemies.length !== 2 || game.enemies.some(e => e.currentHealth <= 0)) wrongRemoved++;
    if ((p.killCount || 0) - kills0 > 1) doubleKills++;

    // 穿透箭:被处决的目标后面还有一个活敌
    game.enemies = [];
    const a = mk(200, 200, 100), t = mk(300, 300, 6);
    game.enemies.push(a, t);
    const arrow = new PiercingArrow(300 + t.size / 2, 300 + t.size / 2, 1, 0, 1, game);
    arrow.owner = p; arrow.ctx = Game.CTX.q;
    const k1 = p.killCount || 0;
    try { arrow.update(); } catch (e) { crashed = e; break; }
    if (!game.enemies.includes(a)) wrongRemoved++;
    if ((p.killCount || 0) - k1 > 1) doubleKills++;
}
console.log('崩溃:', crashed ? crashed.stack.split('\n').slice(0, 2).join(' | ') : '无');
console.log('误删活敌轮数:', wrongRemoved, ' 二次结算轮数:', doubleKills);
const ok = !crashed && wrongRemoved === 0 && doubleKills === 0;
console.log(ok ? 'PASS' : 'FAIL');
process.exit(ok ? 0 : 1);

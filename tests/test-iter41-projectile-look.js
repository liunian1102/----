// test-iter41-projectile-look.js
// 1) 各职业普攻弹体造型:弓手箭矢(5)/ 法师奥术飞弹(6,第 4 发奥术弹 3)/ 刺客苦无(7)
// 2) 快照把造型编号带给客机,客机新建的投射物保持同一造型
// 3) 每种造型都有绘制定义,48 个方向的下标算法不越界
require('./setup-env.js');
const results = [];
const check = (name, ok, msg) => results.push([name, ok, msg]);

const kindsFor = cls => {
    const game = new Game(); game.init(); game.startGame();
    game._applyClassToPlayer(game.player, cls);
    game.enemies = []; game.projectiles = [];
    const ks = [];
    for (let i = 0; i < 4; i++) { game.projectiles = []; game.shoot(); ks.push(game.projectiles.map(p => p.kind)[0]); }
    return { game, ks };
};
{
    const a = kindsFor('archer').ks, m = kindsFor('mage').ks, s = kindsFor('assassin').ks;
    check('普攻弹体造型', a.every(k => k === 5) && m.join() === '6,6,6,3' && s.every(k => k === 7),
        `弓手 ${a.join()} / 法师 ${m.join()} / 刺客 ${s.join()}`);
}
{
    const { game } = kindsFor('assassin');
    game.shoot();
    const snap = game.serializeState();
    const row = snap.p[0];
    const guest = new Game(); guest.init(); guest.mpMode = 'guest'; guest.projectiles = [];
    guest.applyRemoteState(snap);
    const gp = guest.projectiles[0];
    check('快照同步造型', row[1] === 7 && gp && gp.kind === 7 && Projectile.getPal(gp).key === 'kunai', `快照 kind ${row[1]},客机 kind ${gp && gp.kind}`);
}
{
    const keys = [0, 3, 4, 5, 6, 7].map(k => Projectile.getPal({ kind: k }).key).concat(Projectile.getPal({ gearBolt: true }).key);
    const missing = keys.filter(k => !Projectile.STYLES[k]);
    const N = Projectile.ANGLES;
    const idx = a => ((Math.round(a / (Math.PI * 2) * N) % N) + N) % N;
    const bad = [-Math.PI, -3, -0.01, 0, 0.01, 3, Math.PI, 7].map(idx).filter(i => i < 0 || i >= N);
    check('造型定义与方向下标', missing.length === 0 && bad.length === 0, `造型 ${keys.join(',')}${missing.length ? ' 缺 ' + missing : ''};越界 ${bad.length}`);
}

for (const [name, ok, msg] of results) console.log(ok ? 'PASS' : 'FAIL', name, '-', msg);
process.exit(results.every(r => r[1]) ? 0 : 1);

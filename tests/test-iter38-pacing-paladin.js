// test-iter38-pacing-paladin.js
// 1) 开局刷怪被压低时,击杀经验按 1/_spawnRamp 补回(0 秒 ×2,90 秒后 ×1)
// 2) 暗金遗物【狂徒铠甲】脱战 3 秒回血:原来判断 hurtCooldown <= -3,而 hurtCooldown 减到 0 就停,永远不生效
// 3) 圣骑士挨打后 1.5 秒内不回护盾
require('./setup-env.js');
const results = [];
const check = (name, ok, msg) => results.push([name, ok, msg]);
const tick = (g, n) => { for (let i = 0; i < n; i++) g._tickPlayerResources ? g._tickPlayerResources() : g.update(); };

{
    const game = new Game(); game.init(); game.startGame();
    const killAt = t => { game.gameTime = t; const e = game._newEnemy(0, 0, 'chaser'); game.enemies.push(e); const exp0 = game.exp; game.level = 99; game._onEnemyKilled(e); return game.exp - exp0; };
    const e0 = killAt(0), e45 = killAt(45), e120 = killAt(120);
    check('前期击杀经验补偿', Math.abs(e0 - 10) < 1e-6 && e45 > 5 && e45 < 10 && Math.abs(e120 - 5) < 1e-6, `0 秒 +${e0}, 45 秒 +${e45.toFixed(2)}, 120 秒 +${e120}`);
}

{
    const game = new Game(); game.init(); game.startGame();
    const p = game.player;
    p.relics = ['warmog_vest'];
    p.currentHealth = 50; p.hurtCooldown = 0;
    game.gameTime = 100; p.takeDamage(1, '测试'); // 刚挨打
    const hp0 = p.currentHealth;
    for (let i = 0; i < 60; i++) { game.gameTime += DT; game._tickPlayerResources(); } // ~1 秒
    const inCombat = p.currentHealth - hp0;
    game.gameTime = 104;
    const hp1 = p.currentHealth;
    for (let i = 0; i < 60; i++) { game.gameTime += DT; game._tickPlayerResources(); }
    const outCombat = p.currentHealth - hp1;
    check('狂徒铠甲脱战回血', inCombat < 1e-6 && outCombat > 1, `挨打后 1 秒内回血 ${inCombat.toFixed(2)}, 脱战后 1 秒回血 ${outCombat.toFixed(2)}`);
}

{
    const game = new Game(); game.init(); game.startGame();
    const p = game.player;
    game._applyClassToPlayer(p, 'paladin');
    p.shield = 0; game.gameTime = 50;
    p.takeDamage(1, '测试');
    for (let i = 0; i < 60; i++) { game.gameTime += DT; game._tickPlayerResources(); }
    const during = p.shield;
    for (let i = 0; i < 60; i++) { game.gameTime += DT; game._tickPlayerResources(); }
    const after = p.shield;
    check('圣骑士脱战回盾', during === 0 && after > 0, `挨打后 1 秒护盾 ${during.toFixed(1)}, 2 秒 ${after.toFixed(1)}`);
}

for (const [name, ok, msg] of results) console.log(ok ? 'PASS' : 'FAIL', name, '-', msg);
process.exit(results.every(r => r[1]) ? 0 : 1);

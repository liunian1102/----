// test-iter44-burrower.js
// 新敌人「潜伏者」:
// 1) 地下逼近 → 150px 内锁定玩家脚下 → 0.85 秒后在锁定点破土,范围内玩家受伤;锁定后玩家走开就打不中
// 2) 地下只吃三成伤害、没有碰撞伤害;破土后的硬直期全额受伤、有碰撞伤害
// 3) 被眩晕直接震出地面(不破土伤人)
// 4) 100 秒后才进刷怪池;快照同步状态与锁定点
require('./setup-env.js');
const results = [];
const check = (name, ok, msg) => results.push([name, ok, msg]);
const newGame = () => { const g = new Game(); g.init(); g.startGame(); g.enemies = []; g.items = []; g.bossTimer = 9999; g.spawnEnemies = () => {}; g._updateEvents = () => {}; return g; };

{
    const g = newGame();
    const p = g.player; p.x = 400; p.y = 300; p.hurtCooldown = 0;
    const e = g._newEnemy(100, 300, 'burrower'); e.burrowCD = 0; g.enemies.push(e);
    let lockedAt = -1, eruptHp = null;
    const hp0 = p.currentHealth;
    for (let i = 0; i < 400 && eruptHp === null; i++) {
        g.update();
        if (lockedAt < 0 && e.state === 1) lockedAt = i;
        if (e.state === 2) eruptHp = p.currentHealth;
    }
    check('锁定后破土命中', lockedAt >= 0 && eruptHp !== null && eruptHp < hp0, `锁定于第 ${lockedAt} 帧,玩家血 ${hp0}→${eruptHp}`);

    // 第二次:锁定后玩家走开
    const g2 = newGame();
    const p2 = g2.player; p2.x = 400; p2.y = 300; p2.hurtCooldown = 0;
    const e2 = g2._newEnemy(300, 300, 'burrower'); e2.burrowCD = 0; g2.enemies.push(e2);
    for (let i = 0; i < 200 && e2.state !== 1; i++) g2.update();
    p2.x = 600; p2.y = 500;
    const h2 = p2.currentHealth;
    for (let i = 0; i < 70 && e2.state !== 2; i++) g2.update();
    check('躲开破土', e2.state === 2 && p2.currentHealth === h2, `状态 ${e2.state},玩家血 ${h2}→${p2.currentHealth}`);
}

{
    const g = newGame();
    const e = g._newEnemy(100, 100, 'burrower'); e.defense = 0;
    e.state = 0; const a = e.takeDamage(100);
    e.state = 2; const b = e.takeDamage(100);
    e.state = 0; const c0 = e.contactDamage(); e.state = 2; const c2 = e.contactDamage();
    check('地下减伤与碰撞', Math.abs(a - 30) < 0.01 && Math.abs(b - 100) < 0.01 && c0 === 0 && c2 > 0, `地下 ${a},出土 ${b},碰撞 ${c0}/${c2.toFixed(1)}`);
}

{
    const g = newGame();
    const e = g._newEnemy(100, 100, 'burrower'); g.enemies.push(e);
    e._setState(1, 0.85); e.lockX = 200; e.lockY = 200;
    e.stunTimer = 1;
    e.update(400, 300, 800, 600, 30);
    check('眩晕震出地面', e.state === 2 && !e.erupt, `状态 ${e.state},破土 ${!!e.erupt}`);
}

{
    const g = newGame();
    const seen = t => {
        g.spawnEnemies = Game.prototype.spawnEnemies.bind(g);
        g.enemies = []; g.gameTime = t; const out = new Set();
        const rnd = Math.random; let k = 0;
        for (let i = 0; i < 3000; i++) { g.spawnEnemies(); for (const e of g.enemies) out.add(e.type); g.enemies.length = 0; }
        return out.has('burrower');
    };
    const early = seen(60), late = seen(150);
    const e = g._newEnemy(100, 100, 'burrower'); e._setState(1, 0.6); e.lockX = 333; e.lockY = 222; g.enemies = [e];
    const snap = g.serializeState();
    const guest = new Game(); guest.init(); guest.mpMode = 'guest'; guest.applyRemoteState(snap);
    const ge = guest.enemies[0];
    check('刷怪时机与同步', !early && late && ge && ge.type === 'burrower' && ge.state === 1 && Math.abs(ge.lockX - 333) < 1,
        `60 秒 ${early},150 秒 ${late},客机 ${ge && ge.type} 状态 ${ge && ge.state} 锁定 ${ge && ge.lockX}`);
}

for (const [name, ok, msg] of results) console.log(ok ? 'PASS' : 'FAIL', name, '-', msg);
process.exit(results.every(r => r[1]) ? 0 : 1);

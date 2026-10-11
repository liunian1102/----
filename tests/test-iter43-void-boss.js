// test-iter43-void-boss.js
// 虚空魔王(新魔王形态):第 3、5… 只为虚空形态,第 4 只仍是普通形态
// 1) 虚空闪现:前摇后半段锁定落点,释放时瞬移到落点并震伤范围内玩家
// 2) 虚空坍缩:在目标周围召出 3 个(狂暴 5 个)虚空区,倒计时结束只伤玩家、不伤敌人
// 3) 快照把形态、闪现落点、虚空区标记同步给客机
require('./setup-env.js');
const results = [];
const check = (name, ok, msg) => results.push([name, ok, msg]);

const newGame = () => { const g = new Game(); g.init(); g.startGame(); g.enemies = []; return g; };
const spawnWave = (g, n) => { g.bossWave = n - 1; g._spawnBoss(); return g.boss; };
const tick = (g, n) => { for (let i = 0; i < n; i++) g._updateBossAttacks(g.player); };

{
    const g = newGame();
    const forms = [1, 2, 3, 4, 5].map(n => spawnWave(g, n).form || '-');
    check('形态轮换', forms.join() === '-,-,void,-,void', forms.join());
}

{
    const g = newGame();
    const b = spawnWave(g, 3);
    const p = g.player;
    p.x = 400; p.y = 300; p.hurtCooldown = 0; p.dashTimer = 0;
    b.x = 100; b.y = 100; b.atkCD = 0;
    // 强制选闪现
    b.lastAtk = null; const rnd = Math.random; Math.random = () => 0;
    b.atk = null; b.atkCD = -1;
    g._updateBossAttacks = g._updateBossAttacks.bind(g);
    // 直接构造闪现前摇
    b.atk = 'blink'; b.atkPhase = 0; b.atkDur = b.atkTimer = 0.95; g._bossBlinkAim(b, p.x + p.size / 2, p.y + p.size / 2);
    Math.random = rnd;
    tick(g, 35);                          // 前 55%(约 32 帧)跟随
    p.x = 600; p.y = 450;                 // 锁定后再移动,落点不应跟过来
    const lockedX = b.blinkX;
    tick(g, 10);
    const hp0 = p.currentHealth;
    p.x = lockedX - p.size / 2; p.y = b.blinkY - p.size / 2; p.hurtCooldown = 0;
    tick(g, 30);                          // 释放
    const bcx = b.x + b.size / 2;
    check('虚空闪现', Math.abs(bcx - lockedX) < 1 && p.currentHealth < hp0, `落点 ${lockedX.toFixed(0)},魔王中心 ${bcx.toFixed(0)},玩家血 ${hp0.toFixed(0)}→${p.currentHealth.toFixed(0)}`);
}

{
    const g = newGame();
    const b = spawnWave(g, 3);
    const p = g.player;
    p.x = 380; p.y = 280; p.hurtCooldown = 0; p.dashTimer = 0;
    const e = g._newEnemy(p.x + 4, p.y + 4, 'chaser'); g.enemies.push(e);
    g.meteors = [];
    b.atk = 'rift'; b.atkPhase = 0; b.atkDur = b.atkTimer = 0.01;
    tick(g, 2);
    const zones = g.meteors.filter(m => m.v).length;
    b.enraged = true; b.atk = 'rift'; b.atkPhase = 0; b.atkDur = b.atkTimer = 0.01; g.meteors = [];
    tick(g, 2);
    const zonesEnraged = g.meteors.filter(m => m.v).length;
    const ehp = e.currentHealth, php = p.currentHealth;
    p.hurtCooldown = 0;
    for (let i = 0; i < 120; i++) g._updateMeteors();
    check('虚空坍缩', zones === 3 && zonesEnraged === 5 && g.meteors.length === 0 && p.currentHealth < php && e.currentHealth === ehp,
        `虚空区 ${zones}/${zonesEnraged},玩家血 ${php.toFixed(0)}→${p.currentHealth.toFixed(0)},敌人血不变 ${e.currentHealth === ehp}`);
}

{
    const g = newGame();
    const b = spawnWave(g, 3);
    b.atk = 'blink'; b.atkPhase = 0; b.blinkX = 321; b.blinkY = 222;
    g._spawnVoidZone(200, 200, 30, 1);
    const snap = g.serializeState();
    const guest = new Game(); guest.init(); guest.mpMode = 'guest';
    guest.applyRemoteState(snap);
    const gb = guest.boss;
    check('快照同步', gb && gb.form === 'void' && gb.title === '虚空魔王' && Math.abs(gb.blinkX - 321) < 1 && guest.meteors.some(m => m.v === 1),
        `客机形态 ${gb && gb.form},落点 ${gb && gb.blinkX},虚空区 ${guest.meteors.filter(m => m.v).length}`);
}

for (const [name, ok, msg] of results) console.log(ok ? 'PASS' : 'FAIL', name, '-', msg);
process.exit(results.every(r => r[1]) ? 0 : 1);

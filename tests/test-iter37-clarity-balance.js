// test-iter37-clarity-balance.js
// 1) 炮手同时在场有上限(难度 1 时 3 个),超出改刷追击者
// 2) 法师被动「法力护盾」:受伤 20% 由法力抵扣
// 3) 弓手被动「灵巧」:冲刺冷却 -30%,天生 12% 闪避;法师/弓手 +15 生命
// 4) 成就提示排在顶部横幅(事件 / 玩法说明 / 魔王将至)下方
require('./setup-env.js');
const results = [];
const check = (name, ok, msg) => results.push([name, ok, msg]);

{
    const game = new Game(); game.init(); game.startGame();
    game.difficulty = 1; game.gameTime = 300;
    const real = Math.random;
    let n = 0; Math.random = () => { n++; return n % 2 ? 0.0001 : 0.62; }; // 必刷;权重骰子落在炮手段
    for (let k = 0; k < 400; k++) game.spawnEnemies();
    Math.random = real;
    const gunners = game.enemies.filter(e => e.type === 'gunner').length;
    check('炮手上限', gunners <= Game.gunnerCap(1) && gunners > 0, `难度 1 炮手 ${gunners} 个 / 上限 ${Game.gunnerCap(1)}, 共 ${game.enemies.length} 个敌人`);
}

{
    const game = new Game(); game.init(); game.startGame();
    const p = game.player;
    game._applyClassToPlayer(p, 'mage');
    check('法师 +15 生命', p.maxHealth === 115, `maxHealth ${p.maxHealth}`);
    p.defense = 0; p.mana = 100; p.currentHealth = p.maxHealth;
    p.takeDamage(50, '测试');
    check('法力护盾', Math.abs(p.mana - 90) < 1e-6 && Math.abs(p.currentHealth - (p.maxHealth - 40)) < 1e-6, `法力 100→${p.mana}, 生命 ${p.maxHealth}→${p.currentHealth}`);
    p.mana = 0; const hp0 = p.currentHealth; p.takeDamage(50, '测试');
    check('没有法力时全额掉血', Math.abs(hp0 - p.currentHealth - 50) < 1e-6, `掉血 ${hp0 - p.currentHealth}`);
}

{
    const game = new Game(); game.init(); game.startGame();
    const p = game.player;
    const before = p.dashCdTotal(), def0 = p.defense, hp0 = p.maxHealth;
    game._applyClassToPlayer(p, 'archer');
    check('弓手冲刺冷却 -30%', Math.abs(p.dashCdTotal() - before * 0.7) < 1e-6, `${before.toFixed(2)}s → ${p.dashCdTotal().toFixed(2)}s`);
    check('弓手 +15 生命且无防御惩罚', p.maxHealth === hp0 + 15 && p.defense === def0, `生命 ${hp0}→${p.maxHealth}, 防御 ${def0}→${p.defense}`);
    let evaded = 0; const N = 4000;
    for (let k = 0; k < N; k++) { p.currentHealth = p.maxHealth; p.invincibleTimer = 0; p.dashTimer = 0; if (p.takeDamage(10, '测试') === 0) evaded++; }
    const rate = evaded / N;
    check('弓手 12% 闪避', Math.abs(rate - Player.ARCHER_EVADE) < 0.03, `闪避率 ${(rate * 100).toFixed(1)}%`);
}

{
    const game = new Game(); game.init(); game.startGame();
    game.bossState = 'idle'; game.bossTimer = 40; game.event = null;
    const a = game._topHudBottom();
    game._startEvent('meteor');
    const b = game._topHudBottom();
    game.event.timer = game.event.dur - 10; // 说明已消失
    const c = game._topHudBottom();
    game.bossTimer = 10;
    const d = game._topHudBottom();
    check('成就提示避开顶部横幅', a === 10 && b === 66 && c === 46 && d === 74, `无横幅 ${a}, 事件+说明 ${b}, 只有事件 ${c}, 事件+魔王将至 ${d}`);
}

for (const [name, ok, msg] of results) console.log(ok ? 'PASS' : 'FAIL', name, '-', msg);
process.exit(results.every(r => r[1]) ? 0 : 1);

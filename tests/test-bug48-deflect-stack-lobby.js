// test-bug48-deflect-stack-lobby.js
// 1) 偏折力场被子弹击中时只应震退敌人:原来走 _hitAround(0 伤害),会打爆身边的电浆水晶、给战士每个敌人额外 +10 怒气
// 2) 道具自动聚合最多 4 层:原来一次内层循环能合并成 6/8 层,炸弹半径与冰冻时长随层数无限放大
// 3) 返回大厅只重置不开局:原来单人模式 restartGame 会在大厅遮罩后面直接开跑新一局
require('./setup-env.js');
const results = [];

{
    const game = new Game();
    game.init(); game.startGame();
    const p = game.player;
    game._applyClassToPlayer(p, 'warrior');
    p.projDmgReduction = 0.35;
    p.rage = 0;
    const pcx = p.x + p.size / 2, pcy = p.y + p.size / 2;
    game.hazards = [{ id: 1, type: 'crystal', x: pcx + 30, y: pcy, size: 32, hp: 1, maxHp: 1, timer: Infinity, hitFlash: 0 }];
    const e = game._newEnemy(0, 0, 'chaser');
    e.x = pcx - 50 - e.size / 2; e.y = pcy - e.size / 2; // 50px 外,不贴身(贴身会先吃接触伤害进入无敌帧)
    e.currentHealth = e.maxHealth = 1000;
    game.enemies = [e];
    p.hurtCooldown = 0; p.dashTimer = 0;
    game.enemyBullets = [new EnemyBullet(p.x + p.size / 2 - 4, p.y + p.size / 2 - 4, 0, 0, 10)];
    game.checkCollisions();
    const ok = game.hazards.length === 1 && p.rage <= 15 + (p.rageOnHurtBonus || 0) && e.currentHealth === 1000 && Math.hypot(e.kbX || 0, e.kbY || 0) > 0;
    results.push(['偏折力场只击退', ok, `水晶剩 ${game.hazards.length} 个, 怒气 ${p.rage}, 敌人血量 ${e.currentHealth}, 击退 ${Math.hypot(e.kbX || 0, e.kbY || 0).toFixed(2)}`]);
}

{
    const game = new Game();
    game.init(); game.startGame();
    game.items = [];
    for (let k = 0; k < 8; k++) { const it = new Item(300 + k * 3, 300, 'bomb'); it.landTimer = 0; game.items.push(it); }
    for (let k = 0; k < 5; k++) game._mergeNearbyItems();
    const maxStack = Math.max(...game.items.map(it => it.stackCount || 1));
    const total = game.items.reduce((n, it) => n + (it.stackCount || 1), 0);
    results.push(['道具聚合最多 4 层', maxStack <= 4 && total === 8, `最大层数 ${maxStack}, 总数 ${total}, 剩 ${game.items.length} 堆`]);
}

{
    const game = new Game();
    game.init(); game.startGame();
    game.mpMode = null;
    game.restartGame(false);
    const stayed = !game.isRunning;
    game.restartGame();
    results.push(['返回大厅不自动开局', stayed && game.isRunning, `restartGame(false) 后运行中=${!stayed}, restartGame() 后运行中=${game.isRunning}`]);
}

for (const [name, ok, msg] of results) console.log(ok ? 'PASS' : 'FAIL', name, '-', msg);
process.exit(results.every(r => r[1]) ? 0 : 1);

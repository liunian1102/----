// test-iter45-balance.js
// 数值平衡(基于 5 职业 × 20 种子 × 900 秒的自动对局统计):
// 1) 第一只魔王所有招式伤害 × Game.FIRST_BOSS_DMG,之后的魔王不打折
// 2) 法师基础法力回复加成足够撑住法力护盾(回复是法师生存的瓶颈)
// 3) 魔王招式伤害都由 boss.attack 推出:打折后弹幕 / 震地同步变小
require('./setup-env.js');
const results = [];
const check = (name, ok, msg) => results.push([name, ok, msg]);

{
    const g = new Game(); g.init(); g.startGame(); g.enemies = [];
    const base = Math.max(50, g.player.maxHealth * 0.5);
    g.bossWave = 0; g._spawnBoss(); const a1 = g.boss.attack;
    g.bossWave = 1; g._spawnBoss(); const a2 = g.boss.attack;
    check('第一只魔王伤害打折', Math.abs(a1 - base * Game.FIRST_BOSS_DMG) < 1e-6 && Math.abs(a2 - base) < 1e-6 && Game.FIRST_BOSS_DMG < 1,
        `第 1 只 ${a1.toFixed(1)},第 2 只 ${a2.toFixed(1)}(基础 ${base})`);
    g.bossWave = 0; g._spawnBoss(); g.enemyBullets = [];
    g._bossRing(g.boss, 400, 300, 0);
    const ringDmg = g.enemyBullets[0] && g.enemyBullets[0].damage;
    check('弹幕伤害随之打折', Math.abs(ringDmg - base * Game.FIRST_BOSS_DMG * 0.3) < 1e-6, `弹幕 ${ringDmg && ringDmg.toFixed(1)}`);
}

{
    const g = new Game(); g.init(); g.startGame();
    const p = g.player;
    g._applyClassToPlayer(p, 'mage');
    const reg = p.manaRegen;
    p.mana = 0;
    for (let i = 0; i < Math.round(10 / DT); i++) g._tickPlayerResources();
    check('法师法力回复', CLASS_BASE_ADJUST.mage.manaRegen >= 5 && p.mana >= Math.min(p.maxMana, reg * 10) - 1,
        `回复 ${reg}/s,10 秒回到 ${p.mana.toFixed(0)}/${p.maxMana}`);
}

for (const [name, ok, msg] of results) console.log(ok ? 'PASS' : 'FAIL', name, '-', msg);
process.exit(results.every(r => r[1]) ? 0 : 1);

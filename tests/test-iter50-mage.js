// test-iter50-mage.js
// 法师增强:更大的法力池、魔力涌注按常量计算、斥力波更省、奥术屏障(低血时张开、到时消散、有冷却)
require('./setup-env.js');
const results = [];
const check = (name, ok, msg) => results.push([name, ok, msg]);
const fresh = () => { const g = new Game(); g.init(); g.startGame(); g.enemies = []; g._applyClassToPlayer(g.player, 'mage'); return g; };

{
    const g = fresh(), p = g.player;
    check('法力池', p.maxMana >= 50 && p.manaRegen >= 7, `法力 ${p.maxMana},回复 ${p.manaRegen}/s`);
    // 开着魔力涌注时普攻附加伤害、消耗法力
    const e = new Enemy(500, 300, 'giant', 1); e.currentHealth = e.maxHealth = 1e6; g.enemies.push(e);
    p.qToggleActive = true; p.mana = p.maxMana; g.projectiles = [];
    g.shoot();
    const proj = g.projectiles[0];
    const cost = Math.ceil(p.maxMana * Player.MAGE_SURGE_COST);
    check('魔力涌注', proj && Math.abs(proj.bonusMagicDmg - p.maxMana * Player.MAGE_SURGE_DMG) < 1e-6 && Math.abs(p.mana - (p.maxMana - cost)) < 1e-6,
        `附加 ${proj && proj.bonusMagicDmg},法力 ${p.maxMana}→${p.mana}`);
    // 涌注能长期维持:回复 ≥ 每秒消耗的 80%
    const perSec = cost / p.autoAttackInterval;
    check('涌注可持续', p.manaRegen >= perSec * 0.8, `消耗 ${perSec.toFixed(1)}/s,回复 ${p.manaRegen}/s`);
    // 斥力波
    p.mana = Player.MAGE_NOVA_COST; p.skillE.cooldown = 0;
    g._castSlot('e');
    check('斥力波耗法', p.mana === 0 && p.skillE.cooldown > 0 && CLASS_BASE_CD.mage.e <= 6.5, `冷却 ${p.skillE.cooldown.toFixed(2)}s`);
}
{   // 奥术屏障
    const g = fresh(), p = g.player;
    p.defense = 0; p.mana = 0;
    p.takeDamage(p.maxHealth * 0.75, '测试');
    check('奥术屏障触发', p.shield > 0 && Math.abs(p.shield - p.maxHealth * Player.MAGE_BARRIER) < 1e-6 && p.barrierCd > 0, `屏障 ${p.shield.toFixed(0)},冷却 ${p.barrierCd}`);
    const hp = p.currentHealth;
    p.takeDamage(10, '测试');
    check('屏障先吸收伤害', p.currentHealth === hp, `生命 ${hp}→${p.currentHealth}`);
    for (let i = 0; i < Math.ceil(Player.MAGE_BARRIER_T / DT) + 2; i++) p.update({}, 800, 600);
    check('屏障到时消散', p.shield === 0, `剩余 ${p.shield}`);
    p.currentHealth = p.maxHealth * 0.5; p.hurtCooldown = 0;
    p.takeDamage(p.maxHealth * 0.3, '测试');
    check('冷却中不再触发', !(p.shield > 0), `屏障 ${p.shield}`);
}

for (const [name, ok, msg] of results) console.log(ok ? 'PASS' : 'FAIL', name, '-', msg);
process.exit(results.every(r => r[1]) ? 0 : 1);

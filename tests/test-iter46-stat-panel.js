// test-iter46-stat-panel.js
// 角色面板的数值来自战斗结算同一套函数:
// 1) 闪避 evadeChance:弓手天生闪避 + 死神斗篷低血加成
// 2) 护甲 armorValue:限时装备防御、狂徒铠甲固定减免
// 3) 受伤倍率 damageTakenMult:战士满怒 -30%
// 4) 暴击 _critChance:刺客被动 20%;_statSheet 列出这些行
require('./setup-env.js');
const results = [];
const check = (name, ok, msg) => results.push([name, ok, msg]);
const newGame = cls => { const g = new Game(); g.init(); g.startGame(); if (cls) g._applyClassToPlayer(g.player, cls); return g; };

{
    const g = newGame('archer'), p = g.player;
    const base = p.evadeChance();
    p.relics = ['reaper_cloak']; p.currentHealth = p.maxHealth * 0.2;
    const low = p.evadeChance();
    check('闪避', Math.abs(base - Player.ARCHER_EVADE) < 1e-9 && Math.abs(low - base - 0.25) < 1e-9, `${base} → 低血 ${low}`);
}
{
    const g = newGame(), p = g.player;
    const a0 = p.armorValue();
    p.relics = ['warmog_vest']; g._equipGear('armor');
    const a1 = p.armorValue();
    check('护甲', Math.abs(a1.def - a0.def - GEARS.armor.defBonus) < 1e-9 && a1.flat - a0.flat === 5, `防御 ${a0.def}→${a1.def},固定减免 ${a0.flat}→${a1.flat}`);
}
{
    const g = newGame('warrior'), p = g.player;
    p.rage = p.maxRage;
    check('受伤倍率', Math.abs(p.damageTakenMult() - 0.7) < 1e-9, `满怒 ${p.damageTakenMult()}`);
}
{
    const g = newGame('assassin'), p = g.player;
    const crit = g._critChance(p, 'a');
    const rows = g._statSheet(p);
    const row = rows.find(r => r[0] === '暴击率');
    check('暴击与属性表', Math.abs(crit - 0.2) < 1e-9 && row && row[1] === '20%' && rows.some(r => r[0] === '蓄力') && rows.some(r => r[0] === '闪避'),
        `暴击 ${crit},表中 ${row && row[1]},共 ${rows.length} 行`);
}

for (const [name, ok, msg] of results) console.log(ok ? 'PASS' : 'FAIL', name, '-', msg);
process.exit(results.every(r => r[1]) ? 0 : 1);

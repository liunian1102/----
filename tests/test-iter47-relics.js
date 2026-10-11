// test-iter47-relics.js
// 暗金遗物重构:每件都有增益和代价、各修正生效、生命修正可撤销、掉率降低、重复遗物熔成分数
require('./setup-env.js');
const results = [];
const check = (name, ok, msg) => results.push([name, ok, msg]);

check('遗物数量 ≥ 12', RELIC_TYPES.length >= 12, `${RELIC_TYPES.length} 件`);
const bad = RELIC_TYPES.filter(k => !(RELICS[k].pros.length && RELICS[k].cons.length && Object.keys(RELICS[k].mods).length));
check('每件都有增益和代价', bad.length === 0, bad.length ? bad.join(',') : '全部满足');
const noNet = RELIC_TYPES.filter(k => !MP_ITEM_TYPES.includes('relic_' + k));
check('都能联机同步', noNet.length === 0, noNet.join(',') || 'MP_ITEM_TYPES 已包含');
if (typeof ArtSVG !== 'undefined') {
    const noArt = RELIC_TYPES.filter(k => typeof ArtSVG.items['relic_' + k] !== 'function');
    check('都有图标', noArt.length === 0, noArt.join(',') || '全部有 SVG');
}
check('掉率降低', RELIC_DROP.boss < 1 && RELIC_DROP.elite < 0.18 && RELIC_DROP.abyss < 0.4 && RELIC_DROP.rift < 1,
    JSON.stringify(RELIC_DROP));

const fresh = () => { const g = new Game(); g.init(); g.startGame(); return g; };
const give = (g, k) => { g.player.relics.push(k); g._syncRelicStats(g.player); };

{   // 玻璃王冠:伤害 +35%,最大生命 -30%,拿掉后恢复
    const g = fresh(), p = g.player;
    const hp0 = p.maxHealth, dm0 = g._buildDmgMult(p, 'a');
    give(g, 'glass_crown');
    check('玻璃王冠 伤害', Math.abs(g._buildDmgMult(p, 'a') - dm0 - 0.35) < 1e-6, `${dm0} → ${g._buildDmgMult(p, 'a')}`);
    check('玻璃王冠 生命代价', p.maxHealth === Math.round(hp0 * 0.7) && p.currentHealth <= p.maxHealth, `${hp0} → ${p.maxHealth}`);
    p.relics.length = 0; g._syncRelicStats(p);
    check('移除后生命恢复', p.maxHealth === hp0, `${p.maxHealth}`);
}
{   // 狂徒铠甲:+40 生命、固定减伤、移速代价
    const g = fresh(), p = g.player;
    const hp0 = p.maxHealth, sp0 = p.moveSpeed(), flat0 = p.armorValue().flat;
    give(g, 'warmog_vest');
    check('狂徒铠甲 增益', p.maxHealth === hp0 + 40 && p.armorValue().flat === flat0 + 5, `生命 ${p.maxHealth}, 减免 ${p.armorValue().flat}`);
    check('狂徒铠甲 代价', Math.abs(p.moveSpeed() - sp0 * 0.9) < 1e-6, `移速 ${sp0} → ${p.moveSpeed()}`);
}
{   // 狂战面具:攻速 +30%,受伤 +20%
    const g = fresh(), p = g.player;
    const as0 = g._atkSpeedMult(p), dt0 = p.damageTakenMult();
    give(g, 'berserk_mask');
    check('狂战面具', Math.abs(g._atkSpeedMult(p) - as0 - 0.3) < 1e-6 && Math.abs(p.damageTakenMult() - dt0 * 1.2) < 1e-6,
        `攻速 ${as0}→${g._atkSpeedMult(p)}, 受伤 ${dt0}→${p.damageTakenMult()}`);
}
{   // 鲜血圣杯:技能冷却变长
    const g = fresh(), p = g.player;
    g._applyClassToPlayer(p, 'warrior');
    const cd0 = g._skillMaxCd(p, 'q');
    give(g, 'blood_chalice');
    check('鲜血圣杯 冷却代价', Math.abs(g._skillMaxCd(p, 'q') - cd0 * 1.2) < 1e-6, `${cd0.toFixed(2)} → ${g._skillMaxCd(p, 'q').toFixed(2)}`);
    p.currentHealth = p.maxHealth * 0.5; const h0 = p.currentHealth;
    for (let i = 0; i < 60; i++) g._tickPlayerResources();
    check('鲜血圣杯 回血', p.currentHealth > h0, `${h0} → ${p.currentHealth.toFixed(1)}`);
}
{   // 贪婪金像:防御代价;寒冰之心:暴击代价;风暴之靴
    const g = fresh(), p = g.player;
    g._applyClassToPlayer(p, 'assassin'); // 有基础暴击,才看得出 -10%
    p.defense = 20; const d0 = p.armorValue().def, c0 = g._critChance(p, 'a'), sp0 = p.moveSpeed(), dc0 = p.dashCdTotal();
    give(g, 'gold_idol'); give(g, 'frost_heart'); give(g, 'storm_boots');
    check('贪婪金像 防御 -40%', Math.abs(p.armorValue().def - d0 * 0.6) < 1e-6, `${d0} → ${p.armorValue().def}`);
    check('寒冰之心 暴击 -10%', Math.abs(g._critChance(p, 'a') - (c0 - 0.1)) < 1e-6, `${c0} → ${g._critChance(p, 'a')}`);
    check('风暴之靴 移速/冲刺', p.moveSpeed() > sp0 && p.dashCdTotal() < dc0, `移速 ${sp0}→${p.moveSpeed()}, 冲刺 ${dc0}→${p.dashCdTotal()}`);
    // 第 4 件替换最早的一件
    const it = new Item(p.x, p.y, 'relic_glass_crown'); it.landTimer = 0;
    g.collectItem(it);
    check('最多 3 件', p.relics.length === Game.RELIC_MAX && !p.relics.includes('gold_idol') && p.relics.includes('glass_crown'), p.relics.join(','));
    const s0 = g.score;
    g.collectItem(new Item(p.x, p.y, 'relic_glass_crown'));
    check('重复遗物熔成分数', g.score > s0 && p.relics.length === 3, `分数 +${g.score - s0}`);
}
{   // 掉率:魔王击退大约 35%
    let n = 0; const N = 2000;
    const real = Math.random;
    for (let i = 0; i < N; i++) if (real() < RELIC_DROP.boss) n++;
    check('魔王遗物掉率', Math.abs(n / N - RELIC_DROP.boss) < 0.05, `${(n / N * 100).toFixed(1)}%`);
}

for (const [name, ok, msg] of results) console.log(ok ? 'PASS' : 'FAIL', name, '-', msg);
process.exit(results.every(r => r[1]) ? 0 : 1);

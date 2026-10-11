// test-iter48-talents.js
// 天赋扩充:新天赋、流派共鸣(3/6/9 层)、传说进化(前置才出现)以及各传说效果
require('./setup-env.js');
const results = [];
const check = (name, ok, msg) => results.push([name, ok, msg]);
const fresh = cls => { const g = new Game(); g.init(); g.startGame(); g.enemies = []; if (cls) g._applyClassToPlayer(g.player, cls); return g; };
const take = (g, id, n = 1) => { const d = g.talentDefs.find(t => t.id === id); for (let i = 0; i < n; i++) g._applyTalent(d); };

{
    const g = fresh();
    const defs = g.talentDefs;
    check('天赋数量 ≥ 75', defs.length >= 75, `${defs.length} 张`);
    const leg = defs.filter(t => t.rarity === 'legendary');
    check('传说进化 ≥ 8 且都有前置', leg.length >= 8 && leg.every(t => t.requires && Object.keys(t.requires).every(id => defs.some(d => d.id === id))), `${leg.length} 张`);
    const noSchool = defs.filter(t => !TALENT_SCHOOL[t.id]).map(t => t.id);
    check('每张都有流派', noSchool.length === 0, noSchool.join(',') || '全部归类');
    const noIcon = typeof Art !== 'undefined' ? defs.filter(t => !Art.has(t.icon)).map(t => t.id + t.icon) : [];
    check('图标都有 SVG', noIcon.length === 0, noIcon.join(',') || 'ok');
    // 没有前置时永远抽不到传说
    let seen = 0;
    for (let i = 0; i < 300; i++) if (g._rollTalentChoices(3).some(t => t.rarity === 'legendary')) seen++;
    check('前置未齐不出传说', seen === 0, `${seen} 次`);
    take(g, 'blade', 3); take(g, 'berserk', 1);
    let hit = 0;
    for (let i = 0; i < 400; i++) if (g._rollTalentChoices(3).some(t => t.id === 'swordSaint')) hit++;
    check('前置齐了会出传说', Math.abs(hit / 400 - Game.LEGEND_CHANCE) < 0.08, `${(hit / 4).toFixed(0)}%`);
}
{   // 流派共鸣:攻势 3 层 +5% 伤害,6 层 +12% 与暴击 +5%
    const g = fresh(), p = g.player;
    const d0 = g._buildDmgMult(p, 'a');
    take(g, 'blade', 2);
    check('2 层无共鸣', schoolState(p).tiers.atk === 0 && g._buildDmgMult(p, 'a') === d0, `tier ${schoolState(p).tiers.atk}`);
    take(g, 'blade', 1);
    check('3 层共鸣 1', schoolState(p).tiers.atk === 1 && Math.abs(g._buildDmgMult(p, 'a') - d0 - 0.05) < 1e-9, `${g._buildDmgMult(p, 'a')}`);
    take(g, 'precision', 3);
    check('6 层共鸣 2', schoolState(p).tiers.atk === 2 && Math.abs(g._critChance(p, 'a') - (0.15 + 0.05)) < 1e-9 && Math.abs(g._buildDmgMult(p, 'a') - d0 - 0.12) < 1e-9,
        `暴击 ${g._critChance(p, 'a')}, 伤害 ${g._buildDmgMult(p, 'a')}`);
    // 坚守共鸣 + 坚韧
    take(g, 'toughness', 3);
    // 坚韧 3 层 -12% + 坚守 3 层共鸣 -5%(同一个 key,相加)
    check('坚守共鸣与坚韧', Math.abs(p.damageTakenMult() - (1 - 0.12 - 0.05)) < 1e-9, `受伤倍率 ${p.damageTakenMult()}`);
}
{   // 不灭意志
    const g = fresh(), p = g.player;
    take(g, 'undying');
    p.currentHealth = 10; p.defense = 0;
    p.takeDamage(500, '测试');
    check('不灭意志挡下致死', p.currentHealth === Math.round(p.maxHealth * 0.3) || Math.abs(p.currentHealth - p.maxHealth * 0.3) < 1e-6, `生命 ${p.currentHealth}`);
    p.currentHealth = 10; p.hurtCooldown = 0; p.takeDamage(500, '测试');
    check('冷却中不再触发', p.currentHealth === 0, `生命 ${p.currentHealth}`);
}
{   // 不落要塞
    const g = fresh(), p = g.player;
    take(g, 'ironWall', 3); take(g, 'vitality', 2); take(g, 'fortress');
    p.defense = 0; p.currentHealth = p.maxHealth * 0.35;
    p.takeDamage(p.maxHealth * 0.1, '测试');
    check('不落要塞触发', p.fortressTimer > 0 && p.damageTakenMult() < 0.5, `计时 ${p.fortressTimer}, 倍率 ${p.damageTakenMult().toFixed(2)}`);
}
{   // 疾风之主
    const g = fresh(), p = g.player;
    take(g, 'galeLord');
    const a0 = g._atkSpeedMult(p), s0 = p.moveSpeed();
    p.tryDash();
    check('疾风之主', g._atkSpeedMult(p) - a0 > 0.49 && p.moveSpeed() > s0, `攻速 ${a0}→${g._atkSpeedMult(p)}, 移速 ${s0}→${p.moveSpeed()}`);
}
{   // 剑圣之魂:第 5 次命中触发范围剑气
    const g = fresh(), p = g.player;
    take(g, 'swordSaint');
    const mk = (x, y) => { const e = new Enemy(x, y, 'giant', 1); e.currentHealth = e.maxHealth = 1e6; g.enemies.push(e); return e; };
    const a = mk(300, 300), b = mk(330, 300);
    for (let i = 0; i < 5; i++) g._dealDamage(a, 1);
    const hb = b.currentHealth;
    for (let i = 0; i < 3; i++) g._tickPendingActions();
    check('剑圣之魂剑气波及周围', b.currentHealth < hb, `旁边敌人 ${hb} → ${b.currentHealth}`);
}
{   // 秘法奇点
    const g = fresh('warrior'), p = g.player;
    take(g, 'singularity');
    const e = new Enemy(300, 300, 'giant', 1); e.currentHealth = e.maxHealth = 1e6; g.enemies.push(e);
    const base = g._withCtx(Game.CTX.a, () => g._applyHitMods(p, e, 100));
    g._castSlot('q');
    const boosted = g._withCtx(Game.CTX.a, () => g._applyHitMods(p, e, 100));
    check('秘法奇点 下次普攻 ×3', p.singularityArmed === false && boosted > base * 2.5, `${base.toFixed(0)} → ${boosted.toFixed(0)}`);
}
{   // 新天赋修正生效
    const g = fresh('archer'), p = g.player;
    const cd0 = g._skillMaxCd(p, 'q'), ar0 = p.maxArrows, r0 = g._withCtx(Game.CTX.q, () => g._aoe(100));
    take(g, 'meditation', 2); take(g, 'wellspring'); take(g, 'widen');
    check('冥想冷却', g._skillMaxCd(p, 'q') < cd0, `${cd0.toFixed(2)} → ${g._skillMaxCd(p, 'q').toFixed(2)}`);
    check('源泉箭矢 +1', p.maxArrows === ar0 + 1, `${ar0} → ${p.maxArrows}`);
    check('广域', g._withCtx(Game.CTX.q, () => g._aoe(100)) > r0, `${r0} → ${g._withCtx(Game.CTX.q, () => g._aoe(100))}`);
}

for (const [name, ok, msg] of results) console.log(ok ? 'PASS' : 'FAIL', name, '-', msg);
process.exit(results.every(r => r[1]) ? 0 : 1);

// test-iter49-skill-anim.js
// 技能动画重构:SKILL_FX 渲染表(法阵 / 旋斩 / 锁链 / 残影 / 十字斩 / 光柱 / 落点圈 / 枪口焰)
//   每个职业的 Q / E 都会产生对应的新特效,施放成功会在脚下展开法阵;所有渲染器在整个播放过程中不抛错
require('./setup-env.js');
const results = [];
const check = (name, ok, msg) => results.push([name, ok, msg]);

const expect = {
    warrior: { q: ['spin', 'sigil'], e: ['chain', 'xslash', 'sigil'] },
    mage:    { e: ['sigil'] },
    assassin:{ q: ['afterimage', 'xslash', 'sigil'], e: ['xslash', 'sigil'] },
    archer:  { q: ['muzzle', 'sigil'], e: ['zone', 'sigil'] },
    paladin: { q: ['pillar', 'sigil'], e: ['sigil'] }
};
const seen = new Set();
for (const cls of Object.keys(expect)) {
    for (const slot of Object.keys(expect[cls])) {
        const g = new Game(); g.init(); g.startGame();
        g.enemies = []; g.effects = [];
        g._applyClassToPlayer(g.player, cls);
        const p = g.player; p.x = 400; p.y = 300;
        p.rage = 100; p.mana = p.maxMana; p.faith = 100; p.arrows = p.maxArrows; p.assassinCharge = 100;
        for (const [x, y] of [[480, 300], [420, 380], [330, 260]]) { const e = new Enemy(x, y, 'giant', 1); e.currentHealth = e.maxHealth = 1e6; g.enemies.push(e); }
        g._castSlot(slot);
        for (let i = 0; i < 20; i++) g._tickPendingActions && g._tickPendingActions();
        const types = new Set(g.effects.map(f => f.type));
        types.forEach(t => seen.add(t));
        const miss = expect[cls][slot].filter(t => !types.has(t));
        check(`${cls} ${slot.toUpperCase()} 特效`, miss.length === 0, miss.length ? '缺少 ' + miss.join(',') : [...types].filter(t => SKILL_FX[t]).join(','));
        // 播放全程渲染不抛错
        let err = null;
        try { for (let k = 0; k < 40; k++) { g.updateEffects(); g._renderEffects(); } } catch (e) { err = e.message; }
        check(`${cls} ${slot.toUpperCase()} 渲染`, !err, err || 'ok');
    }
}
const unused = Object.keys(SKILL_FX).filter(t => !seen.has(t));
check('所有 SKILL_FX 都被技能用到', unused.length === 0, unused.join(',') || '全部用到');
// 所有特效字段都是可同步的基础类型
{
    const g = new Game(); g.init(); g.startGame();
    g._applyClassToPlayer(g.player, 'warrior'); g.player.rage = 100;
    const e = new Enemy(460, 300, 'giant', 1); e.currentHealth = e.maxHealth = 1e6; g.enemies = [e];
    g._castSlot('q');
    const bad = g.effects.filter(f => SKILL_FX[f.type]).filter(f => Object.values(f).some(v => typeof v === 'object' && v !== null));
    check('特效字段可随快照同步', bad.length === 0, bad.map(f => f.type).join(',') || 'ok');
}

for (const [name, ok, msg] of results) console.log(ok ? 'PASS' : 'FAIL', name, '-', msg);
process.exit(results.every(r => r[1]) ? 0 : 1);

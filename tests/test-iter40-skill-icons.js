// test-iter40-skill-icons.js
// 1) 天赋卡 / 天赋树节点 / 技能石 / 专精 / 事件的图标都能在 art.js 里找到图(否则会退回成纯文字符号)
// 2) 每个职业(含专精)的 Q / E / R 都对应一张技能图
// 3) 圆章 SVG 把内图正确嵌进去(替换掉原来的 width/height,不能出现重复属性)
require('./setup-env.js');
const results = [];
const check = (name, ok, msg) => results.push([name, ok, msg]);

{
    const game = new Game();
    const defs = game._buildTalentDefs();
    const groups = {
        天赋: defs.map(d => d.icon),
        天赋树: TREE_NODES.filter(n => n.icon).map(n => n.icon).concat('✦'),
        技能石: GEM_TYPES.map(id => GEMS[id].icon),
        专精: Object.values(CLASS_SPECS).flat().map(sp => sp.icon),
        事件: EVENT_TYPES.map(t => GAME_EVENTS[t].icon)
    };
    for (const [name, icons] of Object.entries(groups)) {
        const missing = [...new Set(icons.filter(i => !Art.svgOf(i)))];
        check(`${name}图标`, missing.length === 0, missing.length ? `缺少: ${missing.join(' ')}` : `${icons.length} 个都有图`);
    }
}

{
    const missing = [];
    for (const cls of CLASS_ORDER) {
        if (!IconSVG['cls_' + cls]) missing.push('cls_' + cls);
        if (!IconSVG[SKILL_ART[cls].r]) missing.push(cls + ' R');
        for (const sp of [null, ...CLASS_SPECS[cls].map(s => s.id)]) {
            for (const slot of ['q', 'e']) {
                const k = skillArtKey(cls, sp, slot);
                if (!k || !IconSVG[k]) missing.push(`${cls}/${sp || '-'}/${slot}`);
            }
        }
    }
    check('技能图齐全', missing.length === 0, missing.length ? missing.join(', ') : '5 职业 × (基础 + 2 专精) × Q/E + R 全部有图');
}

{
    const bad = [];
    for (const k of ['✦', 'Q', '⚔', '💊', 'cls_mage']) {
        const s = Art.badgeSVG(k, '#4fc3f7');
        const innerTag = s.slice(s.indexOf('<svg', 10), s.indexOf('>', s.indexOf('<svg', 10)) + 1);
        if (!/x="21" y="21" width="58" height="58"/.test(innerTag) || (innerTag.match(/width=/g) || []).length !== 1) bad.push(k + ': ' + innerTag);
    }
    check('圆章内嵌图', bad.length === 0, bad.length ? bad.join(' | ') : '内图尺寸替换正确');
}

for (const [name, ok, msg] of results) console.log(ok ? 'PASS' : 'FAIL', name, '-', msg);
process.exit(results.every(r => r[1]) ? 0 : 1);

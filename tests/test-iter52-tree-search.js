// test-iter52-tree-search.js
// 天赋树搜索:空格分隔的多词 AND、不区分大小写、按名称/类型/系别/效果文字匹配、无命中与空搜索词
require('./setup-env.js');
const results = [];
const check = (name, ok, msg) => results.push([name, ok, msg]);

const g = new Game(); g.init(); g.startGame();
const ids = q => { const s = g._treeSearchHits(q); return s ? [...s].sort() : null; };

// 空搜索词:不做任何高亮
check('空搜索词返回 null', ids('') === null && ids('   ') === null && g._treeSearchHits(undefined) === null, JSON.stringify(ids('')));

// 按效果文字匹配:暴击类节点都要命中,且不命中无关节点
{
    const hits = g._treeSearchHits('暴击');
    const crit = TREE_NODES.filter(n => Object.keys(n.mods).includes('crit') && treeModLines(n.mods).some(l => l.includes('暴击')));
    const ok = crit.length > 0 && crit.every(n => hits.has(n.id)) && [...hits].every(id => treeModLines(TREE_BY_ID[id].mods).some(l => l.includes('暴击')) || TREE_BY_ID[id].name.includes('暴击') || (TREE_BY_ID[id].desc || '').includes('暴击'));
    check('按效果文字匹配(暴击)', ok, `命中 ${hits.size},暴击节点 ${crit.length}`);
}

// 按节点名称匹配(不区分大小写对中文无影响,这里验证名称子串)
{
    const hits = g._treeSearchHits('狂战');
    check('按名称匹配(狂战)', hits.has('sK'), `命中 ${[...hits].join(',')}`);
}

// 多词 AND:同时包含两个词才算命中
{
    const both = g._treeSearchHits('暴击 伤害');
    const one = g._treeSearchHits('暴击');
    const every = [...both].every(id => one.has(id));
    check('多词取交集', both.size <= one.size && every, `暴击 伤害 ${both.size} / 暴击 ${one.size}`);
    check('多词不相关则无命中', g._treeSearchHits('暴击 不存在的词xyz').size === 0, '');
}

// 按类型匹配:「基石」命中全部基石,「专精」命中全部专精
{
    const ks = TREE_NODES.filter(n => n.kind === 'keystone').map(n => n.id);
    const hitsK = g._treeSearchHits('基石');
    check('按类型匹配(基石)', ks.every(id => hitsK.has(id)) && hitsK.size === ks.length, `基石 ${ks.length},命中 ${hitsK.size}`);
    const ms = TREE_NODES.filter(n => n.kind === 'mastery').map(n => n.id);
    const hitsM = g._treeSearchHits('专精');
    check('按类型匹配(专精)', ms.every(id => hitsM.has(id)), `专精 ${ms.length},命中 ${hitsM.size}`);
}

// 按系别匹配:「力量」系节点都带系别文字
{
    const hits = g._treeSearchHits('力量');
    const strNodes = TREE_NODES.filter(n => n.br === 'str');
    check('按系别匹配(力量)', strNodes.every(n => hits.has(n.id)), `力量系 ${strNodes.length},命中 ${hits.size}`);
}

// 无命中
check('无命中返回空集合', g._treeSearchHits('zzzqqq').size === 0, '');

for (const [name, ok, msg] of results) console.log(ok ? 'PASS' : 'FAIL', name, '-', msg);
process.exit(results.every(r => r[1]) ? 0 : 1);

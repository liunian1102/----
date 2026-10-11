// test-iter51-tree.js
// 天赋树扩展:节点数量与结构、布局不重叠、专精门槛、最短路径点亮、联机编码(下标超过 36)、新修正生效
require('./setup-env.js');
const results = [];
const check = (name, ok, msg) => results.push([name, ok, msg]);

const kinds = {};
TREE_NODES.forEach(n => { kinds[n.kind] = (kinds[n.kind] || 0) + 1; });
check('节点数量', TREE_NODES.length >= 120 && kinds.keystone >= 15 && kinds.notable >= 40 && kinds.mastery === 3,
    `${TREE_NODES.length} 个节点 ${JSON.stringify(kinds)}`);
// 全部连通
{
    const seen = new Set(['start']), st = ['start'];
    while (st.length) for (const n of TREE_ADJ[st.pop()]) if (!seen.has(n)) { seen.add(n); st.push(n); }
    check('全部连通', seen.size === TREE_NODES.length, `${seen.size}/${TREE_NODES.length}`);
}
// 布局:任意两节点间距足够
{
    let min = Infinity, pair = '';
    for (let i = 0; i < TREE_NODES.length; i++) for (let j = i + 1; j < TREE_NODES.length; j++) {
        const a = TREE_NODES[i], b = TREE_NODES[j], d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d < min) { min = d; pair = a.id + '/' + b.id; }
    }
    check('节点不重叠', min >= 38, `最近 ${min.toFixed(0)}(${pair})`);
}
// 每个修正都有说明文字;基石都有代价
const noText = [...new Set(TREE_NODES.flatMap(n => Object.keys(n.mods)).filter(k => !TREE_MOD_TEXT[k]))];
check('修正都有说明', noText.length === 0, noText.join(',') || 'ok');
const isCost = (k, v) => v < 0 || (k === 'dmgTaken' && v > 0);
const freeKs = TREE_NODES.filter(n => n.kind === 'keystone' && !Object.entries(n.mods).some(([k, v]) => isCost(k, v))).map(n => n.name);
check('基石都有代价', freeKs.length === 0, freeKs.join(',') || 'ok');

const fresh = () => { const g = new Game(); g.init(); g.startGame(); g.level = 60; return g; };
{   // 最短路径点亮
    const g = fresh(), p = g.player;
    const path = g._treePath(p, 'sK');
    const free0 = g._treePoints(p).free;
    const n = g._treeAllocPath('sK');
    check('沿最短路径点亮', path.length >= 8 && n === path.length && p.treeNodes.has('sK') && g._treePoints(p).free === free0 - n,
        `路径 ${path.length} 个节点,点亮 ${n}`);
    // 专精:点数不够门槛时不能点
    const m = TREE_BY_ID.sM;
    const cnt = g._treeBranchCount(p, 'str');
    check('专精门槛', cnt < m.need && !g._treeCanAlloc(p, 'sM'), `力量系 ${cnt} / ${m.need}`);
    for (const id of ['s2', 'sN1', 'sSk', 's3', 'sN2', 'sa1', 'sa2', 'sa3']) if (g._treeBranchCount(p, 'str') < m.need) g._treeAllocPath(id);
    const leaf = [...p.treeNodes].find(id => id.startsWith('sa') && !TREE_ADJ[id].some(x => x !== 'sN1' && p.treeNodes.has(x) && TREE_BY_ID[x].idx > TREE_BY_ID[id].idx));
    check('达到门槛后可点', g._treeBranchCount(p, 'str') === m.need && g._treeAllocate('sM'), `力量系 ${g._treeBranchCount(p, 'str')}`);
    // 力量系刚好 14 个:再取消一个(叶子节点 sa1)会让专精不满足,不允许
    check('取消不能破坏专精门槛', !g._treeCanRefund(p, leaf) && g._treeRefund('sM') && g._treeCanRefund(p, leaf), `先取消专精才能取消 ${leaf}`);
}
{   // 联机编码:下标 > 36 的节点能还原
    const g = fresh(), p = g.player;
    g._treeAllocPath('r1'); g._treeAllocPath('rm3');
    const enc = g._encodeTree(p);
    const gp = new Player(0, 0, g); gp.treeNodes = new Set(['start']); gp._treeBase = { attack: 0, maxHealth: 0, defense: 0, speed: 0 };
    g._applyGuestBuild(gp, enc, '---------');
    const same = gp.treeNodes.size === p.treeNodes.size && [...p.treeNodes].every(id => gp.treeNodes.has(id));
    check('联机编码', same && Math.max(...[...p.treeNodes].map(id => TREE_BY_ID[id].idx)) > 36, `${p.treeNodes.size} 个节点,编码 ${enc.length} 字符`);
}
{   // 只经 statMod 生效的新修正
    const g = fresh(), p = g.player;
    const sp0 = p.moveSpeed();
    g._treeAllocPath('h31');   // 斩杀:execute
    g._treeAllocPath('db4');   // 灵动:moveSpd
    check('处决 / 移速修正', statMod(p, 'execute') > 0 && p.moveSpeed() > sp0, `execute ${statMod(p, 'execute')},移速 ${sp0}→${p.moveSpeed().toFixed(2)}`);
    const hp0 = p.maxHealth;
    g._treeAllocPath('sa4');   // 坚韧:maxHpPct
    g._syncRelicStats(p);
    check('最大生命百分比', p.maxHealth > hp0, `${hp0} → ${p.maxHealth}`);
}

for (const [name, ok, msg] of results) console.log(ok ? 'PASS' : 'FAIL', name, '-', msg);
process.exit(results.every(r => r[1]) ? 0 : 1);

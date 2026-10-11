// test-iter53-tree-points.js
// 天赋点与天赋卡货币解耦:天赋点 = 开局 2 + (等级 - 1) + 2 × 击退次数;选卡 / 跳过 / 潜能变化都不影响天赋点
require('./setup-env.js');
const results = [];
const check = (name, ok, msg) => results.push([name, ok, msg]);

const fresh = () => { const g = new Game(); g.init(); g.startGame(); g.enemies = []; g.runBossRepels = 0; g.level = 1; g.player.potentialPoints = 0; return g; };

{   // 开局:2 点,无升级、无击退
    const g = fresh();
    check('开局赠送 2 点', g._treePoints().total === 2 && g._treePoints().free === 2, JSON.stringify(g._treePoints()));
}
{   // 每级 +1
    const g = fresh(); g.level = 5;
    check('每升 1 级 +1 点', g._treePoints().total === 2 + 4, `Lv5 total=${g._treePoints().total}`);
}
{   // 每次击退 +2
    const g = fresh(); g.level = 5; g.runBossRepels = 2;
    check('每次击退 +2 点', g._treePoints().total === 2 + 4 + 4, `Lv5 + 2 次击退 total=${g._treePoints().total}`);
}
{   // 天赋卡货币不进天赋点
    const g = fresh(); g.level = 5; g.runBossRepels = 2;
    const before = g._treePoints().total;
    g.player.potentialPoints = 7;
    const a = g._treePoints().total;
    g.player.addPotentialPoints(3);
    const b = g._treePoints().total;
    check('潜能点不进天赋点总数', before === a && a === b, `before=${before} withPotential=${a} afterAdd=${b}`);
}
{   // 选卡不扣天赋点
    const g = fresh(); g.level = 3;
    g.player.potentialPoints = 1;
    g.currentTalentChoices = g._rollTalentChoices(3);
    const free0 = g._treePoints().free;
    const pot0 = g.player.potentialPoints;
    g.handlePotentialChoice(1);
    check('选天赋卡不扣天赋点', g._treePoints().free === free0 && g.player.potentialPoints === pot0 - 1,
        `free ${free0}→${g._treePoints().free},潜能 ${pot0}→${g.player.potentialPoints}`);
}
{   // 跳过天赋卡也不改变天赋点
    const g = fresh(); g.level = 3;
    g.player.potentialPoints = 2;
    g.currentTalentChoices = g._rollTalentChoices(3);
    const free0 = g._treePoints().free;
    g.handlePotentialChoice(0);
    check('跳过天赋卡不改变天赋点', g._treePoints().free === free0, `free ${free0}→${g._treePoints().free}`);
}
{   // 点亮节点只扣天赋点,不动天赋卡货币
    const g = fresh(); g.level = 1; g.player.potentialPoints = 4;
    const free0 = g._treePoints().free;
    const ok = g._treeAllocate('d1');   // 起点旁的小天赋,花费 1
    check('点亮节点扣 1 点天赋点', ok && g._treePoints().free === free0 - 1 && g.player.potentialPoints === 4,
        `allocate=${ok},free ${free0}→${g._treePoints().free},潜能 ${g.player.potentialPoints}`);
}

for (const [name, ok, msg] of results) console.log(ok ? 'PASS' : 'FAIL', name, '-', msg);
process.exit(results.every(r => r[1]) ? 0 : 1);

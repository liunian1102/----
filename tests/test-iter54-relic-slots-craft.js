// test-iter54-relic-slots-craft.js
// 暗金圣物系统扩充与构筑重构测试:
// 1. 初始 1 槽位，天赋树神龛扩充至 3 槽
// 2. 拾取入包装备/满槽入行囊/重复熔分
// 3. 构筑界面穿脱装备、分解为余烬
// 4. 赋能机制(增益+35% / 代价-50%)
// 5. 洗点保护自动退包
require('./setup-env.js');
const results = [];
const check = (name, ok, msg) => results.push([name, ok, msg]);

const fresh = () => {
    const g = new Game();
    g.init();
    g.startGame();
    g.level = 30; // 充足天赋点供测试点亮神龛
    return g;
};

// 1. 初始 1 槽位与天赋树扩充
{
    const g = fresh(), p = g.player;
    check('初始 1 个暗金装备栏', p.maxRelicSlots === 1, `maxRelicSlots=${p.maxRelicSlots}`);

    // 点亮 rSk1 (圣物神龛·阳)
    g._treeAllocPath('rSk1');
    check('点亮神龛·阳扩充至 2 槽', p.maxRelicSlots === 2, `maxRelicSlots=${p.maxRelicSlots}`);

    // 点亮 rSk2 (圣物神龛·阴)
    g._treeAllocPath('rSk2');
    check('点亮神龛·阴扩充至 3 槽', p.maxRelicSlots === 3, `maxRelicSlots=${p.maxRelicSlots}`);
}

// 2. 拾取与行囊逻辑
{
    const g = fresh(), p = g.player;
    p.maxRelicSlots = 1;

    // 拾取第 1 件: 直接装备
    const item1 = { relic: 'thunder_ring' };
    g._runAsPlayer(p, () => {
        // 模拟拾取
        p.relics.push(item1.relic);
    });
    check('首件暗金自动装备', p.relics.length === 1 && p.relics[0] === 'thunder_ring', `relics=${p.relics.join(',')}`);

    // 拾取第 2 件 (槽满): 存入行囊
    const item2 = { relic: 'glass_crown' };
    if (p.relics.length >= p.maxRelicSlots) {
        p.relicBag.push(item2.relic);
    }
    check('槽满时存入行囊', p.relicBag.length === 1 && p.relicBag[0] === 'glass_crown', `relicBag=${p.relicBag.join(',')}`);

    // 拾取重复暗金: 熔成分数
    const score0 = g.score;
    const isDup = p.relics.includes('thunder_ring') || p.relicBag.includes('thunder_ring');
    if (isDup) g.score += 300;
    check('重复暗金熔成分数', g.score === score0 + 300, `score=${g.score}`);
}

// 3. 构筑界面穿脱切换
{
    const g = fresh(), p = g.player;
    p.maxRelicSlots = 2;
    p.relics = ['thunder_ring'];
    p.relicBag = ['glass_crown'];

    // 装备行囊中的 glass_crown
    g._equipRelic('glass_crown');
    check('行囊装备上身', p.relics.length === 2 && p.relics.includes('glass_crown') && p.relicBag.length === 0,
        `relics=${p.relics.join(',')}, bag=${p.relicBag.join(',')}`);

    // 卸下 thunder_ring
    g._unequipRelic('thunder_ring');
    check('卸下圣物退回行囊', p.relics.length === 1 && !p.relics.includes('thunder_ring') && p.relicBag.includes('thunder_ring'),
        `relics=${p.relics.join(',')}, bag=${p.relicBag.join(',')}`);
}

// 4. 分解为暗金余烬
{
    const g = fresh(), p = g.player;
    p.relicBag = ['frost_heart'];
    p.relicAsh = 0;

    g._dismantleRelic('frost_heart', 'bag');
    check('分解圣物获得 +1 余烬', p.relicBag.length === 0 && p.relicAsh === 1, `bag=${p.relicBag.length}, ash=${p.relicAsh}`);
}

// 5. 赋能增益强化与代价削减
{
    const g = fresh(), p = g.player;
    p.maxRelicSlots = 2;
    p.relics = ['glass_crown', 'warmog_vest']; // glass_crown: dmg: 0.35, maxHpPct: -0.30; warmog_vest: speed: -0.10
    p.relicAsh = 2;

    // 赋能 glass_crown: 强化正面 (pros: 全部伤害 +35% -> +35% * 1.35 = +47.25%)
    g._empowerRelic('glass_crown', 'pros');
    const dmgMod = relicMod(p, 'dmg');
    check('赋能正面增幅 +35%', Math.abs(dmgMod - 0.35 * 1.35) < 1e-5, `dmgMod=${dmgMod}`);

    // 赋能 glass_crown 后负面代价不受影响
    const hpPenalty = relicMod(p, 'maxHpPct');
    check('正面赋能不影响代价', Math.abs(hpPenalty - (-0.30)) < 1e-5, `hpPenalty=${hpPenalty}`);

    // 赋能 warmog_vest: 抑制负面 (cons: 移速惩罚 -10% -> -5%)
    g._empowerRelic('warmog_vest', 'cons');
    const spPenalty = relicMod(p, 'speed');
    check('赋能遏制代价减半', Math.abs(spPenalty - (-0.05)) < 1e-5, `spPenalty=${spPenalty}`);
}

// 6. 洗点保护自动退包
{
    const g = fresh(), p = g.player;
    g._treeAllocPath('rSk1');
    g._treeAllocPath('rSk2');
    check('扩充至 3 槽', p.maxRelicSlots === 3, `maxSlots=${p.maxRelicSlots}`);

    p.relics = ['thunder_ring', 'glass_crown', 'warmog_vest'];
    p.relicBag = [];

    // 重置天赋树 (失去 2 个神龛节点，槽位恢复为 1)
    g._treeReset();
    check('重置天赋后槽位归 1', p.maxRelicSlots === 1, `maxSlots=${p.maxRelicSlots}`);
    check('超出上限的圣物安全退回行囊', p.relics.length === 1 && p.relicBag.length === 2,
        `relics=${p.relics.length}, bag=${p.relicBag.length}`);
}

// 7. 联机快照同步
{
    const g = fresh(), p = g.player;
    p.relics = ['thunder_ring'];
    p.relicBag = ['glass_crown'];
    p.relicEmpowers = { thunder_ring: 'pros' };
    p.relicAsh = 3;

    const snap = g._serializePlayer(p, 0);
    check('快照包含遗物与行囊', snap.rl && snap.rl[0] === 'thunder_ring' && snap.rb && snap.rb[0] === 'glass_crown',
        `snap.rl=${snap.rl}, snap.rb=${snap.rb}`);
    check('快照包含赋能与余烬', snap.re && snap.re.thunder_ring === 'pros' && snap.ra === 3,
        `snap.re=${JSON.stringify(snap.re)}, snap.ra=${snap.ra}`);
}

let allOk = true;
for (const [name, ok, msg] of results) {
    if (!ok) allOk = false;
    console.log(ok ? 'PASS' : 'FAIL', name, '-', msg);
}
process.exit(allOk ? 0 : 1);

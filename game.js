const DT = 16 / 1000; // 单帧时长(秒),与 setInterval(16ms) 对应

// 职业 Q/E 技能基础冷却(秒),职业选择 + 技能升级天赋共用
const CLASS_BASE_CD = {
    warrior:  { q: 3, e: 5  },
    mage:     { q: 1, e: 8  },
    assassin: { q: 4, e: 6  },
    archer:   { q: 3, e: 8  },
    paladin:  { q: 4, e: 12 }
};

// 选择职业时叠加的基础属性偏移,强化职业特色
//  - warrior 攻高防低血厚
//  - archer  攻偏高、防低、自动攻击投射物倍率高
//  - assassin 移速高
//  - paladin 防高血厚、攻低
//  - mage    法力回复加强
const CLASS_BASE_ADJUST = {
    warrior:  { attack:  10, defense: -5, maxHealth: 20 },
    mage:     { manaRegen: 2, maxMana: 10 },
    archer:   { attack:   8, defense: -5, autoAttackDmgMult: 1.3 },
    assassin: { speed:  1.5 },
    paladin:  { defense: 10, attack:  -5, maxHealth: 30 }
};

// 职业主色(选择卡片、HUD、进阶光环共用)
const CLASS_COLORS = { warrior: '#ff6b3a', mage: '#4ecdc4', assassin: '#aa66ff', archer: '#aaff44', paladin: '#ffd700' };
const CLASS_NAMES = { warrior: '战士', mage: '法师', assassin: '刺客', archer: '弓手', paladin: '圣骑士' };

// 阶段性职业强化:SPEC_LEVEL 级进阶(二选一专精),AWAKEN_LEVEL 级觉醒(强化所选专精)
// 效果在技能/被动代码里按 player.spec / player.awakened 读取,_applySpec / _awakenPlayer 只处理一次性的属性变化
const SPEC_LEVEL = 5;
const AWAKEN_LEVEL = 7;
const CLASS_SPECS = {
    warrior: [
        { id: 'berserker', name: '狂战士', icon: '🌀', q: '旋', e: '盾',
          desc: '旋风斩变为跟随自身的持续旋风(1.5 秒,连续斩击);怒气不再衰减',
          awaken: '旋风持续 2.5 秒、范围 +30%,每次命中回复 1% 生命' },
        { id: 'guardian', name: '铁卫', icon: '🛡️', q: '旋', e: '冲',
          desc: '盾击变为盾冲:冲向目标,撞开并晕眩沿途敌人;防御 +8,受伤怒气翻倍',
          awaken: '不屈:受到致命伤害时保留 1 点生命并无敌 3 秒(每 60 秒一次)' }
    ],
    mage: [
        { id: 'pyro', name: '炎术师', icon: '🔥', q: '涌', e: '炎',
          desc: '普攻全部变为爆裂火球(范围伤害);魔力涌注附加伤害 +30%',
          awaken: '斥力波变为烈焰新星,并留下持续 3 秒的燃烧地面' },
        { id: 'frost', name: '冰霜法师', icon: '❄', q: '涌', e: '冰',
          desc: '斥力波变为冰霜新星:冻结范围内敌人 2 秒;奥术弹附带冰冻',
          awaken: '碎冰:对冻结中的敌人伤害 +60%' }
    ],
    assassin: [
        { id: 'shadow', name: '影舞者', icon: '🌙', q: '闪', e: '刺',
          desc: '闪现斩击杀后立即刷新冷却;暴击率 +15%',
          awaken: '闪现斩落点追加范围斩击,击杀后获得 0.6 秒无敌' },
        { id: 'venom', name: '毒刃', icon: '☠', q: '闪', e: '刺',
          desc: '所有攻击附带剧毒(3 秒,最多 5 层,每层每秒 20% 攻击伤害)',
          awaken: '中毒敌人死亡时毒雾爆发,让周围敌人中 3 层剧毒' }
    ],
    archer: [
        { id: 'sniper', name: '神射手', icon: '🎯', q: '狙', e: '雨',
          desc: '穿透箭伤害 +60%,对精英/魔王再 ×1.5;站定专注的攻速加成翻倍',
          awaken: '穿透箭一次射出 3 支(扇形)' },
        { id: 'ranger', name: '游侠', icon: '🏹', q: '穿', e: '雨',
          desc: '普攻额外 +2 发散射;箭雨的每支箭都追踪敌人落下',
          awaken: '箭雨不再消耗箭矢,箭数 ×1.5' }
    ],
    paladin: [
        { id: 'crusader', name: '审判者', icon: '⚖', q: '审', e: '环',
          desc: '圣光打击变为审判之锤:晕眩目标周围所有敌人;圣锤普攻伤害 +50%',
          awaken: '每第 4 次圣锤召唤天降圣光柱(3 倍伤害)' },
        { id: 'protector', name: '守护者', icon: '✚', q: '圣', e: '护',
          desc: '护盾上限翻倍;圣锤附加 5% 最大生命 + 50% 当前护盾伤害;神圣光环半径扩大、按最大生命灼烧并治疗队友',
          awaken: '圣光反击:受到攻击时对周围敌人反弹 1.5 倍伤害;光环内玩家减伤 50%,光环持续 +3 秒' }
    ]
};
function specDef(p) {
    const list = p && p.class && CLASS_SPECS[p.class];
    return list ? list.find(s => s.id === p.spec) || null : null;
}

function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    addRoundRect(ctx, x, y, w, h, r);
}

// 只往当前路径追加一个圆角矩形子路径(不 beginPath),用于把多个圆角矩形合并成一次 fill
function addRoundRect(ctx, x, y, w, h, r) {
    if (!(w > 0) || !(h > 0)) return; // 进度条比例越界时宽度可能为负,arcTo 负半径会抛异常、整帧渲染中断
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
}

// 离屏精灵缓存:把带 shadowBlur/渐变的静态图形预渲染一次,之后每帧只 drawImage。
// scale = 每逻辑像素对应的设备像素(Game.gameScale),窗口缩放时清空重建,保证高分屏清晰。
const SpriteCache = {
    scale: 1,
    dpr: 1,
    map: new Map(),
    setScale(scale, dpr) {
        if (scale !== this.scale || dpr !== this.dpr) {
            this.scale = scale;
            this.dpr = dpr;
            this.map.clear();
        }
    },
    // 光晕按 CSS 像素计算(与主画布 shadowBlur 的观感一致)
    blur(v) { return v * this.dpr; },
    // w/h 为逻辑尺寸,pad 为光晕外扩;draw(g) 在 (0,0)-(w,h) 坐标系内绘制
    get(key, w, h, pad, draw) {
        let c = this.map.get(key);
        if (!c) {
            c = document.createElement('canvas');
            c.width = Math.max(1, Math.ceil((w + pad * 2) * this.scale));
            c.height = Math.max(1, Math.ceil((h + pad * 2) * this.scale));
            const g = c.getContext('2d');
            g.scale(c.width / (w + pad * 2), c.height / (h + pad * 2));
            g.translate(pad, pad);
            draw(g);
            c.pad = pad;
            this.map.set(key, c);
        }
        return c;
    },
    // 在 (x,y) 处按逻辑尺寸 w×h 绘制缓存精灵
    draw(ctx, c, x, y, w, h) {
        ctx.drawImage(c, x - c.pad, y - c.pad, w + c.pad * 2, h + c.pad * 2);
    },
    // 按精灵原生像素 1:1 绘制,左上角对齐到设备像素:整体变换退化为整数平移,
    // Skia 走直接拷贝而不做插值缩放,大批量绘制时快数倍。位置误差 ≤ 半个设备像素,肉眼不可见。
    // snap = 当前画布变换 {a, e, f}(只含缩放 + 平移,a 即 gameScale,与精灵的 scale 相同)
    drawPx(ctx, c, x, y, snap) {
        const a = snap.a;
        const dx = Math.round((x - c.pad) * a + snap.e);
        const dy = Math.round((y - c.pad) * a + snap.f);
        ctx.drawImage(c, (dx - snap.e) / a, (dy - snap.f) / a, c.width / a, c.height / a);
    },
    // 光晕 blur(CSS 像素)换算成精灵需要的逻辑外扩:高斯 σ = blur/2,画到 3σ 基本看不见
    padFor(blur) { return Math.ceil(blur * 1.5 * this.dpr / this.scale) + 2; },
    // 只画形状的光晕、不画形状本身:形状画到画布外很远处,再用 shadowOffset(设备像素,不受变换影响)把阴影移回来。
    // 形状本体由调用方每帧用矢量画,这样 globalAlpha 下"光晕 + 本体"的叠加与原来逐帧 shadowBlur 完全一致。
    glowOnly(g, blur, color, shape) {
        const off = 10000;
        g.save();
        g.shadowColor = color;
        g.shadowBlur = this.blur(blur);
        g.shadowOffsetX = off * g.getTransform().a;
        g.translate(-off, 0);
        shape(g);
        g.restore();
    }
};

// 场上敌人数量上限(随难度从 50 增至 80),防止挂机堆怪拖垮帧率
// 难度模式:start 起始难度、ramp 每多少秒 +1、cap 封顶、score 分数倍率。大厅选择,联机以房主为准
const DIFF_MODES = {
    easy:   { name: '轻松', color: '#69f0ae', start: 1,   ramp: 140, cap: 3, score: 0.6, desc: '敌人成长更慢、上限更低,分数 ×0.6' },
    normal: { name: '普通', color: '#4fc3f7', start: 1,   ramp: 90,  cap: 4, score: 1,   desc: '标准体验' },
    hard:   { name: '噩梦', color: '#ff5252', start: 1.5, ramp: 60,  cap: 4, score: 1.5, desc: '开局更强、更快到顶,分数 ×1.5' }
};
const DIFF_KEYS = Object.keys(DIFF_MODES);
const diffDef = k => DIFF_MODES[k] || DIFF_MODES.normal;

const maxEnemiesFor = difficulty => Math.floor(40 + 10 * difficulty);

// 大厅卡片上的最高纪录
function updateBestScoreLabel() {
    const el = document.getElementById('bestScore');
    if (!el) return;
    const b = Store.get('blockrun.best', null);
    el.textContent = b && (b.score > 0 || b.time > 0) ? `最高分 ${b.score} · 最长生存 ${b.time} 秒` : '';
}

// 大厅卡片上的累计进度摘要
function updateProgressLabel() {
    const el = document.getElementById('progressSummary');
    if (!el) return;
    const p = Progress.load();
    const done = ACHIEVEMENTS.filter(a => p.achievements[a.id]).length;
    el.textContent = p.runs > 0 ? `累计得分 ${p.totalScore} · 已玩 ${p.runs} 局 · 成就 ${done}/${ACHIEVEMENTS.length}` : '';
}

// 「成就与外观」面板:累计数据、外观选择、成就列表
function renderProgressPanel() {
    const p = Progress.load();
    const cur = Progress.currentSkin();
    const done = ACHIEVEMENTS.filter(a => p.achievements[a.id]).length;
    const stat = (v, label) => `<div><b>${v}</b>${label}</div>`;
    document.getElementById('progressStats').innerHTML =
        stat(p.totalScore, '累计得分') + stat(p.runs, '游戏局数') + stat(p.bossRepels, '击退魔王');
    document.getElementById('achCount').textContent = `${done}/${ACHIEVEMENTS.length}`;

    const skinList = document.getElementById('skinList');
    skinList.innerHTML = '';
    for (const sk of SKINS) {
        const unlocked = Progress.skinUnlocked(sk, p);
        const btn = document.createElement('button');
        btn.className = 'skin-item' + (sk.id === cur.id ? ' selected' : '') + (unlocked ? '' : ' locked');
        const sw = document.createElement('span');
        sw.className = 'swatch';
        sw.style.background = sk.prism
            ? 'linear-gradient(135deg, #ff8a80, #ffd180, #b9f6ca, #80d8ff, #ea80fc)'
            : `linear-gradient(135deg, ${sk.c1}, ${sk.c2})`;
        sw.style.boxShadow = `0 0 8px ${sk.glow}`;
        const name = document.createElement('span');
        name.textContent = sk.name;
        btn.append(sw, name);
        if (!unlocked) {
            const need = document.createElement('span');
            need.className = 'need';
            need.textContent = '🔒 ' + Progress.skinNeedText(sk);
            btn.append(need);
        }
        btn.disabled = !unlocked;
        btn.addEventListener('click', () => {
            const prof = Progress.load();
            prof.skin = sk.id;
            Progress.save(prof);
            renderProgressPanel();
        });
        skinList.append(btn);
    }

    const achList = document.getElementById('achList');
    achList.innerHTML = '';
    for (const a of ACHIEVEMENTS) {
        const row = document.createElement('div');
        row.className = 'ach-item' + (p.achievements[a.id] ? ' done' : '');
        row.innerHTML = '<span class="ach-icon"></span><div><div class="ach-name"></div><div class="ach-desc"></div></div>';
        row.querySelector('.ach-icon').textContent = a.icon;
        row.querySelector('.ach-name').textContent = a.name;
        row.querySelector('.ach-desc').textContent = a.desc;
        achList.append(row);
    }
}

// 实体唯一 id:联机时 guest 按 id 复用对象并在两次快照之间插值
let _entityIdSeq = 0;
const nextEntityId = () => ++_entityIdSeq;

// 联机快照数值量化,缩小网络包
const q1 = v => Math.round(v * 10) / 10;
const q2 = v => Math.round(v * 100) / 100;
// 伤害来源(统计顺序 / 名称 / 颜色),见 Game._recDmg 与暂停面板、结算页的伤害构成条
const DMG_SRCS = ['a', 'q', 'e', 'dot', 'gear', 'body', 'other'];
const DMG_SRC_INFO = {
    a: { name: '普攻', color: '#4fc3f7' }, q: { name: 'Q 技能', color: '#ffb74d' }, e: { name: 'E 技能', color: '#ce93d8' },
    dot: { name: '持续', color: '#9ccc65' }, gear: { name: '装备', color: '#ffd54f' },
    body: { name: '碰撞', color: '#ef9a9a' }, other: { name: '其他', color: '#90a4ae' }
};
const MP_ENEMY_TYPES = ['chaser', 'patroller', 'giant', 'gunner', 'dasher', 'bomber', 'treasure', 'healer', 'splitter', 'shard'];

// 随机事件(两次魔王之间触发,由 host/单人调度,经快照 ev 下发给 guest)
const GAME_EVENTS = {
    meteor:   { name: '流星雨',   icon: '🌠', color: '#ff9100', dur: 10, desc: '躲开地面红圈,陨石也会砸伤敌人' },
    treasure: { name: '宝藏方块', icon: '💰', color: '#ffd740', dur: 14, desc: '追上并击败它,掉落装备和一堆道具' },
    elite:    { name: '精英来袭', icon: '♛', color: '#ffc400', dur: 20, desc: '击败金框精英怪获得额外奖励' },
    horde:    { name: '怪潮',     icon: '🌊', color: '#40c4ff', dur: 12, desc: '敌人大量涌来,击杀经验和分数翻倍' },
    altar:    { name: '祝福祭坛', icon: '✨', color: '#b388ff', dur: 18, desc: '站进光圈为祭坛充能,充满后全队获得祝福' }
};
const EVENT_TYPES = Object.keys(GAME_EVENTS);
const MP_ITEM_TYPES = ['potion', 'exp_book', 'snowflake', 'bomb', 'heart', 'potion_invicible',
    'gear_blade', 'gear_orb', 'gear_armor', 'gear_bow', 'gear_thorns'];

// 限时装备:捡起后一段时间内强化属性,并附带一种独立于职业的特殊攻击(Game._tickGear 驱动)
//   atkMult 攻击倍率 / defBonus 防御加成 / speedMult 移速倍率;every = 特殊攻击间隔(秒)
const GEARS = {
    blade: { name: '雷霆之刃', icon: '⚡', color: '#ffe14d', duration: 12, atkMult: 1.3, every: 0.7,
             desc: '攻击 +30%  连锁闪电' },
    orb:   { name: '烈焰法球', icon: '🔥', color: '#ff7043', duration: 12, atkMult: 1.15,
             desc: '攻击 +15%  环绕火球' },
    armor: { name: '寒霜战甲', icon: '🛡️', color: '#80d8ff', duration: 12, defBonus: 12, every: 1.8,
             desc: '防御 +12  冰霜新星' },
    bow:   { name: '风暴连弩', icon: '🏹', color: '#69f0ae', duration: 12, speedMult: 1.25, every: 0.45,
             desc: '移速 +25%  扇形连射' },
    // 荆棘之甲:挨打越多打得越疼,与圣骑士守护者的「圣光反击」叠加时反伤再 ×1.5
    thorns: { name: '荆棘之甲', icon: '🌵', color: '#c6ff00', duration: 12, defBonus: 6, every: 0.5,
              desc: '防御 +6  受击反伤 尖刺' }
};
const GEAR_TYPES = Object.keys(GEARS);

// ══════════════════════════════════════════════════════════════════
//  构筑系统(类流放之路):天赋树 + 技能石。每个玩家各自一份,存在 Player 上
//   - 天赋树:每升 1 级 / 每击退 1 次魔王得 1 个天赋点,从中心「起点」沿连线点亮相邻节点
//     小天赋(小属性)→ 大天赋(显著强化)→ 基石(改变玩法,带代价);连接孔节点给技能多开一个镶嵌孔
//   - 技能石:辅助宝石,镶在 普攻 / Q / E 的连接孔里,改造那个技能;重复拾取同种宝石 = 升级(最高 3 级)
//  攻击/生命/防御/移速四项直接改玩家基础属性(_recomputeTree 记差值,可洗点);其余全部在使用处读 p.tree / _gv()
// ══════════════════════════════════════════════════════════════════
const TREE_COLORS = { str: '#ff5252', dex: '#69f0ae', int: '#40c4ff', mix: '#ffd740', start: '#ffffff' };
const TREE_BRANCH_NAMES = { str: '力量', dex: '敏捷', int: '智慧' };
// a = 角度(度,0 朝右、90 朝下),r = 离中心距离;kind: start / small / notable / socket / keystone
const TREE_NODES = [
    { id: 'start', br: 'start', kind: 'start', name: '起点', a: 0, r: 0, mods: {}, desc: '天赋从这里出发,只能点亮与已点亮节点相连的节点' },
    // ── 力量(左上):攻击、生命、全伤害 ──
    { id: 's1',  br: 'str', kind: 'small',    name: '力量',     a: -150, r: 88,  mods: { attack: 4 } },
    { id: 's2',  br: 'str', kind: 'small',    name: '体魄',     a: -163, r: 162, mods: { maxHealth: 25 } },
    { id: 's3',  br: 'str', kind: 'small',    name: '力量',     a: -137, r: 162, mods: { attack: 4 } },
    { id: 'sN1', br: 'str', kind: 'notable',  name: '钢筋铁骨', a: -173, r: 243, mods: { defense: 6, maxHealth: 30 }, icon: '⛨' },
    { id: 'sSk', br: 'str', kind: 'socket',   name: 'Q 连接孔', a: -150, r: 238, mods: { sockQ: 1 }, icon: 'Q' },
    { id: 'sN2', br: 'str', kind: 'notable',  name: '战争狂热', a: -127, r: 243, mods: { dmg: 0.15 }, icon: '⚔' },
    { id: 's4',  br: 'str', kind: 'small',    name: '蛮力',     a: -150, r: 318, mods: { attack: 5, maxHealth: 20 } },
    { id: 'sK',  br: 'str', kind: 'keystone', name: '狂战之魂', a: -150, r: 398, mods: { lowLifeDmg: 0.5, healTaken: -0.4 }, icon: '☠' },
    // ── 敏捷(下):攻速、暴击、移速 ──
    { id: 'd1',  br: 'dex', kind: 'small',    name: '敏捷',     a: 90,  r: 88,  mods: { speed: 0.3 } },
    { id: 'd2',  br: 'dex', kind: 'small',    name: '迅捷',     a: 77,  r: 162, mods: { atkSpd: 0.1 } },
    { id: 'd3',  br: 'dex', kind: 'small',    name: '精准',     a: 103, r: 162, mods: { crit: 0.05 } },
    { id: 'dN1', br: 'dex', kind: 'notable',  name: '致命精准', a: 67,  r: 243, mods: { crit: 0.08, critDmg: 0.4 }, icon: '✷' },
    { id: 'dSk', br: 'dex', kind: 'socket',   name: '普攻连接孔', a: 90, r: 238, mods: { sockA: 1 }, icon: 'A' },
    { id: 'dN2', br: 'dex', kind: 'notable',  name: '疾风连击', a: 113, r: 243, mods: { atkSpd: 0.15, dashCdr: 0.15 }, icon: '➹' },
    { id: 'd4',  br: 'dex', kind: 'small',    name: '灵巧',     a: 90,  r: 318, mods: { speed: 0.3, atkSpd: 0.06 } },
    { id: 'dK',  br: 'dex', kind: 'keystone', name: '疾风之舞', a: 90,  r: 398, mods: { evade: 0.2, defPct: -0.5 }, icon: '◌' },
    // ── 智慧(右上):技能伤害、冷却 ──
    { id: 'i1',  br: 'int', kind: 'small',    name: '智慧',     a: -30, r: 88,  mods: { skillDmg: 0.1 } },
    { id: 'i2',  br: 'int', kind: 'small',    name: '专注',     a: -43, r: 162, mods: { cdr: 0.05 } },
    { id: 'i3',  br: 'int', kind: 'small',    name: '智慧',     a: -17, r: 162, mods: { skillDmg: 0.1 } },
    { id: 'iN1', br: 'int', kind: 'notable',  name: '奥术精通', a: -53, r: 243, mods: { skillDmg: 0.25 }, icon: '✦' },
    { id: 'iSk', br: 'int', kind: 'socket',   name: 'E 连接孔', a: -30, r: 238, mods: { sockE: 1 }, icon: 'E' },
    { id: 'iN2', br: 'int', kind: 'notable',  name: '时间扭曲', a: -7,  r: 243, mods: { cdr: 0.12 }, icon: '⧗' },
    { id: 'i4',  br: 'int', kind: 'small',    name: '博学',     a: -30, r: 318, mods: { skillDmg: 0.08, cdr: 0.04 } },
    { id: 'iK',  br: 'int', kind: 'keystone', name: '时空裂隙', a: -30, r: 398, mods: { cdr: 0.25, autoDmg: -0.3 }, icon: '⌛' },
    // ── 三系之间的桥:混合属性 + 基石 ──
    { id: 'b1',  br: 'mix', kind: 'small',    name: '嗜血回春', a: -90, r: 262, mods: { regen: 0.005, leech: 0.01 } },
    { id: 'bK1', br: 'mix', kind: 'keystone', name: '不灭意志', a: -90, r: 372, mods: { dmgTaken: -0.25, dmg: -0.1 }, icon: '⛊' },
    { id: 'b2',  br: 'mix', kind: 'small',    name: '毒理',     a: 30,  r: 262, mods: { dot: 0.3 } },
    { id: 'bK2', br: 'mix', kind: 'keystone', name: '瘟疫使者', a: 30,  r: 372, mods: { poisonHit: 1, dmg: -0.15 }, icon: '☣' },
    { id: 'b3',  br: 'mix', kind: 'small',    name: '广域',     a: 150, r: 262, mods: { aoe: 0.15 } },
    { id: 'bK3', br: 'mix', kind: 'keystone', name: '玻璃大炮', a: 150, r: 372, mods: { dmg: 0.4, dmgTaken: 0.4 }, icon: '✸' }
];
const TREE_LINKS = [
    ['start', 's1'], ['s1', 's2'], ['s1', 's3'], ['s2', 'sN1'], ['s2', 'sSk'], ['s3', 'sSk'], ['s3', 'sN2'],
    ['sN1', 's4'], ['sSk', 's4'], ['sN2', 's4'], ['s4', 'sK'],
    ['start', 'd1'], ['d1', 'd2'], ['d1', 'd3'], ['d2', 'dN1'], ['d2', 'dSk'], ['d3', 'dSk'], ['d3', 'dN2'],
    ['dN1', 'd4'], ['dSk', 'd4'], ['dN2', 'd4'], ['d4', 'dK'],
    ['start', 'i1'], ['i1', 'i2'], ['i1', 'i3'], ['i2', 'iN1'], ['i2', 'iSk'], ['i3', 'iSk'], ['i3', 'iN2'],
    ['iN1', 'i4'], ['iSk', 'i4'], ['iN2', 'i4'], ['i4', 'iK'],
    ['sN2', 'b1'], ['iN1', 'b1'], ['b1', 'bK1'],
    ['iN2', 'b2'], ['dN1', 'b2'], ['b2', 'bK2'],
    ['dN2', 'b3'], ['sN1', 'b3'], ['b3', 'bK3']
];
const TREE_BY_ID = {};
const TREE_ADJ = {};
TREE_NODES.forEach((n, i) => {
    n.idx = i;
    n.x = Math.round(Math.cos(n.a * Math.PI / 180) * n.r);
    n.y = Math.round(Math.sin(n.a * Math.PI / 180) * n.r);
    TREE_BY_ID[n.id] = n;
    TREE_ADJ[n.id] = [];
});
for (const [a, b] of TREE_LINKS) { TREE_ADJ[a].push(b); TREE_ADJ[b].push(a); }

// 天赋属性 → 文本(节点说明、属性汇总共用)
const fmtPct = v => `${Math.round(Math.abs(v) * 1000) / 10}%`;
const sgnPct = v => `${v < 0 ? '-' : '+'}${fmtPct(v)}`;
const TREE_MOD_TEXT = {
    attack:     v => `攻击 +${v}`,
    maxHealth:  v => `最大生命 +${v}`,
    defense:    v => `防御 +${v}`,
    speed:      v => `移动速度 +${Math.round(v * 10) / 10}`,
    dmg:        v => `全部伤害 ${sgnPct(v)}`,
    skillDmg:   v => `技能伤害 ${sgnPct(v)}`,
    autoDmg:    v => `普攻伤害 ${sgnPct(v)}`,
    atkSpd:     v => `攻击速度 +${fmtPct(v)}`,
    crit:       v => `暴击率 +${fmtPct(v)}`,
    critDmg:    v => `暴击伤害 +${fmtPct(v)}`,
    cdr:        v => `技能冷却 -${fmtPct(v)}`,
    dashCdr:    v => `冲刺冷却 -${fmtPct(v)}`,
    leech:      v => `伤害的 ${fmtPct(v)} 转为生命`,
    regen:      v => `每秒回复 ${fmtPct(v)} 最大生命`,
    aoe:        v => `范围 +${fmtPct(v)}`,
    dot:        v => `中毒/燃烧伤害 +${fmtPct(v)}`,
    evade:      v => `${fmtPct(v)} 几率完全闪避伤害`,
    defPct:     v => `防御 ${sgnPct(v)}`,
    dmgTaken:   v => `受到伤害 ${sgnPct(v)}`,
    healTaken:  v => `受到治疗 ${sgnPct(v)}`,
    lowLifeDmg: v => `生命低于 50% 时伤害 +${fmtPct(v)}`,
    poisonHit:  () => '所有命中附带 1 层剧毒',
    sockQ:      () => 'Q 技能 +1 连接孔',
    sockE:      () => 'E 技能 +1 连接孔',
    sockA:      () => '普攻 +1 连接孔'
};
function treeModLines(mods) {
    return Object.keys(mods).filter(k => TREE_MOD_TEXT[k] && mods[k]).map(k => TREE_MOD_TEXT[k](mods[k]));
}
// 会直接改 Player 基础属性的天赋(guest 的这几项随输入 stats 上报,host 不再重复加)
const TREE_BASE_STATS = ['attack', 'maxHealth', 'defense', 'speed'];

// 技能石(辅助宝石):颜色 = 属性系(红力量/绿敏捷/蓝智慧);val 为 1~3 级数值;slots 可镶嵌位置 a 普攻 / q / e
const GEMS = {
    dmg:     { name: '附加伤害', icon: '⚔', color: '#ff5252', slots: 'aqe', val: [0.25, 0.35, 0.45], desc: v => `该技能伤害 +${fmtPct(v)}` },
    leech:   { name: '生命偷取', icon: '❣', color: '#ff5252', slots: 'aqe', val: [0.03, 0.045, 0.06], desc: v => `该技能造成伤害的 ${fmtPct(v)} 转为生命` },
    cull:    { name: '处决',     icon: '☠', color: '#ff5252', slots: 'aqe', val: [0.1, 0.13, 0.16], desc: v => `命中后生命低于 ${fmtPct(v)} 的敌人直接处决(精英减半,魔王无效)` },
    aoe:     { name: '范围扩大', icon: '◎', color: '#ff5252', slots: 'aqe', val: [0.2, 0.3, 0.4], desc: v => `范围 +${fmtPct(v)}(范围技能、近战普攻、溅射)` },
    ignite:  { name: '燃烧',     icon: '🔥', color: '#ff5252', slots: 'aqe', val: [0.3, 0.4, 0.5], desc: v => `命中点燃敌人 3 秒,每秒造成攻击力 ${fmtPct(v)} 的伤害` },
    multi:   { name: '多重投射', icon: '🔱', color: '#69f0ae', slots: 'a',   val: [0.75, 0.8, 0.85], desc: v => `远程普攻额外 +2 发投射物,每发伤害 ×${v}` },
    crit:    { name: '暴击强化', icon: '✷', color: '#69f0ae', slots: 'aqe', val: [0.15, 0.2, 0.25], desc: v => `该技能暴击率 +${fmtPct(v)}(暴击造成 2 倍伤害)` },
    poison:  { name: '剧毒',     icon: '☣', color: '#69f0ae', slots: 'aqe', val: [0.5, 0.75, 1], desc: v => `命中有 ${fmtPct(v)} 几率叠 1 层剧毒(最多 5 层)` },
    faster:  { name: '快速冷却', icon: '⏩', color: '#69f0ae', slots: 'aqe', val: [0.15, 0.2, 0.25], desc: v => `技能冷却 -${fmtPct(v)};镶在普攻上为攻速 +${fmtPct(v)}` },
    echo:    { name: '回响',     icon: '🔁', color: '#40c4ff', slots: 'qe',  val: [0.5, 0.65, 0.8], desc: v => `释放后 0.35 秒自动再放一次,伤害 ×${v}(不耗资源)` },
    freeze:  { name: '冰封',     icon: '❄', color: '#40c4ff', slots: 'aqe', val: [0.15, 0.2, 0.25], desc: v => `命中有 ${fmtPct(v)} 几率冻结敌人 1 秒` },
    chain:   { name: '连锁闪电', icon: '⚡', color: '#40c4ff', slots: 'aqe', val: [0.2, 0.25, 0.3], desc: v => `命中有 ${fmtPct(v)} 几率放出闪电,弹射附近 2 个敌人(50% 伤害)` },
    explode: { name: '尸爆',     icon: '✺', color: '#40c4ff', slots: 'aqe', val: [0.2, 0.25, 0.3], desc: v => `该技能击杀的敌人爆炸,对周围造成其最大生命 ${fmtPct(v)} 的伤害` }
};
const GEM_TYPES = Object.keys(GEMS);
MP_ITEM_TYPES.push(...GEM_TYPES.map(t => 'gem_' + t));
const GEM_SLOTS = ['a', 'q', 'e'];
const SKILL_NAMES = {
    warrior:  { q: '旋风斩',   e: '盾击' },
    mage:     { q: '魔力涌注', e: '斥力波' },
    assassin: { q: '闪现斩',   e: '连刺' },
    archer:   { q: '穿透箭',   e: '箭雨' },
    paladin:  { q: '圣光打击', e: '神圣光环' }
};
// 能否镶进该位置。法师的 Q「魔力涌注」是开关:它的孔放普攻宝石,开启时作用于普攻
function gemCanPlace(id, slot, cls) {
    const g = GEMS[id];
    return !!g && (g.slots.includes(slot) || (cls === 'mage' && slot === 'q' && g.slots.includes('a')));
}
// 宝石在该位置是否生效;不生效返回原因(面板上提示)
function gemMisfit(id, slot, cls) {
    const g = GEMS[id];
    if (!g) return '无效';
    if (cls === 'mage' && slot === 'q') return g.slots.includes('a') ? '' : '对开关技能无效';
    if (!g.slots.includes(slot)) return slot === 'a' ? '只能镶在技能上' : '只能镶在普攻上';
    if (id === 'multi' && (cls === 'warrior' || cls === 'paladin')) return '近战普攻无效';
    if (id === 'echo' && ((cls === 'mage' && slot === 'q') || (cls === 'paladin' && slot === 'e'))) return '对该技能无效';
    return '';
}

// localStorage 读写(隐私模式/禁用存储时静默失败)
const Store = {
    get(key, fallback) {
        try {
            const v = localStorage.getItem(key);
            return v == null ? fallback : JSON.parse(v);
        } catch (e) { return fallback; }
    },
    set(key, value) {
        try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* 忽略 */ }
    }
};

// ── 沉浸式横屏全屏(触屏设备):进入游戏时请求全屏 + 锁定横屏 ──
// 全屏 / 方向锁定只能在用户手势(点击)里发起,所以由大厅按钮和局内点按调用 enter()。
// iPhone Safari 不支持网页全屏与方向锁定:那里靠竖屏提示引导转横屏,「添加到主屏幕」后按 manifest 全屏横屏打开。
const Immersive = {
    // 主输入是手指的设备(手机/平板);带触摸屏的笔记本主输入仍是鼠标,不强制全屏
    isTouch: !!(window.matchMedia && matchMedia('(pointer: coarse)').matches),
    get enabled() { return this.isTouch && Store.get('blockrun.immersive', true); },
    setEnabled(on) {
        Store.set('blockrun.immersive', !!on);
        if (!on) this.exit();
    },
    isFullscreen() { return !!(document.fullscreenElement || document.webkitFullscreenElement); },
    isPortrait() { return window.innerHeight > window.innerWidth; },
    // 必须在点击/触摸回调里同步调用
    enter() {
        if (!this.enabled) return;
        const el = document.documentElement;
        const lock = () => {
            try {
                const o = screen.orientation;
                if (o && o.lock) o.lock('landscape').catch(() => {}); // 不支持/被拒时静默,改由竖屏提示兜底
            } catch (e) { /* 忽略 */ }
        };
        if (this.isFullscreen()) { lock(); return; }
        const req = el.requestFullscreen || el.webkitRequestFullscreen;
        if (!req) return;
        try {
            const r = req.call(el, { navigationUI: 'hide' });
            if (r && r.then) r.then(lock, () => {}); else lock();
        } catch (e) { /* 忽略 */ }
    },
    exit() {
        try {
            if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock();
        } catch (e) { /* 忽略 */ }
        if (!this.isFullscreen()) return;
        const ex = document.exitFullscreen || document.webkitExitFullscreen;
        if (ex) { try { const r = ex.call(document); if (r && r.catch) r.catch(() => {}); } catch (e) { /* 忽略 */ } }
    }
};

// ── 局外成长:成就 + 外观解锁(localStorage `blockrun.profile`,与 blockrun.best 并列) ──
// run = 本局实时数据 { score, time, level, bossRepels, cls };profile 为跨局累计
const ACHIEVEMENTS = [
    { id: 'firstRun',   icon: '🎮', name: '初次冒险', desc: '完成第一局游戏',            check: (r, p) => p.runs >= 1 },
    { id: 'survive60',  icon: '⏱', name: '站稳脚跟', desc: '单局生存 60 秒',            check: r => r.time >= 60 },
    { id: 'survive180', icon: '⌛', name: '持久战',   desc: '单局生存 180 秒',           check: r => r.time >= 180 },
    { id: 'survive300', icon: '🛡', name: '不倒方块', desc: '单局生存 300 秒',           check: r => r.time >= 300 },
    { id: 'pickClass',  icon: '⚔', name: '初露锋芒', desc: '达到 3 级并选择职业',        check: r => !!r.cls },
    { id: 'level10',    icon: '⭐', name: '身经百战', desc: '单局达到 10 级',            check: r => r.level >= 10 },
    { id: 'score1000',  icon: '★', name: '千分达人', desc: '单局得分 1000',             check: r => r.score >= 1000 },
    { id: 'score3000',  icon: '🌟', name: '高分猎手', desc: '单局得分 3000',             check: r => r.score >= 3000 },
    { id: 'dodge20',    icon: '💨', name: '身轻如燕', desc: '单局完美闪避 20 次',         check: r => (r.dodges || 0) >= 20 },
    { id: 'boss1',      icon: '👑', name: '魔王克星', desc: '击退一次方块大魔王',         check: r => r.bossRepels >= 1 },
    { id: 'boss3',      icon: '🔥', name: '屠魔者',   desc: '单局击退方块大魔王 3 次',    check: r => r.bossRepels >= 3 },
    { id: 'allClasses', icon: '🎭', name: '全能大师', desc: '五种职业各玩过一次',         check: (r, p) => Object.keys(Object.assign({}, p.classesPlayed, r.cls ? { [r.cls]: 1 } : {})).length >= 5 },
    { id: 'treasure1',  icon: '💰', name: '寻宝者',   desc: '击败一次宝藏方块',           check: r => (r.treasures || 0) >= 1 },
    { id: 'elite10',    icon: '♛', name: '精英猎手', desc: '单局击败 10 个精英怪',        check: r => (r.elites || 0) >= 10 },
    { id: 'easyClear',  icon: '🌱', name: '小试牛刀', desc: '轻松难度下生存 180 秒',      check: r => r.diff === 'easy' && r.time >= 180 },
    { id: 'hard180',    icon: '😈', name: '噩梦行者', desc: '噩梦难度下生存 180 秒',      check: r => r.diff === 'hard' && r.time >= 180 },
    { id: 'hardBoss',   icon: '☠', name: '噩梦屠魔', desc: '噩梦难度下击退方块大魔王',    check: r => r.diff === 'hard' && r.bossRepels >= 1 },
    { id: 'total20k',   icon: '💎', name: '积少成多', desc: '累计得分 20000',            check: (r, p) => p.totalScore + r.score >= 20000 }
];

// 玩家方块外观;need 为解锁条件:累计分数(totalScore)或某个成就(ach)
const SKINS = [
    { id: 'jade',    name: '翡翠', c1: '#69f0ae', c2: '#00897b', glow: '#4CAF50', stroke: 'rgba(0,230,150,0.6)' },
    { id: 'ember',   name: '烈焰', c1: '#ffab40', c2: '#d84315', glow: '#ff6d00', stroke: 'rgba(255,140,0,0.7)',   need: { totalScore: 3000 } },
    { id: 'frost',   name: '寒霜', c1: '#b3e5fc', c2: '#0277bd', glow: '#40c4ff', stroke: 'rgba(120,210,255,0.7)', need: { ach: 'boss1' } },
    { id: 'amethyst',name: '紫晶', c1: '#e1bee7', c2: '#6a1b9a', glow: '#ce93d8', stroke: 'rgba(206,147,216,0.7)', need: { totalScore: 10000 } },
    { id: 'gold',    name: '黄金', c1: '#fff59d', c2: '#c79100', glow: '#ffd600', stroke: 'rgba(255,214,0,0.75)',  need: { ach: 'survive300' } },
    { id: 'prism',   name: '幻彩', prism: true,                                       glow: '#ffffff', stroke: 'rgba(255,255,255,0.7)', need: { ach: 'allClasses' } }
];

const Progress = {
    KEY: 'blockrun.profile',
    load() {
        const p = Store.get(this.KEY, null) || {};
        return {
            runs: p.runs || 0,
            totalScore: p.totalScore || 0,
            totalTime: p.totalTime || 0,
            bossRepels: p.bossRepels || 0,
            classesPlayed: p.classesPlayed || {},
            achievements: p.achievements || {},
            skin: p.skin || 'jade'
        };
    },
    save(p) { Store.set(this.KEY, p); },
    skinUnlocked(skin, p) {
        if (!skin.need) return true;
        if (skin.need.totalScore != null) return p.totalScore >= skin.need.totalScore;
        if (skin.need.ach) return !!p.achievements[skin.need.ach];
        return false;
    },
    skinNeedText(skin) {
        if (!skin.need) return '';
        if (skin.need.totalScore != null) return `累计得分 ${skin.need.totalScore}`;
        const a = ACHIEVEMENTS.find(x => x.id === skin.need.ach);
        return a ? `成就「${a.name}」` : '';
    },
    // 当前选中的外观(若未解锁则回落到默认)
    currentSkin() {
        const p = this.load();
        const s = SKINS.find(x => x.id === p.skin);
        return s && this.skinUnlocked(s, p) ? s : SKINS[0];
    },
    // 检查本局数据能新解锁哪些成就,写入存档并返回新成就列表
    checkAchievements(run) {
        const p = this.load();
        const fresh = [];
        for (const a of ACHIEVEMENTS) {
            if (p.achievements[a.id]) continue;
            try { if (a.check(run, p)) { p.achievements[a.id] = Date.now(); fresh.push(a); } } catch (e) { /* 忽略 */ }
        }
        if (fresh.length) this.save(p);
        return fresh;
    },
    // 一局结束:累计数据入档,返回因此新解锁的成就(首局/累计类)
    recordRun(run) {
        const p = this.load();
        p.runs += 1;
        p.totalScore += run.score;
        p.totalTime += run.time;
        p.bossRepels += run.bossRepels;
        if (run.cls) p.classesPlayed[run.cls] = (p.classesPlayed[run.cls] || 0) + 1;
        this.save(p);
        // 本局数据已计入 profile,这里只按累计量判定,避免把本局分数加两次
        return this.checkAchievements({ score: 0, time: 0, level: 0, bossRepels: 0, cls: null });
    }
};

// WebAudio 合成音效:无需素材文件。浏览器要求首次用户手势后才能出声,见 Sound.init()
const Sound = {
    ctx: null,
    master: null,
    muted: Store.get('blockrun.muted', false),
    _last: {},
    _noiseBuf: null,
    // 同名音效最短间隔(秒),避免一帧内多次击杀叠成噪音
    minGap: { kill: 0.05, skill: 0.08, pickup: 0.06, hurt: 0.1, dash: 0.12, fuse: 0.2, bomb: 0.08, meteor: 0.1, enemyHeal: 0.25 },

    init() {
        if (this.ctx) {
            if (this.ctx.state === 'suspended') this.ctx.resume();
            return;
        }
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        try {
            this.ctx = new AC();
        } catch (e) { return; }
        this.master = this.ctx.createGain();
        this.master.gain.value = this.muted ? 0 : 0.35;
        this.master.connect(this.ctx.destination);
    },

    toggleMute() {
        this.muted = !this.muted;
        Store.set('blockrun.muted', this.muted);
        if (this.master) this.master.gain.value = this.muted ? 0 : 0.35;
    },

    _tone(freq, dur, type = 'square', vol = 0.2, slide = 1, delay = 0) {
        const c = this.ctx, t = c.currentTime + delay;
        const o = c.createOscillator(), g = c.createGain();
        o.type = type;
        o.frequency.setValueAtTime(freq, t);
        if (slide !== 1) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(vol, t + 0.005);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g); g.connect(this.master);
        o.start(t); o.stop(t + dur + 0.02);
    },

    _noise(dur, vol = 0.2, filterType = 'lowpass', freq = 1000, delay = 0) {
        const c = this.ctx, t = c.currentTime + delay;
        if (!this._noiseBuf) {
            const len = c.sampleRate; // 1 秒白噪声,复用
            this._noiseBuf = c.createBuffer(1, len, c.sampleRate);
            const d = this._noiseBuf.getChannelData(0);
            for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        }
        const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
        src.buffer = this._noiseBuf;
        f.type = filterType; f.frequency.value = freq;
        g.gain.setValueAtTime(vol, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        src.connect(f); f.connect(g); g.connect(this.master);
        src.start(t); src.stop(t + dur + 0.02);
    },

    play(name, arg) {
        if (!this.ctx || this.muted || this.ctx.state !== 'running') return;
        const now = this.ctx.currentTime;
        const gap = this.minGap[name] || 0;
        if (gap && this._last[name] && now - this._last[name] < gap) return;
        this._last[name] = now;
        switch (name) {
            case 'kill':
                this._tone(520 + Math.random() * 120, 0.07, 'square', 0.08, 1.6);
                break;
            case 'hurt':
                this._tone(200, 0.18, 'sawtooth', 0.18, 0.5);
                this._noise(0.12, 0.12, 'lowpass', 900);
                break;
            case 'death':
                this._tone(320, 0.55, 'sawtooth', 0.2, 0.25);
                break;
            case 'pickup': {
                const notes = { common: [660, 880], rare: [660, 880, 1100], epic: [660, 880, 1100, 1320] }[arg] || [660, 880];
                notes.forEach((f, i) => this._tone(f, 0.12, 'triangle', 0.15, 1, i * 0.06));
                break;
            }
            case 'bomb':
                this._noise(0.6, 0.35, 'lowpass', 500);
                this._tone(90, 0.5, 'sine', 0.3, 0.4);
                break;
            case 'dash':
                this._noise(0.25, 0.14, 'bandpass', 1200);
                this._tone(240, 0.2, 'sawtooth', 0.08, 2);
                break;
            case 'whoosh':
                this._noise(0.16, 0.13, 'highpass', 1500);
                this._tone(520, 0.12, 'sine', 0.05, 1.8);
                break;
            case 'dodge':
                [1046, 1568].forEach((f, i) => this._tone(f, 0.1, 'triangle', 0.12, 1, i * 0.05));
                break;
            case 'fuse':
                [0, 0.25, 0.45, 0.6].forEach(d => this._tone(1200, 0.05, 'square', 0.06, 1, d));
                break;
            case 'skill':
                this._noise(0.15, 0.12, 'bandpass', 1800);
                this._tone(300, 0.15, 'triangle', 0.1, 2.2);
                break;
            case 'gearOn':
                this._tone(220, 0.25, 'sawtooth', 0.1, 3);
                [784, 1175].forEach((f, i) => this._tone(f, 0.14, 'square', 0.08, 1, 0.12 + i * 0.07));
                break;
            case 'gearOff':
                this._tone(600, 0.25, 'triangle', 0.1, 0.4);
                break;
            case 'levelUp':
                [523, 659, 784, 1047].forEach((f, i) => this._tone(f, 0.16, 'triangle', 0.18, 1, i * 0.08));
                break;
            case 'combo': {
                // 连杀里程碑:越高音越亮
                const base = 600 + Math.min(4, arg || 0) * 80;
                [1, 1.25, 1.5].forEach((k, i) => this._tone(base * k, 0.1, 'square', 0.1, 1.02, i * 0.05));
                break;
            }
            case 'heartbeat':
                // 低血量心跳:两声闷响
                this._tone(70, 0.12, 'sine', 0.3, 0.7);
                this._tone(62, 0.14, 'sine', 0.24, 0.7, 0.17);
                break;
            case 'bossWarn':
                for (let i = 0; i < 3; i++) {
                    this._tone(440, 0.18, 'square', 0.12, 1, i * 0.4);
                    this._tone(330, 0.18, 'square', 0.12, 1, i * 0.4 + 0.2);
                }
                break;
            case 'bossSpawn':
                this._tone(110, 0.8, 'sawtooth', 0.22, 0.5);
                this._noise(0.6, 0.2, 'lowpass', 400);
                break;
            case 'bossTell':
                this._tone(260, 0.25, 'square', 0.1, 1.8);
                break;
            case 'bossCharge':
                this._noise(0.35, 0.22, 'bandpass', 700);
                this._tone(180, 0.3, 'sawtooth', 0.14, 0.5);
                break;
            case 'bossRing':
                this._tone(900, 0.18, 'square', 0.1, 0.4);
                this._noise(0.15, 0.1, 'highpass', 2500);
                break;
            case 'bossLaser':
                // 激光:高频锯齿下滑 + 嗡鸣
                this._tone(1400, 0.9, 'sawtooth', 0.07, 0.35);
                this._tone(110, 1.0, 'square', 0.08, 1.05);
                break;
            case 'bossSummon':
                [196, 233, 277].forEach((f, i) => this._tone(f, 0.3, 'triangle', 0.14, 0.7, i * 0.06));
                this._noise(0.3, 0.12, 'bandpass', 900);
                break;
            case 'bossSlam':
                this._noise(0.5, 0.35, 'lowpass', 300);
                this._tone(70, 0.45, 'sine', 0.35, 0.5);
                break;
            case 'bossEnrage':
                this._tone(140, 0.6, 'sawtooth', 0.2, 2);
                this._tone(147, 0.6, 'sawtooth', 0.2, 2);
                break;
            case 'bossRepel':
                [392, 523, 659, 784].forEach((f, i) => this._tone(f, 0.2, 'square', 0.12, 1, i * 0.09));
                break;
            case 'event':
                [523, 659, 784, 659, 988].forEach((f, i) => this._tone(f, 0.12, 'square', 0.09, 1, i * 0.07));
                break;
            case 'meteor':
                this._noise(0.35, 0.22, 'lowpass', 700);
                this._tone(120, 0.3, 'sine', 0.18, 0.5);
                break;
            case 'enemyHeal':
                // 敌方「医」治疗脉冲:柔和上行的两声
                [587, 880].forEach((f, i) => this._tone(f, 0.18, 'sine', 0.1, 1.3, i * 0.07));
                break;
            case 'bless':
                // 祭坛祝福:明亮的上行琶音 + 一层柔和长音
                [523, 659, 784, 1047, 1319].forEach((f, i) => this._tone(f, 0.22, 'triangle', 0.13, 1, i * 0.06));
                this._tone(262, 0.7, 'sine', 0.12, 1.5);
                break;
            case 'record':
                [784, 988, 1175, 1568].forEach((f, i) => this._tone(f, 0.14, 'square', 0.1, 1, i * 0.08));
                this._tone(1568, 0.4, 'triangle', 0.12, 1, 0.34);
                break;
            case 'treasure':
                [1047, 1319, 1568, 2093].forEach((f, i) => this._tone(f, 0.1, 'triangle', 0.14, 1, i * 0.05));
                break;
            case 'gameOver':
                [659, 523, 440, 349].forEach((f, i) => this._tone(f, 0.3, 'triangle', 0.18, 1, i * 0.2));
                break;
        }
    }
};

class Game {
    static MAGNET_RADIUS = 85; // 道具拾取磁吸半径
    static JOY_RADIUS = 56;   // 摇杆半径(CSS px)
    static ORB_SPIN = 4.2;    // 烈焰法球转速(弧度/秒)
    static ORB_RADIUS = 58;   // 烈焰法球环绕半径
    static COMBO_WINDOW = 3;  // 连杀间隔上限(秒)
    static TALENT_REROLLS = 2; // 每局天赋「换一批」基础次数
    // 自动画质档位:持续掉帧时逐级降低画布分辨率上限与粒子数量(本次打开页面内不再回升,避免来回切换)
    static PERF_FRAME_MS = 22;  // 平滑后的帧间隔超过它(约 45 帧以下)视为掉帧
    static STAR_LEVELS = 5;  // 星星闪烁亮度档位数
    static QUALITY = [{ dpr: 2, fx: 1 }, { dpr: 1.5, fx: 0.6 }, { dpr: 1, fx: 0.4 }];
    static DN_MERGE = 0.25;   // 同一目标多少秒内的伤害并进同一个伤害数字
    // 祝福祭坛:光圈半径、单人充满所需秒数(每多一人站进来 +50% 速度)、祝福效果
    static ALTAR_R = 62;
    static ALTAR_NEED = 4;
    static BLESS = { dur: 15, dmg: 1.25, speed: 1.15, heal: 0.4 };
    static DN_MAX = 60;       // 同屏伤害数字上限(超出丢最早的)
    static fmtDmg(v) {
        v = Math.max(1, Math.round(v));
        return v >= 10000 ? (v / 10000).toFixed(v >= 100000 ? 0 : 1) + '万' : String(v);
    }
    // 连杀里程碑:10 / 25 / 50 / 100,之后每 100
    static comboMilestone(n) { return n === 10 || n === 25 || n === 50 || (n >= 100 && n % 100 === 0); }
    // 技能位上下文(见 _withCtx):普攻 / Q / E
    static CTX = { a: { slot: 'a', mult: 1 }, q: { slot: 'q', mult: 1 }, e: { slot: 'e', mult: 1 } };
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        // 画布每帧都整屏铺底色,本身不透明:声明 alpha:false 让合成器跳过与页面的混合
        this.ctx = this.canvas.getContext('2d', { alpha: false });
        this.gameScale = 1;
        this.gameOffsetX = 0;
        this.gameOffsetY = 0;
        this.dpr = 1;
        this._patchShadowBlur();
        this.resizeCanvas();
        
        this.player = new Player(this.width / 2, this.height / 2);
        this.enemies = [];
        this.items = [];
        this.projectiles = [];
        this.enemyBullets = []; // 炮手发射的敌方投射物
        this.effects = [];
        this.particles = [];

        this.stars = this._initStars(120);
        this.bgTime = 0;

        this.pendingActions = []; // 帧驱动延迟队列,替代 setTimeout(暂停时一起停)
        this._uiTimer = 0;        // updateUI 降频累计
        this.buttons = [];        // 菜单命中区,每帧 render 时重置
        this.skillButtons = [];   // Q/E 技能按钮命中区,每帧 _renderSkillHUD 时重置
        // 操控方式:'joystick' 虚拟摇杆 / 'tap' 点触移动(键盘始终可用),存 localStorage
        this.controlMode = Store.get('blockrun.control', null) ||
            (('ontouchstart' in window) || navigator.maxTouchPoints > 0 ? 'joystick' : 'tap');
        // 浮动摇杆状态,坐标为画布后备缓冲像素(屏幕空间,不随世界缩放)
        this.joy = { active: false, id: null, bx: 0, by: 0, x: 0, y: 0 };
        // 技能/闪避按键:'tap' 点按释放(自动瞄准最近敌人)/ 'aim' 按住拖动瞄准,松手释放
        this.skillMode = Store.get('blockrun.skillMode', 'tap') === 'aim' ? 'aim' : 'tap';
        this.showDmgNums = Store.get('blockrun.dmgNums', true) !== false; // 伤害数字开关(暂停面板里切换)
        // 拖拽瞄准状态:hcx/hcy 为按钮中心(HUD 坐标),sx/sy 为按下点(CSS px)
        this.aim = { active: false, id: null, skill: null, hcx: 0, hcy: 0, sx: 0, sy: 0, ox: 0, oy: 0, dx: 0, dy: 0, armed: false };
        this.freezeOverlay = null; // 全屏冰封特效数据

        this.keys = {};
        this._rafId = null;
        this.isRunning = false;
        this.isPaused = false;
        
        this.life = 1;
        this.maxLife = 3; // 生命上限,可由天赋"传承"扩展
        this.level = 1;
        this.exp = 0;
        this.expToNext = 100;
        this.score = 0;
        this.gameTime = 0;
        this.difficulty = 1;
        this.diffPref = DIFF_MODES[Store.get('blockrun.diff', 'normal')] ? Store.get('blockrun.diff', 'normal') : 'normal';
        this.diffMode = this.diffPref;  // 本局生效的难度(guest 以房主快照为准)

        this.enemyFreezeTimer = 0;
        this.gearTimer = 20;          // 距离下一件限时装备掉落的秒数
        this.gemTimer = 30;           // 距离下一颗技能石掉落的秒数
        this._resetEvents();

        // 方块大魔王调度
        this.bossState = 'idle';      // idle | warning | active | retreating
        this.bossTimer = 60;          // 距离下次魔王出现的剩余秒数
        this.bossWarningTimer = 0;    // 预告倒计时
        this.bossActiveTimer = 0;     // 魔王已持续时间
        this.bossDamageDealt = 0;     // 本轮累计造成伤害
        this.boss = null;
        this.bossDamageRequired = 1500;
        this.bossDuration = 30;
        this.bossInterval = 60;
        this.bossWarningDuration = 5;
        this.screenShake = 0;         // 屏幕震动剩余时长

        // 天赋系统
        this.talentDefs = this._buildTalentDefs();
        this.currentTalentChoices = []; // 当前菜单的 3 张候选(talentDef)
        this.scoreMult = 1;             // 击杀分数倍率(丰厚奖励天赋)
        this.expGrowthMult = 1;         // 升级所需经验递增系数(速学天赋,<1 表示放缓)
        // 魔王状态重置
        this.bossState = 'idle';
        this.bossTimer = this.bossInterval || 60;
        this.bossWarningTimer = 0;
        this.bossActiveTimer = 0;
        this.bossDamageDealt = 0;
        this.boss = null;
        this.screenShake = 0;
        this._lastBossWarnSec = 0;
        this.bossWave = 0;            // 本局第几只魔王(决定魔王等级与解锁的新招)
        this.dmgNums = [];            // 伤害数字 { id, x, y, v, k(0 普通/1 暴击/2 持续), t, target }
        this._mpDn = [];              // host:自上次广播以来新建/变化的伤害数字
        // 打击感:顿帧剩余(真实秒)、本机受击红色暗角、上次击杀顿帧时间(防连杀卡顿)
        this.hitStop = 0;
        this.hurtVignette = 0;
        this._lastKillStopAt = 0;

        // ── 联机多人 ──
        this.mpMode = null;           // null | 'host' | 'guest'
        this.mpWs = null;
        this.mpRoomCode = null;
        this.mpPlayerId = null;       // 本机玩家 ID（host=0，guest=1/2/3）
        this.mpPlayers = [];          // 其他玩家的渲染数据 [{id, x, y, size, currentHealth, maxHealth, class, hurtCooldown, invincibleTimer}]
        this.mpGuestPlayers = new Map(); // host 端：playerId → Player 对象
        this.mpGuestInputs = new Map();  // host 端：playerId → {keys, targetX, targetY, moving, castQ, castE}
        this.mpFrameCount = 0;
        this.mpStateBuffer = null;    // guest 端：最新收到的状态快照
        this.mpSnapTime = 0;          // guest 端：上次应用快照的时刻(ms)
        this.mpSnapInterval = 50;     // guest 端：快照间隔估计(ms),用于插值
        this._mpFx = [];              // host 端：待广播的粒子生成调用
        this._mpHasOwnPos = false;
        this._sfxPrev = null;         // 音效边沿检测用的上一帧状态
        this.muteButton = null;
        this.mpServerUrl = 'ws://localhost:8080'; // 默认，可被大厅覆盖

        this.init();
    }

    _buildTalentDefs() {
        // rarity: 'common'(权重60) | 'rare'(权重30) | 'epic'(权重10)
        // applicable(game): 返回 true 才允许出现
        // apply(game): 执行效果
        // stackable: 是否可重复获取
        // maxStacks: 可叠加次数上限(stackable=true 时使用)
        return [
            // --- 进攻类 ---
            { id: 'blade',       name: '利刃',       icon: '⚔', color: '#ff7043', rarity: 'common',
              desc: '攻击力 +8', stackable: true, maxStacks: 99,
              apply: g => { g.player.attack += 8; } },
            { id: 'berserk',     name: '狂战',       icon: '🔥', color: '#ff3d3d', rarity: 'rare',
              desc: '攻击力 +15,防御力 -3', stackable: true, maxStacks: 5,
              apply: g => { g.player.attack += 15; g.player.defense = Math.max(0, g.player.defense - 3); } },
            { id: 'rapidFire',   name: '连射',       icon: '➳', color: '#ffb74d', rarity: 'rare',
              desc: '自动攻击间隔 ×0.85', stackable: true, maxStacks: 4,
              apply: g => { g.player.autoAttackInterval = Math.max(0.1, g.player.autoAttackInterval * 0.85); } },
            { id: 'wrath',       name: '暴怒',       icon: '💢', color: '#e53935', rarity: 'epic',
              desc: '永久效果:每损失 10% 生命,攻击力额外 +5%', stackable: false,
              apply: g => { g.player.wrathBonus = true; } },

            // --- 防御类 ---
            { id: 'ironWall',    name: '铁壁',       icon: '🛡', color: '#42a5f5', rarity: 'common',
              desc: '防御力 +5', stackable: true, maxStacks: 99,
              apply: g => { g.player.defense += 5; } },
            { id: 'vitality',    name: '生命之泉',   icon: '❤', color: '#ef5350', rarity: 'common',
              desc: '最大生命 +30 并回满', stackable: true, maxStacks: 99,
              apply: g => { g.player.maxHealth += 30; g.player.currentHealth = g.player.maxHealth; } },
            { id: 'evasion',     name: '回避',       icon: '✦', color: '#7e57c2', rarity: 'rare',
              desc: '受击后无敌帧时间 +0.3 秒', stackable: true, maxStacks: 3,
              apply: g => { g.player.hurtCooldownBonus = (g.player.hurtCooldownBonus || 0) + 0.3; } },
            { id: 'armorMaster', name: '护甲专精',   icon: '◆', color: '#26a69a', rarity: 'rare',
              desc: '防御力 +3,所有伤害额外固定减免 2', stackable: true, maxStacks: 5,
              apply: g => { g.player.defense += 3; g.player.flatDamageReduction = (g.player.flatDamageReduction || 0) + 2; } },

            // --- 移动类 ---
            { id: 'swift',       name: '疾风',       icon: '➤', color: '#66bb6a', rarity: 'common',
              desc: '移动速度 +1', stackable: true, maxStacks: 5,
              apply: g => { g.player.speed += 1; } },
            { id: 'blink',       name: '瞬步',       icon: '⚡', color: '#ffee58', rarity: 'rare',
              desc: '速度 +0.5,自动攻击伤害 +10%', stackable: true, maxStacks: 5,
              apply: g => { g.player.speed += 0.5; g.player.autoAttackDmgMult = (g.player.autoAttackDmgMult || 1) * 1.1; } },

            { id: 'dashCD',      name: '疾影',       icon: '💨', color: '#80d8ff', rarity: 'common',
              desc: '冲刺冷却 ×0.8', stackable: true, maxStacks: 3,
              apply: g => { g.player.dashMaxCooldown = Math.max(0.6, g.player.dashMaxCooldown * 0.8); } },
            { id: 'phantomDash', name: '幻影冲锋',   icon: '⇶', color: '#b388ff', rarity: 'rare',
              desc: '冲刺穿过的敌人受到 150% 攻击力伤害', stackable: true, maxStacks: 2,
              apply: g => { g.player.dashStrike = (g.player.dashStrike || 0) + 1.5; } },

            // --- 通用技能强化(需要对应职业 & 未满级)---
            { id: 'skillQUp',    name: 'Q 技能强化', icon: 'Q', color: '#ff8a65', rarity: 'epic',
              desc: 'Q 技能等级 +1', stackable: true, maxStacks: 2,
              applicable: g => !!g.player.class && g.player.skillQ.level < 3,
              apply: g => {
                  g.player.skillQ.level = Math.min(3, g.player.skillQ.level + 1);
                  g.player.skillQ.maxCooldown = g._skillMaxCd(g.player, 'q');
              } },
            { id: 'skillEUp',    name: 'E 技能强化', icon: 'E', color: '#ba68c8', rarity: 'epic',
              desc: 'E 技能等级 +1', stackable: true, maxStacks: 2,
              applicable: g => !!g.player.class && g.player.skillE.level < 3,
              apply: g => {
                  g.player.skillE.level = Math.min(3, g.player.skillE.level + 1);
                  g.player.skillE.maxCooldown = g._skillMaxCd(g.player, 'e');
              } },

            // --- 战士专属 ---
            { id: 'warriorRageBoost', name: '怒火中烧', icon: '🔥', color: '#ff5722', rarity: 'rare',
              desc: '怒气获取量 +50%', stackable: true, maxStacks: 2,
              applicable: g => g.player.class === 'warrior',
              apply: g => { g.player.rageGainMult = (g.player.rageGainMult || 1) + 0.5; } },
            { id: 'warriorHeavyHit', name: '重击', icon: '⚒', color: '#bf360c', rarity: 'rare',
              desc: '战士技能伤害 +30%', stackable: true, maxStacks: 3,
              applicable: g => g.player.class === 'warrior',
              apply: g => { g.player.warriorSkillDmgMult = (g.player.warriorSkillDmgMult || 1) * 1.30; } },
            { id: 'warriorIronWill', name: '钢铁意志', icon: '✚', color: '#d84315', rarity: 'common',
              desc: '受伤额外获得 5 怒气', stackable: true, maxStacks: 3,
              applicable: g => g.player.class === 'warrior',
              apply: g => { g.player.rageOnHurtBonus = (g.player.rageOnHurtBonus || 0) + 5; } },

            // --- 法师专属 ---
            { id: 'magePenetrate', name: '法术穿透', icon: '✸', color: '#26c6da', rarity: 'rare',
              desc: '法师技能无视目标 30% 防御', stackable: true, maxStacks: 2,
              applicable: g => g.player.class === 'mage',
              apply: g => { g.player.magePenetration = (g.player.magePenetration || 0) + 0.3; } },
            { id: 'mageManaWell', name: '法力之泉', icon: '✺', color: '#29b6f6', rarity: 'rare',
              desc: '最大法力 +10,法力恢复 +1/s', stackable: true, maxStacks: 4,
              applicable: g => g.player.class === 'mage',
              apply: g => { g.player.maxMana += 10; g.player.manaRegen += 1; g.player.mana = g.player.maxMana; } },
            { id: 'mageFrostMastery', name: '斥力精通', icon: '↔', color: '#80deea', rarity: 'epic',
              desc: 'E 斥力波击退距离 +30% 并附加短暂僵直', stackable: true, maxStacks: 2,
              applicable: g => g.player.class === 'mage',
              apply: g => { g.player.mageStunBonus = (g.player.mageStunBonus || 0) + 2; } },

            // --- 刺客专属 ---
            { id: 'assassinDeadly', name: '致命一击', icon: '☠', color: '#7b1fa2', rarity: 'rare',
              desc: '刺客技能伤害 +25%', stackable: true, maxStacks: 3,
              applicable: g => g.player.class === 'assassin',
              apply: g => { g.player.assassinSkillDmgMult = (g.player.assassinSkillDmgMult || 1) * 1.25; } },
            { id: 'assassinShadow', name: '影袭', icon: '◐', color: '#9c27b0', rarity: 'common',
              desc: 'Q 闪现斩冷却 -1 秒', stackable: true, maxStacks: 2,
              applicable: g => g.player.class === 'assassin' && g.player.skillQ.maxCooldown > 1,
              apply: g => { g.player.qCdFlat = (g.player.qCdFlat || 0) + 1; g.player.skillQ.maxCooldown = g._skillMaxCd(g.player, 'q'); } },
            { id: 'assassinCombo', name: '连击专精', icon: '✕', color: '#aa00ff', rarity: 'epic',
              desc: 'E 连刺额外多攻击 1 个目标', stackable: true, maxStacks: 2,
              applicable: g => g.player.class === 'assassin',
              apply: g => { g.player.assassinExtraTargets = (g.player.assassinExtraTargets || 0) + 1; } },

            // --- 弓手专属 ---
            { id: 'archerSharpshooter', name: '神射手', icon: '◎', color: '#9ccc65', rarity: 'rare',
              desc: '弓手技能伤害 +20%', stackable: true, maxStacks: 3,
              applicable: g => g.player.class === 'archer',
              apply: g => { g.player.archerSkillDmgMult = (g.player.archerSkillDmgMult || 1) * 1.20; } },
            { id: 'archerBigQuiver', name: '大箭袋', icon: '⫷', color: '#558b2f', rarity: 'rare',
              desc: '最大箭矢 +2', stackable: true, maxStacks: 3,
              applicable: g => g.player.class === 'archer',
              apply: g => { g.player.maxArrows += 2; g.player.arrows = g.player.maxArrows; } },
            { id: 'archerFastReload', name: '速装', icon: '⟳', color: '#33691e', rarity: 'common',
              desc: '装填时间 -0.5 秒(最低 0.3 秒)', stackable: true, maxStacks: 2,
              applicable: g => g.player.class === 'archer' && g.player.reloadDuration > 0.3,
              apply: g => { g.player.reloadDuration = Math.max(0.3, g.player.reloadDuration - 0.5); } },

            // --- 圣骑士专属 ---
            { id: 'paladinHolyStrike', name: '神圣冲击', icon: '✦', color: '#ffd700', rarity: 'rare',
              desc: '圣骑士技能伤害 +30%', stackable: true, maxStacks: 3,
              applicable: g => g.player.class === 'paladin',
              apply: g => { g.player.paladinSkillDmgMult = (g.player.paladinSkillDmgMult || 1) * 1.30; } },
            { id: 'paladinFaithLight', name: '持久信念', icon: '✟', color: '#ffd54f', rarity: 'rare',
              desc: '最大信念 +30,信念恢复 +3/s', stackable: true, maxStacks: 4,
              applicable: g => g.player.class === 'paladin',
              apply: g => { g.player.maxFaith += 30; g.player.faithRegen += 3; g.player.faith = g.player.maxFaith; } },
            { id: 'paladinAuraDuration', name: '光辉持续', icon: '☀', color: '#ffecb3', rarity: 'epic',
              desc: 'E 神圣光环持续时间 +2 秒', stackable: true, maxStacks: 2,
              applicable: g => g.player.class === 'paladin',
              apply: g => { g.player.paladinAuraDurationBonus = (g.player.paladinAuraDurationBonus || 0) + 2; } },

            // --- 新机制相关天赋 ---
            // 战士:狂涛(怒气衰减减半)
            { id: 'warriorWildTide', name: '狂涛', icon: '〜', color: '#ff6f00', rarity: 'epic',
              desc: '怒气衰减速度 ×0.5', stackable: false,
              applicable: g => g.player.class === 'warrior',
              apply: g => { g.player.warriorRageDecayMult = (g.player.warriorRageDecayMult || 1) * 0.5; } },

            // 法师:冷凝(Q 开关消耗减半)
            { id: 'mageCondense', name: '冷凝', icon: '❅', color: '#26c6da', rarity: 'epic',
              desc: '魔力涌注每次普攻法力消耗 ×0.5', stackable: false,
              applicable: g => g.player.class === 'mage',
              apply: g => { g.player.mageQCostMult = (g.player.mageQCostMult || 1) * 0.5; } },

            // 圣骑士:壁垒(护盾上限 +5% maxHP)
            { id: 'paladinBulwark', name: '壁垒', icon: '◫', color: '#1976d2', rarity: 'epic',
              desc: '护盾上限 +5% 最大生命', stackable: true, maxStacks: 3,
              applicable: g => g.player.class === 'paladin',
              apply: g => { g.player.shieldCapRatio = (g.player.shieldCapRatio || 0.10) + 0.05; } },

            // 刺客:迅捷蓄力(蓄力获取 ×2)
            { id: 'assassinSwiftCharge', name: '迅捷蓄力', icon: '➹', color: '#ba68c8', rarity: 'epic',
              desc: '移动蓄力获取速度 ×2', stackable: false,
              applicable: g => g.player.class === 'assassin',
              apply: g => { g.player.chargeGainMult = (g.player.chargeGainMult || 1) * 2; } },

            // --- 弓手投射物天赋(普攻强化)---
            { id: 'archerSwiftBolt', name: '疾矢', icon: '➳', color: '#9ccc65', rarity: 'common',
              desc: '普攻投射物速度 +25%', stackable: true, maxStacks: 2,
              applicable: g => g.player.class === 'archer',
              apply: g => { g.player.archerProjSpeedMult = (g.player.archerProjSpeedMult || 1) * 1.25; } },
            { id: 'archerMultiShot', name: '多重射击', icon: '✂', color: '#7cb342', rarity: 'rare',
              desc: '普攻额外发射 1 发(扇形散布)', stackable: true, maxStacks: 1,
              applicable: g => g.player.class === 'archer' && (g.player.archerMultiShot || 1) < 3,
              apply: g => { g.player.archerMultiShot = (g.player.archerMultiShot || 1) + 1; } },
            { id: 'archerPiercing', name: '箭无虚发', icon: '➝', color: '#558b2f', rarity: 'epic',
              desc: '普攻穿透 1 个敌人', stackable: true, maxStacks: 1,
              applicable: g => g.player.class === 'archer' && (g.player.archerPiercing || 0) < 2,
              apply: g => { g.player.archerPiercing = (g.player.archerPiercing || 0) + 1; } },

            // --- 史诗类 ---
            { id: 'fastLearner', name: '速学',       icon: '★', color: '#ab47bc', rarity: 'epic',
              desc: '后续升级所需经验 ×0.8', stackable: true, maxStacks: 3,
              apply: g => { g.expToNext = Math.max(20, Math.floor(g.expToNext * 0.8)); g.expGrowthMult = (g.expGrowthMult || 1) * 0.95; } },
            { id: 'lifeSteal',   name: '生命汲取',   icon: '✜', color: '#d81b60', rarity: 'epic',
              desc: '每击杀敌人回复 5 点生命', stackable: true, maxStacks: 4,
              apply: g => { g.player.lifeStealPerKill = (g.player.lifeStealPerKill || 0) + 5; } },
            { id: 'bounty',      name: '丰厚奖励',   icon: '◈', color: '#ffca28', rarity: 'epic',
              desc: '击杀获得分数 ×2(可叠加)', stackable: true, maxStacks: 3,
              apply: g => { g.scoreMult = (g.scoreMult || 1) * 2; } },
            { id: 'heritage',    name: '传承',       icon: '♛', color: '#ff80ab', rarity: 'epic',
              desc: '生命上限 +1 并立即 +1 命', stackable: true, maxStacks: 4,
              apply: g => { g.maxLife += 1; g.life = Math.min(g.life + 1, g.maxLife); } },

            // === 强化职业特色:战士(攻高防低,怒气=攻击)===
            { id: 'warriorBloodRage', name: '血怒', icon: '🩸', color: '#d50000', rarity: 'rare',
              desc: '战士每 20 怒气提供 +5% 攻击伤害(可叠加)', stackable: true, maxStacks: 3,
              applicable: g => g.player.class === 'warrior',
              apply: g => { g.player.bloodRageStacks = (g.player.bloodRageStacks || 0) + 1; } },
            { id: 'warriorRavenous', name: '嗜血战意', icon: '⚔', color: '#b71c1c', rarity: 'epic',
              desc: '战士怒气 ≥70 时全部伤害 +30%', stackable: false,
              applicable: g => g.player.class === 'warrior',
              apply: g => { g.player.warriorRavenous = true; } },

            // === 强化职业特色:法师(多重施法 / 法力不够血来凑)===
            { id: 'mageMulticast', name: '奥术连击', icon: '✦', color: '#26c6da', rarity: 'epic',
              desc: '斥力波释放后 0.4s 再次无消耗触发一次', stackable: false,
              applicable: g => g.player.class === 'mage',
              apply: g => { g.player.mageMulticast = true; } },
            { id: 'mageBloodMagic', name: '血魔契约', icon: '✟', color: '#ad1457', rarity: 'epic',
              desc: '法力不足时消耗 2× 差额生命替代', stackable: false,
              applicable: g => g.player.class === 'mage',
              apply: g => { g.player.mageBloodMagic = true; } },

            // === 强化职业特色:弓手(投射物伤害高,防御低)===
            { id: 'archerStrongBow', name: '强弓', icon: '⟶', color: '#7cb342', rarity: 'rare',
              desc: '弓手普攻投射物伤害 +25%(可叠加)', stackable: true, maxStacks: 3,
              applicable: g => g.player.class === 'archer',
              apply: g => { g.player.archerAutoDmgMult = (g.player.archerAutoDmgMult || 1) * 1.25; } },
            { id: 'archerHunter', name: '猎手本能', icon: '◉', color: '#33691e', rarity: 'epic',
              desc: '弓手普攻投射物伤害 +60%,防御 -3', stackable: false,
              applicable: g => g.player.class === 'archer',
              apply: g => { g.player.archerAutoDmgMult = (g.player.archerAutoDmgMult || 1) * 1.60; g.player.defense = Math.max(0, g.player.defense - 3); } },

            // === 强化职业特色:刺客(高移速)===
            { id: 'assassinFleet', name: '疾影', icon: '➹', color: '#ce93d8', rarity: 'common',
              desc: '速度 +1(刺客专属,可叠加)', stackable: true, maxStacks: 5,
              applicable: g => g.player.class === 'assassin',
              apply: g => { g.player.speed += 1; } },
            { id: 'assassinShadowstep', name: '影步', icon: '☄', color: '#7b1fa2', rarity: 'epic',
              desc: '移动速度 ×1.3,刺客技能伤害 +15%', stackable: false,
              applicable: g => g.player.class === 'assassin',
              apply: g => { g.player.speed *= 1.3; g.player.assassinSkillDmgMult = (g.player.assassinSkillDmgMult || 1) * 1.15; } },

            // === 强化职业特色:圣骑士(高防低攻)===
            { id: 'paladinHolyShield', name: '圣盾术', icon: '🛡', color: '#1565c0', rarity: 'rare',
              desc: '防御 +8(圣骑士专属,可叠加)', stackable: true, maxStacks: 3,
              applicable: g => g.player.class === 'paladin',
              apply: g => { g.player.defense += 8; } },
            { id: 'paladinHolyVow', name: '神圣誓约', icon: '✟', color: '#0d47a1', rarity: 'epic',
              desc: '防御 +25,攻击 -10(圣骑士专属)', stackable: false,
              applicable: g => g.player.class === 'paladin' && g.player.attack > 10,
              apply: g => { g.player.defense += 25; g.player.attack = Math.max(5, g.player.attack - 10); } }
        ];
    }
    
    _initStars(count) {
        const stars = [];
        for (let i = 0; i < count; i++) {
            stars.push({
                x: Math.random() * this.width,
                y: Math.random() * this.height,
                r: Math.random() * 1.5 + 0.3,
                alpha: Math.random() * 0.6 + 0.2,
                twinkleSpeed: Math.random() * 0.02 + 0.005,
                twinkleOffset: Math.random() * Math.PI * 2
            });
        }
        return stars;
    }

    resizeCanvas() {
        // 画布按设备像素分配,高分屏(手机 DPR 2~3)不再发虚;DPR 封顶 2,兼顾性能
        const dpr = Math.min(window.devicePixelRatio || 1, Game.QUALITY[this.quality || 0].dpr);
        this.dpr = dpr;
        this.canvas.width = Math.round(window.innerWidth * dpr);
        this.canvas.height = Math.round(window.innerHeight * dpr);
        const s = Math.min(this.canvas.width / 800, this.canvas.height / 600);
        this.gameScale = s;
        this.gameOffsetX = (this.canvas.width - 800 * s) / 2;
        this.gameOffsetY = (this.canvas.height - 600 * s) / 2;
        this.width = 800;
        this.height = 600;
        SpriteCache.setScale(s, dpr);
        this._bgLayers = null; // 背景缓存随缩放重建
    }

    // shadowBlur 以设备像素计,不受 transform 影响;乘上 dpr 让光晕在高分屏下观感不变
    _patchShadowBlur() {
        const desc = Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype, 'shadowBlur');
        if (!desc || !desc.set) return;
        const game = this;
        Object.defineProperty(this.ctx, 'shadowBlur', {
            get() { return desc.get.call(this) / game.dpr; },
            set(v) { desc.set.call(this, v * game.dpr); }
        });
    }

    init() {
        Enemy.onDamage = v => this._creditDmg(v);
        this.bindEvents();
        this.updateUI();
        this.showingPotentialMenu = false;
    }
    
    bindEvents() {
        document.addEventListener('keydown', (e) => {
            if (e.key === ' ') {
                e.preventDefault();
            }
            this.keys[e.key] = true;

            // 在房间码输入框里打字时不触发静音
            if ((e.key === 'm' || e.key === 'M') && e.target.tagName !== 'INPUT') Sound.toggleMute();
            // 构筑面板:B / T 开关,Esc 关闭;打开期间不响应其它游戏按键
            const buildKey = e.key === 'b' || e.key === 'B' || e.key === 't' || e.key === 'T';
            if (this.showingBuild) {
                if ((buildKey || e.key === 'Escape') && !e.repeat) this.closeBuild();
                return;
            }
            if (this.showingPotentialMenu && !this.showingClassSelection && !e.repeat) { this._talentMenuKey(e.key); return; }
            if (buildKey && !e.repeat && e.target.tagName !== 'INPUT') { this.openBuild(); return; }
            if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
                if (this.isRunning) this.togglePause();
            }
            if (!this.isPaused && this.isRunning) {
                if (e.key === 'q' || e.key === 'Q') this._requestSkill('Q');
                else if (e.key === 'e' || e.key === 'E') this._requestSkill('E');
                else if ((e.key === ' ' || e.key === 'Shift') && !e.repeat) this._requestSkill('dash');
            }
        });
        
        document.addEventListener('keyup', (e) => {
            this.keys[e.key] = false;
        });
        
        document.getElementById('startBtn').addEventListener('click', () => {
            this.startGame();
        });
        
        document.getElementById('pauseBtn').addEventListener('click', () => {
            this.togglePause();
        });
        
        document.getElementById('restartBtn').addEventListener('click', () => {
            if (!this.mpMode) Immersive.enter(); // 单人「再来一局」直接开局
            this.restartGame();
        });
        
        // 统一坐标换算（含全屏缩放偏移）
        const toCanvas = (clientX, clientY) => {
            const rect = this.canvas.getBoundingClientRect();
            const cssX = (clientX - rect.left) * (this.canvas.width / rect.width);
            const cssY = (clientY - rect.top)  * (this.canvas.height / rect.height);
            return {
                x: (cssX - this.gameOffsetX) / this.gameScale,
                y: (cssY - this.gameOffsetY) / this.gameScale
            };
        };

        // 点击/触摸分派:菜单 → 技能按钮 → 移动
        const handlePointer = (clientX, clientY) => {
            const { x, y } = toCanvas(clientX, clientY);

            const mb = this.muteButton;
            if (mb && !this.showingPotentialMenu && !this.showingClassSelection &&
                x >= mb.x && x <= mb.x + mb.w && y >= mb.y && y <= mb.y + mb.h) {
                Sound.toggleMute();
                return;
            }
            const pb = this.pauseButton;
            if (pb && this.isRunning && !this.isPaused &&
                x >= pb.x && x <= pb.x + pb.w && y >= pb.y && y <= pb.y + pb.h) {
                this.togglePause();
                return;
            }

            if (this.showingPotentialMenu || this.showingClassSelection) {
                this.checkButtonClick(x, y);
                return;
            }

            // 普通暂停(非菜单):暂停面板上的按钮,点面板外继续(触屏设备没有 P 键)
            if (this.isRunning && this.isPaused) { if (!this.showingBuild) this._handlePauseClick(x, y); return; }
            if (!this.isRunning) return;

            // 检查是否点在技能按钮上
            for (const btn of this.skillButtons) {
                if (x >= btn.x && x <= btn.x + btn.w && y >= btn.y && y <= btn.y + btn.h) {
                    if (btn.skill === 'build') this.openBuild();
                    else this._requestSkill(btn.skill);
                    return; // 不触发移动
                }
            }

            // 否则移动(摇杆模式下空白处由摇杆接管,不设点击目标)
            if (this.controlMode !== 'joystick') this.setPlayerTarget(x, y);
        };

        // ── 虚拟摇杆:按下空白处生成底座,拖动方向即移动方向,松手停下 ──
        const toBacking = (clientX, clientY) => {
            const rect = this.canvas.getBoundingClientRect();
            return {
                x: (clientX - rect.left) * (this.canvas.width / rect.width),
                y: (clientY - rect.top)  * (this.canvas.height / rect.height),
                k: this.canvas.width / rect.width   // CSS px → 后备像素
            };
        };
        const tryStartJoy = (clientX, clientY, id) => {
            if (this.controlMode !== 'joystick' || this.joy.active) return false;
            if (!this.isRunning || this.isPaused || this.showingPotentialMenu || this.showingClassSelection) return false;
            const { x, y } = toCanvas(clientX, clientY);
            const hit = (b) => b && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
            if (hit(this.muteButton) || hit(this.pauseButton) || this.skillButtons.some(hit)) return false;
            const b = toBacking(clientX, clientY);
            Object.assign(this.joy, { active: true, id, bx: b.x, by: b.y, x: b.x, y: b.y, k: b.k });
            this._setJoyVector(0, 0);
            return true;
        };
        const moveJoy = (clientX, clientY) => {
            const j = this.joy;
            const b = toBacking(clientX, clientY);
            const R = Game.JOY_RADIUS * j.k;
            let dx = b.x - j.bx, dy = b.y - j.by;
            const d = Math.hypot(dx, dy);
            // 手指拖出半径时底座跟随,反向拖动不用先拖回原点
            if (d > R * 1.6) {
                const pull = d - R * 1.6;
                j.bx += dx / d * pull; j.by += dy / d * pull;
                dx = b.x - j.bx; dy = b.y - j.by;
            }
            j.x = b.x; j.y = b.y;
            const dd = Math.hypot(dx, dy);
            const mag = Math.min(1, dd / R);
            if (mag < 0.18) { this._setJoyVector(0, 0); return; }   // 死区
            // 推到 60% 以上即满速,轻推慢走
            const v = Math.min(1, (mag - 0.18) / 0.42);
            this._setJoyVector(dx / dd * v, dy / dd * v);
        };
        const endJoy = () => {
            this.joy.active = false;
            this.joy.id = null;
            this._setJoyVector(0, 0);
        };

        // ── 拖拽瞄准:在技能/冲刺按钮上按下,拖向想要的方向,松手释放;轻点不拖仍自动瞄准 ──
        const AIM_DEAD = 14;   // 拖动超过 14 CSS px 才算瞄准
        const tryStartAim = (clientX, clientY, id) => {
            if (this.skillMode !== 'aim' || this.aim.active) return false;
            if (!this.isRunning || this.isPaused || this.showingPotentialMenu || this.showingClassSelection) return false;
            const { x, y } = toCanvas(clientX, clientY);
            const btn = this.skillButtons.find(b => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
            if (!btn || btn.skill === 'build') return false;
            Object.assign(this.aim, {
                active: true, id, skill: btn.skill, hcx: btn.hcx, hcy: btn.hcy,
                sx: clientX, sy: clientY, ox: 0, oy: 0, dx: 0, dy: 0, armed: false
            });
            return true;
        };
        const moveAim = (clientX, clientY) => {
            const a = this.aim;
            a.ox = clientX - a.sx; a.oy = clientY - a.sy;
            const d = Math.hypot(a.ox, a.oy);
            a.armed = d > AIM_DEAD;
            if (a.armed) { a.dx = a.ox / d; a.dy = a.oy / d; }
        };
        const endAim = (cancel) => {
            const a = this.aim;
            if (!a.active) return;
            a.active = false;
            a.id = null;
            if (cancel || !this.isRunning || this.isPaused) return;
            this._requestSkill(a.skill, a.armed ? [a.dx, a.dy] : null);
        };

        this.canvas.addEventListener('click', (e) => {
            // 鼠标拖拽瞄准已在 mouseup 时释放,吞掉随后的 click
            if (this._aimClickGuard) { this._aimClickGuard = false; return; }
            handlePointer(e.clientX, e.clientY);
        });
        this.canvas.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            if (!tryStartAim(e.clientX, e.clientY, 'mouse')) tryStartJoy(e.clientX, e.clientY, 'mouse');
        });
        window.addEventListener('mousemove', (e) => {
            if (this.joy.active && this.joy.id === 'mouse') moveJoy(e.clientX, e.clientY);
            if (this.aim.active && this.aim.id === 'mouse') moveAim(e.clientX, e.clientY);
        });
        window.addEventListener('mouseup', (e) => {
            if (this.joy.active && this.joy.id === 'mouse') endJoy();
            if (this.aim.active && this.aim.id === 'mouse') {
                this._aimClickGuard = e.target === this.canvas;
                endAim(false);
            }
        });

        // 多点触控:每根手指单独分派,摇杆和技能按钮可同时按
        this.canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            for (const t of e.changedTouches) {
                if (tryStartAim(t.clientX, t.clientY, t.identifier)) continue;
                if (!tryStartJoy(t.clientX, t.clientY, t.identifier)) handlePointer(t.clientX, t.clientY);
            }
        }, { passive: false });

        this.canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            for (const t of e.changedTouches) {
                if (this.joy.active && this.joy.id === t.identifier) moveJoy(t.clientX, t.clientY);
                if (this.aim.active && this.aim.id === t.identifier) moveAim(t.clientX, t.clientY);
            }
        }, { passive: false });

        const touchEnd = (e) => {
            for (const t of e.changedTouches) {
                if (this.joy.active && this.joy.id === t.identifier) endJoy();
                if (this.aim.active && this.aim.id === t.identifier) endAim(e.type === 'touchcancel');
            }
        };
        this.canvas.addEventListener('touchend', touchEnd);
        this.canvas.addEventListener('touchcancel', touchEnd);

        // 窗口尺寸变化时重新计算缩放
        window.addEventListener('resize', () => {
            clearTimeout(this._resizeTimer);
            this._resizeTimer = setTimeout(() => this.resizeCanvas(), 100);
        });

        // 浏览器自动播放策略:音频需在用户手势中创建/恢复
        const unlockAudio = () => Sound.init();
        document.addEventListener('pointerdown', unlockAudio);
        document.addEventListener('touchstart', unlockAudio, { passive: true });
        document.addEventListener('keydown', unlockAudio);

        // 切后台/锁屏/来电时自动暂停,回来后需手动继续(避免回来时已被打死)
        document.addEventListener('visibilitychange', () => {
            if (document.hidden && this.isRunning && !this.isPaused) this.togglePause();
        });
        // 沉浸模式:局中被系统手势退出全屏、或转成竖屏时自动暂停;下一次点按(继续游戏)顺带重新进入全屏横屏
        const immersiveCheck = () => {
            this._updateRotateHint();
            if (!Immersive.enabled || !this.isRunning || this.isPaused) return;
            if (!Immersive.isFullscreen() || Immersive.isPortrait()) this.togglePause();
        };
        document.addEventListener('fullscreenchange', immersiveCheck);
        document.addEventListener('webkitfullscreenchange', immersiveCheck);
        window.addEventListener('resize', () => this._updateRotateHint());
        setInterval(() => this._updateRotateHint(), 500); // 开局/结束/断线等各处状态变化统一兜底
        document.addEventListener('pointerup', () => {
            if (Immersive.enabled && this.isRunning && (!Immersive.isFullscreen() || Immersive.isPortrait())) Immersive.enter();
        });
        // 失焦时清空按键状态,避免切回来后方向键"卡住"一直移动
        window.addEventListener('blur', () => { this.keys = {}; endJoy(); endAim(true); });
    }

    // 摇杆方向写进 keys(_jx/_jy,模长 0~1),与键盘走同一条路径,联机时随输入发给主机
    _setJoyVector(x, y) {
        this.keys._jx = x;
        this.keys._jy = y;
    }

    setSkillMode(mode) {
        this.skillMode = mode === 'aim' ? 'aim' : 'tap';
        Store.set('blockrun.skillMode', this.skillMode);
        this.aim.active = false;
    }

    setDiffMode(k) {
        if (!DIFF_MODES[k]) return;
        this.diffPref = k;
        Store.set('blockrun.diff', k);
    }

    setControlMode(mode) {
        this.controlMode = mode === 'tap' ? 'tap' : 'joystick';
        Store.set('blockrun.control', this.controlMode);
        this.joy.active = false;
        this._setJoyVector(0, 0);
        this.player.moving = false;
        this.player.targetX = this.player.targetY = null;
    }
    
    setPlayerTarget(x, y) {
        // 设置玩家的目标位置
        this.player.targetX = x;
        this.player.targetY = y;
        this.player.moving = true;
    }
    
    startGame() {
        if (!this.isRunning) {
            this.isRunning = true;
            this.isPaused = false;
            this.diffMode = this.diffPref;
            this._initRunProgress();
            this._lastFrameTime = performance.now();
            this._frameAccum = 0;
            const TICK_MS = 16;
            const loop = (now) => {
                if (!this.isRunning) return;
                try {
                    const elapsed = Math.min(100, now - this._lastFrameTime); // 切后台回来时一次性补帧,封顶 100ms
                    this._lastFrameTime = now;
                    // 顿帧(hit-stop):单人/客机冻结模拟,画面照常绘制(含震屏);
                    // 联机主机的模拟不能停(会卡住所有客机),改为冻结画面,结束后自然追上
                    if (this.hitStop > 0) {
                        this.hitStop -= elapsed / 1000;
                        if (this.mpMode !== 'host') {
                            this._frameAccum = 0;
                            this.render();
                            this._rafId = requestAnimationFrame(loop);
                            return;
                        }
                    }
                    const holdFrame = this.hitStop > 0;
                    this._frameAccum += elapsed;
                    // 安全阀:累计帧步数封顶 10 帧,避免长时间冻结后死循环补帧
                    let steps = 0;
                    while (this._frameAccum >= TICK_MS && steps < 10) {
                        this.update();
                        this._frameAccum -= TICK_MS;
                        steps++;
                    }
                    if (this._frameAccum > TICK_MS * 10) this._frameAccum = 0;
                    if (!holdFrame) this.render();
                    this._perfSample(elapsed);
                } catch (err) {
                    // 不让一次异常杀死整个循环;打印堆栈供排查
                    console.error('[game loop error]', err);
                }
                this._rafId = requestAnimationFrame(loop);
            };
            this._rafId = requestAnimationFrame(loop);
        }
    }
    
    // 自动画质:帧间隔做指数平滑(画布光栅化在 GPU/合成线程,只量 JS 耗时会低估,所以看实际帧率),
    // 运行中持续 3 秒低于约 45 帧就降一档并重建画布;暂停、顿帧和菜单期间不计
    _perfSample(elapsed) {
        if (this.isPaused || this.hitStop > 0 || (this.quality || 0) >= Game.QUALITY.length - 1) return;
        this._perfEma = (this._perfEma || 16.7) * 0.95 + elapsed * 0.05;
        if (this._perfEma > Game.PERF_FRAME_MS) this._perfSlowT = (this._perfSlowT || 0) + elapsed / 1000;
        else this._perfSlowT = Math.max(0, (this._perfSlowT || 0) - elapsed / 2000);
        if (this._perfSlowT < 3) return;
        this.quality = (this.quality || 0) + 1;
        this._perfSlowT = 0;
        this._perfEma = 16.7;
        this.resizeCanvas();
        if (this.achToasts) this.achToasts.push({ icon: '⚙', title: '画质', name: '已自动降低', desc: '检测到掉帧,降低分辨率与粒子数量以保持流畅', t: 0 });
    }

    // 粒子数量按画质档位缩减(至少留 1 颗)
    _fxCount(count) {
        const k = Game.QUALITY[this.quality || 0].fx;
        return k >= 1 ? count : Math.max(1, Math.round(count * k));
    }

    // 沉浸模式下局中竖屏:盖一层「请横屏」提示(iPhone 等不能锁定方向的设备靠它引导)
    _updateRotateHint() {
        const el = document.getElementById('rotateHint');
        if (!el) return;
        const show = Immersive.enabled && this.isRunning && Immersive.isPortrait();
        el.style.display = show ? 'flex' : 'none';
        if (show && !this.isPaused) this.togglePause();
    }

    togglePause() {
        if (this.isRunning) {
            this.isPaused = !this.isPaused;
            this._pauseQuitArmed = false;
        }
    }
    
    restartGame() {
        this.isRunning = false; // 让当前 rAF 循环自然结束
        this.closeBuild();
        this.aim.active = false;
        this.joy.active = false;
        this._setJoyVector(0, 0);
        if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = null; }
        this.player = new Player(this.width / 2, this.height / 2);
        this.enemies = [];
        this.items = [];
        this.projectiles = [];
        this.effects = [];
        this.enemyBullets = [];
        this.keys = {};
        this.isRunning = false;
        this.isPaused = false;
        this.life = 1;
        this.maxLife = 3;
        this.level = 1;
        this.exp = 0;
        this.expToNext = 100;
        this.score = 0;
        this.gameTime = 0;
        this.difficulty = 1;
        this.enemyFreezeTimer = 0;
        this.gearTimer = 20;
        this.gemTimer = 30;
        this._resetEvents();
        this.showingPotentialMenu = false;
        this.showingClassSelection = false;
        this.particles = [];
        this.pendingActions = [];
        this._uiTimer = 0;
        this.buttons = [];
        this.skillButtons = [];
        this.freezeOverlay = null;
        this.bgTime = 0;
        this.stars = this._initStars(120);
        // 天赋状态重置
        this.currentTalentChoices = [];
        this.scoreMult = 1;
        this.expGrowthMult = 1;
        // 魔王状态重置
        this.bossState = 'idle';
        this.bossTimer = this.bossInterval || 60;
        this.bossWarningTimer = 0;
        this.bossActiveTimer = 0;
        this.bossDamageDealt = 0;
        this.boss = null;
        this.screenShake = 0;
        this._lastBossWarnSec = 0;
        this.bossWave = 0;            // 本局第几只魔王(决定魔王等级与解锁的新招)
        this.dmgNums = [];            // 伤害数字 { id, x, y, v, k(0 普通/1 暴击/2 持续), t, target }
        this._mpDn = [];              // host:自上次广播以来新建/变化的伤害数字
        // 打击感:顿帧剩余(真实秒)、本机受击红色暗角、上次击杀顿帧时间(防连杀卡顿)
        this.hitStop = 0;
        this.hurtVignette = 0;
        this._lastKillStopAt = 0;
        // 联机状态重置
        this.mpPlayers = [];
        this.mpGuestPlayers = new Map();
        this.mpGuestInputs = new Map();
        this.mpFrameCount = 0;
        this.mpStateBuffer = null;
        this.mpSnapTime = 0;
        this.mpSnapInterval = 50;
        this._mpFx = [];
        this._mpHasOwnPos = false;
        this._sfxPrev = null;
        this._mpGuestLastLevel = 1;
        document.getElementById('gameOver').style.display = 'none';
        this.updateUI();
        this.render();
    }

    // ══════════════════════════════════════════════════════════════════
    //  联机多人 - 网络连接与房间管理
    // ══════════════════════════════════════════════════════════════════

    connectToServer(serverUrl) {
        return new Promise((resolve, reject) => {
            if (this.mpWs && this.mpWs.readyState === WebSocket.OPEN) { resolve(); return; }
            const ws = new WebSocket(serverUrl);
            ws.onopen = () => { this.mpWs = ws; this.mpServerUrl = serverUrl; resolve(); };
            ws.onerror = () => reject(new Error('无法连接服务器'));
            ws.onclose = () => {
                if (this.isRunning) {
                    this.isRunning = false;
                    if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = null; }
                    this._mpShowStatus('与服务器断开连接', true);
                }
                this.mpWs = null;
                this.mpMode = null;
            };
            ws.onmessage = (evt) => this._handleServerMessage(JSON.parse(evt.data));
        });
    }

    _handleServerMessage(msg) {
        switch (msg.type) {
            case 'created':
                this.mpPlayerId = msg.playerId; // 0
                this.mpRoomCode = msg.code;
                this._mpShowLobby(msg.code, true);
                break;
            case 'joined':
                this.mpPlayerId = msg.playerId;
                this.mpRoomCode = msg.code;
                this._mpShowLobby(msg.code, false);
                break;
            case 'room_info':
                this._mpUpdatePlayerList(msg.players);
                break;
            case 'player_joined':
                this._mpShowStatus(`玩家 ${msg.playerId} 加入房间`);
                break;
            case 'player_left':
                this.mpGuestPlayers.delete(msg.playerId);
                this.mpGuestInputs.delete(msg.playerId);
                this.mpPlayers = this.mpPlayers.filter(p => p.id !== msg.playerId);
                this._mpShowStatus(`玩家 ${msg.playerId} 离开`);
                break;
            case 'game_start':
                this._startMpGameLocal();
                break;
            case 'state':
                if (this.mpMode === 'guest') this.mpStateBuffer = msg.data;
                break;
            case 'input':
                if (this.mpMode === 'host') {
                    this.mpGuestInputs.set(msg.playerId, {
                        keys: msg.keys, targetX: msg.targetX,
                        targetY: msg.targetY, moving: msg.moving, stats: msg.stats
                    });
                    this._mpGuestPlayer(msg.playerId);
                }
                break;
            case 'castSkill':
                if (this.mpMode === 'host' && !this.isPaused) this._castGuestSkill(msg.playerId, msg.skill, msg.aim);
                break;
            case 'talentChoose':
                if (this.mpMode === 'host') {
                    const gp = this.mpGuestPlayers.get(msg.playerId);
                    const def = this.talentDefs.find(t => t.id === msg.talentId);
                    if (gp && def) this._runAsPlayer(gp, () => this._applyTalent(def));
                }
                break;
            case 'classChoose':
                if (this.mpMode === 'host') {
                    const gp = this.mpGuestPlayers.get(msg.playerId);
                    if (gp) this._applyClassToPlayer(gp, msg.choice);
                }
                break;
            case 'game_over':
                this._showGameOver(msg.stats.time, msg.stats.score);
                this.isRunning = false;
                if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = null; }
                break;
            case 'host_left':
                this._mpShowStatus('房主离开，游戏结束', true);
                this.isRunning = false;
                if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = null; }
                document.getElementById('mpOverlay').style.display = 'flex';
                break;
            case 'error':
                this._mpShowStatus(msg.msg, true);
                break;
        }
    }

    _startMpGameLocal() {
        document.getElementById('mpOverlay').style.display = 'none';
        if (this.mpPlayerId === 0) {
            this.mpMode = 'host';
        } else {
            this.mpMode = 'guest';
        }
        if (!this.isRunning) this.startGame();
    }

    // ── 联机大厅 UI 辅助 ──
    _mpPlayerColor(id) {
        return ['#4CAF50', '#2196F3', '#ff9800', '#e91e63'][id] || '#ffffff';
    }

    _mpShowStatus(msg, isError) {
        const el = document.getElementById('mpStatus');
        if (el) {
            el.textContent = msg;
            el.className = 'mp-status' + (isError ? ' error' : ' success');
        }
    }

    _mpShowLobby(code, isHost) {
        document.getElementById('mpLobby').style.display = 'block';
        document.getElementById('mpRoomCode').textContent = code;
        const startBtn = document.getElementById('mpStart');
        const waitMsg = document.getElementById('mpWaitMsg');
        if (isHost) {
            startBtn.style.display = 'block';
            waitMsg.style.display = 'none';
        } else {
            startBtn.style.display = 'none';
            waitMsg.style.display = 'block';
        }
        this._mpShowStatus(isHost ? '房间已创建，等待玩家加入...' : '已加入房间，等待房主开始...');
    }

    _mpUpdatePlayerList(players) {
        const el = document.getElementById('mpPlayerList');
        if (!el) return;
        el.innerHTML = players.map(p => {
            const color = this._mpPlayerColor(p.id);
            const label = p.isHost ? '房主' : `玩家 ${p.id}`;
            return `<div class="mp-player-item">
                <div class="mp-player-dot" style="background:${color}"></div>
                <span>${label}</span>
            </div>`;
        }).join('');
    }

    // ── Host：广播游戏状态 ──
    broadcastState() {
        if (!this.mpWs || this.mpWs.readyState !== WebSocket.OPEN) return;
        this.mpWs.send(JSON.stringify({ type: 'state', data: this.serializeState() }));
    }

    // 快照用紧凑数组 + 量化数值,只发渲染需要的动态字段(体积约为对象格式的 1/4)
    //   e: [id, 类型序号, x, y, hp, maxHp, 眩晕(0/1), (炮手) aimAngle, shootTimer, shootInterval]
    //     冲锋者/自爆者额外 [状态, 状态剩余, 状态总长, 冲刺角度, 冲刺距离/爆炸半径]
    //   i: [id, 类型序号, 落点x, 落点y, 剩余时长]
    //     e 的标志位:1 眩晕 / 2 受击闪白 / 4 精英 / 8 中毒 / 16 燃烧
    //   p: [id, 种类(0 普通弹/1 穿透箭/2 装备弹/3 奥术弹/4 爆裂火球), x, y, 角度]
    //   ev: [事件序号(EVENT_TYPES), 剩余, 总时长, 剩余精英数, (祭坛) x, y, 充能 0~1] 或 0;bt: 魔王 idle 倒计时mt: [id, x, y, 半径, 落地倒计时, 总时长]
    //   b: [id, x, y, 角度]
    //   boss: [x, y, hp, maxHp, 击退中(0/1), 受击闪白(0/1), 招式序号(BlockBoss.ATK_CODES), 招式阶段, 阶段剩余, 阶段总长, 招式角度, 狂暴(0/1), 等级, 激光扫向(±1)]
    serializeState() {
        this._mpSnapSeq = (this._mpSnapSeq || 0) + 1;
        const players = [this._serializePlayer(this.player, 0)];
        for (const [id, gp] of this.mpGuestPlayers) {
            players.push(this._serializePlayer(gp, id));
        }
        return {
            e: this.enemies.map(e => {
                const row = [e.id, MP_ENEMY_TYPES.indexOf(e.type), q1(e.x), q1(e.y),
                    Math.ceil(e.currentHealth), Math.ceil(e.maxHealth), (e.stunTimer > 0 ? 1 : 0) | (e._mpHit ? 2 : 0) | (e.elite ? 4 : 0) | (e.poison > 0 ? 8 : 0) | (e.burnT > 0 ? 16 : 0)];
                e._mpHit = false;
                if (e.type === 'gunner') row.push(q2(e.aimAngle || 0), q2(e.shootTimer || 0), q2(e.shootInterval || 1));
                else if (e.type === 'dasher' || e.type === 'bomber' || e.type === 'healer') row.push(e.state, q2(e.stateTimer), q2(e.stateDur), q2(e.dashAngle),
                    q1(e.type === 'dasher' ? e.dashDist : e.type === 'bomber' ? e.blastRadius : e.healRadius));
                return row;
            }),
            boss: this.boss ? [q1(this.boss.x), q1(this.boss.y), Math.ceil(this.boss.currentHealth),
                Math.ceil(this.boss.maxHealth), this.boss.retreating ? 1 : 0, this._mpTakeBossHit(),
                BlockBoss.ATK_CODES.indexOf(this.boss.atk), this.boss.atkPhase, q2(this.boss.atkTimer),
                q2(this.boss.atkDur), q2(this.boss.atkAngle), this.boss.enraged ? 1 : 0, this.boss.tier || 1, this.boss.atkSweep || 1] : null,
            i: this.items.map(i => [i.id, MP_ITEM_TYPES.indexOf(i.type), q1(i.targetX), q1(i.targetY), q1(i.duration)]),
            p: this.projectiles.map(p => [p.id, p.isPiercing && !p.pierceRemaining ? 1 : p.gearBolt ? 2 : p.kind || 0, q1(p.x), q1(p.y),
                q2(Math.atan2(p.dy, p.dx))]),
            b: this.enemyBullets.map(b => [b.id, q1(b.x), q1(b.y), q2(b.angle)]),
            players,
            ev: this.event ? [EVENT_TYPES.indexOf(this.event.type), q1(this.event.timer), this.event.dur, this.event.left || 0,
                ...(this.event.type === 'altar' ? [q1(this.event.ax), q1(this.event.ay), q2(this.event.charge)] : [])] : 0,
            bt: this.bossState === 'idle' ? q1(this.bossTimer) : 0,
            mt: this.meteors.map(m => [m.id, q1(m.x), q1(m.y), q1(m.r), q2(m.t), m.dur]),
            tk: this.treasureKills, ek: this.eliteKills, dm: this.diffMode,
            ef: this._mpTakeNewEffects(),
            fx: this._mpFx.splice(0),
            dn: this._mpTakeDmgNums(),
            gameTime: q1(this.gameTime), level: this.level, score: this.score,
            exp: Math.floor(this.exp), expToNext: this.expToNext, maxLife: this.maxLife,
            difficulty: q2(this.difficulty), life: this.life,
            enemyFreezeTimer: q2(this.enemyFreezeTimer),
            bossState: this.bossState, bossWarningTimer: q2(this.bossWarningTimer),
            bossActiveTimer: q1(this.bossActiveTimer), bossDamageDealt: Math.floor(this.bossDamageDealt), screenShake: q2(this.screenShake)
        };
    }

    _mpTakeBossHit() {
        const hit = this.boss._mpHit ? 1 : 0;
        this.boss._mpHit = false;
        return hit;
    }

    // 自上次广播以来新增的特效(纯数据对象),数值量化后发送
    _mpTakeNewEffects() {
        const out = [];
        for (const e of this.effects) {
            if (e._mpSent) continue;
            e._mpSent = true;
            const c = {};
            for (const k in e) {
                if (k === '_mpSent') continue;
                const v = e[k];
                c[k] = typeof v === 'number' ? q2(v) : v;
            }
            out.push(c);
        }
        return out;
    }

    _serializePlayer(p, id) {
        const d = {
            id, x: q1(p.x), y: q1(p.y), size: p.size, color: p.color,
            currentHealth: Math.ceil(p.currentHealth), maxHealth: Math.ceil(p.maxHealth),
            class: p.class, hurtCooldown: q2(p.hurtCooldown), invincibleTimer: q2(p.invincibleTimer), kc: p.killCount || 0,
            sp: p.spec || 0, aw: p.awakened ? 1 : 0,
            dc: q2(p.dashCooldown), dt: q2(p.dashTimer), dg: p.dodgeCount || 0,
            // 连杀 [连杀数, 剩余秒] 与本局最高连杀
            cb: p.combo > 0 ? [p.combo, q2(p.comboTimer)] : 0, mc: p.maxCombo || 0,
            // 限时装备 [种类序号, 剩余, 总时长, 法球角度]
            g: p.gear ? [GEAR_TYPES.indexOf(p.gear.type), q1(p.gear.timer), p.gear.max, q2(p.gear.angle || 0)] : 0,
            bl: p.blessTimer > 0 ? q1(p.blessTimer) : 0,  // 祭坛祝福剩余秒数
            // 拾取过的技能石(host 判定拾取,guest 据此得到宝石;镶嵌以 guest 本地为准)
            gl: p.gemLog || undefined,
            // 伤害构成(约每秒一次,按 DMG_SRCS 顺序取整)
            ds: this._mpSnapSeq % 20 === 0 ? DMG_SRCS.map(k => Math.round((p.dmgStats && p.dmgStats[k]) || 0)) : undefined,
            skillQ: { cooldown: q2(p.skillQ.cooldown), maxCooldown: q2(p.skillQ.maxCooldown), level: p.skillQ.level },
            skillE: { cooldown: q2(p.skillE.cooldown), maxCooldown: q2(p.skillE.maxCooldown), level: p.skillE.level }
        };
        // 职业资源只发本职业用到的
        switch (p.class) {
            case 'mage':     d.mana = q1(p.mana); d.maxMana = p.maxMana; d.qOn = p.qToggleActive ? 1 : 0; break;
            case 'warrior':  d.rage = q1(p.rage); d.maxRage = p.maxRage; break;
            case 'paladin':  d.faith = q1(p.faith); d.maxFaith = p.maxFaith; d.shield = q1(p.shield); break;
            case 'archer':   d.arrows = p.arrows; d.maxArrows = p.maxArrows; d.reload = q2(p.reloadTimer); d.reloadDur = q2(p.reloadDuration); break;
            case 'assassin': d.assassinCharge = q1(p.assassinCharge); d.maxAssassinCharge = p.maxAssassinCharge; break;
        }
        return d;
    }

    // ── Guest：插值辅助 ──
    // 每次快照把对象当前位置记为起点、快照位置记为终点,之后按时间在两者间平滑过渡
    _mpSetTarget(o, x, y, isNew) {
        if (isNew || Math.abs(x - o.x) + Math.abs(y - o.y) > 150) {
            // 新对象或瞬移(复活/出场)直接落位
            o.x = o._fx = o._tx = x;
            o.y = o._fy = o._ty = y;
        } else {
            o._fx = o.x; o._fy = o.y;
            o._tx = x;   o._ty = y;
        }
    }

    // 按 id 复用对象:已存在的更新,新出现的创建,消失的收集到 removed
    _mpSyncList(list, rows, create, update) {
        const byId = new Map();
        for (const o of list) byId.set(o.id, o);
        const out = [];
        for (const r of rows) {
            let o = byId.get(r[0]);
            const isNew = !o;
            if (isNew) { o = create(r); o.id = r[0]; }
            else byId.delete(r[0]);
            update(o, r, isNew);
            out.push(o);
        }
        return { list: out, removed: [...byId.values()] };
    }

    // 快照里的装备行 → 本地装备对象;法球角度记下收到时刻,渲染时按转速外推
    _mpGear(g) {
        if (!g) return null;
        return { type: GEAR_TYPES[g[0]], timer: g[1], max: g[2], angle: g[3], _phaseAt: this.bgTime };
    }

    // ── Guest：应用 host 广播的世界状态 ──
    applyRemoteState(snapshot) {
        if (!snapshot) return;

        // 估算快照间隔(指数平滑),插值时长随网络实际节奏自适应
        const now = performance.now();
        if (this.mpSnapTime) {
            const dt = now - this.mpSnapTime;
            if (dt > 0 && dt < 500) this.mpSnapInterval = this.mpSnapInterval * 0.8 + dt * 0.2;
        }
        this.mpSnapTime = now;

        // 敌人(仅渲染,不运行 AI)
        const en = this._mpSyncList(this.enemies, snapshot.e || [],
            r => {
                const e = new Enemy(r[2], r[3], MP_ENEMY_TYPES[r[1]] || 'chaser', 1);
                if (r[6] & 4) e.makeElite();
                return e;
            },
            (e, r, isNew) => {
                this._mpSetTarget(e, r[2], r[3], isNew);
                e.currentHealth = r[4]; e.maxHealth = r[5];
                e.stunTimer = r[6] & 1 ? 1 : 0;
                e.poison = r[6] & 8 ? 1 : 0;
                e.burnT = r[6] & 16 ? 1 : 0;
                if (r[6] & 2) e.flash();
                if (r.length > 7) {
                    if (e.type === 'gunner') { e.aimAngle = r[7]; e.shootTimer = r[8]; e.shootInterval = r[9]; }
                    else {
                        // 冲刺 / 点燃引信的音效按状态边沿在本机播放
                        if (!isNew && r[7] !== e.state) {
                            if (e.type === 'dasher' && r[7] === 2) Sound.play('dash');
                            if (e.type === 'bomber' && r[7] === 1) Sound.play('fuse');
                            if (e.type === 'healer' && r[7] === 0 && e.stateTimer < 0.2) Sound.play('enemyHeal'); // 引导完成(被打断时计时还长)
                        }
                        e.state = r[7]; e.stateTimer = r[8]; e.stateDur = r[9]; e.dashAngle = r[10];
                        if (e.type === 'dasher') e.dashDist = r[11];
                        else if (e.type === 'bomber') e.blastRadius = r[11];
                        else e.healRadius = r[11];
                    }
                }
            });
        this.enemies = en.list;
        if (en.removed.length > 0) Sound.play(en.removed.some(e => e.type === 'bomber') ? 'bomb' : 'kill');
        if (snapshot.tk > (this.treasureKills || 0)) Sound.play('treasure');

        // Boss
        if (snapshot.boss) {
            const [bx, by, hp, maxHp, retreating, hit, atk, atkPhase, atkTimer, atkDur, atkAngle, enraged, tier, sweep] = snapshot.boss;
            const isNew = !this.boss;
            if (isNew) this.boss = new BlockBoss(bx, by, snapshot.difficulty || 1, this.player.maxHealth);
            this._mpSetTarget(this.boss, bx, by, isNew);
            this.boss.currentHealth = hp;
            this.boss.maxHealth = maxHp;
            this.boss.retreating = !!retreating;
            if (hit) this.boss.flash();
            this.boss.atk = BlockBoss.ATK_CODES[atk] || null;
            this.boss.atkPhase = atkPhase || 0;
            this.boss.atkTimer = atkTimer || 0;
            this.boss.atkDur = atkDur || 1;
            this.boss.atkAngle = atkAngle || 0;
            this.boss.enraged = !!enraged;
            this.boss.tier = tier || 1;
            this.boss.atkSweep = sweep || 1;
        } else {
            this.boss = null;
        }

        // 随机事件与陨石(陨石落地倒计时在 _mpInterpolate 里本地推进)
        const evRow = snapshot.ev;
        this.event = evRow ? { type: EVENT_TYPES[evRow[0]], timer: evRow[1], dur: evRow[2], left: evRow[3],
            ax: evRow[4], ay: evRow[5], charge: evRow[6] || 0 } : null;
        if (snapshot.bt !== undefined) this.bossTimer = snapshot.bt;
        const mt = this._mpSyncList(this.meteors, snapshot.mt || [], () => ({}),
            (m, r) => { m.x = r[1]; m.y = r[2]; m.r = r[3]; m.t = r[4]; m.dur = r[5]; });
        this.meteors = mt.list;
        if (mt.removed.length) Sound.play('meteor');
        if (snapshot.tk !== undefined) this.treasureKills = snapshot.tk;
        if (snapshot.ek !== undefined) this.eliteKills = snapshot.ek;
        if (snapshot.dm && DIFF_MODES[snapshot.dm]) this.diffMode = snapshot.dm;

        // 道具(仅渲染;落地/旋转动画在本地跑)
        const it = this._mpSyncList(this.items, snapshot.i || [],
            r => new Item(r[2], r[3], MP_ITEM_TYPES[r[1]] || 'potion'),
            (o, r) => { o.duration = r[4]; o.targetX = r[2]; o.targetY = r[3]; });
        this.items = it.list;
        // 还剩不少时长就消失 = 被拾取了
        const picked = it.removed.find(o => o.duration > 0.3);
        if (picked) Sound.play('pickup', picked.rarity);

        // 子弹
        this.projectiles = this._mpSyncList(this.projectiles, snapshot.p || [],
            r => r[1] === 1
                ? new PiercingArrow(r[2], r[3], Math.cos(r[4]), Math.sin(r[4]), 0, null)
                : (() => { const o = new Projectile(r[2], r[3], Math.cos(r[4]), Math.sin(r[4]), 0); if (r[1] >= 3) o.setKind(r[1]); return o; })(),
            (o, r, isNew) => { this._mpSetTarget(o, r[2], r[3], isNew); o.angle = r[4]; o.gearBolt = r[1] === 2; }).list;
        this.enemyBullets = this._mpSyncList(this.enemyBullets, snapshot.b || [],
            r => new EnemyBullet(r[1] + 6, r[2] + 6, Math.cos(r[3]), Math.sin(r[3]), 0),
            (o, r, isNew) => { this._mpSetTarget(o, r[1], r[2], isNew); o.angle = r[3]; }).list;

        // 更新本机玩家（接受 host 的位置和生命值）
        const myData = snapshot.players.find(p => p.id === this.mpPlayerId);
        if (myData) {
            this._mpSetTarget(this.player, myData.x, myData.y, !this._mpHasOwnPos);
            this._mpHasOwnPos = true;
            this.player.currentHealth = myData.currentHealth;
            this.player.maxHealth = myData.maxHealth;
            this.player.hurtCooldown = myData.hurtCooldown || 0;
            this.player.invincibleTimer = myData.invincibleTimer || 0;
            this.player.killCount = myData.kc || 0;
            this.player.dashCooldown = myData.dc || 0;
            this.player.dashTimer = myData.dt || 0;
            this.player.dodgeCount = myData.dg || 0;
            this.player.combo = myData.cb ? myData.cb[0] : 0;
            this.player.frenzyTier = Math.min(5, Math.floor(this.player.combo / 10));
            this.player.comboTimer = myData.cb ? myData.cb[1] : 0;
            this.player.maxCombo = myData.mc || 0;
            if (myData.ds) DMG_SRCS.forEach((k, i) => { this.player.dmgStats[k] = myData.ds[i]; });
            this.player.gear = this._mpGear(myData.g);
            this.player.blessTimer = myData.bl || 0;
            // 新捡到的技能石:追加到本地背包并自动镶嵌
            const gl = myData.gl || '';
            const mine = this.player.gemLog;
            if (gl !== mine) {
                this.player.gemLog = gl;
                this.player._buildVer++;
                if (gl.length > mine.length && gl.startsWith(mine)) {
                    for (const ch of gl.slice(mine.length)) {
                        const id = GEM_TYPES[parseInt(ch, 36)];
                        if (!id) continue;
                        this._onGemGained(this.player, id);
                        this._showFloatingText(`技能石 ${GEMS[id].name} Lv${this._gemLv(this.player, id)}`,
                            this.player.x + this.player.size / 2, this.player.y - 26, GEMS[id].color);
                    }
                }
            }
            // 同步资源（用于 HUD 显示）
            if (myData.mana !== undefined)    this.player.mana   = myData.mana;
            if (myData.maxMana !== undefined) this.player.maxMana = myData.maxMana;
            if (myData.rage !== undefined)    this.player.rage   = myData.rage;
            if (myData.faith !== undefined)   this.player.faith  = myData.faith;
            if (myData.shield !== undefined)  this.player.shield = myData.shield;
            if (myData.arrows !== undefined)  this.player.arrows = myData.arrows;
            if (myData.assassinCharge !== undefined) this.player.assassinCharge = myData.assassinCharge;
            if (myData.maxArrows !== undefined) this.player.maxArrows = myData.maxArrows;
            if (myData.reload !== undefined)  this.player.reloadTimer = myData.reload;
            if (myData.reloadDur !== undefined) this.player.reloadDuration = myData.reloadDur;
            if (myData.qOn !== undefined)     this.player.qToggleActive = !!myData.qOn;
            // 只同步冷却;等级/冷却上限来自本地天赋,由 sendGuestInput 发给 host
            if (myData.skillQ) this.player.skillQ.cooldown = myData.skillQ.cooldown;
            if (myData.skillE) this.player.skillE.cooldown = myData.skillE.cooldown;
            if (myData.class && !this.player.class) {
                this.player.class = myData.class;
            }
        }

        // 其他玩家（用于渲染，复用对象以便插值）
        const prevOthers = new Map(this.mpPlayers.map(p => [p.id, p]));
        this.mpPlayers = snapshot.players.filter(p => p.id !== this.mpPlayerId).map(d => {
            const o = prevOthers.get(d.id);
            const { x, y, g, ...rest } = d;
            rest.gear = this._mpGear(g);
            if (!o) { const n = { ...rest, x, y }; this._mpSetTarget(n, x, y, true); return n; }
            Object.assign(o, rest);
            this._mpSetTarget(o, x, y, false);
            return o;
        });

        // 特效与粒子(技能/命中/拾取的视觉反馈)
        if (snapshot.ef) for (const e of snapshot.ef) this.effects.push(e);
        if (snapshot.fx) {
            for (const [kind, ...a] of snapshot.fx) {
                if (kind === 'h') this.spawnHitParticles(...a);
                else if (kind === 'p') this.spawnParticles(...a);
                else if (kind === 'r') this.spawnBurstRing(...a);
            }
        }
        this._mpApplyDmgNums(snapshot.dn);

        // 共享游戏状态
        this.gameTime          = snapshot.gameTime;
        this.level             = snapshot.level;
        this.score             = snapshot.score;
        if (snapshot.exp !== undefined)       this.exp       = snapshot.exp;
        if (snapshot.expToNext !== undefined) this.expToNext = snapshot.expToNext;
        if (snapshot.maxLife !== undefined)   this.maxLife   = snapshot.maxLife;
        this.difficulty        = snapshot.difficulty;
        this.life              = snapshot.life;
        this.enemyFreezeTimer  = snapshot.enemyFreezeTimer;
        this.bossState         = snapshot.bossState;
        this.bossWarningTimer  = snapshot.bossWarningTimer || 0;
        this.bossActiveTimer   = snapshot.bossActiveTimer  || 0;
        this.bossDamageDealt   = snapshot.bossDamageDealt  || 0;
        this.screenShake       = snapshot.screenShake      || 0;
    }

    // ── Guest：每帧在两次快照之间插值位置,并在本地推进纯视觉动画 ──
    _mpInterpolate() {
        const a = this.mpSnapTime
            ? Math.max(0, Math.min(1, (performance.now() - this.mpSnapTime) / Math.max(16, this.mpSnapInterval)))
            : 1;
        const lerp = (o, trailMax) => {
            if (o._tx === undefined) return;
            if (trailMax && o.trail) {
                o.trail.push({ x: o.x + o.size / 2, y: o.y + o.size / 2 });
                if (o.trail.length > trailMax) o.trail.shift();
            }
            o.x = o._fx + (o._tx - o._fx) * a;
            o.y = o._fy + (o._ty - o._fy) * a;
        };
        for (const e of this.enemies) lerp(e);
        for (const p of this.projectiles) lerp(p, p instanceof PiercingArrow ? 12 : 8);
        for (const b of this.enemyBullets) lerp(b, 8);
        for (const p of this.mpPlayers) {
            lerp(p);
            if (p.hurtCooldown > 0) p.hurtCooldown -= DT;
            if (p.invincibleTimer > 0) p.invincibleTimer -= DT;
        }
        lerp(this.player);
        if (this.boss) {
            lerp(this.boss);
            this.boss.phase += 0.04;
            if (this.boss.atk) this.boss.atkTimer = Math.max(0, this.boss.atkTimer - DT);
        }
        for (const it of this.items) it.update();
        for (const m of this.meteors) m.t = Math.max(0, m.t - DT);
        if (this.event) this.event.timer = Math.max(0, this.event.timer - DT);
    }

    // ── Guest：发送输入 ──
    sendGuestInput() {
        if (!this.mpWs || this.mpWs.readyState !== WebSocket.OPEN) return;
        const p = this.player;
        const idle = this.isPaused; // 菜单/暂停中:发送空输入让角色原地停下
        const k = idle ? {} : this.keys;
        const hasTarget = !idle && p.moving && p.targetX !== null;
        const payload = JSON.stringify({
            type: 'input',
            keys: {
                ArrowUp:    !!k['ArrowUp'],   ArrowDown:  !!k['ArrowDown'],
                ArrowLeft:  !!k['ArrowLeft'],  ArrowRight: !!k['ArrowRight'],
                w: !!k['w'], a: !!k['a'],
                s: !!k['s'], d: !!k['d'],
                _jx: q2(k._jx || 0), _jy: q2(k._jy || 0)
            },
            targetX: hasTarget ? p.targetX : null,
            targetY: hasTarget ? p.targetY : null,
            moving: hasTarget,
            // 同步属性给 host（天赋/职业效果用于战斗模拟）
            stats: {
                attack: p.attack, defense: p.defense, speed: p.speed,
                maxHealth: p.maxHealth, class: p.class,
                qLevel: p.skillQ.level, eLevel: p.skillE.level,
                qMaxCd: p.skillQ.maxCooldown, eMaxCd: p.skillE.maxCooldown,
                dashMaxCd: p.dashMaxCooldown,
                spec: p.spec || undefined, awk: p.awakened ? 1 : undefined,
                tr: this._encodeTree(p), sk: this._encodeSockets(p),
                menu: (this.showingClassSelection || this.showingPotentialMenu || this.showingBuild) ? 1 : undefined
            }
        });
        // 输入没变化时不必每帧发送(host 会沿用上一次输入),仅保留 250ms 心跳
        const now = performance.now();
        if (payload !== this._mpLastInput || now - (this._mpLastInputTime || 0) > 250) {
            this.mpWs.send(payload);
            this._mpLastInput = payload;
            this._mpLastInputTime = now;
        }
        // 发送后清除移动目标，避免连续帧发送相同位置
        if (hasTarget) {
            p.moving = false;
            p.targetX = null;
            p.targetY = null;
        }
    }

    // ── Host：应用 guest 输入到其 Player 对象 ──
    _applyGuestInputs() {
        for (const [id, input] of this.mpGuestInputs) {
            const gp = this._mpGuestPlayer(id);
            // 应用 guest 传来的属性（职业/天赋效果同步）
            if (input.stats) {
                const s = input.stats;
                if (s.attack  !== undefined) gp.attack  = s.attack;
                if (s.defense !== undefined) gp.defense = s.defense;
                if (s.speed   !== undefined) gp.speed   = s.speed;
                if (s.maxHealth !== undefined && gp.maxHealth !== s.maxHealth) {
                    gp.maxHealth = s.maxHealth;
                    gp.currentHealth = Math.min(gp.currentHealth, gp.maxHealth);
                }
                if (s.class && !gp.class) this._applyClassToPlayer(gp, s.class);
                if (s.spec && !gp.spec) this._applySpec(gp, s.spec);
                if (s.awk && gp.spec && !gp.awakened) this._awakenPlayer(gp);
                if (s.qLevel)  gp.skillQ.level = s.qLevel;
                if (s.eLevel)  gp.skillE.level = s.eLevel;
                if (s.qMaxCd)  gp.skillQ.maxCooldown = s.qMaxCd;
                if (s.eMaxCd)  gp.skillE.maxCooldown = s.eMaxCd;
                if (s.dashMaxCd) gp.dashMaxCooldown = s.dashMaxCd;
                this._applyGuestBuild(gp, s.tr, s.sk);
                // guest 在选天赋/职业时世界不会为他暂停:期间给保护,免得站着挨打
                gp.menuGuard = !!s.menu;
            }
            // 房主暂停(升级菜单等)时整个世界冻结,guest 也不移动、不推进计时
            if (this.isPaused) continue;
            if (input.keys) gp.update(input.keys, this.width, this.height);
            if (input.moving && input.targetX !== null) {
                gp.targetX = input.targetX;
                gp.targetY = input.targetY;
                gp.moving = true;
                input.moving = false; // 消耗一次点击目标
            }
        }
        // 同步 mpPlayers 供渲染
        this.mpPlayers = [];
        for (const [id, gp] of this.mpGuestPlayers) {
            this.mpPlayers.push({
                id, x: gp.x, y: gp.y, size: gp.size, color: gp.color,
                currentHealth: gp.currentHealth, maxHealth: gp.maxHealth,
                class: gp.class, hurtCooldown: gp.hurtCooldown, invincibleTimer: gp.invincibleTimer,
                gear: gp.gear, sp: gp.spec, aw: gp.awakened ? 1 : 0, still: gp.stillTime, bl: gp.blessTimer
            });
        }
    }

    // ── Host：取得(没有则创建)guest 的 Player。两处创建入口共用,保证都有额外复活次数 ──
    _mpGuestPlayer(id) {
        let gp = this.mpGuestPlayers.get(id);
        if (!gp) {
            gp = new Player(this.width / 2 + id * 40, this.height / 2);
            gp.color = this._mpPlayerColor(id);
            this.mpGuestPlayers.set(id, gp);
        }
        return gp;
    }

    // ── Host：为指定 Player 对象配置职业 ──
    // 本机选职业与 host 替 guest 配置共用,保证两边属性一致(弓手普攻倍率是乘算,不能当加法叠)
    _applyClassToPlayer(p, className) {
        if (!CLASS_BASE_CD[className] || p.class) return;
        p.class = className;
        const cd = CLASS_BASE_CD[className];
        p.skillQ = { cooldown: 0, maxCooldown: cd.q, level: 1 };
        p.skillE = { cooldown: 0, maxCooldown: cd.e, level: 1 };
        const adj = CLASS_BASE_ADJUST[className] || {};
        if (adj.attack)    p.attack += adj.attack;
        if (adj.defense)   p.defense = Math.max(0, p.defense + adj.defense);
        if (adj.maxHealth) { p.maxHealth += adj.maxHealth; p.currentHealth = p.maxHealth; }
        if (adj.speed)     p.speed += adj.speed;
        if (adj.manaRegen) p.manaRegen += adj.manaRegen;
        if (adj.maxMana)   { p.maxMana += adj.maxMana; p.mana = p.maxMana; }
        if (adj.autoAttackDmgMult) p.autoAttackDmgMult = (p.autoAttackDmgMult || 1) * adj.autoAttackDmgMult;
        // 选职业前点的冷却天赋 / 镶好的 Q、E 宝石立即生效
        p._buildVer++;
        this._refreshSkillCds(p);
    }

    // ── Guest：更新本地资源（保持 HUD 流畅） ──
    _updateLocalResources() {
        const p = this.player;
        if (p.class === 'mage' && p.mana < p.maxMana)
            p.mana = Math.min(p.maxMana, p.mana + p.manaRegen * DT);
        if (p.class === 'paladin') {
            if (p.faith < p.maxFaith) p.faith = Math.min(p.maxFaith, p.faith + p.faithRegen * DT);
            const cap = p.maxHealth * (p.shieldCapRatio || 0.1);
            if (p.shield < cap) p.shield = Math.min(cap, p.shield + p.maxHealth * 0.02 * DT);
        }
        if (p.skillQ.cooldown > 0) p.skillQ.cooldown -= DT;
        if (p.skillE.cooldown > 0) p.skillE.cooldown -= DT;
    }

    // ══════════════════════════════════════════════════════════════════
    //  联机渲染 & UI
    // ══════════════════════════════════════════════════════════════════

    _renderMpPlayers() {
        const ctx = this.ctx;
        for (const p of this.mpPlayers) {
            const isHurt = p.hurtCooldown > 0;
            const isInvincible = p.invincibleTimer > 0;
            if (isHurt && Math.floor(p.hurtCooldown * 10) % 2 === 0) continue;

            ctx.save();
            const color = p.color || this._mpPlayerColor(p.id);
            // 无敌金色描边
            if (isInvincible) {
                ctx.shadowBlur = 16; ctx.shadowColor = '#ffd700';
                ctx.strokeStyle = '#ffd700'; ctx.lineWidth = 3;
                roundRect(ctx, p.x - 2, p.y - 2, p.size + 4, p.size + 4, 6);
                ctx.stroke();
            }
            ctx.shadowBlur = 8; ctx.shadowColor = color;
            ctx.fillStyle = color;
            roundRect(ctx, p.x, p.y, p.size, p.size, 5);
            ctx.fill();
            ctx.restore();

            // 血条
            const bw = p.size + 10, bh = 5;
            const bx = p.x - 5, by = p.y - 10;
            const ratio = Math.max(0, p.currentHealth / (p.maxHealth || 1));
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            roundRect(ctx, bx, by, bw, bh, 2); ctx.fill();
            ctx.fillStyle = ratio > 0.5 ? '#4caf50' : ratio > 0.25 ? '#ffb300' : '#f44336';
            roundRect(ctx, bx, by, bw * ratio, bh, 2); ctx.fill();

            // 玩家标签
            ctx.fillStyle = color;
            ctx.font = '10px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
            ctx.fillText(`P${p.id}`, p.x + p.size / 2, p.y - 12);
            this._renderBlessAura(p);
            this._renderGearAura(p);
            this._renderClassAura(p, p.class, !!p.aw, p.still || 0);
        }
    }

    // 祝福增益:脚下一圈缓慢转动的淡紫光点,最后 3 秒闪烁(只用填充,无 shadowBlur)
    _renderBlessAura(p) {
        const t = p && p.blessTimer;
        if (!(t > 0) || p.currentHealth <= 0) return;
        const ctx = this.ctx;
        const cx = p.x + p.size / 2, cy = p.y + p.size / 2;
        const blink = t < 3 ? 0.35 + 0.65 * Math.abs(Math.sin(this.bgTime * 10)) : 1;
        const r = p.size * 0.72 + 14, rot = this.bgTime * 1.6;
        ctx.save();
        ctx.globalAlpha = 0.16 * blink;
        ctx.fillStyle = '#b388ff';
        ctx.beginPath();
        ctx.arc(cx, cy, r + 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.9 * blink;
        ctx.fillStyle = '#e1bee7';
        for (let i = 0; i < 6; i++) {
            const a = rot + i * Math.PI / 3;
            const s = 2.5 + 1.2 * Math.sin(this.bgTime * 5 + i);
            ctx.fillRect(cx + Math.cos(a) * r - s / 2, cy + Math.sin(a) * r - s / 2, s, s);
        }
        ctx.restore();
    }

    // 祝福祭坛:地面光圈 + 转动符文 + 充能进度弧;有人站在圈里时光柱升起
    _renderAltar(ctx) {
        const ev = this.event;
        if (!ev || ev.type !== 'altar' || ev.ax === undefined) return;
        const R = Game.ALTAR_R, x = ev.ax, y = ev.ay, c = ev.charge || 0, t = this.bgTime;
        const pulse = 0.5 + 0.5 * Math.sin(t * 3);
        ctx.save();
        // 底圈
        ctx.fillStyle = `rgba(124, 77, 255, ${0.10 + 0.12 * c})`;
        ctx.beginPath();
        ctx.arc(x, y, R, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = `rgba(179, 136, 255, ${0.45 + 0.3 * pulse})`;
        ctx.lineWidth = 2;
        ctx.setLineDash([10, 8]);
        ctx.lineDashOffset = -t * 20;
        ctx.beginPath();
        ctx.arc(x, y, R, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        // 充能弧
        if (c > 0) {
            ctx.strokeStyle = '#e1bee7';
            ctx.lineWidth = 5;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.arc(x, y, R - 6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * c);
            ctx.stroke();
        }
        // 中央符文:两个反向转动的方块
        ctx.translate(x, y);
        ctx.lineWidth = 2;
        for (const [k, a] of [[0.34, t * 0.8], [0.22, -t * 1.3]]) {
            ctx.save();
            ctx.rotate(a);
            ctx.strokeStyle = `rgba(225, 190, 231, ${0.5 + 0.5 * c})`;
            const s = R * k;
            ctx.strokeRect(-s, -s, s * 2, s * 2);
            ctx.restore();
        }
        // 光柱:充能越多越亮越高
        if (c > 0) {
            const h = 40 + 90 * c;
            const g = ctx.createLinearGradient(0, 0, 0, -h);
            g.addColorStop(0, `rgba(225, 190, 231, ${0.35 + 0.3 * c})`);
            g.addColorStop(1, 'rgba(179, 136, 255, 0)');
            ctx.fillStyle = g;
            ctx.fillRect(-R * 0.3, -h, R * 0.6, h);
        }
        // 没人充能时给个提示
        if (c < 0.02) {
            ctx.globalAlpha = 0.6 + 0.4 * pulse;
            ctx.fillStyle = '#e1bee7';
            ctx.font = 'bold 12px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('站进来充能', 0, R + 14);
        }
        ctx.restore();
    }

    // 职业状态光环:觉醒玩家身边转动的职业色虚线环;弓手站定专注时脚下一圈瞄准刻度
    _renderClassAura(p, cls, awakened, still) {
        if (!cls) return;
        const cx = p.x + p.size / 2, cy = p.y + p.size / 2;
        const color = CLASS_COLORS[cls] || '#ffffff';
        const t = performance.now() / 1000;
        {
            const ctx = this.ctx;
            ctx.save();
            if (awakened) {
                ctx.strokeStyle = color;
                ctx.globalAlpha = 0.55 + 0.25 * Math.sin(t * 4);
                ctx.lineWidth = 2;
                ctx.setLineDash([6, 5]);
                ctx.lineDashOffset = -t * 30;
                ctx.beginPath();
                ctx.arc(cx, cy, p.size * 0.95, 0, Math.PI * 2);
                ctx.stroke();
                ctx.setLineDash([]);
            }
            if (cls === 'archer' && still >= 0.4) {
                ctx.globalAlpha = Math.min(1, (still - 0.4) / 0.2) * 0.8;
                ctx.strokeStyle = '#ccff90';
                ctx.lineWidth = 1.5;
                const r = p.size * 0.8;
                ctx.beginPath();
                for (let i = 0; i < 4; i++) {
                    const a = i * Math.PI / 2 + t * 1.5;
                    ctx.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
                    ctx.lineTo(cx + Math.cos(a) * (r + 7), cy + Math.sin(a) * (r + 7));
                }
                ctx.stroke();
                ctx.beginPath();
                ctx.arc(cx, cy, r, 0, Math.PI * 2);
                ctx.stroke();
            }
            ctx.restore();
        }
    }

    // 限时装备的身上效果:装备色光圈 + 剩余时间弧,烈焰法球另画环绕火球(本机/联机玩家共用)
    _renderGearAura(p) {
        const g = p && p.gear;
        if (!g || !GEARS[g.type] || p.currentHealth <= 0) return;
        const def = GEARS[g.type];
        const ctx = this.ctx;
        const cx = p.x + p.size / 2, cy = p.y + p.size / 2;
        const r = p.size * 0.72 + 8;
        const ending = g.timer < 3;
        const blink = ending ? 0.35 + 0.65 * Math.abs(Math.sin(this.bgTime * 10)) : 1;
        ctx.save();
        ctx.globalAlpha = 0.18 * blink;
        ctx.strokeStyle = def.color;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 0.85 * blink;
        ctx.shadowBlur = 8;
        ctx.shadowColor = def.color;
        ctx.beginPath();
        ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0, g.timer / (g.max || 1)));
        ctx.stroke();
        if (g.type === 'thorns') {
            // 一圈缓慢转动的尖刺
            ctx.shadowBlur = 0;
            ctx.globalAlpha = 0.8 * blink;
            ctx.fillStyle = def.color;
            const rot = this.bgTime * 0.8;
            ctx.beginPath();
            for (let i = 0; i < 10; i++) {
                const a = rot + i * Math.PI / 5;
                const c = Math.cos(a), s = Math.sin(a);
                ctx.moveTo(cx + c * (r + 9), cy + s * (r + 9));
                ctx.lineTo(cx + Math.cos(a - 0.14) * (r + 1), cy + Math.sin(a - 0.14) * (r + 1));
                ctx.lineTo(cx + Math.cos(a + 0.14) * (r + 1), cy + Math.sin(a + 0.14) * (r + 1));
                ctx.closePath();
            }
            ctx.fill();
        }
        if (g.type === 'orb') {
            const base = (g.angle || 0) + (g._phaseAt !== undefined ? (this.bgTime - g._phaseAt) * Game.ORB_SPIN : 0);
            ctx.globalAlpha = 0.12;
            ctx.shadowBlur = 0;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(cx, cy, Game.ORB_RADIUS, 0, Math.PI * 2);
            ctx.stroke();
            ctx.globalAlpha = 1;
            for (let i = 0; i < 3; i++) {
                const a = base + i * Math.PI * 2 / 3;
                const ox = cx + Math.cos(a) * Game.ORB_RADIUS, oy = cy + Math.sin(a) * Game.ORB_RADIUS;
                // 拖尾
                ctx.fillStyle = 'rgba(255,112,67,0.35)';
                ctx.beginPath();
                ctx.arc(cx + Math.cos(a - 0.25) * Game.ORB_RADIUS, cy + Math.sin(a - 0.25) * Game.ORB_RADIUS, 6, 0, Math.PI * 2);
                ctx.fill();
                const grad = ctx.createRadialGradient(ox - 2, oy - 2, 1, ox, oy, 10);
                grad.addColorStop(0, '#fff3e0');
                grad.addColorStop(0.45, '#ffab40');
                grad.addColorStop(1, 'rgba(255,61,0,0.2)');
                ctx.shadowBlur = 12;
                ctx.shadowColor = '#ff6d00';
                ctx.fillStyle = grad;
                ctx.beginPath();
                ctx.arc(ox, oy, 10, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        ctx.restore();
    }

    // 左上角状态面板下方:当前装备的图标、名字和剩余时间条(最后 3 秒闪烁)
    // 统计面板下方的限时增益条:装备在上,祭坛祝福在下
    _renderGearHUD() {
        const p = this.player;
        let y = 72;
        const g = p.gear;
        if (g && GEARS[g.type]) {
            const def = GEARS[g.type];
            this._renderBuffPill(y, def.icon, def.name, def.color, g.timer, g.max);
            y += 34;
        }
        if (p.blessTimer > 0) this._renderBuffPill(y, '✨', '祝福', '#b388ff', p.blessTimer, Game.BLESS.dur);
    }

    _renderBuffPill(y, icon, name, color, timer, max) {
        const def = { icon, name, color };
        const g = { timer, max };
        const ctx = this.ctx;
        const x = 10, w = 100, h = 30;
        const ratio = Math.max(0, Math.min(1, g.timer / (g.max || 1)));
        const blink = g.timer < 3 ? 0.45 + 0.55 * Math.abs(Math.sin(this.bgTime * 10)) : 1;
        ctx.save();
        ctx.fillStyle = 'rgba(0, 10, 20, 0.55)';
        roundRect(ctx, x, y, w, h, 8);
        ctx.fill();
        ctx.strokeStyle = def.color;
        ctx.globalAlpha = 0.6 * blink;
        ctx.lineWidth = 1;
        roundRect(ctx, x, y, w, h, 8);
        ctx.stroke();
        ctx.globalAlpha = blink;
        ctx.font = '14px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(def.icon, x + 15, y + 15);
        ctx.font = 'bold 11px Arial';
        ctx.textAlign = 'left';
        ctx.fillStyle = def.color;
        ctx.fillText(def.name, x + 28, y + 11);
        ctx.textAlign = 'right';
        ctx.fillStyle = '#ffffff';
        ctx.font = '10px Arial';
        ctx.fillText(`${Math.ceil(g.timer)}s`, x + w - 6, y + 11);
        const bx = x + 28, by = y + 20, bw = w - 34, bh = 4;
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        roundRect(ctx, bx, by, bw, bh, 2);
        ctx.fill();
        ctx.fillStyle = def.color;
        roundRect(ctx, bx, by, Math.max(bh, bw * ratio), bh, 2);
        ctx.fill();
        ctx.restore();
    }

    _renderStartScreen() {
        const ctx = this.ctx;
        ctx.save();
        ctx.translate(this.gameOffsetX, this.gameOffsetY);
        ctx.scale(this.gameScale, this.gameScale);

        const grad = ctx.createLinearGradient(0, 0, 0, this.height);
        grad.addColorStop(0, '#07101a'); grad.addColorStop(1, '#050c12');
        ctx.fillStyle = grad; ctx.fillRect(0, 0, this.width, this.height);

        // 星星背景
        const t = this.bgTime || 0;
        ctx.save();
        for (const s of this.stars) {
            const twinkle = s.alpha + Math.sin(t * s.twinkleSpeed * 60 + s.twinkleOffset) * 0.25;
            ctx.globalAlpha = Math.max(0.05, Math.min(1, twinkle));
            ctx.fillStyle = '#c8e8ff'; ctx.beginPath();
            ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();

        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = '#00c8ff';
        ctx.font = `bold ${Math.min(56, this.width * 0.12)}px Arial`;
        ctx.shadowBlur = 30; ctx.shadowColor = '#00c8ff';
        ctx.fillText('方块快跑', this.width / 2, this.height * 0.38);

        ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(200,232,255,0.5)';
        ctx.font = `${Math.min(18, this.width * 0.038)}px Arial`;
        ctx.fillText('生存即胜利', this.width / 2, this.height * 0.5);

        ctx.restore();
        this.bgTime = (this.bgTime || 0) + DT;
    }

    // 本局概况(暂停面板与结算弹窗共用)
    _runSummaryRows() {
        const p = this.player;
        let cls = CLASS_NAMES[p.class] || '未选择';
        const spec = p.spec && (CLASS_SPECS[p.class] || []).find(sp => sp.id === p.spec);
        if (spec) cls += ` · ${spec.name}`;
        if (p.awakened) cls += '(觉醒)';
        return [
            ['职业', cls],
            ['等级', `Lv ${this.level}`],
            ['击杀', String(p.killCount || 0)],
            ['最高连杀', String(p.maxCombo || 0)],
            ['击退魔王', `${this.runBossRepels || 0} 次`],
            ['完美闪避', `${p.dodgeCount || 0} 次`]
        ];
    }

    // 本局伤害构成:总伤害、秒伤与按来源排好序的占比(只列有伤害的来源)
    _dmgBreakdown(p) {
        const st = (p && p.dmgStats) || {};
        const total = DMG_SRCS.reduce((a, k) => a + (st[k] || 0), 0);
        const parts = DMG_SRCS.filter(k => st[k] > 0).map(k => ({ k, ...DMG_SRC_INFO[k], v: st[k], pct: st[k] / total }))
            .sort((a, b) => b.v - a.v);
        return { total, dps: total / Math.max(1, this.gameTime), parts };
    }

    static fmtNum(v) {
        return v >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : v >= 1e4 ? (v / 1e3).toFixed(1) + 'k' : String(Math.round(v));
    }

    // 暂停面板里的伤害构成条:标题行 + 分段条 + 图例(最多 4 项)
    _renderDmgBar(ctx, x, y, w) {
        const b = this._dmgBreakdown(this.player);
        ctx.textAlign = 'left';
        ctx.font = '10px Arial';
        ctx.fillStyle = 'rgba(200,232,255,0.55)';
        ctx.fillText('伤害构成', x + 6, y);
        ctx.textAlign = 'right';
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.fillText(b.total > 0 ? `总 ${Game.fmtNum(b.total)} · 秒伤 ${Game.fmtNum(b.dps)}` : '还没有造成伤害', x + w - 6, y);
        const bx = x + 6, bw = w - 12, by = y + 9, bh = 8;
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        roundRect(ctx, bx, by, bw, bh, 4);
        ctx.fill();
        if (b.total > 0) {
            ctx.save();
            roundRect(ctx, bx, by, bw, bh, 4);
            ctx.clip();
            let cx = bx;
            for (const part of b.parts) {
                const pw = part.pct * bw;
                ctx.fillStyle = part.color;
                ctx.fillRect(cx, by, pw + 0.5, bh);
                cx += pw;
            }
            ctx.restore();
            ctx.textAlign = 'left';
            ctx.font = '10px Arial';
            let lx = bx;
            for (const part of b.parts.slice(0, 4)) {
                const txt = `${part.name} ${Math.round(part.pct * 100)}%`;
                const tw = ctx.measureText(txt).width;
                if (lx + tw + 10 > bx + bw) break;
                ctx.fillStyle = part.color;
                ctx.fillRect(lx, by + 17, 6, 6);
                ctx.fillStyle = 'rgba(230,240,255,0.85)';
                ctx.fillText(txt, lx + 9, by + 20.5);
                lx += tw + 20;
            }
        }
    }

    // 暂停面板:本局概况 + 继续 / 静音 / 结束本局(联机客机为离开房间,需再点一次确认)
    _renderPauseOverlay() {
        const ctx = this.ctx;
        const m = this._menu, W = m.w, H = m.h;
        this.buttons = [];
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(-W, -H, W * 3, H * 3);
        const pw = Math.min(300, W - 32), ph = 400;
        const px = (W - pw) / 2, py = Math.max(8, (H - ph) / 2);
        this._pausePanel = { x: px, y: py, w: pw, h: ph };
        ctx.fillStyle = 'rgba(6, 16, 28, 0.94)';
        roundRect(ctx, px, py, pw, ph, 14);
        ctx.fill();
        ctx.strokeStyle = 'rgba(0, 200, 255, 0.45)';
        ctx.lineWidth = 1.5;
        roundRect(ctx, px, py, pw, ph, 14);
        ctx.stroke();

        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = 'bold 28px Arial';
        ctx.fillStyle = '#ffffff';
        ctx.shadowBlur = 16; ctx.shadowColor = '#00c8ff';
        ctx.fillText('已暂停', W / 2, py + 34);
        ctx.shadowBlur = 0;
        const t = Math.floor(this.gameTime);
        ctx.font = '12px Arial';
        ctx.fillStyle = 'rgba(200,232,255,0.6)';
        ctx.fillText(`${diffDef(this.diffMode).name}  ·  生存 ${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}  ·  ★ ${this.score}`, W / 2, py + 60);

        // 概况:两列三行
        const rows = this._runSummaryRows();
        const colW = (pw - 32) / 2;
        rows.forEach(([k, v], i) => {
            const cx = px + 16 + (i % 2) * colW, cy = py + 76 + Math.floor(i / 2) * 33;
            ctx.textAlign = 'left';
            ctx.font = '10px Arial';
            ctx.fillStyle = 'rgba(200,232,255,0.55)';
            ctx.fillText(k, cx + 6, cy + 8);
            ctx.font = 'bold 13px Arial';
            ctx.fillStyle = '#ffffff';
            let txt = v;
            while (txt.length > 2 && ctx.measureText(txt).width > colW - 12) txt = txt.slice(0, -2) + '…';
            ctx.fillText(txt, cx + 6, cy + 24);
        });
        this._renderDmgBar(ctx, px + 16, py + 186, pw - 32);
        ctx.restore();

        const bw = pw - 48, bh = 36, bx = px + 24;
        let by = py + 230;
        this.drawButton(bx, by, bw, bh, '#00b0ff', '继续游戏', 'resume');
        by += bh + 8;
        this.drawButton(bx, by, bw, bh, '#546e7a', Sound.muted ? '🔇 声音:关' : '🔊 声音:开', 'mute');
        by += bh + 8;
        this.drawButton(bx, by, bw, bh, '#546e7a', this.showDmgNums ? '伤害数字:开' : '伤害数字:关', 'dmgNums');
        by += bh + 8;
        const quitText = this.mpMode === 'guest' ? '离开房间' : '结束本局';
        this.drawButton(bx, by, bw, bh, this._pauseQuitArmed ? '#ff1744' : '#8d3b3b',
                        this._pauseQuitArmed ? `再点一次${quitText}` : quitText, 'quit');
    }

    // 暂停面板点击:按钮 → 对应操作;面板外 → 继续游戏;面板内空白处不处理
    _handlePauseClick(x, y) {
        const m = this._menu;
        if (m) {
            x = (x * this.gameScale + this.gameOffsetX - m.ox) / m.s;
            y = (y * this.gameScale + this.gameOffsetY - m.oy) / m.s;
        }
        const btn = (this.buttons || []).find(b => x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height);
        if (btn) {
            if (btn.choice === 'resume') this.togglePause();
            else if (btn.choice === 'mute') Sound.toggleMute();
            else if (btn.choice === 'dmgNums') this.toggleDmgNums();
            else if (btn.choice === 'quit') {
                if (!this._pauseQuitArmed) { this._pauseQuitArmed = true; return; }
                this._quitRun();
            }
            return;
        }
        const pp = this._pausePanel;
        if (!pp || x < pp.x || x > pp.x + pp.w || y < pp.y || y > pp.y + pp.h) this.togglePause();
    }

    // 主动结束:单人/房主直接结算(房主会广播给客机);客机离开房间回大厅
    _quitRun() {
        this._pauseQuitArmed = false;
        this.isPaused = false;
        if (this.mpMode === 'guest') { if (this.onBackToLobby) this.onBackToLobby(); }
        else this.endGame();
    }

    update() {
        // ── Guest 模式：仅应用 host 状态，处理本地输入 ──
        if (this.mpMode === 'guest') {
            if (!this.isPaused) {
                if (this.mpStateBuffer) {
                    const prevBoss = this.bossState;
                    this.applyRemoteState(this.mpStateBuffer);
                    this.mpStateBuffer = null;
                    // 击退魔王的 +1 潜能是每人一份:房主在 _repelBoss 里拿,guest 按状态边沿自己加
                    if (prevBoss === 'active' && this.bossState === 'retreating') {
                        this.player.potentialPoints++;
                        if (!this.showingClassSelection) this.showPotentialMenu();
                    }
                }
                // 职业选择(3 级) / 进阶 / 觉醒触发
                if (!this.showingClassSelection && !this.showingPotentialMenu) {
                    const mode = this._pendingClassMenu();
                    if (mode) this.showClassSelection(mode);
                }
                // 按等级给予潜能点（每个新等级+1）
                if (this.level > (this._mpGuestLastLevel || 1)) {
                    const gained = this.level - (this._mpGuestLastLevel || 1);
                    this.player.potentialPoints += gained;
                    this.player.speed += 0.2 * gained; // 与房主 checkLevelUp 的每级 +0.2 移速一致
                    this._mpGuestLastLevel = this.level;
                    if (this.player.potentialPoints > 0 && !this.showingClassSelection) this.showPotentialMenu();
                }
                if (!this.showingClassSelection && !this.showingPotentialMenu) {
                    this.player.update(this.keys, this.width, this.height);
                }
                // 位置以 host 为准:覆盖本地移动,在快照间平滑插值
                this._mpInterpolate();
                this._sfxTick();
                this._tickHitFeedback();
                this._progressTick();
                this._updateLocalResources();
                this.updateEffects();
                this.updateParticles();
                this._updateDmgNums();
                this.bgTime += DT;
                this._uiTimer += DT;
                if (this._uiTimer >= 0.1) { this.updateUI(); this._uiTimer = 0; }
                this.sendGuestInput();
            } else {
                // 选天赋/职业或暂停时本地不推进,但要告诉 host 停下(否则沿用上次按住的方向一直走)
                this.sendGuestInput();
            }
            return;
        }

        // ── Host/单人 模式：先应用 guest 输入 ──
        if (this.mpMode === 'host') this._applyGuestInputs();

        if (!this.isPaused) {
            this.gameTime += DT;
            // 难度更平缓且封顶，避免后期速度碾压必死
            const dm = diffDef(this.diffMode);
            this.difficulty = Math.min(dm.cap, dm.start + this.gameTime / dm.ramp);

            // 计时器随暂停一起停（按帧推进，不再用 setTimeout）
            if (this.enemyFreezeTimer > 0) this.enemyFreezeTimer -= DT;
            this.updateInvincible();

            this._tickAutoAttack();
            this._tickPlayerResources();
            // 联机:guest 的普攻/冷却/资源/圣光光环也由 host 推进(各用各的天赋)
            if (this.mpMode === 'host') {
                for (const gp of this.mpGuestPlayers.values()) {
                    if (gp.currentHealth <= 0) continue;
                    this._runAsPlayer(gp, () => { this._tickAutoAttack(); this._tickPlayerResources(); });
                }
            }

            this.bgTime += DT;
            this.updatePlayer();
            this._tickDashStrike();
            if (this.mpMode === 'host') {
                for (const gp of this.mpGuestPlayers.values()) this._runAsPlayer(gp, () => this._tickDashStrike());
            }
            this.updateEnemies();
            this.updateEnemyBullets();
            this.updateItems();
            this.updateProjectiles();
            this.updateEffects();
            this.updateParticles();
            this._updateBoss();
            this._updateEvents();
            this._tickPendingActions();
            this.checkCollisions();
            this._checkLocalDeath(); // 兜底:任何来源把血量打到 0 都能结算复活/扣命
            this._flushDmgNums();
            this._updateDmgNums();
            this.spawnEnemies();
            this.spawnItems();
            // updateUI 降频:每 100ms 刷新一次 DOM
            this._uiTimer += DT;
            if (this._uiTimer >= 0.1) {
                this.updateUI();
                this._uiTimer = 0;
            }
            this._sfxTick();
            this._tickHitFeedback();
            this._progressTick();
            this.checkGameOver();

            // 屏幕震动衰减
            if (this.screenShake > 0) this.screenShake = Math.max(0, this.screenShake - DT);
        }

        // Host 模式：guest 碰撞检测 + 广播状态
        if (this.mpMode === 'host') {
            this._checkGuestCollisions();
            this.mpFrameCount++;
            if (this.mpFrameCount % 3 === 0) this.broadcastState();
        }
    }

    // ── 局外成长:本局数据、成就检测与解锁提示 ──
    _initRunProgress() {
        this.seenEnemyTypes = new Set();
        this.runBossRepels = 0;
        this.runUnlocked = [];
        this.achToasts = [];
        this._progTimer = 0;
        this._progBossPrev = this.bossState;
        this._runRecorded = false;
        this._profileAtStart = Progress.load();
        // 本局开始时的最高分:超过它时提示一次「新纪录」(各端本地判断,不同步)
        this._bestAtStart = Store.get('blockrun.best', { score: 0 }).score || 0;
        this._recordShown = false;
        this.player.skin = Progress.currentSkin();
    }

    _runStats() {
        return { score: this.score, time: Math.floor(this.gameTime), level: this.level,
                 bossRepels: this.runBossRepels || 0, cls: this.player.class, dodges: this.player.dodgeCount || 0,
                 treasures: this.treasureKills || 0, elites: this.eliteKills || 0, diff: this.diffMode };
    }

    // 每 tick 调用(host/guest 都走):统计击退魔王,每 0.5s 检查一次成就,推进解锁提示
    _progressTick() {
        if (!this.runUnlocked) this._initRunProgress();
        if (this.bossState !== this._progBossPrev) {
            if (this.bossState === 'retreating') this.runBossRepels++;
            this._progBossPrev = this.bossState;
        }
        this._progTimer += DT;
        if (this._progTimer >= 0.5) {
            this._progTimer = 0;
            for (const a of Progress.checkAchievements(this._runStats())) this._pushAchievement(a);
        }
        if (!this._recordShown && this._bestAtStart > 0 && this.score > this._bestAtStart) {
            this._recordShown = true;
            this.achToasts.push({ icon: '🏆', title: '新纪录', name: '打破最高分!', desc: `超过了之前的 ${this._bestAtStart} 分`, t: 0 });
            Sound.play('record');
        }
        for (const t of this.achToasts) t.t += DT;
        this.achToasts = this.achToasts.filter(t => t.t < 3);
    }

    _pushAchievement(a) {
        this.runUnlocked.push(a);
        // 提示只在本地 HUD 绘制,不进 effects,避免被同步给其他联机玩家
        this.achToasts.push({ icon: a.icon, name: a.name, desc: a.desc, t: 0 });
        Sound.play('levelUp');
    }

    // 解锁提示:顶部居中依次下滑出现,3 秒后淡出
    _renderAchToasts() {
        if (!this.achToasts || !this.achToasts.length) return;
        const ctx = this.ctx;
        const w = Math.min(260, this.width - 40), h = 40;
        ctx.save();
        this.achToasts.slice(0, 3).forEach((t, i) => {
            const inA = Math.min(1, t.t / 0.25), outA = Math.min(1, (3 - t.t) / 0.4);
            const a = Math.max(0, Math.min(inA, outA));
            const x = (this.width - w) / 2, y = 70 + i * (h + 6) - (1 - inA) * 12;
            ctx.globalAlpha = a;
            ctx.fillStyle = 'rgba(20, 16, 4, 0.88)';
            ctx.shadowBlur = 14; ctx.shadowColor = '#ffd54f';
            roundRect(ctx, x, y, w, h, 9);
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.strokeStyle = 'rgba(255, 213, 79, 0.8)';
            ctx.lineWidth = 1.5;
            roundRect(ctx, x, y, w, h, 9);
            ctx.stroke();
            ctx.textBaseline = 'middle';
            ctx.textAlign = 'center';
            ctx.font = '18px Arial';
            ctx.fillStyle = '#ffd54f';
            ctx.fillText(t.icon, x + 22, y + h / 2);
            ctx.textAlign = 'left';
            ctx.font = 'bold 12px Arial';
            ctx.fillText(`${t.title || '成就解锁'} · ${t.name}`, x + 42, y + 14);
            ctx.font = '10px Arial';
            ctx.fillStyle = 'rgba(255, 240, 200, 0.75)';
            ctx.fillText(t.desc, x + 42, y + 28);
        });
        ctx.restore();
    }

    // 结算:写入累计数据,返回本局新解锁的成就与外观(每局只记一次)
    _finishRunProgress(time, score) {
        if (!this.runUnlocked) this._initRunProgress();
        if (this._runRecorded) return { achievements: [], skins: [] };
        this._runRecorded = true;
        const run = { ...this._runStats(), time, score };
        for (const a of Progress.checkAchievements(run)) this.runUnlocked.push(a);
        for (const a of Progress.recordRun(run)) this.runUnlocked.push(a);
        const before = this._profileAtStart, after = Progress.load();
        const skins = SKINS.filter(sk => !Progress.skinUnlocked(sk, before) && Progress.skinUnlocked(sk, after));
        return { achievements: this.runUnlocked.slice(), skins };
    }

    // 通过状态变化触发音效:受击/死亡/升级/魔王阶段。host 与 guest 都适用(guest 状态来自快照)
    _sfxTick() {
        const p = this.player;
        const b = this.boss;
        const cur = { hurt: p.hurtCooldown || 0, life: this.life, level: this.level, boss: this.bossState,
                      q: p.skillQ.cooldown, e: p.skillE.cooldown, kills: p.killCount || 0,
                      dash: p.dashCooldown || 0, dodge: p.dodgeCount || 0, gear: p.gear ? p.gear.type : '',
                      atk: b && b.atk ? b.atk + b.atkPhase : '', rage: !!(b && b.enraged),
                      ev: this.event ? this.event.type : '', cb: p.combo || 0, bless: p.blessTimer || 0 };
        const prev = this._sfxPrev;
        this._sfxPrev = cur;
        if (!prev) return;
        if (cur.hurt > prev.hurt + 0.3 && this.life > 0) {
            const died = cur.life < prev.life;
            Sound.play(died ? 'death' : 'hurt');
            this._onLocalHurt(died);
        }
        if (cur.kills > prev.kills) this._onLocalKill();
        if (cur.cb > prev.cb) {
            for (let n = Math.max(prev.cb + 1, cur.cb - 50); n <= cur.cb; n++) {
                if (Game.comboMilestone(n)) { Sound.play('combo', n >= 100 ? 4 : n >= 50 ? 3 : n >= 25 ? 2 : 1); this.comboPop = 1; break; }
            }
            this.comboBump = 1;
        }
        if (cur.dash > prev.dash + 0.5) Sound.play('whoosh');
        if (cur.dodge > prev.dodge) { Sound.play('dodge'); this._triggerHitStop(0.05); }
        if (cur.level > prev.level) {
            Sound.play('levelUp');
            // 只画在本机玩家身上:标记已发送,host 不会把它同步给 guest
            this.effects.push({ type: 'levelUp', lv: cur.level, ttl: 1.3, maxTtl: 1.3, _mpSent: true });
        }
        if (cur.gear !== prev.gear) Sound.play(cur.gear ? 'gearOn' : 'gearOff');
        if (cur.bless > prev.bless + 1) Sound.play('bless');
        if (cur.q > prev.q + 0.2 || cur.e > prev.e + 0.2) Sound.play('skill');
        if (cur.atk !== prev.atk && cur.atk) {
            if (cur.atk.endsWith('0')) Sound.play('bossTell');
            else Sound.play({ slam1: 'bossSlam', ring1: 'bossRing', laser1: 'bossLaser', summon1: 'bossSummon' }[cur.atk] || 'bossCharge');
        }
        if (cur.rage && !prev.rage) Sound.play('bossEnrage');
        if (cur.ev && cur.ev !== prev.ev) Sound.play('event');
        if (cur.boss !== prev.boss) {
            if (cur.boss === 'warning') Sound.play('bossWarn');
            else if (cur.boss === 'active') Sound.play('bossSpawn');
            else if (cur.boss === 'retreating') {
                Sound.play('bossRepel');
                this._triggerHitStop(0.16);
                this._vibrate([30, 40, 90]);
            }
        }
    }

    // ── 打击感 ──
    // 受击/击杀反馈只对"本机玩家"触发:由 _sfxTick 对 this.player 做边沿检测,
    // host 与 guest(状态来自快照)走同一条路径,替 guest 结算时不会误触发 host 的顿帧/震动
    _triggerHitStop(sec) {
        this.hitStop = Math.max(this.hitStop || 0, sec);
    }

    _vibrate(pattern) {
        if (Sound.muted || typeof navigator === 'undefined' || !navigator.vibrate) return;
        try { navigator.vibrate(pattern); } catch (_) { /* 部分浏览器在无用户手势时会抛错 */ }
    }

    _onLocalHurt(died) {
        this._triggerHitStop(died ? 0.14 : 0.07);
        this._vibrate(died ? [60, 40, 120] : 45);
        this.hurtVignette = died ? 0.5 : 0.35;
        this.screenShake = Math.max(this.screenShake, died ? 0.35 : 0.15);
    }

    _onLocalKill() {
        // 连续击杀时节流,避免 AoE/高频普攻把游戏顿成幻灯片
        const now = performance.now();
        if (now - this._lastKillStopAt < 180) return;
        this._lastKillStopAt = now;
        this._triggerHitStop(0.035);
        this._vibrate(15);
    }

    // 击退:把敌人沿 (dirX, dirY) 方向推开。魔王不吃击退,巨人只吃三成
    _knockbackDir(target, dirX, dirY, force) {
        if (!(target instanceof Enemy)) return;
        const d = Math.sqrt(dirX * dirX + dirY * dirY);
        if (d === 0) return;
        const f = force * (target.type === 'giant' ? 0.3 : 1);
        target.kbX = (dirX / d) * f;
        target.kbY = (dirY / d) * f;
    }

    // 以 (fromX, fromY) 为源点向外击退
    _knockbackFrom(target, fromX, fromY, force) {
        this._knockbackDir(target, target.x + target.size / 2 - fromX, target.y + target.size / 2 - fromY, force);
    }

    // 白闪计时与受击暗角衰减(guest 也跑,白闪状态来自快照标记)
    _tickHitFeedback() {
        for (const e of this.enemies) {
            if (e.hitFlash > -1) e.hitFlash = Math.max(-1, e.hitFlash - DT);
            if (e.squash > 0) e.squash = Math.max(0, e.squash - DT / 0.15);
        }
        if (this.boss && this.boss.hitFlash > -1) this.boss.hitFlash = Math.max(-1, this.boss.hitFlash - DT);
        if (this.hurtVignette > 0) this.hurtVignette = Math.max(0, this.hurtVignette - DT);
        // 低血量(<30%)心跳:屏幕边缘随心跳泛红,血越少跳得越快
        const p = this.player;
        const ratio = p.maxHealth > 0 ? p.currentHealth / p.maxHealth : 1;
        if (ratio > 0 && ratio < 0.3) {
            this.lowHpBeat = Math.max(0, (this.lowHpBeat || 0) - DT);
            this.lowHpPeriod = ratio < 0.15 ? 0.6 : 0.9;
            if (this.lowHpBeat <= 0) { this.lowHpBeat = this.lowHpPeriod; Sound.play('heartbeat'); }
        } else {
            this.lowHpBeat = 0;
            this.lowHpPeriod = 0;
        }
    }

    // 本机受击时屏幕四周泛红
    _renderHurtVignette() {
        const p = this.player;
        const hpRatio = p.maxHealth > 0 ? p.currentHealth / p.maxHealth : 1;
        // 低血量心跳脉冲:每次心跳亮一下再慢慢暗下去
        let beat = 0;
        if (this.lowHpPeriod > 0) {
            const ph = 1 - this.lowHpBeat / this.lowHpPeriod;   // 0 = 刚跳
            beat = (ph < 0.15 ? 1 : Math.max(0, 1 - (ph - 0.15) / 0.6)) * 0.3;
        }
        if (hpRatio < 0.25 && hpRatio > 0) {
            const danger = (0.25 - hpRatio) / 0.25; // 0 ~ 1
            const pulse = (Math.sin(performance.now() / 160) * 0.5 + 0.5) * 0.12 * danger;
            beat = Math.max(beat * (1.3 + danger * 0.5), 0.15 * danger + pulse);
        }
        if (this.hurtVignette <= 0 && beat <= 0) return;
        const ctx = this.ctx;
        const W = this.width, H = this.height;
        const hurtA = Math.min(1, this.hurtVignette / 0.35) * 0.55;
        let a = Math.max(hurtA, beat);
        if (hpRatio < 0.25 && hpRatio > 0) a = Math.min(0.85, a * 1.25);

        // 缓存径向渐变，画布尺寸变化时重建;中央 60% 保持完全透明
        if (!this._vignetteGrad || this._vignetteW !== W || this._vignetteH !== H) {
            this._vignetteW = W;
            this._vignetteH = H;
            const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.65);
            g.addColorStop(0, 'rgba(255,0,40,0)');
            g.addColorStop(0.5, 'rgba(255,0,40,0.3)');
            g.addColorStop(1, 'rgba(255,0,40,1)');
            this._vignetteGrad = g;
        }

        ctx.save();
        ctx.globalAlpha = a;
        ctx.fillStyle = this._vignetteGrad;
        ctx.fillRect(0, 0, W, H);

        // 生命比例 < 15% 时:从屏幕边缘向内收缩的半透明红色波纹(周期 1 秒,收缩至中央清晰区边缘)
        if (hpRatio < 0.15 && hpRatio > 0) {
            const wavePhase = (performance.now() % 1000) / 1000;
            const maxR = Math.max(W, H) * 0.65;
            const minR = Math.min(W, H) * 0.31;
            const waveR = maxR - (maxR - minR) * wavePhase;
            const waveAlpha = (1 - wavePhase) * 0.35;
            ctx.beginPath();
            ctx.arc(W / 2, H / 2, waveR, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(255,30,40,${waveAlpha})`;
            ctx.lineWidth = 2 + (1 - wavePhase) * 3;
            ctx.stroke();
        }
        ctx.restore();
    }

    // 基础自动攻击:朝最近敌人(或魔王)发射,无职业/前期也有输出;间隔来自 this.player 的天赋
    _tickAutoAttack() {
        const p = this.player;
        p.autoAttackTimer -= DT;
        if (p.autoAttackTimer <= 0 && (this.enemies.length > 0 || (this.boss && this.bossState === 'active'))) {
            this._withCtx(Game.CTX.a, () => this.shoot());
            p.autoAttackTimer = p.autoAttackInterval * this._focusMult(p) / this._atkSpeedMult(p);
        }
    }

    // 弓手被动「专注」:站定 0.4 秒后普攻间隔 ×0.7(神射手 ×0.5)
    _focusMult(p) {
        if (p.class !== 'archer' || p.stillTime < 0.4) return 1;
        return p.spec === 'sniper' ? 0.5 : 0.7;
    }

    // 技能冷却 + 职业资源回复/衰减 + 圣光光环,作用于 this.player(guest 通过 _runAsPlayer 复用)
    _tickPlayerResources() {
        this._tickGear();
        if (this.player.blessTimer > 0) this.player.blessTimer = Math.max(0, this.player.blessTimer - DT);
        if (this.player.comboTimer > 0) {
            this.player.comboTimer -= DT;
            if (this.player.comboTimer <= 0) {
                this.player.comboTimer = 0;
                this.player.combo = 0;
                this.player.frenzyTier = 0;
            }
        } else {
            this.player.frenzyTier = 0;
        }
        // 天赋「嗜血回春」:每秒回复最大生命的一部分
        const regen = this.player.tree && this.player.tree.regen;
        if (regen && this.player.currentHealth > 0) this.player.heal(this.player.maxHealth * regen * DT);
        const cdDt = DT * (1 + (this.player.frenzyTier || 0) * 0.04);
        if (this.player.skillQ.cooldown > 0) this.player.skillQ.cooldown = Math.max(0, this.player.skillQ.cooldown - cdDt);
        if (this.player.skillE.cooldown > 0) this.player.skillE.cooldown = Math.max(0, this.player.skillE.cooldown - cdDt);

        if (this.player.class === 'mage' && this.player.mana < this.player.maxMana) {
            this.player.mana = Math.min(this.player.maxMana, this.player.mana + this.player.manaRegen * DT);
        }
        this._tickClassPassives();
        // 战士怒气自动衰减(战斗中也持续;狂战士不衰减)
        if (this.player.class === 'warrior' && this.player.rage > 0 && this.player.spec !== 'berserker') {
            const decayRate = 2 * (this.player.warriorRageDecayMult || 1); // /秒
            this.player.rage = Math.max(0, this.player.rage - decayRate * DT);
        }
        // 圣骑士护盾持续回复(上限 = maxHealth * shieldCapRatio)
        if (this.player.class === 'paladin') {
            const cap = this.player.maxHealth * (this.player.shieldCapRatio || 0.10);
            if (this.player.shield < cap) {
                const regen = this.player.maxHealth * 0.02; // /秒(2% maxHP)
                this.player.shield = Math.min(cap, this.player.shield + regen * DT);
            }
        }
        if (this.player.class === 'archer' && this.player.reloadTimer > 0) {
            this.player.reloadTimer -= DT;
            if (this.player.reloadTimer <= 0) {
                this.player.arrows = Math.min(this.player.arrows + 1, this.player.maxArrows);
                // 没装满就继续下一发
                if (this.player.arrows < this.player.maxArrows) {
                    this.player.reloadTimer = this.player.reloadDuration;
                } else {
                    this.player.reloadTimer = 0;
                }
            }
        }
        if (this.player.class === 'paladin') {
            if (this.player.faith < this.player.maxFaith) {
                this.player.faith = Math.min(this.player.maxFaith, this.player.faith + this.player.faithRegen * DT);
            }
            if (this.player.holyAuraActive) {
                this.player.holyAuraTimer -= DT;
                if (this.player.holyAuraTimer <= 0) {
                    this.player.holyAuraActive = false;
                } else {
                    this.player.heal(this.player.maxHealth * 0.1 * DT);
                    const pcx = this.player.x + this.player.size / 2;
                    const pcy = this.player.y + this.player.size / 2;
                    const auraR = this._auraRadius(this.player);
                    // 守护者:光环治疗范围内队友;觉醒后范围内所有玩家减伤 50%
                    if (this.player.spec === 'protector') {
                        for (const ally of this._allPlayers()) {
                            if (Math.hypot(ally.x + ally.size / 2 - pcx, ally.y + ally.size / 2 - pcy) > auraR + ally.size / 2) continue;
                            if (ally !== this.player) ally.heal(ally.maxHealth * 0.05 * DT);
                            if (this.player.awakened) ally.auraGuard = 0.1;
                        }
                    }
                    // 守护者:光环额外按最大生命灼烧(每秒 12%)
                    const auraDmgTick = (this._computeAttackDamage(this.player.attack) * 0.5 * (this.player.paladinSkillDmgMult || 1)
                        + (this.player.spec === 'protector' ? this.player.maxHealth * 0.12 : 0)) * DT
                        * this._buildDmgMult(this.player, 'e');
                    let auraHits = 0;
                    for (let i = this.enemies.length - 1; i >= 0; i--) {
                        const e = this.enemies[i];
                        const dx = e.x + e.size / 2 - pcx;
                        const dy = e.y + e.size / 2 - pcy;
                        if (Math.sqrt(dx * dx + dy * dy) <= auraR) {
                            this._withSrc('e', () => e.takeDamage(auraDmgTick));
                            auraHits++;
                            if (e.currentHealth <= 0) {
                                this.spawnHitParticles(e.x + e.size / 2, e.y + e.size / 2, e.color, 10);
                                this._withCtx(Game.CTX.e, () => this._onEnemyKilled(e));
                                this.enemies.splice(i, 1);
                            }
                        }
                    }
                    // 生命偷取(天赋 + E 位宝石)按光环总伤害结算
                    const auraLeech = ((this.player.tree && this.player.tree.leech) || 0) + this._gv(this.player, 'e', 'leech');
                    if (auraLeech && auraHits) this.player.heal(auraDmgTick * auraHits * auraLeech);
                    // 圣光光环对魔王也持续造伤
                    if (this.boss && this.bossState === 'active') {
                        const bx = this.boss.x + this.boss.size / 2;
                        const by = this.boss.y + this.boss.size / 2;
                        if (Math.sqrt((bx - pcx) ** 2 + (by - pcy) ** 2) <= auraR + this.boss.size / 2) {
                            this._withSrc('e', () => this.boss.takeDamage(auraDmgTick));
                            this.bossDamageDealt += auraDmgTick;
                        }
                    }
                    this.effects.push({ type: 'holyAura', x: pcx, y: pcy, radius: auraR, color: '#ffd700', ttl: 0.35, maxTtl: 0.35, pulse: this.player.holyAuraTimer });
                }
            }
        }
    }

    _auraRadius(p) { return (p.spec === 'protector' ? 130 : 80) * (1 + ((p.tree && p.tree.aoe) || 0) + this._gv(p, 'e', 'aoe')); }

    // 职业被动里需要 Game 参与的部分(作用于 this.player,guest 由 host 在 _runAsPlayer 里推进)
    _tickClassPassives() {
        const p = this.player;
        const pcx = p.x + p.size / 2, pcy = p.y + p.size / 2;
        if (p.shieldNovaCd > 0) p.shieldNovaCd -= DT;
        // 圣骑士被动「圣盾爆发」:护盾被打破时震晕周围敌人(8 秒一次)
        if (p._shieldBroke) {
            p._shieldBroke = false;
            if (p.class === 'paladin' && !(p.shieldNovaCd > 0)) {
                p.shieldNovaCd = 8;
                this._hitAround(pcx, pcy, 110, this._computeAttackDamage(p.attack) * 0.5, e => { e.stunTimer = Math.max(e.stunTimer || 0, e === this.boss ? 0.4 : 1); });
                this.effects.push({ type: 'shockwave', x: pcx, y: pcy, radius: 10, maxRadius: 110, color: '#90caf9', ttl: 0.4, maxTtl: 0.4 });
                this._showFloatingText('圣盾爆发', pcx, p.y - 26, '#90caf9');
            }
        }
        // 守护者觉醒「圣光反击」:把这一帧受到的攻击(护盾吸收的也算)以 1.5 倍反弹给周围敌人
        if (p._reflect > 0) {
            const raw = p._reflect;
            p._reflect = 0;
            if (p.spec === 'protector' && p.awakened && p.currentHealth > 0) {
                this._hitAround(pcx, pcy, 100, raw * 1.5 + p.maxHealth * 0.05);
                this.effects.push({ type: 'shockwave', x: pcx, y: pcy, radius: 8, maxRadius: 100, color: '#ffe082', ttl: 0.3, maxTtl: 0.3 });
                this._showFloatingText('反击', pcx, p.y - 22, '#ffe082');
            }
        }
        // 天赋「疾风之舞」闪避提示
        if (p._evadeFx) {
            p._evadeFx = false;
            this._showFloatingText('闪避', pcx, p.y - 22, '#b9f6ca');
        }
        // 铁卫觉醒「不屈」触发提示
        if (p._undyingFx) {
            p._undyingFx = false;
            this._showFloatingText('不屈!', pcx, p.y - 30, '#82b1ff');
            this.effects.push({ type: 'shockwave', x: pcx, y: pcy, radius: 10, maxRadius: 100, color: '#82b1ff', ttl: 0.6, maxTtl: 0.6 });
            this.spawnBurstRing(pcx, pcy, 40, '#bbdefb', 20);
        }
    }

    // ── 限时装备:计时 + 特殊攻击(作用于 this.player,guest 由 host 在 _runAsPlayer 里推进) ──
    _tickGear() {
        if (this.player.gear) this._withSrc('gear', () => this._tickGearInner());
    }

    _tickGearInner() {
        const p = this.player, g = p.gear;
        if (!g) return;
        g.timer -= DT;
        if (g.timer <= 0) {
            p.gear = null;
            this._showFloatingText(`${GEARS[g.type].name} 失效`, p.x + p.size / 2, p.y - 24, '#b0bec5');
            return;
        }
        const def = GEARS[g.type];
        const pcx = p.x + p.size / 2, pcy = p.y + p.size / 2;
        if (g.type === 'orb') { this._gearOrbTick(g, pcx, pcy); return; }
        if (g.type === 'thorns' && p._thornsHit > 0) this._gearThornsBurst(p, pcx, pcy);
        g.cd -= DT;
        if (g.cd > 0) return;
        let fired = false;
        if (g.type === 'blade') fired = this._gearChainLightning(pcx, pcy);
        else if (g.type === 'armor') fired = this._gearFrostNova(pcx, pcy);
        else if (g.type === 'bow') fired = this._gearFanShot(pcx, pcy);
        else if (g.type === 'thorns') fired = this._gearThornsSpikes(p, pcx, pcy);
        // 附近没目标就稍后再试,不白白进入冷却
        g.cd = fired ? def.every : 0.1;
    }

    // 荆棘之甲:受击后把这一帧受到的原始伤害 ×2(守护者再 ×1.5)+ 半个攻击力,炸向 110 范围内的敌人
    _gearThornsBurst(p, pcx, pcy) {
        const raw = p._thornsHit;
        p._thornsHit = 0;
        if (p.currentHealth <= 0) return;
        const dmg = (raw * 2 + p.attack * 0.5) * (p.spec === 'protector' ? 1.5 : 1);
        for (const t of this._gearTargets()) {
            const tx = t.x + t.size / 2, ty = t.y + t.size / 2;
            if (Math.hypot(tx - pcx, ty - pcy) <= 110 + t.size / 2) this._gearHit(t, dmg, '#c6ff00', pcx, pcy);
        }
        this.effects.push({ type: 'shockwave', x: pcx, y: pcy, radius: 8, maxRadius: 110, color: '#c6ff00', ttl: 0.3, maxTtl: 0.3 });
        for (let i = 0; i < 12; i++) {
            this.effects.push({ type: 'iceShard', x: pcx, y: pcy, angle: i * Math.PI / 6, length: 26, color: '#eeff41', ttl: 0.25, maxTtl: 0.25 });
        }
        this._showFloatingText('荆棘反伤', pcx, p.y - 22, '#c6ff00');
    }

    // 荆棘之甲:每 0.5 秒扎一次贴身的敌人
    _gearThornsSpikes(p, pcx, pcy) {
        const dmg = p.attack * 0.5 + p.maxHealth * 0.02;
        let hit = false;
        for (const t of this._gearTargets()) {
            const tx = t.x + t.size / 2, ty = t.y + t.size / 2;
            if (Math.hypot(tx - pcx, ty - pcy) > p.size / 2 + t.size / 2 + 22) continue;
            this._gearHit(t, dmg, '#c6ff00', pcx, pcy);
            hit = true;
        }
        return hit;
    }

    // 装备攻击的可选目标:普通敌人 + 活跃魔王
    _gearTargets() {
        const list = this.enemies.slice();
        if (this.boss && this.bossState === 'active') list.push(this.boss);
        return list;
    }

    // 装备伤害结算(不给怒气,避免高频命中刷满);击杀走统一入口
    _gearHit(t, dmg, color, kbX, kbY) {
        t.takeDamage(dmg);
        const tx = t.x + t.size / 2, ty = t.y + t.size / 2;
        if (t === this.boss) {
            this.bossDamageDealt += dmg;
            this.spawnHitParticles(tx, ty, '#ff1744', 4);
            return;
        }
        if (kbX !== undefined) this._knockbackFrom(t, kbX, kbY, 2.5);
        if (t.currentHealth <= 0) {
            const idx = this.enemies.indexOf(t);
            if (idx >= 0) {
                this.spawnHitParticles(tx, ty, t.color, 10);
                this._onEnemyKilled(t);
                this.enemies.splice(idx, 1);
            }
        } else {
            this.spawnHitParticles(tx, ty, color, 3);
        }
    }

    // 雷霆之刃:闪电打向最近目标,再向附近弹跳 3 次
    _gearChainLightning(pcx, pcy) {
        const targets = this._gearTargets();
        const dmg = this._computeAttackDamage(this.player.attack) * 0.7;
        const hit = new Set();
        let x = pcx, y = pcy, range = 230;
        const nodes = [[pcx, pcy]];
        for (let hop = 0; hop < 4; hop++) {
            let best = null, bestD = range * range;
            for (const t of targets) {
                if (hit.has(t) || t.currentHealth <= 0) continue;
                const dx = t.x + t.size / 2 - x, dy = t.y + t.size / 2 - y;
                const d = dx * dx + dy * dy;
                if (d < bestD) { bestD = d; best = t; }
            }
            if (!best) break;
            hit.add(best);
            x = best.x + best.size / 2; y = best.y + best.size / 2;
            nodes.push([x, y]);
            range = 150;
        }
        if (nodes.length < 2) return false;
        for (const t of hit) this._gearHit(t, dmg, '#fff59d');
        this.effects.push({ type: 'lightning', pts: this._lightningPts(nodes), color: '#ffe14d', ttl: 0.2, maxTtl: 0.2 });
        return true;
    }

    // 烈焰法球:3 颗火球绕身旋转,碰到的敌人每 0.4 秒最多受伤一次
    _gearOrbTick(g, pcx, pcy) {
        g.angle = ((g.angle || 0) + Game.ORB_SPIN * DT) % (Math.PI * 2);
        if (!g.hits) g.hits = new WeakMap();
        const dmg = this._computeAttackDamage(this.player.attack) * 0.45;
        const targets = this._gearTargets();
        for (let i = 0; i < 3; i++) {
            const a = g.angle + i * Math.PI * 2 / 3;
            const ox = pcx + Math.cos(a) * Game.ORB_RADIUS, oy = pcy + Math.sin(a) * Game.ORB_RADIUS;
            for (const t of targets) {
                if (t.currentHealth <= 0) continue;
                const r = 11 + t.size / 2;
                const dx = t.x + t.size / 2 - ox, dy = t.y + t.size / 2 - oy;
                if (dx * dx + dy * dy > r * r) continue;
                const last = g.hits.get(t);
                if (last !== undefined && this.gameTime - last < 0.4) continue;
                g.hits.set(t, this.gameTime);
                this._gearHit(t, dmg, '#ffab91', ox, oy);
                this.spawnParticles(ox, oy, '#ff7043', 4, 1, 3, 1, 3, 0.08);
            }
        }
    }

    // 寒霜战甲:身边有敌人时释放冰霜新星,造成伤害并冻住 1 秒(魔王只吃伤害)
    _gearFrostNova(pcx, pcy) {
        const R = 120;
        const inRange = this._gearTargets().filter(t => {
            const r = R + t.size / 2;
            return (t.x + t.size / 2 - pcx) ** 2 + (t.y + t.size / 2 - pcy) ** 2 <= r * r;
        });
        if (!inRange.length) return false;
        const dmg = this._computeAttackDamage(this.player.attack) * 0.6;
        for (const t of inRange) {
            if (t !== this.boss) t.stunTimer = Math.max(t.stunTimer || 0, 1);
            this._gearHit(t, dmg, '#b3e5fc', pcx, pcy);
        }
        this.effects.push({ type: 'shockwave', x: pcx, y: pcy, radius: 12, maxRadius: R, color: '#80d8ff', ttl: 0.45, maxTtl: 0.45 });
        this.spawnBurstRing(pcx, pcy, R * 0.8, '#b3e5fc', 18);
        return true;
    }

    // 风暴连弩:朝最近目标扇形连射 5 发
    _gearFanShot(pcx, pcy) {
        const t = this._findClosestTarget();
        if (!t) return false;
        const base = Math.atan2(t.y + t.size / 2 - pcy, t.x + t.size / 2 - pcx);
        const dmg = this._computeAttackDamage(this.player.attack) * 0.4;
        const spread = 20 * Math.PI / 180;
        for (let i = 0; i < 5; i++) {
            const a = base - spread + spread * 2 * i / 4;
            const proj = new Projectile(pcx - 4, pcy - 4, Math.cos(a) * 8, Math.sin(a) * 8, dmg);
            proj.owner = this.player;
            proj.gearBolt = true;
            this.projectiles.push(proj);
        }
        return true;
    }

    // ══════════════════════════════════════════════════════════════════
    //  构筑:天赋树 / 技能石 —— 规则与战斗钩子(面板见 openBuild)
    // ══════════════════════════════════════════════════════════════════

    // ── 伤害统计:按来源(普攻/Q/E/持续/装备/其他)累计每个玩家本局造成的伤害,只由 host/单人记录 ──
    // 敌人/魔王 takeDamage 回调 _creditDmg;来源默认取技能位上下文,_withSrc 可临时指定('none' 不计入任何人)
    _withSrc(src, fn) {
        const prev = this._dmgSrc;
        this._dmgSrc = src;
        try { return fn(); } finally { this._dmgSrc = prev; }
    }

    _creditDmg(v) {
        const src = this._dmgSrc || (this._ctx ? this._ctx.slot : 'other');
        if (src !== 'none') this._recDmg(this._dmgOwner || this.player, src, v);
    }

    // 投射物命中:伤害记在发射者名下(房主替 guest 打出的子弹不算房主的)
    _creditTo(owner, fn) {
        const prev = this._dmgOwner;
        this._dmgOwner = owner || null;
        try { return fn(); } finally { this._dmgOwner = prev; }
    }

    _recDmg(p, src, v) {
        if (!p || !(v > 0) || this.mpMode === 'guest') return;
        const s = p.dmgStats || (p.dmgStats = {});
        s[src] = (s[src] || 0) + v;
    }

    // 以技能位(a 普攻 / q / e)为上下文执行 fn,命中/击杀时据此读取该位置的技能石。
    // fn 内新排入的延迟动作和投射物会记住上下文,之后结算时同样生效;显式写了 ctx(含 null)的不覆盖
    _withCtx(ctx, fn) {
        const prev = this._ctx;
        const nA = this.pendingActions.length, nP = this.projectiles.length;
        this._ctx = ctx;
        try {
            return fn();
        } finally {
            if (ctx) {
                for (let i = nA; i < this.pendingActions.length; i++) {
                    if (!('ctx' in this.pendingActions[i])) this.pendingActions[i].ctx = ctx;
                }
                for (let i = nP; i < this.projectiles.length; i++) {
                    if (!('ctx' in this.projectiles[i])) this.projectiles[i].ctx = ctx;
                }
            }
            this._ctx = prev;
        }
    }

    // 各技能位上生效的宝石 { 宝石id: 等级 }:只算已开的孔、且对当前职业有效的;按 _buildVer 缓存
    _gemMap(p) {
        const mageOn = p.class === 'mage' && p.qToggleActive;
        const key = `${p._buildVer}|${p.class}|${p.gemLog.length}|${mageOn ? 1 : 0}`;
        if (p._gemKey === key) return p._gemCache;
        const counts = {};
        for (const ch of p.gemLog) {
            const id = GEM_TYPES[parseInt(ch, 36)];
            if (id) counts[id] = Math.min(3, (counts[id] || 0) + 1);
        }
        const map = { a: {}, q: {}, e: {}, counts };
        for (const slot of GEM_SLOTS) {
            const n = this._socketCount(p, slot);
            for (let i = 0; i < n; i++) {
                const id = p.sockets[slot][i];
                if (id && counts[id] && !gemMisfit(id, slot, p.class)) map[slot][id] = counts[id];
            }
        }
        // 法师魔力涌注开启时,Q 位宝石并入普攻(同种取高等级)
        if (mageOn) for (const id in map.q) map.a[id] = Math.max(map.a[id] || 0, map.q[id]);
        p._gemKey = key;
        p._gemCache = map;
        return map;
    }

    // 每个技能位 2 个孔,天赋树的连接孔节点 +1
    _socketCount(p, slot) {
        const t = p.tree || {};
        return 2 + ((slot === 'a' ? t.sockA : slot === 'q' ? t.sockQ : t.sockE) || 0);
    }

    // 技能位 slot 上宝石 id 的当前数值(没镶或不生效 = 0)
    _gv(p, slot, id) {
        if (!slot || !p || p.gemLog === undefined) return 0;
        const lv = this._gemMap(p)[slot][id];
        return lv ? GEMS[id].val[lv - 1] : 0;
    }

    // 伤害倍率:天赋(全伤害 / 技能 / 普攻 / 低血)× 宝石「附加伤害」
    _buildDmgMult(p, slot) {
        const t = p.tree || {};
        let m = 1 + (t.dmg || 0) + (slot === 'a' ? (t.autoDmg || 0) : slot ? (t.skillDmg || 0) : 0);
        if (t.lowLifeDmg && p.currentHealth < p.maxHealth * 0.5) m += t.lowLifeDmg;
        return Math.max(0.1, m) * (1 + this._gv(p, slot, 'dmg'));
    }

    // 范围半径:天赋「广域」+ 当前技能位的「范围扩大」(作用于 this.player)
    _aoe(r, slot) {
        const p = this.player;
        if (slot === undefined) slot = this._ctx ? this._ctx.slot : null;
        return r * (1 + ((p.tree && p.tree.aoe) || 0) + this._gv(p, slot, 'aoe'));
    }

    // 普攻速度倍率:天赋攻速 + 普攻位「快速冷却」
    _atkSpeedMult(p) {
        return 1 + ((p.tree && p.tree.atkSpd) || 0) + this._gv(p, 'a', 'faster');
    }

    // 命中之后:生命偷取 + 当前技能位宝石的命中效果。在 takeDamage 之后、死亡判定之前调用
    _afterHit(p, target, dmg) {
        if (!p || !target || !(dmg > 0)) return;
        const slot = this._ctx ? this._ctx.slot : null;
        const leech = ((p.tree && p.tree.leech) || 0) + this._gv(p, slot, 'leech');
        if (leech > 0 && p.currentHealth > 0) p.heal(dmg * leech);
        if (!slot || target.currentHealth <= 0) return;
        const g = this._gemMap(p)[slot];
        const isBoss = target === this.boss;
        const tx = target.x + target.size / 2, ty = target.y + target.size / 2;
        if (g.ignite) this._applyBurn(target, p, p.attack * GEMS.ignite.val[g.ignite - 1]);
        if (g.poison && Math.random() < GEMS.poison.val[g.poison - 1]) this._applyPoison(target, p, 1);
        if (g.freeze && Math.random() < GEMS.freeze.val[g.freeze - 1]) {
            target.stunTimer = Math.max(target.stunTimer || 0, isBoss ? 0.3 : 1);
            this.spawnParticles(tx, ty, '#b3e5fc', 4, 1, 3, 1, 3, 0.05);
        }
        // 连锁闪电晚几帧再放:调用方可能正按下标遍历 enemies,不能在这里打死别的敌人
        if (g.chain && Math.random() < GEMS.chain.val[g.chain - 1]) {
            const cd = dmg * 0.5;
            this.pendingActions.push({ delay: 0.05, ctx: null, player: p, fn: () => this._gemChain(target, tx, ty, cd) });
        }
        if (g.cull && !isBoss && target.currentHealth < target.maxHealth * GEMS.cull.val[g.cull - 1] * (target.elite ? 0.5 : 1)) {
            target.currentHealth = 0;
            this._showFloatingText('处决', tx, target.y - 10, '#ff8a80');
        }
    }

    // 技能石「连锁闪电」:从 (x,y) 弹向附近 2 个敌人(不再触发宝石效果,避免连锁套连锁)
    _gemChain(from, x, y, dmg) {
        const hit = [];
        const nodes = [[x, y]];
        for (let hop = 0; hop < 2; hop++) {
            let best = null, bestD = 160 * 160;
            for (const t of this._gearTargets()) {
                if (t === from || hit.includes(t) || t.currentHealth <= 0) continue;
                const d = (t.x + t.size / 2 - x) ** 2 + (t.y + t.size / 2 - y) ** 2;
                if (d < bestD) { bestD = d; best = t; }
            }
            if (!best) break;
            hit.push(best);
            x = best.x + best.size / 2; y = best.y + best.size / 2;
            nodes.push([x, y]);
        }
        if (!hit.length) return;
        for (const t of hit) this._gearHit(t, dmg, '#b388ff');
        this.effects.push({ type: 'lightning', pts: this._lightningPts(nodes), color: '#b388ff', ttl: 0.18, maxTtl: 0.18 });
    }

    // 闪电折线:每段切 4 小段,中间点沿法线随机偏移;返回量化后的扁平坐标
    _lightningPts(nodes) {
        const pts = [q1(nodes[0][0]), q1(nodes[0][1])];
        for (let i = 1; i < nodes.length; i++) {
            const [ax, ay] = nodes[i - 1], [bx, by] = nodes[i];
            const len = Math.hypot(bx - ax, by - ay) || 1;
            const nx = -(by - ay) / len, ny = (bx - ax) / len;
            for (let k = 1; k <= 4; k++) {
                const f = k / 4, off = k < 4 ? (Math.random() - 0.5) * 18 : 0;
                pts.push(q1(ax + (bx - ax) * f + nx * off), q1(ay + (by - ay) * f + ny * off));
            }
        }
        return pts;
    }

    // 技能石「燃烧」:3 秒持续伤害(取较高的一份,刷新时长),击杀记在点火者名下
    _applyBurn(t, owner, dps) {
        if (t.type === 'treasure') return;
        t.burn = Math.max(t.burnT > 0 ? t.burn : 0, dps);
        t.burnT = 3;
        t.burnOwner = owner;
    }

    // 每帧结算燃烧(直接扣血,不白闪);返回 true 表示烧死了(击杀由调用方结算)
    _tickBurn(t) {
        if (!(t.burnT > 0)) return false;
        t.burnT -= DT;
        const o = t.burnOwner;
        const dmg = t.burn * DT * (1 + ((o && o.tree && o.tree.dot) || 0));
        this._recDmg(o || this.player, 'dot', Math.min(dmg, t.currentHealth));
        t.currentHealth = Math.max(0, t.currentHealth - dmg);
        t._dnDot = (t._dnDot || 0) + dmg;
        if (t === this.boss) this.bossDamageDealt += dmg;
        if (t.burnT <= 0) t.burn = 0;
        return t !== this.boss && t.currentHealth <= 0;
    }

    // 释放 Q/E(本机与 host 替 guest 共用):在技能位上下文中派发到职业技能;
    // 成功释放(进入冷却)且镶了「回响」时,0.35 秒后自动再放一次
    _castSlot(slot) {
        const p = this.player;
        if (!p.class) return;
        const skill = slot === 'q' ? p.skillQ : p.skillE;
        if (skill.cooldown > 0) return;
        this._withCtx(Game.CTX[slot], () => this._dispatchSkill(slot, skill));
        const echo = skill.cooldown > 0 && this._gv(p, slot, 'echo');
        if (echo) this.pendingActions.push({ delay: 0.35, ctx: null, fn: () => this._echoCast(slot, echo) });
    }

    _dispatchSkill(slot, skill) {
        const cls = this.player.class;
        const fn = { warrior: ['_warriorQ', '_warriorE'], mage: ['_mageQ', '_mageE'], assassin: ['_assassinQ', '_assassinE'],
                     archer: ['_archerQ', '_archerE'], paladin: ['_paladinQ', '_paladinE'] }[cls];
        if (fn) this[fn[slot === 'q' ? 0 : 1]](skill);
    }

    // 回响:不看冷却、不耗资源地再放一次(伤害 ×mult),之后把冷却和资源恢复成原样
    _echoCast(slot, mult) {
        const p = this.player;
        if (!p.class || p.currentHealth <= 0) return;
        const skill = slot === 'q' ? p.skillQ : p.skillE;
        const keep = { cd: skill.cooldown, rage: p.rage, mana: p.mana, faith: p.faith, arrows: p.arrows,
                       reloadTimer: p.reloadTimer, assassinCharge: p.assassinCharge };
        skill.cooldown = 0;
        this._withCtx({ slot, mult }, () => this._dispatchSkill(slot, skill));
        if (skill.cooldown > 0) this._showFloatingText('回响', p.x + p.size / 2, p.y - 24, '#80d8ff');
        skill.cooldown = keep.cd;
        p.rage = keep.rage; p.mana = keep.mana; p.faith = keep.faith; p.arrows = keep.arrows;
        p.reloadTimer = keep.reloadTimer; p.assassinCharge = keep.assassinCharge;
    }

    // ── 天赋树:点数 / 点亮 / 取消 / 属性汇总 ──
    // 天赋点 = (等级 - 1) + 本局击退魔王次数;起点不占点
    _treePoints(p = this.player) {
        const total = Math.max(0, this.level - 1) + (this.runBossRepels || 0);
        const used = p.treeNodes.size - 1;
        return { total, used, free: total - used };
    }

    _treeCanAlloc(p, id) {
        return !p.treeNodes.has(id) && TREE_ADJ[id].some(n => p.treeNodes.has(n)) && this._treePoints(p).free > 0;
    }

    // 取消点亮后剩下的节点必须仍然连回起点
    _treeCanRefund(p, id) {
        if (id === 'start' || !p.treeNodes.has(id)) return false;
        const seen = new Set(['start']);
        const stack = ['start'];
        while (stack.length) {
            for (const n of TREE_ADJ[stack.pop()]) {
                if (n === id || seen.has(n) || !p.treeNodes.has(n)) continue;
                seen.add(n);
                stack.push(n);
            }
        }
        return seen.size === p.treeNodes.size - 1;
    }

    _treeAllocate(id) {
        const p = this.player;
        if (!this._treeCanAlloc(p, id)) return false;
        p.treeNodes.add(id);
        this._recomputeTree(p, true);
        Sound.play('pickup', TREE_BY_ID[id].kind === 'keystone' ? 'epic' : 'rare');
        return true;
    }

    _treeRefund(id) {
        const p = this.player;
        if (!this._treeCanRefund(p, id)) return false;
        p.treeNodes.delete(id);
        this._recomputeTree(p, true);
        return true;
    }

    _treeReset() {
        const p = this.player;
        p.treeNodes = new Set(['start']);
        this._recomputeTree(p, true);
    }

    // 重算天赋汇总。applyBase:把攻击/生命/防御/移速的变化量加到基础属性上(本机玩家);
    // host 替 guest 重算时为 false,这几项已包含在 guest 上报的 stats 里
    _recomputeTree(p, applyBase) {
        const t = {};
        for (const id of p.treeNodes) {
            const n = TREE_BY_ID[id];
            if (!n) continue;
            for (const k in n.mods) t[k] = (t[k] || 0) + n.mods[k];
        }
        p.tree = t;
        p._buildVer++;
        if (!applyBase) return;
        const old = p._treeBase;
        const nb = {};
        for (const k of TREE_BASE_STATS) nb[k] = t[k] || 0;
        p.attack += nb.attack - old.attack;
        p.defense += nb.defense - old.defense;
        p.speed += nb.speed - old.speed;
        const dh = nb.maxHealth - old.maxHealth;
        p.maxHealth += dh;
        p.currentHealth = dh > 0 ? p.currentHealth + dh : Math.min(p.currentHealth, p.maxHealth);
        p._treeBase = nb;
        this._refreshSkillCds(p);
    }

    // 冷却缩减(天赋/「快速冷却」)变了以后,按当前技能等级重算 Q/E 冷却上限
    _refreshSkillCds(p) {
        if (!CLASS_BASE_CD[p.class]) return;
        p.skillQ.maxCooldown = this._skillMaxCd(p, 'q');
        p.skillE.maxCooldown = this._skillMaxCd(p, 'e');
    }

    // 联机编码:天赋树 = 已点亮节点下标(36 进制),镶嵌 = 3 个技能位 × 3 孔,'-' 为空
    _encodeTree(p) {
        return [...p.treeNodes].map(id => TREE_BY_ID[id].idx.toString(36)).sort().join('');
    }

    _encodeSockets(p) {
        return GEM_SLOTS.map(s => p.sockets[s].map(id => id ? GEM_TYPES.indexOf(id).toString(36) : '-').join('')).join('');
    }

    // host:按 guest 上报的编码更新它的天赋/镶嵌(基础属性来自 stats,不再加一遍)
    _applyGuestBuild(gp, tr, sk) {
        if (typeof tr === 'string' && tr !== gp._trKey) {
            gp._trKey = tr;
            gp.treeNodes = new Set(['start']);
            for (const ch of tr) {
                const n = TREE_NODES[parseInt(ch, 36)];
                if (n) gp.treeNodes.add(n.id);
            }
            this._recomputeTree(gp, false);
        }
        if (typeof sk === 'string' && sk !== gp._skKey && sk.length === 9) {
            gp._skKey = sk;
            GEM_SLOTS.forEach((s, si) => {
                for (let i = 0; i < 3; i++) {
                    const ch = sk[si * 3 + i];
                    gp.sockets[s][i] = ch === '-' ? null : (GEM_TYPES[parseInt(ch, 36)] || null);
                }
            });
            gp._buildVer++;
        }
    }

    // ── 技能石:掉落 / 拾取 / 自动镶嵌 ──
    _dropGem(x, y, id) {
        id = id || GEM_TYPES[Math.floor(Math.random() * GEM_TYPES.length)];
        x = Math.max(10, Math.min(this.width - 40, x));
        y = Math.max(40, Math.min(this.height - 40, y));
        this.items.push(new Item(x, y, 'gem_' + id));
    }

    // 给 this.player 一颗宝石(同种第 2/3 颗 = 升级,满级再捡折算分数);返回飘字
    _grantGem(id) {
        const p = this.player;
        const def = GEMS[id];
        if (!def) return '';
        if (this._gemLv(p, id) >= 3) {
            this.score += 50 * (this.scoreMult || 1);
            return `${def.name} 已满级  +50 分`;
        }
        p.gemLog += GEM_TYPES.indexOf(id).toString(36);
        p._buildVer++;
        // guest 的宝石由 guest 自己在收到快照时提示/自动镶嵌(镶嵌以 guest 本地为准)
        if (!this._actingAs) this._onGemGained(p, id);
        return `技能石 ${def.name} Lv${this._gemLv(p, id)}`;
    }

    _gemLv(p, id) { return this._gemMap(p).counts[id] || 0; }

    // 本机玩家得到新宝石:没镶的话自动镶进第一个能生效的空孔,HUD 构筑按钮亮起提示
    _onGemGained(p, id) {
        p._newGem = true;
        if (GEM_SLOTS.some(s => p.sockets[s].includes(id))) return;
        const order = !p.class ? ['a'] : p.class === 'mage' ? ['a', 'e', 'q'] : ['q', 'e', 'a'];
        for (const s of order) {
            if (!gemCanPlace(id, s, p.class) || gemMisfit(id, s, p.class)) continue;
            const n = this._socketCount(p, s);
            const i = p.sockets[s].slice(0, n).indexOf(null);
            if (i < 0) continue;
            p.sockets[s][i] = id;
            p._buildVer++;
            this._refreshSkillCds(p);
            const where = s === 'a' ? '普攻' : `${s.toUpperCase()} 技能`;
            this._showFloatingText(`已镶嵌到${where},可在「构筑」里调整`, p.x + p.size / 2, p.y - 44, GEMS[id].color);
            return;
        }
    }

    // 镶嵌/取下(面板操作,本机玩家)。同一颗宝石只能在一个孔里
    _socketGem(slot, i, id) {
        const p = this.player;
        if (id) for (const s of GEM_SLOTS) p.sockets[s] = p.sockets[s].map(g => g === id ? null : g);
        p.sockets[slot][i] = id || null;
        p._buildVer++;
        this._refreshSkillCds(p);
    }

    // 以指定玩家身份执行 fn:技能/资源代码统一读写 this.player,host 替 guest 施法时临时替换。
    // fn 内新排入的 pendingActions 会记住施法者,延迟触发时同样以该玩家身份执行。
    _runAsPlayer(p, fn) {
        if (!p || p === this.player) return fn();
        const saved = this.player;
        const n = this.pendingActions.length;
        this.player = p;
        this._actingAs = p;
        this._savedPlayer = saved;
        try {
            return fn();
        } finally {
            for (let i = n; i < this.pendingActions.length; i++) {
                if (!this.pendingActions[i].player) this.pendingActions[i].player = p;
            }
            this.player = saved;
            this._actingAs = null;
            // 替身期间推迟的升级结算,换回 host 后补上
            this.checkLevelUp();
        }
    }

    // ── Host：执行 guest 请求的技能 ──
    _castGuestSkill(playerId, which, aim) {
        const gp = this.mpGuestPlayers.get(playerId);
        if (!gp || gp.currentHealth <= 0) return;
        if (which !== 'dash' && !gp.class) return;
        this._runAsPlayer(gp, () => this._castWithAim(which, aim));
    }

    // 本机按下 Q/E/冲刺(键盘或触屏按钮):guest 发给 host 执行,其余本地执行
    // aim:[dx,dy] 单位向量(拖拽瞄准),null = 自动瞄准最近敌人 / 冲刺沿移动方向
    _requestSkill(which, aim = null) {
        if (this.mpMode === 'guest') {
            if (this.mpWs && this.mpWs.readyState === WebSocket.OPEN)
                this.mpWs.send(JSON.stringify({ type: 'castSkill', skill: which, aim: aim ? [q2(aim[0]), q2(aim[1])] : null }));
            return;
        }
        this._castWithAim(which, aim);
    }

    // 瞄准方向只在本次释放期间生效:冲刺改朝向,技能优先锁定方向扇形内的敌人
    _castWithAim(which, aim) {
        const p = this.player;
        const len = aim ? Math.hypot(aim[0], aim[1]) : 0;
        p._aim = len > 0.01 ? [aim[0] / len, aim[1] / len] : null;
        try {
            if (which === 'dash') {
                if (p._aim && p.dashCooldown <= 0 && p.dashTimer <= 0) { p.faceX = p._aim[0]; p.faceY = p._aim[1]; }
                this._dash();
            } else if (which === 'E') this.castSkillE();
            else this.castSkillQ();
        } finally {
            p._aim = null;
        }
    }

    // ── 冲刺闪避 ──
    _dash() {
        const p = this.player;
        if (!p.tryDash()) return;
        const cx = p.x + p.size / 2, cy = p.y + p.size / 2;
        // 起步扬尘:向冲刺反方向喷出
        this.spawnParticles(cx - p.faceX * 10, cy - p.faceY * 10, '#e0f7fa', 8, 1, 3, 2, 4, 0.03);
    }

    // 幻影冲锋天赋:冲刺途中撞到的敌人/魔王各结算一次伤害
    _tickDashStrike() {
        const p = this.player;
        if (!(p.dashStrike > 0) || p.dashTimer <= 0) return;
        if (!p._dashHits) p._dashHits = new Set();
        const dmg = p.attack * p.dashStrike;
        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const e = this.enemies[i];
            if (p._dashHits.has(e.id) || !this.checkCollision(p, e)) continue;
            p._dashHits.add(e.id);
            this._dealDamage(e, dmg);
        }
        const b = this.boss;
        if (b && this.bossState === 'active' && !p._dashHits.has('boss') && this.checkCollision(p, b)) {
            p._dashHits.add('boss');
            this._dealDamage(b, dmg);
        }
    }

    // 玩家此刻能否受伤:受击无敌帧内不能;冲刺中不能,且算一次"完美闪避"
    _canHurt(p) {
        if (p.hurtCooldown > 0 || p.menuGuard) return false;
        if (p.dashTimer > 0) { this._onPerfectDodge(p); return false; }
        return true;
    }

    // 完美闪避:每次冲刺最多触发一次,返还一半冲刺冷却
    _onPerfectDodge(p) {
        if (p.dashDodged) return;
        p.dashDodged = true;
        p.dodgeCount = (p.dodgeCount || 0) + 1;
        p.dashCooldown = Math.max(0, p.dashCooldown - p.dashCdTotal() * 0.5);
        const cx = p.x + p.size / 2, cy = p.y + p.size / 2;
        this._showFloatingText('闪避!', cx, p.y - 18, '#80d8ff');
        this.spawnBurstRing(cx, cy, 22, '#80d8ff', 12);
    }

    _checkGuestCollisions() {
        if (this.isPaused) return; // 暂停期间世界冻结,guest 不受伤也不拾取
        for (const [, gp] of this.mpGuestPlayers) {
            // guest 拾取道具(无敌药水会改动基础属性,与 guest 上报的属性冲突,留给房主)
            if (gp.currentHealth > 0) {
                for (let i = this.items.length - 1; i >= 0; i--) {
                    const it = this.items[i];
                    if (it.type === 'potion_invicible' || !this.checkCollision(gp, it)) continue;
                    this._runAsPlayer(gp, () => this.collectItem(it));
                    this.items.splice(i, 1);
                }
            }
            // 无敌帧由 gp.update(Player.update)倒计时,这里不能再减一次(否则 guest 的无敌帧只有一半)
            if (gp.hurtCooldown > 0) continue;
            for (const enemy of this.enemies) {
                if (enemy.contactDamage() > 0 && this.checkCollision(gp, enemy)) {
                    if (this._canHurt(gp)) {
                        gp.takeDamage(enemy.contactDamage());
                        gp.hurtCooldown = 0.6 + (gp.hurtCooldownBonus || 0);
                        gp.gainRage(15 + (gp.rageOnHurtBonus || 0));
                    }
                    break;
                }
            }
            // 魔王碰撞
            if (gp.hurtCooldown <= 0 && this.boss && this.bossState === 'active' && this.checkCollision(gp, this.boss) && this._canHurt(gp)) {
                gp.takeDamage(this.boss.attack);
                gp.hurtCooldown = 0.6 + (gp.hurtCooldownBonus || 0);
                gp.gainRage(15 + (gp.rageOnHurtBonus || 0));
            }
            // 敌方子弹(炮手/魔王弹幕)
            if (gp.hurtCooldown <= 0 && gp.currentHealth > 0) {
                for (let i = this.enemyBullets.length - 1; i >= 0; i--) {
                    const b = this.enemyBullets[i];
                    if (!this.checkCollision(gp, b)) continue;
                    if (!this._canHurt(gp)) break; // 冲刺中穿过子弹
                    gp.takeDamage(b.damage);
                    gp.hurtCooldown = 0.6 + (gp.hurtCooldownBonus || 0);
                    gp.gainRage(15 + (gp.rageOnHurtBonus || 0));
                    this.spawnHitParticles(gp.x + gp.size / 2, gp.y + gp.size / 2, '#ff9800', 8);
                    this.enemyBullets.splice(i, 1);
                    break;
                }
            }
            // 死亡后复活:与房主共用全队生命(各端 HUD 显示的就是这个数),用完则全队结束
            if (gp.currentHealth <= 0) {
                gp.currentHealth = 0;
                if (this.life > 0) {
                    this.life--;
                    if (this.life > 0) {
                        gp.currentHealth = gp.maxHealth;
                        gp.hurtCooldown = 1.5;
                        gp.x = this.width / 2 - gp.size / 2; gp.y = this.height / 2 - gp.size / 2;
                    }
                }
            }
        }
    }

    _tickPendingActions() {
        // 按帧推进延迟动作,暂停时自动停止,避免 setTimeout 在菜单/暂停期间继续触发
        for (let i = this.pendingActions.length - 1; i >= 0; i--) {
            const a = this.pendingActions[i];
            a.delay -= DT;
            if (a.delay <= 0) {
                this.pendingActions.splice(i, 1);
                try {
                    // 施法者已离开房间则丢弃
                    if (a.player && a.player !== this.player && ![...this.mpGuestPlayers.values()].includes(a.player)) continue;
                    this._runAsPlayer(a.player, () => this._withCtx(a.ctx || null, a.fn));
                } catch (e) { console.error(e); }
            }
        }
    }

    _updateBoss() {
        switch (this.bossState) {
            case 'idle': {
                this.bossTimer -= DT;
                if (this.bossTimer <= 0) {
                    this.bossState = 'warning';
                    this.bossWarningTimer = this.bossWarningDuration;
                    this._showFloatingText('魔王降临!', this.width / 2, this.height * 0.35, '#ff1744');
                }
                break;
            }
            case 'warning': {
                this.bossWarningTimer -= DT;
                this.screenShake = 0.2; // 持续震动
                // 倒计时每整秒提示
                const sec = Math.ceil(this.bossWarningTimer);
                if (sec !== this._lastBossWarnSec && sec > 0) {
                    this._lastBossWarnSec = sec;
                    this._showFloatingText(`${sec}`, this.width / 2, this.height / 2, '#ff5252');
                }
                if (this.bossWarningTimer <= 0) {
                    this._spawnBoss();
                }
                break;
            }
            case 'active': {
                if (!this.boss) { this.bossState = 'idle'; this.bossTimer = this.bossInterval; break; }
                const target = this._bossTarget();
                this.boss.update(target.x, target.y);
                this.bossActiveTimer += DT;
                this._updateBossAttacks(target);

                // 受击判定:魔王 vs 玩家
                const bossTouch = this.checkCollision(this.player, this.boss);
                // 冲刺中穿过魔王:不受伤也不被推开,算一次完美闪避
                if (bossTouch && this.player.dashTimer > 0) this._canHurt(this.player);
                else if (bossTouch) {
                    if (this._canHurt(this.player)) {
                        this.player.takeDamage(this.boss.attack);
                        this.player.hurtCooldown = 0.6 + (this.player.hurtCooldownBonus || 0);
                        this.player.gainRage(15 + (this.player.rageOnHurtBonus || 0));
                        this.spawnHitParticles(this.player.x + this.player.size / 2, this.player.y + this.player.size / 2, '#ff1744', 16);
                        this.screenShake = 0.3;
                    }
                    // 玩家挨打位移(被推开)
                    const dx = this.player.x - this.boss.x;
                    const dy = this.player.y - this.boss.y;
                    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                    this.player.x = Math.max(0, Math.min(this.width - this.player.size, this.player.x + (dx / dist) * 15));
                    this.player.y = Math.max(0, Math.min(this.height - this.player.size, this.player.y + (dy / dist) * 15));
                    this._checkLocalDeath();
                }

                // 投射物 vs 魔王(单独处理,因为 boss 不在 enemies 数组里)
                for (let i = this.projectiles.length - 1; i >= 0; i--) {
                    const proj = this.projectiles[i];
                    if (proj.isPiercing && !proj.pierceRemaining) continue; // PiercingArrow 自处理
                    if (this.checkCollision(proj, this.boss)) {
                        if (proj.hitEnemies && proj.hitEnemies.has(this.boss)) continue;
                        const prevCtx = this._ctx;
                        this._ctx = proj.ctx || null;
                        const dmg = this._applyHitMods(proj.owner, this.boss, proj.damage != null ? proj.damage : 15);
                        this._creditTo(proj.owner, () => this.boss.takeDamage(dmg));
                        this._afterHit(proj.owner, this.boss, dmg);
                        if (proj.splash) this._projSplash(proj, this.boss);
                        this._ctx = prevCtx;
                        this.bossDamageDealt += dmg;
                        if (proj.hitEnemies) proj.hitEnemies.add(this.boss);
                        this.spawnHitParticles(this.boss.x + this.boss.size / 2, this.boss.y + this.boss.size / 2, '#ff1744', 6);
                        if (proj.pierceRemaining && proj.pierceRemaining > 0) {
                            proj.pierceRemaining--;
                            if (proj.pierceRemaining <= 0) this.projectiles.splice(i, 1);
                        } else {
                            this.projectiles.splice(i, 1);
                        }
                    }
                }

                // 战士近战光环(在 shoot 里只对 enemies 命中,需要补一个对 boss 的检测)
                // — 已通过 _warriorMeleeAttack 命中 enemies。我们在这里"补打"魔王:
                // 注:战士每 autoAttackInterval 触发一次,这里独立检测一次会重复。
                // 改为:_warriorMeleeAttack 内补打 boss(已确保只在 shoot 时触发)
                // 此处仅累计天赋触发的玩家命中伤害:_dealDamage 不进 boss,所以不重复

                // 击退判定:HP 归零 或 累计伤害达标 或 时间到
                const dmgGoal = this.bossDamageRequired * this.difficulty;
                const repelled = this.boss.currentHealth <= 0
                    || this.bossDamageDealt >= dmgGoal
                    || this.bossActiveTimer >= this.bossDuration;
                if (repelled) this._repelBoss();
                break;
            }
            case 'retreating': {
                if (this.boss) {
                    this.boss.update(this.player.x, this.player.y);
                    if (this.boss.retreatTimer <= 0) {
                        this.boss = null;
                        this.bossState = 'idle';
                        this.bossTimer = this.bossInterval;
                    }
                }
                break;
            }
        }
    }

    // 魔王追击/瞄准离它最近的存活玩家(联机时不再只盯房主)
    _bossTarget() {
        let best = this.player, bestD = Infinity;
        const bx = this.boss.x, by = this.boss.y;
        const consider = p => {
            if (p.currentHealth <= 0) return;
            const d = (p.x - bx) ** 2 + (p.y - by) ** 2;
            if (d < bestD) { bestD = d; best = p; }
        };
        consider(this.player);
        if (this.mpMode === 'host') for (const gp of this.mpGuestPlayers.values()) consider(gp);
        return best;
    }

    // ── 魔王招式 ──
    // 冲撞:锁定方向后高速直冲;弹幕:一圈慢速炮弹;震地:原地蓄力后范围重击。
    // 每招都有地面预警(BlockBoss.renderTelegraph),前摇中被眩晕会被打断;
    // 累计伤害过半或坚持过半后进入狂暴:出招更快、移速更高、弹幕变两波、震地范围更大。
    _updateBossAttacks(target) {
        const b = this.boss;
        const bcx = b.x + b.size / 2, bcy = b.y + b.size / 2;

        if (!b.enraged && (this.bossDamageDealt >= this.bossDamageRequired * this.difficulty * 0.5
                || this.bossActiveTimer >= this.bossDuration * 0.5)) {
            b.enraged = true;
            b.speed *= 1.25;
            this._showFloatingText('魔王狂暴!', bcx, b.y - 16, '#ff1744');
            this.effects.push({ type: 'shockwave', x: bcx, y: bcy, radius: 10, maxRadius: 160, color: '#ff1744', ttl: 0.6, maxTtl: 0.6 });
            this.screenShake = Math.max(this.screenShake, 0.35);
        }

        if (b.stunTimer > 0) {
            // 前摇被控 = 打断;已经冲出去的冲撞也就地停下
            if (b.atk) {
                if (b.atkPhase === 0) this._showFloatingText('打断!', bcx, b.y - 16, '#80d8ff');
                b.atk = null;
                b.atkCD = 1.2;
            }
            return;
        }

        const tcx = target.x + target.size / 2, tcy = target.y + target.size / 2;
        const speedUp = b.enraged ? 0.8 : 1;

        if (!b.atk) {
            b.atkCD -= DT;
            if (b.atkCD > 0) return;
            const dist = Math.hypot(tcx - bcx, tcy - bcy);
            // 按距离加权:远了爱冲撞,贴脸爱震地;不连续用同一招。
            // 魔王每次回归都会多会一招:第 2 只起激光扫射,第 3 只起召唤爪牙
            const w = {
                charge: dist > 200 ? 3 : 1, ring: 2, slam: dist < 180 ? 3 : 0.5,
                laser: b.tier >= 2 ? (dist > 140 ? 2.5 : 1.2) : 0,
                summon: b.tier >= 3 && this.enemies.length < 30 ? 1.5 : 0
            };
            if (b.lastAtk) w[b.lastAtk] = 0;
            const keys = Object.keys(w);
            let r = Math.random() * keys.reduce((sum, k) => sum + w[k], 0);
            let atk = keys[keys.length - 1];
            for (const k of keys) { if ((r -= w[k]) < 0) { atk = k; break; } }
            b.atk = b.lastAtk = atk;
            b.atkPhase = 0;
            b.atkDur = b.atkTimer = { charge: 0.8, ring: 0.65, slam: 0.95, laser: 0.95, summon: 0.85 }[atk] * speedUp;
            b.atkAngle = atk === 'ring' || atk === 'summon' ? Math.random() * Math.PI * 2 : Math.atan2(tcy - bcy, tcx - bcx);
            b.atkSweep = Math.random() < 0.5 ? 1 : -1;
            return;
        }

        b.atkTimer -= DT;
        // 冲撞前摇的前 60% 持续跟踪目标,之后锁定方向留出闪避窗口
        if (b.atk === 'charge' && b.atkPhase === 0 && b.atkTimer > b.atkDur * 0.4) {
            b.atkAngle = Math.atan2(tcy - bcy, tcx - bcx);
        }
        // 激光前摇的前一半瞄准目标,之后锁定;扫射从目标一侧扫向另一侧
        if (b.atk === 'laser' && b.atkPhase === 0 && b.atkTimer > b.atkDur * 0.5) {
            b.atkAngle = Math.atan2(tcy - bcy, tcx - bcx);
        }
        if (b.atk === 'laser' && b.atkPhase === 1) this._bossLaserTick(b, bcx, bcy);
        if (b.atk === 'charge' && b.atkPhase === 1) {
            // 朝外撞到边界就提前停下(从屏幕外冲进来的不算)
            const m = 10, c = Math.cos(b.atkAngle), sn = Math.sin(b.atkAngle);
            if ((b.x < -m && c < 0) || (b.y < -m && sn < 0)
                || (b.x > this.width - b.size + m && c > 0) || (b.y > this.height - b.size + m && sn > 0)) {
                this.screenShake = Math.max(this.screenShake, 0.3);
                this.spawnParticles(bcx, bcy, '#ff5252', 14, 2, 5, 2, 4, 0.05);
                b.atkTimer = 0;
            }
        }
        if (b.atkTimer > 0) return;

        if (b.atkPhase === 0) {
            b.atkPhase = 1;
            this._releaseBossAttack(b, bcx, bcy);
            b.atkDur = b.atkTimer = { charge: BlockBoss.CHARGE_TIME, ring: 0.4, slam: 0.35,
                laser: b.enraged ? 1.1 : 1.3, summon: 0.4 }[b.atk];
        } else {
            if (b.atk === 'ring' && b.enraged) this._bossRing(b, bcx, bcy, b.atkAngle + Math.PI / BlockBoss.ringCount(true));
            b.atk = null;
            b.atkCD = (b.enraged ? 1.5 : 2.4) + Math.random() * 0.6;
        }
    }

    _releaseBossAttack(b, bcx, bcy) {
        if (b.atk === 'charge') {
            this.screenShake = Math.max(this.screenShake, 0.2);
            this.spawnParticles(bcx, bcy, '#ff1744', 12, 2, 5, 2, 4, 0.05);
        } else if (b.atk === 'ring') {
            this._bossRing(b, bcx, bcy, b.atkAngle);
        } else if (b.atk === 'slam') {
            const r = b.slamRadius;
            this.effects.push({ type: 'shockwave', x: bcx, y: bcy, radius: 20, maxRadius: r, color: '#ff5252', ttl: 0.4, maxTtl: 0.4 });
            this.effects.push({ type: 'shockwave', x: bcx, y: bcy, radius: 10, maxRadius: r * 0.6, color: '#ffffff', ttl: 0.3, maxTtl: 0.3 });
            this.spawnParticles(bcx, bcy, '#ff8a80', 24, 3, 7, 2, 5, 0.04);
            this.screenShake = Math.max(this.screenShake, 0.4);
            const dmg = b.attack * 0.6;
            const hit = p => {
                const pcx = p.x + p.size / 2, pcy = p.y + p.size / 2;
                const d = Math.hypot(pcx - bcx, pcy - bcy);
                if (d > r + p.size / 2) return;
                if (!this._bossHitPlayer(p, dmg, '#ff5252')) return;
                // 震飞
                const k = 45 / (d || 1);
                p.x = Math.max(0, Math.min(this.width - p.size, p.x + (pcx - bcx) * k));
                p.y = Math.max(0, Math.min(this.height - p.size, p.y + (pcy - bcy) * k));
            };
            hit(this.player);
            if (this.mpMode === 'host') for (const gp of this.mpGuestPlayers.values()) hit(gp);
        } else if (b.atk === 'laser') {
            this.screenShake = Math.max(this.screenShake, 0.25);
            this.spawnBurstRing(bcx, bcy, 26, '#e040fb', 12);
        } else if (b.atk === 'summon') {
            // 法阵位置由魔王位置和 atkAngle 决定,guest 画预警时算出来的是同一组点
            const pts = BlockBoss.summonPoints(b, this.width, this.height);
            pts.forEach(([x, y], k) => {
                const type = b.enraged && k % 3 === 2 ? 'dasher' : 'chaser';
                const e = new Enemy(x - 15, y - 15, type, this.difficulty);
                this.enemies.push(e);
                this.spawnBurstRing(x, y, 22, '#b388ff', 10);
            });
            this.effects.push({ type: 'shockwave', x: bcx, y: bcy, radius: 10, maxRadius: 90, color: '#b388ff', ttl: 0.4, maxTtl: 0.4 });
        }
    }

    // 激光扫射:每帧按当前光束角度判定,光束为从魔王中心射出的长射线;
    // 走 _bossHitPlayer 的受击无敌帧,一次扫射最多吃一到两下,冲刺穿过算完美闪避
    _bossLaserTick(b, bcx, bcy) {
        const ang = BlockBoss.laserAngle(b);
        const c = Math.cos(ang), sn = Math.sin(ang);
        const hit = p => {
            const px = p.x + p.size / 2 - bcx, py = p.y + p.size / 2 - bcy;
            const along = px * c + py * sn;
            if (along < 0) return;
            if (Math.abs(px * sn - py * c) > BlockBoss.LASER_HALF + p.size / 2) return;
            this._bossHitPlayer(p, b.attack * 0.35, '#e040fb');
        };
        hit(this.player);
        if (this.mpMode === 'host') for (const gp of this.mpGuestPlayers.values()) hit(gp);
        // 光束扫过的地方冒火花
        if (Math.random() < 0.5) {
            const d = 60 + Math.random() * 500;
            this.spawnParticles(bcx + c * d, bcy + sn * d, '#ea80fc', 1, 1, 3, 2, 3, 0.06);
        }
    }

    _bossRing(b, bcx, bcy, start) {
        const n = BlockBoss.ringCount(b.enraged);
        const speed = 2.6 + this.difficulty * 0.35;
        const dmg = b.attack * 0.3;
        for (let k = 0; k < n; k++) {
            const ang = start + k * Math.PI * 2 / n;
            const c = Math.cos(ang), s = Math.sin(ang);
            this.enemyBullets.push(new EnemyBullet(bcx + c * b.size * 0.5, bcy + s * b.size * 0.5, c * speed, s * speed, dmg));
        }
        this.spawnBurstRing(bcx, bcy, 30, '#ff9800', 16);
    }

    // 魔王招式命中玩家(host 本机或 guest),走与接触伤害相同的受击无敌帧;返回是否结算了伤害
    _bossHitPlayer(p, dmg, color) {
        if (p.currentHealth <= 0 || !this._canHurt(p)) return false;
        p.takeDamage(dmg);
        p.hurtCooldown = 0.6 + (p.hurtCooldownBonus || 0);
        p.gainRage(15 + (p.rageOnHurtBonus || 0));
        this.spawnHitParticles(p.x + p.size / 2, p.y + p.size / 2, color, 12);
        // guest 的死亡/复活在 _checkGuestCollisions 里统一处理
        if (p === this.player) this._checkLocalDeath();
        return true;
    }

    // 本机玩家血量归零:扣一条命,还有命就在中央复活并给 1.5 秒无敌。
    // 同一帧可能被多个来源判定死亡,生命已为 0 时不再重复扣(否则命数会变成负数)
    _checkLocalDeath() {
        const p = this.player;
        if (p.currentHealth > 0 || this.life <= 0) return;
        this.life--;
        if (this.life > 0) {
            p.x = this.width / 2 - p.size / 2;
            p.y = this.height / 2 - p.size / 2;
            p.currentHealth = p.maxHealth;
            p.hurtCooldown = 1.5;
        }
    }

    _spawnBoss() {
        // 在屏幕外随机一侧生成
        let x, y;
        if (Math.random() < 0.5) {
            x = Math.random() < 0.5 ? -100 : this.width + 20;
            y = Math.random() * this.height;
        } else {
            x = Math.random() * this.width;
            y = Math.random() < 0.5 ? -100 : this.height + 20;
        }
        this.boss = new BlockBoss(x, y, this.difficulty, this.player.maxHealth);
        this.bossWave = (this.bossWave || 0) + 1;
        this.boss.tier = this.bossWave;
        this.bossState = 'active';
        this.bossActiveTimer = 0;
        this.bossDamageDealt = 0;
        this.screenShake = 0.6;
        // 出场闪白 / 大震动
        this.effects.push({ type: 'shockwave', x: this.boss.x + 40, y: this.boss.y + 40, radius: 5, maxRadius: 200, color: '#ff1744', ttl: 0.8, maxTtl: 0.8 });
        this.spawnParticles(this.boss.x + 40, this.boss.y + 40, '#ff1744', 30, 2, 6, 3, 6, 0.03);
        const tier = this.boss.tier;
        this._showFloatingText(tier > 1 ? `方块大魔王 Lv${tier}!` : '方块大魔王!', this.width / 2, this.height * 0.4, '#ff1744');
        const learned = { 2: '激光扫射', 3: '召唤爪牙' }[tier];
        if (learned) {
            this.effects.push({ type: 'floatText', text: `魔王习得新招「${learned}」`, x: this.width / 2, y: this.height * 0.4 + 30,
                color: '#ea80fc', ttl: 2.2, maxTtl: 2.2 });
        }
    }

    _repelBoss() {
        if (!this.boss) return;
        // 奖励
        this.life = Math.min(this.life + 1, this.maxLife);
        this.player.addPotentialPoints(1);
        this.score += Math.round(100 * (this.scoreMult || 1) * diffDef(this.diffMode).score);
        // 击退动画
        // 击退必掉一件限时装备(落在魔王原位)
        this._dropGear(this.boss.x + this.boss.size / 2 - 12, this.boss.y + this.boss.size / 2 - 12);
        this._dropGem(this.boss.x + this.boss.size / 2 + 24, this.boss.y + this.boss.size / 2 - 12);
        this.boss.triggerRetreat(this.player.x, this.player.y);
        this.bossState = 'retreating';
        // 视效:闪白 + 大粒子爆发
        this.effects.push({ type: 'shockwave', x: this.boss.x + 40, y: this.boss.y + 40, radius: 10, maxRadius: 250, color: '#ffffff', ttl: 0.7, maxTtl: 0.7 });
        this.spawnParticles(this.boss.x + 40, this.boss.y + 40, '#ffeb3b', 40, 2, 7, 3, 6, 0.03);
        this.spawnParticles(this.boss.x + 40, this.boss.y + 40, '#ffffff', 20, 3, 8, 2, 5, 0.04);
        this._showFloatingText('击退魔王!  +1 命  +1 潜能  +1 天赋点  掉落装备与技能石', this.width / 2, this.height * 0.4, '#ffeb3b');
        this.screenShake = 0.5;
        // 立即弹天赋菜单(奖励的潜能点)
        this.showPotentialMenu();
    }
    
    // ══════════════════════════════════════════════════════════════════
    //  随机事件:流星雨 / 宝藏方块 / 精英来袭 / 怪潮
    //  只在魔王 idle 期间开始,且保证在魔王预警前结束;host/单人调度,guest 只渲染快照
    // ══════════════════════════════════════════════════════════════════
    _resetEvents() {
        this.event = null;            // { type, timer, dur, left }
        this.eventTimer = 25;         // 距离下一个事件的秒数
        this.meteors = [];            // { id, x, y, r, t, dur }:t 为落地倒计时
        this.treasureKills = 0;
        this.eliteKills = 0;
        this._lastEventType = null;
    }

    _updateEvents() {
        this._updateMeteors();
        const ev = this.event;
        if (ev) {
            ev.timer -= DT;
            if (ev.type === 'meteor') {
                ev.spawnCd -= DT;
                if (ev.spawnCd <= 0 && ev.timer > 1.3) {
                    ev.spawnCd = Math.max(0.2, 0.42 - 0.06 * (this.difficulty - 1)) * (this.mpGuestPlayers.size ? 0.8 : 1);
                    this._spawnMeteor();
                }
            } else if (ev.type === 'elite') {
                ev.left = this.enemies.reduce((n, e) => n + (e.elite ? 1 : 0), 0);
                if (ev.left === 0) { ev.success = true; ev.timer = 0; }
            } else if (ev.type === 'altar') {
                this._tickAltar(ev);
            } else if (ev.type === 'treasure') {
                const t = this.enemies.find(e => e.type === 'treasure');
                if (!t) ev.timer = 0;
                else {
                    // 金光闪闪的拖尾,远处也看得见
                    ev.sparkle = (ev.sparkle || 0) - DT;
                    if (ev.sparkle <= 0) {
                        ev.sparkle = 0.12;
                        this.spawnParticles(t.x + t.size / 2, t.y + t.size / 2, '#ffd740', 2, 0.5, 1.5, 1.5, 3, 0.04);
                    }
                }
            }
            if (ev.timer <= 0) this._endEvent();
            return;
        }
        if (this.bossState !== 'idle') return;
        this.eventTimer -= DT;
        if (this.eventTimer > 0) return;
        // 随机挑一个和上次不同的事件;来不及在魔王降临前结束就稍后再试
        const pool = EVENT_TYPES.filter(t => t !== this._lastEventType);
        const type = pool[Math.floor(Math.random() * pool.length)];
        if (this.bossTimer < GAME_EVENTS[type].dur + 4) { this.eventTimer = 2; return; }
        this._startEvent(type);
    }

    _startEvent(type) {
        const def = GAME_EVENTS[type];
        this.event = { type, timer: def.dur, dur: def.dur, left: 0, spawnCd: 0.6 };
        this._lastEventType = type;
        // 放在新敌人提示(height*0.3)上方,避免精英带出的首次提示与之重叠
        this._showFloatingText(`${def.icon} ${def.name}`, this.width / 2, this.height * 0.17, def.color);
        this.effects.push({ type: 'floatText', text: def.desc, x: this.width / 2, y: this.height * 0.17 + 28, color: '#ffffff', ttl: 2.2, maxTtl: 2.2 });
        if (type === 'treasure') this._spawnTreasure();
        else if (type === 'elite') this._spawnElites();
        else if (type === 'altar') this._placeAltar(this.event);
    }

    _endEvent() {
        const ev = this.event;
        if (!ev) return;
        this.event = null;
        this.eventTimer = 22 + Math.random() * 10;
        if (ev.type === 'treasure') {
            const i = this.enemies.findIndex(e => e.type === 'treasure');
            if (i >= 0) {
                // 没追上:原地遁走
                const t = this.enemies[i];
                this.enemies.splice(i, 1);
                this.spawnBurstRing(t.x + t.size / 2, t.y + t.size / 2, 26, '#ffd740', 14);
                this._showFloatingText('宝藏方块溜走了…', this.width / 2, this.height * 0.3, '#ffe082');
            }
        } else if (ev.type === 'elite' && ev.success) {
            this._showFloatingText('精英全灭!', this.width / 2, this.height * 0.3, '#ffc400');
        } else if (ev.type === 'horde') {
            this._showFloatingText('怪潮退去', this.width / 2, this.height * 0.3, '#80d8ff');
        } else if (ev.type === 'altar' && !ev.success) {
            this.spawnBurstRing(ev.ax, ev.ay, Game.ALTAR_R, '#7e57c2', 14);
            this._showFloatingText('祭坛熄灭了…', this.width / 2, this.height * 0.3, '#b39ddb');
        }
    }

    // ── 祝福祭坛:在离玩家有一段距离的场内空地出现,站进光圈充能,没人时缓慢回落 ──
    _placeAltar(ev) {
        const players = this._livingPlayers(), m = 110;
        let x = this.width / 2, y = this.height / 2;
        for (let i = 0; i < 16; i++) {
            x = m + Math.random() * (this.width - m * 2);
            y = m + Math.random() * (this.height - m * 2);
            if (players.every(p => Math.hypot(p.x + p.size / 2 - x, p.y + p.size / 2 - y) > 200)) break;
        }
        ev.ax = x; ev.ay = y; ev.charge = 0;
        this.spawnBurstRing(x, y, Game.ALTAR_R, '#b388ff', 18);
    }

    _tickAltar(ev) {
        let n = 0;
        for (const p of this._livingPlayers()) {
            if (Math.hypot(p.x + p.size / 2 - ev.ax, p.y + p.size / 2 - ev.ay) <= Game.ALTAR_R) n++;
        }
        if (n > 0) {
            ev.charge = Math.min(1, ev.charge + DT * (1 + 0.5 * (n - 1)) / Game.ALTAR_NEED);
            ev.sparkle = (ev.sparkle || 0) - DT;
            if (ev.sparkle <= 0) {
                ev.sparkle = 0.1;
                const a = Math.random() * Math.PI * 2, r = Game.ALTAR_R * (0.4 + Math.random() * 0.6);
                this.spawnParticles(ev.ax + Math.cos(a) * r, ev.ay + Math.sin(a) * r, '#d1c4e9', 1, 0.5, 1.5, 1.5, 3, 0.03);
            }
        } else {
            ev.charge = Math.max(0, ev.charge - DT * 0.08);
        }
        if (ev.charge >= 1) {
            ev.success = true;
            ev.timer = 0;
            this._altarBless(ev);
        }
    }

    // 全队回血 + 一段时间的祝福(伤害、移速提升);死亡中的玩家不受益
    _altarBless(ev) {
        const B = Game.BLESS;
        for (const p of this._livingPlayers()) {
            p.heal(p.maxHealth * B.heal);
            p.blessTimer = B.dur;
            this.spawnBurstRing(p.x + p.size / 2, p.y + p.size / 2, 30, '#e1bee7', 12);
        }
        this.effects.push({ type: 'shockwave', x: ev.ax, y: ev.ay, radius: 10, maxRadius: Game.ALTAR_R * 2.2, color: '#b388ff', ttl: 0.6, maxTtl: 0.6 });
        this.spawnParticles(ev.ax, ev.ay, '#e1bee7', 26, 2, 7, 2, 5, 0.03);
        this.screenShake = Math.max(this.screenShake, 0.1);
        this._showFloatingText(`✨ 祝福降临  伤害 +${Math.round((B.dmg - 1) * 100)}%  移速 +${Math.round((B.speed - 1) * 100)}%`,
            this.width / 2, this.height * 0.3, '#e1bee7');
    }

    // 敌人从场外随机一侧进场
    _edgeSpawnPos() {
        if (Math.random() < 0.5) return { x: Math.random() < 0.5 ? -50 : this.width + 50, y: Math.random() * this.height };
        return { x: Math.random() * this.width, y: Math.random() < 0.5 ? -50 : this.height + 50 };
    }

    _livingPlayers() {
        const out = [];
        if (this.player.currentHealth > 0) out.push(this.player);
        if (this.mpMode === 'host') for (const gp of this.mpGuestPlayers.values()) if (gp.currentHealth > 0) out.push(gp);
        return out;
    }

    _spawnTreasure() {
        // 在场内远离所有玩家的位置现身
        const players = this._livingPlayers();
        let x = 0, y = 0;
        for (let i = 0; i < 12; i++) {
            x = 60 + Math.random() * (this.width - 150);
            y = 60 + Math.random() * (this.height - 150);
            if (players.every(p => Math.hypot(p.x - x, p.y - y) > 260)) break;
        }
        const t = new Enemy(x, y, 'treasure', this.difficulty);
        this.enemies.push(t);
        this.spawnBurstRing(x + t.size / 2, y + t.size / 2, 30, '#ffd740', 16);
    }

    _spawnElites() {
        const n = Math.min(6, 3 + Math.floor(this.difficulty - 1) + this.mpGuestPlayers.size);
        const pool = [['chaser', 40], ['patroller', 25], ['dasher', 25], ['giant', 10]];
        const total = pool.reduce((a, w) => a + w[1], 0);
        for (let i = 0; i < n; i++) {
            let roll = Math.random() * total, type = 'chaser';
            for (const [t, w] of pool) { if ((roll -= w) < 0) { type = t; break; } }
            this._introduceEnemy(type);
            const { x, y } = this._edgeSpawnPos();
            const e = new Enemy(x, y, type, this.difficulty);
            e.makeElite();
            this.enemies.push(e);
        }
    }

    _spawnMeteor() {
        let x, y;
        const players = this._livingPlayers();
        if (players.length && Math.random() < 0.45) {
            // 一部分瞄准玩家脚下(带偏移),逼玩家移动
            const p = players[Math.floor(Math.random() * players.length)];
            x = p.x + p.size / 2 + (Math.random() - 0.5) * 100;
            y = p.y + p.size / 2 + (Math.random() - 0.5) * 100;
        } else {
            x = 40 + Math.random() * (this.width - 80);
            y = 40 + Math.random() * (this.height - 80);
        }
        const dur = 1.2;
        this.meteors.push({ id: nextEntityId(), x: Math.max(20, Math.min(this.width - 20, x)),
            y: Math.max(20, Math.min(this.height - 20, y)), r: 36 + Math.random() * 16, t: dur, dur });
    }

    _updateMeteors() {
        for (let i = this.meteors.length - 1; i >= 0; i--) {
            const m = this.meteors[i];
            m.t -= DT;
            if (m.t > 0) continue;
            this.meteors.splice(i, 1);
            this._meteorImpact(m);
        }
    }

    _meteorImpact(m) {
        this.effects.push({ type: 'shockwave', x: m.x, y: m.y, radius: 6, maxRadius: m.r, color: '#ff9100', ttl: 0.35, maxTtl: 0.35 });
        this.spawnParticles(m.x, m.y, '#ffab40', 12, 2, 6, 2, 4, 0.05);
        this.screenShake = Math.max(this.screenShake, 0.12);
        Sound.play('meteor');
        const dmg = 12 + 8 * this.difficulty;
        for (const p of this._livingPlayers()) {
            const d = Math.hypot(p.x + p.size / 2 - m.x, p.y + p.size / 2 - m.y);
            if (d <= m.r + p.size * 0.3) this._bossHitPlayer(p, dmg, '#ff9100');
        }
        // 也砸敌人:击杀统一由 updateEnemies 结算
        const edmg = 110 * this.difficulty;
        for (const e of this.enemies) {
            if (e.currentHealth <= 0) continue;
            const d = Math.hypot(e.x + e.size / 2 - m.x, e.y + e.size / 2 - m.y);
            if (d > m.r + e.size / 2) continue;
            this._withSrc('none', () => e.takeDamage(e.type === 'treasure' ? edmg * 0.4 : edmg));
            this._knockbackFrom(e, m.x, m.y, 6);
        }
    }

    // 在 (x,y) 掉一个随机普通道具
    _dropRandomItem(x, y, pool) {
        pool = pool || ['potion', 'potion', 'exp_book', 'exp_book', 'snowflake', 'bomb', 'heart'];
        const type = pool[Math.floor(Math.random() * pool.length)];
        x = Math.max(10, Math.min(this.width - 40, x));
        y = Math.max(40, Math.min(this.height - 40, y));
        this.items.push(new Item(x, y, type));
    }

    _treasureReward(e) {
        const cx = e.x + e.size / 2, cy = e.y + e.size / 2;
        this._dropGear(cx - 12, cy - 12);
        this._dropGem(cx + 30, cy - 30);
        for (let i = 0; i < 3; i++) {
            const a = (i / 3) * Math.PI * 2 + Math.random();
            this._dropRandomItem(cx - 12 + Math.cos(a) * 55, cy - 12 + Math.sin(a) * 55);
        }
        this.score += 80 * (this.scoreMult || 1);
        this.exp += 40;
        this.treasureKills++;
        this.spawnParticles(cx, cy, '#ffd740', 30, 2, 7, 2, 5, 0.03);
        this.spawnBurstRing(cx, cy, 40, '#fff59d', 20);
        this._showFloatingText('宝藏到手!  +80 分  掉落装备', this.width / 2, this.height * 0.3, '#ffd740');
        Sound.play('treasure');
        if (this.event && this.event.type === 'treasure') this.event.timer = 0;
    }

    _eliteReward(e) {
        const cx = e.x + e.size / 2, cy = e.y + e.size / 2;
        this._dropRandomItem(cx - 12, cy - 12);
        if (Math.random() < 0.35) this._dropGem(cx + 14, cy - 20);
        this.score += 30 * (this.scoreMult || 1);
        this.exp += 20;
        this.eliteKills++;
        this.spawnBurstRing(cx, cy, 30, '#ffc400', 14);
        this._showFloatingText('精英击破!', cx, e.y - 14, '#ffc400');
    }

    // 地面预警:外圈 + 随落地进度填满的内圈(只有填充/描边,无 shadowBlur)
    _renderMeteorMarks(ctx) {
        if (!this.meteors.length) return;
        ctx.save();
        for (const m of this.meteors) {
            const p = Math.max(0, Math.min(1, 1 - m.t / m.dur));
            ctx.fillStyle = 'rgba(255,145,0,0.12)';
            ctx.beginPath();
            ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = 'rgba(255,112,67,0.26)';
            ctx.beginPath();
            ctx.arc(m.x, m.y, m.r * p, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = `rgba(255,171,64,${0.45 + 0.5 * p})`;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
            ctx.stroke();
        }
        ctx.restore();
    }

    // 下落中的陨石:从右上方斜着砸向落点,后 60% 时长可见
    _renderMeteorRocks(ctx) {
        if (!this.meteors.length) return;
        ctx.save();
        // 陨石从场外飞入,裁到场地内,竖屏时不画进上下留黑区
        ctx.beginPath();
        ctx.rect(0, 0, this.width, this.height);
        ctx.clip();
        ctx.lineCap = 'round';
        for (const m of this.meteors) {
            const p = 1 - m.t / m.dur;
            if (p < 0.4) continue;
            const k = (p - 0.4) / 0.6, f = 1 - k * k;
            const x = m.x + 150 * f, y = m.y - 240 * f;
            const tx = x + 150 * 0.18, ty = y - 240 * 0.18;
            const grad = ctx.createLinearGradient(x, y, tx, ty);
            grad.addColorStop(0, 'rgba(255,171,64,0.9)');
            grad.addColorStop(1, 'rgba(255,87,34,0)');
            ctx.strokeStyle = grad;
            ctx.lineWidth = 10;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(tx, ty);
            ctx.stroke();
            ctx.fillStyle = '#ffcc80';
            ctx.beginPath();
            ctx.arc(x, y, 8, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#bf360c';
            ctx.beginPath();
            ctx.arc(x + 2, y + 2, 4, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }

    // 顶部中央的事件横幅:图标 + 名称 + 剩余时间条(魔王出场时让位给魔王血条)
    _renderEventHUD() {
        const ev = this.event;
        if (!ev || this.bossState === 'warning' || this.bossState === 'active') return;
        const def = GAME_EVENTS[ev.type];
        if (!def) return;
        const ctx = this.ctx;
        const w = 230, h = 30, x = (this.width - w) / 2, y = 10;
        const pct = Math.max(0, Math.min(1, ev.timer / (ev.dur || 1)));
        ctx.save();
        ctx.fillStyle = 'rgba(10,16,28,0.78)';
        roundRect(ctx, x, y, w, h, 10);
        ctx.fill();
        ctx.strokeStyle = def.color;
        ctx.globalAlpha = 0.6 + 0.4 * Math.abs(Math.sin(this.bgTime * 3));
        ctx.lineWidth = 1.5;
        roundRect(ctx, x, y, w, h, 10);
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.fillStyle = def.color;
        roundRect(ctx, x + 8, y + h - 6, (w - 16) * pct, 3, 1.5);
        ctx.fill();
        let label = `${def.icon} ${def.name}`;
        if (ev.type === 'elite') label += `  剩余 ${ev.left}`;
        else if (ev.type === 'horde') label += '  经验×2';
        else if (ev.type === 'altar') label += `  ${Math.floor((ev.charge || 0) * 100)}%`;
        label += `  ${Math.ceil(ev.timer)}s`;
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, this.width / 2, y + h / 2 - 2);
        ctx.restore();
    }

    updatePlayer() {
        this.player.update(this.keys, this.width, this.height);
    }
    
    updateEnemies() {
        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const e = this.enemies[i];
            e.applyKnockback(this.width, this.height);
            if (this.enemyFreezeTimer <= 0) {
                // 联机时每个敌人追离它最近的存活玩家,不再只盯房主
                const t = this._nearestPlayer(e.x, e.y);
                e.update(t.x, t.y, this.width, this.height, t.size);
            }
            if (e._sfx) { Sound.play(e._sfx); e._sfx = null; }
            // 自爆者引信燃尽:原地爆炸(不算击杀,不给经验)
            if (e.detonate) {
                this.enemies.splice(i, 1);
                this._bomberExplode(e, true);
                continue;
            }
            // 炮手开火:取出 pendingShot 并生成敌方子弹
            if (e.pendingShot) {
                const s = e.pendingShot;
                this.enemyBullets.push(new EnemyBullet(s.x, s.y, s.vx, s.vy, s.damage));
                this.spawnParticles(s.x, s.y, '#ff9800', 5, 2, 4, 1, 3, 0.07);
                e.pendingShot = null;
            }
            if (e.pendingHeal) {
                e.pendingHeal = false;
                this._healerPulse(e);
            }
            // 毒死/烧死的敌人记在施加者名下
            const poisoned = this._tickPoison(e), burned = this._tickBurn(e);
            if (poisoned || burned || e.currentHealth <= 0) {
                this.spawnHitParticles(e.x + e.size / 2, e.y + e.size / 2, e.color, 10);
                const owner = (e.poison > 0 && e.poisonOwner) || (burned && e.burnOwner) || this.player;
                this._runAsPlayer(owner, () => this._onEnemyKilled(e));
                this.enemies.splice(i, 1);
            }
        }
        if (this.boss && this.bossState === 'active') { this._tickPoison(this.boss); this._tickBurn(this.boss); }
    }

    // 医疗兵治疗脉冲:范围内受伤的其他敌人回复 25% 最大生命(不含宝藏方块与自身)
    _healerPulse(h) {
        const cx = h.x + h.size / 2, cy = h.y + h.size / 2, r = h.healRadius || 140;
        for (const o of this.enemies) {
            if (o === h || o.type === 'treasure' || o.currentHealth <= 0 || o.currentHealth >= o.maxHealth) continue;
            if (Math.hypot(o.x + o.size / 2 - cx, o.y + o.size / 2 - cy) > r + o.size / 2) continue;
            o.currentHealth = Math.min(o.maxHealth, o.currentHealth + o.maxHealth * 0.25);
            this.spawnParticles(o.x + o.size / 2, o.y + o.size / 2, '#69f0ae', 4, 0.5, 1.6, 2, 3.5, 0.04);
        }
        this.effects.push({ type: 'shockwave', x: cx, y: cy, radius: 8, maxRadius: r, color: '#69f0ae', ttl: 0.4, maxTtl: 0.4 });
        Sound.play('enemyHeal');
    }

    // 离 (x,y) 最近的存活玩家(单人/guest 恒为本机玩家)
    _nearestPlayer(x, y) {
        if (this.mpMode !== 'host' || this.mpGuestPlayers.size === 0) return this.player;
        let best = this.player, bestD = Infinity;
        const consider = p => {
            if (p.currentHealth <= 0) return;
            const d = (p.x - x) ** 2 + (p.y - y) ** 2;
            if (d < bestD) { bestD = d; best = p; }
        };
        consider(this.player);
        for (const gp of this.mpGuestPlayers.values()) consider(gp);
        return best;
    }

    // 自爆者爆炸。armed=true:引信燃尽,伤玩家也伤周围敌人;false:被击杀后殉爆,只伤敌人(引到怪堆里打爆它)
    _splitEnemy(e) {
        const cx = e.x + e.size / 2, cy = e.y + e.size / 2, a0 = Math.random() * Math.PI * 2;
        for (let k = 0; k < 3; k++) {
            const a = a0 + k * Math.PI * 2 / 3;
            const s = new Enemy(cx - 8 + Math.cos(a) * 6, cy - 8 + Math.sin(a) * 6, 'shard', e.difficulty);
            if (e.elite) { s.maxHealth *= 2; s.currentHealth = s.maxHealth; }
            s.kbX = Math.cos(a) * 7;
            s.kbY = Math.sin(a) * 7;
            s.spawnHold = 0.3; // 迸开后稍一停顿再扑上来,给玩家反应时间
            this.enemies.push(s);
        }
        this.spawnParticles(cx, cy, '#84ffff', 10, 1.5, 4, 2, 4, 0.05);
    }

    _bomberExplode(e, armed) {
        e.exploded = true;
        const cx = e.x + e.size / 2, cy = e.y + e.size / 2, r = e.blastRadius;
        this.effects.push({ type: 'shockwave', x: cx, y: cy, radius: 10, maxRadius: r, color: '#ff4081', ttl: 0.4, maxTtl: 0.4 });
        this.effects.push({ type: 'shockwave', x: cx, y: cy, radius: 5, maxRadius: r * 0.55, color: '#ffd180', ttl: 0.3, maxTtl: 0.3 });
        this.spawnParticles(cx, cy, '#ff80ab', 22, 3, 7, 2, 5, 0.04);
        this.screenShake = Math.max(this.screenShake, armed ? 0.35 : 0.2);
        Sound.play('bomb');
        if (armed) {
            const hit = p => {
                const d = Math.hypot(p.x + p.size / 2 - cx, p.y + p.size / 2 - cy);
                if (d <= r + p.size / 2) this._bossHitPlayer(p, e.blastDamage, '#ff4081');
            };
            hit(this.player);
            if (this.mpMode === 'host') for (const gp of this.mpGuestPlayers.values()) hit(gp);
        }
        // 波及敌人:伤害只结算到血量,击杀统一由 updateEnemies 下一帧结算(可连锁殉爆)
        const dmg = (armed ? 60 : 80) * e.difficulty;
        for (const o of this.enemies) {
            if (o === e || o.currentHealth <= 0) continue;
            const ox = o.x + o.size / 2, oy = o.y + o.size / 2;
            if (Math.hypot(ox - cx, oy - cy) > r + o.size / 2) continue;
            this._withSrc(armed ? 'none' : 'other', () => o.takeDamage(dmg));
            this._knockbackFrom(o, cx, cy, 6);
        }
    }

    updateEnemyBullets() {
        for (let i = this.enemyBullets.length - 1; i >= 0; i--) {
            const b = this.enemyBullets[i];
            b.update();
            if (b.x < -20 || b.x > this.width + 20 || b.y < -20 || b.y > this.height + 20) {
                this.enemyBullets.splice(i, 1);
            }
        }
    }
    
    updateItems() {
        this._magnetItems();
        for (let i = this.items.length - 1; i >= 0; i--) {
            this.items[i].update();
            if (this.items[i].duration <= 0) {
                this.items.splice(i, 1);
            }
        }
    }
    
    // 拾取磁吸:落地后的道具被附近最近的存活玩家吸过去,越近越快(无敌药水只有房主/单人能捡,只吸向本机玩家)
    _magnetItems() {
        const players = this._allPlayers();
        if (!players.length) return;
        const R = Game.MAGNET_RADIUS;
        for (const it of this.items) {
            if (it.landTimer > 0) continue;
            const ix = it.x + it.size / 2, iy = it.y + it.size / 2;
            let best = null, bd = R;
            for (const p of players) {
                if (it.type === 'potion_invicible' && p !== this.player) continue;
                const d = Math.hypot(p.x + p.size / 2 - ix, p.y + p.size / 2 - iy);
                if (d < bd) { bd = d; best = p; }
            }
            if (!best || bd < 1) continue;
            const step = Math.min(bd, 1.5 + 7 * (1 - bd / R));
            const k = step / bd;
            it.x += (best.x + best.size / 2 - ix) * k;
            it.y += (best.y + best.size / 2 - iy) * k;
            it.targetX = it.x;
            it.targetY = it.y;
        }
    }

    updateProjectiles() {
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            this.projectiles[i].update();
            if (this.projectiles[i].x < 0 || this.projectiles[i].x > this.width || 
                this.projectiles[i].y < 0 || this.projectiles[i].y > this.height) {
                this.projectiles.splice(i, 1);
            }
        }
    }
    
    checkCollisions() {
        for (let i = this.enemies.length - 1; i >= 0; i--) {
            if (this.checkCollision(this.player, this.enemies[i])) {
                // 冲刺中直接穿过敌人(不碰撞、不推开),碰上即算完美闪避
                const harmless = this.enemies[i].contactDamage() <= 0; // 宝藏方块碰了不疼
                if (this.player.dashTimer > 0) { if (!harmless) this._canHurt(this.player); continue; }
                // 受击无敌帧：冷却期内不再结算玩家受伤，避免重叠时血量瞬间被掏空
                if (this.player.hurtCooldown <= 0 && !harmless) {
                    this.player.takeDamage(this.enemies[i].contactDamage());
                    this.player.hurtCooldown = 0.6 + (this.player.hurtCooldownBonus || 0);
                    this.player.gainRage(15 + (this.player.rageOnHurtBonus || 0));
                    this.spawnHitParticles(this.player.x + this.player.size / 2, this.player.y + this.player.size / 2, '#ff4444', 8);
                    this._knockbackFrom(this.enemies[i], this.player.x + this.player.size / 2, this.player.y + this.player.size / 2, 5);
                }
                this._withSrc('body', () => this.enemies[i].takeDamage(this.player.attack));
                
                // 简单的碰撞后分离，避免持续碰撞
                const dx = this.player.x - this.enemies[i].x;
                const dy = this.player.y - this.enemies[i].y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                const minDistance = (this.player.size + this.enemies[i].size) / 2;
                
                if (distance < minDistance && distance > 0) {
                    const pushFactor = 10;
                    const pushX = (dx / distance) * pushFactor;
                    const pushY = (dy / distance) * pushFactor;
                    
                    // 计算新位置
                    let newPlayerX = this.player.x + pushX;
                    let newPlayerY = this.player.y + pushY;
                    
                    // 确保主角不会超出地图边界
                    newPlayerX = Math.max(0, Math.min(this.width - this.player.size, newPlayerX));
                    newPlayerY = Math.max(0, Math.min(this.height - this.player.size, newPlayerY));
                    
                    // 应用新位置
                    this.player.x = newPlayerX;
                    this.player.y = newPlayerY;
                    
                    // 敌人位置调整
                    this.enemies[i].x -= pushX;
                    this.enemies[i].y -= pushY;
                }
                
                this._checkLocalDeath(); // 复活后给一小段无敌避免连死
                
                if (this.enemies[i] && this.enemies[i].currentHealth <= 0) {
                    this.spawnHitParticles(this.enemies[i].x + this.enemies[i].size / 2, this.enemies[i].y + this.enemies[i].size / 2, this.enemies[i].color, 12);
                    this._onEnemyKilled(this.enemies[i]);
                    this.enemies.splice(i, 1);
                }
            }
        }
        
        for (let i = this.items.length - 1; i >= 0; i--) {
            if (this.checkCollision(this.player, this.items[i])) {
                this.collectItem(this.items[i]);
                this.items.splice(i, 1);
            }
        }

        // 敌方子弹碰玩家
        for (let i = this.enemyBullets.length - 1; i >= 0; i--) {
            const b = this.enemyBullets[i];
            if (this.checkCollision(this.player, b)) {
                if (this.player.dashTimer > 0) { this._canHurt(this.player); continue; } // 冲刺中穿过子弹
                if (this.player.hurtCooldown <= 0) {
                    this.player.takeDamage(b.damage);
                    this.player.hurtCooldown = 0.6 + (this.player.hurtCooldownBonus || 0);
                    this.player.gainRage(15 + (this.player.rageOnHurtBonus || 0));
                    this.spawnHitParticles(this.player.x + this.player.size / 2, this.player.y + this.player.size / 2, '#ff9800', 8);
                    this._checkLocalDeath();
                }
                this.enemyBullets.splice(i, 1);
            }
        }

        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const proj = this.projectiles[i];
            // PiercingArrow 走自己的碰撞逻辑
            if (proj.isPiercing && !proj.pierceRemaining) continue;
            let hit = false;
            let splashAt = null;
            const prevCtx = this._ctx;
            this._ctx = proj.ctx || null;   // 命中按发射时的技能位结算宝石效果
            for (let j = this.enemies.length - 1; j >= 0; j--) {
                const enemy = this.enemies[j];
                const pSize = proj.size || 8;
                const eSize = enemy.size || 30;
                const threshold = (pSize + eSize) * 0.5 + 8;
                if (Math.abs((proj.x + pSize * 0.5) - (enemy.x + eSize * 0.5)) > threshold ||
                    Math.abs((proj.y + pSize * 0.5) - (enemy.y + eSize * 0.5)) > threshold) continue;
                if (this.checkCollision(proj, enemy)) {
                    // 有限穿透:已命中过的同一敌人跳过
                    if (proj.hitEnemies && proj.hitEnemies.has(this.enemies[j])) continue;
                    const dmg = this._applyHitMods(proj.owner, this.enemies[j], proj.damage != null ? proj.damage : 15);
                    this._creditTo(proj.owner, () => this.enemies[j].takeDamage(dmg));
                    this._afterHit(proj.owner, this.enemies[j], dmg);
                    if (proj.freeze) this.enemies[j].stunTimer = Math.max(this.enemies[j].stunTimer, proj.freeze);
                    if (proj.splash) splashAt = this.enemies[j];
                    this._knockbackDir(this.enemies[j], proj.dx, proj.dy, 2.5);
                    if (proj.hitEnemies) proj.hitEnemies.add(this.enemies[j]);
                    // 投射物击杀立即结算
                    if (this.enemies[j].currentHealth <= 0) {
                        this.spawnHitParticles(this.enemies[j].x + this.enemies[j].size / 2, this.enemies[j].y + this.enemies[j].size / 2, this.enemies[j].color, 10);
                        this._runAsPlayer(proj.owner, () => this._onEnemyKilled(this.enemies[j]));
                        this.enemies.splice(j, 1);
                    } else {
                        this.spawnHitParticles(this.enemies[j].x + this.enemies[j].size / 2, this.enemies[j].y + this.enemies[j].size / 2, '#ffaa00', 4);
                    }
                    // 有限穿透 → 计数,用完才销毁;无穿透 → 立即销毁
                    if (proj.pierceRemaining && proj.pierceRemaining > 0) {
                        proj.pierceRemaining--;
                        if (proj.pierceRemaining <= 0) {
                            hit = true;
                            break;
                        }
                        // 继续穿透下一敌人(本帧)
                    } else {
                        hit = true;
                        break;
                    }
                }
            }
            if (hit) this.projectiles.splice(i, 1);
            if (splashAt) this._projSplash(proj, splashAt);
            this._ctx = prevCtx;
        }
    }

    // 法师爆裂火球/奥术弹:命中点周围的其他敌人受到溅射伤害(记在施法者名下)
    _projSplash(proj, center) {
        const cx = center.x + center.size / 2, cy = center.y + center.size / 2;
        const color = proj.kind === 4 ? '#ff7043' : '#b388ff';
        this.effects.push({ type: 'shockwave', x: cx, y: cy, radius: 6, maxRadius: proj.splash, color, ttl: 0.28, maxTtl: 0.28 });
        this._runAsPlayer(proj.owner, () => {
            const dmg = proj.damage * 0.6;
            for (const e of this.enemies.filter(e => e !== center && Math.hypot(e.x + e.size / 2 - cx, e.y + e.size / 2 - cy) <= proj.splash + e.size / 2)) {
                if (e.currentHealth <= 0) continue;
                if (proj.freeze) e.stunTimer = Math.max(e.stunTimer, proj.freeze);
                this._dealDamage(e, dmg);
            }
        });
    }
    
    checkCollision(a, b) {
        return a.x < b.x + b.size &&
               a.x + a.size > b.x &&
               a.y < b.y + b.size &&
               a.y + a.size > b.y;
    }
    
    spawnEnemies() {
        // 魔王活跃 / 击退中,停刷普通敌人
        if (this.bossState === 'active' || this.bossState === 'retreating') return;
        // 怪潮事件:刷怪概率 ×3、数量上限 +25
        const horde = this.event && this.event.type === 'horde';
        if (this.enemies.length >= maxEnemiesFor(this.difficulty) + (horde ? 25 : 0)) return;
        // 刷怪概率随难度上升但封顶,避免后期数量碾压
        const spawnChance = Math.min(0.045, 0.018 + 0.008 * (this.difficulty - 1)) * (horde ? 3 : 1);
        if (Math.random() < spawnChance) {
            // 加权随机;冲锋者 30 秒、自爆者 50 秒后才加入,开局保持简单
            const pool = [['chaser', 44], ['patroller', 24], ['gunner', 15], ['giant', 5]];
            if (this.gameTime >= 30) pool.push(['dasher', 8]);
            if (this.gameTime >= 50) pool.push(['bomber', 8]);
            // 医疗兵 70 秒后加入,场上最多 3 个(太多会把战斗拖成消耗战)
            if (this.gameTime >= 70 && this.enemies.filter(e => e.type === 'healer').length < 3) pool.push(['healer', 6]);
            // 分裂者 90 秒后加入:死后裂成 3 块碎片
            if (this.gameTime >= 90) pool.push(['splitter', 7]);
            let roll = Math.random() * pool.reduce((a, w) => a + w[1], 0);
            let type = pool[0][0];
            for (const [t, w] of pool) { if ((roll -= w) < 0) { type = t; break; } }
            this._introduceEnemy(type);
            
            let x, y;

            if (type === 'gunner') {
                // 炮手不会移动,必须生成在屏幕内边缘(距边 30~100px)且远离玩家
                const margin = 30;
                const inset  = 100;
                let attempts = 0;
                do {
                    const side = Math.floor(Math.random() * 4);
                    if (side === 0)      { x = margin + Math.random() * inset;              y = margin + Math.random() * (this.height - margin * 2); }
                    else if (side === 1) { x = this.width - margin - inset + Math.random() * inset; y = margin + Math.random() * (this.height - margin * 2); }
                    else if (side === 2) { x = margin + Math.random() * (this.width - margin * 2); y = margin + Math.random() * inset; }
                    else                { x = margin + Math.random() * (this.width - margin * 2); y = this.height - margin - inset + Math.random() * inset; }
                    attempts++;
                    // 与玩家保持至少 200px 距离
                } while (attempts < 10 && Math.hypot(x - this.player.x, y - this.player.y) < 200);
            } else if (Math.random() < 0.5) {
                x = Math.random() < 0.5 ? -50 : this.width + 50;
                y = Math.random() * this.height;
            } else {
                x = Math.random() * this.width;
                y = Math.random() < 0.5 ? -50 : this.height + 50;
            }

            this.enemies.push(new Enemy(x, y, type, this.difficulty));
        }
    }
    
    // 新敌种首次出场时提示一次它的打法
    _introduceEnemy(type) {
        const intro = Enemy.INTROS[type];
        if (!intro) return;
        if (!this.seenEnemyTypes) this.seenEnemyTypes = new Set();
        if (this.seenEnemyTypes.has(type)) return;
        this.seenEnemyTypes.add(type);
        this.effects.push({ type: 'floatText', text: intro.text, x: this.width / 2, y: this.height * 0.3, color: intro.color, ttl: 2.2, maxTtl: 2.2 });
    }

    spawnItems() {
        // 限时装备:开局 20 秒后第一件,之后每 25~35 秒一件
        this.gearTimer -= DT;
        if (this.gearTimer <= 0) {
            this.gearTimer = 25 + Math.random() * 10;
            this._dropGear(60 + Math.random() * (this.width - 150), 60 + Math.random() * (this.height - 150));
        }
        // 技能石:开局 30 秒后第一颗,之后每 35~50 秒一颗(击杀/精英/宝藏/魔王另有掉落)
        this.gemTimer -= DT;
        if (this.gemTimer <= 0) {
            this.gemTimer = 35 + Math.random() * 15;
            this._dropGem(60 + Math.random() * (this.width - 150), 60 + Math.random() * (this.height - 150));
        }
        // 降低道具刷新频率以提高难度(原 0.015)
        if (Math.random() < 0.008) {
            // 加权随机:potion 35 / exp_book 25 / snowflake 15 / bomb 12 / heart 8 / potion_invicible 5
            const itemPool = [
                { type: 'potion',           weight: 35 },
                { type: 'exp_book',         weight: 25 },
                { type: 'snowflake',        weight: 15 },
                { type: 'bomb',             weight: 12 },
                { type: 'heart',            weight: 8  },
                { type: 'potion_invicible', weight: 5  }
            ];
            let total = 0;
            for (const it of itemPool) total += it.weight;
            let roll = Math.random() * total;
            let type = itemPool[0].type;
            for (const it of itemPool) {
                roll -= it.weight;
                if (roll <= 0) { type = it.type; break; }
            }
            const x = Math.random() * (this.width - 30);
            const y = Math.random() * (this.height - 30);
            this.items.push(new Item(x, y, type));
        }
    }
    
    // 在 (x,y) 掉一件随机(或指定)的限时装备
    _dropGear(x, y, kind) {
        kind = kind || GEAR_TYPES[Math.floor(Math.random() * GEAR_TYPES.length)];
        x = Math.max(10, Math.min(this.width - 40, x));
        y = Math.max(40, Math.min(this.height - 40, y));
        this.items.push(new Item(x, y, 'gear_' + kind));
    }

    // 给 this.player 穿上装备:同款续满时长,换款直接替换
    _equipGear(kind) {
        const def = GEARS[kind];
        if (!def) return;
        const p = this.player;
        if (p.gear && p.gear.type === kind) { p.gear.timer = def.duration; return; }
        p.gear = { type: kind, timer: def.duration, max: def.duration, cd: 0.3 };
    }

    collectItem(item) {
        // 拾取视觉反馈:按稀有度爆出粒子 + 飘字
        const cx = item.x + item.size / 2;
        const cy = item.y + item.size / 2;
        const burstCount = { common: 12, rare: 20, epic: 30 }[item.rarity] || 12;
        Sound.play(item.type === 'bomb' ? 'bomb' : 'pickup', item.rarity);
        this.spawnBurstRing(cx, cy, item.size * 1.5, item.color, burstCount);
        this.spawnParticles(cx, cy, item.color, burstCount, 1.5, 5, 2, 5, 0.04);
        // 史诗道具额外金色光圈
        if (item.rarity === 'epic') {
            this.effects.push({ type: 'shockwave', x: cx, y: cy, radius: 10, maxRadius: 80, color: '#ffd700', ttl: 0.6, maxTtl: 0.6 });
            this.spawnParticles(cx, cy, '#ffd700', 16, 2, 6, 2, 4, 0.03);
        } else if (item.rarity === 'rare') {
            this.effects.push({ type: 'shockwave', x: cx, y: cy, radius: 8, maxRadius: 50, color: item.color, ttl: 0.45, maxTtl: 0.45 });
        }

        let label = '';
        switch (item.type) {
            case 'potion':
                this.player.heal(50);
                label = '+50 HP';
                break;
            case 'snowflake':
                this.freezeEnemies(5000);
                label = '冻结 5s';
                break;
            case 'bomb':
                this.explodeBomb(this.player.x, this.player.y, 150);
                label = '💥 清场';
                break;
            case 'heart':
                this.life = Math.min(this.life + 1, this.maxLife);
                label = '+1 命';
                break;
            case 'potion_invicible':
                this.activateInvincible(10000);
                label = '无敌 10s';
                break;
            case 'exp_book':
                this.exp += 15;
                this.checkLevelUp();
                label = '+15 EXP';
                break;
            default:
                if (item.type.startsWith('gear_')) {
                    const kind = item.type.slice(5);
                    this._equipGear(kind);
                    label = `${GEARS[kind].name}  ${GEARS[kind].desc}`;
                } else if (item.gem) {
                    label = this._grantGem(item.gem);
                }
        }
        if (label) this._showFloatingText(label, cx, cy - 12, item.color);
    }
    
    freezeEnemies(duration) {
        // 按帧计时，暂停时一起停，且对定身期间新刷出的敌人同样生效
        this.enemyFreezeTimer = duration / 1000;
        // 生成全屏冰封特效数据
        this._initFreezeOverlay(duration / 1000);
    }

    _initFreezeOverlay(duration) {
        // 随机预生成冰裂纹路径（坐标归一化到 0~1，渲染时乘以 width/height）
        const cracks = [];
        for (let i = 0; i < 18; i++) {
            // 从四条边随机出发的折线
            const side = Math.floor(Math.random() * 4);
            let sx, sy;
            if (side === 0) { sx = Math.random(); sy = 0; }
            else if (side === 1) { sx = 1; sy = Math.random(); }
            else if (side === 2) { sx = Math.random(); sy = 1; }
            else { sx = 0; sy = Math.random(); }
            const segs = [];
            let cx = sx, cy = sy;
            const angle = Math.atan2(0.5 - cy, 0.5 - cx) + (Math.random() - 0.5) * 0.8;
            for (let s = 0; s < 5 + Math.floor(Math.random() * 4); s++) {
                const len = 0.04 + Math.random() * 0.08;
                const a = angle + (Math.random() - 0.5) * 0.6;
                const nx = Math.min(1, Math.max(0, cx + Math.cos(a) * len));
                const ny = Math.min(1, Math.max(0, cy + Math.sin(a) * len));
                segs.push({ x: nx, y: ny });
                cx = nx; cy = ny;
            }
            cracks.push({ sx, sy, segs, width: 0.5 + Math.random() * 1.5 });
        }
        // 四角冰晶簇（每角若干尖刺）
        const corners = [];
        const cornerDefs = [[0,0,0.55],[1,0,2.3],[1,1,3.9],[0,1,5.5]];
        for (const [ox, oy, baseAngle] of cornerDefs) {
            for (let i = 0; i < 6 + Math.floor(Math.random() * 4); i++) {
                const a = baseAngle + (Math.random() - 0.5) * 1.2;
                const len = 0.08 + Math.random() * 0.14;
                const w = 0.012 + Math.random() * 0.018;
                corners.push({ ox, oy, a, len, w });
            }
        }
        this.freezeOverlay = { duration, cracks, corners };
    }

    addEffect(x, y, radius, color, duration) {
        this.effects.push({ x, y, radius, color, ttl: duration, maxTtl: duration });
    }

    updateEffects() {
        for (let i = this.effects.length - 1; i >= 0; i--) {
            this.effects[i].ttl -= DT;
            if (this.effects[i].ttl <= 0) this.effects.splice(i, 1);
        }
    }

    // 联机:host 记录粒子生成调用,随快照发给 guest 重放(比发送粒子本身小得多)
    _mpRecordFx(kind, args) {
        if (this.mpMode !== 'host') return;
        if (this._mpFx.length < 200) this._mpFx.push([kind, ...args.map(v => typeof v === 'number' ? q2(v) : v)]);
    }

    spawnHitParticles(x, y, color, count) {
        this._mpRecordFx('h', [x, y, color, count]);
        count = this._fxCount(count);
        // 粒子数量上限,避免密集场景导致掉帧
        const cap = 500;
        if (this.particles.length >= cap) return;
        count = Math.min(count, cap - this.particles.length);
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * 3 + 1;
            this.particles.push({
                x, y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 1,
                decay: Math.random() * 0.04 + 0.03,
                size: Math.random() * 4 + 2,
                color
            });
        }
    }

    spawnParticles(x, y, color, count, speedMin, speedMax, sizeMin, sizeMax, decay) {
        this._mpRecordFx('p', [x, y, color, count, speedMin, speedMax, sizeMin, sizeMax, decay || 0]);
        count = this._fxCount(count);
        const cap = 500;
        if (this.particles.length >= cap) return;
        count = Math.min(count, cap - this.particles.length);
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = speedMin + Math.random() * (speedMax - speedMin);
            this.particles.push({
                x, y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 1,
                decay: decay || (Math.random() * 0.03 + 0.02),
                size: sizeMin + Math.random() * (sizeMax - sizeMin),
                color
            });
        }
    }

    spawnBurstRing(x, y, radius, color, count) {
        this._mpRecordFx('r', [x, y, radius, color, count]);
        count = this._fxCount(count);
        const cap = 500;
        if (this.particles.length >= cap) return;
        count = Math.min(count, cap - this.particles.length);
        for (let i = 0; i < count; i++) {
            const angle = (i / count) * Math.PI * 2;
            const speed = 1.5 + Math.random() * 2;
            this.particles.push({
                x: x + Math.cos(angle) * radius * 0.3,
                y: y + Math.sin(angle) * radius * 0.3,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 1,
                decay: Math.random() * 0.025 + 0.02,
                size: Math.random() * 4 + 2,
                color
            });
        }
    }

    spawnSlashEffect(x1, y1, x2, y2, color) {
        this.effects.push({ type: 'slash', x1, y1, x2, y2, color, ttl: 0.25, maxTtl: 0.25 });
    }

    updateParticles() {
        // 原地压缩:粒子多时 splice 逐个删除是 O(n²)
        const ps = this.particles;
        let n = 0;
        for (let i = 0; i < ps.length; i++) {
            const p = ps[i];
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.08;
            p.vx *= 0.96;
            p.life -= p.decay;
            if (p.life > 0) ps[n++] = p;
        }
        ps.length = n;
    }
    
    explodeBomb(x, y, radius) {
        this.addEffect(x + this.player.size / 2, y + this.player.size / 2, radius, '#ffa500', 0.45);
        this.spawnHitParticles(x + this.player.size / 2, y + this.player.size / 2, '#ffcc44', 30);

        // 检查并秒杀范围内的敌人
        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const enemy = this.enemies[i];
            const dx = enemy.x - x;
            const dy = enemy.y - y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance <= radius) {
                // 秒杀敌人
                this._onEnemyKilled(enemy);
                this.enemies.splice(i, 1);
            }
        }
    }
    
    activateInvincible(duration) {
        // 已在无敌中则只续时，避免叠加翻倍
        if (this.player.invincibleTimer > 0) {
            this.player.invincibleTimer = duration / 1000;
            return;
        }
        // 记录"无敌期间额外加上"的增量，结束时减回去。
        // 这样无敌期间获得的任何外部修改（天赋、升级、其它道具）都能保留。
        const sizeBonus = this.player.size;       // +1x 原值 = 翻倍
        const attackBonus = this.player.attack;
        const defenseBonus = this.player.defense;

        this.player.invincibleSizeBonus = sizeBonus;
        this.player.invincibleAttackBonus = attackBonus;
        this.player.invincibleDefenseBonus = defenseBonus;

        this.player.size += sizeBonus;
        this.player.attack += attackBonus;
        this.player.defense += defenseBonus;
        this.player.color = '#ffeb3b';
        this.player.invincibleTimer = duration / 1000;
    }

    updateInvincible() {
        if (this.player.invincibleTimer > 0) {
            this.player.invincibleTimer -= DT;
            if (this.player.invincibleTimer <= 0) {
                this.player.invincibleTimer = 0;
                // 减回无敌时加的增量，无敌期间任何外部加成都被保留
                this.player.size -= (this.player.invincibleSizeBonus || 0);
                this.player.attack -= (this.player.invincibleAttackBonus || 0);
                this.player.defense -= (this.player.invincibleDefenseBonus || 0);
                this.player.invincibleSizeBonus = 0;
                this.player.invincibleAttackBonus = 0;
                this.player.invincibleDefenseBonus = 0;
                this.player.color = '#4CAF50';
            }
        }
    }
    
    _getSkillMultiplier(level) {
        if (level === 2) return 1.2;
        if (level >= 3) return 1.5;
        return 1.0;
    }

    // 技能冷却上限 = 职业基础 × 等级倍率 - 固定减免(影袭);升级/觉醒重算时不会丢掉影袭的 -1 秒
    _skillMaxCd(p, key) {
        const base = (CLASS_BASE_CD[p.class] || { q: 3, e: 5 })[key];
        const sk = key === 'q' ? p.skillQ : p.skillE;
        const flat = key === 'q' ? (p.qCdFlat || 0) : 0;
        // 冷却缩减:天赋 + 该技能位的「快速冷却」,合计最多 -60%
        const red = Math.min(0.6, ((p.tree && p.tree.cdr) || 0) + this._gv(p, key, 'faster'));
        const cd = base * this._getCDMultiplier(sk.level) * (1 - red);
        return flat ? Math.max(1, cd - flat) : cd;
    }

    _getCDMultiplier(level) {
        if (level === 2) return 0.85;
        if (level >= 3) return 0.7;
        return 1.0;
    }

    _findClosestEnemies(count) {
        // 包含魔王(若存在且活跃),让技能能锁定魔王
        // count=1 走 O(n) 单次扫描;否则才排序
        if (count === 1) {
            const t = this._findClosestTarget();
            return t ? [t] : [];
        }
        const pool = this.enemies.slice();
        if (this.boss && this.bossState === 'active') pool.push(this.boss);
        const px = this.player.x, py = this.player.y;
        if (this.player._aim) {
            // 拖拽瞄准:瞄准扇形内的敌人排在前面,其余按距离补位
            const inCone = (e) => this._inAimCone(e) ? 0 : 1;
            pool.sort((a, b) => (inCone(a) - inCone(b)) ||
                ((a.x - px) ** 2 + (a.y - py) ** 2) - ((b.x - px) ** 2 + (b.y - py) ** 2));
            return pool.slice(0, count);
        }
        pool.sort((a, b) => {
            const dxa = a.x - px, dya = a.y - py;
            const dxb = b.x - px, dyb = b.y - py;
            return (dxa * dxa + dya * dya) - (dxb * dxb + dyb * dyb);
        });
        return pool.slice(0, count);
    }

    // 敌人是否在本次拖拽瞄准的扇形内(±35°,520px 内)
    _inAimCone(e) {
        const p = this.player, a = p._aim;
        const dx = e.x + e.size / 2 - (p.x + p.size / 2), dy = e.y + e.size / 2 - (p.y + p.size / 2);
        const d = Math.hypot(dx, dy);
        if (d > 520) return false;
        if (d < 1) return true;
        return (dx * a[0] + dy * a[1]) / d >= 0.82;
    }

    _findClosestTarget() {
        if (this.player._aim) {
            // 拖拽瞄准:取扇形内最近的敌人,扇形内没有则退回最近敌人
            const list = this._findClosestEnemies(2);
            return list.length ? list[0] : null;
        }
        // O(n) 找最近敌人(含活跃魔王),无敌人返回 null
        let closest = null;
        let bestD = Infinity;
        const px = this.player.x, py = this.player.y;
        for (const e of this.enemies) {
            const dx = e.x - px, dy = e.y - py;
            const d = dx * dx + dy * dy;
            if (d < bestD) { bestD = d; closest = e; }
        }
        if (this.boss && this.bossState === 'active') {
            const dx = this.boss.x - px, dy = this.boss.y - py;
            const d = dx * dx + dy * dy;
            if (d < bestD) { bestD = d; closest = this.boss; }
        }
        return closest;
    }

    // 职业命中修正(技能、普攻、箭矢共用):刺客暴击、冰霜觉醒碎冰、毒刃上毒。p = 出手的玩家
    // 另含构筑:天赋/宝石伤害倍率、回响倍率、通用暴击、瘟疫使者
    _applyHitMods(p, target, dmg) {
        if (!p || !target) return dmg;
        const ctx = this._ctx, slot = ctx ? ctx.slot : null;
        const t = p.tree || {};
        dmg *= this._buildDmgMult(p, slot) * (ctx ? ctx.mult : 1);
        let crit = (t.crit || 0) + this._gv(p, slot, 'crit');
        if (p.class === 'assassin') crit += 0.2 + (p.spec === 'shadow' ? 0.15 : 0);
        if (crit > 0 && Math.random() < crit) {
            dmg *= 2 + (t.critDmg || 0);
            // 开着伤害数字时暴击直接用放大的金色数字表现,不再额外飘「暴击」
            if (this.showDmgNums) target._dnCrit = true;
            else this._showFloatingText('暴击', target.x + target.size / 2, target.y - 8, '#ff80ab');
        }
        if (p.spec === 'frost' && p.awakened && target.stunTimer > 0) dmg *= 1.6;
        if (p.spec === 'venom') this._applyPoison(target, p, 1);
        if (t.poisonHit) this._applyPoison(target, p, 1);
        return dmg;
    }

    // 毒刃:叠毒(最多 5 层,刷新为 3 秒),伤害按施毒者攻击力结算
    _applyPoison(t, owner, stacks) {
        if (t.type === 'treasure') return;
        t.poison = Math.min(5, (t.poison || 0) + stacks);
        t.poisonT = 3;
        t.poisonOwner = owner;
        if (!(t.poisonTick > 0)) t.poisonTick = 0.5;
    }

    // 每 0.5 秒结算一次毒伤(直接扣血,不白闪);返回 true 表示毒死了(击杀由调用方结算)
    _tickPoison(t) {
        if (!(t.poison > 0)) return false;
        t.poisonT -= DT;
        t.poisonTick -= DT;
        if (t.poisonTick <= 0) {
            t.poisonTick += 0.5;
            const owner = t.poisonOwner || this.player;
            const dmg = t.poison * 0.2 * owner.attack * 0.5 * (1 + ((owner.tree && owner.tree.dot) || 0));
            this._recDmg(owner, 'dot', Math.min(dmg, t.currentHealth));
            t.currentHealth = Math.max(0, t.currentHealth - dmg);
            t._dnDot = (t._dnDot || 0) + dmg;
            if (t === this.boss) this.bossDamageDealt += dmg;
            this.spawnParticles(t.x + t.size / 2, t.y + t.size / 2, '#76ff03', 3, 0.5, 1.5, 1, 3, 0.03);
        }
        if (t.poisonT <= 0) t.poison = 0;
        return t !== this.boss && t.currentHealth <= 0;
    }

    // 以 (cx,cy) 为圆心对范围内敌人(含魔王)造成伤害,返回命中数
    _hitAround(cx, cy, range, dmg, onHit) {
        let hits = 0;
        const list = this.enemies.filter(e => Math.hypot(e.x + e.size / 2 - cx, e.y + e.size / 2 - cy) <= range + e.size / 2);
        for (const e of list) {
            if (e.currentHealth <= 0) continue;
            if (onHit) onHit(e);
            this._dealDamage(e, dmg);
            hits++;
        }
        const b = this.boss;
        if (b && this.bossState === 'active' && Math.hypot(b.x + b.size / 2 - cx, b.y + b.size / 2 - cy) <= range + b.size / 2) {
            if (onHit) onHit(b);
            this._dealDamage(b, dmg);
            hits++;
        }
        return hits;
    }

    // 所有存活玩家(替 guest 施法时 this.player 被临时替换,用 _savedPlayer 找回房主)
    _allPlayers() {
        const list = [this._actingAs ? this._savedPlayer : this.player];
        if (this.mpMode === 'host') for (const gp of this.mpGuestPlayers.values()) list.push(gp);
        return list.filter(p => p && p.currentHealth > 0);
    }

    _dealDamage(target, dmg) {
        dmg = this._applyHitMods(this.player, target, dmg);
        target.takeDamage(dmg);
        this._afterHit(this.player, target, dmg);
        this._knockbackFrom(target, this.player.x + this.player.size / 2, this.player.y + this.player.size / 2, 3.5);
        this.player.gainRage(10);
        // 魔王特殊处理:不死亡,只累计伤害
        if (this.boss && target === this.boss) {
            this.bossDamageDealt += dmg;
            this.spawnHitParticles(target.x + target.size / 2, target.y + target.size / 2, '#ff1744', 6);
            return;
        }
        if (target.currentHealth <= 0) {
            const idx = this.enemies.indexOf(target);
            if (idx >= 0) {
                this.spawnHitParticles(target.x + target.size / 2, target.y + target.size / 2, target.color, 10);
                this._onEnemyKilled(target);
                this.enemies.splice(idx, 1);
            }
        } else {
            this.spawnHitParticles(target.x + target.size / 2, target.y + target.size / 2, '#ffaa00', 4);
        }
    }

    _consumeAssassinCharge() {
        // 清空蓄力,返回伤害倍率(1 + charge*0.02,charge=100 时 ×3)
        const stock = this.player.assassinCharge;
        this.player.assassinCharge = 0;
        const mult = 1 + stock * 0.02;
        if (stock > 5) {
            const pcx = this.player.x + this.player.size / 2;
            const pcy = this.player.y + this.player.size / 2;
            this._showFloatingText(`蓄力 ×${mult.toFixed(2)}`, pcx, pcy - 30, '#ce93d8');
            this.spawnParticles(pcx, pcy, '#aa66ff', Math.min(20, Math.floor(stock / 5)), 2, 5, 2, 4, 0.05);
        }
        return mult;
    }

    _consumeArrows(n) {
        // 装填中(reloadTimer > 0)拒绝所有施法,并给视觉反馈
        if (this.player.reloadTimer > 0) {
            this._showFloatingText('装填中', this.player.x + this.player.size / 2, this.player.y - 20, '#ff5252');
            return false;
        }
        if (this.player.arrows < n) {
            this._showFloatingText('箭矢不足', this.player.x + this.player.size / 2, this.player.y - 20, '#ff5252');
            return false;
        }
        this.player.arrows -= n;
        // 箭袋打空 → 启动装填
        if (this.player.arrows <= 0 && this.player.reloadTimer <= 0) {
            this.player.reloadTimer = this.player.reloadDuration;
        }
        return true;
    }

    _showFloatingText(text, x, y, color) {
        this.effects.push({ type: 'floatText', text, x, y, color, ttl: 0.8, maxTtl: 0.8 });
    }

    // ── 伤害数字 ──
    // 命中时只在目标身上累计 _dn(直接伤害)/ _dnDot(中毒、燃烧),每帧末统一出数:
    // 同一目标 0.25 秒内的直接伤害并进同一个数字并重新弹一下(光环等每帧伤害不会刷屏),
    // 持续伤害每 0.5 秒出一个绿色小数字。host 把新建/变化的数字随快照发给 guest(dn)。
    _flushDmgNums() {
        for (const e of this.enemies) if (e._dn || e._dnDot) this._flushDn(e, false);
        const b = this.boss;
        if (b && (b._dn || b._dnDot)) this._flushDn(b, false);
    }

    _flushDn(t, final) {
        // 房主即使自己关了数字也要照常生成,guest 可能开着
        if (!this.showDmgNums && this.mpMode !== 'host') { t._dn = t._dnDot = 0; t._dnCrit = false; return; }
        const cx = t.x + t.size / 2, top = t.y - 4;
        if (t._dn > 0) {
            const k = t._dnCrit ? 1 : 0, n = t._dnRef;
            if (n && !n.dead && n.t < Game.DN_MERGE && n.k === k) {
                n.v += t._dn; n.pop = 1; n._dirty = true;
            } else {
                t._dnRef = this._addDmgNum(null, cx + (Math.random() - 0.5) * 16, top, t._dn, k);
            }
        }
        t._dn = 0; t._dnCrit = false;
        if (t._dnDot >= 1 && (final || this.gameTime - (t._dnDotAt || -9) >= 0.5)) {
            t._dnDotAt = this.gameTime;
            this._addDmgNum(null, cx + (Math.random() - 0.5) * 20, top + 8, t._dnDot, 2);
            t._dnDot = 0;
        }
    }

    _addDmgNum(id, x, y, v, k) {
        if (this.dmgNums.length >= Game.DN_MAX) this.dmgNums.shift().dead = true;
        if (id == null) id = this._dnSeq = ((this._dnSeq || 0) + 1) % 1e6;
        const n = { id, x, y, v, k, t: 0, pop: 1, _dirty: true };
        this.dmgNums.push(n);
        return n;
    }

    _updateDmgNums() {
        const a = this.dmgNums;
        let j = 0;
        for (let i = 0; i < a.length; i++) {
            const n = a[i];
            n.t += DT;
            if (n.pop > 0) n.pop = Math.max(0, n.pop - DT * 6);
            if (n.t < (n.k === 1 ? 0.9 : 0.7)) a[j++] = n;
            else n.dead = true;
        }
        a.length = j;
    }

    // host:取出自上次广播后新建或数值变化的数字,扁平数组 [id, x, y, 数值, 种类, ...]
    _mpTakeDmgNums() {
        const out = [];
        for (const n of this.dmgNums) {
            if (!n._dirty) continue;
            n._dirty = false;
            out.push(n.id, q1(n.x), q1(n.y), Math.round(n.v), n.k);
        }
        return out;
    }

    _mpApplyDmgNums(dn) {
        if (!dn || !dn.length || !this.showDmgNums) return;
        for (let i = 0; i + 4 < dn.length; i += 5) {
            const id = dn[i];
            const n = this.dmgNums.find(o => o.id === id);
            if (n) { n.v = dn[i + 3]; n.pop = 1; }
            else this._addDmgNum(id, dn[i + 1], dn[i + 2], dn[i + 3], dn[i + 4]);
        }
    }

    _renderDmgNums() {
        if (!this.showDmgNums || !this.dmgNums.length) return;
        const ctx = this.ctx;
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineJoin = 'round';
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
        for (const n of this.dmgNums) {
            const life = n.k === 1 ? 0.9 : 0.7, u = n.t / life;
            ctx.globalAlpha = u < 0.6 ? 1 : Math.max(0, 1 - (u - 0.6) / 0.4);
            const rise = (n.k === 2 ? 16 : 26) * (1 - (1 - u) * (1 - u));
            const base = n.k === 2 ? 10 : Math.min(21, 11 + Math.log10(Math.max(1, n.v)) * 3) * (n.k === 1 ? 1.35 : 1);
            ctx.font = `bold ${Math.round(base * (1 + 0.4 * n.pop))}px Arial`;
            const txt = Game.fmtDmg(n.v) + (n.k === 1 ? '!' : '');
            ctx.strokeText(txt, n.x, n.y - rise);
            ctx.fillStyle = n.k === 1 ? '#ffd740' : n.k === 2 ? '#c6ff00' : '#ffffff';
            ctx.fillText(txt, n.x, n.y - rise);
        }
        ctx.restore();
    }

    toggleDmgNums() {
        this.showDmgNums = !this.showDmgNums;
        Store.set('blockrun.dmgNums', this.showDmgNums);
        if (!this.showDmgNums) this.dmgNums.length = 0;
    }

    castSkillQ() { this._castSlot('q'); }

    castSkillE() { this._castSlot('e'); }

    _warriorQ(skill) {
        if (this.player.rage < 30) return;
        this.player.rage -= 30;
        const dmg = this._computeAttackDamage(this.player.attack) * 1.5 * this._getSkillMultiplier(skill.level) * (this.player.warriorSkillDmgMult || 1);
        if (this.player.spec === 'berserker') { this._warriorWhirl(skill, dmg); skill.cooldown = skill.maxCooldown; return; }
        const range = this._aoe(skill.level >= 3 ? 150 : 120);
        const pcx = this.player.x + this.player.size / 2;
        const pcy = this.player.y + this.player.size / 2;
        const particleCount = skill.level >= 3 ? 24 : 16;
        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const e = this.enemies[i];
            const dx = e.x + e.size / 2 - pcx;
            const dy = e.y + e.size / 2 - pcy;
            if (Math.sqrt(dx * dx + dy * dy) <= range) this._dealDamage(e, dmg);
        }
        // 魔王也在范围内则命中
        if (this.boss && this.bossState === 'active') {
            const bx = this.boss.x + this.boss.size / 2;
            const by = this.boss.y + this.boss.size / 2;
            if (Math.sqrt((bx - pcx) ** 2 + (by - pcy) ** 2) <= range + this.boss.size / 2) {
                this._dealDamage(this.boss, dmg);
            }
        }
        this.effects.push({ type: 'ring', x: pcx, y: pcy, radius: range, color: '#ff6030', ttl: 0.5, maxTtl: 0.5, rotation: 0, rotSpeed: 4 });
        this.spawnBurstRing(pcx, pcy, range * 0.6, '#ff8040', particleCount);
        this.spawnParticles(pcx, pcy, '#ff4020', particleCount, 2, 6, 2, 5, 0.04);
        skill.cooldown = skill.maxCooldown;
    }

    // 狂战士:跟随自身的持续旋风,每 0.25 秒斩击一次(觉醒:更久、更大、命中回血)
    _warriorWhirl(skill, dmg) {
        const aw = this.player.awakened;
        const ticks = aw ? 10 : 6;
        const range = this._aoe((skill.level >= 3 ? 130 : 110) * (aw ? 1.3 : 1));
        for (let i = 0; i < ticks; i++) {
            this.pendingActions.push({ delay: i * 0.25, fn: () => {
                const p = this.player;
                if (p.currentHealth <= 0) return;
                const pcx = p.x + p.size / 2, pcy = p.y + p.size / 2;
                const hits = this._hitAround(pcx, pcy, range, dmg * 0.45);
                if (aw && hits) p.heal(p.maxHealth * 0.01 * hits);
                this.effects.push({ type: 'meleeSwing', x: pcx, y: pcy, radius: range, startAngle: i * 1.3, endAngle: i * 1.3 + Math.PI * 1.4, color: '#ff3d00', ttl: 0.24, maxTtl: 0.24 });
                if (i === 0) this._showFloatingText('旋风!', pcx, pcy - 30, '#ff6e40');
                this.spawnParticles(pcx, pcy, '#ff7043', 6, 2, 5, 1, 3, 0.05);
            } });
        }
    }

    // 铁卫:盾冲。朝目标冲出最多 240px,沿途敌人受伤、被撞开并晕眩 1 秒
    _warriorShieldCharge(skill) {
        const p = this.player;
        const targets = this._findClosestEnemies(1);
        if (targets.length === 0) return;
        p.rage -= 50;
        const t = targets[0];
        const sx = p.x + p.size / 2, sy = p.y + p.size / 2;
        let dx = t.x + t.size / 2 - sx, dy = t.y + t.size / 2 - sy;
        const d = Math.hypot(dx, dy) || 1;
        dx /= d; dy /= d;
        const len = Math.min(240, Math.max(0, d - t.size / 2 - p.size / 2));
        p.x = Math.max(0, Math.min(this.width - p.size, p.x + dx * len));
        p.y = Math.max(0, Math.min(this.height - p.size, p.y + dy * len));
        p.hurtCooldown = Math.max(p.hurtCooldown, 0.35);
        const ex = p.x + p.size / 2, ey = p.y + p.size / 2;
        const dmg = this._computeAttackDamage(p.attack) * 2 * this._getSkillMultiplier(skill.level) * (p.warriorSkillDmgMult || 1);
        // 线段 (sx,sy)-(ex,ey) 附近 + 终点周围的目标
        const segDist = (o) => {
            const ox = o.x + o.size / 2 - sx, oy = o.y + o.size / 2 - sy;
            const lx = ex - sx, ly = ey - sy, l2 = lx * lx + ly * ly || 1;
            const k = Math.max(0, Math.min(1, (ox * lx + oy * ly) / l2));
            return Math.hypot(ox - lx * k, oy - ly * k);
        };
        const hitList = this.enemies.filter(e => segDist(e) <= 40 + e.size / 2);
        if (this.boss && this.bossState === 'active' && segDist(this.boss) <= 40 + this.boss.size / 2) hitList.push(this.boss);
        for (const e of hitList) {
            if (e.currentHealth <= 0) continue;
            e.stunTimer = Math.max(e.stunTimer || 0, e === this.boss ? 0.5 : 1);
            this._dealDamage(e, dmg);
            this._knockbackDir(e, -dy * (Math.random() < 0.5 ? 1 : -1) + dx, dx * (Math.random() < 0.5 ? 1 : -1) + dy, 8);
        }
        this.effects.push({ type: 'slash', x1: sx, y1: sy, x2: ex, y2: ey, color: '#4488ff', ttl: 0.35, maxTtl: 0.35 });
        this.effects.push({ type: 'shockwave', x: ex, y: ey, radius: 10, maxRadius: 90, color: '#88aaff', ttl: 0.35, maxTtl: 0.35 });
        this.spawnParticles(ex, ey, '#82b1ff', 14, 2, 6, 2, 5, 0.04);
        this.screenShake = Math.max(this.screenShake, 0.15);
        skill.cooldown = skill.maxCooldown;
    }

    _warriorE(skill) {
        if (this.player.rage < 50) return;
        if (this.player.spec === 'guardian') { this._warriorShieldCharge(skill); return; }
        const targets = this._findClosestEnemies(1);
        if (targets.length === 0) return;
        this.player.rage -= 50;
        const target = targets[0];
        const pcx = this.player.x + this.player.size / 2;
        const pcy = this.player.y + this.player.size / 2;
        const tcx = target.x + target.size / 2;
        const tcy = target.y + target.size / 2;
        const dx = tcx - pcx, dy = tcy - pcy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 0) {
            const nx = dx / dist, ny = dy / dist;
            // 把敌人拽到身前:最多拉 150px,停在玩家身前,近距离时不会甩到身后
            const stop = (this.player.size + target.size) / 2 + 6;
            const pull = Math.min(150, Math.max(0, dist - stop));
            target.x -= nx * pull;
            target.y -= ny * pull;
            const dmg = this._computeAttackDamage(this.player.attack) * 2 * this._getSkillMultiplier(skill.level) * (this.player.warriorSkillDmgMult || 1);
            this._dealDamage(target, dmg);
            this.effects.push({ type: 'slash', x1: pcx, y1: pcy, x2: pcx + nx * 100, y2: pcy + ny * 100, color: '#4488ff', ttl: 0.3, maxTtl: 0.3 });
            this.effects.push({ type: 'shockwave', x: tcx, y: tcy, radius: 10, maxRadius: 80, color: '#88aaff', ttl: 0.35, maxTtl: 0.35 });
            this.spawnParticles(tcx, tcy, '#4488ff', 12, 2, 5, 2, 5, 0.04);
        }
        skill.cooldown = skill.maxCooldown;
    }

    _mageQ(skill) {
        // 切换"魔力涌注"开关:激活后每次普攻附加 maxMana×1.5 法术伤害,消耗 10% maxMana
        this.player.qToggleActive = !this.player.qToggleActive;
        const pcx = this.player.x + this.player.size / 2;
        const pcy = this.player.y + this.player.size / 2;
        if (this.player.qToggleActive) {
            this._showFloatingText('魔力涌注 开', pcx, pcy - 30, '#80deea');
            this.effects.push({ type: 'shockwave', x: pcx, y: pcy, radius: 5, maxRadius: 50, color: '#4ecdc4', ttl: 0.4, maxTtl: 0.4 });
        } else {
            this._showFloatingText('魔力涌注 关', pcx, pcy - 30, '#90a4ae');
        }
        skill.cooldown = 0.5; // 防狂按
    }

    _mageE(skill) {
        if (!this._payMana(3)) return;
        this._mageNova(skill);
        // 奥术连击:0.4s 后再次无消耗触发一次
        if (this.player.mageMulticast) {
            this.pendingActions.push({ delay: 0.4, fn: () => this._mageNova(skill) });
        }
        skill.cooldown = skill.maxCooldown;
    }

    // E 按专精分派:冰霜新星 / 烈焰新星(炎术师觉醒) / 斥力波
    _mageNova(skill) {
        const p = this.player;
        if (p.spec === 'frost') this._mageFrostNova(skill);
        else if (p.spec === 'pyro' && p.awakened) this._mageFlameNova(skill);
        else this._mageRepulseEffect(skill);
    }

    _mageFrostNova(skill) {
        const p = this.player;
        const pcx = p.x + p.size / 2, pcy = p.y + p.size / 2;
        const range = this._aoe(skill.level >= 3 ? 210 : 170);
        const dmg = this._computeAttackDamage(p.attack) * 1.0 * this._getSkillMultiplier(skill.level) * (1 + (p.magePenetration || 0));
        // 先冻住再结算伤害,让觉醒「碎冰」对这一下也生效
        this._hitAround(pcx, pcy, range, dmg, e => { e.stunTimer = Math.max(e.stunTimer || 0, e === this.boss ? 0.6 : 2); });
        this.effects.push({ type: 'shockwave', x: pcx, y: pcy, radius: 14, maxRadius: range, color: '#b3e5fc', ttl: 0.5, maxTtl: 0.5 });
        this.effects.push({ type: 'ring', x: pcx, y: pcy, radius: range * 0.7, color: '#e1f5fe', ttl: 0.5, maxTtl: 0.5, rotation: 0, rotSpeed: 2 });
        for (let i = 0; i < 16; i++) {
            this.effects.push({ type: 'iceShard', x: pcx, y: pcy, angle: (i / 16) * Math.PI * 2, length: 26 + Math.random() * 16, color: '#e1f5fe', ttl: 0.4, maxTtl: 0.4 });
        }
        this.spawnBurstRing(pcx, pcy, range * 0.5, '#81d4fa', 24);
        this._showFloatingText('冰霜新星!', pcx, pcy - 28, '#b3e5fc');
        this.screenShake = 0.15;
    }

    // 炎术师觉醒:烈焰新星 + 原地燃烧 3 秒
    _mageFlameNova(skill) {
        const p = this.player;
        const pcx = p.x + p.size / 2, pcy = p.y + p.size / 2;
        const range = this._aoe(skill.level >= 3 ? 200 : 160);
        const base = this._computeAttackDamage(p.attack) * this._getSkillMultiplier(skill.level) * (1 + (p.magePenetration || 0));
        this._hitAround(pcx, pcy, range, base * 1.6);
        this.effects.push({ type: 'shockwave', x: pcx, y: pcy, radius: 14, maxRadius: range, color: '#ff7043', ttl: 0.45, maxTtl: 0.45 });
        this.effects.push({ type: 'shockwave', x: pcx, y: pcy, radius: 6, maxRadius: range * 0.6, color: '#ffd180', ttl: 0.3, maxTtl: 0.3 });
        this.spawnParticles(pcx, pcy, '#ff5722', 26, 2, 6, 2, 5, 0.04);
        this._showFloatingText('烈焰新星!', pcx, pcy - 28, '#ff8a65');
        this.screenShake = 0.2;
        const fireR = range * 0.75;
        for (let k = 0; k < 6; k++) {
            this.pendingActions.push({ delay: 0.5 * (k + 1), fn: () => {
                this._hitAround(pcx, pcy, fireR, base * 0.35);
                this.effects.push({ type: 'ring', x: pcx, y: pcy, radius: fireR, color: '#ff6d00', ttl: 0.5, maxTtl: 0.5, rotation: k, rotSpeed: 1.5 });
                for (let j = 0; j < 4; j++) {
                    const a = Math.random() * Math.PI * 2, r = Math.random() * fireR;
                    this.spawnParticles(pcx + Math.cos(a) * r, pcy + Math.sin(a) * r, '#ff9100', 3, 0.5, 2, 2, 4, 0.02);
                }
            } });
        }
    }

    _mageRepulseEffect(skill) {
        const pcx = this.player.x + this.player.size / 2;
        const pcy = this.player.y + this.player.size / 2;
        const range      = this._aoe(skill.level >= 3 ? 210 : 160);
        // 击退力度:3级更强
        const pushForce  = skill.level >= 3 ? 220 : skill.level === 2 ? 180 : 140;
        const dmg        = this._computeAttackDamage(this.player.attack) * 1.0
                           * this._getSkillMultiplier(skill.level)
                           * (1 + (this.player.magePenetration || 0));
        const stunBonus  = this.player.mageStunBonus || 0; // 天赋"寒冰精通"复用:短暂僵直
        const particleCount = skill.level >= 3 ? 36 : 24;

        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const e = this.enemies[i];
            const ex = e.x + e.size / 2;
            const ey = e.y + e.size / 2;
            const dx = ex - pcx;
            const dy = ey - pcy;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist <= range) {
                // 距离越近推得越远(近处最多 pushForce,边缘衰减到 40%)
                const ratio = dist > 0 ? dist / range : 0;
                const actualPush = pushForce * (1 - ratio * 0.6);
                const nx = dist > 0 ? dx / dist : Math.random() - 0.5;
                const ny = dist > 0 ? dy / dist : Math.random() - 0.5;
                e.x += nx * actualPush;
                e.y += ny * actualPush;
                // 短暂僵直(天赋加成),让玩家有反应时间
                if (stunBonus > 0) e.stunTimer = Math.max(e.stunTimer, 0.4 + stunBonus * 0.2);
                this._dealDamage(e, dmg);
                // 击退粒子
                this.spawnParticles(ex, ey, '#80d8ff', 4, 2, 5, 1, 3, 0.06);
            }
        }
        // 魔王:推力减半,短暂减速
        if (this.boss && this.bossState === 'active') {
            const bx = this.boss.x + this.boss.size / 2;
            const by = this.boss.y + this.boss.size / 2;
            const dx = bx - pcx, dy = by - pcy;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist <= range + this.boss.size / 2) {
                const nx = dist > 0 ? dx / dist : 0;
                const ny = dist > 0 ? dy / dist : 0;
                this.boss.x += nx * pushForce * 0.35;
                this.boss.y += ny * pushForce * 0.35;
                if (stunBonus > 0) this.boss.stunTimer = Math.min(1.0, stunBonus * 0.15);
                this._dealDamage(this.boss, dmg);
            }
        }

        // 视觉:扩散冲击波 + 放射线粒子
        this.effects.push({ type: 'shockwave', x: pcx, y: pcy, radius: 14, maxRadius: range, color: '#80d8ff', ttl: 0.45, maxTtl: 0.45 });
        this.effects.push({ type: 'shockwave', x: pcx, y: pcy, radius: 6,  maxRadius: range * 0.6, color: '#ffffff', ttl: 0.3, maxTtl: 0.3 });
        this.spawnBurstRing(pcx, pcy, range * 0.4, '#b3e5fc', particleCount);
        // 放射状光线
        for (let i = 0; i < particleCount; i++) {
            const angle = (i / particleCount) * Math.PI * 2;
            this.effects.push({
                type: 'iceShard',
                x: pcx, y: pcy,
                angle,
                length: 20 + Math.random() * 14,
                color: '#e1f5fe',
                ttl: 0.35, maxTtl: 0.35
            });
        }
        this._showFloatingText('斥力波！', pcx, pcy - 28, '#80d8ff');
        this.screenShake = 0.18;
    }

    _payMana(cost) {
        // 法师法力支付辅助:成功返回 true
        // 若蓝不够且开启"血魔契约",改用 2× 差额生命补足
        if (this.player.mana >= cost) { this.player.mana -= cost; return true; }
        if (this.player.mageBloodMagic) {
            const deficit = cost - this.player.mana;
            const hpCost = deficit * 2;
            if (this.player.currentHealth > hpCost + 1) {
                this.player.mana = 0;
                this.player.currentHealth -= hpCost;
                this._showFloatingText(`血魔 -${Math.ceil(hpCost)}`, this.player.x + this.player.size / 2, this.player.y - 20, '#ff1744');
                this.spawnHitParticles(this.player.x + this.player.size / 2, this.player.y + this.player.size / 2, '#ff1744', 6);
                return true;
            }
        }
        return false;
    }

    _assassinQ(skill) {
        const targets = this._findClosestEnemies(1);
        if (targets.length === 0) return;
        const target = targets[0];
        const tcx = target.x + target.size / 2;
        const tcy = target.y + target.size / 2;
        const pcx = this.player.x + this.player.size / 2;
        const pcy = this.player.y + this.player.size / 2;
        const dx = tcx - pcx, dy = tcy - pcy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        this.spawnParticles(pcx, pcy, '#aa44ff', 10, 2, 5, 2, 4, 0.05);
        if (dist > 0) {
            const nx = dx / dist, ny = dy / dist;
            // 落点钳在场地内(目标贴边时会被闪到场外)
            this.player.x = Math.max(0, Math.min(this.width - this.player.size, target.x - nx * (target.size + this.player.size * 0.5)));
            this.player.y = Math.max(0, Math.min(this.height - this.player.size, target.y - ny * (target.size + this.player.size * 0.5)));
        }
        const chargeMult = this._consumeAssassinCharge();
        const dmg = this._computeAttackDamage(this.player.attack) * 2.5 * this._getSkillMultiplier(skill.level) * (this.player.assassinSkillDmgMult || 1) * chargeMult;
        const p = this.player;
        const kills0 = p.killCount || 0;
        this._dealDamage(target, dmg);
        const newPcx = this.player.x + this.player.size / 2;
        const newPcy = this.player.y + this.player.size / 2;
        // 影舞者觉醒:落点范围斩击
        if (p.spec === 'shadow' && p.awakened) {
            const r = this._aoe(75);
            this._hitAround(newPcx, newPcy, r, dmg * 0.6);
            this.effects.push({ type: 'meleeSwing', x: newPcx, y: newPcy, radius: r, startAngle: 0, endAngle: Math.PI * 2, color: '#b388ff', ttl: 0.25, maxTtl: 0.25 });
        }
        // 刺客被动「收割」:Q 击杀返还一半冷却;影舞者直接刷新
        if ((p.killCount || 0) > kills0) {
            if (p.spec === 'shadow') {
                skill.cooldown = 0.15;
                if (p.awakened) p.hurtCooldown = Math.max(p.hurtCooldown, 0.6);
                this._showFloatingText('刷新!', newPcx, newPcy - 34, '#e1bee7');
            } else {
                skill.cooldown = skill.maxCooldown * 0.5;
            }
            this.spawnParticles(newPcx, newPcy, '#cc88ff', 8, 2, 4, 2, 4, 0.05);
            this.spawnSlashEffect(newPcx - 20, newPcy - 20, newPcx + 20, newPcy + 20, '#dd88ff');
            this.spawnSlashEffect(newPcx - 20, newPcy + 20, newPcx + 20, newPcy - 20, '#dd88ff');
            return;
        }
        this.spawnParticles(newPcx, newPcy, '#cc88ff', 8, 2, 4, 2, 4, 0.05);
        this.spawnSlashEffect(newPcx - 20, newPcy - 20, newPcx + 20, newPcy + 20, '#dd88ff');
        this.spawnSlashEffect(newPcx - 20, newPcy + 20, newPcx + 20, newPcy - 20, '#dd88ff');
        skill.cooldown = skill.maxCooldown;
    }

    _assassinE(skill) {
        const baseTargets = 3 + (this.player.assassinExtraTargets || 0);
        const targets = this._findClosestEnemies(baseTargets);
        if (targets.length === 0) return;
        const chargeMult = this._consumeAssassinCharge();
        for (let idx = 0; idx < targets.length; idx++) {
            const t = targets[idx];
            this.pendingActions.push({
                delay: idx * 0.1,
                fn: () => {
                    if (t.currentHealth <= 0) return;
                    const dmg = this._computeAttackDamage(this.player.attack) * 1.0 * this._getSkillMultiplier(skill.level) * (this.player.assassinSkillDmgMult || 1) * chargeMult;
                    this._dealDamage(t, dmg);
                    const tx = t.x + t.size / 2;
                    const ty = t.y + t.size / 2;
                    this.spawnSlashEffect(tx - 25, ty, tx + 25, ty, '#ffffff');
                    this.spawnSlashEffect(tx, ty - 25, tx, ty + 25, '#ffffff');
                    this.spawnParticles(tx, ty, '#ffffff', 6, 2, 4, 1, 3, 0.06);
                }
            });
        }
        skill.cooldown = skill.maxCooldown;
    }

    _archerQ(skill) {
        // 最后一发判定:在消耗前先看是不是最后一发
        const isLastArrow = this.player.arrows === 1;
        if (!this._consumeArrows(1)) return;
        const pcx = this.player.x + this.player.size / 2;
        const pcy = this.player.y + this.player.size / 2;
        const targets = this._findClosestEnemies(1);
        let angle = 0;
        const aim = this.player._aim;
        if (aim && !(targets.length && this._inAimCone(targets[0]))) {
            angle = Math.atan2(aim[1], aim[0]);   // 穿透箭:扇形内没敌人就照瞄准方向射
        } else if (targets.length > 0) {
            const t = targets[0];
            angle = Math.atan2(t.y + t.size / 2 - pcy, t.x + t.size / 2 - pcx);
        }
        const speed = 12;
        const lastArrowMult = isLastArrow ? 2 : 1;
        const sniper = this.player.spec === 'sniper';
        const dmg = this._computeAttackDamage(this.player.attack) * 1.8 * this._getSkillMultiplier(skill.level) * (this.player.archerSkillDmgMult || 1) * lastArrowMult * (sniper ? 1.6 : 1);
        // 神射手觉醒:扇形 3 支
        const angles = sniper && this.player.awakened ? [angle - 0.2, angle, angle + 0.2] : [angle];
        for (const a of angles) {
            const arrow = new PiercingArrow(pcx - 4, pcy - 4, Math.cos(a) * speed, Math.sin(a) * speed, dmg, this);
            arrow.owner = this.player;
            if (sniper) arrow.eliteMult = 1.5;
            this.projectiles.push(arrow);
        }
        const arrowColor = isLastArrow ? '#ffeb3b' : '#aaff44';
        this.effects.push({ type: 'arrow', x: pcx, y: pcy, angle, length: isLastArrow ? 42 : 30, color: arrowColor, ttl: 0.3, maxTtl: 0.3 });
        this.spawnParticles(pcx, pcy, isLastArrow ? '#fff176' : '#ccff88', isLastArrow ? 16 : 8, 2, 5, 2, 4, 0.05);
        if (isLastArrow) this._showFloatingText('最后一发!', pcx, pcy - 30, '#ffeb3b');
        skill.cooldown = skill.maxCooldown;
    }

    _archerE(skill) {
        const ranger = this.player.spec === 'ranger';
        const free = ranger && this.player.awakened;   // 游侠觉醒:箭雨不耗箭
        if (!free && !this._consumeArrows(3)) return;
        if (free && this.player.reloadTimer > 0) {
            this._showFloatingText('装填中', this.player.x + this.player.size / 2, this.player.y - 20, '#ff5252');
            return;
        }
        const pcx = this.player.x + this.player.size / 2;
        const pcy = this.player.y + this.player.size / 2;
        const count = Math.round((skill.level >= 3 ? 14 : 10) * (free ? 1.5 : 1));
        const dmg = this._computeAttackDamage(this.player.attack) * 0.8 * this._getSkillMultiplier(skill.level) * (this.player.archerSkillDmgMult || 1);
        // 游侠:每支箭锁定附近一个敌人(轮流分配),落下时追到它当前位置
        const pool = ranger ? this._findClosestEnemies(8).filter(e => Math.hypot(e.x - pcx, e.y - pcy) < 340) : [];
        for (let i = 0; i < count; i++) {
            this.pendingActions.push({
                delay: i * 0.1,
                fn: () => {
                    const lock = pool.length ? pool[i % pool.length] : null;
                    const alive = lock && (lock === this.boss ? this.bossState === 'active' : this.enemies.includes(lock));
                    const tx = alive ? lock.x + lock.size / 2 + (Math.random() - 0.5) * 10 : pcx + (Math.random() - 0.5) * 200;
                    const ty = alive ? lock.y + lock.size / 2 + (Math.random() - 0.5) * 10 : pcy + (Math.random() - 0.5) * 200;
                    this.effects.push({ type: 'arrow', x: tx, y: ty - 120, angle: Math.PI / 2, length: 24, color: '#aaff44', ttl: 0.25, maxTtl: 0.25 });
                    this.pendingActions.push({
                        delay: 0.2,
                        fn: () => {
                            this.spawnHitParticles(tx, ty, '#aaff44', 6);
                            this.effects.push({ type: 'shockwave', x: tx, y: ty, radius: 5, maxRadius: 30, color: '#aaff44', ttl: 0.2, maxTtl: 0.2 });
                            this._hitAround(tx, ty, this._aoe(25), dmg);
                        }
                    });
                }
            });
        }
        skill.cooldown = skill.maxCooldown;
    }

    _paladinQ(skill) {
        if (this.player.faith < 20) return;
        const targets = this._findClosestEnemies(1);
        if (targets.length === 0) return;
        const target = targets[0];
        this.player.faith -= 20;
        const dmg = this._computeAttackDamage(this.player.attack) * 2 * this._getSkillMultiplier(skill.level) * (this.player.paladinSkillDmgMult || 1);
        const tcx = target.x + target.size / 2;
        const tcy = target.y + target.size / 2;
        if (this.player.spec === 'crusader') {
            // 审判之锤:目标周围 90 内全部晕眩
            const r = this._aoe(90);
            this._hitAround(tcx, tcy, r, dmg, e => { e.stunTimer = Math.max(e.stunTimer || 0, e === this.boss ? 0.8 : 1.5); });
            this.effects.push({ type: 'ring', x: tcx, y: tcy, radius: r, color: '#ffe082', ttl: 0.5, maxTtl: 0.5, rotation: 0, rotSpeed: 3 });
            this._showFloatingText('审判!', tcx, tcy - 40, '#ffd700');
        } else {
            this._dealDamage(target, dmg);
            target.stunTimer = 1.5;
        }
        this.effects.push({ type: 'shockwave', x: tcx, y: tcy, radius: 5, maxRadius: skill.level >= 3 ? 100 : 70, color: '#ffd700', ttl: 0.5, maxTtl: 0.5 });
        this.spawnParticles(tcx, tcy - 30, '#ffd700', skill.level >= 3 ? 20 : 14, 1, 4, 2, 5, 0.03);
        this.spawnParticles(tcx, tcy, '#fff8dc', 8, 0.5, 2, 1, 3, 0.04);
        skill.cooldown = skill.maxCooldown;
    }

    _paladinE(skill) {
        if (this.player.faith < 50) return;
        this.player.faith -= 50;
        this.player.holyAuraActive = true;
        this.player.holyAuraTimer = 5 + (this.player.paladinAuraDurationBonus || 0);
        const pcx = this.player.x + this.player.size / 2;
        const pcy = this.player.y + this.player.size / 2;
        const auraR = this._auraRadius(this.player);
        this.effects.push({ type: 'holyAura', x: pcx, y: pcy, radius: auraR, color: '#ffd700', ttl: 0.6, maxTtl: 0.6, pulse: 5 });
        this.spawnBurstRing(pcx, pcy, auraR, '#ffd700', skill.level >= 3 ? 24 : 16);
        skill.cooldown = skill.maxCooldown;
    }
    
    shoot() {
        const cls = this.player.class;
        // 圣骑士:近身圣锤(没有远程普攻)
        if (cls === 'paladin') { this._paladinHammer(); return; }
        // 战士:近战光环(范围伤害)
        if (cls === 'warrior') {
            this._warriorMeleeAttack();
            return;
        }
        // 其它职业:正常发射投射物(候选包含魔王)
        const closest = this._findClosestTarget();
        if (!closest) return;

        const cx = this.player.x + this.player.size / 2;
        const cy = this.player.y + this.player.size / 2;
        const dx = closest.x + closest.size / 2 - cx;
        const dy = closest.y + closest.size / 2 - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist <= 0) return;

        // 弓手:疾矢(投射物速度倍率),多重射击(扇形多发),箭无虚发(穿透)
        const baseSpeed = 7;
        const speed = baseSpeed * (cls === 'archer' ? (this.player.archerProjSpeedMult || 1) : 1);
        // 弓手专属:自动攻击投射物伤害倍率(强弓/猎手本能/狩猎专精天赋)
        const archerAutoMult = cls === 'archer' ? (this.player.archerAutoDmgMult || 1) : 1;
        const dmg = this._computeAttackDamage(this.player.attack) * (this.player.autoAttackDmgMult || 1) * archerAutoMult;

        // 法师 Q 开关:激活时附加法术伤害并消耗法力(支持血魔契约)
        let mageBonusDmg = 0;
        if (cls === 'mage' && this.player.qToggleActive) {
            const cost = Math.max(1, Math.ceil(this.player.maxMana * 0.10 * (this.player.mageQCostMult || 1)));
            if (this._payMana(cost)) {
                mageBonusDmg = this.player.maxMana * 1.5;
            } else {
                // 蓝不够且血魔契约也不满足 → 自动关闭
                this.player.qToggleActive = false;
            }
        }

        // 法师被动「奥术充能」:每第 4 发普攻是会爆炸的奥术弹;炎术师每发都是爆裂火球
        let kind = 0, splash = 0, freeze = 0, orbMult = 1;
        if (cls === 'mage') {
            const p = this.player;
            p.arcaneCount = (p.arcaneCount || 0) + 1;
            if (p.spec === 'pyro') { kind = 4; splash = this._aoe(50); }
            if (p.arcaneCount % 4 === 0) {
                kind = 3; splash = this._aoe(60); orbMult = 1.3;
                if (p.spec === 'frost') freeze = 1;
            }
            if (p.spec === 'pyro' && mageBonusDmg) mageBonusDmg *= 1.3;
        }

        // 技能石「多重投射」:额外 +2 发,每发伤害打折
        const multi = this._gv(this.player, 'a', 'multi');
        const fanCount = (cls === 'archer' ? (this.player.archerMultiShot || 1) : 1) + (multi ? 2 : 0);
        const pierce = cls === 'archer' ? (this.player.archerPiercing || 0) : 0;
        // 扇形角度散布
        const spread = fanCount > 1 ? (Math.min(30, 7.5 * (fanCount - 1)) * Math.PI / 180) : 0; // 2 发 ±7.5°,最多 ±30°
        const baseAngle = Math.atan2(dy, dx);
        for (let i = 0; i < fanCount; i++) {
            // 等分散布
            const offset = fanCount === 1 ? 0 : (-spread + (2 * spread) * (i / (fanCount - 1)));
            const ang = baseAngle + offset;
            const vx = Math.cos(ang) * speed;
            const vy = Math.sin(ang) * speed;
            const proj = new Projectile(cx - 5, cy - 5, vx, vy, (dmg + mageBonusDmg) * orbMult * (multi || 1));
            proj.owner = this.player;
            proj.bonusMagicDmg = mageBonusDmg;
            if (kind) proj.setKind(kind);
            proj.splash = splash;
            proj.freeze = freeze;
            if (pierce > 0) {
                proj.isPiercing = true;
                proj.pierceRemaining = pierce;
                proj.hitEnemies = new Set();
            }
            this.projectiles.push(proj);
        }
    }

    // 圣骑士普攻「圣锤」:砸向身边的敌人,每命中一个回复 3 信念;审判者伤害 +50%,觉醒后每第 4 锤召唤圣光柱
    _paladinHammer() {
        const p = this.player;
        const pcx = p.x + p.size / 2, pcy = p.y + p.size / 2;
        const range = this._aoe(75);
        const near = this._findClosestTarget();
        if (!near || Math.hypot(near.x + near.size / 2 - pcx, near.y + near.size / 2 - pcy) > range + near.size / 2) return;
        let dmg = this._computeAttackDamage(p.attack) * 0.9 * (p.autoAttackDmgMult || 1) * (p.spec === 'crusader' ? 1.5 : 1);
        // 守护者「以盾为锤」:越坦打得越疼
        if (p.spec === 'protector') dmg += p.maxHealth * 0.05 + p.shield * 0.5;
        const hits = this._hitAround(pcx, pcy, range, dmg);
        p.faith = Math.min(p.maxFaith, p.faith + 3 * hits);
        this.effects.push({ type: 'meleeSwing', x: pcx, y: pcy, radius: range, startAngle: 0, endAngle: Math.PI * 2, color: '#ffd54f', ttl: 0.22, maxTtl: 0.22 });
        if (p.spec === 'crusader' && p.awakened) {
            p.hammerCount = (p.hammerCount || 0) + 1;
            if (p.hammerCount % 4 === 0) {
                const tx = near.x + near.size / 2, ty = near.y + near.size / 2;
                this._hitAround(tx, ty, 70, this._computeAttackDamage(p.attack) * 3 * (p.paladinSkillDmgMult || 1));
                this.effects.push({ type: 'holyAura', x: tx, y: ty, radius: 70, color: '#fff59d', ttl: 0.5, maxTtl: 0.5, pulse: 3 });
                this.effects.push({ type: 'shockwave', x: tx, y: ty, radius: 8, maxRadius: 80, color: '#ffd700', ttl: 0.4, maxTtl: 0.4 });
                for (let k = 0; k < 4; k++) {
                    this.effects.push({ type: 'arrow', x: tx + (k - 1.5) * 12, y: ty - 90, angle: Math.PI / 2, length: 70, color: '#fff8e1', ttl: 0.3, maxTtl: 0.3 });
                }
                this.spawnParticles(tx, ty, '#ffe082', 16, 1, 4, 2, 5, 0.03);
                this._showFloatingText('圣光柱', tx, ty - 40, '#ffd700');
            }
        }
    }

    _warriorMeleeAttack() {
        const pcx = this.player.x + this.player.size / 2;
        const pcy = this.player.y + this.player.size / 2;
        const range = this._aoe(80);
        const baseDmg = this._computeAttackDamage(this.player.attack) * (this.player.autoAttackDmgMult || 1);
        let hit = false, hitCount = 0;
        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const e = this.enemies[i];
            const ex = e.x + e.size / 2;
            const ey = e.y + e.size / 2;
            const dx = ex - pcx, dy = ey - pcy;
            if (Math.sqrt(dx * dx + dy * dy) <= range) {
                this._dealDamage(e, baseDmg);
                hit = true;
                hitCount++;
            }
        }
        // 战士被动:近战每命中一个敌人回复 1% 生命(每次最多 3 个)
        if (hitCount) this.player.heal(this.player.maxHealth * 0.01 * Math.min(3, hitCount));
        // 范围内的魔王也吃伤
        if (this.boss && this.bossState === 'active') {
            const bcx = this.boss.x + this.boss.size / 2;
            const bcy = this.boss.y + this.boss.size / 2;
            const dx = bcx - pcx, dy = bcy - pcy;
            if (Math.sqrt(dx * dx + dy * dy) <= range + this.boss.size / 2) {
                this._dealDamage(this.boss, baseDmg);
                hit = true;
            }
        }
        // 视觉:挥砍光环(浅红色弧)
        this.effects.push({
            type: 'meleeSwing',
            x: pcx, y: pcy, radius: range,
            startAngle: 0, endAngle: Math.PI * 2,
            color: hit ? '#ff7043' : '#bf6040',
            ttl: 0.22, maxTtl: 0.22
        });
    }

    // 攻击伤害最终结算:叠加暴怒(损血)/战士血怒(怒气)/嗜血战意(满怒)等加成
    _computeAttackDamage(base) {
        let dmg = base;
        // 限时装备的攻击倍率
        const gear = this.player.gear && GEARS[this.player.gear.type];
        if (gear && gear.atkMult) dmg *= gear.atkMult;
        if (this.player.blessTimer > 0) dmg *= Game.BLESS.dmg;
        // 暴怒天赋:每损失 10% 生命,攻击力 +5%
        if (this.player.wrathBonus) {
            const lost = 1 - (this.player.currentHealth / this.player.maxHealth);
            const stacks = Math.floor(lost * 10);
            dmg *= (1 + stacks * 0.05);
        }
        // 战士:血怒(每 20 怒气 +5% 攻击,× 已叠层数)
        if (this.player.class === 'warrior') {
            const bloodStacks = this.player.bloodRageStacks || 0;
            if (bloodStacks > 0) {
                const rageBands = Math.floor(this.player.rage / 20);
                dmg *= (1 + rageBands * 0.05 * bloodStacks);
            }
            // 嗜血战意:怒气 ≥70 时所有伤害 +30%
            if (this.player.warriorRavenous && this.player.rage >= 70) dmg *= 1.3;
        }
        return dmg;
    }

    // 统一击杀结算入口:替代旧的 score+=10; exp+=5; checkLevelUp() 三连
    _onEnemyKilled(e) {
        if (e) {
            this._flushDn(e, true); // 致命一击的数字(尸体马上就从 enemies 里移除了)
            // 碎裂:方块裂成四块飞散(特效随快照同步给 guest)
            this.effects.push({ type: 'shatter', x: e.x + e.size / 2, y: e.y + e.size / 2, s: e.size, color: e.color,
                                ttl: 0.5, maxTtl: 0.5 });
        }
        // 分裂者碎成 3 块碎片向外迸开(下一帧再加进 enemies,避免调用方遍历时改数组)
        if (e && e.type === 'splitter' && !e.split) {
            e.split = true;
            this.pendingActions.push({ delay: 0.02, ctx: null, fn: () => this._splitEnemy(e) });
        }
        // 被击杀的自爆者殉爆(稍等一帧,避免在调用方遍历 enemies 时改动数组)
        if (e && e.type === 'bomber' && !e.exploded) {
            e.exploded = true;
            this.pendingActions.push({ delay: 0.05, fn: () => this._bomberExplode(e, false) });
        }
        Sound.play('kill');
        // 击杀计数随玩家快照下发,本机据此触发击杀顿帧/震动(guest 也能拿到自己的击杀反馈)
        this.player.killCount = (this.player.killCount || 0) + 1;
        const horde = this.event && this.event.type === 'horde' ? 2 : 1;
        const comboMult = this._registerCombo(e);
        this.score += Math.round(10 * (this.scoreMult || 1) * horde * comboMult * diffDef(this.diffMode).score);
        this.exp += 5 * horde;
        if (e && e.type === 'treasure') this._treasureReward(e);
        else if (e && !e.elite && Math.random() < 0.006) this._dropGem(e.x, e.y);
        // 毒刃觉醒:中毒的敌人死亡时毒雾爆发
        const vo = e && e.poison > 0 && e.poisonOwner;
        if (vo && vo.spec === 'venom' && vo.awakened) {
            const cx = e.x + e.size / 2, cy = e.y + e.size / 2;
            for (const o of this.enemies) {
                if (o !== e && Math.hypot(o.x + o.size / 2 - cx, o.y + o.size / 2 - cy) <= 90) this._applyPoison(o, vo, 3);
            }
            this.effects.push({ type: 'shockwave', x: cx, y: cy, radius: 6, maxRadius: 90, color: '#76ff03', ttl: 0.35, maxTtl: 0.35 });
        }
        if (e && e.elite) this._eliteReward(e);
        // 技能石「尸爆」:当前技能位打死的敌人原地爆炸(爆炸本身不再带宝石效果)
        const boom = e && this._ctx && this._gv(this.player, this._ctx.slot, 'explode');
        if (boom) {
            const cx = e.x + e.size / 2, cy = e.y + e.size / 2, dmg = e.maxHealth * boom, r = this._aoe(70);
            this.pendingActions.push({ delay: 0.08, ctx: null, fn: () => {
                this._hitAround(cx, cy, r, dmg);
                this.effects.push({ type: 'shockwave', x: cx, y: cy, radius: 6, maxRadius: r, color: '#b388ff', ttl: 0.3, maxTtl: 0.3 });
                this.spawnParticles(cx, cy, '#d1c4e9', 10, 1.5, 4, 2, 4, 0.05);
            } });
        }
        if (this.player.lifeStealPerKill) {
            this.player.heal(this.player.lifeStealPerKill);
        }
        this.player.gainRage(20);
        this.checkLevelUp();
    }
    
    // 连杀:击杀者(this.player,替 guest 结算时已切换)累加连杀并刷新计时,返回分数倍率。
    // 每 10 连杀 +10% 击杀分数(最多 +50%),到达里程碑时额外奖励分数并飘字
    _registerCombo(e) {
        const p = this.player;
        p.combo = (p.comboTimer > 0 ? p.combo : 0) + 1;
        p.comboTimer = Game.COMBO_WINDOW;
        p.frenzyTier = Math.min(5, Math.floor(p.combo / 10));
        if (p.combo > p.maxCombo) p.maxCombo = p.combo;
        const n = p.combo;
        if (Game.comboMilestone(n)) {
            this.score += Math.round(n * 5 * (this.scoreMult || 1));
            const cx = p.x + p.size / 2, cy = p.y;
            this.effects.push({ type: 'floatText', x: cx, y: cy - 26, text: `${n} 连杀! +${Math.round(n * 5 * (this.scoreMult || 1))}`,
                                color: n >= 100 ? '#ff4081' : n >= 50 ? '#ffab40' : '#ffd740', ttl: 1.1, maxTtl: 1.1, size: n >= 50 ? 20 : 16 });
            this.effects.push({ type: 'shockwave', x: cx, y: p.y + p.size / 2, radius: 8, maxRadius: 70, color: '#ffd740', ttl: 0.35, maxTtl: 0.35 });
        }
        return 1 + Math.min(0.5, Math.floor(n / 10) * 0.1);
    }

    checkLevelUp() {
        if (this._actingAs) return; // 替 guest 施法期间推迟,_runAsPlayer 结束后补结算
        if (this.exp >= this.expToNext) {
            this.exp -= this.expToNext;
            this.level++;
            this.expToNext = Math.floor(this.expToNext * 1.5 * (this.expGrowthMult || 1));
            this.player.speed += 0.2;
            
            // 每次升级获得1点潜能点
            this.player.addPotentialPoints(1);
            
            if (this.level % 3 === 0) {
                this.life = Math.min(this.life + 1, this.maxLife);
            }
            
            // 升级后自动暂停游戏
            this.isPaused = true;
            
            // 职业选择(3 级) / 进阶专精 / 觉醒 优先于天赋菜单,选完后再分配潜能点
            const mode = this._pendingClassMenu();
            if (mode) this.showClassSelection(mode);
            else this.showPotentialMenu();
        }
    }

    // 当前等级下该弹出的职业菜单:'class' 选职业 / 'spec' 进阶 / 'awaken' 觉醒 / null
    _pendingClassMenu() {
        const p = this.player;
        if (!p.class) return this.level >= 3 ? 'class' : null;
        if (!p.spec) return this.level >= SPEC_LEVEL ? 'spec' : null;
        if (!p.awakened) return this.level >= AWAKEN_LEVEL ? 'awaken' : null;
        return null;
    }

    showClassSelection(mode = 'class') {
        this.isPaused = true;
        this.classMenuMode = mode;
        this.showingClassSelection = true;
    }
    
    renderClassSelection() {
        if (!this.showingClassSelection) return;
        if (this.classMenuMode === 'spec' || this.classMenuMode === 'awaken') { this._renderSpecSelection(); return; }
        this.buttons = [];
        const ctx = this.ctx;
        const W = this._menu.w, H = this._menu.h;
        const portrait = W < H || W < 520;

        // 背景
        const bgGrad = ctx.createRadialGradient(W/2, H/2, 0, W/2, H/2, W * 0.8);
        bgGrad.addColorStop(0, 'rgba(8,12,30,0.97)');
        bgGrad.addColorStop(1, 'rgba(0,0,0,0.99)');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, W, H);

        // 标题
        const titleFS = Math.min(24, W * 0.055);
        ctx.save();
        ctx.shadowBlur = 22; ctx.shadowColor = '#00c8ff';
        ctx.fillStyle = '#00e5ff';
        ctx.font = `bold ${titleFS}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText('选择职业', W / 2, H * 0.03);
        ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(180,220,255,0.55)';
        ctx.font = `${portrait ? 13 : Math.min(11, W * 0.025)}px Arial`;
        ctx.fillText(`点击卡片选择  ·  ${SPEC_LEVEL} 级进阶专精、${AWAKEN_LEVEL} 级觉醒`, W / 2, H * 0.03 + titleFS + 4);
        ctx.restore();

        // 职业数据
        const classDefs = [
            {
                choice: 1, name: '战士', icon: '⚔', color: '#ff6b3a',
                tag: '近战  高攻  怒气',
                tagColor: '#ff8a65',
                flavor: '被动·战意：怒气越满越抗揍(最多减伤30%)，近战命中回血',
                stats: ['攻击 +10  防御 -5  生命 +20', '近战范围自动攻击'],
                q: { name: '旋风斩', cd: '3s', desc: '消耗30怒气，范围斩击周围敌人' },
                e: { name: '盾击',   cd: '5s', desc: '消耗50怒气，把最近的敌人拽到身前并重创' }
            },
            {
                choice: 2, name: '法师', icon: '✦', color: '#4ecdc4',
                tag: '远程  法力  爆发',
                tagColor: '#80deea',
                flavor: '被动·奥术充能：每第 4 发普攻是会爆炸的奥术弹',
                stats: ['法力 +10  回复 +2/s', '远程自动攻击，Q开关附魔'],
                q: { name: '魔力涌注', cd: '切换', desc: '开启后每发普攻附加法术伤害，消耗法力' },
                e: { name: '斥力波',   cd: '8s',  desc: '消耗3法力，将周围敌人向四周强力推开并造成伤害' }
            },
            {
                choice: 3, name: '刺客', icon: '☄', color: '#aa66ff',
                tag: '移速  蓄力  爆发',
                tagColor: '#ce93d8',
                flavor: '被动·收割：20% 暴击，闪现斩击杀返还一半冷却；移动积累蓄力',
                stats: ['移动速度 +1.5', '远程自动攻击'],
                q: { name: '闪现斩', cd: '4s', desc: '瞬移至目标身旁并造成高额伤害' },
                e: { name: '连刺',   cd: '6s', desc: '连续攻击3个最近敌人，依次结算' }
            },
            {
                choice: 4, name: '弓手', icon: '◎', color: '#aaff44',
                tag: '远程  高投射  箭矢',
                tagColor: '#c6ef6b',
                flavor: '被动·专注：站定不动时普攻速度 +43%；箭矢用尽需装填',
                stats: ['攻击 +8  防御 -5', '普攻伤害×1.3，可多重射击'],
                q: { name: '穿透箭', cd: '3s', desc: '消耗1箭，发射穿透敌阵的强力箭矢' },
                e: { name: '箭雨',   cd: '8s', desc: '消耗3箭，在大范围内降下密集箭雨' }
            },
            {
                choice: 5, name: '圣骑士', icon: '✟', color: '#ffd700',
                tag: '高防  护盾  信念',
                tagColor: '#ffe082',
                flavor: '被动·圣盾爆发：护盾被打破时震晕周围敌人；圣锤近身普攻',
                stats: ['防御 +10  攻击 -5  生命 +30', '护盾再生，圣锤命中回信念'],
                q: { name: '圣光打击', cd: '4s',  desc: '消耗20信念，重击目标并短暂晕眩' },
                e: { name: '神圣光环', cd: '12s', desc: '消耗50信念，持续治愈自身并灼烧周围敌人' }
            }
        ];

        // 卡片布局
        const n = classDefs.length;
        let cardW, cardH, cols, rows, startX, startY, gapX, gapY;
        if (portrait) {
            // 竖屏:2列3行(最后一行居中)
            cols = 2; rows = 3;
            gapX = Math.min(10, W * 0.02); gapY = Math.min(8, H * 0.015);
            cardW = (W - gapX * 3) / 2;
            cardH = Math.min(300, (H * 0.86 - gapY * (rows + 1)) / rows);
            startX = gapX;
            startY = H * 0.11;
        } else {
            // 横屏:5列1行 或 按宽度降级到2行
            const maxCardW = Math.min(138, (W - 12 * 6) / 5);
            if (maxCardW >= 100) {
                cols = 5; rows = 1;
                cardW = maxCardW;
                cardH = Math.min(240, H * 0.72);
                gapX = (W - cardW * 5) / 6;
                gapY = 0;
                startX = gapX;
                startY = H * 0.14;
            } else {
                cols = 3; rows = 2;
                gapX = Math.min(10, W * 0.02); gapY = Math.min(10, H * 0.02);
                cardW = (W - gapX * 4) / 3;
                cardH = Math.min(160, (H * 0.8 - gapY * 3) / 2);
                startX = gapX;
                startY = H * 0.13;
            }
        }

        // 竖屏卡片更宽更高,字号上限放大
        const fk = portrait ? 1.35 : 1;
        const nameFS   = Math.min(15 * fk, cardW * 0.13);
        const tagFS    = Math.min(10 * fk, cardW * 0.085);
        const statFS   = Math.min(10 * fk, cardW * 0.083);
        const skillFS  = Math.min(10 * fk, cardW * 0.085);
        const descFS   = Math.min(9 * fk,  cardW * 0.075);
        const rarityColor = { common: '#90a4ae', rare: '#42a5f5', epic: '#ba68c8' };

        classDefs.forEach((cls, i) => {
            let col = i % cols;
            let row = Math.floor(i / cols);
            // 最后一行若只剩一个,居中
            const lastRowCount = n % cols || cols;
            if (row === rows - 1 && lastRowCount < cols) {
                col = i - row * cols;
                const totalW = lastRowCount * cardW + (lastRowCount - 1) * gapX;
                var bx = (W - totalW) / 2 + col * (cardW + gapX);
            } else {
                var bx = startX + col * (cardW + gapX);
            }
            const by = startY + row * (cardH + gapY);

            ctx.save();
            // 卡片背景
            const cg = ctx.createLinearGradient(bx, by, bx, by + cardH);
            cg.addColorStop(0, 'rgba(18,26,52,0.97)');
            cg.addColorStop(1, 'rgba(8,12,28,0.97)');
            ctx.fillStyle = cg;
            ctx.shadowBlur = 18; ctx.shadowColor = cls.color;
            roundRect(ctx, bx, by, cardW, cardH, 10);
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.strokeStyle = `${cls.color}cc`;
            ctx.lineWidth = 2;
            roundRect(ctx, bx, by, cardW, cardH, 10);
            ctx.stroke();

            let oy = by + 10;

            // 图标 + 名称
            ctx.shadowBlur = 12; ctx.shadowColor = cls.color;
            ctx.fillStyle = cls.color;
            ctx.font = `bold ${Math.min(22, cardW * 0.18)}px Arial`;
            ctx.textAlign = 'center'; ctx.textBaseline = 'top';
            ctx.fillText(cls.icon, bx + cardW / 2, oy);
            oy += Math.min(22, cardW * 0.18) + 4;

            ctx.shadowBlur = 8;
            ctx.font = `bold ${nameFS}px Arial`;
            ctx.fillText(cls.name, bx + cardW / 2, oy);
            oy += nameFS + 3;
            ctx.shadowBlur = 0;

            // 标签
            ctx.fillStyle = cls.tagColor;
            ctx.font = `${tagFS}px Arial`;
            ctx.fillText(cls.tag, bx + cardW / 2, oy);
            oy += tagFS + 4;

            // 特色描述
            ctx.fillStyle = 'rgba(200,232,255,0.8)';
            ctx.font = `${statFS}px Arial`;
            oy = this._wrapTextCenter(ctx, cls.flavor, bx + cardW / 2, oy, cardW - 10, statFS + 2) + 3;

            // 属性加成
            ctx.fillStyle = 'rgba(160,200,160,0.75)';
            ctx.font = `${statFS * 0.9}px Arial`;
            for (const st of cls.stats) {
                ctx.fillText(st, bx + cardW / 2, oy);
                oy += statFS + 1;
            }
            oy += 4;

            // 分隔线
            ctx.strokeStyle = `${cls.color}44`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(bx + 8, oy); ctx.lineTo(bx + cardW - 8, oy);
            ctx.stroke();
            oy += 5;

            // Q/E 技能
            for (const [key, sk] of [['Q', cls.q], ['E', cls.e]]) {
                ctx.fillStyle = key === 'Q' ? cls.color : 'rgba(200,200,255,0.9)';
                ctx.font = `bold ${skillFS}px Arial`;
                ctx.textAlign = 'left'; ctx.textBaseline = 'top';
                ctx.fillText(`[${key}] ${sk.name}`, bx + 8, oy);
                ctx.fillStyle = 'rgba(180,180,180,0.6)';
                ctx.font = `${skillFS * 0.85}px Arial`;
                ctx.fillText(`CD:${sk.cd}`, bx + cardW - 8 - ctx.measureText(`CD:${sk.cd}`).width, oy);
                oy += skillFS + 2;
                ctx.fillStyle = 'rgba(180,210,240,0.7)';
                ctx.font = `${descFS}px Arial`;
                this._wrapText(ctx, sk.desc, bx + 8, oy, cardW - 16, descFS + 2);
                const descLines = Math.ceil(ctx.measureText(sk.desc).width / (cardW - 16)) || 1;
                oy += (descFS + 2) * descLines + 4;
            }

            ctx.restore();

            // 注册命中区
            this.buttons.push({ x: bx, y: by, width: cardW, height: cardH, choice: cls.choice });
        });
    }
    
    handleClassChoice(choice) {
        if (this.classMenuMode === 'spec' || this.classMenuMode === 'awaken') { this._handleSpecChoice(choice); return; }
        const nameByChoice = { 1: 'warrior', 2: 'mage', 3: 'assassin', 4: 'archer', 5: 'paladin' };
        const name = nameByChoice[choice];
        if (!name) return;
        this._applyClassToPlayer(this.player, name);

        this.showingClassSelection = false;
        // Guest 模式：把职业选择发给 host
        if (this.mpMode === 'guest' && this.mpWs && this.mpWs.readyState === WebSocket.OPEN) {
            this.mpWs.send(JSON.stringify({ type: 'classChoose', choice: name }));
        }
        this._afterClassMenu();
    }

    // 职业/进阶/觉醒菜单关闭后:还有该弹的职业菜单就接着弹,否则分配潜能点或继续游戏
    _afterClassMenu() {
        this.showingClassSelection = false;
        const next = this._pendingClassMenu();
        if (next) this.showClassSelection(next);
        else if (this.player.potentialPoints > 0) this.showPotentialMenu();
        else this.isPaused = false;
        this.updateUI();
    }

    // 进阶(choice 1/2 = 专精)或觉醒(choice 1 = 确认)。guest 本地先应用,再经输入里的 stats.spec / stats.awk 告诉 host
    _handleSpecChoice(choice) {
        const p = this.player;
        if (this.classMenuMode === 'spec') {
            const def = (CLASS_SPECS[p.class] || [])[choice - 1];
            if (!def || p.spec) return;
            this._applySpec(p, def.id);
            this._announceClassUp(`进阶 · ${def.name}`);
        } else {
            if (choice !== 1 || p.awakened) return;
            this._awakenPlayer(p);
            const def = specDef(p);
            this._announceClassUp(`觉醒 · ${def ? def.name : ''}`);
        }
        this._afterClassMenu();
    }

    _announceClassUp(text) {
        const p = this.player;
        const cx = p.x + p.size / 2, cy = p.y + p.size / 2;
        const color = CLASS_COLORS[p.class] || '#ffffff';
        this._showFloatingText(text, cx, p.y - 30, color);
        this.effects.push({ type: 'shockwave', x: cx, y: cy, radius: 10, maxRadius: 140, color, ttl: 0.6, maxTtl: 0.6 });
        this.spawnBurstRing(cx, cy, 60, color, 28);
        Sound.play('levelUp');
    }

    // 进阶:记录专精并处理一次性属性变化(对任意 Player 生效;host 替 guest 应用时同样调用)
    _applySpec(p, id) {
        if (p.spec || !(CLASS_SPECS[p.class] || []).some(s => s.id === id)) return;
        p.spec = id;
        if (id === 'guardian') { p.defense += 8; p.rageOnHurtBonus = (p.rageOnHurtBonus || 0) + 15; }
        else if (id === 'protector') p.shieldCapRatio = (p.shieldCapRatio || 0.10) * 2;
        else if (id === 'ranger') p.archerMultiShot = (p.archerMultiShot || 1) + 2;
    }

    // 觉醒:Q/E 各升 1 级 + 回满生命,专精的觉醒效果由技能代码读 p.awakened
    _awakenPlayer(p) {
        if (!p.spec || p.awakened) return;
        p.awakened = true;
        for (const [sk, key] of [[p.skillQ, 'q'], [p.skillE, 'e']]) {
            if (sk.level < 3) sk.level++;
            if (CLASS_BASE_CD[p.class]) sk.maxCooldown = this._skillMaxCd(p, key);
        }
        p.currentHealth = p.maxHealth;
        if (p.spec === 'protector') p.paladinAuraDurationBonus = (p.paladinAuraDurationBonus || 0) + 3;
    }

    // 进阶(两张专精卡)/ 觉醒(一张确认卡)界面,复用职业选择的输入通道(buttons + handleClassChoice)
    _renderSpecSelection() {
        this.buttons = [];
        const ctx = this.ctx;
        const W = this._menu.w, H = this._menu.h;
        const p = this.player;
        const awaken = this.classMenuMode === 'awaken';
        const color = CLASS_COLORS[p.class] || '#00e5ff';
        const list = awaken ? [specDef(p)].filter(Boolean) : (CLASS_SPECS[p.class] || []);

        const bg = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W * 0.8);
        bg.addColorStop(0, 'rgba(8,12,30,0.95)');
        bg.addColorStop(1, 'rgba(0,0,0,0.98)');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, W, H);

        const titleFS = Math.min(32, W * 0.06);
        ctx.save();
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.shadowBlur = 22; ctx.shadowColor = color;
        ctx.fillStyle = color;
        ctx.font = `bold ${titleFS}px Arial`;
        ctx.fillText(awaken ? `${CLASS_NAMES[p.class]} · 觉醒` : `${CLASS_NAMES[p.class]} · 职业进阶`, W / 2, H * 0.05);
        ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(200,225,255,0.65)';
        ctx.font = `${Math.min(17, W * 0.03)}px Arial`;
        ctx.fillText(awaken ? `达到 ${AWAKEN_LEVEL} 级:专精觉醒,Q/E 技能各升 1 级并回满生命`
                            : `达到 ${SPEC_LEVEL} 级:选择一个专精方向(本局不可更改)`, W / 2, H * 0.05 + titleFS + 8);
        ctx.restore();

        const portrait = W < H || W < 520;
        const n = list.length;
        const gap = 18;
        let cardW, cardH;
        if (portrait) { cardW = Math.min(360, W * 0.9); cardH = Math.min(240, (H * 0.74 - gap) / Math.max(1, n)); }
        else { cardW = Math.min(330, (W - gap * (n + 1)) / n); cardH = Math.min(280, H * 0.6); }
        const totalW = portrait ? cardW : n * cardW + (n - 1) * gap;
        const totalH = portrait ? n * cardH + (n - 1) * gap : cardH;
        const x0 = (W - totalW) / 2, y0 = Math.max(H * 0.17, (H - totalH) / 2 + H * 0.05);
        const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 300);

        list.forEach((sp, i) => {
            const bx = portrait ? x0 : x0 + i * (cardW + gap);
            const by = portrait ? y0 + i * (cardH + gap) : y0;
            ctx.save();
            const cg = ctx.createLinearGradient(bx, by, bx, by + cardH);
            cg.addColorStop(0, 'rgba(22,30,58,0.97)');
            cg.addColorStop(1, 'rgba(8,12,28,0.97)');
            ctx.fillStyle = cg;
            ctx.shadowBlur = 14 + pulse * 10; ctx.shadowColor = color;
            roundRect(ctx, bx, by, cardW, cardH, 12);
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.strokeStyle = color; ctx.lineWidth = 2;
            roundRect(ctx, bx, by, cardW, cardH, 12);
            ctx.stroke();

            const pad = 14;
            // 手机上整个 800×600 世界会缩小一半,字号按卡片尺寸放大,保证竖屏也看得清
            const iconFS = Math.min(40, cardH * 0.13);
            const nameFS = Math.min(26, cardW * 0.08);
            const descFS = Math.min(19, cardW * 0.058);
            let oy = by + pad;
            ctx.textBaseline = 'top';
            if (portrait) {
                // 竖屏:图标在左,文字在右,节省高度
                ctx.textAlign = 'center';
                ctx.fillStyle = color;
                ctx.font = `${iconFS}px Arial`;
                ctx.fillText(sp.icon, bx + pad + iconFS / 2, oy);
                ctx.textAlign = 'left';
                ctx.fillStyle = color;
                ctx.font = `bold ${nameFS}px Arial`;
                ctx.fillText(sp.name, bx + pad * 2 + iconFS, oy + (iconFS - nameFS) / 2);
                oy += iconFS + 8;
            } else {
                ctx.textAlign = 'center';
                ctx.fillStyle = color;
                ctx.font = `${iconFS}px Arial`;
                ctx.fillText(sp.icon, bx + cardW / 2, oy);
                oy += iconFS + 8;
                ctx.fillStyle = color;
                ctx.font = `bold ${nameFS}px Arial`;
                ctx.fillText(sp.name, bx + cardW / 2, oy);
                oy += nameFS + 10;
            }
            ctx.textAlign = 'left';
            ctx.font = `${descFS}px Arial`;
            const lh = descFS + 4;
            if (!awaken) {
                ctx.fillStyle = 'rgba(215,235,255,0.92)';
                oy = this._wrapText(ctx, sp.desc, bx + pad, oy, cardW - pad * 2, lh) + 6;
            }
            ctx.fillStyle = awaken ? '#ffe082' : 'rgba(255,224,130,0.7)';
            ctx.font = `bold ${descFS}px Arial`;
            ctx.fillText(awaken ? '觉醒效果' : `${AWAKEN_LEVEL} 级觉醒`, bx + pad, oy);
            oy += lh;
            ctx.font = `${descFS}px Arial`;
            this._wrapText(ctx, sp.awaken, bx + pad, oy, cardW - pad * 2, lh);

            // 底部提示
            ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
            ctx.fillStyle = color;
            ctx.font = `bold ${Math.min(18, cardW * 0.055)}px Arial`;
            ctx.fillText(awaken ? '点击觉醒' : '点击选择', bx + cardW / 2, by + cardH - 12);
            ctx.restore();

            this.buttons.push({ x: bx, y: by, width: cardW, height: cardH, choice: i + 1 });
        });
    }
    
    showPotentialMenu() {
        if (this.player.potentialPoints > 0) {
            this.isPaused = true;
            this.showingPotentialMenu = true;
            this.currentTalentChoices = this._rollTalentChoices(3);
            this._talentDealT = performance.now();
        }
    }

    openPotentialMenu() {
        // 这个方法现在由鼠标点击事件处理
    }

    _rollTalentChoices(count) {
        // 1. 过滤可用天赋:满足 applicable + 未达 maxStacks
        const eligible = this.talentDefs.filter(t => {
            if (t.applicable && !t.applicable(this)) return false;
            const got = this.player.acquiredTalents.find(a => a.id === t.id);
            if (got) {
                if (!t.stackable) return false;
                if (t.maxStacks && got.count >= t.maxStacks) return false;
            }
            return true;
        });
        if (eligible.length === 0) return [];

        // 2. 加权随机(common 60 / rare 30 / epic 10),不重复抽取同一张
        const weights = { common: 60, rare: 30, epic: 10 };
        const pool = eligible.slice();
        const chosen = [];
        for (let i = 0; i < count && pool.length > 0; i++) {
            let total = 0;
            for (const t of pool) total += weights[t.rarity] || 10;
            let roll = Math.random() * total;
            let pickIdx = 0;
            for (let j = 0; j < pool.length; j++) {
                roll -= weights[pool[j].rarity] || 10;
                if (roll <= 0) { pickIdx = j; break; }
            }
            chosen.push(pool[pickIdx]);
            pool.splice(pickIdx, 1);
        }
        return chosen;
    }

    // 应用天赋到 this.player 并记录层数(host 替 guest 应用时经由 _runAsPlayer)
    _applyTalent(talent) {
        talent.apply(this);
        const existing = this.player.acquiredTalents.find(a => a.id === talent.id);
        if (existing) existing.count++;
        else this.player.acquiredTalents.push({ id: talent.id, count: 1 });
    }

    // 天赋卡「换一批」剩余次数:每局 2 次,每击退一次魔王 +1(各端按本机玩家计)
    _rerollsLeft() {
        return Math.max(0, Game.TALENT_REROLLS + (this.runBossRepels || 0) - (this.player.rerollsUsed || 0));
    }

    handlePotentialChoice(choice) {
        // choice: -1 = 换一批, 0 = 跳过, 1/2/3 = 天赋卡索引(1-based)
        if (choice === -1) {
            if (this._rerollsLeft() <= 0) return;
            const next = this._rollTalentChoices(3);
            if (next.length === 0) return;
            this.player.rerollsUsed = (this.player.rerollsUsed || 0) + 1;
            this.currentTalentChoices = next;
            this._talentDealT = performance.now();
            Sound.play('whoosh');
            return;
        }
        if (choice === 0) {
            this._closeTalentMenu();
            return;
        }
        const idx = choice - 1;
        const talent = this.currentTalentChoices[idx];
        if (!talent || this.player.potentialPoints <= 0) {
            this._closeTalentMenu();
            return;
        }

        this._applyTalent(talent);
        this.player.potentialPoints--;
        // 联机:guest 把所选天赋告诉 host,由 host 应用到该 guest 的 Player(团队类天赋作用于全队)
        if (this.mpMode === 'guest' && this.mpWs && this.mpWs.readyState === WebSocket.OPEN) {
            this.mpWs.send(JSON.stringify({ type: 'talentChoose', talentId: talent.id }));
        }

        this.updateUI();

        // 还有剩余点数 → 重抽继续选;否则关闭
        if (this.player.potentialPoints > 0) {
            this.currentTalentChoices = this._rollTalentChoices(3);
            this._talentDealT = performance.now();
            if (this.currentTalentChoices.length === 0) this._closeTalentMenu();
        } else {
            this._closeTalentMenu();
        }
    }

    _closeTalentMenu() {
        this.showingPotentialMenu = false;
        this.isPaused = false;
        this.currentTalentChoices = [];
    }

    // 键盘选天赋:1/2/3 选卡,R 换一批,0 / X 跳过
    _talentMenuKey(key) {
        if (key >= '1' && key <= '3') {
            const i = key.charCodeAt(0) - 48;
            if (i <= this.currentTalentChoices.length) this.handlePotentialChoice(i);
        } else if (key === 'r' || key === 'R') this.handlePotentialChoice(-1);
        else if (key === '0' || key === 'x' || key === 'X') this.handlePotentialChoice(0);
    }
    
    renderPotentialMenu() {
        if (!this.showingPotentialMenu) return;
        this.buttons = [];
        const ctx = this.ctx;
        const MW = this._menu.w, MH = this._menu.h;   // 菜单坐标系(见 _withMenu)

        // 背景遮罩
        const bgGrad = ctx.createRadialGradient(MW / 2, MH / 2, 0, MW / 2, MH / 2, MW * 0.7);
        bgGrad.addColorStop(0, 'rgba(10, 15, 35, 0.93)');
        bgGrad.addColorStop(1, 'rgba(0, 0, 0, 0.96)');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, MW, MH);

        // 自适应字号
        const titleFontSize = Math.min(28, MW * 0.06);
        const subFontSize = Math.min(14, MW * 0.032);
        const cardNameSize = Math.min(16, MW * 0.038);
        const cardDescSize = Math.min(11, MW * 0.026);
        const cardIconSize = Math.min(36, MW * 0.085);

        // 标题
        ctx.save();
        ctx.shadowBlur = 18;
        ctx.shadowColor = '#00c8ff';
        ctx.fillStyle = '#00e5ff';
        ctx.font = `bold ${titleFontSize}px Arial`;
        ctx.textAlign = 'center';
        ctx.fillText('选择天赋', MW / 2, MH * 0.09);
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#ffcc00';
        ctx.font = `${subFontSize}px Arial`;
        ctx.fillText(`剩余潜能点: ${this.player.potentialPoints}`, MW / 2, MH * 0.14);
        ctx.restore();

        // 卡牌布局:横屏三列横排;竖屏(宽<高)三行竖排
        const portrait = MW < MH;
        const choices = this.currentTalentChoices;
        const n = choices.length;

        let cardW, cardH, startX, startY, stepX, stepY;
        if (portrait || MW < 480) {
            cardW = Math.min(280, MW * 0.75);
            cardH = Math.min(110, MH * 0.14);
            startX = (MW - cardW) / 2;
            startY = MH * 0.20;
            stepX = 0;
            stepY = cardH + Math.max(8, MH * 0.015);
        } else {
            const spacing = Math.min(16, MW * 0.025);
            cardW = Math.min(180, (MW - spacing * (n + 1)) / Math.max(n, 1));
            cardH = Math.min(220, MH * 0.42);
            const totalW = cardW * n + spacing * (n - 1);
            startX = (MW - totalW) / 2;
            startY = MH * 0.22;
            stepX = cardW + spacing;
            stepY = 0;
        }

        // 稀有度边框颜色
        const rarityColor = { common: '#90a4ae', rare: '#42a5f5', epic: '#ba68c8' };
        const rarityLabel = { common: '普通', rare: '稀有', epic: '史诗' };

        // 绘制卡牌
        for (let i = 0; i < n; i++) {
            const t = choices[i];
            const cx = startX + stepX * i;
            const cy = startY + stepY * i;
            const borderColor = rarityColor[t.rarity] || '#888';

            ctx.save();
            // 发牌动画:新一批卡片依次上浮淡入(命中区按最终位置注册)
            const deal = Math.max(0, Math.min(1, ((performance.now() - (this._talentDealT || 0)) / 1000 - i * 0.06) / 0.22));
            if (deal < 1) {
                const ease = 1 - (1 - deal) * (1 - deal);
                ctx.globalAlpha = ease;
                ctx.translate(0, (1 - ease) * 24);
            }
            // 卡牌背景
            const cardGrad = ctx.createLinearGradient(cx, cy, cx, cy + cardH);
            cardGrad.addColorStop(0, 'rgba(20, 30, 55, 0.95)');
            cardGrad.addColorStop(1, 'rgba(10, 15, 30, 0.95)');
            ctx.fillStyle = cardGrad;
            ctx.shadowBlur = 16;
            ctx.shadowColor = borderColor;
            roundRect(ctx, cx, cy, cardW, cardH, 12);
            ctx.fill();

            // 稀有度边框
            ctx.shadowBlur = 0;
            ctx.strokeStyle = borderColor;
            ctx.lineWidth = 2.5;
            roundRect(ctx, cx, cy, cardW, cardH, 12);
            ctx.stroke();

            // 稀有度标签(右上角)
            ctx.fillStyle = borderColor;
            ctx.font = `bold ${Math.max(9, subFontSize - 2)}px Arial`;
            ctx.textAlign = 'right';
            ctx.textBaseline = 'top';
            ctx.fillText(rarityLabel[t.rarity] || '', cx + cardW - 8, cy + 6);

            if (portrait || MW < 480) {
                // 竖屏:图标左侧 | 名字/描述右侧
                const iconBoxW = cardH;
                ctx.fillStyle = t.color;
                ctx.shadowBlur = 10;
                ctx.shadowColor = t.color;
                ctx.font = `bold ${cardIconSize}px Arial`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(t.icon, cx + iconBoxW / 2, cy + cardH / 2);
                ctx.shadowBlur = 0;

                ctx.fillStyle = '#ffffff';
                ctx.font = `bold ${cardNameSize}px Arial`;
                ctx.textAlign = 'left';
                ctx.textBaseline = 'top';
                ctx.fillText(t.name, cx + iconBoxW, cy + 14);

                ctx.fillStyle = 'rgba(200, 232, 255, 0.85)';
                ctx.font = `${cardDescSize}px Arial`;
                this._wrapText(ctx, t.desc, cx + iconBoxW, cy + 14 + cardNameSize + 6, cardW - iconBoxW - 10, cardDescSize + 3);

                const got = this.player.acquiredTalents.find(a => a.id === t.id);
                if (got) {
                    ctx.fillStyle = 'rgba(255, 204, 0, 0.85)';
                    ctx.font = `${Math.max(9, cardDescSize - 1)}px Arial`;
                    ctx.textAlign = 'right';
                    ctx.fillText(`已持有 ×${got.count}`, cx + cardW - 8, cy + cardH - 16);
                }
            } else {
                // 横屏:图标上 | 名字中 | 描述下
                ctx.fillStyle = t.color;
                ctx.shadowBlur = 12;
                ctx.shadowColor = t.color;
                ctx.font = `bold ${cardIconSize}px Arial`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(t.icon, cx + cardW / 2, cy + cardH * 0.25);
                ctx.shadowBlur = 0;

                ctx.fillStyle = '#ffffff';
                ctx.font = `bold ${cardNameSize}px Arial`;
                ctx.fillText(t.name, cx + cardW / 2, cy + cardH * 0.50);

                ctx.fillStyle = 'rgba(200, 232, 255, 0.85)';
                ctx.font = `${cardDescSize}px Arial`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'top';
                this._wrapTextCenter(ctx, t.desc, cx + cardW / 2, cy + cardH * 0.60, cardW - 16, cardDescSize + 3);

                const got = this.player.acquiredTalents.find(a => a.id === t.id);
                if (got) {
                    ctx.fillStyle = 'rgba(255, 204, 0, 0.85)';
                    ctx.font = `${Math.max(9, cardDescSize - 1)}px Arial`;
                    ctx.fillText(`已持有 ×${got.count}`, cx + cardW / 2, cy + cardH - 18);
                }
            }
            ctx.restore();

            // 注册命中区域(choice 用 1-based)
            this.buttons.push({ x: cx, y: cy, width: cardW, height: cardH, choice: i + 1 });
        }

        // 跳过按钮
        const skipW = Math.min(140, MW * 0.35);
        const skipH = Math.max(36, Math.min(44, MH * 0.075));
        const btnGap = Math.min(16, MW * 0.04);
        const skipX = (MW - skipW * 2 - btnGap) / 2;
        let skipY;
        if (portrait || MW < 480) {
            skipY = startY + stepY * n + Math.max(8, MH * 0.015);
            skipY = Math.min(skipY, MH - skipH - 12);
        } else {
            skipY = startY + cardH + Math.max(16, MH * 0.04);
        }
        this.drawButton(skipX, skipY, skipW, skipH, '#78909c', '跳过', 0);
        const rr = this._rerollsLeft();
        if (rr > 0) this.drawButton(skipX + skipW + btnGap, skipY, skipW, skipH, '#26a69a', `🔄 换一批 (${rr})`, -1);
        else {
            // 次数用完:灰色占位,不注册命中区
            ctx.save();
            ctx.globalAlpha = 0.45;
            ctx.strokeStyle = '#78909c';
            ctx.lineWidth = 1.5;
            roundRect(ctx, skipX + skipW + btnGap, skipY, skipW, skipH, 10);
            ctx.stroke();
            ctx.fillStyle = '#b0bec5';
            ctx.font = `bold ${Math.min(14, skipW * 0.1)}px Arial`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('换一批 (0)', skipX + skipW * 1.5 + btnGap, skipY + skipH / 2);
            ctx.restore();
        }
        if (!(('ontouchstart' in window) || navigator.maxTouchPoints > 0)) {
            ctx.save();
            ctx.fillStyle = 'rgba(200, 232, 255, 0.45)';
            ctx.font = `${Math.max(9, subFontSize - 3)}px Arial`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillText('键盘:1 / 2 / 3 选择  ·  R 换一批  ·  0 跳过', MW / 2, skipY + skipH + 8);
            ctx.restore();
        }

        // 已获得天赋小列表(底部)
        if (this.player.acquiredTalents.length > 0) {
            ctx.save();
            ctx.fillStyle = 'rgba(200, 232, 255, 0.55)';
            ctx.font = `${Math.max(9, subFontSize - 3)}px Arial`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            const summary = this.player.acquiredTalents.map(a => {
                const def = this.talentDefs.find(d => d.id === a.id);
                return def ? (def.name + (a.count > 1 ? `×${a.count}` : '')) : '';
            }).filter(Boolean).join('  ·  ');
            ctx.fillText(`已获得: ${summary}`, MW / 2, MH - 6);
            ctx.restore();
        }
    }

    _wrapText(ctx, text, x, y, maxWidth, lineHeight) {
        const chars = text.split('');
        let line = '';
        let yy = y;
        for (let i = 0; i < chars.length; i++) {
            const test = line + chars[i];
            if (ctx.measureText(test).width > maxWidth && line.length > 0) {
                ctx.fillText(line, x, yy);
                line = chars[i];
                yy += lineHeight;
            } else {
                line = test;
            }
        }
        if (line) ctx.fillText(line, x, yy);
        return yy + lineHeight; // 下一行的 y
    }

    _wrapTextCenter(ctx, text, cx, y, maxWidth, lineHeight) {
        const chars = text.split('');
        let line = '';
        let yy = y;
        for (let i = 0; i < chars.length; i++) {
            const test = line + chars[i];
            if (ctx.measureText(test).width > maxWidth && line.length > 0) {
                ctx.fillText(line, cx, yy);
                line = chars[i];
                yy += lineHeight;
            } else {
                line = test;
            }
        }
        if (line) ctx.fillText(line, cx, yy);
        return yy + lineHeight;
    }
    
    drawButton(x, y, width, height, color, text, choice) {
        const ctx = this.ctx;
        ctx.save();

        ctx.shadowBlur = 16;
        ctx.shadowColor = color;
        const grad = ctx.createLinearGradient(x, y, x, y + height);
        grad.addColorStop(0, `${color}ee`);
        grad.addColorStop(1, `${color}88`);
        ctx.fillStyle = grad;
        roundRect(ctx, x, y, width, height, 10);
        ctx.fill();

        ctx.shadowBlur = 0;
        ctx.strokeStyle = `${color}ff`;
        ctx.lineWidth = 1.5;
        roundRect(ctx, x, y, width, height, 10);
        ctx.stroke();

        const fontSize = Math.min(16, width * 0.12);
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${fontSize}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowBlur = 6;
        ctx.shadowColor = 'rgba(0,0,0,0.6)';
        ctx.fillText(text, x + width / 2, y + height / 2);
        ctx.restore();

        // 命中区(this.buttons 在每帧 render 开头由调用方清空)
        this.buttons.push({ x, y, width, height, choice });
    }
    
    checkButtonClick(mouseX, mouseY) {
        // 逻辑坐标(toCanvas) → 菜单坐标(_withMenu)
        const m = this._menu;
        if (m) {
            mouseX = (mouseX * this.gameScale + this.gameOffsetX - m.ox) / m.s;
            mouseY = (mouseY * this.gameScale + this.gameOffsetY - m.oy) / m.s;
        }
        if (this.showingClassSelection && this.buttons) {
            for (let button of this.buttons) {
                if (mouseX >= button.x && mouseX <= button.x + button.width && 
                    mouseY >= button.y && mouseY <= button.y + button.height) {
                    // 处理职业选择
                    this.handleClassChoice(button.choice);
                    break;
                }
            }
        } else if (this.showingPotentialMenu && this.buttons) {
            for (let button of this.buttons) {
                if (mouseX >= button.x && mouseX <= button.x + button.width &&
                    mouseY >= button.y && mouseY <= button.y + button.height) {
                    // 0 = 跳过, 1/2/3 = 天赋卡索引;两者都交给 handlePotentialChoice
                    this.handlePotentialChoice(button.choice);
                    break;
                }
            }
        }
        this.buttons = [];
    }
    
    checkGameOver() {
        if (this.life <= 0) {
            this.endGame();
        }
    }
    
    endGame() {
        this.isRunning = false;
        if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = null; }
        // Host 广播游戏结束
        if (this.mpMode === 'host' && this.mpWs && this.mpWs.readyState === WebSocket.OPEN) {
            this.mpWs.send(JSON.stringify({ type: 'game_over', stats: { time: Math.floor(this.gameTime), score: this.score } }));
        }
        this._showGameOver(Math.floor(this.gameTime), this.score);
    }

    // 结算页的伤害构成:标题 + 分段条 + 每个来源一行(名称、数值、占比)
    _renderDmgBreakdownDom(el) {
        if (!el) return;
        el.innerHTML = '';
        const b = this._dmgBreakdown(this.player);
        if (!(b.total > 0)) return;
        const head = document.createElement('div');
        head.className = 'db-head';
        head.textContent = `伤害构成 · 总 ${Game.fmtNum(b.total)} · 秒伤 ${Game.fmtNum(b.dps)}`;
        const bar = document.createElement('div');
        bar.className = 'db-bar';
        const list = document.createElement('div');
        list.className = 'db-list';
        for (const part of b.parts) {
            const seg = document.createElement('span');
            seg.style.width = (part.pct * 100).toFixed(2) + '%';
            seg.style.background = part.color;
            bar.appendChild(seg);
            const row = document.createElement('div');
            row.className = 'db-row';
            row.innerHTML = '<i></i><span class="db-n"></span><span class="db-v"></span>';
            row.children[0].style.background = part.color;
            row.children[1].textContent = part.name;
            row.children[2].textContent = `${Game.fmtNum(part.v)} · ${Math.round(part.pct * 100)}%`;
            list.appendChild(row);
        }
        el.append(head, bar, list);
    }

    // 结算弹窗 + 最高纪录(分数与生存时间分别记录,存 localStorage)
    _showGameOver(time, score) {
        this.closeBuild();
        Sound.play('gameOver');
        const best = Store.get('blockrun.best', { score: 0, time: 0 });
        const newScore = score > best.score;
        const newTime = time > best.time;
        if (newScore || newTime) {
            Store.set('blockrun.best', { score: Math.max(score, best.score), time: Math.max(time, best.time) });
        }
        document.getElementById('finalTime').textContent = time;
        document.getElementById('finalScore').textContent = score;
        const fd = document.getElementById('finalDiff');
        if (fd) { const dm = diffDef(this.diffMode); fd.textContent = dm.name; fd.style.color = dm.color; fd.style.borderColor = dm.color; }
        const sumEl = document.getElementById('runSummary');
        if (sumEl) {
            sumEl.innerHTML = '';
            for (const [k, v] of this._runSummaryRows()) {
                const d = document.createElement('div');
                d.className = 'rs-item';
                d.innerHTML = '<div class="rs-k"></div><div class="rs-v"></div>';
                d.firstChild.textContent = k;
                d.lastChild.textContent = v;
                d.lastChild.title = v;
                sumEl.appendChild(d);
            }
        }
        this._renderDmgBreakdownDom(document.getElementById('dmgBreak'));
        const bestEl = document.getElementById('bestRecord');
        if (bestEl) {
            const b = Store.get('blockrun.best', { score: 0, time: 0 });
            bestEl.textContent = (newScore || newTime)
                ? `🏆 新纪录!  最高分 ${b.score} · 最长生存 ${b.time} 秒`
                : `最高分 ${b.score} · 最长生存 ${b.time} 秒`;
            bestEl.classList.toggle('new-record', newScore || newTime);
        }
        updateBestScoreLabel();
        // 局外成长:累计入档 + 列出本局新解锁的成就/外观
        const unlocked = this._finishRunProgress(time, score);
        const unlockEl = document.getElementById('runUnlocks');
        if (unlockEl) {
            const parts = unlocked.achievements.map(a => `${a.icon} ${a.name}`)
                .concat(unlocked.skins.map(sk => `🎨 外观「${sk.name}」`));
            unlockEl.textContent = parts.length ? `本局解锁:${parts.join('  ·  ')}` : '';
        }
        updateProgressLabel();
        document.getElementById('gameOver').style.display = 'flex';
    }
    
    updateUI() {
        // 旧 DOM 属性面板在全屏布局下一直隐藏(画面都是画布绘制):隐藏时跳过,省掉每 100ms 十几次 DOM 写入
        const ui = this._gameUIEl || (this._gameUIEl = document.getElementById('gameUI'));
        if (ui && ui.style.display === 'none') return;
        document.getElementById('life').textContent = this.life;
        document.getElementById('level').textContent = this.level;
        document.getElementById('exp').textContent = Math.floor(this.exp);
        document.getElementById('expToNext').textContent = this.expToNext;
        document.getElementById('potentialPoints').textContent = this.player.potentialPoints;
        document.getElementById('attack').textContent = this.player.attack;
        document.getElementById('defense').textContent = this.player.defense;
        document.getElementById('maxHealth').textContent = this.player.maxHealth;
        document.getElementById('speed').textContent = this.player.speed.toFixed(1);
        
        const classNames = { warrior: '战士', mage: '法师', assassin: '刺客', archer: '弓手', paladin: '圣骑士' };
        document.getElementById('class').textContent = this.player.class ? (classNames[this.player.class] || this.player.class) : '无';

        const qCD = this.player.skillQ.cooldown > 0 ? this.player.skillQ.cooldown.toFixed(1) : '就绪';
        const eCD = this.player.skillE.cooldown > 0 ? this.player.skillE.cooldown.toFixed(1) : '就绪';
        document.getElementById('skillCooldown').textContent = this.player.class ? `Q:${qCD} E:${eCD}` : '无职业';

        if (this.player.class === 'mage') {
            const toggle = this.player.qToggleActive ? ' [涌注]' : '';
            document.getElementById('mana').textContent = Math.floor(this.player.mana) + toggle;
            document.getElementById('maxMana').textContent = this.player.maxMana;
        } else if (this.player.class === 'paladin') {
            const cap = Math.floor(this.player.maxHealth * (this.player.shieldCapRatio || 0.10));
            const sh = Math.floor(this.player.shield);
            document.getElementById('mana').textContent = `${Math.floor(this.player.faith)} | 盾${sh}/${cap}`;
            document.getElementById('maxMana').textContent = this.player.maxFaith;
        } else if (this.player.class === 'warrior') {
            document.getElementById('mana').textContent = Math.floor(this.player.rage);
            document.getElementById('maxMana').textContent = this.player.maxRage;
        } else if (this.player.class === 'archer') {
            const reload = this.player.reloadTimer > 0 ? ` (装填 ${this.player.reloadTimer.toFixed(1)}s)` : '';
            document.getElementById('mana').textContent = this.player.arrows + reload;
            document.getElementById('maxMana').textContent = this.player.maxArrows;
        } else if (this.player.class === 'assassin') {
            document.getElementById('mana').textContent = Math.floor(this.player.assassinCharge);
            document.getElementById('maxMana').textContent = this.player.maxAssassinCharge;
        } else {
            document.getElementById('mana').textContent = '-';
            document.getElementById('maxMana').textContent = '-';
        }
        
        document.getElementById('time').textContent = Math.floor(this.gameTime);
        document.getElementById('score').textContent = this.score;
    }
    
    // 背景渐变与网格是静态的,预渲染到离屏画布;每帧只画闪烁的星星
    _buildBgLayers() {
        const W = this.width, H = this.height;
        // 网格直接烘焙进背景层(固定透明度):每帧少一次整屏带透明度的贴图
        const bg = SpriteCache.get('bg|base', W, H, 0, g => {
            const grad = g.createLinearGradient(0, 0, 0, H);
            grad.addColorStop(0, '#07101a');
            grad.addColorStop(1, '#050c12');
            g.fillStyle = grad;
            g.fillRect(0, 0, W, H);
            const gridSize = 60;
            g.globalAlpha = 0.06;
            g.strokeStyle = 'rgb(0, 200, 255)';
            g.lineWidth = 0.5;
            g.beginPath();
            for (let x = 0; x < W; x += gridSize) { g.moveTo(x, 0); g.lineTo(x, H); }
            for (let y = 0; y < H; y += gridSize) { g.moveTo(0, y); g.lineTo(W, y); }
            g.stroke();
        });
        // 星星按亮度分 5 档,每档合并成一条路径一次 fill(原来每颗星一次 fill)
        this._starBuckets = Array.from({ length: Game.STAR_LEVELS }, () => []);
        this._bgLayers = { bg };
    }

    renderBackground() {
        const ctx = this.ctx;
        if (!this._bgLayers) this._buildBgLayers();
        // 背景层同样按设备像素 1:1 绘制(缩放比例非整数时插值缩放整屏图很慢)
        const m = ctx.getTransform();
        SpriteCache.drawPx(ctx, this._bgLayers.bg, 0, 0, { a: m.a, e: m.e, f: m.f });

        // 星星闪烁:亮度量化到 STAR_LEVELS 档,同档的星星一次 fill
        const t = this.bgTime, L = Game.STAR_LEVELS, buckets = this._starBuckets;
        for (const b of buckets) b.length = 0;
        for (const s of this.stars) {
            const twinkle = Math.max(0.05, Math.min(1, s.alpha + Math.sin(t * s.twinkleSpeed * 60 + s.twinkleOffset) * 0.25));
            buckets[Math.min(L - 1, Math.floor(twinkle * L))].push(s);
        }
        ctx.save();
        ctx.fillStyle = '#c8e8ff';
        for (let i = 0; i < L; i++) {
            const b = buckets[i];
            if (!b.length) continue;
            ctx.globalAlpha = (i + 0.5) / L;
            ctx.beginPath();
            for (const s of b) { ctx.moveTo(s.x + s.r, s.y); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); }
            ctx.fill();
        }
        ctx.restore();
    }

    renderParticles() {
        // 去 shadowBlur:粒子数量大时 shadow 是主要瓶颈,关闭后大幅提速
        const ctx = this.ctx;
        ctx.save();
        ctx.shadowBlur = 0;
        // 方块碎屑(fillRect):贴合方块画风,比逐个 arc 路径快 3~5 倍
        let color = null;
        for (const p of this.particles) {
            ctx.globalAlpha = p.life;
            if (p.color !== color) { color = p.color; ctx.fillStyle = color; }
            const h = p.size * p.life * 0.85;
            ctx.fillRect(p.x - h, p.y - h, h * 2, h * 2);
        }
        ctx.restore();
    }

    _renderFreezeOverlay() {
        if (!this.freezeOverlay || this.enemyFreezeTimer <= 0) {
            this.freezeOverlay = null;
            return;
        }
        const { duration, cracks, corners } = this.freezeOverlay;
        const ratio = this.enemyFreezeTimer / duration; // 1→0 随时间消退
        // 入场：前 0.3s 快速冻结铺开；消退：最后 1s 渐淡
        const fadeIn  = Math.min(1, (duration - this.enemyFreezeTimer) / 0.3);
        const fadeOut = Math.min(1, this.enemyFreezeTimer / 1.0);
        const alpha   = Math.min(fadeIn, fadeOut);
        if (alpha <= 0) return;

        const ctx = this.ctx;
        const W = this.width, H = this.height;

        ctx.save();

        // ── 全屏蓝色半透明蒙版 ──
        ctx.globalAlpha = alpha * 0.22;
        const grad = ctx.createRadialGradient(W/2, H/2, 0, W/2, H/2, W * 0.75);
        grad.addColorStop(0, 'rgba(140,220,255,0)');
        grad.addColorStop(0.6, 'rgba(100,190,255,0.4)');
        grad.addColorStop(1, 'rgba(40,120,220,0.9)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);

        // ── 四角冰晶簇 ──
        ctx.globalAlpha = alpha * 0.9;
        for (const c of corners) {
            const ox = c.ox * W, oy = c.oy * H;
            const len = c.len * Math.min(W, H) * fadeIn;
            const halfW = c.w * Math.min(W, H);
            const ex = ox + Math.cos(c.a) * len;
            const ey = oy + Math.sin(c.a) * len;
            const px = Math.cos(c.a + Math.PI/2) * halfW;
            const py = Math.sin(c.a + Math.PI/2) * halfW;
            const iceGrad = ctx.createLinearGradient(ox, oy, ex, ey);
            iceGrad.addColorStop(0, 'rgba(200,240,255,0.95)');
            iceGrad.addColorStop(0.5, 'rgba(120,200,255,0.8)');
            iceGrad.addColorStop(1, 'rgba(80,160,220,0.3)');
            ctx.fillStyle = iceGrad;
            ctx.shadowBlur = 8;
            ctx.shadowColor = '#88ccff';
            ctx.beginPath();
            ctx.moveTo(ox + px, oy + py);
            ctx.lineTo(ex, ey);
            ctx.lineTo(ox - px, oy - py);
            ctx.closePath();
            ctx.fill();
        }

        // ── 冰裂纹 ──
        ctx.shadowBlur = 4;
        ctx.shadowColor = '#aaddff';
        ctx.lineCap = 'round';
        for (const crack of cracks) {
            ctx.globalAlpha = alpha * 0.75;
            ctx.strokeStyle = 'rgba(180,230,255,0.85)';
            ctx.lineWidth = crack.width;
            ctx.beginPath();
            ctx.moveTo(crack.sx * W, crack.sy * H);
            for (const seg of crack.segs) {
                ctx.lineTo(seg.x * W, seg.y * H);
            }
            ctx.stroke();
            // 内芯高光
            ctx.globalAlpha = alpha * 0.4;
            ctx.strokeStyle = 'rgba(240,250,255,0.9)';
            ctx.lineWidth = crack.width * 0.4;
            ctx.beginPath();
            ctx.moveTo(crack.sx * W, crack.sy * H);
            for (const seg of crack.segs) {
                ctx.lineTo(seg.x * W, seg.y * H);
            }
            ctx.stroke();
        }

        // ── 四边冰霜边框 ──
        ctx.shadowBlur = 0;
        const edgeH = H * 0.18 * fadeIn;
        const edgeW = W * 0.18 * fadeIn;
        const makeEdgeGrad = (x0, y0, x1, y1) => {
            const g = ctx.createLinearGradient(x0, y0, x1, y1);
            g.addColorStop(0, `rgba(160,220,255,${alpha * 0.6})`);
            g.addColorStop(1, 'rgba(160,220,255,0)');
            return g;
        };
        ctx.fillStyle = makeEdgeGrad(0, 0, 0, edgeH);
        ctx.fillRect(0, 0, W, edgeH);
        ctx.fillStyle = makeEdgeGrad(0, H, 0, H - edgeH);
        ctx.fillRect(0, H - edgeH, W, edgeH);
        ctx.fillStyle = makeEdgeGrad(0, 0, edgeW, 0);
        ctx.fillRect(0, 0, edgeW, H);
        ctx.fillStyle = makeEdgeGrad(W, 0, W - edgeW, 0);
        ctx.fillRect(W - edgeW, 0, edgeW, H);

        // ── 倒计时文字 ──
        if (this.enemyFreezeTimer > 0.5) {
            ctx.globalAlpha = alpha * 0.9;
            ctx.shadowBlur = 14;
            ctx.shadowColor = '#aaddff';
            ctx.fillStyle = '#ddf4ff';
            ctx.font = `bold ${Math.min(20, W * 0.04)}px Arial`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillText(`❄ 冻结 ${this.enemyFreezeTimer.toFixed(1)}s ❄`, W / 2, 10);
        }

        ctx.restore();
    }

    render() {
        const ctx = this.ctx;

        // 铺底色(含 letterbox 区域);底色不透明,无需先 clearRect
        ctx.fillStyle = '#050a10';
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // 未开始时显示标题界面
        if (!this.isRunning) {
            this._renderStartScreen();
            return;
        }

        // 外层变换：全屏缩放 + 居中偏移
        ctx.save();
        ctx.translate(this.gameOffsetX, this.gameOffsetY);
        ctx.scale(this.gameScale, this.gameScale);

        // 内层变换：屏幕震动（仅影响游戏世界）
        ctx.save();
        if (this.screenShake > 0 && !this.isPaused) {
            const intensity = Math.min(12, this.screenShake * 30);
            ctx.translate((Math.random() - 0.5) * intensity, (Math.random() - 0.5) * intensity);
        }

        this.renderBackground();
        this._renderMeteorMarks(ctx);
        this._renderAltar(ctx);

        this.player.render(this.ctx);
        this._renderBlessAura(this.player);
        this._renderGearAura(this.player);
        this._renderClassAura(this.player, this.player.class, this.player.awakened, this.player.stillTime);

        // 渲染其他联机玩家
        if (this.mpMode && this.mpPlayers.length > 0) this._renderMpPlayers();

        this._renderEnemies(ctx, this.enemyFreezeTimer > 0);

        // 渲染魔王(在敌人之上,投射物之下);招式预警铺在地面,先画
        if (this.boss) {
            this.boss.renderTelegraph(this.ctx);
            this.boss.render(this.ctx);
        }

        for (let item of this.items) {
            item.render(this.ctx);
        }

        for (let projectile of this.projectiles) {
            projectile.render(this.ctx);
        }

        EnemyBullet.renderAll(ctx, this.enemyBullets);
        this._renderMeteorRocks(ctx);

        this._renderEffects();

        this.renderParticles();
        this._renderDmgNums();

        this._renderSelfMarker();
        this._renderAimGuide();

        ctx.restore(); // 结束震动变换

        // HUD 与菜单（在缩放坐标系内，无震动）
        this._renderHurtVignette();
        this._renderFreezeOverlay();
        this.skillButtons = [];
        this._withHud(() => {
            this._renderSkillHUD();
            this._renderDashButton();
            this._renderBuildButton();
            this._renderAimKnob();
        });
        this._renderBossHUD();
        this._renderEventHUD();
        this._renderStatsHUD();
        this._renderGearHUD();
        // 右上角按钮与连杀计数:触屏时贴屏幕角落按固定尺寸绘制,竖屏也够大好点
        this._withHud(() => {
            this._renderMuteButton();
            this._renderComboHUD();
        });
        this._renderAchToasts();

        if (this.showingClassSelection) {
            this._withMenu(() => this.renderClassSelection());
        } else if (this.showingPotentialMenu) {
            this._withMenu(() => this.renderPotentialMenu());
        }

        if (this.isPaused && !this.showingClassSelection && !this.showingPotentialMenu && !this.showingBuild) {
            this._withMenu(() => this._renderPauseOverlay());
        }

        ctx.restore(); // 结束缩放变换

        this._renderJoystick();
    }

    // 拖拽瞄准:从玩家身上画出瞄准方向(冲刺显示实际冲刺距离,技能显示锁定扇形)
    _renderAimGuide() {
        const a = this.aim, p = this.player;
        if (!a.active || !a.armed || this.isPaused || p.currentHealth <= 0) return;
        const ctx = this.ctx;
        const cx = p.x + p.size / 2, cy = p.y + p.size / 2;
        const ang = Math.atan2(a.dy, a.dx);
        const isDash = a.skill === 'dash';
        const col = isDash ? '128,216,255' : '255,225,77';
        ctx.save();
        if (isDash) {
            const len = p.dashSpeed * (p.dashDuration / DT);
            ctx.translate(cx, cy); ctx.rotate(ang);
            ctx.fillStyle = `rgba(${col},0.18)`;
            ctx.fillRect(0, -p.size / 2, len, p.size);
            ctx.strokeStyle = `rgba(${col},0.7)`;
            ctx.lineWidth = 2;
            ctx.setLineDash([8, 6]);
            ctx.strokeRect(0, -p.size / 2, len, p.size);
            ctx.setLineDash([]);
            ctx.fillStyle = `rgba(${col},0.85)`;
            ctx.beginPath();
            ctx.moveTo(len + 12, 0); ctx.lineTo(len - 2, -10); ctx.lineTo(len - 2, 10);
            ctx.closePath(); ctx.fill();
        } else {
            const R = 260, half = Math.acos(0.82);
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.arc(cx, cy, R, ang - half, ang + half);
            ctx.closePath();
            const g = ctx.createRadialGradient(cx, cy, 10, cx, cy, R);
            g.addColorStop(0, `rgba(${col},0.28)`);
            g.addColorStop(1, `rgba(${col},0.04)`);
            ctx.fillStyle = g;
            ctx.fill();
            ctx.strokeStyle = `rgba(${col},0.75)`;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(cx + a.dx * R, cy + a.dy * R);
            ctx.stroke();
        }
        ctx.restore();
    }

    // 拖拽瞄准时按钮上的小摇杆头,跟着手指偏移(HUD 逻辑坐标)
    // 技能/冲刺按键的坐标系:桌面端与世界同缩放(与以前一致);触屏端贴屏幕右下角,
    // 按 CSS 像素定尺寸(1 单位 ≈ 1.35 CSS px),竖屏时落在画面下方黑边里,手指不挡视野
    // 菜单坐标系:桌面沿用 800×600 世界缩放;触屏铺满整块屏幕,且短边至少按 420 单位排版,
    // 竖屏手机不再把菜单缩进中间的小条里。命中区记在菜单坐标里,checkButtonClick 负责换算。
    _withMenu(fn) {
        const ctx = this.ctx;
        let m;
        if (('ontouchstart' in window) || navigator.maxTouchPoints > 0) {
            const s = Math.max(this.gameScale, Math.min(this.canvas.width, this.canvas.height) / 420);
            m = { s, ox: 0, oy: 0, w: this.canvas.width / s, h: this.canvas.height / s };
        } else {
            m = { s: this.gameScale, ox: this.gameOffsetX, oy: this.gameOffsetY, w: this.width, h: this.height };
        }
        this._menu = m;
        ctx.save();
        ctx.setTransform(m.s, 0, 0, m.s, m.ox, m.oy);
        try { fn(); } finally { ctx.restore(); }
    }

    _withHud(fn) {
        const ctx = this.ctx;
        let h;
        if (('ontouchstart' in window) || navigator.maxTouchPoints > 0) {
            const k = this.canvas.width / (this.canvas.getBoundingClientRect().width || this.canvas.width);
            const sc = Math.max(this.gameScale, k * 1.35);
            h = { s: sc, ox: 0, oy: 0, w: this.canvas.width / sc, h: this.canvas.height / sc, k };
        } else {
            h = { s: this.gameScale, ox: this.gameOffsetX, oy: this.gameOffsetY, w: this.width, h: this.height,
                  k: this.canvas.width / (this.canvas.getBoundingClientRect().width || this.canvas.width) };
        }
        this._hud = h;
        ctx.save();
        ctx.setTransform(h.s, 0, 0, h.s, h.ox, h.oy);
        try { fn(); } finally { ctx.restore(); }
    }

    // 登记按键命中区:HUD 坐标 → 逻辑坐标(toCanvas 的输出),hcx/hcy 留给瞄准摇杆头
    _hudButton(x, y, w, h, skill) {
        const hd = this._hud, gs = this.gameScale;
        this.skillButtons.push({
            x: (hd.ox + x * hd.s - this.gameOffsetX) / gs, y: (hd.oy + y * hd.s - this.gameOffsetY) / gs,
            w: w * hd.s / gs, h: h * hd.s / gs, skill, hcx: x + w / 2, hcy: y + h / 2
        });
    }

    _renderAimKnob() {
        const a = this.aim;
        if (!a.active || this.isPaused) return;
        const ctx = this.ctx;
        const perCss = this._hud.k / this._hud.s;   // 1 CSS px = 多少 HUD 单位
        let ox = a.ox * perCss, oy = a.oy * perCss;
        const d = Math.hypot(ox, oy), max = 30;
        if (d > max) { ox *= max / d; oy *= max / d; }
        ctx.save();
        ctx.strokeStyle = a.armed ? 'rgba(255,225,77,0.6)' : 'rgba(255,255,255,0.35)';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(a.hcx, a.hcy, max + 6, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = a.armed ? 'rgba(255,225,77,0.85)' : 'rgba(255,255,255,0.5)';
        ctx.beginPath(); ctx.arc(a.hcx + ox, a.hcy + oy, 9, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
    }

    // 本地玩家头顶的上下浮动箭头,联机时一眼认出自己(画在敌人和特效之上)
    _renderSelfMarker() {
        const p = this.player;
        if (!p || p.currentHealth <= 0) return;
        const ctx = this.ctx;
        const bob = Math.sin(performance.now() / 180) * 3;
        const cx = p.x + p.size / 2;
        const tipY = p.y - (p.shield > 0 ? 22 : 16) + bob;   // 避开血条/护盾条
        const w = 11, h = 12;
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(cx, tipY);
        ctx.lineTo(cx - w, tipY - h);
        ctx.lineTo(cx - w * 0.35, tipY - h);
        ctx.lineTo(cx - w * 0.35, tipY - h - 7);
        ctx.lineTo(cx + w * 0.35, tipY - h - 7);
        ctx.lineTo(cx + w * 0.35, tipY - h);
        ctx.lineTo(cx + w, tipY - h);
        ctx.closePath();
        ctx.shadowBlur = 8;
        ctx.shadowColor = '#ffe14d';
        ctx.fillStyle = '#ffe14d';
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = 'rgba(40,25,0,0.85)';
        ctx.stroke();
        ctx.restore();
    }

    // 虚拟摇杆:屏幕空间绘制(后备像素),按下时在手指处,空闲时左下角给出淡色提示
    _renderJoystick() {
        if (this.controlMode !== 'joystick' || this.isPaused ||
            this.showingPotentialMenu || this.showingClassSelection) return;
        const ctx = this.ctx;
        const j = this.joy;
        const k = this.canvas.width / (this.canvas.getBoundingClientRect().width || this.canvas.width);
        const R = Game.JOY_RADIUS * k;
        let bx, by, kx, ky, alpha;
        if (j.active) {
            bx = j.bx; by = j.by;
            const dx = j.x - bx, dy = j.y - by, d = Math.hypot(dx, dy);
            const m = d > R ? R / d : 1;
            kx = bx + dx * m; ky = by + dy * m;
            alpha = 1;
        } else {
            // 只在触屏设备上显示空闲提示,桌面端靠键盘为主
            if (!(('ontouchstart' in window) || navigator.maxTouchPoints > 0)) return;
            bx = R + 34 * k; by = this.canvas.height - R - 34 * k;
            kx = bx; ky = by;
            alpha = 0.45;
        }
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = 'rgba(0, 20, 35, 0.35)';
        ctx.beginPath(); ctx.arc(bx, by, R, 0, Math.PI * 2); ctx.fill();
        ctx.lineWidth = 2 * k;
        ctx.strokeStyle = 'rgba(0, 200, 255, 0.55)';
        ctx.stroke();
        // 方向刻度
        ctx.fillStyle = 'rgba(0, 200, 255, 0.5)';
        for (let i = 0; i < 4; i++) {
            const a = i * Math.PI / 2;
            const tx = bx + Math.cos(a) * (R - 9 * k), ty = by + Math.sin(a) * (R - 9 * k);
            ctx.beginPath();
            ctx.moveTo(tx + Math.cos(a) * 5 * k, ty + Math.sin(a) * 5 * k);
            ctx.lineTo(tx + Math.cos(a + 2.2) * 5 * k, ty + Math.sin(a + 2.2) * 5 * k);
            ctx.lineTo(tx + Math.cos(a - 2.2) * 5 * k, ty + Math.sin(a - 2.2) * 5 * k);
            ctx.closePath(); ctx.fill();
        }
        const kr = R * 0.45;
        const g = ctx.createRadialGradient(kx - kr * 0.3, ky - kr * 0.3, kr * 0.1, kx, ky, kr);
        g.addColorStop(0, 'rgba(160, 235, 255, 0.95)');
        g.addColorStop(1, 'rgba(0, 150, 220, 0.85)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(kx, ky, kr, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.6)';
        ctx.lineWidth = 1.5 * k;
        ctx.stroke();
        if (!j.active) {
            ctx.fillStyle = 'rgba(200, 232, 255, 0.9)';
            ctx.font = `${12 * k}px Arial`;
            ctx.textAlign = 'center'; ctx.textBaseline = 'top';
            ctx.fillText('按住拖动移动', bx, by + R + 6 * k);
        }
        ctx.restore();
    }

    // 左上角状态面板:命数 / 等级 / 经验 / 分数 / 时间(宽 100,不与顶部魔王血条重叠)
    _renderStatsHUD() {
        const ctx = this.ctx;
        const x = 10, y = 10, w = 100, h = 56;
        ctx.save();
        ctx.fillStyle = 'rgba(0, 10, 20, 0.55)';
        roundRect(ctx, x, y, w, h, 8);
        ctx.fill();
        ctx.strokeStyle = 'rgba(0, 200, 255, 0.35)';
        ctx.lineWidth = 1;
        roundRect(ctx, x, y, w, h, 8);
        ctx.stroke();

        // 命数(只剩 1 条时闪烁提醒)
        const lastLife = this.life <= 1;
        const pulse = lastLife ? 0.55 + 0.45 * Math.abs(Math.sin(this.bgTime * 5)) : 1;
        ctx.textBaseline = 'middle';
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'left';
        ctx.globalAlpha = pulse;
        ctx.fillStyle = '#ff4d6d';
        ctx.fillText('♥', x + 8, y + 14);
        ctx.fillStyle = lastLife ? '#ff8a80' : '#ffffff';
        ctx.font = 'bold 13px Arial';
        ctx.fillText(`${this.life}/${this.maxLife}`, x + 24, y + 14);
        ctx.globalAlpha = 1;

        ctx.textAlign = 'right';
        ctx.fillStyle = '#00e5ff';
        ctx.fillText(`Lv${this.level}`, x + w - 8, y + 14);

        // 经验条
        const ex = x + 8, ey = y + 25, ew = w - 16, eh = 5;
        const ratio = this.expToNext > 0 ? Math.max(0, Math.min(1, this.exp / this.expToNext)) : 0;
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        roundRect(ctx, ex, ey, ew, eh, 2.5);
        ctx.fill();
        if (ratio > 0) {
            ctx.fillStyle = '#00e5ff';
            roundRect(ctx, ex, ey, Math.max(eh, ew * ratio), eh, 2.5);
            ctx.fill();
        }

        // 分数 + 生存时间
        const t = Math.floor(this.gameTime);
        const mm = Math.floor(t / 60), ss = String(t % 60).padStart(2, '0');
        ctx.font = '11px Arial';
        ctx.textAlign = 'left';
        // 破纪录后分数换成奖杯 + 橙金色,让玩家一眼知道这局在刷新纪录
        ctx.fillStyle = this._recordShown ? '#ffab40' : '#ffd54f';
        ctx.fillText(`${this._recordShown ? '🏆' : '★'} ${this.score}`, x + 8, y + 44);
        ctx.textAlign = 'right';
        ctx.fillStyle = 'rgba(200,232,255,0.8)';
        ctx.fillText(`${mm}:${ss}`, x + w - 8, y + 44);
        ctx.restore();
    }

    // 右上角(静音按钮下方)连杀计数:数字随击杀弹跳,下方细条是剩余连杀时间;中断后淡出
    _renderComboHUD() {
        const p = this.player;
        const live = p.combo >= 3 && p.comboTimer > 0;
        if (live) this._comboShow = { n: p.combo, a: 1 };
        else if (this._comboShow) this._comboShow.a -= 1 / 30;
        const show = this._comboShow;
        if (!show || show.a <= 0) { this._comboShow = null; return; }
        const n = show.n;
        const bump = this.comboBump || 0, pop = this.comboPop || 0;
        this.comboBump = Math.max(0, bump - 0.12);
        this.comboPop = Math.max(0, pop - 0.03);
        const color = n >= 100 ? '#ff4081' : n >= 50 ? '#ffab40' : n >= 25 ? '#ffd740' : '#fff59d';
        const ctx = this.ctx;
        const rx = this._hud.w - 12, y = 48;
        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(1, show.a));
        ctx.textAlign = 'right';
        ctx.textBaseline = 'alphabetic';
        // 数字 + 「连杀」
        const tier = Math.min(5, p.frenzyTier || 0);
        const frenzyText = tier >= 2 ? ` 狂热 ${tier}阶` : '';
        const isFrenzy = tier >= 2;
        const frenzyPulse = isFrenzy ? Math.sin(performance.now() / 150) * 0.5 + 0.5 : 0;
        ctx.font = 'bold 12px Arial';
        ctx.fillStyle = isFrenzy ? '#ffb74d' : 'rgba(255,255,255,0.85)';
        ctx.fillText('连杀' + frenzyText, rx, y + 26);
        const lw = ctx.measureText('连杀' + frenzyText).width;
        const sc = 1 + bump * 0.25 + pop * 0.5;
        ctx.save();
        ctx.translate(rx - lw - 4, y + 26);
        ctx.scale(sc, sc);
        ctx.font = 'bold 26px Arial';
        ctx.shadowBlur = (10 + pop * 14) + (isFrenzy ? 8 + frenzyPulse * 10 : 0);
        ctx.shadowColor = isFrenzy ? '#ff9800' : color;
        ctx.fillStyle = color;
        ctx.fillText(String(n), 0, 0);
        ctx.restore();
        // 剩余时间条
        const bw = 78, bh = 3, bx = rx - bw, by = y + 33;
        const ratio = live ? Math.max(0, Math.min(1, p.comboTimer / Game.COMBO_WINDOW)) : 0;
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.fillRect(bx, by, bw, bh);
        ctx.fillStyle = color;
        ctx.fillRect(bx + bw * (1 - ratio), by, bw * ratio, bh);
        // 当前分数加成
        const bonus = Math.min(50, Math.floor(n / 10) * 10);
        if (bonus > 0) {
            ctx.font = '10px Arial';
            ctx.fillStyle = 'rgba(255,236,179,0.85)';
            ctx.fillText(`击杀分数 +${bonus}%`, rx, by + 14);
        }
        ctx.restore();
    }

    // HUD 坐标矩形 → 逻辑坐标(toCanvas 的输出)
    _hudRect(x, y, w, h) {
        const hd = this._hud, gs = this.gameScale;
        return { x: (hd.ox + x * hd.s - this.gameOffsetX) / gs, y: (hd.oy + y * hd.s - this.gameOffsetY) / gs,
                 w: w * hd.s / gs, h: h * hd.s / gs };
    }

    _renderMuteButton() {
        const size = 30, x = this._hud.w - size - 10, y = 10;
        this.muteButton = this._hudRect(x, y, size, size);
        const ctx = this.ctx;
        // 静音按钮左边的暂停按钮(触屏没有 P 键)
        const px = x - size - 8;
        this.pauseButton = this._hudRect(px, y, size, size);
        ctx.save();
        ctx.globalAlpha = 0.7;
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        roundRect(ctx, px, y, size, size, 6);
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,200,255,0.5)';
        ctx.lineWidth = 1;
        roundRect(ctx, px, y, size, size, 6);
        ctx.stroke();
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(px + 10, y + 9, 3.5, 12);
        ctx.fillRect(px + size - 13.5, y + 9, 3.5, 12);
        ctx.restore();
        ctx.save();
        ctx.globalAlpha = 0.7;
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        roundRect(ctx, x, y, size, size, 6);
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,200,255,0.5)';
        ctx.lineWidth = 1;
        roundRect(ctx, x, y, size, size, 6);
        ctx.stroke();
        ctx.font = '16px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(Sound.muted ? '🔇' : '🔊', x + size / 2, y + size / 2 + 1);
        ctx.restore();
    }

    _renderBossHUD() {
        const ctx = this.ctx;
        // 魔王将至:最后 15 秒在顶部显示倒计时小牌(有事件横幅时排在它下方),给玩家留出准备时间
        if (this.bossState === 'idle' && this.bossTimer > 0 && this.bossTimer <= 15) {
            const urgent = this.bossTimer <= 6;
            const a = urgent ? 0.55 + 0.45 * Math.abs(Math.sin(this.bgTime * 6)) : 0.85;
            const w = 128, h = 22, x = (this.width - w) / 2, y = this.event ? 46 : 10;
            ctx.save();
            ctx.fillStyle = 'rgba(30, 6, 12, 0.72)';
            roundRect(ctx, x, y, w, h, 11);
            ctx.fill();
            ctx.globalAlpha = a;
            ctx.strokeStyle = '#ff1744';
            ctx.lineWidth = 1.5;
            roundRect(ctx, x, y, w, h, 11);
            ctx.stroke();
            ctx.fillStyle = urgent ? '#ff8a80' : '#ffcdd2';
            ctx.font = 'bold 12px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(`💀 魔王将至  ${Math.ceil(this.bossTimer)}s`, this.width / 2, y + h / 2 + 1);
            ctx.restore();
            return;
        }
        // 预告:红色边框 + 中央倒计时
        if (this.bossState === 'warning') {
            const alpha = 0.3 + 0.4 * Math.abs(Math.sin(this.bossWarningTimer * 8));
            ctx.save();
            ctx.strokeStyle = `rgba(255, 23, 68, ${alpha})`;
            ctx.lineWidth = 12;
            ctx.shadowBlur = 30;
            ctx.shadowColor = '#ff1744';
            ctx.strokeRect(6, 6, this.width - 12, this.height - 12);
            // 中央大字
            ctx.fillStyle = `rgba(255, 23, 68, ${alpha + 0.3})`;
            ctx.font = `bold ${Math.min(56, this.width * 0.12)}px Arial`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('魔王降临', this.width / 2, this.height * 0.42);
            ctx.fillStyle = '#ffffff';
            ctx.font = `bold ${Math.min(72, this.width * 0.16)}px Arial`;
            ctx.fillText(`${Math.ceil(this.bossWarningTimer)}`, this.width / 2, this.height * 0.55);
            ctx.restore();
            return;
        }
        // 活跃:顶部血条 + 进度条
        if (this.bossState === 'active' && this.boss) {
            ctx.save();
            // 持续红边
            ctx.strokeStyle = 'rgba(255, 23, 68, 0.5)';
            ctx.lineWidth = 6;
            ctx.shadowBlur = 18;
            ctx.shadowColor = '#ff1744';
            ctx.strokeRect(3, 3, this.width - 6, this.height - 6);
            ctx.shadowBlur = 0;

            // 顶部魔王血条
            const barW = this.width * 0.7;
            const barH = 18;
            const bx = (this.width - barW) / 2;
            const by = 18;
            const hpRatio = this.boss.currentHealth / this.boss.maxHealth;

            // 背景
            ctx.fillStyle = 'rgba(0,0,0,0.7)';
            roundRect(ctx, bx, by, barW, barH, 4);
            ctx.fill();
            // 血量(紫红渐变)
            const grad = ctx.createLinearGradient(bx, by, bx + barW, by);
            grad.addColorStop(0, '#7c4dff');
            grad.addColorStop(1, '#ff1744');
            ctx.fillStyle = grad;
            roundRect(ctx, bx, by, barW * hpRatio, barH, 4);
            ctx.fill();
            // 框
            ctx.strokeStyle = '#ff1744';
            ctx.lineWidth = 1.5;
            roundRect(ctx, bx, by, barW, barH, 4);
            ctx.stroke();
            // 文字
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 12px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(`方块大魔王${(this.boss.tier || 1) > 1 ? ' Lv' + this.boss.tier : ''}${this.boss.enraged ? ' · 狂暴' : ''}  ${Math.ceil(this.boss.currentHealth)}/${Math.ceil(this.boss.maxHealth)}`, bx + barW / 2, by + barH / 2);

            // 第二行:坚持倒计时 + 累计伤害进度
            const subBarW = barW;
            const subBarH = 10;
            const sby = by + barH + 6;
            const remainTime = Math.max(0, this.bossDuration - this.bossActiveTimer);
            const dmgGoal = this.bossDamageRequired * this.difficulty;
            const dmgRatio = Math.min(1, this.bossDamageDealt / dmgGoal);
            // 时间进度
            ctx.fillStyle = 'rgba(0,0,0,0.6)';
            roundRect(ctx, bx, sby, subBarW / 2 - 4, subBarH, 3);
            ctx.fill();
            ctx.fillStyle = '#ffeb3b';
            roundRect(ctx, bx, sby, (subBarW / 2 - 4) * (this.bossActiveTimer / this.bossDuration), subBarH, 3);
            ctx.fill();
            // 伤害进度
            ctx.fillStyle = 'rgba(0,0,0,0.6)';
            roundRect(ctx, bx + subBarW / 2 + 4, sby, subBarW / 2 - 4, subBarH, 3);
            ctx.fill();
            ctx.fillStyle = '#00e676';
            roundRect(ctx, bx + subBarW / 2 + 4, sby, (subBarW / 2 - 4) * dmgRatio, subBarH, 3);
            ctx.fill();

            ctx.fillStyle = '#fff';
            ctx.font = '10px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(`坚持 ${remainTime.toFixed(1)}s`, bx + subBarW / 4, sby + subBarH + 12);
            ctx.fillText(`伤害 ${Math.floor(this.bossDamageDealt)} / ${Math.floor(dmgGoal)}`, bx + subBarW * 3 / 4, sby + subBarH + 12);

            ctx.restore();
        }
    }

    // ── 特效光晕 ──
    // 逐帧 shadowBlur 要对每个特效做一次高斯模糊,特效一多就是渲染大头。
    // 形状固定的特效:光晕预渲染进 SpriteCache(只含光晕),本体每帧用矢量画;
    // 半径随时间变化的圆环(冲击波/挥砍弧):用径向渐变画出与 shadowBlur 相同的高斯光晕。
    _fxDotGlow(color, r) {
        return SpriteCache.get(`fx|dot|${color}|${r}`, r * 2, r * 2, SpriteCache.padFor(30), g => {
            SpriteCache.glowOnly(g, 30, color, g => {
                g.fillStyle = color;
                g.beginPath();
                g.arc(r, r, r, 0, Math.PI * 2);
                g.fill();
            });
        });
    }

    // 圣光光环:描边(blur 28)+ 内部填充(相对透明度 0.12/0.5)
    _fxHolyGlow(color, r) {
        return SpriteCache.get(`fx|holy|${color}|${r}`, r * 2, r * 2, SpriteCache.padFor(28), g => {
            SpriteCache.glowOnly(g, 28, color, g => {
                g.strokeStyle = color;
                g.fillStyle = color;
                g.lineWidth = 3;
                g.beginPath();
                g.arc(r, r, r, 0, Math.PI * 2);
                g.stroke();
                g.globalAlpha = 0.24;
                g.fill();
            });
        });
    }

    // '#rgb' / '#rrggbb' → 'r,g,b';其它格式返回 null(调用方退回 shadowBlur)
    _fxRgb(color) {
        const cache = this._fxRgbCache || (this._fxRgbCache = new Map());
        let v = cache.get(color);
        if (v === undefined) {
            v = null;
            const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color || '');
            if (m) {
                let h = m[1];
                if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
                const n = parseInt(h, 16);
                v = `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
            }
            cache.set(color, v);
        }
        return v;
    }

    // 半径 r、线宽 w 的圆弧描边在 shadowBlur=blur 下的光晕:截面是 σ=blur/2 的高斯,
    // 用径向渐变的圆环(或扇环)直接填出来,省掉逐帧模糊。返回 false 表示颜色无法解析
    _fillArcGlow(ctx, x, y, r, w, blur, color, a0 = 0, a1 = Math.PI * 2) {
        const rgb = this._fxRgb(color);
        if (!rgb) return false;
        const sigma = (blur / 2) * SpriteCache.dpr / SpriteCache.scale; // CSS 像素 → 逻辑像素
        const peak = Math.min(1, w / (sigma * 2.5066));
        const r0 = Math.max(0, r - 2.25 * sigma), r1 = r + 2.25 * sigma;
        const grad = ctx.createRadialGradient(x, y, r0, x, y, r1);
        const prof = [0, 0.325, 0.755, 1, 0.755, 0.325, 0]; // e^(-d²/2σ²),d 每步 0.75σ,±2.25σ 外忽略(<8% 峰值)
        for (let k = 0; k < prof.length; k++) {
            const rr = r + (k - 3) * 0.75 * sigma;
            if (rr < r0) continue;
            grad.addColorStop(Math.min(1, (rr - r0) / (r1 - r0)), `rgba(${rgb},${(prof[k] * peak).toFixed(4)})`);
        }
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(x, y, r1, a0, a1);
        if (r0 > 0) ctx.arc(x, y, r0, a1, a0, true);
        else ctx.lineTo(x, y);
        ctx.closePath();
        ctx.fill();
        return true;
    }

    // 敌人分三遍画,每遍内部状态一致、尽量合批:
    // 1) 本体/炮管/白闪:精灵按设备像素 1:1 绘制(SpriteCache.drawPx),关掉插值;
    // 2) 所有血条、装弹条合并成几条路径,每种颜色只 fill 一次(原先每个敌人 2~4 次 fill + save/restore);
    // 3) 眩晕星星与冰封叠加盖在血条之上,与原来单个敌人内的层次一致。
    _renderEnemies(ctx, frozen) {
        const enemies = this.enemies;
        if (enemies.length === 0) return;
        const m = ctx.getTransform(); // 世界变换只有缩放 + 平移(含震屏)
        const snap = { a: m.a, e: m.e, f: m.f };
        Enemy.renderTelegraphs(ctx, enemies);
        ctx.imageSmoothingEnabled = false;
        for (const e of enemies) e.render(ctx, snap);
        ctx.imageSmoothingEnabled = true;
        Enemy.renderBars(ctx, enemies);
        for (const e of enemies) e.renderOverlays(ctx, snap, frozen);
    }

    // 升级光柱:本机玩家脚下升起金色光柱 + 地面光环 + 上升的光点 + 「LEVEL UP」(跟随玩家,纯填充/渐变,无 shadowBlur)
    _renderLevelUpFx(ctx, fx, alpha) {
        const p = this.player;
        const t = 1 - alpha;
        const cx = p.x + p.size / 2, by = p.y + p.size;
        const h = 170 * Math.min(1, t / 0.2), w = p.size * 1.5 * (1 - 0.55 * t);
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = Math.min(1, alpha * 1.4);
        const g = ctx.createLinearGradient(0, by, 0, by - h);
        g.addColorStop(0, 'rgba(255,215,64,0.75)');
        g.addColorStop(0.6, 'rgba(255,235,140,0.3)');
        g.addColorStop(1, 'rgba(255,245,200,0)');
        ctx.fillStyle = g;
        ctx.fillRect(cx - w / 2, by - h, w, h);
        ctx.fillRect(cx - w * 0.18, by - h, w * 0.36, h);   // 叠一层更亮的光芯
        // 地面光环
        const rx = p.size * (0.7 + 1.8 * t);
        ctx.strokeStyle = '#ffd740';
        ctx.lineWidth = 3 * alpha + 1;
        ctx.beginPath();
        ctx.ellipse(cx, by, rx, rx * 0.32, 0, 0, Math.PI * 2);
        ctx.stroke();
        // 上升光点
        ctx.fillStyle = '#fff8e1';
        for (let k = 0; k < 10; k++) {
            const ph = (k * 0.37 + t * 1.6) % 1;
            const sx = cx + Math.sin(k * 2.39) * w * 0.7, sy = by - ph * Math.max(h, 40);
            const sz = 3.5 * (1 - ph) + 1;
            ctx.globalAlpha = alpha * (1 - ph);
            ctx.fillRect(sx - sz / 2, sy - sz / 2, sz, sz);
        }
        ctx.globalCompositeOperation = 'source-over';
        // 文字:先弹出再上飘
        const pop = t < 0.15 ? 0.6 + 0.6 * (t / 0.15) : 1.2 - 0.2 * Math.min(1, (t - 0.15) / 0.2);
        ctx.globalAlpha = Math.min(1, alpha * 2);
        ctx.translate(cx, p.y - 42 - 20 * t);
        ctx.scale(pop, pop);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = 'bold 15px Arial';
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(60,30,0,0.8)';
        ctx.strokeText(`LEVEL UP  Lv ${fx.lv}`, 0, 0);
        ctx.fillStyle = '#ffe082';
        ctx.fillText(`LEVEL UP  Lv ${fx.lv}`, 0, 0);
    }

    _renderEffects() {
        const ctx = this.ctx;
        for (const fx of this.effects) {
            const alpha = Math.max(0, fx.ttl / fx.maxTtl);
            ctx.save();

            if (!fx.type) {
                ctx.globalAlpha = alpha * 0.5;
                const r = Math.max(1, Math.round(fx.radius));
                SpriteCache.draw(ctx, this._fxDotGlow(fx.color, r), fx.x - fx.radius, fx.y - fx.radius, fx.radius * 2, fx.radius * 2);
                ctx.fillStyle = fx.color;
                ctx.beginPath();
                ctx.arc(fx.x, fx.y, fx.radius, 0, Math.PI * 2);
                ctx.fill();
            } else if (fx.type === 'shatter') {
                // 击杀碎裂:先白闪一下,再裂成四块朝四角飞散、旋转、下坠并淡出(纯填充,无 shadowBlur)
                const t = 1 - alpha, s = fx.s, half = s / 2;
                if (t < 0.18) {
                    ctx.globalAlpha = (1 - t / 0.18) * 0.7;
                    ctx.fillStyle = '#ffffff';
                    ctx.fillRect(fx.x - half, fx.y - half, s, s);
                }
                const piece = half * (1 - 0.45 * t), fly = s * 0.25 + s * 1.1 * t * (2 - t), drop = 70 * t * t;
                ctx.globalAlpha = Math.min(1, alpha * 1.6);
                ctx.fillStyle = fx.color;
                ctx.strokeStyle = 'rgba(255,255,255,0.55)';
                ctx.lineWidth = 1;
                ctx.beginPath();
                for (let k = 0; k < 4; k++) {
                    const sx = k & 1 ? 1 : -1, sy = k & 2 ? 1 : -1;
                    const cx = fx.x + sx * fly, cy = fx.y + sy * fly + drop;
                    const ang = sx * sy * t * (0.6 + 1.8 * t), h = piece / 2;
                    const c = Math.cos(ang) * h, sn = Math.sin(ang) * h;
                    ctx.moveTo(cx - c + sn, cy - sn - c);
                    ctx.lineTo(cx + c + sn, cy + sn - c);
                    ctx.lineTo(cx + c - sn, cy + sn + c);
                    ctx.lineTo(cx - c - sn, cy - sn + c);
                    ctx.closePath();
                }
                ctx.fill();
                ctx.stroke();
            } else if (fx.type === 'ring') {
                ctx.globalAlpha = alpha * 0.85;
                ctx.strokeStyle = fx.color;
                ctx.lineWidth = 3;
                const glowed = this._fillArcGlow(ctx, fx.x, fx.y, fx.radius, 3, 22, fx.color);
                ctx.translate(fx.x, fx.y);
                ctx.rotate(fx.rotation || 0);
                if (!glowed) { ctx.shadowBlur = 22; ctx.shadowColor = fx.color; }
                ctx.beginPath();
                ctx.arc(0, 0, fx.radius, 0, Math.PI * 2);
                ctx.stroke();
                // 刻度逐根描边:每根的模糊范围小,比整圈一次模糊便宜
                ctx.shadowBlur = 8;
                ctx.shadowColor = fx.color;
                for (let i = 0; i < 8; i++) {
                    const a = (i / 8) * Math.PI * 2 + (fx.rotation || 0); // 与原实现一致:画布已旋转,角度里再叠一次
                    ctx.beginPath();
                    ctx.moveTo(Math.cos(a) * fx.radius * 0.8, Math.sin(a) * fx.radius * 0.8);
                    ctx.lineTo(Math.cos(a) * fx.radius, Math.sin(a) * fx.radius);
                    ctx.stroke();
                }
                if (fx.rotSpeed) fx.rotation = (fx.rotation || 0) + fx.rotSpeed * DT;
            } else if (fx.type === 'shockwave') {
                const prog = 1 - alpha;
                const r = fx.radius + (fx.maxRadius - fx.radius) * prog;
                ctx.globalAlpha = alpha * 0.7;
                if (!this._fillArcGlow(ctx, fx.x, fx.y, r, 2.5, 18, fx.color)) {
                    ctx.shadowBlur = 18;
                    ctx.shadowColor = fx.color;
                }
                ctx.strokeStyle = fx.color;
                ctx.lineWidth = 2.5;
                ctx.beginPath();
                ctx.arc(fx.x, fx.y, r, 0, Math.PI * 2);
                ctx.stroke();
            } else if (fx.type === 'slash') {
                ctx.globalAlpha = alpha;
                ctx.shadowBlur = 12;
                ctx.shadowColor = fx.color;
                ctx.strokeStyle = fx.color;
                ctx.lineWidth = 3 * alpha;
                ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.moveTo(fx.x1, fx.y1);
                ctx.lineTo(fx.x2, fx.y2);
                ctx.stroke();
            } else if (fx.type === 'arrow') {
                ctx.globalAlpha = alpha;
                ctx.shadowBlur = 14;
                ctx.shadowColor = fx.color;
                ctx.save();
                ctx.translate(fx.x, fx.y);
                ctx.rotate(fx.angle);
                ctx.fillStyle = fx.color;
                ctx.beginPath();
                ctx.moveTo(fx.length, 0);
                ctx.lineTo(-fx.length * 0.6, -4);
                ctx.lineTo(-fx.length * 0.6, 4);
                ctx.closePath();
                ctx.fill();
                ctx.strokeStyle = fx.color;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(-fx.length * 0.6, 0);
                ctx.lineTo(-fx.length, 0);
                ctx.stroke();
                ctx.restore();
            } else if (fx.type === 'holyAura') {
                const pulse = Math.sin(fx.ttl * 8) * 0.3 + 0.7;
                ctx.globalAlpha = alpha * pulse * 0.5;
                const r = Math.max(1, Math.round(fx.radius));
                SpriteCache.draw(ctx, this._fxHolyGlow(fx.color, r), fx.x - fx.radius, fx.y - fx.radius, fx.radius * 2, fx.radius * 2);
                ctx.strokeStyle = fx.color;
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.arc(fx.x, fx.y, fx.radius, 0, Math.PI * 2);
                ctx.stroke();
                ctx.globalAlpha = alpha * pulse * 0.12;
                ctx.fillStyle = fx.color;
                ctx.fill();
            } else if (fx.type === 'floatText') {
                const prog = 1 - alpha;
                ctx.globalAlpha = alpha;
                ctx.shadowBlur = 8;
                ctx.shadowColor = fx.color;
                ctx.fillStyle = fx.color;
                ctx.font = `bold ${fx.size || 14}px Arial`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(fx.text, fx.x, fx.y - prog * 24);
            } else if (fx.type === 'meleeSwing') {
                const prog = 1 - alpha;
                const r = fx.radius * (0.6 + prog * 0.4);
                ctx.globalAlpha = alpha * 0.6;
                if (!this._fillArcGlow(ctx, fx.x, fx.y, r, 4, 16, fx.color, fx.startAngle, fx.endAngle)) {
                    ctx.shadowBlur = 16;
                    ctx.shadowColor = fx.color;
                }
                ctx.strokeStyle = fx.color;
                ctx.lineWidth = 4;
                ctx.beginPath();
                ctx.arc(fx.x, fx.y, r, fx.startAngle, fx.endAngle);
                ctx.stroke();
            } else if (fx.type === 'lightning') {
                // 连锁闪电:彩色粗线打底 + 白色细芯
                const pts = fx.pts;
                ctx.globalAlpha = alpha;
                ctx.lineJoin = 'round';
                ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.moveTo(pts[0], pts[1]);
                for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
                ctx.shadowBlur = 12;
                ctx.shadowColor = fx.color;
                ctx.strokeStyle = fx.color;
                ctx.lineWidth = 4;
                ctx.stroke();
                ctx.shadowBlur = 0;
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 1.5;
                ctx.stroke();
            } else if (fx.type === 'iceShard') {
                const prog = 1 - alpha;
                const dist = fx.length * 2 * prog + fx.length;
                const endX = fx.x + Math.cos(fx.angle) * dist;
                const endY = fx.y + Math.sin(fx.angle) * dist;
                ctx.globalAlpha = alpha;
                ctx.shadowBlur = 10;
                ctx.shadowColor = fx.color;
                ctx.strokeStyle = fx.color;
                ctx.lineWidth = 2;
                ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.moveTo(fx.x + Math.cos(fx.angle) * dist * 0.6, fx.y + Math.sin(fx.angle) * dist * 0.6);
                ctx.lineTo(endX, endY);
                ctx.stroke();
            } else if (fx.type === 'levelUp') {
                this._renderLevelUpFx(ctx, fx, alpha);
            }

            ctx.restore();
        }
    }

    // 冲刺按钮:圆形,位于 E 技能槽正上方(未选职业时也显示);触屏点它冲刺,键盘为空格/Shift
    // ══════════════════════════════════════════════════════════════════
    //  构筑面板(DOM):天赋树(SVG,可拖动/缩放)+ 技能石镶嵌。
    //  打开时暂停(联机房主暂停全场,与升级菜单一致;guest 只停自己并受保护)
    // ══════════════════════════════════════════════════════════════════
    openBuild(tab) {
        if (!this.isRunning || this.showingBuild || this.showingClassSelection || this.showingPotentialMenu) return;
        if (!this._buildInited) this._initBuildPanel();
        this.showingBuild = true;
        this._buildPaused = !this.isPaused;
        this.isPaused = true;
        this.keys = {};
        this.joy.active = false;
        this._setJoyVector(0, 0);
        this.aim.active = false;
        document.getElementById('buildOverlay').style.display = 'flex';
        const p = this.player;
        this._treeSel = this._treeSel && p.treeNodes ? this._treeSel : null;
        this._gemSel = null;
        this._gemMsg = '';
        this._buildShowTab(tab || (this._treePoints().free > 0 ? 'tree' : p._newGem ? 'gems' : (this._buildTab || 'tree')));
        this._treeFit();
    }

    closeBuild() {
        if (!this.showingBuild) return;
        this.showingBuild = false;
        document.getElementById('buildOverlay').style.display = 'none';
        if (this._buildPaused) this.isPaused = false;
        this._buildPaused = false;
    }

    _buildShowTab(tab) {
        this._buildTab = tab;
        document.querySelectorAll('.build-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
        document.getElementById('buildTree').style.display = tab === 'tree' ? 'flex' : 'none';
        document.getElementById('buildGems').style.display = tab === 'gems' ? 'block' : 'none';
        if (tab === 'gems') this.player._newGem = false;
        this._buildRefresh();
    }

    _buildRefresh() {
        const free = this._treePoints().free;
        document.getElementById('treePts').textContent = free > 0 ? free : '';
        document.getElementById('gemNew').textContent = this.player._newGem ? '新' : '';
        if (this._buildTab === 'tree') this._treeRefresh();
        else this._gemRefresh();
    }

    _initBuildPanel() {
        this._buildInited = true;
        const NS = 'http://www.w3.org/2000/svg';
        const svg = document.getElementById('treeSvg');
        const mk = (tag, attrs, parent) => {
            const el = document.createElementNS(NS, tag);
            for (const k in attrs) el.setAttribute(k, attrs[k]);
            if (parent) parent.appendChild(el);
            return el;
        };
        const deco = mk('g', {}, svg);
        for (const r of [88, 162, 243, 318, 398]) mk('circle', { class: 'orbit', r }, deco);
        const links = mk('g', {}, svg);
        this._treeLinkEls = TREE_LINKS.map(([a, b]) => {
            const A = TREE_BY_ID[a], B = TREE_BY_ID[b];
            return { a, b, el: mk('line', { class: 'tl', x1: A.x, y1: A.y, x2: B.x, y2: B.y }, links) };
        });
        const nodes = mk('g', {}, svg);
        const R = { start: 22, small: 14, notable: 22, socket: 19, keystone: 28 };
        this._treeNodeEls = {};
        for (const n of TREE_NODES) {
            const g = mk('g', { class: `tn k-${n.kind}`, transform: `translate(${n.x} ${n.y})` }, nodes);
            g.dataset.id = n.id;
            g.style.setProperty('--c', TREE_COLORS[n.br]);
            mk('circle', { class: 'hit', r: 34 }, g);
            if (n.kind === 'keystone') mk('circle', { class: 'ring', r: R.keystone + 7 }, g);
            if (n.kind === 'socket') mk('rect', { class: 'body', x: -R.socket, y: -R.socket, width: R.socket * 2, height: R.socket * 2, rx: 7 }, g);
            else mk('circle', { class: 'body', r: R[n.kind] }, g);
            if (n.icon || n.kind === 'start') {
                const t = mk('text', { class: 'icon', 'font-size': n.kind === 'keystone' ? 24 : 18 }, g);
                t.textContent = n.icon || '✦';
            }
            if (n.kind !== 'small' && n.kind !== 'start') {
                const t = mk('text', { class: 'lbl', y: R[n.kind] + (n.kind === 'keystone' ? 24 : 17) }, g);
                t.textContent = n.name;
            }
            this._treeNodeEls[n.id] = g;
        }

        // 拖动平移 / 双指或滚轮缩放 / 轻点选择(再点一次已选中的可点亮节点 = 点亮)
        const ptrs = new Map();
        let drag = null;
        const toSvg = (cx, cy) => {
            const pt = svg.createSVGPoint();
            pt.x = cx; pt.y = cy;
            return pt.matrixTransform(svg.getScreenCTM().inverse());
        };
        const unitsPerPx = () => {
            const r = svg.getBoundingClientRect(), v = this._treeView;
            return Math.max(v.w / (r.width || 1), v.h / (r.height || 1));
        };
        svg.addEventListener('pointerdown', (e) => {
            svg.setPointerCapture(e.pointerId);
            ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
            if (ptrs.size === 1) {
                const node = e.target.closest && e.target.closest('.tn');
                drag = { moved: 0, node: node ? node.dataset.id : null };
            } else if (drag) {
                drag.moved = 99;
            }
        });
        svg.addEventListener('pointermove', (e) => {
            const prev = ptrs.get(e.pointerId);
            if (!prev || !drag) return;
            const cur = { x: e.clientX, y: e.clientY };
            if (ptrs.size === 1) {
                const dx = cur.x - prev.x, dy = cur.y - prev.y;
                drag.moved += Math.abs(dx) + Math.abs(dy);
                if (drag.moved > 6) {
                    const k = unitsPerPx();
                    this._treeView.x -= dx * k;
                    this._treeView.y -= dy * k;
                    this._treeApplyView();
                }
            } else if (ptrs.size === 2) {
                const [a, b] = [...ptrs.entries()].map(([id, p]) => id === e.pointerId ? cur : p);
                const [a0, b0] = [...ptrs.values()];
                const d0 = Math.hypot(a0.x - b0.x, a0.y - b0.y), d1 = Math.hypot(a.x - b.x, a.y - b.y);
                if (d0 > 0 && d1 > 0) {
                    const mid = toSvg((a.x + b.x) / 2, (a.y + b.y) / 2);
                    this._treeZoom(d0 / d1, mid.x, mid.y);
                }
            }
            ptrs.set(e.pointerId, cur);
        });
        const up = (e) => {
            if (!ptrs.has(e.pointerId)) return;
            ptrs.delete(e.pointerId);
            if (ptrs.size === 0 && drag) {
                if (drag.moved <= 6 && e.type === 'pointerup') this._treeTap(drag.node);
                drag = null;
            }
        };
        svg.addEventListener('pointerup', up);
        svg.addEventListener('pointercancel', up);
        svg.addEventListener('wheel', (e) => {
            e.preventDefault();
            const m = toSvg(e.clientX, e.clientY);
            this._treeZoom(e.deltaY > 0 ? 1.15 : 1 / 1.15, m.x, m.y);
        }, { passive: false });
        document.querySelectorAll('.tree-zoom button').forEach(b => b.addEventListener('click', () => {
            const v = this._treeView;
            if (b.dataset.zoom === 'fit') this._treeFit();
            else this._treeZoom(b.dataset.zoom === 'in' ? 1 / 1.3 : 1.3, v.x + v.w / 2, v.y + v.h / 2);
        }));

        document.querySelectorAll('.build-tab').forEach(b => b.addEventListener('click', () => this._buildShowTab(b.dataset.tab)));
        document.getElementById('buildClose').addEventListener('click', () => this.closeBuild());
        document.getElementById('buildOverlay').addEventListener('click', (e) => {
            if (e.target.id === 'buildOverlay') this.closeBuild();
        });
        document.getElementById('treeReset').addEventListener('click', () => {
            if (this.player.treeNodes.size <= 1) return;
            this._treeReset();
            this._buildRefresh();
        });
        document.getElementById('treeInfo').addEventListener('click', (e) => {
            if (!e.target.closest('.ti-act') || !this._treeSel) return;
            const id = this._treeSel;
            if (this.player.treeNodes.has(id)) this._treeRefund(id);
            else this._treeAllocate(id);
            this._buildRefresh();
        });
        document.getElementById('buildGems').addEventListener('click', (e) => this._gemClick(e));
    }

    _treeApplyView() {
        const v = this._treeView;
        document.getElementById('treeSvg').setAttribute('viewBox', `${v.x} ${v.y} ${v.w} ${v.h}`);
    }

    _treeFit() {
        this._treeView = { x: -440, y: -470, w: 880, h: 910 };   // 上方多留一点,别让图例压住顶端的基石
        this._treeApplyView();
    }

    // 以 (cx,cy)(SVG 坐标)为中心缩放;f > 1 拉远
    _treeZoom(f, cx, cy) {
        const v = this._treeView;
        const nw = Math.max(240, Math.min(1100, v.w * f));
        const k = nw / v.w;
        v.x = cx - (cx - v.x) * k;
        v.y = cy - (cy - v.y) * k;
        v.w = nw;
        v.h = v.h * k;
        this._treeApplyView();
    }

    _treeTap(id) {
        if (!id) return;
        const p = this.player;
        if (this._treeSel === id && !p.treeNodes.has(id) && this._treeCanAlloc(p, id)) this._treeAllocate(id);
        this._treeSel = id;
        this._buildRefresh();
    }

    _treeRefresh() {
        const p = this.player;
        const pts = this._treePoints();
        const can = id => !p.treeNodes.has(id) && TREE_ADJ[id].some(n => p.treeNodes.has(n)) && pts.free > 0;
        for (const n of TREE_NODES) {
            const g = this._treeNodeEls[n.id];
            g.classList.toggle('on', p.treeNodes.has(n.id));
            g.classList.toggle('can', can(n.id));
            g.classList.toggle('sel', this._treeSel === n.id);
        }
        for (const l of this._treeLinkEls) {
            const ia = p.treeNodes.has(l.a), ib = p.treeNodes.has(l.b);
            l.el.classList.toggle('on', ia && ib);
            l.el.classList.toggle('can', (ia && can(l.b)) || (ib && can(l.a)));
        }
        // 选中节点详情
        const info = document.getElementById('treeInfo');
        const n = this._treeSel && TREE_BY_ID[this._treeSel];
        if (!n) {
            info.style.removeProperty('--c');
            info.innerHTML = `<div class="ti-name">天赋点 ${pts.free} / ${pts.total}</div>
                <div class="ti-hint">每升 1 级、每击退 1 次魔王获得 1 点。点选节点查看效果,再点一次(或按下方按钮)点亮。只能点亮与已点亮节点相连的节点;尽头的「基石」会改变玩法,但有代价。拖动平移,双指或滚轮缩放。</div>`;
        } else {
            const kindName = { start: '起点', small: '小天赋', notable: '大天赋', socket: '连接孔', keystone: '基石' }[n.kind];
            const brName = TREE_BRANCH_NAMES[n.br] || (n.br === 'mix' ? '混合' : '');
            const lines = n.kind === 'start' ? [n.desc] : treeModLines(n.mods);
            const on = p.treeNodes.has(n.id);
            let btn;
            if (n.kind === 'start') btn = '';
            else if (on) btn = this._treeCanRefund(p, n.id)
                ? `<button class="mp-btn mp-btn-ghost ti-act">取消点亮(返还 1 点)</button>`
                : `<button class="mp-btn mp-btn-ghost ti-act" disabled>需先取消更外侧的节点</button>`;
            else if (!TREE_ADJ[n.id].some(x => p.treeNodes.has(x))) btn = `<button class="mp-btn mp-btn-primary ti-act" disabled>需要先点亮相连的节点</button>`;
            else if (pts.free <= 0) btn = `<button class="mp-btn mp-btn-primary ti-act" disabled>没有天赋点(升级/击退魔王获得)</button>`;
            else btn = `<button class="mp-btn mp-btn-primary ti-act">点亮(剩余 ${pts.free} 点)</button>`;
            info.style.setProperty('--c', TREE_COLORS[n.br]);
            info.innerHTML = `<div><span class="ti-name" style="color:${TREE_COLORS[n.br]}">${n.name}</span><span class="ti-kind">${kindName}${brName ? ' · ' + brName : ''}${on && n.kind !== 'start' ? ' · 已点亮' : ''}</span></div>
                <ul>${lines.map(l => `<li>${l}</li>`).join('')}</ul>${btn}`;
        }
        const sum = treeModLines(p.tree);
        document.getElementById('treeSummary').innerHTML = `<b>已点亮 ${pts.used} 个节点</b>${sum.length ? '<br>' + sum.join('<br>') : '<br>还没有点亮任何天赋'}`;
    }

    _gemRefresh() {
        const p = this.player;
        const map = this._gemMap(p);
        const counts = map.counts;
        const sel = this._gemSel;
        const rows = GEM_SLOTS.map(slot => {
            const title = slot === 'a' ? '普攻' : `${slot.toUpperCase()} 技能`;
            const sub = slot === 'a' ? (p.class === 'warrior' || p.class === 'paladin' ? '近战' : '远程')
                : !p.class ? '选择职业后生效'
                : p.class === 'mage' && slot === 'q' ? '魔力涌注 · 开启时作用于普攻'
                : SKILL_NAMES[p.class][slot];
            const n = this._socketCount(p, slot);
            const socks = [];
            for (let i = 0; i < 3; i++) {
                if (i > 0) socks.push('<span class="gem-link"></span>');
                const id = p.sockets[slot][i];
                if (i >= n) { socks.push(`<button class="sock locked" title="天赋树连接孔节点解锁">🔒<small>天赋树</small></button>`); continue; }
                if (id && counts[id]) {
                    const bad = gemMisfit(id, slot, p.class);
                    socks.push(`<button class="sock filled${bad ? ' bad' : ''}" style="--c:${GEMS[id].color}" data-slot="${slot}" data-i="${i}" title="${GEMS[id].name}">${GEMS[id].icon}<small>Lv${counts[id]}</small></button>`);
                } else {
                    const fit = sel && gemCanPlace(sel, slot, p.class) && !gemMisfit(sel, slot, p.class);
                    socks.push(`<button class="sock${fit ? ' target' : ''}" data-slot="${slot}" data-i="${i}">+</button>`);
                }
            }
            return `<div class="gem-row"><div class="gem-row-title">${title}<small>${sub}</small></div><div class="gem-socks">${socks.join('')}</div></div>`;
        });
        document.getElementById('gemSlots').innerHTML = rows.join('');

        const owned = GEM_TYPES.filter(id => counts[id]);
        const where = id => GEM_SLOTS.find(s => p.sockets[s].slice(0, this._socketCount(p, s)).includes(id));
        document.getElementById('gemBag').innerHTML = owned.length ? owned.map(id => {
            const w = where(id);
            const tag = w ? `已镶:${w === 'a' ? '普攻' : w.toUpperCase()}` : '未镶嵌';
            return `<button class="gem-card${sel === id ? ' sel' : ''}" style="--c:${GEMS[id].color}" data-gem="${id}">
                <span class="gc-icon">${GEMS[id].icon}</span><span><b>${GEMS[id].name} Lv${counts[id]}</b><small>${tag}</small></span></button>`;
        }).join('') : '<div class="gem-empty">还没有技能石。地上发光的宝石就是技能石:定时掉落,精英、宝藏方块和魔王也会掉。</div>';

        const info = document.getElementById('gemInfo');
        const msg = this._gemMsg ? `<div class="gi-warn">${this._gemMsg}</div>` : '';
        if (sel && GEMS[sel]) {
            const g = GEMS[sel], lv = counts[sel];
            const next = lv < 3 ? `<span class="gi-hint">(Lv${lv + 1}:${g.desc(g.val[lv])})</span>` : '<span class="gi-hint">(已满级)</span>';
            const slots = g.slots.split('').map(s => s === 'a' ? '普攻' : s.toUpperCase()).join(' / ');
            info.innerHTML = `<div class="gi-name" style="color:${g.color}">${g.icon} ${g.name} Lv${lv}</div>
                <div>${g.desc(g.val[lv - 1])} ${next}</div>
                <div class="gi-hint">可镶嵌:${slots} · 点击上方空孔镶嵌,已镶在别处会移过来</div>${msg}`;
        } else {
            info.innerHTML = `<div class="gi-hint">在背包里选一颗技能石,再点上方的孔把它镶进去;点已镶的宝石可以取下。
                同种技能石再捡到会升级(最高 Lv3)。灰色表示对当前职业的该技能无效。</div>${msg}`;
        }
    }

    _gemClick(e) {
        const card = e.target.closest('.gem-card');
        const sock = e.target.closest('.sock');
        this._gemMsg = '';
        if (card) {
            this._gemSel = this._gemSel === card.dataset.gem ? null : card.dataset.gem;
        } else if (sock && sock.dataset.slot) {
            const slot = sock.dataset.slot, i = +sock.dataset.i;
            const cur = this.player.sockets[slot][i];
            if (this._gemSel) {
                const bad = gemMisfit(this._gemSel, slot, this.player.class);
                if (!gemCanPlace(this._gemSel, slot, this.player.class)) {
                    this._gemMsg = `「${GEMS[this._gemSel].name}」${bad || '不能镶在这里'}`;
                } else {
                    this._socketGem(slot, i, this._gemSel);
                    if (bad) this._gemMsg = `已镶嵌,但${bad}`;
                    this._gemSel = null;
                }
            } else if (cur) {
                this._socketGem(slot, i, null);
                this._gemSel = cur;
            } else {
                this._gemMsg = '先在下方背包里选一颗技能石';
            }
        } else {
            return;
        }
        this._buildRefresh();
    }

    // HUD「构筑」按钮(冲刺键左侧);有未用天赋点 / 新宝石时角标提醒
    _renderBuildButton() {
        if (!this.isRunning) return;
        const ctx = this.ctx;
        const s = 40;
        const x = this._hud.w - 48 - 24 - 14 - s, y = this._hud.h - 82 - 12 - 24 - 12 - s / 2;
        this._hudButton(x - 2, y - 2, s + 4, s + 4, 'build');
        const free = this._treePoints().free;
        const alert = free > 0 || this.player._newGem;
        ctx.save();
        ctx.fillStyle = alert ? 'rgba(255,215,64,0.16)' : 'rgba(0,0,0,0.55)';
        roundRect(ctx, x, y, s, s, 9);
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = alert ? `rgba(255,215,64,${0.55 + 0.4 * Math.abs(Math.sin(this.bgTime * 3))})` : 'rgba(0,200,255,0.45)';
        roundRect(ctx, x, y, s, s, 9);
        ctx.stroke();
        ctx.fillStyle = alert ? '#ffd740' : '#c8e8ff';
        ctx.font = 'bold 13px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('构筑', x + s / 2, y + s / 2 - 4);
        ctx.fillStyle = '#9fb3c8';
        ctx.font = '9px Arial';
        ctx.fillText('B', x + s / 2, y + s / 2 + 11);
        if (alert) {
            const bx = x + s - 2, by = y + 2;
            ctx.fillStyle = '#ff5252';
            ctx.beginPath();
            ctx.arc(bx, by, 8, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 10px Arial';
            ctx.fillText(free > 0 ? String(free) : '!', bx, by + 0.5);
        }
        ctx.restore();
    }

    _renderDashButton() {
        if (!this.isRunning) return;
        const p = this.player;
        const ctx = this.ctx;
        const r = 24;
        const cx = this._hud.w - 48, cy = this._hud.h - 82 - 12 - r - 12;
        this._hudButton(cx - r - 4, cy - r - 4, r * 2 + 8, r * 2 + 8, 'dash');
        const dashMax = p.dashCdTotal();
        const ratio = dashMax > 0 ? Math.max(0, Math.min(1, p.dashCooldown / dashMax)) : 0;
        const ready = ratio <= 0;
        const col = '#80d8ff';
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fillStyle = ready ? 'rgba(128,216,255,0.18)' : 'rgba(0,0,0,0.6)';
        ctx.shadowBlur = ready ? 14 : 0;
        ctx.shadowColor = col;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.lineWidth = 2;
        ctx.strokeStyle = ready ? 'rgba(128,216,255,0.85)' : '#555555';
        ctx.stroke();
        if (!ready) {
            // 冷却扇形:顺时针恢复
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - ratio));
            ctx.closePath();
            ctx.fillStyle = 'rgba(128,216,255,0.22)';
            ctx.fill();
        }
        ctx.fillStyle = ready ? col : '#9e9e9e';
        ctx.font = 'bold 18px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(ready ? '冲' : p.dashCooldown.toFixed(1), cx, cy - (ready ? 3 : 0));
        if (ready) {
            ctx.fillStyle = '#cccccc';
            ctx.font = '9px Arial';
            ctx.fillText('空格', cx, cy + 13);
        }
        ctx.restore();
    }

    _renderSkillHUD() {
        if (!this.player.class) return;
        const ctx = this.ctx;
        ctx.save();

        const cls = this.player.class;
        const slotW = 56, slotH = 56, slotR = 8;
        const margin = 10;
        const baseX = this._hud.w - (slotW * 2 + margin * 3);
        const baseY = this._hud.h - slotH - margin * 2 - 16;

        // 技能命中区每帧由 render 清空后重新登记
        this._hudButton(baseX, baseY, slotW, slotH, 'Q');
        this._hudButton(baseX + slotW + margin, baseY, slotW, slotH, 'E');

        const qNames = { warrior: '旋', mage: '弹', assassin: '闪', archer: '穿', paladin: '圣' };
        const eNames = { warrior: '盾', mage: '斥', assassin: '刺', archer: '雨', paladin: '环' };
        const qColors = { warrior: '#ff6030', mage: '#4ecdc4', assassin: '#aa66ff', archer: '#aaff44', paladin: '#ffd700' };
        const eColors = { warrior: '#4488ff', mage: '#88eeff', assassin: '#ffffff', archer: '#88ff44', paladin: '#fff8dc' };

        const sp = specDef(this.player);
        const slots = [
            { skill: this.player.skillQ, key: 'q', label: 'Q', icon: (sp && sp.q) || qNames[cls] || 'Q', color: qColors[cls] || '#fff', x: baseX },
            { skill: this.player.skillE, key: 'e', label: 'E', icon: (sp && sp.e) || eNames[cls] || 'E', color: eColors[cls] || '#fff', x: baseX + slotW + margin }
        ];
        // 职业 / 专精名牌(技能槽上方)
        {
            const tag = sp ? `${sp.icon} ${sp.name}${this.player.awakened ? ' · 觉醒' : ''}` : CLASS_NAMES[cls];
            ctx.save();
            ctx.font = 'bold 11px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.fillStyle = this.player.awakened ? '#ffe082' : (CLASS_COLORS[cls] || '#ffffff');
            ctx.fillText(tag, baseX + slotW + margin / 2, baseY - (cls === 'mage' && this.player.qToggleActive ? 20 : 6));
            ctx.restore();
        }

        for (const s of slots) {
            const cdRatio = s.skill.maxCooldown > 0 ? Math.max(0, Math.min(1, s.skill.cooldown / s.skill.maxCooldown)) : 0;
            const ready = cdRatio <= 0;

            ctx.shadowBlur = ready ? 16 : 4;
            ctx.shadowColor = ready ? s.color : '#333333';
            ctx.fillStyle = ready ? `${s.color}33` : 'rgba(0,0,0,0.6)';
            roundRect(ctx, s.x, baseY, slotW, slotH, slotR);
            ctx.fill();

            ctx.strokeStyle = ready ? `${s.color}cc` : '#555555';
            ctx.lineWidth = 2;
            roundRect(ctx, s.x, baseY, slotW, slotH, slotR);
            ctx.stroke();

            ctx.shadowBlur = ready ? 10 : 0;
            ctx.shadowColor = s.color;
            ctx.fillStyle = ready ? s.color : '#888888';
            ctx.font = `bold 22px Arial`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(s.icon, s.x + slotW / 2, baseY + slotH / 2 - 4);

            ctx.shadowBlur = 0;
            ctx.fillStyle = '#cccccc';
            ctx.font = `11px Arial`;
            ctx.fillText(s.label, s.x + slotW / 2, baseY + slotH / 2 + 14);

            // 已镶嵌且生效的技能石:槽顶一排小宝石点
            const gems = Object.keys(this._gemMap(this.player)[s.key]);
            gems.forEach((id, gi) => {
                const gx = s.x + slotW / 2 + (gi - (gems.length - 1) / 2) * 10, gy = baseY + 7;
                ctx.fillStyle = GEMS[id].color;
                ctx.beginPath();
                ctx.moveTo(gx, gy - 4); ctx.lineTo(gx + 3.5, gy); ctx.lineTo(gx, gy + 4); ctx.lineTo(gx - 3.5, gy);
                ctx.closePath();
                ctx.fill();
            });

            if (cdRatio > 0) {
                ctx.fillStyle = 'rgba(0,0,0,0.55)';
                roundRect(ctx, s.x, baseY, slotW, slotH * cdRatio, slotR);
                ctx.fill();

                ctx.fillStyle = '#ffffff';
                ctx.font = `bold 13px Arial`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(s.skill.cooldown.toFixed(1), s.x + slotW / 2, baseY + slotH / 2);
            }

            ctx.fillStyle = '#aaaaaa';
            ctx.font = `10px Arial`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillText(`Lv${s.skill.level}`, s.x + slotW / 2, baseY + slotH + 3);

            const barW = slotW;
            const barH = 5;
            const barY2 = baseY + slotH + 14;
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            roundRect(ctx, s.x, barY2, barW, barH, 2);
            ctx.fill();
            if (cdRatio > 0) {
                ctx.fillStyle = s.color;
                ctx.shadowBlur = 4;
                ctx.shadowColor = s.color;
                roundRect(ctx, s.x, barY2, barW * (1 - cdRatio), barH, 2);
                ctx.fill();
                ctx.shadowBlur = 0;
            } else {
                ctx.fillStyle = s.color;
                ctx.shadowBlur = 6;
                ctx.shadowColor = s.color;
                roundRect(ctx, s.x, barY2, barW, barH, 2);
                ctx.fill();
                ctx.shadowBlur = 0;
            }
        }

        if (cls === 'mage') {
            this._renderResourceBar(baseX - 22, baseY, 14, slotH + 20, this.player.mana, this.player.maxMana, '#00ccff', '#0044aa', '法');
        } else if (cls === 'paladin') {
            this._renderResourceBar(baseX - 22, baseY, 14, slotH + 20, this.player.faith, this.player.maxFaith, '#ffd700', '#aa6600', '信');
        } else if (cls === 'warrior') {
            this._renderResourceBar(baseX - 22, baseY, 14, slotH + 20, this.player.rage, this.player.maxRage, '#ff5722', '#7f0000', '怒');
        } else if (cls === 'archer') {
            this._renderArrowBar(baseX - 22, baseY, 14, slotH + 20);
        } else if (cls === 'assassin') {
            this._renderResourceBar(baseX - 22, baseY, 14, slotH + 20, this.player.assassinCharge, this.player.maxAssassinCharge, '#ce93d8', '#4a148c', '蓄');
        }

        // 法师 Q 开关激活时,在 Q 槽周围加发光指示 + 显示每次普攻消耗
        if (cls === 'mage' && this.player.qToggleActive) {
            const qSlotX = slots[0].x;
            ctx.save();
            ctx.strokeStyle = '#4dd0e1';
            ctx.lineWidth = 3;
            ctx.shadowBlur = 18;
            ctx.shadowColor = '#4dd0e1';
            roundRect(ctx, qSlotX - 3, baseY - 3, slotW + 6, slotH + 6, slotR + 2);
            ctx.stroke();
            ctx.shadowBlur = 0;
            const cost = Math.max(1, Math.ceil(this.player.maxMana * 0.10 * (this.player.mageQCostMult || 1)));
            ctx.fillStyle = '#4dd0e1';
            ctx.font = 'bold 10px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.fillText(`-${cost}/发`, qSlotX + slotW / 2, baseY - 6);
            ctx.restore();
        }

        // 触屏/鼠标提示:选职业后前 12s 显示"可点击"小字
        if (this.player.class && this.gameTime < 12) {
            const alpha = Math.min(1, (12 - this.gameTime) / 3); // 最后 3s 渐隐
            ctx.save();
            ctx.globalAlpha = alpha * 0.7;
            ctx.fillStyle = '#ffffff';
            ctx.font = '11px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillText('可点击', baseX + slotW / 2, baseY + slotH + 22);
            ctx.fillText('可点击', baseX + slotW + margin + slotW / 2, baseY + slotH + 22);
            ctx.restore();
        }

        ctx.restore();
    }

    _renderArrowBar(x, y, w, h, label = '箭') {
        const ctx = this.ctx;
        const max = this.player.maxArrows;
        const cur = this.player.arrows;
        const reloading = this.player.reloadTimer > 0;
        const reloadProg = reloading ? 1 - (this.player.reloadTimer / this.player.reloadDuration) : 0;

        // 背景
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        roundRect(ctx, x, y, w, h, 4);
        ctx.fill();

        // 每个箭槽(从底到顶)
        const gap = 2;
        const slotH = (h - gap * (max + 1)) / max;
        // 已装填的箭槽合并成一条路径,只做一次带光晕的 fill
        if (cur > 0) {
            ctx.fillStyle = '#aaff44';
            ctx.shadowBlur = 6;
            ctx.shadowColor = '#aaff44';
            ctx.beginPath();
            for (let i = 0; i < Math.min(cur, max); i++) addRoundRect(ctx, x + 2, y + h - gap - (i + 1) * slotH - i * gap, w - 4, slotH, 2);
            ctx.fill();
            ctx.shadowBlur = 0;
        }
        for (let i = 0; i < max; i++) {
            const slotY = y + h - gap - (i + 1) * slotH - i * gap;
            const filled = i < cur;
            // 正在装填的"下一格"显示填充进度(对应箭袋中第 cur 槽,从 0 开始)
            const isReloadingSlot = reloading && i === cur;

            if (filled) {
                // 已在上面合批画过
            } else if (isReloadingSlot) {
                // 装填进度从底部往上充
                const fillH = slotH * reloadProg;
                ctx.fillStyle = 'rgba(170,255,68,0.35)';
                roundRect(ctx, x + 2, slotY + slotH - fillH, w - 4, fillH, 2);
                ctx.fill();
                ctx.strokeStyle = 'rgba(170,255,68,0.6)';
                ctx.lineWidth = 1;
                roundRect(ctx, x + 2, slotY, w - 4, slotH, 2);
                ctx.stroke();
            } else {
                // 空槽
                ctx.strokeStyle = 'rgba(170,255,68,0.25)';
                ctx.lineWidth = 1;
                roundRect(ctx, x + 2, slotY, w - 4, slotH, 2);
                ctx.stroke();
            }
        }

        // 外框
        ctx.strokeStyle = 'rgba(170,255,68,0.6)';
        ctx.lineWidth = 1.5;
        roundRect(ctx, x, y, w, h, 4);
        ctx.stroke();

        // 标签
        ctx.fillStyle = '#aaff44';
        ctx.font = `bold 10px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(label, x + w / 2, y - 2);
    }

    _renderResourceBar(x, y, w, h, current, max, colorA, colorB, label) {
        const ctx = this.ctx;
        const ratio = max > 0 ? current / max : 0;
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        roundRect(ctx, x, y, w, h, 4);
        ctx.fill();

        const fillH = h * ratio;
        const grad = ctx.createLinearGradient(x, y + h - fillH, x, y + h);
        grad.addColorStop(0, colorA);
        grad.addColorStop(1, colorB);
        ctx.fillStyle = grad;
        ctx.shadowBlur = 8;
        ctx.shadowColor = colorA;
        roundRect(ctx, x, y + h - fillH, w, fillH, 4);
        ctx.fill();
        ctx.shadowBlur = 0;

        ctx.strokeStyle = `${colorA}99`;
        ctx.lineWidth = 1.5;
        roundRect(ctx, x, y, w, h, 4);
        ctx.stroke();

        ctx.fillStyle = colorA;
        ctx.font = `bold 10px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(label, x + w / 2, y - 2);
    }
}

class Player {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.size = 30;
        this.speed = 5;
        this.color = '#4CAF50';
        this.maxHealth = 100;
        this.currentHealth = 100;
        this.attack = 20;
        this.defense = 10;
        this.potentialPoints = 0;
        this.frenzyTier = 0;
        this.blessTimer = 0;          // 祝福祭坛的增益剩余秒数(伤害/移速见 Game.BLESS)
        
        this.class = null;

        this.skillQ = { cooldown: 0, maxCooldown: 3, level: 1 };
        this.skillE = { cooldown: 0, maxCooldown: 5, level: 1 };

        this.mana = 10;
        this.maxMana = 10;
        this.manaRegen = 1;

        this.faith = 50;
        this.maxFaith = 100;
        this.faithRegen = 5;
        this.holyAuraActive = false;
        this.holyAuraTimer = 0;

        // 战士怒气资源:攻击/受伤/击杀 时获取,技能消耗
        this.rage = 0;
        this.maxRage = 100;
        this.rageGainMult = 1; // 战士天赋"怒火中烧"用

        // 弓手箭矢资源:技能消耗,空袋后启动装填
        this.arrows = 5;
        this.maxArrows = 5;
        this.reloadTimer = 0;     // > 0 表示装填中
        this.reloadDuration = 1.5;

        // 法师 Q 开关
        this.qToggleActive = false;

        // 圣骑士护盾(持续生成,上限 maxHealth × shieldCapRatio)
        this.shield = 0;
        this.shieldCapRatio = 0.10;

        // 刺客移动蓄力
        this.assassinCharge = 0;
        this.maxAssassinCharge = 100;
        this.lastChargeX = x;
        this.lastChargeY = y;
        this.chargeGainMult = 1;

        this.stunTimer = 0;

        this.hurtCooldown = 0;
        this.invincibleTimer = 0;
        this.invincibleSizeBonus = 0;
        this.invincibleAttackBonus = 0;
        this.invincibleDefenseBonus = 0;

        this.targetX = null;
        this.targetY = null;
        this.moving = false;

        // 冲刺闪避:沿最近的移动方向瞬间位移,冲刺途中无敌;冲刺中躲掉一次伤害 = 完美闪避
        this.dashCooldown = 0;
        this.dashMaxCooldown = 2.2;
        this.dashTimer = 0;            // > 0 表示正在冲刺(同时是无敌窗口)
        this.dashDuration = 0.18;
        this.dashSpeed = 11;           // 像素/帧,约 120px 一次
        this.dashVX = 0;
        this.dashVY = 0;
        this.dashDodged = false;       // 本次冲刺是否已触发过完美闪避
        this.dodgeCount = 0;           // 本局完美闪避次数
        this.combo = 0;                // 连杀数:击杀间隔不超过 Game.COMBO_WINDOW 秒就累加
        this.comboTimer = 0;           // 连杀剩余时间(秒),归零时连杀中断
        this.maxCombo = 0;             // 本局最高连杀
        this.dmgStats = {};            // 本局造成伤害按来源累计 { a, q, e, dot, gear, body, other }(见 Game._recDmg)
        this.faceX = 1;                // 最近一次移动方向(冲刺方向)
        this.faceY = 0;
        this._dashGhosts = [];         // 冲刺残影(纯视觉,render 时记录)

        // 限时装备 { type, timer, max, cd, angle } | null(见 GEARS / Game._tickGear)
        this.gear = null;

        // 天赋(按玩家存储;联机时每个 guest 各有一份)
        this.acquiredTalents = [];      // [{ id, count }]
        this.rerollsUsed = 0;           // 天赋卡「换一批」已用次数(见 Game._rerollsLeft)
        this.autoAttackTimer = 0;
        this.autoAttackInterval = 0.6;
        this.warriorSkillDmgMult = 1;
        this.warriorRageDecayMult = 1;
        this.bloodRageStacks = 0;       // 战士:血怒叠层
        this.warriorRavenous = false;   // 战士:嗜血战意
        this.mageStunBonus = 0;
        this.magePenetration = 0;
        this.mageQCostMult = 1;
        this.mageMulticast = false;     // 法师:奥术连击
        this.mageBloodMagic = false;    // 法师:血魔契约
        this.assassinSkillDmgMult = 1;
        this.assassinExtraTargets = 0;
        this.archerSkillDmgMult = 1;
        this.archerProjSpeedMult = 1;
        this.archerMultiShot = 1;
        this.archerPiercing = 0;
        this.archerAutoDmgMult = 1;     // 弓手:普攻投射物倍率
        this.paladinSkillDmgMult = 1;
        this.paladinAuraDurationBonus = 0;

        // 职业被动 & 阶段强化(见 CLASS_SPECS)
        this.spec = null;               // 进阶专精 id
        this.awakened = false;          // 是否已觉醒
        this.stillTime = 0;             // 弓手专注:连续站定的时长
        this.arcaneCount = 0;           // 法师:普攻计数,每第 4 发是奥术弹
        this.hammerCount = 0;           // 审判者:圣锤计数,每第 4 次召唤圣光柱
        this.undyingCd = 0;             // 铁卫觉醒「不屈」冷却
        this.auraGuard = 0;             // 守护者觉醒:处于减伤光环内的剩余时长
        this._pendingIframes = 0;       // 下一帧补上的无敌时长(调用方会在 takeDamage 后覆盖 hurtCooldown)

        // 构筑:天赋树 + 技能石(见 TREE_NODES / GEMS、Game._recomputeTree / _gemMap)
        this.treeNodes = new Set(['start']);
        this.tree = {};                 // 已点亮节点的属性汇总,使用处读取
        this._treeBase = { attack: 0, maxHealth: 0, defense: 0, speed: 0 }; // 已加到基础属性上的部分(洗点时扣回)
        this.gemLog = '';               // 拾取过的技能石(每字符 = GEM_TYPES 下标的 36 进制),同种出现次数 = 等级
        this.sockets = { a: [null, null, null], q: [null, null, null], e: [null, null, null] };
        this._buildVer = 0;             // 天赋/宝石/镶嵌变化计数,_gemMap 缓存据此失效
    }

    // 冲刺实际冷却(天赋「疾风连击」减免)
    dashCdTotal() {
        return this.dashMaxCooldown * (1 - ((this.tree && this.tree.dashCdr) || 0));
    }
    
    update(keys, width, height) {
        if (this.dashCooldown > 0) this.dashCooldown = Math.max(0, this.dashCooldown - DT);
        const startX = this.x, startY = this.y;
        if (this.dashTimer > 0) {
            // 冲刺中:忽略输入,沿锁定方向高速位移
            this.dashTimer = Math.max(0, this.dashTimer - DT);
            this.x = Math.max(0, Math.min(width - this.size, this.x + this.dashVX));
            this.y = Math.max(0, Math.min(height - this.size, this.y + this.dashVY));
        } else {
            this._move(keys, width, height);
            const mdx = this.x - startX, mdy = this.y - startY;
            const md = Math.sqrt(mdx * mdx + mdy * mdy);
            if (md > 0.5) { this.faceX = mdx / md; this.faceY = mdy / md; }
        }

        // 弓手专注:几乎没动就累计站定时长
        const movedNow = Math.abs(this.x - startX) + Math.abs(this.y - startY);
        this.stillTime = movedNow < 0.5 ? this.stillTime + DT : 0;
        if (this.undyingCd > 0) this.undyingCd = Math.max(0, this.undyingCd - DT);
        if (this.auraGuard > 0) this.auraGuard = Math.max(0, this.auraGuard - DT);
        if (this._pendingIframes > 0) {
            this.hurtCooldown = Math.max(this.hurtCooldown, this._pendingIframes);
            this._pendingIframes = 0;
        }

        // 受击无敌帧倒计时
        if (this.hurtCooldown > 0) {
            this.hurtCooldown -= DT;
            if (this.hurtCooldown < 0) this.hurtCooldown = 0;
        }

        // 刺客移动蓄力:基于位移累积(1 像素 = 0.1 stock,封顶 maxAssassinCharge)
        if (this.class === 'assassin') {
            const dxc = this.x - this.lastChargeX;
            const dyc = this.y - this.lastChargeY;
            const moved = Math.sqrt(dxc * dxc + dyc * dyc);
            if (moved > 0) {
                this.assassinCharge = Math.min(this.maxAssassinCharge, this.assassinCharge + moved * 0.1 * (this.chargeGainMult || 1));
            }
        }
        this.lastChargeX = this.x;
        this.lastChargeY = this.y;
    }

    // 发起冲刺,成功返回 true(冷却中/冲刺中/阵亡时失败)
    tryDash() {
        if (this.dashCooldown > 0 || this.dashTimer > 0 || this.currentHealth <= 0) return false;
        this.dashVX = this.faceX * this.dashSpeed;
        this.dashVY = this.faceY * this.dashSpeed;
        this.dashTimer = this.dashDuration;
        this.dashCooldown = this.dashCdTotal();
        this.dashDodged = false;
        this._dashHits = null;
        return true;
    }

    _move(keys, width, height) {
        const gear = this.gear && GEARS[this.gear.type];
        const frenzyMult = 1 + (this.frenzyTier || 0) * 0.025;
        const spd = this.speed * (gear && gear.speedMult || 1) * frenzyMult * (this.blessTimer > 0 ? Game.BLESS.speed : 1);
        // 虚拟摇杆(模拟量方向)
        const jx = keys._jx || 0, jy = keys._jy || 0;
        if (jx || jy) {
            this.x = Math.max(0, Math.min(width - this.size, this.x + jx * spd));
            this.y = Math.max(0, Math.min(height - this.size, this.y + jy * spd));
            this.moving = false;
            this.targetX = null;
            this.targetY = null;
        }
        // 键盘控制
        let kx = 0, ky = 0;
        if (keys['ArrowUp'] || keys['w']) ky -= 1;
        if (keys['ArrowDown'] || keys['s']) ky += 1;
        if (keys['ArrowLeft'] || keys['a']) kx -= 1;
        if (keys['ArrowRight'] || keys['d']) kx += 1;

        if (kx !== 0 || ky !== 0) {
            // 重置目标位置，优先键盘控制
            this.moving = false;
            this.targetX = null;
            this.targetY = null;
            if (kx !== 0 && ky !== 0) {
                kx *= Math.SQRT1_2;
                ky *= Math.SQRT1_2;
            }
            this.x = Math.max(0, Math.min(width - this.size, this.x + kx * spd));
            this.y = Math.max(0, Math.min(height - this.size, this.y + ky * spd));
        }
        
        // 点击移动
        if (this.moving && this.targetX !== null && this.targetY !== null) {
            const dx = this.targetX - (this.x + this.size / 2);
            const dy = this.targetY - (this.y + this.size / 2);
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance > 5) { // 到达目标附近时停止
                const moveX = (dx / distance) * spd;
                const moveY = (dy / distance) * spd;
                
                // 边界检查
                this.x = Math.max(0, Math.min(width - this.size, this.x + moveX));
                this.y = Math.max(0, Math.min(height - this.size, this.y + moveY));
            } else {
                this.moving = false;
                this.targetX = null;
                this.targetY = null;
            }
        }
    }

    // 冲刺残影:冲刺期间每个渲染帧记一个位置,200ms 内淡出(按真实时间,不随帧率变化)
    _renderDashGhosts(ctx) {
        const now = performance.now();
        const g = this._dashGhosts;
        if (this.dashTimer > 0) g.push({ x: this.x, y: this.y, t: now });
        if (!g.length) return;
        while (g.length && now - g[0].t > 200) g.shift();
        const skin = this.skin || SKINS[0];
        ctx.save();
        ctx.fillStyle = skin.c1 || '#ffffff';
        for (const p of g) {
            const k = 1 - (now - p.t) / 200;
            ctx.globalAlpha = 0.35 * k;
            const s = this.size * (0.7 + 0.3 * k), o = (this.size - s) / 2;
            roundRect(ctx, p.x + o, p.y + o, s, s, 6);
            ctx.fill();
        }
        ctx.restore();
    }

    takeDamage(damage) {
        const t = this.tree || {};
        // 天赋「疾风之舞」:几率完全闪避
        if (t.evade && Math.random() < t.evade) { this._evadeFx = true; return 0; }
        const flatReduction = this.flatDamageReduction || 0;
        const gear = this.gear && GEARS[this.gear.type];
        const gearDef = gear && gear.defBonus || 0;
        const def = this.defense * Math.max(0, 1 + (t.defPct || 0));
        let actualDamage = Math.max(1, damage - def - gearDef - flatReduction);
        if (t.dmgTaken) actualDamage *= Math.max(0.1, 1 + t.dmgTaken);
        // 战士被动「战意」:怒气越高越抗揍(满怒 -30%)
        if (this.class === 'warrior') actualDamage *= 1 - 0.3 * Math.min(1, this.rage / this.maxRage);
        // 守护者觉醒:神圣光环内减伤 50%;记下原始伤害,交给 Game 反弹
        if (this.auraGuard > 0) actualDamage *= 0.5;
        if (this.spec === 'protector' && this.awakened) this._reflect = (this._reflect || 0) + damage;
        if (this.gear && this.gear.type === 'thorns') this._thornsHit = (this._thornsHit || 0) + damage;
        // 圣骑士护盾优先全额抵挡(不再因 Math.max(1) 强制漏 1 点)
        if (this.shield > 0) {
            const absorbed = Math.min(this.shield, actualDamage);
            this.shield -= absorbed;
            actualDamage -= absorbed;
            if (this.shield <= 0.01) { this.shield = 0; this._shieldBroke = true; }
        }
        // 铁卫觉醒「不屈」:致命一击保留 1 点生命并无敌 3 秒
        if (actualDamage >= this.currentHealth && this.spec === 'guardian' && this.awakened && this.undyingCd <= 0 && this.currentHealth > 1) {
            actualDamage = this.currentHealth - 1;
            this.undyingCd = 60;
            this._pendingIframes = 3;
            this._undyingFx = true;
        }
        if (actualDamage > 0) {
            this.currentHealth = Math.max(0, this.currentHealth - actualDamage);
            // 受伤打断一半连杀:冲刺躲开攻击才能把连杀滚大
            if (this.combo > 0) {
                this.combo = Math.floor(this.combo / 2);
                this.frenzyTier = Math.min(5, Math.floor(this.combo / 10));
            }
        }
        return actualDamage;
    }

    heal(amount) {
        const ht = this.tree && this.tree.healTaken;
        if (ht) amount *= Math.max(0, 1 + ht);
        this.currentHealth = Math.min(this.maxHealth, this.currentHealth + amount);
    }
    
    addPotentialPoints(points) {
        this.potentialPoints += points;
    }

    gainRage(amount) {
        if (this.class !== 'warrior') return;
        this.rage = Math.min(this.maxRage, this.rage + amount * (this.rageGainMult || 1));
    }
    
    spendPotentialPoint(stat) {
        if (this.potentialPoints > 0) {
            switch (stat) {
                case 'attack':
                    this.attack += 5;
                    break;
                case 'defense':
                    this.defense += 3;
                    break;
                case 'health':
                    this.maxHealth += 20;
                    this.currentHealth = this.maxHealth;
                    break;
                case 'speed':
                    this.speed += 0.5;
                    break;
            }
            this.potentialPoints--;
            return true;
        }
        return false;
    }
    
    render(ctx) {
        this._renderDashGhosts(ctx);
        const flicker = this.hurtCooldown > 0 && Math.floor(this.hurtCooldown * 20) % 2 === 0;
        ctx.save();
        ctx.globalAlpha = flicker ? 0.3 : 1;

        const isInvincible = this.invincibleTimer > 0;
        const baseColor = isInvincible ? '#ffeb3b' : this.color;

        ctx.shadowBlur = isInvincible ? 24 : 14;
        ctx.shadowColor = baseColor;

        const skin = this.skin || SKINS[0];
        if (!isInvincible) ctx.shadowColor = skin.glow;
        let c1 = skin.c1, c2 = skin.c2;
        if (skin.prism) { // 幻彩:色相随时间流转
            const hue = (performance.now() / 12) % 360;
            c1 = `hsl(${hue}, 90%, 72%)`; c2 = `hsl(${(hue + 120) % 360}, 80%, 42%)`;
            ctx.shadowColor = c1;
        }
        const grad = ctx.createLinearGradient(this.x, this.y, this.x + this.size, this.y + this.size);
        grad.addColorStop(0, isInvincible ? '#fff176' : c1);
        grad.addColorStop(1, isInvincible ? '#f9a825' : c2);
        ctx.fillStyle = grad;
        roundRect(ctx, this.x, this.y, this.size, this.size, 7);
        ctx.fill();

        ctx.shadowBlur = 0;
        ctx.strokeStyle = isInvincible ? 'rgba(255,235,59,0.8)' : skin.stroke;
        ctx.lineWidth = 2;
        roundRect(ctx, this.x, this.y, this.size, this.size, 7);
        ctx.stroke();
        ctx.restore();

        const healthBarWidth = this.size;
        const healthBarHeight = 5;
        const healthPercentage = this.currentHealth / this.maxHealth;
        const bx = this.x;
        const by = this.y - 12;

        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        roundRect(ctx, bx, by, healthBarWidth, healthBarHeight, 3);
        ctx.fill();

        const hpColor = healthPercentage > 0.5 ? '#00e676' : healthPercentage > 0.25 ? '#ffca28' : '#ff1744';
        ctx.fillStyle = hpColor;
        ctx.shadowBlur = 6;
        ctx.shadowColor = hpColor;
        roundRect(ctx, bx, by, healthBarWidth * healthPercentage, healthBarHeight, 3);
        ctx.fill();

        // 护盾条(蓝色,叠在 HP 条上方)
        if (this.shield > 0) {
            const cap = this.maxHealth * (this.shieldCapRatio || 0.10);
            const shieldPct = Math.min(1, this.shield / cap);
            const sby = by - healthBarHeight - 1;
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            roundRect(ctx, bx, sby, healthBarWidth, healthBarHeight, 3);
            ctx.fill();
            ctx.fillStyle = '#42a5f5';
            ctx.shadowBlur = 6;
            ctx.shadowColor = '#42a5f5';
            roundRect(ctx, bx, sby, healthBarWidth * shieldPct, healthBarHeight, 3);
            ctx.fill();
        }
        ctx.restore();
    }
}

class Enemy {
    static SPAWN_IN = 0.5;
    static onDamage = null; // 伤害统计回调(Game._creditDmg),敌人和魔王共用
    static INTROS = {
        dasher: { text: '新敌人「冲」:蓄力后直线冲刺,看准路线侧身躲开', color: '#ffe57f' },
        bomber: { text: '新敌人「爆」:贴身会自爆,先打爆它还能炸伤周围敌人', color: '#ff80ab' },
        healer: { text: '新敌人「医」:躲在远处给周围敌人回血,优先打掉它', color: '#69f0ae' },
        splitter: { text: '新敌人「裂」:被打碎会裂成三块小碎片,别被包围', color: '#84ffff' }
    };

    constructor(x, y, type, difficulty) {
        this.id = nextEntityId();
        this.x = x;
        this.y = y;
        this.type = type;
        this.difficulty = difficulty;
        this.size = 30;
        this.speed = 2;
        this.maxHealth = 50;
        this.currentHealth = 50;
        this.attack = 10;
        this.defense = 5;
        this.color = '#f44336';
        
        // 巡逻者相关属性
        this.patrolDirection = Math.random() < 0.5 ? 1 : -1; // 1为右/下，-1为左/上
        this.patrolAxis = Math.random() < 0.5 ? 'x' : 'y'; // x轴或y轴巡逻
        this.patrolRange = 100; // 巡逻范围
        this.patrolStart = this.patrolAxis === 'x' ? this.x : this.y;
        this.isChasing = false; // 是否正在追击
        this.chaseRange = 150; // 追击范围
        
        this.restTimer = 0;
        this.restDuration = 2; // 秒(用 DT 推进,暂停时自动停)

        // 炮手专属
        this.shootTimer = 1 + Math.random() * 1.5; // 错开初始开火,避免齐射
        this.shootInterval = 2.5;
        this.pendingShot = null;
        this.aimAngle = 0;
        this.moveDistance = 0;
        this.maxMoveDistance = 200;
        this.isResting = false;

        // 冲锋者 / 自爆者专属:state 0 接近,冲锋者 1 蓄力 2 冲刺 3 硬直;自爆者 1 引信
        this.state = 0;
        this.stateTimer = 0;
        this.stateDur = 0;
        this.dashAngle = 0;
        this.dashDist = 0;
        this.dashTravel = 0;
        this.dashCD = 0.5 + Math.random();
        this.blastRadius = 0;

        this.stunTimer = 0;
        // 出场时刻(真实时间,纯视觉):炮手直接刷在场内,用淡入 + 收缩光圈提示,不再凭空蹦出来
        this.bornAt = performance.now();

        // 受击反馈:hitFlash>0 时白闪;降为负值时作为再次闪白的间隔(持续伤害时呈闪烁而非常亮)
        this.hitFlash = -1;
        this.squash = 0;
        // 击退速度(像素/帧,每帧衰减),由 Game 在 updateEnemies 推进
        this.kbX = 0;
        this.kbY = 0;

        this.initType();
    }
    
    initType() {
        switch (this.type) {
            case 'chaser': // 追击者
                this.size = 30;
                this.speed = 2.5 * this.difficulty;
                this.maxHealth = 50 * this.difficulty;
                this.currentHealth = 50 * this.difficulty;
                this.attack = 10 * this.difficulty;
                this.defense = 5 * this.difficulty;
                this.color = '#f44336';
                break;
            case 'patroller': // 巡逻者
                this.size = 25;
                this.speed = 1.8 * this.difficulty;
                this.maxHealth = 40 * this.difficulty;
                this.currentHealth = 40 * this.difficulty;
                this.attack = 8 * this.difficulty;
                this.defense = 3 * this.difficulty;
                this.color = '#2196F3';
                break;
            case 'giant': // 巨型追击者
                this.size = 50;
                this.speed = 1.2 * this.difficulty;
                this.maxHealth = 150 * this.difficulty;
                this.currentHealth = 150 * this.difficulty;
                this.attack = 25 * this.difficulty;
                this.defense = 15 * this.difficulty;
                this.color = '#9c27b0';
                break;
            case 'gunner': // 远程炮手:不移动,定期朝玩家发射投射物
                this.size = 32;
                this.speed = 0;
                this.maxHealth = 55 * this.difficulty;
                this.currentHealth = 55 * this.difficulty;
                this.attack = 15 * this.difficulty;
                this.defense = 2 * this.difficulty;
                this.color = '#ff6f00';
                this.shootInterval = Math.max(1.0, 2.5 - (this.difficulty - 1) * 0.3); // 难度越高射速越快
                break;
            case 'dasher': // 冲锋者:靠近后蓄力,锁定方向直线冲刺
                this.size = 28;
                this.speed = 1.5 * this.difficulty;
                this.maxHealth = 45 * this.difficulty;
                this.currentHealth = 45 * this.difficulty;
                this.attack = 14 * this.difficulty;
                this.defense = 3 * this.difficulty;
                this.color = '#ffd600';
                this.dashSpeed = 9 + 2 * this.difficulty;
                this.dashDist = 200 + 15 * this.difficulty;
                break;
            case 'bomber': // 自爆者:贴近后点燃引信,原地爆炸;被击杀则殉爆,只伤敌人
                this.size = 26;
                this.speed = 2.2 * this.difficulty;
                this.maxHealth = 30 * this.difficulty;
                this.currentHealth = 30 * this.difficulty;
                this.attack = 6 * this.difficulty;   // 接触伤害很低,威胁在爆炸
                this.defense = 2 * this.difficulty;
                this.color = '#ff4081';
                this.blastRadius = 80;
                this.blastDamage = 25 * this.difficulty;
                break;
            case 'treasure': // 宝藏方块:不伤人,远离玩家四处逃窜,事件结束前没打死就溜走
                this.size = 28;
                this.speed = 2.3 + 0.35 * this.difficulty;
                this.maxHealth = 170 * this.difficulty;
                this.currentHealth = this.maxHealth;
                this.attack = 0;
                this.defense = 0;
                this.color = '#ffd740';
                this.wanderDir = Math.random() * Math.PI * 2;
                this.wanderOff = 0;
                break;
            case 'healer': // 医疗兵:与玩家保持距离,定期引导治疗脉冲给周围敌人回血;被控会打断
                this.size = 26;
                this.speed = Math.min(3.6, 1.2 * this.difficulty);
                this.maxHealth = 45 * this.difficulty;
                this.currentHealth = this.maxHealth;
                this.attack = 6 * this.difficulty;
                this.defense = 2 * this.difficulty;
                this.color = '#00e676';
                this.healRadius = 140;
                this.healCD = 2 + Math.random() * 1.5;
                break;
            case 'splitter': // 分裂者:皮厚走得慢,死亡时裂成 3 块碎片(碎片不再分裂)
                this.size = 34;
                this.speed = Math.min(4, 1.9 * this.difficulty);
                this.maxHealth = 75 * this.difficulty;
                this.currentHealth = this.maxHealth;
                this.attack = 12 * this.difficulty;
                this.defense = 4 * this.difficulty;
                this.color = '#00bcd4';
                break;
            case 'shard': // 碎片:又小又快又脆,成群扑上来
                this.size = 16;
                this.speed = Math.min(5.5, 2.4 + 0.8 * this.difficulty);
                this.maxHealth = 14 * this.difficulty;
                this.currentHealth = this.maxHealth;
                this.attack = 5 * this.difficulty;
                this.defense = 1 * this.difficulty;
                this.color = '#4dd0e1';
                break;
            default: // 默认追击者
                this.type = 'chaser';
                this.size = 30;
                this.speed = 2.5 * this.difficulty;
                this.maxHealth = 50 * this.difficulty;
                this.currentHealth = 50 * this.difficulty;
                this.attack = 10 * this.difficulty;
                this.defense = 5 * this.difficulty;
                this.color = '#f44336';
        }
    }
    
    update(playerX, playerY, width, height, playerSize = 30) {
        if (this.spawnHold > 0) { this.spawnHold -= DT; return; }
        if (this.stunTimer > 0) {
            this.stunTimer -= DT;
            // 冲锋者蓄力/冲刺中被控 = 打断;自爆者引信只是暂停
            if (this.type === 'dasher' && (this.state === 1 || this.state === 2)) {
                this.state = 0;
                this.dashCD = 1;
            }
            if (this.type === 'healer' && this.state === 1) {
                this.state = 0;
                this.healCD = 1.2;
            }
            return;
        }
        switch (this.type) {
            case 'chaser':
            case 'splitter':
            case 'shard':
                this.updateChaser(playerX, playerY);
                break;
            case 'patroller':
                this.updatePatroller(playerX, playerY, width, height);
                break;
            case 'giant':
                this.updateGiant(playerX, playerY);
                break;
            case 'gunner':
                this.updateGunner(playerX, playerY);
                break;
            case 'dasher':
                this.updateDasher(playerX, playerY, width, height, playerSize);
                break;
            case 'bomber':
                this.updateBomber(playerX, playerY, playerSize);
                break;
            case 'treasure':
                this.updateTreasure(playerX, playerY, width, height, playerSize);
                break;
            case 'healer':
                this.updateHealer(playerX, playerY, width, height, playerSize);
                break;
        }
    }

    // 医疗兵:保持在 190~260px 外绕圈走位(太近就跑),冷却好了站定引导 0.9 秒,结束时由 Game 结算治疗脉冲
    updateHealer(playerX, playerY, width, height, playerSize) {
        const inside = this.x > 0 && this.y > 0 && this.x < width - this.size && this.y < height - this.size;
        if (!inside) {
            // 刚从场外刷出:先走进场地
            const cx = width / 2 - this.x, cy = height / 2 - this.y, d = Math.hypot(cx, cy) || 1;
            this.x += cx / d * this.speed;
            this.y += cy / d * this.speed;
            return;
        }
        if (this.state === 1) {
            this.stateTimer -= DT;
            if (this.stateTimer <= 0) {
                this.state = 0;
                this.pendingHeal = true;
                this.healCD = 3.5 + Math.random();
            }
            return;
        }
        this.healCD -= DT;
        if (this.healCD <= 0) {
            this._setState(1, 0.9);
            return;
        }
        const { dx, dy, dist } = this._toTarget(playerX, playerY, playerSize);
        const d = dist || 1;
        let ax, ay;
        if (dist < 190) { ax = -dx / d; ay = -dy / d; }
        else if (dist > 260) { ax = dx / d; ay = dy / d; }
        else { ax = -dy / d * this.patrolDirection * 0.7; ay = dx / d * this.patrolDirection * 0.7; }
        // 贴墙时往场内推,避免被逼进角落原地抖动
        const m = 50;
        if (this.x < m) ax += (m - this.x) / m * 1.5;
        if (this.x > width - this.size - m) ax -= (this.x - (width - this.size - m)) / m * 1.5;
        if (this.y < m) ay += (m - this.y) / m * 1.5;
        if (this.y > height - this.size - m) ay -= (this.y - (height - this.size - m)) / m * 1.5;
        const len = Math.hypot(ax, ay);
        if (len < 0.05) return;
        const sp = this.speed * Math.min(1, len);
        this.x = Math.max(0, Math.min(width - this.size, this.x + ax / len * sp));
        this.y = Math.max(0, Math.min(height - this.size, this.y + ay / len * sp));
    }

    // 精英化:体型 ×1.3、血量 ×3、攻防略升,画金框皇冠(guest 只用到体型与标记)
    makeElite() {
        if (this.elite) return;
        this.elite = true;
        this.size = Math.round(this.size * 1.3);
        this.maxHealth *= 3;
        this.currentHealth = this.maxHealth;
        this.attack *= 1.3;
        this.defense *= 1.2;
        this.speed *= 1.1;
        if (this.type === 'dasher') this.dashDist *= 1.15;
    }

    // 宝藏方块:离玩家近就背向逃跑(带随机偏转),远了就闲逛;贴墙时被推回场内
    updateTreasure(playerX, playerY, width, height, playerSize) {
        const { dx, dy, dist } = this._toTarget(playerX, playerY, playerSize);
        this.stateTimer -= DT;
        if (this.stateTimer <= 0) {
            this.stateTimer = 0.4 + Math.random() * 0.5;
            this.wanderOff = (Math.random() - 0.5) * 1.8;
            this.wanderDir += (Math.random() - 0.5) * 2;
        }
        let ax, ay, speed = this.speed;
        if (dist < 280 && dist > 0) {
            const a = Math.atan2(-dy, -dx) + this.wanderOff;
            ax = Math.cos(a); ay = Math.sin(a);
        } else {
            ax = Math.cos(this.wanderDir); ay = Math.sin(this.wanderDir);
            speed *= 0.5;
        }
        const m = 70;
        if (this.x < m) ax += (m - this.x) / m * 1.5;
        if (this.x > width - this.size - m) ax -= (this.x - (width - this.size - m)) / m * 1.5;
        if (this.y < m) ay += (m - this.y) / m * 1.5;
        if (this.y > height - this.size - m) ay -= (this.y - (height - this.size - m)) / m * 1.5;
        const len = Math.hypot(ax, ay) || 1;
        this.x = Math.max(0, Math.min(width - this.size, this.x + ax / len * speed));
        this.y = Math.max(0, Math.min(height - this.size, this.y + ay / len * speed));
    }

    // 与目标中心的偏移(playerX/Y 是目标左上角)
    _toTarget(playerX, playerY, playerSize) {
        const dx = playerX + playerSize / 2 - (this.x + this.size / 2);
        const dy = playerY + playerSize / 2 - (this.y + this.size / 2);
        return { dx, dy, dist: Math.hypot(dx, dy) };
    }

    _setState(state, dur) {
        this.state = state;
        this.stateTimer = this.stateDur = dur;
    }

    updateDasher(playerX, playerY, width, height, playerSize) {
        const { dx, dy, dist } = this._toTarget(playerX, playerY, playerSize);
        if (this.state === 0) {
            this.dashCD -= DT;
            if (dist > 0) {
                this.x += (dx / dist) * this.speed;
                this.y += (dy / dist) * this.speed;
            }
            // 进入射程且完全进场后开始蓄力
            const inside = this.x > 0 && this.y > 0 && this.x < width - this.size && this.y < height - this.size;
            if (this.dashCD <= 0 && inside && dist < this.dashDist * 1.1) {
                this._setState(1, Math.max(0.5, 0.75 - (this.difficulty - 1) * 0.06));
                this.dashAngle = Math.atan2(dy, dx);
            }
        } else if (this.state === 1) {
            this.stateTimer -= DT;
            // 前 50% 跟踪目标,之后锁定方向留出闪避窗口
            if (this.stateTimer > this.stateDur * 0.5) this.dashAngle = Math.atan2(dy, dx);
            if (this.stateTimer <= 0) {
                this._setState(2, 1);
                this.dashTravel = 0;
                this._sfx = 'dash';
            }
        } else if (this.state === 2) {
            const step = Math.min(this.dashSpeed, this.dashDist - this.dashTravel);
            const nx = this.x + Math.cos(this.dashAngle) * step;
            const ny = this.y + Math.sin(this.dashAngle) * step;
            this.x = Math.max(0, Math.min(width - this.size, nx));
            this.y = Math.max(0, Math.min(height - this.size, ny));
            this.dashTravel += step;
            this.stateTimer = 1 - this.dashTravel / this.dashDist;
            // 冲完全程或撞墙即停,进入硬直(可趁机输出)
            if (this.dashTravel >= this.dashDist || nx !== this.x || ny !== this.y) this._setState(3, 0.9);
        } else {
            this.stateTimer -= DT;
            if (this.stateTimer <= 0) {
                this.state = 0;
                this.dashCD = 1.2 + Math.random() * 0.8;
            }
        }
    }

    updateBomber(playerX, playerY, playerSize) {
        const { dx, dy, dist } = this._toTarget(playerX, playerY, playerSize);
        if (this.state === 0) {
            if (dist > 0) {
                this.x += (dx / dist) * this.speed;
                this.y += (dy / dist) * this.speed;
            }
            if (dist < 60) {
                this._setState(1, 0.75);
                this._sfx = 'fuse';
            }
        } else {
            this.stateTimer -= DT;
            if (this.stateTimer <= 0) this.detonate = true; // 由 Game.updateEnemies 结算爆炸
        }
    }

    // 接触伤害:冲刺中的冲锋者更疼
    contactDamage() {
        if (this.type === 'treasure') return 0;
        return this.attack * (this.type === 'dasher' && this.state === 2 ? 1.5 : 1);
    }

    updateGunner(playerX, playerY) {
        // 计算瞄准角
        const dx = playerX - this.x;
        const dy = playerY - this.y;
        this.aimAngle = Math.atan2(dy, dx);

        this.shootTimer -= DT;
        if (this.shootTimer <= 0) {
            this.shootTimer = this.shootInterval;
            const speed = 4.5 + this.difficulty * 0.5;
            this.pendingShot = {
                x: this.x + this.size / 2,
                y: this.y + this.size / 2,
                vx: Math.cos(this.aimAngle) * speed,
                vy: Math.sin(this.aimAngle) * speed,
                damage: this.attack
            };
        }
    }

    updateChaser(playerX, playerY) {
        // 追击者：持续追击玩家
        const dx = playerX - this.x;
        const dy = playerY - this.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance > 0) {
            this.x += (dx / distance) * this.speed;
            this.y += (dy / distance) * this.speed;
        }
    }
    
    updatePatroller(playerX, playerY, width, height) {
        // 计算与玩家的距离
        const dx = playerX - this.x;
        const dy = playerY - this.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // 检查是否进入追击范围
        if (distance <= this.chaseRange) {
            this.isChasing = true;
        }
        
        // 如果正在追击
        if (this.isChasing) {
            // 向玩家移动
            if (distance > 0) {
                this.x += (dx / distance) * this.speed;
                this.y += (dy / distance) * this.speed;
            }
            
            // 检查是否离开追击范围
            if (distance > this.chaseRange * 1.5) {
                this.isChasing = false;
                // 重置巡逻起点
                this.patrolStart = this.patrolAxis === 'x' ? this.x : this.y;
            }
        } else if (this.x < 0 || this.y < 0 || this.x > width - this.size || this.y > height - this.size) {
            // 刚从场外刷出:先走进场地再巡逻(否则会在屏幕外来回巡逻、永远不进场)
            const cx = width / 2 - this.x, cy = height / 2 - this.y;
            const d = Math.hypot(cx, cy) || 1;
            this.x += cx / d * this.speed;
            this.y += cy / d * this.speed;
            this.patrolStart = this.patrolAxis === 'x' ? this.x : this.y;
        } else {
            // 巡逻模式
            if (this.patrolAxis === 'x') {
                // x轴巡逻
                this.x += this.speed * this.patrolDirection;
                
                // 检查是否到达巡逻边界
                if (Math.abs(this.x - this.patrolStart) >= this.patrolRange) {
                    this.patrolDirection *= -1; // 反转方向
                }
            } else {
                // y轴巡逻
                this.y += this.speed * this.patrolDirection;
                
                // 检查是否到达巡逻边界
                if (Math.abs(this.y - this.patrolStart) >= this.patrolRange) {
                    this.patrolDirection *= -1; // 反转方向
                }
            }
        }
    }
    
    updateGiant(playerX, playerY) {
        // 巨型追击者：移动一定距离后休息
        if (this.isResting) {
            // 休息中(秒)
            this.restTimer += DT;
            if (this.restTimer >= this.restDuration) {
                this.isResting = false;
                this.restTimer = 0;
                this.moveDistance = 0;
            }
        } else {
            // 移动中
            const dx = playerX - this.x;
            const dy = playerY - this.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance > 0) {
                const moveX = (dx / distance) * this.speed;
                const moveY = (dy / distance) * this.speed;
                
                // 计算移动距离
                this.moveDistance += Math.sqrt(moveX * moveX + moveY * moveY);
                
                // 移动
                this.x += moveX;
                this.y += moveY;
                
                // 检查是否达到最大移动距离
                if (this.moveDistance >= this.maxMoveDistance) {
                    this.isResting = true;
                    this.restTimer = 0;
                }
            }
        }
    }
    
    takeDamage(damage) {
        const actualDamage = Math.max(1, damage - this.defense);
        if (Enemy.onDamage) Enemy.onDamage(Math.min(actualDamage, this.currentHealth));
        this.currentHealth = Math.max(0, this.currentHealth - actualDamage);
        this._dn = (this._dn || 0) + actualDamage; // 伤害数字:本帧累计,由 Game._flushDmgNums 统一出数
        this.flash(!!this._dnCrit);
        return actualDamage;
    }

    // 白闪;_mpHit 让 host 在下一个快照里告诉 guest 也闪一下
    flash(isCrit = false) {
        if (this.hitFlash <= -0.04) {
            this.hitFlash = 0.08;
            this.squash = isCrit ? 1.3 : 1;
            this._mpHit = true;
        }
    }

    // 击退位移(冻结/眩晕时也生效),限制在场地内
    applyKnockback(width, height) {
        if (!this.kbX && !this.kbY) return;
        this.x = Math.max(0, Math.min(width - this.size, this.x + this.kbX));
        this.y = Math.max(0, Math.min(height - this.size, this.y + this.kbY));
        this.kbX *= 0.8;
        this.kbY *= 0.8;
        if (Math.abs(this.kbX) + Math.abs(this.kbY) < 0.1) this.kbX = this.kbY = 0;
    }

    _renderHitFlash(ctx, snap) {
        if (this.hitFlash <= 0) return;
        const r = this.type === 'giant' ? 10 : this.type === 'gunner' ? 7 : 6;
        const alpha = ctx.globalAlpha;
        ctx.globalAlpha = Math.min(1, this.hitFlash / 0.08) * 0.85;
        SpriteCache.drawPx(ctx, Enemy.flashSprite(this.size, r), this.x, this.y, snap);
        ctx.globalAlpha = alpha;
    }

    // 第 1 遍:本体(炮手含炮管、炮口火花、"炮"字)+ 受击白闪。血条见 renderBars,星星/冰封见 renderOverlays。
    // 由 Game._renderEnemies 调用,调用前已关闭 imageSmoothing
    render(ctx, snap) {
        const cx = this.x + this.size / 2;
        const cy = this.y + this.size / 2;
        const s = this.squash > 0.001 ? this.squash * Math.cos((1 - this.squash) * Math.PI * 2.5) : 0;
        const useSquash = Math.abs(s) > 0.001;
        if (useSquash) {
            ctx.save();
            ctx.translate(cx, cy);
            ctx.scale(1 + 0.22 * s, 1 - 0.18 * s);
            ctx.translate(-cx, -cy);
        }
        const fadeIn = this.type === 'gunner' ? this.spawnProgress() : 1;
        if (fadeIn < 1) {
            const a = ctx.globalAlpha;
            ctx.globalAlpha = a * fadeIn * fadeIn;
            this._renderBody(ctx, snap);
            ctx.globalAlpha = a;
        } else this._renderBody(ctx, snap);
        if (useSquash) {
            ctx.restore();
        }
    }

    // 炮手出场进度 0→1(Enemy.SPAWN_IN 秒)
    spawnProgress() {
        return Math.min(1, (performance.now() - this.bornAt) / 1000 / Enemy.SPAWN_IN);
    }

    _renderBody(ctx, snap) {
        // 本体(渐变 + 光晕 + 描边 + 文字)按类型缓存,避免每帧 shadowBlur
        SpriteCache.drawPx(ctx, Enemy.bodySprite(this.type, this.size), this.x, this.y, snap);
        if (this.type === 'gunner') this._renderGunnerTop(ctx, snap);
        if (this.state === 1 && (this.type === 'bomber' || this.type === 'dasher' || this.type === 'healer')) this._renderChargePulse(ctx, snap);
        this._renderHitFlash(ctx, snap);
    }

    // 蓄力 / 引信:白闪越来越快,提示即将出手
    _renderChargePulse(ctx, snap) {
        const p = 1 - this.stateTimer / (this.stateDur || 1);
        const pulse = 0.5 + 0.5 * Math.sin(p * p * Math.PI * 14);
        const alpha = ctx.globalAlpha;
        ctx.globalAlpha = pulse * (0.25 + 0.5 * p);
        SpriteCache.drawPx(ctx, Enemy.flashSprite(this.size, 6), this.x, this.y, snap);
        ctx.globalAlpha = alpha;
    }

    // 第 0 遍:地面预警(冲锋者的冲刺路线、自爆者的爆炸范围),画在所有敌人身下。只有填充/描边,无 shadowBlur
    static renderTelegraphs(ctx, enemies) {
        for (const e of enemies) {
            if (e.type === 'gunner') {
                // 炮手出场:橙色光圈向落点收缩
                const k = e.spawnProgress();
                if (k >= 1) continue;
                const cx = e.x + e.size / 2, cy = e.y + e.size / 2;
                ctx.strokeStyle = `rgba(255,152,0,${0.9 * (1 - k)})`;
                ctx.lineWidth = 2 + 3 * (1 - k);
                ctx.beginPath();
                ctx.arc(cx, cy, e.size * (0.55 + 1.6 * (1 - k)), 0, Math.PI * 2);
                ctx.stroke();
                continue;
            }
            if (e.state !== 1) continue;
            const cx = e.x + e.size / 2, cy = e.y + e.size / 2;
            const p = Math.max(0, Math.min(1, 1 - e.stateTimer / (e.stateDur || 1)));
            if (e.type === 'dasher') {
                const len = e.dashDist + e.size / 2, w = e.size;
                ctx.save();
                ctx.translate(cx, cy);
                ctx.rotate(e.dashAngle);
                ctx.fillStyle = 'rgba(255,214,0,0.12)';
                ctx.fillRect(0, -w / 2, len, w);
                ctx.fillStyle = 'rgba(255,214,0,0.32)';
                ctx.fillRect(0, -w / 2, len * p, w);
                ctx.strokeStyle = 'rgba(255,241,118,0.75)';
                ctx.lineWidth = 1.5;
                ctx.strokeRect(0, -w / 2, len, w);
                ctx.restore();
            } else if (e.type === 'healer') {
                // 治疗范围:绿色圈由内向外充满,打断它就不会回血
                const r = e.healRadius || 140;
                ctx.fillStyle = 'rgba(0,230,118,0.07)';
                ctx.beginPath();
                ctx.arc(cx, cy, r, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = 'rgba(105,240,174,0.18)';
                ctx.beginPath();
                ctx.arc(cx, cy, r * p, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = `rgba(105,240,174,${0.35 + 0.5 * p})`;
                ctx.lineWidth = 1.5;
                ctx.setLineDash([6, 6]);
                ctx.beginPath();
                ctx.arc(cx, cy, r, 0, Math.PI * 2);
                ctx.stroke();
                ctx.setLineDash([]);
            } else if (e.type === 'bomber') {
                const r = e.blastRadius;
                ctx.fillStyle = 'rgba(255,64,129,0.12)';
                ctx.beginPath();
                ctx.arc(cx, cy, r, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = 'rgba(255,64,129,0.3)';
                ctx.beginPath();
                ctx.arc(cx, cy, r * p, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = `rgba(255,128,171,${0.5 + 0.5 * p})`;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(cx, cy, r, 0, Math.PI * 2);
                ctx.stroke();
            }
        }
    }

    _renderGunnerTop(ctx, snap) {
        const cx = this.x + this.size / 2;
        const cy = this.y + this.size / 2;

        // 炮管:从中心向瞄准角延伸的矩形(缓存精灵,旋转绘制,需要插值)
        const barrelLen = this.size * 0.65;
        const barrelW   = this.size * 0.28;
        ctx.save();
        ctx.imageSmoothingEnabled = true;
        ctx.translate(cx, cy);
        ctx.rotate(this.aimAngle);
        SpriteCache.draw(ctx, Enemy.barrelSprite(barrelLen, barrelW), 0, -barrelW / 2, barrelLen, barrelW);
        ctx.restore();

        // 炮管口火花(开火前 0.3s 闪烁)
        if (this.shootTimer < 0.3) {
            const flash = (0.3 - this.shootTimer) / 0.3;
            ctx.save();
            ctx.globalAlpha = flash * 0.8;
            ctx.shadowBlur = 16;
            ctx.shadowColor = '#ffeb3b';
            ctx.fillStyle = '#ffee58';
            const ex = cx + Math.cos(this.aimAngle) * barrelLen;
            const ey = cy + Math.sin(this.aimAngle) * barrelLen;
            ctx.beginPath();
            ctx.arc(ex, ey, barrelW * 0.7, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        // 中心图标(盖在炮管上,缓存成精灵)
        SpriteCache.drawPx(ctx, Enemy.gunnerLabelSprite(this.size), this.x, this.y, snap);
    }

    // 第 2 遍:所有敌人的血条(炮手另有装弹条)合并绘制,每种颜色一条路径、一次 fill
    static renderBars(ctx, enemies) {
        const fill = (color, add) => {
            ctx.fillStyle = color;
            ctx.beginPath();
            let any = false;
            for (const e of enemies) any = add(e) || any;
            if (any) ctx.fill();
        };
        // 血条底槽
        fill('rgba(0,0,0,0.5)', e => { addRoundRect(ctx, e.x, e.y - 10, e.size, 4, 2); return true; });
        // 血量
        const hp = e => addRoundRect(ctx, e.x, e.y - 10, e.size * (e.currentHealth / e.maxHealth), 4, 2);
        fill('#ff1744', e => e.type !== 'gunner' && !e.elite && e.type !== 'treasure' && (hp(e), true));
        fill('#ffc400', e => (e.elite || e.type === 'treasure') && (hp(e), true));
        fill('#ff6f00', e => e.type === 'gunner' && (hp(e), true));
        // 炮手装弹进度条(显示下次开火倒计时)
        const reloadPct = e => Math.max(0, 1 - e.shootTimer / e.shootInterval);
        const reload = e => addRoundRect(ctx, e.x, e.y - 5, e.size * reloadPct(e), 3, 1);
        fill('rgba(0,0,0,0.4)', e => e.type === 'gunner' && (addRoundRect(ctx, e.x, e.y - 5, e.size, 3, 1), true));
        fill('#ffeb3b', e => e.type === 'gunner' && reloadPct(e) > 0.8 && (reload(e), true));
        fill('#ff9800', e => e.type === 'gunner' && reloadPct(e) <= 0.8 && (reload(e), true));
    }

    // 第 3 遍:眩晕星星、冰封叠加
    renderOverlays(ctx, snap, frozen) {
        // 中毒:绿色毒泡从身上冒起(纯填充,不用 shadowBlur)
        if (this.poison > 0) {
            const t = performance.now() / 1000;
            ctx.fillStyle = 'rgba(118,255,3,0.75)';
            ctx.beginPath();
            for (let i = 0; i < 3; i++) {
                const k = (t * 0.8 + i / 3 + (this.id % 7) * 0.13) % 1;
                const bx = this.x + this.size * (0.25 + 0.25 * i), by = this.y + this.size * (1 - k) - 4;
                const r = 2.5 * (1 - k) + 0.8;
                ctx.moveTo(bx + r, by);
                ctx.arc(bx, by, r, 0, Math.PI * 2);
            }
            ctx.fill();
        }
        // 燃烧(技能石):橙色火苗在身上窜动
        if (this.burnT > 0) {
            const t = performance.now() / 1000;
            ctx.fillStyle = 'rgba(255,145,0,0.8)';
            ctx.beginPath();
            for (let i = 0; i < 3; i++) {
                const k = (t * 1.6 + i / 3 + (this.id % 5) * 0.17) % 1;
                const fx = this.x + this.size * (0.2 + 0.3 * i) + Math.sin(t * 9 + i) * 2;
                const fy = this.y + this.size * (0.9 - k * 0.9);
                const r = 3.2 * (1 - k) + 0.6;
                ctx.moveTo(fx + r, fy);
                ctx.arc(fx, fy, r, 0, Math.PI * 2);
            }
            ctx.fill();
        }
        if (this.elite) SpriteCache.drawPx(ctx, Enemy.eliteSprite(this.size, this.type === 'giant' ? 10 : 6), this.x, this.y, snap);
        if (this.stunTimer > 0 && this.type !== 'gunner') {
            const cx = this.x + this.size / 2;
            const cy = this.y - 16;
            const star = Enemy.stunStarSprite();
            for (let i = 0; i < 3; i++) {
                const a = (Date.now() * 0.003 + i * (Math.PI * 2 / 3));
                const sx = cx + Math.cos(a) * 8;
                const sy = cy + Math.sin(a) * 4 - 2;
                SpriteCache.drawPx(ctx, star, sx - 6, sy - 6, snap);
            }
        }

        // 冻结时:在敌人身上叠加冰封效果(蓝色半透明 + 冰晶高光;炮手只有冰块 + ❄)
        if (frozen) {
            const isGunner = this.type === 'gunner';
            const r = isGunner ? 7 : this.type === 'giant' ? 10 : 6;
            SpriteCache.drawPx(ctx, Enemy.frozenSprite(this.size, r, !isGunner), this.x, this.y, snap);
        }
    }

    // ── 精灵缓存(静态部分只画一次,之后 drawImage) ──
    static bodySprite(type, size) {
        // 外扩按光晕实际范围算(原先固定 24,高分屏上大半是透明像素,每帧白白参与混合)
        const pad = SpriteCache.padFor(type === 'gunner' ? 14 : type === 'giant' ? 20 : 12);
        return SpriteCache.get(`enemy|${type}|${size}`, size, size, pad, g => {
            if (type === 'gunner') {
                g.shadowBlur = SpriteCache.blur(14);
                g.shadowColor = '#ff6f00';
                const grad = g.createLinearGradient(0, 0, size, size);
                grad.addColorStop(0, '#ffab40');
                grad.addColorStop(1, '#e65100');
                g.fillStyle = grad;
                roundRect(g, 0, 0, size, size, 7);
                g.fill();
                g.shadowBlur = 0;
                g.strokeStyle = 'rgba(255,111,0,0.8)';
                g.lineWidth = 1.5;
                roundRect(g, 0, 0, size, size, 7);
                g.stroke();
                return;
            }
            const glowColors = { chaser: '#ff1744', patroller: '#2979ff', giant: '#d500f9', dasher: '#ffd600', bomber: '#ff4081', treasure: '#ffd740', healer: '#00e676', splitter: '#00e5ff', shard: '#18ffff' };
            const lightColors = { chaser: '#ff6b6b', patroller: '#64b5f6', giant: '#e040fb', dasher: '#fff59d', bomber: '#ff80ab', treasure: '#fffde7', healer: '#b9f6ca', splitter: '#84ffff', shard: '#b2ebf2' };
            const darkColors = { chaser: '#b71c1c', patroller: '#0d47a1', giant: '#6a0080', dasher: '#f57f17', bomber: '#880e4f', treasure: '#c79100', healer: '#00695c', splitter: '#006064', shard: '#00838f' };
            const labels = { chaser: '追', patroller: '巡', giant: '巨', dasher: '冲', bomber: '爆', treasure: '宝', healer: '医', splitter: '裂', shard: '' };
            const glow = glowColors[type] || '#ff1744';
            const r = type === 'giant' ? 10 : 6;

            g.shadowBlur = SpriteCache.blur(type === 'giant' ? 20 : type === 'shard' ? 8 : 12);
            g.shadowColor = glow;
            const grad = g.createLinearGradient(0, 0, size, size);
            grad.addColorStop(0, lightColors[type] || '#ff6b6b');
            grad.addColorStop(1, darkColors[type] || '#b71c1c');
            g.fillStyle = grad;
            roundRect(g, 0, 0, size, size, r);
            g.fill();

            g.shadowBlur = 0;
            g.strokeStyle = `${glow}99`;
            g.lineWidth = 1.5;
            roundRect(g, 0, 0, size, size, r);
            g.stroke();
            // 分裂者 / 碎片:身上的裂纹提示「会碎」
            if (type === 'splitter' || type === 'shard') {
                g.strokeStyle = 'rgba(224,255,255,0.75)';
                g.lineWidth = type === 'shard' ? 1.2 : 1.6;
                g.beginPath();
                g.moveTo(size * 0.12, size * 0.2);
                g.lineTo(size * 0.42, size * 0.42);
                g.lineTo(size * 0.32, size * 0.62);
                g.lineTo(size * 0.62, size * 0.9);
                g.moveTo(size * 0.42, size * 0.42);
                g.lineTo(size * 0.85, size * 0.3);
                g.stroke();
            }

            g.fillStyle = type === 'treasure' ? '#6d4c00' : 'rgba(255,255,255,0.9)';
            g.font = `bold ${Math.floor(size * 0.38)}px Arial`;
            g.textAlign = 'center';
            g.textBaseline = 'middle';
            g.fillText(labels[type] || '?', size / 2, size / 2);
        });
    }

    // 精英金框 + 头顶皇冠(皇冠在血条上方,外扩要留够)
    static eliteSprite(size, r) {
        return SpriteCache.get(`enemy|elite|${size}|${r}`, size, size, SpriteCache.padFor(10) + 22, g => {
            g.shadowBlur = SpriteCache.blur(10);
            g.shadowColor = '#ffc400';
            g.strokeStyle = '#ffd740';
            g.lineWidth = 2.5;
            roundRect(g, -2, -2, size + 4, size + 4, r + 2);
            g.stroke();
            g.fillStyle = '#ffd740';
            g.font = 'bold 15px Arial';
            g.textAlign = 'center';
            g.textBaseline = 'middle';
            g.fillText('♛', size / 2, -20);
        });
    }

    // 受击白闪:纯白圆角块,绘制时用 globalAlpha 控制强度
    static flashSprite(size, r) {
        return SpriteCache.get(`enemy|flash|${size}|${r}`, size, size, 1, g => {
            g.fillStyle = '#ffffff';
            roundRect(g, 0, 0, size, size, r);
            g.fill();
        });
    }

    static gunnerLabelSprite(size) {
        return SpriteCache.get(`enemy|gunnerLabel|${size}`, size, size, 1, g => {
            g.fillStyle = 'rgba(255,255,255,0.9)';
            g.font = `bold ${Math.floor(size * 0.3)}px Arial`;
            g.textAlign = 'center';
            g.textBaseline = 'middle';
            g.fillText('炮', size / 2, size / 2);
        });
    }

    // 眩晕星星(带金色光晕),12×12 逻辑尺寸,星形居中
    static stunStarSprite() {
        return SpriteCache.get('enemy|stunStar', 12, 12, SpriteCache.padFor(10), g => {
            g.shadowBlur = SpriteCache.blur(10);
            g.shadowColor = '#ffd700';
            g.fillStyle = '#ffd700';
            g.font = '11px Arial';
            g.textAlign = 'center';
            g.textBaseline = 'middle';
            g.fillText('★', 6, 6);
        });
    }

    static barrelSprite(len, w) {
        return SpriteCache.get(`enemy|barrel|${len}|${w}`, len, w, SpriteCache.padFor(8), g => {
            g.shadowBlur = SpriteCache.blur(8);
            g.shadowColor = '#ff9800';
            const bGrad = g.createLinearGradient(0, 0, len, w);
            bGrad.addColorStop(0, '#ffd54f');
            bGrad.addColorStop(1, '#bf360c');
            g.fillStyle = bGrad;
            roundRect(g, 0, 0, len, w, 3);
            g.fill();
            g.shadowBlur = 0;
            g.strokeStyle = 'rgba(255,200,50,0.7)';
            g.lineWidth = 1;
            roundRect(g, 0, 0, len, w, 3);
            g.stroke();
        });
    }

    // detailed: 普通敌人带米字纹与六角冰晶;炮手只有冰块 + ❄
    static frozenSprite(size, r, detailed) {
        return SpriteCache.get(`enemy|frozen|${size}|${r}|${detailed ? 1 : 0}`, size, size, SpriteCache.padFor(14), g => {
            g.globalAlpha = 0.55;
            const iceGrad = g.createLinearGradient(0, 0, size, size);
            iceGrad.addColorStop(0, 'rgba(160,220,255,0.9)');
            iceGrad.addColorStop(1, 'rgba(60,140,220,0.7)');
            g.fillStyle = iceGrad;
            g.shadowBlur = SpriteCache.blur(14);
            g.shadowColor = '#88ddff';
            roundRect(g, 0, 0, size, size, r);
            g.fill();
            g.shadowBlur = 0;
            const c = size / 2;
            if (detailed) {
                g.globalAlpha = 0.7;
                g.strokeStyle = 'rgba(200,240,255,0.8)';
                g.lineWidth = 1.2;
                // 米字纹
                for (let i = 0; i < 4; i++) {
                    const a = (i / 4) * Math.PI;
                    const rr = size * 0.42;
                    g.beginPath();
                    g.moveTo(c + Math.cos(a) * rr, c + Math.sin(a) * rr);
                    g.lineTo(c - Math.cos(a) * rr, c - Math.sin(a) * rr);
                    g.stroke();
                }
                // 中心小六角
                g.beginPath();
                for (let i = 0; i < 6; i++) {
                    const a = (i / 6) * Math.PI * 2;
                    const rr = size * 0.12;
                    i === 0 ? g.moveTo(c + Math.cos(a) * rr, c + Math.sin(a) * rr)
                            : g.lineTo(c + Math.cos(a) * rr, c + Math.sin(a) * rr);
                }
                g.closePath();
                g.stroke();
            }
            // ❄ 图标
            g.globalAlpha = 0.9;
            g.fillStyle = '#ddf4ff';
            g.font = `bold ${Math.floor(size * 0.35)}px Arial`;
            g.textAlign = 'center';
            g.textBaseline = 'middle';
            g.fillText('❄', c, c);
        });
    }
}

class Item {
    constructor(x, y, type) {
        this.id = nextEntityId();
        this.targetX = x;
        this.targetY = y;
        this.x = x;
        this.y = y - 80; // 从上方开始下落
        this.size = 25;
        this.type = type;
        this.color = '#2196F3';
        this.icon = '';
        this.rarity = 'common';

        // 稀有度配置:寿命越短表示越稀有(应尽快拾取)
        // 配色:普通绿、稀有蓝、史诗紫金
        const cfg = {
            potion:           { color: '#4CAF50', icon: '💊', rarity: 'common', duration: 15 },
            exp_book:         { color: '#ff9800', icon: '📚', rarity: 'common', duration: 15 },
            snowflake:        { color: '#2196F3', icon: '❄️', rarity: 'rare',   duration: 10 },
            bomb:             { color: '#f44336', icon: '💣', rarity: 'rare',   duration: 10 },
            heart:            { color: '#e91e63', icon: '❤️', rarity: 'epic',   duration: 6  },
            potion_invicible: { color: '#9c27b0', icon: '⚡', rarity: 'epic',   duration: 5  }
        };
        // 限时装备:按 GEARS 配色,地上停留 12 秒
        this.gear = type.startsWith('gear_') ? type.slice(5) : null;
        const gd = this.gear && GEARS[this.gear];
        // 技能石:按属性系配色,地上停留 15 秒
        this.gem = type.startsWith('gem_') && GEMS[type.slice(4)] ? type.slice(4) : null;
        const gm = this.gem && GEMS[this.gem];
        const c = gd ? { color: gd.color, icon: gd.icon, rarity: 'epic', duration: 12 }
            : gm ? { color: gm.color, icon: gm.icon, rarity: 'rare', duration: 15 }
            : (cfg[type] || cfg.potion);
        this.color = c.color;
        this.icon = c.icon;
        this.rarity = c.rarity;
        this.duration = c.duration;
        this.maxDuration = c.duration;

        // 下落入场动画
        this.landTimer = 0.4; // 0.4s 落地
        this.maxLandTimer = 0.4;
        this.spawnY = this.y;

        // 旋转 & 浮动相位(用于 render)
        this.spinPhase = Math.random() * Math.PI * 2;
        this.bobPhase = Math.random() * Math.PI * 2;
    }

    update() {
        this.duration -= DT;
        if (this.landTimer > 0) {
            this.landTimer -= DT;
            // 缓动:easeOutQuad
            const t = 1 - Math.max(0, this.landTimer / this.maxLandTimer);
            const eased = 1 - (1 - t) * (1 - t);
            this.y = this.spawnY + (this.targetY - this.spawnY) * eased;
            if (this.landTimer <= 0) this.y = this.targetY;
        } else if (this.x !== this.targetX || this.y !== this.targetY) {
            // 联机 guest:被磁吸的道具在快照间平滑追上 host 的位置
            this.x += (this.targetX - this.x) * 0.35;
            this.y += (this.targetY - this.y) * 0.35;
            if (Math.abs(this.targetX - this.x) < 0.3 && Math.abs(this.targetY - this.y) < 0.3) { this.x = this.targetX; this.y = this.targetY; }
        }
        this.spinPhase += 0.04;
        this.bobPhase += 0.08;
    }

    // 技能石:悬浮旋转的切面宝石 + 名字(只用渐变填充,不用 shadowBlur)
    _renderGem(ctx) {
        const time = performance.now() / 1000;
        const def = GEMS[this.gem];
        const c = def.color;
        const cx = this.x + this.size / 2;
        const cy = this.y + this.size / 2 + (this.landTimer > 0 ? 0 : Math.sin(this.bobPhase) * 2.5);
        const lifePct = this.duration / this.maxDuration;
        const alpha = lifePct < 0.3 ? 0.4 + 0.6 * Math.abs(Math.sin(time * (lifePct < 0.15 ? 18 : 10))) : 1;
        const r = 12;
        const w = r * (0.5 + 0.5 * Math.abs(Math.cos(this.spinPhase * 1.5)));   // 绕竖轴旋转:宽度随相位变化
        ctx.save();
        ctx.globalAlpha = alpha;
        const pulse = 0.8 + 0.2 * Math.sin(time * 4 + this.spinPhase);
        const glow = ctx.createRadialGradient(cx, cy, 2, cx, cy, r * 2.6 * pulse);
        glow.addColorStop(0, c + '99');
        glow.addColorStop(1, c + '00');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(cx, cy, r * 2.6 * pulse, 0, Math.PI * 2);
        ctx.fill();
        // 八面体剪影:上尖下尖,腰线偏上
        const top = cy - r * 1.25, mid = cy - r * 0.25, bot = cy + r * 1.25;
        ctx.beginPath();
        ctx.moveTo(cx, top);
        ctx.lineTo(cx + w, mid);
        ctx.lineTo(cx, bot);
        ctx.lineTo(cx - w, mid);
        ctx.closePath();
        const grad = ctx.createLinearGradient(cx - w, top, cx + w, bot);
        grad.addColorStop(0, '#ffffff');
        grad.addColorStop(0.35, c);
        grad.addColorStop(1, '#0d1620');
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.85)';
        ctx.lineWidth = 1.2;
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx - w, mid); ctx.lineTo(cx + w, mid);
        ctx.moveTo(cx, top); ctx.lineTo(cx + w * 0.3, mid); ctx.lineTo(cx, bot);
        ctx.strokeStyle = 'rgba(255,255,255,0.4)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.font = 'bold 10px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillText(def.name, cx + 1, bot + 5);
        ctx.fillStyle = c;
        ctx.fillText(def.name, cx, bot + 4);
        ctx.restore();
    }

    render(ctx) {
        if (this.gem) { this._renderGem(ctx); return; }
        const time = Date.now() * 0.001;
        const cx = this.x + this.size / 2;
        const cy = this.y + this.size / 2;
        const landing = this.landTimer > 0;

        // 落地光圈(下落动画结束瞬间扩散)
        if (landing) {
            const prog = 1 - (this.landTimer / this.maxLandTimer);
            ctx.save();
            ctx.globalAlpha = (1 - prog) * 0.7;
            ctx.strokeStyle = this.color;
            ctx.lineWidth = 2;
            ctx.shadowBlur = 14;
            ctx.shadowColor = this.color;
            ctx.beginPath();
            ctx.arc(this.targetX + this.size / 2, this.targetY + this.size / 2, this.size * (0.5 + prog * 1.5), 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }

        // 浮动效果(着陆后)
        const bob = landing ? 0 : Math.sin(this.bobPhase) * 2;
        const drawY = this.y + bob;
        const drawCy = cy + bob;

        // 寿命警告:剩余 < 30% 闪烁,剩 < 15% 红框
        const lifePct = this.duration / this.maxDuration;
        let flicker = 1;
        let warningFlash = false;
        if (lifePct < 0.30) {
            const speed = lifePct < 0.15 ? 18 : 10;
            flicker = 0.4 + 0.6 * Math.abs(Math.sin(time * speed));
            warningFlash = lifePct < 0.15;
        }

        // 稀有度光环强度
        const rarityAuraScale = { common: 1.0, rare: 1.4, epic: 1.8 };
        const auraScale = rarityAuraScale[this.rarity] || 1;
        const pulse = 0.7 + Math.sin(time * 5 + this.spinPhase) * 0.3;

        ctx.save();
        ctx.globalAlpha = flicker;

        // 外层稀有度光环(史诗有第二层金色)
        if (this.rarity === 'epic') {
            ctx.shadowBlur = 28;
            ctx.shadowColor = '#ffd700';
            ctx.fillStyle = 'rgba(255, 215, 0, 0.18)';
            ctx.beginPath();
            ctx.arc(cx, drawCy, this.size * 1.1 * pulse * auraScale, 0, Math.PI * 2);
            ctx.fill();
        } else if (this.rarity === 'rare') {
            ctx.shadowBlur = 20;
            ctx.shadowColor = '#42a5f5';
        }

        // 主光环
        ctx.shadowBlur = 18 * pulse * auraScale;
        ctx.shadowColor = this.color;
        ctx.fillStyle = `${this.color}33`;
        ctx.beginPath();
        ctx.arc(cx, drawCy, this.size * 0.75 * pulse * auraScale, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        // 主体方块(稍微旋转感)
        const grad = ctx.createRadialGradient(
            this.x + this.size * 0.35, drawY + this.size * 0.35, 0,
            cx, drawCy, this.size * 0.7
        );
        grad.addColorStop(0, `${this.color}ff`);
        grad.addColorStop(1, `${this.color}88`);
        ctx.fillStyle = grad;
        roundRect(ctx, this.x, drawY, this.size, this.size, 8);
        ctx.fill();

        // 边框(警告时变红)
        ctx.strokeStyle = warningFlash ? '#ff1744' : `${this.color}cc`;
        ctx.lineWidth = warningFlash ? 2.5 : 1.5;
        roundRect(ctx, this.x, drawY, this.size, this.size, 8);
        ctx.stroke();

        // 稀有度小标识(史诗在右上画小星星)
        if (this.rarity === 'epic') {
            ctx.fillStyle = '#ffd700';
            ctx.shadowBlur = 6;
            ctx.shadowColor = '#ffd700';
            ctx.font = 'bold 10px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('★', this.x + this.size - 2, drawY + 4);
            ctx.shadowBlur = 0;
        }
        ctx.restore();

        // 装备:外圈旋转的金色菱框 + 名字,一眼区别于消耗品
        if (this.gear) {
            ctx.save();
            ctx.globalAlpha = flicker;
            ctx.translate(cx, drawCy);
            ctx.rotate(time * 1.5);
            ctx.strokeStyle = '#ffd54f';
            ctx.lineWidth = 2;
            ctx.shadowBlur = 10;
            ctx.shadowColor = this.color;
            const r = this.size * 0.95;
            ctx.beginPath();
            ctx.moveTo(0, -r); ctx.lineTo(r, 0); ctx.lineTo(0, r); ctx.lineTo(-r, 0);
            ctx.closePath();
            ctx.stroke();
            ctx.restore();
            ctx.save();
            ctx.globalAlpha = flicker;
            ctx.font = 'bold 10px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillStyle = 'rgba(0,0,0,0.6)';
            ctx.fillText(GEARS[this.gear].name, cx + 1, drawY + this.size + 7);
            ctx.fillStyle = this.color;
            ctx.fillText(GEARS[this.gear].name, cx, drawY + this.size + 6);
            ctx.restore();
        }

        // 图标
        ctx.save();
        ctx.globalAlpha = flicker;
        ctx.font = '15px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(this.icon, cx, drawCy);
        ctx.restore();
    }
}

class BlockBoss {
    constructor(x, y, difficulty, playerMaxHealth) {
        this.x = x;
        this.y = y;
        this.size = 80;
        this.difficulty = difficulty;
        this.speed = 2.2; // 略低于玩家基础 5,但难度提高后会追近
        this.maxHealth = 2000 * difficulty;
        this.currentHealth = this.maxHealth;
        this.attack = Math.max(50, playerMaxHealth * 0.5);
        this.defense = 0; // 不靠防御,血厚
        this.color = '#4a0080';
        this.stunTimer = 0;
        // 用于击退动画(被击退时关闭碰撞)
        this.retreating = false;
        this.retreatVx = 0;
        this.retreatVy = 0;
        this.retreatTimer = 0;
        // 浮动相位
        this.phase = 0;
        this.hitFlash = -1; // 受击白闪,同 Enemy
        // 招式状态机(由 Game._updateBossAttacks 驱动):atk 为当前招式,
        // atkPhase 0 = 前摇(地面预警,可被眩晕打断),1 = 释放/收招;atkTimer 为当前阶段剩余秒数
        this.atk = null;          // null | 'charge' 冲撞 | 'ring' 弹幕 | 'slam' 震地 | 'laser' 激光扫射 | 'summon' 召唤爪牙
        this.atkPhase = 0;
        this.atkTimer = 0;
        this.atkDur = 1;          // 当前阶段总时长,用于画预警进度
        this.atkAngle = 0;        // 冲撞方向 / 弹幕起始角
        this.atkCD = 2.5;         // 出场后先追一会儿再出招
        this.lastAtk = null;
        this.enraged = false;     // 狂暴:出招更快、移速更高、弹幕两波
        this.tier = 1;            // 本局第几只魔王:2 起会激光扫射,3 起会召唤爪牙
        this.atkSweep = 1;        // 激光扫射方向(±1)
    }

    get slamRadius() { return this.enraged ? 160 : 140; }

    update(playerX, playerY) {
        this.phase += 0.04;
        if (this.retreating) {
            this.x += this.retreatVx;
            this.y += this.retreatVy;
            this.retreatTimer -= DT;
            return;
        }
        if (this.stunTimer > 0) {
            this.stunTimer -= DT;
            return;
        }
        if (this.atk === 'charge' && this.atkPhase === 1) {
            this.x += Math.cos(this.atkAngle) * BlockBoss.CHARGE_SPEED;
            this.y += Math.sin(this.atkAngle) * BlockBoss.CHARGE_SPEED;
            return;
        }
        if (this.atk) return; // 其余招式出招时站定
        const dx = playerX - this.x;
        const dy = playerY - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 0) {
            this.x += (dx / dist) * this.speed;
            this.y += (dy / dist) * this.speed;
        }
    }

    // 地面预警:画在魔王本体之下。只用纯填充/描边,不开 shadowBlur
    renderTelegraph(ctx) {
        if (!this.atk || this.retreating) return;
        const cx = this.x + this.size / 2;
        const cy = this.y + this.size / 2;
        const t = Math.max(0, Math.min(1, 1 - this.atkTimer / this.atkDur)); // 本阶段进度
        ctx.save();
        if (this.atk === 'charge') {
            const len = BlockBoss.CHARGE_SPEED * BlockBoss.CHARGE_TIME / DT + this.size / 2;
            const half = this.size / 2;
            ctx.translate(cx, cy);
            ctx.rotate(this.atkAngle);
            const a = this.atkPhase === 0 ? 0.1 + 0.25 * t : 0.25 * (1 - t);
            ctx.fillStyle = `rgba(255, 23, 68, ${a})`;
            ctx.fillRect(0, -half, len, half * 2);
            if (this.atkPhase === 0) {
                // 进度条:从魔王推向终点,填满即冲出
                ctx.fillStyle = 'rgba(255, 82, 82, 0.35)';
                ctx.fillRect(0, -half, len * t, half * 2);
                ctx.strokeStyle = `rgba(255, 82, 82, ${0.5 + 0.5 * t})`;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(0, -half); ctx.lineTo(len, -half);
                ctx.moveTo(0, half);  ctx.lineTo(len, half);
                ctx.stroke();
                // 流动箭头
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
                ctx.lineWidth = 3;
                const step = 46, off = (this.phase * 60) % step;
                ctx.beginPath();
                for (let x = half + off; x < len - 10; x += step) {
                    ctx.moveTo(x - 10, -12); ctx.lineTo(x, 0); ctx.lineTo(x - 10, 12);
                }
                ctx.stroke();
            }
        } else if (this.atk === 'slam') {
            const r = this.slamRadius;
            if (this.atkPhase === 0) {
                ctx.fillStyle = 'rgba(255, 23, 68, 0.12)';
                ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = `rgba(255, 82, 82, ${0.15 + 0.2 * t})`;
                ctx.beginPath(); ctx.arc(cx, cy, r * t, 0, Math.PI * 2); ctx.fill();
                ctx.strokeStyle = `rgba(255, 82, 82, ${0.5 + 0.5 * t})`;
                ctx.lineWidth = 2.5;
                ctx.setLineDash([10, 8]);
                ctx.lineDashOffset = -this.phase * 30;
                ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
            }
        } else if (this.atk === 'laser') {
            const L = BlockBoss.LASER_LEN, hw = BlockBoss.LASER_HALF;
            // 光束很长,裁到场地内,免得在竖屏的上下黑边里露出来
            ctx.beginPath(); ctx.rect(0, 0, 800, 600); ctx.clip();
            if (this.atkPhase === 0) {
                // 前摇:标出扫射扇形范围 + 逐渐变粗的瞄准线
                const arc = Math.PI * (this.enraged ? 0.8 : 0.6);
                const a0 = this.atkAngle - arc / 2, a1 = this.atkAngle + arc / 2;
                ctx.fillStyle = `rgba(224, 64, 251, ${0.05 + 0.08 * t})`;
                ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, 420, a0, a1); ctx.closePath(); ctx.fill();
                ctx.strokeStyle = `rgba(234, 128, 252, ${0.35 + 0.5 * t})`;
                ctx.lineWidth = 1 + hw * 2 * t * 0.5;
                const sa = this.atkAngle - (this.atkSweep || 1) * arc / 2; // 扫射起点
                ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(sa) * L, cy + Math.sin(sa) * L); ctx.stroke();
                ctx.setLineDash([6, 10]);
                ctx.lineWidth = 1.5;
                ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(-sa + 2 * this.atkAngle) * L, cy + Math.sin(-sa + 2 * this.atkAngle) * L); ctx.stroke();
            } else {
                // 光束本体:外层紫色 + 内层白芯,纯填充不开 shadowBlur
                const ang = BlockBoss.laserAngle(this);
                const flick = 0.85 + Math.random() * 0.15;
                ctx.translate(cx, cy);
                ctx.rotate(ang);
                ctx.fillStyle = `rgba(224, 64, 251, ${0.28 * flick})`;
                ctx.fillRect(0, -hw * 1.8, L, hw * 3.6);
                ctx.fillStyle = `rgba(234, 128, 252, ${0.75 * flick})`;
                ctx.fillRect(0, -hw, L, hw * 2);
                ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
                ctx.fillRect(0, -hw * 0.35, L, hw * 0.7);
            }
        } else if (this.atk === 'summon' && this.atkPhase === 0) {
            // 召唤法阵:旋转的虚线圈逐渐收拢、填满
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            ctx.lineDashOffset = -this.phase * 40;
            for (const [x, y] of BlockBoss.summonPoints(this, 800, 600)) {
                ctx.fillStyle = `rgba(179, 136, 255, ${0.1 + 0.25 * t})`;
                ctx.beginPath(); ctx.arc(x, y, 8 + 14 * t, 0, Math.PI * 2); ctx.fill();
                ctx.strokeStyle = `rgba(179, 136, 255, ${0.4 + 0.6 * t})`;
                ctx.beginPath(); ctx.arc(x, y, 28 - 6 * t, 0, Math.PI * 2); ctx.stroke();
            }
            ctx.setLineDash([]);
            ctx.strokeStyle = `rgba(179, 136, 255, ${0.25 + 0.3 * t})`;
            ctx.beginPath(); ctx.arc(cx, cy, 125, 0, Math.PI * 2); ctx.stroke();
        } else if (this.atk === 'ring' && this.atkPhase === 0) {
            // 每道弹道方向一根尖刺,子弹就从这些方向射出
            const n = BlockBoss.ringCount(this.enraged);
            const r0 = this.size * 0.6, r1 = r0 + 18 + 50 * t;
            ctx.strokeStyle = `rgba(255, 152, 0, ${0.3 + 0.6 * t})`;
            ctx.lineWidth = 3;
            ctx.beginPath();
            for (let k = 0; k < n; k++) {
                const ang = this.atkAngle + k * Math.PI * 2 / n;
                const c = Math.cos(ang), s = Math.sin(ang);
                ctx.moveTo(cx + c * r0, cy + s * r0);
                ctx.lineTo(cx + c * r1, cy + s * r1);
            }
            ctx.stroke();
        }
        ctx.restore();
    }

    takeDamage(damage) {
        // 魔王不死,血量归零由 Game 端判定击退
        if (Enemy.onDamage) Enemy.onDamage(damage);
        this.currentHealth = Math.max(0, this.currentHealth - damage);
        this._dn = (this._dn || 0) + damage;
        this.flash();
        return damage;
    }

    flash() {
        if (this.hitFlash <= -0.04) {
            this.hitFlash = 0.08;
            this._mpHit = true;
        }
    }

    triggerRetreat(playerX, playerY) {
        this.atk = null;
        // 沿背离玩家方向飞走
        const dx = this.x - playerX;
        const dy = this.y - playerY;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        this.retreatVx = (dx / dist) * 8;
        this.retreatVy = (dy / dist) * 8;
        this.retreating = true;
        this.retreatTimer = 1.5;
    }

    render(ctx) {
        // 前摇时本体抖动,提示"要出招了"
        const shaking = this.atk && this.atkPhase === 0 && !this.retreating;
        if (shaking) {
            ctx.save();
            ctx.translate((Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4);
        }
        this._renderBody(ctx);
        if (shaking) ctx.restore();
    }

    _renderBody(ctx) {
        const cx = this.x + this.size / 2;
        const cy = this.y + this.size / 2;
        const pulse = 0.8 + Math.sin(this.phase * (this.enraged ? 6 : 3)) * 0.2;

        // 外层威胁红光环
        ctx.save();
        ctx.globalAlpha = this.retreating ? Math.max(0, this.retreatTimer / 1.5) : 1;
        ctx.shadowBlur = 40 * pulse;
        ctx.shadowColor = '#ff1744';
        ctx.fillStyle = 'rgba(255, 23, 68, 0.18)';
        ctx.beginPath();
        ctx.arc(cx, cy, this.size * 0.95 * pulse, 0, Math.PI * 2);
        ctx.fill();

        // 紫色主体光晕
        ctx.shadowBlur = 25;
        ctx.shadowColor = '#7c4dff';

        const grad = ctx.createLinearGradient(this.x, this.y, this.x + this.size, this.y + this.size);
        const cols = this.enraged ? ['#ff5252', '#8e0038', '#2a0010'] : ['#7c4dff', '#4a0080', '#1a0033'];
        grad.addColorStop(0, cols[0]);
        grad.addColorStop(0.5, cols[1]);
        grad.addColorStop(1, cols[2]);
        ctx.fillStyle = grad;
        roundRect(ctx, this.x, this.y, this.size, this.size, 14);
        ctx.fill();

        // 边框(脉冲红)
        ctx.shadowBlur = 16;
        ctx.shadowColor = '#ff1744';
        ctx.strokeStyle = `rgba(255, 23, 68, ${0.5 + 0.5 * pulse})`;
        ctx.lineWidth = 3;
        roundRect(ctx, this.x, this.y, this.size, this.size, 14);
        ctx.stroke();

        if (this.hitFlash > 0) {
            ctx.shadowBlur = 0;
            ctx.globalAlpha *= Math.min(1, this.hitFlash / 0.08) * 0.6;
            ctx.fillStyle = '#ffffff';
            roundRect(ctx, this.x, this.y, this.size, this.size, 14);
            ctx.fill();
        }
        ctx.restore();

        // 中心红色眼睛/符号
        ctx.save();
        ctx.globalAlpha = this.retreating ? Math.max(0, this.retreatTimer / 1.5) : 1;
        ctx.fillStyle = '#ff1744';
        ctx.shadowBlur = 12;
        ctx.shadowColor = '#ff1744';
        ctx.font = `bold ${Math.floor(this.size * 0.45)}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('魔', cx, cy);
        ctx.restore();
    }
}

BlockBoss.CHARGE_SPEED = 10;   // 冲撞速度(px/帧)
BlockBoss.CHARGE_TIME = 0.55;  // 冲撞持续(秒)
BlockBoss.ringCount = enraged => enraged ? 16 : 12;
BlockBoss.ATK_CODES = [null, 'charge', 'ring', 'slam', 'laser', 'summon'];
BlockBoss.LASER_HALF = 13;     // 激光半宽
BlockBoss.LASER_LEN = 1100;    // 激光长度(足够射出 800×600 的场地)
// 扫射时光束的当前角度:从 atkAngle 一侧扫到另一侧,狂暴时扫得更宽
BlockBoss.laserAngle = b => {
    const t = b.atkPhase === 1 ? Math.max(0, Math.min(1, 1 - b.atkTimer / b.atkDur)) : 0;
    const arc = Math.PI * (b.enraged ? 0.8 : 0.6);
    return b.atkAngle + (b.atkSweep || 1) * arc * (t - 0.5);
};
// 召唤法阵:围绕魔王均匀分布,夹在场地内
BlockBoss.summonPoints = (b, W, H) => {
    const n = b.enraged ? 6 : 4, cx = b.x + b.size / 2, cy = b.y + b.size / 2, pts = [];
    for (let k = 0; k < n; k++) {
        const a = b.atkAngle + k * Math.PI * 2 / n;
        pts.push([Math.max(24, Math.min(W - 24, cx + Math.cos(a) * 125)), Math.max(24, Math.min(H - 24, cy + Math.sin(a) * 125))]);
    }
    return pts;
};

class Projectile {
    constructor(x, y, dx, dy, damage = 15) {
        this.id = nextEntityId();
        this.x = x;
        this.y = y;
        this.size = 8;
        this.dx = dx;
        this.dy = dy;
        this.color = '#ff9800';
        this.damage = damage;
        this.trail = [];
        this.kind = 0;   // 0 普通 / 3 奥术弹 / 4 爆裂火球(快照里同一编号)
    }

    setKind(kind) {
        this.kind = kind;
        if (kind === 3 || kind === 4) {
            this.x -= 2; this.y -= 2;
            this.size = 12;
        }
    }
    
    update() {
        this.trail.push({ x: this.x + this.size / 2, y: this.y + this.size / 2 });
        if (this.trail.length > 8) this.trail.shift();
        this.x += this.dx;
        this.y += this.dy;
    }
    
    render(ctx) {
        ctx.save();
        // 装备弹(风暴连弩)青绿、奥术弹紫、爆裂火球橙红
        const pal = this.gearBolt ? ['#b9f6ca', '#00e676', '#b9f6ca']
            : this.kind === 3 ? ['#d1c4e9', '#7c4dff', '#ede7f6']
            : this.kind === 4 ? ['#ffab91', '#ff3d00', '#ffccbc']
            : ['#ffcc80', '#ff9800', '#ffe082'];
        for (let i = 0; i < this.trail.length; i++) {
            const a = (i / this.trail.length) * 0.4;
            const r = (i / this.trail.length) * this.size * 0.5;
            ctx.globalAlpha = a;
            ctx.fillStyle = pal[0];
            ctx.beginPath();
            ctx.arc(this.trail[i].x, this.trail[i].y, r, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 12;
        ctx.shadowColor = pal[1];
        ctx.fillStyle = pal[2];
        ctx.beginPath();
        ctx.arc(this.x + this.size / 2, this.y + this.size / 2, this.size / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

class PiercingArrow {
    constructor(x, y, dx, dy, damage, game) {
        this.id = nextEntityId();
        this.x = x;
        this.y = y;
        this.size = 8;
        this.dx = dx;
        this.dy = dy;
        this.damage = damage;
        this.game = game;
        this.color = '#aaff44';
        this.trail = [];
        this.hitEnemies = new Set();
        this.angle = Math.atan2(dy, dx);
        this.isPiercing = true;
    }

    update() {
        this.trail.push({ x: this.x + this.size / 2, y: this.y + this.size / 2 });
        if (this.trail.length > 12) this.trail.shift();
        this.x += this.dx;
        this.y += this.dy;

        const ax = this.x + this.size / 2;
        const ay = this.y + this.size / 2;
        const g = this.game;

        for (let j = this.game.enemies.length - 1; j >= 0; j--) {
            const e = this.game.enemies[j];
            if (this.hitEnemies.has(e)) continue;
            const ex = e.x + e.size / 2;
            const ey = e.y + e.size / 2;
            if (Math.abs(ax - ex) < (e.size / 2 + this.size / 2) && Math.abs(ay - ey) < (e.size / 2 + this.size / 2)) {
                this.hitEnemies.add(e);
                const prevCtx = g._ctx;
                g._ctx = this.ctx || null;
                const dmg = g._applyHitMods(this.owner, e, this.damage * (e.elite ? this.eliteMult || 1 : 1));
                g._creditTo(this.owner, () => e.takeDamage(dmg));
                g._afterHit(this.owner, e, dmg);
                this.game._knockbackDir(e, this.dx, this.dy, 4);
                this.game.spawnHitParticles(ex, ey, '#aaff44', 6);
                if (e.currentHealth <= 0) {
                    this.game.spawnHitParticles(ex, ey, e.color, 10);
                    this.game._runAsPlayer(this.owner, () => this.game._onEnemyKilled(e));
                    this.game.enemies.splice(j, 1);
                }
                g._ctx = prevCtx;
            }
        }
        // 命中魔王
        const boss = this.game.boss;
        if (boss && this.game.bossState === 'active' && !this.hitEnemies.has(boss)) {
            const bx = boss.x + boss.size / 2;
            const by = boss.y + boss.size / 2;
            if (Math.abs(ax - bx) < (boss.size / 2 + this.size / 2) && Math.abs(ay - by) < (boss.size / 2 + this.size / 2)) {
                this.hitEnemies.add(boss);
                const prevCtx = g._ctx;
                g._ctx = this.ctx || null;
                const bdmg = g._applyHitMods(this.owner, boss, this.damage * (this.eliteMult || 1));
                g._creditTo(this.owner, () => boss.takeDamage(bdmg));
                g._afterHit(this.owner, boss, bdmg);
                g._ctx = prevCtx;
                this.game.bossDamageDealt += bdmg;
                this.game.spawnHitParticles(bx, by, '#ff1744', 8);
            }
        }
    }

    render(ctx) {
        ctx.save();
        for (let i = 0; i < this.trail.length; i++) {
            const a = (i / this.trail.length) * 0.4;
            const r = (i / this.trail.length) * this.size * 0.4;
            ctx.globalAlpha = a;
            ctx.fillStyle = '#ccff88';
            ctx.beginPath();
            ctx.arc(this.trail[i].x, this.trail[i].y, r, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 14;
        ctx.shadowColor = '#aaff44';
        ctx.save();
        ctx.translate(this.x + this.size / 2, this.y + this.size / 2);
        ctx.rotate(this.angle);
        ctx.fillStyle = '#ddff88';
        ctx.beginPath();
        ctx.moveTo(10, 0);
        ctx.lineTo(-8, -3);
        ctx.lineTo(-8, 3);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        ctx.restore();
    }
}

class EnemyBullet {
    static TRAIL = 8; // 尾迹长度,也是尾迹透明度的合批档位数
    constructor(x, y, vx, vy, damage) {
        this.id = nextEntityId();
        this.x = x - 6;
        this.y = y - 6;
        this.size = 12;
        this.vx = vx;
        this.vy = vy;
        this.damage = damage;
        this.trail = [];
        this.angle = Math.atan2(vy, vx);
    }

    update() {
        this.trail.push({ x: this.x + this.size / 2, y: this.y + this.size / 2 });
        if (this.trail.length > EnemyBullet.TRAIL) this.trail.shift();
        this.x += this.vx;
        this.y += this.vy;
    }

    // 所有敌方子弹一起画:尾迹按透明度档位合并成 TRAIL 条路径(原来每颗子弹每个尾迹点一次 fill),
    // 弹体用缓存精灵按飞行方向旋转贴图(原来每颗子弹一次实时 shadowBlur + 径向渐变)
    static renderAll(ctx, bullets) {
        if (!bullets.length) return;
        const L = EnemyBullet.TRAIL;
        ctx.save();
        ctx.fillStyle = '#ffcc80';
        for (let k = 1; k < L; k++) {
            ctx.beginPath();
            let any = false;
            for (const b of bullets) {
                const n = b.trail.length;
                for (let i = 1; i < n; i++) {
                    if (Math.round(i / n * L) !== k) continue;
                    const p = b.trail[i], r = b.size * 0.3 * (i / n);
                    ctx.moveTo(p.x + r, p.y);
                    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
                    any = true;
                }
            }
            if (any) { ctx.globalAlpha = k / L * 0.45; ctx.fill(); }
        }
        ctx.restore();
        for (const b of bullets) b.render(ctx);
    }

    render(ctx) {
        const cx = this.x + this.size / 2;
        const cy = this.y + this.size / 2;
        const spr = EnemyBullet.bodySprite(this.size);
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(this.angle);
        SpriteCache.draw(ctx, spr, -this.size / 2, -this.size / 2, this.size, this.size);
        ctx.restore();
    }

    // 精灵坐标系 (0,0)-(size,size),中心为弹体中心、+x 为飞行方向
    static bodySprite(size) {
        const pad = SpriteCache.padFor(12);
        return SpriteCache.get('ebullet|' + size, size, size, pad, g => {
            const c = size / 2;
            g.translate(c, c);
            g.shadowBlur = SpriteCache.blur(12);
            g.shadowColor = '#ff6f00';
            const bGrad = g.createRadialGradient(0, 0, 0, 0, 0, size * 0.6);
            bGrad.addColorStop(0, '#ffee58');
            bGrad.addColorStop(0.5, '#ff9800');
            bGrad.addColorStop(1, '#bf360c');
            g.fillStyle = bGrad;
            g.beginPath();
            g.ellipse(0, 0, size * 0.6, size * 0.38, 0, 0, Math.PI * 2);
            g.fill();
            g.shadowBlur = 0;
            g.fillStyle = 'rgba(255,255,200,0.5)';
            g.beginPath();
            g.ellipse(-size * 0.15, -size * 0.1, size * 0.22, size * 0.12, -0.3, 0, Math.PI * 2);
            g.fill();
        });
    }
}

window.addEventListener('load', () => {
    const game = new Game();
    game.render();
    updateBestScoreLabel();
    updateProgressLabel();

    // ── 新手指南:首次打开自动弹出一次,之后可从大厅再次打开 ──
    const tipsOverlay = document.getElementById('tipsOverlay');
    const progressOverlay = document.getElementById('progressOverlay');
    if (!Store.get('blockrun.tutorialSeen', false)) tipsOverlay.style.display = 'flex';
    document.getElementById('openTips').addEventListener('click', () => { tipsOverlay.style.display = 'flex'; });
    document.getElementById('closeTips').addEventListener('click', () => {
        tipsOverlay.style.display = 'none';
        Store.set('blockrun.tutorialSeen', true);
    });
    document.getElementById('openProgress').addEventListener('click', () => {
        renderProgressPanel();
        progressOverlay.style.display = 'flex';
    });
    document.getElementById('closeProgress').addEventListener('click', () => {
        progressOverlay.style.display = 'none';
        updateProgressLabel();
    });

    // ── 操控方式(移动 + 技能按键):进入游戏前询问(可记住),大厅按钮随时更改 ──
    const controlOverlay = document.getElementById('controlOverlay');
    const controlRemember = document.getElementById('controlRemember');
    const moveOpts = controlOverlay.querySelectorAll('[data-group=move] .control-opt');
    const skillOpts = controlOverlay.querySelectorAll('[data-group=skill] .control-opt');
    let controlThen = null;
    let pickMove = game.controlMode, pickSkill = game.skillMode;
    const updateControlLabel = () => {
        document.getElementById('controlLabel').textContent =
            (game.controlMode === 'tap' ? '点触移动' : '虚拟摇杆') + ' · ' + (game.skillMode === 'aim' ? '拖拽瞄准' : '点按释放');
    };
    updateControlLabel();
    const syncOpts = () => {
        moveOpts.forEach(o => o.classList.toggle('selected', o.dataset.mode === pickMove));
        skillOpts.forEach(o => o.classList.toggle('selected', o.dataset.mode === pickSkill));
    };
    const openControl = (then) => {
        controlThen = then;
        pickMove = game.controlMode; pickSkill = game.skillMode;
        controlRemember.checked = !!Store.get('blockrun.controlRemember', false);
        document.getElementById('controlConfirm').textContent = then ? '开始游戏' : '确定';
        syncOpts();
        controlOverlay.style.display = 'flex';
    };
    // 进入游戏的入口统一走这里:勾过「不再询问」就直接开始
    // 进入游戏都发生在一次点击里:顺带请求沉浸式全屏横屏(触屏设备、未关闭时)
    const withControlChoice = (then) => {
        if (Store.get('blockrun.controlRemember', false)) { Immersive.enter(); then(); }
        else openControl(then);
    };
    moveOpts.forEach(o => o.addEventListener('click', () => { pickMove = o.dataset.mode; syncOpts(); }));
    skillOpts.forEach(o => o.addEventListener('click', () => { pickSkill = o.dataset.mode; syncOpts(); }));
    document.getElementById('controlConfirm').addEventListener('click', () => {
        game.setControlMode(pickMove);
        game.setSkillMode(pickSkill);
        Store.set('blockrun.controlRemember', controlRemember.checked);
        updateControlLabel();
        controlOverlay.style.display = 'none';
        const then = controlThen;
        controlThen = null;
        if (then) { Immersive.enter(); then(); }
    });
    controlOverlay.addEventListener('click', (e) => {
        // 点遮罩空白处关闭(仅在大厅「更改」时;进入游戏前必须确定)
        if (e.target === controlOverlay && !controlThen) controlOverlay.style.display = 'none';
    });
    document.getElementById('openControl').addEventListener('click', () => openControl(null));

    // ── 难度:点击在 轻松 → 普通 → 噩梦 间循环(联机以房主为准) ──
    const updateDiffLabel = () => {
        const dm = diffDef(game.diffPref), el = document.getElementById('diffLabel');
        el.textContent = dm.name;
        el.style.color = dm.color;
        document.getElementById('diffToggle').title = dm.desc;
    };
    updateDiffLabel();
    document.getElementById('diffToggle').addEventListener('click', () => {
        game.setDiffMode(DIFF_KEYS[(DIFF_KEYS.indexOf(game.diffPref) + 1) % DIFF_KEYS.length]);
        updateDiffLabel();
        const dm = diffDef(game.diffPref);
        setStatus(`难度:${dm.name} · ${dm.desc}`);
    });

    // ── 沉浸式横屏全屏开关(仅触屏设备显示) ──
    const immersiveBtn = document.getElementById('immersiveToggle');
    const updateImmersiveLabel = () => {
        document.getElementById('immersiveLabel').textContent = Immersive.enabled ? '开' : '关';
    };
    if (Immersive.isTouch) {
        immersiveBtn.style.display = '';
        updateImmersiveLabel();
        immersiveBtn.addEventListener('click', () => {
            Immersive.setEnabled(!Immersive.enabled);
            updateImmersiveLabel();
        });
    }
    document.getElementById('rotateFullscreen').addEventListener('click', () => Immersive.enter());

    // ── 联机大厅按钮逻辑 ──
    const overlay      = document.getElementById('mpOverlay');
    const statusEl     = document.getElementById('mpStatus');
    const mpCodeInput  = document.getElementById('mpCode');
    const mpLobby      = document.getElementById('mpLobby');

    function setStatus(msg, isErr) {
        statusEl.textContent = msg;
        statusEl.className = 'mp-status' + (isErr ? ' error' : ' success');
    }

    // 读取服务器 URL（可在 URL hash 中指定，如 #ws://yourserver:8080）
    const serverUrl = location.hash ? location.hash.slice(1) : 'ws://' + location.hostname + ':8080';
    game.mpServerUrl = serverUrl;

    // 创建房间
    document.getElementById('mpCreate').addEventListener('click', () => withControlChoice(async () => {
        setStatus('连接服务器中...');
        try {
            await game.connectToServer(serverUrl);
            game.mpWs.send(JSON.stringify({ type: 'create' }));
        } catch (e) {
            setStatus('连接失败：' + e.message, true);
        }
    }));

    // 加入房间
    document.getElementById('mpJoin').addEventListener('click', () => {
        const code = (mpCodeInput.value || '').toUpperCase().trim();
        if (code.length !== 4) { setStatus('请输入4位房间码', true); return; }
        withControlChoice(() => joinRoom(code));
    });
    const joinRoom = async (code) => {
        setStatus('连接服务器中...');
        try {
            await game.connectToServer(serverUrl);
            game.mpWs.send(JSON.stringify({ type: 'join', code }));
        } catch (e) {
            setStatus('连接失败：' + e.message, true);
        }
    };

    // 房主：开始游戏
    document.getElementById('mpStart').addEventListener('click', () => {
        if (game.mpWs && game.mpWs.readyState === WebSocket.OPEN) {
            game.mpWs.send(JSON.stringify({ type: 'start' }));
        }
    });

    // 单人游戏
    document.getElementById('mpSingle').addEventListener('click', () => withControlChoice(() => {
        overlay.style.display = 'none';
        game.startGame();
    }));

    // 重启时回到大厅或重新开始
    document.getElementById('restartBtn').addEventListener('click', () => {
        game.restartGame();
        if (game.mpMode) {
            // 联机模式：重新加入（Host 重新开始游戏需要所有人重连）
            overlay.style.display = 'flex';
            mpLobby.style.display = 'none';
            game.mpMode = null;
            if (game.mpWs) { game.mpWs.close(); game.mpWs = null; }
        }
    });

    // 返回大厅
    const backToLobby = () => {
        game.restartGame();
        document.getElementById('gameOver').style.display = 'none';
        overlay.style.display = 'flex';
        mpLobby.style.display = 'none';
        if (game.mpWs) { game.mpWs.close(); game.mpWs = null; }
        game.mpMode = null;
    };
    game.onBackToLobby = backToLobby;   // 暂停面板「离开房间」也走这里
    const backBtn = document.getElementById('backToLobbyBtn');
    if (backBtn) backBtn.addEventListener('click', backToLobby);

    // 暂停按钮（兼容）
    const pauseBtn = document.getElementById('pauseBtn');
    if (pauseBtn) pauseBtn.addEventListener('click', () => game.togglePause());
    const startBtn = document.getElementById('startBtn');
    if (startBtn) startBtn.addEventListener('click', () => {
        overlay.style.display = 'none';
        game.startGame();
    });

    // 大厅输入框自动大写
    if (mpCodeInput) {
        mpCodeInput.addEventListener('input', () => {
            mpCodeInput.value = mpCodeInput.value.toUpperCase();
        });
        mpCodeInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') document.getElementById('mpJoin').click();
        });
    }
});
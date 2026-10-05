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

function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    addRoundRect(ctx, x, y, w, h, r);
}

// 只往当前路径追加一个圆角矩形子路径(不 beginPath),用于把多个圆角矩形合并成一次 fill
function addRoundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
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
const MP_ENEMY_TYPES = ['chaser', 'patroller', 'giant', 'gunner', 'dasher', 'bomber'];
const MP_ITEM_TYPES = ['potion', 'exp_book', 'snowflake', 'bomb', 'heart', 'potion_invicible'];

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
    minGap: { kill: 0.05, skill: 0.08, pickup: 0.06, hurt: 0.1, dash: 0.12, fuse: 0.2, bomb: 0.08 },

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
            case 'levelUp':
                [523, 659, 784, 1047].forEach((f, i) => this._tone(f, 0.16, 'triangle', 0.18, 1, i * 0.08));
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
            case 'gameOver':
                [659, 523, 440, 349].forEach((f, i) => this._tone(f, 0.3, 'triangle', 0.18, 1, i * 0.2));
                break;
        }
    }
};

class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
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

        this.enemyFreezeTimer = 0;

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
                  const cdm = g._getCDMultiplier(g.player.skillQ.level);
                  const base = (CLASS_BASE_CD[g.player.class] || { q: 3 }).q;
                  g.player.skillQ.maxCooldown = base * cdm;
              } },
            { id: 'skillEUp',    name: 'E 技能强化', icon: 'E', color: '#ba68c8', rarity: 'epic',
              desc: 'E 技能等级 +1', stackable: true, maxStacks: 2,
              applicable: g => !!g.player.class && g.player.skillE.level < 3,
              apply: g => {
                  g.player.skillE.level = Math.min(3, g.player.skillE.level + 1);
                  const cdm = g._getCDMultiplier(g.player.skillE.level);
                  const base = (CLASS_BASE_CD[g.player.class] || { e: 5 }).e;
                  g.player.skillE.maxCooldown = base * cdm;
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
              apply: g => { g.player.skillQ.maxCooldown = Math.max(1, g.player.skillQ.maxCooldown - 1); } },
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
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
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

            if (this.showingPotentialMenu || this.showingClassSelection) {
                this.checkButtonClick(x, y);
                return;
            }

            // 普通暂停(非菜单)时点击屏幕继续,触屏设备没有 P 键
            if (this.isRunning && this.isPaused) { this.togglePause(); return; }
            if (!this.isRunning) return;

            // 检查是否点在技能按钮上
            for (const btn of this.skillButtons) {
                if (x >= btn.x && x <= btn.x + btn.w && y >= btn.y && y <= btn.y + btn.h) {
                    this._requestSkill(btn.skill);
                    return; // 不触发移动
                }
            }

            // 否则移动
            this.setPlayerTarget(x, y);
        };

        this.canvas.addEventListener('click', (e) => {
            handlePointer(e.clientX, e.clientY);
        });

        this.canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            handlePointer(e.touches[0].clientX, e.touches[0].clientY);
        }, { passive: false });

        this.canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
        }, { passive: false });

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
        // 失焦时清空按键状态,避免切回来后方向键"卡住"一直移动
        window.addEventListener('blur', () => { this.keys = {}; });
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
                } catch (err) {
                    // 不让一次异常杀死整个循环;打印堆栈供排查
                    console.error('[game loop error]', err);
                }
                this._rafId = requestAnimationFrame(loop);
            };
            this._rafId = requestAnimationFrame(loop);
        }
    }
    
    togglePause() {
        if (this.isRunning) {
            this.isPaused = !this.isPaused;
        }
    }
    
    restartGame() {
        this.isRunning = false; // 让当前 rAF 循环自然结束
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
                    if (!this.mpGuestPlayers.has(msg.playerId)) {
                        const gp = new Player(this.width / 2 + msg.playerId * 40, this.height / 2);
                        gp.color = this._mpPlayerColor(msg.playerId);
                        this.mpGuestPlayers.set(msg.playerId, gp);
                    }
                }
                break;
            case 'castSkill':
                if (this.mpMode === 'host' && !this.isPaused) this._castGuestSkill(msg.playerId, msg.skill);
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
    //   p: [id, 种类(0 普通弹/1 穿透箭), x, y, 角度]
    //   b: [id, x, y, 角度]
    //   boss: [x, y, hp, maxHp, 击退中(0/1), 受击闪白(0/1), 招式序号(BlockBoss.ATK_CODES), 招式阶段, 阶段剩余, 阶段总长, 招式角度, 狂暴(0/1)]
    serializeState() {
        const players = [this._serializePlayer(this.player, 0)];
        for (const [id, gp] of this.mpGuestPlayers) {
            players.push(this._serializePlayer(gp, id));
        }
        return {
            e: this.enemies.map(e => {
                const row = [e.id, MP_ENEMY_TYPES.indexOf(e.type), q1(e.x), q1(e.y),
                    Math.ceil(e.currentHealth), Math.ceil(e.maxHealth), (e.stunTimer > 0 ? 1 : 0) | (e._mpHit ? 2 : 0)];
                e._mpHit = false;
                if (e.type === 'gunner') row.push(q2(e.aimAngle || 0), q2(e.shootTimer || 0), q2(e.shootInterval || 1));
                else if (e.type === 'dasher' || e.type === 'bomber') row.push(e.state, q2(e.stateTimer), q2(e.stateDur), q2(e.dashAngle), q1(e.type === 'dasher' ? e.dashDist : e.blastRadius));
                return row;
            }),
            boss: this.boss ? [q1(this.boss.x), q1(this.boss.y), Math.ceil(this.boss.currentHealth),
                Math.ceil(this.boss.maxHealth), this.boss.retreating ? 1 : 0, this._mpTakeBossHit(),
                BlockBoss.ATK_CODES.indexOf(this.boss.atk), this.boss.atkPhase, q2(this.boss.atkTimer),
                q2(this.boss.atkDur), q2(this.boss.atkAngle), this.boss.enraged ? 1 : 0] : null,
            i: this.items.map(i => [i.id, MP_ITEM_TYPES.indexOf(i.type), q1(i.targetX), q1(i.targetY), q1(i.duration)]),
            p: this.projectiles.map(p => [p.id, p.isPiercing && !p.pierceRemaining ? 1 : 0, q1(p.x), q1(p.y),
                q2(Math.atan2(p.dy, p.dx))]),
            b: this.enemyBullets.map(b => [b.id, q1(b.x), q1(b.y), q2(b.angle)]),
            players,
            ef: this._mpTakeNewEffects(),
            fx: this._mpFx.splice(0),
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
            dc: q2(p.dashCooldown), dt: q2(p.dashTimer), dg: p.dodgeCount || 0,
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
            r => new Enemy(r[2], r[3], MP_ENEMY_TYPES[r[1]] || 'chaser', 1),
            (e, r, isNew) => {
                this._mpSetTarget(e, r[2], r[3], isNew);
                e.currentHealth = r[4]; e.maxHealth = r[5];
                e.stunTimer = r[6] & 1 ? 1 : 0;
                if (r[6] & 2) e.flash();
                if (r.length > 7) {
                    if (e.type === 'gunner') { e.aimAngle = r[7]; e.shootTimer = r[8]; e.shootInterval = r[9]; }
                    else {
                        // 冲刺 / 点燃引信的音效按状态边沿在本机播放
                        if (!isNew && r[7] !== e.state) {
                            if (e.type === 'dasher' && r[7] === 2) Sound.play('dash');
                            if (e.type === 'bomber' && r[7] === 1) Sound.play('fuse');
                        }
                        e.state = r[7]; e.stateTimer = r[8]; e.stateDur = r[9]; e.dashAngle = r[10];
                        if (e.type === 'dasher') e.dashDist = r[11]; else e.blastRadius = r[11];
                    }
                }
            });
        this.enemies = en.list;
        if (en.removed.length > 0) Sound.play(en.removed.some(e => e.type === 'bomber') ? 'bomb' : 'kill');

        // Boss
        if (snapshot.boss) {
            const [bx, by, hp, maxHp, retreating, hit, atk, atkPhase, atkTimer, atkDur, atkAngle, enraged] = snapshot.boss;
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
        } else {
            this.boss = null;
        }

        // 道具(仅渲染;落地/旋转动画在本地跑)
        const it = this._mpSyncList(this.items, snapshot.i || [],
            r => new Item(r[2], r[3], MP_ITEM_TYPES[r[1]] || 'potion'),
            (o, r) => { o.duration = r[4]; });
        this.items = it.list;
        // 还剩不少时长就消失 = 被拾取了
        const picked = it.removed.find(o => o.duration > 0.3);
        if (picked) Sound.play('pickup', picked.rarity);

        // 子弹
        this.projectiles = this._mpSyncList(this.projectiles, snapshot.p || [],
            r => r[1] === 1
                ? new PiercingArrow(r[2], r[3], Math.cos(r[4]), Math.sin(r[4]), 0, null)
                : new Projectile(r[2], r[3], Math.cos(r[4]), Math.sin(r[4]), 0),
            (o, r, isNew) => { this._mpSetTarget(o, r[2], r[3], isNew); o.angle = r[4]; }).list;
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
            const { x, y, ...rest } = d;
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
    }

    // ── Guest：发送输入 ──
    sendGuestInput() {
        if (!this.mpWs || this.mpWs.readyState !== WebSocket.OPEN) return;
        const p = this.player;
        const hasTarget = p.moving && p.targetX !== null;
        const payload = JSON.stringify({
            type: 'input',
            keys: {
                ArrowUp:    !!this.keys['ArrowUp'],   ArrowDown:  !!this.keys['ArrowDown'],
                ArrowLeft:  !!this.keys['ArrowLeft'],  ArrowRight: !!this.keys['ArrowRight'],
                w: !!this.keys['w'], a: !!this.keys['a'],
                s: !!this.keys['s'], d: !!this.keys['d']
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
                dashMaxCd: p.dashMaxCooldown
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
            let gp = this.mpGuestPlayers.get(id);
            if (!gp) {
                gp = new Player(this.width / 2 + id * 40, this.height / 2);
                gp.color = this._mpPlayerColor(id);
                gp.extraLives = 2; // 额外复活次数
                this.mpGuestPlayers.set(id, gp);
            }
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
                if (s.qLevel)  gp.skillQ.level = s.qLevel;
                if (s.eLevel)  gp.skillE.level = s.eLevel;
                if (s.qMaxCd)  gp.skillQ.maxCooldown = s.qMaxCd;
                if (s.eMaxCd)  gp.skillE.maxCooldown = s.eMaxCd;
                if (s.dashMaxCd) gp.dashMaxCooldown = s.dashMaxCd;
            }
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
                class: gp.class, hurtCooldown: gp.hurtCooldown, invincibleTimer: gp.invincibleTimer
            });
        }
    }

    // ── Host：为指定 Player 对象配置职业 ──
    _applyClassToPlayer(p, className) {
        if (!CLASS_BASE_CD[className] || p.class) return;
        p.class = className;
        const adj = CLASS_BASE_ADJUST[className] || {};
        for (const [k, v] of Object.entries(adj)) p[k] = (p[k] || 0) + v;
        const cd = CLASS_BASE_CD[className];
        p.skillQ.maxCooldown = cd.q;
        p.skillE.maxCooldown = cd.e;
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
        }
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

    _renderPauseOverlay() {
        const ctx = this.ctx;
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(0, 0, this.width, this.height);
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${Math.min(52, this.width * 0.11)}px Arial`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.shadowBlur = 20; ctx.shadowColor = '#00c8ff';
        ctx.fillText('已暂停', this.width / 2, this.height * 0.45);
        ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(200,232,255,0.5)';
        ctx.font = `${Math.min(16, this.width * 0.034)}px Arial`;
        ctx.fillText('点击屏幕 / 按 P 继续 · M 静音', this.width / 2, this.height * 0.56);
        ctx.restore();
    }

    update() {
        // ── Guest 模式：仅应用 host 状态，处理本地输入 ──
        if (this.mpMode === 'guest') {
            if (!this.isPaused) {
                if (this.mpStateBuffer) {
                    this.applyRemoteState(this.mpStateBuffer);
                    this.mpStateBuffer = null;
                }
                // 职业选择触发（level 3+且无职业）
                if (this.level >= 3 && !this.player.class && !this.showingClassSelection && !this.showingPotentialMenu) {
                    this.showClassSelection();
                }
                // 按等级给予潜能点（每个新等级+1）
                if (this.level > (this._mpGuestLastLevel || 1)) {
                    const gained = this.level - (this._mpGuestLastLevel || 1);
                    this.player.potentialPoints += gained;
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
                this.bgTime += DT;
                this._uiTimer += DT;
                if (this._uiTimer >= 0.1) { this.updateUI(); this._uiTimer = 0; }
                this.sendGuestInput();
            }
            return;
        }

        // ── Host/单人 模式：先应用 guest 输入 ──
        if (this.mpMode === 'host') this._applyGuestInputs();

        if (!this.isPaused) {
            this.gameTime += DT;
            // 难度更平缓且封顶，避免后期速度碾压必死
            this.difficulty = Math.min(4, 1 + this.gameTime / 90);

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
            this._tickPendingActions();
            this.checkCollisions();
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
        this.player.skin = Progress.currentSkin();
    }

    _runStats() {
        return { score: this.score, time: Math.floor(this.gameTime), level: this.level,
                 bossRepels: this.runBossRepels || 0, cls: this.player.class, dodges: this.player.dodgeCount || 0 };
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
            ctx.fillText(`成就解锁 · ${t.name}`, x + 42, y + 14);
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
                      dash: p.dashCooldown || 0, dodge: p.dodgeCount || 0,
                      atk: b && b.atk ? b.atk + b.atkPhase : '', rage: !!(b && b.enraged) };
        const prev = this._sfxPrev;
        this._sfxPrev = cur;
        if (!prev) return;
        if (cur.hurt > prev.hurt + 0.3 && this.life > 0) {
            const died = cur.life < prev.life;
            Sound.play(died ? 'death' : 'hurt');
            this._onLocalHurt(died);
        }
        if (cur.kills > prev.kills) this._onLocalKill();
        if (cur.dash > prev.dash + 0.5) Sound.play('whoosh');
        if (cur.dodge > prev.dodge) { Sound.play('dodge'); this._triggerHitStop(0.05); }
        if (cur.level > prev.level) Sound.play('levelUp');
        if (cur.q > prev.q + 0.2 || cur.e > prev.e + 0.2) Sound.play('skill');
        if (cur.atk !== prev.atk && cur.atk) {
            if (cur.atk.endsWith('0')) Sound.play('bossTell');
            else Sound.play(cur.atk === 'slam1' ? 'bossSlam' : cur.atk === 'ring1' ? 'bossRing' : 'bossCharge');
        }
        if (cur.rage && !prev.rage) Sound.play('bossEnrage');
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
        for (const e of this.enemies) if (e.hitFlash > -1) e.hitFlash = Math.max(-1, e.hitFlash - DT);
        if (this.boss && this.boss.hitFlash > -1) this.boss.hitFlash = Math.max(-1, this.boss.hitFlash - DT);
        if (this.hurtVignette > 0) this.hurtVignette = Math.max(0, this.hurtVignette - DT);
    }

    // 本机受击时屏幕四周泛红
    _renderHurtVignette() {
        if (this.hurtVignette <= 0) return;
        const ctx = this.ctx;
        const W = this.width, H = this.height;
        const a = Math.min(1, this.hurtVignette / 0.35) * 0.55;
        const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.65);
        g.addColorStop(0, 'rgba(255,0,40,0)');
        g.addColorStop(1, `rgba(255,0,40,${a})`);
        ctx.save();
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
    }

    // 基础自动攻击:朝最近敌人(或魔王)发射,无职业/前期也有输出;间隔来自 this.player 的天赋
    _tickAutoAttack() {
        const p = this.player;
        p.autoAttackTimer -= DT;
        if (p.autoAttackTimer <= 0 && (this.enemies.length > 0 || (this.boss && this.bossState === 'active'))) {
            this.shoot();
            p.autoAttackTimer = p.autoAttackInterval;
        }
    }

    // 技能冷却 + 职业资源回复/衰减 + 圣光光环,作用于 this.player(guest 通过 _runAsPlayer 复用)
    _tickPlayerResources() {
        if (this.player.skillQ.cooldown > 0) this.player.skillQ.cooldown -= DT;
        if (this.player.skillE.cooldown > 0) this.player.skillE.cooldown -= DT;

        if (this.player.class === 'mage' && this.player.mana < this.player.maxMana) {
            this.player.mana = Math.min(this.player.maxMana, this.player.mana + this.player.manaRegen * DT);
        }
        // 战士怒气自动衰减(战斗中也持续)
        if (this.player.class === 'warrior' && this.player.rage > 0) {
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
                    const auraDmgTick = this._computeAttackDamage(this.player.attack) * 0.5 * DT * (this.player.paladinSkillDmgMult || 1);
                    for (let i = this.enemies.length - 1; i >= 0; i--) {
                        const e = this.enemies[i];
                        const dx = e.x + e.size / 2 - pcx;
                        const dy = e.y + e.size / 2 - pcy;
                        if (Math.sqrt(dx * dx + dy * dy) <= 80) {
                            e.takeDamage(auraDmgTick);
                            if (e.currentHealth <= 0) {
                                this.spawnHitParticles(e.x + e.size / 2, e.y + e.size / 2, e.color, 10);
                                this._onEnemyKilled(e);
                                this.enemies.splice(i, 1);
                            }
                        }
                    }
                    // 圣光光环对魔王也持续造伤
                    if (this.boss && this.bossState === 'active') {
                        const bx = this.boss.x + this.boss.size / 2;
                        const by = this.boss.y + this.boss.size / 2;
                        if (Math.sqrt((bx - pcx) ** 2 + (by - pcy) ** 2) <= 80 + this.boss.size / 2) {
                            this.boss.takeDamage(auraDmgTick);
                            this.bossDamageDealt += auraDmgTick;
                        }
                    }
                    this.effects.push({ type: 'holyAura', x: pcx, y: pcy, radius: 80, color: '#ffd700', ttl: 0.35, maxTtl: 0.35, pulse: this.player.holyAuraTimer });
                }
            }
        }
    }

    // 以指定玩家身份执行 fn:技能/资源代码统一读写 this.player,host 替 guest 施法时临时替换。
    // fn 内新排入的 pendingActions 会记住施法者,延迟触发时同样以该玩家身份执行。
    _runAsPlayer(p, fn) {
        if (!p || p === this.player) return fn();
        const saved = this.player;
        const n = this.pendingActions.length;
        this.player = p;
        this._actingAs = p;
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
    _castGuestSkill(playerId, which) {
        const gp = this.mpGuestPlayers.get(playerId);
        if (!gp || gp.currentHealth <= 0) return;
        if (which === 'dash') { this._runAsPlayer(gp, () => this._dash()); return; }
        if (!gp.class) return;
        this._runAsPlayer(gp, () => (which === 'E' ? this.castSkillE() : this.castSkillQ()));
    }

    // 本机按下 Q/E(键盘或触屏按钮):guest 发给 host 执行,其余本地执行
    _requestSkill(which) {
        if (this.mpMode === 'guest') {
            if (this.mpWs && this.mpWs.readyState === WebSocket.OPEN)
                this.mpWs.send(JSON.stringify({ type: 'castSkill', skill: which }));
            return;
        }
        if (which === 'dash') this._dash();
        else if (which === 'E') this.castSkillE(); else this.castSkillQ();
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
        if (p.hurtCooldown > 0) return false;
        if (p.dashTimer > 0) { this._onPerfectDodge(p); return false; }
        return true;
    }

    // 完美闪避:每次冲刺最多触发一次,返还一半冲刺冷却
    _onPerfectDodge(p) {
        if (p.dashDodged) return;
        p.dashDodged = true;
        p.dodgeCount = (p.dodgeCount || 0) + 1;
        p.dashCooldown = Math.max(0, p.dashCooldown - p.dashMaxCooldown * 0.5);
        const cx = p.x + p.size / 2, cy = p.y + p.size / 2;
        this._showFloatingText('闪避!', cx, p.y - 18, '#80d8ff');
        this.spawnBurstRing(cx, cy, 22, '#80d8ff', 12);
    }

    _checkGuestCollisions() {
        for (const [, gp] of this.mpGuestPlayers) {
            if (gp.hurtCooldown > 0) { gp.hurtCooldown -= DT; continue; }
            for (const enemy of this.enemies) {
                if (this.checkCollision(gp, enemy)) {
                    if (this._canHurt(gp)) {
                        gp.takeDamage(enemy.contactDamage());
                        gp.hurtCooldown = 0.6 + (gp.hurtCooldownBonus || 0);
                    }
                    break;
                }
            }
            // 魔王碰撞
            if (gp.hurtCooldown <= 0 && this.boss && this.bossState === 'active' && this.checkCollision(gp, this.boss) && this._canHurt(gp)) {
                gp.takeDamage(this.boss.attack);
                gp.hurtCooldown = 0.6 + (gp.hurtCooldownBonus || 0);
            }
            // 敌方子弹(炮手/魔王弹幕)
            if (gp.hurtCooldown <= 0 && gp.currentHealth > 0) {
                for (let i = this.enemyBullets.length - 1; i >= 0; i--) {
                    const b = this.enemyBullets[i];
                    if (!this.checkCollision(gp, b)) continue;
                    if (!this._canHurt(gp)) break; // 冲刺中穿过子弹
                    gp.takeDamage(b.damage);
                    gp.hurtCooldown = 0.6 + (gp.hurtCooldownBonus || 0);
                    this.spawnHitParticles(gp.x + gp.size / 2, gp.y + gp.size / 2, '#ff9800', 8);
                    this.enemyBullets.splice(i, 1);
                    break;
                }
            }
            // 死亡后复活
            if (gp.currentHealth <= 0) {
                if (gp.extraLives > 0) {
                    gp.extraLives--;
                    gp.currentHealth = gp.maxHealth;
                    gp.hurtCooldown = 1.5;
                    gp.x = this.width / 2; gp.y = this.height / 2;
                } else {
                    gp.currentHealth = 0;
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
                    this._runAsPlayer(a.player, a.fn);
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
                    // 玩家死亡检查
                    if (this.player.currentHealth <= 0) {
                        this.life--;
                        if (this.life > 0) {
                            this.player.x = this.width / 2;
                            this.player.y = this.height / 2;
                            this.player.currentHealth = this.player.maxHealth;
                            this.player.hurtCooldown = 1.5;
                        }
                    }
                }

                // 投射物 vs 魔王(单独处理,因为 boss 不在 enemies 数组里)
                for (let i = this.projectiles.length - 1; i >= 0; i--) {
                    const proj = this.projectiles[i];
                    if (proj.isPiercing && !proj.pierceRemaining) continue; // PiercingArrow 自处理
                    if (this.checkCollision(proj, this.boss)) {
                        if (proj.hitEnemies && proj.hitEnemies.has(this.boss)) continue;
                        const dmg = proj.damage != null ? proj.damage : 15;
                        this.boss.takeDamage(dmg);
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
            // 按距离加权:远了爱冲撞,贴脸爱震地;不连续用同一招
            const w = { charge: dist > 200 ? 3 : 1, ring: 2, slam: dist < 180 ? 3 : 0.5 };
            if (b.lastAtk) w[b.lastAtk] = 0;
            let r = Math.random() * (w.charge + w.ring + w.slam);
            const atk = (r -= w.charge) < 0 ? 'charge' : (r -= w.ring) < 0 ? 'ring' : 'slam';
            b.atk = b.lastAtk = atk;
            b.atkPhase = 0;
            b.atkDur = b.atkTimer = { charge: 0.8, ring: 0.65, slam: 0.95 }[atk] * speedUp;
            b.atkAngle = atk === 'ring' ? Math.random() * Math.PI * 2 : Math.atan2(tcy - bcy, tcx - bcx);
            return;
        }

        b.atkTimer -= DT;
        // 冲撞前摇的前 60% 持续跟踪目标,之后锁定方向留出闪避窗口
        if (b.atk === 'charge' && b.atkPhase === 0 && b.atkTimer > b.atkDur * 0.4) {
            b.atkAngle = Math.atan2(tcy - bcy, tcx - bcx);
        }
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
            b.atkDur = b.atkTimer = { charge: BlockBoss.CHARGE_TIME, ring: 0.4, slam: 0.35 }[b.atk];
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
        if (p === this.player && p.currentHealth <= 0) {
            this.life--;
            if (this.life > 0) {
                p.x = this.width / 2;
                p.y = this.height / 2;
                p.currentHealth = p.maxHealth;
                p.hurtCooldown = 1.5;
            }
        }
        return true;
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
        this.bossState = 'active';
        this.bossActiveTimer = 0;
        this.bossDamageDealt = 0;
        this.screenShake = 0.6;
        // 出场闪白 / 大震动
        this.effects.push({ type: 'shockwave', x: this.boss.x + 40, y: this.boss.y + 40, radius: 5, maxRadius: 200, color: '#ff1744', ttl: 0.8, maxTtl: 0.8 });
        this.spawnParticles(this.boss.x + 40, this.boss.y + 40, '#ff1744', 30, 2, 6, 3, 6, 0.03);
        this._showFloatingText('方块大魔王!', this.width / 2, this.height * 0.4, '#ff1744');
    }

    _repelBoss() {
        if (!this.boss) return;
        // 奖励
        this.life = Math.min(this.life + 1, this.maxLife);
        this.player.addPotentialPoints(1);
        this.score += 100 * (this.scoreMult || 1);
        // 击退动画
        this.boss.triggerRetreat(this.player.x, this.player.y);
        this.bossState = 'retreating';
        // 视效:闪白 + 大粒子爆发
        this.effects.push({ type: 'shockwave', x: this.boss.x + 40, y: this.boss.y + 40, radius: 10, maxRadius: 250, color: '#ffffff', ttl: 0.7, maxTtl: 0.7 });
        this.spawnParticles(this.boss.x + 40, this.boss.y + 40, '#ffeb3b', 40, 2, 7, 3, 6, 0.03);
        this.spawnParticles(this.boss.x + 40, this.boss.y + 40, '#ffffff', 20, 3, 8, 2, 5, 0.04);
        this._showFloatingText('击退魔王!  +1 命  +1 潜能  +100 分', this.width / 2, this.height * 0.4, '#ffeb3b');
        this.screenShake = 0.5;
        // 立即弹天赋菜单(奖励的潜能点)
        this.showPotentialMenu();
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
            if (e.currentHealth <= 0) {
                this.spawnHitParticles(e.x + e.size / 2, e.y + e.size / 2, e.color, 10);
                this._onEnemyKilled(e);
                this.enemies.splice(i, 1);
            }
        }
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
            o.takeDamage(dmg);
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
        for (let i = this.items.length - 1; i >= 0; i--) {
            this.items[i].update();
            if (this.items[i].duration <= 0) {
                this.items.splice(i, 1);
            }
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
                if (this.player.dashTimer > 0) { this._canHurt(this.player); continue; }
                // 受击无敌帧：冷却期内不再结算玩家受伤，避免重叠时血量瞬间被掏空
                if (this.player.hurtCooldown <= 0) {
                    this.player.takeDamage(this.enemies[i].contactDamage());
                    this.player.hurtCooldown = 0.6 + (this.player.hurtCooldownBonus || 0);
                    this.player.gainRage(15 + (this.player.rageOnHurtBonus || 0));
                    this.spawnHitParticles(this.player.x + this.player.size / 2, this.player.y + this.player.size / 2, '#ff4444', 8);
                    this._knockbackFrom(this.enemies[i], this.player.x + this.player.size / 2, this.player.y + this.player.size / 2, 5);
                }
                this.enemies[i].takeDamage(this.player.attack);
                
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
                
                // 检查玩家是否死亡
                if (this.player.currentHealth <= 0) {
                    this.life--;
                    if (this.life > 0) {
                        // 重置玩家位置和状态，复活后给一小段无敌避免连死
                        this.player.x = this.width / 2;
                        this.player.y = this.height / 2;
                        this.player.currentHealth = this.player.maxHealth;
                        this.player.hurtCooldown = 1.5;
                    }
                }
                
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
                    if (this.player.currentHealth <= 0) {
                        this.life--;
                        if (this.life > 0) {
                            this.player.x = this.width / 2;
                            this.player.y = this.height / 2;
                            this.player.currentHealth = this.player.maxHealth;
                            this.player.hurtCooldown = 1.5;
                        }
                    }
                }
                this.enemyBullets.splice(i, 1);
            }
        }

        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const proj = this.projectiles[i];
            // PiercingArrow 走自己的碰撞逻辑
            if (proj.isPiercing && !proj.pierceRemaining) continue;
            let hit = false;
            for (let j = this.enemies.length - 1; j >= 0; j--) {
                if (this.checkCollision(proj, this.enemies[j])) {
                    // 有限穿透:已命中过的同一敌人跳过
                    if (proj.hitEnemies && proj.hitEnemies.has(this.enemies[j])) continue;
                    const dmg = proj.damage != null ? proj.damage : 15;
                    this.enemies[j].takeDamage(dmg);
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
        }
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
        if (this.enemies.length >= maxEnemiesFor(this.difficulty)) return;
        // 刷怪概率随难度上升但封顶,避免后期数量碾压
        const spawnChance = Math.min(0.045, 0.018 + 0.008 * (this.difficulty - 1));
        if (Math.random() < spawnChance) {
            // 加权随机;冲锋者 30 秒、自爆者 50 秒后才加入,开局保持简单
            const pool = [['chaser', 44], ['patroller', 24], ['gunner', 15], ['giant', 5]];
            if (this.gameTime >= 30) pool.push(['dasher', 8]);
            if (this.gameTime >= 50) pool.push(['bomber', 8]);
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
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.08;
            p.vx *= 0.96;
            p.life -= p.decay;
            if (p.life <= 0) this.particles.splice(i, 1);
        }
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
        pool.sort((a, b) => {
            const dxa = a.x - px, dya = a.y - py;
            const dxb = b.x - px, dyb = b.y - py;
            return (dxa * dxa + dya * dya) - (dxb * dxb + dyb * dyb);
        });
        return pool.slice(0, count);
    }

    _findClosestTarget() {
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

    _dealDamage(target, dmg) {
        target.takeDamage(dmg);
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

    castSkillQ() {
        if (!this.player.class) return;
        const skill = this.player.skillQ;
        if (skill.cooldown > 0) return;
        const cls = this.player.class;
        if (cls === 'warrior') this._warriorQ(skill);
        else if (cls === 'mage') this._mageQ(skill);
        else if (cls === 'assassin') this._assassinQ(skill);
        else if (cls === 'archer') this._archerQ(skill);
        else if (cls === 'paladin') this._paladinQ(skill);
    }

    castSkillE() {
        if (!this.player.class) return;
        const skill = this.player.skillE;
        if (skill.cooldown > 0) return;
        const cls = this.player.class;
        if (cls === 'warrior') this._warriorE(skill);
        else if (cls === 'mage') this._mageE(skill);
        else if (cls === 'assassin') this._assassinE(skill);
        else if (cls === 'archer') this._archerE(skill);
        else if (cls === 'paladin') this._paladinE(skill);
    }

    _warriorQ(skill) {
        if (this.player.rage < 30) return;
        this.player.rage -= 30;
        const dmg = this._computeAttackDamage(this.player.attack) * 1.5 * this._getSkillMultiplier(skill.level) * (this.player.warriorSkillDmgMult || 1);
        const range = skill.level >= 3 ? 150 : 120;
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

    _warriorE(skill) {
        if (this.player.rage < 50) return;
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
            target.x -= nx * 150;
            target.y -= ny * 150;
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
        this._mageRepulseEffect(skill);
        // 奥术连击:0.4s 后再次无消耗触发一次
        if (this.player.mageMulticast) {
            this.pendingActions.push({ delay: 0.4, fn: () => this._mageRepulseEffect(skill) });
        }
        skill.cooldown = skill.maxCooldown;
    }

    _mageRepulseEffect(skill) {
        const pcx = this.player.x + this.player.size / 2;
        const pcy = this.player.y + this.player.size / 2;
        const range      = skill.level >= 3 ? 210 : 160;
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
            this.player.x = target.x - nx * (target.size + this.player.size * 0.5);
            this.player.y = target.y - ny * (target.size + this.player.size * 0.5);
        }
        const chargeMult = this._consumeAssassinCharge();
        const dmg = this._computeAttackDamage(this.player.attack) * 2.5 * this._getSkillMultiplier(skill.level) * (this.player.assassinSkillDmgMult || 1) * chargeMult;
        this._dealDamage(target, dmg);
        const newPcx = this.player.x + this.player.size / 2;
        const newPcy = this.player.y + this.player.size / 2;
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
        if (targets.length > 0) {
            const t = targets[0];
            angle = Math.atan2(t.y + t.size / 2 - pcy, t.x + t.size / 2 - pcx);
        }
        const speed = 12;
        const lastArrowMult = isLastArrow ? 2 : 1;
        const dmg = this._computeAttackDamage(this.player.attack) * 1.8 * this._getSkillMultiplier(skill.level) * (this.player.archerSkillDmgMult || 1) * lastArrowMult;
        const arrow = new PiercingArrow(pcx - 4, pcy - 4, Math.cos(angle) * speed, Math.sin(angle) * speed, dmg, this);
        arrow.owner = this.player;
        this.projectiles.push(arrow);
        const arrowColor = isLastArrow ? '#ffeb3b' : '#aaff44';
        this.effects.push({ type: 'arrow', x: pcx, y: pcy, angle, length: isLastArrow ? 42 : 30, color: arrowColor, ttl: 0.3, maxTtl: 0.3 });
        this.spawnParticles(pcx, pcy, isLastArrow ? '#fff176' : '#ccff88', isLastArrow ? 16 : 8, 2, 5, 2, 4, 0.05);
        if (isLastArrow) this._showFloatingText('最后一发!', pcx, pcy - 30, '#ffeb3b');
        skill.cooldown = skill.maxCooldown;
    }

    _archerE(skill) {
        if (!this._consumeArrows(3)) return;
        const pcx = this.player.x + this.player.size / 2;
        const pcy = this.player.y + this.player.size / 2;
        const count = skill.level >= 3 ? 14 : 10;
        const dmg = this._computeAttackDamage(this.player.attack) * 0.8 * this._getSkillMultiplier(skill.level) * (this.player.archerSkillDmgMult || 1);
        for (let i = 0; i < count; i++) {
            this.pendingActions.push({
                delay: i * 0.1,
                fn: () => {
                    const tx = pcx + (Math.random() - 0.5) * 200;
                    const ty = pcy + (Math.random() - 0.5) * 200;
                    this.effects.push({ type: 'arrow', x: tx, y: ty - 120, angle: Math.PI / 2, length: 24, color: '#aaff44', ttl: 0.25, maxTtl: 0.25 });
                    this.pendingActions.push({
                        delay: 0.2,
                        fn: () => {
                            this.spawnHitParticles(tx, ty, '#aaff44', 6);
                            this.effects.push({ type: 'shockwave', x: tx, y: ty, radius: 5, maxRadius: 30, color: '#aaff44', ttl: 0.2, maxTtl: 0.2 });
                            for (let j = this.enemies.length - 1; j >= 0; j--) {
                                const e = this.enemies[j];
                                const dx = e.x + e.size / 2 - tx;
                                const dy = e.y + e.size / 2 - ty;
                                if (Math.sqrt(dx * dx + dy * dy) <= 25) this._dealDamage(e, dmg);
                            }
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
        this._dealDamage(target, dmg);
        target.stunTimer = 1.5;
        const tcx = target.x + target.size / 2;
        const tcy = target.y + target.size / 2;
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
        this.effects.push({ type: 'holyAura', x: pcx, y: pcy, radius: 80, color: '#ffd700', ttl: 0.6, maxTtl: 0.6, pulse: 5 });
        this.spawnBurstRing(pcx, pcy, 80, '#ffd700', skill.level >= 3 ? 24 : 16);
        skill.cooldown = skill.maxCooldown;
    }
    
    shoot() {
        const cls = this.player.class;
        // 圣骑士:不再具备自动远程攻击
        if (cls === 'paladin') return;
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

        const fanCount = cls === 'archer' ? (this.player.archerMultiShot || 1) : 1;
        const pierce = cls === 'archer' ? (this.player.archerPiercing || 0) : 0;
        // 扇形角度散布
        const spread = fanCount > 1 ? (15 * Math.PI / 180) : 0; // ±15°
        const baseAngle = Math.atan2(dy, dx);
        for (let i = 0; i < fanCount; i++) {
            // 等分散布
            const offset = fanCount === 1 ? 0 : (-spread + (2 * spread) * (i / (fanCount - 1)));
            const ang = baseAngle + offset;
            const vx = Math.cos(ang) * speed;
            const vy = Math.sin(ang) * speed;
            const proj = new Projectile(cx - 5, cy - 5, vx, vy, dmg + mageBonusDmg);
            proj.owner = this.player;
            proj.bonusMagicDmg = mageBonusDmg;
            if (pierce > 0) {
                proj.isPiercing = true;
                proj.pierceRemaining = pierce;
                proj.hitEnemies = new Set();
            }
            this.projectiles.push(proj);
        }
    }

    _warriorMeleeAttack() {
        const pcx = this.player.x + this.player.size / 2;
        const pcy = this.player.y + this.player.size / 2;
        const range = 80;
        const baseDmg = this._computeAttackDamage(this.player.attack) * (this.player.autoAttackDmgMult || 1);
        let hit = false;
        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const e = this.enemies[i];
            const ex = e.x + e.size / 2;
            const ey = e.y + e.size / 2;
            const dx = ex - pcx, dy = ey - pcy;
            if (Math.sqrt(dx * dx + dy * dy) <= range) {
                this._dealDamage(e, baseDmg);
                hit = true;
            }
        }
        // 范围内的魔王也吃伤
        if (this.boss && this.bossState === 'active') {
            const bcx = this.boss.x + this.boss.size / 2;
            const bcy = this.boss.y + this.boss.size / 2;
            const dx = bcx - pcx, dy = bcy - pcy;
            if (Math.sqrt(dx * dx + dy * dy) <= range + this.boss.size / 2) {
                this.boss.takeDamage(baseDmg);
                this.bossDamageDealt += baseDmg;
                this.spawnHitParticles(bcx, bcy, '#ff1744', 6);
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
        // 被击杀的自爆者殉爆(稍等一帧,避免在调用方遍历 enemies 时改动数组)
        if (e && e.type === 'bomber' && !e.exploded) {
            e.exploded = true;
            this.pendingActions.push({ delay: 0.05, fn: () => this._bomberExplode(e, false) });
        }
        Sound.play('kill');
        // 击杀计数随玩家快照下发,本机据此触发击杀顿帧/震动(guest 也能拿到自己的击杀反馈)
        this.player.killCount = (this.player.killCount || 0) + 1;
        this.score += 10 * (this.scoreMult || 1);
        this.exp += 5;
        if (this.player.lifeStealPerKill) {
            this.player.heal(this.player.lifeStealPerKill);
        }
        this.player.gainRage(20);
        this.checkLevelUp();
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
            
            // 检查是否达到等级3且未选择职业
            if (this.level === 3 && !this.player.class) {
                // 显示职业选择界面
                this.showClassSelection();
            } else {
                // 显示潜能点分配界面
                this.showPotentialMenu();
            }
        }
    }
    
    showClassSelection() {
        this.isPaused = true;
        this.showingClassSelection = true;
    }
    
    renderClassSelection() {
        if (!this.showingClassSelection) return;
        this.buttons = [];
        const ctx = this.ctx;
        const W = this.width, H = this.height;
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
        ctx.font = `${Math.min(11, W * 0.025)}px Arial`;
        ctx.fillText('点击卡片选择  ·  每个职业玩法截然不同', W / 2, H * 0.03 + titleFS + 4);
        ctx.restore();

        // 职业数据
        const classDefs = [
            {
                choice: 1, name: '战士', icon: '⚔', color: '#ff6b3a',
                tag: '近战  高攻  怒气',
                tagColor: '#ff8a65',
                flavor: '攻高防低，怒气越满伤害越高',
                stats: ['攻击 +10  防御 -5  生命 +20', '近战范围自动攻击'],
                q: { name: '旋风斩', cd: '3s', desc: '消耗30怒气，范围斩击周围敌人' },
                e: { name: '盾击',   cd: '5s', desc: '消耗50怒气，击飞并重创单体目标' }
            },
            {
                choice: 2, name: '法师', icon: '✦', color: '#4ecdc4',
                tag: '远程  法力  爆发',
                tagColor: '#80deea',
                flavor: '法力不足时可消耗生命释放技能',
                stats: ['法力 +10  回复 +2/s', '远程自动攻击，Q开关附魔'],
                q: { name: '魔力涌注', cd: '切换', desc: '开启后每发普攻附加法术伤害，消耗法力' },
                e: { name: '斥力波',   cd: '8s',  desc: '消耗3法力，将周围敌人向四周强力推开并造成伤害' }
            },
            {
                choice: 3, name: '刺客', icon: '☄', color: '#aa66ff',
                tag: '移速  蓄力  爆发',
                tagColor: '#ce93d8',
                flavor: '移动积累蓄力，蓄力越高技能伤害越强',
                stats: ['移动速度 +1.5', '远程自动攻击'],
                q: { name: '闪现斩', cd: '4s', desc: '瞬移至目标身旁并造成高额伤害' },
                e: { name: '连刺',   cd: '6s', desc: '连续攻击3个最近敌人，依次结算' }
            },
            {
                choice: 4, name: '弓手', icon: '◎', color: '#aaff44',
                tag: '远程  高投射  箭矢',
                tagColor: '#c6ef6b',
                flavor: '投射物伤害高，防御低，箭矢用尽需装填',
                stats: ['攻击 +8  防御 -5', '普攻伤害×1.3，多天赋支持多重射击'],
                q: { name: '穿透箭', cd: '3s', desc: '消耗1箭，发射穿透敌阵的强力箭矢' },
                e: { name: '箭雨',   cd: '8s', desc: '消耗3箭，在大范围内降下密集箭雨' }
            },
            {
                choice: 5, name: '圣骑士', icon: '✟', color: '#ffd700',
                tag: '高防  护盾  信念',
                tagColor: '#ffe082',
                flavor: '攻击偏低，防御极高，拥有持续生成的护盾',
                stats: ['防御 +10  攻击 -5  生命 +30', '护盾持续再生，无远程普攻'],
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
            cardH = Math.min(155, (H * 0.84 - gapY * (rows + 1)) / rows);
            startX = gapX;
            startY = H * 0.12;
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

        const nameFS   = Math.min(15, cardW * 0.13);
        const tagFS    = Math.min(10, cardW * 0.085);
        const statFS   = Math.min(10, cardW * 0.083);
        const skillFS  = Math.min(10, cardW * 0.085);
        const descFS   = Math.min(9,  cardW * 0.075);
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
            this._wrapTextCenter(ctx, cls.flavor, bx + cardW / 2, oy, cardW - 10, statFS + 2);
            oy += (statFS + 2) * Math.ceil(ctx.measureText(cls.flavor).width / (cardW - 10)) + 3;

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
        const nameByChoice = { 1: 'warrior', 2: 'mage', 3: 'assassin', 4: 'archer', 5: 'paladin' };
        const name = nameByChoice[choice];
        if (!name) return;
        const cd = CLASS_BASE_CD[name];
        this.player.class = name;
        this.player.skillQ = { cooldown: 0, maxCooldown: cd.q, level: 1 };
        this.player.skillE = { cooldown: 0, maxCooldown: cd.e, level: 1 };

        // 应用职业基础属性偏移
        const adj = CLASS_BASE_ADJUST[name] || {};
        if (adj.attack)    this.player.attack += adj.attack;
        if (adj.defense)   this.player.defense = Math.max(0, this.player.defense + adj.defense);
        if (adj.maxHealth) { this.player.maxHealth += adj.maxHealth; this.player.currentHealth = this.player.maxHealth; }
        if (adj.speed)     this.player.speed += adj.speed;
        if (adj.manaRegen) this.player.manaRegen += adj.manaRegen;
        if (adj.maxMana)   { this.player.maxMana += adj.maxMana; this.player.mana = this.player.maxMana; }
        if (adj.autoAttackDmgMult) this.player.autoAttackDmgMult = (this.player.autoAttackDmgMult || 1) * adj.autoAttackDmgMult;

        this.showingClassSelection = false;
        // Guest 模式：把职业选择发给 host
        if (this.mpMode === 'guest' && this.mpWs && this.mpWs.readyState === WebSocket.OPEN) {
            this.mpWs.send(JSON.stringify({ type: 'classChoose', choice: name }));
        }
        if (this.player.potentialPoints > 0) {
            this.showPotentialMenu();
        } else {
            this.isPaused = false;
        }
        this.updateUI();
    }
    
    showPotentialMenu() {
        if (this.player.potentialPoints > 0) {
            this.isPaused = true;
            this.showingPotentialMenu = true;
            this.currentTalentChoices = this._rollTalentChoices(3);
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

    handlePotentialChoice(choice) {
        // choice: 0 = 跳过, 1/2/3 = 天赋卡索引(1-based)
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
    
    renderPotentialMenu() {
        if (!this.showingPotentialMenu) return;
        this.buttons = [];
        const ctx = this.ctx;

        // 背景遮罩
        const bgGrad = ctx.createRadialGradient(this.width / 2, this.height / 2, 0, this.width / 2, this.height / 2, this.width * 0.7);
        bgGrad.addColorStop(0, 'rgba(10, 15, 35, 0.93)');
        bgGrad.addColorStop(1, 'rgba(0, 0, 0, 0.96)');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, this.width, this.height);

        // 自适应字号
        const titleFontSize = Math.min(28, this.width * 0.06);
        const subFontSize = Math.min(14, this.width * 0.032);
        const cardNameSize = Math.min(16, this.width * 0.038);
        const cardDescSize = Math.min(11, this.width * 0.026);
        const cardIconSize = Math.min(36, this.width * 0.085);

        // 标题
        ctx.save();
        ctx.shadowBlur = 18;
        ctx.shadowColor = '#00c8ff';
        ctx.fillStyle = '#00e5ff';
        ctx.font = `bold ${titleFontSize}px Arial`;
        ctx.textAlign = 'center';
        ctx.fillText('选择天赋', this.width / 2, this.height * 0.09);
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#ffcc00';
        ctx.font = `${subFontSize}px Arial`;
        ctx.fillText(`剩余潜能点: ${this.player.potentialPoints}`, this.width / 2, this.height * 0.14);
        ctx.restore();

        // 卡牌布局:横屏三列横排;竖屏(宽<高)三行竖排
        const portrait = this.width < this.height;
        const choices = this.currentTalentChoices;
        const n = choices.length;

        let cardW, cardH, startX, startY, stepX, stepY;
        if (portrait || this.width < 480) {
            cardW = Math.min(280, this.width * 0.75);
            cardH = Math.min(110, this.height * 0.14);
            startX = (this.width - cardW) / 2;
            startY = this.height * 0.20;
            stepX = 0;
            stepY = cardH + Math.max(8, this.height * 0.015);
        } else {
            const spacing = Math.min(16, this.width * 0.025);
            cardW = Math.min(180, (this.width - spacing * (n + 1)) / Math.max(n, 1));
            cardH = Math.min(220, this.height * 0.42);
            const totalW = cardW * n + spacing * (n - 1);
            startX = (this.width - totalW) / 2;
            startY = this.height * 0.22;
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

            if (portrait || this.width < 480) {
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
        const skipW = Math.min(140, this.width * 0.35);
        const skipH = Math.max(36, Math.min(44, this.height * 0.075));
        const skipX = (this.width - skipW) / 2;
        let skipY;
        if (portrait || this.width < 480) {
            skipY = startY + stepY * n + Math.max(8, this.height * 0.015);
            skipY = Math.min(skipY, this.height - skipH - 12);
        } else {
            skipY = startY + cardH + Math.max(16, this.height * 0.04);
        }
        this.drawButton(skipX, skipY, skipW, skipH, '#78909c', '跳过', 0);

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
            ctx.fillText(`已获得: ${summary}`, this.width / 2, this.height - 6);
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

    // 结算弹窗 + 最高纪录(分数与生存时间分别记录,存 localStorage)
    _showGameOver(time, score) {
        Sound.play('gameOver');
        const best = Store.get('blockrun.best', { score: 0, time: 0 });
        const newScore = score > best.score;
        const newTime = time > best.time;
        if (newScore || newTime) {
            Store.set('blockrun.best', { score: Math.max(score, best.score), time: Math.max(time, best.time) });
        }
        document.getElementById('finalTime').textContent = time;
        document.getElementById('finalScore').textContent = score;
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
        const bg = SpriteCache.get('bg|gradient', W, H, 0, g => {
            const grad = g.createLinearGradient(0, 0, 0, H);
            grad.addColorStop(0, '#07101a');
            grad.addColorStop(1, '#050c12');
            g.fillStyle = grad;
            g.fillRect(0, 0, W, H);
        });
        // 网格按不透明绘制,渲染时用 globalAlpha 做呼吸效果
        const grid = SpriteCache.get('bg|grid', W, H, 0, g => {
            const gridSize = 60;
            g.strokeStyle = 'rgb(0, 200, 255)';
            g.lineWidth = 0.5;
            g.beginPath();
            for (let x = 0; x < W; x += gridSize) { g.moveTo(x, 0); g.lineTo(x, H); }
            for (let y = 0; y < H; y += gridSize) { g.moveTo(0, y); g.lineTo(W, y); }
            g.stroke();
        });
        this._bgLayers = { bg, grid };
    }

    renderBackground() {
        const ctx = this.ctx;
        if (!this._bgLayers) this._buildBgLayers();
        const { bg, grid } = this._bgLayers;
        // 背景层同样按设备像素 1:1 绘制(缩放比例非整数时插值缩放整屏图很慢)
        const m = ctx.getTransform();
        const snap = { a: m.a, e: m.e, f: m.f };
        SpriteCache.drawPx(ctx, bg, 0, 0, snap);

        const t = this.bgTime;
        ctx.save();
        ctx.fillStyle = '#c8e8ff';
        for (const s of this.stars) {
            const twinkle = s.alpha + Math.sin(t * s.twinkleSpeed * 60 + s.twinkleOffset) * 0.25;
            ctx.globalAlpha = Math.max(0.05, Math.min(1, twinkle));
            ctx.beginPath();
            ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 0.06 + Math.sin(t * 0.5) * 0.02;
        SpriteCache.drawPx(ctx, grid, 0, 0, snap);
        ctx.restore();
    }

    renderParticles() {
        // 去 shadowBlur:粒子数量大时 shadow 是主要瓶颈,关闭后大幅提速
        const ctx = this.ctx;
        ctx.save();
        ctx.shadowBlur = 0;
        for (const p of this.particles) {
            ctx.globalAlpha = p.life;
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
            ctx.fill();
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

        // 清空物理画布（含 letterbox 区域）
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
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

        this.player.render(this.ctx);

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

        for (let b of this.enemyBullets) {
            b.render(this.ctx);
        }

        this._renderEffects();

        this.renderParticles();

        ctx.restore(); // 结束震动变换

        // HUD 与菜单（在缩放坐标系内，无震动）
        this._renderHurtVignette();
        this._renderFreezeOverlay();
        this.skillButtons = [];
        this._renderSkillHUD();
        this._renderDashButton();
        this._renderBossHUD();
        this._renderStatsHUD();
        this._renderMuteButton();
        this._renderAchToasts();

        if (this.showingClassSelection) {
            this.renderClassSelection();
        } else if (this.showingPotentialMenu) {
            this.renderPotentialMenu();
        }

        if (this.isPaused && !this.showingClassSelection && !this.showingPotentialMenu) {
            this._renderPauseOverlay();
        }

        ctx.restore(); // 结束缩放变换
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
        ctx.fillStyle = '#ffd54f';
        ctx.fillText(`★ ${this.score}`, x + 8, y + 44);
        ctx.textAlign = 'right';
        ctx.fillStyle = 'rgba(200,232,255,0.8)';
        ctx.fillText(`${mm}:${ss}`, x + w - 8, y + 44);
        ctx.restore();
    }

    _renderMuteButton() {
        const size = 30, x = this.width - size - 10, y = 10;
        this.muteButton = { x, y, w: size, h: size };
        const ctx = this.ctx;
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
            ctx.fillText(`方块大魔王${this.boss.enraged ? ' · 狂暴' : ''}  ${Math.ceil(this.boss.currentHealth)}/${Math.ceil(this.boss.maxHealth)}`, bx + barW / 2, by + barH / 2);

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
                ctx.font = 'bold 14px Arial';
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
            }

            ctx.restore();
        }
    }

    // 冲刺按钮:圆形,位于 E 技能槽正上方(未选职业时也显示);触屏点它冲刺,键盘为空格/Shift
    _renderDashButton() {
        if (!this.isRunning) return;
        const p = this.player;
        const ctx = this.ctx;
        const r = 24;
        const cx = this.width - 48, cy = this.height - 82 - 12 - r - 12;
        this.skillButtons.push({ x: cx - r - 4, y: cy - r - 4, w: r * 2 + 8, h: r * 2 + 8, skill: 'dash' });
        const ratio = p.dashMaxCooldown > 0 ? Math.max(0, Math.min(1, p.dashCooldown / p.dashMaxCooldown)) : 0;
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
        const baseX = this.width - (slotW * 2 + margin * 3);
        const baseY = this.height - slotH - margin * 2 - 16;

        // 技能命中区每帧由 render 清空后重新登记
        this.skillButtons.push(
            { x: baseX,              y: baseY, w: slotW, h: slotH, skill: 'Q' },
            { x: baseX + slotW + margin, y: baseY, w: slotW, h: slotH, skill: 'E' }
        );

        const qNames = { warrior: '旋', mage: '弹', assassin: '闪', archer: '穿', paladin: '圣' };
        const eNames = { warrior: '盾', mage: '斥', assassin: '刺', archer: '雨', paladin: '环' };
        const qColors = { warrior: '#ff6030', mage: '#4ecdc4', assassin: '#aa66ff', archer: '#aaff44', paladin: '#ffd700' };
        const eColors = { warrior: '#4488ff', mage: '#88eeff', assassin: '#ffffff', archer: '#88ff44', paladin: '#fff8dc' };

        const slots = [
            { skill: this.player.skillQ, label: 'Q', icon: qNames[cls] || 'Q', color: qColors[cls] || '#fff', x: baseX },
            { skill: this.player.skillE, label: 'E', icon: eNames[cls] || 'E', color: eColors[cls] || '#fff', x: baseX + slotW + margin }
        ];

        for (const s of slots) {
            const cdRatio = s.skill.maxCooldown > 0 ? Math.max(0, s.skill.cooldown / s.skill.maxCooldown) : 0;
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
            ctx.font = `${Math.max(9, Math.min(11, this.width * 0.022))}px Arial`;
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
        for (let i = 0; i < max; i++) {
            const slotY = y + h - gap - (i + 1) * slotH - i * gap;
            const filled = i < cur;
            // 正在装填的"下一格"显示填充进度(对应箭袋中第 cur 槽,从 0 开始)
            const isReloadingSlot = reloading && i === cur;

            if (filled) {
                ctx.fillStyle = '#aaff44';
                ctx.shadowBlur = 6;
                ctx.shadowColor = '#aaff44';
                roundRect(ctx, x + 2, slotY, w - 4, slotH, 2);
                ctx.fill();
                ctx.shadowBlur = 0;
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
        this.faceX = 1;                // 最近一次移动方向(冲刺方向)
        this.faceY = 0;
        this._dashGhosts = [];         // 冲刺残影(纯视觉,render 时记录)

        // 天赋(按玩家存储;联机时每个 guest 各有一份)
        this.acquiredTalents = [];      // [{ id, count }]
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
        this.dashCooldown = this.dashMaxCooldown;
        this.dashDodged = false;
        this._dashHits = null;
        return true;
    }

    _move(keys, width, height) {
        // 键盘控制
        if (keys['ArrowUp'] || keys['w']) {
            this.y = Math.max(0, this.y - this.speed);
            // 重置目标位置，优先键盘控制
            this.moving = false;
            this.targetX = null;
            this.targetY = null;
        }
        if (keys['ArrowDown'] || keys['s']) {
            this.y = Math.min(height - this.size, this.y + this.speed);
            this.moving = false;
            this.targetX = null;
            this.targetY = null;
        }
        if (keys['ArrowLeft'] || keys['a']) {
            this.x = Math.max(0, this.x - this.speed);
            this.moving = false;
            this.targetX = null;
            this.targetY = null;
        }
        if (keys['ArrowRight'] || keys['d']) {
            this.x = Math.min(width - this.size, this.x + this.speed);
            this.moving = false;
            this.targetX = null;
            this.targetY = null;
        }
        
        // 点击移动
        if (this.moving && this.targetX !== null && this.targetY !== null) {
            const dx = this.targetX - (this.x + this.size / 2);
            const dy = this.targetY - (this.y + this.size / 2);
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance > 5) { // 到达目标附近时停止
                const moveX = (dx / distance) * this.speed;
                const moveY = (dy / distance) * this.speed;
                
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
        const flatReduction = this.flatDamageReduction || 0;
        let actualDamage = Math.max(1, damage - this.defense - flatReduction);
        // 圣骑士护盾优先全额抵挡(不再因 Math.max(1) 强制漏 1 点)
        if (this.shield > 0) {
            const absorbed = Math.min(this.shield, actualDamage);
            this.shield -= absorbed;
            actualDamage -= absorbed;
        }
        if (actualDamage > 0) {
            this.currentHealth = Math.max(0, this.currentHealth - actualDamage);
        }
        return actualDamage;
    }

    heal(amount) {
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
    static INTROS = {
        dasher: { text: '新敌人「冲」:蓄力后直线冲刺,看准路线侧身躲开', color: '#ffe57f' },
        bomber: { text: '新敌人「爆」:贴身会自爆,先打爆它还能炸伤周围敌人', color: '#ff80ab' }
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

        // 受击反馈:hitFlash>0 时白闪;降为负值时作为再次闪白的间隔(持续伤害时呈闪烁而非常亮)
        this.hitFlash = -1;
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
        if (this.stunTimer > 0) {
            this.stunTimer -= DT;
            // 冲锋者蓄力/冲刺中被控 = 打断;自爆者引信只是暂停
            if (this.type === 'dasher' && (this.state === 1 || this.state === 2)) {
                this.state = 0;
                this.dashCD = 1;
            }
            return;
        }
        switch (this.type) {
            case 'chaser':
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
        }
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
        this.currentHealth = Math.max(0, this.currentHealth - actualDamage);
        this.flash();
        return actualDamage;
    }

    // 白闪;_mpHit 让 host 在下一个快照里告诉 guest 也闪一下
    flash() {
        if (this.hitFlash <= -0.04) {
            this.hitFlash = 0.08;
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
        // 本体(渐变 + 光晕 + 描边 + 文字)按类型缓存,避免每帧 shadowBlur
        SpriteCache.drawPx(ctx, Enemy.bodySprite(this.type, this.size), this.x, this.y, snap);
        if (this.type === 'gunner') this._renderGunnerTop(ctx, snap);
        if (this.state === 1 && (this.type === 'bomber' || this.type === 'dasher')) this._renderChargePulse(ctx, snap);
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
        fill('#ff1744', e => e.type !== 'gunner' && (hp(e), true));
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
            const glowColors = { chaser: '#ff1744', patroller: '#2979ff', giant: '#d500f9', dasher: '#ffd600', bomber: '#ff4081' };
            const lightColors = { chaser: '#ff6b6b', patroller: '#64b5f6', giant: '#e040fb', dasher: '#fff59d', bomber: '#ff80ab' };
            const darkColors = { chaser: '#b71c1c', patroller: '#0d47a1', giant: '#6a0080', dasher: '#f57f17', bomber: '#880e4f' };
            const labels = { chaser: '追', patroller: '巡', giant: '巨', dasher: '冲', bomber: '爆' };
            const glow = glowColors[type] || '#ff1744';
            const r = type === 'giant' ? 10 : 6;

            g.shadowBlur = SpriteCache.blur(type === 'giant' ? 20 : 12);
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

            g.fillStyle = 'rgba(255,255,255,0.9)';
            g.font = `bold ${Math.floor(size * 0.38)}px Arial`;
            g.textAlign = 'center';
            g.textBaseline = 'middle';
            g.fillText(labels[type] || '?', size / 2, size / 2);
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
        const c = cfg[type] || cfg.potion;
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
        }
        this.spinPhase += 0.04;
        this.bobPhase += 0.08;
    }

    render(ctx) {
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
        this.atk = null;          // null | 'charge' 冲撞 | 'ring' 弹幕 | 'slam' 震地
        this.atkPhase = 0;
        this.atkTimer = 0;
        this.atkDur = 1;          // 当前阶段总时长,用于画预警进度
        this.atkAngle = 0;        // 冲撞方向 / 弹幕起始角
        this.atkCD = 2.5;         // 出场后先追一会儿再出招
        this.lastAtk = null;
        this.enraged = false;     // 狂暴:出招更快、移速更高、弹幕两波
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
        this.currentHealth = Math.max(0, this.currentHealth - damage);
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
BlockBoss.ATK_CODES = [null, 'charge', 'ring', 'slam'];

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
    }
    
    update() {
        this.trail.push({ x: this.x + this.size / 2, y: this.y + this.size / 2 });
        if (this.trail.length > 8) this.trail.shift();
        this.x += this.dx;
        this.y += this.dy;
    }
    
    render(ctx) {
        ctx.save();
        for (let i = 0; i < this.trail.length; i++) {
            const a = (i / this.trail.length) * 0.4;
            const r = (i / this.trail.length) * this.size * 0.5;
            ctx.globalAlpha = a;
            ctx.fillStyle = '#ffcc80';
            ctx.beginPath();
            ctx.arc(this.trail[i].x, this.trail[i].y, r, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 12;
        ctx.shadowColor = '#ff9800';
        ctx.fillStyle = '#ffe082';
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

        for (let j = this.game.enemies.length - 1; j >= 0; j--) {
            const e = this.game.enemies[j];
            if (this.hitEnemies.has(e)) continue;
            const ex = e.x + e.size / 2;
            const ey = e.y + e.size / 2;
            if (Math.abs(ax - ex) < (e.size / 2 + this.size / 2) && Math.abs(ay - ey) < (e.size / 2 + this.size / 2)) {
                this.hitEnemies.add(e);
                e.takeDamage(this.damage);
                this.game._knockbackDir(e, this.dx, this.dy, 4);
                this.game.spawnHitParticles(ex, ey, '#aaff44', 6);
                if (e.currentHealth <= 0) {
                    this.game.spawnHitParticles(ex, ey, e.color, 10);
                    this.game._runAsPlayer(this.owner, () => this.game._onEnemyKilled(e));
                    this.game.enemies.splice(j, 1);
                }
            }
        }
        // 命中魔王
        const boss = this.game.boss;
        if (boss && this.game.bossState === 'active' && !this.hitEnemies.has(boss)) {
            const bx = boss.x + boss.size / 2;
            const by = boss.y + boss.size / 2;
            if (Math.abs(ax - bx) < (boss.size / 2 + this.size / 2) && Math.abs(ay - by) < (boss.size / 2 + this.size / 2)) {
                this.hitEnemies.add(boss);
                boss.takeDamage(this.damage);
                this.game.bossDamageDealt += this.damage;
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
        if (this.trail.length > 8) this.trail.shift();
        this.x += this.vx;
        this.y += this.vy;
    }

    render(ctx) {
        const cx = this.x + this.size / 2;
        const cy = this.y + this.size / 2;
        ctx.save();
        // 弹道尾迹
        for (let i = 0; i < this.trail.length; i++) {
            const t = i / this.trail.length;
            ctx.globalAlpha = t * 0.45;
            ctx.fillStyle = '#ffcc80';
            ctx.beginPath();
            ctx.arc(this.trail[i].x, this.trail[i].y, this.size * 0.3 * t, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
        // 炮弹主体:椭圆形朝飞行方向
        ctx.shadowBlur = 12;
        ctx.shadowColor = '#ff6f00';
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(this.angle);
        const bGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, this.size * 0.6);
        bGrad.addColorStop(0, '#ffee58');
        bGrad.addColorStop(0.5, '#ff9800');
        bGrad.addColorStop(1, '#bf360c');
        ctx.fillStyle = bGrad;
        ctx.beginPath();
        ctx.ellipse(0, 0, this.size * 0.6, this.size * 0.38, 0, 0, Math.PI * 2);
        ctx.fill();
        // 高光
        ctx.fillStyle = 'rgba(255,255,200,0.5)';
        ctx.beginPath();
        ctx.ellipse(-this.size * 0.15, -this.size * 0.1, this.size * 0.22, this.size * 0.12, -0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        ctx.restore();
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
    document.getElementById('mpCreate').addEventListener('click', async () => {
        setStatus('连接服务器中...');
        try {
            await game.connectToServer(serverUrl);
            game.mpWs.send(JSON.stringify({ type: 'create' }));
        } catch (e) {
            setStatus('连接失败：' + e.message, true);
        }
    });

    // 加入房间
    document.getElementById('mpJoin').addEventListener('click', async () => {
        const code = (mpCodeInput.value || '').toUpperCase().trim();
        if (code.length !== 4) { setStatus('请输入4位房间码', true); return; }
        setStatus('连接服务器中...');
        try {
            await game.connectToServer(serverUrl);
            game.mpWs.send(JSON.stringify({ type: 'join', code }));
        } catch (e) {
            setStatus('连接失败：' + e.message, true);
        }
    });

    // 房主：开始游戏
    document.getElementById('mpStart').addEventListener('click', () => {
        if (game.mpWs && game.mpWs.readyState === WebSocket.OPEN) {
            game.mpWs.send(JSON.stringify({ type: 'start' }));
        }
    });

    // 单人游戏
    document.getElementById('mpSingle').addEventListener('click', () => {
        overlay.style.display = 'none';
        game.startGame();
    });

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
    const backBtn = document.getElementById('backToLobbyBtn');
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            game.restartGame();
            document.getElementById('gameOver').style.display = 'none';
            overlay.style.display = 'flex';
            mpLobby.style.display = 'none';
            if (game.mpWs) { game.mpWs.close(); game.mpWs = null; }
            game.mpMode = null;
        });
    }

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
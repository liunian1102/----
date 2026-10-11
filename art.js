// ══════════════════════════════════════════════════════════════════
//  角色立绘(纯外观):SVG 模板 → Image → 画进 SpriteCache
//  每张图的 viewBox 为 -25 -25 150 150:身体占 0~100 的方块(= 实体碰撞框),
//  四周 25 的留白放角、皇冠、引信、速度线等外伸部分。
//  图片异步解码,解码完成前(以及 node 测试环境)调用方回退到原来的矢量方块画法。
// ══════════════════════════════════════════════════════════════════

const Art = {
    enabled: typeof Image !== 'undefined' && typeof document !== 'undefined' && typeof encodeURIComponent === 'function',
    imgs: new Map(),
    MARGIN: 0.25, // 留白占身体边长的比例

    // 取已解码的图;第一次调用开始加载并返回 null(调用方本帧用旧画法)
    get(key, make) {
        if (!this.enabled) return null;
        let r = this.imgs.get(key);
        if (!r) {
            const img = new Image();
            r = { img, ready: false };
            this.imgs.set(key, r);
            img.onload = () => { r.ready = true; };
            img.onerror = () => { r.failed = true; };
            img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(make());
        }
        return r.ready ? r.img : null;
    },

    // 把立绘画进精灵:身体对齐 (0,0)-(size,size),glow 为外发光(CSS px,0 = 不发光)
    sprite(key, img, size, glow, glowColor) {
        const m = size * this.MARGIN;
        const pad = Math.ceil(m) + (glow ? SpriteCache.padFor(glow) : 2);
        return SpriteCache.get(`art|${key}|${size}`, size, size, pad, g => {
            if (glow) { g.shadowBlur = SpriteCache.blur(glow); g.shadowColor = glowColor; }
            g.drawImage(img, -m, -m, size + m * 2, size + m * 2);
        });
    },

    // 立绘的纯白剪影(受击白闪用,形状和立绘完全一致)
    silhouette(key, img, size) {
        const m = size * this.MARGIN;
        const pad = Math.ceil(m) + 2;
        return SpriteCache.get(`art|white|${key}|${size}`, size, size, pad, g => {
            g.drawImage(img, -m, -m, size + m * 2, size + m * 2);
            g.globalCompositeOperation = 'source-in';
            g.fillStyle = '#ffffff';
            g.fillRect(-pad, -pad, size + pad * 2, size + pad * 2);
        });
    },

    // 道具图标是否已就绪(未就绪时会开始加载)
    iconReady(key) {
        return typeof ArtSVG !== 'undefined' && !!ArtSVG.items[key] && !!this.get('item|' + key, ArtSVG.items[key]);
    },

    // 道具图标:按 size(逻辑像素)居中画在 (cx, cy);立绘未就绪返回 false,调用方画原来的 emoji
    icon(ctx, key, cx, cy, size) {
        if (!this.iconReady(key)) return false;
        const img = this.get('item|' + key, ArtSVG.items[key]);
        const spr = SpriteCache.get(`art|item|${key}|${size}`, size, size, 2, g => g.drawImage(img, 0, 0, size, size));
        SpriteCache.draw(ctx, spr, cx - size / 2, cy - size / 2, size, size);
        return true;
    },

    // #rrggbb 与白/黑混合,t ∈ [0,1]
    mix(hex, to, t) {
        const n = parseInt(hex.slice(1), 16);
        const a = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
        const b = to === 'white' ? 255 : 0;
        return '#' + a.map(v => Math.round(v + (b - v) * t).toString(16).padStart(2, '0')).join('');
    }
};

// ── SVG 模板 ──
const ArtSVG = (() => {
    const OUT = '#120d22'; // 统一的深色描边,贴纸感、在亮暗背景上都清楚

    const svg = (defs, body) =>
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-25 -25 150 150" width="300" height="300">` +
        `<defs>${defs}</defs>${body}</svg>`;

    // 身体渐变 + 顶部高光 + 底部暗面
    const bodyDefs = (c1, c2) =>
        `<linearGradient id="b" x1="0" y1="0" x2="0.85" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient>` +
        `<linearGradient id="sh" x1="0" y1="0" x2="0" y2="1"><stop offset="0.5" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.35"/></linearGradient>` +
        `<radialGradient id="gl" cx="0.28" cy="0.12" r="0.7"><stop offset="0" stop-color="#fff" stop-opacity="0.7"/><stop offset="0.55" stop-color="#fff" stop-opacity="0.12"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>` +
        `<filter id="blur3" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3"/></filter>`;

    // 方块身体:x,y,w,h 默认铺满 0~100
    const cube = (rx, x = 3, y = 3, w = 94, h = 94) =>
        `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="url(#b)"/>` +
        `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="url(#sh)"/>` +
        `<rect x="${x + 5}" y="${y + 4}" width="${w * 0.72}" height="${h * 0.42}" rx="${Math.max(4, rx - 6)}" fill="url(#gl)"/>` +
        `<rect x="${x + 5}" y="${y + 5}" width="${w - 10}" height="${h - 10}" rx="${Math.max(3, rx - 5)}" fill="none" stroke="#fff" stroke-opacity="0.22" stroke-width="2"/>` +
        `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="none" stroke="${OUT}" stroke-width="4.5"/>`;

    // 眼睛:眼白 + 瞳孔 + 高光
    const eye = (cx, cy, rx, ry, px = 0, py = 0, pupil = '#120d22', pr = 0.55) =>
        `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="#fff" stroke="${OUT}" stroke-width="3"/>` +
        `<ellipse cx="${cx + px}" cy="${cy + py}" rx="${rx * pr}" ry="${ry * (pr + 0.05)}" fill="${pupil}"/>` +
        `<circle cx="${cx + px - rx * 0.22}" cy="${cy + py - ry * 0.28}" r="${Math.max(1.6, rx * 0.2)}" fill="#fff"/>`;

    const line = (d, w = 4, c = OUT) => `<path d="${d}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
    // 伸出身体外的杆/茎/引信:深色描边 + 亮色内芯,深色背景上也看得见
    const stalk = (d, w, c) => line(d, w + 3.5) + line(d, w, c);
    const shape = (d, fill, w = 3) => `<path d="${d}" fill="${fill}" stroke="${OUT}" stroke-width="${w}" stroke-linejoin="round"/>`;

    // ── 敌人 ──
    const enemies = {
        // 追击者:红色小恶魔,一对小角、怒眉、尖牙
        chaser: () => svg(bodyDefs('#ff8a80', '#c62828'),
            shape('M20 16 L11 -12 L37 9 Z', '#7f0000') + shape('M80 16 L89 -12 L63 9 Z', '#7f0000') +
            cube(22) +
            eye(33, 48, 11, 12, 2, 2, '#2b0000') + eye(67, 48, 11, 12, -2, 2, '#2b0000') +
            line('M19 30 L44 39', 6.5) + line('M81 30 L56 39', 6.5) +
            shape('M28 67 Q50 86 72 67 Q50 75 28 67 Z', '#3a0505') +
            shape('M35 69 L39 76 L43 70 Z', '#fff', 1.8) + shape('M57 70 L61 76 L65 69 Z', '#fff', 1.8)),

        // 巡逻者:蓝色机器人,天线 + 一条发光护目镜
        patroller: () => svg(bodyDefs('#82b1ff', '#1546a0') +
            `<linearGradient id="vz" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#00b8d4"/><stop offset="0.5" stop-color="#e0ffff"/><stop offset="1" stop-color="#00b8d4"/></linearGradient>`,
            stalk('M50 6 L50 -10', 3.5, '#b0bec5') + `<circle cx="50" cy="-13" r="9" fill="#80d8ff" opacity="0.45" filter="url(#blur3)"/>` +
            `<circle cx="50" cy="-13" r="6" fill="#80d8ff" stroke="${OUT}" stroke-width="3"/>` +
            cube(20) +
            `<rect x="11" y="27" width="78" height="29" rx="14" fill="#0a1430" stroke="${OUT}" stroke-width="3.5"/>` +
            `<ellipse cx="50" cy="41.5" rx="28" ry="8" fill="#00e5ff" opacity="0.5" filter="url(#blur3)"/>` +
            `<rect x="20" y="37" width="60" height="9" rx="4.5" fill="url(#vz)"/>` +
            `<circle cx="58" cy="41.5" r="3.5" fill="#fff"/>` +
            line('M36 72 L64 72', 4) + line('M40 80 L60 80', 4) +
            `<circle cx="13" cy="72" r="4.5" fill="#bbdefb" stroke="${OUT}" stroke-width="2"/><circle cx="87" cy="72" r="4.5" fill="#bbdefb" stroke="${OUT}" stroke-width="2"/>`),

        // 巨人:紫色重甲,头盔铆钉、獠牙、发红的小眼
        giant: () => svg(bodyDefs('#ea80fc', '#4a0072'),
            cube(18) +
            shape('M3 36 V21 Q3 3 21 3 H79 Q97 3 97 21 V36 Z', '#3b0052', 3.5) +
            `<rect x="8" y="7" width="60" height="9" rx="4.5" fill="#fff" opacity="0.18"/>` +
            `<circle cx="17" cy="20" r="4.5" fill="#e1bee7" stroke="${OUT}" stroke-width="2"/><circle cx="83" cy="20" r="4.5" fill="#e1bee7" stroke="${OUT}" stroke-width="2"/><circle cx="50" cy="15" r="4.5" fill="#e1bee7" stroke="${OUT}" stroke-width="2"/>` +
            `<ellipse cx="34" cy="51" rx="9" ry="7" fill="#ff1744" opacity="0.6" filter="url(#blur3)"/><ellipse cx="66" cy="51" rx="9" ry="7" fill="#ff1744" opacity="0.6" filter="url(#blur3)"/>` +
            eye(34, 51, 9, 7, 1, 1, '#ff1744', 0.5) + eye(66, 51, 9, 7, -1, 1, '#ff1744', 0.5) +
            line('M32 78 Q50 70 68 78', 5) +
            shape('M29 77 Q22 62 28 55 Q33 67 38 74 Z', '#fffde7', 2.5) + shape('M71 77 Q78 62 72 55 Q67 67 62 74 Z', '#fffde7', 2.5)),

        // 炮手:橙色小坦克,履带底盘 + 中央炮塔(炮管运行时另画、从中心旋转)
        gunner: () => svg(bodyDefs('#ffcc80', '#e65100') +
            `<radialGradient id="dome" cx="0.35" cy="0.3" r="0.8"><stop offset="0" stop-color="#eceff1"/><stop offset="0.6" stop-color="#78909c"/><stop offset="1" stop-color="#263238"/></radialGradient>`,
            cube(18, 6, 3, 88, 76) +
            `<rect x="0" y="70" width="100" height="28" rx="12" fill="#3e2723" stroke="${OUT}" stroke-width="3.5"/>` +
            [16, 38, 62, 84].map(x => `<circle cx="${x}" cy="84" r="7.5" fill="#8d6e63" stroke="${OUT}" stroke-width="2.2"/><circle cx="${x}" cy="84" r="2.5" fill="#3e2723"/>`).join('') +
            `<rect x="22" y="12" width="56" height="14" rx="7" fill="#1b0f00" stroke="${OUT}" stroke-width="2.5"/>` +
            `<ellipse cx="38" cy="19" rx="6" ry="3.5" fill="#ffea00"/><ellipse cx="62" cy="19" rx="6" ry="3.5" fill="#ffea00"/>` +
            `<circle cx="50" cy="50" r="19" fill="url(#dome)" stroke="${OUT}" stroke-width="3.5"/>`),

        // 冲锋者:黄色流线型,额头闪电、身后速度线
        dasher: () => svg(bodyDefs('#fff59d', '#f9a825'),
            line('M-18 30 L2 30', 5, '#fff59d') + line('M-22 50 L1 50', 5, '#ffe082') + line('M-16 70 L2 70', 5, '#fff59d') +
            cube(28) +
            shape('M56 5 L40 30 L51 30 L44 47 L64 21 L53 21 L60 5 Z', '#ff6d00', 2.8) +
            eye(32, 58, 11, 8, 3, 1, '#3e2700') + eye(68, 58, 11, 8, 3, 1, '#3e2700') +
            line('M20 47 L43 51', 5.5) + line('M80 47 L57 51', 5.5) +
            line('M42 78 Q53 83 62 75', 4)),

        // 自爆方块:粉色炸弹,顶上冒火星的引信、惊恐的大眼
        bomber: () => svg(bodyDefs('#ff80ab', '#ad1457') +
            `<radialGradient id="spark"><stop offset="0" stop-color="#fff"/><stop offset="0.4" stop-color="#ffeb3b"/><stop offset="1" stop-color="#ff6d00" stop-opacity="0"/></radialGradient>`,
            stalk('M66 4 Q72 -8 82 -10', 4.5, '#d7b49e') +
            `<rect x="56" y="-3" width="18" height="11" rx="3" fill="#37474f" stroke="${OUT}" stroke-width="2.5"/>` +
            `<circle cx="86" cy="-12" r="13" fill="url(#spark)"/>` +
            shape('M86 -22 L88.5 -14.5 L96 -12 L88.5 -9.5 L86 -2 L83.5 -9.5 L76 -12 L83.5 -14.5 Z', '#fff59d', 1.6) +
            cube(36) +
            eye(34, 49, 12, 13, 0, 3, '#3b0016', 0.42) + eye(66, 49, 12, 13, 0, 3, '#3b0016', 0.42) +
            line('M21 30 L41 26', 5) + line('M79 30 L59 26', 5) +
            `<ellipse cx="50" cy="75" rx="6.5" ry="7.5" fill="#3b0016" stroke="${OUT}" stroke-width="3"/>`),

        // 宝藏方块:会逃跑的宝箱怪,金边木箱 + 锁 + 宝石
        treasure: () => svg(bodyDefs('#d9963f', '#6d3d0f'),
            cube(14) +
            `<rect x="12" y="3" width="9" height="94" fill="#ffd54f" stroke="${OUT}" stroke-width="2.2"/><rect x="79" y="3" width="9" height="94" fill="#ffd54f" stroke="${OUT}" stroke-width="2.2"/>` +
            `<rect x="3" y="34" width="94" height="9" fill="#ffca28" stroke="${OUT}" stroke-width="2.5"/>` +
            `<rect x="3" y="3" width="94" height="94" rx="14" fill="none" stroke="${OUT}" stroke-width="4.5"/>` +
            eye(34, 19, 8, 8.5, 1, 1, '#3e2723') + eye(66, 19, 8, 8.5, -1, 1, '#3e2723') +
            `<rect x="40" y="33" width="20" height="23" rx="4" fill="#ffe082" stroke="${OUT}" stroke-width="3"/>` +
            `<circle cx="50" cy="42.5" r="3.4" fill="#3e2723"/><rect x="48.4" y="43" width="3.2" height="7" fill="#3e2723"/>` +
            shape('M30 64 L36 70 L30 76 L24 70 Z', '#4fc3f7', 2) + shape('M70 64 L76 70 L70 76 L64 70 Z', '#ef5350', 2) +
            line('M40 80 Q50 87 60 80', 3.5)),

        // 医疗兵:绿色,头顶光环 + 额头医疗十字,眯眼微笑
        healer: () => svg(bodyDefs('#b9f6ca', '#00796b'),
            `<ellipse cx="50" cy="-9" rx="23" ry="6.5" fill="none" stroke="${OUT}" stroke-width="8"/>` +
            `<ellipse cx="50" cy="-9" rx="23" ry="6.5" fill="none" stroke="#fff59d" stroke-width="4"/>` +
            cube(24) +
            `<circle cx="50" cy="30" r="15" fill="#fff" stroke="${OUT}" stroke-width="3"/>` +
            `<path d="M46 20 H54 V26 H60 V34 H54 V40 H46 V34 H40 V26 H46 Z" fill="#e53935"/>` +
            line('M23 61 Q31 53 39 61', 4.5) + line('M61 61 Q69 53 77 61', 4.5) +
            `<ellipse cx="22" cy="71" rx="7" ry="3.5" fill="#ff8a80" opacity="0.6"/><ellipse cx="78" cy="71" rx="7" ry="3.5" fill="#ff8a80" opacity="0.6"/>` +
            line('M43 74 Q50 80 57 74', 4)),

        // 分裂者:青色水晶块,多面切割 + 边缘裂纹
        splitter: () => svg(bodyDefs('#a7ffeb', '#006064'),
            cube(12) +
            `<path d="M6 6 L94 6 L50 50 Z" fill="#fff" opacity="0.16"/><path d="M94 6 L94 94 L50 50 Z" fill="#000" opacity="0.12"/><path d="M6 94 L94 94 L50 50 Z" fill="#000" opacity="0.2"/>` +
            line('M10 16 L24 30 L17 44', 3, '#e0f7fa') + line('M88 12 L73 28 L82 40', 3, '#e0f7fa') +
            line('M13 90 L29 78 L43 92', 3, '#e0f7fa') + line('M90 86 L76 74 L85 62', 3, '#e0f7fa') +
            eye(36, 48, 9.5, 10.5, 1, 2, '#004d40') + eye(64, 48, 9.5, 10.5, -1, 2, '#004d40') +
            line('M41 70 L59 70', 4)),

        // 碎片:分裂者崩出的小水晶,凶巴巴
        shard: () => svg(bodyDefs('#e0f7fa', '#00838f'),
            shape('M50 -2 L98 38 L68 100 L22 94 L2 34 Z', 'url(#b)', 5) +
            `<path d="M50 -2 L2 34 L48 52 Z" fill="#fff" opacity="0.35"/><path d="M98 38 L68 100 L48 52 Z" fill="#000" opacity="0.15"/>` +
            eye(37, 58, 8, 9, 1, 1, '#004d40', 0.5) + eye(63, 58, 8, 9, -1, 1, '#004d40', 0.5) +
            line('M27 45 L43 50', 4.5) + line('M73 45 L57 50', 4.5)),

        // 噬魂者:兜帽里只露出发光双眼的暗紫幽灵
        reaper: () => svg(bodyDefs('#9575cd', '#12002b') +
            `<radialGradient id="hood" cx="0.5" cy="0.35" r="0.7"><stop offset="0" stop-color="#5e35b1"/><stop offset="1" stop-color="#1a0638"/></radialGradient>`,
            cube(22) +
            shape('M1 66 C1 20 22 -2 50 -14 C78 -2 99 20 99 66 Q75 56 50 58 Q25 56 1 66 Z', 'url(#hood)', 4) +
            `<ellipse cx="50" cy="44" rx="29" ry="25" fill="#07010f" stroke="${OUT}" stroke-width="2.5"/>` +
            `<ellipse cx="38" cy="42" rx="9" ry="7" fill="#ea80fc" opacity="0.8" filter="url(#blur3)"/><ellipse cx="62" cy="42" rx="9" ry="7" fill="#ea80fc" opacity="0.8" filter="url(#blur3)"/>` +
            shape('M30 38 L45 42 L38 48 Z', '#f8bbff', 1.5) + shape('M70 38 L55 42 L62 48 Z', '#f8bbff', 1.5) +
            `<path d="M38 57 h24 v6 h-24 z" fill="#e1bee7" stroke="${OUT}" stroke-width="2"/>` +
            line('M44 57 L44 63', 1.8) + line('M50 57 L50 63', 1.8) + line('M56 57 L56 63', 1.8) +
            `<path d="M8 74 Q50 64 92 74" fill="none" stroke="#b388ff" stroke-opacity="0.45" stroke-width="2.5"/>`)
    };

    // ── 玩家:友好的小方块英雄,头顶一对嫩芽(配色随皮肤) ──
    const player = (c1, c2) => svg(bodyDefs(c1, c2),
        stalk('M50 6 Q51 -3 50 -10', 3.5, c1) +
        shape('M50 -9 Q64 -27 79 -13 Q66 -1 50 -9 Z', c1, 3) +
        shape('M50 -7 Q37 -21 26 -10 Q38 0 50 -7 Z', c1, 3) +
        line('M52 -10 Q63 -15 72 -13', 1.8, '#fff') +
        cube(24) +
        eye(34, 46, 12, 14, 2, 2, '#0d1b2a', 0.58) + eye(66, 46, 12, 14, 2, 2, '#0d1b2a', 0.58) +
        `<ellipse cx="21" cy="66" rx="7.5" ry="4" fill="#ff6f91" opacity="0.55"/><ellipse cx="79" cy="66" rx="7.5" ry="4" fill="#ff6f91" opacity="0.55"/>` +
        line('M40 66 Q50 76 60 66', 4.5));

    // ── 方块大魔王:皇冠 + 恶魔角 + 发光怒目 + 獠牙 ──
    const boss = (enraged) => {
        const c1 = enraged ? '#ff6e6e' : '#9e7bff', c2 = enraged ? '#3a0010' : '#1a0033';
        const eyeC = enraged ? '#ffea00' : '#ff1744';
        return svg(bodyDefs(c1, c2) +
            `<linearGradient id="gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff59d"/><stop offset="1" stop-color="#ff8f00"/></linearGradient>` +
            `<linearGradient id="horn" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f5f0e1"/><stop offset="1" stop-color="#6d4c41"/></linearGradient>`,
            shape('M14 32 C-6 24 -16 2 -9 -18 C-1 -1 12 10 27 14 Z', 'url(#horn)', 4) +
            shape('M86 32 C106 24 116 2 109 -18 C101 -1 88 10 73 14 Z', 'url(#horn)', 4) +
            cube(18) +
            `<path d="M3 70 H97 V79 Q97 97 79 97 H21 Q3 97 3 79 Z" fill="#000" opacity="0.32"/>` +
            shape('M27 7 L27 -15 L38.5 -5 L50 -22 L61.5 -5 L73 -15 L73 7 Z', 'url(#gold)', 3.5) +
            `<circle cx="50" cy="-6" r="4.5" fill="#e53935" stroke="${OUT}" stroke-width="2"/><circle cx="35" cy="0" r="3" fill="#40c4ff" stroke="${OUT}" stroke-width="1.6"/><circle cx="65" cy="0" r="3" fill="#40c4ff" stroke="${OUT}" stroke-width="1.6"/>` +
            `<ellipse cx="31" cy="50" rx="14" ry="9" fill="${eyeC}" opacity="0.75" filter="url(#blur3)"/><ellipse cx="69" cy="50" rx="14" ry="9" fill="${eyeC}" opacity="0.75" filter="url(#blur3)"/>` +
            shape('M17 41 L45 49 L41 59 L21 55 Z', eyeC, 3) + shape('M83 41 L55 49 L59 59 L79 55 Z', eyeC, 3) +
            line('M31 48 L32 56', 3.2, '#000') + line('M69 48 L68 56', 3.2, '#000') +
            line('M13 33 L46 43', 7.5) + line('M87 33 L54 43', 7.5) +
            shape('M21 69 Q50 92 79 69 Q50 77 21 69 Z', '#1a0008', 3) +
            shape('M31 71 L35.5 82 L40 72 Z', '#fff', 1.8) + shape('M60 72 L64.5 82 L69 71 Z', '#fff', 1.8));
    };

    // ── 道具图标(viewBox 0 0 100 100,图标居中占满) ──
    const isvg = (defs, body) =>
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="200" height="200">` +
        `<defs>${defs}<filter id="bl" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4"/></filter></defs>${body}</svg>`;
    const lg = (id, stops, x2 = 0, y2 = 1) =>
        `<linearGradient id="${id}" x1="0" y1="0" x2="${x2}" y2="${y2}">` +
        stops.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('') + `</linearGradient>`;
    const rg = (id, stops, cx = 0.35, cy = 0.3, r = 0.75) =>
        `<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${r}">` +
        stops.map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}" stop-opacity="${a}"/>`).join('') + `</radialGradient>`;
    // n 角星
    const star = (cx, cy, R, r, n = 5, rot = -Math.PI / 2) => {
        let d = '';
        for (let i = 0; i < n * 2; i++) {
            const a = rot + i * Math.PI / n, rr = i % 2 ? r : R;
            d += (i ? 'L' : 'M') + (cx + Math.cos(a) * rr).toFixed(1) + ' ' + (cy + Math.sin(a) * rr).toFixed(1);
        }
        return d + 'Z';
    };
    const glowDot = (cx, cy, r, c, o = 0.55) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${c}" opacity="${o}" filter="url(#bl)"/>`;
    const glint = (cx, cy, r) => `<path d="${star(cx, cy, r, r * 0.28, 4, 0)}" fill="#fff"/>`;
    // 双层描边线:深色外描边 + 彩色内芯
    const dl = (d, w, c) => line(d, w + 4) + line(d, w, c);

    const items = {
        // 生命药水:圆底烧瓶,翠绿药液 + 白色十字
        potion: () => {
            const F = 'M40 32 V20 H60 V32 Q84 41 84 64 Q84 92 50 92 Q16 92 16 64 Q16 41 40 32 Z';
            return isvg(lg('lq', [[0, '#b9f6ca'], [0.45, '#00e676'], [1, '#00695c']]) + `<clipPath id="fl"><path d="${F}"/></clipPath>`,
                glowDot(50, 66, 30, '#00e676', 0.35) +
                `<path d="${F}" fill="#e0f7fa" fill-opacity="0.35"/>` +
                `<g clip-path="url(#fl)"><rect x="0" y="48" width="100" height="52" fill="url(#lq)"/><path d="M14 50 Q32 44 50 50 T86 50 V55 H14 Z" fill="#fff" opacity="0.4"/></g>` +
                `<path d="M46 59 H54 V65 H60 V73 H54 V79 H46 V73 H40 V65 H46 Z" fill="#fff" opacity="0.92"/>` +
                `<circle cx="31" cy="76" r="3" fill="#fff" opacity="0.7"/><circle cx="69" cy="63" r="2.4" fill="#fff" opacity="0.7"/>` +
                `<path d="${F}" fill="none" stroke="${OUT}" stroke-width="5" stroke-linejoin="round"/>` +
                line('M27 50 Q22 62 26 76', 4, '#ffffff') +
                `<rect x="35" y="17" width="30" height="8" rx="3" fill="#b2ebf2" stroke="${OUT}" stroke-width="3.5"/>` +
                `<rect x="38" y="5" width="24" height="14" rx="4" fill="#a1887f" stroke="${OUT}" stroke-width="4"/>` + glint(78, 30, 6));
        },
        // 经验书:摊开的书 + 头顶金星
        exp_book: () => isvg(lg('pg', [[0, '#fffde7'], [1, '#ffe0b2']]) + lg('cv', [[0, '#ffb300'], [1, '#bf5f00']]),
            glowDot(50, 17, 16, '#ffd54f', 0.6) +
            `<path d="M50 90 Q30 80 5 86 V30 Q30 25 50 35 Q70 25 95 30 V86 Q70 80 50 90 Z" fill="url(#cv)" stroke="${OUT}" stroke-width="5" stroke-linejoin="round"/>` +
            `<path d="M50 34 Q32 24 12 28 V79 Q32 75 50 83 Z" fill="url(#pg)" stroke="${OUT}" stroke-width="3.5" stroke-linejoin="round"/>` +
            `<path d="M50 34 Q68 24 88 28 V79 Q68 75 50 83 Z" fill="url(#pg)" stroke="${OUT}" stroke-width="3.5" stroke-linejoin="round"/>` +
            [42, 52, 62, 70].map(y => line(`M18 ${y} Q31 ${y - 4} 44 ${y + 2}`, 2.6, '#c8a27a') + line(`M56 ${y + 2} Q69 ${y - 4} 82 ${y}`, 2.6, '#c8a27a')).join('') +
            `<path d="${star(50, 17, 12, 5.2)}" fill="#ffeb3b" stroke="${OUT}" stroke-width="3" stroke-linejoin="round"/>` + glint(80, 14, 5)),
        // 雪花:六臂冰晶
        snowflake: () => {
            let d = '';
            for (let i = 0; i < 6; i++) {
                const a = i * Math.PI / 3, ca = Math.cos(a), sa = Math.sin(a);
                d += `M50 50 L${(50 + ca * 42).toFixed(1)} ${(50 + sa * 42).toFixed(1)} `;
                for (const [r, l] of [[22, 12], [33, 8]]) {
                    const bx = 50 + ca * r, by = 50 + sa * r;
                    for (const s of [-1, 1]) {
                        const b = a + s * 0.8;
                        d += `M${bx.toFixed(1)} ${by.toFixed(1)} L${(bx + Math.cos(b) * l).toFixed(1)} ${(by + Math.sin(b) * l).toFixed(1)} `;
                    }
                }
            }
            return isvg(lg('ic', [[0, '#ffffff'], [0.5, '#b3e5fc'], [1, '#29b6f6']], 1, 1),
                glowDot(50, 50, 34, '#00e5ff', 0.35) + line(d, 10) + line(d, 5.5, 'url(#ic)') +
                `<path d="${star(50, 50, 10, 8.6, 6, 0)}" fill="#e1f5fe" stroke="${OUT}" stroke-width="3"/>` + glint(76, 22, 6) + glint(24, 78, 4));
        },
        // 炸弹:圆炸弹 + 冒火星的引信
        bomb: () => isvg(rg('bm', [[0, '#b0bec5'], [0.4, '#455a64'], [1, '#0d1316']]) + rg('sp', [[0, '#fff'], [0.4, '#ffeb3b'], [1, '#ff6d00', 0]], 0.5, 0.5, 0.5),
            dl('M64 28 Q72 12 84 11', 4.5, '#d7b49e') +
            `<circle cx="85" cy="11" r="13" fill="url(#sp)"/>` +
            `<path d="${star(85, 11, 9, 3, 4, 0)}" fill="#fff59d" stroke="#ff6d00" stroke-width="1.5"/>` +
            `<rect x="54" y="20" width="18" height="13" rx="3" transform="rotate(35 63 26)" fill="#546e7a" stroke="${OUT}" stroke-width="3.5"/>` +
            glowDot(45, 59, 34, '#90a4ae', 0.35) +
            `<circle cx="45" cy="59" r="32" fill="url(#bm)" stroke="${OUT}" stroke-width="5"/>` +
            `<circle cx="45" cy="59" r="28.5" fill="none" stroke="#b0bec5" stroke-opacity="0.45" stroke-width="2"/>` +
            `<ellipse cx="33" cy="46" rx="10" ry="6" transform="rotate(-35 33 46)" fill="#fff" opacity="0.55"/>`),
        // 红心:+1 命
        heart: () => {
            const H = 'M50 90 C22 70 6 54 8 34 C10 16 32 8 50 26 C68 8 90 16 92 34 C94 54 78 70 50 90 Z';
            return isvg(lg('ht', [[0, '#ff9ec0'], [0.5, '#ff4081'], [1, '#ad1457']], 0.6, 1),
                glowDot(50, 50, 34, '#ff4081', 0.4) +
                `<path d="${H}" fill="url(#ht)" stroke="${OUT}" stroke-width="5" stroke-linejoin="round"/>` +
                `<ellipse cx="29" cy="31" rx="10" ry="6.5" transform="rotate(-35 29 31)" fill="#fff" opacity="0.65"/>` +
                `<circle cx="20" cy="45" r="3" fill="#fff" opacity="0.5"/>` + glint(79, 17, 7));
        },
        // 无敌药水:金色盾牌 + 闪电
        potion_invicible: () => {
            const S = 'M50 6 L88 20 V46 Q88 76 50 94 Q12 76 12 46 V20 Z';
            return isvg(lg('gd', [[0, '#fff9c4'], [0.5, '#ffd54f'], [1, '#e65100']], 0.4, 1),
                glowDot(50, 50, 36, '#ffd700', 0.45) +
                `<path d="${S}" fill="url(#gd)" stroke="${OUT}" stroke-width="5" stroke-linejoin="round"/>` +
                `<path d="M50 15 L79 26 V46 Q79 70 50 84 Q21 70 21 46 V26 Z" fill="none" stroke="#fff" stroke-opacity="0.55" stroke-width="3"/>` +
                `<path d="M57 20 L35 54 H50 L42 82 L67 44 H52 L61 20 Z" fill="#fff" stroke="${OUT}" stroke-width="3.5" stroke-linejoin="round"/>` + glint(80, 12, 6));
        },

        // ── 限时装备 ──
        // 雷霆之刃:金色闪电剑
        gear_blade: () => isvg(lg('bd', [[0, '#ffffff'], [0.5, '#fff59d'], [1, '#ffc400']], 1, 0),
            glowDot(50, 50, 32, '#ffe14d', 0.4) +
            `<g transform="rotate(40 50 50)">` +
            `<path d="M50 2 L59 15 V62 H41 V15 Z" fill="url(#bd)" stroke="${OUT}" stroke-width="4" stroke-linejoin="round"/>` +
            line('M50 13 V57', 2.5, '#ffffff') +
            `<rect x="27" y="60" width="46" height="10" rx="4" fill="#ffb300" stroke="${OUT}" stroke-width="4"/>` +
            `<rect x="45" y="69" width="10" height="18" rx="3" fill="#6d4c41" stroke="${OUT}" stroke-width="3.5"/>` +
            `<circle cx="50" cy="91" r="6" fill="#ffd54f" stroke="${OUT}" stroke-width="3.5"/></g>` +
            dl('M16 34 L25 29 L23 38 L32 33', 2.6, '#fff59d') + dl('M68 78 L77 73 L75 82 L84 77', 2.6, '#fff59d')),
        // 烈焰法球:火焰包裹的熔核
        gear_orb: () => isvg(lg('fm', [[0, '#ffeb3b'], [0.45, '#ff7043'], [1, '#bf360c']]) + rg('core', [[0, '#fffde7'], [0.45, '#ffcc80'], [1, '#ff5722']]),
            glowDot(50, 56, 34, '#ff7043', 0.45) +
            `<path d="M50 4 C60 18 77 22 74 44 C87 52 85 80 50 93 C15 80 13 52 26 44 C23 26 40 22 50 4 Z" fill="url(#fm)" stroke="${OUT}" stroke-width="4.5" stroke-linejoin="round"/>` +
            `<circle cx="50" cy="62" r="20" fill="url(#core)" stroke="${OUT}" stroke-width="3.2"/>` +
            line('M39 62 Q50 50 61 60', 3, '#ffffff') +
            `<ellipse cx="50" cy="62" rx="45" ry="12" transform="rotate(-18 50 62)" fill="none" stroke="#ffab91" stroke-width="2.5" stroke-dasharray="40 14"/>`),
        // 寒霜战甲:冰蓝胸甲 + 雪花纹
        gear_armor: () => isvg(lg('ia', [[0, '#e1f5fe'], [0.5, '#4fc3f7'], [1, '#01579b']], 0.6, 1),
            glowDot(50, 52, 34, '#80d8ff', 0.4) +
            `<path d="M20 18 L36 10 Q50 22 64 10 L80 18 L91 36 L78 43 V84 Q50 96 22 84 V43 L9 36 Z" fill="url(#ia)" stroke="${OUT}" stroke-width="5" stroke-linejoin="round"/>` +
            line('M36 10 Q50 26 64 10', 4) + line('M50 26 V88', 2.5, 'rgba(255,255,255,0.55)') +
            line('M27 56 Q50 64 73 56', 3) + line('M27 71 Q50 79 73 71', 3) +
            line('M50 32 V48 M43 36 L57 44 M57 36 L43 44', 2.6, '#ffffff') + glint(78, 26, 5)),
        // 风暴连弩:翠绿弩弓 + 箭矢
        gear_bow: () => isvg(lg('bw', [[0, '#b9f6ca'], [1, '#00c853']], 1, 0),
            glowDot(50, 46, 32, '#69f0ae', 0.35) +
            `<rect x="44" y="30" width="12" height="62" rx="4" fill="#6d4c41" stroke="${OUT}" stroke-width="4"/>` +
            line('M9 46 Q50 8 91 46', 11) + line('M9 46 Q50 8 91 46', 6, 'url(#bw)') +
            line('M11 46 L50 60 L89 46', 2.4, '#e0f2f1') +
            line('M50 62 V12', 6) + line('M50 62 V12', 3, '#cfd8dc') +
            `<path d="M50 2 L58 15 H42 Z" fill="#69f0ae" stroke="${OUT}" stroke-width="3" stroke-linejoin="round"/>` +
            `<rect x="40" y="72" width="20" height="7" rx="3" fill="#a1887f" stroke="${OUT}" stroke-width="2.5"/>` +
            line('M14 70 Q22 64 30 70', 2.5, '#b9f6ca') + line('M70 70 Q78 64 86 70', 2.5, '#b9f6ca')),
        // 荆棘之甲:一圈尖刺的圆盾
        gear_thorns: () => {
            let spikes = '';
            for (let i = 0; i < 10; i++) {
                const a = i * Math.PI / 5 - Math.PI / 2;
                const p = (r, da) => `${(50 + Math.cos(a + da) * r).toFixed(1)} ${(52 + Math.sin(a + da) * r).toFixed(1)}`;
                spikes += `<path d="M${p(27, -0.24)} L${p(47, 0)} L${p(27, 0.24)} Z" fill="#e6ee9c" stroke="${OUT}" stroke-width="3" stroke-linejoin="round"/>`;
            }
            return isvg(lg('th', [[0, '#f4ff81'], [0.5, '#76ff03'], [1, '#33691e']], 0.6, 1),
                glowDot(50, 52, 34, '#c6ff00', 0.35) + spikes +
                `<circle cx="50" cy="52" r="30" fill="url(#th)" stroke="${OUT}" stroke-width="5"/>` +
                `<circle cx="50" cy="52" r="18" fill="#33691e" fill-opacity="0.45" stroke="${OUT}" stroke-width="3"/>` +
                `<circle cx="50" cy="52" r="8" fill="#f4ff81" stroke="${OUT}" stroke-width="3"/>` +
                `<ellipse cx="38" cy="38" rx="8" ry="5" transform="rotate(-35 38 38)" fill="#fff" opacity="0.5"/>`);
        },

        // ── 暗金遗物 ──
        // 雷神指环:金指环 + 发光黄宝石
        relic_thunder_ring: () => isvg(lg('rg', [[0, '#fff9c4'], [0.5, '#ffd54f'], [1, '#b26a00']], 1, 1) + lg('gm', [[0, '#ffffff'], [0.4, '#ffe14d'], [1, '#ff8f00']], 1, 1),
            glowDot(50, 34, 20, '#ffe14d', 0.6) +
            `<ellipse cx="50" cy="64" rx="30" ry="24" fill="none" stroke="${OUT}" stroke-width="15"/>` +
            `<ellipse cx="50" cy="64" rx="30" ry="24" fill="none" stroke="url(#rg)" stroke-width="9"/>` +
            `<path d="M27 56 Q34 46 46 43" fill="none" stroke="#fff" stroke-opacity="0.6" stroke-width="2.5" stroke-linecap="round"/>` +
            `<path d="M35 34 L43 21 H57 L65 34 L50 47 Z" fill="url(#gm)" stroke="${OUT}" stroke-width="3.5" stroke-linejoin="round"/>` +
            line('M35 34 H65 M43 21 L50 34 L57 21 M50 34 V47', 1.6, 'rgba(255,255,255,0.7)') +
            dl('M12 26 L19 21 L17 29 L24 24', 2.4, '#fff59d') + dl('M76 24 L83 19 L81 27 L88 22', 2.4, '#fff59d')),
        // 吸血鬼獠牙:象牙獠牙 + 血滴
        relic_vampire_fang: () => isvg(lg('fg', [[0, '#ffffff'], [1, '#d7ccc8']], 1, 1),
            glowDot(50, 50, 32, '#ff5252', 0.35) +
            `<path d="M33 10 Q63 6 71 22 Q73 50 57 78 Q50 90 46 77 Q42 52 30 30 Q26 16 33 10 Z" fill="url(#fg)" stroke="${OUT}" stroke-width="5" stroke-linejoin="round"/>` +
            `<path d="M46 68 Q53 72 57 66 Q57 79 51 86 Q45 79 46 68 Z" fill="#e53935"/>` +
            `<path d="M51 88 Q46 95 51 99 Q56 95 51 88 Z" fill="#e53935" stroke="${OUT}" stroke-width="2"/>` +
            line('M40 18 Q46 40 47 60', 3, 'rgba(255,255,255,0.85)')),
        // 时空怀表:金壳怀表 + 链子
        relic_chrono_watch: () => {
            let ticks = '';
            for (let i = 0; i < 12; i++) {
                const a = i * Math.PI / 6, r1 = i % 3 ? 23 : 20;
                ticks += `M${(50 + Math.cos(a) * r1).toFixed(1)} ${(58 + Math.sin(a) * r1).toFixed(1)} L${(50 + Math.cos(a) * 26).toFixed(1)} ${(58 + Math.sin(a) * 26).toFixed(1)} `;
            }
            return isvg(lg('wc', [[0, '#fff9c4'], [0.5, '#ffca28'], [1, '#b26a00']], 1, 1),
                glowDot(50, 58, 36, '#80d8ff', 0.35) +
                dl('M50 12 Q30 2 16 13', 3, '#ffd54f') +
                `<rect x="43" y="9" width="14" height="11" rx="3" fill="url(#wc)" stroke="${OUT}" stroke-width="3"/>` +
                `<circle cx="50" cy="58" r="37" fill="url(#wc)" stroke="${OUT}" stroke-width="5"/>` +
                `<circle cx="50" cy="58" r="29" fill="#e1f5fe" stroke="${OUT}" stroke-width="3"/>` +
                `<circle cx="50" cy="58" r="26" fill="none" stroke="#80d8ff" stroke-width="2" opacity="0.7"/>` +
                line(ticks, 2.2, '#455a64') +
                line('M50 58 L50 37', 3.5) + line('M50 58 L64 64', 4) +
                `<circle cx="50" cy="58" r="3.5" fill="${OUT}"/>` +
                `<ellipse cx="36" cy="38" rx="8" ry="4" transform="rotate(-35 36 38)" fill="#fff" opacity="0.6"/>`);
        },
        // 死神斗篷:暗紫兜帽斗篷 + 发光扣
        relic_reaper_cloak: () => isvg(lg('ck', [[0, '#9575cd'], [0.5, '#5e35b1'], [1, '#1a0638']], 0.4, 1),
            glowDot(50, 52, 34, '#ea80fc', 0.35) +
            `<path d="M50 5 C30 7 22 25 22 40 L9 93 H91 L78 40 C78 25 70 7 50 5 Z" fill="url(#ck)" stroke="${OUT}" stroke-width="5" stroke-linejoin="round"/>` +
            `<ellipse cx="50" cy="36" rx="15" ry="17" fill="#07010f" stroke="${OUT}" stroke-width="3"/>` +
            `<ellipse cx="44" cy="36" rx="3.4" ry="2.4" fill="#ea80fc"/><ellipse cx="56" cy="36" rx="3.4" ry="2.4" fill="#ea80fc"/>` +
            line('M36 66 L28 91 M64 66 L72 91 M50 70 V92', 2.5, 'rgba(0,0,0,0.35)') +
            `<circle cx="50" cy="60" r="6" fill="#ea80fc" stroke="${OUT}" stroke-width="3"/>` +
            line('M28 30 Q30 18 42 12', 2.5, 'rgba(255,255,255,0.4)')),
        // 炼金魔石:符文法阵中的翠绿六棱宝石
        relic_alchemist_stone: () => isvg(lg('as', [[0, '#e8f5e9'], [0.45, '#69f0ae'], [1, '#1b5e20']], 1, 1),
            glowDot(50, 50, 34, '#b9f6ca', 0.45) +
            `<circle cx="50" cy="50" r="43" fill="none" stroke="#b9f6ca" stroke-width="2.5" stroke-dasharray="9 6" opacity="0.8"/>` +
            `<path d="M50 11 L84 70 H16 Z" fill="none" stroke="#b9f6ca" stroke-width="2" opacity="0.6"/>` +
            `<path d="M50 20 L74 35 V65 L50 80 L26 65 V35 Z" fill="url(#as)" stroke="${OUT}" stroke-width="5" stroke-linejoin="round"/>` +
            `<path d="M50 20 L74 35 L50 50 L26 35 Z" fill="#fff" opacity="0.3"/>` +
            line('M50 50 V80 M50 50 L74 65 M50 50 L26 65', 1.8, 'rgba(255,255,255,0.45)') + glint(66, 30, 5)),
        // 狂徒铠甲:金色重甲背心 + 红心徽记
        relic_warmog_vest: () => isvg(lg('wv', [[0, '#fff59d'], [0.5, '#ffd54f'], [1, '#e65100']], 0.5, 1),
            glowDot(50, 52, 34, '#ffd54f', 0.4) +
            `<path d="M27 12 L40 8 Q50 18 60 8 L73 12 L88 30 L78 39 V86 Q50 95 22 86 V39 L12 30 Z" fill="url(#wv)" stroke="${OUT}" stroke-width="5" stroke-linejoin="round"/>` +
            line('M40 8 Q50 22 60 8', 4) + line('M28 70 Q50 78 72 70', 3) +
            `<circle cx="27" cy="44" r="3" fill="#fff8e1" stroke="${OUT}" stroke-width="2"/><circle cx="73" cy="44" r="3" fill="#fff8e1" stroke="${OUT}" stroke-width="2"/>` +
            `<path d="M50 62 C40 55 35 49 36 43 C37 37 45 35 50 41 C55 35 63 37 64 43 C65 49 60 55 50 62 Z" fill="#e53935" stroke="${OUT}" stroke-width="3"/>` +
            `<ellipse cx="44" cy="42" rx="3" ry="2" fill="#fff" opacity="0.7"/>`)
    };

    return { enemies, player, boss, items };
})();

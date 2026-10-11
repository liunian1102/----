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

// ══════════════════════════════════════════════════════════════════
//  emoji → 同画风小图标(viewBox 0 0 100 100)
//  画布:EmojiArt.patchCanvas 让 ctx.fillText 里的 emoji 自动画成图标;
//  网页:EmojiArt.patchDom 把页面文字里的 emoji 换成 <img>。
//  不同系统的 emoji 字体长得不一样,这样各端看到的完全一致。
// ══════════════════════════════════════════════════════════════════
const EmojiSVG = (() => {
    const OUT = '#120d22';
    const svg = (defs, body) =>
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="128" height="128"><defs>${defs}</defs>${body}</svg>`;
    const lg = (id, c1, c2, x2 = 0.5, y2 = 1) =>
        `<linearGradient id="${id}" x1="0" y1="0" x2="${x2}" y2="${y2}"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient>`;
    const P = (d, fill, w = 5) => `<path d="${d}" fill="${fill}" stroke="${OUT}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"/>`;
    const C = (cx, cy, r, fill, w = 5) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" stroke="${OUT}" stroke-width="${w}"/>`;
    const L = (d, w, c = OUT) => `<path d="${d}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
    const LL = (d, w, c) => L(d, w + 5) + L(d, w, c); // 描边 + 彩色内芯
    const hi = (cx, cy, rx, ry, rot = -35) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" transform="rotate(${rot} ${cx} ${cy})" fill="#fff" opacity="0.55"/>`;
    const star = (cx, cy, R, r, n = 5, rot = -Math.PI / 2) => {
        let d = '';
        for (let i = 0; i < n * 2; i++) {
            const a = rot + i * Math.PI / n, rr = i % 2 ? r : R;
            d += (i ? 'L' : 'M') + (cx + Math.cos(a) * rr).toFixed(1) + ' ' + (cy + Math.sin(a) * rr).toFixed(1);
        }
        return d + 'Z';
    };
    const g1 = (c1, c2) => lg('a', c1, c2);
    const sword = (rot, c1 = '#ffffff', c2 = '#90a4ae') =>
        `<g transform="rotate(${rot} 50 50)">` + P('M50 4 L58 16 V62 H42 V16 Z', `url(#s${rot < 0 ? 'b' : 'a'})`, 4.5) +
        P('M28 60 H72 V70 H28 Z', '#ffb300', 4.5) + P('M45 70 H55 V88 H45 Z', '#6d4c41', 4) + C(50, 92, 6, '#ffd54f', 4) + `</g>`;
    const bird = (c1, c2) => svg(g1(c1, c2),
        P('M6 44 C22 26 40 30 50 48 C60 30 78 26 94 44 C78 42 66 48 58 60 L50 74 L42 60 C34 48 22 42 6 44 Z', 'url(#a)') +
        P('M44 62 Q50 50 56 62 Q50 70 44 62 Z', c2, 3));
    const arrowsCircle = (c1, c2) => svg(g1(c1, c2),
        LL('M20 54 A30 30 0 0 1 72 28', 9, 'url(#a)') + P('M64 16 L84 30 L62 40 Z', c1, 4) +
        LL('M80 46 A30 30 0 0 1 28 72', 9, 'url(#a)') + P('M36 84 L16 70 L38 60 Z', c2, 4));

    const S = {
        // ── 武器与战斗 ──
        '⚔': () => svg(lg('sa', '#ffffff', '#90a4ae', 1, 0) + lg('sb', '#ffffff', '#90a4ae', 1, 0), sword(-42) + sword(42)),
        '🗡': () => svg(lg('sa', '#ffffff', '#b0bec5', 1, 0), sword(40)),
        '🔱': () => svg(g1('#fff59d', '#ff8f00'),
            P('M45 40 H55 V96 H45 Z', 'url(#a)', 4) +
            P('M20 10 L28 22 H25 V38 Q25 48 50 48 Q75 48 75 38 V22 H72 L80 10 L88 22 H84 V40 Q84 58 50 58 Q16 58 16 40 V22 H12 Z', 'url(#a)', 4) +
            P('M50 4 L58 18 H54 V46 H46 V18 H42 Z', 'url(#a)', 4)),
        '🔨': () => svg(g1('#eceff1', '#546e7a'), `<g transform="rotate(-30 50 50)">` + P('M45 34 H55 V94 H45 Z', '#8d6e63', 4) + P('M22 12 H78 V40 H22 Z', 'url(#a)') + hi(36, 20, 9, 4, 0) + `</g>`),
        '🎯': () => svg('', C(50, 52, 42, '#e53935') + C(50, 52, 30, '#fff', 0) + C(50, 52, 19, '#e53935', 0) + C(50, 52, 8, '#fff', 0) +
            `<circle cx="50" cy="52" r="42" fill="none" stroke="${OUT}" stroke-width="5"/>` +
            LL('M52 50 L86 16', 4, '#ffd54f') + P('M80 8 L94 6 L92 20 Z', '#4fc3f7', 3)),
        '💥': () => svg(g1('#ffeb3b', '#ff3d00'), P(star(50, 50, 47, 24, 10), 'url(#a)') + P(star(50, 50, 24, 12, 8), '#fffde7', 3)),
        '💢': () => svg('', ['M14 38 Q30 36 32 14', 'M62 14 Q64 36 86 38', 'M86 62 Q64 64 62 86', 'M38 86 Q36 64 14 62'].map(d => LL(d, 9, '#ff1744')).join('')),
        '☠': () => svg(g1('#ffffff', '#b0bec5'),
            P('M50 8 C26 8 12 26 14 48 C15 60 22 66 26 70 V84 Q26 92 34 92 H66 Q74 92 74 84 V70 C78 66 85 60 86 48 C88 26 74 8 50 8 Z', 'url(#a)') +
            `<ellipse cx="35" cy="50" rx="11" ry="12" fill="${OUT}"/><ellipse cx="65" cy="50" rx="11" ry="12" fill="${OUT}"/>` +
            P('M50 60 L56 72 H44 Z', OUT, 2) + L('M40 80 V90 M50 80 V90 M60 80 V90', 3.5) + hi(32, 24, 10, 5)),
        '😈': () => svg(g1('#ce93d8', '#6a1b9a'),
            P('M18 28 L10 4 L36 18 Z', '#4a148c', 4) + P('M82 28 L90 4 L64 18 Z', '#4a148c', 4) + C(50, 56, 38, 'url(#a)') +
            L('M28 42 L44 48 M72 42 L56 48', 5) + `<ellipse cx="38" cy="54" rx="5" ry="6" fill="${OUT}"/><ellipse cx="62" cy="54" rx="5" ry="6" fill="${OUT}"/>` +
            P('M30 66 Q50 84 70 66 Q50 74 30 66 Z', '#fff', 3.5) + hi(34, 34, 9, 5)),
        '🛡': () => svg(g1('#bbdefb', '#1565c0'),
            P('M50 5 L87 18 V46 C87 72 71 87 50 95 C29 87 13 72 13 46 V18 Z', 'url(#a)') +
            P('M50 18 L74 27 V46 C74 64 64 75 50 81 C36 75 26 64 26 46 V27 Z', '#e3f2fd', 3.5) + P('M50 30 V70 M34 46 H66', 'none', 5) + hi(30, 26, 8, 4)),

        // ── 元素与自然 ──
        '🔥': () => svg(g1('#ffca28', '#e64a19'),
            P('M50 4 C60 22 78 30 78 58 C78 80 64 95 50 95 C36 95 22 80 22 58 C22 40 33 32 37 18 C42 30 46 34 50 37 C53 26 51 15 50 4 Z', 'url(#a)') +
            P('M50 50 C57 60 65 66 63 79 C62 88 57 91 50 91 C43 91 38 88 37 79 C36 69 45 62 50 50 Z', '#fff59d', 3)),
        '⚡': () => svg(g1('#fff9c4', '#ffb300'), P('M60 3 L20 56 H45 L36 97 L80 40 H55 L68 3 Z', 'url(#a)')),
        '🌊': () => svg(g1('#80d8ff', '#01579b'),
            P('M5 58 C18 36 38 30 54 42 C45 44 43 56 54 60 C68 66 84 54 95 40 V93 H5 Z', 'url(#a)') +
            L('M10 76 Q30 68 50 76 T90 74', 3.5, 'rgba(255,255,255,0.7)')),
        '🌋': () => svg(g1('#8d6e63', '#3e2723'),
            `<circle cx="38" cy="16" r="10" fill="#9e9e9e" opacity="0.8"/><circle cx="56" cy="10" r="8" fill="#bdbdbd" opacity="0.8"/>` +
            P('M6 92 L36 34 H64 L94 92 Z', 'url(#a)') + P('M36 34 H64 L58 48 L52 42 L46 54 L40 44 Z', '#ff5722', 3.5)),
        '☀': () => {
            let rays = '';
            for (let i = 0; i < 8; i++) {
                const a = i * Math.PI / 4, c = Math.cos(a), s = Math.sin(a);
                rays += P(`M${50 + c * 30} ${50 + s * 30} L${50 + Math.cos(a + 0.22) * 38} ${50 + Math.sin(a + 0.22) * 38} L${50 + c * 48} ${50 + s * 48} L${50 + Math.cos(a - 0.22) * 38} ${50 + Math.sin(a - 0.22) * 38} Z`, '#ffb300', 3.5);
            }
            return svg(g1('#fff59d', '#ff8f00'), rays + C(50, 50, 26, 'url(#a)') + hi(42, 40, 8, 5));
        },
        '🌙': () => svg(g1('#fff9c4', '#ffb300'), P('M62 6 A44 44 0 1 0 94 66 A34 34 0 1 1 62 6 Z', 'url(#a)') + hi(26, 40, 5, 10, 20)),
        '🌱': () => svg(g1('#b9f6ca', '#2e7d32'),
            LL('M50 94 Q48 70 50 48', 5, '#66bb6a') + P('M50 54 Q58 24 90 24 Q86 56 50 54 Z', 'url(#a)', 4.5) + P('M48 60 Q36 34 10 38 Q18 64 48 60 Z', 'url(#a)', 4.5)),
        '🌀': () => {
            let d = 'M50 50';
            for (let t = 0; t <= 4.2 * Math.PI; t += 0.25) d += ` L${(50 + Math.cos(t) * (3 + t * 3.3)).toFixed(1)} ${(50 + Math.sin(t) * (3 + t * 3.3)).toFixed(1)}`;
            return svg(lg('a', '#b388ff', '#2979ff', 1, 1), LL(d, 9, 'url(#a)'));
        },
        '💨': () => svg('', LL('M10 34 H60 Q76 34 76 22 Q76 12 66 12 Q58 12 58 20', 7, '#e1f5fe') + LL('M10 54 H80 Q94 54 94 66 Q94 78 82 78 Q74 78 74 70', 7, '#b3e5fc') + LL('M18 74 H50', 7, '#e1f5fe')),
        '☄': () => svg(lg('a', '#ffffff', '#ff7043', 1, 1), P('M8 8 Q40 22 70 50 L50 70 Q22 40 8 8 Z', '#ffab40', 3) + C(66, 66, 22, 'url(#a)') + hi(60, 58, 7, 4)),
        '🌠': () => svg(g1('#fff59d', '#ffb300'), LL('M10 90 L46 54 M8 72 L36 50 M28 94 L52 66', 4, '#fff59d') + P(star(64, 36, 30, 13), 'url(#a)')),
        '✨': () => svg(g1('#fff9c4', '#ffc400'), P(star(40, 56, 34, 9, 4, 0), 'url(#a)', 4.5) + P(star(76, 22, 18, 5, 4, 0), 'url(#a)', 4) + P(star(80, 76, 13, 4, 4, 0), 'url(#a)', 3.5)),
        '🌟': () => svg(g1('#fffde7', '#ffab00') + `<radialGradient id="h"><stop offset="0.4" stop-color="#ffe57f" stop-opacity="0.7"/><stop offset="1" stop-color="#ffe57f" stop-opacity="0"/></radialGradient>`,
            `<circle cx="50" cy="52" r="48" fill="url(#h)"/>` + P(star(50, 54, 42, 18), 'url(#a)') + hi(40, 40, 8, 5)),
        '⭐': () => svg(g1('#fff59d', '#ff8f00'), P(star(50, 54, 46, 20), 'url(#a)') + hi(40, 40, 8, 5)),
        '🌌': () => svg(`<radialGradient id="a" cx="0.5" cy="0.5" r="0.6"><stop offset="0" stop-color="#e1bee7"/><stop offset="0.4" stop-color="#7c4dff"/><stop offset="1" stop-color="#1a0638"/></radialGradient>`,
            C(50, 50, 44, 'url(#a)') + L('M50 50 C60 40 76 46 76 58 M50 50 C40 60 24 54 24 42', 4, 'rgba(255,255,255,0.75)') +
            [[30, 26], [72, 30], [70, 74], [28, 72], [52, 18]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.6" fill="#fff"/>`).join('')),
        '🕊': () => bird('#ffffff', '#cfd8dc'),
        '🦅': () => bird('#ffcc80', '#6d4c41'),
        '🪶': () => svg(g1('#e0f7fa', '#26a69a'), P('M84 8 C40 14 18 46 22 84 C52 80 80 52 84 8 Z', 'url(#a)') + L('M84 8 L12 92', 4)),
        '🎐': () => svg(g1('#e1f5fe', '#4fc3f7'), LL('M50 4 V18', 3, '#cfd8dc') + P('M24 50 Q24 16 50 16 Q76 16 76 50 Z', 'url(#a)') + `<path d="M30 34 Q40 26 48 26" fill="none" stroke="#fff" stroke-width="3" opacity="0.7"/>` +
            LL('M50 50 V70', 2.5, '#cfd8dc') + P('M40 70 H60 V94 H40 Z', '#ffcdd2', 3.5)),
        '⛲': () => svg(g1('#b3e5fc', '#0277bd'), LL('M50 46 Q30 20 18 50 M50 46 Q70 20 82 50', 4, '#81d4fa') + LL('M50 60 V30', 5, '#81d4fa') + P('M8 62 H92 L82 90 H18 Z', 'url(#a)')),
        '🗿': () => svg(g1('#bdbdbd', '#616161'), P('M26 6 H74 L78 90 H22 Z', 'url(#a)') + P('M26 34 H74 V42 H26 Z', '#757575', 3) + P('M50 42 L58 66 H42 Z', '#9e9e9e', 3) + L('M36 76 H64', 4)),
        '🌳': () => svg(g1('#a5d6a7', '#2e7d32'), P('M44 62 H56 V94 H44 Z', '#795548', 4) + C(32, 50, 22, 'url(#a)') + C(68, 50, 22, 'url(#a)') + C(50, 32, 26, 'url(#a)') + hi(42, 22, 8, 5)),

        // ── 物品 ──
        '⌛': () => svg(g1('#fff59d', '#ff8f00'), P('M20 6 H80 V14 H20 Z M20 86 H80 V94 H20 Z', '#8d6e63', 4) +
            P('M26 14 H74 Q74 40 54 50 Q74 60 74 86 H26 Q26 60 46 50 Q26 40 26 14 Z', '#e1f5fe', 4.5) + P('M34 24 H66 Q62 40 50 46 Q38 40 34 24 Z M30 84 Q34 66 50 62 Q66 66 70 84 Z', 'url(#a)', 0)),
        '🧪': () => svg(g1('#ccff90', '#00c853'), `<g transform="rotate(25 50 50)">` + P('M38 6 H62 V12 H58 V80 Q58 94 50 94 Q42 94 42 80 V12 H38 Z', '#e0f7fa', 4.5) + P('M44 50 H56 V80 Q56 90 50 90 Q44 90 44 80 Z', 'url(#a)', 0) + `</g>`),
        '💰': () => svg(g1('#ffe082', '#c79100'), P('M36 22 L30 8 H70 L64 22 Z', '#a1887f', 4) + P('M36 22 H64 C90 40 94 92 50 92 C6 92 10 40 36 22 Z', 'url(#a)') + C(50, 62, 15, '#fff59d', 3.5) + L('M50 52 V72 M44 58 H56 M44 66 H56', 3)),
        '💎': () => svg(g1('#e1f5fe', '#0288d1'), P('M24 12 H76 L94 36 L50 92 L6 36 Z', 'url(#a)') + L('M6 36 H94 M24 12 L38 36 L50 92 L62 36 L76 12 M38 36 L50 12 L62 36', 2.5, 'rgba(255,255,255,0.7)')),
        '👑': () => svg(g1('#fff59d', '#ff8f00'), P('M10 76 L6 26 L30 48 L50 14 L70 48 L94 26 L90 76 Z', 'url(#a)') + P('M10 76 H90 V90 H10 Z', '#ffb300', 4.5) + C(50, 44, 6, '#e53935', 3) + C(26, 62, 4.5, '#40c4ff', 2.5) + C(74, 62, 4.5, '#40c4ff', 2.5)),
        '🏆': () => svg(g1('#fff59d', '#ff8f00'), L('M28 22 Q8 22 12 40 Q16 54 34 52 M72 22 Q92 22 88 40 Q84 54 66 52', 6, '#ffb300') +
            P('M26 8 H74 V34 C74 56 64 66 50 66 C36 66 26 56 26 34 Z', 'url(#a)') + P('M44 66 H56 V78 H44 Z', '#ffb300', 4) + P('M28 78 H72 V92 H28 Z', '#6d4c41', 4.5) + hi(38, 22, 6, 9, 0)),
        '🔒': () => svg(g1('#ffe082', '#ff8f00'), L('M30 46 V32 Q30 10 50 10 Q70 10 70 32 V46', 9) + L('M30 46 V32 Q30 10 50 10 Q70 10 70 32 V46', 4, '#b0bec5') +
            P('M16 44 H84 V92 H16 Z', 'url(#a)') + C(50, 64, 7, OUT, 0) + P('M47 64 H53 V80 H47 Z', OUT, 0)),
        '📍': () => svg(g1('#ff8a80', '#c62828'), P('M50 96 C36 74 18 58 18 38 C18 18 32 6 50 6 C68 6 82 18 82 38 C82 58 64 74 50 96 Z', 'url(#a)') + C(50, 38, 12, '#fff', 4)),
        '🩸': () => svg(g1('#ff8a80', '#b71c1c'), P('M50 6 C62 30 80 46 80 64 C80 82 66 94 50 94 C34 94 20 82 20 64 C20 46 38 30 50 6 Z', 'url(#a)') + hi(36, 62, 6, 10, 15)),
        '⚙': () => {
            let d = '';
            for (let i = 0; i < 8; i++) {
                const a = i * Math.PI / 4, p = (r, da) => `${(50 + Math.cos(a + da) * r).toFixed(1)} ${(50 + Math.sin(a + da) * r).toFixed(1)}`;
                d += `${i ? 'L' : 'M'}${p(32, -0.38)} L${p(46, -0.22)} L${p(46, 0.22)} L${p(32, 0.38)} `;
            }
            return svg(g1('#eceff1', '#546e7a'), P(d + 'Z', 'url(#a)') + C(50, 50, 13, '#263238', 4));
        },
        '⚛': () => svg('', [0, 60, -60].map(r => `<ellipse cx="50" cy="50" rx="44" ry="16" transform="rotate(${r} 50 50)" fill="none" stroke="${OUT}" stroke-width="9"/><ellipse cx="50" cy="50" rx="44" ry="16" transform="rotate(${r} 50 50)" fill="none" stroke="#4fc3f7" stroke-width="4.5"/>`).join('') + C(50, 50, 9, '#ff5252', 4)),
        '☣': () => svg(g1('#f4ff81', '#64dd17'),
            [0, 120, 240].map(r => `<g transform="rotate(${r} 50 52)">${C(50, 26, 19, 'url(#a)', 4.5)}<circle cx="50" cy="20" r="9" fill="${OUT}"/></g>`).join('') +
            `<circle cx="50" cy="52" r="20" fill="none" stroke="${OUT}" stroke-width="10"/><circle cx="50" cy="52" r="20" fill="none" stroke="#c6ff00" stroke-width="5"/>` + C(50, 52, 7, '#c6ff00', 4)),
        '⚖': () => svg(g1('#fff59d', '#ff8f00'), P('M46 14 H54 V84 H46 Z', 'url(#a)', 4) + P('M28 84 H72 V94 H28 Z', 'url(#a)', 4) + LL('M12 26 H88', 5, '#ffd54f') +
            LL('M14 28 L4 60 M14 28 L24 60 M86 28 L76 60 M86 28 L96 60', 2.2, '#ffe082') + P('M2 60 Q14 74 26 60 Z', 'url(#a)', 4) + P('M74 60 Q86 74 98 60 Z', 'url(#a)', 4) + C(50, 14, 6, '#ffd54f', 3.5)),
        '⚠': () => svg(g1('#fff59d', '#ffb300'), P('M50 6 L96 90 H4 Z', 'url(#a)') + P('M45 32 H55 L53 66 H47 Z', OUT, 0) + C(50, 77, 5.5, OUT, 0)),
        '🔁': () => arrowsCircle('#69f0ae', '#00c853'),
        '🔄': () => arrowsCircle('#80d8ff', '#0288d1'),
        '🔀': () => svg('', LL('M8 28 H34 Q50 28 58 50 Q66 72 82 72', 7, '#80d8ff') + LL('M8 72 H34 Q50 72 58 50 Q66 28 82 28', 7, '#b388ff') + P('M80 16 L96 28 L80 40 Z', '#b388ff', 4) + P('M80 60 L96 72 L80 84 Z', '#80d8ff', 4)),
        '⏩': () => svg(g1('#b9f6ca', '#00c853'), P('M8 18 L50 50 L8 82 Z', 'url(#a)') + P('M50 18 L92 50 L50 82 Z', 'url(#a)')),
        '🎮': () => svg(g1('#9575cd', '#311b92'), P('M22 28 H78 C94 28 98 52 92 72 C88 86 74 86 68 72 L62 62 H38 L32 72 C26 86 12 86 8 72 C2 52 6 28 22 28 Z', 'url(#a)') +
            P('M22 42 H30 V34 H38 V42 H46 V50 H38 V58 H30 V50 H22 Z', '#e0e0e0', 2.5) + C(68, 40, 5, '#ff5252', 2.5) + C(78, 50, 5, '#69f0ae', 2.5)),
        '🎭': () => svg(g1('#fff59d', '#ffb300') + lg('b', '#ce93d8', '#6a1b9a'),
            P('M44 20 Q70 8 94 22 Q96 64 72 78 Q50 70 44 20 Z', 'url(#b)', 4.5) + P('M6 26 Q30 12 56 26 Q58 70 32 86 Q8 72 6 26 Z', 'url(#a)', 4.5) +
            L('M18 42 Q22 38 26 42 M36 42 Q40 38 44 42 M20 60 Q31 72 42 60', 3.5) + L('M60 40 Q64 44 68 40 M76 42 Q80 46 84 42 M64 62 Q72 54 80 62', 3.5)),
        '🎨': () => svg(g1('#ffe0b2', '#d7a86e'), P('M50 6 C78 6 96 26 94 50 C92 66 76 64 70 70 C64 78 72 94 52 94 C24 94 6 74 6 50 C6 26 24 6 50 6 Z', 'url(#a)') +
            C(30, 36, 7, '#ff5252', 3) + C(52, 24, 7, '#ffeb3b', 3) + C(74, 34, 7, '#40c4ff', 3) + C(28, 62, 7, '#69f0ae', 3)),
        '👼': () => svg(g1('#ffe0b2', '#ffb74d'), `<ellipse cx="50" cy="12" rx="22" ry="6" fill="none" stroke="${OUT}" stroke-width="8"/><ellipse cx="50" cy="12" rx="22" ry="6" fill="none" stroke="#fff59d" stroke-width="4"/>` +
            P('M22 52 Q2 40 6 70 Q18 70 26 62 Z', '#ffffff', 4) + P('M78 52 Q98 40 94 70 Q82 70 74 62 Z', '#ffffff', 4) + C(50, 56, 30, 'url(#a)') +
            L('M38 56 Q42 52 46 56 M54 56 Q58 52 62 56 M42 68 Q50 74 58 68', 3.5) + `<ellipse cx="34" cy="64" rx="5" ry="3" fill="#ff8a80" opacity="0.7"/><ellipse cx="66" cy="64" rx="5" ry="3" fill="#ff8a80" opacity="0.7"/>`),
        '✝': () => svg(g1('#fff59d', '#ff8f00'), P('M42 6 H58 V30 H82 V46 H58 V94 H42 V46 H18 V30 H42 Z', 'url(#a)') + hi(48, 16, 3, 7, 0)),
        '🔊': () => svg(g1('#e1f5fe', '#4fc3f7'), P('M10 36 H28 L52 14 V86 L28 64 H10 Z', 'url(#a)') + L('M64 34 Q74 50 64 66', 6, '#fff') + L('M74 22 Q92 50 74 78', 6, '#fff')),
        '🔇': () => svg(g1('#cfd8dc', '#78909c'), P('M10 36 H28 L52 14 V86 L28 64 H10 Z', 'url(#a)') + L('M64 36 L90 64 M90 36 L64 64', 7, '#ff5252')),
        '⏸': () => svg(g1('#e1f5fe', '#4fc3f7'), P('M22 12 H42 V88 H22 Z', 'url(#a)') + P('M58 12 H78 V88 H58 Z', 'url(#a)')),
        '🕹': () => svg(g1('#78909c', '#263238'), LL('M50 62 V28', 7, '#b0bec5') + C(50, 24, 14, '#ff5252') + P('M10 64 H90 V88 H10 Z', 'url(#a)') + hi(44, 18, 5, 3)),
        '📱': () => svg(g1('#455a64', '#102027'), P('M26 4 H74 Q82 4 82 12 V88 Q82 96 74 96 H26 Q18 96 18 88 V12 Q18 4 26 4 Z', 'url(#a)') + `<rect x="26" y="14" width="48" height="64" rx="3" fill="#4fc3f7"/>` + C(50, 87, 4, '#cfd8dc', 0)),
        '👾': () => svg('', P('M26 18 H34 V26 H42 V18 H58 V26 H66 V18 H74 V34 H82 V50 H90 V74 H82 V66 H74 V82 H58 V74 H42 V82 H26 V66 H18 V74 H10 V50 H18 V34 H26 Z', '#b388ff', 4.5) +
            `<rect x="34" y="42" width="8" height="10" fill="${OUT}"/><rect x="58" y="42" width="8" height="10" fill="${OUT}"/>`),
        '🎲': () => svg(g1('#ffffff', '#cfd8dc'), P('M14 10 H86 Q92 10 92 16 V84 Q92 90 86 90 H14 Q8 90 8 84 V16 Q8 10 14 10 Z', 'url(#a)') +
            [[28, 30], [72, 30], [50, 50], [28, 70], [72, 70]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="7" fill="#e53935"/>`).join('')),
        '🎁': () => svg(g1('#ff8a80', '#c62828'), P('M10 34 H90 V52 H10 Z', 'url(#a)') + P('M16 52 H84 V92 H16 Z', 'url(#a)') + P('M44 34 H56 V92 H44 Z', '#ffd54f', 3.5) +
            P('M50 32 Q30 6 22 22 Q24 32 50 32 Z', '#ffd54f', 3.5) + P('M50 32 Q70 6 78 22 Q76 32 50 32 Z', '#ffd54f', 3.5)),
        '👆': () => svg(g1('#ffe0b2', '#ffb74d'), P('M40 54 V16 Q40 6 48 6 Q56 6 56 16 V44 Q62 40 68 44 Q74 40 80 46 Q84 46 86 52 V72 Q86 94 62 94 H52 Q34 94 26 78 L16 58 Q14 50 22 50 Q28 50 32 58 L40 70 Z', 'url(#a)', 4.5))
    };
    // 与道具/遗物图标共用同一张图
    Object.assign(S, {
        '💊': () => ArtSVG.items.potion(), '📚': () => ArtSVG.items.exp_book(), '❄': () => ArtSVG.items.snowflake(),
        '💣': () => ArtSVG.items.bomb(), '❤': () => ArtSVG.items.heart(), '🏹': () => ArtSVG.items.gear_bow(),
        '🌵': () => ArtSVG.items.gear_thorns(), '💍': () => ArtSVG.items.relic_thunder_ring(), '🧛': () => ArtSVG.items.relic_vampire_fang(),
        '⌚': () => ArtSVG.items.relic_chrono_watch(), '⏱': () => ArtSVG.items.relic_chrono_watch(), '🧥': () => ArtSVG.items.relic_reaper_cloak(),
        '🦺': () => ArtSVG.items.relic_warmog_vest(), '💀': () => S['☠'](), '⚒': () => S['🔨']()
    });
    return S;
})();

// ══════════════════════════════════════════════════════════════════
//  技能图标 / 职业徽记 / 天赋符文(viewBox 0 0 100 100)
//  · 技能图(skill_*、ult_*、cls_*):彩色插画,画在技能槽、职业卡、构筑面板里
//  · 符文(✦ ◎ ⟳ Q …):白色浮雕符号,配合 Art.badge 的彩色圆章用在天赋卡 / 天赋树节点
// ══════════════════════════════════════════════════════════════════
const IconSVG = (() => {
    const OUT = '#120d22';
    const svg = (defs, body) =>
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="128" height="128"><defs>${defs}</defs>${body}</svg>`;
    const lg = (id, c1, c2, x2 = 0.5, y2 = 1) =>
        `<linearGradient id="${id}" x1="0" y1="0" x2="${x2}" y2="${y2}"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient>`;
    const rg = (id, c1, c2, o2 = 1) =>
        `<radialGradient id="${id}" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}" stop-opacity="${o2}"/></radialGradient>`;
    const P = (d, fill, w = 5) => `<path d="${d}" fill="${fill}" stroke="${OUT}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"/>`;
    const C = (cx, cy, r, fill, w = 5) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" stroke="${OUT}" stroke-width="${w}"/>`;
    const L = (d, w, c = OUT, extra = '') => `<path d="${d}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"${extra}/>`;
    const LL = (d, w, c) => L(d, w + 5) + L(d, w, c); // 描边 + 彩色内芯
    const hi = (cx, cy, rx, ry, rot = -35) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" transform="rotate(${rot} ${cx} ${cy})" fill="#fff" opacity="0.55"/>`;
    const glow = (cx, cy, r, c, o = 0.75) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#gw)" opacity="${o}"/>`;
    const gw = c => rg('gw', c, c, 0);
    const star = (cx, cy, R, r, n = 5, rot = -Math.PI / 2) => {
        let d = '';
        for (let i = 0; i < n * 2; i++) {
            const a = rot + i * Math.PI / n, rr = i % 2 ? r : R;
            d += (i ? 'L' : 'M') + (cx + Math.cos(a) * rr).toFixed(1) + ' ' + (cy + Math.sin(a) * rr).toFixed(1);
        }
        return d + 'Z';
    };
    const rot = (deg, cx, cy, body) => `<g transform="rotate(${deg} ${cx} ${cy})">${body}</g>`;
    const at = (x, y, s, body) => `<g transform="translate(${x} ${y}) scale(${s})">${body}</g>`;
    // 剑 / 匕首 / 锤 / 箭 / 盾:竖直朝上、以 (50,50) 为中心的零件,外面再旋转摆放
    const sword = (blade = 'url(#bl)') =>
        P('M50 4 L58 16 V60 H42 V16 Z', blade, 4.5) + L('M50 14 V56', 2.5, 'rgba(255,255,255,0.7)') +
        P('M28 58 H72 V68 H28 Z', '#ffb300', 4.5) + P('M45 68 H55 V86 H45 Z', '#6d4c41', 4) + C(50, 91, 6, '#ffd54f', 4);
    const dagger = (blade = 'url(#bl)') =>
        P('M50 10 L58 26 V58 H42 V26 Z', blade, 4.5) + P('M34 58 H66 V66 H34 Z', '#7e57c2', 4) + P('M45 66 H55 V84 H45 Z', '#311b92', 4) + C(50, 88, 5, '#b388ff', 3.5);
    const hammer = (head = 'url(#hm)') =>
        P('M45 40 H55 V94 H45 Z', '#8d6e63', 4) + P('M20 14 H80 Q84 14 84 18 V40 Q84 44 80 44 H20 Q16 44 16 40 V18 Q16 14 20 14 Z', head) +
        P('M44 14 H56 V44 H44 Z', '#fff8e1', 3.5) + hi(30, 22, 7, 3, 0);
    // 任意方向的箭:箭尾 (x1,y1) → 箭头 (x2,y2),线宽不随缩放变细
    const darrow = (x1, y1, x2, y2, hs = 15) => {
        const a = Math.atan2(y2 - y1, x2 - x1), c = Math.cos(a), s = Math.sin(a);
        const f = (v) => v.toFixed(1);
        const bx = x2 - c * hs, by = y2 - s * hs;
        const t1x = x1 + c * 12, t1y = y1 + s * 12;
        return LL(`M${f(x1)} ${f(y1)} L${f(bx)} ${f(by)}`, 4, '#a1887f') +
            P(`M${x2} ${y2} L${f(bx - s * hs * 0.55)} ${f(by + c * hs * 0.55)} L${f(bx + s * hs * 0.55)} ${f(by - c * hs * 0.55)} Z`, 'url(#ah)', 3.5) +
            P(`M${f(t1x)} ${f(t1y)} L${f(x1 - s * 7)} ${f(y1 + c * 7)} L${f(x1 - c * 4)} ${f(y1 - s * 4)} L${f(x1 + s * 7)} ${f(y1 - c * 7)} Z`, '#ef5350', 3);
    };
    const SHIELD = 'M50 6 L86 18 V46 C86 72 70 86 50 94 C30 86 14 72 14 46 V18 Z';
    const shield = (fill, inner) => P(SHIELD, fill) + (inner || '') + hi(30, 26, 8, 4);
    const flame = (x, y, s, fill = 'url(#fl)') => at(x, y, s,
        P('M0 -40 C8 -22 22 -14 22 6 C22 24 12 34 0 34 C-12 34 -22 24 -22 6 C-22 -8 -12 -14 -8 -26 C-4 -16 -2 -14 0 -12 C2 -22 1 -30 0 -40 Z', fill, 6) +
        P('M0 0 C6 8 10 14 9 22 C8 28 5 30 0 30 C-5 30 -8 28 -9 22 C-10 14 -4 8 0 0 Z', '#fff59d', 4));
    const cloud = (fill = 'url(#cl)') => P('M22 52 Q8 52 8 40 Q8 28 22 28 Q24 12 42 12 Q56 12 62 24 Q66 18 74 18 Q90 18 90 34 Q96 38 96 44 Q96 52 86 52 Z', fill, 4.5);
    const wing = (flip) => `<g transform="${flip ? 'translate(100 0) scale(-1 1)' : ''}">` +
        P('M40 46 Q22 26 4 30 Q10 38 8 44 Q16 46 14 54 Q22 54 22 62 Q32 60 40 58 Z', 'url(#wg)', 4) +
        L('M36 50 Q22 40 10 38 M36 54 Q24 50 16 50', 2.5, 'rgba(120,144,156,0.7)') + `</g>`;

    const S = {
        // ════════ 技能 ════════
        // 战士 Q 旋风斩:剑 + 两道回旋刃风
        skill_whirl: () => svg(lg('bl', '#ffffff', '#90a4ae', 1, 0) + lg('a', '#ffe0b2', '#ff5722', 1, 1),
            LL('M16 46 A34 34 0 0 1 74 20', 8, 'url(#a)') + P('M66 8 L88 22 L64 32 Z', '#ff7043', 4) +
            LL('M84 54 A34 34 0 0 1 26 80', 8, 'url(#a)') + P('M34 92 L12 78 L36 68 Z', '#ff7043', 4) +
            rot(-45, 50, 50, at(50, 50, 0.78, `<g transform="translate(-50 -50)">${sword()}</g>`))),
        // 战士 E 盾击:盾 + 撞击星
        skill_bash: () => svg(lg('a', '#bbdefb', '#1565c0'),
            P(star(78, 30, 20, 9, 8), '#ffeb3b', 4) +
            at(-4, 6, 0.88, shield('url(#a)', P('M50 20 L72 28 V46 C72 62 63 72 50 78 C37 72 28 62 28 46 V28 Z', '#e3f2fd', 3.5) + L('M50 32 V68 M36 46 H64', 5)))),
        // 铁卫 E 盾冲:盾 + 速度线
        skill_charge: () => svg(lg('a', '#bbdefb', '#1565c0'),
            LL('M4 34 H30 M2 54 H24 M6 74 H30', 5, '#e3f2fd') +
            at(22, 4, 0.86, shield('url(#a)', P('M50 20 L72 28 V46 C72 62 63 72 50 78 C37 72 28 62 28 46 V28 Z', '#e3f2fd', 3.5) + P('M38 40 L58 50 L38 60 Z', '#1565c0', 3)))),
        // 法师 Q 魔力涌注:法球 + 奥术环 + 上涌光点
        skill_surge: () => svg(rg('a', '#e0f7fa', '#00838f') + gw('#4dd0e1'),
            glow(50, 54, 46, '#4dd0e1') +
            `<ellipse cx="50" cy="56" rx="42" ry="14" fill="none" stroke="${OUT}" stroke-width="9"/><ellipse cx="50" cy="56" rx="42" ry="14" fill="none" stroke="#80deea" stroke-width="4"/>` +
            C(50, 50, 24, 'url(#a)') + hi(42, 42, 8, 5) +
            `<path d="M8 56 A42 14 0 0 0 92 56" fill="none" stroke="${OUT}" stroke-width="9"/><path d="M8 56 A42 14 0 0 0 92 56" fill="none" stroke="#80deea" stroke-width="4"/>` +
            P(star(22, 22, 9, 3, 4, 0), '#e0f7fa', 3) + P(star(80, 18, 7, 2.5, 4, 0), '#e0f7fa', 3) + P(star(76, 86, 6, 2, 4, 0), '#e0f7fa', 3)),
        // 法师 E 斥力波:中心核 + 向外扩散的波纹与箭头
        skill_repulse: () => svg(rg('a', '#ffffff', '#00acc1'),
            [0, 90, 180, 270].map(d => rot(d + 45, 50, 50, LL('M30 22 A30 30 0 0 1 70 22', 6, '#b2ebf2') + LL('M22 8 A44 44 0 0 1 78 8', 5, '#4dd0e1'))).join('') +
            [0, 90, 180, 270].map(d => rot(d, 50, 50, P('M50 2 L58 14 H42 Z', '#e0f7fa', 3.5))).join('') +
            C(50, 50, 14, 'url(#a)') + hi(46, 45, 4, 3)),
        // 炎术师 E 烈焰新星:一圈火焰 + 爆裂核心
        skill_flamenova: () => svg(lg('fl', '#ffca28', '#e64a19') + rg('a', '#fffde7', '#ff6d00'),
            [0, 60, 120, 180, 240, 300].map(d => rot(d, 50, 50, flame(50, 18, 0.4))).join('') +
            P(star(50, 50, 22, 12, 10), 'url(#a)', 4)),
        // 冰霜法师 E 冰霜新星:冰晶核心 + 放射冰刺
        skill_frostnova: () => svg(lg('a', '#ffffff', '#4fc3f7', 1, 1) + rg('b', '#ffffff', '#81d4fa'),
            [0, 45, 90, 135, 180, 225, 270, 315].map((d, i) => rot(d, 50, 50, P(i % 2 ? 'M50 4 L56 18 L50 30 L44 18 Z' : 'M50 2 L58 20 L50 34 L42 20 Z', 'url(#a)', 3.5))).join('') +
            C(50, 50, 16, 'url(#b)', 4) + L('M50 38 V62 M40 44 L60 56 M60 44 L40 56', 3, '#0277bd')),
        // 刺客 Q 闪现斩:匕首 + 残影 + 斩痕
        skill_blink: () => svg(lg('bl', '#ffffff', '#b39ddb', 1, 0),
            `<g opacity="0.3">${rot(40, 50, 50, at(-30, 18, 0.8, dagger()))}</g><g opacity="0.55">${rot(40, 50, 50, at(-14, 9, 0.8, dagger()))}</g>` +
            rot(40, 50, 50, at(4, 2, 0.8, dagger())) + LL('M14 86 Q54 70 88 22', 3.5, '#e1bee7')),
        // 刺客 E 连刺:三把匕首依次刺出
        skill_stab: () => svg(lg('bl', '#ffffff', '#b39ddb', 1, 0),
            [[30, 30], [56, 44], [70, 70]].map(([cx, cy]) => rot(45, cx, cy, at(cx - 32, cy - 32, 0.64, dagger()))).join('') +
            LL('M62 6 L72 2 M84 22 L96 18 M92 46 L98 38', 3.5, '#e1bee7')),
        // 弓手 Q 穿透箭:箭贯穿两个方块
        skill_pierce: () => svg(lg('ah', '#f1f8e9', '#7cb342') + lg('b', '#ff8a80', '#c62828'),
            P('M26 34 H44 V66 H26 Z', 'url(#b)', 4) + P('M58 30 H78 V70 H58 Z', 'url(#b)', 4) +
            L('M28 48 L36 54 L32 60 M62 42 L70 50 L64 58', 2.5, '#4e0000') +
            darrow(4, 50, 96, 50, 18)),
        // 神射手 Q 狙击:准星 + 斜穿的箭
        skill_snipe: () => svg(lg('ah', '#f1f8e9', '#7cb342'),
            `<circle cx="50" cy="50" r="34" fill="none" stroke="${OUT}" stroke-width="10"/><circle cx="50" cy="50" r="34" fill="none" stroke="#ff5252" stroke-width="5"/>` +
            LL('M50 4 V24 M50 76 V96 M4 50 H24 M76 50 H96', 4, '#ff5252') + C(50, 50, 6, '#ff1744', 3.5) +
            darrow(12, 88, 82, 18, 18)),
        // 弓手 E 箭雨:多支箭斜落
        skill_rain: () => svg(lg('ah', '#f1f8e9', '#7cb342'),
            [[30, 4, 16, 50], [62, 2, 48, 48], [90, 16, 76, 62], [42, 46, 28, 92], [74, 52, 60, 96]].map(([a, b, c, d]) => darrow(a, b, c, d, 15)).join('')),
        // 圣骑士 Q 圣光打击:金锤 + 光芒
        skill_holystrike: () => svg(lg('hm', '#fff8e1', '#ffb300') + rg('a', '#fffde7', '#ffd54f', 0),
            `<circle cx="34" cy="32" r="32" fill="url(#a)"/>` + P(star(34, 32, 28, 9, 8), '#fff59d', 3) +
            rot(-40, 54, 54, at(54 - 37, 54 - 37, 0.74, hammer()))),
        // 审判者 Q 审判之锤:重锤砸地 + 冲击波 + 眩晕星
        skill_judge: () => svg(lg('hm', '#fff8e1', '#ff8f00') + lg('a', '#fff59d', '#ffb300'),
            LL('M30 94 Q66 78 98 92', 5, '#ffe082') + LL('M54 76 L44 66 M90 74 L98 64', 4, '#ffe082') +
            rot(140, 46, 46, at(46 - 36, 46 - 36, 0.72, hammer())) +
            P(star(14, 26, 10, 4), 'url(#a)', 3) + P(star(86, 30, 9, 3.5), 'url(#a)', 3) + P(star(80, 8, 6, 2.5), 'url(#a)', 2.5)),
        // 圣骑士 E 神圣光环:光环 + 十字
        skill_aura: () => svg(lg('a', '#fff8e1', '#ffb300') + gw('#ffe082'),
            glow(50, 52, 46, '#ffe082', 0.8) +
            `<ellipse cx="50" cy="66" rx="42" ry="16" fill="none" stroke="${OUT}" stroke-width="11"/><ellipse cx="50" cy="66" rx="42" ry="16" fill="none" stroke="#ffd54f" stroke-width="6"/>` +
            P('M42 10 H58 V30 H76 V46 H58 V76 H42 V46 H24 V30 H42 Z', 'url(#a)') + hi(48, 18, 3, 6, 0)),
        // 守护者 E 守护光环:光环中的盾
        skill_guard: () => svg(lg('a', '#fff8e1', '#ffb300') + gw('#ffe082'),
            glow(50, 50, 48, '#ffe082', 0.8) +
            `<circle cx="50" cy="52" r="42" fill="none" stroke="${OUT}" stroke-width="10"/><circle cx="50" cy="52" r="42" fill="none" stroke="#ffd54f" stroke-width="5" stroke-dasharray="14 8"/>` +
            at(20, 20, 0.6, shield('url(#a)', P('M42 30 H58 V44 H72 V58 H58 V80 H42 V58 H28 V44 H42 Z', '#fffde7', 3.5)))),

        // ════════ 觉醒奥义 ════════
        // 战士 诸神黄昏:燃烧巨剑下劈
        ult_warrior: () => svg(lg('fl', '#ffca28', '#e64a19') + lg('bl', '#fff3e0', '#ff7043', 1, 0),
            flame(24, 62, 0.62) + flame(76, 62, 0.62) + flame(50, 54, 0.82) +
            rot(180, 50, 50, at(12, 8, 0.76, sword())) + LL('M10 92 L30 84 L44 94 L56 84 L70 94 L90 86', 4, '#ffab40')),
        // 法师 时空坍缩:黑洞 + 吸积盘
        ult_mage: () => {
            let d = 'M50 50';
            for (let t = 0; t <= 3.6 * Math.PI; t += 0.25) d += ` L${(50 + Math.cos(t) * (4 + t * 3.4)).toFixed(1)} ${(50 + Math.sin(t) * (4 + t * 3.4) * 0.55).toFixed(1)}`;
            return svg(lg('a', '#ea80fc', '#651fff', 1, 1) + rg('b', '#000000', '#4a148c'),
                `<ellipse cx="50" cy="50" rx="46" ry="22" fill="none" stroke="${OUT}" stroke-width="12"/><ellipse cx="50" cy="50" rx="46" ry="22" fill="none" stroke="url(#a)" stroke-width="7"/>` +
                C(50, 50, 18, 'url(#b)', 4) + L(d, 3, '#ea80fc', ' opacity="0.9"') +
                P(star(16, 16, 8, 3, 4, 0), '#fff', 2.5) + P(star(86, 82, 7, 2.5, 4, 0), '#fff', 2.5) + P(star(84, 14, 5, 2, 4, 0), '#fff', 2));
        },
        // 刺客 万刃影杀:六把匕首环刺中心
        ult_assassin: () => svg(lg('bl', '#ffffff', '#b39ddb', 1, 0) + rg('a', '#ea80fc', '#4a148c'),
            C(50, 50, 13, 'url(#a)', 4) +
            [0, 60, 120, 180, 240, 300].map(d => rot(d, 50, 50, at(50 - 25, 24 - 25, 0.5, rot(180, 50, 50, dagger())))).join('')),
        // 弓手 箭雨风暴:雷云 + 闪电 + 落箭
        ult_archer: () => svg(lg('cl', '#90a4ae', '#37474f') + lg('ah', '#f1f8e9', '#7cb342') + lg('z', '#fff9c4', '#ffb300'),
            [[22, 50, 14, 94], [80, 50, 72, 94], [40, 58, 34, 96]].map(([a, b, c, d]) => darrow(a, b, c, d, 13)).join('') +
            cloud() + P('M58 46 L46 66 H56 L48 86 L70 60 H60 L68 46 Z', 'url(#z)', 3.5)),
        // 圣骑士 圣光降临:光柱 + 双翼
        ult_paladin: () => svg(lg('wg', '#ffffff', '#cfd8dc') + lg('a', '#fffde7', '#ffd54f', 0, 1) + lg('b', '#fff8e1', '#ffb300'),
            `<rect x="40" y="0" width="20" height="100" fill="url(#a)" opacity="0.85"/>` +
            wing(false) + wing(true) +
            P('M44 30 H56 V44 H68 V56 H56 V82 H44 V56 H32 V44 H44 Z', 'url(#b)', 4) +
            `<ellipse cx="50" cy="14" rx="16" ry="5" fill="none" stroke="${OUT}" stroke-width="7"/><ellipse cx="50" cy="14" rx="16" ry="5" fill="none" stroke="#fff59d" stroke-width="3"/>`),

        // ════════ 职业徽记 ════════
        cls_warrior: () => svg(lg('bl', '#ffffff', '#90a4ae', 1, 0) + lg('a', '#ff8a65', '#bf360c'),
            rot(-40, 50, 50, at(5, 0, 0.9, sword())) + rot(40, 50, 50, at(5, 0, 0.9, sword())) +
            at(29, 40, 0.42, shield('url(#a)', L('M50 26 V74 M32 46 H68', 6, '#ffccbc')))),
        cls_mage: () => svg(rg('a', '#e0f7fa', '#00838f') + gw('#4dd0e1'),
            LL('M30 94 L62 34', 7, '#8d6e63') + P('M56 40 Q46 30 52 16 L60 28 L68 14 Q78 30 68 42 Z', '#ffb300', 4) +
            glow(64, 26, 30, '#4dd0e1') + C(64, 24, 14, 'url(#a)', 4) + hi(60, 20, 4, 3) +
            P(star(22, 30, 9, 3, 4, 0), '#e0f7fa', 3) + P(star(84, 62, 7, 2.5, 4, 0), '#e0f7fa', 3)),
        cls_assassin: () => svg(lg('bl', '#ffffff', '#b39ddb', 1, 0) + lg('a', '#fff9c4', '#ffb300'),
            P('M58 6 A42 42 0 1 0 94 62 A32 32 0 1 1 58 6 Z', 'url(#a)', 4.5) +
            rot(35, 50, 50, at(8, 6, 0.86, dagger()))),
        cls_archer: () => svg(lg('ah', '#f1f8e9', '#7cb342') + lg('b', '#a1887f', '#4e342e'),
            P('M26 6 Q92 50 26 94 Q74 50 26 6 Z', 'url(#b)', 4.5) + L('M26 8 L26 92', 2.5, '#eceff1') +
            darrow(10, 50, 94, 50, 18)),
        cls_paladin: () => svg(lg('a', '#fff8e1', '#ffb300') + lg('hm', '#eceff1', '#78909c'),
            rot(-30, 50, 50, at(20, -4, 0.75, hammer())) +
            at(18, 22, 0.64, shield('url(#a)', P('M42 24 H58 V42 H74 V58 H58 V82 H42 V58 H26 V42 H42 Z', '#fffde7', 3.5))))
    };

    // ════════ 天赋符文:白色浮雕符号(放在 Art.badge 的彩色圆章里) ════════
    const RW = lg('rw', '#ffffff', '#cfdbe6');
    const rs = body => svg(RW, body);
    const F = 'url(#rw)';
    const p = (d, w = 5) => P(d, F, w);
    const ln = (d, w) => L(d, w + 5) + L(d, w, '#ffffff');
    const ring = (cx, cy, r, w) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${OUT}" stroke-width="${w + 5}"/><circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#ffffff" stroke-width="${w}"/>`;
    const txt = ch => `<text x="50" y="76" text-anchor="middle" font-family="Arial Black, Arial, Helvetica, sans-serif" font-weight="900" font-size="72" fill="#ffffff" stroke="${OUT}" stroke-width="8" stroke-linejoin="round" paint-order="stroke">${ch}</text>`;
    const arw = (x1, y1, x2, y2, w = 6, hs = 16) => {
        const a = Math.atan2(y2 - y1, x2 - x1), c = Math.cos(a), s = Math.sin(a);
        const bx = x2 - c * hs, by = y2 - s * hs;
        return ln(`M${x1} ${y1} L${bx.toFixed(1)} ${by.toFixed(1)}`, w) +
            p(`M${x2} ${y2} L${(bx - s * hs * 0.6).toFixed(1)} ${(by + c * hs * 0.6).toFixed(1)} L${(bx + s * hs * 0.6).toFixed(1)} ${(by - c * hs * 0.6).toFixed(1)} Z`, 4);
    };
    const R = {
        '✦': () => rs(p(star(50, 50, 44, 11, 4))),
        '★': () => rs(p(star(50, 54, 46, 19))),
        '✸': () => rs(p(star(50, 50, 46, 19, 8))),
        '✷': () => rs(p(star(50, 50, 46, 11, 8, -Math.PI / 2 + Math.PI / 8))),
        '✺': () => rs(p(star(50, 50, 46, 27, 12)) + C(50, 50, 13, '#90caf9', 4)),
        '◆': () => rs(p('M50 6 L90 50 L50 94 L10 50 Z') + `<path d="M50 6 L50 94 M10 50 H90" stroke="#90a4ae" stroke-width="2.5"/>` + L('M50 6 L90 50 L50 94 L10 50 Z', 5)),
        '◈': () => rs(p('M24 18 H76 L94 40 L50 92 L6 40 Z') + L('M6 40 H94 M24 18 L38 40 L50 92 L62 40 L76 18 M38 40 L50 18 L62 40', 3)),
        '✚': () => rs(p('M38 8 H62 V38 H92 V62 H62 V92 H38 V62 H8 V38 H38 Z')),
        '✟': () => rs(p('M42 6 H58 V28 H80 V44 H58 V94 H42 V44 H20 V28 H42 Z')),
        '✜': () => rs(p('M50 8 C60 30 82 44 82 64 A32 32 0 0 1 18 64 C18 44 40 30 50 8 Z') + L('M50 52 V80 M36 66 H64', 6)),
        '❣': () => rs(p('M50 54 C26 38 10 26 18 12 C24 2 40 4 50 18 C60 4 76 2 82 12 C90 26 74 38 50 54 Z') + p('M50 66 C56 76 60 82 60 88 A10 10 0 0 1 40 88 C40 82 44 76 50 66 Z', 4)),
        '✕': () => rs(ln('M20 20 L80 80 M80 20 L20 80', 13)),
        '◎': () => rs(ring(50, 50, 36, 9) + C(50, 50, 13, F)),
        '◉': () => rs(p('M4 50 Q50 6 96 50 Q50 94 4 50 Z') + C(50, 50, 18, '#37474f', 4) + C(56, 44, 5, '#ffffff', 0)),
        '◐': () => rs(C(50, 50, 40, F) + `<path d="M50 10 A40 40 0 0 0 50 90 Z" fill="${OUT}"/>` + `<circle cx="50" cy="50" r="40" fill="none" stroke="${OUT}" stroke-width="5"/>`),
        '◌': () => rs([0, 1, 2, 3, 4, 5, 6, 7].map(i => C(50 + Math.cos(i * Math.PI / 4) * 36, 50 + Math.sin(i * Math.PI / 4) * 36, i % 2 ? 7 : 9, F, 4)).join('') +
            ln('M50 50 m-12 0 a12 12 0 1 1 12 12', 5)),
        '◫': () => rs(p('M10 92 V34 H22 V18 H38 V34 H44 V18 H56 V34 H62 V18 H78 V34 H90 V92 Z') + P('M40 92 V70 A10 10 0 0 1 60 70 V92 Z', '#455a64', 4)),
        '⛨': () => rs(p(SHIELD) + L('M50 24 V78 M30 44 H70', 7)),
        '⛊': () => rs(p(SHIELD) + `<path d="M50 6 V94 C70 86 86 72 86 46 V18 Z" fill="${OUT}" opacity="0.85"/>` + L(SHIELD, 5)),
        '⧗': () => rs(p('M20 8 H80 V18 L58 50 L80 82 V92 H20 V82 L42 50 L20 18 Z') + P('M30 82 L50 64 L70 82 Z', '#ffcc80', 3) + P('M34 22 H66 L50 42 Z', '#ffcc80', 3)),
        '♛': () => rs(p('M8 32 L28 58 L40 18 L50 48 L60 18 L72 58 L92 32 L82 82 H18 Z') + L('M20 72 H80', 4) + C(50, 10, 6, F, 4)),
        '↔': () => rs(arw(50, 50, 94, 50, 8, 22) + arw(50, 50, 6, 50, 8, 22)),
        '➤': () => rs(p('M10 16 L92 50 L10 84 L28 50 Z')),
        '➝': () => rs(ring(80, 50, 14, 5) + arw(6, 50, 84, 50, 8, 22)),
        '⟶': () => rs(ln('M28 8 Q76 50 28 92', 8) + L('M28 10 V90', 3, '#cfd8dc') + arw(12, 50, 94, 50, 6, 20)),
        '➳': () => rs(arw(10, 64, 90, 22, 6, 20) + arw(10, 92, 90, 50, 6, 20) + L('M10 64 L20 52 M10 92 L20 80', 4)),
        '➹': () => rs(arw(16, 84, 88, 12, 7, 24) + ln('M8 60 L30 38 M36 92 L58 70', 4)),
        '⇶': () => rs(arw(8, 22, 92, 22, 6, 18) + arw(8, 50, 92, 50, 6, 18) + arw(8, 78, 92, 78, 6, 18)),
        '✂': () => rs(arw(50, 92, 50, 8, 6, 18) + arw(46, 92, 10, 22, 6, 18) + arw(54, 92, 90, 22, 6, 18)),
        '⫷': () => rs(ln('M48 14 L18 50 L48 86', 8) + ln('M68 14 L38 50 L68 86', 8) + ln('M88 14 L58 50 L88 86', 8)),
        '⟳': () => rs(ln('M74 30 A32 32 0 1 0 82 56', 9) + p('M60 30 L88 14 L86 44 Z', 4)),
        '〜': () => rs(ln('M8 58 Q22 28 36 50 T64 50 T92 42', 9) + ln('M8 82 Q22 60 36 76 T64 76 T92 68', 5)),
        '❅': () => rs(ln('M50 8 V92 M14 29 L86 71 M86 29 L14 71', 7) +
            [0, 60, 120, 180, 240, 300].map(d => rot(d, 50, 50, ln('M40 14 L50 24 L60 14', 4))).join('') + C(50, 50, 8, F, 4)),
        'Q': () => rs(txt('Q')),
        'E': () => rs(txt('E')),
        'A': () => rs(txt('A'))
    };
    return Object.assign(S, R);
})();

// ── 统一图标入口:emoji / 技能图 / 天赋符文都按同一个 key 取 ──
Object.assign(Art, {
    _urls: new Map(),
    svgOf(k) {
        if (!k) return null;
        const e = String(k).replace(/️/g, '');
        return (typeof EmojiSVG !== 'undefined' && EmojiSVG[e]) || IconSVG[e] || null;
    },
    has(k) { return !!this.svgOf(k); },
    _hex(c) {
        if (/^#[0-9a-f]{6}$/i.test(c)) return c;
        if (/^#[0-9a-f]{3}$/i.test(c)) return '#' + c.slice(1).split('').map(h => h + h).join('');
        return '#4fc3f7';
    },
    // 彩色圆章:外圈金属边(主色渐变)+ 深色内盘 + 中间的符号/图标
    badgeSVG(k, color) {
        const make = this.svgOf(k);
        const inner = make ? make().replace(/<svg([^>]*?)\swidth="[^"]*"\s+height="[^"]*"/, '<svg$1 x="21" y="21" width="58" height="58"') : '';
        const c = this._hex(color);
        const lt = this.mix(c, 'white', 0.5), dk = this.mix(c, 'black', 0.5);
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="160" height="160"><defs>` +
            `<linearGradient id="bdgR" x1="0" y1="0" x2="0.35" y2="1"><stop offset="0" stop-color="${lt}"/><stop offset="0.45" stop-color="${c}"/><stop offset="1" stop-color="${dk}"/></linearGradient>` +
            `<radialGradient id="bdgD" cx="0.5" cy="0.35" r="0.7"><stop offset="0" stop-color="${this.mix(c, 'black', 0.35)}"/><stop offset="1" stop-color="${this.mix(c, 'black', 0.78)}"/></radialGradient></defs>` +
            `<circle cx="50" cy="50" r="46" fill="url(#bdgR)" stroke="#120d22" stroke-width="4"/>` +
            `<circle cx="50" cy="50" r="36" fill="url(#bdgD)" stroke="#120d22" stroke-width="3"/>` +
            `<circle cx="50" cy="51.5" r="37.5" fill="none" stroke="${lt}" stroke-opacity="0.45" stroke-width="1.5"/>` +
            inner +
            `<path d="M18 40 A33 33 0 0 1 82 40 Q50 30 18 40 Z" fill="#ffffff" opacity="0.16"/></svg>`;
    },
    // 图标原样画在 (cx, cy),size 为边长(逻辑像素);未就绪返回 false,调用方用原来的文字画法
    pic(ctx, k, cx, cy, size) {
        const make = this.svgOf(k);
        if (!make) return false;
        const key = String(k).replace(/️/g, '');
        const img = this.get('ic|' + key, make);
        if (!img) return false;
        const sz = Math.max(4, Math.round(size));
        const spr = SpriteCache.get(`art|ic|${key}|${sz}`, sz, sz, 1, g => g.drawImage(img, 0, 0, sz, sz));
        this._blit(ctx, spr, cx - sz / 2, cy - sz / 2, sz);
        return true;
    },
    // 圆章画在 (cx, cy);glow 为主色外发光(CSS px)
    badge(ctx, k, color, cx, cy, size, glow = 0) {
        if (!this.svgOf(k)) return false;
        const key = String(k).replace(/️/g, '') + '|' + color;
        const img = this.get('bdg|' + key, () => this.badgeSVG(k, color));
        if (!img) return false;
        const sz = Math.max(6, Math.round(size));
        const pad = glow ? SpriteCache.padFor(glow) : 1;
        const spr = SpriteCache.get(`art|bdg|${key}|${sz}|${glow}`, sz, sz, pad, g => {
            if (glow) { g.shadowBlur = SpriteCache.blur(glow); g.shadowColor = this._hex(color); }
            g.drawImage(img, 0, 0, sz, sz);
        });
        this._blit(ctx, spr, cx - sz / 2, cy - sz / 2, sz);
        return true;
    },
    // 精灵自带光晕,画的时候关掉画布当前的 shadowBlur(否则会再叠一层逐帧模糊)
    _blit(ctx, spr, x, y, sz) {
        const sb = ctx.shadowBlur;
        if (sb) ctx.shadowBlur = 0;
        SpriteCache.draw(ctx, spr, x, y, sz, sz);
        if (sb) ctx.shadowBlur = sb;
    },
    // 网页里用的 data URL(<img src> / SVG <image href>)
    url(k) {
        const make = this.svgOf(k);
        if (!make) return '';
        let u = this._urls.get(k);
        if (!u) { u = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(make()); this._urls.set(k, u); }
        return u;
    },
    badgeURL(k, color) {
        if (!this.svgOf(k)) return '';
        const key = 'bdg|' + k + '|' + color;
        let u = this._urls.get(key);
        if (!u) { u = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(this.badgeSVG(k, color)); this._urls.set(key, u); }
        return u;
    }
});

const EmojiArt = {
    // emoji 后面可能跟 FE0F(彩色呈现选择符),一并吃掉
    re: null,
    urls: new Map(),
    _cache: new Map(),
    regex() {
        if (!this.re) {
            const keys = Object.keys(EmojiSVG).sort((a, b) => b.length - a.length)
                .map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
            this.re = new RegExp(`(${keys.join('|')})\\uFE0F?`, 'gu');
        }
        return this.re;
    },
    // 文字拆成 [文字 | emoji] 段;不含已知 emoji 返回 null(结果按字符串缓存,文字逐帧重复)
    split(text) {
        let r = this._cache.get(text);
        if (r !== undefined) return r;
        const re = this.regex();
        re.lastIndex = 0;
        const segs = [];
        let last = 0, m;
        while ((m = re.exec(text))) {
            if (m.index > last) segs.push({ t: text.slice(last, m.index) });
            segs.push({ e: m[1] });
            last = m.index + m[0].length;
        }
        r = segs.length ? (last < text.length && segs.push({ t: text.slice(last) }), segs) : null;
        if (this._cache.size > 3000) this._cache.clear();
        this._cache.set(text, r);
        return r;
    },
    url(e) {
        let u = this.urls.get(e);
        if (!u) { u = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(EmojiSVG[e]()); this.urls.set(e, u); }
        return u;
    },

    // 主画布:fillText 里的 emoji 画成图标(图标未解码完的那几帧照常画 emoji)
    patchCanvas(ctx) {
        if (!Art.enabled || ctx._emojiPatched) return;
        ctx._emojiPatched = true;
        const fill = ctx.fillText.bind(ctx), measure = ctx.measureText.bind(ctx);
        const quick = /[\u2300-\u27BF\u2B50\uD83C-\uD83E]/;
        ctx.fillText = (text, x, y, maxWidth) => {
            const s = typeof text === 'string' ? text : String(text);
            const segs = quick.test(s) ? this.split(s) : null;
            if (!segs || maxWidth !== undefined) return fill(text, x, y, maxWidth);
            const m = /(\d+(?:\.\d+)?)px/.exec(ctx.font);
            const px = m ? parseFloat(m[1]) : 12;
            const gw = px * 1.12; // 图标宽度(含一点字距)
            let total = 0;
            for (const sg of segs) total += sg.e ? gw : measure(sg.t).width;
            const align = ctx.textAlign;
            let cx = align === 'center' ? x - total / 2 : (align === 'right' || align === 'end') ? x - total : x;
            const base = ctx.textBaseline;
            const top = base === 'middle' ? y - px / 2 : (base === 'top' || base === 'hanging') ? y : (base === 'bottom' || base === 'ideographic') ? y - px : y - px * 0.82;
            const shadow = ctx.shadowBlur;
            ctx.textAlign = 'left';
            for (const sg of segs) {
                if (sg.t) { fill(sg.t, cx, y); cx += measure(sg.t).width; continue; }
                const img = Art.get('emoji|' + sg.e, EmojiSVG[sg.e]);
                if (img) {
                    const sz = Math.max(4, Math.round(px));
                    const spr = SpriteCache.get(`emoji|${sg.e}|${sz}`, sz, sz, 1, g => g.drawImage(img, 0, 0, sz, sz));
                    ctx.shadowBlur = 0;
                    SpriteCache.draw(ctx, spr, cx + (gw - px) / 2, top, px, px);
                    ctx.shadowBlur = shadow;
                } else fill(sg.e, cx, y);
                cx += gw;
            }
            ctx.textAlign = align;
        };
        // 量宽度时 emoji 也按图标宽度算,和实际画出来的一致(排版换行用)
        ctx.measureText = (text) => {
            const s = typeof text === 'string' ? text : String(text);
            const segs = quick.test(s) ? this.split(s) : null;
            if (!segs) return measure(text);
            const m = /(\d+(?:\.\d+)?)px/.exec(ctx.font);
            const px = m ? parseFloat(m[1]) : 12;
            const r = measure(segs.map(sg => sg.t || '').join(''));
            let w = 0;
            for (const sg of segs) w += sg.e ? px * 1.12 : measure(sg.t).width;
            return { width: w, actualBoundingBoxAscent: r.actualBoundingBoxAscent, actualBoundingBoxDescent: r.actualBoundingBoxDescent };
        };
    },

    // 网页:把文字节点里的 emoji 换成 <img class="emo">;之后动态插入的内容由 MutationObserver 接着换
    patchDom(root) {
        if (!Art.enabled || typeof document === 'undefined' || !root) return;
        const SKIP = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, INPUT: 1, OPTION: 1, TITLE: 1, CANVAS: 1 };
        const fixText = node => {
            const p = node.parentNode;
            if (!p || SKIP[p.nodeName]) return;
            const segs = this.split(node.nodeValue);
            if (!segs) return;
            const frag = document.createDocumentFragment();
            for (const sg of segs) {
                if (sg.t) { frag.appendChild(document.createTextNode(sg.t)); continue; }
                const img = document.createElement('img');
                img.className = 'emo';
                img.alt = sg.e;
                img.draggable = false;
                img.src = this.url(sg.e);
                frag.appendChild(img);
            }
            p.replaceChild(frag, node);
        };
        const walk = el => {
            if (el.nodeType === 3) { fixText(el); return; }
            if (el.nodeType !== 1 || SKIP[el.nodeName]) return;
            const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
            const list = [];
            while (tw.nextNode()) list.push(tw.currentNode);
            list.forEach(fixText);
        };
        walk(root);
        if (typeof MutationObserver !== 'undefined') {
            new MutationObserver(muts => {
                for (const m of muts) {
                    if (m.type === 'characterData') fixText(m.target);
                    else m.addedNodes.forEach(walk);
                }
            }).observe(root, { childList: true, subtree: true, characterData: true });
        }
    }
};

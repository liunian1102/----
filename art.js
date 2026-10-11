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

    return { enemies, player, boss };
})();

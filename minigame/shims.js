// ══════════════════════════════════════════════════════════════════
//  微信小游戏运行时垫片
//  把 game.js / art.js 依赖的浏览器 API 映射到 wx.*
//
//  ⚠ 关键:微信小游戏运行时**预置了残缺的 document / navigator 等全局**,
//  直接赋值 GameGlobal.x 会被它遮蔽。所以这里只负责"造出环境对象",
//  由 tools/build-minigame.js 在打包时调用,把返回的环境对象注入成模块作用域变量
// ══════════════════════════════════════════════════════════════════

function createMiniGameEnv() {
    if (typeof wx === 'undefined') return null;
    const G = typeof GameGlobal !== 'undefined' ? GameGlobal : globalThis;
    const info = wx.getSystemInfoSync();
    let winW = info.windowWidth;
    let winH = info.windowHeight;
    const dpr = Math.min(info.pixelRatio || 2, 2);

    // ── 上屏画布:小游戏第一次 createCanvas() 即屏幕画布 ──
    const screenCanvas = wx.createCanvas();
    screenCanvas.width = Math.round(winW * dpr);
    screenCanvas.height = Math.round(winH * dpr);
    const screenCtx = screenCanvas.getContext('2d');

    // 小游戏不保证暴露 CanvasRenderingContext2D 构造器,而 game.js 要 patch 它的
    // prototype 做 shadowBlur 的 dpr 补偿;用真实 ctx 的原型兜底。
    let CtxCtor = typeof G.CanvasRenderingContext2D === 'undefined' ? null : G.CanvasRenderingContext2D;
    if (!CtxCtor || !CtxCtor.prototype) {
        CtxCtor = function CanvasRenderingContext2D() {};
        try { CtxCtor.prototype = Object.getPrototypeOf(screenCtx) || Object.create(null); } catch (e) { /* 忽略 */ }
    }

    // ── 事件注册表 ──
    const winListeners = {};
    const emitWin = (type, ev) => {
        const list = winListeners[type];
        if (!list) return;
        for (const fn of list) {
            try { fn(ev); } catch (err) { console.error('[shim] window ' + type, err); }
        }
    };

    // ── 假 DOM 元素 ──
    const elements = new Map();
    function makeEl(id, tag) {
        const el = {
            id: id || '',
            tagName: (tag || 'div').toUpperCase(),
            nodeName: (tag || 'div').toUpperCase(),
            style: {},
            dataset: {},
            children: [],
            childNodes: [],
            value: '',
            textContent: '',
            innerHTML: '',
            className: '',
            width: 0,
            height: 0,
            classList: {
                _s: new Set(),
                add(...c) { c.forEach(x => this._s.add(x)); },
                remove(...c) { c.forEach(x => this._s.delete(x)); },
                toggle(c, v) { const on = v === undefined ? !this._s.has(c) : !!v; if (on) this._s.add(c); else this._s.delete(c); return on; },
                contains(c) { return this._s.has(c); }
            },
            addEventListener() {},
            removeEventListener() {},
            dispatchEvent() { return true; },
            appendChild(c) { this.children.push(c); return c; },
            removeChild(c) { this.children = this.children.filter(x => x !== c); return c; },
            insertBefore(c) { this.children.push(c); return c; },
            remove() {},
            querySelector() { return null; },
            querySelectorAll() { return []; },
            getContext() { return null; },
            getBoundingClientRect() {
                return { left: 0, top: 0, right: winW, bottom: winH, width: winW, height: winH };
            },
            setAttribute() {}, getAttribute() { return null; },
            focus() {}, blur() {}, select() {}, click() {},
            scrollIntoView() {}, closest() { return null; },
            getElementsByTagName() { return []; },
            getElementsByClassName() { return []; }
        };
        if (id) elements.set(id, el);
        return el;
    }

    const canvasListeners = {};
    const emitCanvas = (type, ev) => {
        const list = canvasListeners[type];
        if (!list) return;
        for (const fn of list) {
            try { fn(ev); } catch (err) { console.error('[shim] canvas ' + type, err); }
        }
    };

    // 主画布元素:width/height 代理到真实上屏画布
    const fakeCanvasEl = makeEl('gameCanvas', 'canvas');
    Object.defineProperty(fakeCanvasEl, 'width', { get: () => screenCanvas.width, set: v => { screenCanvas.width = v; } });
    Object.defineProperty(fakeCanvasEl, 'height', { get: () => screenCanvas.height, set: v => { screenCanvas.height = v; } });
    fakeCanvasEl.getContext = () => screenCtx;
    fakeCanvasEl.addEventListener = (type, fn) => { (canvasListeners[type] = canvasListeners[type] || []).push(fn); };
    fakeCanvasEl.removeEventListener = () => {};
    fakeCanvasEl.getBoundingClientRect = () => ({ left: 0, top: 0, right: winW, bottom: winH, width: winW, height: winH });

    // ── 触摸事件 ──
    const toTouch = t => ({
        clientX: t.clientX, clientY: t.clientY,
        pageX: t.pageX !== undefined ? t.pageX : t.clientX,
        pageY: t.pageY !== undefined ? t.pageY : t.clientY,
        identifier: t.identifier !== undefined ? t.identifier : 0,
        target: fakeCanvasEl
    });
    function makeTouchEvent(type, e) {
        const touches = (e.touches || []).map(toTouch);
        const changed = (e.changedTouches || []).map(toTouch);
        return { type, touches, changedTouches: changed, targetTouches: touches, preventDefault() {}, stopPropagation() {} };
    }
    const dispatchTouch = (type, e) => {
        const ev = makeTouchEvent(type, e);
        if (type === 'touchstart') resumeAudio();
        emitCanvas(type, ev);
        emitWin(type, ev);
    };
    wx.onTouchStart(e => dispatchTouch('touchstart', e));
    wx.onTouchMove(e => dispatchTouch('touchmove', e));
    wx.onTouchEnd(e => dispatchTouch('touchend', e));
    wx.onTouchCancel(e => dispatchTouch('touchcancel', e));

    // ── document(优先增强运行时预置的那个对象) ──
    const fakeBody = makeEl('body', 'body');
    const fakeDocEl = makeEl('html', 'html');
    Object.defineProperty(fakeDocEl, 'clientWidth', { get: () => winW });
    Object.defineProperty(fakeDocEl, 'clientHeight', { get: () => winH });

    const documentStub = {
        getElementById: id => elements.get(id) || makeEl(id),
        createElement: tag => {
            if (String(tag).toLowerCase() === 'canvas') {
                const c = wx.createCanvas();
                try { c.style = {}; c.getBoundingClientRect = () => ({ left: 0, top: 0, right: 0, bottom: 0, width: c.width, height: c.height }); } catch (e) { /* 原生对象可能不可扩展 */ }
                return c;
            }
            return makeEl('', tag);
        },
        createElementNS: (ns, tag) => documentStub.createElement(tag),
        createTextNode: t => ({ textContent: t }),
        addEventListener: (type, fn) => { (winListeners[type] = winListeners[type] || []).push(fn); },
        removeEventListener() {},
        querySelector: () => null,
        querySelectorAll: () => [],
        getElementsByClassName: () => [],
        getElementsByTagName: () => [],
        body: fakeBody,
        documentElement: fakeDocEl,
        head: makeEl('head', 'head'),
        title: '方块快跑',
        hidden: false,
        visibilityState: 'visible',
        hasFocus: () => true
    };

    // 运行时预置的 document 如果存在,优先把垫片方法灌进去(保持其内部引用一致)
    let finalDoc = documentStub;
    const presetDoc = G.document;
    if (presetDoc && presetDoc !== documentStub) {
        try {
            for (const k in documentStub) {
                try { presetDoc[k] = documentStub[k]; } catch (e) { /* 只读成员跳过 */ }
            }
        } catch (e) { /* 忽略 */ }
        if (typeof presetDoc.getElementById === 'function') finalDoc = presetDoc;
    }

    // ── localStorage → wx 同步存储 ──
    const storage = {
        getItem(k) {
            try { const v = wx.getStorageSync(k); return v === '' || v === undefined || v === null ? null : String(v); } catch (e) { return null; }
        },
        setItem(k, v) { try { wx.setStorageSync(k, String(v)); } catch (e) { /* 忽略 */ } },
        removeItem(k) { try { wx.removeStorageSync(k); } catch (e) { /* 忽略 */ } },
        clear() { try { wx.clearStorageSync(); } catch (e) { /* 忽略 */ } }
    };

    // ── Image ──
    const MiniImage = function Image() { return wx.createImage(); };

    // ── 音频 ──
    let audioCtx = null;
    function resumeAudio() {
        try { if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume(); } catch (e) { /* 忽略 */ }
    }
    function makeNoopAudioContext() {
        const gain = () => ({ gain: { value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, cancelScheduledValues() {}, setTargetAtTime() {} }, connect() {}, disconnect() {} });
        const node = () => ({ type: '', frequency: { value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, Q: { value: 0, setValueAtTime() {} }, detune: { value: 0, setValueAtTime() {} }, gain: gain().gain, start() {}, stop() {}, connect() {}, disconnect() {}, onended: null });
        return {
            state: 'running', currentTime: 0, sampleRate: 44100, destination: {},
            createGain: gain, createOscillator: node, createBiquadFilter: node, createDelay: node,
            createBufferSource: node,
            createBuffer: (ch, len) => ({ length: len, numberOfChannels: ch, sampleRate: 44100, getChannelData: () => new Float32Array(len) }),
            resume() {}, suspend() {}, close() {}
        };
    }
    const MiniAudioContext = function AudioContext() {
        if (typeof wx.createWebAudioContext === 'function') {
            try { audioCtx = wx.createWebAudioContext(); return audioCtx; } catch (e) { console.warn('[shim] createWebAudioContext 失败,降级静音', e); }
        }
        audioCtx = makeNoopAudioContext();
        return audioCtx;
    };

    // ── 其他全局 ──
    const screenObj = {
        width: winW, height: winH, availWidth: winW, availHeight: winH,
        orientation: { type: 'portrait-primary', angle: 0, lock() {}, unlock() {}, addEventListener() {}, removeEventListener() {} }
    };
    const matchMedia = q => ({
        matches: /pointer:\s*coarse|max-width|touch/.test(q),
        media: q,
        addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}
    });
    const locationStub = { search: '', hash: '', href: '', protocol: 'https:', reload() {} };
    const perf = typeof G.performance !== 'undefined' && typeof G.performance.now === 'function'
        ? G.performance
        : { now: () => Date.now() };

    let raf = G.requestAnimationFrame, caf = G.cancelAnimationFrame;
    if (typeof raf !== 'function') {
        raf = cb => setTimeout(() => cb(Date.now()), 16);
        caf = id => clearTimeout(id);
    }

    // ── window 自身(小游戏里 window 不是预置的,可以安全赋值) ──
    try { G.window = G; } catch (e) { /* 忽略 */ }
    try { G.addEventListener = (type, fn) => { (winListeners[type] = winListeners[type] || []).push(fn); }; } catch (e) { /* 忽略 */ }
    try { G.removeEventListener = () => {}; } catch (e) { /* 忽略 */ }
    try { G.dispatchEvent = () => true; } catch (e) { /* 忽略 */ }
    try { G.scrollTo = () => {}; } catch (e) { /* 忽略 */ }
    try { G.alert = msg => console.log('[alert]', msg); } catch (e) { /* 忽略 */ }
    try {
        Object.defineProperty(G, 'innerWidth', { get: () => winW, configurable: true });
        Object.defineProperty(G, 'innerHeight', { get: () => winH, configurable: true });
        Object.defineProperty(G, 'outerWidth', { get: () => winW, configurable: true });
        Object.defineProperty(G, 'outerHeight', { get: () => winH, configurable: true });
        Object.defineProperty(G, 'devicePixelRatio', { get: () => dpr, configurable: true });
    } catch (e) { /* 忽略 */ }

    const navigatorStub = {
        userAgent: 'MicroMessenger MiniGame',
        platform: 'devtools',
        language: 'zh-CN',
        maxTouchPoints: 5,
        vibrate(p) {
            try {
                const long = Array.isArray(p) ? p.some(v => v >= 40) : p >= 40;
                if (long) wx.vibrateLong({}); else wx.vibrateShort({ type: 'light' });
            } catch (e) { /* 忽略 */ }
            return true;
        }
    };

    // ── 生命周期 ──
    if (typeof wx.onShow === 'function') {
        wx.onShow(() => {
            if (finalDoc) { finalDoc.hidden = false; finalDoc.visibilityState = 'visible'; }
            emitWin('visibilitychange', { type: 'visibilitychange', target: finalDoc });
            emitWin('focus', { type: 'focus' });
        });
    }
    if (typeof wx.onHide === 'function') {
        wx.onHide(() => {
            if (finalDoc) { finalDoc.hidden = true; finalDoc.visibilityState = 'hidden'; }
            emitWin('visibilitychange', { type: 'visibilitychange', target: finalDoc });
            emitWin('blur', { type: 'blur' });
        });
    }
    if (typeof wx.onWindowResize === 'function') {
        wx.onWindowResize(res => {
            winW = res.windowWidth || winW;
            winH = res.windowHeight || winH;
            screenObj.width = winW; screenObj.height = winH;
            emitWin('resize', { type: 'resize' });
        });
    }

    // ── 暴露环境对象(打包脚本会注入成模块作用域 var) ──
    const env = {
        window: G,
        document: finalDoc,
        navigator: navigatorStub,
        localStorage: storage,
        screen: screenObj,
        matchMedia: matchMedia,
        location: locationStub,
        performance: perf,
        Image: MiniImage,
        AudioContext: MiniAudioContext,
        webkitAudioContext: MiniAudioContext,
        CanvasRenderingContext2D: CtxCtor,
        requestAnimationFrame: raf,
        cancelAnimationFrame: caf
    };
    try { G.__shimEnv = env; } catch (e) { /* 忽略 */ }
    try { if (typeof globalThis !== 'undefined' && globalThis !== G) globalThis.__shimEnv = env; } catch (e) { /* 忽略 */ }
    // 能写全局就写一份(部分代码直接读全局,不经过模块作用域)
    for (const k in env) {
        try { G[k] = env[k]; } catch (e) { /* 只读全局跳过 */ }
    }

    console.log('[shim] 垫片就绪 dpr=' + dpr + ' window=' + winW + 'x' + winH + ' canvas=' + screenCanvas.width + 'x' + screenCanvas.height + ' docHasGetById=' + (typeof finalDoc.getElementById === 'function'));
    return env;
}

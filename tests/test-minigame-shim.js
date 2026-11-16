// 小游戏垫片冒烟测试:用假 wx + 假 2D 上下文在 Node 里跑 minigame/bundle.js
// 目的:在真机之前暴露垫片缺失的 API / 启动崩溃 / 循环异常
// 不验证:渲染正确性、真机性能、触摸手感(这些必须真机/开发者工具验证)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const BUNDLE = path.join(ROOT, 'minigame', 'bundle.js');
let installedEnv = null;

// 每次跑测试都重新打包,保证测的是当前源码
test.before(() => {
    execFileSync(process.execPath, [path.join(ROOT, 'tools', 'build-minigame.js')], { stdio: 'ignore' });
});

function makeCtx(canvasObj) {
    const base = { canvas: canvasObj, save() {}, restore() {} };
    const proxy = new Proxy(base, {
        get(t, k) {
            if (k in t) return t[k];
            if (k === 'measureText') return () => ({ width: 10 });
            if (k === 'getImageData') return () => ({ data: [0, 0, 0, 255], width: 1, height: 1 });
            if (k === 'getTransform') return () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
            if (k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createPattern') {
                return () => ({ addColorStop() {} });
            }
            if (k === 'getLineDash') return () => [];
            if (typeof k === 'symbol') return undefined;
            return () => proxy;
        },
        set(t, k, v) { t[k] = v; return true; }
    });
    return proxy;
}

function makeCanvas() {
    const canvasObj = {};
    canvasObj.getContext = () => makeCtx(canvasObj);
    canvasObj.width = 780;
    canvasObj.height = 1688;
    canvasObj.getBoundingClientRect = () => ({ left: 0, top: 0, width: 390, height: 844, right: 390, bottom: 844 });
    return canvasObj;
}

function installFakeMiniGameEnv() {
    const store = new Map();
    const noop = () => {};
    let createCount = 0;
    global.GameGlobal = globalThis;
    global.wx = {
        getSystemInfoSync: () => ({ windowWidth: 390, windowHeight: 844, pixelRatio: 2, platform: 'devtools', system: 'node-test', SDKVersion: '3.18.0' }),
        createCanvas: () => { createCount++; return makeCanvas(); },
        createImage: () => {
            const img = { width: 100, height: 100, onload: null, onerror: null };
            let src = '';
            Object.defineProperty(img, 'src', {
                get: () => src,
                set(v) { src = v; setTimeout(() => { if (img.onload) img.onload(); }, 0); }
            });
            return img;
        },
        getStorageSync: k => (store.has(k) ? store.get(k) : ''),
        setStorageSync: (k, v) => { store.set(k, v); },
        removeStorageSync: k => { store.delete(k); },
        clearStorageSync: () => store.clear(),
        vibrateShort: noop,
        vibrateLong: noop,
        onTouchStart: noop, onTouchMove: noop, onTouchEnd: noop, onTouchCancel: noop,
        onShow: noop, onHide: noop, onWindowResize: noop,
        onError: noop, onUnhandledRejection: noop
    };
    // 模拟微信小游戏运行时:预置一个残缺的 document(没有 getElementById),
    // 这正是真机上 document.getElementById is not a function 的成因
    global.document = { presetDocMarker: true };
    // 限制帧数:让事件循环能自然结束(否则 rAF 循环永不退出)
    let frames = 0;
    global.requestAnimationFrame = cb => {
        if (frames++ > 90) return 0;
        return setTimeout(() => cb(Date.now()), 1);
    };
    global.cancelAnimationFrame = id => clearTimeout(id);
    // Music / 朝向提示用 setInterval 常驻,测试里置空避免吊住事件循环
    const origSetInterval = global.setInterval;
    global.setInterval = () => 0;
    global.clearInterval = () => {};
    global.__restoreIntervals = () => { global.setInterval = origSetInterval; };
    return { store, get createCount() { return createCount; } };
}

test('minigame 垫片能在无 DOM 环境下启动游戏并跑若干帧', async () => {
    const env = installFakeMiniGameEnv();
    installedEnv = env;
    const errors = [];
    const origError = console.error;
    console.error = (...args) => { errors.push(args.map(String).join(' ')); };

    let game = null;
    try {
        require(BUNDLE);
        game = globalThis.__game;
    } finally {
        console.error = origError;
    }

    assert.ok(game, '期望 boot 阶段挂出全局 __game');
    assert.equal(typeof game.startGame, 'function');
    assert.ok(game.isRunning, '期望游戏进入运行态');
    assert.ok(game.player, '期望玩家实体已创建');

    // 让 rAF 循环跑完(90 帧上限)
    await new Promise(r => setTimeout(r, 400));

    assert.equal(errors.length, 0, '启动/运行期间不应有 console.error:\\n' + errors.slice(0, 5).join('\\n'));
    assert.ok(env.createCount >= 1, '至少创建 1 个画布');
});

test('打包产物已降级到小游戏可解析的语法(无类静态字段)', () => {
    const code = fs.readFileSync(BUNDLE, 'utf8');
    // 真机 JSCore 不支持 ES2022 类静态字段(static X = v),必须由 esbuild 降级
    const hits = code.match(/^\s*static\s+[A-Za-z_$][\w$]*\s*=/gm) || [];
    assert.equal(hits.length, 0, 'bundle 里仍有类静态字段:' + hits.slice(0, 3).join(' | '));
    assert.ok(code.length > 100 * 1024, 'bundle 体积异常');
});

test('HUD 按安全区让位(window.__safeArea)', () => {
    const g = globalThis.__game;
    assert.ok(g, '需要前一个测试已启动游戏');
    // 先关掉安全区测基准
    try { delete globalThis.__safeArea; } catch (e) { /* 忽略 */ }
    let base = null;
    g._withHud(() => { base = { ...g._hud }; });
    assert.ok(base, '期望 _withHud 建立 HUD 坐标系');

    Object.defineProperty(globalThis, '__safeArea', {
        value: { left: 12, top: 24, right: 12, bottom: 36 },
        configurable: true
    });
    let inset = null;
    g._withHud(() => { inset = { ...g._hud }; });
    try { delete globalThis.__safeArea; } catch (e) { /* 忽略 */ }

    assert.ok(inset.ox > base.ox, '期望左侧安全区把 HUD 右移');
    assert.ok(inset.oy > base.oy, '期望顶部安全区把 HUD 下移');
    assert.ok(inset.w < base.w, '期望可用宽度减少');
    assert.ok(inset.h < base.h, '期望可用高度减少');
    // 缩换算:左移量应为 CSS px × (canvas.width/innerWidth) / hud.s
    const pxPerCss = g.canvas.width / globalThis.innerWidth;
    assert.ok(Math.abs((inset.ox - base.ox) - 12 * pxPerCss / inset.s) < 0.01, '左侧让位量换算错误');
});

test('预烤美术资源完整(art-map 与 PNG 文件一致)', () => {
    const mapSrc = fs.readFileSync(path.join(ROOT, 'minigame', 'art-map.js'), 'utf8');
    const map = JSON.parse(mapSrc.slice(mapSrc.indexOf('{'), mapSrc.lastIndexOf('}') + 1));
    const keys = Object.keys(map);
    assert.ok(keys.length >= 70, '期望至少 70 张预烤图,实际 ' + keys.length);
    for (const k of ['enemy|chaser', 'enemy|prism', 'boss', 'boss|void|enraged', 'player|jade', 'player|prism|180', 'item|potion']) {
        assert.ok(map[k], '缺少关键键: ' + k);
    }
    for (const k of keys) {
        const file = path.join(ROOT, 'minigame', map[k]);
        assert.ok(fs.existsSync(file), 'PNG 缺失: ' + map[k]);
        const head = fs.readFileSync(file).subarray(0, 8);
        assert.equal(head.toString('hex'), '89504e470d0a1a0a', 'PNG 头不合法: ' + map[k]);
    }
});

test('垫片把 localStorage 映射到 wx 同步存储', () => {
    // 前一个测试装载 bundle 时,垫片把环境挂在 __shimEnv 上供诊断
    const env = globalThis.__shimEnv;
    assert.ok(env && env.localStorage, '期望垫片暴露 __shimEnv.localStorage');
    assert.ok(installedEnv, '期望前一个测试已安装假 wx');
    env.localStorage.setItem('k', 'v1');
    assert.equal(installedEnv.store.get('k'), 'v1', '期望 setItem 写入 wx 存储');
    assert.equal(env.localStorage.getItem('k'), 'v1');
    env.localStorage.removeItem('k');
    assert.equal(env.localStorage.getItem('k'), null);
});

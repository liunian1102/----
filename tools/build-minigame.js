// 微信小游戏打包:shims + 环境注入 + art.js + game.js + boot.js → minigame/bundle.js
// 用法: node tools/build-minigame.js
// 说明:
//  1. 游戏是纯脚本全局作用域写法(无模块系统),小游戏 require 会隔离作用域,
//     所以直接拼接成单文件,保持原有的全局可见性。
//  2. 微信小游戏运行时预置了残缺的 document / navigator 等全局,直接赋值 GameGlobal
//     会被遮蔽,因此 shims.js 只造环境对象,这里再把它注入成模块作用域的 var。
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const MG = path.join(ROOT, 'minigame');

const INJECT = `
// ═══ 垫片注入(自动生成)═══
var __mgEnv = createMiniGameEnv();
var window, document, navigator, localStorage, screen, matchMedia, location, performance,
    Image, AudioContext, webkitAudioContext, CanvasRenderingContext2D,
    requestAnimationFrame, cancelAnimationFrame;
if (__mgEnv) {
    window = __mgEnv.window;
    document = __mgEnv.document;
    navigator = __mgEnv.navigator;
    localStorage = __mgEnv.localStorage;
    screen = __mgEnv.screen;
    matchMedia = __mgEnv.matchMedia;
    location = __mgEnv.location;
    performance = __mgEnv.performance;
    Image = __mgEnv.Image;
    AudioContext = __mgEnv.AudioContext;
    webkitAudioContext = __mgEnv.webkitAudioContext;
    CanvasRenderingContext2D = __mgEnv.CanvasRenderingContext2D;
    requestAnimationFrame = __mgEnv.requestAnimationFrame;
    cancelAnimationFrame = __mgEnv.cancelAnimationFrame;
} else {
    console.error('[bundle] 垫片环境缺失:请在 shims.js 之前调用 require,或检查 wx 是否存在');
}
`;

const parts = [
    path.join(MG, 'shims.js'),
    path.join(ROOT, 'art.js'),
    path.join(ROOT, 'game.js'),
    path.join(MG, 'boot.js')
];

const header = '// 自动生成:node tools/build-minigame.js(勿手改)\n// 顺序:shims → 环境注入 → art.js → game.js → boot.js\n';
const body = parts.map((f, i) => {
    const src = fs.readFileSync(f, 'utf8');
    const sep = `\n// ═══ ${path.relative(ROOT, f)} ═══\n`;
    return (i === 1 ? INJECT + sep : sep) + src;
}).join('\n;\n');

// 语法降级:源码用了 ES2022 类静态字段(50 处),小游戏真机 JSCore 不支持,
// 统一用 esbuild 降到 ES2017(保留原生 async/await)。真机不依赖开发者工具的 ES6 转译。
let code = header + body;
try {
    const esbuild = require('esbuild');
    code = esbuild.transformSync(code, { loader: 'js', target: 'es2017', charset: 'utf8', legalComments: 'none' }).code;
} catch (e) {
    console.error('esbuild 降级失败(先执行 npm install):' + (e && e.message ? e.message : e));
    process.exit(1);
}

const out = path.join(MG, 'bundle.js');
fs.writeFileSync(out, code, 'utf8');

const kb = (fs.statSync(out).size / 1024).toFixed(1);
console.log(`已生成 ${path.relative(ROOT, out)} (${kb} KB)`);
console.log('拼接顺序:shims → [环境注入] → ' + parts.slice(1).map(f => path.relative(ROOT, f)).join(' → '));

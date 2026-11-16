// 预烤美术资源:把 art.js 的 SVG 模板渲染成 PNG(真机不解码 SVG data-url)
// 用法: node tools/bake-art.js
// 产物: minigame/art/*.png + minigame/art-map.js(键 → 包内路径)
const fs = require('fs');
const path = require('path');
const { Resvg } = require('@resvg/resvg-js');

const ROOT = path.join(__dirname, '..');
const ART_DIR = path.join(ROOT, 'minigame', 'art');
const SIZE = 200; // 渲染宽度:游戏内最大绘制约 60 CSS px × dpr,200 足够且控包体

// 在 Node 里求值 art.js,拿到 SVG 模板表(art.js 顶层只读 typeof,不依赖 DOM)
const src = fs.readFileSync(path.join(ROOT, 'art.js'), 'utf8');
const { ArtSVG } = new Function('window', 'document', 'Image', src + '\nreturn { ArtSVG };')(undefined, undefined, undefined);

const jobs = [];
const push = (key, make) => jobs.push({ key, make });

Object.keys(ArtSVG.enemies).forEach(t => push('enemy|' + t, () => ArtSVG.enemies[t]()));
Object.keys(ArtSVG.items).forEach(k => push('item|' + k, () => ArtSVG.items[k]()));

push('boss', () => ArtSVG.boss(false));
push('boss|enraged', () => ArtSVG.boss(true));
['void', 'frost'].forEach(form => {
    push('boss|' + form, () => ArtSVG.boss(false, form));
    push('boss|' + form + '|enraged', () => ArtSVG.boss(true, form));
});

// 皮肤(prism 是动态色相,按 15° 一档共 24 张)
[
    ['jade', '#69f0ae', '#00897b'],
    ['ember', '#ffab40', '#d84315'],
    ['frost', '#b3e5fc', '#0277bd'],
    ['amethyst', '#e1bee7', '#6a1b9a'],
    ['gold', '#fff59d', '#c79100'],
    ['nebula', '#84ffff', '#7c4dff']
].forEach(([id, c1, c2]) => push('player|' + id, () => ArtSVG.player(c1, c2)));
push('player|inv', () => ArtSVG.player('#fff176', '#f9a825'));
for (let hue = 0; hue < 360; hue += 15) {
    push('player|prism|' + hue, () => ArtSVG.player(
        'hsl(' + hue + ', 90%, 72%)',
        'hsl(' + ((hue + 120) % 360) + ', 80%, 42%)'
    ));
}

fs.mkdirSync(ART_DIR, { recursive: true });
const map = {};
let total = 0, failed = 0;
for (const job of jobs) {
    let svg;
    try { svg = job.make(); } catch (e) { console.warn('生成失败', job.key, e.message); failed++; continue; }
    if (typeof svg !== 'string' || svg.indexOf('<svg') < 0) { console.warn('非 SVG 输出,跳过', job.key); failed++; continue; }
    try {
        const png = new Resvg(svg, {
            fitTo: { mode: 'width', value: SIZE },
            background: 'rgba(0,0,0,0)'
        }).render().asPng();
        const file = job.key.replace(/\|/g, '_').replace(/[^\w.-]/g, '') + '.png';
        fs.writeFileSync(path.join(ART_DIR, file), png);
        map[job.key] = 'art/' + file;
        total += png.length;
    } catch (e) {
        console.warn('渲染失败', job.key, e.message);
        failed++;
    }
}

// 能力探测用的小图(纯色 8x8)
const probe = new Resvg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"><rect width="8" height="8" fill="#00ffff"/></svg>', { fitTo: { mode: 'width', value: 8 } }).render().asPng();
fs.writeFileSync(path.join(ART_DIR, 'probe.png'), probe);
map['probe|png'] = 'art/probe.png';

fs.writeFileSync(path.join(ROOT, 'minigame', 'art-map.js'),
    '// 自动生成:node tools/bake-art.js(勿手改)\nvar ART_PNG = ' + JSON.stringify(map, null, 4) + ';\n', 'utf8');

console.log('已烤制 ' + Object.keys(map).length + ' 张 PNG,合计 ' + (total / 1024).toFixed(1) + ' KB,失败 ' + failed + ' 张');
console.log('映射表: minigame/art-map.js');

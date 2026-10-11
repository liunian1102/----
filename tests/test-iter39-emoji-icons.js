// test-iter39-emoji-icons.js
// 1) game.js 里出现的每个 emoji 都有对应的 EmojiSVG 图标(漏了就会退回系统 emoji 字体,各端不一致)
// 2) EmojiArt.split 正确切分文字/emoji(含 FE0F 变体符)
// 3) 暂停面板概况行变多(遗物/致命一击)时,概况、伤害构成条和按钮互不重叠,且放得进 420 高的菜单
require('./setup-env.js');
const fs = require('fs');
const path = require('path');
const results = [];
const check = (name, ok, msg) => results.push([name, ok, msg]);

{
    const src = fs.readFileSync(path.join(__dirname, '..', 'game.js'), 'utf8');
    const found = new Set(src.match(/\p{Extended_Pictographic}/gu) || []);
    // 印刷符号故意保留为文字
    const keep = new Set(['©', '®', '™', '↔', '↕', '↩', '↪', '▶', '◀', '☐', '☑', '✓', '✔', '✖', '❌', '➜', '★', '☆', '◆', '◇', '♛', '✦', '✟', '◎', '♥', '⛨', '⛊', '❣', '✂']);
    const missing = [...found].filter(e => !keep.has(e) && !EmojiSVG[e]);
    check('emoji 全部有图标', missing.length === 0, missing.length ? `缺少: ${missing.join(' ')}` : `${found.size} 种 emoji 均已覆盖`);
}

{
    const segs = EmojiArt.split('🔊 声音:开') || [];
    const plain = EmojiArt.split('普通文字 ★ 0');
    const fe = EmojiArt.split('⚔️战士') || [];
    check('EmojiArt.split', segs.length === 2 && segs[0].e === '🔊' && segs[1].t === ' 声音:开' && plain === null
        && fe.length === 2 && fe[0].e === '⚔' && fe[1].t === '战士', JSON.stringify([segs, plain, fe]));
}

{
    const game = new Game(); game.init(); game.startGame();
    const p = game.player;
    game._applyClassToPlayer(p, 'archer');
    p.relics = ['reaper_cloak', 'vampire_fang'];
    game.fatalBlow = { src: '方块大魔王', dmg: 120 };
    p.dmgStats = { a: 500, q: 300 };
    for (const [w, h] of [[800, 600], [620, 420], [420, 760]]) {
        game._menu = { w, h, s: 1, ox: 0, oy: 0 };
        const texts = [];
        const ctx = game.ctx, orig = ctx.fillText;
        ctx.fillText = function (t, x, y) { texts.push({ t: String(t), y }); return orig.apply(this, arguments); };
        game._renderPauseOverlay();
        ctx.fillText = orig;
        const pp = game._pausePanel, btns = game.buttons;
        const rowsBottom = Math.max(...texts.filter(o => o.t === '致命一击' || o.t.startsWith('方块大魔王')).map(o => o.y));
        const barY = texts.find(o => o.t === '伤害构成').y;
        const firstBtn = Math.min(...btns.map(b => b.y));
        const lastBtn = Math.max(...btns.map(b => b.y + b.height));
        const ok = rowsBottom < barY && barY + 30 < firstBtn && lastBtn <= pp.y + pp.h && pp.y >= 0 && pp.y + pp.h <= h;
        check(`暂停面板排版 ${w}x${h}`, ok, `概况底 ${rowsBottom.toFixed(0)} / 伤害条 ${barY.toFixed(0)} / 按钮 ${firstBtn.toFixed(0)}-${lastBtn.toFixed(0)} / 面板 ${pp.y.toFixed(0)}-${(pp.y + pp.h).toFixed(0)}`);
    }
}

for (const [name, ok, msg] of results) console.log(ok ? 'PASS' : 'FAIL', name, '-', msg);
process.exit(results.every(r => r[1]) ? 0 : 1);

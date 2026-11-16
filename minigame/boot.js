// ══════════════════════════════════════════════════════════════════
//  小游戏启动引导(打包时拼在 art.js / game.js 之后)
//  目标:跳过 DOM 大厅,直接进入单人局,验证核心战斗在真机可运行
//  DOM 面板(大厅/构筑/成就/星图)在垫片里是空壳,不可见 —— 后续 Phase 2 再 canvas 化
// ══════════════════════════════════════════════════════════════════

(function () {
    const G = typeof GameGlobal !== 'undefined' ? GameGlobal : globalThis;
    if (typeof document === 'undefined' || typeof document.getElementById !== 'function') {
        console.error('[boot] document 垫片未注入:检查 tools/build-minigame.js 的环境注入段');
        return;
    }
    const cv = document.getElementById('gameCanvas');
    const ctx = cv.getContext('2d');

    function drawFatal(title, err) {
        try {
            const w = cv.width, h = cv.height;
            ctx.save();
            ctx.fillStyle = '#101820';
            ctx.fillRect(0, 0, w, h);
            ctx.fillStyle = '#ff5252';
            ctx.font = 'bold ' + Math.round(w / 26) + 'px sans-serif';
            ctx.textAlign = 'left';
            ctx.fillText(title, w * 0.04, h * 0.12);
            ctx.fillStyle = '#ffd740';
            ctx.font = Math.round(w / 40) + 'px monospace';
            const lines = String(err && err.stack ? err.stack : err).split('\n');
            lines.slice(0, 18).forEach((line, i) => {
                ctx.fillText(line.slice(0, 70), w * 0.04, h * 0.12 + (i + 1) * Math.round(w / 26));
            });
            ctx.restore();
        } catch (e) { /* 忽略 */ }
    }

    // 运行期异常直接画到屏幕上(rAF 里抛错会让循环停住,不画出来就没法排查)
    if (typeof wx.onError === 'function') wx.onError(err => { console.error('[boot] onError', err); drawFatal('运行错误:', err); });
    if (typeof wx.onUnhandledRejection === 'function') wx.onUnhandledRejection(res => { console.error('[boot] unhandled', res); });

    let game = null;
    let overInfo = null;
    let lastFrames = 0;
    let fps = 0;
    let fpsTimer = Date.now();

    try {
        game = new Game();
        game.render();
        game.startGame();
        // 统一时间基准:循环内 elapsed = now - _lastFrameTime,而 now 来自 rAF
        // (垫片已保证是 Date.now()),这里同步初值,避免首帧算出巨大的 elapsed
        game._lastFrameTime = Date.now();
        game._frameAccum = 0;
        G.__game = game;
        console.log('[boot] 启动成功', cv.width + 'x' + cv.height);
    } catch (e) {
        console.error('[boot] 启动失败', e);
        drawFatal('启动失败:', e);
        return;
    }

    // 捕获循环内异常(update/render 抛错会被 game.js 内部 try/catch 吞掉,导致画面静止且无提示)
    let firstErr = null;
    ['update', 'render'].forEach(name => {
        const orig = game[name].bind(game);
        game[name] = function () {
            try {
                return orig.apply(null, arguments);
            } catch (e) {
                if (!firstErr) {
                    firstErr = e;
                    console.error('[boot] ' + name + ' 异常', e);
                }
                throw e;
            }
        };
    });

    // 构筑面板(#buildOverlay)是纯 DOM 实现,小游戏里没有 DOM:
    // 直接调用会暂停游戏并卡在空面板。这里拦掉并给出屏幕提示(Phase 2 做 canvas 版)
    let buildBlockedAt = 0;
    game.openBuild = function () {
        buildBlockedAt = Date.now();
        console.warn('[boot] 构筑面板在移动端暂未适配,已拦截 openBuild');
        return false;
    };
    game.showingBuild = false;
    // 图片能力自检:机型对 SVG / 位图、data-url / 包内文件的解码能力并不一致,
    // 这行结果直接决定美术资源走哪条路(真机实测 SVG 失败时才会发现)
    const imgTest = { pngData: '-', svgData: '-', pngFile: '-' };
    (function probeImages() {
        const PNG_DATA = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
        const SVG_DATA = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"><rect width="8" height="8" fill="#0ff"/></svg>');
        const check = (label, src) => {
            try {
                const im = wx.createImage();
                let done = false;
                const fin = v => { if (done) return; done = true; imgTest[label] = v; };
                im.onload = () => fin('OK');
                im.onerror = () => fin('X');
                im.src = src;
                setTimeout(() => fin('T'), 4000);
            } catch (e) { imgTest[label] = 'E'; }
        };
        check('pngData', PNG_DATA);
        check('svgData', SVG_DATA);
        check('pngFile', 'art/probe.png');
    })();

    // 拦截结算:小游戏没有 DOM 结算面板,改为屏幕提示 + 点击重开
    const origShowGameOver = game._showGameOver.bind(game);
    game._showGameOver = function (time, score) {
        try { origShowGameOver(time, score); } catch (e) { console.error('[boot] gameOver 面板失败', e); }
        overInfo = { time: time, score: score };
    };

    wx.onTouchStart(() => {
        if (overInfo) {
            overInfo = null;
            try { game.restartGame(true); } catch (e) { console.error('[boot] 重开失败', e); }
        }
    });

    // 调试叠层:FPS / 实体数(性能评估用,后续可关)
    const bootAt = Date.now();
    const hud = () => {
        lastFrames++;
        const now = Date.now();
        if (now - fpsTimer >= 1000) {
            fps = lastFrames;
            lastFrames = 0;
            fpsTimer = now;
        }
        try {
            // 启动自检横幅:前 3 秒显示,用来区分"游戏挂了"和"调试通道挂了"
            if (now - bootAt < 3000) {
                const w = cv.width;
                ctx.save();
                ctx.fillStyle = 'rgba(76,175,80,0.92)';
                ctx.fillRect(0, 0, w, Math.round(w / 30));
                ctx.fillStyle = '#06210b';
                ctx.font = 'bold ' + Math.round(w / 44) + 'px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('BOOT OK · 垫片已注入 · ' + Math.round(w) + '×' + Math.round(cv.height), w / 2, Math.round(w / 60));
                ctx.restore();
            }
            if (overInfo) {
                const w = cv.width, h = cv.height;
                ctx.save();
                ctx.fillStyle = 'rgba(6,12,20,0.82)';
                ctx.fillRect(0, h * 0.28, w, h * 0.3);
                ctx.fillStyle = '#7cf5ff';
                ctx.font = 'bold ' + Math.round(w / 22) + 'px sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText('本局结束', w / 2, h * 0.38);
                ctx.fillStyle = '#fff';
                ctx.font = Math.round(w / 30) + 'px sans-serif';
                ctx.fillText('存活 ' + Math.round(overInfo.time || 0) + ' 秒 · 得分 ' + Math.round(overInfo.score || 0), w / 2, h * 0.46);
                ctx.fillStyle = '#ffd740';
                ctx.fillText('点击任意处重新开始', w / 2, h * 0.53);
                ctx.restore();
            } else {
                ctx.save();
                ctx.font = Math.round(cv.width / 55) + 'px monospace';
                ctx.textAlign = 'left';
                ctx.fillStyle = fps >= 55 ? 'rgba(120,255,160,0.9)' : fps >= 30 ? 'rgba(255,221,64,0.9)' : 'rgba(255,82,82,0.95)';
                let artReady = 0, artTotal = 0;
                try {
                    if (typeof Art !== 'undefined' && Art.imgs) {
                        artTotal = Art.imgs.size;
                        Art.imgs.forEach(r => { if (r && r.ready) artReady++; });
                    }
                } catch (e) { /* 忽略 */ }
                const st = 'run ' + (game.isRunning ? 1 : 0) + ' pause ' + (game.isPaused ? 1 : 0) + ' t ' + (game.gameTime || 0).toFixed(1) + ' lv ' + (game.level || 0);
                ctx.fillText('FPS ' + fps + ' | 敌 ' + (game.enemies ? game.enemies.length : 0) + ' | 弹 ' + (game.projectiles ? game.projectiles.length : 0) + ' | 粒 ' + (game.particles ? game.particles.length : 0) + ' | 绘 ' + artReady + '/' + artTotal + ' | ' + st, 8, cv.height - 10);
                ctx.fillText('img pngData=' + imgTest.pngData + ' svgData=' + imgTest.svgData + ' pngFile=' + imgTest.pngFile + ' | ' + cv.width + '×' + cv.height, 8, cv.height - 10 - Math.round(cv.width / 45));

                // 构筑面板拦截提示
                if (buildBlockedAt && now - buildBlockedAt < 2600) {
                    const w = cv.width, h = cv.height;
                    ctx.save();
                    ctx.fillStyle = 'rgba(6,12,20,0.88)';
                    ctx.fillRect(w * 0.06, h * 0.42, w * 0.88, h * 0.12);
                    ctx.fillStyle = '#ffd740';
                    ctx.font = 'bold ' + Math.round(w / 34) + 'px sans-serif';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText('构筑界面移动端暂未开放', w / 2, h * 0.465);
                    ctx.fillStyle = '#b0bec5';
                    ctx.font = Math.round(w / 48) + 'px sans-serif';
                    ctx.fillText('正在适配,先专注战斗吧', w / 2, h * 0.51);
                    ctx.restore();
                }

                // 循环异常上屏:否则 update/render 抛错被吞,只能翻控制台
                if (firstErr) {
                    const w = cv.width, h = cv.height;
                    const lines = String(firstErr.stack || firstErr).split('\n').slice(0, 10);
                    const lh = Math.round(w / 42);
                    ctx.fillStyle = 'rgba(60,0,0,0.88)';
                    ctx.fillRect(0, h * 0.1, w, lh * (lines.length + 1.4));
                    ctx.fillStyle = '#ff8a80';
                    ctx.font = 'bold ' + lh + 'px monospace';
                    ctx.fillText('循环异常(update/render)', w * 0.02, h * 0.1 + lh);
                    ctx.fillStyle = '#ffe0b2';
                    lines.forEach((line, i) => ctx.fillText(line.slice(0, 76), w * 0.02, h * 0.1 + lh * (i + 2.4)));
                }
                ctx.restore();
            }
        } catch (e) { /* 忽略 */ }
        requestAnimationFrame(hud);
    };
    requestAnimationFrame(hud);
})();

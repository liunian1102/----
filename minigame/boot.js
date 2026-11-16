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
        G.__game = game;
        console.log('[boot] 启动成功', cv.width + 'x' + cv.height);
    } catch (e) {
        console.error('[boot] 启动失败', e);
        drawFatal('启动失败:', e);
        return;
    }

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
                ctx.fillText('FPS ' + fps + ' | 敌 ' + (game.enemies ? game.enemies.length : 0) + ' | 弹 ' + (game.projectiles ? game.projectiles.length : 0) + ' | 粒 ' + (game.particles ? game.particles.length : 0) + ' | 绘 ' + artReady + '/' + artTotal, 8, cv.height - 10);
                ctx.restore();
            }
        } catch (e) { /* 忽略 */ }
        requestAnimationFrame(hud);
    };
    requestAnimationFrame(hud);
})();

// 微信小游戏 SVG 解码 spike —— 打开项目后看控制台 [spike] 开头的输出
// 目标:确认 ①位图 data-url 可用 ②SVG data-url 可用 ③解码成功时像素能否真的画出来

const sys = wx.getSystemInfoSync();
console.log('[spike] 环境:', sys.platform, sys.system, '基础库', sys.SDKVersion, '窗口', sys.windowWidth + 'x' + sys.windowHeight);

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const SVG = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#00ffff"/></svg>'
);

const canvas = wx.createCanvas();          // 首次调用 = 上屏 canvas
const ctx = canvas.getContext('2d');
ctx.fillStyle = '#101820';
ctx.fillRect(0, 0, canvas.width, canvas.height);

function testImage(label, src, onDone) {
    const t0 = Date.now();
    const img = wx.createImage();
    let done = false;
    const finish = (ok, extra) => {
        if (done) return;
        done = true;
        console.log('[spike] ' + label + ': ' + (ok ? 'LOAD OK' : 'FAIL') + ' ' + (extra || '') + ' (' + (Date.now() - t0) + 'ms)');
        if (onDone) onDone(ok, img);
    };
    img.onload = () => finish(true, img.width + 'x' + img.height);
    img.onerror = (e) => finish(false, 'onerror=' + JSON.stringify(e || {}));
    img.src = src;
    setTimeout(() => finish(false, '超时 3000ms 无回调'), 3100);
}

// 对照组:PNG data-url(小游戏理应支持)
testImage('PNG data-url [对照组]', PNG, () => {
    // 关键测试:SVG data-url
    testImage('SVG data-url [关键]', SVG, (ok, img) => {
        if (!ok) {
            console.log('[spike] 结论: SVG data-url 无法解码 → 必须走预烤 PNG 管线');
            ctx.fillStyle = '#ff5252';
            ctx.fillRect(0, 0, canvas.width, 60);
            return;
        }
        // 解码成功还不算数,要确认像素真画出来了
        ctx.drawImage(img, 40, 120, 160, 160);
        try {
            const px = ctx.getImageData(120, 200, 1, 1).data;
            const cyan = px[0] < 40 && px[1] > 200 && px[2] > 200;
            console.log('[spike] SVG 绘制像素 rgba(' + px[0] + ',' + px[1] + ',' + px[2] + ',' + px[3] + ') → ' + (cyan ? '正常渲染 ✅' : '异常或空白 ❌'));
            console.log('[spike] 结论: ' + (cyan ? 'SVG 可直接使用,art.js 无需改造 ✅' : '能解码但渲染异常,需实测进一步排查 ⚠️'));
            ctx.fillStyle = cyan ? '#4caf50' : '#ff9800';
            ctx.fillRect(0, 0, canvas.width, 60);
        } catch (e) {
            console.log('[spike] getImageData 调用失败:', e && e.message ? e.message : e);
            ctx.fillStyle = '#ff9800';
            ctx.fillRect(0, 0, canvas.width, 60);
        }
    });
});

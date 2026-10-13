// test-iter54-boss-display-and-targeting.js
// 自动化验证:
// 1) 场外敌人不可被锁定为目标(未进场不瞄准),进场后立即可锁定
// 2) 场外敌人物理距离近、场内敌人远时,优先且仅锁定场内敌人
// 3) 魔王 Warning 预警文字移至视口上方安全区,不遮挡屏幕中央玩家
require('./setup-env.js');
const assert = require('assert');

const results = [];
const check = (name, ok, msg) => results.push([name, ok, msg]);

const g = new Game();
g.init();
g.startGame();
g.enemies = [];
g.boss = null;
g.bossState = 'idle';

// 玩家置于场地正中央 (400, 300)
g.player.x = 400 - g.player.size / 2;
g.player.y = 300 - g.player.size / 2;

// 1. 验证 _isTargetable 边界判断
{
    const leftOut = g._newEnemy(-50, 300, 'chaser'); // 左侧场外
    const rightOut = g._newEnemy(g.width + 20, 300, 'chaser'); // 右侧场外
    const topOut = g._newEnemy(400, -60, 'chaser'); // 上方场外
    const bottomOut = g._newEnemy(400, g.height + 10, 'chaser'); // 下方场外
    const inside = g._newEnemy(100, 300, 'chaser'); // 场内

    check('场外左侧不可锁定', !g._isTargetable(leftOut), `leftOut at ${leftOut.x}`);
    check('场外右侧不可锁定', !g._isTargetable(rightOut), `rightOut at ${rightOut.x}`);
    check('场外上方不可锁定', !g._isTargetable(topOut), `topOut at ${topOut.y}`);
    check('场外下方不可锁定', !g._isTargetable(bottomOut), `bottomOut at ${bottomOut.y}`);
    check('场内敌人可锁定', g._isTargetable(inside), `inside at ${inside.x},${inside.y}`);
}

// 2. 只有场外敌人时,不会误选为最近目标
{
    g.enemies = [
        g._newEnemy(-40, 300, 'chaser'),
        g._newEnemy(g.width + 30, 200, 'chaser')
    ];
    const target = g._findClosestTarget();
    const list = g._findClosestEnemies(2);
    check('全为场外怪时不锁定任何目标', target === null && list.length === 0, `target: ${target}, list length: ${list.length}`);
}

// 3. 场外敌人距离玩家更近时,严格忽略场外怪,锁定场内敌人
{
    // 玩家在靠左边缘 (x: 20, y: 300)
    g.player.x = 20;
    g.player.y = 300;
    const offscreenNear = g._newEnemy(-30, 300, 'chaser'); // 距玩家约 50px,但完全在场外
    const onscreenFar = g._newEnemy(250, 300, 'chaser'); // 距玩家 230px,在场内
    g.enemies = [offscreenNear, onscreenFar];

    const target = g._findClosestTarget();
    const list = g._findClosestEnemies(1);
    check('优先且仅锁定场内目标', target === onscreenFar && list[0] === onscreenFar,
        `选定目标 x: ${target ? target.x : 'null'}, 期望: ${onscreenFar.x}`);
}

// 4. 场外敌人踏入战场边缘时,立即可被锁定
{
    const entrant = g._newEnemy(-45, 300, 'chaser'); // chaser size 为 30, x=-45 时完全在场外
    check('未越线前不可锁定', !g._isTargetable(entrant), `x: ${entrant.x}`);
    entrant.x = 2; // 进入场内 2px
    check('踏入场内立即可锁定', g._isTargetable(entrant), `x: ${entrant.x}`);
}

// 5. 验证魔王预警 Warning 绘制调用位于视口上方,不遮挡屏幕中央玩家
{
    const textCalls = [];
    g.ctx.fillText = (text, x, y) => textCalls.push({ text, x, y });

    const scrW = 844, scrH = 390; // 模拟典型移动端横屏视口
    g.bossState = 'warning';
    g.bossWarningTimer = 4.2;
    g._renderBossAlertScreen(scrW, scrH);

    const warnText = textCalls.find(c => c.text && c.text.includes('魔王降临'));
    assert.ok(warnText, '必须包含魔王降临警报文本');
    check('预警文字避开屏幕中央玩家区', warnText.y < scrH * 0.28,
        `预警文字 y=${warnText.y.toFixed(1)}, 视口高度=${scrH}, 比例=${(warnText.y / scrH).toFixed(2)}`);
}

for (const [name, ok, msg] of results) console.log(ok ? 'PASS' : 'FAIL', name, '-', msg);
process.exit(results.every(r => r[1]) ? 0 : 1);

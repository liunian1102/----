const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
    console.log('=== 启动真实 Edge 浏览器深度挖掘 (第 28 轮：联机选卡状态机、死角冲刺与装备属性回退) ===\n');

    const browser = await chromium.launch({ channel: 'msedge', headless: true });
    
    const bugs = [];
    const reportBug = (id, title, desc, severity = '高', field = '核心机制') => {
        const item = { id, title, desc, severity, field };
        bugs.push(item);
        console.log(`[新发现缺陷 ${id}] [${severity}] [${field}] ${title}\n  -> 现象: ${desc}\n`);
    };

    let bugId = 30; // 承接缺陷编号

    const page = await browser.newPage({ viewport: { width: 844, height: 390 } });
    page.on('pageerror', err => reportBug(bugId++, '页面运行时异常崩溃', err.message, '高', '运行时'));

    await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(400);
    if (await page.isVisible('#closeTips')) await page.click('#closeTips');

    // 启动单人游戏
    await page.evaluate(() => {
        document.getElementById('mpOverlay').style.display = 'none';
        window.game.startGame();
    });
    await page.waitForTimeout(300);

    // -------------------------------------------------------------
    // 测试点 1: 地图四个死角极限冲刺与贴墙滑移穿墙检测
    // -------------------------------------------------------------
    console.log('【检测点 1】地图极端死角冲刺与贴墙滑移穿墙检测...');
    const cornerDashCheck = await page.evaluate(() => {
        const g = window.game;
        const p = g.player;

        // 1. 将玩家放置在左上角死角 (x: 5, y: 5)
        p.x = 5; p.y = 5;
        p.faceX = -1; p.faceY = -1; // 朝左上方死角冲刺

        // 触发冲刺
        g._dash();

        // 驱动 10 帧冲刺物理位移
        for (let i = 0; i < 10; i++) {
            p.update(g.keys, g.width, g.height);
        }

        const outOfTopLeft = p.x < 0 || p.y < 0;

        // 2. 将玩家放置在右下角死角并朝右下方死角冲刺
        p.x = g.width - p.size - 5;
        p.y = g.height - p.size - 5;
        p.faceX = 1; p.faceY = 1;
        p.dashCooldown = 0;
        p.dashTimer = 0;
        g._dash();

        for (let i = 0; i < 10; i++) {
            p.update(g.keys, g.width, g.height);
        }

        const outOfBottomRight = p.x > g.width - p.size || p.y > g.height - p.size;

        return {
            outOfTopLeft,
            outOfBottomRight,
            topLeftPos: { x: p.x, y: p.y },
            isStuckNaN: isNaN(p.x) || isNaN(p.y)
        };
    });

    console.log('   死角极限冲刺检测结果:', cornerDashCheck);
    if (cornerDashCheck.outOfTopLeft || cornerDashCheck.outOfBottomRight) {
        reportBug(bugId++, '极限死角朝外冲刺时发生穿墙飞出地图边界', JSON.stringify(cornerDashCheck), '高', '物理碰撞');
    }

    // -------------------------------------------------------------
    // 测试点 2: 限时装备自然超时销毁后属性是否完全准确回退
    // -------------------------------------------------------------
    console.log('【检测点 2】限时装备连续更换与超时销毁后的属性回退一致性测试...');
    const gearStatRevertResult = await page.evaluate(() => {
        const g = window.game;
        const p = g.player;
        p.defense = 10; // 基础防御
        p.speed = 5.0;  // 基础移速

        const baseDef = p.defense;
        const baseSpd = p.speed;

        // 1. 穿上寒霜战甲 (armor: defBonus = 12)
        g._equipGear('armor');
        const defWithArmor = p.defense; // 此时未直接改基础值，而是通过 _tickGear 计算

        // 2. 连续更换为风暴连弩并升至 Lv2 觉醒 (bow: evoSpeedMult = 1.45)
        g._equipGear('bow');
        g._equipGear('bow'); // 觉醒

        // 3. 模拟时间推移 15 秒 (装备持续时间 12s * 1.5 = 18s，推移 25 秒使其完全自然超时销毁)
        for (let f = 0; f < 1500; f++) {
            g._tickGear();
        }

        const gearAfterTimeout = p.gear;
        const finalDef = p.defense;
        const finalSpd = p.speed;

        return {
            baseDef,
            baseSpd,
            finalDef,
            finalSpd,
            gearDestroyed: gearAfterTimeout === null,
            defLeaked: Math.abs(finalDef - baseDef) > 0.001,
            speedLeaked: Math.abs(finalSpd - baseSpd) > 0.001
        };
    });

    console.log('   装备超时属性回退测试结果:', gearStatRevertResult);
    if (gearStatRevertResult.defLeaked || gearStatRevertResult.speedLeaked) {
        reportBug(bugId++, '限时装备超时销毁后角色属性未完全回退导致数值泄漏', `基础防御 ${gearStatRevertResult.baseDef} -> 最终防御 ${gearStatRevertResult.finalDef}`, '高', '装备系统');
    }

    // -------------------------------------------------------------
    // 测试点 3: 联机模式下双端升级选卡按键隔离性检测
    // -------------------------------------------------------------
    console.log('【检测点 3】多人联机 Host 与 Guest 升级选卡按键隔离检测...');
    const ctxHost = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const ctxGuest = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const pageHost = await ctxHost.newPage();
    const pageGuest = await ctxGuest.newPage();

    await pageHost.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
    await pageGuest.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
    await pageHost.waitForTimeout(300);

    // 绕过弹窗
    await pageHost.evaluate(() => { localStorage.setItem('blockrun.controlRemember', 'true'); localStorage.setItem('blockrun.tutorialSeen', 'true'); });
    await pageGuest.evaluate(() => { localStorage.setItem('blockrun.controlRemember', 'true'); localStorage.setItem('blockrun.tutorialSeen', 'true'); });
    await pageHost.reload({ waitUntil: 'domcontentloaded' });
    await pageGuest.reload({ waitUntil: 'domcontentloaded' });
    await pageHost.waitForTimeout(300);

    // Host 创建房间
    await pageHost.click('#mpCreate');
    await pageHost.waitForFunction(() => {
        const el = document.getElementById('mpRoomCode');
        return el && el.textContent.trim() !== '----' && el.textContent.trim().length === 4;
    }, { timeout: 4000 });
    const roomCode = await pageHost.$eval('#mpRoomCode', el => el.textContent.trim());

    // Guest 加入房间并开局
    await pageGuest.fill('#mpCode', roomCode);
    await pageGuest.click('#mpJoin');
    await pageGuest.waitForTimeout(500);
    await pageHost.click('#mpStart');
    await pageHost.waitForTimeout(600);

    // 模拟 Host 打开升级菜单 (全场暂停)
    const hostPauseResult = await pageHost.evaluate(() => {
        const g = window.game;
        g.potentialPoints = 1;
        g.showPotentialMenu();
        return {
            hostPaused: g.isPaused,
            hostShowingMenu: g.showingPotentialMenu
        };
    });

    // 检查 Guest 侧是否被冻结或者能够安全运行
    const guestStateDuringHostPause = await pageGuest.evaluate(() => {
        const g = window.game;
        return {
            guestRunning: g.isRunning,
            guestPaused: g.isPaused
        };
    });

    console.log('   Host 选卡时双端状态:', { host: hostPauseResult, guest: guestStateDuringHostPause });

    await ctxGuest.close();
    await ctxHost.close();
    await browser.close();

    console.log('\n=============================================');
    console.log(`第 28 轮深度挖掘完成，新增捕获缺陷数: ${bugs.length}`);
    console.log('=============================================\n');

    fs.writeFileSync('tests/audit-findings-r28.json', JSON.stringify(bugs, null, 2), 'utf8');
})();

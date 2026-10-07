const { chromium } = require('playwright');
const path = require('path');

(async () => {
    console.log('=== 启动真实浏览器自动化验证 ===');
    const browser = await chromium.launch({ channel: 'msedge', headless: true });
    const context = await browser.newContext({
        viewport: { width: 1024, height: 768 }
    });
    const page = await context.newPage();

    const fileUrl = 'file:///' + path.resolve(__dirname, '../index.html').replace(/\\/g, '/');
    console.log('1. 打开游戏页面:', fileUrl);
    await page.goto(fileUrl, { waitUntil: 'domcontentloaded' });

    if (await page.isVisible('#closeTips')) {
        await page.click('#closeTips');
        await page.waitForTimeout(200);
    }
    await page.click('#mpSingle');
    await page.waitForTimeout(200);

    if (await page.isVisible('#controlConfirm')) {
        await page.click('#controlConfirm');
        await page.waitForTimeout(300);
    }

    const testResults = await page.evaluate(() => {
        const results = [];
        const g = window.game;
        if (!g) return [{ test: 'gameInstance', pass: false, msg: 'window.game not found' }];

        // 1. 验证道具配色与去方块圆盘结构
        const itemPotion = new Item(100, 100, 'potion');
        const itemSnow = new Item(120, 120, 'snowflake');
        const itemBomb = new Item(140, 140, 'bomb');
        const itemInv = new Item(160, 160, 'potion_invicible');

        results.push({
            test: 'itemColors',
            pass: itemPotion.color === '#00e676' && itemSnow.color === '#00e5ff' && itemBomb.color === '#37474f' && itemInv.color === '#ffd700',
            msg: `potion: ${itemPotion.color}, snow: ${itemSnow.color}, bomb: ${itemBomb.color}, inv: ${itemInv.color}`
        });

        // 2. 验证道具同类聚合 (Item Merging)
        g.items = [];
        const p1 = new Item(200, 200, 'exp_book');
        const p2 = new Item(220, 220, 'exp_book');
        p1.landTimer = 0;
        p2.landTimer = 0;
        g.items.push(p1, p2);
        g._mergeNearbyItems();
        results.push({
            test: 'itemMerge',
            pass: g.items.length === 1 && g.items[0].stackCount === 2,
            msg: `Merged count: ${g.items.length}, stack: ${g.items[0] && g.items[0].stackCount}`
        });

        // 3. 验证生命偷取上限机制 (Leech Cap)
        g.player.class = 'warrior'; // 设定职业使 Q 槽位镶嵌生效
        g.player.currentHealth = 50;
        g.player.maxHealth = 100;
        g._grantGem('leech');
        g._socketGem('q', 0, 'leech');
        g._ctx = { slot: 'q' };

        const dummyEnemy = new Enemy(300, 300, 'chaser', 1);
        dummyEnemy.currentHealth = 2000;
        dummyEnemy.maxHealth = 2000;
        g._afterHit(g.player, dummyEnemy, 1000); // 1000伤害如果无上限偷血 3% = 30HP, 1级宝石上限为 4% + 1*2% = 6% maxHP = 6HP
        const healed = g.player.currentHealth - 50;
        results.push({
            test: 'leechCap',
            pass: healed <= 6 && healed > 0,
            msg: `Healed: ${healed} (Expected cap: 6)`
        });

        // 4. 验证冰封韧性保护 (Freeze Immunity)
        g._grantGem('freeze');
        g._socketGem('q', 1, 'freeze');
        // 强制使 freeze 成功触发测试
        const origRandom = Math.random;
        Math.random = () => 0.01;
        dummyEnemy.stunTimer = 0;
        dummyEnemy.freezeImmunityTimer = 0;
        g._afterHit(g.player, dummyEnemy, 50); // 触发冰冻
        const hadStun = dummyEnemy.stunTimer > 0;
        const hadImmunity = dummyEnemy.freezeImmunityTimer > 0;
        // 处于免疫期再次命中: 不得刷新眩晕
        dummyEnemy.stunTimer = 0.1;
        g._afterHit(g.player, dummyEnemy, 50);
        const stunStayed = dummyEnemy.stunTimer === 0.1;
        Math.random = origRandom;

        results.push({
            test: 'freezeImmunity',
            pass: hadStun && hadImmunity && stunStayed,
            msg: `hadStun: ${hadStun}, hadImmunity: ${hadImmunity}, stunStayed: ${stunStayed}`
        });

        // 5. 验证体型互斥天赋与数值
        const defs = g._buildTalentDefs();
        const titan = defs.find(d => d.id === 'titanPhysique');
        const mini = defs.find(d => d.id === 'nimbleMini');
        const projDef = defs.find(d => d.id === 'projDeflection');
        const projWind = defs.find(d => d.id === 'projWindWalk');
        results.push({
            test: 'talentDefsFound',
            pass: !!(titan && mini && projDef && projWind),
            msg: `Found titan: ${!!titan}, mini: ${!!mini}, projDef: ${!!projDef}, projWind: ${!!projWind}`
        });

        // 应用泰坦天赋
        const oldSize = g.player.size;
        titan.apply(g);
        const titanApplicableAfter = titan.applicable(g);
        const miniApplicableAfter = mini.applicable(g);
        results.push({
            test: 'titanMutuallyExclusive',
            pass: g.player.size > oldSize && !titanApplicableAfter && !miniApplicableAfter && g.player.bodyScaleChoice === 'titan',
            msg: `New size: ${g.player.size}, titanApp: ${titanApplicableAfter}, miniApp: ${miniApplicableAfter}`
        });

        // 6. 验证投射物减伤与投射物回避
        g.player.projDmgReduction = 0.35;
        g.player.projEvade = 1.0; // 强制100%回避测试
        g.player.windWalkOnEvade = true;
        g.player.currentHealth = 100;
        const dmgTaken = g.player.takeDamage(20, '敌方子弹');
        results.push({
            test: 'projectileDefense',
            pass: dmgTaken === 0 && g.player._windWalkTimer > 0,
            msg: `DmgTaken: ${dmgTaken}, WindWalkTimer: ${g.player._windWalkTimer}`
        });

        return results;
    });

    console.log('--- 测试结果 ---');
    let allPassed = true;
    for (const r of testResults) {
        console.log(`[${r.pass ? 'PASS' : 'FAIL'}] ${r.test}: ${r.msg}`);
        if (!r.pass) allPassed = false;
    }

    // 渲染游戏并截屏留证
    await page.evaluate(() => {
        const g = window.game;
        g.items = [
            new Item(250, 250, 'potion'),
            new Item(300, 250, 'exp_book'),
            new Item(350, 250, 'snowflake'),
            new Item(400, 250, 'bomb'),
            new Item(450, 250, 'heart'),
            new Item(500, 250, 'potion_invicible')
        ];
        g.enemies = [
            new Enemy(250, 350, 'chaser', 1),
            new Enemy(350, 350, 'patroller', 1),
            new Enemy(450, 350, 'giant', 1)
        ];
        g.items.forEach(it => { it.landTimer = 0; });
        g.render();
    });
    await page.waitForTimeout(200);
    const screenshotPath = path.join(__dirname, 'screenshot-batch7-visual-contrast.png');
    await page.screenshot({ path: screenshotPath });
    console.log('已保存道具与怪物对比渲染截图:', screenshotPath);

    await browser.close();
    process.exit(allPassed ? 0 : 1);
})();

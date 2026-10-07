const { chromium } = require('playwright');
const path = require('path');

(async () => {
    console.log('=== 启动真实浏览器自动化验证: 扩充宝石与符文共鸣 ===');
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

        // 1. 验证 GEM_TYPES 与 GEMS 扩充（包含 6 颗新增高阶机制宝石）且新宝石属性定义完备
        const newKeys = ['stagger', 'bloodPact', 'fork', 'momentum', 'vortex', 'flux'];
        const gemsExist = newKeys.every(k => !!GEMS[k] && GEM_TYPES.includes(k));
        results.push({
            test: 'gemsCountAndDefinitions',
            pass: GEM_TYPES.length === 19 && gemsExist,
            msg: `Total gems: ${GEM_TYPES.length}, all new gems found: ${gemsExist}`
        });

        // 2. 验证双色基础共鸣 (2红 = 破阵之力, 2绿 = 疾风连击, 2蓝 = 元素超载)
        g.player.class = 'warrior';
        g._grantGem('dmg');      // 红
        g._grantGem('stagger');  // 红
        g._socketGem('q', 0, 'dmg');
        g._socketGem('q', 1, 'stagger');
        const res2Red = g._gemResonance(g.player, 'q');
        results.push({
            test: 'resonance2Red',
            pass: res2Red && res2Red.id === 'breaker' && res2Red.tier === 2,
            msg: `2 Red Resonance: ${res2Red ? res2Red.name : 'null'}`
        });

        // 2绿共鸣
        g._grantGem('crit');     // 绿
        g._grantGem('momentum'); // 绿
        g._socketGem('e', 0, 'crit');
        g._socketGem('e', 1, 'momentum');
        const res2Green = g._gemResonance(g.player, 'e');
        results.push({
            test: 'resonance2Green',
            pass: res2Green && res2Green.id === 'galeCombo' && res2Green.tier === 2,
            msg: `2 Green Resonance: ${res2Green ? res2Green.name : 'null'}`
        });

        // 2蓝共鸣
        g._grantGem('freeze'); // 蓝
        g._grantGem('vortex'); // 蓝
        g._socketGem('q', 0, 'freeze');
        g._socketGem('q', 1, 'vortex');
        const res2Blue = g._gemResonance(g.player, 'q');
        results.push({
            test: 'resonance2Blue',
            pass: res2Blue && res2Blue.id === 'elementOverload' && res2Blue.tier === 2,
            msg: `2 Blue Resonance: ${res2Blue ? res2Blue.name : 'null'}`
        });

        // 3. 验证三孔终极共鸣 (三位一体: 红+绿+蓝)
        // 给 Q 槽开启第 3 孔
        g.player.tree = g.player.tree || {};
        g.player.tree.sockQ = 1; // 解锁第 3 孔
        g._grantGem('dmg');     // 红
        g._grantGem('crit');    // 绿
        g._grantGem('freeze');  // 蓝
        g._socketGem('q', 0, 'dmg');
        g._socketGem('q', 1, 'crit');
        g._socketGem('q', 2, 'freeze');
        const resTrinity = g._gemResonance(g.player, 'q');
        results.push({
            test: 'resonanceTrinity',
            pass: resTrinity && resTrinity.id === 'trinity' && resTrinity.tier === 3,
            msg: `3-Color Trinity Resonance: ${resTrinity ? resTrinity.name : 'null'}`
        });

        // 验证三位一体伤害提升乘算 1.25
        g._ctx = { slot: 'q' };
        const multWithTrinity = g._buildDmgMult(g.player, 'q');
        results.push({
            test: 'trinityDmgMult',
            pass: multWithTrinity >= 1.25,
            msg: `Trinity Dmg Mult: ${multWithTrinity.toFixed(2)}`
        });

        // 4. 验证新宝石「以血为誓」消耗生命与增伤
        g._grantGem('bloodPact');
        g._socketGem('q', 0, 'bloodPact');
        g._socketGem('q', 1, null);
        g._socketGem('q', 2, null);
        const multBloodPact = g._buildDmgMult(g.player, 'q');
        g.player.currentHealth = 50;
        g.player.skillQ.cooldown = 0;
        g._castSlot('q');
        const hpAfterBloodPact = g.player.currentHealth;
        results.push({
            test: 'bloodPactMechanics',
            pass: multBloodPact > 1.30 && hpAfterBloodPact < 50,
            msg: `BloodPact mult: ${multBloodPact.toFixed(2)}, HP before: 50, HP after: ${hpAfterBloodPact}`
        });

        // 5. 验证新宝石「震荡猛击」易伤状态挂载与「动能回馈」击杀减冲刺CD
        const dummy = new Enemy(300, 300, 'chaser', 1);
        dummy.currentHealth = 500;
        dummy.maxHealth = 500;
        g._socketGem('q', 0, 'stagger');
        g._ctx = { slot: 'q' };
        g._afterHit(g.player, dummy, 50);
        const hasVulnerable = dummy.staggerVulnerableTimer > 0;

        // 动能回馈
        g.player.dashCooldown = 2.0;
        g._socketGem('q', 0, 'momentum');
        dummy.currentHealth = 0;
        g._onEnemyKilled(dummy);
        const dashCdReduced = g.player.dashCooldown < 2.0;

        results.push({
            test: 'staggerAndMomentum',
            pass: hasVulnerable && dashCdReduced,
            msg: `Stagger Vulnerable: ${hasVulnerable}, Dash CD after kill: ${g.player.dashCooldown}`
        });

        return results;
    });

    console.log('--- 测试结果 ---');
    let allPassed = true;
    for (const r of testResults) {
        console.log(`[${r.pass ? 'PASS' : 'FAIL'}] ${r.test}: ${r.msg}`);
        if (!r.pass) allPassed = false;
    }

    // 打开构筑面板并在浏览器中截屏留存共鸣徽章与技能石界面
    await page.evaluate(() => {
        const g = window.game;
        g.openBuild();
        const tabGems = document.querySelectorAll('.build-tabs button')[1];
        if (tabGems) tabGems.click();
    });
    await page.waitForTimeout(300);
    const screenshotPath = path.join(__dirname, 'screenshot-batch8-gems-resonance.png');
    await page.screenshot({ path: screenshotPath });
    console.log('已保存共鸣面板渲染截图:', screenshotPath);

    await browser.close();
    process.exit(allPassed ? 0 : 1);
})();

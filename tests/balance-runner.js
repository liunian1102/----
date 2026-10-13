// balance-runner.js
// 5 职业 × 20 局自动化无头平衡对局模拟器:
// 1) 真实驱动 game.update(), AI 自动走位、闪避、施法、升级选卡、自动点亮天赋树
// 2) 智能点树策略: 指定目标基石(重点测试刺客信条 daK、铁壁要塞 saK、处刑者 h3K), 结合最短路与顺路大天赋/连接孔
// 3) 采集平均死亡数、通关生存率、魔王击退数与伤害输出, 评估职业平衡与新基石强度
require('./setup-env.js');
const fs = require('fs');

const CLASSES = ['warrior', 'mage', 'assassin', 'archer', 'paladin'];
const TARGET_KEYSTONES = ['daK', 'saK', 'h3K', 'sK', 'dK', 'iK']; // 重点检验三个新基石与基础基石

// 简单的确定性伪随机数生成器(保证单局可重放)
function createRng(seed) {
    let s = seed % 2147483647;
    if (s <= 0) s += 2147483646;
    return function() {
        return (s = (s * 16807) % 2147483647) / 2147483647;
    };
}

// 智能自动点树
function autoAllocateTree(game, targetKeystoneId) {
    const p = game.player;
    let pts = game._treePoints(p).free;
    if (pts <= 0) return;

    // 1. 如果尚未点出目标基石, 尝试沿最短路径点亮
    if (!p.treeNodes.has(targetKeystoneId)) {
        const path = game._treePath(p, targetKeystoneId);
        if (path && path.length > 0) {
            const allocCount = Math.min(pts, path.length);
            for (let i = 0; i < allocCount; i++) {
                const nid = path[i];
                if (game._treeCanAlloc(p, nid)) {
                    game._treeAllocate(nid);
                }
            }
        }
    }

    // 2. 如果还有剩余点数, 贪心探索并点亮邻近的高价值大天赋(notable)或连接孔(socket)
    pts = game._treePoints(p).free;
    if (pts > 0) {
        const candidates = [];
        for (const n of TREE_NODES) {
            if (game._treeCanAlloc(p, n.id)) {
                let score = 1;
                if (n.kind === 'notable') score = 4;
                else if (n.kind === 'socket') score = 3;
                else if (n.kind === 'keystone') score = 2;
                candidates.push({ id: n.id, score });
            }
        }
        candidates.sort((a, b) => b.score - a.score);
        for (const c of candidates) {
            if (game._treePoints(p).free <= 0) break;
            if (game._treeCanAlloc(p, c.id)) {
                game._treeAllocate(c.id);
            }
        }
    }
}

// 模拟单个职业单局对局
function runSimMatch(cls, seed, durationSec = 300, keystoneIndex = 0) {
    // 劫持 Math.random 为确定性种子
    const originalRandom = Math.random;
    const rng = createRng(seed);
    Math.random = rng;

    const game = new Game();
    game.init();
    game.startGame();
    game._applyClassToPlayer(game.player, cls);

    // 为该局选定一个目标基石(交替使用刺客信条、铁壁要塞、处刑者等)
    const targetKeystone = TARGET_KEYSTONES[keystoneIndex % TARGET_KEYSTONES.length];

    let deathCount = 0;
    let lastLife = game.life;

    const maxTicks = Math.round(durationSec / DT);
    let survivedTime = 0;

    for (let tick = 0; tick < maxTicks; tick++) {
        survivedTime = game.gameTime;

        // 死亡检测
        if (game.life < lastLife) {
            deathCount += (lastLife - game.life);
            lastLife = game.life;
        }

        if (game.life <= 0) {
            // 生命归零, 对局终结
            break;
        }

        // 1. 自动处理升级选卡弹窗
        if (game.showingPotentialMenu) {
            if (game.currentTalentChoices && game.currentTalentChoices.length > 0) {
                game.handlePotentialChoice(1);
            } else {
                game.handlePotentialChoice(0);
            }
        }

        // 2. 自动处理职业/进阶/觉醒
        if (game.showingClassSelection) {
            game.handleClassChoice(1);
        }

        // 3. 自动点天赋树
        if (game._treePoints().free > 0) {
            autoAllocateTree(game, targetKeystone);
        }

        // 4. AI 基础操作仿真: 瞄准与走位
        const p = game.player;
        const target = game._findClosestTarget();

        // 默认向场地中心走位或远离危险敌人
        let moveX = 0, moveY = 0;
        if (target) {
            const dx = target.x - p.x;
            const dy = target.y - p.y;
            const dist = Math.hypot(dx, dy);

            // 远程职业保持拉扯, 近战职业适度切入
            const isRanged = cls === 'mage' || cls === 'archer';
            const idealDist = isRanged ? 170 : 45;

            if (dist < idealDist - 25) {
                moveX = -dx / dist;
                moveY = -dy / dist;
            } else if (dist > idealDist + 35) {
                moveX = dx / dist;
                moveY = dy / dist;
            }

            // 紧急避险: 魔王前摇蓄力或与怪物极近时尝试冲刺闪避
            if (dist < 65 && p.dashCooldown <= 0) {
                game._requestSkill('dash');
            }

            // 自动施法 Q / E / R
            if (p.skillQ && p.skillQ.cooldown <= 0) game._requestSkill('Q');
            if (p.skillE && p.skillE.cooldown <= 0) game._requestSkill('E');
            if (p.awakened && p.ultCharge >= (p.maxUltCharge || 100)) game._requestSkill('ult');
        } else {
            const cx = game.width / 2, cy = game.height / 2;
            moveX = (cx - p.x) / 400;
            moveY = (cy - p.y) / 300;
        }

        game.keys['a'] = moveX < -0.3;
        game.keys['d'] = moveX > 0.3;
        game.keys['w'] = moveY < -0.3;
        game.keys['s'] = moveY > 0.3;

        game.update();
    }

    Math.random = originalRandom;

    return {
        cls,
        seed,
        targetKeystone,
        hasKeystone: game.player.treeNodes.has(targetKeystone),
        treeCount: game.player.treeNodes.size - 1,
        survivedTime,
        deaths: deathCount,
        bossRepels: game.runBossRepels || 0,
        score: game.score,
        level: game.level,
        finalLife: game.life
    };
}

// 主跑测流程: 5 职业 × runsPerClass
async function runBalanceSuite(runsPerClass = 20, durationSec = 300) {
    console.log(`=== 开始自动化平衡模拟 (5 职业 × ${runsPerClass} 局, 单局时长 ${durationSec}s, 共 ${5 * runsPerClass} 局) ===\n`);
    const allResults = [];
    const classStats = {};
    let matchIdx = 0;

    for (let c = 0; c < CLASSES.length; c++) {
        const cls = CLASSES[c];
        classStats[cls] = { deaths: 0, repels: 0, survived: 0, cleared: 0, runs: 0, levels: 0, trees: 0 };

        for (let seed = 1; seed <= runsPerClass; seed++) {
            const res = runSimMatch(cls, seed * 107 + c * 31, durationSec, matchIdx++);
            allResults.push(res);
            classStats[cls].runs++;
            classStats[cls].deaths += res.deaths;
            classStats[cls].repels += res.bossRepels;
            classStats[cls].survived += res.survivedTime;
            classStats[cls].levels += res.level;
            classStats[cls].trees += res.treeCount;
            if (res.finalLife > 0) classStats[cls].cleared++;
        }
        const st = classStats[cls];
        console.log(`  [完成] ${cls.toUpperCase().padEnd(9)}: 平均死亡 ${(st.deaths/st.runs).toFixed(2)}, 通关率 ${((st.cleared/st.runs)*100).toFixed(0)}%, 击退魔王 ${(st.repels/st.runs).toFixed(2)}, 平均等级 Lv${(st.levels/st.runs).toFixed(1)}`);
    }

    console.log('\n================== 职业平衡统计结果 ==================');
    console.log('职业\t\t平均死亡数\t通关率\t\t击退魔王数\t平均等级');
    for (const cls of CLASSES) {
        const st = classStats[cls];
        const avgDeaths = (st.deaths / st.runs).toFixed(2);
        const clearRate = ((st.cleared / st.runs) * 100).toFixed(1) + '%';
        const avgRepels = (st.repels / st.runs).toFixed(2);
        const avgLevel = (st.levels / st.runs).toFixed(1);
        console.log(`${cls.padEnd(10)}\t${avgDeaths}\t\t${clearRate}\t\t${avgRepels}\t\tLv ${avgLevel}`);
    }

    console.log('\n================== 新基石强度与生存对比 ==================');
    const keystoneStats = {};
    for (const k of TARGET_KEYSTONES) keystoneStats[k] = { runs: 0, reached: 0, deaths: 0, cleared: 0 };

    for (const r of allResults) {
        const ks = keystoneStats[r.targetKeystone];
        if (ks) {
            ks.runs++;
            if (r.hasKeystone) ks.reached++;
            ks.deaths += r.deaths;
            if (r.finalLife > 0) ks.cleared++;
        }
    }

    const keystoneNames = {
        daK: '刺客信条(暴击/减血)',
        saK: '铁壁要塞(减伤/减速)',
        h3K: '处刑者(斩杀/减防)',
        sK:  '狂战之魂(残血爆发)',
        dK:  '疾风之舞(闪避/减防)',
        iK:  '时空裂隙(减CD/减普攻)'
    };

    console.log('基石名称\t\t\t局数\t点亮率\t平均死亡\t通关率');
    for (const k of TARGET_KEYSTONES) {
        const ks = keystoneStats[k];
        const name = (keystoneNames[k] || k).padEnd(20);
        const reachRate = ((ks.reached / ks.runs) * 100).toFixed(1) + '%';
        const avgDeaths = (ks.deaths / ks.runs).toFixed(2);
        const clearRate = ((ks.cleared / ks.runs) * 100).toFixed(1) + '%';
        console.log(`${name}\t${ks.runs}\t${reachRate}\t${avgDeaths}\t\t${clearRate}`);
    }

    return { allResults, classStats, keystoneStats };
}

if (require.main === module) {
    const runs = process.argv.includes('--quick') ? 5 : 20;
    const dur = process.argv.includes('--quick') ? 120 : 300;
    runBalanceSuite(runs, dur)
        .then(() => process.exit(0))
        .catch(err => { console.error(err); process.exit(1); });
}

module.exports = { runSimMatch, runBalanceSuite, autoAllocateTree };

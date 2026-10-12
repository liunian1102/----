/**
 * 针对中后期可玩性核心升级 (Batch 7: 远征契约、纯横向星图分支解锁与专精系统) 的独立自动化回归测试套件
 */
const assert = require('assert');
require('./setup-env.js');
const fs = require('fs');

const code = fs.readFileSync('game.js', 'utf8');
eval(code);

console.log('=== 开始执行 Batch 7: 远征契约、纯横向星图与专精系统 自动化回归测试 ===\n');

const game = new Game();
game.init();

// -------------------------------------------------------------
// 1. 验证纯横向星图分支解锁与零基础属性污染
// -------------------------------------------------------------
console.log('1. 验证纯横向星图分支解锁与零基础属性污染...');
Metagrowth.reset();
const initialAttack = game.player.attack;
const initialDefense = game.player.defense;
const initialMaxHp = game.player.maxHealth;
const initialSpeed = game.player.speed;

// 模拟玩家获得 100 颗星核
const p = Progress.load();
p.starCores = 100;
Progress.save(p);

assert.strictEqual(Metagrowth.getAvailableStarCores(), 100, '可用星核应为 100');
assert.strictEqual(Metagrowth.isUnlocked('relic_astral'), false, '初始状态下星界暗金遗物应未解锁');

// 点亮分支：relic_astral (消耗 30)
const unlockedSuccess = Metagrowth.unlockNode('relic_astral');
assert.strictEqual(unlockedSuccess, true, '【修复确证】30 星核应成功点亮 relic_astral');
assert.strictEqual(Metagrowth.isUnlocked('relic_astral'), true, '点亮后状态应为 true');
assert.strictEqual(Metagrowth.getAvailableStarCores(), 70, '剩余可用星核应为 70 (100 - 30)');

// 确证点亮星图绝对不会污染角色的基础战斗属性！
game._initRunProgress();
assert.strictEqual(game.player.attack, initialAttack, '【纯横向确证】星图点亮后基础攻击力不得改变');
assert.strictEqual(game.player.defense, initialDefense, '【纯横向确证】星图点亮后基础防御力不得改变');
assert.strictEqual(game.player.maxHealth, initialMaxHp, '【纯横向确证】星图点亮后基础最大生命值不得改变');
assert.strictEqual(game.player.speed, initialSpeed, '【纯横向确证】星图点亮后基础移速不得改变');

// 免费重置星图并全额返还
Metagrowth.reset();
assert.strictEqual(Metagrowth.isUnlocked('relic_astral'), false, '重置后分支应为未解锁');
assert.strictEqual(Metagrowth.getAvailableStarCores(), 100, '【修复确证】免费重置必须全额返还 100 星核');
console.log('✓ 1. 纯横向星图分支点亮、零基础数值污染与免费重置全额返还验证通过！\n');

// -------------------------------------------------------------
// 2. 验证纯横向暗金遗物动态入池与专属机制
// -------------------------------------------------------------
console.log('2. 验证纯横向暗金遗物动态入池与专属机制...');
Metagrowth.reset();
let availableRelics = getAvailableRelicTypes();
assert.ok(!availableRelics.includes('astral_compass'), '未解锁时掉落池不得出现 astral_compass');
assert.ok(!availableRelics.includes('resonance_crystal'), '未解锁时掉落池不得出现 resonance_crystal');

// 点亮解锁
p.starCores = 100;
Progress.save(p);
Metagrowth.unlockNode('relic_astral');
Metagrowth.unlockNode('relic_resonance');
availableRelics = getAvailableRelicTypes();
assert.ok(availableRelics.includes('astral_compass'), '【修复确证】点亮后掉落池成功纳入 astral_compass');
assert.ok(availableRelics.includes('resonance_crystal'), '【修复确证】点亮后掉落池成功纳入 resonance_crystal');

// 验证【星界罗盘】每拾取 3 个道具释放星界冲击波
game.player.relics = ['astral_compass'];
game.player._astralCount = 0;
game.enemies = [new Enemy(game.player.x + 30, game.player.y + 30, 'chaser', 1)];
const dummyItem = new Item(game.player.x, game.player.y, 'potion');

// 拾取前 2 个道具
game.collectItem(dummyItem);
assert.strictEqual(game.player._astralCount, 1, '拾取第 1 个道具计数为 1');
game.collectItem(dummyItem);
assert.strictEqual(game.player._astralCount, 2, '拾取第 2 个道具计数为 2');

// 拾取第 3 个道具 (触发星界冲击波)
game.collectItem(dummyItem);
assert.strictEqual(game.player._astralCount, 0, '【修复确证】第 3 次触发后计数归零循环');
assert.ok(game.enemies[0].freezeTimer > 0, '【修复确证】星界冲击波成功冻结周围敌人');
console.log('✓ 2. 纯横向遗物动态入池与星界冲击波触发机制验证通过！\n');

// -------------------------------------------------------------
// 3. 验证远征契约 3 选 1 与整组重抽 1 次防刷规则
// -------------------------------------------------------------
console.log('3. 验证远征契约 3 选 1 与整组重抽 1 次防刷规则...');
const session = ExpeditionContract.initSession(game);
assert.strictEqual(session.candidates.length, 3, '【修复确证】开局必须随机生成 3 个候选契约');
assert.ok(session.candidates.includes(session.selectedId), '默认选中的契约必须在 3 个候选之中');
assert.strictEqual(session.rerolled, false, '开局免费整组重抽次数必须未消耗 (rerolled === false)');

// 首次整组重抽
const rerollSuccess = ExpeditionContract.reroll(session, game);
assert.strictEqual(rerollSuccess, true, '【修复确证】首次免费重抽必须成功');
assert.strictEqual(session.rerolled, true, '重抽后 rerolled 标志必须置为 true');
assert.strictEqual(session.candidates.length, 3, '重抽后候选依然为 3 个');

// 再次尝试重抽必须被严格拒绝
const secondReroll = ExpeditionContract.reroll(session, game);
assert.strictEqual(secondReroll, false, '【修复确证】整组重抽仅限 1 次，再次重抽必须被严格阻断');
console.log('✓ 3. 远征契约 3 选 1 与免费整组重抽 1 次防刷规则验证通过！\n');

// -------------------------------------------------------------
// 4. 验证契约目标达成判定与星核结算入档
// -------------------------------------------------------------
console.log('4. 验证契约目标达成判定与星核结算入档...');
game.player.class = 'mage';
game.player.skillQ = { cooldown: 0, maxCooldown: 3 };
game.player.skillE = { cooldown: 0, maxCooldown: 5 };
game.expeditionSession = session;
session.selectedId = 'skill_barrage'; // 释放 25 次技能
session.completed = false;
game.runSkillCastCount = 24;

assert.strictEqual(session.completed, false, '未达 25 次时契约应为未达成');

// 释放第 25 次技能
game._castSlot('q');
assert.strictEqual(game.runSkillCastCount, 25, '技能释放次数应累计至 25 次');
assert.strictEqual(session.completed, true, '【修复确证】达成条件后契约必须立即标记为已完成！');

// 验证结算产出计算与 profile 入档
const stats = game._runStats();
assert.strictEqual(stats.contractCompleted, true, '结算统计中 contractCompleted 必须为 true');
assert.ok(stats.starCoresEarned >= 15, `【修复确证】达成契约必须结算星核奖励 (当前获得: ${stats.starCoresEarned})`);

const beforeTotalCores = Progress.load().starCores || 0;
Progress.recordRun(stats);
const afterTotalCores = Progress.load().starCores || 0;
assert.strictEqual(afterTotalCores, beforeTotalCores + stats.starCoresEarned, '【修复确证】结算星核必须精确累加至持久化 Profile！');
console.log('✓ 4. 契约目标达成判定与星核结算入档全链路验证通过！\n');

// -------------------------------------------------------------
// 5. 验证纯横向职业专精变体 (class_variant) 机制
// -------------------------------------------------------------
console.log('5. 验证纯横向职业专精变体 (class_variant) 机制...');
// 补充足够星核供专精解锁测试
const p5 = Progress.load();
p5.starCores = (p5.starCores || 0) + 100;
Progress.save(p5);

// 5.1 验证战士【反击破军】
const unlockVariantSuccess = Metagrowth.unlockNode('class_variant');
assert.strictEqual(unlockVariantSuccess, true, '解锁 class_variant 应返回 true');
assert.strictEqual(Metagrowth.isUnlocked('class_variant'), true, 'class_variant 应已解锁');

const warrior = new Player(300, 300, game);
warrior.class = 'warrior';
warrior.currentHealth = 100;
warrior.maxHealth = 100;
game.player = warrior;
const nearEnemy = new Enemy(320, 300, 'chaser', 1);
nearEnemy.currentHealth = 50;
nearEnemy.x = 320;
nearEnemy.y = 300;
game.enemies = [nearEnemy];

// 模拟战士受击触发反击破军
const origRandom = Math.random;
Math.random = () => 0.1; // 强制命中 35% 几率
warrior.takeDamage(10, '敌人碰撞');
Math.random = origRandom;

assert.ok(nearEnemy.x > 320, `【修复确证】战士反击破军成功击退敌人 (敌人当前 X: ${nearEnemy.x})`);
assert.strictEqual(nearEnemy.armorDebuffTimer, 3, '【修复确证】反击破军成功施加 3 秒护甲削弱 Debuff');

// 5.2 验证法师【寒霜脉冲】
const mage = new Player(400, 400, game);
mage.class = 'mage';
mage.skillQ = { cooldown: 0, maxCooldown: 3 };
mage.skillE = { cooldown: 0, maxCooldown: 5 };
game.player = mage;
const freezeTarget = new Enemy(420, 400, 'chaser', 1);
game.enemies = [freezeTarget];
game._castSlot('q');
assert.ok((freezeTarget.freezeTimer || 0) > 0, `【修复确证】法师施法后寒霜脉冲成功冻结进入法阵的敌人 (当前冻结: ${freezeTarget.freezeTimer})`);

// 5.3 验证刺客【暗影引爆】
const assassin = new Player(500, 500, game);
assassin.class = 'assassin';
game.player = assassin;
game.projectiles = [];
const victim = new Enemy(500, 500, 'chaser', 1);
victim.currentHealth = 0;
game._onEnemyKilled(victim);
assert.strictEqual(game.projectiles.length, 4, '【修复确证】刺客击杀敌人后成功引爆 4 向暗影飞刀群！');
console.log('✓ 5. 战士反击破军、法师寒霜脉冲、刺客暗影引爆纯横向专精机制验证通过！\n');

// -------------------------------------------------------------
// 6. 验证联机 Host → Guest 远征契约快照同步
// -------------------------------------------------------------
console.log('6. 验证联机 Host → Guest 远征契约快照同步...');
game.mpMode = 'host';
game.expeditionSession = { selectedId: 'boss_duelist', completed: true };
const hostSnapshot = game.serializeState();
assert.ok(hostSnapshot.ct, '【修复确证】Host 快照必须包含契约状态 ct');
assert.strictEqual(hostSnapshot.ct[0], 'boss_duelist', '快照中契约 ID 必须为 boss_duelist');
assert.strictEqual(hostSnapshot.ct[1], 1, '快照中契约完成状态必须为 1 (完成)');

// 模拟 Guest 接收快照
const guestGame = new Game();
guestGame.init();
guestGame.mpMode = 'guest';
guestGame.applyRemoteState(hostSnapshot);
assert.ok(guestGame.expeditionSession, '【修复确证】Guest 接收快照后成功构建 expeditionSession');
assert.strictEqual(guestGame.expeditionSession.selectedId, 'boss_duelist', 'Guest 契约 ID 必须与 Host 一致');
assert.strictEqual(guestGame.expeditionSession.completed, true, 'Guest 契约完成状态必须为 true');
console.log('✓ 6. 联机 Host → Guest 远征契约快照同步与共享视野验证通过！\n');

console.log('=== 全部 Batch 7 远征契约与纯横向星图系统独立回归测试 100% 验证通过！ ===');

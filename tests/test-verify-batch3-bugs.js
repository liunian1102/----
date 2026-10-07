/**
 * 针对 Bug 13 至 Bug 16 第三批核心缺陷的独立自动化回归测试套件
 */
const assert = require('assert');
require('./setup-env.js');
const fs = require('fs');

const code = fs.readFileSync('game.js', 'utf8');
eval(code);

console.log('=== 开始执行 Bug 13 至 Bug 16 独立自动化回归测试 ===\n');

const game = new Game();
game.init();

// -------------------------------------------------------------
// 1. 验证 Bug 13: 联机模式下 Guest 倒地救援通用支持
// -------------------------------------------------------------
console.log('1. 验证 Bug 13: 多人联机 Guest 倒地灵魂信标与 Host 靠近救援...');
game.mpMode = 'host';
game.mpGuestPlayers = new Map();

// 创建一个 Guest 玩家对象
const guestPlayer = new Player(game.width / 2 + 30, game.height / 2, game);
game.mpGuestPlayers.set(1, guestPlayer);

// 模拟 Guest 玩家受到致死伤害倒地
guestPlayer.currentHealth = 0;
guestPlayer.downed = true;
guestPlayer.downedTimer = 12;
guestPlayer.rescueCharge = 0;

// 让 Host 玩家移动到倒地的 Guest 身边 (距离 <= 75px)
game.player.x = guestPlayer.x + 10;
game.player.y = guestPlayer.y + 10;

// Host 驱动一帧玩家资源更新 (模拟推进救援)
game._runAsPlayer(guestPlayer, () => {
    game._tickPlayerResources();
});

assert.ok(guestPlayer.rescueCharge > 0, `【修复确证】Host 靠近倒地 Guest 时，Guest 救援进度必须正常累加 (当前: ${guestPlayer.rescueCharge})`);

// 模拟持续救援 1.5 秒直至充满 (1.5s * 60fps = 90 frames)
for (let i = 0; i < 100; i++) {
    game._runAsPlayer(guestPlayer, () => {
        game._tickPlayerResources();
    });
}

assert.strictEqual(guestPlayer.downed, false, '【修复确证】救援充满后 Guest 必须成功战术复苏 (downed === false)');
assert.ok(guestPlayer.currentHealth > 0, `【修复确证】复苏后 Guest 血量必须恢复 (当前: ${guestPlayer.currentHealth})`);
console.log('✓ Bug 13 修复通过：联机模式下 Guest 倒地救援全链路畅通，不对称失效彻底消除！\n');

// -------------------------------------------------------------
// 2. 验证 Bug 14: 技能石「回响 (Echo)」延迟连发触发保证
// -------------------------------------------------------------
console.log('2. 验证 Bug 14: 技能石「回响」全职业施放后延迟连发动作注册...');
game.mpMode = null; // 切回单人模式
const p = game.player;
p.class = 'warrior';
p.rage = 100; // 满怒
p.skillQ.cooldown = 0;
p.gemLog = '999'; // echo Lv3
p.sockets.q = ['echo', null, null]; // Q 槽镶嵌回响
p._buildVer++;

game.pendingActions = [];
game._castSlot('q');

assert.ok(p.skillQ.cooldown > 0, '施放旋风斩后技能必须进入冷却');
const echoAction = game.pendingActions.find(act => act.delay === 0.35);
assert.ok(echoAction, '【修复确证】镶嵌回响施放技能后，pendingActions 必须成功注册 delay: 0.35 的延迟连发动作');
console.log('✓ Bug 14 修复通过：技能石「回响」0.35 秒延迟自动再放一次机制 100% 触发！\n');

// -------------------------------------------------------------
// 3. 验证 Bug 15: 远程职业无目标时的普攻朝向发射与手感回馈
// -------------------------------------------------------------
console.log('3. 验证 Bug 15: 远程职业在全场无敌人时的普攻发射...');
p.class = 'archer';
p.arrows = 5;
game.enemies = []; // 全场无敌人
game.boss = null;
game.projectiles = [];

// 玩家静止时射击
game.shoot();
assert.ok(game.projectiles.length > 0, '【修复确证】全场无怪物时射击不再直接静默吞没，必须成功发射子弹');
const shotProj = game.projectiles[0];
assert.ok(shotProj.dx > 0 && Math.abs(shotProj.dy) < 0.001, `静止时默认向前朝右发射 (dx: ${shotProj.dx}, dy: ${shotProj.dy})`);

// 玩家向上移动时射击 (vx = 0, vy = -5)
game.projectiles = [];
p.vx = 0; p.vy = -5;
game.shoot();
assert.ok(game.projectiles.length > 0, '移动中必须成功发射子弹');
const shotMovingProj = game.projectiles[0];
assert.ok(Math.abs(shotMovingProj.dx) < 0.001 && shotMovingProj.dy < 0, `移动中沿移动方向向上发射 (dx: ${shotMovingProj.dx}, dy: ${shotMovingProj.dy})`);
console.log('✓ Bug 15 修复通过：远程职业空挥普攻手感回馈生效，射击体验连续流畅！\n');

// -------------------------------------------------------------
// 4. 验证 Bug 16: 法师魔力涌注 Q 宝石并入普攻生效
// -------------------------------------------------------------
console.log('4. 验证 Bug 16: 法师开启「魔力涌注」开关后 Q 宝石并入普攻...');
p.class = 'mage';
p.gemLog = '666'; // crit Lv3
p.sockets.q = ['crit', null, null]; // Q 槽镶嵌暴击强化
p._buildVer++;

// 未开启魔力涌注时
p.qToggleActive = false;
let gemMap = game._gemMap(p);
assert.strictEqual(gemMap.a.crit, undefined, '未开启魔力涌注时普攻 map.a 不应包含 Q 位的 crit');

// 开启魔力涌注
p.qToggleActive = true;
gemMap = game._gemMap(p);
assert.strictEqual(gemMap.a.crit, 3, '【修复确证】开启魔力涌注后，Q 位的暴击强化 Lv3 必须成功并入普攻 map.a');
console.log('✓ Bug 16 修复通过：法师魔力涌注开关激活时 Q 位技能石稳定并入普攻！\n');

console.log('=== 全部第三批核心缺陷 (Bug 13 ~ Bug 16) 自动化回归测试 100% 通过！ ===');

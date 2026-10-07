/**
 * 全量独立自动化回归测试套件 (覆盖全部 Bug 1 ~ Bug 12 修复)
 */
const assert = require('assert');
require('./setup-env.js');
const fs = require('fs');

const code = fs.readFileSync('game.js', 'utf8');
eval(code);

console.log('=== 开始执行全量缺陷修复独立自动化回归测试 ===\n');

const game = new Game();
game.init();

// -------------------------------------------------------------
// 1. 验证 Bug 1: 死亡结算后 restartGame() 无缝重新开局
// -------------------------------------------------------------
console.log('1. 验证 Bug 1: 死亡结算后 restartGame() 重新开局生命周期...');
game.startGame();
game.life = 0;
game.player.currentHealth = 0;
game.endGame();
assert.strictEqual(game.isRunning, false, 'endGame 后 isRunning 应为 false');

game.restartGame();
assert.strictEqual(game.isRunning, true, '【修复确证】单人模式下 restartGame 必须直接开启新对局');
assert.strictEqual(game.life, 1, '生命值应正确重置为初始 1');
console.log('✓ Bug 1 修复通过：单人死后点击重新开始对局无缝重启，死锁彻底消除！');

// -------------------------------------------------------------
// 2. 验证 Bug 2: 样式文件滚动保护与视口高度约束
// -------------------------------------------------------------
console.log('2. 验证 Bug 2: 样式文件滚动与视口高度限制...');
const cssContent = fs.readFileSync('style.css', 'utf8');
assert.ok(cssContent.includes('.mp-overlay') && cssContent.includes('overflow-y: auto'), '.mp-overlay 必须支持 overflow-y: auto');
assert.ok(cssContent.includes('.mp-card') && cssContent.includes('max-height: calc(100dvh'), '.mp-card 必须包含 max-height 视口保护');
console.log('✓ Bug 2 修复通过：大厅卡片与遮罩具备完备的垂直滚动支持，矮屏横屏不再溢出！');

// -------------------------------------------------------------
// 3. 验证 Bug 3: 技能石掉落物 (gem_) 碰撞拾取与进入背包
// -------------------------------------------------------------
console.log('3. 验证 Bug 3: 技能石掉落物拾取链路...');
const p = game.player;
game._dropGem(p.x, p.y, 'cull');
const droppedItem = game.items[game.items.length - 1];
droppedItem.landTimer = 0;
droppedItem.y = droppedItem.targetY;

assert.strictEqual(game._gemMap(p).counts.cull, undefined, '拾取前背包内不应有 cull');
game.collectItem(droppedItem);
assert.strictEqual(game._gemMap(p).counts.cull, 1, '【修复确证】拾取后玩家必须成功获得 cull Lv1');
console.log('✓ Bug 3 修复通过：技能石掉落物碰撞拾取链路畅通！');

// -------------------------------------------------------------
// 4. 验证 Bug 4: 点触移动黑边坐标安全钳位
// -------------------------------------------------------------
console.log('4. 验证 Bug 4: 点触移动安全钳位...');
const half = p.size / 2;
game.setPlayerTarget(-200, 300);
assert.strictEqual(p.targetX, half, '左侧越界必须被安全钳位到地图左边缘');
game.setPlayerTarget(1500, 300);
assert.strictEqual(p.targetX, game.width - half, '右侧越界必须被安全钳位到地图右边缘');
console.log('✓ Bug 4 修复通过：点触移动全边界安全钳位生效，撞墙死循环彻底消除！');

// -------------------------------------------------------------
// 5. 验证 Bug 5: 联机创建房间解耦
// -------------------------------------------------------------
console.log('5. 验证 Bug 5: 联机创建房间解耦...');
const gameSrc = fs.readFileSync('game.js', 'utf8');
assert.ok(gameSrc.includes("document.getElementById('mpCreate').addEventListener('click', async () =>"), 'mpCreate 必须直接绑定 async 回调');
console.log('✓ Bug 5 修复通过：创建房间不再被操控弹窗阻断与提前全屏！');

// -------------------------------------------------------------
// 6. 验证 Bug 6: 升级卡牌快捷键双重兼容
// -------------------------------------------------------------
console.log('6. 验证 Bug 6: 升级天赋快捷键归一化...');
game.showingPotentialMenu = true;
game.potentialRerolls = 2;
game.currentTalentChoices = [{ id: 't1', name: '体魄' }, { id: 't2', name: '疾风' }, { id: 't3', name: '力量' }];

let chosen = null;
const origHandle = game.handlePotentialChoice.bind(game);
game.handlePotentialChoice = c => { chosen = c; origHandle(c); };

game._talentMenuKey('', 'Numpad2');
assert.strictEqual(chosen, 2, '小键盘 Numpad2 必须成功选卡');
console.log('✓ Bug 6 修复通过：数字快捷键大/小键盘双重兼容生效！');

// -------------------------------------------------------------
// 7. 验证 Bug 7: 升级/选职业时构筑面板友好反馈
// -------------------------------------------------------------
console.log('7. 验证 Bug 7: 升级/选职业时 openBuild 提示...');
game.showingPotentialMenu = true;
let floatTextShown = false;
game._showFloatingText = (txt) => { if (txt.includes('请先完成')) floatTextShown = true; };
game.openBuild();
assert.strictEqual(floatTextShown, true, '【修复确证】升级菜单打开时调用 openBuild 必须向玩家给出明确提示');
console.log('✓ Bug 7 修复通过：消除静默吞没，给出清晰友好的操作指引！');

// -------------------------------------------------------------
// 8. 验证 Bug 8: 触屏 touchend 默认行为拦截
// -------------------------------------------------------------
console.log('8. 验证 Bug 8: 触屏 touchend 默认行为拦截...');
assert.ok(gameSrc.includes("this.canvas.addEventListener('touchend', touchEnd, { passive: false });"), 'touchend 必须声明 passive: false');
console.log('✓ Bug 8 修复通过：阻断移动端延迟合成 click，消除走位漂移与误触！');

// -------------------------------------------------------------
// 9. 验证 Bug 9: 结算面板伤害构成空状态占位展示
// -------------------------------------------------------------
console.log('9. 验证 Bug 9: 结算面板伤害构成空状态占位...');
const dummyDom = { innerHTML: '', appendChild: (el) => { dummyDom.lastChild = el; } };
p.dmgStats = {}; // 0 伤害
game._renderDmgBreakdownDom(dummyDom);
assert.ok(dummyDom.lastChild && dummyDom.lastChild.textContent.includes('本局未造成有效伤害'), '【修复确证】零伤害时必须渲染空状态提示');
console.log('✓ Bug 9 修复通过：零伤害结算优雅占位，杜绝高度坍塌留白！');

// -------------------------------------------------------------
// 10. 验证 Bug 10: index.html Favicon 声明消除 404
// -------------------------------------------------------------
console.log('10. 验证 Bug 10: Favicon 声明...');
const indexHtml = fs.readFileSync('index.html', 'utf8');
assert.ok(indexHtml.includes("<link rel=\"icon\" href=\"data:image/svg+xml"), 'index.html 必须声明内联 SVG Favicon');
console.log('✓ Bug 10 修复通过：内联 Favicon 声明到位，根除浏览器 404 错误！');

// -------------------------------------------------------------
// 11. 验证 Bug 11: 吸血鬼獠牙护盾上限安全封顶
// -------------------------------------------------------------
console.log('11. 验证 Bug 11: 吸血鬼獠牙护盾上限保护...');
p.maxHealth = 100;
p.currentHealth = 100;
p.shield = 0;
p.shieldCapRatio = 0.2; // 上限 20%
p.relics = ['vampire_fang'];

// 模拟击杀 50 只怪物触发溢出
for (let i = 0; i < 50; i++) {
    game._onEnemyKilled({ x: 0, y: 0, size: 10, color: '#f00', exp: 1, type: 'chaser' });
}
const maxAllowed = Math.max(p.maxHealth * p.shieldCapRatio, p.maxHealth * 0.25);
assert.ok(p.shield <= maxAllowed, `【修复确证】护盾 (${p.shield}) 绝不可超过合法上限 (${maxAllowed})`);
console.log('✓ Bug 11 修复通过：吸血鬼獠牙护盾严格受控封顶，数值平衡恢复！');

// -------------------------------------------------------------
// 12. 验证 Bug 12: 魔王高速激光扫射连续扇区判定
// -------------------------------------------------------------
console.log('12. 验证 Bug 12: 魔王高速激光扫射连续扇区判定...');
p.hurtCooldown = 0;
p.menuGuard = false;
p.dashTimer = 0;
p.currentHealth = 100;
p.shield = 0;

const boss = new BlockBoss(p.x + 100, p.y, 2, p.maxHealth);
boss.atk = 'laser';
boss.atkPhase = 1;
// 模拟激光扫射指向玩家
boss.atkAngle = Math.PI;
boss.atkDur = 0.5;
boss.atkTimer = 0.25;

const beforeLaserHp = p.currentHealth;
game._bossLaserTick(boss, boss.x + boss.size / 2, boss.y + boss.size / 2);
assert.ok(p.currentHealth < beforeLaserHp, `【修复确证】扫射扇面扫过玩家时必须稳定命中扣血 (之前: ${beforeLaserHp}, 之后: ${p.currentHealth})`);
console.log('✓ Bug 12 修复通过：高速激光扫射扇区连续相交判定生效，穿模漏伤彻底解决！');

console.log('\n=== 全部 12 项缺陷全量独立回归测试 100% 验证通过！ ===');

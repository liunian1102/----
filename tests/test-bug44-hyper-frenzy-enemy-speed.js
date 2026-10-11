// test-bug44-hyper-frenzy-enemy-speed.js
// 回归测试:缺陷已修复,修复仍有效时退出码为 0(原为「捕获缺陷」脚本,缺陷存在时才返回 0)
require('./setup-env.js');

const game = new Game();
game.init(); game.startGame();
game.mutations = ['hyper_frenzy'];

// 生成一只追踪者小怪
const enemy = game._newEnemy(200, 200, 'chaser');
const baseSpeed = 2.5 * game.difficulty; // 正常追踪者基础移速

console.log(`狂暴极速突变下, 敌人基础移速: ${baseSpeed}, 实际移速: ${enemy.speed}`);
console.log("敌人移速 +35% 是否完全未实现:", Math.abs(enemy.speed - baseSpeed) < 0.01);

const boosted = Math.abs(enemy.speed - baseSpeed * 1.35) < 0.01;
console.log("Bug 44 回归 (狂暴极速突变让敌人移速 +35%):", boosted ? "PASS" : "FAIL");
process.exit(boosted ? 0 : 1);

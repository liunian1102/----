// test-bug20-abyss-guest-portal.js
require('./setup-env.js');

const hostGame = new Game();
hostGame.init(); hostGame.startGame();
hostGame.mpMode = 'host';
hostGame.diffMode = 'abyss';
hostGame.abyssFloor = 1;
hostGame.abyssPortal = { x: 400, y: 300, radius: 45, spawnTimer: 0 };

// 房主在屏幕角落 (100, 100)
hostGame.player.x = 100; hostGame.player.y = 100;

// 创建客机玩家，正站在传送门中心 (400, 300)
const guestPlayer = hostGame._mpGuestPlayer(1);
guestPlayer.x = 400; guestPlayer.y = 300;

console.log("深渊当前层数:", hostGame.abyssFloor);
// 运行一次深渊模式判定
hostGame._updateAbyssMode();

console.log("客机玩家站在传送门中心时, 深渊层数是否跨入下一层:", hostGame.abyssFloor);
console.log("Bug 20 验证结果 (客机踏入传送门被完全无视):", hostGame.abyssFloor === 1 ? "PASS (成功捕获缺陷)" : "FAIL");

process.exit(hostGame.abyssFloor === 1 ? 0 : 1);

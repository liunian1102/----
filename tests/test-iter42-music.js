// test-iter42-music.js
// 1) 背景音乐情绪:大厅 lobby / 战斗 run / 魔王预警与战斗 boss;暂停时压低(duck)
// 2) 音乐开关写入 localStorage(blockrun.music),暂停面板有对应按钮
// 3) 每种情绪一个小节内各步都能排程(用假的 AudioContext 记录振荡器数量,确认有铺底、琶音、低音和鼓)
require('./setup-env.js');
const results = [];
const check = (name, ok, msg) => results.push([name, ok, msg]);

{
    const game = new Game(); game.init();
    const lobby = game._musicMood().mood;
    game.startGame();
    const run = game._musicMood().mood;
    game.bossState = 'warning';
    const warn = game._musicMood().mood;
    game.bossState = 'active';
    const active = game._musicMood().mood;
    game.bossState = 'retreating';
    const after = game._musicMood().mood;
    game.isPaused = true;
    const duck = game._musicMood().duck;
    check('音乐情绪', lobby === 'lobby' && run === 'run' && warn === 'boss' && active === 'boss' && after === 'run' && duck === true,
        `${lobby}/${run}/${warn}/${active}/${after} 暂停压低 ${duck}`);
}

{
    const before = Music.enabled;
    Music.toggle();
    const stored = Store.get('blockrun.music', null);
    Music.toggle();
    const game = new Game(); game.init(); game.startGame();
    game.isPaused = true; game._menu = { w: 800, h: 600, s: 1, ox: 0, oy: 0 };
    game._renderPauseOverlay();
    const hasBtn = (game.buttons || []).some(b => b.choice === 'music');
    check('音乐开关', stored === !before && Music.enabled === before && hasBtn, `切换后存储 ${stored},暂停面板按钮 ${hasBtn}`);
}

{
    // 假的音频节点:只统计创建了多少振荡器 / 噪声源
    let osc = 0, noise = 0;
    const node = () => ({ connect() {}, gain: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime() {} },
        frequency: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} }, detune: { setValueAtTime() {} }, start() {}, stop() {} });
    const fake = {
        currentTime: 0, sampleRate: 100, state: 'running',
        createOscillator() { osc++; return node(); }, createGain: node, createBiquadFilter: node,
        createBufferSource() { noise++; return node(); }, createBuffer() { return { getChannelData: () => new Float32Array(100) }; }
    };
    const realCtx = Sound.ctx, realBuf = Sound._noiseBuf;
    Sound.ctx = fake; Sound._noiseBuf = null;
    Music.gain = node(); Music.padFilter = node();
    const counts = {};
    for (const mood of ['lobby', 'run', 'boss']) {
        osc = 0; noise = 0; Music._bar = 0;
        for (let s = 0; s < 16; s++) Music._playStep(Music.MOODS[mood], s, s * 0.1);
        counts[mood] = [osc, noise];
    }
    Sound.ctx = realCtx; Sound._noiseBuf = realBuf; Music.gain = null; Music.padFilter = null;
    // lobby:6 个铺底 + 8 个琶音;run:+16 琶音 +8 低音 +2 底鼓 +2 军鼓音 / 噪声 +4 镲;boss 更密
    check('各情绪排程', counts.lobby[0] === 14 && counts.lobby[1] === 0 && counts.run[0] > 30 && counts.run[1] >= 6 && counts.boss[0] > counts.run[0],
        JSON.stringify(counts));
}

for (const [name, ok, msg] of results) console.log(ok ? 'PASS' : 'FAIL', name, '-', msg);
process.exit(results.every(r => r[1]) ? 0 : 1);

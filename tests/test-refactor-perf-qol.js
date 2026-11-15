const test = require('node:test');
const assert = require('node:assert/strict');
require('./setup-env.js');

test('Particle pool recycles dead particles and reuses allocations', () => {
    const g = new Game();
    g.particles = [];
    g._particlePool = [];

    g.spawnHitParticles(100, 100, '#00e5ff', 10);
    assert.equal(g.particles.length, 10);
    const firstBatchRefs = [...g.particles];

    // Force particles to expire on next updateParticles
    for (const p of g.particles) {
        p.life = 0.01;
        p.decay = 0.05;
    }
    g.updateParticles();
    assert.equal(g.particles.length, 0);
    assert.equal(g._particlePool.length, 10);

    // Next spawn should reuse objects from the pool
    g.spawnParticles(200, 200, '#ffd740', 5, 1, 2, 2, 4, 0.05);
    assert.equal(g.particles.length, 5);
    assert.equal(g._particlePool.length, 5);
    for (const p of g.particles) {
        assert.ok(firstBatchRefs.includes(p), 'Expected particle instance to be reused from pool');
    }
});

test('Auto-socket and clear-all gems manage skill gem sockets cleanly', () => {
    const g = new Game();
    g.startGame();
    const p = g.player;
    p.class = 'mage';
    g._grantGem('pierce');
    g._grantGem('cd');
    g._grantGem('aoe');

    g._clearAllGems();
    const socketedAfterClear = ['a', 'q', 'e'].flatMap(s => p.sockets[s]).filter(Boolean);
    assert.equal(socketedAfterClear.length, 0, 'Expected _clearAllGems to remove all socketed gems');

    g._autoSocketAllGems();
    const socketedAfterAuto = ['a', 'q', 'e'].flatMap(s => p.sockets[s]).filter(Boolean);
    assert.ok(socketedAfterAuto.length > 0, 'Expected _autoSocketAllGems to socket compatible gems');
});

test('Damage trail bar (_hpTrail) smoothly decays after taking damage', () => {
    const g = new Game();
    g.startGame();
    const p = g.player;
    p.maxHealth = 100;
    p.currentHealth = 100;
    p.render(g.ctx);
    assert.equal(p._hpTrail, 1);

    p.currentHealth = 50;
    p.render(g.ctx);
    assert.ok(p._hpTrail > 0.5 && p._hpTrail < 1, 'Expected player _hpTrail to decay smoothly toward new health ratio');

    g.bossState = 'active';
    g.boss = new BlockBoss(400, 300, 1);
    g.boss.maxHealth = 1000;
    g.boss.currentHealth = 1000;
    g._withHud(() => g._renderBossHUD());
    assert.equal(g.boss._hpTrail, 1);

    g.boss.currentHealth = 400;
    g._withHud(() => g._renderBossHUD());
    assert.ok(g.boss._hpTrail > 0.4 && g.boss._hpTrail < 1, 'Expected boss _hpTrail to decay smoothly');
});

test('Fast item merge combines nearby stackable items within 75px', () => {
    const g = new Game();
    const a = new Item(100, 100, 'potion');
    const b = new Item(130, 140, 'potion'); // distance = 50 <= 75
    a.landTimer = 0;
    b.landTimer = 0;
    g.items = [a, b];

    g._mergeNearbyItems();
    assert.equal(g.items.length, 1);
    assert.equal(g.items[0].stackCount, 2);
});

test('Newly unlocked achievements get ach-new breathing class and SVG micro-animations in achList', () => {
    global.localStorage.clear();
    const fresh = Progress.checkAchievements({ score: 1200, time: 65, level: 4, bossRepels: 1, cls: 'mage' });
    assert.ok(fresh.length >= 2, 'Expected achievements to unlock');
    const profile = Progress.load();
    for (const a of fresh) {
        assert.equal(Progress.isNewlyUnlocked(a.id, profile), true, `Expected ${a.id} to be marked newly unlocked`);
    }
    renderProgressPanel();
});

test('Mobile portrait viewport (390x844, touch, DPR 2) positions HUD and awakened skills without overlap', () => {
    const prevW = window.innerWidth, prevH = window.innerHeight, prevDpr = window.devicePixelRatio;
    window.innerWidth = 390;
    window.innerHeight = 844;
    window.devicePixelRatio = 2;
    window.ontouchstart = () => {};
    navigator.maxTouchPoints = 5;

    try {
        const g = new Game();
        g.init();
        g.isRunning = true;
        g.player.class = 'warrior';
        g.player.spec = 'berserker';
        g.player.awakened = true;
        g.bossState = 'active';
        g.boss = new BlockBoss(400, 300, 1);

        g.skillButtons = [];
        let hudSnap = null;
        g._withHud(() => {
            hudSnap = { ...g._hud };
            g._renderStatsHUD();
            g._renderContractHUD();
            g._renderBossHUD();
            g._renderMuteButton();
            g._renderSkillHUD();
            g._renderDashButton();
            g._renderBuildButton();
        });

        assert.equal(hudSnap.isPortrait, true, 'Expected _hud.isPortrait to be true on 390x844');
        assert.ok(hudSnap.w > 320 && hudSnap.w < 420, `Expected compact portrait HUD width, got ${hudSnap.w}`);

        const qBtn = g.skillButtons.find(b => b.skill === 'Q');
        const eBtn = g.skillButtons.find(b => b.skill === 'E');
        const ultBtn = g.skillButtons.find(b => b.skill === 'ult');
        const buildBtn = g.skillButtons.find(b => b.skill === 'build');
        const dashBtn = g.skillButtons.find(b => b.skill === 'dash');
        assert.ok(qBtn && eBtn && ultBtn && buildBtn && dashBtn, 'Expected Q, E, ult, build, and dash buttons to be registered');
        // In compact portrait HUD, ult is placed on the upper arc row beside build, above Q/E, keeping the left half clear for joystick
        assert.ok(ultBtn.hcy < qBtn.hcy, 'Expected awakened ult button to be on upper action row in portrait');
        assert.ok(ultBtn.hcx > hudSnap.w * 0.4, 'Expected awakened ult button to stay out of the left joystick zone in default layout');
    } finally {
        window.innerWidth = prevW;
        window.innerHeight = prevH;
        window.devicePixelRatio = prevDpr;
        delete window.ontouchstart;
        navigator.maxTouchPoints = 0;
    }
});

test('Evolution Recipe Codex (_getEvolutionCodex & _statsRefresh) tracks legendary prerequisites and awakened gears', () => {
    const g = new Game();
    g.init();
    g.startGame();
    const p = g.player;
    p.acquiredTalents = [{ id: 'blade', count: 3 }, { id: 'berserk', count: 1 }];
    g._equipGear('blade');
    g._equipGear('blade'); // level 2 awakened gear

    const codex = g._getEvolutionCodex(p);
    assert.equal(codex.legendaries.length, 8, 'Expected all 8 legendary evolutions in codex');
    assert.equal(codex.gears.length, 5, 'Expected all 5 awakened gear recipes in codex');

    const swordSaint = codex.legendaries.find(x => x.id === 'swordSaint');
    assert.ok(swordSaint && swordSaint.ready && !swordSaint.unlocked, 'Expected swordSaint to be marked ready when blade x3 + berserk x1 are met');
    assert.equal(codex.legendaries[0].id, 'swordSaint', 'Expected ready evolution to sort to top of codex');

    const bladeGear = codex.gears.find(x => x.type === 'blade');
    assert.ok(bladeGear && bladeGear.active && bladeGear.awakened, 'Expected blade gear to show awakened status');

    g._statsRefresh();
});

test('Frost Titan boss form (form === "frost") spawns on wave 6+, casts glacier nova/lances/frost-zones, and syncs via snapshot', () => {
    const g = new Game();
    g.init();
    g.startGame();
    g.bossWave = 5;
    g._spawnBoss();
    const b = g.boss;
    assert.equal(b.form, 'frost', 'Expected wave 6 boss to spawn as frost form');
    assert.equal(b.isFrost, true);
    assert.equal(b.title, '冰霜泰坦');

    // Position player near boss and trigger glacier attack release
    const p = g.player;
    b.x = 300;
    b.y = 260;
    p.x = 340;
    p.y = 280;
    p.hurtCooldown = 0;
    p.dashTimer = 0;
    const hpBefore = p.currentHealth;
    g.enemyBullets = [];
    g.meteors = [];

    b.atk = 'glacier';
    b.atkPhase = 0;
    b.atkDur = 0.9;
    b.atkTimer = 0.01;
    b.renderTelegraph(g.ctx);
    b.render(g.ctx);

    g._updateBossAttacks(p);
    assert.ok(p.currentHealth < hpBefore, 'Expected Frost Nova to damage nearby player');
    assert.ok((p._frostSlowTimer || 0) >= 2.0, 'Expected Frost Nova to apply chill slow timer to player');
    assert.equal(g.enemyBullets.length, 6, 'Expected glacier attack to fire 6 radial frost lances');
    const frostZones = g.meteors.filter(m => m.v === 2);
    assert.equal(frostZones.length, 2, 'Expected glacier attack to spawn 2 frost zones (v === 2)');

    // Verify multiplayer snapshot sync for Frost Titan and frost zones
    const snap = g.serializeState();
    const guest = new Game();
    guest.init();
    guest.mpMode = 'guest';
    guest.applyRemoteState(snap);
    assert.equal(guest.boss.form, 'frost');
    assert.equal(guest.boss.title, '冰霜泰坦');
    assert.ok(guest.meteors.some(m => m.v === 2), 'Expected frost zones (v === 2) to sync to guest');

    // Tick frost zones to detonation
    p.hurtCooldown = 0;
    p._frostSlowTimer = 0;
    p.x = frostZones[0].x - p.size / 2;
    p.y = frostZones[0].y - p.size / 2;
    const hpBeforeZone = p.currentHealth;
    for (let i = 0; i < 90; i++) g._updateMeteors();
    assert.ok(p.currentHealth < hpBeforeZone && p._frostSlowTimer >= 1.5, 'Expected frost zone detonation to damage and chill player');
});

test('Haptics controller persists toggle state and integrates with pause menu', () => {
    Haptics.setEnabled(true);
    assert.equal(Haptics.enabled, true);
    assert.ok(Haptics.pulse('dodge'));
    assert.equal(Haptics.lastPulse.kind, 'dodge');

    Haptics.toggle();
    assert.equal(Haptics.enabled, false);
    assert.equal(Store.get('blockrun.haptics'), false);
    assert.equal(Haptics.pulse('ult'), false, 'Expected Haptics.pulse to return false when disabled');

    const g = new Game();
    g.init();
    g.startGame();
    g.gameScale = 1;
    g.gameOffsetX = 0;
    g.gameOffsetY = 0;
    g._menu = { w: 800, h: 600, s: 1, ox: 0, oy: 0 };
    g._renderPauseOverlay();
    const hapBtn = g.buttons.find(b => b.choice === 'haptics');
    assert.ok(hapBtn, 'Expected pause overlay to include haptics toggle button');
    g._handlePauseClick(hapBtn.x + 5, hapBtn.y + 5);
    assert.equal(Haptics.enabled, true, 'Expected clicking haptics pause button to re-enable Haptics');
});

test('Talent Tree Archetype Presets & Custom Build Save/Apply allocate connected path and sockets', () => {
    global.localStorage.clear();
    const g = new Game();
    g.init();
    g.startGame();
    const p = g.player;
    g.level = 10; // grants free talent tree points via _treePoints(p)

    const allocCount = g._treeApplyPreset('sockets');
    assert.ok(allocCount >= 4, `Expected sockets preset to allocate >= 4 nodes when free points available, got ${allocCount}`);
    assert.ok(p.treeNodes.has('sSk') || p.treeNodes.has('dSk') || p.treeNodes.has('iSk'), 'Expected at least one socket node allocated');

    // Save current build as custom preset, reset, and restore
    const savedList = g._treeSaveCustomPreset();
    assert.ok(Array.isArray(savedList) && savedList.length === allocCount, 'Expected _treeSaveCustomPreset to save current allocated nodes');
    const savedCount = p.treeNodes.size;
    g._treeReset();
    assert.equal(p.treeNodes.size, 1, 'Expected _treeReset to reset treeNodes back to start node');

    const restoredCount = g._treeApplyPreset('custom');
    assert.equal(restoredCount, allocCount, 'Expected custom preset to restore saved node path');
    assert.equal(p.treeNodes.size, savedCount, 'Expected custom preset to restore exact saved node count');
});

test('Gem Resonance Recipe Codex & One-Tap Auto-Socket sockets matching color recipe into skill slot', () => {
    const g = new Game();
    g.init();
    g.startGame();
    const p = g.player;
    p.class = 'warrior';
    // Unlock 3rd socket on Q via sSk (p.tree.sockQ = 1)
    p.tree.sockQ = 1;
    p.gemLog = '';
    p.sockets = { a: [null, null, null], q: [null, null, null], e: [null, null, null] };

    // Grant 1 red ('dmg'), 1 green ('crit'), 1 blue ('freeze') gem and clear auto-placement
    g._grantGem('dmg');
    g._grantGem('crit');
    g._grantGem('freeze');
    g._clearAllGems();

    const codexBefore = g._getGemResonanceCodex(p);
    assert.equal(codexBefore.length, 7, 'Expected all 7 gem resonance recipes in codex');
    const trinityBefore = codexBefore.find(r => r.id === 'trinity');
    assert.ok(trinityBefore && trinityBefore.candidateSlot === 'q' && !trinityBefore.activeSlot, 'Expected trinity recipe to find candidateSlot q when R+G+B gems and 3 sockets are available');

    const ok = g._applyGemResonanceRecipe('trinity', 'q');
    assert.equal(ok, true, 'Expected _applyGemResonanceRecipe("trinity", "q") to return true');

    const activeRes = g._gemResonance(p, 'q');
    assert.ok(activeRes && activeRes.id === 'trinity' && activeRes.name === '三位一体', 'Expected slot Q to activate 三位一体 resonance');
});

test('Relic Ash Reforge and Batch Dismantle convert idle bag relics into ash and forge new relics', () => {
    const g = new Game();
    g.init();
    g.startGame();
    const p = g.player;
    p.relics = ['thunder_ring'];
    p.relicBag = ['vampire_fang', 'chrono_watch'];
    p.relicEmpowers = {};
    p.relicAsh = 0;

    const dismantled = g._dismantleUnempoweredBagRelics();
    assert.equal(dismantled, 2, 'Expected batch dismantle to dismantle 2 unempowered bag relics');
    assert.equal(p.relicBag.length, 0);
    assert.equal(p.relicAsh, 2, 'Expected +2 relicAsh from batch dismantle');

    const forgedId = g._reforgeRelicWithAsh();
    assert.ok(typeof forgedId === 'string' && forgedId.length > 0, 'Expected _reforgeRelicWithAsh to forge a new relic ID with 2 ash');
    assert.equal(p.relicAsh, 0, 'Expected 2 relicAsh to be consumed');
    assert.ok(p.relicBag.includes(forgedId) || p.relics.includes(forgedId), 'Expected forged relic to be placed in equip or bag');
});

test('Metagrowth progress summary and unlockRecommended prioritize lowest-cost star nodes', () => {
    global.localStorage.clear();
    Progress.save({ starCores: 50 });
    Metagrowth.reset();

    const before = Metagrowth.getProgressSummary();
    assert.equal(before.unlocked, 0);
    assert.equal(before.total, 6);
    assert.equal(before.available, 50);

    const unlockedKey = Metagrowth.unlockRecommended();
    assert.equal(unlockedKey, 'class_variant', 'Expected unlockRecommended to unlock highest-priority affordable branch');

    const after = Metagrowth.getProgressSummary();
    assert.equal(after.unlocked, 1, 'Expected unlocked branch count to increment by 1');
});

test('Ancient Forge event (forge) channels near anvil, awakens gear to Lv2, grants relicAsh & gem, and syncs via snapshot', () => {
    const g = new Game();
    g.init();
    g.startGame();
    const p = g.player;
    g._equipGear('blade');
    assert.equal(p.gear.level, 1, 'Expected initial gear to be Lv1');

    g._startEvent('forge');
    const ev = g.event;
    assert.equal(ev.type, 'forge');
    assert.ok(ev.fx > 0 && ev.fy > 0, 'Expected forge anvil coordinates to be placed');

    // Position player inside forge circle and channel to completion
    p.x = ev.fx - p.size / 2;
    p.y = ev.fy - p.size / 2;
    const ashBefore = p.relicAsh || 0;
    const gemsBefore = (p.gemLog || '').length;

    for (let i = 0; i < 90 && !ev.forged; i++) {
        g._tickForge(ev);
    }
    assert.equal(ev.forged, true, 'Expected forge event to complete channeling');
    assert.equal(p.gear.level, 2, 'Expected active gear to be awakened to Lv2');
    assert.equal(p.relicAsh, ashBefore + 1, 'Expected +1 relicAsh from Ancient Forge');
    const gemsAfter = (p.gemLog || '').length;
    assert.equal(gemsAfter, gemsBefore + 1, 'Expected +1 skill gem from Ancient Forge');
    assert.equal(g.forgesCompletedCount, 1, 'Expected forgesCompletedCount to increment');

    // Render and snapshot sync check
    g._renderForge(g.ctx);
    const snap = g.serializeState();
    const guest = new Game();
    guest.init();
    guest.mpMode = 'guest';
    guest.applyRemoteState(snap);
    assert.equal(guest.event.type, 'forge');
    assert.equal(guest.event.forged, true);
});

test('Prism Sentinel enemy (prism) reduces damage in state 0, fires laser beam after lock-on, and takes +35% overheat damage in state 2', () => {
    const g = new Game();
    g.init();
    g.startGame();
    const p = g.player;
    p.x = 300;
    p.y = 300;
    p.hurtCooldown = 0;
    p.dashTimer = 0;

    const prism = new Enemy(200, 300, 'prism', 1);
    g.enemies.push(prism);

    // State 0: Refraction Shield (-30% damage before defense)
    prism.state = 0;
    const dmgState0 = prism.takeDamage(50);
    // 50 * 0.7 - 3 = 32
    assert.equal(Math.round(dmgState0), 32, 'Expected state 0 refraction shield to reduce incoming damage by 30%');

    // State 1 -> Stun interrupt into State 2 overheat
    prism.prismCD = 0;
    prism.updatePrism(p.x, p.y, g.width, g.height, p.size);
    assert.equal(prism.state, 1, 'Expected prism to enter state 1 lock-on');
    prism.stunTimer = 0.5;
    prism.update(p.x, p.y, g.width, g.height, p.size);
    assert.equal(prism.state, 2, 'Expected stun during lock-on to interrupt prism into state 2 overheat');
    assert.ok(!prism.prismFire, 'Expected stunned prism not to fire beam');

    // State 2: Overheat vulnerability (+35% damage before defense)
    prism.maxHealth = 500;
    prism.currentHealth = 500;
    const dmgState2 = prism.takeDamage(50);
    // 50 * 1.35 - 3 = 64.5
    assert.ok(dmgState2 > dmgState0 * 1.8, `Expected state 2 overheat damage (${dmgState2}) to be significantly higher than state 0 (${dmgState0})`);

    // Full lock-on -> beam fire hitting player
    prism.stunTimer = 0;
    prism._setState(1, 0.1);
    prism.lockX = p.x + p.size / 2;
    prism.lockY = p.y + p.size / 2;
    const hpBefore = p.currentHealth;
    for (let i = 0; i < 10; i++) {
        g.updateEnemies();
    }
    assert.ok(g.effects.some(ef => ef.type === 'prismBeam'), 'Expected prismBeam effect to be spawned');
    assert.ok(p.currentHealth < hpBefore, 'Expected prism laser beam to damage player on lock line');
});

test('Phoenix Feather relic revives player on fatal damage and Void Mirror reflects enemy bullets during dash', () => {
    const g = new Game();
    g.init();
    g.startGame();
    const p = g.player;
    p.relics = ['phoenix_feather', 'void_mirror'];

    // 1. Phoenix Feather fatal damage cheat-death revive
    const enemy = new Enemy(p.x + 20, p.y, 'chaser', 1);
    g.enemies = [enemy];
    p.currentHealth = 0;
    const lifeBefore = g.life;
    g._checkLocalDeath();
    assert.equal(g.life, lifeBefore, 'Expected life count to remain unchanged after Phoenix Feather revive');
    assert.equal(p._phoenixFeatherUsed, true, 'Expected _phoenixFeatherUsed flag to be set after Phoenix Feather triggers');
    assert.ok(p.currentHealth >= p.maxHealth * 0.49, 'Expected Phoenix Feather to restore 50% max health');
    assert.ok(enemy.burnT > 0, 'Expected Phoenix Feather nova to ignite nearby enemies');

    // 2. Void Mirror enemy bullet reflection while dashing
    p.dashTimer = 0.2;
    const b = new EnemyBullet(p.x + 5, p.y + 5, -4, 0, 15);
    g.enemyBullets = [b];
    g.projectiles = [];
    g.checkCollisions();
    assert.equal(g.enemyBullets.length, 0, 'Expected Void Mirror to consume reflected enemy bullet');
    assert.equal(g.projectiles.length, 1, 'Expected Void Mirror to spawn a reflected player projectile');
    assert.ok(g.projectiles[0].damage >= p.attack * 1.5, 'Expected reflected projectile to deal boosted attack damage');
});

test('Overload Greed contract, new Achievements (forgeMaster, prismBreaker), and Expedition Contracts work end-to-end', () => {
    global.localStorage.clear();
    const g = new Game();
    g.init();
    g.startGame();
    const p = g.player;
    p.class = 'mage';

    const baseCd = g._skillMaxCd(p, 'e');
    const baseAoe = g._aoe(100);
    const baseTaken = p.damageTakenMult();

    p.greedContract = 'overload';
    assert.ok(g._skillMaxCd(p, 'e') < baseCd, 'Expected overload contract to reduce skill cooldown by 30%');
    assert.ok(g._aoe(100) > baseAoe, 'Expected overload contract to increase AoE by 25%');
    assert.ok(p.damageTakenMult() > baseTaken, 'Expected overload contract to increase damage taken by 25%');

    // Achievements & Expedition Contracts check
    g.forgesCompletedCount = 1;
    g.prismKills = 6;
    const rs = g._runStats();
    assert.equal(rs.forgesCompleted, 1);
    assert.equal(rs.prismKills, 6);
    const unlocked = Progress.checkAchievements(rs).map(a => a.id);
    assert.ok(unlocked.includes('forgeMaster'), 'Expected forgeMaster achievement to unlock');
    assert.ok(unlocked.includes('prismBreaker'), 'Expected prismBreaker achievement to unlock');
});

test('Killing Elite enemy or Boss triggers full-screen micro-shake and center damage summary ("暴击! 1200")', () => {
    global.localStorage.clear();
    const g = new Game();
    g.init();
    g.startGame();

    // 1. Elite enemy kill impact
    const elite = new Enemy(200, 200, 'chaser', 1);
    elite.elite = true;
    elite.affix = 'frenzy';
    elite.defense = 0;
    elite.maxHealth = 1200;
    elite.currentHealth = 1200;
    elite._dnCrit = true;
    elite.takeDamage(1200);
    assert.equal(elite._totalDmgTaken, 1200, 'Expected Elite enemy to track cumulative damage taken');
    assert.equal(elite._hadCritHit, true, 'Expected Elite enemy to record critical hit state');

    g._onEnemyKilled(elite);
    assert.ok(g.killShake && g.killShake.timer > 0, 'Expected Elite kill to trigger full-screen micro-shake');
    assert.equal(g.killShake.isBoss, false);
    const ksOff = g._getKillShakeOffset();
    assert.equal(ksOff.active, true, 'Expected _getKillShakeOffset to be active during killShake');
    assert.ok(g.killSummary && g.killSummary.timer > 0, 'Expected Elite kill to trigger center damage summary callout');
    assert.equal(g.killSummary.text, '暴击! 1200', 'Expected Elite kill summary callout to display "暴击! 1200"');
    assert.equal(g.killSummary.dmg, 1200);

    // Render verification
    assert.doesNotThrow(() => {
        g.render();
    }, 'Expected Game.render() with active killShake and killSummary to succeed without error');

    // 2. Boss repel/kill impact
    g._spawnBoss();
    assert.ok(g.boss, 'Expected Boss to be spawned');
    g.boss._dnCrit = true;
    g.boss.takeDamage(2400);
    g.bossDamageDealt = 2400;
    g._repelBoss(true);

    assert.ok(g.killShake && g.killShake.isBoss === true, 'Expected Boss repel to trigger Boss-tier full-screen micro-shake');
    assert.ok(g.killSummary && g.killSummary.isBoss === true, 'Expected Boss repel to trigger Boss-tier center damage summary');
    assert.equal(g.killSummary.text, '暴击! 2400', 'Expected Boss kill summary callout to display "暴击! 2400"');

    // Advance timer to completion
    g._updateKillImpact(2.0);
    assert.equal(g.killShake, null, 'Expected killShake to clear after timer expires');
    assert.equal(g.killSummary, null, 'Expected killSummary to clear after timer expires');
});

test('Dynamic battlefield fog of war clears as player moves and supports density settings', () => {
    global.localStorage.clear();
    const g = new Game();
    g.init();
    g.startGame();

    // Default fog density is 'normal'
    assert.equal(g.fogDensity, 'normal', 'Expected initial fog density to be normal');

    // Cycle density settings: normal -> dense -> off -> light -> normal
    assert.equal(g.cycleFogDensity(), 'dense', 'Expected cycle to dense');
    assert.equal(Store.get('blockrun.fog'), 'dense', 'Expected dense saved in storage');
    assert.equal(g.cycleFogDensity(), 'off', 'Expected cycle to off');
    assert.equal(g.cycleFogDensity(), 'light', 'Expected cycle to light');
    assert.equal(g.cycleFogDensity(), 'normal', 'Expected cycle to normal');

    // Fog update advances wisps and handles off/on states
    g._updateFog(0.1);
    assert.ok(g.fogTime > 0, 'Expected fogTime to advance');
    assert.ok(g.fogWisps && g.fogWisps.length > 0, 'Expected fogWisps to be initialized');

    // Render fog with player clearing vision
    assert.doesNotThrow(() => {
        g.render();
    }, 'Expected render() with fog of war enabled to execute cleanly');

    // Verify fog off state avoids rendering overhead
    g.setFogDensity('off');
    assert.equal(g.fogDensity, 'off');
    assert.doesNotThrow(() => {
        g.render();
    }, 'Expected render() with fog turned off to execute cleanly');
});

test('Procedural Dungeon and Maze system generates connected layouts, resolves wall collisions, shatters destructible walls, and activates dungeon props', () => {
    global.localStorage.clear();
    const g = new Game();
    g.init();
    g.startGame();

    // 1. Default mode is 'dungeon' with walls and 4 interactive props
    assert.equal(g.dungeonMode, 'dungeon', 'Expected default dungeonMode to be dungeon');
    assert.ok(g.dungeonWalls.length > 0, 'Expected procedural dungeon to generate walls');
    assert.equal(g.dungeonProps.length, 4, 'Expected 4 quadrant dungeon props (chests/shrines/runes)');

    // Center spawn (400, 300) must never collide with any wall
    assert.equal(g._checkPointHitsDungeonWall(400, 300, 20), null, 'Expected central player spawn plaza to be completely free of walls');

    // 2. Test Maze mode generation & 100% BFS open-tile connectivity across multiple seeds
    for (const seed of [42, 1337, 99999]) {
        g.setDungeonMode('maze', seed);
        assert.equal(g.dungeonMode, 'maze');
        assert.ok(g.dungeonWalls.length >= 10, `Expected maze seed ${seed} to generate labyrinth walls`);
        assert.ok(g.dungeonWalls.some(w => w.destructible), `Expected maze seed ${seed} to include destructible rune walls`);

        // Verify 100% of open tiles (grid[y][x] === 0) are reachable from center (10, 7)
        const rows = g.dungeonRows, cols = g.dungeonCols, grid = g.dungeonGrid;
        const vis = Array.from({ length: rows }, () => new Array(cols).fill(false));
        const q = [[10, 7]];
        vis[7][10] = true;
        while (q.length > 0) {
            const [cx, cy] = q.shift();
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const nx = cx + dx, ny = cy + dy;
                if (nx >= 0 && nx < cols && ny >= 0 && ny < rows && !vis[ny][nx] && grid[ny][nx] === 0) {
                    vis[ny][nx] = true;
                    q.push([nx, ny]);
                }
            }
        }
        for (let y = 0; y < rows; y++) {
            for (let x = 0; x < cols; x++) {
                if (grid[y][x] === 0) {
                    assert.equal(vis[y][x], true, `Expected open tile (${x},${y}) in maze seed ${seed} to be reachable from center`);
                }
            }
        }
    }

    // 3. Test Player & Enemy wall collision resolution and corner sliding
    g.setDungeonMode('dungeon', 2026);
    const solidWall = g.dungeonWalls.find(w => !w.destructible) || g.dungeonWalls[0];
    assert.ok(solidWall, 'Expected a solid wall to test collision');
    g.player.x = solidWall.x + 5;
    g.player.y = solidWall.y + 5;
    const pushed = g._resolveDungeonCollision(g.player, false);
    assert.equal(pushed, true, 'Expected player overlapping a wall to be pushed out');
    const overlapAfter = g._checkPointHitsDungeonWall(g.player.x + g.player.size / 2, g.player.y + g.player.size / 2, g.player.size * 0.45);
    assert.equal(overlapAfter, null, 'Expected player center not to overlap wall after collision resolution');

    // Burrower underground ignores walls, surfaces and collides
    const burrower = new Enemy(solidWall.x + 5, solidWall.y + 5, 'burrower', 1);
    burrower.state = 0; // underground
    assert.equal(g._resolveDungeonCollision(burrower, true, g.player), false, 'Expected underground burrower to tunnel beneath walls');
    burrower.state = 2; // surfaced
    assert.equal(g._resolveDungeonCollision(burrower, true, g.player), true, 'Expected surfaced burrower to collide with walls');

    // 4. Test destructible rune wall shattering via projectile damage
    const runeWall = g.dungeonWalls.find(w => w.destructible);
    assert.ok(runeWall, 'Expected destructible rune wall in dungeon');
    const wallCountBefore = g.dungeonWalls.length;
    const scoreBefore = g.score;
    const shattered = g._damageDungeonWall(runeWall, runeWall.hp + 50);
    assert.equal(shattered, true, 'Expected sufficient damage to shatter destructible rune wall');
    assert.equal(g.dungeonWalls.length, wallCountBefore - 1, 'Expected shattered wall to be removed from dungeonWalls');
    assert.equal(g.dungeonGrid[runeWall.gy][runeWall.gx], 0, 'Expected shattered wall tile to become open floor');
    assert.ok(g.score > scoreBefore, 'Expected shattering rune wall to grant bonus score');

    // 5. Test interactive Dungeon Props (chest, shrine, rune)
    const chestProp = g.dungeonProps.find(dp => dp.type === 'chest');
    const shrineProp = g.dungeonProps.find(dp => dp.type === 'shrine');
    const runeProp = g.dungeonProps.find(dp => dp.type === 'rune');
    assert.ok(chestProp && shrineProp && runeProp, 'Expected chest, shrine, and rune props to be present');

    const itemsBefore = g.items.length;
    g._activateDungeonProp(chestProp, g.player);
    assert.equal(chestProp.used, true, 'Expected chest prop to be marked used');
    assert.ok(g.items.length > itemsBefore || (g.player.gemLog && g.player.gemLog.length > 0), 'Expected chest prop to drop reward');

    g.player.currentHealth = Math.round(g.player.maxHealth * 0.4);
    g.player.shield = 0;
    g._activateDungeonProp(shrineProp, g.player);
    assert.equal(shrineProp.used, true, 'Expected shrine prop to be marked used');
    assert.ok(g.player.currentHealth > g.player.maxHealth * 0.65, 'Expected Healing Shrine to restore 35% HP');
    assert.ok(g.player.shield > 0, 'Expected Healing Shrine to grant shield');

    g.player.blessTimer = 0;
    g.player.dashCooldown = 3.0;
    g._activateDungeonProp(runeProp, g.player);
    assert.equal(runeProp.used, true, 'Expected rune prop to be marked used');
    assert.ok(g.player.blessTimer >= 6, 'Expected Speed Rune to grant 6s blessing surge');
    assert.equal(g.player.dashCooldown, 0, 'Expected Speed Rune to reset dash cooldown');
});

test('Bug fix regressions: render() ctx.save/restore balance, killShake transform cleanup, and event fog light sources', () => {
    const g = new Game();
    g.init();
    g.startGame();

    // 1. Verify ctx.save() and ctx.restore() are strictly balanced on every render() call
    let saveCount = 0;
    let restoreCount = 0;
    const origSave = g.ctx.save.bind(g.ctx);
    const origRestore = g.ctx.restore.bind(g.ctx);
    g.ctx.save = () => { saveCount++; origSave(); };
    g.ctx.restore = () => { restoreCount++; origRestore(); };

    g._startEvent('altar');
    g._triggerKillImpact({ maxHealth: 1500, _totalDmgTaken: 1500, _dnCrit: true, type: 'giant' }, false);
    g.render();
    assert.equal(saveCount, restoreCount, `Expected ctx.save (${saveCount}) and ctx.restore (${restoreCount}) to be strictly balanced during render()`);

    // 2. Verify killShake canvas style.transform is cleaned up on _quitRun / restartGame / endGame
    g.canvas.style.transform = 'translate3d(3px, 2px, 0)';
    g.endGame();
    assert.equal(g.killShake, null, 'Expected endGame() to clear killShake');
    assert.equal(g.canvas.style.transform, '', 'Expected endGame() to reset canvas.style.transform');

    g.restartGame(true);
    g._triggerKillImpact({ maxHealth: 1200, _totalDmgTaken: 1200 }, false);
    g.canvas.style.transform = 'translate3d(2px, -2px, 0)';
    g.restartGame(false);
    assert.equal(g.killShake, null, 'Expected restartGame() to clear killShake');
    assert.equal(g.canvas.style.transform, '', 'Expected restartGame() to reset canvas.style.transform');
});

test('Game Over D3 damage breakdown bar chart renders proportional SVG bars and percentage labels inside .dmg-break', () => {
    const g = new Game();
    g.init();
    g.startGame();
    g.gameTime = 50;
    g.player.dmgStats = { a: 1200, q: 600, e: 450, r: 0, dot: 0, gear: 250, body: 0, other: 0 };

    const container = document.createElement('div');
    container.className = 'dmg-break';
    g._renderDmgBreakdownDom(container);

    const svgList = container.querySelectorAll('svg.db-d3-svg');
    assert.equal(svgList.length, 1, 'Expected D3 to generate 1 svg.db-d3-svg inside .dmg-break');

    const bars = container.querySelectorAll('rect.db-bar-rect');
    assert.equal(bars.length, 4, 'Expected 4 D3 bar rects for non-zero damage sources (a, q, e, gear)');

    // Verify descending order and proportional heights (a: 48%, q: 24%, e: 18%, gear: 10%)
    const h0 = parseFloat(bars[0].getAttribute('height'));
    const h1 = parseFloat(bars[1].getAttribute('height'));
    const h2 = parseFloat(bars[2].getAttribute('height'));
    const h3 = parseFloat(bars[3].getAttribute('height'));
    assert.ok(h0 > h1 && h1 > h2 && h2 > h3, `Expected bar heights to strictly decrease with damage share (${h0}, ${h1}, ${h2}, ${h3})`);
    assert.equal(bars[0].getAttribute('data-src'), 'a');
    assert.equal(bars[0].getAttribute('data-pct'), '48.0');

    const pctLabels = container.querySelectorAll('text.db-bar-pct');
    assert.equal(pctLabels.length, 4, 'Expected 4 percentage text labels above D3 bars');
    assert.equal(pctLabels[0].textContent, '48%');
    assert.equal(pctLabels[1].textContent, '24%');
    assert.equal(pctLabels[2].textContent, '18%');
    assert.equal(pctLabels[3].textContent, '10%');
});

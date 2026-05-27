# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

方块快跑 ("Block Run") is a browser survival game built with vanilla JavaScript and the HTML5 Canvas API. There is **no build system, no package manager, no dependencies, and no test suite**. The entire game lives in three files: `index.html`, `style.css`, and `game.js` (game.js is ~3600 lines and holds all logic).

UI strings and code comments are in Chinese.

## Running the game

Open `index.html` directly in a browser, or serve the directory statically (e.g. `python -m http.server 8000` then visit `http://localhost:8000`). A static server is preferable for testing touch/responsive behavior with device emulation.

There is no lint or test command. Verify changes by playing the game in a browser, including mobile/portrait emulation (see "Responsive & touch" below).

The `.trae/documents/` file about NPM global directory config is unrelated to this game — there is no Node tooling here.

## Bootstrap

`game.js` is loaded via `<script src="game.js">`. All classes are global (no modules). On `window load`, the handler does `new Game()` then `game.render()`. `Game.init()` calls `bindEvents()` to wire all DOM/canvas/keyboard handlers and must run for the game to be interactive. `roundRect()` (top of file) is a shared canvas path helper used pervasively by the dark-theme rendering.

> **Known gotcha:** the bootstrap path is fragile — `init()` is the single place every event listener is registered. If the start/pause buttons, click-to-move, or Q/E keys ever go dead, confirm `init()` actually runs (it must be invoked from the constructor or the load handler). A missing `init()` call silently produces a fully-rendered but completely unresponsive game.

## Architecture

- **`Game`** — orchestrates everything. Runs the loop via `setInterval(..., 16)` (~60fps; **not** `requestAnimationFrame`). Owns game state (`life`, `level`, `exp`, `score`, `gameTime`, `difficulty`), entity arrays (`enemies`, `items`, `projectiles`, `effects`, `particles`), the animated background (`stars` + grid via `bgTime`), the **boss scheduler**, and the **talent system**. Each tick calls `update()` then `render()`. Also drives a **base auto-attack** (`autoAttackTimer` / `autoAttackInterval`, ~0.6s) routed through `shoot()`, whose behavior depends on class (see "Skills & classes").
- **`Player`** — stats, movement (WASD/arrows *or* click/tap-to-move via `targetX/targetY`), the 5-class system, per-class resources, and survival timers (`hurtCooldown` i-frames, `invincibleTimer`, `stunTimer`). Skills live in `skillQ` / `skillE`, each `{ cooldown, maxCooldown, level }`.
- **`Enemy`** — three types with distinct AI: `chaser` (追, homes on player), `patroller` (巡, patrols then chases within range), `giant` (巨, moves then rests). All stats scale by `difficulty`. Has a `stunTimer` (set by mage/paladin skills) that freezes its AI. Spawn weighting is in `spawnEnemies()` (chaser 60% / patroller 37% / giant 3%); no spawns while a boss is active/retreating.
- **`BlockBoss` (方块大魔王)** — a periodic boss, **stored in `this.boss`, NOT in the `enemies` array**. It doesn't truly die; the fight ends by "repel" (see "Boss system"). Because it lives outside `enemies`, every targeting/collision/damage path special-cases it.
- **`Item`** — 6 timed pickups (`potion`, `snowflake`, `bomb`, `heart`, `potion_invicible`, `exp_book`) with rarity tiers (common/rare/epic), rarity-based lifetimes (shorter = rarer), a drop-in landing animation, lifetime-warning flicker, and pickup burst feedback. Effects handled in `Game.collectItem()`; weighted spawn in `spawnItems()`.
- **`Projectile`** — basic auto-attack/ranged bullet carrying a `damage` field; supports optional piercing (`isPiercing` / `pierceRemaining` / `hitEnemies` Set) used by the archer.
- **`PiercingArrow`** — archer Q projectile that runs its **own collision detection in `update()`** (it holds a `game` ref), hitting each enemy once via a `hitEnemies` Set and damaging the boss directly.
- **`MagicProjectile`** — legacy homing projectile class; **currently dead code** (no longer instantiated after the mage rework). Leave it unless doing cleanup.

### Skills & classes

Five classes, chosen on a canvas menu at level 3 (`renderClassSelection` / `handleClassChoice`). Each has a **Q** and **E** skill keyed to the `q`/`e` keys (`castSkillQ` / `castSkillE` dispatch to `_<class>Q` / `_<class>E`). Skills have **levels 1–3**; level scales damage via `_getSkillMultiplier()` (1.0 / 1.2 / 1.5) and cooldown via `_getCDMultiplier()` (1.0 / 0.85 / 0.7), upgraded by the `skillQUp` / `skillEUp` talents.

Each class uses a distinct **resource** (rendered as a side bar in the skill HUD, and surfaced in the DOM `mana`/`maxMana` row which is repurposed per class):
- **warrior** — `rage` (0–100, gained on attack/hurt/kill via `gainRage`, decays ~2/s); melee aura auto-attack (`_warriorMeleeAttack`), no ranged auto-attack.
- **mage** — `mana` (regen `manaRegen`); Q is a **toggle** ("魔力涌注") that makes each auto-attack cost ~10% maxMana and add `maxMana×1.5` magic damage; E is an AoE freeze nova (`stunTimer`).
- **assassin** — `assassinCharge` (built by **moving**; consumed for a damage multiplier via `_consumeAssassinCharge`); Q blinks to target, E multi-strikes.
- **archer** — `arrows` (consumed per skill; empties → `reloadTimer` reload cycle; `_consumeArrows` rejects casts mid-reload); last-arrow Q deals ×2; auto-attack supports multishot/piercing/speed talents.
- **paladin** — `faith` (regen) **and** a passive regenerating `shield` (caps at `maxHealth × shieldCapRatio`); E is a self-centered holy aura that ticks heal+damage each frame while active; no ranged auto-attack.

Damage routing helpers: `_computeAttackDamage()` applies the `wrath` talent (more attack as HP drops); `_dealDamage()` applies damage, grants warrior rage, and **special-cases the boss** (accumulate `bossDamageDealt` instead of killing); `_onEnemyKilled()` is the single kill-settlement entry (score ×`scoreMult`, +5 exp, life-steal, +rage, `checkLevelUp`).

### Talent system

Replaces the old fixed potential-point menu. On level-up (or boss-repel reward) the player spends potential points on a **3-card draft** (`showPotentialMenu` → `_rollTalentChoices(3)` → `renderPotentialMenu`). Talent definitions live in `_buildTalentDefs()`; each has `rarity` (common/rare/epic, drawn with weights 60/30/10), an optional `applicable(game)` gate (e.g. class-specific or skill-not-maxed), an `apply(game)` effect, and `stackable`/`maxStacks`. Acquired talents are tracked in `acquiredTalents` (`[{id,count}]`); many talents accumulate into multiplier fields on `Game` (e.g. `scoreMult`, `warriorSkillDmgMult`, `archerPiercing`, `mageStunBonus`). `handlePotentialChoice` re-rolls and keeps the menu open while points remain.

### Boss system (方块大魔王)

A state machine on `Game` (`bossState`: `idle → warning → active → retreating`) driven by `_updateBoss()`:
- **idle** — counts down `bossTimer` (default 60s).
- **warning** — `bossWarningDuration` (5s) of red-border + countdown + screen shake.
- **active** — boss chases the player. Ends ("repelled") when the boss HP hits 0, **or** accumulated `bossDamageDealt ≥ bossDamageRequired × difficulty`, **or** `bossActiveTimer ≥ bossDuration` (30s). Repel reward: +1 life (capped 10), +1 potential point (opens talent menu), +100×`scoreMult` score.
- **retreating** — boss flies offscreen, then back to idle with `bossTimer` reset.

Boss HP = `2000 × difficulty`; contact attack = `max(50, playerMaxHealth×0.5)`. Normal enemy spawns pause during active/retreating.

### Key cross-cutting concerns

- **Hardcoded frame time.** The 16ms interval is duplicated as magic numbers throughout. Most timers count down in *seconds* using `-= 0.016` (`gameTime`, `autoAttackTimer`, skill cooldowns, `enemyFreezeTimer`, `invincibleTimer`, `hurtCooldown`, `stunTimer`, item `duration`/`landTimer`, effect `ttl`, `screenShake`, resource regen `* 0.016`), while a few still count in *milliseconds* using the literal `16` (`skillCooldown -= 16`, giant `restTimer += 16`). Changing the loop interval requires updating all of these together, and note the two unit conventions coexist.
- **`setTimeout` breaks the pause model.** Most timers are frame-based so they pause with the game. **Exceptions:** `_assassinE` and `_archerE` stagger their hits with real `setTimeout`, which keeps firing even while paused (e.g. during a level-up menu) and is not deterministic with the loop. Preserve this awareness when touching those skills.
- **Effects & particles must be queued, not drawn inline.** Visuals are pushed into `effects` (typed: ring/shockwave/slash/arrow/holyAura/floatText/meleeSwing/iceShard, plus plain circles) via `addEffect`/`_showFloatingText`/`spawnSlashEffect`, and into `particles` via `spawnParticles`/`spawnHitParticles`/`spawnBurstRing`. They are drawn in `render()` (`_renderEffects`/`renderParticles`); `updateEffects`/`updateParticles` age them out. Do **not** draw during `update()` — `render()` begins by repainting the background and would erase inline draws.
- **Boss lives outside `enemies`.** Every place that targets, collides, or kills must handle the boss separately (see `_findClosestEnemies` which appends the boss, the boss branches in `checkCollisions`/`shoot`/skills, and `PiercingArrow.update`). When adding any attack, remember enemies vs. boss are two code paths.
- **Canvas-rendered menus drive input.** Class-selection and talent menus are drawn *on the canvas* (not DOM). The render methods reset `this.buttons = []` at the top each frame, then `drawButton()` / card rendering push hit-rects into it; `checkButtonClick()` reads then clears that array on click. Rebuilding every frame prevents hit-rects from accumulating while paused. Talent-card `choice` values are 1-based (card index), `0` = skip. Render and input handling are intentionally coupled.
- **Two UI layers.** Live stats are DOM elements updated in `updateUI()` (the `mana`/`maxMana` row is repurposed per class to show rage/faith+shield/arrows/charge); the in-canvas skill HUD (`_renderSkillHUD`) and boss HUD (`_renderBossHUD`) are canvas-drawn. Keep both in sync when adding stats.
- **Screen shake wraps rendering.** `render()` applies a random `translate` (scaled by `screenShake`) inside a `save/restore`; the world is drawn inside it, while HUD/menus are drawn after `restore()` so they don't jitter.
- **Difficulty is curved and capped.** `difficulty = Math.min(4, 1 + gameTime / 90)` — ramps slowly, tops out at 4x. Enemy stats, boss HP, and the boss damage goal all multiply by it.

### Combat & survival

Several mechanics exist specifically to keep the game survivable; preserve their intent when editing combat:

- **Hurt i-frames.** On contact damage the player takes a hit then gets `hurtCooldown = 0.6s + hurtCooldownBonus` of invulnerability (renders as a flicker), so overlapping enemies can't drain HP in a single frame.
- **Revive.** When `currentHealth` hits 0 but `life > 0`, the player respawns at center with full HP and `hurtCooldown = 1.5s`. The run ends only when `life` reaches 0.
- **Damage mitigation order** (`Player.takeDamage`): `max(1, dmg − defense − flatDamageReduction)`, then the paladin `shield` absorbs before HP.
- **Invincible potion (`potion_invicible`).** Doubles size/attack/defense for ~10s. Rewritten to store the **added delta** (`invincibleSizeBonus`/etc.) and subtract it on expiry, so talents/upgrades gained *during* the buff are preserved (the old snapshot-and-restore overwrote them). Re-pickup while active only extends the timer.
- **Freeze (`snowflake`).** Sets `enemyFreezeTimer` (frame-based, in seconds), so it pauses with the game and also freezes enemies spawned during the freeze.
- **Bomb (`bomb`).** Range-kills enemies around the player and queues an explosion effect.
- **Heart pickup is capped at 10 lives** (`Math.min(life + 1, 10)`). Note the per-3-level life bonus uses a bare `life++` and is *not* clamped.

### Responsive & touch

The CSS scales the canvas down on small screens and in portrait orientation (media queries in `style.css`). Because the canvas backing store stays 800x600 while its displayed size changes, **all click/touch handlers must rescale coordinates** by `canvas.width / rect.width` (and height). This scaling already exists in `bindEvents()` — preserve it in any new pointer handling. The talent menu also reflows between a horizontal 3-column layout (landscape) and a vertical 3-row layout (portrait/narrow). Touch/portrait coordinate handling has historically been a fragile area; test touch input in portrait emulation after touching input or layout code.

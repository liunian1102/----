# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

方块快跑 ("Block Run") is a browser survival game built with vanilla JavaScript and the HTML5 Canvas API. There is **no build system, no package manager, no dependencies, and no test suite**. The entire game lives in three files: `index.html`, `style.css`, and `game.js`.

UI strings and code comments are in Chinese.

## Running the game

Open `index.html` directly in a browser, or serve the directory statically (e.g. `python -m http.server 8000` then visit `http://localhost:8000`). A static server is preferable for testing touch/responsive behavior with device emulation.

There is no lint or test command. Verify changes by playing the game in a browser, including mobile/portrait emulation (see "Responsive & touch" below).

The `.trae/documents/` file about NPM global directory config is unrelated to this game — there is no Node tooling here.

## Architecture

All classes are global (no modules); `game.js` is loaded via `<script src="game.js">` and a `Game` instance is created on `window load`.

- **`Game`** — orchestrates everything. Runs the loop via `setInterval(..., 16)` (~60fps; **not** `requestAnimationFrame`). Owns game state (`life`, `level`, `exp`, `score`, `gameTime`, `difficulty`) and the entity arrays (`enemies`, `items`, `projectiles`, `effects`). Each tick calls `update()` then `render()`. Also drives a **base auto-attack** (`autoAttackTimer` / `autoAttackInterval`, ~0.6s): `shoot()` fires a `Projectile` at the nearest enemy regardless of class, so the player has output even with no class chosen.
- **`Player`** — stats, movement (WASD/arrows *or* click/tap-to-move via `targetX/targetY`), and the class system (`warrior` / `mage`) with skill cooldown and mana. Also tracks survival timers `hurtCooldown` (post-hit i-frames) and `invincibleTimer` (invincible-potion buff) — see "Combat & survival" below.
- **`Enemy`** — three types with distinct AI: `chaser` (追, homes on player), `patroller` (巡, patrols then chases within range), `giant` (巨, moves then rests). All stats scale by `difficulty`. Spawn weighting is in `spawnEnemies()` (chaser 60% / patroller 37% / giant 3%).
- **`Item`** — 6 timed pickups (`potion`, `snowflake`, `bomb`, `heart`, `potion_invicible`, `exp_book`); effects handled in `Game.collectItem()`.
- **`Projectile` / `MagicProjectile`** — both carry a `damage` field. The basic `Projectile` takes a `damage` arg (auto-attack passes `player.attack`); `MagicProjectile` homes onto a stored `target` (mage skill).

### Key cross-cutting concerns

- **Hardcoded frame time.** The 16ms interval is duplicated as magic numbers throughout. Most timers count down in *seconds* using `-= 0.016` (`gameTime`, `autoAttackTimer`, `enemyFreezeTimer`, `invincibleTimer`, `hurtCooldown`, item `duration`, effect `ttl`, mana regen `* 0.016`), while a few still count in *milliseconds* using the literal `16` (`skillCooldown -= 16`, giant `restTimer += 16`). Changing the loop interval requires updating all of these together, and note the two unit conventions coexist.
- **Effects must be queued, not drawn inline.** Explosions and skill flashes are pushed into the `effects` array via `addEffect()` (with a fade-out `ttl`) and drawn in `render()`. Do **not** draw visual effects directly during `update()` — the next `render()` begins with `clearRect()` and would erase them. `updateEffects()` ages them out.
- **Canvas-rendered menus drive input.** Level-up, class-selection, and potential-point menus are drawn *on the canvas* (not DOM). The render methods reset `this.buttons = []` at the top each frame, then `drawButton()` pushes hit-rects into it; `checkButtonClick()` reads then clears that array on click. Rebuilding every frame prevents hit-rects from accumulating while paused. Render and input handling are intentionally coupled — changing one affects the other.
- **Two UI layers.** Live stats are DOM elements updated in `updateUI()`; overlay menus are canvas-drawn. Keep both in sync when adding stats.
- **Level-up flow.** `checkLevelUp()` auto-pauses the game (`isPaused = true`). At level 3 with no class → class selection; otherwise → potential menu. Every level grants +1 potential point; every 3 levels also grants +1 life. The game stays paused until the relevant menu is dismissed. The level-3 class-selection chains into the potential menu so that level's point isn't swallowed (`handleClassChoice`).
- **Difficulty is curved and capped.** `difficulty = Math.min(4, 1 + gameTime / 90)` — it ramps slowly and tops out at 4x so late game doesn't become an instant loss. Enemy stats multiply by this in `Enemy.initType()`.

### Combat & survival

Several mechanics exist specifically to keep the game survivable; preserve their intent when editing combat:

- **Hurt i-frames.** On contact damage the player takes a hit then gets `hurtCooldown = 0.6s` of invulnerability (renders as a flicker), so overlapping enemies can't drain HP in a single frame.
- **Revive.** When `currentHealth` hits 0 but `life > 0`, the player respawns at center with full HP and `hurtCooldown = 1.5s` to avoid instant re-death. The run ends only when `life` reaches 0.
- **Invincible potion (`potion_invicible`).** Doubles size/attack/defense for ~10s via `activateInvincible()`. It snapshots `baseSize/baseAttack/baseDefense` (capturing any spent potential points), and `updateInvincible()` restores from that snapshot on expiry. Re-pickup while active only extends the timer (no stacking).
- **Freeze (`snowflake`).** Sets `enemyFreezeTimer` (frame-based, in seconds) instead of `setTimeout`, so it pauses with the game and also freezes enemies spawned during the freeze.
- **Bomb (`bomb`).** Range-kills enemies around the player and queues an explosion effect.
- **Heart pickup is capped at 10 lives** (`Math.min(life + 1, 10)`). Note the per-3-level life bonus uses a bare `life++` and is *not* clamped.

### Responsive & touch

The CSS scales the canvas down on small screens and in portrait orientation (media queries in `style.css`). Because the canvas backing store stays 800x600 while its displayed size changes, **all click/touch handlers must rescale coordinates** by `canvas.width / rect.width` (and height). This scaling already exists in `bindEvents()` — preserve it in any new pointer handling. Recent git history is dominated by portrait-mode/touch coordinate fixes, so this is a known fragile area; test touch input in portrait emulation after touching input or layout code.

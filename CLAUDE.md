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

- **`Game`** — orchestrates everything. Runs the loop via `setInterval(..., 16)` (~60fps; **not** `requestAnimationFrame`). Owns game state (`life`, `level`, `exp`, `score`, `gameTime`, `difficulty`) and the entity arrays (`enemies`, `items`, `projectiles`). Each tick calls `update()` then `render()`.
- **`Player`** — stats, movement (WASD/arrows *or* click/tap-to-move via `targetX/targetY`), and the class system (`warrior` / `mage`) with skill cooldown and mana.
- **`Enemy`** — three types with distinct AI: `chaser` (追, homes on player), `patroller` (巡, patrols then chases within range), `giant` (巨, moves then rests). All stats scale by `difficulty`. Spawn weighting is in `spawnEnemies()` (chaser 60% / patroller 37% / giant 3%).
- **`Item`** — 6 timed pickups (`potion`, `snowflake`, `bomb`, `heart`, `potion_invicible`, `exp_book`); effects handled in `Game.collectItem()`.
- **`Projectile` / `MagicProjectile`** — `MagicProjectile` homes onto a stored `target` (mage skill).

### Key cross-cutting concerns

- **Hardcoded frame time.** The 16ms interval is duplicated as magic numbers throughout: `gameTime += 0.016`, `skillCooldown -= 16`, `restTimer += 16`, mana regen `* 0.016`, etc. Changing the loop interval requires updating all of these together.
- **Canvas-rendered menus drive input.** Level-up, class-selection, and potential-point menus are drawn *on the canvas* (not DOM). `drawButton()` pushes hit-rects into `this.buttons` during `render()`, and `checkButtonClick()` reads then clears that array on click. Render and input handling are intentionally coupled — changing one affects the other.
- **Two UI layers.** Live stats are DOM elements updated in `updateUI()`; overlay menus are canvas-drawn. Keep both in sync when adding stats.
- **Level-up flow.** `checkLevelUp()` auto-pauses the game (`isPaused = true`). At level 3 with no class → class selection; otherwise → potential menu. Every 3 levels grants +1 life. The game stays paused until the relevant menu is dismissed.

### Responsive & touch

The CSS scales the canvas down on small screens and in portrait orientation (media queries in `style.css`). Because the canvas backing store stays 800x600 while its displayed size changes, **all click/touch handlers must rescale coordinates** by `canvas.width / rect.width` (and height). This scaling already exists in `bindEvents()` — preserve it in any new pointer handling. Recent git history is dominated by portrait-mode/touch coordinate fixes, so this is a known fragile area; test touch input in portrait emulation after touching input or layout code.

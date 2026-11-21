# Aquateen — Three.js port

Open **index.html** in Chrome, Safari, or Firefox. On macOS you can also double-click **Play Aquateen.command**. Keep this folder together. No installation, web server, internet connection, Flash, or Ruffle is needed to play. A browser with WebGL support is required.

Choose a character, then move the mouse to avoid the falling enemies. The original has five lives and survival points, with new waves at 200, 400 and 600 points and the ending at 1000. Touch dragging also controls the character. The small controls below the game provide pause, restart and fullscreen; they do not alter the game rules.

## What was preserved

- Original 600 × 450 stage, Portuguese text, characters and credit to Spiga.
- Recovered images and vector artwork, including original embedded font outlines for static labels.
- All 325 main timeline frames and 21 nested animation timelines, the character-selection buttons, countdowns, hit animations, ending and game-over screens.
- Original random enemy speeds, mouse-follow controls, collision-triggered animations, scoring scripts and frame jumps, advancing at 12 ticks per second.

This is a focused JavaScript reconstruction of the supplied game's display lists and action scripts. Three.js renders textured geometry through an orthographic camera; the Windows executable and Flash runtime are not executed. `art-data.js` includes the artwork, and `assets/scene-data.js` includes decoded timeline/action data. The original executable and the earlier Ruffle version are unchanged.

The source used device Comic Sans MS for changing numerals. Those glyph outlines were recovered from the matching installed macOS font so the counters do not depend on fonts installed on the playing device. Its provenance is recorded in `AQUATEEN_ART.deviceFont.source`.

## Validation and limits

Run `npm test` (or `node research/verify_engine.cjs` and `node tests/integration.cjs`). Node is needed only for tests, not to play. The tests cover all four character routes, hover/pressed states, countdowns, four waves, victory, menu return, damage, game over, retry, real transformed collision bounds, text glyphs and offline asset coverage.

Browser visual and interaction verification is pending: the build session blocks local server binding and its Chrome launch exits with SIGABRT before opening a page. The tests validate the game state and asset/layout data, not a running WebGL renderer. Exact Flash antialiasing and event-order/timing parity have not been established against a running original. See `research/FINDINGS.md` for the evidence and remaining limitations.

## Source layout

- `index.html`, `style.css`, `game.js`: offline page, Three.js renderer, controls and input.
- `src/engine.js`: timeline instances and the specific action operations used by this game.
- `geometry.js`: original transforms, display bounds and button hit areas.
- `art-data.js`, `assets/scene-data.js`: self-contained recovered game data.
- `research/`: disassembly, source hashes, extraction scripts and gameplay findings.
- `tools/extract_art.py`: vector, bitmap and font extraction. Regeneration requires the adjacent extracted SWF, Node with Sharp (`SHARP_MODULE` can select its path), and Comic Sans MS (`COMIC_SANS_FONT` can select its path). These tools are not needed to play.
- `vendor/`: Three.js 0.160.1 and its MIT license.

The original in-game credit to Spiga is preserved. Three.js is distributed under its included MIT license.

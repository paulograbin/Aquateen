# Aquateen static recovery

Source: `../Aquateen Player/Aquateen.swf`, extracted from the supplied executable.
The source SHA-256 is recorded in `swf-analysis.json` and `assets/scene.json`.
These findings derive from SWF tags and AVM1 bytecode, not observation of Flash execution.

## Recovered structure

- 600 × 450 stage, 12 frames per second, 325 root frames.
- Four character routes: menu buttons 11, 16, 21, 26 enter frames 2, 83, 164, 245.
- Character names: Mestre Shake, Almôndega, Peterson, Batatão.
- Main game begins at frame 38 + characterIndex × 81. Each route sets `vidas = 5` and `pontos = 0`.
- The hero follows the mouse with `startDrag(true)` and `Mouse.hide()`.
- Enemies move downward every enter-frame event. The first enemy uses `random(20)+6` pixels per frame. When y reaches 450 it resets to y=0 and a random x below 600.
- Collision calls the selected hero clip's `gotoAndPlay(2)`. Hero sprite frame 10 decrements lives. The first frame stops again after the animation wraps.
- Scoring is elapsed survival time: a frame script increments points. At 200, 400, 600 and 1000, root actions jump to the next wave/ending. More enemy instances appear at the wave transitions.
- Root frame jumps are retained rather than replacing the timing with a new seconds-based score. Exact wall-clock scoring parity with Flash remains unobserved.
- Zero lives jumps to game-over frames 82, 163, 244, 325.
- Reaching 1000 plays the ending and stops at frames 81, 162, 243, 324, with replay and character-selection buttons.
- Original imagery includes the Aqua Teen house, the four heroes, green/magenta Mooninites, green/yellow spiky enemies, the purple alien craft and Carl.

## Files

- `extract_swf.py`: repeatable static tag/action decoder and raw bitmap extractor.
- `swf-analysis.json`: 169 scripts, 551 placements, tag inventory, and disassembled actions.
- `actions.txt`: readable disassembly with byte offsets.
- `export_scene.py`: complete 22 timeline / 340 symbol / 999 command export for native playback.
- `assets/scene-data.js`: browser-loadable timeline and action data.
- `contact-sheet.jpg`: extracted artwork overview.
- `src/engine.js` and `src/runtime/`: JavaScript implementation of the observed AVM1 operations and display-list/timeline behavior.
- `tests/gameplay.cjs`: menu, all character branches, dragging, four waves, winning, return-to-menu, damage, game-over and retry tests.

## Limitations

No claim of bit-for-bit Flash timing or antialiasing equivalence is made. Timeline/action semantics are a focused reimplementation of this game's observed bytecode. Collision uses rendered AABBs supplied by the renderer; the original calls Flash hitTest against the character's current display bounds. Visual and interactive comparison against a running original is still needed to establish parity. No script refers to networking, filesystem operations, or sound playback.

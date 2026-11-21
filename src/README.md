# Reading the implementation

Start with `../game.js`. It connects the components and coordinates a frame: advance the game clock, build presentation data, update browser controls, and render the scene.

The main data flow is:

```text
Recovered scene data → Engine → buildSceneFrame → GameRenderer
                                  ↓
                              BrowserUI
                                  ↓
                         application callbacks → Engine
```

| Responsibility | File |
| --- | --- |
| Gameplay tick, frame changes and object lifetime | `engine.js` |
| A live character, button or artwork placement | `runtime/display-instance.js` |
| Compile timeline commands into frame snapshots | `runtime/timeline.js` |
| Execute the original game's stack-based instructions | `runtime/action-runner.js` |
| Coordinate transforms, collision bounds and hit areas | `scene/geometry.js` |
| Convert live objects into drawing and button descriptors | `scene/frame.js` |
| Lay out and paint numeric glyphs | `rendering/text-rasterizer.js` |
| Load artwork and own dynamic text textures | `rendering/textures.js` |
| Own Three.js meshes, materials, planes and camera | `rendering/renderer.js` |
| Position and handle accessible game buttons | `ui/button-overlays.js` |
| Pointer events, pause controls, fullscreen and announcements | `ui/browser-ui.js` |
| Advance a fixed number of gameplay ticks from elapsed time | `game-clock.js` |
| Measure display FPS, actual game tick rate and rendered frames | `debug/performance-stats.js` |
| Read current collision bounds and gameplay state without changing them | `debug/snapshot.js` |
| Draw debug rectangles, labels and counters above the game | `ui/debug-overlay.js` |

## Boundaries

- The engine does not reference Three.js, the DOM or animation frames. A collision callback connects it to geometry.
- Scene preparation returns plain descriptors. The renderer does not traverse or modify live game instances.
- The renderer owns GPU resources; the texture store owns image and text textures. Removing an instance also releases its temporary text resources.
- Browser controls report events through callbacks. They do not run scripts or advance timelines.
- The application coordinates these components; their internal algorithms remain in their own files.
- Debugging reads the same world-space bounds used by collision detection. Overlap highlights describe the current bounds, not a recorded damage event. The overlay never invokes game scripts or collision callbacks. Animation-frame sampling measures display FPS; pointer-triggered redraws contribute only to the rendered-frame count.

## Names inherited from the original

`_x`, `_y`, `gotoAndPlay`, `startDrag`, `vidas` and `pontos` are referenced by the recovered game scripts. The script-facing names intentionally remain intact. The extracted fields `matrix` and `cxform` likewise retain their data-format names. The rendering layer uses the descriptive names `transform` and `colorTransform`.

`id` identifies a reusable artwork/timeline symbol. `uid` identifies one live placement of that symbol. `depth` determines its ordering among siblings. Frame numbers are one-based; snapshot arrays are zero-based. Bounds use `[left, right, top, bottom]` in the original 600 × 450 stage coordinates.

## Why classic script files?

The game must open directly from `index.html`, including offline. Classic scripts avoid local-file restrictions on module imports and asset fetching. Each file registers its exports on `window.Aquateen`; `index.html` lists dependencies before their consumers. Pure runtime and scene modules also export through CommonJS for Node tests. No build step or package installation is needed to play.

Generated artwork, recovered timelines and the vendored Three.js library are data/dependencies, not places to refactor application logic. Tests live in `../tests`; run them with `npm test` from the game folder.

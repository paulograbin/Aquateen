const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { Engine } = require('../src/engine.js');
const { Geometry } = require('../src/scene/geometry.js');
const { buildSceneFrame } = require('../src/scene/frame.js');
const { PerformanceStats } = require('../src/debug/performance-stats.js');
const { buildDebugSnapshot } = require('../src/debug/snapshot.js');
const data = require('../assets/scene.json');
const context = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../art-data.js'), 'utf8'), context);
const art = context.window.AQUATEEN_ART;
const geometry = new Geometry(data, art);

function inspect(engine, paused = false) {
  return buildDebugSnapshot({ engine, geometry, paused,
    sceneFrame: buildSceneFrame(engine, art, geometry),
    performance: new PerformanceStats().snapshot(),
    renderStats: { drawCalls: 0, triangles: 0, textures: 0, geometries: 0 } });
}

function observableState(engine) {
  return JSON.stringify({ ticks: engine.ticks, pointer: engine.pointer,
    instances: engine.list().map(instance => ({ id: instance.id, uid: instance.uid,
      frame: instance.frame, vars: instance.vars, matrix: instance.matrix, playing: instance.playing })) });
}

function verifyMeasurements() {
  const stats = new PerformanceStats();
  stats.recordAnimationFrame(0, 0);
  for (let frame = 1; frame <= 60; frame++) {
    stats.recordAnimationFrame(frame * 1000 / 60, Math.floor(frame / 5));
    stats.recordRender();
  }
  assert(Math.abs(stats.displayFps - 60) < .001);
  assert(Math.abs(stats.tickRate - 12) < .001);
  assert(Math.abs(stats.snapshot().frameMilliseconds - 1000 / 60) < .001);
  for (let frame = 61; frame <= 120; frame++) stats.recordAnimationFrame(frame * 1000 / 60, 12);
  assert.equal(stats.tickRate, 0, 'Paused simulation reports zero ticks while the display keeps rendering');
  assert(Math.abs(stats.displayFps - 60) < .001);
  stats.recordRender();
  assert.equal(stats.snapshot().renderedFrames, 61, 'Pointer-triggered renders do not inflate display FPS');
  stats.recordAnimationFrame(2100, 0);
  assert.equal(stats.tickRate, null, 'Restart must not produce a negative tick rate');
  stats.resetSampling();
  stats.recordAnimationFrame(100000, 0);
  assert.equal(stats.displayFps, null, 'Returning from a hidden tab starts a fresh sample');
}

function verifyMenuAndReset() {
  const engine = new Engine(data);
  const snapshot = inspect(engine);
  assert.equal(snapshot.frame, 1);
  assert.equal(snapshot.totalFrames, 325);
  assert.equal(snapshot.hero, null);
  assert.equal(snapshot.enemyCount, 0);
  assert.equal(snapshot.boxes.length, 4);
  assert(snapshot.boxes.every(box => box.kind === 'button'));
  for (const button of buildSceneFrame(engine, art, geometry).buttons) {
    assert.deepEqual(snapshot.boxes.find(box => box.key === button.instance.uid).bounds, button.bounds);
  }
  engine.clickButton(engine.list().find(instance => instance.id === 11));
  for (let tick = 0; tick < 36; tick++) engine.tick();
  assert(inspect(engine).hero);
  engine.reset();
  assert.equal(inspect(engine).hero, null, 'Reset removes the old hero hitbox');
  assert.equal(inspect(engine).boxes.length, 4);
}

function verifyCharacterHitboxes(symbolId) {
  const engine = new Engine(data, { random: () => .5 });
  engine.clickButton(engine.list().find(instance => instance.id === symbolId));
  for (let tick = 0; tick < 36; tick++) engine.tick();
  const hero = engine.drag;
  const enemy = engine.list().find(instance => instance.events.some(event => event.event & 2));
  engine.setPointer(enemy._x, enemy._y);
  const before = observableState(engine);
  let snapshot = inspect(engine);
  assert.equal(observableState(engine), before, 'Reading diagnostics must not change gameplay');
  assert.deepEqual(snapshot.hero.bounds, geometry.bounds(hero));
  assert(snapshot.hero.overlapping);
  assert(snapshot.overlappingEnemies > 0);
  assert.equal(snapshot.hero.frame, hero.frame);
  assert.equal(snapshot.hero.totalFrames, hero._totalframes);
  assert.equal(snapshot.lives, 5);
  assert.equal(snapshot.targetTickRate, 12);
  const enemyBox = snapshot.boxes.find(box => box.key === enemy.uid);
  assert.deepEqual(enemyBox.bounds, geometry.bounds(enemy));
  engine.setPointer(-1000, -1000);
  snapshot = inspect(engine, true);
  assert(!snapshot.hero.overlapping);
  assert.equal(snapshot.overlappingEnemies, 0);
  assert.equal(snapshot.paused, true);
  hero.gotoAndPlay(2);
  assert.deepEqual(inspect(engine).hero.bounds, geometry.bounds(hero), 'Hitboxes follow damage animation bounds');
}

verifyMeasurements();
verifyMenuAndReset();
[11, 16, 21, 26].forEach(verifyCharacterHitboxes);
console.log('PASS debug FPS/tick measurements, all hero hitboxes, overlaps, pause/reset and read-only inspection');

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { Engine } = require('../src/engine.js');
const { Geometry, toAffineMatrix, multiplyTransforms, transformBounds } = require('../src/scene/geometry.js');
const { buildSceneFrame } = require('../src/scene/frame.js');
const data = require('../assets/scene.json');

const context = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../art-data.js'), 'utf8'), context);
const art = context.window.AQUATEEN_ART;
const geometry = new Geometry(data, art);
const seenSymbols = new Set();
const HERO_BUTTONS = [11, 16, 21, 26];

function advance(engine, ticks) {
  for (let tick = 0; tick < ticks; tick++) engine.tick();
}

function selectHero(engine, symbolId) {
  engine.clickButton(engine.list().find(instance => instance.id === symbolId));
}

function validateButton(instance) {
  const bounds = geometry.bounds(instance, true);
  assert(bounds && bounds.every(Number.isFinite), 'Button needs finite world-space hit area');
  assert(bounds[1] > bounds[0] && bounds[3] > bounds[2]);
}

function validateArtwork(instance) {
  const symbol = art.symbols[instance.id];
  assert(symbol, 'Missing artwork ' + instance.id);
  assert(symbol.bounds.every(Number.isFinite), 'Bad bounds ' + instance.id);
  if (instance.type === 'editText') {
    const svg = art.makeTextSVG(instance.id, instance.symbol.text || '1000');
    assert(!svg.includes('NaN'), 'Bad text layout ' + instance.id);
  } else {
    assert(symbol.image?.startsWith('data:image/'), 'Artwork must work offline: ' + instance.id);
  }
  seenSymbols.add(instance.id);
}

function validateDisplay(engine) {
  for (const instance of engine.list()) {
    if (instance.type === 'button') validateButton(instance);
    if (instance.type === 'sprite' || instance.type === 'button') continue;
    validateArtwork(instance);
  }
  const frame = buildSceneFrame(engine, art, geometry);
  assert.equal(frame.frame, engine.root.frame);
  for (const drawable of frame.drawables) {
    assert(drawable.transform.every(Number.isFinite));
    if (drawable.textFormat) assert.equal(typeof drawable.text, 'string');
  }
}

function verifyButtonStates(engine, symbolId) {
  const button = engine.list().find(instance => instance.id === symbolId);
  for (const state of [2, 4, 1]) {
    engine.setButtonState(button, state);
    validateDisplay(engine);
  }
  const bounds = geometry.bounds(button);
  assert(bounds[3] - bounds[2] > 50, 'Button bounds include character sprite');
}

function verifyWavesAndVictory(engine, heroIndex) {
  const waves = new Set();
  for (let tick = 0; tick < 1100; tick++) {
    engine.tick();
    validateDisplay(engine);
    const frameInHeroRoute = engine.root.frame - heroIndex * 81;
    if ([39, 42, 45, 48].includes(frameInHeroRoute)) waves.add(frameInHeroRoute);
  }
  assert.equal(waves.size, 4);
  assert.equal(engine.root.frame, 81 + heroIndex * 81);
}

function verifyCollisionBounds(engine, hero, enemy) {
  engine.setPointer(enemy._x, enemy._y);
  assert(geometry.intersects(hero, enemy), 'Overlapping original artwork bounds must collide');
  engine.setPointer(-1000, -1000);
  assert(!geometry.intersects(hero, enemy), 'Separated bounds must not collide');
}

function verifyDamageAnimation(engine, enemy) {
  engine.options.hitTest = (first, second) => geometry.intersects(first, second);
  enemy._x = 300;
  enemy._y = 100;
  enemy.vars.velo = 0;
  engine.setPointer(300, 100);
  engine.tick();
  enemy._x = -1000;
  advance(engine, 12);
  assert.equal(engine.root.vars.vidas, 4, 'Geometry collision removes one life after the hit animation');
}

function verifyGameOverAndReset(engine, heroIndex) {
  engine.root.vars.vidas = 0;
  engine.tick();
  validateDisplay(engine);
  assert.equal(engine.root.frame, 82 + heroIndex * 81);
  const staleButton = engine.list().find(instance => instance.type === 'button');
  engine.reset();
  engine.clickButton(staleButton);
  assert.equal(engine.root.frame, 1, 'Disposed buttons cannot change a restarted game');
}

function verifyCharacter(symbolId, heroIndex) {
  const engine = new Engine(data, { random: () => .5 });
  validateDisplay(engine);
  verifyButtonStates(engine, symbolId);
  selectHero(engine, symbolId);
  verifyWavesAndVictory(engine, heroIndex);
  engine.reset();
  selectHero(engine, symbolId);
  advance(engine, 36);
  const enemy = engine.list().find(instance => instance.events.some(event => event.event & 2));
  verifyCollisionBounds(engine, engine.drag, enemy);
  verifyDamageAnimation(engine, enemy);
  verifyGameOverAndReset(engine, heroIndex);
}

const parentTransform = toAffineMatrix({ scale: [2, 3], skew: [0, 0], xy: [5, 7] });
const childTransform = [1, 0, 0, 1, 10, 20];
assert.deepEqual(transformBounds([0, 10, 0, 20], multiplyTransforms(parentTransform, childTransform)), [25, 45, 67, 127]);
assert.equal(data.width, 600);
assert.equal(data.height, 450);
assert.equal(data.fps, 12);
assert(art.deviceFont.glyphs['0'] && art.deviceFont.glyphs['9']);
HERO_BUTTONS.forEach(verifyCharacter);
console.log('PASS ' + seenSymbols.size + ' display-list symbols across all heroes, button states, waves and endings.');
console.log('PASS scene-frame data, offline assets, text glyphs, collision bounds, damage and reset.');

const assert = require('node:assert/strict');
const { Engine } = require('../src/engine.js');
const data = require('../assets/scene.json');

function advance(engine, ticks) {
  for (let tick = 0; tick < ticks; tick++) engine.tick();
}

function clickSymbol(engine, symbolId) {
  engine.clickButton(engine.list().find(instance => instance.id === symbolId));
}

function verifyCharacterRoute(symbolId, routeIndex) {
  const engine = new Engine(data, { random: () => .5 });
  assert.equal(engine.root.frame, 1);
  assert.equal(engine.root.playing, false);
  clickSymbol(engine, symbolId);
  advance(engine, 36);
  assert.equal(engine.root.vars.vidas, 5);
  assert.equal(engine.root.vars.pontos, 1);
  engine.setPointer(100, 200);
  assert.equal(engine.drag._x, 100);
  assert.equal(engine.drag._y, 200);
  advance(engine, 999);
  assert.equal(engine.root.vars.pontos, 1000);
  advance(engine, 40);
  assert.equal(engine.root.frame, 81 + 81 * routeIndex);
  assert.equal(engine.root.playing, false);
  clickSymbol(engine, 133);
  assert.equal(engine.root.frame, 1);
  console.log('PASS character ' + symbolId + ': start, drag, waves, victory and menu');
}

function verifyDamageAndRetry() {
  const engine = new Engine(data, { random: () => .5 });
  clickSymbol(engine, 11);
  advance(engine, 36);
  let alreadyCollided = false;
  engine.options.hitTest = () => {
    if (alreadyCollided) return false;
    alreadyCollided = true;
    return true;
  };
  advance(engine, 12);
  assert.equal(engine.root.vars.vidas, 4);
  engine.root.vars.vidas = 0;
  engine.tick();
  assert.equal(engine.root.frame, 82);
  assert.equal(engine.cursorVisible, true);
  clickSymbol(engine, 131);
  advance(engine, 36);
  assert.equal(engine.root.vars.vidas, 5);
  console.log('PASS damage, death and retry');
}

[11, 16, 21, 26].forEach(verifyCharacterRoute);
verifyDamageAndRetry();

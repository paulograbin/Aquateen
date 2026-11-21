const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { GameClock } = require('../src/game-clock.js');
const { textLayout } = require('../src/rendering/text-rasterizer.js');

function verifyFixedStepClock() {
  let ticks = 0;
  const clock = new GameClock(10, () => ticks++);
  clock.advance(1000);
  clock.advance(1099);
  assert.equal(ticks, 0);
  clock.advance(1100);
  assert.equal(ticks, 1);
  clock.advance(1300);
  assert.equal(ticks, 3);
  clock.setPaused(true);
  clock.advance(1600);
  assert.equal(ticks, 3);
  clock.setPaused(false);
  clock.advance(1700);
  assert.equal(ticks, 4);
  clock.resetTimestamp();
  clock.advance(10000);
  assert.equal(ticks, 4, 'Restoring a hidden page does not advance missed time');
  clock.advance(20000);
  assert.equal(ticks, 6, 'A stalled animation frame advances at most 250 ms');
}

function verifyTextAlignment() {
  const font = { unitsPerEm: 1000, ascent: 800, glyphs: { '1': { advance: 500, path: '' } } };
  const format = { bounds: [0, 100, 0, 40], fontHeight: 20, leftMargin: 3, rightMargin: 4 };
  const left = textLayout(format, font, '11');
  assert.equal(left.x, 5);
  assert.equal(left.baseline, 18);
  assert.equal(textLayout({ ...format, align: 1 }, font, '11').x, 74);
  assert.equal(textLayout({ ...format, align: 2 }, font, '11').x, 40);
}

function verifyOfflineScriptOrder() {
  const project = path.resolve(__dirname, '..');
  const html = fs.readFileSync(path.join(project, 'index.html'), 'utf8');
  const context = vm.createContext({ window: {}, console });
  for (const [, relativePath] of html.matchAll(/<script src="([^"]+)"/g)) {
    const source = fs.readFileSync(path.join(project, relativePath), 'utf8');
    const script = new vm.Script(source, { filename: relativePath });
    // Compile all scripts, but do not substitute a mocked WebGL/DOM for a browser test.
    if (relativePath === 'game.js' || relativePath.startsWith('vendor/')) continue;
    script.runInContext(context);
  }
  const { Aquateen, AQUATEEN_SCENE: data, AQUATEEN_ART: art } = context.window;
  const engine = new Aquateen.Engine(data);
  const frame = Aquateen.buildSceneFrame(engine, art, new Aquateen.Geometry(data, art));
  assert.equal(frame.drawables.map(drawable => drawable.symbolId).join(','), '2,4,6,13,18,23');
  assert.equal(frame.buttons.length, 4);
  assert.equal(frame.announcement, 'Selecione o Heroi');
}

verifyFixedStepClock();
verifyTextAlignment();
verifyOfflineScriptOrder();
console.log('PASS fixed timing, pause/resume, numeric alignment and offline script load order');

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const {Engine} = require('../src/engine.js');
const {Geometry, matrix, multiply, transformBounds} = require('../geometry.js');
const data = require('../assets/scene.json');
const scope = {window:{}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../art-data.js'),'utf8'),scope);
const art = scope.window.AQUATEEN_ART;
const geometry = new Geometry(data,art);
const intersects = (a,b) => {
  const aa=geometry.bounds(a),bb=geometry.bounds(b);
  return !!aa&&!!bb&&aa[0]<=bb[1]&&aa[1]>=bb[0]&&aa[2]<=bb[3]&&aa[3]>=bb[2];
};
assert.deepEqual(transformBounds([0,10,0,20],multiply(matrix({scale:[2,3],skew:[0,0],xy:[5,7]}),[1,0,0,1,10,20])),[25,45,67,127]);

const seen = new Set();
function validateDisplay(engine) {
  for (const instance of engine.list()) {
    if (instance.type==='button') {
      const bounds=geometry.bounds(instance,true);
      assert(bounds&&bounds.every(Number.isFinite),'Button needs finite world-space hit area');
      assert(bounds[1]>bounds[0]&&bounds[3]>bounds[2]);
    }
    if (instance.type==='sprite'||instance.type==='button') continue;
    const symbol=art.symbols[instance.id];
    assert(symbol,'Missing artwork '+instance.id);
    assert(symbol.bounds.every(Number.isFinite),'Bad bounds '+instance.id);
    if (instance.type==='editText') {
      assert(art.deviceFont.glyphs['0']&&art.deviceFont.glyphs['9']);
      const svg=art.makeTextSVG(instance.id,instance.symbol.text||'1000');
      assert(!svg.includes('NaN'),'Bad text layout '+instance.id);
    } else assert(symbol.image?.startsWith('data:image/'),'Artwork must work offline: '+instance.id);
    seen.add(instance.id);
  }
}
for (const [index,id] of [11,16,21,26].entries()) {
  const engine=new Engine(data,{random:()=>.5});
  validateDisplay(engine);
  const button=engine.list().find(i=>i.id===id);
  for(const state of [2,4,1]) {engine.setButtonState(button,state);validateDisplay(engine);}
  const visibleBounds=geometry.bounds(button);
  assert(visibleBounds[3]-visibleBounds[2]>50,'Button bounds include character sprite');
  engine.clickButton(button);
  const waves=new Set();
  for(let tick=0;tick<1100;tick++) {
    engine.tick();validateDisplay(engine);
    const relative=engine.root.frame-index*81;
    if([39,42,45,48].includes(relative))waves.add(relative);
  }
  assert.equal(waves.size,4);
  assert.equal(engine.root.frame,81+index*81);
  engine.reset();engine.clickButton(engine.list().find(i=>i.id===id));
  for(let tick=0;tick<36;tick++)engine.tick();
  const hero=engine.drag;
  const enemy=engine.list().find(i=>i.events.some(e=>e.event&2));
  engine.setPointer(enemy._x,enemy._y);
  assert(intersects(hero,enemy),'Original hero/enemy bounds must collide');
  engine.setPointer(-1000,-1000);
  assert(!intersects(hero,enemy),'Separated bounds must not collide');
  engine.options.hitTest=intersects;
  enemy._x=300;enemy._y=100;enemy.vars.velo=0;engine.setPointer(300,100);
  engine.tick();enemy._x=-1000;
  for(let tick=0;tick<12;tick++)engine.tick();
  assert.equal(engine.root.vars.vidas,4,'Real geometry collision must remove one life after animation');
  engine.root.vars.vidas=0;engine.tick();validateDisplay(engine);
  assert.equal(engine.root.frame,82+index*81);
  const staleButton=engine.list().find(i=>i.type==='button');
  engine.reset();engine.clickButton(staleButton);
  assert.equal(engine.root.frame,1,'Disposed buttons cannot change a restarted game');
}
console.log(`PASS ${seen.size} display-list symbols across all four heroes, hover/down states, countdowns, four waves, endings, actual collision bounds and damage.`);
console.log('PASS offline asset completeness, text glyphs, transforms and original 600×450 / 12 FPS metadata.');
assert.equal(data.width,600);assert.equal(data.height,450);assert.equal(data.fps,12);

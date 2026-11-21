const assert = require('node:assert/strict');
const {Engine} = require('../src/engine.js');
const data = require('../assets/scene.json');

for (const [index,id] of [11,16,21,26].entries()) {
  const engine = new Engine(data,{random:()=>0.5});
  assert.equal(engine.root.frame,1);
  assert.equal(engine.root.playing,false);
  engine.clickButton(engine.list().find(i=>i.id===id));
  for(let i=0;i<36;i++)engine.tick();
  assert.equal(engine.root.vars.vidas,5);
  assert.equal(engine.root.vars.pontos,1);
  engine.setPointer(100,200);
  assert.equal(engine.drag._x,100);
  assert.equal(engine.drag._y,200);
  for(let i=0;i<999;i++)engine.tick();
  assert.equal(engine.root.vars.pontos,1000);
  for(let i=0;i<40;i++)engine.tick();
  assert.equal(engine.root.frame,81+81*index);
  assert.equal(engine.root.playing,false);
  engine.clickButton(engine.list().find(i=>i.id===133));
  assert.equal(engine.root.frame,1);
  console.log('PASS character',id,'start / drag / four waves / victory / menu');
}

const engine=new Engine(data,{random:()=>0.5});
engine.clickButton(engine.list().find(i=>i.id===11));
for(let i=0;i<36;i++)engine.tick();
let collided=false;
engine.options.hitTest=()=>{if(!collided){collided=true;return true;}return false;};
for(let i=0;i<12;i++)engine.tick();
assert.equal(engine.root.vars.vidas,4);
engine.root.vars.vidas=0;engine.tick();
assert.equal(engine.root.frame,82);
assert.equal(engine.cursorVisible,true);
engine.clickButton(engine.list().find(i=>i.id===131));
for(let i=0;i<36;i++)engine.tick();
assert.equal(engine.root.vars.vidas,5);
console.log('PASS damage / death / retry');

/* Native JavaScript timeline and action execution for the opcodes found in Aquateen.
 * Data is decoded from the supplied SWF. No Flash player or emulation library. */
(function (global) {
  'use strict';
  const clone = value => JSON.parse(JSON.stringify(value));
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const identity = () => ({scale:[1,1],skew:[0,0],xy:[0,0]});
  let serial = 0;

  class Instance {
    constructor(engine, id, parent, spec = {}) {
      this.engine = engine; this.id = id; this.parent = parent; this.uid = ++serial;
      this.symbol = id === 'root' ? {type:'sprite'} : engine.data.symbols[id];
      this.type = this.symbol?.type || 'art';
      this.depth = spec.depth || 0; this.name = spec.name || '';
      this.matrix = clone(spec.matrix || identity());
      this.cxform = clone(spec.cxform || {mult:[1,1,1,1],add:[0,0,0,0]});
      this.ratio = spec.ratio || 0; this.clipDepth = spec.clipDepth;
      this.events = spec.events || []; this.vars = {}; this.children = new Map();
      this.frame = 0; this.playing = true; this.removed = false; this.buttonState = 1;
      this.spec = spec; this.born = engine.ticks;
    }
    get _x() { return this.matrix.xy[0]; }
    set _x(v) { this.matrix.xy[0] = Number(v); }
    get _y() { return this.matrix.xy[1]; }
    set _y(v) { this.matrix.xy[1] = Number(v); }
    get _root() { return this.engine.root; }
    get _currentframe() { return this.frame; }
    get _totalframes() { return this.engine.data.timelines[this.id]?.frameCount || 1; }
    get(name) {
      if (name === 'this') return this;
      if (name === '_root') return this.engine.root;
      if (name === '_parent') return this.parent;
      if (name in this.vars) return this.vars[name];
      if (name in this && !name.startsWith('__')) return this[name];
      for (const child of this.children.values()) if (child.name === name) return child;
      return undefined;
    }
    set(name, value) {
      if (name === '_x' || name === '_y') this[name] = value;
      else this.vars[name] = value;
    }
    gotoAndPlay(frame) { this.playing = true; this.engine.goto(this, frame); }
    gotoAndStop(frame) { this.playing = false; this.engine.goto(this, frame); }
    startDrag(lockCenter) { this.engine.drag = this; this.engine.dragLock = lockCenter; this.engine.syncPointer(); }
    hitTest(other) { return this.engine.hitTest(this, other); }
  }

  class Engine {
    constructor(data, options = {}) {
      this.data = data; this.options = options; this.random = options.random || Math.random;
      this.ticks = 0; this.pointer = {x:data.width/2,y:data.height/2};
      this.drag = null; this.cursorVisible = true; this.snapshots = {}; this.errors = [];
      this.Mouse = {hide:()=>{this.cursorVisible=false;},show:()=>{this.cursorVisible=true;}};
      for (const [id, timeline] of Object.entries(data.timelines)) {
        const display = new Map(); let placement = 0;
        this.snapshots[id] = timeline.frames.map(commands => {
          for (const command of commands) {
            if (command.op === 'remove') display.delete(command.depth);
            if (command.op !== 'place') continue;
            const old = display.get(command.depth);
            const replace = !old || !command.move || ('id' in command && command.id !== old.id);
            const spec = replace ? {matrix:identity(),placement:++placement} : clone(old);
            Object.assign(spec,clone(command)); display.set(command.depth,spec);
          }
          return new Map([...display].map(([depth,spec])=>[depth,clone(spec)]));
        });
      }
      this.root = new Instance(this, 'root', null); this.goto(this.root,1);
    }
    reset() {
      this.dispose(this.root); this.drag = null; this.cursorVisible = true; this.ticks = 0;
      this.root = new Instance(this,'root',null); this.goto(this.root,1);
    }
    dispose(instance) {
      instance.removed = true;
      if (this.drag === instance) this.drag = null;
      for (const child of instance.children.values()) this.dispose(child);
    }
    goto(instance, frame) {
      const timeline = this.data.timelines[instance.id];
      if (!timeline || instance.removed) return;
      frame = Math.max(1,Math.min(timeline.frameCount,Math.floor(Number(frame)||1)));
      // Goto the current frame leaves its active hit animation running.
      if (instance.frame === frame) return;
      if ((this.jumpDepth || 0) > 60) throw new Error('Timeline jump recursion');
      this.jumpDepth = (this.jumpDepth || 0) + 1;
      const snapshot = this.snapshots[instance.id][frame-1];
      for (const [depth,child] of [...instance.children]) {
        const next = snapshot.get(depth);
        if (!next || next.placement !== child.spec.placement || next.id !== child.id) {
          this.dispose(child); instance.children.delete(depth);
        }
      }
      const created = [];
      for (const [depth,spec] of snapshot) {
        let child = instance.children.get(depth);
        if (!child) {
          child = new Instance(this,spec.id,instance,spec);instance.children.set(depth,child);created.push(child);
        } else {
          for (const field of ['matrix','cxform']) if (!same(spec[field],child.spec[field])) child[field]=clone(spec[field] || (field==='matrix'?identity():{mult:[1,1,1,1],add:[0,0,0,0]}));
          child.ratio=spec.ratio||0;child.name=spec.name||'';child.spec=spec;
        }
      }
      instance.frame=frame;
      // All names exist before child load actions and parent frame scripts run.
      for (const child of created) {
        if (child.type==='sprite') this.goto(child,1);
        if (child.type==='button') this.populateButton(child);
        for (const event of child.events) if (event.event&1) this.run(event.actions,child);
      }
      for (const command of timeline.frames[frame-1]) if (command.op==='actions') this.run(command.actions,instance);
      this.jumpDepth--;
    }
    populateButton(button) {
      for (const child of button.children.values()) this.dispose(child);
      button.children.clear();
      for (const record of button.symbol.records) if (record.flags & button.buttonState) {
        const child=new Instance(this,record.id,button,record);button.children.set(record.depth,child);
        if (child.type==='sprite') this.goto(child,1);
      }
    }
    setButtonState(button,state) {
      if (button.type==='button' && button.buttonState!==state) {button.buttonState=state;this.populateButton(button);}
    }
    clickButton(button) {
      if (!button || button.type!=='button' || button.removed) return;
      for (const event of button.symbol.actions) if (event.condition&8) this.run(event.actions,button.parent);
    }
    setPointer(x,y) { this.pointer.x=x;this.pointer.y=y;this.syncPointer(); }
    syncPointer() {
      if (!this.drag || this.drag.removed) return;
      // Every startDrag in this game locks the centre in root coordinates.
      this.drag._x=this.pointer.x;this.drag._y=this.pointer.y;
    }
    list() {
      const result=[];const visit=i=>{result.push(i);for(const child of i.children.values()) visit(child);};visit(this.root);return result;
    }
    tick() {
      this.ticks++;this.syncPointer();
      const existing=this.list();
      for (const instance of existing) if (!instance.removed) for (const event of instance.events) if(event.event&2) this.run(event.actions,instance);
      for (const instance of existing) {
        if (instance.removed || !instance.playing || instance.type!=='sprite') continue;
        this.goto(instance,instance.frame%instance._totalframes+1);
      }
      this.options.onTick?.(this);
    }
    hitTest(a,b) {
      if (!a || !b || a.removed || b.removed) return false;
      if (this.options.hitTest) return this.options.hitTest(a,b);
      if (!this.options.bounds) return false;
      const aa=this.options.bounds(a),bb=this.options.bounds(b);
      return !!aa&&!!bb&&aa.x<bb.x+bb.width&&aa.x+aa.width>bb.x&&aa.y<bb.y+bb.height&&aa.y+aa.height>bb.y;
    }
    value(object,name) {return object instanceof Instance ? object.get(name) : object?.[name];}
    assign(object,name,value) {if(object instanceof Instance)object.set(name,value);else if(object)object[name]=value;}
    variable(instance,name) {
      if(name==='Mouse')return this.Mouse;if(name==='_root')return this.root;if(name==='this')return instance;
      const own=instance.get(name);return own===undefined&&instance!==this.root?this.root.get(name):own;
    }
    run(actions,instance) {
      const stack=[];const offsets=new Map(actions.map((a,i)=>[a.offset,i]));
      let pc=0,budget=10000;
      while(pc<actions.length&&budget--){
        const action=actions[pc++];let a,b,obj,name,n,result;
        switch(action.op){
          case 'End':return;case 'ConstantPool':break;
          case 'Push':stack.push(...action.arg);break;
          case 'Pop':stack.pop();break;
          case 'GetVariable':stack.push(this.variable(instance,stack.pop()));break;
          case 'SetVariable':a=stack.pop();name=stack.pop();instance.set(name,a);break;
          case 'GetMember':name=stack.pop();obj=stack.pop();stack.push(this.value(obj,name));break;
          case 'SetMember':a=stack.pop();name=stack.pop();obj=stack.pop();this.assign(obj,name,a);break;
          case 'RandomNumber':n=Number(stack.pop());stack.push(Math.floor(this.random()*n));break;
          case 'Increment':stack.push(Number(stack.pop())+1);break;
          case 'Decrement':stack.push(Number(stack.pop())-1);break;
          case 'Not':stack.push(!stack.pop());break;
          case 'Add2':b=stack.pop();a=stack.pop();stack.push(a+b);break;
          case 'Less2':b=stack.pop();a=stack.pop();stack.push(a<b);break;
          case 'Greater':b=stack.pop();a=stack.pop();stack.push(a>b);break;
          case 'If':if(stack.pop())pc=offsets.get(action.arg.target)??actions.length;break;
          case 'Jump':pc=offsets.get(action.arg.target)??actions.length;break;
          case 'GotoFrame':this.goto(instance,action.arg);break;
          case 'Stop':instance.playing=false;break;
          case 'Play':instance.playing=true;break;
          case 'CallMethod':
            name=stack.pop();obj=stack.pop();n=Number(stack.pop());a=[];while(n-->0)a.push(stack.pop());
            result=typeof obj?.[name]==='function'?obj[name](...a):undefined;stack.push(result);break;
          default:throw new Error('Unsupported recovered opcode '+action.op);
        }
      }
      if(budget<=0)throw new Error('Action instruction budget exhausted');
    }
  }
  global.AquateenEngine=Engine;
  if(typeof module!=='undefined'&&module.exports)module.exports={Engine,Instance};
})(typeof window==='undefined'?globalThis:window);

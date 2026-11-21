(function (scope) {
  'use strict';
  const { DisplayInstance } = typeof module !== 'undefined'
    ? require('./runtime/display-instance.js') : scope.Aquateen;
  const { compileTimelines, matchesPlacement, collectInstances } = typeof module !== 'undefined'
    ? require('./runtime/timeline.js') : scope.Aquateen;
  const { runActions } = typeof module !== 'undefined'
    ? require('./runtime/action-runner.js') : scope.Aquateen;

  const CLIP_LOAD = 1;
  const CLIP_ENTER_FRAME = 2;
  const BUTTON_RELEASE = 8;

  // Coordinates live instances and timelines. It knows nothing about the browser or Three.js.
  class Engine {
    constructor(data, options = {}) {
      this.data = data;
      this.options = options;
      this.random = options.random || Math.random;
      this.frameSnapshotsBySymbol = compileTimelines(data.timelines);
      this.pointer = { x: data.width / 2, y: data.height / 2 };
      this.jumpDepth = 0;
      this.Mouse = {
        hide: () => { this.cursorVisible = false; },
        show: () => { this.cursorVisible = true; },
      };
      this.reset();
    }

    reset() {
      if (this.root) this.dispose(this.root);
      this.drag = null;
      this.cursorVisible = true;
      this.ticks = 0;
      this.root = new DisplayInstance(this, 'root', null);
      this.goToFrame(this.root, 1);
    }

    dispose(instance) {
      instance.removed = true;
      if (this.drag === instance) this.drag = null;
      instance.children.forEach(child => this.dispose(child));
    }

    goToFrame(instance, requestedFrame) {
      const timeline = this.data.timelines[instance.id];
      if (!timeline || instance.removed) return;
      const frame = Math.max(1, Math.min(timeline.frameCount, Math.floor(Number(requestedFrame) || 1)));
      if (instance.frame === frame) return;
      if (this.jumpDepth > 60) throw new Error('Timeline jump recursion');
      this.jumpDepth++;
      try {
        this.enterFrame(instance, frame, timeline.frames[frame - 1]);
      } finally {
        this.jumpDepth--;
      }
    }

    enterFrame(instance, frame, commands) {
      const snapshot = this.frameSnapshotsBySymbol[instance.id][frame - 1];
      this.removeReplacedChildren(instance, snapshot);
      const created = this.applyPlacements(instance, snapshot);
      instance.frame = frame;
      // All named children must exist before any load or frame scripts execute.
      created.forEach(child => this.initializeChild(child));
      this.runFrameActions(instance, commands);
    }

    removeReplacedChildren(parent, snapshot) {
      for (const [depth, child] of parent.children) {
        if (matchesPlacement(child, snapshot.get(depth))) continue;
        this.dispose(child);
        parent.children.delete(depth);
      }
    }

    applyPlacements(parent, snapshot) {
      const created = [];
      for (const [depth, placement] of snapshot) {
        const child = parent.children.get(depth);
        if (child) child.updatePlacement(placement);
        else created.push(this.createChild(parent, placement));
      }
      return created;
    }

    createChild(parent, placement) {
      const child = new DisplayInstance(this, placement.id, parent, placement);
      parent.children.set(placement.depth, child);
      return child;
    }

    initializeChild(child) {
      if (child.type === 'sprite') this.goToFrame(child, 1);
      if (child.type === 'button') this.populateButton(child);
      this.runClipEvent(child, CLIP_LOAD);
    }

    runFrameActions(instance, commands) {
      for (const command of commands) {
        if (command.op === 'actions') runActions(this, instance, command.actions);
      }
    }

    runClipEvent(instance, eventFlag) {
      if (instance.removed) return;
      for (const event of instance.events) {
        if (event.event & eventFlag) runActions(this, instance, event.actions);
      }
    }

    populateButton(button) {
      button.children.forEach(child => this.dispose(child));
      button.children.clear();
      for (const record of button.symbol.records) {
        if (!(record.flags & button.buttonState)) continue;
        const child = this.createChild(button, record);
        if (child.type === 'sprite') this.goToFrame(child, 1);
      }
    }

    setButtonState(button, state) {
      if (button.type !== 'button' || button.buttonState === state) return;
      button.buttonState = state;
      this.populateButton(button);
    }

    clickButton(button) {
      if (!button || button.type !== 'button' || button.removed) return;
      for (const event of button.symbol.actions) {
        if (event.condition & BUTTON_RELEASE) runActions(this, button.parent, event.actions);
      }
    }

    setPointer(x, y) {
      this.pointer = { x, y };
      this.syncPointer();
    }

    syncPointer() {
      if (!this.drag || this.drag.removed) return;
      // Every original startDrag locks the character's centre in root coordinates.
      this.drag._x = this.pointer.x;
      this.drag._y = this.pointer.y;
    }

    list() {
      return collectInstances(this.root);
    }

    tick() {
      this.ticks++;
      this.syncPointer();
      const existing = this.list();
      existing.forEach(instance => this.runClipEvent(instance, CLIP_ENTER_FRAME));
      existing.forEach(instance => this.advanceTimeline(instance));
      this.options.onTick?.(this);
    }

    advanceTimeline(instance) {
      if (instance.removed || !instance.playing || instance.type !== 'sprite') return;
      this.goToFrame(instance, instance.frame % instance._totalframes + 1);
    }

    hitTest(first, second) {
      if (!first || !second || first.removed || second.removed) return false;
      if (this.options.hitTest) return this.options.hitTest(first, second);
      if (!this.options.bounds) return false;
      const a = this.options.bounds(first);
      const b = this.options.bounds(second);
      return !!a && !!b && a.x < b.x + b.width && a.x + a.width > b.x
        && a.y < b.y + b.height && a.y + a.height > b.y;
    }

    readProperty(object, name) {
      return object instanceof DisplayInstance ? object.get(name) : object?.[name];
    }

    writeProperty(object, name, value) {
      if (object instanceof DisplayInstance) object.set(name, value);
      else if (object) object[name] = value;
    }

    resolveVariable(instance, name) {
      if (name === 'Mouse') return this.Mouse;
      if (name === '_root') return this.root;
      if (name === 'this') return instance;
      const value = instance.get(name);
      return value === undefined && instance !== this.root ? this.root.get(name) : value;
    }
  }

  Object.assign(scope.Aquateen ||= {}, { Engine });
  scope.AquateenEngine = Engine;
  if (typeof module !== 'undefined') module.exports = { Engine, Instance: DisplayInstance };
})(typeof window === 'undefined' ? globalThis : window);

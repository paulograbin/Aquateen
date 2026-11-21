(function (scope) {
  'use strict';

  function copyData(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function identityTransform() {
    return { scale: [1, 1], skew: [0, 0], xy: [0, 0] };
  }

  function identityColorTransform() {
    return { mult: [1, 1, 1, 1], add: [0, 0, 0, 0] };
  }

  let nextInstanceId = 0;

  // One live placement of a symbol. Multiple placements may share the same symbol.
  class DisplayInstance {
    constructor(engine, symbolId, parent, placement = {}) {
      this.engine = engine;
      this.id = symbolId;
      this.uid = ++nextInstanceId;
      this.parent = parent;
      this.symbol = symbolId === 'root' ? { type: 'sprite' } : engine.data.symbols[symbolId];
      this.type = this.symbol?.type || 'art';
      this.depth = placement.depth || 0;
      this.name = placement.name || '';
      this.matrix = copyData(placement.matrix || identityTransform());
      this.cxform = copyData(placement.cxform || identityColorTransform());
      this.ratio = placement.ratio || 0;
      this.clipDepth = placement.clipDepth;
      this.events = placement.events || [];
      this.vars = {};
      this.children = new Map();
      this.frame = 0;
      this.playing = true;
      this.removed = false;
      this.buttonState = 1;
      this.placement = placement;
    }

    // These names are the API referenced by the original game scripts.
    get _x() { return this.matrix.xy[0]; }
    set _x(value) { this.matrix.xy[0] = Number(value); }
    get _y() { return this.matrix.xy[1]; }
    set _y(value) { this.matrix.xy[1] = Number(value); }
    get _root() { return this.engine.root; }
    get _currentframe() { return this.frame; }
    get _totalframes() { return this.engine.data.timelines[this.id]?.frameCount || 1; }

    get(name) {
      if (name === 'this') return this;
      if (name === '_root') return this.engine.root;
      if (name === '_parent') return this.parent;
      if (name in this.vars) return this.vars[name];
      if (name in this && !name.startsWith('__')) return this[name];
      return [...this.children.values()].find(child => child.name === name);
    }

    set(name, value) {
      if (name === '_x' || name === '_y') this[name] = value;
      else this.vars[name] = value;
    }

    gotoAndPlay(frame) {
      this.playing = true;
      this.engine.goToFrame(this, frame);
    }

    gotoAndStop(frame) {
      this.playing = false;
      this.engine.goToFrame(this, frame);
    }

    startDrag(lockCenter) {
      this.engine.drag = this;
      this.engine.dragLock = lockCenter;
      this.engine.syncPointer();
    }

    hitTest(other) {
      return this.engine.hitTest(this, other);
    }

    updatePlacement(placement) {
      this.updateTransform('matrix', placement, identityTransform);
      this.updateTransform('cxform', placement, identityColorTransform);
      this.ratio = placement.ratio || 0;
      this.name = placement.name || '';
      this.placement = placement;
    }

    updateTransform(field, placement, defaultValue) {
      // Preserve positions changed by scripts unless the timeline changes the placement.
      if (JSON.stringify(placement[field]) === JSON.stringify(this.placement[field])) return;
      this[field] = copyData(placement[field] || defaultValue());
    }
  }

  const exports = { DisplayInstance, copyData, identityTransform, identityColorTransform };
  Object.assign(scope.Aquateen ||= {}, exports);
  if (typeof module !== 'undefined') module.exports = exports;
})(typeof window === 'undefined' ? globalThis : window);

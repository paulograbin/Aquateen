(function (scope) {
  'use strict';
  const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
  const COLORS = { hero: '#62ff96', enemy: '#ffc766', button: '#76caff', overlap: '#ff537e' };

  function number(value, decimals = 0) {
    return Number.isFinite(value) ? value.toFixed(decimals) : '—';
  }

  function position({ x, y }) {
    return number(x, 1) + ', ' + number(y, 1);
  }

  function diagnosticsText(snapshot) {
    const { performance, renderStats, hero } = snapshot;
    return [
      'DEBUG · ' + (snapshot.paused ? 'paused' : 'running') + ' · D to hide',
      'Display FPS  ' + number(performance.displayFps, 1) + ' / ' + number(performance.frameMilliseconds, 1) + ' ms',
      'Game ticks/s ' + number(snapshot.paused ? 0 : performance.tickRate, 1) + ' / ' + snapshot.targetTickRate + ' target',
      'Timeline     ' + snapshot.frame + '/' + snapshot.totalFrames + (snapshot.timelinePlaying ? ' playing' : ' stopped'),
      'Rendered     ' + performance.renderedFrames + ' · ticks ' + snapshot.ticks,
      'Hero frame   ' + (hero ? hero.frame + '/' + hero.totalFrames + ' · #' + hero.symbolId : '—'),
      'Lives / score ' + number(snapshot.lives) + ' / ' + number(snapshot.score),
      'Pointer      ' + position(snapshot.pointer),
      'Hero         ' + (hero ? position(hero) : '—'),
      'Enemies      ' + snapshot.enemyCount + ' · overlaps ' + snapshot.overlappingEnemies,
      'Objects      ' + snapshot.instanceCount + ' · sprites ' + snapshot.drawableCount,
      'Draw calls   ' + renderStats.drawCalls + ' · tris ' + renderStats.triangles,
      'GPU textures ' + renderStats.textures + ' · shapes ' + renderStats.geometries,
    ].join(String.fromCharCode(10));
  }

  function createBoxElements() {
    const group = document.createElementNS(SVG_NAMESPACE, 'g');
    const rectangle = document.createElementNS(SVG_NAMESPACE, 'rect');
    const label = document.createElementNS(SVG_NAMESPACE, 'text');
    rectangle.setAttribute('vector-effect', 'non-scaling-stroke');
    group.append(rectangle, label);
    return { group, rectangle, label };
  }

  function updateBox(elements, box, stageSize) {
    const [left, right, top, bottom] = box.bounds;
    const color = box.overlapping ? COLORS.overlap : COLORS[box.kind];
    const attributes = { x: left, y: top, width: right - left, height: bottom - top, stroke: color };
    for (const [name, value] of Object.entries(attributes)) elements.rectangle.setAttribute(name, value);
    elements.label.setAttribute('x', Math.max(2, Math.min(left, stageSize.width - 100)));
    elements.label.setAttribute('y', Math.max(10, Math.min(top - 3, stageSize.height - 3)));
    elements.label.setAttribute('fill', color);
    elements.label.textContent = box.name + ' #' + box.symbolId;
  }

  class DebugOverlay {
    constructor(container, stageSize) {
      this.container = container;
      this.stageSize = stageSize;
      this.hitboxes = container.querySelector('svg');
      this.info = container.querySelector('pre');
      this.elements = new Map();
      this.hitboxes.setAttribute('viewBox', '0 0 ' + stageSize.width + ' ' + stageSize.height);
    }

    update(snapshot, enabled) {
      this.container.hidden = !enabled;
      if (!enabled) return;
      this.updateBoxes(snapshot.boxes);
      const text = diagnosticsText(snapshot);
      if (this.info.textContent !== text) this.info.textContent = text;
    }

    updateBoxes(boxes) {
      const activeIds = new Set();
      for (const box of boxes) {
        if (!this.elements.has(box.key)) this.addBox(box.key);
        updateBox(this.elements.get(box.key), box, this.stageSize);
        activeIds.add(box.key);
      }
      for (const [key, elements] of this.elements) {
        if (activeIds.has(key)) continue;
        elements.group.remove();
        this.elements.delete(key);
      }
    }

    addBox(key) {
      const elements = createBoxElements();
      this.elements.set(key, elements);
      this.hitboxes.append(elements.group);
    }
  }

  Object.assign(scope.Aquateen, { DebugOverlay });
})(window);

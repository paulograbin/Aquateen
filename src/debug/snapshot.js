(function (scope) {
  'use strict';
  const { boundsIntersect } = typeof module !== 'undefined'
    ? require('../scene/geometry.js') : scope.Aquateen;
  const ENTER_FRAME_EVENT = 2;

  function actorBox(instance, kind, geometry) {
    return { key: instance.uid, symbolId: instance.id, kind,
      name: instance.name || kind, bounds: geometry.bounds(instance),
      frame: instance.frame, totalFrames: instance._totalframes,
      x: instance._x, y: instance._y, overlapping: false };
  }

  function enemyBoxes(instances, hero, geometry) {
    // In the recovered game, falling enemies are the clips with enter-frame actions.
    return instances.filter(instance => instance !== hero
      && instance.events.some(event => event.event & ENTER_FRAME_EVENT))
      .map(instance => actorBox(instance, 'enemy', geometry));
  }

  function markOverlaps(hero, enemies) {
    for (const enemy of enemies) enemy.overlapping = !!hero && boundsIntersect(hero.bounds, enemy.bounds);
    if (hero) hero.overlapping = enemies.some(enemy => enemy.overlapping);
  }

  function buttonBoxes(buttons) {
    return buttons.map(({ instance, bounds, label }) => ({ key: instance.uid,
      symbolId: instance.id, kind: 'button', name: label, bounds, overlapping: false }));
  }

  // Read-only inspection: no hitTest calls, frame changes or script execution.
  function buildDebugSnapshot({ engine, geometry, sceneFrame, performance, renderStats, paused }) {
    const instances = engine.list();
    const heroInstance = engine.drag && !engine.drag.removed ? engine.drag : null;
    const hero = heroInstance ? actorBox(heroInstance, 'hero', geometry) : null;
    const enemies = enemyBoxes(instances, heroInstance, geometry);
    markOverlaps(hero, enemies);
    return {
      paused, performance, renderStats,
      frame: engine.root.frame, totalFrames: engine.root._totalframes,
      timelinePlaying: engine.root.playing,
      ticks: engine.ticks, targetTickRate: engine.data.fps,
      lives: engine.root.vars.vidas ?? null, score: engine.root.vars.pontos ?? null,
      pointer: { ...engine.pointer }, hero, enemyCount: enemies.length,
      overlappingEnemies: enemies.filter(enemy => enemy.overlapping).length,
      instanceCount: instances.length, drawableCount: sceneFrame.drawables.length,
      boxes: [hero, ...enemies, ...buttonBoxes(sceneFrame.buttons)].filter(box => box?.bounds),
    };
  }

  const exports = { buildDebugSnapshot };
  Object.assign(scope.Aquateen ||= {}, exports);
  if (typeof module !== 'undefined') module.exports = exports;
})(typeof window === 'undefined' ? globalThis : window);

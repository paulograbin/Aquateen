(function (scope) {
  'use strict';
  const { toAffineMatrix, multiplyTransforms, IDENTITY_TRANSFORM } = typeof module !== 'undefined'
    ? require('./geometry.js') : scope.Aquateen;

  const BUTTON_LABELS = {
    11: 'Mestre Shake',
    16: 'Almôndega',
    21: 'Peterson',
    26: 'Batatão',
    131: 'Jogar novamente',
    133: 'Escolher outro heroi',
  };
  const VICTORY_FRAMES = new Set([81, 162, 243, 324]);
  const GAME_OVER_FRAMES = new Set([82, 163, 244, 325]);

  function buttonLabel(button, art) {
    if (BUTTON_LABELS[button.id]) return BUTTON_LABELS[button.id];
    for (const record of button.symbol.records) {
      const label = art.symbols[record.id]?.text;
      if (label) return label;
    }
    return 'Jogar novamente';
  }

  function gameAnnouncement(engine) {
    const frame = engine.root.frame;
    if (frame === 1) return 'Selecione o Heroi';
    if (VICTORY_FRAMES.has(frame)) return 'Você venceu os Luanitos e salvou Carl!';
    if (GAME_OVER_FRAMES.has(frame)) return 'Game over';
    const lives = engine.root.vars.vidas;
    return lives === undefined ? '' : 'Vidas: ' + lives;
  }

  function textValue(instance, engine) {
    const { variable, text } = instance.symbol;
    const value = variable ? engine.resolveVariable(instance.parent || engine.root, variable) : text;
    return value === undefined || value === null ? '' : String(value);
  }

  function createDrawable(instance, transform, engine, art) {
    const bounds = art.symbols[instance.id]?.bounds || instance.symbol?.bounds;
    if (!bounds) return null;
    return {
      instanceId: instance.uid,
      symbolId: instance.id,
      bounds,
      transform,
      colorTransform: instance.cxform,
      text: instance.type === 'editText' ? textValue(instance, engine) : null,
      textFormat: instance.type === 'editText' ? instance.symbol : null,
    };
  }

  // Converts game state into presentation data. Neither DOM nor GPU objects enter this layer.
  function buildSceneFrame(engine, art, geometry) {
    const drawables = [], buttons = [];
    function visit(instance, parentTransform) {
      const transform = multiplyTransforms(parentTransform, toAffineMatrix(instance.matrix));
      if (instance.type === 'button') {
        buttons.push({ instance, bounds: geometry.bounds(instance, true), label: buttonLabel(instance, art) });
      }
      const isContainer = instance.children.size || instance.type === 'sprite' || instance.type === 'button';
      if (isContainer) {
        const children = [...instance.children.values()].sort((left, right) => left.depth - right.depth);
        children.forEach(child => visit(child, transform));
      } else {
        const drawable = createDrawable(instance, transform, engine, art);
        if (drawable) drawables.push(drawable);
      }
    }
    visit(engine.root, IDENTITY_TRANSFORM);
    return { drawables, buttons, frame: engine.root.frame,
      cursorVisible: engine.cursorVisible, announcement: gameAnnouncement(engine) };
  }

  const exports = { buildSceneFrame };
  Object.assign(scope.Aquateen ||= {}, exports);
  if (typeof module !== 'undefined') module.exports = exports;
})(typeof window === 'undefined' ? globalThis : window);

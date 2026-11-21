(function (scope) {
  'use strict';
  const TEXT_RESOLUTION = 2;

  function textLayout(format, font, text) {
    const scale = format.fontHeight / font.unitsPerEm;
    const glyphs = [...text].map(character => font.glyphs[character]).filter(Boolean);
    const width = glyphs.reduce((sum, glyph) => sum + glyph.advance * scale, 0);
    const fieldWidth = format.bounds[1] - format.bounds[0];
    let x = 2 + (format.leftMargin || 0) + (format.indent || 0);
    if (format.align === 1) x = fieldWidth - 2 - (format.rightMargin || 0) - width;
    if (format.align === 2) x = (fieldWidth - width) / 2;
    return { glyphs, scale, x, baseline: 2 + font.ascent * scale };
  }

  function createTextCanvas(bounds) {
    const [left, right, top, bottom] = bounds;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.ceil((right - left) * TEXT_RESOLUTION));
    canvas.height = Math.max(1, Math.ceil((bottom - top) * TEXT_RESOLUTION));
    return canvas;
  }

  function prepareContext(canvas, color) {
    const context = canvas.getContext('2d');
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.scale(TEXT_RESOLUTION, TEXT_RESOLUTION);
    const [red, green, blue, alpha] = color;
    context.fillStyle = 'rgba(' + [red, green, blue, alpha / 255].join(',') + ')';
    return context;
  }

  function paintGlyph(context, glyph, x, baseline, scale) {
    context.save();
    context.translate(x, baseline);
    context.scale(scale, -scale);
    context.fill(new Path2D(glyph.path));
    context.restore();
  }

  function paintText(canvas, format, font, text) {
    const context = prepareContext(canvas, format.color || [0, 0, 0, 255]);
    const layout = textLayout(format, font, text);
    let x = layout.x;
    for (const glyph of layout.glyphs) {
      paintGlyph(context, glyph, x, layout.baseline, layout.scale);
      x += glyph.advance * layout.scale;
    }
  }

  const exports = { createTextCanvas, paintText, textLayout };
  Object.assign(scope.Aquateen ||= {}, exports);
  if (typeof module !== 'undefined') module.exports = exports;
})(typeof window === 'undefined' ? globalThis : window);

(function (scope) {
  'use strict';
  const IDENTITY_TRANSFORM = [1, 0, 0, 1, 0, 0];

  // Affine order: [scaleX, skewY, skewX, scaleY, translateX, translateY].
  function toAffineMatrix(transform) {
    if (!transform) return [...IDENTITY_TRANSFORM];
    return [transform.scale[0], transform.skew[0], transform.skew[1], transform.scale[1], ...transform.xy];
  }

  function multiplyTransforms(parent, child) {
    const [a, b, c, d, x, y] = parent;
    const [e, f, g, h, u, v] = child;
    return [a*e + c*f, b*e + d*f, a*g + c*h, b*g + d*h, a*u + c*v + x, b*u + d*v + y];
  }

  // Bounds throughout the port are [left, right, top, bottom] in stage pixels.
  function transformBounds(bounds, transform) {
    const [a, b, c, d, translateX, translateY] = transform;
    const horizontal = [], vertical = [];
    for (const x of [bounds[0], bounds[1]]) for (const y of [bounds[2], bounds[3]]) {
      horizontal.push(a*x + c*y + translateX);
      vertical.push(b*x + d*y + translateY);
    }
    return [Math.min(...horizontal), Math.max(...horizontal), Math.min(...vertical), Math.max(...vertical)];
  }

  function combineBounds(candidates) {
    const bounds = candidates.filter(Boolean);
    if (!bounds.length) return null;
    return [Math.min(...bounds.map(box => box[0])), Math.max(...bounds.map(box => box[1])),
      Math.min(...bounds.map(box => box[2])), Math.max(...bounds.map(box => box[3]))];
  }

  function boundsIntersect(first, second) {
    return !!first && !!second && first[0] <= second[1] && first[1] >= second[0]
      && first[2] <= second[3] && first[3] >= second[2];
  }

  class Geometry {
    constructor(data, art) {
      this.symbols = data.symbols;
      this.art = art.symbols;
    }

    localBounds(instance, useHitArea = false) {
      if (instance.type === 'button' && useHitArea) return this.buttonHitArea(instance);
      if (instance.children.size) return this.childrenBounds(instance);
      return this.art[instance.id]?.bounds || this.symbols[instance.id]?.bounds || null;
    }

    buttonHitArea(button) {
      const hitRecords = button.symbol.records.filter(record => record.flags & 8);
      return combineBounds(hitRecords.map(record => {
        const bounds = this.art[record.id]?.bounds;
        return bounds ? transformBounds(bounds, toAffineMatrix(record.matrix)) : null;
      }));
    }

    childrenBounds(parent) {
      return combineBounds([...parent.children.values()].map(child => {
        const bounds = this.localBounds(child);
        return bounds ? transformBounds(bounds, toAffineMatrix(child.matrix)) : null;
      }));
    }

    worldMatrix(instance) {
      const local = toAffineMatrix(instance.matrix);
      return instance.parent ? multiplyTransforms(this.worldMatrix(instance.parent), local) : local;
    }

    bounds(instance, useHitArea = false) {
      const local = this.localBounds(instance, useHitArea);
      return local ? transformBounds(local, this.worldMatrix(instance)) : null;
    }

    intersects(first, second) {
      return boundsIntersect(this.bounds(first), this.bounds(second));
    }
  }

  const exports = { Geometry, toAffineMatrix, multiplyTransforms, transformBounds, combineBounds,
    boundsIntersect, IDENTITY_TRANSFORM };
  Object.assign(scope.Aquateen ||= {}, exports);
  if (typeof module !== 'undefined') module.exports = exports;
})(typeof window === 'undefined' ? globalThis : window);

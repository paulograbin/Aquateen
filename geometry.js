(function (scope) {
  'use strict';
  const IDENTITY = [1, 0, 0, 1, 0, 0];
  function matrix(value) {
    if (!value) return [...IDENTITY];
    return [value.scale[0], value.skew[0], value.skew[1], value.scale[1], ...value.xy];
  }
  function multiply(a, b) {
    return [a[0]*b[0]+a[2]*b[1], a[1]*b[0]+a[3]*b[1],
      a[0]*b[2]+a[2]*b[3], a[1]*b[2]+a[3]*b[3],
      a[0]*b[4]+a[2]*b[5]+a[4], a[1]*b[4]+a[3]*b[5]+a[5]];
  }
  function transformBounds(bounds, m) {
    const xs = [], ys = [];
    for (const x of [bounds[0], bounds[1]]) for (const y of [bounds[2], bounds[3]]) {
      xs.push(m[0]*x+m[2]*y+m[4]); ys.push(m[1]*x+m[3]*y+m[5]);
    }
    return [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  }
  function union(bounds) {
    const list = bounds.filter(Boolean);
    return list.length ? [Math.min(...list.map(b=>b[0])), Math.max(...list.map(b=>b[1])),
      Math.min(...list.map(b=>b[2])), Math.max(...list.map(b=>b[3]))] : null;
  }
  class Geometry {
    constructor(data, art) { this.data = data; this.art = art; }
    localBounds(instance, hit = false) {
      const symbol = this.data.symbols[instance.id];
      if (symbol?.type === 'button' && hit) {
        return union(symbol.records.filter(r=>r.flags & 8).map(r=>{
          const b = this.art.symbols[r.id]?.bounds;
          return b ? transformBounds(b, matrix(r.matrix)) : null;
        }));
      }
      if (instance.children?.size) return union([...instance.children.values()].map(child=>{
        const b = this.localBounds(child);
        return b ? transformBounds(b, matrix(child.matrix)) : null;
      }));
      return this.art.symbols[instance.id]?.bounds || symbol?.bounds || null;
    }
    worldMatrix(instance) {
      const local = matrix(instance.matrix);
      return instance.parent ? multiply(this.worldMatrix(instance.parent), local) : local;
    }
    bounds(instance, hit = false) {
      const b = this.localBounds(instance, hit);
      return b ? transformBounds(b, this.worldMatrix(instance)) : null;
    }
    contains(instance, x, y, hit = true) {
      const b = this.bounds(instance, hit);
      return b && x >= b[0] && x <= b[1] && y >= b[2] && y <= b[3];
    }
  }
  scope.AquateenGeometry = {Geometry, matrix, multiply, transformBounds, union, IDENTITY};
  if (typeof module !== 'undefined') module.exports = scope.AquateenGeometry;
})(typeof window === 'undefined' ? globalThis : window);

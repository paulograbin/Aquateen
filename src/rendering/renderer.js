(function (scope) {
  'use strict';

  function createCamera(width, height) {
    const camera = new THREE.OrthographicCamera(0, width, 0, height, 0.1, 100);
    camera.position.z = 10;
    return camera;
  }

  function createPlane(bounds) {
    const [left, right, top, bottom] = bounds;
    const plane = new THREE.PlaneGeometry(Math.max(.001, right - left), Math.max(.001, bottom - top));
    // Flash's downward Y axis must not invert the texture's UV coordinates.
    plane.scale(1, -1, 1);
    plane.translate((left + right) / 2, (top + bottom) / 2, 0);
    return plane;
  }

  function createMaterial(texture, colorTransform) {
    const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true,
      depthTest: false, depthWrite: false, side: THREE.DoubleSide });
    material.toneMapped = false;
    material.opacity = colorTransform.mult[3];
    material.color.setRGB(...colorTransform.mult.slice(0, 3));
    return material;
  }

  function positionMesh(mesh, transform, order) {
    const [a, b, c, d, x, y] = transform;
    mesh.matrix.set(a, c, 0, x, b, d, 0, y, 0, 0, 1, 0, 0, 0, 0, 1);
    mesh.matrixWorldNeedsUpdate = true;
    mesh.renderOrder = order;
  }

  class GameRenderer {
    constructor(canvas, stage, textures) {
      this.textures = textures;
      this.webgl = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
      this.webgl.outputColorSpace = THREE.SRGBColorSpace;
      this.webgl.setClearColor(stage.background);
      this.scene = new THREE.Scene();
      this.camera = createCamera(stage.width, stage.height);
      this.meshes = new Map();
      this.planes = new Map();
      this.materials = new Map();
    }

    resize(width, height, pixelRatio) {
      this.webgl.setPixelRatio(Math.min(pixelRatio, 2));
      this.webgl.setSize(width, height, false);
    }

    render(drawables) {
      const activeIds = new Set();
      drawables.forEach((drawable, order) => {
        if (this.updateMesh(drawable, order)) activeIds.add(drawable.instanceId);
      });
      this.removeInactiveMeshes(activeIds);
      this.webgl.render(this.scene, this.camera);
    }

    updateMesh(drawable, order) {
      const resource = this.textures.get(drawable);
      if (!resource) return false;
      const material = this.materialFor(resource, drawable.colorTransform);
      const mesh = this.meshFor(drawable, material);
      mesh.material = material;
      positionMesh(mesh, drawable.transform, order);
      return true;
    }

    meshFor(drawable, material) {
      if (!this.meshes.has(drawable.instanceId)) {
        const mesh = new THREE.Mesh(this.planeFor(drawable.bounds), material);
        mesh.matrixAutoUpdate = false;
        this.meshes.set(drawable.instanceId, mesh);
        this.scene.add(mesh);
      }
      return this.meshes.get(drawable.instanceId);
    }

    planeFor(bounds) {
      const key = bounds.join(',');
      if (!this.planes.has(key)) this.planes.set(key, createPlane(bounds));
      return this.planes.get(key);
    }

    materialFor(resource, colorTransform) {
      const key = resource.key + '|' + JSON.stringify(colorTransform);
      if (!this.materials.has(key)) {
        this.materials.set(key, createMaterial(resource.texture, colorTransform));
      }
      return this.materials.get(key);
    }

    removeInactiveMeshes(activeIds) {
      for (const [instanceId, mesh] of this.meshes) {
        if (activeIds.has(instanceId)) continue;
        this.scene.remove(mesh);
        this.meshes.delete(instanceId);
        this.releaseTextResources(instanceId);
      }
    }

    releaseTextResources(instanceId) {
      if (!this.textures.releaseText(instanceId)) return;
      const prefix = 'text:' + instanceId + '|';
      for (const [key, material] of this.materials) {
        if (!key.startsWith(prefix)) continue;
        material.dispose();
        this.materials.delete(key);
      }
    }
  }

  Object.assign(scope.Aquateen, { GameRenderer });
})(window);

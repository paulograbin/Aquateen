(function (scope) {
  'use strict';
  const { createTextCanvas, paintText } = scope.Aquateen;

  function configureTexture(texture) {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.generateMipmaps = false;
    texture.minFilter = texture.magFilter = THREE.LinearFilter;
    texture.needsUpdate = true;
    return texture;
  }

  function loadImageTexture(uri) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(configureTexture(new THREE.Texture(image)));
      image.onerror = () => reject(new Error('Não foi possível carregar uma imagem do jogo.'));
      image.src = uri;
    });
  }

  class TextureStore {
    constructor(art) {
      this.art = art;
      this.artwork = new Map();
      this.text = new Map();
    }

    async loadArtwork() {
      await Promise.all(Object.entries(this.art.symbols).map(async ([id, symbol]) => {
        const uri = symbol.image || (symbol.svg && 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(symbol.svg));
        if (!uri) return;
        this.artwork.set(id, { key: id, texture: await loadImageTexture(uri) });
      }));
    }

    get(drawable) {
      return drawable.textFormat ? this.getText(drawable) : this.artwork.get(String(drawable.symbolId));
    }

    getText(drawable) {
      let resource = this.text.get(drawable.instanceId);
      if (!resource) {
        resource = this.createTextResource(drawable);
        this.text.set(drawable.instanceId, resource);
      }
      if (resource.value !== drawable.text) this.updateText(resource, drawable);
      return resource;
    }

    createTextResource(drawable) {
      const canvas = createTextCanvas(drawable.bounds);
      return { key: 'text:' + drawable.instanceId, canvas,
        texture: configureTexture(new THREE.CanvasTexture(canvas)) };
    }

    updateText(resource, drawable) {
      paintText(resource.canvas, drawable.textFormat, this.art.deviceFont, drawable.text);
      resource.value = drawable.text;
      resource.texture.needsUpdate = true;
    }

    releaseText(instanceId) {
      const resource = this.text.get(instanceId);
      if (!resource) return false;
      resource.texture.dispose();
      this.text.delete(instanceId);
      return true;
    }
  }

  Object.assign(scope.Aquateen, { TextureStore });
})(window);

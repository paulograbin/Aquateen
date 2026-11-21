(function (scope) {
  'use strict';

  // Application-level coordination only: components own their rendering, state and browser details.
  class GameApplication {
    constructor({ engine, art, geometry, renderer, ui }) {
      this.engine = engine;
      this.art = art;
      this.geometry = geometry;
      this.renderer = renderer;
      this.ui = ui;
      this.clock = new scope.Aquateen.GameClock(engine.data.fps, () => engine.tick());
    }

    start() {
      this.ui.bind(this.eventHandlers());
      this.ui.showReady();
      this.resize();
      this.scheduleNextFrame();
    }

    eventHandlers() {
      return {
        onPointerMove: position => this.movePointer(position, true),
        onPointerDown: position => this.movePointer(position, false),
        onButtonState: (instance, state) => this.changeButtonState(instance, state),
        onButtonClick: instance => this.clickButton(instance),
        onTogglePause: () => this.setPaused(!this.clock.paused),
        onResume: () => this.setPaused(false),
        onRestart: () => this.restart(),
        onVisibilityChange: hidden => this.visibilityChanged(hidden),
        onResize: () => this.resize(),
      };
    }

    render() {
      const frame = scope.Aquateen.buildSceneFrame(this.engine, this.art, this.geometry);
      this.ui.update(frame, this.clock.paused);
      this.renderer.render(frame.drawables);
    }

    resize() {
      const { width, height, pixelRatio } = this.ui.viewportSize();
      this.renderer.resize(width, height, pixelRatio);
      this.render();
    }

    setPaused(paused) {
      this.clock.setPaused(paused);
      this.render();
    }

    restart() {
      this.engine.reset();
      this.setPaused(false);
    }

    movePointer({ x, y }, renderImmediately) {
      if (this.clock.paused) return;
      this.engine.setPointer(x, y);
      if (renderImmediately) this.render();
    }

    changeButtonState(instance, state) {
      if (this.clock.paused || instance.removed) return;
      this.engine.setButtonState(instance, state);
      this.render();
    }

    clickButton(instance) {
      if (this.clock.paused) return;
      this.engine.clickButton(instance);
      this.clock.clearPendingTime();
      this.render();
    }

    visibilityChanged(hidden) {
      if (hidden && this.engine.root.frame !== 1) this.setPaused(true);
      this.clock.resetTimestamp();
    }

    scheduleNextFrame() {
      requestAnimationFrame(timestamp => {
        this.clock.advance(timestamp);
        this.render();
        this.scheduleNextFrame();
      });
    }
  }

  function exposeDebugControls(application) {
    scope.aquateen = {
      engine: application.engine,
      renderer: application.renderer.webgl,
      scene: application.renderer.scene,
      camera: application.renderer.camera,
      art: application.art,
      geometry: application.geometry,
      draw: () => application.render(),
      setPaused: paused => application.setPaused(paused),
      get paused() { return application.clock.paused; },
    };
  }

  async function startGame() {
    const { Geometry, Engine, TextureStore, GameRenderer, BrowserUI } = scope.Aquateen;
    const data = scope.AQUATEEN_SCENE;
    const art = scope.AQUATEEN_ART;
    if (!data || !art || !scope.THREE || !Engine) {
      throw new Error('Arquivo do jogo ausente. Mantenha os arquivos na mesma pasta.');
    }
    const geometry = new Geometry(data, art);
    const engine = new Engine(data, { hitTest: (first, second) => geometry.intersects(first, second) });
    const textures = new TextureStore(art);
    const ui = new BrowserUI(data);
    const renderer = new GameRenderer(ui.canvas, data, textures);
    await textures.loadArtwork();
    await document.fonts.ready;

    const application = new GameApplication(
        { engine, art, geometry, renderer, ui });
    exposeDebugControls(application);
    application.start();
  }

  startGame().catch(error => scope.Aquateen.showStartupError(error));
})(window);

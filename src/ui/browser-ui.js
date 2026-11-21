(function (scope) {
  'use strict';
  const { ButtonOverlays, DebugOverlay } = scope.Aquateen;

  function pageElements() {
    return Object.fromEntries(['stage', 'game', 'message', 'buttons', 'pause', 'resume',
      'restart', 'fullscreen', 'accessible-state', 'debug-toggle', 'debug-overlay']
      .map(id => [id, document.getElementById(id)]));
  }

  class BrowserUI {
    constructor(stageSize) {
      this.stageSize = stageSize;
      this.elements = pageElements();
      this.canvas = this.elements.game;
      this.lastAnnouncement = '';
      this.debugOverlay = new DebugOverlay(this.elements['debug-overlay'], stageSize);
    }

    bind(callbacks) {
      this.callbacks = callbacks;
      this.overlays = new ButtonOverlays(this.elements.buttons, this.stageSize, callbacks);
      this.bindPointerEvents();
      this.bindControlEvents();
      this.bindWindowEvents();
    }

    bindPointerEvents() {
      this.elements.stage.addEventListener('pointermove', event => {
        this.callbacks.onPointerMove(this.pointerPosition(event));
      });
      this.elements.stage.addEventListener('pointerdown', event => {
        this.callbacks.onPointerDown(this.pointerPosition(event));
        if (event.pointerType === 'touch' && event.target === this.canvas) {
          this.canvas.setPointerCapture(event.pointerId);
        }
      });
    }

    bindControlEvents() {
      this.elements.pause.addEventListener('click', this.callbacks.onTogglePause);
      this.elements.resume.addEventListener('click', this.callbacks.onResume);
      this.elements.restart.addEventListener('click', this.callbacks.onRestart);
      this.elements.fullscreen.addEventListener('click', () => this.toggleFullscreen());
      this.elements['debug-toggle'].addEventListener('click', this.callbacks.onToggleDebug);
    }

    bindWindowEvents() {
      document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && !document.fullscreenElement) this.callbacks.onTogglePause();
        this.handleDebugShortcut(event);
      });
      document.addEventListener('visibilitychange', () => this.callbacks.onVisibilityChange(document.hidden));
      document.addEventListener('fullscreenchange', () => this.fullscreenChanged());
      this.resizeObserver = new ResizeObserver(() => this.callbacks.onResize());
      this.resizeObserver.observe(this.elements.stage);
    }

    handleDebugShortcut(event) {
      if (event.code !== 'KeyD' || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.target?.closest?.('input, textarea, select, [contenteditable="true"]')) return;
      event.preventDefault();
      this.callbacks.onToggleDebug();
    }

    pointerPosition(event) {
      const bounds = this.elements.stage.getBoundingClientRect();
      return {
        x: (event.clientX - bounds.left) / bounds.width * this.stageSize.width,
        y: (event.clientY - bounds.top) / bounds.height * this.stageSize.height,
      };
    }

    viewportSize() {
      return { width: this.elements.stage.clientWidth, height: this.elements.stage.clientHeight,
        pixelRatio: window.devicePixelRatio || 1 };
    }

    update(frame, paused) {
      this.overlays.update(frame.buttons, paused);
      this.elements.stage.style.cursor = frame.cursorVisible || paused ? 'default' : 'none';
      this.elements.resume.hidden = !paused;
      this.elements.pause.textContent = paused ? 'Continuar' : 'Pausar';
      this.announce(frame.announcement);
      document.body.dataset.frame = frame.frame;
    }

    updateDebug(snapshot, enabled) {
      this.debugOverlay.update(snapshot, enabled);
      this.elements['debug-toggle'].setAttribute('aria-pressed', String(enabled));
    }

    announce(message) {
      if (message === this.lastAnnouncement) return;
      this.elements['accessible-state'].textContent = message;
      this.lastAnnouncement = message;
    }

    async toggleFullscreen() {
      try {
        if (document.fullscreenElement) await document.exitFullscreen();
        else await this.elements.stage.requestFullscreen();
      } catch {
        this.elements['accessible-state'].textContent = 'Tela cheia não está disponível neste navegador.';
      }
    }

    fullscreenChanged() {
      this.elements.fullscreen.textContent = document.fullscreenElement ? 'Sair da tela cheia' : 'Tela cheia';
      this.callbacks.onResize();
    }

    showReady() {
      this.elements.pause.disabled = this.elements.restart.disabled = false;
      this.elements['debug-toggle'].disabled = false;
      this.elements.message.hidden = true;
      document.body.dataset.ready = 'true';
    }
  }

  function showStartupError(error) {
    console.error(error);
    const message = document.getElementById('message');
    message.hidden = false;
    message.textContent = 'Não foi possível iniciar o jogo. ' + error.message;
    document.body.dataset.ready = 'error';
  }

  Object.assign(scope.Aquateen, { BrowserUI, showStartupError });
})(window);

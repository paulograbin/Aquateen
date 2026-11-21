(function (scope) {
  'use strict';
  const RELEASED = 1, HOVERED = 2, PRESSED = 4;

  function positionButton(button, bounds, stageSize) {
    if (!bounds) return;
    const [left, right, top, bottom] = bounds;
    button.style.left = left / stageSize.width * 100 + '%';
    button.style.top = top / stageSize.height * 100 + '%';
    button.style.width = (right - left) / stageSize.width * 100 + '%';
    button.style.height = (bottom - top) / stageSize.height * 100 + '%';
  }

  class ButtonOverlays {
    constructor(container, stageSize, callbacks) {
      this.container = container;
      this.stageSize = stageSize;
      this.callbacks = callbacks;
      this.buttons = new Map();
    }

    update(descriptors, paused) {
      const activeIds = new Set();
      for (const descriptor of descriptors) {
        const button = this.getButton(descriptor);
        positionButton(button, descriptor.bounds, this.stageSize);
        button.disabled = paused;
        activeIds.add(descriptor.instance.uid);
      }
      this.removeInactiveButtons(activeIds);
    }

    getButton(descriptor) {
      const id = descriptor.instance.uid;
      if (!this.buttons.has(id)) {
        const button = this.createButton(descriptor);
        this.buttons.set(id, button);
        this.container.append(button);
      }
      return this.buttons.get(id);
    }

    createButton({ instance, label }) {
      const button = document.createElement('button');
      button.className = 'game-button';
      button.setAttribute('aria-label', label);
      button.dataset.symbol = instance.id;
      this.bindButtonEvents(button, instance);
      return button;
    }

    bindButtonEvents(button, instance) {
      const states = { pointerenter: HOVERED, pointerleave: RELEASED, pointerdown: PRESSED,
        pointerup: HOVERED, focus: HOVERED, blur: RELEASED };
      for (const [event, state] of Object.entries(states)) {
        button.addEventListener(event, () => this.callbacks.onButtonState(instance, state));
      }
      button.addEventListener('click', () => this.callbacks.onButtonClick(instance));
    }

    removeInactiveButtons(activeIds) {
      for (const [id, button] of this.buttons) {
        if (activeIds.has(id)) continue;
        button.remove();
        this.buttons.delete(id);
      }
    }
  }

  Object.assign(scope.Aquateen, { ButtonOverlays });
})(window);

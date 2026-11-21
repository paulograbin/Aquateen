(function (scope) {
  'use strict';

  // Accepts elapsed animation-frame timestamps, but advances gameplay at the original fixed rate.
  class GameClock {
    constructor(framesPerSecond, tick) {
      this.stepMilliseconds = 1000 / framesPerSecond;
      this.tick = tick;
      this.previousTimestamp = 0;
      this.accumulatedMilliseconds = 0;
      this.paused = false;
    }

    advance(timestamp) {
      if (!this.previousTimestamp) this.previousTimestamp = timestamp;
      const elapsed = Math.min(timestamp - this.previousTimestamp, 250);
      this.previousTimestamp = timestamp;
      if (this.paused) return;
      this.accumulatedMilliseconds += elapsed;
      while (this.accumulatedMilliseconds >= this.stepMilliseconds) {
        this.tick();
        this.accumulatedMilliseconds -= this.stepMilliseconds;
      }
    }

    clearPendingTime() {
      this.accumulatedMilliseconds = 0;
    }

    resetTimestamp() {
      this.previousTimestamp = 0;
    }

    setPaused(paused) {
      this.paused = paused;
      this.clearPendingTime();
    }
  }

  Object.assign(scope.Aquateen ||= {}, { GameClock });
  if (typeof module !== 'undefined') module.exports = { GameClock };
})(typeof window === 'undefined' ? globalThis : window);

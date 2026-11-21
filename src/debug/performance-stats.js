(function (scope) {
  'use strict';
  const SAMPLE_MILLISECONDS = 500;

  class PerformanceStats {
    constructor() {
      this.renderedFrames = 0;
      this.resetSampling();
    }

    resetSampling() {
      this.sampleStart = null;
      this.previousTicks = null;
      this.sampleFrames = 0;
      this.sampleTicks = 0;
      this.displayFps = null;
      this.tickRate = null;
    }

    recordRender() {
      this.renderedFrames++;
    }

    recordAnimationFrame(timestamp, gameTicks) {
      if (this.previousTicks !== null && gameTicks < this.previousTicks) this.resetSampling();
      if (this.sampleStart === null) {
        this.sampleStart = timestamp;
        this.previousTicks = gameTicks;
        return;
      }
      this.sampleFrames++;
      this.sampleTicks += gameTicks - this.previousTicks;
      this.previousTicks = gameTicks;
      const elapsed = timestamp - this.sampleStart;
      if (elapsed >= SAMPLE_MILLISECONDS) this.finishSample(timestamp, elapsed);
    }

    finishSample(timestamp, elapsed) {
      this.displayFps = this.sampleFrames * 1000 / elapsed;
      this.tickRate = this.sampleTicks * 1000 / elapsed;
      this.sampleStart = timestamp;
      this.sampleFrames = 0;
      this.sampleTicks = 0;
    }

    snapshot() {
      return { displayFps: this.displayFps, tickRate: this.tickRate,
        frameMilliseconds: this.displayFps ? 1000 / this.displayFps : null,
        renderedFrames: this.renderedFrames };
    }
  }

  const exports = { PerformanceStats };
  Object.assign(scope.Aquateen ||= {}, exports);
  if (typeof module !== 'undefined') module.exports = exports;
})(typeof window === 'undefined' ? globalThis : window);

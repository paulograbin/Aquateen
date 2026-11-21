(function (scope) {
  'use strict';
  const { copyData, identityTransform } = typeof module !== 'undefined'
    ? require('./display-instance.js') : scope.Aquateen;

  function isNewPlacement(command, previous) {
    return !previous || !command.move || ('id' in command && command.id !== previous.id);
  }

  function copyDisplayList(displayList) {
    return new Map([...displayList].map(([depth, placement]) => [depth, copyData(placement)]));
  }

  function buildFrameSnapshots(timeline) {
    const displayList = new Map();
    let placementId = 0;

    function applyCommand(command) {
      if (command.op === 'remove') displayList.delete(command.depth);
      if (command.op !== 'place') return;
      const previous = displayList.get(command.depth);
      const placement = isNewPlacement(command, previous)
        ? { matrix: identityTransform(), placementId: ++placementId }
        : copyData(previous);
      Object.assign(placement, copyData(command));
      displayList.set(command.depth, placement);
    }

    return timeline.frames.map(commands => {
      commands.forEach(applyCommand);
      return copyDisplayList(displayList);
    });
  }

  function compileTimelines(timelines) {
    return Object.fromEntries(Object.entries(timelines).map(([id, timeline]) => [
      id, buildFrameSnapshots(timeline),
    ]));
  }

  function matchesPlacement(instance, placement) {
    return placement && placement.placementId === instance.placement.placementId && placement.id === instance.id;
  }

  function collectInstances(root) {
    const instances = [];
    function visit(instance) {
      instances.push(instance);
      instance.children.forEach(visit);
    }
    visit(root);
    return instances;
  }

  const exports = { compileTimelines, matchesPlacement, collectInstances };
  Object.assign(scope.Aquateen ||= {}, exports);
  if (typeof module !== 'undefined') module.exports = exports;
})(typeof window === 'undefined' ? globalThis : window);

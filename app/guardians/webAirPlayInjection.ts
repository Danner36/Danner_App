export const WEB_AIRPLAY_INJECTION = `
(function () {
  const allow = function (media) {
    try {
      media.disableRemotePlayback = false;
      media.setAttribute('x-webkit-airplay', 'allow');
    } catch (_) {}
  };

  const scan = function (root) {
    if (!root || !root.querySelectorAll) {
      return;
    }
    const nodes = root.querySelectorAll('video, audio');
    for (let index = 0; index < nodes.length; index += 1) {
      allow(nodes[index]);
    }
  };

  scan(document);

  const observer = new MutationObserver(function (records) {
    for (let recordIndex = 0; recordIndex < records.length; recordIndex += 1) {
      const added = records[recordIndex].addedNodes;
      for (let nodeIndex = 0; nodeIndex < added.length; nodeIndex += 1) {
        const node = added[nodeIndex];
        if (!node || node.nodeType !== 1) {
          continue;
        }
        if (node.tagName === 'VIDEO' || node.tagName === 'AUDIO') {
          allow(node);
        }
        scan(node);
      }
    }
  });

  observer.observe(document.documentElement || document, {
    childList: true,
    subtree: true,
  });
})();
true;
`;

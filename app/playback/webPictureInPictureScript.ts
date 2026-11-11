// Android's picture-in-picture window shows the whole player page shrunk to a small 16:9 window,
// where the page's video is a thin strip among the page's other parts. While the window is open,
// this stretches the page's largest video (or, when the video lives in a frame, the largest frame)
// over the whole page and hides everything else. Closing the window restores the page.
export function webPictureInPictureScript(active: boolean): string {
  return `(function () {
  var STYLE_ID = 'danner-picture-in-picture';
  var MARK = 'data-danner-picture-in-picture';
  var marked = document.querySelectorAll('[' + MARK + ']');
  for (var i = 0; i < marked.length; i += 1) marked[i].removeAttribute(MARK);
  var style = document.getElementById(STYLE_ID);
  if (!${active ? 'true' : 'false'}) {
    if (style) style.remove();
    return;
  }
  function largest(selector) {
    var best = null;
    var bestArea = 0;
    var found = document.querySelectorAll(selector);
    for (var j = 0; j < found.length; j += 1) {
      var box = found[j].getBoundingClientRect();
      var area = box.width * box.height;
      if (area > bestArea) {
        best = found[j];
        bestArea = area;
      }
    }
    return best;
  }
  var target = largest('video') || largest('iframe');
  if (!target) return;
  target.setAttribute(MARK, '');
  if (!style) {
    style = document.createElement('style');
    style.id = STYLE_ID;
    (document.head || document.documentElement).appendChild(style);
  }
  style.textContent =
    'html, body { background: #000 !important; overflow: hidden !important; }' +
    'body * { visibility: hidden !important; }' +
    '[' + MARK + '], [' + MARK + '] * { visibility: visible !important; }' +
    '[' + MARK + '] { position: fixed !important; top: 0 !important; left: 0 !important;' +
    ' width: 100vw !important; height: 100vh !important; max-width: none !important;' +
    ' max-height: none !important; margin: 0 !important; transform: none !important;' +
    ' z-index: 2147483647 !important; background: #000 !important; object-fit: contain !important; }';
})();
true;`;
}

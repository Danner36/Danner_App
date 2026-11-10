// Stops a single tap on a playing picture from pausing a web player. Clappr, the provider's Android
// player, toggles play on a click anywhere in its container; a tap there now only reaches the
// player's own touch handling, which shows the controls. Taps on buttons, links, sliders and
// inputs, a double tap, and the player's pause button still work.
export const WEB_TAP_GUARD_INJECTION = `
(function () {
  if (window.__dannerTapGuard) {
    return;
  }
  window.__dannerTapGuard = true;
  var CONTROLS =
    'button, a, input, select, textarea, label, [role="button"], [role="slider"], [role="menuitem"], [role="checkbox"], [contenteditable="true"]';
  window.addEventListener(
    'click',
    function (event) {
      var target = event.target;
      if (!target || !target.closest || target.closest(CONTROLS)) {
        return;
      }
      var area = target.tagName === 'VIDEO' ? target : target.closest('[data-container]');
      var video = area && (area.tagName === 'VIDEO' ? area : area.querySelector('video'));
      // A paused or unstarted video still takes the tap, so the poster's play button works.
      if (video && !video.paused && !video.ended) {
        event.stopImmediatePropagation();
        event.preventDefault();
      }
    },
    true
  );
})();
true;
`;

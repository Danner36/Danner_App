// Adds a Pop out button to the web player's own control bar, beside its fullscreen button, on
// Android. Clappr, the provider's Android player, keeps its buttons in
// `.media-control-right-panel` and redraws that bar at times, so the button is put back whenever
// it goes missing. The page reports when the button is in place, so the app can drop its own
// header button, and a press asks the app to open the small window.
export const POP_OUT_MESSAGE = 'pop-out';
export const POP_OUT_READY_MESSAGE = 'pop-out-ready';

export function webPopOutButtonInjection(nonce: string): string {
  return `
(function () {
  if (window.__dannerPopOut) {
    return;
  }
  window.__dannerPopOut = true;
  var NONCE = ${JSON.stringify(nonce)};
  var reported = false;
  function post(type) {
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: type, nonce: NONCE }));
    }
  }
  function place() {
    var panel = document.querySelector('.media-control-right-panel');
    if (!panel || panel.querySelector('[data-danner-pop-out]')) {
      return;
    }
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'media-control-button media-control-icon';
    button.setAttribute('data-danner-pop-out', '');
    button.setAttribute('aria-label', 'Pop out video');
    button.style.cssText = 'float:right;height:100%;padding:0 6px;';
    button.innerHTML =
      '<svg viewBox="0 0 24 24" width="22" height="22" style="display:block;fill:#fff;opacity:.9">' +
      '<path d="M19 7h-8v6h8V7zm2-4H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H3V5h18v14z"/>' +
      '</svg>';
    button.addEventListener('click', function (event) {
      event.stopPropagation();
      event.preventDefault();
      post(${JSON.stringify(POP_OUT_MESSAGE)});
    });
    var fullscreen = panel.querySelector('[data-fullscreen]');
    if (fullscreen) {
      panel.insertBefore(button, fullscreen.nextSibling);
    } else {
      panel.appendChild(button);
    }
    if (!reported) {
      reported = true;
      post(${JSON.stringify(POP_OUT_READY_MESSAGE)});
    }
  }
  function start() {
    place();
    new MutationObserver(place).observe(document.documentElement, { childList: true, subtree: true });
  }
  if (document.documentElement) {
    start();
  } else {
    document.addEventListener('DOMContentLoaded', start);
  }
})();
`;
}

// The page's message, when it is one of this player's own Pop out messages.
export function parsePopOutMessage(data: unknown, nonce: string): string | undefined {
  if (typeof data !== 'string' || !nonce) {
    return undefined;
  }
  try {
    const message = JSON.parse(data) as Record<string, unknown>;
    if (
      message &&
      message.nonce === nonce &&
      (message.type === POP_OUT_MESSAGE || message.type === POP_OUT_READY_MESSAGE)
    ) {
      return message.type;
    }
  } catch {
    // Not a message from this player.
  }
  return undefined;
}

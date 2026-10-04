import type { Destination } from './destination';

// Runs before content and again after load; each part installs once per document.
export function createGeolocationInjection(destination: Destination): string {
  const latitude = JSON.stringify(destination.latitude);
  const longitude = JSON.stringify(destination.longitude);

  return `
    (function () {
      const latitude = ${latitude};
      const longitude = ${longitude};
      const source = 'danner-geolocation';

      const send = function (event, detail) {
        try {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            source: source,
            event: event,
            latitude: latitude,
            longitude: longitude,
            detail: detail || null
          }));
        } catch (_) {}
      };

      if (!window.__DANNER_GEOLOCATION_SHIM__) {
        let nextWatchId = 1;
        const watchTimers = {};

        const makePosition = function () {
          return {
            coords: {
              latitude: latitude,
              longitude: longitude,
              accuracy: 5,
              altitude: null,
              altitudeAccuracy: null,
              heading: null,
              speed: null
            },
            timestamp: Date.now()
          };
        };

        const mockGeolocation = {
          getCurrentPosition: function (success) {
            send('requested', 'getCurrentPosition');
            if (typeof success === 'function') {
              setTimeout(function () { success(makePosition()); }, 0);
            }
          },
          watchPosition: function (success) {
            const id = nextWatchId++;
            send('requested', 'watchPosition');
            if (typeof success === 'function') {
              setTimeout(function () { success(makePosition()); }, 0);
              watchTimers[id] = setInterval(function () {
                success(makePosition());
              }, 3000);
            }
            return id;
          },
          clearWatch: function (id) {
            if (watchTimers[id]) {
              clearInterval(watchTimers[id]);
              delete watchTimers[id];
            }
          }
        };

        const patchMethod = function (target, name, value) {
          try {
            Object.defineProperty(target, name, {
              configurable: true,
              enumerable: true,
              value: value,
              writable: true
            });
          } catch (_) {
            try {
              target[name] = value;
            } catch (__) {}
          }
          return target[name] === value;
        };

        // References to navigator.geolocation taken before this script ran resolve
        // through the prototype.
        let prototypePatched = false;
        try {
          if (typeof Geolocation === 'function' && Geolocation.prototype) {
            prototypePatched =
              patchMethod(Geolocation.prototype, 'getCurrentPosition', mockGeolocation.getCurrentPosition) &&
              patchMethod(Geolocation.prototype, 'watchPosition', mockGeolocation.watchPosition) &&
              patchMethod(Geolocation.prototype, 'clearWatch', mockGeolocation.clearWatch);
          }
        } catch (_) {}

        try {
          Object.defineProperty(navigator, 'geolocation', {
            configurable: false,
            enumerable: true,
            value: Object.freeze(mockGeolocation),
            writable: false
          });
        } catch (error) {
          try {
            navigator.geolocation.getCurrentPosition = mockGeolocation.getCurrentPosition;
            navigator.geolocation.watchPosition = mockGeolocation.watchPosition;
            navigator.geolocation.clearWatch = mockGeolocation.clearWatch;
          } catch (fallbackError) {
            if (!prototypePatched) {
              send('error', String(fallbackError));
            }
          }
        }

        const patchQuery = function (target) {
          const originalQuery = target.query;
          if (typeof originalQuery !== 'function') {
            return false;
          }
          return patchMethod(target, 'query', function (descriptor) {
            if (descriptor && descriptor.name === 'geolocation') {
              return Promise.resolve({
                name: 'geolocation',
                state: 'granted',
                onchange: null,
                addEventListener: function () {},
                removeEventListener: function () {},
                dispatchEvent: function () { return true; }
              });
            }
            return originalQuery.apply(this, arguments);
          });
        };

        let permissionsPatched = false;
        try {
          if (typeof Permissions === 'function' && Permissions.prototype) {
            permissionsPatched = patchQuery(Permissions.prototype);
          }
        } catch (_) {}
        try {
          if (!permissionsPatched && navigator.permissions) {
            patchQuery(navigator.permissions);
          }
        } catch (_) {}

        try {
          Object.defineProperty(window, '__DANNER_GEOLOCATION_SHIM__', { value: true });
        } catch (_) {
          window.__DANNER_GEOLOCATION_SHIM__ = true;
        }
      }

      const PROMPT_TEXT = 'verify your current playback area';
      const CONTROL_SELECTOR = 'button, [role="button"], input[type="button"], input[type="submit"]';
      const WATCH_KEY = '__dannerNextWatch';
      const WATCH_MS = 5000;

      const onVerifyPrompt = function () {
        return window.location.hostname === 'tv.youtube.com' &&
          Boolean(document.body) &&
          (document.body.innerText || '').toLowerCase().indexOf(PROMPT_TEXT) !== -1;
      };

      const controlLabel = function (control) {
        return (control.innerText || control.textContent || control.value || '').trim().toLowerCase();
      };

      const isDisabled = function (control) {
        return control.disabled === true || control.getAttribute('aria-disabled') === 'true';
      };

      const isShown = function (control) {
        return control.isConnected && control.getClientRects().length > 0;
      };

      const findNextControl = function () {
        const candidates = document.querySelectorAll(CONTROL_SELECTOR);
        for (let index = 0; index < candidates.length; index += 1) {
          if (controlLabel(candidates[index]) === 'next' && isShown(candidates[index])) {
            return candidates[index];
          }
        }
        return null;
      };

      const reportAdvanced = function () {
        if (!window.__DANNER_ADVANCE_REPORTED__) {
          window.__DANNER_ADVANCE_REPORTED__ = true;
          send('advanced', 'YouTube Next');
        }
      };

      // A Next click counts once the URL changes, the prompt goes away, or the Next
      // control disappears within WATCH_MS. Otherwise the watch ends and a later Next
      // click starts a new one.
      const pageChanged = function (watch) {
        if (window.location.href !== watch.href) {
          return true;
        }
        if (!document.body) {
          return false;
        }
        if (!onVerifyPrompt()) {
          return true;
        }
        const control = watch.control && watch.control.isConnected
          ? watch.control
          : findNextControl();
        return !control || !isShown(control);
      };

      const watchNext = function (control) {
        if (window.__DANNER_ADVANCE_REPORTED__ || window.__DANNER_NEXT_WATCH__) {
          return;
        }
        const watch = {
          control: control,
          deadline: Date.now() + WATCH_MS,
          href: window.location.href
        };
        window.__DANNER_NEXT_WATCH__ = watch;
        try {
          sessionStorage.setItem(WATCH_KEY, JSON.stringify({ deadline: watch.deadline, href: watch.href }));
        } catch (_) {}
        const timer = setInterval(function () {
          let changed = false;
          try {
            changed = pageChanged(watch);
          } catch (_) {}
          if (!changed && Date.now() < watch.deadline) {
            return;
          }
          clearInterval(timer);
          window.__DANNER_NEXT_WATCH__ = undefined;
          try {
            sessionStorage.removeItem(WATCH_KEY);
          } catch (_) {}
          if (changed) {
            reportAdvanced();
          }
        }, 250);
      };

      // A Next click that loaded a new tv.youtube.com document is finished here.
      const resumeWatch = function () {
        let saved = null;
        try {
          saved = JSON.parse(sessionStorage.getItem(WATCH_KEY) || 'null');
          sessionStorage.removeItem(WATCH_KEY);
        } catch (_) {
          return;
        }
        if (
          saved &&
          typeof saved.deadline === 'number' &&
          Date.now() <= saved.deadline &&
          window.location.hostname === 'tv.youtube.com' &&
          window.location.href !== saved.href
        ) {
          reportAdvanced();
        }
      };

      const tryAutoAdvance = function () {
        try {
          if (window.__DANNER_ADVANCE_REPORTED__ || window.__DANNER_NEXT_WATCH__ || !onVerifyPrompt()) {
            return;
          }
          const control = findNextControl();
          if (!control || control.dataset.dannerAutoClicked || isDisabled(control)) {
            return;
          }
          control.dataset.dannerAutoClicked = 'true';
          send('advancing', 'YouTube Next');
          setTimeout(function () {
            if (!control.isConnected || isDisabled(control)) {
              delete control.dataset.dannerAutoClicked;
              return;
            }
            control.click();
          }, 250);
        } catch (_) {}
      };

      if (!window.__DANNER_AUTO_ADVANCE_TIMER__) {
        resumeWatch();
        document.addEventListener('click', function (event) {
          try {
            if (!onVerifyPrompt()) {
              return;
            }
            const target = event.target && event.target.closest
              ? event.target.closest(CONTROL_SELECTOR)
              : null;
            if (target && controlLabel(target) === 'next' && !isDisabled(target)) {
              watchNext(target);
            }
          } catch (_) {}
        }, true);
        window.__DANNER_AUTO_ADVANCE_TIMER__ = setInterval(
          tryAutoAdvance,
          500
        );
        tryAutoAdvance();
      }

      window.__DANNER_SELECTED_LOCATION__ = Object.freeze({
        latitude: latitude,
        longitude: longitude
      });
      send('ready');
      return true;
    })();
    true;
  `;
}

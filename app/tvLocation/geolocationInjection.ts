import type { Destination } from './destination';

export function createGeolocationInjection(destination: Destination): string {
  const latitude = JSON.stringify(destination.latitude);
  const longitude = JSON.stringify(destination.longitude);

  return `
    (function () {
      const latitude = ${latitude};
      const longitude = ${longitude};
      const source = 'danner-geolocation';
      let nextWatchId = 1;
      const watchTimers = {};

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
          send('error', String(fallbackError));
          return true;
        }
      }

      try {
        if (navigator.permissions && navigator.permissions.query) {
          const originalQuery = navigator.permissions.query.bind(navigator.permissions);
          navigator.permissions.query = function (descriptor) {
            if (descriptor && descriptor.name === 'geolocation') {
              return Promise.resolve({
                state: 'granted',
                onchange: null,
                addEventListener: function () {},
                removeEventListener: function () {},
                dispatchEvent: function () { return true; }
              });
            }
            return originalQuery(descriptor);
          };
        }
      } catch (_) {}

      const tryAutoAdvance = function () {
        try {
          if (window.location.hostname !== 'tv.youtube.com' || !document.body) {
            return;
          }
          const pageText = (document.body.innerText || '').toLowerCase();
          if (pageText.indexOf('verify your current playback area') === -1) {
            return;
          }
          const candidates = document.querySelectorAll(
            'button, [role="button"], input[type="button"], input[type="submit"]'
          );
          for (let index = 0; index < candidates.length; index += 1) {
            const candidate = candidates[index];
            const label = (
              candidate.innerText ||
              candidate.textContent ||
              candidate.value ||
              ''
            ).trim().toLowerCase();
            if (label === 'next' && !candidate.dataset.dannerAutoClicked) {
              candidate.dataset.dannerAutoClicked = 'true';
              send('advancing', 'YouTube Next');
              setTimeout(function () { candidate.click(); }, 250);
              return;
            }
          }
        } catch (_) {}
      };

      if (!window.__DANNER_AUTO_ADVANCE_TIMER__) {
        document.addEventListener('click', function (event) {
          try {
            if (window.location.hostname !== 'tv.youtube.com' || !document.body) {
              return;
            }
            const pageText = (document.body.innerText || '').toLowerCase();
            if (pageText.indexOf('verify your current playback area') === -1) {
              return;
            }
            const target = event.target && event.target.closest
              ? event.target.closest('button, [role="button"], input[type="button"], input[type="submit"]')
              : null;
            const label = target
              ? (target.innerText || target.textContent || target.value || '').trim().toLowerCase()
              : '';
            if (label === 'next' && !window.__DANNER_ADVANCE_REPORTED__) {
              window.__DANNER_ADVANCE_REPORTED__ = true;
              send('advanced', 'YouTube Next');
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

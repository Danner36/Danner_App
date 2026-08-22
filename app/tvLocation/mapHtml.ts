import type { Destination } from './destination';

export function createMapHtml(destination: Destination): string {
  const latitude = JSON.stringify(destination.latitude);
  const longitude = JSON.stringify(destination.longitude);

  return `<!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
        <style>
          * { box-sizing: border-box; }
          html, body, #map { height: 100%; margin: 0; overflow: hidden; width: 100%; }
          body { background: #edf2ef; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
          #map { position: relative; touch-action: none; user-select: none; }
          #tiles { bottom: 0; left: 0; overflow: hidden; position: absolute; right: 0; top: 0; }
          .tile { height: 256px; position: absolute; width: 256px; }
          .help {
            background: rgba(21, 53, 74, 0.94); border-radius: 12px; color: white;
            font-size: 16px; font-weight: 800; left: 50%; max-width: 82%; padding: 10px 15px;
            pointer-events: none; position: absolute; text-align: center; top: 14px;
            transform: translateX(-50%); z-index: 4;
          }
          .pin { height: 58px; left: 50%; pointer-events: none; position: absolute; top: 50%; transform: translate(-50%, -49px); width: 42px; z-index: 5; }
          .pin-head {
            align-items: center; background: #1f6f55; border: 3px solid white; border-radius: 50%;
            box-shadow: 0 2px 5px rgba(21, 53, 74, 0.35); display: flex; height: 42px;
            justify-content: center; width: 42px;
          }
          .pin-center { background: white; border-radius: 50%; height: 12px; width: 12px; }
          .pin-stem {
            border-left: 8px solid transparent; border-right: 8px solid transparent;
            border-top: 16px solid #1f6f55; height: 0; margin: -3px auto 0; width: 0;
          }
          .zoom-controls {
            background: white; border: 1px solid #aeb9b3; border-radius: 10px; box-shadow: 0 2px 5px rgba(21, 53, 74, 0.2);
            overflow: hidden; position: absolute; right: 14px; top: 72px; z-index: 6;
          }
          .zoom-button {
            align-items: center; background: white; border: 0; color: #15354a; display: flex;
            font-size: 30px; font-weight: 600; height: 48px; justify-content: center; width: 48px;
          }
          .zoom-button + .zoom-button { border-top: 1px solid #d8deda; }
          .attribution {
            background: rgba(255, 255, 255, 0.88); bottom: 4px; color: #45545e;
            font-size: 11px; left: 5px; padding: 2px 4px; pointer-events: none;
            position: absolute; z-index: 6;
          }
        </style>
      </head>
      <body>
        <div id="map">
          <div id="tiles"></div>
          <div class="help">Move the map under the pin</div>
          <div class="pin"><div class="pin-head"><div class="pin-center"></div></div><div class="pin-stem"></div></div>
          <div class="zoom-controls">
            <button class="zoom-button" id="zoom-in" aria-label="Zoom in">+</button>
            <button class="zoom-button" id="zoom-out" aria-label="Zoom out">−</button>
          </div>
          <div class="attribution">© OpenStreetMap contributors</div>
        </div>
        <script>
          (function () {
            const TILE_SIZE = 256;
            const MAX_LATITUDE = 85.05112878;
            const map = document.getElementById('map');
            const tiles = document.getElementById('tiles');
            let latitude = ${latitude};
            let longitude = ${longitude};
            let zoom = 12;
            let dragStart;
            let moved = false;
            let renderFrame;

            const send = function (event) {
              try {
                window.ReactNativeWebView.postMessage(JSON.stringify({
                  source: 'danner-map', event: event,
                  latitude: latitude, longitude: longitude
                }));
              } catch (_) {}
            };

            const locationToWorld = function (lat, lon) {
              const worldSize = TILE_SIZE * Math.pow(2, zoom);
              const limitedLatitude = Math.max(-MAX_LATITUDE, Math.min(MAX_LATITUDE, lat));
              const radians = limitedLatitude * Math.PI / 180;
              return {
                x: ((lon + 180) / 360) * worldSize,
                y: ((1 - Math.log(Math.tan(radians) + 1 / Math.cos(radians)) / Math.PI) / 2) * worldSize
              };
            };

            const setFromWorld = function (x, y) {
              const worldSize = TILE_SIZE * Math.pow(2, zoom);
              const wrappedX = ((x % worldSize) + worldSize) % worldSize;
              const limitedY = Math.max(0, Math.min(worldSize, y));
              longitude = (wrappedX / worldSize) * 360 - 180;
              const mercatorY = Math.PI * (1 - 2 * limitedY / worldSize);
              latitude = Math.atan(Math.sinh(mercatorY)) * 180 / Math.PI;
            };

            const render = function () {
              renderFrame = undefined;
              const width = map.clientWidth;
              const height = map.clientHeight;
              const center = locationToWorld(latitude, longitude);
              const worldTileCount = Math.pow(2, zoom);
              const firstX = Math.floor((center.x - width / 2) / TILE_SIZE) - 1;
              const lastX = Math.floor((center.x + width / 2) / TILE_SIZE) + 1;
              const firstY = Math.floor((center.y - height / 2) / TILE_SIZE) - 1;
              const lastY = Math.floor((center.y + height / 2) / TILE_SIZE) + 1;
              const fragment = document.createDocumentFragment();
              tiles.innerHTML = '';
              for (let tileY = firstY; tileY <= lastY; tileY += 1) {
                if (tileY < 0 || tileY >= worldTileCount) continue;
                for (let tileX = firstX; tileX <= lastX; tileX += 1) {
                  const wrappedX = ((tileX % worldTileCount) + worldTileCount) % worldTileCount;
                  const image = document.createElement('img');
                  image.className = 'tile';
                  image.draggable = false;
                  image.alt = '';
                  image.src = 'https://tile.openstreetmap.org/' + zoom + '/' + wrappedX + '/' + tileY + '.png';
                  image.style.left = (tileX * TILE_SIZE - center.x + width / 2) + 'px';
                  image.style.top = (tileY * TILE_SIZE - center.y + height / 2) + 'px';
                  fragment.appendChild(image);
                }
              }
              tiles.appendChild(fragment);
            };

            const scheduleRender = function () {
              if (!renderFrame) renderFrame = requestAnimationFrame(render);
            };

            map.addEventListener('pointerdown', function (event) {
              if (event.target.closest('.zoom-controls')) return;
              map.setPointerCapture(event.pointerId);
              const center = locationToWorld(latitude, longitude);
              dragStart = { center: center, x: event.clientX, y: event.clientY };
              moved = false;
            });
            map.addEventListener('pointermove', function (event) {
              if (!dragStart) return;
              const dx = event.clientX - dragStart.x;
              const dy = event.clientY - dragStart.y;
              moved = moved || Math.abs(dx) > 4 || Math.abs(dy) > 4;
              setFromWorld(dragStart.center.x - dx, dragStart.center.y - dy);
              scheduleRender();
            });
            const finishPointer = function (event) {
              if (!dragStart) return;
              if (!moved) {
                const center = locationToWorld(latitude, longitude);
                setFromWorld(
                  center.x + event.clientX - map.clientWidth / 2,
                  center.y + event.clientY - map.clientHeight / 2
                );
              }
              dragStart = undefined;
              scheduleRender();
              send('selected');
            };
            map.addEventListener('pointerup', finishPointer);
            map.addEventListener('pointercancel', function () { dragStart = undefined; });
            document.getElementById('zoom-in').addEventListener('click', function () {
              zoom = Math.min(18, zoom + 1); render();
            });
            document.getElementById('zoom-out').addEventListener('click', function () {
              zoom = Math.max(3, zoom - 1); render();
            });
            window.addEventListener('resize', scheduleRender);
            render();
            send('ready');
          })();
        </script>
      </body>
    </html>`;
}

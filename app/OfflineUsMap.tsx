import { Asset } from 'expo-asset';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';

type MapDestination = {
  label: string;
  latitude: number;
  longitude: number;
};

const OFFLINE_MAP_ASSET = require('./assets/offline-us-map.html') as number;
const OFFLINE_MAP_JSON = '__OFFLINE_MAP_DATA__';

function createOfflineMapHtml(destination: MapDestination): string {
  const initialLatitude = JSON.stringify(destination.latitude);
  const initialLongitude = JSON.stringify(destination.longitude);
  const initialLabel = JSON.stringify(destination.label);

  return `<!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
        <style>
          * { box-sizing: border-box; }
          html, body, #map { height: 100%; margin: 0; overflow: hidden; width: 100%; }
          body { background: #e7eef1; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
          button, input { font: inherit; }
          #map { position: relative; touch-action: none; user-select: none; }
          #canvas { display: block; height: 100%; touch-action: none; width: 100%; }
          .search-wrap {
            left: 12px; position: absolute; right: 70px; top: 12px; z-index: 8;
          }
          #search {
            background: white; border: 2px solid #15354a; border-radius: 12px;
            color: #15354a; font-size: 16px; font-weight: 700; height: 48px;
            outline: 0; padding: 0 14px; width: 100%;
          }
          #results {
            background: white; border: 1px solid #aeb9b3; border-radius: 10px;
            box-shadow: 0 4px 12px rgba(21, 53, 74, 0.25); display: none;
            margin-top: 4px; max-height: 230px; overflow-y: auto;
          }
          .result {
            background: white; border: 0; border-bottom: 1px solid #e1e6e3;
            color: #15354a; display: block; font-size: 16px; font-weight: 700;
            min-height: 44px; padding: 10px 13px; text-align: left; width: 100%;
          }
          .result:last-child { border-bottom: 0; }
          .zoom-controls {
            background: white; border: 1px solid #aeb9b3; border-radius: 10px;
            box-shadow: 0 2px 7px rgba(21, 53, 74, 0.22); overflow: hidden;
            position: absolute; right: 12px; top: 12px; z-index: 9;
          }
          .zoom-button {
            align-items: center; background: white; border: 0; color: #15354a;
            display: flex; font-size: 28px; font-weight: 700; height: 48px;
            justify-content: center; width: 48px;
          }
          .zoom-button + .zoom-button { border-top: 1px solid #d8deda; }
          #show-us { font-size: 12px; letter-spacing: 0.3px; }
          .help {
            background: rgba(21, 53, 74, 0.94); border-radius: 11px; bottom: 31px;
            color: white; font-size: 14px; font-weight: 800; left: 50%;
            max-width: 78%; padding: 8px 13px; pointer-events: none;
            position: absolute; text-align: center; transform: translateX(-50%); z-index: 6;
          }
          .pin {
            height: 58px; left: 50%; pointer-events: none; position: absolute;
            top: 50%; transform: translate(-50%, -49px); width: 42px; z-index: 7;
          }
          .pin-head {
            align-items: center; background: #1f6f55; border: 3px solid white;
            border-radius: 50%; box-shadow: 0 2px 6px rgba(21, 53, 74, 0.38);
            display: flex; height: 42px; justify-content: center; width: 42px;
          }
          .pin-center { background: white; border-radius: 50%; height: 12px; width: 12px; }
          .pin-stem {
            border-left: 8px solid transparent; border-right: 8px solid transparent;
            border-top: 16px solid #1f6f55; height: 0; margin: -3px auto 0; width: 0;
          }
          .attribution {
            background: rgba(255, 255, 255, 0.88); bottom: 4px; color: #45545e;
            font-size: 10px; left: 5px; padding: 2px 4px; pointer-events: none;
            position: absolute; z-index: 6;
          }
        </style>
      </head>
      <body>
        <div id="map">
          <canvas id="canvas" aria-label="Offline United States map"></canvas>
          <div class="search-wrap">
            <input id="search" autocomplete="off" placeholder="Find a city or town" />
            <div id="results"></div>
          </div>
          <div class="zoom-controls">
            <button class="zoom-button" id="zoom-in" aria-label="Zoom in">+</button>
            <button class="zoom-button" id="zoom-out" aria-label="Zoom out">-</button>
            <button class="zoom-button" id="show-us" aria-label="Show the United States">U.S.</button>
          </div>
          <div class="pin"><div class="pin-head"><div class="pin-center"></div></div><div class="pin-stem"></div></div>
          <div class="help">Move the map under the pin</div>
          <div class="attribution">Offline map: U.S. Census Bureau, 2025</div>
        </div>
        <script>
          (function () {
            const DATA = ${OFFLINE_MAP_JSON};
            const GRID = DATA.gridMax;
            const TILE_SIZE = 256;
            const canvas = document.getElementById('canvas');
            const context = canvas.getContext('2d');
            const map = document.getElementById('map');
            const search = document.getElementById('search');
            const results = document.getElementById('results');
            const parameters = new URLSearchParams(window.location.search);
            const parameterLatitude = Number(parameters.get('latitude'));
            const parameterLongitude = Number(parameters.get('longitude'));
            let zoom = 8;
            let center = locationToGrid(
              Number.isFinite(parameterLatitude) ? parameterLatitude : ${initialLatitude},
              Number.isFinite(parameterLongitude) ? parameterLongitude : ${initialLongitude}
            );
            let selectedLabel = parameters.get('label') || ${initialLabel};
            let dragStart;
            let moved = false;
            let renderFrame;

            function locationToGrid(latitude, longitude) {
              const limitedLatitude = Math.max(-85.05112878, Math.min(85.05112878, latitude));
              const radians = limitedLatitude * Math.PI / 180;
              return {
                x: ((longitude + 180) / 360) * GRID,
                y: ((1 - Math.log(Math.tan(radians) + 1 / Math.cos(radians)) / Math.PI) / 2) * GRID
              };
            }

            function gridToLocation() {
              const longitude = center.x / GRID * 360 - 180;
              const mercatorY = Math.PI * (1 - 2 * center.y / GRID);
              const latitude = Math.atan(Math.sinh(mercatorY)) * 180 / Math.PI;
              return { latitude: latitude, longitude: longitude };
            }

            function worldSize() {
              return TILE_SIZE * Math.pow(2, zoom);
            }

            function wrapX(value) {
              return ((value % GRID) + GRID) % GRID;
            }

            function screenPoint(x, y) {
              let differenceX = x - center.x;
              if (differenceX > GRID / 2) differenceX -= GRID;
              if (differenceX < -GRID / 2) differenceX += GRID;
              const scale = worldSize() / GRID;
              return {
                x: differenceX * scale + map.clientWidth / 2,
                y: (y - center.y) * scale + map.clientHeight / 2
              };
            }

            function send(event) {
              try {
                const location = gridToLocation();
                window.ReactNativeWebView.postMessage(JSON.stringify({
                  source: 'danner-offline-map',
                  event: event,
                  label: selectedLabel,
                  latitude: location.latitude,
                  longitude: location.longitude
                }));
              } catch (_) {}
            }

            function nearestPlace() {
              let nearest;
              let nearestDistance = Infinity;
              for (let index = 0; index < DATA.places.length; index += 1) {
                const place = DATA.places[index];
                let differenceX = place[2] - center.x;
                if (differenceX > GRID / 2) differenceX -= GRID;
                if (differenceX < -GRID / 2) differenceX += GRID;
                const differenceY = place[3] - center.y;
                const distance = differenceX * differenceX + differenceY * differenceY;
                if (distance < nearestDistance) {
                  nearest = place;
                  nearestDistance = distance;
                }
              }
              return nearest;
            }

            function placeLabel(place) {
              const state = DATA.stateNames[place[1]];
              return place[0] + ', ' + state[1];
            }

            function selectCenter() {
              const place = nearestPlace();
              selectedLabel = place ? placeLabel(place) : 'Selected map location';
              send('selected');
            }

            function boundsAreVisible(minX, minY, maxX, maxY, padding) {
              const middle = screenPoint((minX + maxX) / 2, (minY + maxY) / 2);
              const scale = worldSize() / GRID;
              const halfWidth = (maxX - minX) * scale / 2;
              const halfHeight = (maxY - minY) * scale / 2;
              return !(
                middle.x + halfWidth < -padding ||
                middle.x - halfWidth > map.clientWidth + padding ||
                middle.y + halfHeight < -padding ||
                middle.y - halfHeight > map.clientHeight + padding
              );
            }

            function tracePoints(points) {
              for (let index = 0; index < points.length; index += 2) {
                const point = screenPoint(points[index], points[index + 1]);
                if (index === 0) context.moveTo(point.x, point.y);
                else context.lineTo(point.x, point.y);
              }
            }

            function drawStates() {
              context.lineJoin = 'round';
              for (let stateIndex = 0; stateIndex < DATA.states.length; stateIndex += 1) {
                const state = DATA.states[stateIndex];
                context.beginPath();
                for (let ringIndex = 0; ringIndex < state[1].length; ringIndex += 1) {
                  tracePoints(state[1][ringIndex]);
                  context.closePath();
                }
                context.fillStyle = stateIndex % 2 ? '#f7f4e9' : '#fbf8ee';
                context.fill('evenodd');
                context.strokeStyle = '#8295a0';
                context.lineWidth = zoom >= 6 ? 1.3 : 0.8;
                context.stroke();
              }
            }

            function drawRoads() {
              context.strokeStyle = zoom >= 7 ? '#d39b4b' : '#d7b67e';
              context.lineCap = 'round';
              context.lineJoin = 'round';
              context.lineWidth = zoom >= 8 ? 1.8 : zoom >= 5 ? 1.2 : 0.8;
              for (let index = 0; index < DATA.roads.length; index += 1) {
                const road = DATA.roads[index];
                if (!boundsAreVisible(road[1], road[2], road[3], road[4], 12)) continue;
                context.beginPath();
                tracePoints(road[5]);
                context.stroke();
              }
            }

            function labelFits(rectangles, x, y, text, fontSize) {
              const width = Math.min(190, text.length * fontSize * 0.58 + 8);
              const rectangle = {
                left: x - width / 2,
                right: x + width / 2,
                top: y - fontSize - 4,
                bottom: y + 4
              };
              for (let index = 0; index < rectangles.length; index += 1) {
                const other = rectangles[index];
                if (!(rectangle.right < other.left || rectangle.left > other.right || rectangle.bottom < other.top || rectangle.top > other.bottom)) {
                  return false;
                }
              }
              rectangles.push(rectangle);
              return true;
            }

            function drawPlaces(rectangles) {
              const limits = [0, 0, 22, 38, 65, 100, 145, 190, 240, 280, 320];
              const limit = limits[Math.min(zoom, limits.length - 1)];
              const fontSize = zoom <= 3 ? 10 : zoom <= 5 ? 11 : 12;
              let labels = 0;
              context.font = '700 ' + fontSize + 'px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
              context.textAlign = 'center';
              context.textBaseline = 'bottom';
              for (let index = 0; index < DATA.places.length && labels < limit; index += 1) {
                const place = DATA.places[index];
                const point = screenPoint(place[2], place[3]);
                if (point.x < -80 || point.x > map.clientWidth + 80 || point.y < -30 || point.y > map.clientHeight + 30) continue;
                const label = place[0];
                if (!labelFits(rectangles, point.x, point.y - 3, label, fontSize)) continue;
                context.beginPath();
                context.arc(point.x, point.y, zoom >= 7 ? 2.5 : 1.8, 0, Math.PI * 2);
                context.fillStyle = '#15354a';
                context.fill();
                context.lineWidth = 3;
                context.strokeStyle = 'rgba(255,255,255,0.95)';
                context.strokeText(label, point.x, point.y - 4);
                context.fillStyle = '#15354a';
                context.fillText(label, point.x, point.y - 4);
                labels += 1;
              }
            }

            function drawRoadLabels(rectangles) {
              if (zoom < 8) return;
              let labels = 0;
              context.font = '700 10px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
              context.textAlign = 'center';
              context.textBaseline = 'middle';
              for (let index = 0; index < DATA.roads.length && labels < 24; index += 1) {
                const road = DATA.roads[index];
                if (!road[0] || !boundsAreVisible(road[1], road[2], road[3], road[4], 0)) continue;
                const points = road[5];
                const middleIndex = Math.max(0, Math.floor(points.length / 4) * 2 - 2);
                const point = screenPoint(points[middleIndex], points[middleIndex + 1]);
                if (!labelFits(rectangles, point.x, point.y, road[0], 10)) continue;
                context.fillStyle = 'rgba(255,255,255,0.9)';
                context.fillRect(point.x - road[0].length * 2.9 - 3, point.y - 7, road[0].length * 5.8 + 6, 14);
                context.fillStyle = '#825812';
                context.fillText(road[0], point.x, point.y);
                labels += 1;
              }
            }

            function render() {
              renderFrame = undefined;
              const width = map.clientWidth;
              const height = map.clientHeight;
              const ratio = Math.min(window.devicePixelRatio || 1, 2);
              const neededWidth = Math.round(width * ratio);
              const neededHeight = Math.round(height * ratio);
              if (canvas.width !== neededWidth || canvas.height !== neededHeight) {
                canvas.width = neededWidth;
                canvas.height = neededHeight;
              }
              context.setTransform(ratio, 0, 0, ratio, 0, 0);
              context.clearRect(0, 0, width, height);
              context.fillStyle = '#dcecf2';
              context.fillRect(0, 0, width, height);
              drawStates();
              drawRoads();
              const rectangles = [];
              drawPlaces(rectangles);
              drawRoadLabels(rectangles);
            }

            function scheduleRender() {
              if (!renderFrame) renderFrame = requestAnimationFrame(render);
            }

            function changeZoom(change) {
              zoom = Math.max(2, Math.min(11, zoom + change));
              render();
            }

            canvas.addEventListener('pointerdown', function (event) {
              canvas.setPointerCapture(event.pointerId);
              dragStart = { centerX: center.x, centerY: center.y, x: event.clientX, y: event.clientY };
              moved = false;
              results.style.display = 'none';
              search.blur();
            });
            canvas.addEventListener('pointermove', function (event) {
              if (!dragStart) return;
              const differenceX = event.clientX - dragStart.x;
              const differenceY = event.clientY - dragStart.y;
              moved = moved || Math.abs(differenceX) > 4 || Math.abs(differenceY) > 4;
              const gridPerPixel = GRID / worldSize();
              center.x = wrapX(dragStart.centerX - differenceX * gridPerPixel);
              center.y = Math.max(0, Math.min(GRID, dragStart.centerY - differenceY * gridPerPixel));
              scheduleRender();
            });
            canvas.addEventListener('pointerup', function (event) {
              if (!dragStart) return;
              if (!moved) {
                const gridPerPixel = GRID / worldSize();
                center.x = wrapX(center.x + (event.clientX - map.clientWidth / 2) * gridPerPixel);
                center.y = Math.max(0, Math.min(GRID, center.y + (event.clientY - map.clientHeight / 2) * gridPerPixel));
              }
              dragStart = undefined;
              render();
              selectCenter();
            });
            canvas.addEventListener('pointercancel', function () { dragStart = undefined; });
            canvas.addEventListener('wheel', function (event) {
              event.preventDefault();
              changeZoom(event.deltaY < 0 ? 1 : -1);
            }, { passive: false });

            document.getElementById('zoom-in').addEventListener('click', function () { changeZoom(1); });
            document.getElementById('zoom-out').addEventListener('click', function () { changeZoom(-1); });
            document.getElementById('show-us').addEventListener('click', function () {
              zoom = 2;
              render();
            });

            search.addEventListener('input', function () {
              const query = search.value.trim().toLowerCase();
              results.innerHTML = '';
              if (query.length < 2) {
                results.style.display = 'none';
                return;
              }
              const matches = [];
              for (let index = 0; index < DATA.places.length && matches.length < 8; index += 1) {
                const place = DATA.places[index];
                const state = DATA.stateNames[place[1]];
                const text = (place[0] + ' ' + state[0] + ' ' + state[1]).toLowerCase();
                if (text.indexOf(query) !== -1) matches.push(place);
              }
              for (let index = 0; index < matches.length; index += 1) {
                const place = matches[index];
                const button = document.createElement('button');
                button.className = 'result';
                button.textContent = placeLabel(place);
                button.addEventListener('click', function () {
                  center.x = place[2];
                  center.y = place[3];
                  zoom = Math.max(zoom, 8);
                  selectedLabel = placeLabel(place);
                  search.value = selectedLabel;
                  results.style.display = 'none';
                  render();
                  send('selected');
                  search.blur();
                });
                results.appendChild(button);
              }
              results.style.display = matches.length ? 'block' : 'none';
            });
            search.addEventListener('focus', function () {
              if (results.childElementCount) results.style.display = 'block';
            });
            window.addEventListener('resize', scheduleRender);
            render();
            send('ready');
          })();
        </script>
      </body>
    </html>`;
}

export function OfflineUsMap({
  destination,
  onChange,
}: {
  destination: MapDestination;
  onChange: (destination: MapDestination) => void;
}) {
  const [assetUri, setAssetUri] = useState<string>();
  const [loadError, setLoadError] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    void Asset.loadAsync(OFFLINE_MAP_ASSET)
      .then(([asset]) => {
        if (active) {
          setAssetUri(asset.localUri ?? asset.uri);
          setLoadError(false);
        }
      })
      .catch(() => {
        if (active) {
          setLoadError(true);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const source = useMemo(
    () => {
      if (!assetUri) {
        return undefined;
      }
      const query = new URLSearchParams({
        label: destination.label,
        latitude: String(destination.latitude),
        longitude: String(destination.longitude),
      });
      return { uri: `${assetUri}?${query.toString()}` };
    },
    [assetUri, destination.label, destination.latitude, destination.longitude],
  );

  useEffect(() => {
    setReady(false);
  }, [source]);

  const onMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        const payload = JSON.parse(event.nativeEvent.data) as {
          event?: unknown;
          label?: unknown;
          latitude?: unknown;
          longitude?: unknown;
          source?: unknown;
        };
        if (
          payload.source !== 'danner-offline-map'
        ) {
          return;
        }
        if (payload.event === 'ready') {
          setReady(true);
          return;
        }
        if (
          payload.event !== 'selected' ||
          typeof payload.label !== 'string' ||
          !payload.label.trim() ||
          typeof payload.latitude !== 'number' ||
          !Number.isFinite(payload.latitude) ||
          typeof payload.longitude !== 'number' ||
          !Number.isFinite(payload.longitude)
        ) {
          return;
        }
        onChange({
          label: payload.label.trim(),
          latitude: payload.latitude,
          longitude: payload.longitude,
        });
      } catch {
        // Ignore messages that were not produced by the bundled map.
      }
    },
    [onChange],
  );

  if (loadError) {
    return (
      <View style={styles.loadingPanel}>
        <Text style={styles.loadingTitle}>The offline map could not open.</Text>
        <Text style={styles.loadingText}>Close the map and try again.</Text>
      </View>
    );
  }

  if (!source) {
    return (
      <View style={styles.loadingPanel}>
        <ActivityIndicator color="#1F6F55" size="large" />
        <Text style={styles.loadingTitle}>Opening the offline map...</Text>
      </View>
    );
  }

  return (
    <View style={styles.mapContainer}>
      <WebView
        allowFileAccess
        allowingReadAccessToURL={assetUri}
        automaticallyAdjustContentInsets={false}
        bounces={false}
        javaScriptEnabled
        onMessage={onMessage}
        originWhitelist={['*']}
        overScrollMode="never"
        scrollEnabled={false}
        setSupportMultipleWindows={false}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        source={source}
        style={styles.map}
      />
      {!ready ? (
        <View pointerEvents="none" style={styles.loadingOverlay}>
          <ActivityIndicator color="#1F6F55" size="large" />
          <Text style={styles.loadingTitle}>Opening the offline map...</Text>
          <Text style={styles.loadingText}>Cities and major roads are stored in the app.</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  map: {
    backgroundColor: '#DCECF2',
    flex: 1,
  },
  mapContainer: {
    backgroundColor: '#DCECF2',
    flex: 1,
  },
  loadingOverlay: {
    alignItems: 'center',
    backgroundColor: '#E7F0F3',
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    padding: 28,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  loadingPanel: {
    alignItems: 'center',
    backgroundColor: '#E7F0F3',
    flex: 1,
    justifyContent: 'center',
    padding: 28,
  },
  loadingText: {
    color: '#526068',
    fontSize: 15,
    lineHeight: 21,
    marginTop: 6,
    textAlign: 'center',
  },
  loadingTitle: {
    color: '#15354A',
    fontSize: 18,
    fontWeight: '800',
    marginTop: 14,
    textAlign: 'center',
  },
});

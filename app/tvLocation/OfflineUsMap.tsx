import { Asset } from 'expo-asset';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';

type MapDestination = {
  label: string;
  latitude: number;
  longitude: number;
};

const OFFLINE_MAP_ASSET = require('../assets/offline-us-map.html') as number;


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

  const startPayload = useMemo(
    () => ({
      label: destination.label,
      latitude: destination.latitude,
      longitude: destination.longitude,
    }),
    [destination.label, destination.latitude, destination.longitude],
  );

  const source = useMemo(
    () => {
      if (!assetUri) {
        return undefined;
      }
      const query = new URLSearchParams({
        label: startPayload.label,
        latitude: String(startPayload.latitude),
        longitude: String(startPayload.longitude),
      });
      return { uri: `${assetUri}#${query.toString()}` };
    },
    [assetUri, startPayload],
  );

  const beforeContentScript = useMemo(
    () => `window.__DANNER_MAP_START=${JSON.stringify(startPayload)};true;`,
    [startPayload],
  );

  const afterLoadScript = useMemo(
    () =>
      `if(typeof window.__dannerApplyStart==='function'){window.__dannerApplyStart(${JSON.stringify(startPayload.latitude)},${JSON.stringify(startPayload.longitude)},${JSON.stringify(startPayload.label)});}true;`,
    [startPayload],
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
        injectedJavaScript={afterLoadScript}
        injectedJavaScriptBeforeContentLoaded={beforeContentScript}
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

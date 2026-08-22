import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Image,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import {
  DESTINATION_STORAGE_KEY,
  TRIPOLI_DESTINATION,
  destinationFromStored,
  isTripoli,
  type Destination,
} from './destination';
import { createGeolocationInjection } from './geolocationInjection';
import {
  MAP_TILE_SIZE,
  locationToWorld,
  worldToLocation,
} from './mapProjection';
import { OfflineUsMap } from './OfflineUsMap';

const VERIFY_URL = 'https://tv.youtube.com/verify';

type StepNumber = 1 | 2 | 3 | 4;
type StepStatus = 'complete' | 'current' | 'upcoming';
type ButtonVariant = 'primary' | 'secondary';

function ActionButton({
  label,
  onPress,
  busy = false,
  disabled = false,
  variant = 'primary',
}: {
  label: string;
  onPress: () => void | Promise<void>;
  busy?: boolean;
  disabled?: boolean;
  variant?: ButtonVariant;
}) {
  const isDisabled = disabled || busy;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy }}
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionButton,
        variant === 'secondary' && styles.actionButtonSecondary,
        pressed && !isDisabled && styles.actionButtonPressed,
        isDisabled && styles.actionButtonDisabled,
      ]}
    >
      {busy ? (
        <ActivityIndicator
          color={variant === 'secondary' ? '#15354A' : '#FFFFFF'}
          size="small"
        />
      ) : (
        <Text
          style={[
            styles.actionButtonText,
            variant === 'secondary' && styles.actionButtonTextSecondary,
          ]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

function InternalMap({
  destination,
  onChange,
}: {
  destination: Destination;
  onChange: (destination: Destination) => void;
}) {
  const [viewport, setViewport] = useState({ height: 0, width: 0 });
  const [zoom, setZoom] = useState(12);
  const destinationRef = useRef(destination);
  const onChangeRef = useRef(onChange);
  const viewportRef = useRef(viewport);
  const zoomRef = useRef(zoom);
  const gestureStartRef = useRef<{ x: number; y: number } | undefined>(
    undefined,
  );
  const gestureMovedRef = useRef(false);

  destinationRef.current = destination;
  onChangeRef.current = onChange;
  viewportRef.current = viewport;
  zoomRef.current = zoom;

  const updateFromWorld = useCallback((x: number, y: number) => {
    const location = worldToLocation(x, y, zoomRef.current);
    const nextDestination = {
      label: 'Selected map location',
      latitude: location.latitude,
      longitude: location.longitude,
    };
    destinationRef.current = nextDestination;
    onChangeRef.current(nextDestination);
  }, []);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) =>
          Math.abs(gesture.dx) > 2 || Math.abs(gesture.dy) > 2,
        onPanResponderGrant: () => {
          gestureStartRef.current = locationToWorld(
            destinationRef.current.latitude,
            destinationRef.current.longitude,
            zoomRef.current,
          );
          gestureMovedRef.current = false;
        },
        onPanResponderMove: (_, gesture) => {
          const start = gestureStartRef.current;
          if (!start) {
            return;
          }
          gestureMovedRef.current =
            gestureMovedRef.current ||
            Math.abs(gesture.dx) > 4 ||
            Math.abs(gesture.dy) > 4;
          updateFromWorld(start.x - gesture.dx, start.y - gesture.dy);
        },
        onPanResponderRelease: (event) => {
          if (!gestureMovedRef.current) {
            const current = locationToWorld(
              destinationRef.current.latitude,
              destinationRef.current.longitude,
              zoomRef.current,
            );
            updateFromWorld(
              current.x +
                event.nativeEvent.locationX -
                viewportRef.current.width / 2,
              current.y +
                event.nativeEvent.locationY -
                viewportRef.current.height / 2,
            );
          }
          gestureStartRef.current = undefined;
        },
        onPanResponderTerminate: () => {
          gestureStartRef.current = undefined;
        },
        onPanResponderTerminationRequest: () => false,
        onStartShouldSetPanResponder: () => true,
      }),
    [updateFromWorld],
  );

  const tiles = useMemo(() => {
    if (!viewport.width || !viewport.height) {
      return [];
    }

    const center = locationToWorld(
      destination.latitude,
      destination.longitude,
      zoom,
    );
    const worldTileCount = 2 ** zoom;
    const firstTileX =
      Math.floor((center.x - viewport.width / 2) / MAP_TILE_SIZE) - 1;
    const lastTileX =
      Math.floor((center.x + viewport.width / 2) / MAP_TILE_SIZE) + 1;
    const firstTileY =
      Math.floor((center.y - viewport.height / 2) / MAP_TILE_SIZE) - 1;
    const lastTileY =
      Math.floor((center.y + viewport.height / 2) / MAP_TILE_SIZE) + 1;
    const nextTiles: Array<{
      key: string;
      left: number;
      top: number;
      uri: string;
    }> = [];

    for (let tileY = firstTileY; tileY <= lastTileY; tileY += 1) {
      if (tileY < 0 || tileY >= worldTileCount) {
        continue;
      }
      for (let tileX = firstTileX; tileX <= lastTileX; tileX += 1) {
        const wrappedTileX =
          ((tileX % worldTileCount) + worldTileCount) % worldTileCount;
        nextTiles.push({
          key: `${zoom}-${tileX}-${tileY}`,
          left:
            tileX * MAP_TILE_SIZE - center.x + viewport.width / 2,
          top:
            tileY * MAP_TILE_SIZE - center.y + viewport.height / 2,
          uri: `https://tile.openstreetmap.org/${zoom}/${wrappedTileX}/${tileY}.png`,
        });
      }
    }

    return nextTiles;
  }, [
    destination.latitude,
    destination.longitude,
    viewport.height,
    viewport.width,
    zoom,
  ]);

  const changeZoom = (change: number) => {
    setZoom((current) => {
      const next = Math.max(3, Math.min(18, current + change));
      zoomRef.current = next;
      return next;
    });
  };

  return (
    <View
      accessibilityLabel="Map location picker"
      onLayout={(event) => {
        const nextViewport = {
          height: event.nativeEvent.layout.height,
          width: event.nativeEvent.layout.width,
        };
        viewportRef.current = nextViewport;
        setViewport(nextViewport);
      }}
      style={styles.internalMap}
    >
      <View style={styles.mapGestureLayer} {...panResponder.panHandlers}>
        {tiles.map((tile) => (
          <Image
            fadeDuration={0}
            key={tile.key}
            source={{
              headers: {
                'User-Agent':
                  'DannerApp/1.0 (com.example.location_helper)',
              },
              uri: tile.uri,
            }}
            style={[
              styles.mapTile,
              { left: tile.left, top: tile.top },
            ]}
          />
        ))}
      </View>

      <View pointerEvents="none" style={styles.mapHelpBubble}>
        <Text style={styles.mapHelpText}>Move the map under the pin</Text>
      </View>
      <View pointerEvents="none" style={styles.mapPin}>
        <View style={styles.mapPinHead}>
          <View style={styles.mapPinCenter} />
        </View>
        <View style={styles.mapPinStem} />
      </View>

      <View style={styles.mapZoomControls}>
        <Pressable
          accessibilityLabel="Zoom in"
          accessibilityRole="button"
          onPress={() => changeZoom(1)}
          style={({ pressed }) => [
            styles.mapZoomButton,
            pressed && styles.actionButtonPressed,
          ]}
        >
          <Text style={styles.mapZoomText}>+</Text>
        </Pressable>
        <View style={styles.mapZoomDivider} />
        <Pressable
          accessibilityLabel="Zoom out"
          accessibilityRole="button"
          onPress={() => changeZoom(-1)}
          style={({ pressed }) => [
            styles.mapZoomButton,
            pressed && styles.actionButtonPressed,
          ]}
        >
          <Text style={styles.mapZoomText}>−</Text>
        </Pressable>
      </View>

      <Text pointerEvents="none" style={styles.mapAttribution}>
        © OpenStreetMap contributors
      </Text>
    </View>
  );
}

function StepCard({
  number,
  title,
  description,
  status,
  children,
}: {
  number: StepNumber;
  title: string;
  description?: string;
  status: StepStatus;
  children?: ReactNode;
}) {
  const isComplete = status === 'complete';
  const isCurrent = status === 'current';

  return (
    <View
      accessibilityLabel={`Step ${number}: ${title}`}
      style={[
        styles.stepCard,
        isCurrent && styles.stepCardCurrent,
        isComplete && styles.stepCardComplete,
      ]}
    >
      <View style={styles.stepHeading}>
        <View
          style={[
            styles.stepNumber,
            isCurrent && styles.stepNumberCurrent,
            isComplete && styles.stepNumberComplete,
          ]}
        >
          <Text
            style={[
              styles.stepNumberText,
              (isCurrent || isComplete) && styles.stepNumberTextActive,
            ]}
          >
            {isComplete ? '✓' : number}
          </Text>
        </View>

        <View style={styles.stepHeadingText}>
          <Text style={styles.stepEyebrow}>
            {isComplete ? 'DONE' : isCurrent ? 'DO THIS NOW' : 'COMING NEXT'}
          </Text>
          <Text style={styles.stepTitle}>{title}</Text>
        </View>
      </View>

      {description ? (
        <Text style={styles.stepDescription}>{description}</Text>
      ) : null}
      {children ? <View style={styles.stepActions}>{children}</View> : null}
    </View>
  );
}


function DestinationSummary({
  destination,
  onEdit,
}: {
  destination: Destination;
  onEdit: () => void;
}) {
  return (
    <View style={styles.destinationBox}>
      <Text style={styles.destinationLabel}>LOCATION YOUTUBE WILL RECEIVE</Text>
      <Text style={styles.destinationName}>{destination.label}</Text>
      <ActionButton
        label="Change map location"
        onPress={onEdit}
        variant="secondary"
      />
    </View>
  );
}

function MapPicker({
  destination,
  visible,
  onCancel,
  onSave,
}: {
  destination: Destination;
  visible: boolean;
  onCancel: () => void;
  onSave: (destination: Destination) => void | Promise<void>;
}) {
  const [draft, setDraft] = useState(destination);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) {
      return;
    }
    setDraft(destination);
    setSaving(false);
  }, [destination, visible]);

  const saveMapLocation = async () => {
    setSaving(true);
    try {
      await onSave(isTripoli(draft) ? TRIPOLI_DESTINATION : draft);
    } catch {
      setSaving(false);
    }
  };

  return (
    <Modal
      animationType="slide"
      onRequestClose={onCancel}
      visible={visible}
    >
      <SafeAreaView edges={['top', 'bottom']} style={styles.mapSafeArea}>
        <View style={styles.mapHeader}>
          <Pressable
            accessibilityRole="button"
            hitSlop={12}
            onPress={onCancel}
            style={styles.mapCancelButton}
          >
            <Text style={styles.mapCancelText}>Cancel</Text>
          </Pressable>
          <Text accessibilityRole="header" style={styles.mapTitle}>
            Choose a map location
          </Text>
          <View style={styles.mapHeaderSpacer} />
        </View>

        <View style={styles.mapContainer}>
          <OfflineUsMap destination={destination} onChange={setDraft} />
        </View>

        <View style={styles.mapActions}>
          <Text style={styles.mapSelectionLabel}>SELECTED AREA</Text>
          <Text style={styles.mapSelectionName}>{draft.label}</Text>
          <View style={styles.mapButtonStack}>
            <ActionButton
              busy={saving}
              label="Use this map location"
              onPress={saveMapLocation}
            />
            <ActionButton
              disabled={saving}
              label="Use Tripoli default"
              onPress={() => onSave(TRIPOLI_DESTINATION)}
              variant="secondary"
            />
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

function GuidedHome({
  currentStep,
  complete,
  destination,
  initialScrollOffset,
  message,
  onBackToMenu,
  onEditDestination,
  onConfirmDestination,
  onScrollOffsetChange,
  onTvReady,
  onVerify,
  onConfirmed,
  onStartOver,
}: {
  currentStep: StepNumber;
  complete: boolean;
  destination: Destination;
  initialScrollOffset: number;
  message?: string;
  onBackToMenu: () => void;
  onEditDestination: () => void;
  onConfirmDestination: () => void;
  onScrollOffsetChange: (offset: number) => void;
  onTvReady: () => void;
  onVerify: () => void;
  onConfirmed: () => void;
  onStartOver: () => void;
}) {
  const scrollViewRef = useRef<ScrollView>(null);
  const stepOffsets = useRef<Partial<Record<StepNumber, number>>>({});
  const hasRendered = useRef(false);

  const statusFor = (step: StepNumber): StepStatus => {
    if (step < currentStep || (step === 4 && complete)) {
      return 'complete';
    }
    return step === currentStep ? 'current' : 'upcoming';
  };

  const progress = complete ? 4 : currentStep;

  useEffect(() => {
    if (!hasRendered.current) {
      hasRendered.current = true;
      return;
    }

    if (complete) {
      scrollViewRef.current?.scrollTo({ animated: true, y: 0 });
      return;
    }

    const timer = setTimeout(() => {
      const nextOffset = stepOffsets.current[currentStep];
      if (typeof nextOffset === 'number') {
        scrollViewRef.current?.scrollTo({
          animated: true,
          y: Math.max(0, nextOffset - 12),
        });
      }
    }, 180);

    return () => clearTimeout(timer);
  }, [complete, currentStep]);

  return (
    <ScrollView
      contentOffset={{ x: 0, y: initialScrollOffset }}
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
      onScroll={(event) =>
        onScrollOffsetChange(event.nativeEvent.contentOffset.y)
      }
      ref={scrollViewRef}
      scrollEventThrottle={100}
      style={styles.scrollView}
    >
      <View style={styles.contentColumn}>
        <View style={styles.hero}>
          <Pressable
            accessibilityLabel="Return to Danner Apps"
            accessibilityRole="button"
            hitSlop={12}
            onPress={onBackToMenu}
            style={({ pressed }) => [
              styles.menuBackButton,
              pressed && styles.backButtonPressed,
            ]}
          >
            <Text style={styles.menuBackButtonText}>‹ Apps</Text>
          </Pressable>
          <Text accessibilityRole="header" style={styles.heroTitle}>
            TV Location
          </Text>

          <View style={styles.progressRow}>
            <Text style={styles.progressText}>
              {complete ? 'All steps complete' : `Step ${progress} of 4`}
            </Text>
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${(progress / 4) * 100}%` },
                ]}
              />
            </View>
          </View>
        </View>

        {complete ? (
          <View accessibilityRole="alert" style={styles.finishedBanner}>
            <Text style={styles.finishedBannerTitle}>You’re all done</Text>
            <Text style={styles.finishedBannerText}>
              The TV location update is complete.
            </Text>
          </View>
        ) : null}

        {message ? (
          <View accessibilityRole="alert" style={styles.messageBanner}>
            <Text style={styles.messageText}>{message}</Text>
          </View>
        ) : null}

        <View
          onLayout={(event) => {
            stepOffsets.current[1] = event.nativeEvent.layout.y;
          }}
        >
          <StepCard
            description="Confirm the map location YouTube should receive. You can change it whenever you need to."
            number={1}
            status={statusFor(1)}
            title="Choose the location"
          >
            <DestinationSummary
              destination={destination}
              onEdit={onEditDestination}
            />
            {currentStep === 1 ? (
              <ActionButton
                label="Use this location"
                onPress={onConfirmDestination}
              />
            ) : null}
          </StepCard>
        </View>

        <View
          onLayout={(event) => {
            stepOffsets.current[2] = event.nativeEvent.layout.y;
          }}
        >
          <StepCard
            description="On the TV, open YouTube TV. Select your profile picture, then Location. When the QR code appears, leave it on the screen."
            number={2}
            status={statusFor(2)}
            title="Get the TV ready"
          >
            {currentStep === 2 ? (
              <ActionButton label="The TV is ready" onPress={onTvReady} />
            ) : null}
          </StepCard>
        </View>

        <View
          onLayout={(event) => {
            stepOffsets.current[3] = event.nativeEvent.layout.y;
          }}
        >
          <StepCard
            number={3}
            status={statusFor(3)}
            title="Update on this phone"
          >
            {currentStep === 3 ? (
              <ActionButton
                label="Update the TV location"
                onPress={onVerify}
              />
            ) : null}
          </StepCard>
        </View>

        <View
          onLayout={(event) => {
            stepOffsets.current[4] = event.nativeEvent.layout.y;
          }}
        >
          <StepCard
            description="After the TV says “Welcome to…” for the new location, return to the YouTube TV main screen on the TV and select Live again to reload the channels."
            number={4}
            status={statusFor(4)}
            title="Reload the Live guide"
          >
            {currentStep === 4 && !complete ? (
              <>
                <ActionButton
                  label="The new channels are showing"
                  onPress={onConfirmed}
                />
                <ActionButton
                  label="Try phone verification again"
                  onPress={onVerify}
                  variant="secondary"
                />
              </>
            ) : null}
            {complete ? (
              <ActionButton
                label="Start over"
                onPress={onStartOver}
                variant="secondary"
              />
            ) : null}
          </StepCard>
        </View>
      </View>
    </ScrollView>
  );
}

function VerifyView({
  destination,
  onClose,
}: {
  destination: Destination;
  onClose: () => void;
}) {
  const returnTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const injectionScript = useMemo(
    () => createGeolocationInjection(destination),
    [destination],
  );

  useEffect(
    () => () => {
      if (returnTimer.current) {
        clearTimeout(returnTimer.current);
      }
    },
    [],
  );

  const onMessage = (event: WebViewMessageEvent) => {
    try {
      const payload = JSON.parse(event.nativeEvent.data) as {
        source?: string;
        event?: string;
      };
      if (payload.source !== 'danner-geolocation') {
        return;
      }
      if (payload.event === 'advanced' && !returnTimer.current) {
        returnTimer.current = setTimeout(onClose, 800);
      }
    } catch {
      return;
    }
  };

  return (
    <View style={styles.verifySafeArea}>
      <View style={styles.verifyHeader}>
        <Pressable
          accessibilityLabel="Return to the setup steps"
          accessibilityRole="button"
          hitSlop={12}
          onPress={onClose}
          style={({ pressed }) => [
            styles.backButton,
            pressed && styles.backButtonPressed,
          ]}
        >
          <Text style={styles.backButtonText}>‹ Steps</Text>
        </Pressable>
        <Text numberOfLines={1} style={styles.verifyTitle}>
          YouTube Verification
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <WebView
        allowsBackForwardNavigationGestures
        geolocationEnabled={false}
        injectedJavaScript={injectionScript}
        injectedJavaScriptBeforeContentLoaded={injectionScript}
        injectedJavaScriptBeforeContentLoadedForMainFrameOnly={
          Platform.OS !== 'ios'
        }
        onMessage={onMessage}
        originWhitelist={['https://*']}
        renderLoading={() => (
          <View style={styles.webLoading}>
            <ActivityIndicator color="#1F6F55" size="large" />
            <Text style={styles.webLoadingText}>Opening YouTube…</Text>
          </View>
        )}
        setSupportMultipleWindows={false}
        sharedCookiesEnabled
        source={{ uri: VERIFY_URL }}
        startInLoadingState
        style={styles.webView}
        thirdPartyCookiesEnabled
      />
    </View>
  );
}

export function TvLocationScreen({
  onBackToMenu,
}: {
  onBackToMenu: () => void;
}) {
  const [currentStep, setCurrentStep] = useState<StepNumber>(1);
  const [complete, setComplete] = useState(false);
  const [destination, setDestination] = useState(TRIPOLI_DESTINATION);
  const [mapPickerVisible, setMapPickerVisible] = useState(false);
  const [showVerify, setShowVerify] = useState(false);
  const [message, setMessage] = useState<string>();
  const homeScrollOffset = useRef(0);

  useEffect(() => {
    void AsyncStorage.getItem(DESTINATION_STORAGE_KEY)
      .then((stored) => {
        if (!stored) {
          return;
        }
        const parsed: unknown = JSON.parse(stored);
        const savedDestination = destinationFromStored(parsed);
        if (savedDestination) {
          setDestination(savedDestination);
        }
      })
      .catch(() => {
        setMessage('The saved location could not be loaded. Tripoli is selected.');
      });
  }, []);

  const closeVerify = useCallback(() => {
    setShowVerify(false);
    setCurrentStep(4);
    setMessage(undefined);
  }, []);

  useEffect(() => {
    if (!showVerify || Platform.OS !== 'android') {
      return;
    }

    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        closeVerify();
        return true;
      },
    );

    return () => subscription.remove();
  }, [closeVerify, showVerify]);

  useEffect(() => {
    if (
      Platform.OS !== 'android' ||
      showVerify ||
      mapPickerVisible
    ) {
      return;
    }

    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        onBackToMenu();
        return true;
      },
    );

    return () => subscription.remove();
  }, [mapPickerVisible, onBackToMenu, showVerify]);

  const saveDestination = useCallback(
    async (nextDestination: Destination) => {
      setDestination(nextDestination);
      setMapPickerVisible(false);
      setMessage(undefined);

      if (currentStep === 4 || complete) {
        setCurrentStep(3);
        setComplete(false);
        setMessage('Map location changed. Run the phone update again.');
      }

      try {
        await AsyncStorage.setItem(
          DESTINATION_STORAGE_KEY,
          JSON.stringify(nextDestination),
        );
      } catch {
        setMessage(
          'The map location is selected for this session but could not be saved.',
        );
      }
    },
    [complete, currentStep],
  );

  const startOver = useCallback(() => {
    setCurrentStep(1);
    setComplete(false);
    setMessage(undefined);
  }, []);

  return (
    <>
      {showVerify ? (
        <VerifyView destination={destination} onClose={closeVerify} />
      ) : (
        <GuidedHome
          complete={complete}
          currentStep={currentStep}
          destination={destination}
          initialScrollOffset={homeScrollOffset.current}
          message={message}
          onBackToMenu={onBackToMenu}
          onConfirmed={() => setComplete(true)}
          onConfirmDestination={() => setCurrentStep(2)}
          onEditDestination={() => setMapPickerVisible(true)}
          onScrollOffsetChange={(offset) => {
            homeScrollOffset.current = offset;
          }}
          onStartOver={startOver}
          onTvReady={() => setCurrentStep(3)}
          onVerify={() => setShowVerify(true)}
        />
      )}

      <MapPicker
        destination={destination}
        onCancel={() => setMapPickerVisible(false)}
        onSave={saveDestination}
        visible={mapPickerVisible}
      />
    </>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    backgroundColor: '#F7F7F2',
    flex: 1,
  },
  scrollContent: {
    alignItems: 'center',
    paddingBottom: 40,
  },
  contentColumn: {
    maxWidth: 720,
    paddingHorizontal: 18,
    width: '100%',
  },
  hero: {
    paddingBottom: 22,
    paddingTop: 24,
  },
  menuBackButton: {
    alignSelf: 'flex-start',
    justifyContent: 'center',
    minHeight: 44,
  },
  menuBackButtonText: {
    color: '#1F6F55',
    fontSize: 18,
    fontWeight: '800',
  },
  heroTitle: {
    color: '#15354A',
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -0.6,
    lineHeight: 38,
  },
  progressRow: {
    marginTop: 20,
  },
  progressText: {
    color: '#15354A',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
  },
  progressTrack: {
    backgroundColor: '#DCE3DF',
    borderRadius: 6,
    height: 10,
    overflow: 'hidden',
  },
  progressFill: {
    backgroundColor: '#1F6F55',
    borderRadius: 6,
    height: '100%',
  },
  finishedBanner: {
    backgroundColor: '#DDF3E8',
    borderColor: '#1F6F55',
    borderRadius: 16,
    borderWidth: 2,
    marginBottom: 14,
    padding: 18,
  },
  finishedBannerTitle: {
    color: '#15573F',
    fontSize: 24,
    fontWeight: '800',
  },
  finishedBannerText: {
    color: '#244E3E',
    fontSize: 17,
    lineHeight: 24,
    marginTop: 4,
  },
  messageBanner: {
    backgroundColor: '#FFF3CD',
    borderColor: '#D79B18',
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 14,
    padding: 16,
  },
  messageText: {
    color: '#5B430E',
    fontSize: 17,
    fontWeight: '600',
    lineHeight: 24,
  },
  stepCard: {
    backgroundColor: '#FFFFFF',
    borderColor: '#D8DEDA',
    borderRadius: 18,
    borderWidth: 1,
    marginBottom: 14,
    padding: 18,
  },
  stepCardCurrent: {
    borderColor: '#1F6F55',
    borderWidth: 3,
    elevation: 3,
    padding: 16,
    shadowColor: '#15354A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
  },
  stepCardComplete: {
    backgroundColor: '#F1F8F4',
    borderColor: '#A9CEBB',
  },
  stepHeading: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  stepNumber: {
    alignItems: 'center',
    backgroundColor: '#E7EBE8',
    borderRadius: 24,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  stepNumberCurrent: {
    backgroundColor: '#15354A',
  },
  stepNumberComplete: {
    backgroundColor: '#1F6F55',
  },
  stepNumberText: {
    color: '#526068',
    fontSize: 21,
    fontWeight: '800',
  },
  stepNumberTextActive: {
    color: '#FFFFFF',
  },
  stepHeadingText: {
    flex: 1,
    marginLeft: 14,
  },
  stepEyebrow: {
    color: '#1F6F55',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginBottom: 2,
  },
  stepTitle: {
    color: '#15354A',
    fontSize: 22,
    fontWeight: '800',
    lineHeight: 28,
  },
  stepDescription: {
    color: '#3F4E57',
    fontSize: 17,
    lineHeight: 25,
    marginTop: 14,
  },
  stepActions: {
    gap: 10,
    marginTop: 18,
  },
  destinationBox: {
    backgroundColor: '#EDF6F1',
    borderColor: '#A9CEBB',
    borderRadius: 14,
    borderWidth: 1,
    gap: 4,
    padding: 15,
  },
  destinationLabel: {
    color: '#1F6F55',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.9,
  },
  destinationName: {
    color: '#15354A',
    fontSize: 22,
    fontWeight: '800',
    marginTop: 2,
  },
  actionButton: {
    alignItems: 'center',
    backgroundColor: '#1F6F55',
    borderColor: '#1F6F55',
    borderRadius: 14,
    borderWidth: 2,
    justifyContent: 'center',
    minHeight: 58,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  actionButtonSecondary: {
    backgroundColor: '#FFFFFF',
    borderColor: '#15354A',
  },
  actionButtonPressed: {
    opacity: 0.78,
    transform: [{ scale: 0.99 }],
  },
  actionButtonDisabled: {
    opacity: 0.5,
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 24,
    textAlign: 'center',
  },
  actionButtonTextSecondary: {
    color: '#15354A',
  },
  mapSafeArea: {
    backgroundColor: '#FFFFFF',
    flex: 1,
  },
  mapHeader: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderBottomColor: '#D8DEDA',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    minHeight: 58,
    paddingHorizontal: 14,
  },
  mapCancelButton: {
    justifyContent: 'center',
    minHeight: 48,
    width: 82,
  },
  mapCancelText: {
    color: '#1F6F55',
    fontSize: 17,
    fontWeight: '800',
  },
  mapTitle: {
    color: '#15354A',
    flex: 1,
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
  },
  mapHeaderSpacer: {
    width: 82,
  },
  mapContainer: {
    backgroundColor: '#EDF2EF',
    flex: 1,
    minHeight: 280,
  },
  internalMap: {
    backgroundColor: '#EDF2EF',
    flex: 1,
    overflow: 'hidden',
  },
  mapGestureLayer: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  mapTile: {
    height: MAP_TILE_SIZE,
    position: 'absolute',
    width: MAP_TILE_SIZE,
  },
  mapHelpBubble: {
    alignSelf: 'center',
    backgroundColor: 'rgba(21, 53, 74, 0.94)',
    borderRadius: 12,
    maxWidth: '82%',
    paddingHorizontal: 15,
    paddingVertical: 10,
    position: 'absolute',
    top: 14,
  },
  mapHelpText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
  },
  mapPin: {
    alignItems: 'center',
    left: '50%',
    marginLeft: -20,
    marginTop: -49,
    position: 'absolute',
    top: '50%',
    width: 40,
  },
  mapPinHead: {
    alignItems: 'center',
    backgroundColor: '#1F6F55',
    borderColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 3,
    elevation: 4,
    height: 40,
    justifyContent: 'center',
    shadowColor: '#15354A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.28,
    shadowRadius: 3,
    width: 40,
  },
  mapPinCenter: {
    backgroundColor: '#FFFFFF',
    borderRadius: 6,
    height: 12,
    width: 12,
  },
  mapPinStem: {
    borderLeftColor: 'transparent',
    borderLeftWidth: 8,
    borderRightColor: 'transparent',
    borderRightWidth: 8,
    borderTopColor: '#1F6F55',
    borderTopWidth: 16,
    height: 0,
    marginTop: -3,
    width: 0,
  },
  mapZoomControls: {
    backgroundColor: '#FFFFFF',
    borderColor: '#AEB9B3',
    borderRadius: 10,
    borderWidth: 1,
    elevation: 3,
    overflow: 'hidden',
    position: 'absolute',
    right: 14,
    top: 72,
  },
  mapZoomButton: {
    alignItems: 'center',
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  mapZoomText: {
    color: '#15354A',
    fontSize: 30,
    fontWeight: '600',
    lineHeight: 34,
  },
  mapZoomDivider: {
    backgroundColor: '#D8DEDA',
    height: 1,
  },
  mapAttribution: {
    backgroundColor: 'rgba(255, 255, 255, 0.88)',
    bottom: 4,
    color: '#45545E',
    fontSize: 11,
    left: 5,
    paddingHorizontal: 4,
    paddingVertical: 2,
    position: 'absolute',
  },
  mapActions: {
    backgroundColor: '#FFFFFF',
    borderTopColor: '#D8DEDA',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  mapSelectionLabel: {
    color: '#1F6F55',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.9,
  },
  mapSelectionName: {
    color: '#15354A',
    fontSize: 22,
    fontWeight: '800',
    marginTop: 3,
  },
  mapButtonStack: {
    gap: 8,
    marginTop: 14,
  },
  inputError: {
    color: '#9D302D',
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 21,
    marginTop: 10,
  },
  verifySafeArea: {
    backgroundColor: '#FFFFFF',
    flex: 1,
  },
  verifyHeader: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderBottomColor: '#D8DEDA',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    minHeight: 56,
    paddingHorizontal: 14,
  },
  backButton: {
    justifyContent: 'center',
    minHeight: 48,
    width: 82,
  },
  backButtonPressed: {
    opacity: 0.55,
  },
  backButtonText: {
    color: '#1F6F55',
    fontSize: 18,
    fontWeight: '800',
  },
  verifyTitle: {
    color: '#15354A',
    flex: 1,
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
  },
  headerSpacer: {
    width: 82,
  },
  webView: {
    backgroundColor: '#FFFFFF',
    flex: 1,
  },
  webLoading: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    bottom: 0,
    gap: 12,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  webLoadingText: {
    color: '#45545E',
    fontSize: 17,
    fontWeight: '600',
  },
});

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import {
  DESTINATION_STORAGE_KEY,
  TRIPOLI_DESTINATION,
  destinationFromStored,
  isTripoli,
  type Destination,
} from './destination';
import { createGeolocationInjection } from './geolocationInjection';
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
  const insets = useSafeAreaInsets();
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
      <View
        style={[
          styles.mapSafeArea,
          { paddingBottom: insets.bottom, paddingTop: insets.top },
        ]}
      >
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
      </View>
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

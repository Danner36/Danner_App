import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  BackHandler,
  type LayoutChangeEvent,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  WebView,
  type WebViewMessageEvent,
  type WebViewNavigation,
} from 'react-native-webview';
import {
  clearYouTubeSession,
  flushWebViewCookies,
  youTubeSessionState,
} from '../modules/danner-webview-cookies/src';
import {
  DEFAULT_LOCATION_STORAGE_KEY,
  DESTINATION_STORAGE_KEY,
  TV_LOCATION_READ_FAILED,
  accountControls,
  pickerControls,
  resolveTvLocation,
  sameCoordinates,
  sessionStatusText,
  showUseDefaultOnStepOne,
  defaultButtonLabel,
  type Destination,
  type SessionState,
} from './destination';
import { createGeolocationInjection } from './geolocationInjection';
import { OfflineUsMap } from './OfflineUsMap';
import {
  SIGN_IN_URL,
  SWITCH_ACCOUNT_URL,
  VERIFY_URL,
  accountViewProgress,
  allowVerifyNavigation,
  isVerifyPageUrl,
} from './verifyNavigation';

// Shorter than the WebView cookie store's 30-second write batch.
const COOKIE_FLUSH_INTERVAL_MS = 20_000;

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
  defaultLocation,
  destination,
  loaded,
  onEdit,
  onUseDefault,
}: {
  defaultLocation?: Destination;
  destination?: Destination;
  loaded: boolean;
  onEdit: () => void;
  onUseDefault: () => void;
}) {
  if (!loaded) {
    return (
      <View style={styles.destinationBox}>
        <Text style={styles.destinationLabel}>LOCATION YOUTUBE WILL RECEIVE</Text>
        <ActivityIndicator color="#1F6F55" size="small" />
      </View>
    );
  }

  if (!destination) {
    return (
      <View style={styles.destinationBox}>
        <Text style={styles.destinationLabel}>LOCATION YOUTUBE WILL RECEIVE</Text>
        <Text style={styles.destinationName}>No location chosen yet</Text>
        <ActionButton label="Choose on map" onPress={onEdit} />
      </View>
    );
  }

  return (
    <View style={styles.destinationBox}>
      <Text style={styles.destinationLabel}>LOCATION YOUTUBE WILL RECEIVE</Text>
      <Text style={styles.destinationName}>{destination.label}</Text>
      <ActionButton
        label="Change map location"
        onPress={onEdit}
        variant="secondary"
      />
      {defaultLocation &&
      showUseDefaultOnStepOne(destination, defaultLocation) ? (
        <ActionButton
          label={defaultButtonLabel(defaultLocation)}
          onPress={onUseDefault}
          variant="secondary"
        />
      ) : null}
    </View>
  );
}

function MapPicker({
  defaultLocation,
  destination,
  visible,
  onCancel,
  onMakeDefault,
  onSave,
}: {
  defaultLocation?: Destination;
  destination?: Destination;
  visible: boolean;
  onCancel: () => void;
  onMakeDefault: (destination: Destination) => Promise<boolean>;
  onSave: (destination: Destination) => void | Promise<void>;
}) {
  const [draft, setDraft] = useState(destination);
  const [defaultError, setDefaultError] = useState(false);
  const insets = useSafeAreaInsets();
  const [saving, setSaving] = useState(false);
  const controls = pickerControls(draft, defaultLocation);

  useEffect(() => {
    if (!visible) {
      return;
    }
    setDraft(destination);
    setDefaultError(false);
    setSaving(false);
  }, [destination, visible]);

  const saveMapLocation = async () => {
    if (!draft) {
      return;
    }
    setSaving(true);
    try {
      await onSave(draft);
    } catch {
      setSaving(false);
    }
  };

  const makeDefault = async () => {
    if (draft) {
      setDefaultError(!(await onMakeDefault(draft)));
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
          <Text style={styles.mapSelectionName}>
            {draft ? draft.label : 'Move the map or search for a town'}
          </Text>
          {defaultError ? (
            <Text style={styles.inputError}>The default could not be saved.</Text>
          ) : null}
          <View style={styles.mapButtonStack}>
            <ActionButton
              busy={saving}
              disabled={!controls.primaryEnabled}
              label={controls.primaryLabel}
              onPress={saveMapLocation}
            />
            {defaultLocation && controls.showUseDefault ? (
              <ActionButton
                disabled={saving}
                label={defaultButtonLabel(defaultLocation)}
                onPress={() => onSave(defaultLocation)}
                variant="secondary"
              />
            ) : null}
            {controls.showMakeDefault ? (
              <ActionButton
                disabled={saving}
                label="Make this my default"
                onPress={makeDefault}
                variant="secondary"
              />
            ) : null}
          </View>
        </View>
      </View>
    </Modal>
  );
}

function OnThisPhonePanel({
  defaultLocation,
  message,
  session,
  signingOut,
  onForgetLocation,
  onSignIn,
  onSignOut,
  onSwitchAccount,
}: {
  defaultLocation?: Destination;
  message?: string;
  session: SessionState;
  signingOut: boolean;
  onForgetLocation: () => void;
  onSignIn: () => void;
  onSignOut: () => void;
  onSwitchAccount: () => void;
}) {
  const controls = accountControls(session);

  return (
    <View style={styles.phonePanel}>
      <Text accessibilityRole="header" style={styles.phonePanelTitle}>
        On this phone
      </Text>
      <Text style={styles.phonePanelStatus}>{sessionStatusText(session)}</Text>
      {message ? (
        <Text accessibilityRole="alert" style={styles.inputError}>
          {message}
        </Text>
      ) : null}
      <View style={styles.stepActions}>
        {controls.signIn ? (
          <ActionButton label="Sign in" onPress={onSignIn} variant="secondary" />
        ) : null}
        {controls.switchAccount ? (
          <ActionButton
            label="Switch account"
            onPress={onSwitchAccount}
            variant="secondary"
          />
        ) : null}
        {controls.signOut ? (
          <ActionButton
            busy={signingOut}
            label="Sign out"
            onPress={onSignOut}
            variant="secondary"
          />
        ) : null}
      </View>
      <Text style={styles.phonePanelNote}>
        If Google asks for a passkey, choose Try another way and use your password
        or phone.
      </Text>
      {Platform.OS === 'android' ? (
        <Text style={styles.phonePanelNote}>
          Install Danner Apps only from its in-app update or its GitHub releases
          page.
        </Text>
      ) : null}
      {defaultLocation ? (
        <View style={styles.phonePanelLocation}>
          <Text style={styles.phonePanelDefault}>
            Default: {defaultLocation.label}
          </Text>
          <ActionButton
            label="Forget location"
            onPress={onForgetLocation}
            variant="secondary"
          />
        </View>
      ) : null}
    </View>
  );
}

function GuidedHome({
  accountMessage,
  currentStep,
  complete,
  defaultLocation,
  destination,
  initialFocusStep,
  initialScrollOffset,
  loaded,
  message,
  session,
  signingOut,
  verifyRetry,
  onBackToMenu,
  onEditDestination,
  onConfirmDestination,
  onForgetLocation,
  onScrollOffsetChange,
  onSignIn,
  onSignOut,
  onSwitchAccount,
  onTvReady,
  onUseDefault,
  onVerify,
  onConfirmed,
  onStartOver,
}: {
  accountMessage?: string;
  currentStep: StepNumber;
  complete: boolean;
  defaultLocation?: Destination;
  destination?: Destination;
  initialFocusStep?: StepNumber;
  initialScrollOffset: number;
  loaded: boolean;
  message?: string;
  session: SessionState;
  signingOut: boolean;
  verifyRetry: boolean;
  onBackToMenu: () => void;
  onEditDestination: () => void;
  onConfirmDestination: () => void;
  onForgetLocation: () => void;
  onScrollOffsetChange: (offset: number) => void;
  onSignIn: () => void;
  onSignOut: () => void;
  onSwitchAccount: () => void;
  onTvReady: () => void;
  onUseDefault: () => void;
  onVerify: () => void;
  onConfirmed: () => void;
  onStartOver: () => void;
}) {
  const scrollViewRef = useRef<ScrollView>(null);
  const stepOffsets = useRef<Partial<Record<StepNumber, number>>>({});
  const hasRendered = useRef(false);
  const hadDestination = useRef(false);
  const pendingFocusStep = useRef(initialFocusStep);
  const focusTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const [initialContentOffset] = useState(() => ({
    x: 0,
    y: initialScrollOffset,
  }));

  const statusFor = (step: StepNumber): StepStatus => {
    if (step < currentStep || (step === 4 && complete)) {
      return 'complete';
    }
    return step === currentStep ? 'current' : 'upcoming';
  };

  const progress = complete ? 4 : currentStep;

  const scrollToStep = useCallback((step: StepNumber) => {
    const nextOffset = stepOffsets.current[step];
    if (typeof nextOffset === 'number') {
      scrollViewRef.current?.scrollTo({
        animated: true,
        y: Math.max(0, nextOffset - 12),
      });
    }
  }, []);

  const onStepLayout = (step: StepNumber) => (event: LayoutChangeEvent) => {
    stepOffsets.current[step] = event.nativeEvent.layout.y;
    if (pendingFocusStep.current === step) {
      pendingFocusStep.current = undefined;
      focusTimer.current = setTimeout(() => scrollToStep(step), 180);
    }
  };

  useEffect(
    () => () => {
      if (focusTimer.current) {
        clearTimeout(focusTimer.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (!hasRendered.current) {
      hasRendered.current = true;
      return;
    }

    if (complete) {
      scrollViewRef.current?.scrollTo({ animated: true, y: 0 });
      return;
    }

    const timer = setTimeout(() => scrollToStep(currentStep), 180);

    return () => clearTimeout(timer);
  }, [complete, currentStep, scrollToStep]);

  // Forgetting the location returns to the first step at the top of the page.
  useEffect(() => {
    if (hadDestination.current && !destination) {
      scrollViewRef.current?.scrollTo({ animated: true, y: 0 });
    }
    hadDestination.current = destination !== undefined;
  }, [destination]);

  return (
    <ScrollView
      contentOffset={initialContentOffset}
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

        <View onLayout={onStepLayout(1)}>
          <StepCard
            description={
              loaded && !destination
                ? 'Choose the map location YouTube should receive.'
                : 'Confirm the map location YouTube should receive. You can change it whenever you need to.'
            }
            number={1}
            status={statusFor(1)}
            title="Choose the location"
          >
            <DestinationSummary
              defaultLocation={defaultLocation}
              destination={destination}
              loaded={loaded}
              onEdit={onEditDestination}
              onUseDefault={onUseDefault}
            />
            {currentStep === 1 && destination ? (
              <ActionButton
                label="Use this location"
                onPress={onConfirmDestination}
              />
            ) : null}
          </StepCard>
        </View>

        <View onLayout={onStepLayout(2)}>
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

        <View onLayout={onStepLayout(3)}>
          <StepCard
            description={
              verifyRetry && currentStep === 3
                ? 'The update did not finish. Keep the QR code on the TV and try again.'
                : undefined
            }
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

        <View onLayout={onStepLayout(4)}>
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

        <OnThisPhonePanel
          defaultLocation={defaultLocation}
          message={accountMessage}
          session={session}
          signingOut={signingOut}
          onForgetLocation={onForgetLocation}
          onSignIn={onSignIn}
          onSignOut={onSignOut}
          onSwitchAccount={onSwitchAccount}
        />
      </View>
    </ScrollView>
  );
}

function WebPageHeader({
  title,
  onClose,
}: {
  title: string;
  onClose: () => void;
}) {
  return (
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
        {title}
      </Text>
      <View style={styles.headerSpacer} />
    </View>
  );
}

function YouTubeTvWebView({
  injection,
  onMessage,
  onNavigationStateChange,
  startUrl,
}: {
  injection?: string;
  onMessage?: (event: WebViewMessageEvent) => void;
  onNavigationStateChange?: (navigation: WebViewNavigation) => void;
  startUrl: string;
}) {
  const [loadAttempt, setLoadAttempt] = useState(0);

  // Android writes the sign-in cookies to disk while the page is open, when the app
  // leaves the foreground, and when the page closes, so a swiped-away app keeps them.
  useEffect(() => {
    const timer = setInterval(() => {
      void flushWebViewCookies();
    }, COOKIE_FLUSH_INTERVAL_MS);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        void flushWebViewCookies();
      }
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
      void flushWebViewCookies();
    };
  }, []);

  // originWhitelist admits every URL so that allowVerifyNavigation drops disallowed
  // ones; the library opens whitelist misses with Linking.
  return (
    <WebView
      allowsBackForwardNavigationGestures
      geolocationEnabled={false}
      injectedJavaScript={injection}
      injectedJavaScriptBeforeContentLoaded={injection}
      injectedJavaScriptBeforeContentLoadedForMainFrameOnly={
        Platform.OS !== 'ios'
      }
      key={loadAttempt}
      onMessage={onMessage}
      onNavigationStateChange={onNavigationStateChange}
      onShouldStartLoadWithRequest={allowVerifyNavigation}
      originWhitelist={['*']}
      renderError={() => (
        <View style={styles.webLoading}>
          <Text style={styles.webErrorTitle}>YouTube did not open</Text>
          <Text style={styles.webErrorText}>
            Check that this phone is online, then tap Retry.
          </Text>
          <View style={styles.webErrorAction}>
            <ActionButton
              label="Retry"
              onPress={() => setLoadAttempt((attempt) => attempt + 1)}
            />
          </View>
        </View>
      )}
      renderLoading={() => (
        <View style={styles.webLoading}>
          <ActivityIndicator color="#1F6F55" size="large" />
          <Text style={styles.webLoadingText}>Opening YouTube…</Text>
        </View>
      )}
      setSupportMultipleWindows={false}
      sharedCookiesEnabled
      source={{ uri: startUrl }}
      startInLoadingState
      style={styles.webView}
      thirdPartyCookiesEnabled
    />
  );
}

function VerifyView({
  destination,
  onAdvanced,
  onClose,
}: {
  destination: Destination;
  onAdvanced: () => void;
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
      if (
        payload.event === 'advanced' &&
        isVerifyPageUrl(event.nativeEvent.url) &&
        !returnTimer.current
      ) {
        returnTimer.current = setTimeout(onAdvanced, 800);
      }
    } catch {
      return;
    }
  };

  return (
    <View style={styles.verifySafeArea}>
      <WebPageHeader onClose={onClose} title="YouTube Verification" />
      <YouTubeTvWebView
        injection={injectionScript}
        onMessage={onMessage}
        startUrl={VERIFY_URL}
      />
    </View>
  );
}

function AccountView({
  startUrl,
  onBlocked,
  onClose,
}: {
  startUrl: string;
  onBlocked: () => void;
  onClose: () => void;
}) {
  const sawAccountsPage = useRef(false);
  const returnTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  useEffect(
    () => () => {
      if (returnTimer.current) {
        clearTimeout(returnTimer.current);
      }
    },
    [],
  );

  const onNavigationStateChange = (navigation: WebViewNavigation) => {
    const progress = accountViewProgress(
      sawAccountsPage.current,
      navigation.url,
      navigation.title,
    );
    sawAccountsPage.current = progress.sawAccountsPage;
    if (progress.blocked) {
      onBlocked();
    } else if (progress.finished && !returnTimer.current) {
      returnTimer.current = setTimeout(onClose, 800);
    }
  };

  return (
    <View style={styles.verifySafeArea}>
      <WebPageHeader onClose={onClose} title="Google Account" />
      <YouTubeTvWebView
        onNavigationStateChange={onNavigationStateChange}
        startUrl={startUrl}
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
  const [loaded, setLoaded] = useState(false);
  const [destination, setDestination] = useState<Destination>();
  const [defaultLocation, setDefaultLocation] = useState<Destination>();
  const [mapPickerVisible, setMapPickerVisible] = useState(false);
  const [showVerify, setShowVerify] = useState(false);
  const [accountUrl, setAccountUrl] = useState<string>();
  const [session, setSession] = useState<SessionState>('unknown');
  const [signingOut, setSigningOut] = useState(false);
  const [message, setMessage] = useState<string>();
  const [accountMessage, setAccountMessage] = useState<string>();
  const [verifyRetry, setVerifyRetry] = useState(false);
  const homeScrollOffset = useRef(0);
  const homeFocusStep = useRef<StepNumber | undefined>(undefined);

  useEffect(() => {
    let active = true;

    void AsyncStorage.multiGet([
      DEFAULT_LOCATION_STORAGE_KEY,
      DESTINATION_STORAGE_KEY,
    ])
      .then((pairs) => {
        const stored = new Map(pairs);
        return resolveTvLocation(
          stored.get(DEFAULT_LOCATION_STORAGE_KEY),
          stored.get(DESTINATION_STORAGE_KEY),
        );
      })
      .catch(() => TV_LOCATION_READ_FAILED)
      .then((resolved) => {
        if (!active) {
          return;
        }
        setDefaultLocation(resolved.defaultLocation);
        setDestination(resolved.current);
        setLoaded(true);
        if (resolved.loadError) {
          setMessage('The saved location could not be loaded. Choose a location.');
        }
        if (resolved.writeDefault && resolved.current) {
          // A failed write leaves the current point in place and runs again next launch.
          void AsyncStorage.setItem(
            DEFAULT_LOCATION_STORAGE_KEY,
            JSON.stringify(resolved.current),
          ).catch(() => undefined);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  // The session is read again whenever a Google page closes.
  useEffect(() => {
    if (showVerify || accountUrl) {
      return;
    }
    let active = true;
    void youTubeSessionState().then((state) => {
      if (active) {
        setSession(state);
      }
    });
    return () => {
      active = false;
    };
  }, [accountUrl, showVerify]);

  // Leaving verification without YouTube's Next taking effect keeps step 3 current.
  const closeVerify = useCallback(() => {
    homeFocusStep.current = 3;
    setShowVerify(false);
    setCurrentStep(3);
    setVerifyRetry(true);
    setMessage(undefined);
  }, []);

  const finishVerify = useCallback(() => {
    homeFocusStep.current = 4;
    setShowVerify(false);
    setCurrentStep(4);
    setVerifyRetry(false);
    setMessage(undefined);
  }, []);

  const openAccountView = useCallback((url: string) => {
    homeFocusStep.current = undefined;
    setAccountMessage(undefined);
    setAccountUrl(url);
  }, []);

  const closeAccountView = useCallback(() => {
    setAccountUrl(undefined);
  }, []);

  const blockAccountView = useCallback(() => {
    setAccountUrl(undefined);
    setAccountMessage('Google blocked sign-in inside the app for this account.');
  }, []);

  useEffect(() => {
    if ((!showVerify && !accountUrl) || Platform.OS !== 'android') {
      return;
    }

    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        if (accountUrl) {
          closeAccountView();
        } else {
          closeVerify();
        }
        return true;
      },
    );

    return () => subscription.remove();
  }, [accountUrl, closeAccountView, closeVerify, showVerify]);

  useEffect(() => {
    if (
      Platform.OS !== 'android' ||
      showVerify ||
      accountUrl ||
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
  }, [accountUrl, mapPickerVisible, onBackToMenu, showVerify]);

  // The first save on a phone with no default sets both points.
  const saveDestination = useCallback(
    async (nextDestination: Destination) => {
      const moved =
        !destination || !sameCoordinates(nextDestination, destination);
      const firstUse = !defaultLocation;
      setDestination(nextDestination);
      if (firstUse) {
        setDefaultLocation(nextDestination);
      }
      setMapPickerVisible(false);
      setMessage(undefined);

      if (moved && (currentStep === 4 || complete)) {
        setCurrentStep(3);
        setComplete(false);
        setVerifyRetry(false);
        setMessage('Map location changed. Run the phone update again.');
      }

      try {
        const stored = JSON.stringify(nextDestination);
        await AsyncStorage.multiSet(
          firstUse
            ? [
                [DEFAULT_LOCATION_STORAGE_KEY, stored],
                [DESTINATION_STORAGE_KEY, stored],
              ]
            : [[DESTINATION_STORAGE_KEY, stored]],
        );
      } catch {
        setMessage(
          'The map location is selected for this session but could not be saved.',
        );
      }
    },
    [complete, currentStep, defaultLocation, destination],
  );

  const applyDefault = useCallback(() => {
    if (defaultLocation) {
      void saveDestination(defaultLocation);
    }
  }, [defaultLocation, saveDestination]);

  const makeDefault = useCallback(
    async (nextDefault: Destination): Promise<boolean> => {
      try {
        await AsyncStorage.setItem(
          DEFAULT_LOCATION_STORAGE_KEY,
          JSON.stringify(nextDefault),
        );
        setDefaultLocation(nextDefault);
        return true;
      } catch {
        return false;
      }
    },
    [],
  );

  const startOver = useCallback(() => {
    setCurrentStep(1);
    setComplete(false);
    setVerifyRetry(false);
    setMessage(undefined);
  }, []);

  const forgetLocation = useCallback(async () => {
    try {
      await AsyncStorage.multiRemove([
        DEFAULT_LOCATION_STORAGE_KEY,
        DESTINATION_STORAGE_KEY,
      ]);
    } catch {
      setAccountMessage('The location could not be forgotten. Try again.');
      return;
    }
    setDestination(undefined);
    setDefaultLocation(undefined);
    setAccountMessage(undefined);
    startOver();
  }, [startOver]);

  const confirmForgetLocation = useCallback(() => {
    Alert.alert(
      'Forget this location?',
      'The saved location and default are removed from this phone.',
      [
        { style: 'cancel', text: 'Cancel' },
        {
          onPress: () => void forgetLocation(),
          style: 'destructive',
          text: 'Forget',
        },
      ],
    );
  }, [forgetLocation]);

  const signOut = useCallback(async () => {
    setAccountMessage(undefined);
    setSigningOut(true);
    const cleared = await clearYouTubeSession();
    await flushWebViewCookies();
    if (!cleared) {
      setAccountMessage('Sign out did not finish. Try again.');
    }
    setSession(await youTubeSessionState());
    setSigningOut(false);
  }, []);

  const confirmSignOut = useCallback(() => {
    Alert.alert(
      'Sign out of YouTube TV on this phone?',
      'The TV stays signed in.',
      [
        { style: 'cancel', text: 'Cancel' },
        {
          onPress: () => void signOut(),
          style: 'destructive',
          text: 'Sign out',
        },
      ],
    );
  }, [signOut]);

  return (
    <>
      {accountUrl ? (
        <AccountView
          onBlocked={blockAccountView}
          onClose={closeAccountView}
          startUrl={accountUrl}
        />
      ) : showVerify && destination ? (
        <VerifyView
          destination={destination}
          onAdvanced={finishVerify}
          onClose={closeVerify}
        />
      ) : (
        <GuidedHome
          accountMessage={accountMessage}
          complete={complete}
          currentStep={currentStep}
          defaultLocation={defaultLocation}
          destination={destination}
          initialFocusStep={homeFocusStep.current}
          initialScrollOffset={homeScrollOffset.current}
          loaded={loaded}
          message={message}
          session={session}
          signingOut={signingOut}
          verifyRetry={verifyRetry}
          onBackToMenu={onBackToMenu}
          onConfirmed={() => setComplete(true)}
          onConfirmDestination={() => setCurrentStep(2)}
          onEditDestination={() => setMapPickerVisible(true)}
          onForgetLocation={confirmForgetLocation}
          onScrollOffsetChange={(offset) => {
            homeScrollOffset.current = offset;
          }}
          onSignIn={() => openAccountView(SIGN_IN_URL)}
          onSignOut={confirmSignOut}
          onStartOver={startOver}
          onSwitchAccount={() => openAccountView(SWITCH_ACCOUNT_URL)}
          onTvReady={() => setCurrentStep(3)}
          onUseDefault={applyDefault}
          onVerify={() => setShowVerify(true)}
        />
      )}

      <MapPicker
        defaultLocation={defaultLocation}
        destination={destination}
        onCancel={() => setMapPickerVisible(false)}
        onMakeDefault={makeDefault}
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
  phonePanel: {
    backgroundColor: '#FFFFFF',
    borderColor: '#D8DEDA',
    borderRadius: 18,
    borderWidth: 1,
    marginBottom: 14,
    padding: 18,
  },
  phonePanelTitle: {
    color: '#15354A',
    fontSize: 22,
    fontWeight: '800',
    lineHeight: 28,
  },
  phonePanelStatus: {
    color: '#3F4E57',
    fontSize: 17,
    fontWeight: '700',
    lineHeight: 25,
    marginTop: 6,
  },
  phonePanelNote: {
    color: '#3F4E57',
    fontSize: 15,
    lineHeight: 21,
    marginTop: 12,
  },
  phonePanelLocation: {
    gap: 10,
    marginTop: 18,
  },
  phonePanelDefault: {
    color: '#15354A',
    fontSize: 17,
    fontWeight: '700',
    lineHeight: 24,
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
  webErrorTitle: {
    color: '#15354A',
    fontSize: 22,
    fontWeight: '800',
    paddingHorizontal: 28,
    textAlign: 'center',
  },
  webErrorText: {
    color: '#3F4E57',
    fontSize: 17,
    lineHeight: 25,
    paddingHorizontal: 28,
    textAlign: 'center',
  },
  webErrorAction: {
    alignSelf: 'stretch',
    marginTop: 8,
    paddingHorizontal: 28,
  },
});

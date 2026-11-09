import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  Image,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { TeamKey } from '../leagues/types.ts';
import { backfillLogos } from '../logos/logoStore';
import { TeamLogo } from '../logos/TeamLogo';
import { moveTile, removeModule, removeTile, YOUTUBE_TV_MODULE } from '../selection/ops.ts';
import type { SelectionChange } from '../selection/store';
import type { Tile } from '../selection/types.ts';
import {
  getActiveReleaseApkInstall,
  installReleaseApk,
  type ReleaseApkInstallResult,
} from '../modules/danner-app-update/src';
import { getProvisioningExpirationTimestamp } from '../modules/danner-provisioning-profile/src';
import {
  APP_UPDATE_DOWNLOADING,
  APP_UPDATE_PROMPT_ANDROID,
  APP_UPDATE_PROMPT_IOS,
  APP_UPDATE_PROMPT_TITLE,
  APP_UPDATE_SIDESTORE_MISSING,
  dismissAppUpdatePrompt,
  fetchVersionManifest,
  getEmbeddedAppVersion,
  shouldOfferAppUpdate,
  sideStoreInstallUrl,
  type VersionManifest,
} from './appUpdate';
import { hubCellPosition, hubLayout } from './hubGrid.ts';
import { HubTile, PlusTileContent } from './HubTile';
import { getProvisioningWarning } from './provisioningWarning';
import {
  tileActionsFor,
  TileActionsSheet,
  type SheetAction,
  type TileActionName,
} from './TileActionsSheet';

const SAVE_FAILED_TITLE = 'Not saved';
const SAVE_FAILED_MESSAGE = 'The change could not be saved on this phone. Try again.';
const READ_ONLY_MESSAGE = 'Your teams could not be read. Close the app and open it again.';

export function HubScreen({
  applyChange,
  onChangeSports,
  onOpenPicker,
  onOpenTeam,
  onOpenTvLocation,
  onTileRemoved,
  readOnly,
  retryLoad,
  showTvTile,
  tiles,
}: {
  applyChange: (change: SelectionChange) => Promise<boolean>;
  onChangeSports: (schoolKey: TeamKey) => void;
  onOpenPicker: () => void;
  onOpenTeam: (key: TeamKey) => void;
  onOpenTvLocation: () => void;
  onTileRemoved: (key: TeamKey) => void;
  readOnly: boolean;
  retryLoad: () => Promise<boolean>;
  showTvTile: boolean;
  tiles: readonly Tile[];
}) {
  const [size, setSize] = useState<{ height: number; width: number } | undefined>();
  const insets = useSafeAreaInsets();
  const [sheetTile, setSheetTile] = useState<Tile | undefined>();
  // The update prompt stays away while the actions sheet or a confirmation is open.
  const overlayOpen = useRef(false);
  const setOverlayOpen = useCallback((open: boolean) => {
    overlayOpen.current = open;
  }, []);
  const [provisioningExpiration, setProvisioningExpiration] = useState<
    number | undefined
  >();
  const [currentTime, setCurrentTime] = useState(Date.now());
  const [updateDownloading, setUpdateDownloading] = useState(
    () => getActiveReleaseApkInstall() !== undefined,
  );

  const readProvisioningExpiration = useCallback(() => {
    setProvisioningExpiration(getProvisioningExpirationTimestamp());
    setCurrentTime(Date.now());
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'ios') {
      return;
    }

    readProvisioningExpiration();
    const clock = setInterval(() => setCurrentTime(Date.now()), 60_000);
    const appStateSubscription = AppState.addEventListener(
      'change',
      (nextState) => {
        if (nextState === 'active') {
          readProvisioningExpiration();
        }
      },
    );

    return () => {
      clearInterval(clock);
      appStateSubscription.remove();
    };
  }, [readProvisioningExpiration]);

  const tilesRef = useRef(tiles);
  tilesRef.current = tiles;

  // A read-only session writes nothing, logos included.
  useEffect(() => {
    if (readOnly) {
      return;
    }
    void backfillLogos(tilesRef.current);
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        void backfillLogos(tilesRef.current);
      }
    });
    return () => subscription.remove();
  }, [readOnly]);

  // Update checks run when the hub mounts and whenever the app becomes active again. Prompt,
  // message, and install state live in this effect and in module scope rather than in render
  // state, so an install finishing never starts another check by itself.
  useEffect(() => {
    let hubMounted = true;
    let promptVisible = false;
    let messageVisible = false;
    let checkInFlight = false;

    function updateBlocked(): boolean {
      return (
        !hubMounted ||
        overlayOpen.current ||
        promptVisible ||
        messageVisible ||
        checkInFlight ||
        getActiveReleaseApkInstall() !== undefined
      );
    }

    function signingWarningVisible(): boolean {
      return (
        getProvisioningWarning(getProvisioningExpirationTimestamp(), Date.now()) !==
        undefined
      );
    }

    function showUpdateMessage(message: string, checkAgain: boolean) {
      messageVisible = true;
      Alert.alert(
        APP_UPDATE_PROMPT_TITLE,
        message,
        [
          {
            text: 'OK',
            onPress: () => {
              messageVisible = false;
              if (checkAgain) {
                void offerAppUpdate();
              }
            },
          },
        ],
        { cancelable: false },
      );
    }

    async function followInstall(install: Promise<ReleaseApkInstallResult>) {
      if (hubMounted) {
        setUpdateDownloading(true);
      }
      const result = await install;
      if (result.status === 'failed' || result.status === 'needs-permission') {
        if (hubMounted) {
          setUpdateDownloading(false);
          // Once installs from this app are allowed, OK offers the update again.
          showUpdateMessage(result.message, result.status === 'needs-permission');
        }
        return;
      }

      // The system installer opened, finished, or was cancelled; the prompt stays dismissed
      // until the app process exits.
      dismissAppUpdatePrompt();
      if (hubMounted) {
        setUpdateDownloading(false);
      }
    }

    async function applyAppUpdate(manifest: VersionManifest) {
      if (Platform.OS === 'ios') {
        try {
          await Linking.openURL(sideStoreInstallUrl(manifest.ios.url));
        } catch {
          if (hubMounted) {
            showUpdateMessage(APP_UPDATE_SIDESTORE_MISSING, false);
          }
        }
        return;
      }

      await followInstall(
        installReleaseApk(manifest.android.url, manifest.android.sha256),
      );
    }

    async function offerAppUpdate() {
      const embeddedVersion = getEmbeddedAppVersion();
      if (updateBlocked() || !embeddedVersion || signingWarningVisible()) {
        return;
      }

      checkInFlight = true;
      let manifest: VersionManifest | undefined;
      try {
        manifest = await fetchVersionManifest();
      } finally {
        checkInFlight = false;
      }
      // The hub, the signing warning, and the install state can all change while the
      // manifest loads.
      if (
        !manifest ||
        updateBlocked() ||
        !shouldOfferAppUpdate({
          embeddedVersion,
          hubVisible: hubMounted && !overlayOpen.current,
          remoteVersion: manifest.version,
          signingWarningVisible: signingWarningVisible(),
        })
      ) {
        return;
      }

      const offered = manifest;
      promptVisible = true;
      Alert.alert(
        APP_UPDATE_PROMPT_TITLE,
        Platform.OS === 'ios' ? APP_UPDATE_PROMPT_IOS : APP_UPDATE_PROMPT_ANDROID,
        [
          {
            text: 'No',
            style: 'cancel',
            onPress: () => {
              promptVisible = false;
              dismissAppUpdatePrompt();
            },
          },
          {
            text: 'Yes',
            onPress: () => {
              promptVisible = false;
              void applyAppUpdate(offered);
            },
          },
        ],
        { cancelable: false },
      );
    }

    const activeInstall = getActiveReleaseApkInstall();
    if (activeInstall) {
      void followInstall(activeInstall);
    } else {
      void offerAppUpdate();
    }
    const appStateSubscription = AppState.addEventListener(
      'change',
      (nextState) => {
        if (nextState === 'active') {
          void offerAppUpdate();
        }
      },
    );

    return () => {
      hubMounted = false;
      appStateSubscription.remove();
    };
  }, []);

  const provisioningWarning = getProvisioningWarning(
    provisioningExpiration,
    currentTime,
  );

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const { height, width } = event.nativeEvent.layout;
    setSize((current) =>
      current?.height === height && current.width === width
        ? current
        : { height, width },
    );
  }, []);

  const applyTileChange = useCallback(
    async (change: SelectionChange): Promise<boolean> => {
      const saved = await applyChange(change);
      if (!saved) {
        Alert.alert(SAVE_FAILED_TITLE, SAVE_FAILED_MESSAGE);
      }
      return saved;
    },
    [applyChange],
  );

  const confirmRemove = useCallback(
    (tile: Tile) => {
      setOverlayOpen(true);
      Alert.alert(`Remove ${tile.team.name}?`, 'It will be removed from the hub.', [
        {
          onPress: () => setOverlayOpen(false),
          style: 'cancel',
          text: 'Cancel',
        },
        {
          onPress: () => {
            setOverlayOpen(false);
            void applyTileChange((current, now) =>
              removeTile(current, tile.key, now),
            ).then((saved) => {
              if (saved) {
                onTileRemoved(tile.key);
              }
            });
          },
          style: 'destructive',
          text: 'Remove',
        },
      ]);
    },
    [applyTileChange, onTileRemoved, setOverlayOpen],
  );

  const confirmRemoveTv = useCallback(() => {
    setOverlayOpen(true);
    Alert.alert(
      'Remove YouTube TV?',
      'It will be removed from the hub. You can add it again from + under Custom modules.',
      [
        {
          onPress: () => setOverlayOpen(false),
          style: 'cancel',
          text: 'Cancel',
        },
        {
          onPress: () => {
            setOverlayOpen(false);
            void applyTileChange((current, now) =>
              removeModule(current, YOUTUBE_TV_MODULE, now),
            );
          },
          style: 'destructive',
          text: 'Remove',
        },
      ],
    );
  }, [applyTileChange, setOverlayOpen]);

  const runTileAction = useCallback(
    (tile: Tile, action: TileActionName) => {
      if (action === 'remove') {
        confirmRemove(tile);
      } else if (action === 'sports') {
        onChangeSports(tile.key);
      } else {
        void applyTileChange((current, now) =>
          moveTile(current, tile.key, action, now),
        );
      }
    },
    [applyTileChange, confirmRemove, onChangeSports],
  );

  const closeSheet = useCallback(() => {
    setOverlayOpen(false);
    setSheetTile(undefined);
  }, [setOverlayOpen]);

  const openPlus = useCallback(() => {
    if (!readOnly) {
      onOpenPicker();
      return;
    }
    void retryLoad().then((stillReadOnly) => {
      if (stillReadOnly) {
        Alert.alert('Teams', READ_ONLY_MESSAGE);
      } else {
        onOpenPicker();
      }
    });
  }, [onOpenPicker, readOnly, retryLoad]);

  const actionsFor = (tile: Tile, index: number): SheetAction[] =>
    tileActionsFor({
      first: index === 0,
      isSchool: tile.kind === 'school',
      last: index === tiles.length - 1,
    });

  const busy = provisioningWarning !== undefined || updateDownloading;
  const plusIndex = tiles.length + (showTvTile ? 1 : 0);
  const layout = size
    ? hubLayout({
        cells: plusIndex + 1,
        height: size.height,
        insetLeft: insets.left,
        insetRight: insets.right,
        topBusy: busy,
        width: size.width,
      })
    : undefined;

  const cell = (index: number, content: ReactElement, key: string) =>
    layout ? (
      <View
        key={key}
        style={[
          styles.cell,
          hubCellPosition(layout, index),
          { height: layout.tile, width: layout.tile },
        ]}
      >
        {content}
      </View>
    ) : null;

  const cells = layout
    ? [
        ...tiles.map((tile, index) => {
          const actions = actionsFor(tile, index);
          const enabled = actions.filter((action) => !action.disabled);
          return cell(
            index,
            <HubTile
              accessibilityActions={
                readOnly
                  ? undefined
                  : enabled.map((action) => ({
                      label: action.label,
                      name: action.name,
                    }))
              }
              hint={`Opens ${tile.team.nickname} scores, record, schedule, and authorized live video`}
              label={tile.team.name}
              onAccessibilityAction={
                readOnly
                  ? undefined
                  : (name) => runTileAction(tile, name as TileActionName)
              }
              onLongPress={
                readOnly
                  ? undefined
                  : () => {
                      setOverlayOpen(true);
                      setSheetTile(tile);
                    }
              }
              onPress={() => onOpenTeam(tile.key)}
              size={layout.tile}
            >
              <TeamLogo size={layout.tile} team={tile.team} tileKey={tile.key} />
            </HubTile>,
            tile.key,
          );
        }),
        ...(showTvTile
          ? [
              cell(
                tiles.length,
                <HubTile
                  accessibilityActions={
                    readOnly ? undefined : [{ label: 'Remove from hub', name: 'remove' }]
                  }
                  hint="Opens the YouTube TV location setup"
                  label="TV Location"
                  onAccessibilityAction={readOnly ? undefined : confirmRemoveTv}
                  onLongPress={readOnly ? undefined : confirmRemoveTv}
                  onPress={onOpenTvLocation}
                  size={layout.tile}
                >
                  <Image
                    resizeMode="cover"
                    source={require('../assets/youtube-tv-logo-vecteezy.jpg')}
                    style={styles.fill}
                  />
                </HubTile>,
                'tv-location',
              ),
            ]
          : []),
        cell(
          plusIndex,
          <HubTile
            hint="Opens the team picker"
            label="Add team"
            onPress={openPlus}
            size={layout.tile}
          >
            <PlusTileContent size={layout.tile} />
          </HubTile>,
          'add-team',
        ),
      ]
    : null;

  return (
    <View onLayout={onLayout} style={styles.menuScreen}>
      {layout && (provisioningWarning || updateDownloading) ? (
        <View
          accessibilityRole={provisioningWarning ? 'alert' : undefined}
          style={[styles.menuExpiryWarning, layout.warning]}
        >
          {provisioningWarning ? (
            <>
              <Text style={styles.menuExpiryWarningTitle}>
                {provisioningWarning.title}
              </Text>
              <Text style={styles.menuExpiryWarningInstruction}>
                {provisioningWarning.instruction}
              </Text>
            </>
          ) : (
            <ActivityIndicator
              accessibilityLabel={APP_UPDATE_DOWNLOADING}
              color="#1F6F55"
              size="small"
            />
          )}
        </View>
      ) : null}

      {layout ? (
        <Image
          accessibilityLabel="Danner logo"
          resizeMode="contain"
          source={require('../assets/ic_launcher_danner.jpg')}
          style={[
            styles.menuLogo,
            {
              borderRadius: layout.logo.size * LOGO_RADIUS_RATIO,
              height: layout.logo.size,
              left: layout.logo.left,
              top: layout.logo.top,
              width: layout.logo.size,
            },
          ]}
        />
      ) : null}

      {layout?.scrollFrame ? (
        <ScrollView style={[styles.absolute, layout.scrollFrame]}>
          <View style={{ height: layout.grid.height + 16 }}>
            <View style={[styles.absolute, layout.grid]}>{cells}</View>
          </View>
        </ScrollView>
      ) : layout ? (
        <View style={[styles.absolute, layout.grid]}>{cells}</View>
      ) : null}

      {sheetTile ? (
        <TileActionsSheet
          actions={actionsFor(
            sheetTile,
            tiles.findIndex((tile) => tile.key === sheetTile.key),
          )}
          onAction={(action) => {
            const tile = sheetTile;
            closeSheet();
            runTileAction(tile, action);
          }}
          onClose={closeSheet}
          title={sheetTile.team.name}
        />
      ) : null}
    </View>
  );
}

const LOGO_RADIUS_RATIO = 34 / 210;

const styles = StyleSheet.create({
  absolute: {
    position: 'absolute',
  },
  cell: {
    position: 'absolute',
  },
  fill: {
    height: '100%',
    width: '100%',
  },
  menuLogo: {
    position: 'absolute',
  },
  menuExpiryWarning: {
    alignItems: 'center',
    position: 'absolute',
  },
  menuExpiryWarningInstruction: {
    color: '#5A4137',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 2,
    textAlign: 'center',
  },
  menuExpiryWarningTitle: {
    color: '#A32626',
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
  },
  menuScreen: {
    backgroundColor: '#F7F7F2',
    flex: 1,
    position: 'relative',
  },
});

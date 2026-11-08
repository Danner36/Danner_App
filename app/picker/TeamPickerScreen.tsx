import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SUPPORTED_ADAPTER_KEYS } from '../leagues/registry.ts';
import { sportLabel } from '../leagues/sports.ts';
import type { LeagueKey, SportKey, TeamKey } from '../leagues/types.ts';
import {
  addPro,
  addSchoolSports,
  findTile,
  isHubFull,
  MAX_TEAM_TILES,
  refreshTeamRefs,
  setSchoolSports,
} from '../selection/ops.ts';
import type { SelectionChange } from '../selection/store';
import type { SelectionV1 } from '../selection/types.ts';
import {
  readCatalog,
  refreshCatalogIfStale,
  teamRefLookup,
  type CatalogData,
} from './catalog';
import {
  hubStatusLabel,
  pickerRows,
  presetSports,
  proTileFromCatalog,
  schoolTileFromCatalog,
  searchTeams,
  sportChoices,
  teamsForRow,
  type CatalogTeam,
  type PickerRow,
} from './catalogModel.ts';

const TEAM_ROW_HEIGHT = 68;
const SAVE_FAILED_MESSAGE = 'The team could not be saved on this phone. Try again.';

export type PickerStart = { schoolKey: TeamKey };

type Step =
  | { name: 'league' }
  | { name: 'team'; row: PickerRow }
  | {
      name: 'sports';
      picked?: SportKey;
      returnTo?: PickerRow;
      school?: CatalogTeam;
      tileKey: TeamKey;
    };

function schoolEntry(
  catalog: CatalogData | undefined,
  key: TeamKey,
): CatalogTeam | undefined {
  return catalog?.teams.ncaa?.teams.find((team) => team.key === key);
}

function teamsOf(catalog: CatalogData | undefined, league: LeagueKey): CatalogTeam[] {
  return catalog?.teams[league]?.teams ?? [];
}

export function TeamPickerScreen({
  applyChange,
  onClose,
  onTileRemoved,
  selection,
  start,
}: {
  applyChange: (change: SelectionChange) => Promise<boolean>;
  onClose: () => void;
  onTileRemoved: (key: TeamKey) => void;
  selection: SelectionV1;
  start?: PickerStart;
}) {
  const [catalog, setCatalog] = useState<CatalogData | undefined>();
  const [checking, setChecking] = useState(true);
  const [step, setStep] = useState<Step>(() =>
    start ? { name: 'sports', tileKey: start.schoolKey } : { name: 'league' },
  );

  const refresh = useCallback(async () => {
    setChecking(true);
    try {
      setCatalog(await readCatalog());
      const refreshed = await refreshCatalogIfStale();
      if (refreshed) {
        setCatalog(refreshed);
        const refFor = teamRefLookup(refreshed);
        await applyChange((current, now) => refreshTeamRefs(current, refFor, now));
      }
    } finally {
      setChecking(false);
    }
  }, [applyChange]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const goBack = useCallback(() => {
    if (step.name === 'team') {
      setStep({ name: 'league' });
    } else if (step.name === 'sports' && step.returnTo) {
      setStep({ name: 'team', row: step.returnTo });
    } else {
      onClose();
    }
  }, [onClose, step]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      goBack();
      return true;
    });
    return () => subscription.remove();
  }, [goBack]);

  const rows = useMemo(
    () => pickerRows(catalog?.leagues, SUPPORTED_ADAPTER_KEYS),
    [catalog],
  );

  const saveAndClose = useCallback(
    async (change: SelectionChange) => {
      if (await applyChange(change)) {
        onClose();
      } else {
        Alert.alert('Team not saved', SAVE_FAILED_MESSAGE);
      }
    },
    [applyChange, onClose],
  );

  const addProTeam = useCallback(
    (team: CatalogTeam, league: Exclude<LeagueKey, 'ncaa'>) => {
      void saveAndClose((current, now) =>
        addPro(current, proTileFromCatalog(team, league), now),
      );
    },
    [saveAndClose],
  );

  const removeSchool = useCallback(
    async (key: TeamKey) => {
      if (await applyChange((current, now) => setSchoolSports(current, key, [], now))) {
        onTileRemoved(key);
        onClose();
      } else {
        Alert.alert('Team not saved', SAVE_FAILED_MESSAGE);
      }
    },
    [applyChange, onClose, onTileRemoved],
  );

  const saveSports = useCallback(
    (key: TeamKey, school: CatalogTeam | undefined, sports: SportKey[]) => {
      if (findTile(selection, key)) {
        void saveAndClose((current, now) => setSchoolSports(current, key, sports, now));
      } else if (school) {
        void saveAndClose((current, now) =>
          addSchoolSports(current, schoolTileFromCatalog(school, sports), now),
        );
      }
    },
    [saveAndClose, selection],
  );

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable
          accessibilityLabel={step.name === 'league' ? 'Return to Danner Apps' : 'Back'}
          accessibilityRole="button"
          hitSlop={12}
          onPress={goBack}
          style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}
        >
          <Text style={styles.headerButtonText}>
            {step.name === 'league' ? '‹ Apps' : '‹ Back'}
          </Text>
        </Pressable>
      </View>

      {step.name === 'league' ? (
        <LeagueStep
          checking={checking}
          full={isHubFull(selection)}
          onPick={(row) => setStep({ name: 'team', row })}
          onRetry={() => void refresh()}
          rows={rows}
        />
      ) : step.name === 'team' ? (
        <TeamStep
          onPickPro={addProTeam}
          onPickSchool={(team, row) =>
            setStep({
              name: 'sports',
              picked: row.sport,
              returnTo: row,
              school: team,
              tileKey: team.key,
            })
          }
          row={step.row}
          selection={selection}
          teams={teamsForRow(teamsOf(catalog, step.row.league), step.row)}
        />
      ) : (
        <SportsStep
          choices={sportChoices(
            step.school ?? schoolEntry(catalog, step.tileKey),
            rows,
            findTile(selection, step.tileKey),
          )}
          initial={presetSports(findTile(selection, step.tileKey), step.picked)}
          key={step.tileKey}
          name={
            step.school?.name ??
            findTile(selection, step.tileKey)?.team.name ??
            schoolEntry(catalog, step.tileKey)?.name ??
            ''
          }
          onRemove={() => void removeSchool(step.tileKey)}
          onSave={(sports) =>
            saveSports(
              step.tileKey,
              step.school ?? schoolEntry(catalog, step.tileKey),
              sports,
            )
          }
          onHub={findTile(selection, step.tileKey) !== undefined}
        />
      )}
    </View>
  );
}

function LeagueStep({
  checking,
  full,
  onPick,
  onRetry,
  rows,
}: {
  checking: boolean;
  full: boolean;
  onPick: (row: PickerRow) => void;
  onRetry: () => void;
  rows: readonly PickerRow[];
}) {
  return (
    <View style={styles.body}>
      <Text accessibilityRole="header" style={styles.title}>
        Add a team
      </Text>
      {full ? (
        <Text accessibilityRole="alert" style={styles.fullText}>
          {`Hub is full (${MAX_TEAM_TILES} teams)`}
        </Text>
      ) : null}
      {rows.map((row) => (
        <Pressable
          accessibilityLabel={row.label}
          accessibilityRole="button"
          accessibilityState={{ disabled: full }}
          disabled={full}
          key={row.adapter}
          onPress={() => onPick(row)}
          style={({ pressed }) => [
            styles.leagueRow,
            pressed && styles.pressed,
            full && styles.disabled,
          ]}
        >
          <Text style={styles.leagueText}>{row.label}</Text>
        </Pressable>
      ))}
      {rows.length === 0 && checking ? (
        <ActivityIndicator color="#1F6F55" size="large" style={styles.spinner} />
      ) : null}
      {rows.length === 0 && !checking ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>
            The team list is not available. Check the connection and try again.
          </Text>
          <Pressable
            accessibilityLabel="Try again"
            accessibilityRole="button"
            onPress={onRetry}
            style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
          >
            <Text style={styles.primaryButtonText}>Try again</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function TeamStep({
  onPickPro,
  onPickSchool,
  row,
  selection,
  teams,
}: {
  onPickPro: (team: CatalogTeam, league: Exclude<LeagueKey, 'ncaa'>) => void;
  onPickSchool: (team: CatalogTeam, row: PickerRow) => void;
  row: PickerRow;
  selection: SelectionV1;
  teams: CatalogTeam[];
}) {
  const [query, setQuery] = useState('');
  const matches = useMemo(() => searchTeams(teams, query), [query, teams]);

  return (
    <View style={styles.listBody}>
      <Text accessibilityRole="header" style={styles.title}>
        {row.label}
      </Text>
      <TextInput
        accessibilityLabel="Search teams"
        autoCapitalize="none"
        autoCorrect={false}
        onChangeText={setQuery}
        placeholder="Search"
        placeholderTextColor="#6B7780"
        style={styles.search}
        value={query}
      />
      <FlatList
        data={matches}
        getItemLayout={(_, index) => ({
          index,
          length: TEAM_ROW_HEIGHT,
          offset: TEAM_ROW_HEIGHT * index,
        })}
        keyboardShouldPersistTaps="handled"
        keyExtractor={(team) => team.key}
        renderItem={({ item }) => {
          const existing = findTile(selection, item.key);
          const status = hubStatusLabel(existing);
          const disabled = existing?.kind === 'pro';
          return (
            <Pressable
              accessibilityHint={status}
              accessibilityLabel={item.name}
              accessibilityRole="button"
              accessibilityState={{ disabled }}
              disabled={disabled}
              onPress={() => {
                if (row.league === 'ncaa') {
                  onPickSchool(item, row);
                } else {
                  onPickPro(item, row.league);
                }
              }}
              style={({ pressed }) => [
                styles.teamRow,
                pressed && styles.pressed,
                disabled && styles.disabled,
              ]}
            >
              <Text numberOfLines={1} style={styles.teamText}>
                {item.name}
              </Text>
              {status ? (
                <Text numberOfLines={1} style={styles.statusText}>
                  {status}
                </Text>
              ) : null}
            </Pressable>
          );
        }}
      />
    </View>
  );
}

function SportsStep({
  choices,
  initial,
  name,
  onHub,
  onRemove,
  onSave,
}: {
  choices: readonly SportKey[];
  initial: readonly SportKey[];
  name: string;
  onHub: boolean;
  onRemove: () => void;
  onSave: (sports: SportKey[]) => void;
}) {
  const [checked, setChecked] = useState<readonly SportKey[]>(initial);

  const toggle = (sport: SportKey) => {
    setChecked((current) =>
      current.includes(sport)
        ? current.filter((value) => value !== sport)
        : [...current, sport],
    );
  };

  const save = () => {
    if (checked.length > 0) {
      onSave(choices.filter((sport) => checked.includes(sport)));
      return;
    }
    Alert.alert(`Remove ${name}?`, 'It will be removed from the hub.', [
      { style: 'cancel', text: 'Cancel' },
      { onPress: onRemove, style: 'destructive', text: 'Remove' },
    ]);
  };

  const saveDisabled = checked.length === 0 && !onHub;

  return (
    <View style={styles.body}>
      <Text accessibilityRole="header" style={styles.title}>
        {name}
      </Text>
      {choices.map((sport) => {
        const selected = checked.includes(sport);
        return (
          <Pressable
            accessibilityLabel={sportLabel(sport)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: selected }}
            key={sport}
            onPress={() => toggle(sport)}
            style={({ pressed }) => [styles.sportRow, pressed && styles.pressed]}
          >
            <View style={[styles.checkbox, selected && styles.checkboxChecked]}>
              {selected ? <Text style={styles.checkMark}>✓</Text> : null}
            </View>
            <Text style={styles.sportText}>{sportLabel(sport)}</Text>
          </Pressable>
        );
      })}
      <Pressable
        accessibilityLabel="Save"
        accessibilityRole="button"
        accessibilityState={{ disabled: saveDisabled }}
        disabled={saveDisabled}
        onPress={save}
        style={({ pressed }) => [
          styles.primaryButton,
          pressed && styles.pressed,
          saveDisabled && styles.disabled,
        ]}
      >
        <Text style={styles.primaryButtonText}>Save</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  body: {
    alignSelf: 'center',
    maxWidth: 720,
    paddingHorizontal: 18,
    width: '100%',
  },
  checkMark: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '900',
  },
  checkbox: {
    alignItems: 'center',
    borderColor: '#1F6F55',
    borderRadius: 8,
    borderWidth: 2,
    height: 32,
    justifyContent: 'center',
    marginRight: 14,
    width: 32,
  },
  checkboxChecked: {
    backgroundColor: '#1F6F55',
  },
  disabled: {
    opacity: 0.45,
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderColor: '#D7DEE5',
    borderRadius: 18,
    borderWidth: 1,
    marginTop: 8,
    padding: 20,
  },
  emptyText: {
    color: '#45545E',
    fontSize: 17,
    fontWeight: '600',
    lineHeight: 24,
  },
  fullText: {
    color: '#A32626',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 12,
  },
  header: {
    alignSelf: 'center',
    maxWidth: 720,
    minHeight: 54,
    paddingHorizontal: 18,
    paddingTop: 8,
    width: '100%',
  },
  headerButton: {
    justifyContent: 'center',
    minHeight: 44,
    minWidth: 72,
  },
  headerButtonText: {
    color: '#0B2B4C',
    fontSize: 18,
    fontWeight: '800',
  },
  leagueRow: {
    backgroundColor: '#FFFFFF',
    borderColor: '#A9CEBB',
    borderRadius: 14,
    borderWidth: 2,
    justifyContent: 'center',
    marginBottom: 12,
    minHeight: 62,
    paddingHorizontal: 18,
  },
  leagueText: {
    color: '#15354A',
    fontSize: 20,
    fontWeight: '800',
  },
  listBody: {
    alignSelf: 'center',
    flex: 1,
    maxWidth: 720,
    paddingHorizontal: 18,
    width: '100%',
  },
  pressed: {
    opacity: 0.7,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#1F6F55',
    borderRadius: 13,
    justifyContent: 'center',
    marginTop: 16,
    minHeight: 58,
    paddingHorizontal: 22,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 19,
    fontWeight: '800',
  },
  screen: {
    backgroundColor: '#F7F7F2',
    flex: 1,
  },
  search: {
    backgroundColor: '#FFFFFF',
    borderColor: '#A9CEBB',
    borderRadius: 12,
    borderWidth: 2,
    color: '#15354A',
    fontSize: 18,
    marginBottom: 10,
    minHeight: 54,
    paddingHorizontal: 14,
  },
  spinner: {
    marginTop: 24,
  },
  sportRow: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#D7DEE5',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    marginBottom: 12,
    minHeight: 62,
    paddingHorizontal: 16,
  },
  sportText: {
    color: '#15354A',
    fontSize: 19,
    fontWeight: '700',
  },
  statusText: {
    color: '#1F6F55',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 2,
  },
  teamRow: {
    borderBottomColor: '#E3E8E2',
    borderBottomWidth: 1,
    height: TEAM_ROW_HEIGHT,
    justifyContent: 'center',
  },
  teamText: {
    color: '#15354A',
    fontSize: 18,
    fontWeight: '700',
  },
  title: {
    color: '#15354A',
    fontSize: 28,
    fontWeight: '900',
    marginBottom: 16,
  },
});

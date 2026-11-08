import { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import type { WinChance } from '../leagues/espn/winChance.ts';
import type { TeamKey, TeamRef } from '../leagues/types.ts';
import { LOGO_BACKGROUND } from '../logos/logoColors';
import { TeamLogo } from '../logos/TeamLogo';
import { isAllowedLogoUrl } from '../picker/catalogModel.ts';
import type { ScoreHeader, ScoreHeaderRow } from './engine/scoreHeader.ts';
import { WinChanceBar } from './WinChanceBar';

const LOGO_SIZE = 34;
const LOGO_PADDING = 3;
const LIVE_DOT = '#FF5A6E';

export type HeaderBadgeTone = 'alert' | 'live' | 'loss' | 'plain' | 'win';

function OpponentLogo({ logo, name }: { logo?: string; name: string }) {
  const [failed, setFailed] = useState(false);
  if (isAllowedLogoUrl(logo) && !failed) {
    return (
      <View style={styles.opponentLogo}>
        <Image
          onError={() => setFailed(true)}
          resizeMode="contain"
          source={{ uri: logo }}
          style={styles.opponentImage}
        />
      </View>
    );
  }
  return <Text style={styles.initial}>{name.trim().charAt(0).toUpperCase()}</Text>;
}

function ScoreRow({
  opponentLogo,
  row,
  showsPossession,
  team,
  teamKey,
}: {
  opponentLogo?: string;
  row: ScoreHeaderRow;
  showsPossession: boolean;
  team: TeamRef;
  teamKey: TeamKey;
}) {
  return (
    <View style={styles.row}>
      {showsPossession ? (
        <View style={styles.possessionSlot}>
          {row.hasPossession ? <View style={styles.possessionMark} /> : null}
        </View>
      ) : null}
      <View style={styles.logoBox}>
        {row.isFollowed ? (
          <TeamLogo size={LOGO_SIZE} team={team} tileKey={teamKey} />
        ) : (
          <OpponentLogo logo={opponentLogo} name={row.name} />
        )}
      </View>
      <Text
        adjustsFontSizeToFit
        minimumFontScale={0.75}
        numberOfLines={1}
        style={[styles.name, row.isFollowed && styles.followedName]}
      >
        {row.name}
      </Text>
      {row.score !== undefined ? (
        <Text maxFontSizeMultiplier={1} style={styles.score}>
          {row.score}
        </Text>
      ) : null}
    </View>
  );
}

// The top of a game card: the sport, the game state and clock, both teams, and the win chance.
export function GameScoreHeader({
  badge,
  badgeTone,
  countdown,
  header,
  isLastSection,
  opponentLogo,
  opponentName,
  sportName,
  team,
  teamKey,
  winChance,
}: {
  badge: string;
  badgeTone: HeaderBadgeTone;
  // Time left until a scheduled game starts.
  countdown?: string;
  header: ScoreHeader;
  // Nothing follows on the card, so the header fills its bottom edge.
  isLastSection: boolean;
  opponentLogo?: string;
  opponentName: string;
  sportName?: string;
  team: TeamRef;
  teamKey: TeamKey;
  winChance?: WinChance;
}) {
  const scoreSummary = header.rows
    .map((row) => (row.score === undefined ? row.name : `${row.name} ${row.score}`))
    .join(', ');
  const summary = [badge, header.status, scoreSummary, header.situation]
    .filter(Boolean)
    .join('. ');

  return (
    <View style={[styles.header, isLastSection && styles.headerLast]}>
      <View accessibilityLabel={summary} accessibilityRole="text" accessible>
        {sportName ? <Text style={styles.sport}>{sportName}</Text> : null}
        <View style={styles.statusRow}>
          <View style={styles.badge}>
            {badgeTone === 'live' ? <View style={styles.liveDot} /> : null}
            <Text numberOfLines={1} style={[styles.badgeText, toneStyles[badgeTone]]}>
              {badge}
            </Text>
          </View>
          {countdown !== undefined ? (
            <View style={styles.countdown}>
              <Text style={styles.countdownLabel}>STARTS IN</Text>
              <Text accessibilityLiveRegion="polite" style={styles.status}>
                {countdown}
              </Text>
            </View>
          ) : header.status ? (
            <Text numberOfLines={1} style={[styles.status, styles.statusShrink]}>
              {header.status}
            </Text>
          ) : null}
        </View>
        {header.rows.map((row) => (
          <ScoreRow
            key={row.name}
            opponentLogo={opponentLogo}
            row={row}
            showsPossession={header.tracksPossession}
            team={team}
            teamKey={teamKey}
          />
        ))}
        {header.situation ? (
          <Text style={styles.situation}>{header.situation}</Text>
        ) : null}
      </View>
      {winChance ? (
        <WinChanceBar
          chance={winChance}
          onBoard
          opponentName={opponentName}
          teamName={team.nickname}
        />
      ) : null}
    </View>
  );
}

const CARD_PADDING = 20;

const styles = StyleSheet.create({
  header: {
    backgroundColor: '#07264A',
    marginHorizontal: -CARD_PADDING,
    marginTop: -CARD_PADDING,
    paddingBottom: 16,
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  headerLast: {
    marginBottom: -CARD_PADDING,
  },
  sport: {
    color: '#B9C6D3',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.7,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  statusRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  badge: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 0,
    gap: 7,
  },
  liveDot: {
    backgroundColor: LIVE_DOT,
    borderRadius: 5,
    height: 10,
    width: 10,
  },
  badgeText: {
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 1,
  },
  status: {
    color: '#F4F7FA',
    fontSize: 15,
    fontVariant: ['tabular-nums'],
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  statusShrink: {
    flexShrink: 1,
    textAlign: 'right',
  },
  countdown: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 7,
  },
  countdownLabel: {
    color: '#B9C6D3',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1,
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    minHeight: 50,
  },
  possessionSlot: {
    alignItems: 'flex-start',
    width: 13,
  },
  possessionMark: {
    borderBottomColor: 'transparent',
    borderBottomWidth: 5,
    borderLeftColor: '#FFCF4A',
    borderLeftWidth: 8,
    borderTopColor: 'transparent',
    borderTopWidth: 5,
    height: 0,
    width: 0,
  },
  logoBox: {
    alignItems: 'center',
    backgroundColor: LOGO_BACKGROUND,
    borderRadius: 8,
    height: LOGO_SIZE,
    justifyContent: 'center',
    overflow: 'hidden',
    width: LOGO_SIZE,
  },
  opponentLogo: {
    height: '100%',
    padding: LOGO_PADDING,
    width: '100%',
  },
  opponentImage: {
    height: '100%',
    width: '100%',
  },
  initial: {
    color: '#07264A',
    fontSize: 17,
    fontWeight: '900',
  },
  name: {
    color: '#DCE4EC',
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    marginLeft: 11,
  },
  followedName: {
    color: '#FFFFFF',
    fontWeight: '900',
  },
  score: {
    color: '#FFCF4A',
    fontSize: 34,
    fontVariant: ['tabular-nums'],
    fontWeight: '900',
    marginLeft: 10,
    minWidth: 52,
    textAlign: 'right',
  },
  situation: {
    borderTopColor: 'rgba(244, 247, 250, 0.3)',
    borderTopWidth: StyleSheet.hairlineWidth,
    color: '#F4F7FA',
    fontSize: 14,
    fontWeight: '800',
    marginTop: 8,
    paddingTop: 9,
    textAlign: 'center',
  },
});

const toneStyles = StyleSheet.create({
  alert: { color: '#FFC56B' },
  live: { color: '#FFFFFF' },
  loss: { color: '#FF9AA8' },
  plain: { color: '#FFFFFF' },
  win: { color: '#7EE2A8' },
});

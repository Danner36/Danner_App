import { useSyncExternalStore } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import type { TeamKey, TeamRef } from '../leagues/types.ts';
import { teamAccent, textColorOn } from '../team/theme';
import { cachedLogoUri, getLogoVersion, subscribeToLogos } from './logoStore';
import { presetLogoFor } from './presetLogos';

const LOGO_PADDING_RATIO = 0.12;
const FALLBACK_FONT_RATIO = 0.3;

// The bundled preset art, else the cached file, else the abbreviation on the accent color. Fills
// its parent, which sets the size and the rounding.
export function TeamLogo({
  size,
  team,
  tileKey,
}: {
  size: number;
  team: TeamRef;
  tileKey: TeamKey;
}) {
  useSyncExternalStore(subscribeToLogos, getLogoVersion);

  const preset = presetLogoFor(tileKey);
  if (preset !== undefined) {
    return <Image resizeMode="cover" source={preset} style={styles.fill} />;
  }

  const uri = cachedLogoUri(tileKey);
  if (uri) {
    return (
      <View style={[styles.fill, styles.white, { padding: size * LOGO_PADDING_RATIO }]}>
        <Image resizeMode="contain" source={{ uri }} style={styles.fill} />
      </View>
    );
  }

  const accent = teamAccent(tileKey, team);
  return (
    <View style={[styles.fill, styles.center, { backgroundColor: accent }]}>
      <Text
        adjustsFontSizeToFit
        numberOfLines={1}
        style={[
          styles.abbreviation,
          { color: textColorOn(accent), fontSize: size * FALLBACK_FONT_RATIO },
        ]}
      >
        {team.abbreviation}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  abbreviation: {
    fontWeight: '800',
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  fill: {
    height: '100%',
    width: '100%',
  },
  white: {
    backgroundColor: '#FFFFFF',
  },
});

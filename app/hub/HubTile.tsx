import type { ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  type AccessibilityActionEvent,
} from 'react-native';

const PLUS_GLYPH_RATIO = 0.5;

export type TileAction = { label: string; name: string };

function HubTileFrame({
  accessibilityActions,
  children,
  hint,
  label,
  onAccessibilityAction,
  onLongPress,
  onPress,
  size,
}: {
  accessibilityActions?: readonly TileAction[];
  children: ReactNode;
  hint: string;
  label: string;
  onAccessibilityAction?: (name: string) => void;
  onLongPress?: () => void;
  onPress: () => void;
  size: number;
}) {
  return (
    <Pressable
      accessibilityActions={accessibilityActions}
      accessibilityHint={hint}
      accessibilityLabel={label}
      accessibilityRole="button"
      onAccessibilityAction={
        onAccessibilityAction
          ? (event: AccessibilityActionEvent) =>
              onAccessibilityAction(event.nativeEvent.actionName)
          : undefined
      }
      onLongPress={onLongPress}
      onPress={onPress}
      style={({ pressed }) => [
        styles.tile,
        { height: size, width: size },
        pressed && styles.pressed,
      ]}
    >
      {children}
    </Pressable>
  );
}

export { HubTileFrame as HubTile };

export function PlusTileContent({ size }: { size: number }) {
  return (
    <Text
      allowFontScaling={false}
      style={[styles.plus, { fontSize: size * PLUS_GLYPH_RATIO, lineHeight: size * 0.62 }]}
    >
      +
    </Text>
  );
}

const styles = StyleSheet.create({
  plus: {
    color: '#1F6F55',
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.78,
    transform: [{ scale: 0.98 }],
  },
  tile: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#A9CEBB',
    borderRadius: 14,
    borderWidth: 2,
    elevation: 2,
    justifyContent: 'center',
    overflow: 'hidden',
    shadowColor: '#15354A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 9,
  },
});

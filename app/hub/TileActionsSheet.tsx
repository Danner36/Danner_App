import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

export type TileActionName =
  | 'front'
  | 'earlier'
  | 'later'
  | 'sports'
  | 'remove';

export type SheetAction = {
  disabled?: boolean;
  label: string;
  name: TileActionName;
};

export function tileActionsFor(options: {
  first: boolean;
  isSchool: boolean;
  last: boolean;
}): SheetAction[] {
  return [
    { disabled: options.first, label: 'Move to front', name: 'front' },
    { disabled: options.first, label: 'Move earlier', name: 'earlier' },
    { disabled: options.last, label: 'Move later', name: 'later' },
    ...(options.isSchool
      ? [{ label: 'Change sports', name: 'sports' as const }]
      : []),
    { label: 'Remove from hub', name: 'remove' },
  ];
}

export function TileActionsSheet({
  actions,
  onAction,
  onClose,
  title,
}: {
  actions: readonly SheetAction[];
  onAction: (name: TileActionName) => void;
  onClose: () => void;
  title: string;
}) {
  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text accessibilityRole="header" style={styles.title}>
            {title}
          </Text>
          {actions.map((action) => (
            <Pressable
              accessibilityLabel={action.label}
              accessibilityRole="button"
              accessibilityState={{ disabled: action.disabled === true }}
              disabled={action.disabled}
              key={action.name}
              onPress={() => onAction(action.name)}
              style={({ pressed }) => [
                styles.row,
                pressed && styles.pressed,
                action.disabled && styles.disabled,
              ]}
            >
              <Text
                style={[
                  styles.rowText,
                  action.name === 'remove' && styles.removeText,
                ]}
              >
                {action.label}
              </Text>
            </Pressable>
          ))}
          <Pressable
            accessibilityLabel="Cancel"
            accessibilityRole="button"
            onPress={onClose}
            style={({ pressed }) => [styles.cancel, pressed && styles.pressed]}
          >
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    alignItems: 'center',
    backgroundColor: 'rgba(21, 53, 74, 0.45)',
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  cancel: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    minHeight: 54,
  },
  cancelText: {
    color: '#45545E',
    fontSize: 18,
    fontWeight: '700',
  },
  disabled: {
    opacity: 0.4,
  },
  pressed: {
    opacity: 0.7,
  },
  removeText: {
    color: '#A32626',
  },
  row: {
    borderTopColor: '#E3E8E2',
    borderTopWidth: 1,
    justifyContent: 'center',
    minHeight: 58,
  },
  rowText: {
    color: '#15354A',
    fontSize: 19,
    fontWeight: '700',
    textAlign: 'center',
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    maxWidth: 420,
    paddingBottom: 8,
    paddingHorizontal: 20,
    paddingTop: 20,
    width: '100%',
  },
  title: {
    color: '#15354A',
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 12,
    textAlign: 'center',
  },
});

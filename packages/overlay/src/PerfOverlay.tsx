/**
 * PerfOverlay — in-app HUD showing live performance stats.
 */
import React from 'react';
import { View, Text, StyleSheet, Platform, StatusBar } from 'react-native';
import { usePerfStats } from './usePerfStats';

type Position = 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
export interface PerfOverlayProps {
  position?: Position;
  disabled?: boolean;
  insets?: { top: number; bottom: number }; // pass useSafeAreaInsets() from the app
}

export function PerfOverlay({
  position = 'top-right',
  disabled = false,
  insets,
}: PerfOverlayProps): React.JSX.Element | null {
  const stats = usePerfStats(!disabled);
  if (disabled) return null;

  const top = (insets?.top ?? (Platform.OS === 'android' ? StatusBar.currentHeight ?? 24 : 47)) + 8;
  const bottom = (insets?.bottom ?? 34) + 8;
  const place = position.startsWith('top') ? { top } : { bottom };
  const side = position.endsWith('right') ? { right: 8 } : { left: 8 };

  const jsFpsColor = stats.jsFps >= 55 ? '#4ade80' : stats.jsFps >= 30 ? '#facc15' : '#f87171';
  const uiFpsColor = stats.uiFps >= 55 ? '#4ade80' : stats.uiFps >= 30 ? '#facc15' : '#f87171';

  return (
    <View style={[styles.container, place, side]}>
      <View style={styles.row}>
        <Text style={styles.label}>JS </Text>
        <Text style={[styles.value, { color: jsFpsColor }]}>{stats.jsFps}fps</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>UI </Text>
        <Text style={[styles.value, { color: uiFpsColor }]}>{stats.uiFps}fps</Text>
      </View>
      {stats.stallCount > 0 && (
        <View style={styles.row}>
          <Text style={[styles.label, { color: '#f87171' }]}>stalls:{stats.stallCount}</Text>
        </View>
      )}
      {stats.currentRoute ? (
        <View style={styles.row}>
          <Text style={styles.route} numberOfLines={1}>
            {stats.currentRoute}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    backgroundColor: 'rgba(0,0,0,0.75)',
    borderRadius: 8,
    padding: 8,
    minWidth: 90,
    zIndex: 9999,
  },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 2 },
  label: { color: '#94a3b8', fontSize: 11, fontFamily: 'monospace' },
  value: { fontSize: 12, fontWeight: '700', fontFamily: 'monospace' },
  route: { color: '#7dd3fc', fontSize: 10, maxWidth: 100, fontFamily: 'monospace' },
});

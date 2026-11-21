/**
 * PerfOverlay — in-app HUD showing live performance stats.
 */
import React from 'react';
import { View, Text, StyleSheet, type ViewStyle } from 'react-native';
import { usePerfStats } from './usePerfStats';

type Position = 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
interface PerfOverlayProps { position?: Position; disabled?: boolean; }

const positionStyles: Record<Position, ViewStyle> = {
  'top-right': { top: 50, right: 8 },
  'top-left': { top: 50, left: 8 },
  'bottom-right': { bottom: 50, right: 8 },
  'bottom-left': { bottom: 50, left: 8 },
};

export function PerfOverlay({ position = 'top-right', disabled = false }: PerfOverlayProps): React.JSX.Element | null {
  const stats = usePerfStats();
  if (disabled) return null;
  const jsFpsColor = stats.jsFps >= 55 ? '#4ade80' : stats.jsFps >= 30 ? '#facc15' : '#f87171';
  const uiFpsColor = stats.uiFps >= 55 ? '#4ade80' : stats.uiFps >= 30 ? '#facc15' : '#f87171';
  return (
    <View style={[styles.container, positionStyles[position]]}>
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
          <Text style={styles.route} numberOfLines={1}>{stats.currentRoute}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { position: 'absolute', backgroundColor: 'rgba(0,0,0,0.75)', borderRadius: 8, padding: 8, minWidth: 90, zIndex: 9999 },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 2 },
  label: { color: '#94a3b8', fontSize: 11, fontFamily: 'monospace' },
  value: { fontSize: 12, fontWeight: '700', fontFamily: 'monospace' },
  route: { color: '#7dd3fc', fontSize: 10, maxWidth: 100, fontFamily: 'monospace' },
});

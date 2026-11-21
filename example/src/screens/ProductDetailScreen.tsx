/**
 * ProductDetailScreen — planted bugs:
 * 1. ReviewsList mounts during transition animation
 * 2. setState in useLayoutEffect -> cascading update
 * 3. Listener never cleaned up -> memory leak
 */
import React, { useState, useEffect, useLayoutEffect } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { usePerfScreen, PerfTrace } from 'rn-perf-kit';

function ReviewsList({ productId }: { productId: string }) {
  const reviews = Array.from({ length: 50 }, (_, i) => ({
    id: `${productId}-${i}`,
    text: `Review ${i + 1} for product ${productId}. Great product!`,
    rating: Math.ceil(Math.random() * 5),
  }));
  return (
    <View>
      <Text style={styles.sectionTitle}>Reviews ({reviews.length})</Text>
      {reviews.map((r) => (
        <View key={r.id} style={styles.review}>
          <Text>{'★'.repeat(r.rating)}</Text>
          <Text>{r.text}</Text>
        </View>
      ))}
    </View>
  );
}

export default function ProductDetailScreen({ route }: any) {
  const productId = route.params?.id ?? '1';
  const { markReady } = usePerfScreen('ProductDetail');
  const [headerTitle, setHeaderTitle] = useState('');

  // BUG: setState in useLayoutEffect -> cascading synchronous re-render
  useLayoutEffect(() => { setHeaderTitle(`Product ${productId}`); }, [productId]);

  useEffect(() => {
    markReady();
    // BUG: Listener never cleaned up -> memory leak after back navigation
    const listener = () => {};
    (global as any).__jankLabListeners = (global as any).__jankLabListeners ?? [];
    (global as any).__jankLabListeners.push(listener);
    // Missing: return () => removeListener(listener);
  }, [productId, markReady]);

  return (
    <PerfTrace id="ProductDetailScreen">
      <ScrollView style={styles.container}>
        <Text style={styles.title}>{headerTitle || `Product ${productId}`}</Text>
        {/* BUG: Mounts during transition — defer until transitionEnd */}
        <ReviewsList productId={productId} />
      </ScrollView>
    </PerfTrace>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#f8fafc' },
  title: { fontSize: 24, fontWeight: '700', marginBottom: 16 },
  sectionTitle: { fontSize: 18, fontWeight: '600', marginVertical: 12 },
  review: { padding: 12, marginBottom: 8, backgroundColor: '#fff', borderRadius: 8 },
});

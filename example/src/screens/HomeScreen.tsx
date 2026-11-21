/**
 * HomeScreen — planted bugs:
 * 1. ScrollView + .map() instead of FlatList
 * 2. Inline onPress functions defeating React.memo
 */
import React, { useEffect } from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { usePerfScreen, PerfTrace } from 'rn-perf-kit';
import { useNavigation } from '@react-navigation/native';

const FEED_ITEMS = Array.from({ length: 100 }, (_, i) => ({
  id: String(i),
  title: `Product ${i + 1}`,
  price: (Math.random() * 100 + 10).toFixed(2),
}));

// Memoized but receives new inline function each render
const ProductCard = React.memo(function ProductCard({
  item,
  onPress,
}: {
  item: (typeof FEED_ITEMS)[0];
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.card} onPress={onPress}>
      <Text style={styles.title}>{item.title}</Text>
      <Text style={styles.price}>${item.price}</Text>
    </TouchableOpacity>
  );
});

export default function HomeScreen() {
  const { markReady } = usePerfScreen('Home');
  const navigation = useNavigation<any>();

  useEffect(() => {
    const t = setTimeout(() => markReady(), 300);
    return () => clearTimeout(t);
  }, [markReady]);

  return (
    <PerfTrace id="HomeScreen">
      {/* BUG: ScrollView + .map() on 100 items — should be FlatList */}
      <ScrollView style={styles.container}>
        <Text style={styles.header}>JankLab Store</Text>
        {FEED_ITEMS.map((item) => (
          <ProductCard
            key={item.id}
            item={item}
            {/* BUG: new function on every render — defeats React.memo */}
            onPress={() => navigation.navigate('ProductDetail', { id: item.id })}
          />
        ))}
      </ScrollView>
    </PerfTrace>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: { fontSize: 22, fontWeight: '700', padding: 16 },
  card: { margin: 8, padding: 16, backgroundColor: '#fff', borderRadius: 8, elevation: 2 },
  title: { fontSize: 16, fontWeight: '600' },
  price: { fontSize: 14, color: '#64748b', marginTop: 4 },
});

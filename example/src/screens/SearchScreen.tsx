/**
 * SearchScreen — planted bugs:
 * 1. Synchronous filter of 10k items/keystroke -> JS stall
 * 2. startTransition with heavy render -> discarded renders
 */
import React, { useState, useTransition, useDeferredValue } from 'react';
import { View, TextInput, FlatList, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { PerfTrace, useDiscardedRenderTracker } from 'rn-perf-kit';

const ALL_ITEMS = Array.from({ length: 10_000 }, (_, i) => `Item ${i + 1}`);

function SearchResults({ query }: { query: string }) {
  useDiscardedRenderTracker('SearchResults');
  // BUG: Synchronous filter of 10k items on the JS thread
  const results = ALL_ITEMS.filter((item) => item.toLowerCase().includes(query.toLowerCase()));
  return (
    <FlatList
      data={results.slice(0, 50)}
      keyExtractor={(item) => item}
      renderItem={({ item }) => (
        <View style={styles.item}><Text>{item}</Text></View>
      )}
    />
  );
}

export default function SearchScreen() {
  const [input, setInput] = useState('');
  const [isPending, startTransition] = useTransition();
  const deferredQuery = useDeferredValue(input);

  return (
    <PerfTrace id="SearchScreen">
      <View style={styles.container}>
        <TextInput
          style={styles.input}
          placeholder="Search 10,000 items..."
          value={input}
          onChangeText={(text) => { setInput(text); startTransition(() => {}); }}
        />
        {isPending && <ActivityIndicator style={styles.spinner} />}
        <SearchResults query={deferredQuery} />
      </View>
    </PerfTrace>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  input: { margin: 12, padding: 12, borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, fontSize: 16, backgroundColor: '#fff' },
  spinner: { marginVertical: 8 },
  item: { padding: 12, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
});

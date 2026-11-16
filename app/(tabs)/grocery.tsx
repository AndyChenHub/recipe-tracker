import { Tabs } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useColorScheme } from '@/components/useColorScheme';
import { PALETTES } from '@/src/constants/theme';
import { AISLE_ORDER, GroceryItem } from '@/src/domain/types';
import { useAppStore } from '@/src/store/AppContext';

export default function PaprikaGroceryScreen() {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const palette = PALETTES[scheme];

  const {
    groceryItems,
    addManualGroceryItem,
    toggleGroceryChecked,
    clearCheckedGroceryItems,
    clearAllGroceryItems,
  } = useAppStore();

  const [manualText, setManualText] = useState('');
  const [showAddInput, setShowAddInput] = useState(false);

  const sections = useMemo(() => {
    const unchecked = groceryItems.filter((i) => !i.isChecked);
    const checked = groceryItems.filter((i) => i.isChecked);

    const grouped: Array<{ title: string; data: GroceryItem[] }> = [];
    for (const aisle of AISLE_ORDER) {
      const items = unchecked.filter((i) => i.aisle === aisle);
      if (items.length > 0) {
        grouped.push({ title: aisle.toUpperCase(), data: items });
      }
    }
    if (checked.length > 0) {
      grouped.push({ title: `PURCHASED (${checked.length})`, data: checked });
    }
    return grouped;
  }, [groceryItems]);

  const handleManualAdd = () => {
    if (!manualText.trim()) return;
    addManualGroceryItem(manualText);
    setManualText('');
  };

  const hasChecked = groceryItems.some((i) => i.isChecked);

  return (
    <View style={[styles.screen, { backgroundColor: palette.paperBg }]}>
      <Tabs.Screen
        options={{
          title: 'Groceries',
          headerLeft: () =>
            groceryItems.length > 0 ? (
              <Pressable
                onPress={hasChecked ? clearCheckedGroceryItems : clearAllGroceryItems}
                style={styles.headerSideBtn}>
                <Text style={styles.headerBtnText}>
                  {hasChecked ? 'Clear Done' : 'Clear All'}
                </Text>
              </Pressable>
            ) : null,
          headerRight: () => (
            <Pressable
              onPress={() => setShowAddInput((v) => !v)}
              style={styles.headerSideBtn}>
              <Text style={styles.headerPlusText}>＋</Text>
            </Pressable>
          ),
        }}
      />

      {/* Quick Add Strip (Paprika Top Input Bar) */}
      {(showAddInput || groceryItems.length === 0) && (
        <View
          style={[
            styles.addBar,
            { backgroundColor: palette.bandBg, borderBottomColor: palette.hairline },
          ]}>
          <TextInput
            value={manualText}
            onChangeText={setManualText}
            onSubmitEditing={handleManualAdd}
            returnKeyType="done"
            placeholder="Add item to grocery list..."
            placeholderTextColor={palette.textMuted}
            style={[
              styles.addInput,
              { backgroundColor: palette.inputBg, color: palette.text },
            ]}
          />
          <Pressable
            onPress={handleManualAdd}
            style={[styles.addConfirmBtn, { backgroundColor: palette.paprika }]}>
            <Text style={styles.addConfirmText}>Add</Text>
          </Pressable>
        </View>
      )}

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        stickySectionHeadersEnabled
        ItemSeparatorComponent={() => (
          <View style={[styles.rowSeparator, { backgroundColor: palette.hairline }]} />
        )}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Text style={[styles.emptyTitle, { color: palette.text }]}>No Grocery Items</Text>
            <Text style={[styles.emptySub, { color: palette.textSecondary }]}>
              Tap 🛒 Groceries inside any recipe to add scaled ingredients, automatically merged and
              sorted by aisle.
            </Text>
          </View>
        }
        renderSectionHeader={({ section: { title } }) => (
          <View
            style={[
              styles.aisleBanner,
              { backgroundColor: palette.bandBg, borderColor: palette.hairline },
            ]}>
            <Text style={[styles.aisleTitle, { color: palette.paprika }]}>{title}</Text>
          </View>
        )}
        renderItem={({ item }) => {
          const recipeLabels = Array.from(
            new Set(item.sources.map((s) => s.recipeTitle))
          );

          return (
            <Pressable
              onPress={() => toggleGroceryChecked(item.id)}
              style={({ pressed }) => [
                styles.itemRow,
                { backgroundColor: pressed ? palette.bandBg : palette.paperBg },
              ]}>
              <Text
                style={[
                  styles.radioCircle,
                  { color: item.isChecked ? palette.textMuted : palette.paprika },
                ]}>
                {item.isChecked ? '●' : '○'}
              </Text>

              <View style={styles.itemContent}>
                <Text
                  style={[
                    styles.itemLine,
                    { color: item.isChecked ? palette.textMuted : palette.text },
                    item.isChecked && styles.strikethrough,
                  ]}>
                  {item.displayName}
                  {item.formattedAmount && item.formattedAmount !== '1' ? (
                    <Text
                      style={{
                        fontWeight: '700',
                        color: item.isChecked ? palette.textMuted : palette.text,
                      }}>
                      {' '}
                      ({item.formattedAmount})
                    </Text>
                  ) : null}
                </Text>

                {recipeLabels.length > 0 ? (
                  <Text
                    numberOfLines={1}
                    style={[styles.recipeSub, { color: palette.textSecondary }]}>
                    {recipeLabels.join(', ')}
                  </Text>
                ) : null}
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  headerSideBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  headerBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '500',
  },
  headerPlusText: {
    color: '#FFFFFF',
    fontSize: 22,
    lineHeight: 24,
  },
  addBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  addInput: {
    flex: 1,
    height: 36,
    borderRadius: 8,
    paddingHorizontal: 11,
    fontSize: 15,
  },
  addConfirmBtn: {
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 8,
    justifyContent: 'center',
  },
  addConfirmText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
  },
  listContent: {
    paddingBottom: 60,
  },
  aisleBanner: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  aisleTitle: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 11,
    gap: 12,
  },
  rowSeparator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 44,
  },
  radioCircle: {
    fontSize: 18,
    width: 20,
    textAlign: 'center',
  },
  itemContent: {
    flex: 1,
    gap: 2,
  },
  itemLine: {
    fontSize: 16,
  },
  recipeSub: {
    fontSize: 12,
  },
  strikethrough: {
    textDecorationLine: 'line-through',
  },
  emptyWrap: {
    paddingVertical: 64,
    paddingHorizontal: 28,
    alignItems: 'center',
    gap: 8,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '600',
  },
  emptySub: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
});

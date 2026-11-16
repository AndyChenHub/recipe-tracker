import { Tabs, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useColorScheme } from '@/components/useColorScheme';
import { RecipeThumbnail } from '@/src/components/RecipeThumbnail';
import { PALETTES } from '@/src/constants/theme';
import { matchRecipesByTemporaryIngredients } from '@/src/domain/matcher';
import {
  CANONICAL_INGREDIENTS,
  getCanonicalById,
  searchCanonicalIngredients,
} from '@/src/domain/taxonomy';
import { useAppStore } from '@/src/store/AppContext';

const QUICK_FRIDGE_PICKS = [
  'chicken-thigh',
  'shrimp',
  'ground-beef',
  'heavy-cream',
  'spinach',
  'lemon',
  'parmesan',
  'rigatoni',
  'gochujang',
  'cheddar',
];

export default function PaprikaPantryMatchScreen() {
  const router = useRouter();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const palette = PALETTES[scheme];

  const {
    recipes,
    scratchpadIds,
    assumedStapleIds,
    addScratchpadIngredient,
    removeScratchpadIngredient,
    clearScratchpad,
    toggleAssumedStaple,
    addRecipeToGrocery,
  } = useAppStore();

  const [inputText, setInputText] = useState('');
  const [showStaples, setShowStaples] = useState(false);
  const [addedRecipeId, setAddedRecipeId] = useState<string | null>(null);

  const suggestions = useMemo(() => {
    if (!inputText.trim()) return [];
    return searchCanonicalIngredients(inputText, 6).filter(
      (c) => !scratchpadIds.includes(c.id)
    );
  }, [inputText, scratchpadIds]);

  const matches = useMemo(
    () => matchRecipesByTemporaryIngredients(recipes, scratchpadIds, assumedStapleIds),
    [recipes, scratchpadIds, assumedStapleIds]
  );

  const staplesList = useMemo(
    () => CANONICAL_INGREDIENTS.filter((c) => c.isDefaultStaple),
    []
  );

  const handleAdd = () => {
    if (!inputText.trim()) return;
    if (suggestions.length > 0) {
      addScratchpadIngredient(suggestions[0].id);
    } else {
      addScratchpadIngredient(inputText);
    }
    setInputText('');
  };

  return (
    <View style={[styles.screen, { backgroundColor: palette.groupedBg }]}>
      <Tabs.Screen
        options={{
          title: 'What Can I Make?',
          headerRight: () =>
            scratchpadIds.length > 0 ? (
              <Pressable onPress={clearScratchpad} style={styles.headerSideBtn}>
                <Text style={styles.headerBtnText}>Clear</Text>
              </Pressable>
            ) : null,
        }}
      />

      {/* Paprika Top Input Toolbar */}
      <View
        style={[
          styles.inputToolbar,
          { backgroundColor: palette.bandBg, borderBottomColor: palette.hairline },
        ]}>
        <TextInput
          value={inputText}
          onChangeText={setInputText}
          onSubmitEditing={handleAdd}
          returnKeyType="done"
          placeholder="Enter temp fridge/pantry ingredients..."
          placeholderTextColor={palette.textMuted}
          style={[styles.input, { backgroundColor: palette.inputBg, color: palette.text }]}
        />
        <Pressable
          onPress={handleAdd}
          style={[styles.addBtn, { backgroundColor: palette.paprika }]}>
          <Text style={styles.addBtnText}>Add</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scrollBody} keyboardShouldPersistTaps="handled">
        {/* Autocomplete Bar */}
        {suggestions.length > 0 && (
          <View
            style={[
              styles.flatPanel,
              { backgroundColor: palette.paperBg, borderColor: palette.hairline },
            ]}>
            <View style={styles.chipFlow}>
              {suggestions.map((s) => (
                <Pressable
                  key={s.id}
                  onPress={() => {
                    addScratchpadIngredient(s.id);
                    setInputText('');
                  }}
                  style={[styles.tagChip, { backgroundColor: palette.paprikaSoft }]}>
                  <Text style={{ color: palette.paprika, fontSize: 13, fontWeight: '600' }}>
                    ＋ {s.name}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {/* On-Hand Temporary Ingredients Section */}
        <Text style={[styles.groupLabel, { color: palette.textSecondary }]}>
          {scratchpadIds.length > 0
            ? `TEMPORARY INGREDIENTS ON HAND (${scratchpadIds.length})`
            : 'QUICK SELECT INGREDIENTS ON HAND'}
        </Text>
        <View
          style={[
            styles.flatPanel,
            { backgroundColor: palette.paperBg, borderColor: palette.hairline },
          ]}>
          <View style={styles.chipFlow}>
            {scratchpadIds.length > 0
              ? scratchpadIds.map((id) => {
                  const name =
                    getCanonicalById(id)?.name ??
                    id.replace(/^custom-/, '').replace(/-/g, ' ');
                  return (
                    <Pressable
                      key={id}
                      onPress={() => removeScratchpadIngredient(id)}
                      style={[styles.activeTagChip, { backgroundColor: palette.paprika }]}>
                      <Text style={styles.activeTagText}>{name} ✕</Text>
                    </Pressable>
                  );
                })
              : QUICK_FRIDGE_PICKS.map((id) => {
                  const item = getCanonicalById(id);
                  if (!item) return null;
                  return (
                    <Pressable
                      key={id}
                      onPress={() => addScratchpadIngredient(id)}
                      style={[styles.tagChip, { backgroundColor: palette.inputBg }]}>
                      <Text style={{ color: palette.text, fontSize: 13 }}>＋ {item.name}</Text>
                    </Pressable>
                  );
                })}
          </View>

          <Pressable
            onPress={() => setShowStaples((v) => !v)}
            style={[styles.staplesRow, { borderTopColor: palette.hairline }]}>
            <Text style={{ color: palette.textSecondary, fontSize: 13 }}>
              Assumed Kitchen Staples ({assumedStapleIds.length})
            </Text>
            <Text style={{ color: palette.paprika, fontSize: 13, fontWeight: '600' }}>
              {showStaples ? 'Hide' : 'Edit'}
            </Text>
          </Pressable>

          {showStaples && (
            <View style={[styles.chipFlow, { paddingTop: 0 }]}>
              {staplesList.map((st) => {
                const on = assumedStapleIds.includes(st.id);
                return (
                  <Pressable
                    key={st.id}
                    onPress={() => toggleAssumedStaple(st.id)}
                    style={[
                      styles.tagChip,
                      { backgroundColor: on ? palette.paprikaSoft : palette.inputBg },
                    ]}>
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: on ? '600' : '400',
                        color: on ? palette.paprika : palette.textSecondary,
                      }}>
                      {on ? '✓ ' : ''}
                      {st.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>

        {/* Matched Recipes Section (Paprika Flat Rows) */}
        {scratchpadIds.length > 0 && (
          <>
            <Text style={[styles.groupLabel, { color: palette.textSecondary }]}>
              MATCHING RECIPES ({matches.length}) — SORTED BY MOST MATCHED
            </Text>

            {matches.length === 0 ? (
              <View
                style={[
                  styles.flatPanel,
                  { backgroundColor: palette.paperBg, borderColor: palette.hairline, padding: 20 },
                ]}>
                <Text style={{ color: palette.textSecondary, textAlign: 'center', fontSize: 14 }}>
                  No saved recipes use those ingredients yet.
                </Text>
              </View>
            ) : (
              <View
                style={[
                  styles.flatPanel,
                  { backgroundColor: palette.paperBg, borderColor: palette.hairline },
                ]}>
                {matches.map((m, idx) => {
                  const missingCount = m.missingRequiredIngredients.length;
                  const justAdded = addedRecipeId === m.recipe.id;

                  return (
                    <Pressable
                      key={m.recipe.id}
                      onPress={() => router.push(`/recipe/${m.recipe.id}` as never)}
                      style={[
                        styles.matchRow,
                        idx < matches.length - 1 && {
                          borderBottomWidth: StyleSheet.hairlineWidth,
                          borderBottomColor: palette.hairline,
                        },
                      ]}>
                      <RecipeThumbnail
                        imageUrl={m.recipe.imageUrl}
                        title={m.recipe.title}
                        size={56}
                        borderRadius={5}
                      />

                      <View style={styles.matchBody}>
                        <Text numberOfLines={1} style={[styles.matchTitle, { color: palette.text }]}>
                          {m.recipe.title}
                        </Text>

                        <Text style={{ fontSize: 13, color: palette.success, fontWeight: '600' }}>
                          ✓ Matched {m.matchedInputIds.length}/{m.totalEnteredCount}:{' '}
                          {m.matchedInputNames.join(', ')}
                        </Text>

                        {missingCount === 0 ? (
                          <Text style={{ fontSize: 12, color: palette.success }}>
                            Ready to cook now (0 extra items needed)
                          </Text>
                        ) : (
                          <View style={styles.missingActionRow}>
                            <Text
                              numberOfLines={2}
                              style={[styles.missingText, { color: palette.textSecondary }]}>
                              Missing ({missingCount}):{' '}
                              {m.missingRequiredIngredients.map((i) => i.displayName).join(', ')}
                            </Text>
                            <Pressable
                              onPress={(e) => {
                                e.stopPropagation();
                                addRecipeToGrocery(m.recipe, m.recipe.baseServings, {
                                  skipStaples: false,
                                  onlyIngredientIds: m.missingRequiredIngredients.map((i) => i.id),
                                });
                                setAddedRecipeId(m.recipe.id);
                                setTimeout(() => setAddedRecipeId(null), 2000);
                              }}
                              style={[
                                styles.miniGroceryBtn,
                                {
                                  backgroundColor: justAdded
                                    ? palette.success
                                    : palette.paprikaSoft,
                                },
                              ]}>
                              <Text
                                style={{
                                  fontSize: 11,
                                  fontWeight: '700',
                                  color: justAdded ? '#FFFFFF' : palette.paprika,
                                }}>
                                {justAdded ? '✓ Added' : '＋ Groceries'}
                              </Text>
                            </Pressable>
                          </View>
                        )}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </>
        )}
      </ScrollView>
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
  inputToolbar: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  input: {
    flex: 1,
    height: 36,
    borderRadius: 8,
    paddingHorizontal: 11,
    fontSize: 15,
  },
  addBtn: {
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 8,
    justifyContent: 'center',
  },
  addBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  scrollBody: {
    paddingBottom: 60,
  },
  groupLabel: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.4,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 6,
  },
  flatPanel: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  chipFlow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 12,
    gap: 7,
  },
  tagChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  activeTagChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  activeTagText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  staplesRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  matchRow: {
    flexDirection: 'row',
    paddingHorizontal: 14,
    paddingVertical: 11,
    gap: 12,
    alignItems: 'flex-start',
  },
  matchBody: {
    flex: 1,
    gap: 3,
  },
  matchTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  missingActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 2,
  },
  missingText: {
    fontSize: 12,
    flex: 1,
  },
  miniGroceryBtn: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 5,
  },
});

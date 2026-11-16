import { useKeepAwake } from 'expo-keep-awake';
import * as Linking from 'expo-linking';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';

import { useColorScheme } from '@/components/useColorScheme';
import { ActiveCookingBar } from '@/src/components/ActiveCookingBar';
import { RecipeThumbnail } from '@/src/components/RecipeThumbnail';
import { PALETTES } from '@/src/constants/theme';
import { renderStepTokens, scaleIngredient } from '@/src/domain/scaling';
import { UnitSystem } from '@/src/domain/types';
import { useAppStore } from '@/src/store/AppContext';

const UNIT_OPTIONS: Array<{ key: UnitSystem; label: string }> = [
  { key: 'original', label: 'Original' },
  { key: 'metric', label: 'Metric' },
  { key: 'us', label: 'US Imperial' },
];

export default function PaprikaRecipeDetailScreen() {
  // Paprika prevents screen sleep automatically while a recipe is open
  useKeepAwake();

  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isWideSplit = width >= 680;

  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const palette = PALETTES[scheme];

  const {
    recipes,
    getOrCreateSession,
    setSessionServings,
    setSessionUnitSystem,
    toggleCheckedIngredient,
    toggleCompletedStep,
    togglePinRecipe,
    resetCookingSession,
    startTimer,
    addRecipeToGrocery,
    addOrUpdateRecipe,
    deleteRecipe,
    toggleFavorite,
  } = useAppStore();

  const recipe = recipes.find((r) => r.id === id);

  const [scaleModalOpen, setScaleModalOpen] = useState(false);
  const [groceryModalOpen, setGroceryModalOpen] = useState(false);
  const [selectedForGrocery, setSelectedForGrocery] = useState<string[]>([]);
  const [editingNotes, setEditingNotes] = useState(false);
  const [draftNotes, setDraftNotes] = useState(recipe?.notes ?? '');
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  useEffect(() => {
    setEditingNotes(false);
    setDraftNotes(recipe?.notes ?? '');
  }, [recipe?.id, recipe?.notes]);

  if (!recipe) {
    return (
      <View style={[styles.missingWrap, { backgroundColor: palette.paperBg }]}>
        <Text style={{ color: palette.text, fontSize: 16 }}>Recipe not found.</Text>
      </View>
    );
  }

  const session = getOrCreateSession(recipe);
  const scaleRatio = session.targetServings / Math.max(1, recipe.baseServings);
  const scaleLabel =
    session.targetServings === recipe.baseServings
      ? 'Scale'
      : `Scale (${Number(scaleRatio.toFixed(2))}x)`;

  const openGroceryChecklist = () => {
    const preselected = recipe.ingredients
      .filter((i) => i.canonicalIngredientId !== 'water' && i.canonicalIngredientId !== 'salt')
      .map((i) => i.id);
    setSelectedForGrocery(preselected);
    setGroceryModalOpen(true);
  };

  const confirmAddGrocery = () => {
    addRecipeToGrocery(recipe, session.targetServings, {
      skipStaples: false,
      onlyIngredientIds: selectedForGrocery,
    });
    setGroceryModalOpen(false);
    setToastMsg(`Added ${selectedForGrocery.length} items to Groceries`);
    setTimeout(() => setToastMsg(null), 2200);
  };

  const handleSaveNotes = async () => {
    await addOrUpdateRecipe({ ...recipe, notes: draftNotes.trim() || undefined });
    setEditingNotes(false);
  };

  const handleDelete = () => {
    Alert.alert('Delete Recipe', `Delete "${recipe.title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteRecipe(recipe.id);
          router.back();
        },
      },
    ]);
  };

  const ingredientsPane = (
    <View style={isWideSplit ? [styles.splitLeftPane, { borderRightColor: palette.hairline }] : styles.section}>
      <Text style={[styles.paprikaSectionHeader, { color: palette.paprika }]}>INGREDIENTS</Text>
      {recipe.ingredients.map((ing, idx) => {
        const crossed = session.checkedIngredientIds.includes(ing.id);
        const scaled = scaleIngredient(
          ing,
          recipe.baseServings,
          session.targetServings,
          session.unitSystem
        );
        const prevGroup = idx > 0 ? recipe.ingredients[idx - 1].groupName : undefined;
        const showGroup = ing.groupName && ing.groupName !== prevGroup;

        return (
          <View key={ing.id}>
            {showGroup ? (
              <Text style={[styles.ingSubgroup, { color: palette.text }]}>{ing.groupName}</Text>
            ) : null}
            <Pressable
              onPress={() => toggleCheckedIngredient(recipe, ing.id)}
              style={styles.ingLineBtn}>
              <Text
                style={[
                  styles.ingLineText,
                  { color: palette.text, opacity: crossed ? 0.38 : 1 },
                  crossed && styles.strikethrough,
                ]}>
                {scaled.formattedAmount ? (
                  <Text style={styles.ingBoldQty}>{scaled.formattedAmount} </Text>
                ) : null}
                {scaled.formattedAmount
                  ? `${ing.displayName}${ing.preparation ? `, ${ing.preparation}` : ''}${ing.isOptional ? ' (optional)' : ''}`
                  : scaled.formattedLine}
              </Text>
              {scaled.discreteTip && !crossed ? (
                <Text style={[styles.discreteNote, { color: palette.textSecondary }]}>
                  {scaled.discreteTip}
                </Text>
              ) : null}
            </Pressable>
          </View>
        );
      })}
    </View>
  );

  const directionsPane = (
    <View style={isWideSplit ? styles.splitRightPane : styles.section}>
      <Text style={[styles.paprikaSectionHeader, { color: palette.paprika }]}>DIRECTIONS</Text>
      {recipe.steps.map((step) => {
        const completed = session.completedStepNumbers.includes(step.stepNumber);
        const isCurrent = session.activeStepNumber === step.stepNumber && !completed;
        const segments = renderStepTokens(
          step.tokenizedText,
          recipe.ingredients,
          recipe.baseServings,
          session.targetServings,
          session.unitSystem
        );

        return (
          <Pressable
            key={step.id}
            onPress={() => toggleCompletedStep(recipe, step.stepNumber)}
            style={[
              styles.directionBlock,
              isCurrent && {
                backgroundColor: palette.activeStepBg,
                borderLeftColor: palette.paprika,
                borderLeftWidth: 3,
                paddingLeft: 10,
              },
            ]}>
            <Text
              style={[
                styles.directionParagraph,
                { color: palette.text, opacity: completed ? 0.38 : 1 },
                completed && styles.strikethrough,
              ]}>
              <Text style={[styles.stepLeadNum, { color: palette.paprika }]}>
                {step.stepNumber}.{' '}
              </Text>
              {segments.map((seg, sIdx) => {
                if (seg.type === 'text') {
                  return <Text key={sIdx}>{seg.text}</Text>;
                }
                if (seg.type === 'ingredient') {
                  return (
                    <Text key={sIdx} style={styles.inlineScaledBold}>
                      {seg.text}
                    </Text>
                  );
                }
                return (
                  <Text
                    key={sIdx}
                    onPress={(e) => {
                      e.stopPropagation();
                      startTimer(
                        recipe.id,
                        recipe.title,
                        `${seg.label} (Step ${step.stepNumber})`,
                        seg.seconds
                      );
                    }}
                    style={[styles.paprikaTimerLink, { color: palette.timerLink }]}>
                    {seg.label}
                  </Text>
                );
              })}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.screen, { backgroundColor: palette.paperBg }]}>
      <Stack.Screen
        options={{
          title: '',
          headerStyle: { backgroundColor: palette.headerBg },
          headerTintColor: palette.headerText,
          headerRight: () => (
            <View style={styles.headerIcons}>
              <Pressable onPress={() => toggleFavorite(recipe.id)} hitSlop={8}>
                <Text style={styles.headerIconText}>{recipe.isFavorite ? '♥' : '♡'}</Text>
              </Pressable>
              <Pressable onPress={handleDelete} hitSlop={8}>
                <Text style={styles.headerIconText}>🗑</Text>
              </Pressable>
            </View>
          ),
        }}
      />

      {toastMsg ? (
        <View style={[styles.toastBanner, { backgroundColor: palette.success }]}>
          <Text style={styles.toastText}>✓ {toastMsg}</Text>
        </View>
      ) : null}

      <ScrollView contentContainerStyle={styles.scrollBody}>
        {/* Paprika Top Recipe Card Header */}
        <View style={styles.topCard}>
          <Text style={[styles.recipeTitle, { color: palette.text }]}>{recipe.title}</Text>
          {recipe.categories.length > 0 && (
            <Text style={[styles.categoryLine, { color: palette.textSecondary }]}>
              {recipe.categories.join(' • ')}
            </Text>
          )}

          <View style={styles.metaGridRow}>
            <RecipeThumbnail
              imageUrl={recipe.imageUrl}
              title={recipe.title}
              size={92}
              borderRadius={6}
            />

            <View style={styles.metaKeyValues}>
              <View style={styles.ratingStarsRow}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <Pressable
                    key={star}
                    hitSlop={4}
                    onPress={() => addOrUpdateRecipe({ ...recipe, rating: star })}>
                    <Text
                      style={{
                        fontSize: 17,
                        color: (recipe.rating ?? 0) >= star ? palette.star : palette.hairline,
                      }}>
                      ★
                    </Text>
                  </Pressable>
                ))}
              </View>

              {(recipe.prepMinutes || recipe.cookMinutes) && (
                <Text style={[styles.metaLine, { color: palette.textSecondary }]}>
                  {recipe.prepMinutes ? `Prep: ${recipe.prepMinutes} mins` : ''}
                  {recipe.prepMinutes && recipe.cookMinutes ? '  •  ' : ''}
                  {recipe.cookMinutes ? `Cook: ${recipe.cookMinutes} mins` : ''}
                </Text>
              )}

              <Pressable onPress={() => setScaleModalOpen(true)}>
                <Text style={[styles.metaLine, { color: palette.textSecondary }]}>
                  Servings:{' '}
                  <Text style={{ color: palette.paprika, fontWeight: '600' }}>
                    {session.targetServings} servings
                    {session.unitSystem !== 'original' ? ` (${session.unitSystem.toUpperCase()})` : ''}
                  </Text>
                </Text>
              </Pressable>

              {recipe.sourceUrl ? (
                <Pressable onPress={() => Linking.openURL(recipe.sourceUrl!)}>
                  <Text numberOfLines={1} style={[styles.metaLine, { color: palette.paprika }]}>
                    Source: {recipe.sourceAuthor || recipe.sourcePlatform} ↗
                  </Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        </View>

        {/* Paprika Flat Action Toolbar */}
        <View
          style={[
            styles.actionToolbar,
            { backgroundColor: palette.bandBg, borderColor: palette.hairline },
          ]}>
          <Pressable onPress={openGroceryChecklist} style={styles.toolbarBtn}>
            <Text style={[styles.toolbarBtnText, { color: palette.paprika }]}>🛒 Groceries</Text>
          </Pressable>

          <Pressable onPress={() => setScaleModalOpen(true)} style={styles.toolbarBtn}>
            <Text style={[styles.toolbarBtnText, { color: palette.paprika }]}>⚖ {scaleLabel}</Text>
          </Pressable>

          <Pressable onPress={() => togglePinRecipe(recipe)} style={styles.toolbarBtn}>
            <Text
              style={[
                styles.toolbarBtnText,
                { color: session.isPinned ? palette.success : palette.paprika },
              ]}>
              📌 {session.isPinned ? 'Pinned' : 'Pin'}
            </Text>
          </Pressable>

          <Pressable onPress={() => resetCookingSession(recipe)} style={styles.toolbarBtn}>
            <Text style={[styles.toolbarBtnText, { color: palette.textSecondary }]}>↺ Reset</Text>
          </Pressable>
        </View>

        {/* Description if present */}
        {recipe.description ? (
          <View style={[styles.descWrap, { borderBottomColor: palette.hairline }]}>
            <Text style={[styles.descText, { color: palette.textSecondary }]}>
              {recipe.description}
            </Text>
          </View>
        ) : null}

        {/* Ingredients + Directions (Side-by-side on wide screens, stacked on iPhone portrait) */}
        {isWideSplit ? (
          <View style={styles.splitRow}>
            {ingredientsPane}
            {directionsPane}
          </View>
        ) : (
          <>
            {ingredientsPane}
            <View style={[styles.sectionDivider, { backgroundColor: palette.hairline }]} />
            {directionsPane}
          </>
        )}

        <View style={[styles.sectionDivider, { backgroundColor: palette.hairline }]} />

        {/* Notes Section */}
        <View style={styles.section}>
          <View style={styles.notesHeaderRow}>
            <Text style={[styles.paprikaSectionHeader, { color: palette.paprika, marginBottom: 0 }]}>
              NOTES
            </Text>
            <Pressable
              onPress={() => {
                if (editingNotes) {
                  handleSaveNotes();
                } else {
                  setDraftNotes(recipe.notes ?? '');
                  setEditingNotes(true);
                }
              }}>
              <Text style={{ color: palette.paprika, fontWeight: '600', fontSize: 14 }}>
                {editingNotes ? 'Save' : 'Edit'}
              </Text>
            </Pressable>
          </View>

          {editingNotes ? (
            <TextInput
              multiline
              value={draftNotes}
              onChangeText={setDraftNotes}
              placeholder="Add personal cooking notes..."
              placeholderTextColor={palette.textMuted}
              style={[
                styles.notesEditor,
                {
                  color: palette.text,
                  backgroundColor: palette.bandBg,
                  borderColor: palette.hairline,
                },
              ]}
            />
          ) : (
            <Text style={[styles.notesContent, { color: palette.textSecondary }]}>
              {recipe.notes || 'Tap Edit to record tweaks, substitutions, or cooking times.'}
            </Text>
          )}
        </View>
      </ScrollView>

      <ActiveCookingBar withBottomInset />

      {/* Paprika "Scale & Convert" Popover Modal */}
      <Modal
        visible={scaleModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setScaleModalOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setScaleModalOpen(false)}>
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={[
              styles.popoverCard,
              { backgroundColor: palette.paperBg, borderColor: palette.hairline },
            ]}>
            <View style={[styles.popoverHeader, { borderBottomColor: palette.hairline }]}>
              <Text style={[styles.popoverTitle, { color: palette.text }]}>
                Scale & Convert Ingredients
              </Text>
              <Pressable onPress={() => setScaleModalOpen(false)}>
                <Text style={{ color: palette.paprika, fontWeight: '600', fontSize: 15 }}>Done</Text>
              </Pressable>
            </View>

            <View style={styles.popoverBody}>
              <Text style={[styles.popoverLabel, { color: palette.textSecondary }]}>
                EXACT SERVINGS (BASE: {recipe.baseServings})
              </Text>
              <View style={styles.stepperBar}>
                <Pressable
                  onPress={() => setSessionServings(recipe, session.targetServings - 1)}
                  style={[styles.stepperCircle, { backgroundColor: palette.inputBg }]}>
                  <Text style={[styles.stepperSymbol, { color: palette.text }]}>−</Text>
                </Pressable>
                <Text style={[styles.stepperNumber, { color: palette.paprika }]}>
                  {session.targetServings} servings
                </Text>
                <Pressable
                  onPress={() => setSessionServings(recipe, session.targetServings + 1)}
                  style={[styles.stepperCircle, { backgroundColor: palette.inputBg }]}>
                  <Text style={[styles.stepperSymbol, { color: palette.text }]}>＋</Text>
                </Pressable>
              </View>

              <Text style={[styles.popoverLabel, { color: palette.textSecondary }]}>
                QUICK SCALE
              </Text>
              <View style={styles.quickScaleBar}>
                {[0.5, 1, 1.5, 2, 3].map((mult) => {
                  const target = Math.max(1, Math.round(recipe.baseServings * mult));
                  const active = session.targetServings === target;
                  return (
                    <Pressable
                      key={mult}
                      onPress={() => setSessionServings(recipe, target)}
                      style={[
                        styles.quickScaleBtn,
                        {
                          backgroundColor: active ? palette.paprika : palette.inputBg,
                        },
                      ]}>
                      <Text
                        style={{
                          color: active ? '#FFFFFF' : palette.text,
                          fontWeight: '600',
                          fontSize: 14,
                        }}>
                        {mult === 0.5 ? '½x' : `${mult}x`}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={[styles.popoverLabel, { color: palette.textSecondary }]}>
                UNIT SYSTEM
              </Text>
              <View style={[styles.unitBar, { backgroundColor: palette.inputBg }]}>
                {UNIT_OPTIONS.map((opt) => {
                  const active = session.unitSystem === opt.key;
                  return (
                    <Pressable
                      key={opt.key}
                      onPress={() => setSessionUnitSystem(recipe, opt.key)}
                      style={[
                        styles.unitSegBtn,
                        active && { backgroundColor: palette.paperBg },
                      ]}>
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: active ? '600' : '400',
                          color: active ? palette.paprika : palette.textSecondary,
                        }}>
                        {opt.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Paprika "Add to Grocery List" Pre-Checked Ingredient Sheet */}
      <Modal
        visible={groceryModalOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setGroceryModalOpen(false)}>
        <View style={[styles.screen, { backgroundColor: palette.paperBg }]}>
          <View style={[styles.sheetTopBar, { backgroundColor: palette.headerBg }]}>
            <Pressable onPress={() => setGroceryModalOpen(false)}>
              <Text style={styles.sheetTopAction}>Cancel</Text>
            </Pressable>
            <Text style={styles.sheetTopTitle}>Add to Groceries ({session.targetServings} serv)</Text>
            <Pressable onPress={confirmAddGrocery}>
              <Text style={[styles.sheetTopAction, { fontWeight: '700' }]}>Add</Text>
            </Pressable>
          </View>

          <ScrollView>
            {recipe.ingredients.map((ing) => {
              const checked = selectedForGrocery.includes(ing.id);
              const scaled = scaleIngredient(
                ing,
                recipe.baseServings,
                session.targetServings,
                session.unitSystem
              );
              return (
                <Pressable
                  key={ing.id}
                  onPress={() =>
                    setSelectedForGrocery((prev) =>
                      prev.includes(ing.id) ? prev.filter((x) => x !== ing.id) : [...prev, ing.id]
                    )
                  }
                  style={[styles.groceryPickRow, { borderBottomColor: palette.hairline }]}>
                  <Text
                    style={{
                      fontSize: 19,
                      color: checked ? palette.paprika : palette.textMuted,
                    }}>
                    {checked ? '●' : '○'}
                  </Text>
                  <Text style={[styles.groceryPickText, { color: palette.text }]}>
                    {scaled.formattedLine}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  missingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  headerIconText: {
    color: '#FFFFFF',
    fontSize: 19,
  },
  toastBanner: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  toastText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  scrollBody: {
    paddingBottom: 56,
  },
  topCard: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 14,
    gap: 6,
  },
  recipeTitle: {
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 27,
  },
  categoryLine: {
    fontSize: 13,
  },
  metaGridRow: {
    flexDirection: 'row',
    gap: 14,
    marginTop: 6,
    alignItems: 'center',
  },
  metaKeyValues: {
    flex: 1,
    gap: 4,
  },
  ratingStarsRow: {
    flexDirection: 'row',
    gap: 3,
    marginBottom: 2,
  },
  metaLine: {
    fontSize: 13,
    lineHeight: 18,
  },
  actionToolbar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  toolbarBtn: {
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  toolbarBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
  descWrap: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  descText: {
    fontSize: 14,
    lineHeight: 20,
    fontStyle: 'italic',
  },
  splitRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  splitLeftPane: {
    width: '38%',
    padding: 16,
    borderRightWidth: StyleSheet.hairlineWidth,
  },
  splitRightPane: {
    width: '62%',
    padding: 16,
  },
  section: {
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  sectionDivider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 16,
  },
  paprikaSectionHeader: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.7,
    marginBottom: 10,
  },
  ingSubgroup: {
    fontSize: 14,
    fontWeight: '700',
    marginTop: 10,
    marginBottom: 4,
  },
  ingLineBtn: {
    paddingVertical: 7,
  },
  ingLineText: {
    fontSize: 16,
    lineHeight: 22,
  },
  ingBoldQty: {
    fontWeight: '700',
  },
  discreteNote: {
    fontSize: 12,
    marginTop: 2,
  },
  strikethrough: {
    textDecorationLine: 'line-through',
  },
  directionBlock: {
    paddingVertical: 9,
    borderRadius: 4,
  },
  directionParagraph: {
    fontSize: 16,
    lineHeight: 25,
  },
  stepLeadNum: {
    fontWeight: '700',
  },
  inlineScaledBold: {
    fontWeight: '700',
  },
  paprikaTimerLink: {
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  notesHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  notesEditor: {
    minHeight: 80,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 6,
    padding: 10,
    fontSize: 15,
    textAlignVertical: 'top',
  },
  notesContent: {
    fontSize: 15,
    lineHeight: 21,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  popoverCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  popoverHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  popoverTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  popoverBody: {
    padding: 16,
    gap: 12,
  },
  popoverLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  stepperBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stepperCircle: {
    width: 40,
    height: 40,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperSymbol: {
    fontSize: 20,
    fontWeight: '600',
  },
  stepperNumber: {
    fontSize: 18,
    fontWeight: '700',
  },
  quickScaleBar: {
    flexDirection: 'row',
    gap: 8,
  },
  quickScaleBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 7,
    alignItems: 'center',
  },
  unitBar: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: 8,
  },
  unitSegBtn: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 6,
    alignItems: 'center',
  },
  sheetTopBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  sheetTopTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  sheetTopAction: {
    color: '#FFFFFF',
    fontSize: 16,
  },
  groceryPickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  groceryPickText: {
    fontSize: 16,
    flex: 1,
  },
});

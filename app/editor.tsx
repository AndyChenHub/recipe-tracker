import * as ImagePicker from 'expo-image-picker';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
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
import { linkIngredientsInStepText } from '@/src/domain/importer';
import { parseIngredientLine } from '@/src/domain/taxonomy';
import { Recipe, RecipeIngredient, RecipeStep } from '@/src/domain/types';
import { scanRecipeFromImageBase64 } from '@/src/services/cloudSync';
import { useAppStore } from '@/src/store/AppContext';

const PRESET_CATEGORIES = [
  'Dinner',
  'Quick <30m',
  'Pasta',
  'High Protein',
  'Social Saves',
  'Baking',
  'Breakfast',
  'Scanned',
];

export default function PaprikaRecipeEditorScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    id?: string;
    prefill?: string;
    scan?: 'camera' | 'library';
  }>();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const palette = PALETTES[scheme];

  const { recipes, addOrUpdateRecipe, cloudSettings } = useAppStore();

  const existingRecipe = useMemo(() => {
    if (params.id) {
      return recipes.find((r) => r.id === params.id);
    }
    if (params.prefill) {
      try {
        return JSON.parse(params.prefill) as Recipe;
      } catch {
        return undefined;
      }
    }
    return undefined;
  }, [params.id, params.prefill, recipes]);

  const [title, setTitle] = useState(existingRecipe?.title ?? '');
  const [description, setDescription] = useState(existingRecipe?.description ?? '');
  const [baseServings, setBaseServings] = useState(existingRecipe?.baseServings ?? 4);
  const [prepMinutes, setPrepMinutes] = useState(
    existingRecipe?.prepMinutes ? String(existingRecipe.prepMinutes) : ''
  );
  const [cookMinutes, setCookMinutes] = useState(
    existingRecipe?.cookMinutes ? String(existingRecipe.cookMinutes) : ''
  );
  const [rating, setRating] = useState<number>(existingRecipe?.rating ?? 5);
  const [categories, setCategories] = useState<string[]>(
    existingRecipe?.categories?.length ? existingRecipe.categories : ['Dinner']
  );
  const [customCategory, setCustomCategory] = useState('');
  const [imageUrl, setImageUrl] = useState(existingRecipe?.imageUrl ?? '');
  const [sourceUrl, setSourceUrl] = useState(existingRecipe?.sourceUrl ?? '');
  const [sourceAuthor, setSourceAuthor] = useState(existingRecipe?.sourceAuthor ?? '');
  const [notes, setNotes] = useState(existingRecipe?.notes ?? '');

  const [ingredientsText, setIngredientsText] = useState(() =>
    existingRecipe?.ingredients?.length
      ? existingRecipe.ingredients.map((i) => i.rawText).join('\n')
      : ''
  );
  const [stepsText, setStepsText] = useState(() =>
    existingRecipe?.steps?.length
      ? existingRecipe.steps.map((s) => s.rawText).join('\n\n')
      : ''
  );

  const [scanning, setScanning] = useState(false);
  const [scanBanner, setScanBanner] = useState<string | null>(
    params.prefill
      ? 'Video metadata loaded — add or scan ingredients & steps below to finish saving.'
      : null
  );
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  useEffect(() => {
    if (params.scan === 'camera') {
      handleScanPage('camera');
    } else if (params.scan === 'library') {
      handleScanPage('library');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.scan]);

  const parsedIngredientCount = useMemo(() => {
    return ingredientsText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean).length;
  }, [ingredientsText]);

  const parsedStepCount = useMemo(() => {
    return stepsText
      .split(/\r?\n+/)
      .map((l) => l.trim())
      .filter(Boolean).length;
  }, [stepsText]);

  const toggleCategory = (cat: string) => {
    setCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  };

  const handleAddCustomCategory = () => {
    const clean = customCategory.trim();
    if (!clean) return;
    if (!categories.includes(clean)) {
      setCategories((prev) => [...prev, clean]);
    }
    setCustomCategory('');
  };

  const handlePickCoverPhotoOnly = async () => {
    Keyboard.dismiss();
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission Required', 'Allow photo library access to pick a recipe photo.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
    });
    if (!res.canceled && res.assets[0]?.uri) {
      setImageUrl(res.assets[0].uri);
    }
  };

  const handleScanPage = async (source: 'camera' | 'library') => {
    Keyboard.dismiss();
    setScanBanner(null);

    try {
      if (source === 'camera') {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          Alert.alert('Camera Permission', 'Allow camera access to scan cookbook pages.');
          return;
        }
      } else {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) {
          Alert.alert('Photo Permission', 'Allow photo access to scan recipe screenshots.');
          return;
        }
      }

      const pickerResult =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync({
              mediaTypes: ['images'],
              quality: 0.65,
              base64: true,
            })
          : await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ['images'],
              quality: 0.65,
              base64: true,
            });

      if (pickerResult.canceled || !pickerResult.assets[0]) {
        return;
      }

      const asset = pickerResult.assets[0];
      if (asset.uri && !imageUrl) {
        setImageUrl(asset.uri);
      }

      if (!asset.base64) {
        Alert.alert('Scan Error', 'Could not read image data from the selected photo.');
        return;
      }

      setScanning(true);
      const { recipe: scanned, methodUsed } = await scanRecipeFromImageBase64(
        asset.base64,
        asset.mimeType || 'image/jpeg',
        cloudSettings,
        asset.uri
      );

      if (scanned.title && scanned.title !== 'Imported Social Recipe') {
        setTitle((prev) => prev.trim() || scanned.title);
      }
      if (scanned.ingredients.length > 0) {
        const nextIngLines = scanned.ingredients.map((i) => i.rawText).join('\n');
        setIngredientsText((prev) => (prev.trim() ? `${prev.trim()}\n${nextIngLines}` : nextIngLines));
      }
      if (scanned.steps.length > 0) {
        const nextStepLines = scanned.steps.map((s) => s.rawText).join('\n\n');
        setStepsText((prev) => (prev.trim() ? `${prev.trim()}\n\n${nextStepLines}` : nextStepLines));
      }
      if (!categories.includes('Scanned')) {
        setCategories((prev) => [...prev, 'Scanned']);
      }
      setScanBanner(
        `✓ Scanned via ${methodUsed} (${scanned.ingredients.length} ingredients, ${scanned.steps.length} steps)`
      );
    } catch (err) {
      Alert.alert(
        'Page Scan Notice',
        err instanceof Error ? err.message : 'Could not extract text from this photo.'
      );
    } finally {
      setScanning(false);
    }
  };

  const handleClose = () => {
    Keyboard.dismiss();
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)');
    }
  };

  const handleSave = async () => {
    Keyboard.dismiss();
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      Alert.alert('Missing Title', 'Please enter a recipe title before saving.');
      return;
    }

    const rawIngLines = ingredientsText
      .split(/\r?\n/)
      .map((l) => l.replace(/^[\s•\-*]+/, '').trim())
      .filter(Boolean);

    const rawStepLines = stepsText
      .split(/\r?\n+/)
      .map((l) => l.replace(/^(?:step\s*)?\d+[.):]\s*/i, '').trim())
      .filter(Boolean);

    const ingredients: RecipeIngredient[] = rawIngLines.map((line, idx) =>
      parseIngredientLine(line, idx)
    );

    const steps: RecipeStep[] = rawStepLines.map((line, idx) => ({
      id: `step-${idx + 1}-${Date.now().toString(36)}`,
      stepNumber: idx + 1,
      rawText: line,
      tokenizedText: linkIngredientsInStepText(line, ingredients),
    }));

    const now = new Date().toISOString();
    const prepNum = Number(prepMinutes);
    const cookNum = Number(cookMinutes);

    const finalRecipe: Recipe = {
      id:
        existingRecipe?.id && params.id
          ? existingRecipe.id
          : `rec-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      title: cleanTitle,
      description: description.trim() || undefined,
      baseServings: Math.max(1, baseServings),
      prepMinutes: prepNum > 0 ? prepNum : undefined,
      cookMinutes: cookNum > 0 ? cookNum : undefined,
      imageUrl: imageUrl.trim() || undefined,
      sourceUrl: sourceUrl.trim() || undefined,
      sourcePlatform: existingRecipe?.sourcePlatform ?? 'manual',
      sourceAuthor: sourceAuthor.trim() || undefined,
      categories: categories.length > 0 ? categories : ['Dinner'],
      rating,
      notes: notes.trim() || undefined,
      isFavorite: existingRecipe?.isFavorite ?? false,
      ingredients,
      steps,
      createdAt: existingRecipe?.createdAt ?? now,
      updatedAt: now,
    };

    await addOrUpdateRecipe(finalRecipe);
    router.replace(`/recipe/${finalRecipe.id}` as never);
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.screen, { backgroundColor: palette.groupedBg }]}>
      <Stack.Screen
        options={{
          title: params.id ? 'Edit Recipe' : 'New Recipe',
          headerStyle: { backgroundColor: palette.headerBg },
          headerTintColor: palette.headerText,
          headerLeft: () => (
            <Pressable onPress={handleClose} style={styles.headerBtn} hitSlop={10}>
              <Text style={styles.headerBtnText}>Cancel</Text>
            </Pressable>
          ),
          headerRight: () => (
            <View style={styles.headerRightRow}>
              {keyboardVisible && (
                <Pressable
                  onPress={() => Keyboard.dismiss()}
                  style={styles.headerBtn}
                  hitSlop={8}>
                  <Text style={styles.headerBtnText}>Done</Text>
                </Pressable>
              )}
              <Pressable onPress={handleSave} style={styles.headerBtn} hitSlop={10}>
                <Text style={[styles.headerBtnText, { fontWeight: '700' }]}>Save</Text>
              </Pressable>
            </View>
          ),
        }}
      />

      <ScrollView
        contentContainerStyle={styles.scrollBody}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled">
        {/* Cookbook Page & Screenshot Scanner Strip */}
        <Text style={[styles.groupTitle, { color: palette.textSecondary }]}>
          SCAN COOKBOOK PAGE OR SCREENSHOT
        </Text>
        <View
          style={[
            styles.groupBox,
            { backgroundColor: palette.paperBg, borderColor: palette.hairline },
          ]}>
          <View style={styles.scanRow}>
            <Pressable
              disabled={scanning}
              onPress={() => handleScanPage('camera')}
              style={[styles.scanBtn, { backgroundColor: palette.paprika }]}>
              <Text style={styles.scanBtnPrimaryText}>📷 Camera Scan Page</Text>
            </Pressable>
            <Pressable
              disabled={scanning}
              onPress={() => handleScanPage('library')}
              style={[styles.scanBtn, { backgroundColor: palette.paprikaSoft }]}>
              <Text style={[styles.scanBtnSecondaryText, { color: palette.paprika }]}>
                🖼 Scan Photo / Screenshot
              </Text>
            </Pressable>
          </View>

          {scanning && (
            <View style={styles.scanningRow}>
              <ActivityIndicator color={palette.paprika} size="small" />
              <Text style={{ color: palette.textSecondary, fontSize: 13 }}>
                Reading ingredients & steps from page photo...
              </Text>
            </View>
          )}

          {scanBanner ? (
            <Text style={[styles.scanBannerText, { color: palette.success }]}>{scanBanner}</Text>
          ) : null}
        </View>

        {/* Core Recipe Info */}
        <Text style={[styles.groupTitle, { color: palette.textSecondary }]}>RECIPE DETAILS</Text>
        <View
          style={[
            styles.groupBox,
            { backgroundColor: palette.paperBg, borderColor: palette.hairline },
          ]}>
          <View style={[styles.fieldRow, { borderBottomColor: palette.hairline }]}>
            <Text style={[styles.fieldLabel, { color: palette.text }]}>Title</Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="e.g. Grandma's Lemon Garlic Chicken"
              placeholderTextColor={palette.textMuted}
              style={[styles.fieldInput, { color: palette.text }]}
            />
          </View>

          <View style={[styles.fieldRow, { borderBottomColor: palette.hairline }]}>
            <Text style={[styles.fieldLabel, { color: palette.text }]}>Servings</Text>
            <View style={styles.stepperWrap}>
              <Pressable
                onPress={() => setBaseServings((s) => Math.max(1, s - 1))}
                style={[styles.stepBtn, { backgroundColor: palette.inputBg }]}>
                <Text style={[styles.stepBtnText, { color: palette.text }]}>−</Text>
              </Pressable>
              <Text style={[styles.servingsNum, { color: palette.paprika }]}>{baseServings}</Text>
              <Pressable
                onPress={() => setBaseServings((s) => Math.min(48, s + 1))}
                style={[styles.stepBtn, { backgroundColor: palette.inputBg }]}>
                <Text style={[styles.stepBtnText, { color: palette.text }]}>＋</Text>
              </Pressable>
            </View>
          </View>

          <View style={[styles.fieldRow, { borderBottomColor: palette.hairline }]}>
            <Text style={[styles.fieldLabel, { color: palette.text }]}>Prep / Cook (mins)</Text>
            <View style={styles.DualTimeRow}>
              <TextInput
                keyboardType="number-pad"
                value={prepMinutes}
                onChangeText={setPrepMinutes}
                placeholder="Prep (10)"
                placeholderTextColor={palette.textMuted}
                style={[
                  styles.smallNumberInput,
                  { color: palette.text, backgroundColor: palette.inputBg },
                ]}
              />
              <TextInput
                keyboardType="number-pad"
                value={cookMinutes}
                onChangeText={setCookMinutes}
                placeholder="Cook (20)"
                placeholderTextColor={palette.textMuted}
                style={[
                  styles.smallNumberInput,
                  { color: palette.text, backgroundColor: palette.inputBg },
                ]}
              />
            </View>
          </View>

          <View style={[styles.fieldRow, { borderBottomColor: palette.hairline }]}>
            <Text style={[styles.fieldLabel, { color: palette.text }]}>Rating</Text>
            <View style={styles.starsRow}>
              {[1, 2, 3, 4, 5].map((s) => (
                <Pressable key={s} onPress={() => setRating(s)} hitSlop={6}>
                  <Text
                    style={{
                      fontSize: 20,
                      color: rating >= s ? palette.star : palette.hairline,
                    }}>
                    ★
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={styles.photoRow}>
            <RecipeThumbnail imageUrl={imageUrl} title={title || 'Recipe'} size={52} borderRadius={6} />
            <View style={{ flex: 1, gap: 6 }}>
              <TextInput
                value={imageUrl}
                onChangeText={setImageUrl}
                autoCapitalize="none"
                placeholder="Cover photo URL or pick from library..."
                placeholderTextColor={palette.textMuted}
                style={[styles.urlInput, { color: palette.text, backgroundColor: palette.inputBg }]}
              />
              <Pressable onPress={handlePickCoverPhotoOnly}>
                <Text style={{ color: palette.paprika, fontSize: 13, fontWeight: '600' }}>
                  📸 Choose Cover Photo from Library
                </Text>
              </Pressable>
            </View>
          </View>
        </View>

        {/* Categories */}
        <Text style={[styles.groupTitle, { color: palette.textSecondary }]}>CATEGORIES</Text>
        <View
          style={[
            styles.groupBox,
            { backgroundColor: palette.paperBg, borderColor: palette.hairline, padding: 12, gap: 10 },
          ]}>
          <View style={styles.chipWrap}>
            {Array.from(new Set([...PRESET_CATEGORIES, ...categories])).map((cat) => {
              const active = categories.includes(cat);
              return (
                <Pressable
                  key={cat}
                  onPress={() => toggleCategory(cat)}
                  style={[
                    styles.catChip,
                    { backgroundColor: active ? palette.paprika : palette.inputBg },
                  ]}>
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: '600',
                      color: active ? '#FFFFFF' : palette.text,
                    }}>
                    {active ? '✓ ' : ''}
                    {cat}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.customCatRow}>
            <TextInput
              value={customCategory}
              onChangeText={setCustomCategory}
              onSubmitEditing={handleAddCustomCategory}
              returnKeyType="done"
              placeholder="Add custom category..."
              placeholderTextColor={palette.textMuted}
              style={[styles.urlInput, { flex: 1, color: palette.text, backgroundColor: palette.inputBg }]}
            />
            <Pressable
              onPress={handleAddCustomCategory}
              style={[styles.smallAddBtn, { backgroundColor: palette.paprikaSoft }]}>
              <Text style={{ color: palette.paprika, fontWeight: '600', fontSize: 13 }}>＋ Add</Text>
            </Pressable>
          </View>
        </View>

        {/* Scalable Ingredients */}
        <Text style={[styles.groupTitle, { color: palette.textSecondary }]}>
          INGREDIENTS — ONE PER LINE ({parsedIngredientCount} ITEMS · AUTO-SCALABLE)
        </Text>
        <View
          style={[
            styles.groupBox,
            { backgroundColor: palette.paperBg, borderColor: palette.hairline },
          ]}>
          <TextInput
            multiline
            value={ingredientsText}
            onChangeText={setIngredientsText}
            placeholder={
              '1.5 lbs chicken thighs\n2 tbsp butter\n4 cloves garlic, minced\n1 cup heavy cream\n1/2 cup parmesan cheese'
            }
            placeholderTextColor={palette.textMuted}
            style={[styles.multilineBox, { color: palette.text }]}
          />
        </View>

        {/* Interactive Directions */}
        <Text style={[styles.groupTitle, { color: palette.textSecondary }]}>
          DIRECTIONS — ONE STEP PER LINE ({parsedStepCount} STEPS · TIMERS AUTO-DETECTED)
        </Text>
        <View
          style={[
            styles.groupBox,
            { backgroundColor: palette.paperBg, borderColor: palette.hairline },
          ]}>
          <TextInput
            multiline
            value={stepsText}
            onChangeText={setStepsText}
            placeholder={
              '1. Sear chicken thighs in butter for 5 minutes per side.\n2. Add garlic, heavy cream, and parmesan and simmer for 3 minutes.'
            }
            placeholderTextColor={palette.textMuted}
            style={[styles.multilineBox, { color: palette.text, minHeight: 150 }]}
          />
        </View>

        {/* Source & Notes */}
        <Text style={[styles.groupTitle, { color: palette.textSecondary }]}>
          NOTES & SOURCE (OPTIONAL)
        </Text>
        <View
          style={[
            styles.groupBox,
            { backgroundColor: palette.paperBg, borderColor: palette.hairline },
          ]}>
          <View style={[styles.fieldRow, { borderBottomColor: palette.hairline }]}>
            <Text style={[styles.fieldLabel, { color: palette.text }]}>Source / Creator</Text>
            <TextInput
              value={sourceAuthor}
              onChangeText={setSourceAuthor}
              placeholder="e.g. Mom's Cookbook or @creator"
              placeholderTextColor={palette.textMuted}
              style={[styles.fieldInput, { color: palette.text }]}
            />
          </View>
          <View style={[styles.fieldRow, { borderBottomColor: palette.hairline }]}>
            <Text style={[styles.fieldLabel, { color: palette.text }]}>Source URL</Text>
            <TextInput
              value={sourceUrl}
              onChangeText={setSourceUrl}
              autoCapitalize="none"
              placeholder="https://..."
              placeholderTextColor={palette.textMuted}
              style={[styles.fieldInput, { color: palette.text }]}
            />
          </View>
          <TextInput
            multiline
            value={notes}
            onChangeText={setNotes}
            placeholder="Personal cooking notes, air-fryer temps, or substitutions..."
            placeholderTextColor={palette.textMuted}
            style={[styles.multilineBox, { color: palette.text, minHeight: 80 }]}
          />
        </View>

        <View style={styles.bottomBtnWrap}>
          <Pressable
            onPress={handleSave}
            style={[styles.savePrimaryBtn, { backgroundColor: palette.paprika }]}>
            <Text style={styles.savePrimaryBtnText}>Save Recipe to Cookbook</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  headerBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  headerBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
  },
  headerRightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  scrollBody: {
    paddingBottom: 60,
  },
  groupTitle: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.4,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 6,
  },
  groupBox: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  scanRow: {
    flexDirection: 'row',
    padding: 12,
    gap: 10,
  },
  scanBtn: {
    flex: 1,
    paddingVertical: 11,
    paddingHorizontal: 10,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanBtnPrimaryText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  scanBtnSecondaryText: {
    fontSize: 13,
    fontWeight: '700',
  },
  scanningRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingBottom: 12,
  },
  scanBannerText: {
    fontSize: 13,
    fontWeight: '600',
    paddingHorizontal: 14,
    paddingBottom: 12,
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  fieldLabel: {
    fontSize: 15,
    fontWeight: '500',
  },
  fieldInput: {
    flex: 1,
    fontSize: 15,
    textAlign: 'right',
    paddingVertical: 2,
  },
  stepperWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  stepBtn: {
    width: 32,
    height: 32,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnText: {
    fontSize: 18,
    fontWeight: '600',
  },
  servingsNum: {
    fontSize: 16,
    fontWeight: '700',
    minWidth: 24,
    textAlign: 'center',
  },
  DualTimeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  smallNumberInput: {
    width: 86,
    height: 32,
    borderRadius: 6,
    paddingHorizontal: 8,
    fontSize: 14,
    textAlign: 'center',
  },
  starsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  photoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
  },
  urlInput: {
    height: 34,
    borderRadius: 6,
    paddingHorizontal: 10,
    fontSize: 14,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  catChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  customCatRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  smallAddBtn: {
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 6,
    justifyContent: 'center',
  },
  multilineBox: {
    minHeight: 130,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    lineHeight: 22,
    textAlignVertical: 'top',
  },
  bottomBtnWrap: {
    padding: 16,
  },
  savePrimaryBtn: {
    height: 46,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  savePrimaryBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});

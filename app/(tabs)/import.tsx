import * as Clipboard from 'expo-clipboard';
import Constants from 'expo-constants';
import { Tabs, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
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
import { PALETTES } from '@/src/constants/theme';
import { importRecipeUniversal, isCloudConfigured } from '@/src/services/cloudSync';
import { useAppStore } from '@/src/store/AppContext';

const SAMPLE_SOCIAL_CAPTION = `Crispy Honey Garlic Salmon Bites
Ingredients:
2 salmon fillets, cubed
2 tbsp soy sauce
1 1/2 tbsp honey
3 cloves garlic, minced
1 tbsp olive oil
1 green onion, sliced (optional)
Instructions:
1. Toss cubed salmon with salt, pepper, and 1 tbsp olive oil.
2. Sear salmon cubes in a hot skillet for 4 minutes until crispy and golden.
3. Add 3 cloves garlic, 2 tbsp soy sauce, and 1 1/2 tbsp honey and toss for 90 seconds until glazed.`;

export default function PaprikaClipperAndSettingsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ shared?: string }>();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const palette = PALETTES[scheme];

  const {
    addOrUpdateRecipe,
    cloudSettings,
    saveCloudSettings,
    syncNow,
    syncStatus,
    lastSyncError,
  } = useAppStore();

  const [rawInput, setRawInput] = useState('');
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  const [editingCloud, setEditingCloud] = useState(false);
  const [supabaseUrl, setSupabaseUrl] = useState(cloudSettings.supabaseUrl);
  const [supabaseAnonKey, setSupabaseAnonKey] = useState(cloudSettings.supabaseAnonKey);
  const [ownerKey, setOwnerKey] = useState(cloudSettings.ownerKey);
  const [geminiKey, setGeminiKey] = useState(cloudSettings.geminiApiKey);

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  useEffect(() => {
    if (params.shared && typeof params.shared === 'string') {
      setRawInput(params.shared);
      handleRunImport(params.shared);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.shared]);

  useEffect(() => {
    setSupabaseUrl(cloudSettings.supabaseUrl);
    setSupabaseAnonKey(cloudSettings.supabaseAnonKey);
    setOwnerKey(cloudSettings.ownerKey);
    setGeminiKey(cloudSettings.geminiApiKey);
  }, [cloudSettings]);

  const handleExitToRecipes = () => {
    Keyboard.dismiss();
    setImporting(false);
    router.navigate('/(tabs)');
  };

  const handlePaste = async () => {
    const clip = await Clipboard.getStringAsync();
    if (clip) {
      setRawInput(clip);
      setImportError(null);
    }
  };

  const handleRunImport = async (override?: string) => {
    Keyboard.dismiss();
    const payload = (override ?? rawInput).trim();
    if (!payload) {
      setImportError('Paste a TikTok, Instagram, YouTube, or blog URL—or tap Manual / Scan above.');
      return;
    }

    setImporting(true);
    setImportError(null);
    try {
      const { recipe, needsManualCompletion } = await importRecipeUniversal(payload, cloudSettings);
      if (needsManualCompletion) {
        // Video had no written/spoken recipe text — open the Manual Editor pre-filled with the video's title, author & photo!
        setRawInput('');
        router.push({
          pathname: '/editor',
          params: { prefill: JSON.stringify(recipe) },
        });
        return;
      }

      await addOrUpdateRecipe(recipe);
      setRawInput('');
      router.push(`/recipe/${recipe.id}` as never);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Failed to extract recipe.');
    } finally {
      setImporting(false);
    }
  };

  const handleSaveCloud = async () => {
    Keyboard.dismiss();
    await saveCloudSettings({
      supabaseUrl: supabaseUrl.trim(),
      supabaseAnonKey: supabaseAnonKey.trim(),
      ownerKey: ownerKey.trim() || 'personal',
      geminiApiKey: geminiKey.trim(),
    });
    setEditingCloud(false);
    setTimeout(() => syncNow(), 150);
  };

  const appVersion = Constants.expoConfig?.version ?? '0.1.0';
  const buildNum = Constants.expoConfig?.ios?.buildNumber ?? 'remote';
  const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, unknown>;
  const gitSha = String(extra.gitCommitSha ?? 'local');
  const channel = String(extra.releaseChannel ?? 'development');

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.screen, { backgroundColor: palette.groupedBg }]}>
      <Tabs.Screen
        options={{
          title: 'Add & Sync',
          headerLeft: () => (
            <Pressable onPress={handleExitToRecipes} style={styles.headerSideBtn} hitSlop={10}>
              <Text style={styles.headerBackText}>‹ Recipes</Text>
            </Pressable>
          ),
          headerRight: () => (
            <View style={styles.headerRightGroup}>
              {keyboardVisible ? (
                <Pressable
                  onPress={() => Keyboard.dismiss()}
                  style={styles.headerSideBtn}
                  hitSlop={10}>
                  <Text style={styles.headerSaveText}>Done</Text>
                </Pressable>
              ) : importing ? (
                <Pressable
                  onPress={() => setImporting(false)}
                  style={styles.headerSideBtn}
                  hitSlop={10}>
                  <Text style={styles.headerSaveText}>Cancel</Text>
                </Pressable>
              ) : (
                <Pressable
                  onPress={() => router.push('/editor')}
                  style={styles.headerSideBtn}
                  hitSlop={10}>
                  <Text style={styles.headerSaveText}>＋ Manual</Text>
                </Pressable>
              )}
            </View>
          ),
        }}
      />

      <ScrollView
        contentContainerStyle={styles.scrollBody}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled">
        {/* Section 0: Manual Entry & Cookbook Page / Screenshot Scanner */}
        <Text style={[styles.groupTitle, { color: palette.textSecondary }]}>
          CREATE MANUALLY OR SCAN PAGES
        </Text>
        <View
          style={[
            styles.tableGroup,
            { backgroundColor: palette.paperBg, borderColor: palette.hairline },
          ]}>
          <Pressable
            onPress={() => {
              Keyboard.dismiss();
              router.push('/editor');
            }}
            style={[styles.actionRow, { borderBottomColor: palette.hairline }]}>
            <Text style={styles.actionRowEmoji}>✏️</Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.actionRowTitle, { color: palette.text }]}>
                Add Recipe Manually
              </Text>
              <Text style={[styles.actionRowSub, { color: palette.textSecondary }]}>
                Type your own title, scalable ingredients, steps, and notes
              </Text>
            </View>
            <Text style={[styles.chevron, { color: palette.textMuted }]}>›</Text>
          </Pressable>

          <Pressable
            onPress={() => {
              Keyboard.dismiss();
              router.push({ pathname: '/editor', params: { scan: 'camera' } });
            }}
            style={[styles.actionRow, { borderBottomColor: palette.hairline }]}>
            <Text style={styles.actionRowEmoji}>📷</Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.actionRowTitle, { color: palette.text }]}>
                Scan Cookbook Page with Camera
              </Text>
              <Text style={[styles.actionRowSub, { color: palette.textSecondary }]}>
                Snap a photo of a physical cookbook page or recipe card
              </Text>
            </View>
            <Text style={[styles.chevron, { color: palette.textMuted }]}>›</Text>
          </Pressable>

          <Pressable
            onPress={() => {
              Keyboard.dismiss();
              router.push({ pathname: '/editor', params: { scan: 'library' } });
            }}
            style={styles.actionRow}>
            <Text style={styles.actionRowEmoji}>🖼</Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.actionRowTitle, { color: palette.text }]}>
                Scan Screenshot or Photo from Library
              </Text>
              <Text style={[styles.actionRowSub, { color: palette.textSecondary }]}>
                Extract ingredients & steps from a saved screenshot or photo
              </Text>
            </View>
            <Text style={[styles.chevron, { color: palette.textMuted }]}>›</Text>
          </Pressable>
        </View>

        {/* Section 1: Social & Web Recipe Clipper */}
        <Text style={[styles.groupTitle, { color: palette.textSecondary }]}>
          CLIP FROM TIKTOK, INSTAGRAM, OR WEB URL
        </Text>
        <View
          style={[
            styles.tableGroup,
            { backgroundColor: palette.paperBg, borderColor: palette.hairline },
          ]}>
          <View style={[styles.clipToolbar, { borderBottomColor: palette.hairline }]}>
            <View style={styles.clipToolbarLeft}>
              <Pressable onPress={handlePaste} hitSlop={6}>
                <Text style={{ color: palette.paprika, fontSize: 14, fontWeight: '600' }}>
                  📋 Paste Clipboard
                </Text>
              </Pressable>
              {rawInput.length > 0 && (
                <Pressable
                  onPress={() => {
                    setRawInput('');
                    setImportError(null);
                  }}
                  hitSlop={6}>
                  <Text style={{ color: palette.danger, fontSize: 14, fontWeight: '600' }}>
                    Clear
                  </Text>
                </Pressable>
              )}
            </View>

            <Pressable onPress={() => setRawInput(SAMPLE_SOCIAL_CAPTION)} hitSlop={6}>
              <Text style={{ color: palette.paprika, fontSize: 13 }}>Sample Caption</Text>
            </Pressable>
          </View>

          <TextInput
            multiline
            value={rawInput}
            onChangeText={setRawInput}
            placeholder="Paste a TikTok link (tiktok.com / vt.tiktok.com), Instagram Reel, blog URL, or recipe caption..."
            placeholderTextColor={palette.textMuted}
            style={[styles.clipInput, { color: palette.text }]}
          />

          {importError ? (
            <Text style={[styles.errorLine, { color: palette.danger }]}>{importError}</Text>
          ) : null}

          <View style={[styles.clipFooter, { borderTopColor: palette.hairline }]}>
            <Pressable
              disabled={importing}
              onPress={() => handleRunImport()}
              style={[styles.paprikaPrimaryBtn, { backgroundColor: palette.paprika }]}>
              {importing ? (
                <View style={styles.loadingRow}>
                  <ActivityIndicator color="#FFFFFF" size="small" />
                  <Text style={styles.paprikaPrimaryBtnText}>Extracting Recipe...</Text>
                </View>
              ) : (
                <Text style={styles.paprikaPrimaryBtnText}>Download & Extract Recipe</Text>
              )}
            </Pressable>
          </View>
        </View>

        {/* Section 2: Paprika Cloud Sync (Supabase Online Storage) */}
        <Text style={[styles.groupTitle, { color: palette.textSecondary }]}>
          CLOUD SYNC & AI KEYS (SUPABASE / GEMINI)
        </Text>
        <View
          style={[
            styles.tableGroup,
            { backgroundColor: palette.paperBg, borderColor: palette.hairline },
          ]}>
          <View style={[styles.kvRow, { borderBottomColor: palette.hairline }]}>
            <Text style={[styles.kvLabel, { color: palette.text }]}>Status</Text>
            <Text
              style={{
                fontSize: 15,
                color: isCloudConfigured(cloudSettings)
                  ? palette.success
                  : palette.textSecondary,
              }}>
              {isCloudConfigured(cloudSettings) ? `Connected (${syncStatus})` : 'Local Only'}
            </Text>
          </View>

          {isCloudConfigured(cloudSettings) && (
            <Pressable
              onPress={syncNow}
              style={[styles.kvRow, { borderBottomColor: palette.hairline }]}>
              <Text style={{ color: palette.paprika, fontSize: 15, fontWeight: '500' }}>
                Sync Now
              </Text>
              <Text style={{ color: palette.textMuted }}>↻</Text>
            </Pressable>
          )}

          <Pressable
            onPress={() => setEditingCloud((v) => !v)}
            style={[
              styles.kvRow,
              editingCloud && {
                borderBottomColor: palette.hairline,
                borderBottomWidth: StyleSheet.hairlineWidth,
              },
            ]}>
            <Text style={{ color: palette.paprika, fontSize: 15 }}>
              {editingCloud ? 'Cancel Editing' : 'Configure Cloud Database & AI Keys...'}
            </Text>
          </Pressable>

          {lastSyncError ? (
            <Text style={[styles.errorLine, { color: palette.danger }]}>{lastSyncError}</Text>
          ) : null}

          {editingCloud && (
            <View style={styles.cloudForm}>
              <TextInput
                autoCapitalize="none"
                autoCorrect={false}
                value={supabaseUrl}
                onChangeText={setSupabaseUrl}
                placeholder="Supabase URL (https://xyz.supabase.co)"
                placeholderTextColor={palette.textMuted}
                style={[
                  styles.formInput,
                  {
                    color: palette.text,
                    borderColor: palette.hairline,
                    backgroundColor: palette.bandBg,
                  },
                ]}
              />
              <TextInput
                autoCapitalize="none"
                autoCorrect={false}
                value={supabaseAnonKey}
                onChangeText={setSupabaseAnonKey}
                placeholder="Supabase Anon Public Key"
                placeholderTextColor={palette.textMuted}
                style={[
                  styles.formInput,
                  {
                    color: palette.text,
                    borderColor: palette.hairline,
                    backgroundColor: palette.bandBg,
                  },
                ]}
              />
              <TextInput
                autoCapitalize="none"
                value={ownerKey}
                onChangeText={setOwnerKey}
                placeholder="Sync Key (default: personal)"
                placeholderTextColor={palette.textMuted}
                style={[
                  styles.formInput,
                  {
                    color: palette.text,
                    borderColor: palette.hairline,
                    backgroundColor: palette.bandBg,
                  },
                ]}
              />
              <TextInput
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry
                value={geminiKey}
                onChangeText={setGeminiKey}
                placeholder="Optional Gemini API Key (for AI Video/Vision)"
                placeholderTextColor={palette.textMuted}
                style={[
                  styles.formInput,
                  {
                    color: palette.text,
                    borderColor: palette.hairline,
                    backgroundColor: palette.bandBg,
                  },
                ]}
              />
              <Pressable
                onPress={handleSaveCloud}
                style={[styles.paprikaPrimaryBtn, { backgroundColor: palette.paprika }]}>
                <Text style={styles.paprikaPrimaryBtnText}>Save Cloud Settings</Text>
              </Pressable>
            </View>
          )}
        </View>

        {/* Section 3: App Version & Build Info */}
        <Text style={[styles.groupTitle, { color: palette.textSecondary }]}>ABOUT</Text>
        <View
          style={[
            styles.tableGroup,
            { backgroundColor: palette.paperBg, borderColor: palette.hairline },
          ]}>
          <View style={[styles.kvRow, { borderBottomColor: palette.hairline }]}>
            <Text style={[styles.kvLabel, { color: palette.text }]}>Version</Text>
            <Text style={{ color: palette.textSecondary, fontSize: 15 }}>
              {appVersion} ({buildNum})
            </Text>
          </View>
          <View style={styles.kvRow}>
            <Text style={[styles.kvLabel, { color: palette.text }]}>Commit / Channel</Text>
            <Text style={{ color: palette.textSecondary, fontSize: 14 }}>
              {gitSha} · {channel}
            </Text>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  scrollBody: {
    paddingBottom: 60,
  },
  headerSideBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  headerBackText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '500',
  },
  headerRightGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerSaveText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  groupTitle: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.4,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 6,
  },
  tableGroup: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'transparent',
  },
  actionRowEmoji: {
    fontSize: 22,
  },
  actionRowTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  actionRowSub: {
    fontSize: 12,
    marginTop: 2,
  },
  chevron: {
    fontSize: 22,
    fontWeight: '300',
  },
  clipToolbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  clipToolbarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  clipInput: {
    minHeight: 115,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    textAlignVertical: 'top',
  },
  errorLine: {
    fontSize: 13,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  clipFooter: {
    padding: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  paprikaPrimaryBtn: {
    height: 42,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  paprikaPrimaryBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  kvRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'transparent',
  },
  kvLabel: {
    fontSize: 16,
  },
  cloudForm: {
    padding: 14,
    gap: 9,
  },
  formInput: {
    height: 38,
    borderRadius: 7,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 11,
    fontSize: 14,
  },
});

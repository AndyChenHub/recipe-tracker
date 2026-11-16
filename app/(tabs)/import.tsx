import * as Clipboard from 'expo-clipboard';
import Constants from 'expo-constants';
import { Tabs, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
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

  const [editingCloud, setEditingCloud] = useState(false);
  const [supabaseUrl, setSupabaseUrl] = useState(cloudSettings.supabaseUrl);
  const [supabaseAnonKey, setSupabaseAnonKey] = useState(cloudSettings.supabaseAnonKey);
  const [ownerKey, setOwnerKey] = useState(cloudSettings.ownerKey);
  const [geminiKey, setGeminiKey] = useState(cloudSettings.geminiApiKey);

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

  const handlePaste = async () => {
    const clip = await Clipboard.getStringAsync();
    if (clip) setRawInput(clip);
  };

  const handleRunImport = async (override?: string) => {
    const payload = (override ?? rawInput).trim();
    if (!payload) {
      setImportError('Enter a TikTok, Instagram, YouTube, or blog URL—or paste recipe text.');
      return;
    }

    setImporting(true);
    setImportError(null);
    try {
      const { recipe } = await importRecipeUniversal(payload, cloudSettings);
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
    <ScrollView
      style={{ backgroundColor: palette.groupedBg }}
      contentContainerStyle={styles.scrollBody}
      keyboardShouldPersistTaps="handled">
      <Tabs.Screen
        options={{
          title: 'Clipper & Sync',
          headerRight: () => (
            <Pressable
              disabled={importing}
              onPress={() => handleRunImport()}
              style={styles.headerSideBtn}>
              {importing ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.headerSaveText}>Save Recipe</Text>
              )}
            </Pressable>
          ),
        }}
      />

      {/* Section 1: Social & Web Recipe Clipper */}
      <Text style={[styles.groupTitle, { color: palette.textSecondary }]}>
        IMPORT FROM TIKTOK, INSTAGRAM, OR WEB
      </Text>
      <View
        style={[
          styles.tableGroup,
          { backgroundColor: palette.paperBg, borderColor: palette.hairline },
        ]}>
        <View style={[styles.clipToolbar, { borderBottomColor: palette.hairline }]}>
          <Pressable onPress={handlePaste}>
            <Text style={{ color: palette.paprika, fontSize: 14, fontWeight: '600' }}>
              Paste Clipboard
            </Text>
          </Pressable>
          <Pressable onPress={() => setRawInput(SAMPLE_SOCIAL_CAPTION)}>
            <Text style={{ color: palette.paprika, fontSize: 14 }}>Load Sample Caption</Text>
          </Pressable>
        </View>

        <TextInput
          multiline
          value={rawInput}
          onChangeText={setRawInput}
          placeholder="Paste social media reel URL, blog URL, or caption text..."
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
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.paprikaPrimaryBtnText}>Download & Save Recipe</Text>
            )}
          </Pressable>
        </View>
      </View>

      {/* Section 2: Paprika Cloud Sync (Supabase Online Storage) */}
      <Text style={[styles.groupTitle, { color: palette.textSecondary }]}>
        CLOUD SYNC (SUPABASE)
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
              color: isCloudConfigured(cloudSettings) ? palette.success : palette.textSecondary,
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
            editingCloud && { borderBottomColor: palette.hairline, borderBottomWidth: StyleSheet.hairlineWidth },
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
                { color: palette.text, borderColor: palette.hairline, backgroundColor: palette.bandBg },
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
                { color: palette.text, borderColor: palette.hairline, backgroundColor: palette.bandBg },
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
                { color: palette.text, borderColor: palette.hairline, backgroundColor: palette.bandBg },
              ]}
            />
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
              value={geminiKey}
              onChangeText={setGeminiKey}
              placeholder="Optional Gemini API Key"
              placeholderTextColor={palette.textMuted}
              style={[
                styles.formInput,
                { color: palette.text, borderColor: palette.hairline, backgroundColor: palette.bandBg },
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
  );
}

const styles = StyleSheet.create({
  scrollBody: {
    paddingBottom: 60,
  },
  headerSideBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
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
    paddingTop: 18,
    paddingBottom: 6,
  },
  tableGroup: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  clipToolbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  clipInput: {
    minHeight: 130,
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

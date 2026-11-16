import { Tabs, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';

import { useColorScheme } from '@/components/useColorScheme';
import { RecipeThumbnail } from '@/src/components/RecipeThumbnail';
import { PALETTES } from '@/src/constants/theme';
import { Recipe } from '@/src/domain/types';
import { useAppStore } from '@/src/store/AppContext';

type SortMode = 'name' | 'rating' | 'recent';
type ViewMode = 'list' | 'grid';

function formatSourceSubtitle(recipe: Recipe): string {
  const parts: string[] = [];
  const mins = (recipe.prepMinutes ?? 0) + (recipe.cookMinutes ?? 0);
  if (mins > 0) parts.push(`${mins}m`);
  if (recipe.sourceAuthor) {
    parts.push(recipe.sourceAuthor);
  } else if (recipe.sourcePlatform !== 'manual') {
    parts.push(recipe.sourcePlatform);
  }
  return parts.join(' · ');
}

export default function PaprikaRecipesScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const palette = PALETTES[scheme];
  const { recipes } = useAppStore();

  const [query, setQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All Recipes');
  const [sortMode, setSortMode] = useState<SortMode>('name');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [categorySheetOpen, setCategorySheetOpen] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);

  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of recipes) {
      for (const cat of r.categories) {
        counts.set(cat, (counts.get(cat) ?? 0) + 1);
      }
    }
    return Array.from(counts.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [recipes]);

  const favoritesCount = useMemo(() => recipes.filter((r) => r.isFavorite).length, [recipes]);
  const socialCount = useMemo(
    () =>
      recipes.filter(
        (r) =>
          r.sourcePlatform === 'tiktok' ||
          r.sourcePlatform === 'instagram' ||
          r.sourcePlatform === 'youtube'
      ).length,
    [recipes]
  );

  const filteredRecipes = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = recipes.filter((r) => {
      if (selectedCategory === 'Favorites' && !r.isFavorite) return false;
      if (selectedCategory === 'Social Media') {
        if (
          r.sourcePlatform !== 'tiktok' &&
          r.sourcePlatform !== 'instagram' &&
          r.sourcePlatform !== 'youtube'
        ) {
          return false;
        }
      } else if (selectedCategory !== 'All Recipes' && selectedCategory !== 'Favorites') {
        if (!r.categories.includes(selectedCategory)) return false;
      }

      if (!q) return true;
      if (r.title.toLowerCase().includes(q)) return true;
      if (r.sourceAuthor?.toLowerCase().includes(q)) return true;
      if (r.categories.some((c) => c.toLowerCase().includes(q))) return true;
      return r.ingredients.some(
        (ing) =>
          ing.displayName.toLowerCase().includes(q) || ing.rawText.toLowerCase().includes(q)
      );
    });

    return [...list].sort((a, b) => {
      if (sortMode === 'rating') {
        return (b.rating ?? 0) - (a.rating ?? 0) || a.title.localeCompare(b.title);
      }
      if (sortMode === 'recent') {
        return b.updatedAt.localeCompare(a.updatedAt);
      }
      return a.title.localeCompare(b.title);
    });
  }, [recipes, query, selectedCategory, sortMode]);

  const cycleSort = () => {
    setSortMode((prev) => (prev === 'name' ? 'rating' : prev === 'rating' ? 'recent' : 'name'));
  };

  const sortLabel = sortMode === 'name' ? 'A–Z' : sortMode === 'rating' ? '★ Top' : 'Recent';
  const gridTileSize = Math.floor((width - 36) / 2);

  return (
    <View style={[styles.screen, { backgroundColor: palette.paperBg }]}>
      {/* Paprika 3 Navigation Bar: Sort on left, Tappable Category Dropdown in center, ＋ Menu on right */}
      <Tabs.Screen
        options={{
          headerLeft: () => (
            <Pressable onPress={cycleSort} style={styles.headerSideBtn} hitSlop={8}>
              <Text style={styles.headerBtnText}>{sortLabel}</Text>
            </Pressable>
          ),
          headerTitle: () => (
            <Pressable
              onPress={() => setCategorySheetOpen(true)}
              style={styles.headerTitleDropdown}
              hitSlop={8}>
              <Text numberOfLines={1} style={styles.headerTitleText}>
                {selectedCategory} ▾
              </Text>
            </Pressable>
          ),
          headerRight: () => (
            <Pressable
              onPress={() => setAddMenuOpen(true)}
              style={styles.headerSideBtn}
              hitSlop={10}>
              <Text style={styles.headerPlusText}>＋</Text>
            </Pressable>
          ),
        }}
      />

      {/* Paprika Compact Search + List/Grid Sub-Toolbar */}
      <View
        style={[
          styles.searchToolbar,
          { backgroundColor: palette.bandBg, borderBottomColor: palette.hairline },
        ]}>
        <View style={[styles.searchFieldWrap, { backgroundColor: palette.inputBg }]}>
          <Text style={[styles.searchIcon, { color: palette.textMuted }]}>🔍</Text>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={`Search ${selectedCategory.toLowerCase()}...`}
            placeholderTextColor={palette.textMuted}
            style={[styles.searchField, { color: palette.text }]}
          />
          {query.length > 0 && (
            <Pressable onPress={() => setQuery('')} hitSlop={8}>
              <Text style={[styles.clearSearch, { color: palette.textMuted }]}>✕</Text>
            </Pressable>
          )}
        </View>

        <View style={[styles.viewToggle, { backgroundColor: palette.inputBg }]}>
          <Pressable
            onPress={() => setViewMode('list')}
            style={[
              styles.viewToggleBtn,
              viewMode === 'list' && { backgroundColor: palette.paperBg },
            ]}>
            <Text
              style={[
                styles.viewToggleIcon,
                { color: viewMode === 'list' ? palette.paprika : palette.textSecondary },
              ]}>
              ☰
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setViewMode('grid')}
            style={[
              styles.viewToggleBtn,
              viewMode === 'grid' && { backgroundColor: palette.paperBg },
            ]}>
            <Text
              style={[
                styles.viewToggleIcon,
                { color: viewMode === 'grid' ? palette.paprika : palette.textSecondary },
              ]}>
              ⊞
            </Text>
          </Pressable>
        </View>
      </View>

      {/* Paprika Compact List View vs Photo Grid View */}
      {viewMode === 'list' ? (
        <FlatList
          key="paprika-list"
          data={filteredRecipes}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContainer}
          ItemSeparatorComponent={() => (
            <View style={[styles.rowSeparator, { backgroundColor: palette.hairline }]} />
          )}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Text style={[styles.emptyTitle, { color: palette.text }]}>No Recipes Found</Text>
              <Text style={[styles.emptySub, { color: palette.textSecondary }]}>
                Tap ＋ in the top-right corner to create a recipe manually, scan a cookbook page, or
                import from TikTok / Instagram.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push(`/recipe/${item.id}` as never)}
              style={({ pressed }) => [
                styles.listRow,
                { backgroundColor: pressed ? palette.bandBg : palette.paperBg },
              ]}>
              <RecipeThumbnail
                imageUrl={item.imageUrl}
                title={item.title}
                size={56}
                borderRadius={5}
              />

              <View style={styles.rowBody}>
                <Text numberOfLines={1} style={[styles.rowTitle, { color: palette.text }]}>
                  {item.title}
                </Text>

                <View style={styles.starsAndSourceRow}>
                  {item.rating ? (
                    <Text style={[styles.stars, { color: palette.star }]}>
                      {'★'.repeat(item.rating)}
                      <Text style={{ color: palette.hairline }}>
                        {'★'.repeat(5 - item.rating)}
                      </Text>
                    </Text>
                  ) : null}
                  {item.isFavorite && (
                    <Text style={{ color: palette.paprika, fontSize: 12 }}>♥</Text>
                  )}
                </View>

                <Text numberOfLines={1} style={[styles.rowSub, { color: palette.textSecondary }]}>
                  {formatSourceSubtitle(item) || `${item.baseServings} servings`}
                </Text>
              </View>

              <Text style={[styles.chevron, { color: palette.textMuted }]}>›</Text>
            </Pressable>
          )}
        />
      ) : (
        <FlatList
          key="paprika-grid"
          data={filteredRecipes}
          numColumns={2}
          keyExtractor={(item) => item.id}
          columnWrapperStyle={styles.gridRow}
          contentContainerStyle={styles.gridContainer}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push(`/recipe/${item.id}` as never)}
              style={[styles.gridTile, { width: gridTileSize }]}>
              <RecipeThumbnail
                imageUrl={item.imageUrl}
                title={item.title}
                size={gridTileSize}
                borderRadius={6}
              />
              <Text numberOfLines={2} style={[styles.gridTitle, { color: palette.text }]}>
                {item.title}
              </Text>
              {item.rating ? (
                <Text style={[styles.gridStars, { color: palette.star }]}>
                  {'★'.repeat(item.rating)}
                </Text>
              ) : null}
            </Pressable>
          )}
        />
      )}

      {/* Paprika "+" Add Recipe Action Menu */}
      <Modal
        visible={addMenuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setAddMenuOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setAddMenuOpen(false)}>
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={[
              styles.addMenuCard,
              { backgroundColor: palette.paperBg, borderColor: palette.hairline },
            ]}>
            <View style={[styles.addMenuHeader, { borderBottomColor: palette.hairline }]}>
              <Text style={[styles.addMenuTitle, { color: palette.text }]}>Add Recipe</Text>
              <Pressable onPress={() => setAddMenuOpen(false)}>
                <Text style={{ color: palette.paprika, fontWeight: '600', fontSize: 15 }}>
                  Cancel
                </Text>
              </Pressable>
            </View>

            <Pressable
              onPress={() => {
                setAddMenuOpen(false);
                router.push('/editor');
              }}
              style={[styles.addMenuItem, { borderBottomColor: palette.hairline }]}>
              <Text style={styles.addMenuEmoji}>✏️</Text>
              <View style={{ flex: 1 }}>
                <Text style={[styles.addMenuItemTitle, { color: palette.text }]}>
                  Add Recipe Manually
                </Text>
                <Text style={[styles.addMenuItemSub, { color: palette.textSecondary }]}>
                  Type your own title, ingredients, and directions
                </Text>
              </View>
            </Pressable>

            <Pressable
              onPress={() => {
                setAddMenuOpen(false);
                router.push({ pathname: '/editor', params: { scan: 'camera' } });
              }}
              style={[styles.addMenuItem, { borderBottomColor: palette.hairline }]}>
              <Text style={styles.addMenuEmoji}>📷</Text>
              <View style={{ flex: 1 }}>
                <Text style={[styles.addMenuItemTitle, { color: palette.text }]}>
                  Scan Cookbook Page (Camera)
                </Text>
                <Text style={[styles.addMenuItemSub, { color: palette.textSecondary }]}>
                  Take a photo of a physical recipe page or card
                </Text>
              </View>
            </Pressable>

            <Pressable
              onPress={() => {
                setAddMenuOpen(false);
                router.push({ pathname: '/editor', params: { scan: 'library' } });
              }}
              style={[styles.addMenuItem, { borderBottomColor: palette.hairline }]}>
              <Text style={styles.addMenuEmoji}>🖼</Text>
              <View style={{ flex: 1 }}>
                <Text style={[styles.addMenuItemTitle, { color: palette.text }]}>
                  Scan Screenshot or Photo
                </Text>
                <Text style={[styles.addMenuItemSub, { color: palette.textSecondary }]}>
                  Extract a recipe from your Photo Library
                </Text>
              </View>
            </Pressable>

            <Pressable
              onPress={() => {
                setAddMenuOpen(false);
                router.push('/(tabs)/import');
              }}
              style={styles.addMenuItem}>
              <Text style={styles.addMenuEmoji}>🔗</Text>
              <View style={{ flex: 1 }}>
                <Text style={[styles.addMenuItemTitle, { color: palette.text }]}>
                  Import from TikTok, Instagram, or Web URL
                </Text>
                <Text style={[styles.addMenuItemSub, { color: palette.textSecondary }]}>
                  Paste a video link, food blog URL, or caption
                </Text>
              </View>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Paprika Categories Drawer Modal */}
      <Modal
        visible={categorySheetOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setCategorySheetOpen(false)}>
        <View style={[styles.modalScreen, { backgroundColor: palette.groupedBg }]}>
          <View style={[styles.modalHeader, { backgroundColor: palette.headerBg }]}>
            <Text style={styles.modalHeaderTitle}>Categories</Text>
            <Pressable onPress={() => setCategorySheetOpen(false)}>
              <Text style={styles.modalDoneBtn}>Done</Text>
            </Pressable>
          </View>

          <View
            style={[
              styles.categoryGroup,
              { backgroundColor: palette.paperBg, borderColor: palette.hairline },
            ]}>
            {[
              { name: 'All Recipes', count: recipes.length },
              { name: 'Favorites', count: favoritesCount },
              { name: 'Social Media', count: socialCount },
              ...categoryCounts.map(([name, count]) => ({ name, count })),
            ].map((cat, idx, arr) => {
              const selected = selectedCategory === cat.name;
              return (
                <Pressable
                  key={cat.name}
                  onPress={() => {
                    setSelectedCategory(cat.name);
                    setCategorySheetOpen(false);
                  }}
                  style={[
                    styles.categoryRow,
                    idx < arr.length - 1 && {
                      borderBottomWidth: StyleSheet.hairlineWidth,
                      borderBottomColor: palette.hairline,
                    },
                  ]}>
                  <Text
                    style={[
                      styles.categoryName,
                      {
                        color: selected ? palette.paprika : palette.text,
                        fontWeight: selected ? '700' : '400',
                      },
                    ]}>
                    {selected ? '✓ ' : ''}
                    {cat.name}
                  </Text>
                  <Text style={[styles.categoryCount, { color: palette.textMuted }]}>
                    {cat.count}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </Modal>
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
    fontWeight: '400',
    lineHeight: 24,
  },
  headerTitleDropdown: {
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  headerTitleText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
  },
  searchToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  searchFieldWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    height: 36,
    borderRadius: 9,
    paddingHorizontal: 10,
    gap: 6,
  },
  searchIcon: {
    fontSize: 13,
  },
  searchField: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 0,
  },
  clearSearch: {
    fontSize: 13,
    fontWeight: '600',
  },
  viewToggle: {
    flexDirection: 'row',
    borderRadius: 8,
    padding: 2,
  },
  viewToggleBtn: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 6,
  },
  viewToggleIcon: {
    fontSize: 15,
    fontWeight: '700',
  },
  listContainer: {
    paddingBottom: 60,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 12,
  },
  rowSeparator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 82,
  },
  rowBody: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  starsAndSourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  stars: {
    fontSize: 12,
    letterSpacing: 1,
  },
  rowSub: {
    fontSize: 13,
  },
  chevron: {
    fontSize: 22,
    fontWeight: '300',
  },
  gridContainer: {
    padding: 12,
    paddingBottom: 60,
    gap: 16,
  },
  gridRow: {
    justifyContent: 'space-between',
  },
  gridTile: {
    gap: 5,
  },
  gridTitle: {
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 18,
  },
  gridStars: {
    fontSize: 12,
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
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.42)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  addMenuCard: {
    width: '100%',
    maxWidth: 370,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  addMenuHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  addMenuTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  addMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 13,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'transparent',
  },
  addMenuEmoji: {
    fontSize: 22,
  },
  addMenuItemTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  addMenuItemSub: {
    fontSize: 12,
    marginTop: 2,
  },
  modalScreen: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  modalHeaderTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
  },
  modalDoneBtn: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  categoryGroup: {
    marginTop: 18,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  categoryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  categoryName: {
    fontSize: 16,
  },
  categoryCount: {
    fontSize: 15,
  },
});

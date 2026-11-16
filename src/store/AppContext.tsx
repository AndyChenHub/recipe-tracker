import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Platform } from 'react-native';
import { mergeRecipeIntoGroceryList, sortGroceryItemsByAisle } from '@/src/domain/grocery';
import { SAMPLE_RECIPES } from '@/src/domain/sampleRecipes';
import { getCanonicalById, getDefaultStapleIds, resolveCanonicalIngredient } from '@/src/domain/taxonomy';
import {
  ActiveCookingSession,
  GroceryItem,
  Recipe,
  RunningTimer,
  UnitSystem,
} from '@/src/domain/types';
import {
  CloudSettings,
  getDefaultCloudSettings,
  isCloudConfigured,
  pullCloudData,
  removeCloudRecipe,
  syncCloudGroceryItems,
  upsertCloudRecipe,
} from '@/src/services/cloudSync';

const STORAGE_KEYS = {
  RECIPES: '@rt/recipes_v1',
  GROCERY: '@rt/grocery_v1',
  STAPLES: '@rt/staples_v1',
  SESSIONS: '@rt/sessions_v1',
  CLOUD_SETTINGS: '@rt/cloud_settings_v1',
};

interface AppContextValue {
  isHydrated: boolean;
  recipes: Recipe[];
  groceryItems: GroceryItem[];
  assumedStapleIds: string[];
  /** Stateless temporary fridge/pantry scratchpad for "What Can I Make?" */
  scratchpadIds: string[];
  cookingSessions: Record<string, ActiveCookingSession>;
  timers: RunningTimer[];
  cloudSettings: CloudSettings;
  syncStatus: 'offline' | 'syncing' | 'synced' | 'error';
  lastSyncError: string | null;

  // Cookbook actions
  addOrUpdateRecipe: (recipe: Recipe) => Promise<void>;
  deleteRecipe: (recipeId: string) => Promise<void>;
  toggleFavorite: (recipeId: string) => Promise<void>;

  // Cook Mode & Scaling session actions
  getOrCreateSession: (recipe: Recipe) => ActiveCookingSession;
  setSessionServings: (recipe: Recipe, servings: number) => void;
  setSessionUnitSystem: (recipe: Recipe, unitSystem: UnitSystem) => void;
  toggleCheckedIngredient: (recipe: Recipe, ingredientId: string) => void;
  toggleCompletedStep: (recipe: Recipe, stepNumber: number) => void;
  togglePinRecipe: (recipe: Recipe) => void;
  resetCookingSession: (recipe: Recipe) => void;

  // Smart Timers
  startTimer: (recipeId: string, recipeTitle: string, label: string, seconds: number) => void;
  togglePauseTimer: (timerId: string) => void;
  addMinuteToTimer: (timerId: string) => void;
  dismissTimer: (timerId: string) => void;

  // Smart Grocery List actions
  addRecipeToGrocery: (
    recipe: Recipe,
    servings: number,
    options?: { skipStaples?: boolean; onlyIngredientIds?: string[] }
  ) => void;
  addManualGroceryItem: (rawLine: string) => void;
  toggleGroceryChecked: (itemId: string) => void;
  clearCheckedGroceryItems: () => void;
  clearAllGroceryItems: () => void;

  // Temporary Scratchpad & Assumed Basics actions
  addScratchpadIngredient: (canonicalOrRaw: string) => void;
  removeScratchpadIngredient: (canonicalId: string) => void;
  clearScratchpad: () => void;
  toggleAssumedStaple: (canonicalId: string) => void;

  // Cloud Sync
  saveCloudSettings: (next: CloudSettings) => Promise<void>;
  syncNow: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

function triggerLightHaptic() {
  if (Platform.OS === 'ios') {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [isHydrated, setIsHydrated] = useState(false);
  const [recipes, setRecipes] = useState<Recipe[]>(SAMPLE_RECIPES);
  const [groceryItems, setGroceryItems] = useState<GroceryItem[]>([]);
  const [assumedStapleIds, setAssumedStapleIds] = useState<string[]>(() => getDefaultStapleIds());
  const [scratchpadIds, setScratchpadIds] = useState<string[]>([]);
  const [cookingSessions, setCookingSessions] = useState<Record<string, ActiveCookingSession>>({});
  const [timers, setTimers] = useState<RunningTimer[]>([]);
  const [cloudSettings, setCloudSettings] = useState<CloudSettings>(() => getDefaultCloudSettings());
  const [syncStatus, setSyncStatus] = useState<'offline' | 'syncing' | 'synced' | 'error'>('offline');
  const [lastSyncError, setLastSyncError] = useState<string | null>(null);
  const [, setTimerTick] = useState(0);

  const alertedTimersRef = useRef<Set<string>>(new Set());

  // Hydrate offline-first state from AsyncStorage on startup
  useEffect(() => {
    (async () => {
      try {
        const [rawRecipes, rawGrocery, rawStaples, rawSessions, rawCloud] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEYS.RECIPES),
          AsyncStorage.getItem(STORAGE_KEYS.GROCERY),
          AsyncStorage.getItem(STORAGE_KEYS.STAPLES),
          AsyncStorage.getItem(STORAGE_KEYS.SESSIONS),
          AsyncStorage.getItem(STORAGE_KEYS.CLOUD_SETTINGS),
        ]);

        if (rawRecipes) {
          const parsed = JSON.parse(rawRecipes);
          if (Array.isArray(parsed) && parsed.length > 0) setRecipes(parsed);
        } else {
          await AsyncStorage.setItem(STORAGE_KEYS.RECIPES, JSON.stringify(SAMPLE_RECIPES));
        }

        if (rawGrocery) setGroceryItems(JSON.parse(rawGrocery));
        if (rawStaples) setAssumedStapleIds(JSON.parse(rawStaples));
        if (rawSessions) setCookingSessions(JSON.parse(rawSessions));
        if (rawCloud) {
          const merged = { ...getDefaultCloudSettings(), ...JSON.parse(rawCloud) };
          setCloudSettings(merged);
        }
      } catch {
        // Keep defaults if storage fails
      } finally {
        setIsHydrated(true);
      }
    })();
  }, []);

  // Tick active Cook Mode countdown timers once per second
  useEffect(() => {
    if (timers.length === 0) return;
    const interval = setInterval(() => {
      setTimerTick((n) => n + 1);
      const now = Date.now();
      for (const t of timers) {
        if (t.isRunning && t.endsAtMs && t.endsAtMs <= now && !alertedTimersRef.current.has(t.id)) {
          alertedTimersRef.current.add(t.id);
          if (Platform.OS === 'ios') {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          }
        }
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [timers]);

  const persistRecipes = useCallback(async (next: Recipe[]) => {
    setRecipes(next);
    await AsyncStorage.setItem(STORAGE_KEYS.RECIPES, JSON.stringify(next));
  }, []);

  const persistGrocery = useCallback(
    async (next: GroceryItem[]) => {
      setGroceryItems(next);
      await AsyncStorage.setItem(STORAGE_KEYS.GROCERY, JSON.stringify(next));
      if (isCloudConfigured(cloudSettings)) {
        syncCloudGroceryItems(cloudSettings, next).catch(() => {});
      }
    },
    [cloudSettings]
  );

  const persistSessions = useCallback(async (next: Record<string, ActiveCookingSession>) => {
    setCookingSessions(next);
    await AsyncStorage.setItem(STORAGE_KEYS.SESSIONS, JSON.stringify(next));
  }, []);

  const syncNow = useCallback(async () => {
    if (!isCloudConfigured(cloudSettings)) {
      setSyncStatus('offline');
      return;
    }
    setSyncStatus('syncing');
    setLastSyncError(null);
    try {
      const remote = await pullCloudData(cloudSettings);
      if (remote) {
        if (remote.recipes.length > 0) {
          // Merge remote & local by latest updatedAt
          const mergedMap = new Map<string, Recipe>();
          for (const local of recipes) mergedMap.set(local.id, local);
          for (const rem of remote.recipes) {
            const loc = mergedMap.get(rem.id);
            if (!loc || rem.updatedAt >= loc.updatedAt) {
              mergedMap.set(rem.id, rem);
            }
          }
          const mergedList = Array.from(mergedMap.values()).sort((a, b) =>
            b.updatedAt.localeCompare(a.updatedAt)
          );
          await persistRecipes(mergedList);
        } else {
          // Seed cloud with local recipes on first connect
          for (const r of recipes) {
            await upsertCloudRecipe(cloudSettings, r);
          }
        }

        if (remote.groceryItems.length > 0 && groceryItems.length === 0) {
          setGroceryItems(remote.groceryItems);
          await AsyncStorage.setItem(STORAGE_KEYS.GROCERY, JSON.stringify(remote.groceryItems));
        }
      }
      setSyncStatus('synced');
    } catch (err) {
      setSyncStatus('error');
      setLastSyncError(err instanceof Error ? err.message : 'Cloud sync error');
    }
  }, [cloudSettings, recipes, groceryItems, persistRecipes]);

  useEffect(() => {
    if (isHydrated && isCloudConfigured(cloudSettings)) {
      syncNow();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHydrated]);

  const addOrUpdateRecipe = useCallback(
    async (recipe: Recipe) => {
      const stamped = { ...recipe, updatedAt: new Date().toISOString() };
      const exists = recipes.some((r) => r.id === stamped.id);
      const next = exists
        ? recipes.map((r) => (r.id === stamped.id ? stamped : r))
        : [stamped, ...recipes];
      await persistRecipes(next);
      triggerLightHaptic();
      if (isCloudConfigured(cloudSettings)) {
        upsertCloudRecipe(cloudSettings, stamped).catch(() => {});
      }
    },
    [recipes, persistRecipes, cloudSettings]
  );

  const deleteRecipe = useCallback(
    async (recipeId: string) => {
      const next = recipes.filter((r) => r.id !== recipeId);
      await persistRecipes(next);
      if (isCloudConfigured(cloudSettings)) {
        removeCloudRecipe(cloudSettings, recipeId).catch(() => {});
      }
    },
    [recipes, persistRecipes, cloudSettings]
  );

  const toggleFavorite = useCallback(
    async (recipeId: string) => {
      const target = recipes.find((r) => r.id === recipeId);
      if (!target) return;
      await addOrUpdateRecipe({ ...target, isFavorite: !target.isFavorite });
    },
    [recipes, addOrUpdateRecipe]
  );

  const getOrCreateSession = useCallback(
    (recipe: Recipe): ActiveCookingSession => {
      return (
        cookingSessions[recipe.id] ?? {
          recipeId: recipe.id,
          targetServings: recipe.baseServings,
          unitSystem: 'original',
          checkedIngredientIds: [],
          completedStepNumbers: [],
          activeStepNumber: null,
          isPinned: false,
        }
      );
    },
    [cookingSessions]
  );

  const updateSession = useCallback(
    (recipe: Recipe, updater: (prev: ActiveCookingSession) => ActiveCookingSession) => {
      const current = getOrCreateSession(recipe);
      const updated = updater(current);
      persistSessions({ ...cookingSessions, [recipe.id]: updated });
    },
    [cookingSessions, getOrCreateSession, persistSessions]
  );

  const setSessionServings = useCallback(
    (recipe: Recipe, servings: number) => {
      const clamped = Math.max(1, Math.min(48, Math.round(servings)));
      triggerLightHaptic();
      updateSession(recipe, (s) => ({ ...s, targetServings: clamped }));
    },
    [updateSession]
  );

  const setSessionUnitSystem = useCallback(
    (recipe: Recipe, unitSystem: UnitSystem) => {
      triggerLightHaptic();
      updateSession(recipe, (s) => ({ ...s, unitSystem }));
    },
    [updateSession]
  );

  const toggleCheckedIngredient = useCallback(
    (recipe: Recipe, ingredientId: string) => {
      triggerLightHaptic();
      updateSession(recipe, (s) => {
        const exists = s.checkedIngredientIds.includes(ingredientId);
        return {
          ...s,
          checkedIngredientIds: exists
            ? s.checkedIngredientIds.filter((id) => id !== ingredientId)
            : [...s.checkedIngredientIds, ingredientId],
        };
      });
    },
    [updateSession]
  );

  const toggleCompletedStep = useCallback(
    (recipe: Recipe, stepNumber: number) => {
      triggerLightHaptic();
      updateSession(recipe, (s) => {
        const done = s.completedStepNumbers.includes(stepNumber);
        return {
          ...s,
          completedStepNumbers: done
            ? s.completedStepNumbers.filter((n) => n !== stepNumber)
            : [...s.completedStepNumbers, stepNumber],
          activeStepNumber: done ? s.activeStepNumber : stepNumber + 1,
        };
      });
    },
    [updateSession]
  );

  const togglePinRecipe = useCallback(
    (recipe: Recipe) => {
      triggerLightHaptic();
      updateSession(recipe, (s) => ({ ...s, isPinned: !s.isPinned }));
    },
    [updateSession]
  );

  const resetCookingSession = useCallback(
    (recipe: Recipe) => {
      updateSession(recipe, (s) => ({
        ...s,
        targetServings: recipe.baseServings,
        checkedIngredientIds: [],
        completedStepNumbers: [],
        activeStepNumber: null,
      }));
    },
    [updateSession]
  );

  const startTimer = useCallback(
    (recipeId: string, recipeTitle: string, label: string, seconds: number) => {
      triggerLightHaptic();
      const id = `tmr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;
      const nextTimer: RunningTimer = {
        id,
        recipeId,
        recipeTitle,
        label,
        durationSeconds: seconds,
        endsAtMs: Date.now() + seconds * 1000,
        remainingSecondsWhenPaused: seconds,
        isRunning: true,
      };
      setTimers((prev) => [nextTimer, ...prev]);
    },
    []
  );

  const togglePauseTimer = useCallback((timerId: string) => {
    triggerLightHaptic();
    setTimers((prev) =>
      prev.map((t) => {
        if (t.id !== timerId) return t;
        if (t.isRunning) {
          const rem = t.endsAtMs ? Math.max(0, Math.ceil((t.endsAtMs - Date.now()) / 1000)) : 0;
          return { ...t, isRunning: false, endsAtMs: null, remainingSecondsWhenPaused: rem };
        }
        return {
          ...t,
          isRunning: true,
          endsAtMs: Date.now() + Math.max(5, t.remainingSecondsWhenPaused) * 1000,
        };
      })
    );
  }, []);

  const addMinuteToTimer = useCallback((timerId: string) => {
    triggerLightHaptic();
    alertedTimersRef.current.delete(timerId);
    setTimers((prev) =>
      prev.map((t) => {
        if (t.id !== timerId) return t;
        if (t.isRunning) {
          const base = Math.max(Date.now(), t.endsAtMs ?? Date.now());
          return { ...t, endsAtMs: base + 60_000, durationSeconds: t.durationSeconds + 60 };
        }
        return {
          ...t,
          remainingSecondsWhenPaused: t.remainingSecondsWhenPaused + 60,
          durationSeconds: t.durationSeconds + 60,
        };
      })
    );
  }, []);

  const dismissTimer = useCallback((timerId: string) => {
    alertedTimersRef.current.delete(timerId);
    setTimers((prev) => prev.filter((t) => t.id !== timerId));
  }, []);

  const addRecipeToGrocery = useCallback(
    (
      recipe: Recipe,
      servings: number,
      options?: { skipStaples?: boolean; onlyIngredientIds?: string[] }
    ) => {
      triggerLightHaptic();
      const skip =
        options?.skipStaples !== false
          ? ['water', 'salt', 'black-pepper']
          : [];
      const merged = mergeRecipeIntoGroceryList(groceryItems, recipe, servings, {
        excludeCanonicalIds: skip,
        onlyIngredientIds: options?.onlyIngredientIds,
      });
      persistGrocery(merged);
    },
    [groceryItems, persistGrocery]
  );

  const addManualGroceryItem = useCallback(
    (rawLine: string) => {
      const cleaned = rawLine.trim();
      if (!cleaned) return;
      triggerLightHaptic();
      const resolved = resolveCanonicalIngredient(cleaned);
      const item: GroceryItem = {
        id: `groc-manual-${Date.now().toString(36)}`,
        canonicalIngredientId: resolved.canonicalId,
        displayName: resolved.known ? resolved.displayName : cleaned,
        aisle: resolved.aisle,
        totalQty: 1,
        unit: '',
        extraAmounts: [],
        formattedAmount: '1',
        isChecked: false,
        sources: [],
        updatedAt: new Date().toISOString(),
      };
      persistGrocery(sortGroceryItemsByAisle([item, ...groceryItems]));
    },
    [groceryItems, persistGrocery]
  );

  const toggleGroceryChecked = useCallback(
    (itemId: string) => {
      triggerLightHaptic();
      const updated = groceryItems.map((i) =>
        i.id === itemId ? { ...i, isChecked: !i.isChecked, updatedAt: new Date().toISOString() } : i
      );
      persistGrocery(sortGroceryItemsByAisle(updated));
    },
    [groceryItems, persistGrocery]
  );

  const clearCheckedGroceryItems = useCallback(() => {
    triggerLightHaptic();
    persistGrocery(groceryItems.filter((i) => !i.isChecked));
  }, [groceryItems, persistGrocery]);

  const clearAllGroceryItems = useCallback(() => {
    persistGrocery([]);
  }, [persistGrocery]);

  const addScratchpadIngredient = useCallback((canonicalOrRaw: string) => {
    const trimmed = canonicalOrRaw.trim();
    if (!trimmed) return;
    triggerLightHaptic();
    const known = getCanonicalById(trimmed);
    const id = known ? known.id : resolveCanonicalIngredient(trimmed).canonicalId;
    setScratchpadIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }, []);

  const removeScratchpadIngredient = useCallback((canonicalId: string) => {
    triggerLightHaptic();
    setScratchpadIds((prev) => prev.filter((id) => id !== canonicalId));
  }, []);

  const clearScratchpad = useCallback(() => {
    triggerLightHaptic();
    setScratchpadIds([]);
  }, []);

  const toggleAssumedStaple = useCallback(
    async (canonicalId: string) => {
      triggerLightHaptic();
      const next = assumedStapleIds.includes(canonicalId)
        ? assumedStapleIds.filter((id) => id !== canonicalId)
        : [...assumedStapleIds, canonicalId];
      setAssumedStapleIds(next);
      await AsyncStorage.setItem(STORAGE_KEYS.STAPLES, JSON.stringify(next));
    },
    [assumedStapleIds]
  );

  const saveCloudSettings = useCallback(async (next: CloudSettings) => {
    setCloudSettings(next);
    await AsyncStorage.setItem(STORAGE_KEYS.CLOUD_SETTINGS, JSON.stringify(next));
  }, []);

  const value = useMemo<AppContextValue>(
    () => ({
      isHydrated,
      recipes,
      groceryItems,
      assumedStapleIds,
      scratchpadIds,
      cookingSessions,
      timers,
      cloudSettings,
      syncStatus,
      lastSyncError,
      addOrUpdateRecipe,
      deleteRecipe,
      toggleFavorite,
      getOrCreateSession,
      setSessionServings,
      setSessionUnitSystem,
      toggleCheckedIngredient,
      toggleCompletedStep,
      togglePinRecipe,
      resetCookingSession,
      startTimer,
      togglePauseTimer,
      addMinuteToTimer,
      dismissTimer,
      addRecipeToGrocery,
      addManualGroceryItem,
      toggleGroceryChecked,
      clearCheckedGroceryItems,
      clearAllGroceryItems,
      addScratchpadIngredient,
      removeScratchpadIngredient,
      clearScratchpad,
      toggleAssumedStaple,
      saveCloudSettings,
      syncNow,
    }),
    [
      isHydrated,
      recipes,
      groceryItems,
      assumedStapleIds,
      scratchpadIds,
      cookingSessions,
      timers,
      cloudSettings,
      syncStatus,
      lastSyncError,
      addOrUpdateRecipe,
      deleteRecipe,
      toggleFavorite,
      getOrCreateSession,
      setSessionServings,
      setSessionUnitSystem,
      toggleCheckedIngredient,
      toggleCompletedStep,
      togglePinRecipe,
      resetCookingSession,
      startTimer,
      togglePauseTimer,
      addMinuteToTimer,
      dismissTimer,
      addRecipeToGrocery,
      addManualGroceryItem,
      toggleGroceryChecked,
      clearCheckedGroceryItems,
      clearAllGroceryItems,
      addScratchpadIngredient,
      removeScratchpadIngredient,
      clearScratchpad,
      toggleAssumedStaple,
      saveCloudSettings,
      syncNow,
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppStore(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) {
    throw new Error('useAppStore must be used inside <AppProvider>');
  }
  return ctx;
}

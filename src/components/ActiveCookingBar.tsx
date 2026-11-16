import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppStore } from '@/src/store/AppContext';

function formatClock(totalSeconds: number): string {
  const clamped = Math.max(0, totalSeconds);
  const mins = Math.floor(clamped / 60);
  const secs = clamped % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Paprika-style dark bottom utility bar for Pinned Active Recipes & Countdown Timers.
 */
export function ActiveCookingBar({ withBottomInset = false }: { withBottomInset?: boolean }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const {
    timers,
    cookingSessions,
    recipes,
    togglePauseTimer,
    addMinuteToTimer,
    dismissTimer,
  } = useAppStore();

  const pinnedRecipes = recipes.filter((r) => cookingSessions[r.id]?.isPinned);

  if (timers.length === 0 && pinnedRecipes.length === 0) {
    return null;
  }

  const now = Date.now();

  return (
    <View
      style={[
        styles.bar,
        withBottomInset && { paddingBottom: Math.max(8, insets.bottom) },
      ]}>
      {timers.map((t) => {
        const remaining =
          t.isRunning && t.endsAtMs
            ? Math.max(0, Math.ceil((t.endsAtMs - now) / 1000))
            : t.remainingSecondsWhenPaused;
        const isDone = remaining === 0;

        return (
          <View key={t.id} style={[styles.timerStrip, isDone && styles.timerStripDone]}>
            <Pressable
              style={styles.timerInfo}
              onPress={() => router.push(`/recipe/${t.recipeId}` as never)}>
              <Text style={styles.timerClock}>
                {isDone ? '🔔 TIMER DONE' : `⏱ ${formatClock(remaining)}`}
              </Text>
              <Text numberOfLines={1} style={styles.timerMeta}>
                {t.label} — {t.recipeTitle}
              </Text>
            </Pressable>

            <View style={styles.timerBtns}>
              {!isDone && (
                <Pressable onPress={() => togglePauseTimer(t.id)} style={styles.ctrlBtn}>
                  <Text style={styles.ctrlBtnText}>{t.isRunning ? 'Pause' : 'Start'}</Text>
                </Pressable>
              )}
              <Pressable onPress={() => addMinuteToTimer(t.id)} style={styles.ctrlBtn}>
                <Text style={styles.ctrlBtnText}>+1m</Text>
              </Pressable>
              <Pressable onPress={() => dismissTimer(t.id)} style={styles.ctrlBtn}>
                <Text style={styles.ctrlCloseText}>✕</Text>
              </Pressable>
            </View>
          </View>
        );
      })}

      {pinnedRecipes.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.pinnedRow}>
          <Text style={styles.pinnedLabel}>PINNED</Text>
          {pinnedRecipes.map((r) => (
            <Pressable
              key={r.id}
              onPress={() => router.push(`/recipe/${r.id}` as never)}
              style={styles.pinnedTab}>
              <Text numberOfLines={1} style={styles.pinnedTabText}>
                📌 {r.title}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: '#242426',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#3A3A3C',
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 5,
  },
  timerStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#323236',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 8,
  },
  timerStripDone: {
    backgroundColor: '#D94325',
  },
  timerInfo: {
    flex: 1,
  },
  timerClock: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  timerMeta: {
    color: '#EBEBF5CC',
    fontSize: 11,
  },
  timerBtns: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  ctrlBtn: {
    backgroundColor: 'rgba(255,255,255,0.16)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  ctrlBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600',
  },
  ctrlCloseText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  pinnedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 1,
  },
  pinnedLabel: {
    color: '#AEAEB2',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
    marginRight: 2,
  },
  pinnedTab: {
    backgroundColor: '#D94325',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 4,
    maxWidth: 210,
  },
  pinnedTabText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
});

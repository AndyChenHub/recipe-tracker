import { Tabs } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { useClientOnlyValue } from '@/components/useClientOnlyValue';
import { useColorScheme } from '@/components/useColorScheme';
import { ActiveCookingBar } from '@/src/components/ActiveCookingBar';
import { PALETTES } from '@/src/constants/theme';
import { useAppStore } from '@/src/store/AppContext';

export default function TabLayout() {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const palette = PALETTES[scheme];
  const { groceryItems, scratchpadIds } = useAppStore();

  const uncheckedGroceryCount = groceryItems.filter((i) => !i.isChecked).length;

  return (
    <View style={styles.root}>
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: palette.paprika,
          tabBarInactiveTintColor: palette.textMuted,
          tabBarStyle: {
            backgroundColor: palette.paperBg,
            borderTopColor: palette.hairline,
          },
          headerStyle: {
            backgroundColor: palette.headerBg,
          },
          headerTintColor: palette.headerText,
          headerTitleStyle: {
            color: palette.headerText,
            fontWeight: '600',
            fontSize: 17,
          },
          headerShadowVisible: false,
          headerShown: useClientOnlyValue(false, true),
        }}>
        <Tabs.Screen
          name="index"
          options={{
            title: 'Recipes',
            tabBarIcon: ({ color }) => (
              <SymbolView
                name={{ ios: 'book.fill', android: 'menu_book', web: 'menu_book' }}
                tintColor={color}
                size={23}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="grocery"
          options={{
            title: 'Groceries',
            tabBarBadge: uncheckedGroceryCount > 0 ? uncheckedGroceryCount : undefined,
            tabBarBadgeStyle: { backgroundColor: palette.paprika },
            tabBarIcon: ({ color }) => (
              <SymbolView
                name={{ ios: 'cart.fill', android: 'shopping_cart', web: 'shopping_cart' }}
                tintColor={color}
                size={23}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="match"
          options={{
            title: 'Pantry Match',
            tabBarBadge: scratchpadIds.length > 0 ? scratchpadIds.length : undefined,
            tabBarBadgeStyle: { backgroundColor: palette.paprika },
            tabBarIcon: ({ color }) => (
              <SymbolView
                name={{ ios: 'basket.fill', android: 'kitchen', web: 'kitchen' }}
                tintColor={color}
                size={23}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="import"
          options={{
            title: 'Browser',
            tabBarIcon: ({ color }) => (
              <SymbolView
                name={{ ios: 'safari.fill', android: 'public', web: 'public' }}
                tintColor={color}
                size={23}
              />
            ),
          }}
        />
      </Tabs>

      <View style={styles.floatingBarHost} pointerEvents="box-none">
        <ActiveCookingBar />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  floatingBarHost: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: Platform.OS === 'ios' ? 83 : 56,
  },
});

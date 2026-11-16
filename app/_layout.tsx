import { useFonts } from 'expo-font';
import * as Linking from 'expo-linking';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider, useRouter } from 'expo-router';
import { ShareIntentProvider, useShareIntentContext } from 'expo-share-intent';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import 'react-native-reanimated';

import { useColorScheme } from '@/components/useColorScheme';
import { PALETTES } from '@/src/constants/theme';
import { AppProvider } from '@/src/store/AppContext';

export { ErrorBoundary } from 'expo-router';

export const unstable_settings = {
  anchor: '(tabs)',
};

SplashScreen.preventAutoHideAsync();

function ShareSheetBridge() {
  const router = useRouter();
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntentContext();

  useEffect(() => {
    if (!hasShareIntent) return;
    const sharedText = shareIntent.webUrl || shareIntent.text || '';
    if (sharedText) {
      resetShareIntent();
      router.push({
        pathname: '/(tabs)/import',
        params: { shared: sharedText },
      });
    }
  }, [hasShareIntent, shareIntent, resetShareIntent, router]);

  useEffect(() => {
    const sub = Linking.addEventListener('url', ({ url }) => {
      const parsed = Linking.parse(url);
      const target = parsed.queryParams?.url;
      if (typeof target === 'string' && target.length > 0) {
        router.push({
          pathname: '/(tabs)/import',
          params: { shared: target },
        });
      }
    });
    return () => sub.remove();
  }, [router]);

  return null;
}

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return (
    <ShareIntentProvider>
      <AppProvider>
        <RootLayoutNav />
      </AppProvider>
    </ShareIntentProvider>
  );
}

function RootLayoutNav() {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const palette = PALETTES[scheme];

  return (
    <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
      {/* Paprika uses white status-bar text/icons against its solid spice-orange header */}
      <StatusBar style="light" />
      <ShareSheetBridge />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: palette.headerBg },
          headerTintColor: palette.headerText,
          headerTitleStyle: { fontWeight: '600', fontSize: 17 },
          headerShadowVisible: false,
        }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="recipe/[id]"
          options={{
            title: '',
            headerBackTitle: 'Recipes',
          }}
        />
      </Stack>
    </ThemeProvider>
  );
}

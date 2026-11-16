import { useFonts } from 'expo-font';
import * as Linking from 'expo-linking';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useRef } from 'react';
import 'react-native-reanimated';

import { useColorScheme } from '@/components/useColorScheme';
import { PALETTES } from '@/src/constants/theme';
import { AppProvider } from '@/src/store/AppContext';

export { ErrorBoundary } from 'expo-router';

export const unstable_settings = {
  anchor: '(tabs)',
};

SplashScreen.preventAutoHideAsync();

function extractSharedTargetFromDeepLink(rawUrl: string): string | null {
  try {
    const parsed = Linking.parse(rawUrl);
    const paramUrl = parsed.queryParams?.url ?? parsed.queryParams?.shared ?? parsed.queryParams?.text;
    if (typeof paramUrl === 'string' && paramUrl.trim().length > 0) {
      return paramUrl.trim();
    }
  } catch {
    // Ignore malformed URLs
  }
  return null;
}

/**
 * Handles both cold-start and warm-resume deep links from the iOS Share Sheet Shortcut:
 * e.g. recipetracker://import?url=https://www.tiktok.com/...
 */
function DeepLinkShareBridge() {
  const router = useRouter();
  const lastHandledRef = useRef<string | null>(null);

  useEffect(() => {
    const routeIncoming = (incomingUrl: string | null) => {
      if (!incomingUrl || lastHandledRef.current === incomingUrl) return;
      const sharedTarget = extractSharedTargetFromDeepLink(incomingUrl);
      if (sharedTarget) {
        lastHandledRef.current = incomingUrl;
        router.push({
          pathname: '/(tabs)/import',
          params: { shared: sharedTarget },
        });
      }
    };

    Linking.getInitialURL().then(routeIncoming).catch(() => {});
    const sub = Linking.addEventListener('url', ({ url }) => routeIncoming(url));
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
    <AppProvider>
      <RootLayoutNav />
    </AppProvider>
  );
}

function RootLayoutNav() {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const palette = PALETTES[scheme];

  return (
    <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
      <StatusBar style="light" />
      <DeepLinkShareBridge />
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

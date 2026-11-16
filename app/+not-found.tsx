import { Link, Stack } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useColorScheme } from '@/components/useColorScheme';
import { PALETTES } from '@/src/constants/theme';

export default function NotFoundScreen() {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const palette = PALETTES[scheme];

  return (
    <>
      <Stack.Screen options={{ title: 'Not Found' }} />
      <View style={[styles.container, { backgroundColor: palette.paperBg }]}>
        <Text style={[styles.title, { color: palette.text }]}>Screen not found.</Text>
        <Link href="/" style={styles.link}>
          <Text style={[styles.linkText, { color: palette.paprika }]}>Return to Recipes</Text>
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
  },
  link: {
    marginTop: 15,
    paddingVertical: 15,
  },
  linkText: {
    fontSize: 15,
    fontWeight: '600',
  },
});

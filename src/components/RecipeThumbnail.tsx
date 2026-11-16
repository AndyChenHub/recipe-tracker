import React, { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

interface RecipeThumbnailProps {
  imageUrl?: string;
  title: string;
  size?: number;
  borderRadius?: number;
}

const FALLBACK_COLORS = ['#D94325', '#C26D0A', '#2E7D5B', '#8E44AD', '#2980B9'];

export function RecipeThumbnail({
  imageUrl,
  title,
  size = 56,
  borderRadius = 5,
}: RecipeThumbnailProps) {
  const [failed, setFailed] = useState(false);

  const hash = title.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const bgColor = FALLBACK_COLORS[hash % FALLBACK_COLORS.length];
  const initials = title
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join('');

  if (imageUrl && !failed) {
    return (
      <Image
        source={{ uri: imageUrl }}
        onError={() => setFailed(true)}
        style={{
          width: size,
          height: size,
          borderRadius,
          backgroundColor: '#E5E5EA',
        }}
      />
    );
  }

  return (
    <View
      style={[
        styles.fallback,
        {
          width: size,
          height: size,
          borderRadius,
          backgroundColor: bgColor,
        },
      ]}>
      <Text style={[styles.initials, { fontSize: Math.max(13, Math.round(size * 0.3)) }]}>
        {initials || '🍽'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    color: '#FFFFFF',
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});

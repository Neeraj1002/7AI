import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { color, space, type } from '../../lib/theme';

export function SectionHeader({ title }: { title: string }) {
  return (
    <Text style={styles.title} accessibilityRole="header">
      {title}
    </Text>
  );
}

const styles = StyleSheet.create({ title: { ...type.sectionTitle, color: color.ink, marginTop: space.md } });

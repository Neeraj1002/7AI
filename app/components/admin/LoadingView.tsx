import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { color, space } from '../../lib/theme';

export function LoadingView() {
  return (
    <View style={styles.box} accessibilityLabel="Loading" accessibilityRole="progressbar">
      <ActivityIndicator color={color.accent} />
    </View>
  );
}

const styles = StyleSheet.create({ box: { padding: space.xxl, alignItems: 'center' } });

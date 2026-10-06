import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ActionButton } from './ActionButton';
import { color, space, type } from '../../lib/theme';

export function ErrorView({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={styles.box} accessibilityRole="alert">
      <Text style={styles.text}>{message}</Text>
      {onRetry ? <ActionButton label="Retry" icon="refresh-cw" onPress={onRetry} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { padding: space.lg, gap: space.md },
  text: { ...type.body, color: color.danger },
});

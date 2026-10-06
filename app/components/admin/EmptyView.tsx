import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { color, space, type } from '../../lib/theme';

export function EmptyView({ message }: { message: string }) {
  return (
    <View style={styles.box}>
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { padding: space.xl, alignItems: 'center' },
  text: { ...type.body, color: color.muted, textAlign: 'center' },
});

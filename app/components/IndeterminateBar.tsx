import React, { useEffect, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { color, radius } from '../lib/theme';

// A 6px indeterminate progress bar (Decision sent / Approved-and-publishing
// cards) — a looping segment sliding across the track, since neither state
// has a real percentage to show.
export function IndeterminateBar({ tint = color.accent }: { tint?: string }) {
  // Animated.Value via useState, not useRef().current — eslint's
  // react-hooks/refs rule (correctly, for a plain ref) otherwise flags
  // interpolating it during render; Animated.Value's own mutation model
  // never re-renders on its own either way, so this is behaviourally
  // identical to the usual useRef idiom.
  const [x] = useState(() => new Animated.Value(0));

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(x, { toValue: 1, duration: 1100, useNativeDriver: true }),
        Animated.timing(x, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [x]);

  const translateX = x.interpolate({ inputRange: [0, 1], outputRange: ['-40%', '110%'] });

  return (
    <View style={styles.track}>
      <Animated.View style={[styles.segment, { backgroundColor: tint, transform: [{ translateX }] }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.2)', overflow: 'hidden' },
  segment: { position: 'absolute', width: '30%', height: 6, borderRadius: radius.pill },
});

import React, { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { Screen } from '../Screen';
import { useTRPC } from '../../lib/trpc';
import { color, space } from '../../lib/theme';

// Shared shell: header with back button, scrolling body, pull-to-refresh that
// invalidates every admin query (so each screen's own queries refetch).
export function AdminScreen({
  title,
  subtitle,
  variant = 'stack',
  children,
}: {
  title: string;
  subtitle?: string;
  variant?: 'stack' | 'tabRoot';
  children: React.ReactNode;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await queryClient.invalidateQueries({ queryKey: trpc.admin.pathKey() });
    } finally {
      setRefreshing(false);
    }
  }, [queryClient, trpc]);

  return (
    <Screen title={title} subtitle={subtitle} variant={variant}>
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={color.accent} colors={[color.accent]} />}
      >
        {children}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({ container: { paddingHorizontal: space.lg, paddingBottom: space.xxl, gap: space.md } });

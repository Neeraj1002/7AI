import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTRPC } from '../../../lib/trpc';
import { color, font, space, type } from '../../../lib/theme';
import { Card } from '../../../components/Card';
import { AdminScreen } from '../../../components/admin/AdminScreen';
import { Chip } from '../../../components/admin/Chip';
import { LoadingView } from '../../../components/admin/LoadingView';
import { EmptyView } from '../../../components/admin/EmptyView';
import { ErrorView } from '../../../components/admin/ErrorView';
import { fmtUsd } from '../../../components/admin/format';

export default function AdminTenants() {
  const trpc = useTRPC();
  const tenants = useQuery(trpc.admin.tenants.list.queryOptions());

  return (
    <AdminScreen title="Tenants">
      {tenants.isLoading ? <LoadingView /> : null}
      {tenants.isError ? <ErrorView message="Couldn't load tenants." onRetry={() => tenants.refetch()} /> : null}
      {tenants.data && tenants.data.length === 0 ? <EmptyView message="No tenants yet" /> : null}
      {tenants.data?.map((t) => (
        <Pressable
          key={t.id}
          onPress={() => router.push({ pathname: '/admin/tenant/[id]', params: { id: t.id } })}
          accessibilityRole="button"
          accessibilityLabel={`${t.name}, ${t.warningCount} budget warnings`}
        >
          <Card>
            <View style={styles.top}>
              <Text style={styles.name} numberOfLines={2}>
                {t.name}
              </Text>
              {t.warningCount > 0 ? (
                <Chip label={`${t.warningCount} warning${t.warningCount === 1 ? '' : 's'}`} tone="danger" />
              ) : null}
            </View>
            <Text style={styles.meta} numberOfLines={2}>
              {t.ownerEmails.length > 0 ? t.ownerEmails.join(', ') : 'No owner'}
            </Text>
            <View style={styles.stats}>
              <Text style={styles.stat}>{t.activeChannelCount} active channels</Text>
              <Text style={styles.stat}>{t.runsThisWeek} runs this week</Text>
            </View>
            <Text style={styles.stat}>
              {fmtUsd(t.spendThisWeekUsd)} of {t.poolCeilingUsd === null ? 'no budget set' : `${fmtUsd(t.poolCeilingUsd)} weekly budget`}
            </Text>
          </Card>
        </Pressable>
      ))}
    </AdminScreen>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  name: { fontFamily: font.bold, fontSize: 16, color: color.ink, flex: 1 },
  meta: { ...type.meta },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  stat: { fontFamily: font.semibold, fontSize: 14, color: color.ink },
});

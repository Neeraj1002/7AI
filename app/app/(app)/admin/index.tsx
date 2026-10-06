import React from 'react';
import { Text } from 'react-native';
import { AdminScreen } from '../../../components/admin/AdminScreen';
import { type } from '../../../lib/theme';

// Placeholder until R2 builds the Overview.
export default function AdminOverview() {
  return (
    <AdminScreen title="Admin">
      <Text style={type.body}>Admin section</Text>
    </AdminScreen>
  );
}

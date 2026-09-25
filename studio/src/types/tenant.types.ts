export type Tenant = {
  id: string;
  name: string;
  // Sprint 2 Task 6 (I1) — null means "no digest ever sent yet." See
  // run-pipeline/founder-digest.ts.
  lastFounderDigestSentAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

// The MVP's single tenant row, seeded by the foundation migration.
export const MVP_TENANT_ID = '00000000-0000-0000-0000-000000000001';

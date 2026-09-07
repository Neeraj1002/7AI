export type Tenant = {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
};

// The MVP's single tenant row, seeded by the foundation migration.
export const MVP_TENANT_ID = '00000000-0000-0000-0000-000000000001';

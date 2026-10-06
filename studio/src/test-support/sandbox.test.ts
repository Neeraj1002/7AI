import { describe, it, expect } from 'vitest';
import { databaseName, isSandboxDatabase } from './sandbox';

describe('sandbox database guard', () => {
  it('accepts only names ending _sandbox or _test', () => {
    expect(isSandboxDatabase('postgresql://u:p@127.0.0.1:5432/sevenai_admin_sandbox')).toBe(true);
    expect(isSandboxDatabase('postgresql://u:p@127.0.0.1:5432/sevenai_test')).toBe(true);
  });

  it('refuses dev, preview, look-alikes and a missing url', () => {
    expect(isSandboxDatabase('postgresql://u:p@127.0.0.1:5432/sevenai_dev')).toBe(false);
    expect(isSandboxDatabase('postgresql://u:p@127.0.0.1:5432/sevenai_preview')).toBe(false);
    expect(isSandboxDatabase('postgresql://u:p@127.0.0.1:5432/sandbox_prod')).toBe(false);
    expect(isSandboxDatabase('postgresql://u:p@127.0.0.1:5432/sevenai_sandbox_backup')).toBe(false);
    expect(isSandboxDatabase('not a url')).toBe(false);
    expect(databaseName('postgresql://u:p@host/db_one?schema=x')).toBe('db_one');
  });
});

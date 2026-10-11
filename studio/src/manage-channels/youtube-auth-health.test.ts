import { describe, it, expect } from 'vitest';
import { isInvalidGrant } from './youtube-auth-health';

describe('isInvalidGrant', () => {
  it('finds invalid_grant in a message, a gaxios response body, or a wrapped cause', () => {
    expect(isInvalidGrant(new Error('invalid_grant'))).toBe(true);
    expect(isInvalidGrant({ response: { data: { error: 'invalid_grant' } } })).toBe(true);
    expect(isInvalidGrant({ message: 'YouTube upload failed', cause: new Error('invalid_grant: Token has been expired or revoked.') })).toBe(true);
    expect(isInvalidGrant({ message: 'x', lastError: { message: 'invalid_grant' } })).toBe(true);
  });
  it('ignores other errors', () => {
    expect(isInvalidGrant(new Error('quota exceeded'))).toBe(false);
    expect(isInvalidGrant(undefined)).toBe(false);
  });
});

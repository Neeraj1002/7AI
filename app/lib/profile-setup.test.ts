import { describe, expect, it } from 'vitest';
import { shouldOfferProfileSetup } from './profile-setup';

describe('shouldOfferProfileSetup', () => {
  it('does not offer setup while loading or on error', () => {
    expect(shouldOfferProfileSetup({ isSuccess: false, data: undefined })).toBe(false);
  });
  it('does not offer setup when a profile exists', () => {
    expect(shouldOfferProfileSetup({ isSuccess: true, data: { version: 1 } })).toBe(false);
  });
  it('offers setup when the query succeeded with no profile', () => {
    expect(shouldOfferProfileSetup({ isSuccess: true, data: null })).toBe(true);
  });
});

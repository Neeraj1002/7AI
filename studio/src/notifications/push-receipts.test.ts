import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  findUserById: vi.fn(),
  updateUserExpoPushToken: vi.fn(),
}));
vi.mock('../models/repositories/user.repository', () => ({
  findUserById: mocks.findUserById,
  updateUserExpoPushToken: mocks.updateUserExpoPushToken,
}));

import {
  handleTicket,
  checkReceipts,
  pendingTicketCount,
  resetPendingTickets,
  RECEIPT_MIN_AGE_MS,
  RECEIPT_MAX_AGE_MS,
  type ReceiptClient,
} from './push-receipts';

const TOKEN = 'ExponentPushToken[abc]';
const ctx = { userId: 'u1', token: TOKEN };
const T0 = 1_000_000_000_000;

function client(receipts: Record<string, unknown> | Error): ReceiptClient & { get: ReturnType<typeof vi.fn> } {
  const get = vi.fn(async () => {
    if (receipts instanceof Error) throw receipts;
    return receipts as never;
  });
  return { chunkPushNotificationReceiptIds: (ids) => [ids], getPushNotificationReceiptsAsync: get, get };
}

beforeEach(() => {
  vi.clearAllMocks();
  resetPendingTickets();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  mocks.findUserById.mockResolvedValue({ id: 'u1', expoPushToken: TOKEN });
});

describe('send-time tickets', () => {
  it('keeps an accepted ticket for the receipt check', async () => {
    await handleTicket({ status: 'ok', id: 't1' }, ctx, T0);
    expect(pendingTicketCount()).toBe(1);
  });

  it('DeviceNotRegistered error ticket clears the token and is logged without the token', async () => {
    await handleTicket({ status: 'error', message: '"ExponentPushToken[abc]" is not a registered push notification recipient', details: { error: 'DeviceNotRegistered' } }, ctx, T0);
    expect(mocks.updateUserExpoPushToken).toHaveBeenCalledWith('u1', null);
    const logged = JSON.stringify((console.error as unknown as { mock: { calls: unknown[] } }).mock.calls);
    expect(logged).not.toContain('ExponentPushToken');
    expect(logged).toContain('u1');
  });

  it('an unrelated error ticket is logged but clears nothing', async () => {
    await handleTicket({ status: 'error', message: 'too big', details: { error: 'MessageTooBig' } }, ctx, T0);
    expect(console.error).toHaveBeenCalled();
    expect(mocks.updateUserExpoPushToken).not.toHaveBeenCalled();
  });

  it('does not clear a token the user has since replaced', async () => {
    mocks.findUserById.mockResolvedValue({ id: 'u1', expoPushToken: 'ExponentPushToken[new]' });
    await handleTicket({ status: 'error', message: 'gone', details: { error: 'DeviceNotRegistered' } }, ctx, T0);
    expect(mocks.updateUserExpoPushToken).not.toHaveBeenCalled();
  });

  it('never throws, even when clearing the token fails', async () => {
    mocks.updateUserExpoPushToken.mockRejectedValue(new Error('db down'));
    await expect(
      handleTicket({ status: 'error', message: 'gone', details: { error: 'DeviceNotRegistered' } }, ctx, T0),
    ).resolves.toBeUndefined();
  });
});

describe('checkReceipts', () => {
  it('ignores tickets younger than 2 minutes', async () => {
    await handleTicket({ status: 'ok', id: 't1' }, ctx, T0);
    const c = client({});
    await checkReceipts(c, T0 + RECEIPT_MIN_AGE_MS - 1);
    expect(c.get).not.toHaveBeenCalled();
    expect(pendingTicketCount()).toBe(1);
  });

  it('an ok receipt just drops the ticket', async () => {
    await handleTicket({ status: 'ok', id: 't1' }, ctx, T0);
    await checkReceipts(client({ t1: { status: 'ok' } }), T0 + RECEIPT_MIN_AGE_MS);
    expect(pendingTicketCount()).toBe(0);
    expect(mocks.updateUserExpoPushToken).not.toHaveBeenCalled();
  });

  it('an error receipt is logged; DeviceNotRegistered clears the token', async () => {
    await handleTicket({ status: 'ok', id: 't1' }, ctx, T0);
    await checkReceipts(
      client({ t1: { status: 'error', message: 'unregistered', details: { error: 'DeviceNotRegistered' } } }),
      T0 + RECEIPT_MIN_AGE_MS,
    );
    expect(mocks.updateUserExpoPushToken).toHaveBeenCalledWith('u1', null);
    expect(pendingTicketCount()).toBe(0);
  });

  it('an unrelated receipt error does not clear the token', async () => {
    await handleTicket({ status: 'ok', id: 't1' }, ctx, T0);
    await checkReceipts(
      client({ t1: { status: 'error', message: 'fcm', details: { error: 'MessageRateExceeded' } } }),
      T0 + RECEIPT_MIN_AGE_MS,
    );
    expect(console.error).toHaveBeenCalled();
    expect(mocks.updateUserExpoPushToken).not.toHaveBeenCalled();
  });

  it('drops tickets older than 24 hours unchecked', async () => {
    await handleTicket({ status: 'ok', id: 't1' }, ctx, T0);
    const c = client({});
    await checkReceipts(c, T0 + RECEIPT_MAX_AGE_MS + 1);
    expect(c.get).not.toHaveBeenCalled();
    expect(pendingTicketCount()).toBe(0);
  });

  it('a thrown receipt call does not throw, keeps the ticket, and does not break a later send', async () => {
    await handleTicket({ status: 'ok', id: 't1' }, ctx, T0);
    await expect(checkReceipts(client(new Error('expo unreachable')), T0 + RECEIPT_MIN_AGE_MS)).resolves.toBeUndefined();
    expect(pendingTicketCount()).toBe(1);
    await expect(handleTicket({ status: 'ok', id: 't2' }, ctx, T0 + 1)).resolves.toBeUndefined();
    expect(pendingTicketCount()).toBe(2);
  });
});

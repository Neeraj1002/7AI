// Sprint 5 Task 7 — compile-time check that every Task 8 field the app reads still exists on the server's own router type
// (PR #107). This file is part of the app's type-check (test files are not), so a rename on the server stops the type-check.
import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '../../studio/src/api/router';

type Out = inferRouterOutputs<AppRouter>;
type Get = Out['runs']['get'];
type Voice = Out['options']['list']['voices'][number];

// ---- compile-time: each field name the app reads exists on the server's type ----
type Has<T, K extends string> = K extends keyof T ? true : false;
type Fields =
  | Has<Get, 'cost'>
  | Has<Get, 'videoAttempts'>
  | Has<Get, 'stageSummaries'>
  | Has<Get, 'scripts'>
  | Has<Get, 'settingsChanges'>
  | Has<Get['cost'], 'spentUsd'>
  | Has<Get['cost'], 'estimateUsd'>
  | Has<Get['cost'], 'limitUsd'>
  | Has<Get['cost'], 'retryAllowanceUsd'>
  | Has<Get['cost'], 'attemptsUsd'>
  | Has<Get['cost'], 'otherStagesUsd'>
  | Has<Get['cost'], 'unattributedUsd'>
  | Has<Get['videoAttempts'][number], 'attempt'>
  | Has<Get['videoAttempts'][number], 'outcome'>
  | Has<Get['videoAttempts'][number], 'costUsd'>
  | Has<Get['videoAttempts'][number], 'stages'>
  | Has<Get['stageSummaries'][number], 'stageId'>
  | Has<Get['stageSummaries'][number], 'outcome'>
  | Has<Get['stageSummaries'][number], 'reasonCode'>
  | Has<Get['stageSummaries'][number], 'reason'>
  | Has<Get['stageSummaries'][number], 'costUsd'>
  | Has<Get['scripts'], 'draft'>
  | Has<Get['scripts'], 'approved'>
  | Has<Get['scripts'], 'usedByVideo'>
  | Has<Voice, 'key'>
  | Has<Voice, 'label'>
  | Has<Voice, 'toneTags'>
  | Has<Voice, 'previews'>;

type UpdateIn = inferRouterInputs<AppRouter>['runs']['updateSettings'];
// The call takes the retry flag.
export const retryFlag: UpdateIn['retry'] = true;
export const contractFieldsExist: [Fields] extends [true] ? true : false = true;

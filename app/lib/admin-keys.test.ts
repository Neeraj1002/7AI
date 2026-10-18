// App tests have no runner of their own; run with the server's vitest:
//   cd studio && npx vitest run --root ../app
import { test, assert } from 'vitest';
import { whoamiQueryKey } from './admin-keys';

test('the admin check key differs per user, so one account never reads another account\'s answer', () => {
  assert.notDeepEqual(whoamiQueryKey('user-a'), whoamiQueryKey('user-b'));
  assert.notDeepEqual(whoamiQueryKey('user-a'), whoamiQueryKey(null));
  assert.deepEqual(whoamiQueryKey('user-a'), whoamiQueryKey('user-a'));
});

test('the key keeps the admin prefix the admin layout watches for FORBIDDEN errors', () => {
  assert.equal(whoamiQueryKey('user-a')[0][0], 'admin');
});

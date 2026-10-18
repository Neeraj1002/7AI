// The admin check is cached per signed-in user. A screen that stays mounted across a sign-out/sign-in
// (the stack keeps it under the login screen) keeps its original QueryClient, so a key without the user
// would hand the previous account's answer to the next one. Keep queryKey[0][0] === 'admin': the
// admin layout watches that prefix for FORBIDDEN errors.
export function whoamiQueryKey(userId: string | null) {
  return [['admin', 'whoami'], { type: 'query', userId }] as const;
}

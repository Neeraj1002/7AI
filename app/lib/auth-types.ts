// Sprint 3 backend Task 1 (J1): two roles only. Kept as a small local type
// rather than importing from studio/ — this app's tRPC AppRouter type import
// already covers the real backend types where they matter (the routed
// procedures); this one isn't part of that surface since /auth/* is plain
// REST, not tRPC (see auth-api.ts's own comment).
export type UserRole = 'owner' | 'approver';

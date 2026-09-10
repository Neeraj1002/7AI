import { initTRPC } from '@trpc/server';
import superjson from 'superjson';

// Frontend track Task 1 — auth is a single shared token checked once, at the
// Fastify layer (server.ts's onRequest hook), before a request ever reaches
// tRPC — see SCHEMA.md: no session table, nothing per-request to attach to a
// context. That keeps this file deliberately thin: no context, no auth
// middleware, just the router/procedure builders every route file imports.
//
// superjson as the transformer: several response shapes here carry real
// Date/Decimal/BigInt values (PipelineRun.completedAt, UsageEvent.costUsd,
// performance_snapshots.views, ...) — Task 2's app is meant to consume this
// router's inferred types directly, and those types only match what actually
// arrives on the wire if rich types round-trip instead of silently
// flattening to strings/numbers under plain JSON.
const t = initTRPC.create({ transformer: superjson });

export const router = t.router;
export const publicProcedure = t.procedure;

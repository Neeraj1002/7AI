import Fastify from 'fastify';
import cors from '@fastify/cors';
import { fastifyTRPCPlugin } from '@trpc/server/adapters/fastify';
import { env } from '../config/env';
import { appRouter } from './router';
import { registerVideoRoute } from './video-route';

// Frontend track Task 1 — studio/src/api/. The orchestrator process's HTTP
// surface, not a separate service (task1.md's own "Owning Component" note):
// src/index.ts calls startApiServer() alongside resumeOnStartup() and the
// Telegram bot's receive loop.

export async function startApiServer(): Promise<void> {
  if (!env.API_AUTH_TOKEN) {
    console.log('[api] API_AUTH_TOKEN not set — skipping API server startup');
    return;
  }

  const fastify = Fastify({ logger: false });

  // Task 2's app is exercised via `expo start --web` in this environment (no
  // Android/iOS simulator available), which makes every request cross-origin
  // and subject to the browser's CORS preflight — irrelevant for a native
  // app (no same-origin policy there), but without this the OPTIONS
  // preflight itself gets caught by the auth hook below and rejected before
  // the browser ever sends the real request. Registered before the auth hook
  // so its preflight short-circuit runs first; permissive origin/headers
  // since this is a dev-only single-operator API behind a bearer token, not
  // a public one.
  await fastify.register(cors, {
    origin: true,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // Single shared token, checked once, before any route logic runs — a
  // request without a valid token gets a clean 401 JSON body, not a stack
  // trace. /health is deliberately exempt (liveness only, no data), and a
  // CORS preflight OPTIONS request never carries the app's own auth header
  // by design, so it's exempt too (the plugin above already answered it).
  fastify.addHook('onRequest', async (request, reply) => {
    if (request.url === '/health' || request.method === 'OPTIONS') return;

    const header = request.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : undefined;
    if (!token || token !== env.API_AUTH_TOKEN) {
      await reply.code(401).send({ error: 'unauthorized' });
    }
  });

  fastify.get('/health', async () => ({ ok: true }));

  await registerVideoRoute(fastify);

  await fastify.register(fastifyTRPCPlugin, {
    prefix: '/trpc',
    trpcOptions: { router: appRouter },
  });

  await fastify.listen({ port: env.API_PORT, host: '0.0.0.0' });
  console.log(`[api] listening on port ${env.API_PORT} (prefix /trpc, auth required)`);
}

import Fastify from 'fastify';
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

  // Single shared token, checked once, before any route logic runs — a
  // request without a valid token gets a clean 401 JSON body, not a stack
  // trace. /health is deliberately exempt (liveness only, no data).
  fastify.addHook('onRequest', async (request, reply) => {
    if (request.url === '/health') return;

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

import Fastify from 'fastify';
import cors from '@fastify/cors';
import { fastifyTRPCPlugin } from '@trpc/server/adapters/fastify';
import { env } from '../config/env';
import { appRouter } from './router';
import { createContext } from './trpc';
import { registerVideoRoute } from './video-route';
import { requestMagicLink, verifyMagicLink, resolveRequestIdentity, isAuthConfigured } from '../auth';
import { exchangeYoutubeAuthCode } from '../manage-channels/youtube-oauth-connect';

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
  // a public one. Sprint 3 Task 1: stays permissive for this task — a real
  // allow-list is a natural follow-on once a real deployed frontend origin
  // exists, tracked in KNOWN_ISSUES_AND_BLOCKERS.md, not blocking here.
  await fastify.register(cors, {
    origin: true,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // Sprint 3 Task 1 (J2) — a request without a valid real session OR the
  // API_AUTH_TOKEN ops fallback gets a clean 401 JSON body, not a stack
  // trace. /health (liveness only, no data), a CORS preflight OPTIONS
  // request (the plugin above already answered it), and /auth/* (these ARE
  // the endpoints that issue/verify a session — a request here can't
  // already carry one) are exempt. classification logic lives in
  // auth/request-identity.ts, shared with api/trpc.ts's createContext so
  // the two can't drift out of sync.
  fastify.addHook('onRequest', async (request, reply) => {
    // Sprint 3 Task 5 (M2) — /oauth2callback is hit by a real Google
    // redirect, which can never carry our own Authorization header;
    // authorization comes entirely from the signed `state` parameter
    // (auth/jwt.ts's OAuth-state token) verified inside the handler itself.
    if (
      request.url === '/health' ||
      request.method === 'OPTIONS' ||
      request.url.startsWith('/auth/') ||
      request.url.startsWith('/oauth2callback')
    )
      return;

    const identity = resolveRequestIdentity(request.headers.authorization);
    if (identity.kind === 'unauthenticated') {
      await reply.code(401).send({ error: 'unauthorized' });
    }
  });

  fastify.get('/health', async () => ({ ok: true }));

  // Sprint 3 Task 1 (J2) — magic-link email. No self-serve account creation
  // (see auth/magic-link.ts's own comment); an unrecognized email gets the
  // same generic response as a recognized one, so the API can't be used to
  // enumerate who has an account.
  fastify.post<{ Body: { email?: string } }>('/auth/request-link', async (request, reply) => {
    if (!isAuthConfigured()) {
      return reply.code(503).send({ error: 'auth is not configured on this server (JWT_SECRET unset)' });
    }
    const email = request.body?.email;
    if (!email || typeof email !== 'string') {
      return reply.code(400).send({ error: 'email is required' });
    }
    await requestMagicLink({ email });
    return reply.send({ message: 'If that email has an account, a login link was sent.' });
  });

  fastify.get<{ Querystring: { token?: string } }>('/auth/verify', async (request, reply) => {
    if (!isAuthConfigured()) {
      return reply.code(503).send({ error: 'auth is not configured on this server (JWT_SECRET unset)' });
    }
    const { token } = request.query;
    if (!token) {
      return reply.code(400).send({ error: 'token is required' });
    }
    const result = await verifyMagicLink(token);
    if (!result.ok) {
      // A specific, real reason ("expired," "already used") rather than a
      // generic 401 — J2's own Failure Modes note: a real user should
      // understand what happened, not assume their account is broken.
      return reply.code(401).send({ error: result.error });
    }
    return reply.send({ sessionToken: result.sessionToken, session: result.session });
  });

  // Sprint 3 Task 5 (M2) — Google's own real redirect target. A plain
  // browser-facing route (not tRPC — a JSON-RPC shape doesn't fit "Google
  // redirects a browser here"), same posture video-route.ts's own comment
  // already established for why streaming/redirect endpoints stay REST.
  // Returns plain text (not JSON) since a human is looking at this tab, not
  // an API consumer.
  fastify.get<{ Querystring: { code?: string; state?: string; error?: string } }>(
    '/oauth2callback',
    async (request, reply) => {
      const { code, state, error } = request.query;
      if (error) {
        return reply.code(400).type('text/plain').send(`Connection cancelled or failed: ${error}. You can close this tab.`);
      }
      if (!code || !state) {
        return reply.code(400).type('text/plain').send('Missing code or state — this link is invalid. Close this tab and try connecting again from the app.');
      }
      const result = await exchangeYoutubeAuthCode({ code, state });
      if (!result.ok) {
        return reply.code(400).type('text/plain').send(result.error);
      }
      return reply.type('text/plain').send('Connected! You can close this tab and return to the app.');
    },
  );

  await registerVideoRoute(fastify);

  await fastify.register(fastifyTRPCPlugin, {
    prefix: '/trpc',
    trpcOptions: { router: appRouter, createContext },
  });

  await fastify.listen({ port: env.API_PORT, host: '0.0.0.0' });
  console.log(`[api] listening on port ${env.API_PORT} (prefix /trpc, auth required)`);
}

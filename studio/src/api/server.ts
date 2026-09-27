import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { fastifyTRPCPlugin } from '@trpc/server/adapters/fastify';
import { env } from '../config/env';
import { appRouter } from './router';
import { createContext } from './trpc';
import { registerVideoRoute } from './video-route';
import { registerWatermarkRoute } from './watermark-route';
import { requestMagicLink, verifyMagicLink, resolveRequestIdentity, isAuthConfigured } from '../auth';
import { exchangeYoutubeAuthCode } from '../manage-channels/youtube-oauth-connect';
import { insertBugReport } from '../models/repositories/bug-report.repository';
import { BUG_REPORT_PAGE_HTML } from './bug-report-page';

// Frontend track Task 1 — studio/src/api/. The orchestrator process's HTTP
// surface, not a separate service (task1.md's own "Owning Component" note):
// src/index.ts calls startApiServer() alongside resumeOnStartup() and the
// periodic background checkers (Performance Analytics poll, gate reminder,
// founder digest).

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
    // Sprint 3 Task 9 (R3) — DELETE added for the watermark-remove route;
    // no prior route in this project needed it.
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // Sprint 3 Task 9 (R3) — the only route that needs multipart today
  // (watermark-route.ts's upload); registered globally rather than
  // per-route, which is the plugin's normal usage.
  await fastify.register(multipart);

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
      request.url.startsWith('/oauth2callback') ||
      // Testing-phase utility (see bug-report-page.ts) — deliberately
      // unauthenticated: a tester reporting "I can't log in" must still be
      // able to submit that report.
      request.url.startsWith('/bugs')
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
  // Bugs Task 3 (R5) — telegramChatId is optional, same no-enumeration
  // posture as email: never validated/looked-up here in a way that could
  // tell the caller whether it's already on file for anyone.
  fastify.post<{ Body: { email?: string; telegramChatId?: string } }>(
    '/auth/request-link',
    async (request, reply) => {
      if (!isAuthConfigured()) {
        return reply.code(503).send({ error: 'auth is not configured on this server (JWT_SECRET unset)' });
      }
      const email = request.body?.email;
      if (!email || typeof email !== 'string') {
        return reply.code(400).send({ error: 'email is required' });
      }
      const telegramChatId = request.body?.telegramChatId;
      await requestMagicLink({
        email,
        ...(typeof telegramChatId === 'string' && telegramChatId.trim() && { telegramChatId }),
      });
      return reply.send({ message: 'If that email has an account, a login link was sent.' });
    },
  );

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
  await registerWatermarkRoute(fastify);

  // Testing-phase utility — a lightweight, unauthenticated bug inbox for
  // manual app testing. GET serves the form (reading runId/screen from its
  // own query string client-side — see bug-report-page.ts); POST records
  // it. Deliberately outside tRPC/the tenant model (see schema.prisma's
  // BugReport comment) and meant to be removed or formalized once real
  // testing winds down, not carried forward as-is.
  fastify.get('/bugs', async (_request, reply) => {
    return reply.type('text/html').send(BUG_REPORT_PAGE_HTML);
  });

  // A syntactically-invalid runId (never expected from the app's own
  // ReportBugButton, which only ever sends a real route param, but this
  // endpoint is unauthenticated and reachable directly) would otherwise
  // throw a raw Postgres error on insert (runId is `@db.Uuid`) — dropped to
  // null instead rather than rejecting the whole report over a field that's
  // not FK-enforced anyway (schema.prisma's own "a bad/garbage runId is
  // trivially obvious when triaging" decision).
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  fastify.post<{ Body: { description?: string; runId?: string; screenContext?: string } }>(
    '/bugs',
    async (request, reply) => {
      const description = request.body?.description?.trim();
      if (!description) {
        return reply.code(400).send({ error: 'description is required' });
      }
      const runId = request.body?.runId;
      await insertBugReport({
        description,
        runId: runId && UUID_RE.test(runId) ? runId : null,
        screenContext: request.body?.screenContext?.trim() || null,
        // Captured server-side, never from the client body — more reliable
        // and free (no tester involvement at all).
        userAgent: request.headers['user-agent'] ?? null,
      });
      return reply.send({ ok: true });
    },
  );

  await fastify.register(fastifyTRPCPlugin, {
    prefix: '/trpc',
    trpcOptions: { router: appRouter, createContext },
  });

  await fastify.listen({ port: env.API_PORT, host: '0.0.0.0' });
  console.log(`[api] listening on port ${env.API_PORT} (prefix /trpc, auth required)`);
}

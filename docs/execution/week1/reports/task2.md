# Week 1 Task 2: PostgreSQL Local Setup

**Date**: 2026-09-07
**Status**: Complete
**Tests**: Connection verified via `SELECT 1`-equivalent query and Prisma migrate

## What Was Done

- Postgres was already installed and running locally as a Windows service (**PostgreSQL 18.6**,
  `postgresql-x64-18`) — no fresh install or Docker container needed.
- Created a dedicated, least-privilege app role and database rather than using the `postgres`
  superuser for the app itself:
  - Role: `sevenai_app` (login + password, granted `CREATEDB` so `prisma migrate dev`'s shadow
    database works locally)
  - Database: `sevenai_dev`, owned by `sevenai_app`
- `DATABASE_URL` set in both `.env.local` (app runtime) and `.env` (Prisma CLI — see Deviations).
- Connectivity verified two ways: a direct `psql` query as `sevenai_app`, and a successful
  `prisma migrate dev` / `prisma migrate deploy` run against `sevenai_dev` (Task 3).

## Deviations from Spec

- The doc's "Docker (`postgres:15`+)" suggestion wasn't needed — a newer, already-running
  local install (PG18) covers the same requirement with less new infrastructure. Flagging
  since the doc assumed Docker as the default path.
- **Two env files, not one**: Prisma's CLI only auto-loads a root `.env` (not `.env.local`),
  while the app's own loader (`src/config/env.ts`) reads `.env.local` per the doc's naming
  convention. Rather than rename `.env.local` (which would break the doc's own naming), added
  a root `.env` containing just `DATABASE_URL`, gitignored identically. Both files must be
  kept in sync if `DATABASE_URL` ever changes — a minor duplication, flagged here rather than
  silently introduced.
- Postgres superuser (`postgres`) password was not known ahead of time and had to be obtained
  from the founder directly in chat, since no `.pgpass` or env var had it. No lasting risk —
  it was used only once, interactively, to create the dedicated `sevenai_app` role.

## Sign-Off

- Task Objective: Met
- Tests: Passing
- Ready for Integration: Yes

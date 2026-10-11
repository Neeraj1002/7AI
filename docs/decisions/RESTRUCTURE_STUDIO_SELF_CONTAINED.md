# 7AI Restructure: make `studio/` a self-contained project folder

**Paste this whole file into Claude Code, running inside `D:\Study Material\7AI`.**

## Why

The previous restructure renamed `src/` → `studio/` as a flat rename — `studio/` ended up holding the code (types, models, run-pipeline, etc.), while `package.json`, `tsconfig.json`, `node_modules/`, `dist/`, `scripts/`, and `eslint.config.js` stayed at the `7AI/` repo root. That's not what was intended: `studio/` should be a **self-contained project folder** — its own `src/`, its own `package.json`, its own `tsconfig.json`, its own build tooling — not just a renamed source directory sitting alongside a repo-root `package.json`.

This matters because `AGENT_FLEET_DESIGN.md` Section 10 already anticipates more top-level code folders later (e.g. a future `7AI/scriptwriter/` if an individual agent's code grows large enough to warrant its own folder). If `studio/` is going to be one of potentially several sibling code folders eventually, it should be self-contained from the start — each folder owning its own toolchain — rather than sharing one repo-root `package.json` that would need retrofitting later. This does **not** mean setting up npm/pnpm workspaces or monorepo tooling right now — there's still only one package. It just means commands run from inside `studio/` (`cd studio && npm run build`) instead of from the repo root. `docs/` and `.git` stay exactly where they are, at the `7AI/` root.

## Target shape

```
7AI/
├── docs/                    ← unchanged
├── .git/, .gitignore        ← unchanged, stay at repo root
└── studio/                  ← now a complete, independently-buildable project
    ├── package.json
    ├── package-lock.json
    ├── tsconfig.json
    ├── eslint.config.js
    ├── .env
    ├── .env.local
    ├── .env.example
    ├── node_modules/        ← reinstalled fresh inside studio/, not moved
    ├── dist/                ← rebuilt fresh inside studio/, not moved
    ├── scripts/
    └── src/                 ← everything currently directly under studio/ moves one level deeper
        ├── types/
        ├── models/
        ├── run-pipeline/
        ├── manage-channels/
        ├── notify-founder/
        ├── config/
        └── index.ts
```

## Steps

### 1. Nest the code one level deeper

Inside `studio/`, create a `src/` folder and `git mv` everything currently directly under `studio/` into it: `types/`, `models/`, `run-pipeline/`, `manage-channels/`, `notify-founder/`, `config/`, `index.ts`.

### 2. Move the project's tooling files into `studio/`

`git mv` these from the `7AI/` root into `studio/`:
- `package.json`
- `package-lock.json`
- `tsconfig.json`
- `eslint.config.js`
- `scripts/`

### 3. Move the env files into `studio/`

`.env`, `.env.local`, `.env.example` move into `studio/` too (plain move for `.env`/`.env.local` since they're gitignored; `git mv` for `.env.example` since it's tracked). This matters, not just for tidiness: `studio/src/config/env.ts` resolves `.env.local` via `path.resolve(process.cwd(), '.env.local')` — once commands run with `studio/` as the working directory, `process.cwd()` is `studio/`, so `.env.local` needs to be there too, or the app won't find it.

### 4. Don't move `node_modules/` or `dist/` — regenerate them

Delete the repo-root `node_modules/` and `dist/` rather than moving them, then reinstall/rebuild fresh from inside `studio/` (step 7). Cheap to regenerate, and avoids any risk of a half-moved, stale `node_modules`.

### 5. Update `tsconfig.json` (now at `studio/tsconfig.json`)

All paths are now relative to `studio/`, not to the repo root:
- `"rootDir": "studio"` → `"rootDir": "src"`
- `"include": ["studio/**/*.ts"]` → `"include": ["src/**/*.ts"]`
- `"paths": { "@/*": ["studio/*"] }` → `"paths": { "@/*": ["src/*"] }`
- `"outDir": "dist"` stays as-is (still relative to `studio/`, now correctly resolving to `studio/dist`).

### 6. Update `package.json` (now at `studio/package.json`)

- `"dev": "tsx watch studio/index.ts"` → `"dev": "tsx watch src/index.ts"`
- `"prisma": { "schema": "studio/models/schema.prisma" }` → `"prisma": { "schema": "src/models/schema.prisma" }`
- `"main": "dist/index.js"` stays as-is.

### 7. Reinstall and rebuild from inside `studio/`

From `studio/`: `npm install`, then `npm run prisma:generate` (the schema path changed), then verify in order: `npm run typecheck`, `npm run build`, `npm run lint`. Confirm each passes clean before moving to the next. Do **not** run a new Prisma migration — only the schema file's location changed, not its contents.

### 8. `.gitignore` sanity check

`.gitignore` patterns without a leading `/` (e.g. `node_modules/`, `dist/`, `.env`, `.env.local`) match at any depth, so they should already cover `studio/node_modules/`, `studio/dist/`, `studio/.env`, `studio/.env.local` without changes needed — but double-check `git status` after the move shows nothing unexpected being tracked (no `node_modules` or `dist` contents staged).

### 9. Search for stray references

Grep the repo (excluding `node_modules/`, `dist/`, `.git/`) for old-shape paths that should now include `src/` — anything referencing `studio/types/`, `studio/models/`, `studio/run-pipeline/`, `studio/manage-channels/`, `studio/notify-founder/`, `studio/config/`, or `studio/index.ts` directly (should now read `studio/src/...`). Do **not** touch references to `studio/package.json`, `studio/tsconfig.json`, `studio/node_modules`, `studio/dist`, or `studio/scripts` — those are correct as-is, they don't get an extra `src/`.

### 10. Commit

Stage everything (`git add -A`) and commit with a message like:

```
Restructure: make studio/ a self-contained project folder

- studio/{types,models,run-pipeline,manage-channels,notify-founder,config,index.ts} -> studio/src/
- package.json, tsconfig.json, eslint.config.js, scripts/, .env* moved into studio/
- node_modules/, dist/ regenerated fresh inside studio/, not moved
- tsconfig.json and package.json updated to match (rootDir/include/paths, dev script, prisma schema path)
- no schema, business-logic, or behavioral changes
```

Don't push unless asked to.

## Report

After verification passes, report back briefly: confirm the new shape matches the target above, and whether `typecheck`/`build`/`lint`/`prisma generate` all passed clean. Flag anything step 9 turned up that needed a manual fix beyond the obvious path additions.

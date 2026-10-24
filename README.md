# PWa: interactive audio platform (MVP)

A subscription PWA for legal, adults-only interactive audio: branching sessions where the listener
makes choices and the audio adapts. It's self-hosted on a single VPS with Docker Compose (SvelteKit +
Postgres + Caddy).

All content in this repo is placeholder: generated test tones and neutral labels. See
[ASSUMPTIONS.md](ASSUMPTIONS.md) for constraints, decisions and unverified items.

> Status: **Phase 2 (public pages, magic-link sign-in, default-deny gate, geo-blocking)**. Later
> phases add age verification, the player, payments and ops. Design system: [DESIGN.md](DESIGN.md).

## Prerequisites

- Docker Desktop (Windows/macOS) or Docker Engine + the Compose plugin (Linux), Compose ≥ 2.20
- Node.js ≥ 22.12 (24 LTS recommended) for running tooling outside Docker
- ffmpeg, for generating placeholder audio (from Phase 1)

## Quick start (Docker)

```sh
cp .env.example .env          # dev defaults work as-is
docker compose up --build     # app + postgres + caddy (+ mailpit in the dev profile)
```

- App: <https://localhost> (Caddy's local CA; your browser will warn until you trust it)
- Health: <https://localhost/healthz> → `{"status":"ok"}`
- Mailpit (dev): <http://127.0.0.1:8025>. Sign-in links arrive here.

Migrations run automatically when the app container starts. For geo-blocking by IP, also run
`npm run geoip:fetch` once (and monthly), then `docker compose restart app`.

## Local development (app on the host, services in Docker)

```sh
npm ci
cp .env.example .env
printf 'POSTGRES_HOST=localhost
SMTP_URL=smtp://localhost:1025
' > .env.development.local
docker compose up -d postgres mailpit
npm run db:migrate            # applies ./drizzle migrations (reads .env, then .env.development.local)
npm run dev                   # http://localhost:5173
```

`.env` is written for containers (hosts `postgres`, `mailpit`). `.env.development.local` overrides
it for processes on your machine and is never committed.

## Tests

```sh
npm test                      # unit tests (Vitest; DB tests use in-process PGlite, no Docker needed)
npx playwright install chromium webkit   # once
npm run test:e2e              # e2e on mobile Safari (WebKit) + mobile Chrome emulation
```

By default `test:e2e` builds the app and starts a self-contained stack (`scripts/e2e-server.ts`:
PGlite over its Postgres socket, with sign-in emails written to `.outbox-e2e/`). To run against the compose
stack instead: `E2E_BASE_URL=https://localhost MAILPIT_URL=http://127.0.0.1:8025
E2E_GEO_URL=http://127.0.0.1:3000 npm run test:e2e`.

## Scripts

| Command                       | What it does                                               |
| ----------------------------- | ---------------------------------------------------------- |
| `npm run dev`                 | Vite dev server                                            |
| `npm run build` / `npm start` | Production build / run migrations then serve `build/`      |
| `npm run check`               | svelte-check + TypeScript (strict), fails on warnings      |
| `npm run lint`                | Prettier check + ESLint                                    |
| `npm test`                    | Vitest unit tests                                          |
| `npm run test:e2e`            | Playwright e2e (see Tests)                                 |
| `npm run check:banned`        | Fails if a banned vendor is depended on or referenced      |
| `npm run db:generate`         | Generate a migration from `src/lib/server/db/schema.ts`    |
| `npm run db:migrate`          | Apply migrations                                           |
| `npm run audio:placeholder`   | Generate placeholder clips with ffmpeg (`--force` to redo) |
| `npm run validate:sessions`   | Validate every session graph and its clip files            |
| `npm run sessions:schema`     | Regenerate `sessions/session.schema.json`                  |
| `npm run geoip:fetch`         | Download the DB-IP Lite country database to `data/geoip/`  |

## Sessions

A session is a JSON file in `sessions/`, named after its id. Editors pick up
`sessions/session.schema.json` (via `"$schema"`) for autocomplete.

| Node     | Plays its clip…          | Then                                                                          |
| -------- | ------------------------ | ----------------------------------------------------------------------------- |
| `play`   | once                     | `next`                                                                        |
| `choice` | as a looping bed         | the picked option's `target` (2–3 options); `defaultTarget` after `timeoutMs` |
| `timer`  | looping, for `timeoutMs` | `defaultTarget`; a tap before then goes to `next`                             |
| `loop`   | repeatedly               | `next` when the listener taps                                                 |
| `end`    | once                     | session complete                                                              |

Any edge (`next`, `target`, `defaultTarget`) can be a node id, or a list of
`{ "when": …, "target": … }` branches whose last entry has no `when`. Options can `set` keys
declared in the session's `state`.

`npm run validate:sessions` fails on:

- schema errors
- a session id that doesn't match its file name
- duplicate node ids
- a missing start node
- dangling targets
- undeclared or mistyped state keys
- unreachable nodes
- non-`end` dead ends
- cycles with no exit from a choice, loop or timer node
- missing `.opus`/`.m4a` clips

Each error class has a fixture in `tests/fixtures/sessions/`.

## Environment variables

All configuration lives in `.env` (never committed). [.env.example](.env.example) documents each
variable and its production value. The app validates its config at boot and refuses to start if it's
invalid (for example, mock providers in production).

| Variable                                      | Required | Notes                                                                   |
| --------------------------------------------- | -------- | ----------------------------------------------------------------------- |
| `APP_ENV`                                     | yes      | `development` \| `test` \| `staging` \| `production`; no default        |
| `ORIGIN`                                      | yes      | Public origin, e.g. `https://example.com` (must be https in production) |
| `POSTGRES_USER/PASSWORD/DB` or `DATABASE_URL` | yes      | DB credentials (shared with the postgres container)                     |
| `POSTGRES_HOST`, `POSTGRES_PORT`              | no       | `postgres:5432` in `.env`; `localhost` in `.env.development.local`      |
| `SMTP_URL`, `EMAIL_FROM`                      | yes      | Sign-in email. Mailpit in dev; keep the sender name neutral             |
| `EMAIL_TRANSPORT`                             | no       | `smtp`                                                                  | `outbox` (JSON files; development/test only)                |
| `MAGIC_LINK_TTL_MINUTES`, `SESSION_TTL_DAYS`  | no       | 15 and 30 by default                                                    |
| `AUTH_LINKS_PER_IP`                           | no       | Sign-in link requests per IP per 15 min (default 10)                    |
| `BLOCKED_COUNTRIES`                           | prod     | ISO codes, comma-separated; must be set (maybe empty) in production     |
| `GEO_UNKNOWN_POLICY`                          | prod     | `allow`                                                                 | `block` when the country is unknown; required in production |
| `GEOIP_DB_PATH`                               | no       | Default `data/geoip/dbip-country-lite.mmdb`                             |
| `PLANS_CONFIG`                                | no       | Plans and prices file, default `config/plans.json`                      |
| `AV_PROVIDER`                                 | no       | `mock` (dev only) \| `yoti`                                             |
| `PAYMENT_PROVIDER`                            | no       | `mock` (dev only) \| `verotel`                                          |
| `STORAGE_DRIVER`                              | no       | `local` \| `bunny`                                                      |
| `ALLOW_MOCKS`                                 | no       | Staging only; refused in production                                     |
| `DOMAIN`                                      | no       | Caddy site address; `localhost` in dev                                  |
| `HSTS_MAX_AGE`                                | prod     | ≥ 15552000 in production                                                |
| `GEO_COUNTRY_HEADER`                          | no       | Country header name from a trusted upstream                             |
| `COMPOSE_PROFILES`                            | no       | `dev` or `prod`                                                         |

## Layout

```
compose.yaml            includes infra/docker-compose.yml so `docker compose up` works from the root
infra/                  Dockerfile, compose stack, Caddyfile, migration runner
drizzle/                generated SQL migrations
src/lib/engine/         session schema, runtime and validator (shared by server and player)
src/lib/server/         server-only code (config, db, content, …)
src/lib/server/access.ts default-deny route policy (every route is gated unless listed public)
src/lib/components/     design-system components (Leader = the signature countdown)
src/routes/             SvelteKit routes
config/plans.json       plans and prices (placeholder values)
sessions/               session graphs (placeholder demos) + generated JSON Schema
content/audio/          clip files (generated or real; not committed)
scripts/                CI and maintenance scripts
tests/unit/             Vitest
e2e/                    Playwright (mobile Safari + mobile Chrome emulation)
```

## Deploying to a fresh VPS

Covered in Phase 6, together with the backup/restore guide (`infra/restore.md`) and `RUNBOOKS.md`.

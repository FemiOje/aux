# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**Aux**: music fans post a song with a short note (a **drop**), others play and save it, and can tip the curator on Monad. Audio is never stored or streamed by us; songs play in the browser via YouTube/Spotify embeds.

`README.md` is the architecture guide (glossary, tech stack, module layout, 13-table schema, ERD, user flows, API/WebSocket spec). It describes the **target** design; most of it isn't built yet. Today the repo has: a bare Vite + React app, a Fastify server with `/`, `/db`, `/redis` health routes, the full Drizzle schema + seed, `@aux/shared` Zod schemas, and the `Curation` contract. Build toward the README, one piece at a time. Don't assume missing pieces (router, TanStack Query, worker, indexer, modules, lint, tests) exist.

Older hackathon notes (`ideas.md`, `execution.md`, `tracks-eligibility.md`, `inspo/`) are from the pre-Aux order-book exploration. `hackathon-resources.md` is still the go-to for Monad links, RPCs, and indexers.

## Layout

pnpm workspace (`pnpm-workspace.yaml`): `apps/web`, `apps/server`, `packages/shared`. `contracts/` is a separate Foundry project (not a pnpm package).

- `apps/web`: Vite + React 19. In dev, Vite proxies `/api/*` to the server on port 3000 and strips the `/api` prefix, so the server's routes have no `/api` prefix. Only `VITE_*` env vars reach the browser.
- `apps/server`: Fastify API, run with `tsx` (no build step). Scripts load the root `.env` via `--env-file-if-exists=../../.env`; `drizzle.config.ts` loads it with `process.loadEnvFile`. DB client in `src/db/index.ts`, schema in `src/db/schema.ts`, migrations in `src/db/migrations/`.
- `packages/shared`: types + Zod schemas imported by both web and server (`exports` points straight at `src/index.ts`).
- `contracts`: `src/Curation.sol` records drops (hashes only) and forwards tips in the same call; it never holds funds.

## Architecture rules (from README)

- Postgres is the source of truth; Redis holds only rebuildable data (room pub/sub, cache, rate limits).
- Onchain: only drop records (recording-ID hash + note hash) and tips. Everything else lives in Postgres. An Envio indexer copies contract events into Postgres.
- Core code never calls a music service directly. It goes through a **port** interface (`PlaybackPort`, `ResolvePort`, `ImportPort`) implemented by **adapters** (web: `src/player/`; server: `src/adapters/`).
- Server modules (`identity`, `catalog`, `drops`, `rooms`, `taste`) each have `routes.ts → service.ts → repository.ts`, plus `index.ts` as the public surface. Only a module's repository touches its tables; other modules import only from `index.ts`.

## Commands

From the repo root (see `SETUP.md` for first-time setup):

```bash
docker compose up -d   # Postgres 18 + Redis 7
pnpm dev               # web (5173) + server (3000) in parallel
pnpm typecheck         # tsc across packages
pnpm db:generate       # after editing schema.ts
pnpm db:migrate
pnpm db:seed
```

Contracts, from `contracts/`. CI (`.github/workflows/test.yml`) runs these in order, and a contract change isn't done until all three pass:

```bash
forge fmt --check
forge build --sizes
forge test -vvv
forge test --mt <testName> -vvv   # single test
```

Deploy: `forge script script/Curation.s.sol --rpc-url $MONAD_RPC_URL --account <keystore> --broadcast`.

## Conventions

- Monad differs from Ethereum (see `.claude/rules/monad-differences.md`, loaded automatically). Prefer the `monad-docs` MCP server over memory for Monad behavior.
- New contracts follow the user's `/sol-style-guide` skill: its file layout, section ordering, and full NatSpec.
- `contracts/lib/forge-std` and `contracts/lib/openzeppelin-contracts` are git submodules. Never edit them.
- Server code uses single quotes and no semicolons; web and shared use double quotes with semicolons. Match the file you're in.
- UI sound effects: when the user asks for interaction sounds, use [cuelume](https://www.npmjs.com/package/cuelume) (not installed yet) and follow its agent guide at https://cuelume-site.pages.dev/agents.md. Don't add it until asked.

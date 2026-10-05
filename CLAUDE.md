# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**Aux**: music fans post a song with a short note (a **drop**), others play and save it, and can tip the curator on Monad. Audio is never stored or streamed by us; songs play in the browser via YouTube/Spotify embeds.

`README.md` is the architecture guide (glossary, tech stack, module layout, 14-table schema, ERD, user flows, API/WebSocket spec). It describes the **target** design; most of it isn't built yet. Today the repo has: the full Drizzle schema + seed, `@aux/shared` Zod schemas, the `Curation` contract, and one slice end to end: `GET /feed`, `GET /drops/:id` and `POST /drops` on the server (`drops` module; `POST /drops` needs a session, takes a `link` and a `note`, and answers 422 `RECORDING_UNCLEAR` when the link resolves only to close matches; picking a match is in the README backlog; `POST /drops/:id/save` and `DELETE /drops/:id/save` need a session, are idempotent, and answer with the drop (your own drops can be saved too); every drop carries `saved` for the viewer, so `GET /feed` and `GET /drops/:id` call the identity module's `optionalUser(request)`, which is anonymous with no `Authorization` header and 401s on a bad one), `POST /catalog/resolve` behind `ResolvePort` with a YouTube oEmbed adapter (YouTube links only), sign-in on the server (`POST /auth/session` swaps a Privy identity token, verified behind `AuthPort`, for a session token stored hashed in `sessions`; `DELETE /auth/session` deletes that session on sign-out; `GET /me`; signed-in routes call the identity module's `requireUser(request)`), and a web feed (React Router, TanStack Query, Zustand) that plays drops through `PlaybackPort` with a YouTube adapter. Build toward the README, one piece at a time. The web header has Privy email sign-in (`src/auth/AuthProvider.tsx`, `AccountMenu`), which swaps the identity token for our session and keeps it in the `useSession` store; every API request sends the session token when one is live, and a 401 on a request that carried it clears the session so `AccountMenu` swaps the identity token again (`src/api/client.ts`), the feed page has a post-a-drop form (`DropComposer`), and each drop card has a `SaveButton` (hidden when signed out; feed and drop queries are keyed by the signed-in user's id). Users are not technical: the UI shows only the friendly texts from `src/api/errors.ts` (`friendlyError`), never status codes, error codes or server messages, and never asks for an internal ID. Don't assume missing pieces (`PATCH /me`, a saved-drops list, tipping with a save, catalog search, MusicBrainz/song.link adapters, worker, indexer, rooms, taste, Spotify/preview adapters, lint) exist.

Older hackathon notes (`ideas.md`, `execution.md`, `tracks-eligibility.md`, `inspo/`) are from the pre-Aux order-book exploration. `hackathon-resources.md` is still the go-to for Monad links, RPCs, and indexers.

## Layout

pnpm workspace (`pnpm-workspace.yaml`): `apps/web`, `apps/server`, `packages/shared`. `contracts/` is a separate Foundry project (not a pnpm package).

- `apps/web`: Vite + React 19. In dev, Vite proxies `/api/*` to the server on port 3000 and strips the `/api` prefix, so the server's routes have no `/api` prefix. Vite reads the root `.env` (`envDir`); only `VITE_*` env vars reach the browser.
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
pnpm test              # Vitest (server + web); server tests need Postgres up and seeded
pnpm --filter server exec vitest run -t <testName>   # single test
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

Deploy: `forge script script/Curation.s.sol --rpc-url $ALCHEMY_MONAD_TESTNET_RPC_URL --account <keystore> --broadcast`.

## Conventions

- Monad differs from Ethereum (see `.claude/rules/monad-differences.md`, loaded automatically). Prefer the `monad-docs` MCP server over memory for Monad behavior.
- New contracts follow the user's `/sol-style-guide` skill: its file layout, section ordering, and full NatSpec.
- `contracts/lib/forge-std` and `contracts/lib/openzeppelin-contracts` are git submodules. Never edit them.
- Server code uses single quotes and no semicolons; web and shared use double quotes with semicolons. Match the file you're in.
- UI sound effects: when the user asks for interaction sounds, use [cuelume](https://www.npmjs.com/package/cuelume) (not installed yet) and follow its agent guide at https://cuelume-site.pages.dev/agents.md. Don't add it until asked.

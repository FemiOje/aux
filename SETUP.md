# Setup

Get a local copy running on Linux, macOS, or Windows.

## 1. Install prerequisites

- **Git**, **Node.js 22+**, and **pnpm** (`npm install -g pnpm`).
- **Docker** (Docker Desktop on macOS/Windows) to run Postgres and Redis.
- **Foundry v1.8.0+**: run `curl -L https://foundry.paradigm.xyz | bash`, then `foundryup`.

**Windows:** run everything inside [WSL2](https://learn.microsoft.com/windows/wsl/install) (Ubuntu), since Foundry has no native Windows support. Enable Docker Desktop's WSL2 integration so `docker` works from the WSL shell.

## 2. Clone the repo

```bash
git clone --recurse-submodules https://github.com/FemiOje/scrip.git
cd scrip
```

If you already cloned without submodules, run `git submodule update --init --recursive`.

## 3. Configure environment

```bash
cp .env.example .env
```

The defaults work for local dev. Ask a teammate for the `PRIVY_*` and `TOKEN_ENCRYPTION_KEY` values if you need auth.

## 4. Install dependencies

```bash
pnpm install
```

## 5. Start Postgres and Redis

```bash
docker compose up -d
```

## 6. Set up the database

```bash
pnpm db:migrate
pnpm db:seed
```

## 7. Run the app

```bash
pnpm dev
```

This starts the API on `http://localhost:3000` and the web app on the URL Vite prints (usually `http://localhost:5173`).

## 8. Build and test contracts

```bash
cd contracts
forge fmt --check && forge build --sizes && forge test -vvv
```

These are the same checks CI runs, so all three must pass before you push.

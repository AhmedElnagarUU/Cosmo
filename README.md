# Cosmo — B2B Wholesale Platform

A platform for small and medium wholesalers in Egypt who sell pharmaceutical and cosmetics products to pharmacies and retail stores.

**Current stage: all nine build phases are written and tested, waiting for the project owner to try them.** Next is the pilot with one wholesaler. Planning documents are in `docs/`. Code is in `apps/` and `packages/`.

## Where to start reading

| Order | Document | What it answers |
|---|---|---|
| 1 | [Overview](docs/00-overview.md) | What are we building, and for whom? |
| 2 | [Decisions](docs/02-decisions.md) | What is confirmed, what is assumed, what is still open? |
| 3 | [Master plan](docs/01-master-plan.md) | In what order will we build it? |
| 4 | [Journeys](docs/journeys/) | What does a day look like for each person? |
| 5 | [User stories](docs/user-stories/) | What must each role be able to do? |
| 6 | [Workflows](docs/workflows/) | How does each business flow work, step by step? |
| 7 | [Sub-plans](docs/sub-plans/) | What exactly is in each phase? |
| 8 | [Database design](docs/technical/01-database-design.md) | How is the data stored? |
| 9 | [API design](docs/technical/02-api-design.md) | Which requests does the app send to the backend? |
| 10 | [Project structure](docs/technical/03-project-structure.md) | How is the code organized, and with which tools? |
| 11 | [Security](docs/technical/04-security.md) | How are logins, permissions, and data protected? |

## Diagrams

All diagrams are written in Mermaid. GitHub shows them as pictures automatically when you open a file. You can also paste any diagram into [mermaid.live](https://mermaid.live) to edit it.

## The three labels

Every rule in these documents carries one of three labels:

- **CONFIRMED** — decided by the project owner.
- **ASSUMED** — a default chosen so planning can continue. It is not final until the project owner confirms it.
- **OPEN** — not decided, and no default is safe to pick.

The full list is in [Decisions](docs/02-decisions.md).

## Running the app on your computer

You need Node.js 22, pnpm, and Docker.

```bash
pnpm install
docker compose up -d                      # starts PostgreSQL
cp apps/api/.env.example apps/api/.env
pnpm db:migrate                           # creates the tables

# Create a wholesaler and its owner. The temporary password is printed once.
pnpm --filter @cosmo/api platform:create-wholesaler \
  --name "Demo Pharma" --login-code demo-pharma --owner-name "Ahmed" --owner-phone 01012345678

pnpm dev                                  # backend on port 4000, website on port 3000
```

Then open `http://localhost:3000/ar/login/demo-pharma` and log in with the owner phone and the temporary password.

Other commands:

| Command | What it does |
|---|---|
| `pnpm test` | Runs all tests. The backend tests need the database from `docker compose` |
| `pnpm typecheck` | Checks types in every part |
| `pnpm build` | Builds the backend and the website |
| `pnpm --filter @cosmo/api platform:reset-owner-password --login-code demo-pharma --owner-phone 01012345678` | Sets a new temporary owner password (C-87) |

## Code layout

| Folder | What is inside |
|---|---|
| `apps/api` | Express backend: `src/core` (login, permissions, errors, activity), `src/modules` (one folder per business area), `migrations` (SQL) |
| `apps/web` | Next.js website: `app/[locale]` (pages in Arabic and English), `components`, `lib/api.ts`, `messages` |
| `packages/shared` | Input rules, roles, error codes, phone and working-hours helpers used by both sides |

See [Project structure](docs/technical/03-project-structure.md) for the reasons behind this layout.

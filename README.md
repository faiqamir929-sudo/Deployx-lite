# DeployX Lite

**AI-Powered Application Deployment & Environment Management Platform**

A production-grade SaaS-style platform for managing projects, environment variables, simulated deployments, and AI-assisted troubleshooting. Built for the DigitalSofts Enterprise technical assessment.

## Features

- **Authentication** — Email login, JWT, password reset, RBAC (Admin / Developer)
- **Project Management** — Create, delete, archive, restore, duplicate projects
- **Git Integration** — Validate GitHub repos, list branches, show last commit
- **Environment Variables** — CRUD, validation, AES-256 encryption at rest, version history
- **Build Simulator** — Async BullMQ pipeline (clone → install → test → build → deploy → health check)
- **Deployment History** — Logs, duration, status, rollback simulation
- **Notifications** — In-app notification center
- **AI Assistant** — Failure analysis, env var suggestions, README review, chat (Ollama / OpenRouter)
- **Dashboard** — Stats, success rate, charts, recent activity
- **Dark Mode** — System preference support via Tailwind

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 15, React 19, TypeScript, Tailwind CSS, TanStack Query, Recharts |
| Backend | NestJS, Prisma, PostgreSQL, BullMQ, Redis |
| AI | Ollama (local) or OpenRouter |
| DevOps | Docker, Docker Compose |
| Docs | Swagger/OpenAPI, Mermaid diagrams |

## Project Structure

```
deployx-lite/
├── apps/
│   ├── api/          # NestJS REST API
│   └── web/          # Next.js dashboard
├── docker/           # Dockerfiles
├── docs/             # Architecture & ER diagrams
├── docker-compose.yml
└── .env.example
```

## Quick Start

### Prerequisites

- Node.js 20+
- PostgreSQL 16
- Redis 7
- (Optional) Docker Desktop, Ollama

### 1. Clone & Install

```bash
cd deployx-lite
cp .env.example .env
npm install
```

### 2. Start Infrastructure

**With Docker:**
```bash
docker compose up postgres redis -d
```

**Without Docker:** Run PostgreSQL and Redis locally and update `.env`.

### 3. Database Setup

```bash
# Set DATABASE_URL in apps/api/.env or root .env
npm run db:generate
npm run db:migrate
npm run db:seed
```

### 4. Run Development Servers

```bash
# Terminal 1 — API (port 3001)
npm run dev:api

# Terminal 2 — Web (port 3000)
npm run dev:web
```

### 5. Open the App

| URL | Description |
|-----|-------------|
| http://localhost:3000 | Web dashboard |
| http://localhost:3001/api/docs | Swagger API docs |

### Demo Credentials (after seed)

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@deployx.local | Admin123! |
| Developer | dev@deployx.local | Dev123456! |

## Environment Variables

See [`.env.example`](.env.example) for all configuration options.

Key variables:
- `DATABASE_URL` — PostgreSQL connection string
- `REDIS_HOST` / `REDIS_PORT` — Redis for BullMQ
- `JWT_SECRET` — JWT signing secret
- `ENCRYPTION_KEY` — 32-byte hex key for env var encryption
- `GITHUB_TOKEN` — Optional, for higher GitHub API rate limits
- `AI_PROVIDER` — `ollama` or `openrouter`

## API Documentation

Swagger UI is available at `/api/docs` when the API is running.

Main endpoints:
- `POST /api/v1/auth/login` — Authentication
- `GET /api/v1/projects` — List projects
- `POST /api/v1/projects/:id/deployments` — Trigger deployment
- `GET /api/v1/dashboard/stats` — Dashboard metrics
- `POST /api/v1/ai/chat` — AI assistant

## Testing

```bash
npm run test --workspace=@deployx/api
```

## Docker (Full Stack)

```bash
docker compose up --build
```

## Architecture

See [docs/architecture.md](docs/architecture.md) and [docs/er-diagram.md](docs/er-diagram.md).

## Assignment Coverage

| Requirement | Status |
|-------------|--------|
| Auth (JWT, RBAC, password reset) | ✅ |
| Project CRUD + archive/duplicate | ✅ |
| GitHub integration | ✅ |
| Env var manager + encryption | ✅ |
| Build simulator (BullMQ) | ✅ |
| Deployment history + rollback | ✅ |
| Notifications | ✅ |
| AI assistant | ✅ |
| Dashboard + charts | ✅ |
| Swagger/OpenAPI | ✅ |
| Docker + docker-compose | ✅ |
| Tests | ✅ |
| Seed data | ✅ |
| Architecture diagrams | ✅ |
| Google OAuth | 🔲 (scaffold ready, needs credentials) |
| Email notifications | 🔲 (Mailpit in docker-compose) |

## License

MIT — Built for educational assessment purposes.

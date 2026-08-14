# DeployX Lite — Architecture

## System Overview

DeployX Lite is a monorepo SaaS platform for simulated application deployments and environment management.

```mermaid
flowchart TB
    subgraph Client
        WEB[Next.js 15 Web App]
    end

    subgraph API Layer
        NEST[NestJS REST API]
        SWAGGER[Swagger / OpenAPI]
    end

    subgraph Workers
        BULL[BullMQ Worker]
        PIPELINE[Deployment Pipeline Simulator]
    end

    subgraph Data
        PG[(PostgreSQL)]
        REDIS[(Redis)]
        MINIO[(MinIO - optional)]
    end

    subgraph External
        GITHUB[GitHub API]
        OLLAMA[Ollama / OpenRouter]
    end

    WEB -->|REST + JWT| NEST
    NEST --> SWAGGER
    NEST --> PG
    NEST --> BULL
    BULL --> REDIS
    BULL --> PIPELINE
    PIPELINE --> PG
    NEST --> GITHUB
    NEST --> OLLAMA
```

## Module Structure (Backend)

| Module | Responsibility |
|--------|----------------|
| Auth | JWT login, register, password reset |
| Projects | CRUD, archive, restore, duplicate |
| EnvVars | Encrypted env var management + history |
| Git | GitHub repo validation via Octokit |
| Deployments | Async pipeline via BullMQ |
| Notifications | In-app notification center |
| AI | LLM-powered deployment assistant |
| Dashboard | Stats and chart data |

## Deployment Pipeline (Simulated)

```
Clone → Install → Test → Build → Deploy → Health Check
```

Each step runs asynchronously with log streaming to PostgreSQL.

## Security

- JWT authentication with role-based access (Admin / Developer)
- Environment variables encrypted at rest (AES-256-GCM)
- Input validation via class-validator + Zod (frontend)
- Helmet middleware, CORS configuration

## Folder Structure

```
deployx-lite/
├── apps/
│   ├── api/          # NestJS backend
│   └── web/          # Next.js frontend
├── docker/           # Dockerfiles
├── docs/             # Architecture & ER diagrams
└── docker-compose.yml
```

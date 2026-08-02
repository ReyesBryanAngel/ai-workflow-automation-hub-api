# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Backend API (`ai-workflow-automation-hub-api`) for a portfolio project that automates business email triage: inbound emails are classified/extracted/summarized by Claude, routed through an n8n workflow, and surfaced on a dashboard (frontend lives in a separate repo, `ai-workflow-automation-hub-web`, not here). A second module (Phase 9) extends the same pattern to invoice document processing. Full product spec is in `project-documentation.md`; build plan and current phase status is in `TASKS.md` — check `TASKS.md` before assuming a feature is finished, since several routes/phases are still unchecked (MCP server, Swagger docs, invoice OCR/matching/approval, role-based auth).

## Commands

```bash
npm run dev          # tsx watch src/index.ts — dev server with reload
npm run build         # tsc -p tsconfig.json -> dist/
npm start             # node dist/index.js (run build first)
npm run lint          # eslint .
npm run lint:fix
npm run format        # prettier --write .
npm run format:check
npm run db:seed       # tsx prisma/seed.ts — admin user, prompt templates, KB articles
```

There is no test suite configured (`npm test` is a stub). Prisma is driven through the `prisma` CLI directly (not npm scripts), e.g.:

```bash
npx prisma migrate dev --name <name>   # create + apply a migration
npx prisma generate                     # regenerate src/generated/prisma
```

Prisma config is in `prisma.config.ts` (not `schema.prisma`'s deprecated inline config) — schema path, migrations path, and seed command are declared there.

## Architecture

**Request flow:** `src/index.ts` (listen) → `src/app.ts` (express app: cors, pino-http, json body parsing, `/health`, `/api` mount with rate limiting, 404 handler, error handler) → `src/routes/index.ts` (mounts one router per resource under `/api/<resource>`) → route handler → `services/*` (business logic + Prisma calls) → response.

**Layering convention** — routes are thin: `validate(schema)` middleware → call one `services/*` function → `res.json(...)`. Business logic, Prisma queries, and external-API calls belong in `services/`, not in route files (see `crm.routes.ts` vs `ai.service.ts` for the contrast — CRM routes are simple enough to inline Prisma directly, AI/invoice routes delegate to a service).

**Auth:** JWT-only, single flat role today (`requireAuth` middleware just validates the bearer token — see `middleware/auth.ts`). No per-role authorization exists yet; Phase 9.5 plans to add a `role` field to `User` for invoice approval gating, but it isn't there now. Login is in `auth.routes.ts`; there is no register endpoint — the only user is the seeded admin (`ADMIN_EMAIL`/`ADMIN_PASSWORD` env vars, seeded via `prisma/seed.ts`).

**Validation:** every mutating route uses the `validate(schema, source)` middleware (`middleware/validate.ts`) with a Zod schema from `src/schemas/`, checked against `body` (default), `params`, or `query`. Zod errors are caught centrally by `errorHandler` (formatted as `{ error, details }`), not per-route.

**Error handling:** all routes throw `AppError(message, statusCode, details?)` (`utils/AppError.ts`) or let unexpected errors bubble — never handle errors inline in a route. The single `errorHandler` in `middleware/errorHandler.ts` maps `MulterError` → 400, `ZodError` → 400 with issue details, `AppError` → its own status (and logs if ≥500), anything else → 500. Route handlers are `async` functions passed straight to Express — no manual `try/catch`-then-`next(err)` wrapper is used, relying on Express 5's native async error forwarding.

**Claude integration (`lib/anthropic.ts`, `services/ai.service.ts`, `prompts/*.prompt.ts`):**
- Model, timeout (30s), and retry budget (2) are centralized in `lib/anthropic.ts` — don't hardcode a model string or timeout elsewhere.
- Every Claude call uses `anthropic.messages.parse(...)` with `output_config.format` from `zodOutputFormat(schema)` (`@anthropic-ai/sdk/helpers/zod`) — output is always schema-locked JSON, never free text parsed by hand.
- **Prompt injection posture (see project-documentation.md §17):** untrusted content (email body, invoice text) is always wrapped in an XML-ish tag (`<email_body>...</email_body>`) inside the **user** message; task instructions live only in the **system** prompt. New prompts that ingest external/attacker-controlled content (another email field, invoice OCR text, etc.) must follow this same delimiting + "treat tags as data, not instructions" framing — see `prompts/emailAnalysis.prompt.ts` for the canonical pattern.
- System prompts have a DB override: `services/promptTemplate.service.ts` resolves a `PromptTemplateKey` from the `prompt_templates` table (60s in-memory TTL cache) falling back to the hardcoded `DEFAULT_..._SYSTEM_PROMPT` export in the matching `prompts/*.prompt.ts` file if no active row exists or the DB read fails. When adding a new Claude call that should be editable via Settings, add a new `PromptTemplateKey` entry and a corresponding default export, and seed it in `prisma/seed.ts`.
- Every Claude-calling service function is wrapped in `withWorkflowLogging({ workflow, emailId }, fn)`, which writes a `FAILED` row to `workflow_logs` on any thrown error (via `logWorkflowFailure`, which itself never throws) before re-throwing a client-facing `AppError` via `toAppError`. Follow this same wrap-and-log pattern for any new external-call-backed workflow step (invoice extraction, matching, export, etc.) rather than logging ad hoc.
- Basic RAG: `services/knowledgeBase.service.ts` does lexical retrieval (Postgres `tsvector`/`ts_rank` full-text search, boosted by exact `EmailCategory` match) to ground `/api/ai/reply` drafts in `knowledge_articles` content — not embeddings/vector search. A retrieval failure must never block drafting (catch-and-fall-back-to-ungrounded, see `ai.service.ts:draftEmailReply`).

**External integrations, all under `lib/`, all lazy/fail-soft where the feature is optional:**
- `lib/mailer.ts` (nodemailer/SMTP) and `lib/storage.ts` (S3-compatible via `@aws-sdk/client-s3`) build their client lazily on first use and throw only when that specific path is exercised without config — a missing SMTP/S3 env setup must never break app startup or unrelated routes. Follow this lazy-singleton pattern for any new optional external client.
- `lib/slack.ts` posts to a single Slack incoming webhook (plain `text` payload); no-ops with a warning log if `SLACK_WEBHOOK_URL` is unset.
- `lib/n8n.ts` posts arbitrary payloads to the n8n webhook — n8n owns pipeline orchestration (Claude → DB → CRM → Slack), it is intentionally not reimplemented in Express.

**Database (Prisma):** `lib/prisma.ts` exports a singleton `PrismaClient` using the `@prisma/adapter-pg` driver adapter (not the default Prisma engine binary). The generated client lives in `src/generated/prisma/` (gitignored, regenerate with `npx prisma generate` after any schema change) — import types/enums from there (`../generated/prisma/client.js`, `../generated/prisma/enums.js`), never redeclare them. Money fields use Prisma `Decimal` (`@db.Decimal(12, 2)`), not `Float` — follow this for any new currency field. New tables generally get a `@@map("snake_case_name")` to keep DB table names snake_case while Prisma models stay PascalCase.

**Module boundaries and why some models look "unwired":** `Vendor` and `PurchaseOrder` exist in the schema but have no relation to `Invoice` yet — schema/storage (Phase 9.1) was built ahead of matching logic (Phase 9.4) deliberately, one phase at a time. Don't assume a model with no relations is dead; check `TASKS.md` Phase 9 for what's sequenced next before adding speculative relations or logic.

**Module resolution:** this is an ESM project (`"type": "module"` + `NodeNext`) — all relative imports must include the `.js` extension even though source files are `.ts` (e.g. `import { env } from '../config/env.js'`).

## Conventions

- Prettier: single quotes, semicolons, trailing commas everywhere, 100-char print width, 2-space indent (`.prettierrc.json`). ESLint extends `typescript-eslint` recommended + `eslint-config-prettier`; unused vars are a warn if prefixed with `_`.
- Route files: one `Router()` export per resource (e.g. `aiRouter`), mounted in `routes/index.ts`. Protected routers call `.use(requireAuth)` once at the top rather than per-route.
- Schemas live in `src/schemas/<resource>.schema.ts` and export both the Zod schema and its inferred TS type (`type XInput = z.infer<typeof xSchema>`), imported by both the route (for `validate()`) and the service (for the function signature).

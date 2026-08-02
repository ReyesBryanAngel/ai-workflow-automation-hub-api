# AI Workflow Automation Hub — Task Plan
**Companion to `project-documentation.md`**

> Scope decisions baked into this plan: JWT auth is a **core** deliverable (not optional). n8n is **self-hosted** locally, so a setup task is included. Docker remains optional/stretch.

This breaks the project into 8 sequential phases mapped to a 3–4 day build, plus **Phase 9**, an invoice-processing extension module scoped separately (it's not in `project-documentation.md` — it's a follow-on module sized roughly like Phases 1–3 combined). Each phase lists concrete tasks and a "Done when" checkpoint so you always know if you can move on. Work top to bottom — later phases assume earlier ones are functional.

---

## Phase 0 — Project Setup & Scaffolding
**Goal:** Empty repo → runnable skeleton for both apps + tooling in place.

- [x] Init backend: `ai-workflow-automation-hub-api` (Express + TypeScript), tsconfig, eslint/prettier
- [ ] Init frontend: `ai-workflow-automation-hub-web` (React + TypeScript via Vite), MUI theme baseline
- [x] Install PostgreSQL locally (or via Laragon) and create dev database
- [x] Init Prisma in backend, configure `DATABASE_URL`
- [x] Set up `.env` / `.env.example` for both apps (DB url, Anthropic key, Slack webhook, JWT secret, ports)
- [ ] Install and run n8n locally (npm or Docker), confirm editor UI loads at `localhost:5678`
- [x] Create Postman collection for the API
- [x] Push initial commit structure to GitHub, confirm `.gitignore` excludes `.env`, `node_modules`, Prisma generated client

**Done when:** backend `npm run dev` serves a health-check route, frontend `npm run dev` renders a blank shell, `psql` connects, n8n editor is reachable.

---

## Phase 1 — Database & Core Backend
**Goal:** Data layer and Express skeleton ready for feature endpoints.

- [x] Write Prisma schema: `emails`, `workflow_logs`, `crm_records` (fields per doc §13)
- [x] Run initial migration, verify tables in Postgres
- [x] Add Express middleware stack: JSON body parsing, CORS, request logging (Winston or Pino), centralized error handler
- [x] Add Zod schemas for request validation on all mutating routes
- [x] Implement JWT auth: login/register (or a seeded single admin user), auth middleware, protected routes
- [x] Implement basic CRUD for `emails`: `GET /api/emails`, `GET /api/emails/:id`, `POST /api/emails`
- [x] Add rate limiting middleware (e.g. `express-rate-limit`)

**Done when:** you can register/login and get a JWT, and use it to create + list emails via Postman/Bruno.

---

## Phase 2 — AI Integration (Claude)
**Goal:** Claude reliably turns raw email text into structured, categorized data.

- [x] Set up Anthropic API client with key from env
- [x] Design prompt template for extraction + classification + priority (Sales/Support/Billing/Complaint/General Inquiry/Spam; Low/Medium/High/Critical)
- [x] Implement `POST /api/ai/analyze`: input raw email → output `{ customerName, company, email, phone, issueSummary, requestedAction, category, priority, summary }`
- [x] Implement `POST /api/ai/reply`: input analyzed email → output a drafted professional response
- [x] Add Claude timeout + retry handling, log failures to `workflow_logs`
- [x] Store prompt templates in a config/DB table so they're editable without redeploying (feeds Module 5 Settings)
- [x] Document prompt-injection mitigation: how untrusted email content is delimited/constrained in the prompt (feeds §17 Security)

**Done when:** posting a sample email body to `/api/ai/analyze` reliably returns structured, correctly categorized JSON, and `/api/ai/reply` returns a coherent draft.

---

## Phase 3 — n8n Automation Workflow
**Goal:** The end-to-end pipeline runs without a human touching it.

- [x] Build n8n workflow: Webhook Trigger → HTTP Request (`/api/ai/analyze`) → IF (category/priority branch) → HTTP Request (save to DB / create email record) → HTTP Request (create CRM record, mock endpoint is fine) → Slack notification → Webhook response
- [x] Configure Slack incoming webhook, verify a test message lands in a channel
- [x] Add error branches in n8n: on failure, log to `workflow_logs` with error message and retry once before marking failed
- [x] Test with 3–5 varied sample emails (sales lead, angry complaint, billing question, spam) and confirm correct routing end-to-end
- [x] Export the workflow JSON into the repo (e.g. `/n8n/workflow.json`) so it's reviewable and re-importable

**Done when:** hitting the n8n webhook with a raw email payload results in a DB row, a CRM record, and a Slack message — with failures visibly logged, not silently dropped.

---

## Phase 4 — MCP Server
**Goal:** Business actions exposed as standardized tools an AI assistant can call.

- [ ] Scaffold MCP server (can live inside the Express app)
- [ ] Implement tools: `createLead()`, `updateTicket()`, `getCustomer()`, `sendSlackNotification()`, `generateReport()`
- [ ] Expose `GET /mcp/tools` (tool manifest) and `POST /mcp/execute` (invoke by tool name + args)
- [ ] Test tool invocation manually (Postman) and, if time allows, from an actual MCP client (e.g. Claude Desktop/Code) for the demo

**Done when:** `/mcp/tools` lists all 5 tools with schemas, and `/mcp/execute` successfully runs each one against real backend logic (not stubs).

---

## Phase 5 — Remaining Backend APIs
**Goal:** Every endpoint the frontend needs actually exists and returns real data.

- [x] `GET /api/dashboard` — aggregate counts (today's emails, AI processed, sales leads, support tickets, failed workflows)
- [x] `GET /api/reports` — data for charts (emails/day, category distribution, priority distribution, workflow success rate)
- [x] `GET /api/workflows`, `POST /api/workflows/run` — list logs, manually trigger a workflow run
- [ ] Wire up Swagger/OpenAPI docs (e.g. `swagger-jsdoc` + `swagger-ui-express`) covering all routes, served at `/docs`

**Done when:** every route in doc §12 is implemented, documented in Swagger, and returns real (not mocked) data from Postgres.

---

## Phase 6 — Frontend Dashboard
**Goal:** All 5 modules functional against the real backend.

- [ ] App shell: routing (React Router), MUI layout/nav, Axios instance with JWT attached, React Query provider
- [ ] Login page wired to JWT auth
- [ ] Module 1 — Dashboard: stat cards from `/api/dashboard`
- [ ] Module 2 — Email Inbox: list + detail view (original email, AI summary, category, priority, status)
- [ ] Module 3 — Workflow Logs: table (execution time, success/fail, retry count) from `/api/workflows`
- [ ] Module 4 — Reports: Recharts visualizations from `/api/reports`
- [ ] Module 5 — Settings: forms for Anthropic key, Slack webhook, CRM endpoint, prompt templates (persisted via backend)

**Done when:** you can log in and navigate all 5 modules with live data — no hardcoded/mock arrays left in frontend code.

---

## Phase 7 — Security & Error-Handling Hardening
**Goal:** Pass a basic security/reliability review, not just the happy path.

- [ ] Confirm input validation (Zod) covers every mutating endpoint, including MCP `execute`
- [ ] Confirm rate limiting is active on public/webhook-facing routes
- [ ] Audit `.env` usage — no secrets hardcoded or committed
- [ ] Confirm Prisma parameterization covers all queries (no raw SQL string concatenation)
- [ ] Verify Claude timeout → retry → log → notify path (doc §16) actually triggers under a forced failure (e.g. bad API key)
- [ ] Verify webhook failure → retry → log path triggers under a forced failure (e.g. stop the backend mid-n8n-run)
- [ ] Verify DB failure → rollback → log path (wrap multi-step writes in a Prisma transaction)

**Done when:** you can deliberately break each failure path (bad key, dead endpoint, DB error) and watch the system degrade gracefully and log it, instead of crashing or silently succeeding.

---

## Phase 8 — Polish, Docs & Deliverables
**Goal:** Ready to demo and to hand to an interviewer.

- [ ] README with setup instructions (env vars, DB setup, running backend/frontend/n8n, seeding sample data)
- [ ] Architecture diagram (Mermaid, matches doc §7)
- [ ] Business process before/after diagram (Mermaid, matches doc §3/§9)
- [ ] Final Swagger pass — every endpoint documented with example payloads
- [ ] Seed script with realistic sample emails for demo purposes
- [ ] Record 3–5 minute demo video: manual process pain point → live email → AI categorization → Slack + dashboard update → reports
- [ ] Prep interview talking points (doc §19) — rehearse the business-analysis framing, not just the tech

**Done when:** a stranger could clone the repo, follow the README, and reproduce the demo end-to-end.

---

## Phase 9 — Invoice Processing Module (Extension)
**Goal:** Automate invoice intake → extraction → matching → approval → export → payment scheduling, reusing the AI-extraction and workflow-logging spine already built in Phases 1–3 rather than building a parallel system.

> Scope decisions: Claude's native PDF input is the primary extraction path; **LlamaParse is wired in as a second OCR vendor** (fallback when Claude extraction fails or returns low-confidence/incomplete fields). Payment scheduling and archiving run off **n8n's own cron trigger**, not an in-app scheduler. Money fields use Prisma `Decimal`, not `Float` — nothing else in the schema stores currency today, so this is a new precision requirement, not a style choice.

### 9.1 — Data Model & Storage
- [x] Prisma models: `Invoice`, `Vendor`, `PurchaseOrder`; enums `InvoiceStatus` (PENDING, DUPLICATE, NEEDS_REVIEW, APPROVED, REJECTED, EXPORTED, PAID, ARCHIVED)
- [x] `Invoice` fields per draft schema (`invoiceNumber`, `vendor`, `invoiceDate`, `dueDate`, `subtotal`, `tax`, `total`, `currency`) using `Decimal` for money fields
- [x] Add `storageKey`/`documentUrl` + `sourceType` (EMAIL/DRIVE/UPLOAD/API) to `Invoice`
- [x] Choose and wire a storage lib (`lib/storage.ts`) — S3-compatible bucket, or local disk for the prototype — nothing like this exists in the codebase yet (no multer/AWS SDK today)
- [x] Migration + verify tables in Postgres

**Done when:** you can insert an `Invoice` row referencing a stored file and query it back with correct decimal precision on the money fields.

---

### 9.2 — Document Intake
- [x] `POST /api/invoices/upload` — manual upload form/API path (multipart), stores the original file via `lib/storage.ts` before anything else, creates `Invoice` row with `status: PENDING`
- [ ] n8n branch: Gmail attachment trigger (separate from the existing email-triage workflow) — detect invoice-looking attachments, download, POST to the upload endpoint
- [ ] n8n branch: Google Drive trigger (new file in a watched folder) — download, POST to the upload endpoint
- [x] Reject/flag non-PDF/image uploads early with a clear validation error (Zod + mimetype check)

**Done when:** dropping a PDF into the watched Drive folder, emailing one, or POSTing one directly all result in a stored file + a `PENDING` `Invoice` row.

---

### 9.3 — OCR & Field Extraction
- [x] `schemas/invoice.schema.ts` — Zod schema matching the draft `InvoiceSchema`, `Decimal`-safe on the wire
- [x] `prompts/invoiceExtraction.prompt.ts` — system prompt for structured extraction, same untrusted-content framing pattern as `emailAnalysis.prompt.ts` (the invoice file is attacker-controllable input, same as an email body)
- [x] `lib/llamaparse.ts` — LlamaParse client; primary extraction path performs OCR/text extraction and returns structured markdown/text for downstream processing
- [x] `services/invoice.service.ts`: `extractInvoice()` — primary path sends the LlamaParse output to Claude using the same `anthropic.messages.parse` + `zodOutputFormat` + `withWorkflowLogging` pattern as `ai.service.ts`
- [x] Fallback path: if LlamaParse fails, returns incomplete required fields, or extraction confidence is low, send the original PDF directly to Claude as a document input block and perform the same structured extraction
- [x] Log which extraction path was used (`llamaparse` vs `claude_pdf_fallback`) on the `WorkflowLog` row — needed later to evaluate whether LlamaParse is providing measurable value
- [x] Wire into intake: extraction runs automatically after a file is stored (n8n step or a post-upload hook)

**Done when:** a sample invoice PDF reliably produces a filled `Invoice` row through the LlamaParse → Claude pipeline, and intentionally forcing a LlamaParse failure or low-confidence extraction automatically falls back to the Claude PDF document path and still produces a filled row.

---

### 9.4 — Duplicate Check, Vendor/PO Matching, Risk Checks
- [x] Duplicate check: unique constraint / lookup on `(vendor, invoiceNumber)` before/after extraction; mark `status: DUPLICATE` and short-circuit the rest of the pipeline
- [x] Vendor matching: fuzzy match extracted vendor name against `Vendor` table; auto-link on confident match, flag `NEEDS_REVIEW` with no match, never silently create a new vendor from unverified extraction
- [x] PO matching: look up `PurchaseOrder` by extracted PO number (if present); compare invoice total against PO amount within a tolerance
- [x] Risk/exception rules (plain rule-based, not another Claude call): missing PO, amount mismatch beyond tolerance, new/unverified vendor, total above a configurable threshold — collect into an `exceptions: string[]` field, set `status: NEEDS_REVIEW` if any fire
- [x] Log each check's outcome to `workflow_logs` the same way AI steps do

**Done when:** a duplicate invoice is caught before reaching approval, a mismatched-PO invoice is flagged with a specific reason, and a clean invoice with a matched PO and vendor sails through with no exceptions.

---

### 9.5 — Human Approval
- [x] Add a minimal `role` field to `User` (e.g. `ADMIN` / `APPROVER` / `MEMBER`) — today `requireAuth` only checks "has a valid JWT," there's no concept of authorization level anywhere in the app
- [x] `POST /api/invoices/:id/approve`, `POST /api/invoices/:id/reject` — role-gated (APPROVER/ADMIN only), rejection requires a reason
- [x] `GET /api/invoices?status=NEEDS_REVIEW` — review queue endpoint (a minimal API-level version of the "Manual Review Queue" stretch goal already listed below; a dedicated UI for it can stay a stretch item)
- [x] Slack notification when an invoice enters `NEEDS_REVIEW`, reusing `lib/slack.ts`

**Done when:** an invoice flagged with an exception blocks at `NEEDS_REVIEW` until an APPROVER-role user explicitly approves or rejects it via the API — it never silently proceeds to export.

---

### 9.6 — Export & Payment Scheduling
- [x] `POST /api/invoices/:id/export` — mock accounting-system export, same pattern as the existing mock CRM integration (`crm.routes.ts:34-42`); sets `status: EXPORTED`
- [ ] n8n cron-triggered workflow: on schedule, query `EXPORTED` invoices with an approaching `dueDate`, call a `POST /api/invoices/:id/schedule-payment` endpoint, then set `status: PAID` → `ARCHIVED` — endpoint is implemented and ready; the n8n workflow itself is not yet built
- [x] Error branches on both the export call and the cron-triggered payment step, logged to `workflow_logs` like every other stage

**Done when:** an approved invoice reaches `EXPORTED` via the API, and the n8n cron job picks it up on its own schedule and moves it to `PAID`/`ARCHIVED` without manual triggering.

---

### 9.7 — n8n Workflow Assembly
- [ ] Build the full n8n workflow chaining 9.2 → 9.3 → 9.4 → 9.5 (notify + wait) → 9.6, mirroring the existing email pipeline's shape (webhook/trigger → HTTP requests → IF branches → Slack → error branch)
- [ ] Test with a realistic small batch: a clean invoice, a duplicate, a PO-mismatched invoice, and a low-quality scan (forces the LlamaParse fallback)
- [ ] Export the workflow JSON into the repo (e.g. `/n8n/invoice-workflow.json`)

**Done when:** all four test invoices route correctly end-to-end with no manual intervention except the deliberate approval step.

---

## Stretch Goals (only if core phases finish early)
- [ ] Docker Compose for one-command local setup (backend, frontend, Postgres, n8n)
- [ ] AI Prompt Playground (edit prompts, test outputs live)
- [ ] Workflow Builder UI panel (view n8n workflow status from the dashboard)
- [ ] Manual Review Queue for AI decisions
- [ ] Claude token usage / cost dashboard
- [ ] Full audit trail for every AI action
- [ ] Multi-provider AI abstraction (Claude + OpenAI)

---

## Suggested Day-by-Day Pacing (4-day version)
| Day | Phases |
|---|---|
| Day 1 | Phase 0, Phase 1, start Phase 2 |
| Day 2 | Finish Phase 2, Phase 3, start Phase 4 |
| Day 3 | Finish Phase 4, Phase 5, Phase 6 |
| Day 4 | Phase 7, Phase 8 |

If compressed to 3 days: merge Phase 4 (MCP) into Day 2 evening and treat it as the first thing to cut if behind schedule — the demo narrative (Modules 1–3, n8n pipeline, reporting) survives without it, while the pipeline (Phases 1–3) does not.

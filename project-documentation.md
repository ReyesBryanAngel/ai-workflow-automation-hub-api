# AI Workflow Automation Hub
**Portfolio Prototype Documentation**

> **Goal:** Demonstrate the ability to build AI-powered business automation solutions using Claude, APIs, n8n, and modern web technologies within 3–4 days.

---

# 1. Project Overview

## Description

AI Workflow Automation Hub is an internal platform that automates repetitive business workflows using AI.

Instead of employees manually reading emails, extracting information, creating CRM records, and notifying teams, the system automates the entire process.

This project demonstrates:

- AI Integration
- Workflow Automation
- API Integrations
- Business Process Analysis
- Reporting Dashboard
- MCP (Model Context Protocol) Integration

---

# 2. Business Problem

## Current Process

Customer sends an email.

↓

Employee opens inbox.

↓

Reads the email.

↓

Determines if it is:

- Sales
- Support
- Billing
- Complaint

↓

Copies customer information.

↓

Creates CRM record.

↓

Notifies the responsible team.

↓

Updates spreadsheet.

↓

Manager reviews reports manually.

---

## Problems

- Time consuming
- Human error
- Duplicate work
- Inconsistent categorization
- Delayed responses
- Difficult reporting

---

# 3. Proposed Solution

The AI Workflow Automation Hub automates this process.

Customer Email

↓

Webhook

↓

Claude AI

↓

Extract structured information

↓

Categorize

↓

Determine Priority

↓

Save to Database

↓

Create CRM Record

↓

Notify Slack

↓

Dashboard Updates

---

# 4. Objectives

- Build a working AI prototype
- Demonstrate workflow automation
- Demonstrate Claude integration
- Demonstrate n8n workflows
- Demonstrate API integrations
- Demonstrate reporting
- Demonstrate business analysis
- Demonstrate MCP support

---

# 5. Tech Stack

## Frontend

- React
- TypeScript
- Material UI
- React Query (TanStack Query)
- React Router
- Axios
- Recharts

---

## Backend

- Express
- TypeScript
- PostgreSQL
- Prisma ORM ✅ (Highly recommended)
- Zod
- JWT Authentication (optional)

---

## AI

- Anthropic Api
- Claude Code

---

## Automation

- n8n

---

## Database

- PostgreSQL

---

## Integrations

- Webhooks
- REST APIs
- MCP Server
- Slack Webhook

---

## Development

- Docker (optional)
- Postman / Bruno
- GitHub

---

# 6. Suggested Additional Tools

These are worth adding because they align well with enterprise AI workflows:

### Prisma

Why?

- Fast database development
- Type-safe
- Widely used

---

### React Query

Why?

Makes API state management cleaner.

---

### Zod

Why?

Backend request validation.

---

### Winston or Pino

Why?

Application logging.

---

### Mermaid

Why?

Generate workflow diagrams inside markdown.

---

### Swagger (OpenAPI)

Why?

API documentation.

Very impressive during interviews.

---

# 7. Architecture

                    React Dashboard

                          │

                    Express API

          ┌───────────────┼────────────────┐

          │               │                │

      PostgreSQL      Anthropic Api      MCP Server

          │

         n8n

          │

Slack / CRM / Email / Future Integrations

---

# 8. Project Modules

## Module 1

Dashboard

Displays

- Today's Emails
- AI Processed
- Sales Leads
- Support Tickets
- Failed Workflows

---

## Module 2

Email Inbox

Displays

- Original Email
- AI Summary
- Category
- Priority
- Status

---

## Module 3

Workflow Logs

Displays

- Execution Time
- Success
- Failed
- Retry Count

---

## Module 4

Reports

Charts

- Daily Requests
- Category Distribution
- High Priority Emails
- AI Accuracy (Manual Review)

---

## Module 5

Settings

- Anthropic Api Key
- Slack Webhook
- CRM Endpoint
- Prompt Templates

---

# 9. Business Workflow

## Current

Customer Email

↓

Employee Reads

↓

Employee Categorizes

↓

Employee Creates CRM

↓

Employee Notifies Team

↓

Manager Reviews

---

## Improved

Customer Email

↓

Webhook

↓

Claude

↓

Extract

↓

Categorize

↓

Priority

↓

Database

↓

CRM

↓

Slack

↓

Dashboard

---

# 10. AI Features

## Email Classification

Categories

- Sales
- Support
- Billing
- Complaint
- General Inquiry
- Spam

---

## Priority Detection

- Low
- Medium
- High
- Critical

---

## Information Extraction

Extract

Customer Name

Company

Email

Phone

Issue Summary

Requested Action

---

## AI Summary

Generate

3–5 sentence summary

---

## Suggested Response

Claude generates

Professional email draft.

---

# 11. n8n Workflow

Webhook Trigger

↓

HTTP Request

↓

Claude

↓

IF

↓

Database

↓

Slack

↓

Respond

---

Possible future workflows

- Gmail Trigger
- Microsoft Outlook
- Teams
- HubSpot
- Salesforce
- Jira

---

# 12. Backend APIs

## AI

POST

/api/ai/analyze

---

POST

/api/ai/reply

---

## Dashboard

GET

/api/dashboard

---

## Emails

GET

/api/emails

GET

/api/emails/:id

POST

/api/emails

---

## Reports

GET

/api/reports

---

## Workflow

GET

/api/workflows

POST

/api/workflows/run

---

## MCP

GET

/mcp/tools

POST

/mcp/execute

---

# 13. Database Tables

emails

- id
- sender
- subject
- body
- category
- priority
- summary
- status
- createdAt

---

workflow_logs

- id
- workflow
- status
- executionTime
- error
- createdAt

---

crm_records

- id
- customerName
- email
- company
- source
- createdAt

---

reports

(optional)

---

# 14. MCP

Expose tools

createLead()

updateTicket()

getCustomer()

sendSlackNotification()

generateReport()

Future

HubSpot

Salesforce

Dynamics

SAP

---

# 15. Reporting

Dashboard Cards

Today's Emails

Sales Leads

Support Tickets

Workflow Success %

Average AI Time

---

Charts

Emails per Day

Category Distribution

Priority Distribution

Workflow Success Rate

---

# 16. Error Handling

Claude Timeout

Retry

↓

Log

↓

Notify

---

Webhook Failure

↓

Retry

↓

Log

---

Database Failure

↓

Rollback

↓

Log

---

# 17. Security

Input Validation

Rate Limiting

Environment Variables

SQL Injection Protection

## Prompt Injection Consideration

The email `body` and `sender`/`subject` fields reaching `/api/ai/analyze` and `/api/ai/reply` are untrusted, attacker-controlled input — the whole point of the pipeline is to run Claude over emails nobody has read yet. Mitigation is layered directly into the prompt construction, not bolted on after:

Delimiting

- The raw email body is wrapped in an `<email_body>` tag inside a larger `<email>` block in the **user** message (`buildEmailAnalysisUserPrompt` / `buildEmailReplyUserPrompt` in `src/prompts/`). Task instructions live only in the **system** prompt, which the sender never controls, so instructions and untrusted data are never in the same channel.

Explicit instruction-hierarchy statement

- The system prompt tells Claude, in plain language, that everything inside `<email_body>` is data to analyze, not commands to obey, and to disregard embedded text that looks like "ignore previous instructions" or role-play attempts ("you are now..."). This is stated once per call in `DEFAULT_EMAIL_ANALYSIS_SYSTEM_PROMPT` / `DEFAULT_EMAIL_REPLY_SYSTEM_PROMPT` (or their `prompt_templates` DB overrides, if set).

Constrained, schema-locked output

- Both calls use `messages.parse` with a Zod-derived `output_config.format` (`emailAnalysisOutputFormat` / `emailReplyOutputFormat`), so a response can only ever be the declared JSON shape. Even a partially successful injection can't make the model emit free text, alternate formatting, or anything the caller would execute or render unescaped.

No tool access on these calls

- Analysis and reply generation are plain text-in/structured-data-out calls with no tools bound. An injected instruction has nothing to invoke — it cannot trigger the MCP tools (Phase 4) or any side effect from inside the prompt itself.

Residual risk

- This is defense-in-depth, not a guarantee — no delimiting scheme fully eliminates injection risk in an LLM prompt. The output is still treated as AI-assisted, not authoritative: category/priority/summary feed downstream automation (CRM, Slack) as data, and anything consequential (e.g. sending the drafted reply) is expected to go through a human or an explicit action, not be auto-executed off model output alone.

Editable prompts, same guardrails

- System prompts can be overridden per `PromptTemplateKey` via the `prompt_templates` table (feeds Module 5 Settings, see §8 Module 5) without a redeploy. The delimiting/instruction-hierarchy language lives in that same editable text, so anyone updating a prompt template is responsible for preserving it — the code enforces schema-locked output and no-tool-access regardless of prompt content, but the injection-resistant wording itself is data, not code.

---

# 18. Future Improvements

Real Gmail Integration

Microsoft Outlook

HubSpot

Salesforce

Jira

Twilio

Teams

Voice AI

Knowledge Base (RAG)

Multi-Agent Collaboration

Authentication

Role Management

Audit Logs

---

# 19. Interview Talking Points

## Business Analysis

Explain the manual process and identify bottlenecks before discussing the technical solution.

---

## AI

Explain why Claude is used for:

- Classification
- Extraction
- Summarization
- Suggested Responses

---

## Automation

Explain why n8n orchestrates workflows instead of embedding all automation logic in Node.js.

---

## APIs

Explain how the backend exposes reusable endpoints that can integrate with CRMs, HRIS, ERP systems, and future services.

---

## MCP

Explain that business capabilities are exposed as standardized tools so AI assistants can invoke them without tightly coupling to application logic.

---

## Reporting

Highlight how automation metrics help teams monitor adoption, workflow health, and business impact.

---

# 20. Stretch Goals (Optional)

If time allows, consider adding one or two of these:

- AI Prompt Playground (edit prompts and test outputs)
- Workflow Builder UI (view n8n workflow status)
- Manual Review Queue for AI decisions
- Cost dashboard (Claude token usage estimate)
- Audit trail for every AI action
- Multi-provider AI support (Claude + OpenAI abstraction)

---

# Deliverables

- ✅ React + Material UI dashboard
- ✅ Express + TypeScript backend
- ✅ PostgreSQL + Prisma
- ✅ Anthropic Api integration
- ✅ n8n workflow
- ✅ Basic MCP server with sample tools
- ✅ Swagger API documentation
- ✅ Architecture diagram
- ✅ Business process documentation
- ✅ README with setup instructions
- ✅ Demo video (3–5 minutes)
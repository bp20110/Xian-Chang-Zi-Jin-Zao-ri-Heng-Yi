# 現場収支

小規模な工務店・大工向けの、現場別請求・入金・仕入・支払いと資金繰りを管理するWebアプリ。

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string
- Required secret: `SESSION_SECRET` — session signing
- Administrator password: `ADMIN_PASSWORD` in Secrets; use at least 10 characters. Public production setup is disabled to prevent first-visitor takeover.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- Web UI: `artifacts/site-cashflow/src/`
- API contracts: `lib/api-spec/openapi.yaml`
- Database models: `lib/db/src/schema/finance.ts`
- API domains and authentication: `artifacts/api-server/src/routes/`
- Aggregation and amounts: `artifacts/api-server/src/lib/finance-data.ts`

## Architecture decisions

- Business dates represent calendar days, not instants. Preserve `YYYY-MM-DD` across validation, storage and JSON responses.
- Financial balances are derived from document lines and receipt/payment events; do not manually persist a second balance.
- The cashflow view is scheduled outstanding cash movement, not a bank balance or accounting ledger.

## Product

Site and counterparty ledgers, mixed-rate invoice/cost lines, partial receipts and supplier payments, site profitability, weekly/monthly scheduled cashflow, and BOM UTF-8 CSV export.

## User preferences

Product scope and approved CSV semantics are recorded in `.agents/memory/product-decisions.md`.

## Gotchas

- Regenerate API clients and validators after every OpenAPI change.
- Do not seed fictitious financial records into the user's ledger.
- Passwords and signing keys must never be printed or committed.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details

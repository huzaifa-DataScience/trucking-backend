# Siteline GraphQL schema reference

**This is the real Siteline API schema** — not a demo. We use it to get live billing data (contracts, pay apps, company, SOV) from Siteline for the authenticated account. Our backend calls their GraphQL API with this schema and returns that data to the frontend billing view.

This file summarizes the schema for our billing integration. Our backend will call their GraphQL API and expose REST endpoints that return this data (or a subset) to the frontend.

## Root queries (entry points)

| Query | Returns | Use |
|-------|---------|-----|
| `currentCompany` | `Company!` | Company for the authenticated token; includes users, locations. |
| (no list) | — | Company has `contacts`, not `contracts`. No root or company-level list of contracts in the schema. Use `contract(id)` with a known id. |
| `contract(id: ID!)` | `Contract!` | Single contract by id (project, payApps(months?), SOV, etc.). |
| `payApp(id: ID!)` | `PayApp!` | Single pay app by id (billing period, status, amounts, G702, etc.). |

There is no top-level `projects` query; **Project** is nested under **Contract** (`contract.project`).

---

## Main types (simplified)

- **User** – End user (firstName, lastName, email, company, jobTitle, phoneNumber, status).
- **Company** – Company (name, locations, users).
- **Location** – Physical address (street, city, state, country, postalCode, timeZone).
- **Project** – Project (name, location, timeZone, projectNumber); has many Contracts.
- **Contract** – Contract for a company on a project; has `project`, `sov`, `payApps(months?)`, `billingType`, `status`.
- **PayApp** – Single (e.g. monthly) pay app: `payAppNumber`, `billingStart`/`billingEnd`, `payAppDueDate`, `status`, `currentBilled`, `currentRetention`, `totalRetention`, `totalValue`, `balanceToFinish`, `g702Values`, etc. Status values: DRAFT, SIGNED, PROPOSED, SYNCED, PAID, etc.
- **Sov** – Schedule of values: `lineItems`, `totalValue`, `totalBilled`, `totalRetention`, `progressComplete`. (No `contractNumber`/`contractDate` on Sov; use `contract` relation if needed.)
- **SovLineItem** – One SOV line: `code`, `name`, `originalTotalValue`, `latestTotalValue`, `totalBilled`, `progressComplete`, etc.
- **G702Values** – G702 summary for a pay app (originalContractSum, totalCompletedToDate, totalRetention, previousPayments, currentPaymentDue, balanceToFinish, etc.).

---

## Enums we care about

- **BillingType**: LUMP_SUM, QUICK, UNIT_PRICE
- **ContractStatus**: INACTIVE, ACTIVE, ARCHIVED
- **PayAppStatus**: DRAFT, SIGNED, PROPOSED, SYNCED, SYNC_PENDING, SYNC_FAILED, NOTARIZING_UNCONDITIONAL, PAID

---

## How our backend will use this

1. **Auth** – Use `SITELINE_API_TOKEN` in the request (e.g. `Authorization: Bearer <token>` or as Siteline requires).
2. **GraphQL endpoint** – POST to Siteline’s GraphQL URL with body `{ "query": "...", "variables": {} }`.
3. **Queries we can run** – `currentCompany`, `contracts`, `contract(id)`, `payApp(id)`. For `contract(id)` we can request nested `project`, `payApps(months: [...])`, `sov { lineItems { ... } }` etc. as needed.
4. **Our REST API** – Siteline module will expose e.g. `GET /siteline/company`, `GET /siteline/contracts`, `GET /siteline/contracts/:id`, `GET /siteline/pay-apps/:id` that call these queries and return JSON (full or trimmed) to the frontend.

Frontend billing view will call only our backend; our backend uses this schema when talking to Siteline.

---

## Our REST endpoints (implemented)

| Method | Path | Sitseline query | Returns |
|--------|------|------------------|--------|
| GET | `/siteline/status` | — | `{ configured }` (public) |
| GET | `/siteline/company` | `currentCompany` | Company + locations |
| GET | `/siteline/contracts` | `contracts` | List of contracts (project, sov, payApps) |
| GET | `/siteline/contracts/:id` | `contract(id)` | Single contract detail |
| GET | `/siteline/pay-apps/:id` | `payApp(id)` | Single pay app + G702 values |

**Env:** `SITELINE_API_URL` = base URL (e.g. `https://api.siteline.com`; we append `/graphql` if missing). `SITELINE_API_TOKEN` = API token. By default we send it as `Authorization: Bearer <token>`. If Siteline expects a different header, set `SITELINE_AUTH_HEADER` (e.g. `Api-Token` or `X-API-Key`) and we send the token in that header instead.

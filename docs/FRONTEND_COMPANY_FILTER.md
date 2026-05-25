## Company Filtering (OurEntities) – Frontend Guide

This doc explains how the frontend should:

- Load the list of **“Our companies”** from the database.
- Let the user pick a company (global filter).
- Call the **Job Dashboard**, **Material Dashboard**, and **Hauler Dashboard** APIs with that company so all KPIs/tickets/exports are filtered consistently.
- Show the company name in the main ticket grid.

When we say **company** here, we mean an internal company from the SQL table `Ref_OurEntities` (exposed as the `OurEntity` entity). This is a **global filter** used across all dashboards.

---

## 1. Where company data comes from

### Database tables

- **`Ref_OurEntities`**  
  - `EntityID` (PK) – internal company id  
  - `EntityName` – internal company name (e.g. `GOEL`, `GOEL DC`, `DCB`)

- **`Ref_Jobs`**  
  - `JobID` (PK)  
  - `EntityID` (FK → Ref_OurEntities.EntityID)  
  - `JobNumber`, `JobName`, address fields…

- **`Fact_SiteTickets`**  
  - `TicketID` (PK)  
  - `JobID` (FK → Ref_Jobs.JobID)  
  - Other fields (direction, material, hauler, etc.)

So for **each ticket**, we can walk:

`Fact_SiteTickets.JobID` → `Ref_Jobs.EntityID` → `Ref_OurEntities.EntityName`

That is what the backend already does and exposes to the frontend.

---

## 2. API: load companies for the dropdown

Use the lookups endpoint:

```http
GET /lookups/our-entities
```

- **Auth:** same as other lookups (send JWT when auth is enabled).
- **Response shape:**

```json
[
  { "id": 1, "name": "GOEL" },
  { "id": 2, "name": "GOEL DC" },
  { "id": 3, "name": "DCB" },
  { "id": 4, "name": "TBD / Unassigned" }
]
```

- `id` = `Ref_OurEntities.EntityID`
- `name` = `Ref_OurEntities.EntityName`

### Frontend usage

- Build the **“Our company”** dropdown from this response.
- Store `id` as the selected value (e.g. `selectedEntityId`), and show `name` as the label.
- Use a special value like `null` / `undefined` / `'all'` to mean **no company filter**.

❗ **Important:** When calling dashboard APIs, always send this value as **`entityId`** (not `companyId`). `entityId` is the OurEntities id used for filtering; `companyId` is **ignored** by the dashboards and will not filter anything.

### Why does the Job Dashboard seem to work with a company filter?

The backend **only** reads the query parameter **`entityId`** on every dashboard (job, material, hauler). It does **not** read `companyId` anywhere.

- If the **Job Dashboard** filters correctly when you pick a company, the frontend for that screen is almost certainly sending **`entityId`** in the request (e.g. `?entityId=2`). Check the network tab: the URL or request body for job-dashboard calls will use `entityId`.
- If **Material** or **Hauler** dashboards return the same data for every company, those screens are likely sending the same dropdown value as **`companyId`** instead of **`entityId`**. The backend ignores `companyId`, so no filtering happens.

**Fix:** Use the **same parameter name everywhere** – send **`entityId`** (and the same value from `/lookups/our-entities`) for Job, Material, and Hauler dashboard calls. Then all three will filter by the selected company.

---

## 3. API: dashboard endpoints with company filter

All **dashboard** endpoints below accept an optional `entityId` query parameter. This is the `id` from `/lookups/our-entities`.

### 3.1 KPIs

```http
GET /job-dashboard/kpis?startDate=2024-01-01&endDate=2024-12-31&entityId=1&direction=Both
```

**Query params:**

- `startDate` (required) – `YYYY-MM-DD`
- `endDate` (required) – `YYYY-MM-DD`
- `jobId` (optional) – specific job id; omit for “all jobs”
- `entityId` (optional) – **company id** from `/lookups/our-entities`
- `direction` (optional) – `"Import" | "Export" | "Both"`

If `entityId` is provided, the backend keeps only tickets whose job belongs to that company.

### 3.2 Ticket grid (main table)

```http
GET /job-dashboard/tickets?startDate=2024-01-01&endDate=2024-12-31&entityId=1&page=1&pageSize=50
```

**Query params:**

- Same as KPIs, plus:
  - `page` (default: 1)
  - `pageSize` (default: 50, max: 100)

**Response shape (simplified):**

```json
{
  "items": [
    {
      "ticketNumber": "T-001",
      "ticketDate": "2024-01-15",
      "createdAt": "2024-01-15T10:30:00Z",
      "jobName": "Job A",
      "companyName": "GOEL",
      "direction": "Import",
      "destinationOrigin": "Site X",
      "haulingCompany": "Hauler Co",
      "material": "Concrete",
      "truckNumber": "TR-123",
      "truckType": "Tri-Axle",
      "driverName": "John Doe",
      "hasPhysicalTicket": true,
      "haulerTicketNumber": "HT-456",
      "signedBy": "Supervisor",
      "photoTicket": "https://...",
      "photoTruck1": "https://...",
      "photoTruck2": null,
      "photoAsbestos": null,
      "photoScrap": null
    }
  ],
  "page": 1,
  "pageSize": 50,
  "total": 150
}
```

Key points:

- **`companyName`** is already included – it is `Ref_OurEntities.EntityName` for the job’s `EntityID`.
- When `entityId` is set, all rows will have `companyName` equal to that selected company.

### 3.3 Vendor/material summaries and export (Job Dashboard)

These job-dashboard endpoints also accept `entityId`:

- `GET /job-dashboard/summary/vendor?startDate=&endDate=&entityId=&direction=`
- `GET /job-dashboard/summary/material?startDate=&endDate=&entityId=&direction=`
- `GET /job-dashboard/tickets/export?startDate=&endDate=&entityId=&direction=`

Pass the same `entityId` used for the grid so the KPIs, summaries, grid, and Excel export all stay in sync.

### 3.4 Material Dashboard with company filter

All material-dashboard endpoints accept `entityId`:

- `GET /material-dashboard/kpis?startDate=&endDate=&materialId=&jobId=&entityId=&direction=`
- `GET /material-dashboard/summary/sites?startDate=&endDate=&materialId=&jobId=&entityId=&direction=`
- `GET /material-dashboard/summary/jobs?startDate=&endDate=&materialId=&jobId=&entityId=&direction=`
- `GET /material-dashboard/tickets?startDate=&endDate=&materialId=&jobId=&entityId=&direction=&page=&pageSize=`
- `GET /material-dashboard/tickets/export?startDate=&endDate=&materialId=&jobId=&entityId=&direction=`

Use the same `entityId` value you send to the job dashboard so the material view matches the company filter.

### 3.5 Hauler Dashboard with company filter

All hauler-dashboard endpoints accept `entityId`:

- `GET /hauler-dashboard/kpis?startDate=&endDate=&haulerId=&jobId=&materialId=&truckTypeId=&entityId=&direction=`
- `GET /hauler-dashboard/summary/billable-units?startDate=&endDate=&haulerId=&jobId=&materialId=&truckTypeId=&entityId=&direction=`
- `GET /hauler-dashboard/summary/cost-center?startDate=&endDate=&haulerId=&jobId=&materialId=&truckTypeId=&entityId=&direction=`
- `GET /hauler-dashboard/tickets?startDate=&endDate=&haulerId=&jobId=&materialId=&truckTypeId=&entityId=&direction=&page=&pageSize=`
- `GET /hauler-dashboard/tickets/export?startDate=&endDate=&haulerId=&jobId=&materialId=&truckTypeId=&entityId=&direction=`

Again, use the same `entityId` everywhere so all dashboards stay aligned to the selected company.

---

## 4. Frontend wiring – example flow

High‑level steps:

1. **On load**, fetch:
   - Companies: `GET /lookups/our-entities`
   - Jobs: `GET /lookups/jobs` (existing)
2. Render filters:
   - Date range
   - Direction
   - **Our company** (from `/lookups/our-entities`)
   - (Optional) Job (from `/lookups/jobs`)
3. When filters change, build a query string:

```ts
const params = new URLSearchParams();
params.set('startDate', startDate);
params.set('endDate', endDate);
if (direction && direction !== 'Both') params.set('direction', direction);
if (selectedEntityId != null) params.set('entityId', String(selectedEntityId));
if (selectedJobId != null) params.set('jobId', String(selectedJobId));
params.set('page', String(page));
params.set('pageSize', String(pageSize));

fetch(`/job-dashboard/tickets?${params.toString()}`);
```

**Do not** send `companyId` here – the backend only understands `entityId` for this global company filter. Using `companyId` will return the same data for all companies and leave the `companyName` column empty.

4. Use the **same params** for:
   - `/job-dashboard/kpis`
   - `/job-dashboard/summary/vendor`
   - `/job-dashboard/summary/material`
   - `/job-dashboard/tickets/export`

5. In the table component, show both **Job** and **Company**:
   - Job column → `row.jobName`
   - Company column → `row.companyName`

---

## 5. “Our company” vs hauler company

Important distinction:

- **Our company (internal)** – from `Ref_OurEntities` via `entityId` and `/lookups/our-entities`.
- **Hauler / trucking company (external)** – from `Ref_ExternalCompanies`, already exposed in the **Hauler dashboard** and the `haulingCompany` column on the ticket grid.

This document is specifically about **Our company** filtering using `Ref_OurEntities` (internal entities).


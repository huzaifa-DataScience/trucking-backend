## Backend Implementation – Construction Logistics Reporting Dashboard

This document describes **what the NestJS backend currently exposes** for the frontend and how it maps to `BACKEND_API_SPEC.md`.

Backend entrypoint: `http://localhost:3000`  
Auth: **none** (can be added later; all routes are open).

---

## 1. Data model (what the API returns)

### 1.1 Ticket row (`TicketRow`)

Used by all ticket grids (Job / Material / Hauler dashboards).

```ts
type Direction = 'Import' | 'Export';

interface TicketRow {
  ticketNumber: string;
  ticketDate: string;   // YYYY-MM-DD
  createdAt: string;    // ISO datetime

  jobName: string;
  direction: Direction; // 'Import' | 'Export'
  destinationOrigin: string; // external site name

  haulingCompany: string; // hauler/vendor name
  material: string;       // material name
  truckNumber: string;
  truckType: string;
  driverName: string;

  hasPhysicalTicket: boolean;
  haulerTicketNumber: 'N/A' | 'MISSING' | string;

  signedBy: string;

  // Pivoted photo URLs (null when absent)
  photoTicket: string | null;
  photoTruck1: string | null;
  photoTruck2: string | null;
  photoAsbestos: string | null;
  photoScrap: string | null;
}
```

**Notes**
- `haulerTicketNumber` logic is applied on the backend:
  - `hasPhysicalTicket === false` → `"N/A"`.
  - `hasPhysicalTicket === true` and number empty → `"MISSING"`.
  - Otherwise the actual ticket number.

### 1.2 Ticket detail (`TicketDetail`)

Used for the ticket detail modal (`/tickets/detail/:ticketNumber` and dashboard detail routes).

```ts
type TicketPhotoType = 'Ticket' | 'Truck' | 'Truck2' | 'Asbestos' | 'Scrap';

interface TicketPhoto {
  id: number;
  ticketId: number;
  type: TicketPhotoType;
  url: string;
  fileName?: string; // currently unused
}

interface TicketDetail extends TicketRow {
  id: number;        // internal ticket ID (Fact_SiteTickets.TicketID)
  companyId: string; // from Ref_Jobs.EntityID (if present)
  photos: TicketPhoto[];
}
```

Photo URLs are taken from `Fact_TicketPhotos.PhotoURL`; there is no file-path column in the DB.

### 1.3 Pagination (`PagedResult<T>`)

Ticket endpoints are paginated on the server.

```ts
interface PagedResult<T> {
  items: T[];
  page: number;     // 1-based
  pageSize: number; // default 50, max 100 enforced server-side
  total: number;    // total matching rows (before pagination)
}
```

---

## 2. Current routes (backend)

> **Important:** routes are currently mounted **without** a `/api` prefix, e.g.  
> `GET /job-dashboard/tickets`.  
> If the frontend prefers `/api/...`, we can add a global prefix in NestJS or expose aliases.

### 2.1 Lookups

All return simple arrays of `{ id: number; name: string }`.

- `GET /lookups/jobs`
- `GET /lookups/materials`
- `GET /lookups/haulers`
- `GET /lookups/external-sites`
- `GET /lookups/truck-types`

**Status vs spec**
- Spec expects `GET /api/lookups/...` with **`companyId`**.  
  Currently:
  - No `companyId` param is required/used yet.
  - IDs are numeric (frontend can `String(id)` where it expects `string`).

### 2.2 Job dashboard

Base controller: `/job-dashboard`

#### 2.2.1 Summary (KPIs + tables)

Currently split into separate endpoints:

- `GET /job-dashboard/kpis`
- `GET /job-dashboard/summary/vendor`
- `GET /job-dashboard/summary/material`

**Query params in all three**
- `startDate?: string` (YYYY-MM-DD)
- `endDate?: string` (YYYY-MM-DD)
- `jobId?: string` (numeric ID)
- `direction?: 'Import' | 'Export' | 'Both'`

**Status vs spec**
- Spec wants a **single** `GET /api/job-dashboard/summary` returning:
  - `kpis`, `vendorTable`, `materialTable` together.
- Backend already computes all three pieces; they are just exposed as separate calls.
- `companyId` is **not yet** in the filters (can be added easily).

#### 2.2.2 Tickets (main grid)

- `GET /job-dashboard/tickets`

**Query params**
- `startDate`, `endDate`, `jobId`, `direction` as above.
- `page` (default 1), `pageSize` (default 50, max 100).

**Response**

```ts
type GetJobDashboardTicketsResponse = PagedResult<TicketRow>;
```

#### 2.2.3 Ticket detail (job context)

- `GET /job-dashboard/tickets/detail/:ticketNumber`

**Response**

```ts
TicketDetail | null
```

---

### 2.3 Material dashboard

Base controller: `/material-dashboard`

#### 2.3.1 Summary

- `GET /material-dashboard/kpis`
- `GET /material-dashboard/summary/sites`
- `GET /material-dashboard/summary/jobs`

**Query params**
- `startDate`, `endDate`
- `materialId?`
- `jobId?`
- `direction?`

#### 2.3.2 Tickets

- `GET /material-dashboard/tickets`

**Query params**
- Same filters as above + `page`, `pageSize`.

**Response**

```ts
type GetMaterialDashboardTicketsResponse = PagedResult<TicketRow>;
```

#### 2.3.3 Ticket detail (material context)

- `GET /material-dashboard/tickets/detail/:ticketNumber`

---

### 2.4 Hauler (vendor) dashboard

Base controller: `/hauler-dashboard`

#### 2.4.1 Summary

- `GET /hauler-dashboard/kpis`
- `GET /hauler-dashboard/summary/billable-units`
- `GET /hauler-dashboard/summary/cost-center`

**Query params**
- `startDate`, `endDate`
- `haulerId?`
- `jobId?`
- `materialId?`
- `truckTypeId?`
- `direction?`

#### 2.4.2 Tickets

- `GET /hauler-dashboard/tickets`

**Query params**
- Same filters as above + `page`, `pageSize`.

**Response**

```ts
type GetHaulerDashboardTicketsResponse = PagedResult<TicketRow>;
```

#### 2.4.3 Ticket detail (hauler context)

- `GET /hauler-dashboard/tickets/detail/:ticketNumber`

---

### 2.5 Forensic & audit

Base controller: `/forensic`

#### 2.5.1 Late submission audit

- `GET /forensic/late-submission`

**Query params**
- `startDate`, `endDate`  
  (job/material/hauler/truckType/direction filters can be added as needed).

**Response**

```ts
interface LateSubmissionRow {
  ticketNumber: string;
  ticketDate: string;
  systemDate: string;
  lagTime: string;
  signedBy: string;
  jobName: string;
  hauler: string;
}
type GetLateSubmissionsResponse = LateSubmissionRow[];
```

#### 2.5.2 Efficiency outlier report

- `GET /forensic/efficiency-outlier`

**Query params**
- `startDate`, `endDate` (other filters can be added).

**Response**

```ts
interface EfficiencyOutlierRow {
  date: string;
  jobName: string;
  routeName: string;   // external site name (destination)
  truckNumber: string;
  fleetAvgLoads: number;
  thisTruckLoads: number;
  firstTicketTime: string; // 'HH:MM'
  lastTicketTime: string;  // 'HH:MM'
  impliedHours: number;
  loadsPerHour: number;
}
type GetEfficiencyOutliersResponse = EfficiencyOutlierRow[];
```

---

### 2.6 Shared ticket detail endpoint

Base controller: `/tickets`

- `GET /tickets/detail/:ticketNumber`

**Response**

```ts
TicketDetail | null
```

**Status vs spec**
- Spec wants: `GET /api/tickets/:ticketNumber?companyId=...`.
- Current backend does **not** require `companyId` and uses `ticketNumber` alone.

---

## 3. Export to Excel

Implemented:

- `GET /job-dashboard/tickets/export`
- `GET /material-dashboard/tickets/export`
- `GET /hauler-dashboard/tickets/export`

These return `.xlsx` files with the same columns as `TicketRow`.

Spec’s forensic export endpoints are **not implemented yet** (frontend can continue doing client-side export there, or we can add them).

---

## 4. Differences vs BACKEND_API_SPEC.md (to be aware of)

1. **Base path**
   - Spec: `/api/...`
   - Current: no `/api` prefix (e.g. `/job-dashboard/tickets`).
   - **Plan:** we can add a global `/api` prefix or additional aliases without changing the shapes.

2. **`companyId`**
   - Spec: required on all data endpoints.
   - Current: not yet used in filters; queries are scoped only by date/job/material/etc.
   - **Plan:** add `companyId` to query DTOs and include it in all where-clauses.

3. **Summary endpoints**
   - Spec: single `.../summary` per dashboard.
   - Current: KPIs and tables are split into separate endpoints (already computed, just not wrapped into one response).

4. **Extra fields**
   - Backend can expose **additional DB fields** (IDs, job numbers, etc.) without breaking the spec since JSON tolerates extra properties. If the frontend wants more raw data, we can list and add those fields explicitly.

---

## 5. How frontend should integrate right now

- Use the field names and shapes from **section 1** (`TicketRow`, `TicketDetail`, `PagedResult<T>`).
- Call the routes from **section 2** with the query params described there.
- For production, we can:
  - Add `/api` prefix.
  - Wire `companyId` into every filter.
  - Optionally combine summary endpoints to match the spec’s exact URLs.


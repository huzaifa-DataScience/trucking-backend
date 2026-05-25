# Backend API Specification – Construction Logistics Reporting Dashboard

This document describes **exactly what the frontend needs from the backend** to power the Construction Logistics Reporting Dashboard. It is written from the point of view of the existing Next.js frontend in this repo.

The backend stack is assumed to be **NestJS + SQL Server**, but any implementation is fine as long as it obeys this contract.

---

## 1. Global concepts

### 1.1 Multi-company / multi-branch

- The system is **multi-tenant**: one deployment can host **multiple companies/branches**.
- The frontend always operates in the context of **one selected company** (chosen via a dropdown in the header).
- **Requirement**: every data endpoint **must** be scoped by a `companyId`.

### 1.2 Core entities & ID resolution

The frontend **never** wants to see raw IDs in grids/cards; it needs **human-readable names**.

Back-end source tables (names are illustrative):

- `Jobs`: `JobId`, `JobName`, …
- `Materials`: `MaterialId`, `MaterialName`, …
- `Haulers` / `TruckingCompanies`: `HaulerId`, `CompanyName`, …
- `TruckTypes`: `TruckTypeId`, `TruckTypeName`, …
- `ExternalSites`: `ExternalSiteId`, `ExternalSiteName`, …
- `Drivers`: `DriverId`, `DriverName`, …
- `Tickets`: `TicketId`, `TicketNumber`, `TicketDate`, `CreatedAt`, etc.
- `Photos` (`dbo.Photos`): `PhotoId`, `TicketId`, `PhotoType`, `Url`, …

**Frontend requirement (applies to all endpoints):**

- Wherever a grid/card shows:
  - **Job** → backend must return `jobName` (string), not `jobId`.
  - **Material** → `material` / `materialName` (string), not `materialId`.
  - **Hauler / Trucking company** → `haulingCompany` (string), not `haulerId`.
  - **Truck type** → `truckType` (string), not `truckTypeId`.
  - **External site** → `destinationOrigin` or `externalSiteName` (string), not site ID.
  - **Driver** → `driverName` (string), not `driverId`.

Backend may still use IDs internally, but responses must be **fully resolved names**.

### 1.3 Photos & pivoting

Photos live in a separate `Photos` table linked via `TicketId`.

Photo types (per spec and frontend types):

- `"Ticket"` – physical ticket photo
- `"Truck"` – truck photo 1
- `"Truck2"` – truck photo 2
- `"Asbestos"` – asbestos photo
- `"Scrap"` – scrap photo

**Requirements:**

1. For **main ticket grids** (Job / Material / Hauler dashboards), response must expose **pivoted, type-specific columns**:

   ```ts
   photoTicket: string | null;   // URL or null
   photoTruck1: string | null;
   photoTruck2: string | null;
   photoAsbestos: string | null;
   photoScrap: string | null;
   ```

   - If no photo exists for a type → **null** (frontend shows empty cell).

2. For the **ticket detail modal**, the backend must also provide a **full photo list**:

   ```ts
   photos: {
     id: number;
     ticketId: number;
     type: "Ticket" | "Truck" | "Truck2" | "Asbestos" | "Scrap";
     url: string;
     fileName?: string;
   }[];
   ```

   - Frontend uses this for the detail gallery.

### 1.4 Ticket row shape (core contract)

All main dashboards share a **common ticket row** (used in the grids). This is the **baseline contract** for ticket data:

```ts
type Direction = "Import" | "Export";

interface TicketRow {
  ticketNumber: string;
  ticketDate: string;          // ISO date: YYYY-MM-DD
  createdAt: string;           // ISO datetime string (or "YYYY-MM-DD HH:mm:ss")

  jobName: string;
  direction: Direction;        // "Import" | "Export"
  destinationOrigin: string;   // external site name

  haulingCompany: string;      // vendor/hauler name
  material: string;            // material name
  truckNumber: string;
  truckType: string;
  driverName: string;

  hasPhysicalTicket: boolean;
  haulerTicketNumber: "N/A" | "MISSING" | string;

  signedBy: string;

  // Pivoted photo URLs (null when absent)
  photoTicket: string | null;
  photoTruck1: string | null;
  photoTruck2: string | null;
  photoAsbestos: string | null;
  photoScrap: string | null;
}
```

**Special logic for `haulerTicketNumber` (backend responsibility):**

- If `HasPhysicalTicket` is **false** → send `"N/A"`.
- If `HasPhysicalTicket` is **true** but the number is missing → send `"MISSING"`.
- Else → send the real hauler ticket number string.

The frontend will:

- Render `"MISSING"` in **red**.
- Render `"N/A"` and normal numbers in default styling.

### 1.5 Ticket detail shape

When the user clicks a ticket number in any grid, frontend opens a modal with full details. It needs a **full ticket object**:

```ts
interface TicketDetail extends TicketRow {
  id: number;           // internal ticket ID
  companyId: string;    // owning company/branch
  photos: Photo[];      // full list (see above)
}
```

---

## 2. Common filtering, pagination, and error model

### 2.1 Filters

All dashboards share a common filter model:

```ts
interface ReportFilters {
  companyId: string;    // required
  startDate: string;    // YYYY-MM-DD (inclusive)
  endDate: string;      // YYYY-MM-DD (inclusive)

  jobId?: string;       // optional; "all" or specific JobId
  materialId?: string;  // optional; "all" or specific MaterialId
  haulerId?: string;    // optional; "all" or specific HaulerId
  truckTypeId?: string; // optional; "all" or specific TruckTypeId

  direction?: "Import" | "Export" | "Both"; // default: "Both"
}
```

Notes:

- Frontend will send `direction="Both"` to mean “no direction filter”.
- Frontend will send `"all"` or omit the filter (`jobId`, `materialId`, etc.) to mean “no filter”.
- Backend may choose to accept either IDs (recommended) or names as values. If IDs are used:
  - Provide lookup endpoints (see **Lookups** section).

### 2.2 Pagination

For large datasets, backend should implement **server-side pagination** for ticket endpoints:

Query parameters:

- `page: number` (1-based)
- `pageSize: number` (default **50**, max maybe 200)

Response shape:

```ts
interface PagedResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number; // total matching rows (before pagination)
}
```

Frontend currently paginates client-side, but will happily switch to server-side by reading `items` and `total`.

### 2.3 Error model

Use standard HTTP codes:

- `400` – invalid filters (e.g. invalid date, unknown direction)
- `404` – ticket not found, unknown company, etc.
- `500` – unexpected errors

Error body:

```ts
interface ApiError {
  message: string;
  code?: string;
  details?: unknown;
}
```

---

## 3. Lookups (companies, jobs, materials, haulers, truck types, sites)

The frontend needs dropdown options for filters and the company selector.

### 3.1 Companies

**Endpoint**

- `GET /api/companies`

**Query**

- No query params needed (front-end loads them once and caches).

**Response**

```ts
type Company = {
  id: string;   // stable identifier
  name: string; // display name
};

type GetCompaniesResponse = Company[];
```

### 3.2 Jobs, materials, haulers, truck types, external sites

All of these are **company-scoped**.

**Endpoints**

- `GET /api/lookups/jobs?companyId=...`
- `GET /api/lookups/materials?companyId=...`
- `GET /api/lookups/haulers?companyId=...`
- `GET /api/lookups/truck-types?companyId=...`
- (optional, if needed) `GET /api/lookups/external-sites?companyId=...`

**Response shape (example for jobs)**

```ts
interface LookupItem {
  id: string;
  name: string;
}

type GetJobsResponse = LookupItem[];
type GetMaterialsResponse = LookupItem[];
type GetHaulersResponse = LookupItem[];
type GetTruckTypesResponse = LookupItem[];
type GetExternalSitesResponse = LookupItem[];
```

---

## 4. Endpoints by page

### 4.1 Page A – Job Dashboard (`/job`)

**Frontend sections:**

- Filters (sticky)
- KPI cards
- Summary tables:
  - Vendor: Company Name, Truck Type, Total Tickets
  - Material: Material Name, Total Tickets
- Detailed Ticket Grid

#### 4.1.1 Job dashboard summary (KPIs + summary tables)

**Endpoint**

- `GET /api/job-dashboard/summary`

**Query parameters**

- `companyId` (required)
- `startDate`, `endDate` (required)
- `jobId` (optional)
- `direction` (optional: `Import` | `Export` | `Both`)

**Response**

```ts
interface JobDashboardSummaryResponse {
  kpis: {
    totalTickets: number;
    flowBalance: string;  // e.g. "15 Imports / 45 Exports"
    lastActive: string;   // YYYY-MM-DD or "—" if none
  };

  vendorTable: {
    companyName: string;
    truckType: string;
    totalTickets: number;
  }[];

  materialTable: {
    materialName: string;
    totalTickets: number;
  }[];
}
```

#### 4.1.2 Job dashboard tickets (main grid)

**Endpoint**

- `GET /api/job-dashboard/tickets`

**Query parameters**

- All filters from **ReportFilters**:
  - `companyId`, `startDate`, `endDate`, `jobId`, `direction`, …
- Pagination:
  - `page`, `pageSize` (default `pageSize=50`)

**Response**

```ts
type GetJobDashboardTicketsResponse = PagedResult<TicketRow>;
```

> Backend must include **pivoted photo URLs** and apply `haulerTicketNumber` logic as described earlier.

---

### 4.2 Page B – Material Dashboard (`/material`)

**Frontend sections:**

- Filters: Start/End Date, Material, Job, Direction
- KPI cards
- Summary tables:
  - Sites: External Site Name, Direction, Total Tickets
  - Jobs: Job Name, Direction, Total Tickets
- Detailed Ticket Grid (same columns as Job page)

#### 4.2.1 Material dashboard summary

**Endpoint**

- `GET /api/material-dashboard/summary`

**Query parameters**

- `companyId`
- `startDate`, `endDate`
- `materialId` (optional)
- `jobId` (optional)
- `direction` (optional)

**Response**

```ts
interface MaterialDashboardSummaryResponse {
  kpis: {
    totalTickets: number;
    topSource: string;      // name of #1 external site for imports
    topDestination: string; // name of #1 external site for exports
    activeJobs: number;     // count of distinct jobs moving this material
  };

  sitesTable: {
    externalSiteName: string;
    direction: "Import" | "Export";
    totalTickets: number;
  }[];

  jobsTable: {
    jobName: string;
    direction: "Import" | "Export";
    totalTickets: number;
  }[];
}
```

#### 4.2.2 Material dashboard tickets

**Endpoint**

- `GET /api/material-dashboard/tickets`

**Query parameters**

- Same as **ReportFilters** (companyId, date range, job, material, direction, etc.).
- Pagination: `page`, `pageSize` (default 50).

**Response**

```ts
type GetMaterialDashboardTicketsResponse = PagedResult<TicketRow>;
```

---

### 4.3 Page C – Hauler (Vendor) Dashboard (`/hauler`)

**Frontend sections:**

- Filters: Start/End Date, Hauler, Job, Material, Truck Type, Direction
- KPI cards:
  - Total Tickets
  - Unique Trucks
  - Active Jobs
- Summary tables:
  - Billable Units: Truck Type, Total Tickets
  - Cost Center: Job Name, Total Tickets
- Detailed Ticket Grid (same columns)

#### 4.3.1 Hauler dashboard summary

**Endpoint**

- `GET /api/hauler-dashboard/summary`

**Query parameters**

- `companyId`
- `startDate`, `endDate`
- `haulerId` (optional)
- `jobId` (optional)
- `materialId` (optional)
- `truckTypeId` (optional)
- `direction` (optional)

**Response**

```ts
interface HaulerDashboardSummaryResponse {
  kpis: {
    totalTickets: number;
    uniqueTrucks: number; // distinct truck numbers
    activeJobs: number;   // distinct jobs served
  };

  billableUnitsTable: {
    truckType: string;
    totalTickets: number;
  }[];

  costCenterTable: {
    jobName: string;
    totalTickets: number;
  }[];
}
```

#### 4.3.2 Hauler dashboard tickets

**Endpoint**

- `GET /api/hauler-dashboard/tickets`

**Query parameters**

- All filters (company, date, job, material, hauler, truck type, direction).
- Pagination.

**Response**

```ts
type GetHaulerDashboardTicketsResponse = PagedResult<TicketRow>;
```

> **Note**: `createdAt` is critical here to detect backdating. Make sure it is accurate system time when the ticket was entered.

---

### 4.4 Page D – Forensic & Audit Tools (`/forensic`)

Two tabs:

1. **Late Submission Audit**
2. **Efficiency Outlier Report**

Both share the same filter bar (company + date + job + material + hauler + truckType + direction).

#### 4.4.1 Late Submission Audit (Tab 1)

Logic:

- Flag tickets where **CreatedAt > 24 hours after TicketDate**.

**Endpoint**

- `GET /api/forensic/late-submissions`

**Query parameters**

- Same as **ReportFilters**.

**Row shape**

```ts
interface LateSubmissionRow {
  ticketNumber: string;
  ticketDate: string;   // user-entered work date
  systemDate: string;   // CreatedAt system timestamp
  lagTime: string;      // human-readable, e.g. "+4 Days"
  signedBy: string;
  jobName: string;
  hauler: string;       // hauling company
}
```

**Response**

```ts
type GetLateSubmissionsResponse = LateSubmissionRow[];
```

#### 4.4.2 Efficiency Outlier Report (Tab 2)

Logic (per spec):

1. Group data by **Date + Job + Destination** (this is “the route”).
2. For each route, compute:
   - Average loads per truck (fleet benchmark).
3. For each truck on that route:
   - Compare this truck’s loads vs fleet average.
   - Compute implied hours (time between first and last ticket for that truck on that route).
   - Compute loads per hour (efficiency score).

**Endpoint**

- `GET /api/forensic/efficiency-outliers`

**Query parameters**

- Same filters as **ReportFilters**.

**Row shape**

```ts
interface EfficiencyOutlierRow {
  date: string;           // route date (ticket date)
  jobName: string;
  route: string;          // e.g. "Job Name / External Site Name"
  truckNumber: string;

  fleetAvgLoads: number;  // average loads per truck on this route
  thisTruckLoads: number; // loads for this truck on this route

  firstTicketTime: string; // e.g. "07:00 AM"
  lastTicketTime: string;  // e.g. "02:00 PM"
  impliedHours: number;    // e.g. 7.0
  loadsPerHour: number;    // efficiency score
}
```

**Response**

```ts
type GetEfficiencyOutliersResponse = EfficiencyOutlierRow[];
```

---

## 5. Ticket detail endpoint

**Endpoint**

- `GET /api/tickets/:ticketNumber`

**Query parameters**

- `companyId` (required)

**Response**

```ts
type GetTicketDetailResponse = TicketDetail; // as defined earlier
```

Backend must:

- Resolve all IDs to names (job, material, hauler, truck type, driver, site).
- Include both pivoted photo URLs and the full `photos` list.

---

## 6. Export to Excel

The frontend currently uses **client-side Excel exports** via the `xlsx` library for:

- Ticket grids (Job / Material / Hauler dashboards)
- Late Submission Audit grid
- Efficiency Outlier grid

This means **backend export endpoints are optional**.

If you prefer to move export logic to the backend (e.g. for very large datasets), suggested endpoints:

- `GET /api/job-dashboard/tickets/export?{filters...}` – returns Excel file
- `GET /api/material-dashboard/tickets/export?{filters...}`
- `GET /api/hauler-dashboard/tickets/export?{filters...}`
- `GET /api/forensic/late-submissions/export?{filters...}`
- `GET /api/forensic/efficiency-outliers/export?{filters...}`

Response:

- `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
- `Content-Disposition: attachment; filename="..."`  

Frontend can then simply open the returned file.

---

## 7. Authentication & authorization (optional / future)

Currently, the frontend assumes **no auth** (or that auth is handled elsewhere, e.g. reverse proxy).

If you add auth:

- Prefer **JWT** or session cookies.
- Frontend will:
  - Attach an `Authorization: Bearer <token>` header if needed.
  - Respect `401` / `403` responses by redirecting to login or showing an error.

From the frontend’s perspective, the only hard requirement is that all the endpoints listed above remain available behind whatever auth layer you choose.

---

## 8. Summary checklist for backend

- [ ] Implement `GET /api/companies` and `GET /api/lookups/*` endpoints.
- [ ] Implement ticket-based endpoints for Job, Material, Hauler dashboards:
  - `/api/job-dashboard/summary`
  - `/api/job-dashboard/tickets`
  - `/api/material-dashboard/summary`
  - `/api/material-dashboard/tickets`
  - `/api/hauler-dashboard/summary`
  - `/api/hauler-dashboard/tickets`
- [ ] Implement Forensic endpoints:
  - `/api/forensic/late-submissions`
  - `/api/forensic/efficiency-outliers`
- [ ] Implement `GET /api/tickets/:ticketNumber` (detail).
- [ ] Make sure **all responses**:
  - Are **scoped by `companyId`**.
  - Resolve all IDs into **human-readable names**.
  - Pivot photos into ticket columns and also expose a full `photos` array for details.
  - Apply the **Hauler Ticket Number** business rule (`N/A` / `MISSING`).

If the backend matches this contract, the existing frontend can be wired to live SQL Server data with minimal changes (mainly swapping mock-data calls for real API calls).

# Backend API Specification – Construction Logistics Reporting Dashboard

This document describes **exactly what the frontend needs from the backend** to power the Construction Logistics Reporting Dashboard. It is written from the point of view of the existing Next.js frontend in this repo.

The backend stack is assumed to be **NestJS + SQL Server**, but any implementation is fine as long as it obeys this contract.

---

## 1. Global concepts

### 1.1 Multi-company / multi-branch

- The system is **multi-tenant**: one deployment can host **multiple companies/branches**.
- The frontend always operates in the context of **one selected company** (chosen via a dropdown in the header).
- **Requirement**: every data endpoint **must** be scoped by a `companyId`.

### 1.2 Core entities & ID resolution

The frontend **never** wants to see raw IDs in grids/cards; it needs **human-readable names**.

Back-end source tables (names are illustrative):

- `Jobs`: `JobId`, `JobName`, …
- `Materials`: `MaterialId`, `MaterialName`, …
- `Haulers` / `TruckingCompanies`: `HaulerId`, `CompanyName`, …
- `TruckTypes`: `TruckTypeId`, `TruckTypeName`, …
- `ExternalSites`: `ExternalSiteId`, `ExternalSiteName`, …
- `Drivers`: `DriverId`, `DriverName`, …
- `Tickets`: `TicketId`, `TicketNumber`, `TicketDate`, `CreatedAt`, etc.
- `Photos` (`dbo.Photos`): `PhotoId`, `TicketId`, `PhotoType`, `Url`, …

**Frontend requirement (applies to all endpoints):**

- Wherever a grid/card shows:
  - **Job** → backend must return `jobName` (string), not `jobId`.
  - **Material** → `material` / `materialName` (string), not `materialId`.
  - **Hauler / Trucking company** → `haulingCompany` (string), not `haulerId`.
  - **Truck type** → `truckType` (string), not `truckTypeId`.
  - **External site** → `destinationOrigin` or `externalSiteName` (string), not site ID.
  - **Driver** → `driverName` (string), not `driverId`.

Backend may still use IDs internally, but responses must be **fully resolved names**.

### 1.3 Photos & pivoting

Photos live in a separate `Photos` table linked via `TicketId`.

Photo types (per spec and frontend types):

- `"Ticket"` – physical ticket photo
- `"Truck"` – truck photo 1
- `"Truck2"` – truck photo 2
- `"Asbestos"` – asbestos photo
- `"Scrap"` – scrap photo

**Requirements:**

1. For **main ticket grids** (Job / Material / Hauler dashboards), response must expose **pivoted, type-specific columns**:

   ```ts
   photoTicket: string | null;   // URL or null
   photoTruck1: string | null;
   photoTruck2: string | null;
   photoAsbestos: string | null;
   photoScrap: string | null;
   ```

   - If no photo exists for a type → **null** (frontend shows empty cell).

2. For the **ticket detail modal**, the backend must also provide a **full photo list**:

   ```ts
   photos: {
     id: number;
     ticketId: number;
     type: "Ticket" | "Truck" | "Truck2" | "Asbestos" | "Scrap";
     url: string;
     fileName?: string;
   }[];
   ```

   - Frontend uses this for the detail gallery.

### 1.4 Ticket row shape (core contract)

All main dashboards share a **common ticket row** (used in the grids). This is the **baseline contract** for ticket data:

```ts
type Direction = "Import" | "Export";

interface TicketRow {
  ticketNumber: string;
  ticketDate: string;          // ISO date: YYYY-MM-DD
  createdAt: string;           // ISO datetime string (or "YYYY-MM-DD HH:mm:ss")

  jobName: string;
  direction: Direction;        // "Import" | "Export"
  destinationOrigin: string;   // external site name

  haulingCompany: string;      // vendor/hauler name
  material: string;            // material name
  truckNumber: string;
  truckType: string;
  driverName: string;

  hasPhysicalTicket: boolean;
  haulerTicketNumber: "N/A" | "MISSING" | string;

  signedBy: string;

  // Pivoted photo URLs (null when absent)
  photoTicket: string | null;
  photoTruck1: string | null;
  photoTruck2: string | null;
  photoAsbestos: string | null;
  photoScrap: string | null;
}
```

**Special logic for `haulerTicketNumber` (backend responsibility):**

- If `HasPhysicalTicket` is **false** → send `"N/A"`.
- If `HasPhysicalTicket` is **true** but the number is missing → send `"MISSING"`.
- Else → send the real hauler ticket number string.

The frontend will:

- Render `"MISSING"` in **red**.
- Render `"N/A"` and normal numbers in default styling.

### 1.5 Ticket detail shape

When the user clicks a ticket number in any grid, frontend opens a modal with full details. It needs a **full ticket object**:

```ts
interface TicketDetail extends TicketRow {
  id: number;           // internal ticket ID
  companyId: string;    // owning company/branch
  photos: Photo[];      // full list (see above)
}
```

---

## 2. Common filtering, pagination, and error model

### 2.1 Filters

All dashboards share a common filter model:

```ts
interface ReportFilters {
  companyId: string;    // required
  startDate: string;    // YYYY-MM-DD (inclusive)
  endDate: string;      // YYYY-MM-DD (inclusive)

  jobId?: string;       // optional; "all" or specific JobId
  materialId?: string;  // optional; "all" or specific MaterialId
  haulerId?: string;    // optional; "all" or specific HaulerId
  truckTypeId?: string; // optional; "all" or specific TruckTypeId

  direction?: "Import" | "Export" | "Both"; // default: "Both"
}
```

Notes:

- Frontend will send `direction="Both"` to mean “no direction filter”.
- Frontend will send `"all"` or omit the filter (`jobId`, `materialId`, etc.) to mean “no filter”.
- Backend may choose to accept either IDs (recommended) or names as values. If IDs are used:
  - Provide lookup endpoints (see **Lookups** section).

### 2.2 Pagination

For large datasets, backend should implement **server-side pagination** for ticket endpoints:

Query parameters:

- `page: number` (1-based)
- `pageSize: number` (default **50**, max maybe 200)

Response shape:

```ts
interface PagedResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number; // total matching rows (before pagination)
}
```

Frontend currently paginates client-side, but will happily switch to server-side by reading `items` and `total`.

### 2.3 Error model

Use standard HTTP codes:

- `400` – invalid filters (e.g. invalid date, unknown direction)
- `404` – ticket not found, unknown company, etc.
- `500` – unexpected errors

Error body:

```ts
interface ApiError {
  message: string;
  code?: string;
  details?: unknown;
}
```

---

## 3. Lookups (companies, jobs, materials, haulers, truck types, sites)

The frontend needs dropdown options for filters and the company selector.

### 3.1 Companies

**Endpoint**

- `GET /api/companies`

**Query**

- No query params needed (front-end loads them once and caches).

**Response**

```ts
type Company = {
  id: string;   // stable identifier
  name: string; // display name
};

type GetCompaniesResponse = Company[];
```

### 3.2 Jobs, materials, haulers, truck types, external sites

All of these are **company-scoped**.

**Endpoints**

- `GET /api/lookups/jobs?companyId=...`
- `GET /api/lookups/materials?companyId=...`
- `GET /api/lookups/haulers?companyId=...`
- `GET /api/lookups/truck-types?companyId=...`
- (optional, if needed) `GET /api/lookups/external-sites?companyId=...`

**Response shape (example for jobs)**

```ts
interface LookupItem {
  id: string;
  name: string;
}

type GetJobsResponse = LookupItem[];
type GetMaterialsResponse = LookupItem[];
type GetHaulersResponse = LookupItem[];
type GetTruckTypesResponse = LookupItem[];
type GetExternalSitesResponse = LookupItem[];
```

---

## 4. Endpoints by page

### 4.1 Page A – Job Dashboard (`/job`)

**Frontend sections:**

- Filters (sticky)
- KPI cards
- Summary tables:
  - Vendor: Company Name, Truck Type, Total Tickets
  - Material: Material Name, Total Tickets
- Detailed Ticket Grid

#### 4.1.1 Job dashboard summary (KPIs + summary tables)

**Endpoint**

- `GET /api/job-dashboard/summary`

**Query parameters**

- `companyId` (required)
- `startDate`, `endDate` (required)
- `jobId` (optional)
- `direction` (optional: `Import` | `Export` | `Both`)

**Response**

```ts
interface JobDashboardSummaryResponse {
  kpis: {
    totalTickets: number;
    flowBalance: string;  // e.g. "15 Imports / 45 Exports"
    lastActive: string;   // YYYY-MM-DD or "—" if none
  };

  vendorTable: {
    companyName: string;
    truckType: string;
    totalTickets: number;
  }[];

  materialTable: {
    materialName: string;
    totalTickets: number;
  }[];
}
```

#### 4.1.2 Job dashboard tickets (main grid)

**Endpoint**

- `GET /api/job-dashboard/tickets`

**Query parameters**

- All filters from **ReportFilters**:
  - `companyId`, `startDate`, `endDate`, `jobId`, `direction`, …
- Pagination:
  - `page`, `pageSize` (default `pageSize=50`)

**Response**

```ts
type GetJobDashboardTicketsResponse = PagedResult<TicketRow>;
```

> Backend must include **pivoted photo URLs** and apply `haulerTicketNumber` logic as described earlier.

---

### 4.2 Page B – Material Dashboard (`/material`)

**Frontend sections:**

- Filters: Start/End Date, Material, Job, Direction
- KPI cards
- Summary tables:
  - Sites: External Site Name, Direction, Total Tickets
  - Jobs: Job Name, Direction, Total Tickets
- Detailed Ticket Grid (same columns as Job page)

#### 4.2.1 Material dashboard summary

**Endpoint**

- `GET /api/material-dashboard/summary`

**Query parameters**

- `companyId`
- `startDate`, `endDate`
- `materialId` (optional)
- `jobId` (optional)
- `direction` (optional)

**Response**

```ts
interface MaterialDashboardSummaryResponse {
  kpis: {
    totalTickets: number;
    topSource: string;      // name of #1 external site for imports
    topDestination: string; // name of #1 external site for exports
    activeJobs: number;     // count of distinct jobs moving this material
  };

  sitesTable: {
    externalSiteName: string;
    direction: "Import" | "Export";
    totalTickets: number;
  }[];

  jobsTable: {
    jobName: string;
    direction: "Import" | "Export";
    totalTickets: number;
  }[];
}
```

#### 4.2.2 Material dashboard tickets

**Endpoint**

- `GET /api/material-dashboard/tickets`

**Query parameters**

- Same as **ReportFilters** (companyId, date range, job, material, direction, etc.).
- Pagination: `page`, `pageSize` (default 50).

**Response**

```ts
type GetMaterialDashboardTicketsResponse = PagedResult<TicketRow>;
```

---

### 4.3 Page C – Hauler (Vendor) Dashboard (`/hauler`)

**Frontend sections:**

- Filters: Start/End Date, Hauler, Job, Material, Truck Type, Direction
- KPI cards:
  - Total Tickets
  - Unique Trucks
  - Active Jobs
- Summary tables:
  - Billable Units: Truck Type, Total Tickets
  - Cost Center: Job Name, Total Tickets
- Detailed Ticket Grid (same columns)

#### 4.3.1 Hauler dashboard summary

**Endpoint**

- `GET /api/hauler-dashboard/summary`

**Query parameters**

- `companyId`
- `startDate`, `endDate`
- `haulerId` (optional)
- `jobId` (optional)
- `materialId` (optional)
- `truckTypeId` (optional)
- `direction` (optional)

**Response**

```ts
interface HaulerDashboardSummaryResponse {
  kpis: {
    totalTickets: number;
    uniqueTrucks: number; // distinct truck numbers
    activeJobs: number;   // distinct jobs served
  };

  billableUnitsTable: {
    truckType: string;
    totalTickets: number;
  }[];

  costCenterTable: {
    jobName: string;
    totalTickets: number;
  }[];
}
```

#### 4.3.2 Hauler dashboard tickets

**Endpoint**

- `GET /api/hauler-dashboard/tickets`

**Query parameters**

- All filters (company, date, job, material, hauler, truck type, direction).
- Pagination.

**Response**

```ts
type GetHaulerDashboardTicketsResponse = PagedResult<TicketRow>;
```

> **Note**: `createdAt` is critical here to detect backdating. Make sure it is accurate system time when the ticket was entered.

---

### 4.4 Page D – Forensic & Audit Tools (`/forensic`)

Two tabs:

1. **Late Submission Audit**
2. **Efficiency Outlier Report**

Both share the same filter bar (company + date + job + material + hauler + truckType + direction).

#### 4.4.1 Late Submission Audit (Tab 1)

Logic:

- Flag tickets where **CreatedAt > 24 hours after TicketDate**.

**Endpoint**

- `GET /api/forensic/late-submissions`

**Query parameters**

- Same as **ReportFilters**.

**Row shape**

```ts
interface LateSubmissionRow {
  ticketNumber: string;
  ticketDate: string;   // user-entered work date
  systemDate: string;   // CreatedAt system timestamp
  lagTime: string;      // human-readable, e.g. "+4 Days"
  signedBy: string;
  jobName: string;
  hauler: string;       // hauling company
}
```

**Response**

```ts
type GetLateSubmissionsResponse = LateSubmissionRow[];
```

#### 4.4.2 Efficiency Outlier Report (Tab 2)

Logic (per spec):

1. Group data by **Date + Job + Destination** (this is “the route”).
2. For each route, compute:
   - Average loads per truck (fleet benchmark).
3. For each truck on that route:
   - Compare this truck’s loads vs fleet average.
   - Compute implied hours (time between first and last ticket for that truck on that route).
   - Compute loads per hour (efficiency score).

**Endpoint**

- `GET /api/forensic/efficiency-outliers`

**Query parameters**

- Same filters as **ReportFilters**.

**Row shape**

```ts
interface EfficiencyOutlierRow {
  date: string;           // route date (ticket date)
  jobName: string;
  route: string;          // e.g. "Job Name / External Site Name"
  truckNumber: string;

  fleetAvgLoads: number;  // average loads per truck on this route
  thisTruckLoads: number; // loads for this truck on this route

  firstTicketTime: string; // e.g. "07:00 AM"
  lastTicketTime: string;  // e.g. "02:00 PM"
  impliedHours: number;    // e.g. 7.0
  loadsPerHour: number;    // efficiency score
}
```

**Response**

```ts
type GetEfficiencyOutliersResponse = EfficiencyOutlierRow[];
```

---

## 5. Ticket detail endpoint

**Endpoint**

- `GET /api/tickets/:ticketNumber`

**Query parameters**

- `companyId` (required)

**Response**

```ts
type GetTicketDetailResponse = TicketDetail; // as defined earlier
```

Backend must:

- Resolve all IDs to names (job, material, hauler, truck type, driver, site).
- Include both pivoted photo URLs and the full `photos` list.

---

## 6. Export to Excel

The frontend currently uses **client-side Excel exports** via the `xlsx` library for:

- Ticket grids (Job / Material / Hauler dashboards)
- Late Submission Audit grid
- Efficiency Outlier grid

This means **backend export endpoints are optional**.

If you prefer to move export logic to the backend (e.g. for very large datasets), suggested endpoints:

- `GET /api/job-dashboard/tickets/export?{filters...}` – returns Excel file
- `GET /api/material-dashboard/tickets/export?{filters...}`
- `GET /api/hauler-dashboard/tickets/export?{filters...}`
- `GET /api/forensic/late-submissions/export?{filters...}`
- `GET /api/forensic/efficiency-outliers/export?{filters...}`

Response:

- `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
- `Content-Disposition: attachment; filename="..."`  

Frontend can then simply open the returned file.

---

## 7. Authentication & authorization (optional / future)

Currently, the frontend assumes **no auth** (or that auth is handled elsewhere, e.g. reverse proxy).

If you add auth:

- Prefer **JWT** or session cookies.
- Frontend will:
  - Attach an `Authorization: Bearer <token>` header if needed.
  - Respect `401` / `403` responses by redirecting to login or showing an error.

From the frontend’s perspective, the only hard requirement is that all the endpoints listed above remain available behind whatever auth layer you choose.

---

## 8. Summary checklist for backend

- [ ] Implement `GET /api/companies` and `GET /api/lookups/*` endpoints.
- [ ] Implement ticket-based endpoints for Job, Material, Hauler dashboards:
  - `/api/job-dashboard/summary`
  - `/api/job-dashboard/tickets`
  - `/api/material-dashboard/summary`
  - `/api/material-dashboard/tickets`
  - `/api/hauler-dashboard/summary`
  - `/api/hauler-dashboard/tickets`
- [ ] Implement Forensic endpoints:
  - `/api/forensic/late-submissions`
  - `/api/forensic/efficiency-outliers`
- [ ] Implement `GET /api/tickets/:ticketNumber` (detail).
- [ ] Make sure **all responses**:
  - Are **scoped by `companyId`**.
  - Resolve all IDs into **human-readable names**.
  - Pivot photos into ticket columns and also expose a full `photos` array for details.
  - Apply the **Hauler Ticket Number** business rule (`N/A` / `MISSING`).

If the backend matches this contract, the existing frontend can be wired to live SQL Server data with minimal changes (mainly swapping mock-data calls for real API calls).


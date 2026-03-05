# Construction Logistics Reporting Dashboard (API)

Web-based reporting API replacing PowerBI. Tracks trucking tickets, material movements, and vendor costs. **Data source: SQL Server.** Focus: Project Management & Field Operations.

## Setup

```bash
npm install
cp .env.example .env
# Edit .env with your SQL Server connection (DB_HOST, DB_USERNAME, DB_PASSWORD, DB_DATABASE).
```

## Run

```bash
npm run start:dev   # Development (watch)
npm run build && npm run start:prod   # Production
```

API: **http://localhost:3000** (override with `PORT`).

---

## Global behavior

- **ID resolution:** All responses use human-readable names (Job Name, Material Name, Hauler Company Name, etc.), not raw IDs.
- **Photos:** `dbo.Fact_TicketPhotos` linked by `TicketID`; in grid responses, photo types (Ticket, Truck1, Truck2, Asbestos, Scrap) are pivoted into separate columns as link URLs (`PhotoURL`); empty when no photo.
- **Grids:** Pagination **50 rows per page** (configurable via `pageSize`). Each ticket grid endpoint has an **Export to Excel** companion (`.../tickets/export`).
- **Drill-down:** `GET /tickets/detail/:ticketNumber` returns full ticket details and photo gallery for the modal.

---

## Filter options (dropdowns)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/lookups/jobs` | `[{ id, name }]` |
| GET | `/lookups/materials` | `[{ id, name }]` |
| GET | `/lookups/haulers` | `[{ id, name }]` (company name) |
| GET | `/lookups/external-sites` | `[{ id, name }]` |
| GET | `/lookups/truck-types` | `[{ id, name }]` |

Query params for all dashboards: `startDate`, `endDate` (YYYY-MM-DD), and page-specific filters below.

---

## Page A: Job Dashboard

**Filters:** `startDate`, `endDate`, `jobId` (default: omit = All), `direction` (Import | Export | Both).

| Method | Path | Description |
|--------|------|-------------|
| GET | `/job-dashboard/kpis` | Total Tickets, Flow Balance (Imports/Exports), Last Active date |
| GET | `/job-dashboard/summary/vendor` | Vendor table: Company Name, Truck Type, Total Tickets |
| GET | `/job-dashboard/summary/material` | Material table: Material Name, Total Tickets |
| GET | `/job-dashboard/tickets` | Detailed ticket grid (50/page). Query: `page`, `pageSize` |
| GET | `/job-dashboard/tickets/export` | Export grid to Excel |
| GET | `/job-dashboard/tickets/detail/:ticketNumber` | Ticket detail + photos (drill-down) |

---

## Page B: Material Dashboard

**Filters:** `startDate`, `endDate`, `materialId`, `jobId`, `direction`.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/material-dashboard/kpis` | Total Tickets, Top Source, Top Destination, Active Jobs count |
| GET | `/material-dashboard/summary/sites` | Sites: External Site Name, Direction, Total Tickets |
| GET | `/material-dashboard/summary/jobs` | Jobs: Job Name, Direction, Total Tickets |
| GET | `/material-dashboard/tickets` | Detailed ticket grid (same columns as Job page) |
| GET | `/material-dashboard/tickets/export` | Export to Excel |
| GET | `/material-dashboard/tickets/detail/:ticketNumber` | Ticket detail + photos |

---

## Page C: Hauler (Vendor) Dashboard

**Filters:** `startDate`, `endDate`, `haulerId`, `jobId`, `materialId`, `truckTypeId`, `direction`.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/hauler-dashboard/kpis` | Total Tickets, Unique Trucks, Active Jobs |
| GET | `/hauler-dashboard/summary/billable-units` | Truck Type, Total Tickets (for invoice verification) |
| GET | `/hauler-dashboard/summary/cost-center` | Job Name, Total Tickets |
| GET | `/hauler-dashboard/tickets` | Detailed ticket grid |
| GET | `/hauler-dashboard/tickets/export` | Export to Excel |
| GET | `/hauler-dashboard/tickets/detail/:ticketNumber` | Ticket detail + photos |

---

## Page D: Forensic & Audit

| Method | Path | Description |
|--------|------|-------------|
| GET | `/forensic/late-submission` | Tab 1: Tickets where Created At > 24h after Ticket Date. Query: `startDate`, `endDate`. Columns: Ticket Number, Ticket Date, System Date, Lag Time, Signed By, Job Name, Hauler. |
| GET | `/forensic/efficiency-outlier` | Tab 2: By Date+Job+Destination (route), fleet avg loads vs per-truck loads, first/last ticket time, implied hours, loads per hour. Query: `startDate`, `endDate`. |

---

## Shared drill-down

| Method | Path | Description |
|--------|------|-------------|
| GET | `/tickets/detail/:ticketNumber` | Full ticket details + photo gallery (use from any grid). |

---

## SQL Server schema (GoFormz DB)

The API is wired to the **GoFormz Ticket Processing Database** with these tables:

**Fact tables**
- **Fact_SiteTickets:** TicketID, GoFormzID, FormTicketNumber, TicketDate, JobID, ExternalSiteID, TruckingCompanyID, TruckTypeID, DriverID, MaterialID, Direction, TruckNumber, HasPhysicalTicket, PhysicalTicketNumber, SignedBy, CreatedAt.
- **Fact_TicketPhotos:** PhotoID, TicketID, PhotoType, PhotoURL, UploadedAt.

**Reference tables**
- **Ref_Jobs:** JobID, JobNumber, JobName, EntityID, JobAddress, City, State, Zip, IsActive.
- **Ref_Materials:** MaterialID, MaterialName, ParentMaterialID.
- **Ref_ExternalCompanies:** CompanyID, CompanyName, Address, City, State, Zip, IsActive (haulers).
- **Ref_ExternalSites:** SiteID, SiteName, SiteType, Address, City, State, Zip.
- **Ref_TruckTypes:** TruckTypeID, TypeName.
- **Ref_Drivers:** DriverID, DriverName, Phone, Email.

Entity mappings live under `src/database/entities/`. Ticket lookups use `FormTicketNumber` for the unique ticket number; driver name is resolved from `Ref_Drivers.DriverName` when DriverID is set.

---

## Hauler Ticket Number display rule

In grid and detail responses, `haulerTicketNumberDisplay` is:

- **"N/A"** when `HasPhysicalTicket` is false.
- **"MISSING"** when `HasPhysicalTicket` is true but the number is null/empty (frontend should highlight red).
- Otherwise the actual number.

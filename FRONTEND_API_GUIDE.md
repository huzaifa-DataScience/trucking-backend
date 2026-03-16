# Frontend API Integration Guide

## Base URL

**Development:**
```
http://localhost:3000
```

**Production:**
```
https://your-production-domain.com
```

---

## Quick Start

### 1. Check if Backend is Running

Visit the root endpoint in your browser or make a GET request:
```
GET http://localhost:3000/
```

**Expected Response:**
```json
{
  "message": "Construction Logistics Reporting Dashboard API",
  "version": "1.0.0",
  "endpoints": { ... }
}
```

**If you get `ERR_CONNECTION_REFUSED`:**
- Backend server is not running
- Ask backend team to start: `npm run start:dev`
- Verify backend is listening on port 3000

---

## Authentication

**Full login/signup process for frontend:** see **[FRONTEND_AUTH.md](./FRONTEND_AUTH.md)** (step-by-step flow, types, storage, 401 handling, profile, roles).

All API endpoints except the ones below require a JWT in the `Authorization` header:

```
Authorization: Bearer <access_token>
```

**Login:**
```
POST http://localhost:3000/auth/login
Content-Type: application/json

{ "email": "admin@example.com", "password": "Admin123!" }
```

Response includes `access_token` and `user` (id, email, role). Use the token on subsequent requests.

**Profile (current user):**
```
GET http://localhost:3000/auth/profile
Authorization: Bearer <access_token>
```

**Public routes (no token):** `GET /`, `POST /auth/login`, `POST /auth/register`, `POST /seed`. See **FRONTEND_AUTH.md** for login/signup flow and **AUTH.md** for admin-only routes.

**Siteline billing (contracts, pay apps, company):** see **[FRONTEND_SITELINE.md](./FRONTEND_SITELINE.md)**. **Aging report (net dollars by project × days past due):** see **[FRONTEND_AGING_REPORT.md](./FRONTEND_AGING_REPORT.md)**.

---

## API Endpoints

### Lookups (Dropdown Options)

All return `{ id: number; name: string }[]`

```typescript
// Jobs
GET http://localhost:3000/lookups/jobs

// Materials
GET http://localhost:3000/lookups/materials

// Haulers
GET http://localhost:3000/lookups/haulers

// External Sites
GET http://localhost:3000/lookups/external-sites

// Our Entities (companies; table OurEntities / Ref_OurEntities)
GET http://localhost:3000/lookups/our-entities

// Truck Types
GET http://localhost:3000/lookups/truck-types
```

**Company (“Our company”) filtering:** Company options come from `GET /lookups/our-entities` (same `{ id, name }[]` shape). Jobs are linked by `entityId`; to filter jobs (or dashboards) by company, use the entity `id` (e.g. `entityId=1` or `companyId=1` where the API supports it).

**Example Response:**
```json
[
  { "id": 1, "name": "Job A" },
  { "id": 2, "name": "Job B" }
]
```

---

### Job Dashboard

#### KPIs
```
GET http://localhost:3000/job-dashboard/kpis?startDate=2024-01-01&endDate=2024-12-31&jobId=1&entityId=1&direction=Both
```

**Query Params:**
- `startDate` (required): YYYY-MM-DD
- `endDate` (required): YYYY-MM-DD
- `jobId` (optional): number or omit for "All"
- `entityId` (optional): company id from `GET /lookups/our-entities`; filters by "Our company"
- `direction` (optional): "Import" | "Export" | "Both"

**Response:**
```json
{
  "totalTickets": 150,
  "flowBalance": "75 Imports / 75 Exports",
  "lastActive": "2024-12-31"
}
```

#### Summary Tables

**Vendor Summary:**
```
GET http://localhost:3000/job-dashboard/summary/vendor?startDate=2024-01-01&endDate=2024-12-31
```

**Material Summary:**
```
GET http://localhost:3000/job-dashboard/summary/material?startDate=2024-01-01&endDate=2024-12-31
```

#### Ticket Grid (Paginated)
```
GET http://localhost:3000/job-dashboard/tickets?startDate=2024-01-01&endDate=2024-12-31&entityId=1&page=1&pageSize=50
```

**Query Params:** same as KPIs, plus `page`, `pageSize`. Use `entityId` to filter by company (OurEntity).

**Response:** each row includes `jobName` and `companyName` (from OurEntities / Ref_OurEntities via the job’s entity).
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

#### Export to Excel
```
GET http://localhost:3000/job-dashboard/tickets/export?startDate=2024-01-01&endDate=2024-12-31
```

Returns `.xlsx` file (download in browser or handle as blob).

#### Ticket Detail (Drill-Down)
```
GET http://localhost:3000/job-dashboard/tickets/detail/T-001
```

**Response:**
```json
{
  "id": 1,
  "companyId": "123",
  "ticketNumber": "T-001",
  "ticketDate": "2024-01-15",
  "createdAt": "2024-01-15T10:30:00Z",
  "jobName": "Job A",
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
  "photoScrap": null,
  "photos": [
    {
      "id": 1,
      "ticketId": 1,
      "type": "Ticket",
      "url": "https://...",
      "fileName": null
    }
  ]
}
```

---

### Material Dashboard

Same structure as Job Dashboard:

- `GET /material-dashboard/kpis?startDate=&endDate=&materialId=&jobId=&direction=`
- `GET /material-dashboard/summary/sites?startDate=&endDate=&materialId=&jobId=&direction=`
- `GET /material-dashboard/summary/jobs?startDate=&endDate=&materialId=&jobId=&direction=`
- `GET /material-dashboard/tickets?startDate=&endDate=&materialId=&jobId=&direction=&page=1&pageSize=50`
- `GET /material-dashboard/tickets/export?startDate=&endDate=&materialId=&jobId=&direction=`
- `GET /material-dashboard/tickets/detail/:ticketNumber`

---

### Hauler Dashboard

- `GET /hauler-dashboard/kpis?startDate=&endDate=&haulerId=&jobId=&materialId=&truckTypeId=&direction=`
- `GET /hauler-dashboard/summary/billable-units?startDate=&endDate=&haulerId=&jobId=&materialId=&truckTypeId=&direction=`
- `GET /hauler-dashboard/summary/cost-center?startDate=&endDate=&haulerId=&jobId=&materialId=&truckTypeId=&direction=`
- `GET /hauler-dashboard/tickets?startDate=&endDate=&haulerId=&jobId=&materialId=&truckTypeId=&direction=&page=1&pageSize=50`
- `GET /hauler-dashboard/tickets/export?startDate=&endDate=&haulerId=&jobId=&materialId=&truckTypeId=&direction=`
- `GET /hauler-dashboard/tickets/detail/:ticketNumber`

---

### Forensic & Audit

**Frontend note – contract summary:**

| Tab | Endpoint | Response shape | Key for UI |
|-----|----------|----------------|------------|
| **Tab 1: Late Submission** | `GET /forensic/late-submission?startDate=&endDate=` | `{ lateTicketsFound: number, items: [...] }` | KPI card = `lateTicketsFound`; grid = `items`. Row field for “System Entry Date” = `systemEntryDate`. Row click → Ticket Detail (`/tickets/detail/:ticketNumber`). |
| **Tab 2: Efficiency Outlier** | `GET /forensic/efficiency-outlier?startDate=&endDate=&jobId=&materialId=` | Array of rows (sorted: RED first) | Grid columns: Date, Job Name, Route, Truck Number, Hauler Name, Total Tickets, Work Duration, My Avg Cycle, Fleet Benchmark, Status. Use `status` / `statusLabel` for row highlight (RED = slow, Grey = Single Load). Optional filters: `jobId`, `materialId`. |

If the frontend was using the old forensic responses (e.g. late-submission as a plain array, or old efficiency columns), it needs to be updated to the shapes below.

---

#### Tab 1: Late Submission Audit

Flags tickets where **CreatedAt** is more than **24 hours** after **TicketDate**. Use for KPI card and audit grid; row click opens Ticket Detail Modal.

```
GET http://localhost:3000/forensic/late-submission?startDate=2024-01-01&endDate=2024-12-31
```

**Response:**
```json
{
  "lateTicketsFound": 12,
  "items": [
    {
      "ticketNumber": "T-001",
      "ticketDate": "2024-01-01",
      "systemEntryDate": "2024-01-05T10:00:00.000Z",
      "lagTime": "+4 Days",
      "signedBy": "Supervisor Name",
      "jobName": "Job A",
      "haulerCompanyName": "Hauler Co"
    }
  ]
}
```

- **lateTicketsFound**: Use for KPI card "Late Tickets Found".
- **items**: Grid columns = Ticket Number, Ticket Date, System Entry Date, Lag Time (highlight red), Supervisor/Signed By, Job Name, Hauler Name. Action = open `GET /tickets/detail/:ticketNumber` (Ticket Detail Modal).

#### Tab 2: Efficiency Outlier Report

Peer group = **Same Date + Same Job + Same Material + Same Destination**. Single-load trucks excluded from benchmark; shown as status "Single Load" (grey). Red = truck >15% slower than fleet benchmark.

```
GET http://localhost:3000/forensic/efficiency-outlier?startDate=2024-01-01&endDate=2024-12-31&jobId=1&materialId=2
```

**Query params:** `startDate`, `endDate` (default last 7 days on frontend), `jobId` (optional), `materialId` (optional).

**Response:** Sorted by status (RED first, then Single Load, then Green).
```json
[
  {
    "date": "2024-01-15",
    "jobName": "Job A",
    "route": "Gravel → North Quarry",
    "truckNumber": "TR-123",
    "haulerName": "Hauler Co",
    "totalTickets": 5,
    "workDuration": "7:30",
    "myAvgCycle": 112.5,
    "fleetBenchmark": 95.2,
    "status": "RED",
    "statusLabel": "SLOW (>15%)"
  },
  {
    "date": "2024-01-15",
    "jobName": "Job A",
    "route": "Gravel → North Quarry",
    "truckNumber": "TR-456",
    "haulerName": "Other Hauler",
    "totalTickets": 1,
    "workDuration": "0:00",
    "myAvgCycle": 0,
    "fleetBenchmark": 95.2,
    "status": "Single Load",
    "statusLabel": "Single Load"
  }
]
```

- **route**: Display as "Material Name → Destination Site".
- **workDuration**: Hours:Minutes between first and last ticket.
- **myAvgCycle**: Minutes per trip for this truck (Duration / (Total Tickets - 1)).
- **fleetBenchmark**: Average cycle time (min/trip) of peer group (excluding single-load trucks).
- **status** / **statusLabel**: Green = "Within 15%", RED = "SLOW (>15%)" (highlight row), Single Load = grey.

---

### Shared Ticket Detail

```
GET http://localhost:3000/tickets/detail/:ticketNumber
```

Same response shape as dashboard detail endpoints.

---

## Common Errors & Solutions

### 1. `ERR_CONNECTION_REFUSED`

**Meaning:** Backend server is not running or not accessible.

**Solutions:**
- Verify backend is running: Visit `http://localhost:3000/` in browser
- Check backend terminal for errors
- Ensure backend is listening on port 3000
- If backend is on different machine/IP, update base URL

**Checklist:**
- [ ] Backend process is running (`npm run start:dev`)
- [ ] No errors in backend terminal
- [ ] Port 3000 is not blocked by firewall
- [ ] Base URL matches backend location

---

### 2. `500 Internal Server Error` or Database Connection Errors

**Meaning:** Backend is running but can't connect to SQL Server.

**What Frontend Should Do:**
- Show user-friendly error message: "Service temporarily unavailable. Please try again later."
- Log error details for backend team
- Retry after a few seconds (optional)

**Backend Team Will Fix:**
- SQL Server connection issues
- Database credentials
- Network/firewall settings

---

### 3. `404 Not Found`

**Meaning:** Endpoint doesn't exist or URL is wrong.

**Solutions:**
- Verify endpoint path matches documentation
- Check for typos in URL
- Ensure HTTP method is correct (GET, POST, etc.)
- Check if route requires `/api` prefix (currently routes don't have `/api` prefix)

---

### 4. `400 Bad Request`

**Meaning:** Invalid query parameters or request body.

**Common Issues:**
- Missing required params (`startDate`, `endDate`)
- Invalid date format (use `YYYY-MM-DD`)
- Invalid `direction` value (must be "Import", "Export", or "Both")
- Invalid `page` or `pageSize` (must be numbers)

**Example:**
```typescript
// ❌ Wrong
fetch('/job-dashboard/kpis?startDate=01-01-2024')

// ✅ Correct
fetch('/job-dashboard/kpis?startDate=2024-01-01&endDate=2024-12-31')
```

---

### 5. CORS Errors

**Meaning:** Browser blocking cross-origin requests.

**Status:** CORS is enabled on backend, so this shouldn't happen. If it does:
- Verify backend `main.ts` has `app.enableCors()`
- Check browser console for specific CORS error
- Ensure frontend URL is whitelisted (if backend has specific origins)

---

## Example Frontend Code (React/TypeScript)

### Fetch Lookups

```typescript
async function fetchJobs(): Promise<{ id: number; name: string }[]> {
  const response = await fetch('http://localhost:3000/lookups/jobs');
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  return response.json();
}
```

### Fetch Ticket Grid with Pagination

```typescript
interface TicketRow {
  ticketNumber: string;
  ticketDate: string;
  createdAt: string;
  jobName: string;
  direction: 'Import' | 'Export';
  destinationOrigin: string;
  haulingCompany: string;
  material: string;
  truckNumber: string;
  truckType: string;
  driverName: string;
  hasPhysicalTicket: boolean;
  haulerTicketNumber: string;
  signedBy: string;
  photoTicket: string | null;
  photoTruck1: string | null;
  photoTruck2: string | null;
  photoAsbestos: string | null;
  photoScrap: string | null;
}

interface PagedResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

async function fetchJobDashboardTickets(
  startDate: string,
  endDate: string,
  page: number = 1,
  pageSize: number = 50,
  jobId?: number,
  direction?: 'Import' | 'Export' | 'Both'
): Promise<PagedResult<TicketRow>> {
  const params = new URLSearchParams({
    startDate,
    endDate,
    page: page.toString(),
    pageSize: pageSize.toString(),
  });
  
  if (jobId) params.append('jobId', jobId.toString());
  if (direction) params.append('direction', direction);

  const response = await fetch(
    `http://localhost:3000/job-dashboard/tickets?${params}`
  );
  
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  
  return response.json();
}
```

### Fetch Ticket Detail

```typescript
interface TicketDetail extends TicketRow {
  id: number;
  companyId: string;
  photos: Array<{
    id: number;
    ticketId: number;
    type: 'Ticket' | 'Truck' | 'Truck2' | 'Asbestos' | 'Scrap';
    url: string;
    fileName?: string;
  }>;
}

async function fetchTicketDetail(
  ticketNumber: string
): Promise<TicketDetail | null> {
  const response = await fetch(
    `http://localhost:3000/tickets/detail/${ticketNumber}`
  );
  
  if (response.status === 404) {
    return null; // Ticket not found
  }
  
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  
  return response.json();
}
```

### Handle Errors Gracefully

```typescript
async function fetchWithErrorHandling<T>(
  url: string
): Promise<T> {
  try {
    const response = await fetch(url);
    
    if (!response.ok) {
      if (response.status === 500) {
        throw new Error('Server error. Please try again later.');
      }
      if (response.status === 404) {
        throw new Error('Resource not found.');
      }
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    return response.json();
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
      throw new Error('Cannot connect to server. Is the backend running?');
    }
    throw error;
  }
}
```

---

## Testing Checklist

Before integrating, test these endpoints:

- [ ] `GET /` → Returns API info
- [ ] `GET /lookups/jobs` → Returns jobs array
- [ ] `GET /job-dashboard/kpis?startDate=2024-01-01&endDate=2024-12-31` → Returns KPIs
- [ ] `GET /job-dashboard/tickets?startDate=2024-01-01&endDate=2024-12-31&page=1&pageSize=50` → Returns paginated tickets
- [ ] `GET /tickets/detail/:ticketNumber` → Returns ticket detail (use real ticket number from your DB)

---

## Support

If you encounter issues:

1. **Check backend logs** - Backend terminal will show detailed errors
2. **Verify backend is running** - Visit `http://localhost:3000/` in browser
3. **Check database connection** - Backend logs will show DB connection status
4. **Contact backend team** - Share error message and endpoint that failed

---

## Notes

- All endpoints return JSON (except Excel exports which return `.xlsx` files)
- Dates must be in `YYYY-MM-DD` format
- Pagination is 1-based (`page=1` is first page)
- Default `pageSize` is 50, max is 100
- `direction` filter: "Both" means no filter, "Import" or "Export" filters by direction
- Photo URLs are `null` when no photo exists for that type
- `haulerTicketNumber` can be `"N/A"`, `"MISSING"`, or the actual number string

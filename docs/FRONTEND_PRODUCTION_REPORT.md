# Production Report — Frontend Handoff

**Who this is for:** Frontend engineers.  
**Status:** Backend is **live** (JWT). Numbers are computed on the server — **do not re-implement** hours, commodity grouping, or Connecteam matching in the browser.  
**Last updated:** 2026-08-18  

**Where this screen lives:** **Production tab** on the bid — `/bidding/[id]?tab=production`. Bid chrome / other tabs: **[BIDDING_FRONTEND_API.md §0](./BIDDING_FRONTEND_API.md)**. After **outcome = awarded** (same APIs; hide the tab until then if you follow the PDF shell).

**Related**

| Doc | Use for |
|-----|---------|
| [FRONTEND_AUTH.md](./FRONTEND_AUTH.md) | Login + Bearer token |
| [BIDDING_FRONTEND_API.md](./BIDDING_FRONTEND_API.md) | **§0 shell** + bid create/list |
| [FRONTEND_BIDDING_SPECS.md](./FRONTEND_BIDDING_SPECS.md) | Specs tab (hours come from Specs lines) |
| [FRONTEND_MIKE_RULES.md](./FRONTEND_MIKE_RULES.md) | Mike stacking (why hours exist) |

**API host:** same as the rest of the dashboard (e.g. `http://localhost:3005`).  
**Auth on every call:**

```http
Authorization: Bearer <access_token>
Content-Type: application/json
```

---

## 1. What is this page?

PJ: after takeoff / Specs, **production** compares **earned hours from received material** vs **Connecteam actual labor**.

> If actual hours ≤ hours earned from received qty → **green** (on track).  
> If actual hours > earned hours → **red** (over).

Backend already:

1. Dedupes Spec lines into **commodity** rows (so Recv is not counted N times for the same wrap/pipe).
2. Converts qty → hours with **production per hour** (Mike / Specs).
3. Pulls **Connecteam** actual hours for the bid’s job.
4. Returns `totals.status: green | red | unknown`.

You **render** that. You do not calculate it.

---

## 2. Routes (must)

```text
/production                    ← list: GET /production-reports   (1 row per bid)
/bidding/[id]?tab=production   ← detail: GET /bids/:id/production-report
/bidding/[id]/production       ← alias — same as the tab
```

Add a **Production** item in global nav (next to Estimation files). Specs stays a **bid tab**. From Specs, jump to Production **tab**, not a new site.

### ⚠️ MUST READ — list is 1 row per bid

| | |
|--|--|
| **List API** | `GET /production-reports` — **one row per bid** that has a Mike takeoff |
| **Do not** | Build `/production` from `GET /estimation-files` |
| **Why** | Plumbing + HVAC + duct CSVs are **already merged** into one Specs / production calc |

`GET /bids/:id/mike-files` consolidates to **one** takeoff (`files.length` is 0 or 1, `calcMerge.mode === "single_file"`). Production **calcs** still merge every CSV row on the bid.

The list payload is an **index** (bid + files + spec count). It does **not** include hours or green/red. Open the detail endpoint for that.

---

## 3. Detail API — `GET /bids/:id/production-report`

```http
GET /bids/42/production-report
Authorization: Bearer <token>
```

**200** — JSON object (shape below).  
**404** — bid not found.

Empty Specs is still **200** with `lines: []` and `totals.status: "unknown"` — show empty state, not an error.

Hours and status live under **`totals`**. Connecteam extras live under **`connecteam`**. Do not flatten these in the client types.

### Response (current)

```ts
type ProductionReport = {
  bidId: number;
  jobId: number | null;
  jobNumber: string | null;
  trimbleProjectId: number | null;
  mikeFilesMerged: {
    count: number;
    fileIds: number[];
    fileNames: string[];
  };
  connecteam: {
    linked: boolean;
    refJobId: number | null;
    jobNumber: string | null;
    normalizedJobNumber: string | null;
    actualHours: number | null;
    actualMinutes: number | null;
    shiftCount: number | null;
    workerCount: number | null;
    averageHoursPerWorker: number | null;
    jobLabel: string | null;
  };
  lines: ProductionReportLine[];
  totals: {
    hoursEstimatedMike: number;
    hoursEstimatedFromReceived: number; // green/red TARGET
    actualHours: number | null;
    workerCount: number | null;
    averageHoursPerWorker: number | null;
    varianceHours: number | null; // earned − actual; positive = under labor
    status: 'green' | 'red' | 'unknown';
    actualHoursSource: 'connecteam';
  };
};

type ProductionReportLine = {
  commodityKey: string;       // stable key for React `key=`
  type: string | null;        // Duct / Pipe / …
  insulation: string;
  materialBase: string | null;
  catalogMatchMode: string;   // e.g. "roll" | "pipe"
  size: number;
  thickness: number;
  weight: string | null;
  facing: string | null;
  qtyEstimated: number;
  hoursEstimated: number;
  productionPerHour: number | null;
  qtyReceived: number;
  qtyReceivedSf: number | null;
  hoursEstimatedFromReceived: number | null;
  qtyRemain: number;
  specLineIds: number[];
};
```

`hoursEstimatedFromReceived` on a **line** can be `null` when PPH is missing — skip that line in an earned-hours chart or show “—”.

There is **no** `bidName` / `jobName` / `ourEntityName` on this payload. Use `GET /bids/:id` (or the list row) for chrome.

---

## 4. List API — `GET /production-reports`

```http
GET /production-reports?q=goel&limit=100
Authorization: Bearer <token>
```

| Query | |
|-------|--|
| `q` | Optional search (estimate #, bid name, job number, file name) |
| `limit` | Optional; default **200**, max **500** |

Only bids that **have Mike files** appear (`INNER JOIN`). Wrapper, not a bare array:

```ts
type ProductionReportList = {
  mergeMode: 'all_files_per_bid';
  rows: ProductionReportListRow[];
};

type ProductionReportListRow = {
  bidId: number;
  estimateNumber: string | null;
  bidName: string | null;
  bidStatus: string | null;
  jobId: number | null;
  jobNumber: string | null;
  trimbleProjectId: number | null;
  fileCount: number;
  totalRows: number;
  fileIds: number[];
  fileNames: string[];
  specLineCount: number;
  latestUploadAt: string;
  productionReportPath: string; // e.g. "/bids/42/production-report"
};
```

Click a row → `/bidding/{bidId}?tab=production`. Then `GET` that path (or `GET /bids/{bidId}/production-report`) for hours / status.

---

## 5. Labels (use these — do not invent)

| Field | UI label | Meaning |
|-------|----------|---------|
| `totals.hoursEstimatedMike` | **Hours (Mike / takeoff)** | Hours implied by estimated qty. Context only — **not** the green/red bar. |
| `totals.hoursEstimatedFromReceived` | **Hours earned (from received)** | Target. Material received × PPH. **This** is compared to actual. |
| `totals.actualHours` | **Actual hours (Connecteam)** | Clocked labor (same as `connecteam.actualHours`). |
| `totals.workerCount` | **Workers** | Unique Connecteam people on the job. |
| `totals.averageHoursPerWorker` | **Avg hours / worker** | `actualHours / workerCount`. |
| `totals.varianceHours` | **Variance** | Earned − actual. Positive = under labor. |
| `totals.status` | **Status** | Green / red / unknown badge. |
| `mikeFilesMerged.count` | optional subtitle | e.g. “3 CSVs merged” only if `> 1`. |

**Wrong:** comparing actual hours to Mike takeoff hours for the traffic light.  
**Right:** `totals.actualHours` vs `totals.hoursEstimatedFromReceived`.

---

## 6. Status colors

| `totals.status` | Color | Rule (backend) |
|-----------------|--------|-----------------|
| `green` | Green | `actualHours <= hoursEstimatedFromReceived` |
| `red` | Red | `actualHours > hoursEstimatedFromReceived` |
| `unknown` | Gray / muted | No actual hours, or both earned and actual are 0 |

Do **not** recompute in the client. Paint `totals.status` from the payload.

---

## 7. Charts (detail tab)

Minimum useful view:

1. **Headline KPI row** — earned hours, actual hours, status badge, workers, avg/worker.  
2. **Bar or bullet:** actual vs earned (from received). Mike hours as a **second** series or footnote, not the target.  
3. **Commodity table** (`lines`) — insulation / size / thickness / qty est / qty recv / hours earned / remain.  
4. Optional: stacked or grouped bars **per `commodityKey`** using `hoursEstimatedFromReceived` vs a share of actual (only if you have a split; otherwise keep actual at the **job** total, not faked per line).

Actual hours are **job-level**. Do not divide them evenly across commodities unless the API later adds a split.

---

## 8. Empty / error

| Situation | UI |
|-----------|-----|
| `lines.length === 0` | “No Specs lines yet — run Specs / upload a takeoff.” Link to `?tab=specs`. |
| `connecteam.linked === false` or `totals.actualHours == null` | Status will be `unknown`. Copy: “No Connecteam hours for this job yet.” |
| Bid has no `jobId` and no job number | Same — Connecteam cannot match. |
| 404 | Bid missing. |
| 401 | Auth — [FRONTEND_AUTH.md](./FRONTEND_AUTH.md) |

---

## 9. What you must **not** do

- Do not sum `GET /estimation-files` into a production list.  
- Do not re-calculate hours, PPH, or commodity keys in the browser.  
- Do not treat `hoursEstimatedMike` as the green/red target.  
- Do not POST anything — this report is **GET-only**. Edit Specs / Mike on the Specs tab; Connecteam is synced elsewhere.  
- Do not show Production as a chrome-less mini-app. It is a **bid tab** + a **global list**.  
- Do not expect hours / `status` on the list endpoint.

---

## 10. FE checklist

- [ ] Nav: **Production** → `/production` → `GET /production-reports` → render `rows[]`  
- [ ] List: **one row per bid**; no fake green/red until detail is loaded  
- [ ] Row click → `/bidding/{bidId}?tab=production`  
- [ ] Detail: `GET /bids/:id/production-report`  
- [ ] Read `totals.*` and `connecteam.*` (not a flat header)  
- [ ] Labels: Mike hours vs **earned from received** vs Connecteam actual  
- [ ] Green/red from `totals.status` only  
- [ ] Empty Specs → empty state, not a crash  
- [ ] JWT on both calls  

---

## 11. Example (truncated)

```json
{
  "bidId": 42,
  "jobId": 100,
  "jobNumber": "J-100",
  "trimbleProjectId": 555,
  "mikeFilesMerged": { "count": 1, "fileIds": [9], "fileNames": ["Takeoff"] },
  "connecteam": {
    "linked": true,
    "actualHours": 1400,
    "workerCount": 8,
    "averageHoursPerWorker": 175,
    "jobLabel": "Example"
  },
  "totals": {
    "hoursEstimatedMike": 2100.5,
    "hoursEstimatedFromReceived": 1578.53,
    "actualHours": 1400,
    "workerCount": 8,
    "averageHoursPerWorker": 175,
    "varianceHours": 178.53,
    "status": "green",
    "actualHoursSource": "connecteam"
  },
  "lines": [
    {
      "commodityKey": "roll|Duct Wrap|2|0.75|FSK",
      "type": "Duct",
      "insulation": "FIBERGLASS DUCT WRAP",
      "catalogMatchMode": "roll",
      "size": 48,
      "thickness": 2,
      "qtyEstimated": 40000,
      "hoursEstimated": 1578.53,
      "productionPerHour": 25.34,
      "qtyReceived": 40000,
      "hoursEstimatedFromReceived": 1578.53,
      "qtyRemain": 0,
      "specLineIds": [1]
    }
  ]
}
```

PJ example: 40,000 SF ÷ 25.34 PPH ≈ **1578.53** earned hours.

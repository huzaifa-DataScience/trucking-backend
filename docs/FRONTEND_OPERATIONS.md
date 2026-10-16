# Operations and reports — FE handoff

**Give this file to FE.**  
**Last updated:** 2026-10-16

This is the trucking log from `2025-2026 Trucking Log.xlsx` (Trucking Record, Haulers, Disposal). JWT on every route. Base path `/operations`.

GoFormz dashboards (`/tickets`, `/job-dashboard`, `/material-dashboard`, `/hauler-dashboard`) are a different log. Do not mix the two screens or the two APIs.

Costs are calculated when a haul is read. Paint `truckingCost`, `disposalCost`, and `totalCost`. Do not send them on save, and do not calculate them again in the client.

The log is already loaded: about 2,500 hauls (2 Jan 2025 through 4 Jun 2025), 378 hauler cards, 609 disposal cards.

---

## Screens

| Screen | Excel | API |
|--------|--------|-----|
| Haul log | Trucking Record | `GET /operations/hauls` |
| Add / edit haul | one Trucking Record row | `POST` / `PATCH /operations/hauls` |
| Hauler rate cards | Haulers | `GET /operations/hauler-rates` |
| Disposal rate cards | Disposal | `GET /operations/disposal-rates` |
| Cost by job | report off the log | `GET /operations/reports/jobs` |
| Cost by hauler | report off the log | `GET /operations/reports/haulers` |
| Cost by destination | report off the log | `GET /operations/reports/destinations` |
| LEED / aggregates | quantity columns, not dollars | `GET /operations/reports/leed` |

Do not build the hidden Ticket books sheet, "Where to take materials", or the empty Truck, Driver, Rates, and Sheet1 tabs. Show-up time is a field on the hauler card and is not part of the cost.

---

## Haul log

```
GET /operations/hauls?from=2025-01-01&to=2025-06-30&jobNumber=&haulerRateId=&disposalRateId=
```

All query params are optional. With no dates the API returns the full log (about 2,500 rows), newest date first. Always send `from` and `to` on the screen.

Each row:

```json
{
  "id": 1,
  "ticketDate": "2025-01-06",
  "jobId": 12,
  "jobNumber": "12135-107",
  "jobName": "1530-1532 N. Monroe St.",
  "haulerRateId": 40,
  "haulerLabel": "McNair - Hauler",
  "hours": null,
  "disposalRateId": 88,
  "disposalLabel": "Cumberland - Disposal - Asbestos",
  "goelTicketNumber": "160101",
  "haulingTicketNumber": null,
  "disposalTicketNumber": null,
  "wasteManifestNumber": null,
  "transferJobNumber": null,
  "weightTons": 9.84,
  "leed": {
    "lightTubes": null,
    "metalsDirect": null,
    "metalsReclaimed": null,
    "insulation": null,
    "wood": null,
    "paper": null,
    "aggregates": null,
    "plastics": null,
    "drywall": null,
    "boardFeetWood": null,
    "dirt": null,
    "lumber": null,
    "brickDeconstructed": null,
    "brickPallets": null,
    "roofing": null,
    "landfill": null
  },
  "aggregates": {
    "rc57": null,
    "rc6": null,
    "rc2": null,
    "cr57": null,
    "dirtTons": null
  },
  "truckingCost": 630,
  "disposalCost": 659.28,
  "totalCost": 1289.28
}
```

`jobName` is the name stored on the row, then the `Ref_Jobs` name, then `---`.

Money, read only:

```
trucking = ratePerLoad + ratePerHour × hours
billable tons = 0 when tonsIncluded is greater than the weight, otherwise weight − tonsIncluded
disposal = costPerLoad + costPerTon × billable tons + costPerCy × truckSizeCy
total = trucking + disposal
```

Blank hauler or blank destination costs 0 on that side. The CY charge uses the truck size on the disposal card, not the weighed tons. Hours blank counts as 0.

LEED and aggregate fields are quantities. They are not priced and they are not part of `totalCost`.

Editing a rate card changes the cost of every haul that uses that card. Refresh the log after a rate save.

---

## Add or edit a haul

`POST /operations/hauls`  
`PATCH /operations/hauls/:id`  
`DELETE /operations/hauls/:id` returns `{ "id": 1 }`.

`ticketDate` is `YYYY-MM-DD` and is required on create.

```json
{
  "ticketDate": "2025-06-01",
  "jobNumber": "19009",
  "jobName": "1112 Appleton Street (Goel)",
  "jobId": null,
  "haulerRateId": 40,
  "hours": 2.5,
  "disposalRateId": 88,
  "goelTicketNumber": null,
  "haulingTicketNumber": null,
  "disposalTicketNumber": null,
  "wasteManifestNumber": null,
  "transferJobNumber": null,
  "weightTons": 9.84,
  "leed": { "wood": 1.5 },
  "aggregates": { "rc57": 0 }
}
```

Dropdowns on this form:

| Field | Source |
|--------|--------|
| Who hauled | `GET /operations/hauler-rates` — save `id`, show `label` |
| Where and what was hauled | `GET /operations/disposal-rates` — save `id`, show `label` |
| Optional company link on a rate card | `GET /lookups/haulers` |
| Optional job link | `GET /lookups/jobs` |

`jobId` is optional. The log keeps `jobNumber` and `jobName` even when the number is not in `Ref_Jobs`.

---

## Rate cards

`GET /operations/hauler-rates` and `GET /operations/disposal-rates` return arrays, sorted by company name.

Hauler card:

```json
{
  "id": 40,
  "companyId": 15,
  "companyName": "McNair",
  "category": "Hauler",
  "label": "McNair - Hauler",
  "ratePerLoad": 630,
  "ratePerHour": 0,
  "unit": null,
  "showUpHours": null,
  "address": null,
  "phone": null,
  "contact": null,
  "email": null,
  "coi": null,
  "isActive": true
}
```

`POST /operations/hauler-rates` and `PATCH /operations/hauler-rates/:id`.  
`companyName` is required on create. Other fields: `category`, `companyId`, `ratePerLoad`, `ratePerHour`, `unit`, `showUpHours`, `address`, `phone`, `contact`, `email`, `coi`, `isActive`.

One company can have several cards (one per category). `label` is `companyName - category`. `companyId` points at an existing company. Do not make a second company list.

Disposal card:

```json
{
  "id": 88,
  "siteId": null,
  "companyName": "Cumberland",
  "unitLabel": "Disposal",
  "category": "Asbestos",
  "label": "Cumberland - Disposal - Asbestos",
  "costPerLoad": 0,
  "costPerTon": 67,
  "costPerCy": 0,
  "truckSizeCy": 0,
  "tonsIncluded": 0,
  "address": null,
  "phone": null,
  "contact": null,
  "email": null,
  "isActive": true
}
```

`POST /operations/disposal-rates` and `PATCH /operations/disposal-rates/:id`.  
`companyName` is required on create. Other fields: `unitLabel`, `category`, `siteId`, `costPerLoad`, `costPerTon`, `costPerCy`, `truckSizeCy`, `tonsIncluded`, `address`, `phone`, `contact`, `email`, `isActive`.

`label` is `companyName - unitLabel - category`. `siteId` is optional and usually null.

There is no delete for a rate card. Set `isActive` to false to hide it from the dropdown. Filter inactive cards out of the haul form. Keep them on the rate-card screen.

---

## Reports

`from` and `to` are optional `YYYY-MM-DD`. Same date range as the log.

Money reports return `{ "rows": [], "totals": { "loads", "weightTons", "truckingCost", "disposalCost", "totalCost" } }`. Rows are sorted by `totalCost` descending.

`GET /operations/reports/jobs`

```json
{
  "rows": [
    {
      "jobNumber": "19009",
      "jobName": "1112 Appleton Street (Goel)",
      "loads": 12,
      "weightTons": 40.5,
      "truckingCost": 4200,
      "disposalCost": 3100,
      "totalCost": 7300
    }
  ],
  "totals": {
    "loads": 12,
    "weightTons": 40.5,
    "truckingCost": 4200,
    "disposalCost": 3100,
    "totalCost": 7300
  }
}
```

`GET /operations/reports/haulers` — each row has `haulerRateId`, `hauler`, plus the same totals.  
`GET /operations/reports/destinations` — each row has `disposalRateId`, `destination`, plus the same totals.

`GET /operations/reports/leed` returns an array, one row per job number. No dollars. Fields: `jobNumber`, `jobName`, `loads`, then every LEED key and every aggregate key summed.

```json
[
  {
    "jobNumber": "19009",
    "jobName": "1112 Appleton Street (Goel)",
    "loads": 12,
    "lightTubes": 0,
    "metalsDirect": 0,
    "wood": 3.5,
    "rc57": 0,
    "dirtTons": 0
  }
]
```

`GET /operations/meta` repeats the cost rules for the screen. It is not a second data source.

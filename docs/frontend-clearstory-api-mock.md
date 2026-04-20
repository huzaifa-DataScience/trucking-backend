## Clearstory (mock) API — frontend integration

These endpoints provide **dummy Clearstory-shaped data** so frontend can build UI now.
They are **JWT-protected** (same as other dashboards). Use `POST /auth/login` to obtain a token.

### Auth

- **Login**: `POST /auth/login` with `{ "email": "...", "password": "..." }`
- Use header: `Authorization: Bearer <access_token>`

### Base route

Mock endpoints are under **`/clearstory-mock`**.

### Endpoints

#### List projects

`GET /clearstory-mock/projects`

Optional query params:
- `search` (matches name/jobNumber/customerName)
- `division`
- `customer`

Response:
- `{ projects: ClearstoryProjectDto[] }`

#### Project summary (macro totals)

`GET /clearstory-mock/projects/:id/summary`

Response:
- `project` (metadata + `baseContractValue`)
- `totals` (approved/atp/inReview/placeholder/void)
- `revisedContractValue` \(base + approved + atp + inReview + placeholder\)
- `reconciliation` (stub for “red flag” UI)

#### Project change order log

`GET /clearstory-mock/projects/:id/cors`

Optional query params:
- `bucket`: `APPROVED | ATP | IN_REVIEW | PLACEHOLDER | VOID`
- `ballInCourt`: `OWNER | CUSTOMER | INTERNAL | UNKNOWN`
- `stage`: free-form string (example: `ROM`, `Estimate`, `Potential CO`)

Response:
- `{ projectId: number, items: ClearstoryCorDto[] }`

#### Tasks (stub)

`GET /clearstory-mock/tasks`

Response:
- `{ generatedAt: string, items: ClearstoryTaskDto[] }`

### Dummy data source

Mock responses come from:
- `docs/clearstory_mock_fixture.json`

If you need more sample projects/COs/stages, add them to that file.


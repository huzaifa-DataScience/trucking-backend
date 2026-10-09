# Togal — FE development guide

Live contract: `GET /lookups/bidding/process-meta` → `togalEditor`.  
All routes need the JWT. Stay on `/bidding/:id` when a call returns 403.

Togal replaces Bluebeam. There is no in-app PDF editor and no second chat. One company connection, not one Togal login per user. Estimators share the `bids@` Togal login. Access lasts 7 days, then a captain connects again.

---

## Where it sits

| Screen | What to show |
|--------|----------------|
| Drawings, Spec sheets, Takeoff | Togal bar: Load, Run script, Open |
| Takeoff only | Same bar plus **Pull export**, then the existing one drop zone |
| Handoff | Instruction script and **Connect Togal** |

Do not add a new page.

---

## Who can press what

| Action | Who |
|--------|-----|
| Connect, save script | `captain`, `admin`, `super_admin`. Response field `canConnect` / `canEdit`. |
| Load, Run script, Pull, Open | Anyone who can edit this bid (`canEdit`). Same 403 as PATCH: `BID_TEAM_LOCKED`. Toast `message`. Do not redirect. |

---

## Connect (Handoff)

`GET /bids/togal/status`

```json
{
  "connected": false,
  "expiresAt": null,
  "canConnect": true,
  "pending": null
}
```

`pending`, when a login is waiting:

```json
{
  "verificationUrl": "https://mcp.togal.ai/...",
  "userCode": "ABCD-1234",
  "expiresAt": "2026-10-07T18:00:00.000Z"
}
```

`POST /bids/togal/connect` with `{}`. Captain only. Returns `verificationUrl`, `userCode`, `expiresAt`, `intervalSeconds`.

Show the URL and the code. Tell them to approve with the **bids@** Togal login.

Then `POST /bids/togal/connect/poll` with `{}` every `intervalSeconds` (at least 5) until `connected: true`. Stop on error. After refresh, if `status.pending` is set, show that code and keep polling.

`connected: true` → show “Togal is connected” and `expiresAt`. When it lapses, Connect again. No API key field. No webhook URL.

---

## Instruction script (Handoff)

`GET /bids/togal/script` → `{ "body": "", "updatedAt": null, "canEdit": true }`

`PUT /bids/togal/script` → `{ "body": "..." }`. One script for every bid. Max 500,000 characters. Empty is allowed. Only `canEdit` shows Save. Everyone else can copy.

**Run script** on the bid does not use the textarea. It sends the saved body. Save first.

---

## Upload (Intake / Drawings)

The user uploads on this bid. They do not go to Togal to drop the set.

`POST /bids/:id/attachments` with `label` `drawings`, `specifications`, or `addenda`.

The file is always saved. The same request sends it to Togal. Response is the attachment plus:

```json
"togal": { "sent": true, "message": null }
```

`sent: false` with a `message` means Togal did not take it (not connected, over 80 MB, or a tool error). The file is still on the bid. Show the message. Do not treat the upload as failed.

View and Download use `downloadPath`. A PDF opens in a new tab. There is no in-app editor.

When the bid has `jobId`, the same files are on `GET /bids/job/:jobId/files`. Each row has `bidId`, `bidName`, `estimateNumber`, and `downloadPath`.

---

## On the bid

`process.togal`:

| Field | Meaning |
|-------|---------|
| `projectUrl` | Set by the server when the project is created. Open button. No text field. |
| `projectId` | Set by Load. Required before Run script and Pull. |
| `sentAttachmentIds` | Attachment ids already pushed. Do not clear this on save. |

### Load

`POST /bids/:id/togal/load` with `{}`.

Sends hub files whose id is not in `sentAttachmentIds`. Upload already does this. Load is the retry for anything still unsent. Returns the full bid (same shape as PATCH). Replace the bid. Copy `process.togal` into the process draft so the next save does not wipe it.

A file over 80 MB stays on the bid and is skipped. That call returns 400 after the Togal link is saved. Toast the `message` and reload the bid.

### Run script

`POST /bids/:id/togal/run-script` with `{}` → `{ "ok": true }`.

400 if Load has not run, or the saved script is empty.

### Open

`process.togal.projectUrl` in a new tab. The server fills that URL. There is no project-link box. The button stays disabled until the URL exists.

### Pull export (Takeoff)

`POST /bids/:id/togal/pull` with `{}`.

Returns the full bid. New files are on `attachments[]` with `label: "takeoff"` and `category: "takeoff_markup"`. They land in the existing Takeoff drop list. `takeoffTurnedIn` becomes true when any takeoff file is there.

Drawings, specs, and addenda do not come back.

The drop zone stays for a manual snap or export. Same `POST /bids/:id/attachments` with `label=takeoff` and `category=takeoff_markup`.

---

## Do not

- Ask each user for a Togal account, API key, webhook, or a project-link box.
- Build an in-app PDF editor or a Togal chat box. The script is a textarea. The chat runs in Togal.
- Pull the drawing set back from Togal. The copy the user uploaded is already on the bid.
- Send `page` logic or a new nav item. Same bid tabs.

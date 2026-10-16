# Meeting 9 Oct — frontend

Backend for these is live. Build only what is listed here. Do not add a bid summary page; the meeting did not define its fields.

Live flags: `GET /lookups/bidding/process-meta` → `assignmentEditor`, `setupEditor`, `postBidEditor`.

---

## Assignment

Put **technical review at the top** of Assignment. `assignmentEditor.technicalReview` is true and `technicalReviewPosition` is `top`.

Remove the technical review form from Handoff. `setupEditor.technicalReview` is false. Nick or PJ still set `technicalReview.approvedForTakeoff` on Assignment. Handoff still blocks Complete until that flag is true; it just does not show the form again.

## Takeoff status

Each scope row (`takeoffAssignments[].status`) is a dropdown, not Done / None.

| Value | Label |
|--------|--------|
| `in_process` | In process |
| `revision` | Revision |
| `completed` | Completed |
| `resubmitted` | Resubmitted |

Labels are also on `assignmentEditor.takeoffAssignmentStatusLabels`. Empty stays empty.

## Follow-up companies

The company box must not be a list of our own companies. Typeahead:

- General contractor: `GET /lookups/bidding/parties?role=gc&q=`
- Mechanical contractor: `GET /lookups/bidding/parties?role=mechanical_contractor&q=`

Same pattern as the CRM: filter as they type. Show whether the row is a GC or a mechanical contractor.

Save on `intelligence.followUpCalls[]`:

- `kind`: `gc` or `mechanical`
- `companyName` from the picked company

Remarks on a call are already `callAttempts[].remarks` (the plus row). Do not add a second remarks box.

## Follow-up screenshot

On that same call row, let them upload a picture.

1. `POST /bids/:id/attachments` with label `follow-up`
2. Put the returned attachment id on `callAttempts[].attachmentIds` (array, max 8)
3. Show the image from the existing attachment view/download

## Competitors

Suggestion list: `GET /lookups/bidding/parties?role=insulation&q=`

Save `intelligence.competitors[].trade` as `insulation` so the row is not mixed with GC or mechanical. Show that label next to the name.

## Messages

Default the team list to conversations this person is in:

`GET /connecteam/conversations?scope=mine`

Keep an All list as the last tab, same route with no `scope`.

People picker: `GET /connecteam/users?includeAppUsers=true&pageSize=all`

Use `displayName`. Rows with `source: "app"` are logins that are not in Connecteam (`userId` is null, `appUserId` is set). Show the name. Do not call the Connecteam DM route with a null `userId`.

## Calendar

Create and edit still use `POST /calendar/events` and `PATCH /calendar/events/:id`.

Add `attendeeUserIds`: an array of app user ids. The owner does not need to be in that array.

Those people see the event on their calendar. `editable` is true only for the owner. Show the invited people on the event.

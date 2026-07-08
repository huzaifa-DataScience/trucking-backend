# Connecteam live chat — Owner setup (PJ)

**For:** PJ (Connecteam **Account Owner**)  
**From:** Dev team — webhook UI is Owner-only; admin accounts do not see **API & Webhooks** in Settings.  
**Goal:** Enable **bidirectional** chat sync between Connecteam app and our workforce website.

When this is done, new Connecteam messages appear on our site in ~1–2 seconds (via webhook). Messages sent from our site go to Connecteam when outbound is configured.

**Related docs:** [FRONTEND_CONNECTEAM_CHAT.md](./FRONTEND_CONNECTEAM_CHAT.md) (frontend/API), [FRONTEND_CONNECTEAM.md](./FRONTEND_CONNECTEAM.md) (general Connecteam).

---

## Before you start (dev team)

These must be running on the server **before** PJ saves the webhook:

1. **Backend API** on port `3005` (or whatever the server uses).
2. **Cloudflare quick tunnel** (temporary public URL until we attach a stable domain):

   ```text
   cloudflared tunnel --url http://localhost:3005
   ```

   Keep that window open. If the tunnel restarts, the URL changes — tell dev team so we update Connecteam + `.env`.

Current values in server `.env` (dev team maintains):

| Variable | Purpose |
|----------|---------|
| `CONNECTEAM_WEBHOOK_PUBLIC_URL` | Full HTTPS URL Connecteam POSTs to |
| `CONNECTEAM_WEBHOOK_SECRET` | Must match the secret PJ enters in Connecteam |
| `CONNECTEAM_WRITE_THROUGH` | `true` = our site forwards outbound messages |
| `CONNECTEAM_CHAT_PUBLISHER_ID` | Set **after** Custom Publisher is created (Step 2) |

Ask dev for the latest `CONNECTEAM_WEBHOOK_PUBLIC_URL` and `CONNECTEAM_WEBHOOK_SECRET` if the tunnel was restarted.

---

## Step 1 — Register chat webhook (inbound: Connecteam → our site)

**Requires:** Account **Owner** (not Admin).

1. Log in to Connecteam as **Owner**.
2. Open **Settings** (gear icon).
3. Go to **API & Integrations** (or **API & Webhooks** — label varies by account).
4. Open the **Webhooks** section.
5. Click **Add webhook** / **Add Webhook**.

Fill in:

| Field | Value |
|-------|--------|
| **Name** | `Goel workforce chat mirror` (any clear name) |
| **URL / Endpoint** | Dev team provides — ends with `/connecteam/webhooks/inbound` |
| **Secret** | Dev team provides — must match `CONNECTEAM_WEBHOOK_SECRET` on server |

**Events — select all Chat events:**

- `message_created`
- `message_updated`
- `message_deleted`
- `conversation_created`
- `conversation_updated`
- `conversation_deleted`

6. **Save** / **Create webhook**.

### If you do not see Chat events or API & Webhooks

- Confirm you are logged in as **Owner** (not Admin).
- Confirm the account is on a plan with **API access** (Expert or higher).
- Email Connecteam support (Yuval confirmed chat webhooks are supported):

  > Please enable **Chat Webhooks (Beta)** on our company account. We need to subscribe to message and conversation events for our integration.

---

## Step 2 — Custom Publisher (outbound: our site → Connecteam)

Needed so messages sent **from our website** appear in Connecteam under a named sender.

1. **Settings** → **Feed settings**.
2. **Custom Publishers** → **Add** / **Create**.
3. **Name:** e.g. `Goel Website` or `Workforce Portal`.
4. Save and copy the **Publisher ID** (numeric).
5. Send that ID to dev team → they set `CONNECTEAM_CHAT_PUBLISHER_ID` in `.env` and restart the backend.

---

## Step 3 — Quick test (with dev team)

1. Dev confirms tunnel + backend are up.
2. From Connecteam **mobile app** or web, send a test message in any team/channel chat.
3. Dev checks:
   - `GET /connecteam/webhooks/events` — webhook received?
   - Conversation messages API — message in database?

If nothing arrives within a few seconds: webhook URL wrong, tunnel down, secret mismatch, or Chat Webhooks not enabled on the account.

---

## Important limitations (set expectations)

| Topic | Detail |
|-------|--------|
| **Old chat history** | Not available via API. Only messages **after** the webhook is live are mirrored inbound. |
| **Tunnel URL** | Quick `trycloudflare.com` URLs change on restart. Production will use a **named Cloudflare tunnel** or stable domain. |
| **Images** | Webhook sends attachment **URLs** (`files.connecteam.com`). Frontend can display them; long-term local save is a separate dev task. |
| **Beta** | Chat webhooks are Beta; Connecteam may change payloads slightly. |

---

## Checklist for PJ

- [ ] Logged in as **Owner**
- [ ] Webhook created with dev-provided **URL** + **secret**
- [ ] All **6 chat events** selected
- [ ] **Custom Publisher** created; Publisher ID sent to dev
- [ ] Test message sent from Connecteam; dev confirmed receipt

---

## After setup — dev team continues

- Set `CONNECTEAM_CHAT_PUBLISHER_ID` and restart API
- Frontend chat UI per [FRONTEND_CONNECTEAM_CHAT.md](./FRONTEND_CONNECTEAM_CHAT.md)
- Replace temporary tunnel with stable production URL when domain/Cloudflare tunnel is ready
- Optional: download and store attachment files from webhook URLs

**Questions:** Reply in the Connecteam support thread (Yuval) or ask dev team for current tunnel URL and secret.

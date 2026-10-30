# Deploy the WhatsApp bot on Render

The mall **website** stays on Vercel. The **WhatsApp bot** (`/bot`) deploys to Render as an always-on web service with a persistent disk for the Baileys session.

## 1. Push / open the PR branch

Repo: `ngonishaani/-AI`  
Branch with the bot: `cursor/whatsapp-gemini-chatbot-3831` (or `main` after merge)  
Blueprint file: [`render.yaml`](../render.yaml) at the repo root.

## 2. Create the service from the Blueprint

1. Go to [https://dashboard.render.com](https://dashboard.render.com)
2. **New → Blueprint**
3. Connect the GitHub repo `-AI`
4. Select branch `cursor/whatsapp-gemini-chatbot-3831` (or `main`)
5. Render reads `render.yaml` and proposes **trade-square-whatsapp-bot**
6. When prompted for `GEMINI_API_KEY`, paste your Google AI Studio key
7. Apply / create (use **Starter** plan — Free sleeps and will drop WhatsApp)

The Blueprint already sets:

- `rootDir: bot`
- disk at `/var/data` (session survives redeploys)
- `BAILEYS_AUTH_DIR=/var/data/auth_info_baileys`
- health check: `/health`

## 3. Link WhatsApp (phone pairing code — no QR)

1. Wait for the deploy to go **Live**
2. Open `https://<your-service>.onrender.com/`
3. Enter your WhatsApp number with country code, digits only (e.g. `26377xxxxxxx`)
4. Tap **Get pairing code** — an 8-digit code appears (like `ABCD-EFGH`)
5. On your phone: **WhatsApp → Linked Devices → Link a device → Link with phone number instead**
6. Enter that code → page should switch to **Connected**

Optional: set env `WHATSAPP_PHONE_NUMBER=26377xxxxxxx` so the code is requested automatically.

## 4. Turn on Gemini (Shona + English)

Without this, the bot only uses simple directory keyword replies.

1. Render → your service → **Environment**
2. Add / confirm:
   - **`GEMINI_API_KEY`** = your key from [Google AI Studio](https://aistudio.google.com/apikey)
   - Optional: **`GEMINI_MODEL`** = `gemini-2.0-flash`
3. **Save** → **Manual Deploy** (so the new env loads)
4. Open `https://<service>.onrender.com/status` — should show `"geminiConfigured": true`

## 5. Test

Message the linked WhatsApp number. Try:

- `hours` / `Nguva yekuvhura ndiyani?`
- `shops on ground floor` / `Pane barber here?`
- `Masikati, ndinoda rooftop lounge`

Replies should feel natural in English, Shona, or a mix.

## 5. Stop re-pairing on every redeploy

If you must pair again after each deploy, the WhatsApp session is **not** on a disk.

1. Render → service → **Disks** → **Add Disk**
   - Mount path: `/var/data`
   - Size: `1 GB`
2. **Environment** → set `BAILEYS_AUTH_DIR` = `/var/data/auth_info_baileys`
3. Redeploy, then pair **one** more time
4. Open `/status` — need `"onRenderDisk": true` and `"sessionRegistered": true`

After that, redeploys reconnect automatically (no pairing).

## 6. Important

| Do | Don’t |
|----|--------|
| Use Starter (or higher) so the service stays up | Use Free web (sleeps → WhatsApp disconnects) |
| Keep the 1GB disk at `/var/data` | Delete the disk (forces pairing again) |
| Set `BAILEYS_AUTH_DIR=/var/data/auth_info_baileys` | Leave auth in the repo folder (wiped each deploy) |
| Set `GEMINI_API_KEY` in Render env | Commit `.env` or `auth_info_baileys` |

## Manual create (without Blueprint)

**New → Web Service** → same repo →:

- Root directory: `bot`
- Build: `npm install`
- Start: `npm start`
- Instance: Starter+
- Advanced → disk mount `/var/data`, 1 GB
- Env: `BAILEYS_AUTH_DIR=/var/data/auth_info_baileys`, `GEMINI_API_KEY=…`, `NODE_VERSION=20`

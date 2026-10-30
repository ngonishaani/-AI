# Deploy Trade Square on Render

The **mall website** (`/`, `/shop`, `/enroll`, assets) and the **WhatsApp bot** both run on one Render web service. The site is no longer served from Vercel.

Service hostname today: `https://ai-mallbot.onrender.com`  
Enrolled shops: `https://ai-mallbot.onrender.com/shop`  
WhatsApp QR (linking only): `https://ai-mallbot.onrender.com/qr`

Point **tradesquaremall.com** at this Render service (custom domain in the Render dashboard) when you cut over from Vercel.

## 1. Push / open the PR branch

Repo: `ngonishaani/-AI`  
Blueprint file: [`render.yaml`](../render.yaml) at the repo root.

## 2. Create or update the service from the Blueprint

**Existing `ai-mallbot` service:** GitHub merges do not always auto-redeploy. After these changes land on `main`, open the service → **Manual Deploy → Deploy latest commit**. Confirm env `SITE_ROOT=/opt/render/project/src/public`.

1. Go to [https://dashboard.render.com](https://dashboard.render.com)
2. **New → Blueprint** (or **Manual Deploy** / sync Blueprint on the existing service)
3. Connect the GitHub repo `-AI`, branch `main`
4. Render reads `render.yaml` and proposes **trade-square-whatsapp-bot**
5. When prompted for `GEMINI_API_KEY`, paste your Google AI Studio key
6. Apply / create (use **Starter** plan — Free sleeps and will drop WhatsApp)

The Blueprint sets:

- `rootDir: bot` · Build `npm install` · Start `npm start`
- Mall site files live in **`bot/public`** (synced from the repo root via `bot/scripts/sync-site.sh`)
- `SITE_ROOT=/opt/render/project/src/public`
- Disk at `/var/data` (WhatsApp session survives redeploys)
- `BAILEYS_AUTH_DIR=/var/data/auth_info_baileys`
- Health check: `/health`

After changing homepage / shop / enroll pages at the repo root, run `bot/scripts/sync-site.sh` before committing so Render gets the update.

## 3. Verify the website

1. `https://<service>.onrender.com/` — mall homepage  
2. `https://<service>.onrender.com/shop` — enrolled shops from `GET /catalog`  
3. `https://<service>.onrender.com/enroll/` — enrol form (syncs with `PUT /catalog`)

## 4. Link WhatsApp (QR — recommended)

1. Wait for the deploy to go **Live**
2. On a **computer**, open `https://<your-service>.onrender.com/qr`
3. On your phone: **WhatsApp → Linked Devices → Link a device** → scan the QR
4. Page should switch to **Connected**

Tips: raise brightness; open `/qr.png` for a clean image; don’t scan from the same phone showing the QR.

Optional fallback: `/pair` for phone-number linking (`WHATSAPP_LINK_MODE=phone`).

## 5. Turn on Gemini (Shona + English)

Without this, the bot only uses simple directory keyword replies.

1. Render → your service → **Environment**
2. Add / confirm:
   - **`GEMINI_API_KEY`** = your key from [Google AI Studio](https://aistudio.google.com/apikey)
   - Optional: **`GEMINI_MODEL`** = `gemini-2.0-flash`
3. **Save** → **Manual Deploy** (so the new env loads)
4. Open `https://<service>.onrender.com/status` — should show `"geminiConfigured": true`

## 6. Custom domain (replace Vercel)

1. Render → service → **Settings → Custom Domains** → add `www.tradesquaremall.com` (and apex if needed)
2. Update DNS as Render instructs
3. Remove or pause the Vercel project for this domain once Render serves HTTPS

Catalog calls can keep using `https://ai-mallbot.onrender.com/catalog`, or switch the site meta `tsm-catalog-url` to `/catalog` once the public site and API share a host.

## 7. Stop re-pairing on every redeploy

If you must pair again after each deploy, the WhatsApp session is **not** on a disk.

1. Render → service → **Disks** → **Add Disk**
   - Mount path: `/var/data`
   - Size: `1 GB`
2. **Environment** → set `BAILEYS_AUTH_DIR` = `/var/data/auth_info_baileys`
3. Redeploy, then pair **one** more time
4. Open `/status` — need `"onRenderDisk": true` and `"sessionRegistered": true`

After that, redeploys reconnect automatically (no pairing).

## 8. Important

| Do | Don’t |
|----|--------|
| Keep `bot/public` in sync (`bot/scripts/sync-site.sh`) | Edit only the repo-root site and forget to sync |
| Use Starter (or higher) so the service stays up | Use Free web (sleeps → WhatsApp disconnects) |
| Keep the 1GB disk at `/var/data` | Delete the disk (forces pairing again) |
| Set `BAILEYS_AUTH_DIR=/var/data/auth_info_baileys` | Leave auth in the repo folder (wiped each deploy) |
| Set `GEMINI_API_KEY` in Render env | Commit `.env` or `auth_info_baileys` |
| Use `/qr` for WhatsApp linking | Expect the old bot dashboard at `/` (that’s the mall site now) |

## Manual create (without Blueprint)

**New → Web Service** → same repo →:

- Root directory: `bot`
- Build: `npm install`
- Start: `npm start`
- Instance: Starter+
- Advanced → disk mount `/var/data`, 1 GB
- Env: `BAILEYS_AUTH_DIR=/var/data/auth_info_baileys`, `SITE_ROOT=/opt/render/project/src/public`, `GEMINI_API_KEY=…`, `NODE_VERSION=20`

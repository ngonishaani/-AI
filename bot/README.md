# Trade Square Marketplace — WhatsApp bot (Baileys + cron + Gemini)

Real WhatsApp replies (not Meta Cloud API, not a website chat widget).

```
Customer WhatsApp
       │
       ▼
Baileys (WhatsApp Web multi-device socket)  ← always-on Node process
       │
       ├─ marketplace menus (shops → products → prices / images / store WA)
       ├─ Gemini (open-ended product questions)
       └─ node-cron (health check every 5 min, hourly presence, optional daily broadcast)
```

Trade Square Mall “about” (location, mall hours) is only sent when the customer asks about the place.

## Requirements

- Node.js **20+**
- A phone with WhatsApp to scan the QR (Linked Devices)
- Always-on host — **Render (recommended)** / VPS / Railway — **not** Vercel serverless

## Deploy on Render (recommended)

Full steps: [docs/render-deploy.md](../docs/render-deploy.md)

1. Push this repo and open [Render Dashboard](https://dashboard.render.com) → **New → Blueprint**
2. Select repo `-AI` and branch with `render.yaml`
3. Set `GEMINI_API_KEY` when prompted (Starter plan — Free sleeps and drops WhatsApp)
4. After deploy: open `https://<service>.onrender.com/`
5. Enter your number (country code, digits only) → **Get pairing code**
6. Phone: **WhatsApp → Linked Devices → Link a device → Link with phone number instead** → enter the code
7. Message that WhatsApp number — reply *menu* for shops (sample: RoyaleApe) + Gemini replies

Session files live on the Render disk at `/var/data/auth_info_baileys` so redeploys keep the link.

## Local setup

```bash
cd bot
cp .env.example .env
# put GEMINI_API_KEY in .env
npm install
npm start
```

1. Open `http://localhost:10000/`
2. Enter phone (e.g. `26377xxxxxxx`) → get pairing code
3. WhatsApp → Linked Devices → **Link with phone number instead** → enter code
4. Message that number — marketplace bot replies (`menu`, shop names, products). Auth stays in `auth_info_baileys/` (gitignored).

## Cron / keep-alive

Uses **Starter** (always-on) on Render so the Node process and WhatsApp socket stay up. Free plan sleeps and will drop Baileys.

| Schedule (default) | What |
|--------------------|------|
| `*/3 * * * *` | WhatsApp health check; reconnect if socket is down |
| `*/10 * * * *` | Presence poke (`available`) to keep the session warm |
| `*/4 * * * *` | HTTP ping to `/health` (self keep-alive) |
| every 5 min | Backup `setInterval` health + ping |
| Optional `BOT_CRON_BROADCAST_*` | Daily text to a JID you configure |

Timezone: `Africa/Harare` (`BOT_CRON_TZ`). Check live cron state: `GET /status` or `GET /health?detail=1`.

## PM2 example

```bash
cd bot
npm install
pm2 start src/index.js --name trade-square-wa
pm2 save
```

## Notes

- Groups are ignored unless `BOT_ALLOW_GROUPS=1`.
- Without `GEMINI_API_KEY`, marketplace menus still work (shops, products, prices, store WhatsApp links).
- Sample shop catalog: RoyaleApe Studios from [royaleape.com](https://royaleape.com/) (Shop 55).
- Enrolments from [tradesquaremall.com/enroll](https://www.tradesquaremall.com/enroll/) sync to `PUT /catalog` and merge into the live shop list (`GET /catalog`, `GET /status` → `liveShopCount`).
- Do not commit `auth_info_baileys/` or `.env`.

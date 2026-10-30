# Trade Square Mall — WhatsApp bot (Baileys + cron + Gemini)

Real WhatsApp replies (not Meta Cloud API, not a website chat widget).

```
Customer WhatsApp
       │
       ▼
Baileys (WhatsApp Web multi-device socket)  ← always-on Node process
       │
       ├─ shop directory (shops / dine / hours / events)
       ├─ Gemini (open-ended answers)
       └─ node-cron (health check every 5 min, hourly presence, optional daily broadcast)
```

## Requirements

- Node.js **20+**
- A phone with WhatsApp to scan the QR (Linked Devices)
- Always-on host — **Render (recommended)** / VPS / Railway — **not** Vercel serverless

## Deploy on Render (recommended)

Full steps: [docs/render-deploy.md](../docs/render-deploy.md)

1. Push this repo and open [Render Dashboard](https://dashboard.render.com) → **New → Blueprint**
2. Select repo `-AI` and branch with `render.yaml`
3. Set `GEMINI_API_KEY` when prompted (Starter plan — Free sleeps and drops WhatsApp)
4. After deploy: open `https://<service>.onrender.com/qr` and scan with **WhatsApp → Linked Devices**
5. Message that WhatsApp number — shop directory + Gemini replies

Session files live on the Render disk at `/var/data/auth_info_baileys` so redeploys keep the link.

## Local setup

```bash
cd bot
cp .env.example .env
# put GEMINI_API_KEY in .env
npm install
npm start
```

1. Open `http://localhost:10000/qr` (or scan the terminal QR).
2. On your phone: **WhatsApp → Linked Devices → Link a device** → scan.
3. Session files land in `auth_info_baileys/` (gitignored). Keep them private.
4. Message that linked WhatsApp number — the bot replies from the mall shop directory / Gemini.

## Cron jobs

| Schedule | What |
|----------|------|
| `*/5 * * * *` | Health check; reconnect if socket is down |
| `0 * * * *` | Presence poke (`available`) to keep the session warm |
| Optional `BOT_CRON_BROADCAST_*` | Daily text to a JID you configure |

Timezone: `Africa/Harare`.

## PM2 example

```bash
cd bot
npm install
pm2 start src/index.js --name trade-square-wa
pm2 save
```

## Notes

- Groups are ignored unless `BOT_ALLOW_GROUPS=1`.
- Without `GEMINI_API_KEY`, directory keyword replies still work (shops, hours, dining, etc.).
- Do not commit `auth_info_baileys/` or `.env`.

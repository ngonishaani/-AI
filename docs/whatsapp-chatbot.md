# Trade Square Mall WhatsApp bot

Implementation is under [`/bot`](../bot) using **Baileys** (WhatsApp Web multi-device) + **node-cron** + **Gemini**, grounded on the mall shop directory.

There is **no Meta Cloud API** and **no website chat widget**. Customers message the linked WhatsApp number directly.

- Local / PM2: [bot/README.md](../bot/README.md)
- **Render deploy:** [render-deploy.md](./render-deploy.md) + root [`render.yaml`](../render.yaml) — mall website + WhatsApp bot on the same service
- **Enrol sync:** shops saved on [`/enroll`](https://ai-mallbot.onrender.com/enroll/) `PUT` to `/catalog` and appear in WhatsApp menus immediately (persisted on the Render disk). Public enrolled directory: [`/shop`](https://ai-mallbot.onrender.com/shop).

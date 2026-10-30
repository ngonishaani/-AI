# Trade Square Mall WhatsApp bot

Implementation is under [`/bot`](../bot) using **Baileys** (WhatsApp Web multi-device) + **node-cron** + **Gemini**, grounded on the mall shop directory.

There is **no Meta Cloud API** and **no website chat widget**. Customers message the linked WhatsApp number directly.

- Local / PM2: [bot/README.md](../bot/README.md)
- **Render deploy:** [render-deploy.md](./render-deploy.md) + root [`render.yaml`](../render.yaml)
- **Enrol sync:** shops saved on [`/enroll`](https://www.tradesquaremall.com/enroll/) `PUT` to the bot `/catalog` endpoint and appear in WhatsApp menus immediately (persisted on the Render disk).

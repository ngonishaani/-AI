# WhatsApp flagged / restricted the bot number

Baileys (linked-device) bots get flagged when they look automated: many messages per reply, interactive lists/buttons, presence spam, or cold broadcasts.

## What we changed in code

- **One reply per turn** (max 2) with typing delay + rate limits
- **No interactive list/button messages** (text menus only)
- **No nag** on stickers/voice/empty media
- **Presence poke off** by default; quieter connect
- **Broadcast off** unless `BOT_CRON_BROADCAST_ENABLED=1`
- Slower reconnect; no reconnect loop after logout/forbidden

## If the number is already flagged

1. **Stop the Render service** for 24–72 hours (cool-off).
2. On the phone: WhatsApp → **Linked devices** → log out this device.
3. Open `https://ai-mallbot.onrender.com/relink`, scan a **new QR once**.
4. Message the bot gently from **one** personal phone; avoid blasting menus.
5. If still banned: use a **new SIM / Business number**, enrol as WhatsApp Business App, link once, keep limits low.

## Hard limits to keep

| Setting | Safe default |
|---------|----------------|
| `BOT_MAX_MSGS_PER_TURN` | `2` |
| `BOT_RATE_PER_JID_PER_MIN` | `8` |
| `BOT_PRESENCE_POKE` | `0` |
| `BOT_CRON_BROADCAST_ENABLED` | `0` |
| Groups | leave `BOT_ALLOW_GROUPS=0` |

## Longer-term

For production marketing at scale, migrate to the **official WhatsApp Cloud API** (Meta) with template messages — unofficial sockets will keep getting flagged under heavy use.

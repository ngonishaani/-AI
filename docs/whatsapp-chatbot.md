# Trade Square Mall — WhatsApp + Gemini chatbot

Architecture (Meta Cloud API → Vercel → Gemini, grounded on the mall shop directory):

```
WhatsApp user
    │
    ▼
Meta WhatsApp Cloud API  ──webhook──►  GET/POST /api/whatsapp
                                              │
                                              ├─► lib/shop-directory.js  (shops, dine, hours, events)
                                              ├─► lib/gemini.js          (Gemini generateContent)
                                              └─► lib/whatsapp.js        (send text reply)
```

Same brain is also available on the website:

- `POST /api/chat` — `{ "message": "…" }` → `{ "reply": "…" }`
- `GET /api/directory` — full shop / dine JSON (`?q=` to search)
- `GET /api/config` — public WhatsApp link + whether chat is enabled

## Vercel environment variables

| Name | Required | Purpose |
|------|----------|---------|
| `GEMINI_API_KEY` | yes | Google AI Studio / Gemini API key |
| `WHATSAPP_TOKEN` | for WhatsApp | Meta permanent access token |
| `WHATSAPP_PHONE_NUMBER_ID` | for WhatsApp | Phone number ID from Meta |
| `WHATSAPP_VERIFY_TOKEN` | for WhatsApp | Shared secret for webhook verify |
| `WHATSAPP_DISPLAY_NUMBER` | optional | Digits-only number for site CTA (`wa.me`) |
| `GEMINI_MODEL` | optional | Default `gemini-2.0-flash` |

Add these in the Vercel project → Settings → Environment Variables, then redeploy.

## Meta webhook setup

1. Create a Meta app with **WhatsApp** product.
2. Callback URL: `https://tradesquaremall.com/api/whatsapp` (or your Vercel URL).
3. Verify token: same value as `WHATSAPP_VERIFY_TOKEN`.
4. Subscribe to `messages`.
5. Send a test message to the business number — replies use the shop directory via Gemini.

## Local smoke test (chat API)

```bash
GEMINI_API_KEY=… node -e '
fetch("http://localhost:3000/api/chat",{
  method:"POST",
  headers:{"Content-Type":"application/json"},
  body:JSON.stringify({message:"What shops are on the ground floor?"})
}).then(r=>r.json()).then(console.log)
'
```

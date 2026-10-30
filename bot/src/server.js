import http from "node:http";
import {
  getPairingState,
  setPendingPhone,
  maybeRequestPairingCode,
} from "./pairing.js";

/**
 * Render HTTP surface — phone pairing (preferred) + status.
 *   GET  /health
 *   GET  /status
 *   GET  /           pairing form + code
 *   POST /pair       { phone: "26377..." } → request pairing code
 */
export function startHttpServer({
  getStatus,
  getSock,
  getAuthInfo,
  logger,
  isGeminiConfigured,
}) {
  const port = Number(process.env.PORT || 10000);

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || "/", `http://127.0.0.1:${port}`);
    const pathName = url.pathname;

    if (pathName === "/health") {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("ok");
      return;
    }

    if (pathName === "/status") {
      const pair = getPairingState();
      const auth = getAuthInfo?.() || {};
      res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      res.end(
        JSON.stringify({
          status: getStatus(),
          linked: getStatus() === "open",
          geminiConfigured: Boolean(isGeminiConfigured?.()),
          authDir: auth.authDir || null,
          onRenderDisk: Boolean(auth.onRenderDisk),
          renderDiskMounted: Boolean(auth.renderDiskMounted),
          sessionRegistered: Boolean(auth.sessionRegistered),
          authFileCount: auth.authFileCount || 0,
          phone: pair.phone,
          pairingCode: pair.code,
          error: pair.error,
          tip:
            auth.onRenderDisk
              ? "Session is on persistent disk — redeploys should not require pairing again."
              : "WARNING: Attach a Render Disk at /var/data and set BAILEYS_AUTH_DIR=/var/data/auth_info_baileys or you will re-pair every deploy.",
        })
      );
      return;
    }

    if (pathName === "/pair" && req.method === "POST") {
      const body = await readBody(req);
      let phone = body.phone || body.number || "";
      if (!phone && typeof body === "string") {
        try {
          phone = JSON.parse(body).phone;
        } catch {
          phone = new URLSearchParams(body).get("phone") || "";
        }
      }
      if (typeof body === "object" && body !== null) {
        phone = body.phone || body.number || phone;
      }

      const normalized = setPendingPhone(phone);
      if (!normalized) {
        const pair = getPairingState();
        return sendJson(res, 400, { ok: false, error: pair.error });
      }

      const sock = getSock?.();
      if (sock && !sock.authState?.creds?.registered) {
        await maybeRequestPairingCode(sock, { logger });
      }

      const pair = getPairingState();
      return sendJson(res, 200, {
        ok: true,
        phone: pair.phone,
        pairingCode: pair.code,
        error: pair.error,
        hint: pair.code
          ? "Enter this code on your phone now"
          : "Code will appear when WhatsApp is ready — refresh in a few seconds",
      });
    }

    if ((pathName === "/" || pathName === "/pair" || pathName === "/qr") && req.method === "GET") {
      const status = getStatus();
      const pair = getPairingState();

      const auth = getAuthInfo?.() || {};
      if (status === "open" || auth.sessionRegistered) {
        const connected = status === "open";
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
        res.end(
          page(
            connected ? "Trade Square WhatsApp bot" : "Session saved — reconnecting",
            connected
              ? `<p class="ok">Connected. Message the linked WhatsApp number — the mall bot will reply.</p>
                 <p class="muted">Session path: <code>${escapeHtml(auth.authDir || "")}</code><br/>
                 Persistent disk: <strong>${auth.onRenderDisk ? "yes" : "NO — fix this or redeploys wipe the link"}</strong></p>`
              : `<p class="ok">WhatsApp session is already saved — no need to pair again.</p>
                 <p class="muted">Reconnecting… Persistent disk: <strong>${auth.onRenderDisk ? "yes" : "NO"}</strong></p>
                 <script>setTimeout(()=>location.reload(),4000)</script>`
          )
        );
        return;
      }

      // If we have a pending phone but no code yet, try again
      const sock = getSock?.();
      if (pair.phone && !pair.code && sock && !sock.authState?.creds?.registered) {
        await maybeRequestPairingCode(sock, { logger });
      }
      const fresh = getPairingState();

      const codeBlock = fresh.code
        ? `<div class="code-box"><span class="code">${escapeHtml(fresh.code)}</span></div>
           <ol class="steps">
             <li>On your phone open <strong>WhatsApp</strong></li>
             <li><strong>Linked Devices</strong> → <strong>Link a device</strong></li>
             <li>Tap <strong>Link with phone number instead</strong></li>
             <li>Enter the code above</li>
           </ol>
           <p class="muted">Code expires — submit the form again if it fails.</p>
           <script>setTimeout(()=>location.reload(),8000)</script>`
        : `<p class="muted">${fresh.phone ? "Waiting for pairing code…" : "Enter the WhatsApp number to link (with country code)."}</p>
           ${fresh.phone ? `<script>setTimeout(()=>location.reload(),4000)</script>` : ""}`;

      const err = fresh.error
        ? `<p class="err">${escapeHtml(fresh.error)}</p>`
        : "";

      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      res.end(
        page(
          "Link WhatsApp by phone number",
          `${err}
           <form id="f" method="get" action="/">
             <label for="phone">Phone number</label>
             <input id="phone" name="phone" type="tel" inputmode="numeric" placeholder="26377xxxxxxx" value="${escapeHtml(fresh.phone || "")}" required />
             <button type="submit">Get pairing code</button>
           </form>
           ${codeBlock}
           <p class="muted">Digits only, include country code (Zimbabwe example: <code>26377…</code>). No + or spaces.</p>
           <script>
             document.getElementById('f').addEventListener('submit', async function(e){
               e.preventDefault();
               var phone = document.getElementById('phone').value;
               var btn = e.target.querySelector('button');
               btn.disabled = true; btn.textContent = 'Requesting…';
               try {
                 var r = await fetch('/pair', {
                   method:'POST',
                   headers:{'Content-Type':'application/json'},
                   body: JSON.stringify({ phone: phone })
                 });
                 var j = await r.json();
                 if (j.pairingCode) location.reload();
                 else if (j.error) { alert(j.error); btn.disabled=false; btn.textContent='Get pairing code'; }
                 else setTimeout(()=>location.reload(), 2500);
               } catch(err) {
                 alert('Request failed — try again');
                 btn.disabled=false; btn.textContent='Get pairing code';
               }
             });
           </script>`
        )
      );
      return;
    }

    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
  });

  server.listen(port, "0.0.0.0", () => {
    logger.info({ port }, "HTTP server listening (pairing + /health)");
  });

  return server;
}

function sendJson(res, code, obj) {
  res.writeHead(code, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) return resolve({});
      const ct = req.headers["content-type"] || "";
      if (ct.includes("application/json")) {
        try {
          resolve(JSON.parse(raw));
        } catch {
          resolve({});
        }
      } else if (ct.includes("application/x-www-form-urlencoded")) {
        resolve(Object.fromEntries(new URLSearchParams(raw)));
      } else {
        try {
          resolve(JSON.parse(raw));
        } catch {
          resolve(raw);
        }
      }
    });
  });
}

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function page(title, inner) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title} · Trade Square</title>
  <style>
    *{box-sizing:border-box}
    body{font-family:system-ui,sans-serif;background:#0f2f2c;color:#eef6f4;margin:0;min-height:100vh;display:grid;place-items:center;padding:16px}
    main{width:100%;max-width:380px;padding:22px;background:#143936;border-radius:16px;box-shadow:0 16px 40px rgba(0,0,0,.35)}
    h1{font-size:1.1rem;margin:0 0 14px;text-align:center}
    label{display:block;font-size:.8rem;opacity:.85;margin-bottom:6px}
    input{width:100%;padding:12px 14px;border-radius:10px;border:1px solid rgba(255,255,255,.15);background:#0f2f2c;color:#fff;font-size:1rem;margin-bottom:10px}
    button{width:100%;padding:12px;border:0;border-radius:10px;background:#1faa7a;color:#042019;font-weight:700;font-size:.95rem;cursor:pointer}
    button:disabled{opacity:.6}
    .code-box{margin:16px 0;padding:18px;background:#fff;border-radius:12px;text-align:center}
    .code{font-size:1.85rem;font-weight:800;letter-spacing:.12em;color:#111;font-variant-numeric:tabular-nums}
    .steps{text-align:left;font-size:.88rem;line-height:1.45;padding-left:1.2rem}
    .ok{color:#9dffc2;text-align:center}.err{color:#ffb4a8;text-align:center;font-size:.9rem}
    .muted{opacity:.7;font-size:.8rem;text-align:center;margin-top:12px}
    code{background:#0f2f2c;padding:2px 6px;border-radius:6px}
  </style>
</head>
<body><main><h1>${title}</h1>${inner}</main></body>
</html>`;
}

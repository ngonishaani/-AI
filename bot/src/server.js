import http from "node:http";
import QRCode from "qrcode";
import {
  getPairingState,
  setPendingPhone,
  maybeRequestPairingCode,
} from "./pairing.js";

/**
 * Render HTTP surface — QR link (primary) + optional phone pairing.
 *   GET  /health /status / /qr /qr.png
 *   POST /pair
 */
export function startHttpServer({
  getStatus,
  getSock,
  getAuthInfo,
  getLatestQr,
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
      const qr = getLatestQr?.();
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      });
      res.end(
        JSON.stringify({
          status: getStatus(),
          linked: getStatus() === "open",
          qrPending: Boolean(qr),
          geminiConfigured: Boolean(isGeminiConfigured?.()),
          authDir: auth.authDir || null,
          onRenderDisk: Boolean(auth.onRenderDisk),
          renderDiskMounted: Boolean(auth.renderDiskMounted),
          sessionRegistered: Boolean(auth.sessionRegistered),
          authFileCount: auth.authFileCount || 0,
          phone: pair.phone,
          pairingCode: pair.code,
          error: pair.error,
          tip: auth.onRenderDisk
            ? "Session is on persistent disk — redeploys should not require pairing again."
            : "WARNING: Attach a Render Disk at /var/data and set BAILEYS_AUTH_DIR=/var/data/auth_info_baileys or you will re-pair every deploy.",
        })
      );
      return;
    }

    if (pathName === "/qr.png") {
      const qr = getLatestQr?.();
      if (!qr) {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("No QR yet — refresh in a few seconds");
        return;
      }
      try {
        const png = await QRCode.toBuffer(qr, {
          type: "png",
          width: 280,
          margin: 4,
          errorCorrectionLevel: "M",
          color: { dark: "#000000", light: "#FFFFFF" },
        });
        res.writeHead(200, {
          "Content-Type": "image/png",
          "Cache-Control": "no-store",
        });
        res.end(png);
      } catch (err) {
        logger.error({ err: err?.message || err }, "qr.png failed");
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end("QR render failed");
      }
      return;
    }

    if (pathName === "/pair" && req.method === "POST") {
      const body = await readBody(req);
      let phone = "";
      if (typeof body === "object" && body) {
        phone = body.phone || body.number || "";
      } else if (typeof body === "string") {
        try {
          phone = JSON.parse(body).phone;
        } catch {
          phone = new URLSearchParams(body).get("phone") || "";
        }
      }
      const normalized = setPendingPhone(phone);
      if (!normalized) {
        return sendJson(res, 400, { ok: false, error: getPairingState().error });
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
      });
    }

    if (
      (pathName === "/" || pathName === "/qr" || pathName === "/pair") &&
      req.method === "GET"
    ) {
      const status = getStatus();
      const auth = getAuthInfo?.() || {};
      const qr = getLatestQr?.();
      const wantPhone = pathName === "/pair" || url.searchParams.get("mode") === "phone";

      if (status === "open") {
        res.writeHead(200, {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
        });
        res.end(
          page(
            "Trade Square WhatsApp bot",
            `<p class="ok">Connected. Message the linked WhatsApp number — the mall bot will reply.</p>
             <p class="muted">Persistent disk: <strong>${auth.onRenderDisk ? "yes" : "NO"}</strong><br/>
             <code>${escapeHtml(auth.authDir || "")}</code></p>`
          )
        );
        return;
      }

      // Phone pairing page (optional fallback)
      if (wantPhone) {
        const sock = getSock?.();
        const pair = getPairingState();
        if (
          pair.phone &&
          !pair.code &&
          sock &&
          !sock.authState?.creds?.registered
        ) {
          await maybeRequestPairingCode(sock, { logger });
        }
        const fresh = getPairingState();
        const codeBlock = fresh.code
          ? `<div class="code-box"><span class="code">${escapeHtml(fresh.code)}</span></div>
             <ol class="steps">
               <li>WhatsApp → <strong>Linked Devices</strong> → Link a device</li>
               <li>Tap <strong>Link with phone number instead</strong></li>
               <li>Enter the code above</li>
             </ol>
             <script>setTimeout(()=>location.reload(),8000)</script>`
          : `<p class="muted">${fresh.phone ? "Waiting for code…" : "Enter number with country code."}</p>
             ${fresh.phone ? `<script>setTimeout(()=>location.reload(),4000)</script>` : ""}`;

        res.writeHead(200, {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
        });
        res.end(
          page(
            "Link with phone number",
            `${fresh.error ? `<p class="err">${escapeHtml(fresh.error)}</p>` : ""}
             <form id="f">
               <label for="phone">Phone number</label>
               <input id="phone" type="tel" inputmode="numeric" placeholder="26377xxxxxxx" value="${escapeHtml(fresh.phone || "")}" required />
               <button type="submit">Get pairing code</button>
             </form>
             ${codeBlock}
             <p class="muted"><a href="/qr">← Back to QR code</a></p>
             <script>
               document.getElementById('f').addEventListener('submit', async function(e){
                 e.preventDefault();
                 var phone=document.getElementById('phone').value;
                 var btn=e.target.querySelector('button');
                 btn.disabled=true; btn.textContent='Requesting…';
                 try {
                   var r=await fetch('/pair',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phone})});
                   var j=await r.json();
                   if(j.pairingCode||!j.error) location.reload();
                   else { alert(j.error||'Failed'); btn.disabled=false; btn.textContent='Get pairing code'; }
                 } catch(err){ alert('Request failed'); btn.disabled=false; btn.textContent='Get pairing code'; }
               });
             </script>`
          )
        );
        return;
      }

      // Primary: QR page
      let qrHtml;
      if (qr) {
        try {
          const dataUrl = await QRCode.toDataURL(qr, {
            margin: 4,
            width: 260,
            errorCorrectionLevel: "M",
            color: { dark: "#000000", light: "#FFFFFF" },
          });
          qrHtml = `
            <p class="tip"><strong>Open this page on a computer</strong>, then scan with your phone. Do not scan from the same phone screen.</p>
            <div class="qr-wrap"><img class="qr" alt="WhatsApp QR" src="${dataUrl}" width="260" height="260" /></div>
            <p><a class="btn" href="/qr.png" target="_blank" rel="noopener">Open QR image only</a></p>
            <ol class="steps">
              <li>Phone: <strong>WhatsApp → Linked Devices → Link a device</strong></li>
              <li>Point camera at this QR</li>
            </ol>
            <p class="muted">QR refreshes ~every 20s. Page reloads every 8s.</p>
            <script>setTimeout(()=>location.reload(),8000)</script>`;
        } catch (err) {
          logger.error({ err: err?.message || err }, "qr page render failed");
          qrHtml = `<p class="err">Could not draw QR. Try <a href="/qr.png">/qr.png</a>.</p>`;
        }
      } else if (auth.sessionRegistered) {
        qrHtml = `<p class="ok">Saved session found — reconnecting (no scan needed)…</p>
                  <p class="muted">If this hangs more than a minute, check Render logs.</p>
                  <script>setTimeout(()=>location.reload(),4000)</script>`;
      } else {
        qrHtml = `<p class="muted">Waiting for QR from WhatsApp…</p>
                  <script>setTimeout(()=>location.reload(),3000)</script>`;
      }

      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      });
      res.end(
        page(
          "Scan QR to link WhatsApp",
          `${qrHtml}
           <p class="muted">Disk: <strong>${auth.onRenderDisk ? "persistent ✓" : "NOT persistent"}</strong>
           · <a href="/pair">Use phone number instead</a></p>`
        )
      );
      return;
    }

    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
  });

  server.listen(port, "0.0.0.0", () => {
    logger.info({ port }, "HTTP server listening (QR + /health)");
  });

  return server;
}

function sendJson(res, code, obj) {
  res.writeHead(code, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
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
    main{width:100%;max-width:360px;padding:20px;background:#143936;border-radius:16px;box-shadow:0 16px 40px rgba(0,0,0,.35);text-align:center}
    h1{font-size:1.05rem;margin:0 0 12px}
    p{line-height:1.4;font-size:.9rem;margin:8px 0}
    .tip{background:#0f2f2c;padding:10px;border-radius:10px;font-size:.8rem;text-align:left}
    .qr-wrap{display:inline-block;margin:12px auto;background:#fff;padding:16px;border-radius:12px;line-height:0}
    img.qr{width:260px;height:260px;max-width:72vw;max-height:72vw;display:block;image-rendering:pixelated}
    .btn{display:inline-block;padding:10px 14px;background:#1faa7a;color:#042019;text-decoration:none;border-radius:10px;font-weight:700;font-size:.85rem}
    label{display:block;font-size:.8rem;opacity:.85;margin-bottom:6px;text-align:left}
    input{width:100%;padding:12px 14px;border-radius:10px;border:1px solid rgba(255,255,255,.15);background:#0f2f2c;color:#fff;font-size:1rem;margin-bottom:10px}
    button{width:100%;padding:12px;border:0;border-radius:10px;background:#1faa7a;color:#042019;font-weight:700;cursor:pointer}
    .code-box{margin:16px 0;padding:18px;background:#fff;border-radius:12px}
    .code{font-size:1.75rem;font-weight:800;letter-spacing:.12em;color:#111}
    .steps{text-align:left;font-size:.85rem;line-height:1.45;padding-left:1.2rem}
    .ok{color:#9dffc2}.err{color:#ffb4a8}.muted{opacity:.75;font-size:.8rem}
    a{color:#9dffc2} code{background:#0f2f2c;padding:2px 6px;border-radius:6px}
  </style>
</head>
<body><main><h1>${title}</h1>${inner}</main></body>
</html>`;
}

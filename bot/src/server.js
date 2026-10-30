import http from "node:http";
import QRCode from "qrcode";

/**
 * Small HTTP surface for Render:
 *   GET /health  — liveness for Render health checks
 *   GET /qr      — scan page while linking WhatsApp
 *   GET /status  — JSON connection status
 */
export function startHttpServer({ getStatus, getLatestQr, logger }) {
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
      const status = getStatus();
      const qr = getLatestQr();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          status,
          linked: status === "open",
          qrPending: Boolean(qr),
        })
      );
      return;
    }

    if (pathName === "/qr" || pathName === "/") {
      const status = getStatus();
      const qr = getLatestQr();
      let body;

      if (status === "open") {
        body = page(
          "Trade Square WhatsApp bot",
          `<p class="ok">Connected. Message the linked WhatsApp number — the mall bot will reply.</p>
           <p class="muted">You can close this page. Session is saved on the Render disk.</p>`
        );
      } else if (qr) {
        try {
          const dataUrl = await QRCode.toDataURL(qr, {
            margin: 2,
            width: 360,
            errorCorrectionLevel: "M",
          });
          body = page(
            "Scan to link WhatsApp",
            `<p>Open WhatsApp → <strong>Linked Devices</strong> → Link a device → scan:</p>
             <img alt="WhatsApp QR" src="${dataUrl}" width="360" height="360" />
             <p class="muted">This page refreshes every 8s until linked.</p>
             <script>setTimeout(()=>location.reload(),8000)</script>`
          );
        } catch (err) {
          logger.error({ err: err?.message || err }, "qr image failed");
          body = page(
            "QR error",
            `<p>Could not render QR. Check Render logs for the terminal QR.</p>`
          );
        }
      } else {
        body = page(
          "Connecting…",
          `<p>Waiting for WhatsApp QR…</p>
           <p class="muted">Refresh in a few seconds. Status: <code>${status}</code></p>
           <script>setTimeout(()=>location.reload(),4000)</script>`
        );
      }

      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(body);
      return;
    }

    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
  });

  server.listen(port, "0.0.0.0", () => {
    logger.info({ port }, "HTTP server listening (health + /qr)");
  });

  return server;
}

function page(title, inner) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title} · Trade Square</title>
  <style>
    body{font-family:system-ui,sans-serif;background:#0f2f2c;color:#eef6f4;margin:0;min-height:100vh;display:grid;place-items:center}
    main{max-width:420px;padding:28px;background:#143936;border-radius:16px;box-shadow:0 16px 40px rgba(0,0,0,.35);text-align:center}
    h1{font-size:1.15rem;margin:0 0 12px}
    p{line-height:1.45;font-size:.95rem}
    img{margin:12px auto;background:#fff;padding:12px;border-radius:12px;display:block}
    .ok{color:#9dffc2}.muted{opacity:.7;font-size:.85rem}code{background:#0f2f2c;padding:2px 6px;border-radius:6px}
  </style>
</head>
<body><main><h1>${title}</h1>${inner}</main></body>
</html>`;
}

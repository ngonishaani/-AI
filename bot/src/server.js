import http from "node:http";
import QRCode from "qrcode";

/**
 * Small HTTP surface for Render:
 *   GET /health  — liveness for Render health checks
 *   GET /qr      — scan page while linking WhatsApp
 *   GET /qr.png  — raw QR image (easier to scan / open fullscreen)
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

    if (pathName === "/qr.png") {
      const qr = getLatestQr();
      if (!qr) {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("No QR yet — wait for connecting, then refresh");
        return;
      }
      try {
        const png = await QRCode.toBuffer(qr, {
          type: "png",
          width: 256,
          margin: 4,
          errorCorrectionLevel: "L",
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
            margin: 4,
            width: 240,
            errorCorrectionLevel: "L",
            color: { dark: "#000000", light: "#FFFFFF" },
          });
          body = page(
            "Scan to link WhatsApp",
            `<p class="tip"><strong>Open this page on a computer</strong> (or another phone). Scan with the WhatsApp phone — you can’t scan a QR on the same screen.</p>
             <div class="qr-wrap">
               <img class="qr" alt="WhatsApp QR" src="${dataUrl}" width="240" height="240" />
             </div>
             <p><a class="btn" href="/qr.png" target="_blank" rel="noopener">Open QR only (fullscreen)</a></p>
             <p class="muted">WhatsApp → Linked Devices → Link a device. Page refreshes every 10s (QR expires — rescan if needed).</p>
             <script>setTimeout(()=>location.reload(),10000)</script>`
          );
        } catch (err) {
          logger.error({ err: err?.message || err }, "qr image failed");
          body = page(
            "QR error",
            `<p>Could not render QR. Try <a href="/qr.png">/qr.png</a> or check Render logs.</p>`
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

      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      });
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
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
  <title>${title} · Trade Square</title>
  <style>
    *{box-sizing:border-box}
    body{font-family:system-ui,sans-serif;background:#0f2f2c;color:#eef6f4;margin:0;min-height:100vh;display:grid;place-items:center;padding:16px}
    main{width:100%;max-width:340px;padding:20px;background:#143936;border-radius:16px;box-shadow:0 16px 40px rgba(0,0,0,.35);text-align:center}
    h1{font-size:1.05rem;margin:0 0 10px}
    p{line-height:1.4;font-size:.9rem;margin:8px 0}
    .tip{background:#0f2f2c;padding:10px;border-radius:10px;font-size:.82rem}
    .qr-wrap{display:inline-block;margin:12px auto;background:#fff;padding:14px;border-radius:12px;line-height:0}
    img.qr{width:240px;height:240px;max-width:70vw;max-height:70vw;display:block;image-rendering:pixelated}
    .btn{display:inline-block;margin-top:4px;padding:10px 14px;background:#004741;color:#fff;text-decoration:none;border-radius:10px;font-weight:600;font-size:.85rem}
    .ok{color:#9dffc2}.muted{opacity:.7;font-size:.8rem}code{background:#0f2f2c;padding:2px 6px;border-radius:6px}
  </style>
</head>
<body><main><h1>${title}</h1>${inner}</main></body>
</html>`;
}

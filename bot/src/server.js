import http from "node:http";
import QRCode from "qrcode";
import {
  getPairingState,
  setPendingPhone,
  maybeRequestPairingCode,
} from "./pairing.js";
import { getGeminiDiagnostics, testGemini } from "./gemini.js";
import fs from "node:fs";
import path from "node:path";
import {
  getCatalogMeta,
  loadEnrolledRaw,
  saveEnrolledRaw,
  listNormalizedEnrolled,
  mediaDir,
  resolvePublicImageUrl,
} from "./catalog-store.js";
import { getShops } from "./marketplace.js";
import { textMainMenu } from "./menus.js";
import { getSiteRoot, tryServeSite } from "./site-static.js";

/**
 *   GET  /health /status /catalog /menu-preview /media/* /qr /qr.png /pair
 *   PUT  /catalog   (enrol page sync — may include data-URL shop photos)
 *   POST /pair  /relink
 *   GET  /*        mall website (index, /shop, /enroll, assets) from SITE_ROOT
 */
export function startHttpServer({
  getStatus,
  getSock,
  getAuthInfo,
  getLatestQr,
  forceRelink,
  logger,
  isGeminiConfigured,
}) {
  const port = Number(process.env.PORT || 10000);

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || "/", `http://127.0.0.1:${port}`);
    const pathName = url.pathname;

    if (
      req.method === "OPTIONS" &&
      (pathName.startsWith("/catalog") ||
        pathName === "/menu-preview" ||
        pathName.startsWith("/media/"))
    ) {
      return sendCors(res, 204, "");
    }

    if (pathName === "/health") {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("ok");
      return;
    }

    if (pathName === "/menu-preview" && req.method === "GET") {
      const shops = getShops();
      return sendCorsJson(res, 200, {
        ok: true,
        liveCount: shops.length,
        shops: shops.map((s) => ({
          id: s.id,
          name: s.name,
          floor: s.floor,
          number: s.number,
          enrolled: Boolean(s.enrolled),
          hasImage: Boolean(s.image),
          image: s.image || "",
          productCount: s.products?.length || 0,
        })),
        menuText: textMainMenu(),
      });
    }

    if (pathName === "/catalog" && req.method === "GET") {
      const enrolled = loadEnrolledRaw();
      const meta = getCatalogMeta();
      // Absolute image URLs so the enrol page can preview persisted uploads
      const shops = enrolled.shops.map((shop) => publicizeShopImages(shop));
      return sendCorsJson(res, 200, {
        ok: true,
        shops,
        normalized: listNormalizedEnrolled(),
        live: getShops().map((s) => ({
          id: s.id,
          name: s.name,
          floor: s.floor,
          number: s.number,
          enrolled: Boolean(s.enrolled),
          hasImage: Boolean(s.image),
          productCount: s.products?.length || 0,
        })),
        updatedAt: meta.updatedAt,
        count: meta.count,
      });
    }

    if (pathName === "/catalog" && (req.method === "PUT" || req.method === "POST")) {
      if (!authorizeCatalogWrite(req)) {
        return sendCorsJson(res, 401, {
          ok: false,
          error: "Unauthorized — set CATALOG_SYNC_TOKEN on the bot and enrol page",
        });
      }
      try {
        const body = await readBody(req, { maxBytes: 12 * 1024 * 1024 });
        const shops = Array.isArray(body?.shops)
          ? body.shops
          : Array.isArray(body)
            ? body
            : null;
        if (!shops) {
          return sendCorsJson(res, 400, {
            ok: false,
            error: "Expected JSON body { shops: [...] }",
          });
        }
        const saved = saveEnrolledRaw(shops);
        const omitted = saved.shops.filter((s) => s?.imageOmitted).length;
        const withImages = saved.shops.filter((s) => s?.image).length;
        logger.info(
          {
            count: saved.shops.length,
            updatedAt: saved.updatedAt,
            omittedImages: omitted,
            shopsWithImages: withImages,
          },
          "Marketplace catalog updated from enrol sync"
        );
        return sendCorsJson(res, 200, {
          ok: true,
          count: saved.shops.length,
          updatedAt: saved.updatedAt,
          liveCount: getShops().length,
          omittedImages: omitted,
          shopsWithImages: withImages,
          shops: saved.shops.map((shop) => publicizeShopImages(shop)),
          menuText: textMainMenu(),
        });
      } catch (err) {
        logger.error({ err: err?.message || err }, "catalog sync failed");
        return sendCorsJson(res, 500, {
          ok: false,
          error: err?.message || String(err),
        });
      }
    }

    if (pathName.startsWith("/media/") && req.method === "GET") {
      const filename = path.basename(pathName.slice("/media/".length));
      if (!filename || !/\.(jpe?g|png|webp|gif)$/i.test(filename)) {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Not found");
        return;
      }
      const filePath = path.join(mediaDir(), filename);
      if (!fs.existsSync(filePath)) {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Not found");
        return;
      }
      const ext = path.extname(filename).toLowerCase();
      const type =
        ext === ".png"
          ? "image/png"
          : ext === ".webp"
            ? "image/webp"
            : ext === ".gif"
              ? "image/gif"
              : "image/jpeg";
      res.writeHead(200, {
        "Content-Type": type,
        "Cache-Control": "public, max-age=86400",
        "Access-Control-Allow-Origin": "*",
      });
      fs.createReadStream(filePath).pipe(res);
      return;
    }

    if (pathName === "/status") {
      const pair = getPairingState();
      const auth = getAuthInfo?.() || {};
      const qr = getLatestQr?.();
      const gemini = getGeminiDiagnostics();
      const catalog = getCatalogMeta();
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
          geminiOk: gemini.ok,
          geminiModel: gemini.model,
          geminiError: gemini.error,
          geminiTestedAt: gemini.testedAt,
          authDir: auth.authDir || null,
          onRenderDisk: Boolean(auth.onRenderDisk),
          renderDiskMounted: Boolean(auth.renderDiskMounted),
          sessionRegistered: Boolean(auth.sessionRegistered),
          authFileCount: auth.authFileCount || 0,
          catalogCount: catalog.count,
          catalogUpdatedAt: catalog.updatedAt,
          liveShopCount: getShops().length,
          phone: pair.phone,
          pairingCode: pair.code,
          error: pair.error,
        })
      );
      return;
    }

    if (pathName === "/test-gemini") {
      try {
        const result = await testGemini();
        res.writeHead(result.ok ? 200 : 503, {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        });
        res.end(JSON.stringify(result, null, 2));
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: err?.message || String(err) }));
      }
      return;
    }

    if (pathName === "/relink" && (req.method === "POST" || req.method === "GET")) {
      try {
        await forceRelink?.();
        // Give Baileys a moment to emit QR
        await sleep(2500);
        if (req.method === "GET") {
          res.writeHead(302, { Location: "/qr?fresh=1" });
          res.end();
          return;
        }
        return sendJson(res, 200, {
          ok: true,
          qrPending: Boolean(getLatestQr?.()),
          status: getStatus(),
          auth: getAuthInfo?.(),
        });
      } catch (err) {
        logger.error({ err: err?.message || err }, "relink failed");
        return sendJson(res, 500, { ok: false, error: err?.message || String(err) });
      }
    }

    if (pathName === "/qr.png") {
      const qr = getLatestQr?.();
      if (!qr) {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("No QR yet — open /relink then refresh");
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
      if (typeof body === "object" && body) phone = body.phone || body.number || "";
      else if (typeof body === "string") {
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
      // Prefer waiting for QR event; still try now if socket exists
      if (sock && !sock.authState?.creds?.registered) {
        await maybeRequestPairingCode(sock, { logger });
      }

      const pair = getPairingState();
      return sendJson(res, 200, {
        ok: true,
        phone: pair.phone,
        pairingCode: pair.code,
        qrPending: Boolean(getLatestQr?.()),
        error: pair.error,
        hint: pair.code
          ? "Enter this code on your phone now"
          : "Keep this page open — code appears when WhatsApp is ready (or use /qr instead)",
      });
    }

    if ((pathName === "/qr" || pathName === "/pair") && req.method === "GET") {
      const status = getStatus();
      const auth = getAuthInfo?.() || {};
      const qr = getLatestQr?.();
      const wantPhone =
        pathName === "/pair" || url.searchParams.get("mode") === "phone";

      if (status === "open" && pathName === "/qr") {
        res.writeHead(200, {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
        });
        res.end(
          page(
            "Trade Square WhatsApp bot",
            `<p class="ok">Connected. Message the linked WhatsApp number — the mall bot will reply.</p>
             <p class="muted">Persistent disk: <strong>${auth.onRenderDisk ? "yes" : "NO"}</strong></p>
             <p class="muted"><a href="/">← Mall website</a> · <a href="/shop">Enrolled shops</a></p>`
          )
        );
        return;
      }

      if (wantPhone) {
        const sock = getSock?.();
        const pair0 = getPairingState();
        if (
          pair0.phone &&
          !pair0.code &&
          sock &&
          !sock.authState?.creds?.registered
        ) {
          await maybeRequestPairingCode(sock, { logger });
        }
        const fresh = getPairingState();
        const codeBlock = fresh.code
          ? `<div class="code-box"><span class="code">${escapeHtml(fresh.code)}</span></div>
             <ol class="steps">
               <li>WhatsApp → Linked Devices → Link a device</li>
               <li><strong>Link with phone number instead</strong></li>
               <li>Enter the code above</li>
             </ol>
             <script>setTimeout(()=>location.reload(),8000)</script>`
          : `<p class="muted">${
              fresh.phone
                ? qr
                  ? "WhatsApp is ready — requesting code…"
                  : "Waiting for WhatsApp connection… (QR also available)"
                : "Enter number with country code."
            }</p>
             ${fresh.phone ? `<script>setTimeout(()=>location.reload(),3000)</script>` : ""}`;

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
             <p class="muted"><a href="/qr">← Back to QR code</a> · <a href="/relink">Reset &amp; new QR</a></p>
             <script>
               document.getElementById('f').addEventListener('submit', async function(e){
                 e.preventDefault();
                 var phone=document.getElementById('phone').value;
                 var btn=e.target.querySelector('button');
                 btn.disabled=true; btn.textContent='Requesting…';
                 try {
                   var r=await fetch('/pair',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phone})});
                   var j=await r.json();
                   location.reload();
                 } catch(err){ alert('Request failed'); btn.disabled=false; btn.textContent='Get pairing code'; }
               });
             </script>`
          )
        );
        return;
      }

      // Primary QR page
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
            <p class="tip"><strong>Open on a computer.</strong> Scan with your WhatsApp phone (not this same screen).</p>
            <div class="qr-wrap"><img class="qr" alt="WhatsApp QR" src="${dataUrl}" width="260" height="260" /></div>
            <p><a class="btn" href="/qr.png" target="_blank" rel="noopener">Open QR image only</a></p>
            <ol class="steps">
              <li>WhatsApp → <strong>Linked Devices</strong> → Link a device</li>
              <li>Scan this QR</li>
            </ol>
            <script>setTimeout(()=>location.reload(),8000)</script>`;
        } catch (err) {
          logger.error({ err: err?.message || err }, "qr page render failed");
          qrHtml = `<p class="err">Could not draw QR. Try <a href="/qr.png">/qr.png</a> or <a href="/relink">reset</a>.</p>`;
        }
      } else {
        qrHtml = `
          <p class="muted">${
            auth.sessionRegistered
              ? "Saved session reconnecting… if this never shows a QR, reset below."
              : "Waiting for QR from WhatsApp…"
          }</p>
          <p><a class="btn" href="/relink">Reset session &amp; get new QR</a></p>
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
           <p class="muted">Stuck? <a href="/relink">Reset &amp; new QR</a>
           · Disk: <strong>${auth.onRenderDisk ? "persistent ✓" : "NOT persistent"}</strong></p>`
        )
      );
      return;
    }

    if (tryServeSite(req, res, pathName, logger)) {
      return;
    }

    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
  });

  server.listen(port, "0.0.0.0", () => {
    logger.info(
      { port, siteRoot: getSiteRoot() },
      "HTTP server listening (mall site + QR + /health)"
    );
  });

  return server;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, PUT, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Catalog-Token",
    "Access-Control-Max-Age": "86400",
  };
}

function sendCors(res, code, body) {
  res.writeHead(code, {
    ...corsHeaders(),
    "Content-Type": "text/plain",
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function sendCorsJson(res, code, obj) {
  res.writeHead(code, {
    ...corsHeaders(),
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(obj));
}

function authorizeCatalogWrite(req) {
  const expected = process.env.CATALOG_SYNC_TOKEN?.trim();
  if (!expected) return true;
  const header = req.headers.authorization || "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const alt = String(req.headers["x-catalog-token"] || "").trim();
  return bearer === expected || alt === expected;
}

function sendJson(res, code, obj) {
  res.writeHead(code, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(obj));
}

function publicizeShopImages(shop) {
  if (!shop || typeof shop !== "object") return shop;
  const next = {
    ...shop,
    image: resolvePublicImageUrl(shop.image),
  };
  if (Array.isArray(shop.products)) {
    next.products = shop.products.map((p) =>
      p && typeof p === "object"
        ? { ...p, image: resolvePublicImageUrl(p.image || shop.image) }
        : p
    );
  }
  return next;
}

function readBody(req, { maxBytes = 2 * 1024 * 1024 } = {}) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > maxBytes) {
        reject(new Error(`Request body too large (max ${Math.round(maxBytes / 1024 / 1024)}MB)`));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("error", reject);
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

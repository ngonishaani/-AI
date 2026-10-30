/**
 * Minimal local server for smoke-testing /api + static assets.
 * Usage: node scripts/local-api-server.js
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const root = path.join(__dirname, "..");
const port = Number(process.env.PORT || 3456);

const handlers = {
  "/api/whatsapp": require("../api/whatsapp"),
  "/api/chat": require("../api/chat"),
  "/api/directory": require("../api/directory"),
  "/api/config": require("../api/config"),
};

const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".mp4": "video/mp4",
  ".json": "application/json",
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve(raw);
      }
    });
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://127.0.0.1:${port}`);
  const api = handlers[u.pathname];
  if (api) {
    const query = Object.fromEntries(u.searchParams.entries());
    req.query = query;
    req.body = ["POST", "PUT", "PATCH"].includes(req.method)
      ? await readBody(req)
      : {};
    const fakeRes = {
      statusCode: 200,
      headers: {},
      setHeader(k, v) {
        this.headers[k] = v;
      },
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(obj) {
        const body = JSON.stringify(obj);
        res.writeHead(this.statusCode, {
          "Content-Type": "application/json",
          ...this.headers,
        });
        res.end(body);
      },
      send(text) {
        res.writeHead(this.statusCode, {
          "Content-Type": "text/plain; charset=utf-8",
          ...this.headers,
        });
        res.end(String(text));
      },
      end() {
        res.writeHead(this.statusCode, this.headers);
        res.end();
      },
    };
    try {
      await api(req, fakeRes);
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  let filePath = path.join(root, u.pathname === "/" ? "index.html" : u.pathname);
  if (!filePath.startsWith(root) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(root, "index.html");
  }
  const ext = path.extname(filePath);
  res.writeHead(200, { "Content-Type": mime[ext] || "application/octet-stream" });
  fs.createReadStream(filePath).pipe(res);
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Trade Square local server http://127.0.0.1:${port}`);
});

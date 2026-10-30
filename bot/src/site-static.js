/**
 * Serve the Trade Square mall website (repo root) from the Render bot process.
 * API routes in server.js always win; this is the fallback for GET.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DEFAULT_ROOT = path.resolve(__dirname, "../..");

const BLOCKED_PREFIXES = [
  "bot/",
  ".git/",
  "node_modules/",
  "docs/",
  ".cursor/",
];

const BLOCKED_NAMES = new Set([
  ".env",
  ".env.local",
  ".gitignore",
  "package.json",
  "package-lock.json",
  "render.yaml",
  "vercel.json",
]);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json; charset=utf-8",
};

const SPA_SHELL = new Set(["/dine", "/visit", "/events"]);

export function getSiteRoot() {
  return process.env.SITE_ROOT
    ? path.resolve(process.env.SITE_ROOT)
    : DEFAULT_ROOT;
}

function safeJoin(root, requestPath) {
  const decoded = decodeURIComponent(requestPath.split("?")[0] || "/");
  const normalized = path.posix.normalize(decoded);
  if (normalized.includes("\0")) return null;
  const rel = normalized.replace(/^\/+/, "");
  const abs = path.resolve(root, rel);
  if (abs !== root && !abs.startsWith(root + path.sep)) return null;
  return abs;
}

function isBlocked(relPosix) {
  const clean = relPosix.replace(/^\/+/, "");
  if (!clean) return false;
  if (BLOCKED_NAMES.has(clean) || BLOCKED_NAMES.has(path.posix.basename(clean))) {
    return true;
  }
  return BLOCKED_PREFIXES.some(
    (prefix) => clean === prefix.slice(0, -1) || clean.startsWith(prefix)
  );
}

function mapRequestToFile(pathname) {
  const raw = pathname.replace(/\/+$/, "") || "/";

  if (raw === "/") return "/index.html";
  if (raw === "/shop" || raw === "/shops") return "/shop/index.html";
  if (raw === "/enroll") return "/enroll/index.html";
  if (raw === "/enrol") return "/enrol/index.html";
  if (SPA_SHELL.has(raw)) return "/index.html";

  if (path.posix.extname(raw)) return raw;
  return `${raw}/index.html`;
}

function cacheControl(ext) {
  if (ext === ".html") return "public, max-age=60";
  if (ext === ".mp4" || ext === ".webm") {
    return "public, max-age=31536000, immutable";
  }
  if ([".css", ".js", ".mjs", ".png", ".jpg", ".jpeg", ".webp", ".svg", ".woff", ".woff2"].includes(ext)) {
    return "public, max-age=86400";
  }
  return "public, max-age=300";
}

/**
 * @returns {boolean} true if a response was sent
 */
export function tryServeSite(req, res, pathname, logger) {
  if (req.method !== "GET" && req.method !== "HEAD") return false;

  const root = getSiteRoot();
  if (!fs.existsSync(path.join(root, "index.html"))) {
    return false;
  }

  const mapped = mapRequestToFile(pathname);
  const rel = mapped.replace(/^\/+/, "");
  if (isBlocked(rel)) return false;

  const filePath = safeJoin(root, mapped);
  if (!filePath) return false;

  let stat;
  try {
    stat = fs.statSync(filePath);
  } catch {
    return false;
  }
  if (!stat.isFile()) return false;

  const ext = path.extname(filePath).toLowerCase();
  const type = MIME[ext] || "application/octet-stream";
  const headers = {
    "Content-Type": type,
    "Content-Length": stat.size,
    "Cache-Control": cacheControl(ext),
  };

  if (req.method === "HEAD") {
    res.writeHead(200, headers);
    res.end();
    return true;
  }

  res.writeHead(200, headers);
  const stream = fs.createReadStream(filePath);
  stream.on("error", (err) => {
    logger?.error?.({ err: err?.message || err, filePath }, "site static read failed");
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "text/plain" });
    }
    res.end("Error reading file");
  });
  stream.pipe(res);
  return true;
}

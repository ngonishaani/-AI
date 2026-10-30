import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RENDER_DISK = "/var/data";
const RENDER_AUTH = path.join(RENDER_DISK, "auth_info_baileys");
const LOCAL_AUTH = path.join(__dirname, "..", "auth_info_baileys");

/**
 * Prefer Render persistent disk so WhatsApp session survives redeploys.
 * Ephemeral paths under the repo are wiped every deploy — that forces re-pairing.
 */
export function resolveAuthDir() {
  if (process.env.BAILEYS_AUTH_DIR?.trim()) {
    return path.resolve(process.env.BAILEYS_AUTH_DIR.trim());
  }
  if (fs.existsSync(RENDER_DISK)) {
    return RENDER_AUTH;
  }
  return LOCAL_AUTH;
}

export function ensureAuthDir(authDir, logger) {
  fs.mkdirSync(authDir, { recursive: true });

  const probe = path.join(authDir, ".disk-write-probe");
  try {
    fs.writeFileSync(probe, `ok ${new Date().toISOString()}\n`, "utf8");
  } catch (err) {
    logger?.error(
      { authDir, err: err?.message || err },
      "Cannot write WhatsApp session folder — attach a Render disk at /var/data"
    );
    throw err;
  }

  const onRenderDisk = authDir === RENDER_AUTH || authDir.startsWith(`${RENDER_DISK}/`);
  const persistent = onRenderDisk || Boolean(process.env.BAILEYS_AUTH_DIR?.trim());

  if (!persistent && process.env.RENDER) {
    logger?.error(
      { authDir },
      "CRITICAL: WhatsApp auth is NOT on a persistent disk. Every redeploy will require pairing again. In Render: add a Disk mountPath=/var/data and set BAILEYS_AUTH_DIR=/var/data/auth_info_baileys"
    );
  } else if (onRenderDisk) {
    logger?.info({ authDir }, "WhatsApp session path is on Render persistent disk");
  } else {
    logger?.info({ authDir, persistent }, "WhatsApp session path ready");
  }

  return {
    authDir,
    persistent: Boolean(persistent && onRenderDisk) || (persistent && fs.existsSync(authDir)),
    onRenderDisk,
    files: listAuthFiles(authDir),
  };
}

export function listAuthFiles(authDir) {
  try {
    return fs
      .readdirSync(authDir)
      .filter((f) => f !== ".disk-write-probe");
  } catch {
    return [];
  }
}

export function readSessionRegistered(authDir) {
  try {
    const credsPath = path.join(authDir, "creds.json");
    if (!fs.existsSync(credsPath)) return false;
    const creds = JSON.parse(fs.readFileSync(credsPath, "utf8"));
    return Boolean(creds?.registered);
  } catch {
    return false;
  }
}

export function getAuthStatus(authDir) {
  const files = listAuthFiles(authDir);
  return {
    authDir,
    onRenderDisk:
      authDir === RENDER_AUTH || authDir.startsWith(`${RENDER_DISK}/`),
    renderDiskMounted: fs.existsSync(RENDER_DISK),
    sessionRegistered: readSessionRegistered(authDir),
    authFileCount: files.length,
    hasCredsJson: files.includes("creds.json"),
  };
}

/** Wipe Baileys session files so a fresh QR can be generated. */
export function clearAuthSession(authDir, logger) {
  const files = listAuthFiles(authDir);
  for (const name of files) {
    try {
      fs.rmSync(path.join(authDir, name), { recursive: true, force: true });
    } catch (err) {
      logger?.warn({ name, err: err?.message || err }, "failed deleting auth file");
    }
  }
  logger?.warn({ authDir, removed: files.length }, "WhatsApp session cleared — new QR required");
  return files.length;
}

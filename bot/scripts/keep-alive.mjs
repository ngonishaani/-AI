#!/usr/bin/env node
/**
 * Ping the bot /health endpoint so Render (or any host) does not idle out
 * and so we notice when the service is down.
 *
 * Used by:
 *   - Render Cron Job (render.yaml)
 *   - External cron (cron-job.org, EasyCron, etc.)
 *
 * Env:
 *   KEEP_ALIVE_URL  full health URL (default https://ai-mallbot.onrender.com/health)
 */
const url = (
  process.env.KEEP_ALIVE_URL ||
  process.env.BOT_HEALTH_URL ||
  "https://ai-mallbot.onrender.com/health"
).trim();

const started = Date.now();

try {
  const res = await fetch(url, {
    method: "GET",
    headers: { "user-agent": "trade-square-keepalive/1.0" },
    redirect: "follow",
  });
  const body = (await res.text()).slice(0, 80);
  const ms = Date.now() - started;
  if (!res.ok) {
    console.error(`keep-alive FAIL ${res.status} ${ms}ms ${url} ${body}`);
    process.exit(1);
  }
  console.log(`keep-alive OK ${res.status} ${ms}ms ${url} ${body}`);
} catch (err) {
  console.error(`keep-alive ERROR ${url}: ${err?.message || err}`);
  process.exit(1);
}

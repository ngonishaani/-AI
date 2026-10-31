import cron from "node-cron";

/**
 * Keep-alive + health cron for the Baileys WhatsApp bot.
 * Schedules use Africa/Harare unless overridden.
 *
 * Jobs:
 *  1. Frequent socket health check + reconnect
 *  2. Presence poke (keeps WhatsApp session warm)
 *  3. Self HTTP ping to /health (keeps the web process responsive)
 *  4. Optional daily broadcast when BOT_CRON_BROADCAST_JID is set
 */

const TZ = process.env.BOT_CRON_TZ || "Africa/Harare";

let cronState = {
  startedAt: null,
  jobCount: 0,
  lastHealthAt: null,
  lastHealthStatus: null,
  lastPresenceAt: null,
  lastPingAt: null,
  lastPingOk: null,
  lastReconnectAt: null,
  lastError: null,
};

export function getCronDiagnostics() {
  return { ...cronState, timezone: TZ };
}

function publicBaseUrl() {
  const explicit =
    process.env.KEEP_ALIVE_URL?.trim() ||
    process.env.RENDER_EXTERNAL_URL?.trim() ||
    process.env.BOT_PUBLIC_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const port = process.env.PORT || 10000;
  return `http://127.0.0.1:${port}`;
}

export function startCronJobs({ getSock, getStatus, reconnect, logger }) {
  const jobs = [];
  const intervals = [];
  cronState.startedAt = new Date().toISOString();

  const healthExpr = process.env.BOT_CRON_HEALTH || "*/3 * * * *";
  const presenceExpr = process.env.BOT_CRON_PRESENCE || "*/10 * * * *";
  const pingExpr = process.env.BOT_CRON_PING || "*/4 * * * *";

  async function runHealthCheck() {
    const status = getStatus();
    cronState.lastHealthAt = new Date().toISOString();
    cronState.lastHealthStatus = status;
    logger.info({ status, at: cronState.lastHealthAt }, "cron health check");
    if (status !== "open") {
      logger.warn("WhatsApp socket not open — triggering reconnect");
      cronState.lastReconnectAt = new Date().toISOString();
      try {
        await reconnect();
      } catch (err) {
        cronState.lastError = err?.message || String(err);
        logger.error({ err: cronState.lastError }, "cron reconnect failed");
      }
    }
  }

  async function runPresencePoke() {
    const sock = getSock();
    if (!sock || getStatus() !== "open") return;
    try {
      await sock.sendPresenceUpdate("available");
      cronState.lastPresenceAt = new Date().toISOString();
      logger.info("cron presence poke sent");
    } catch (err) {
      cronState.lastError = err?.message || String(err);
      logger.warn({ err: cronState.lastError }, "cron presence poke failed");
    }
  }

  async function runKeepAlivePing() {
    const base = publicBaseUrl();
    const url = `${base}/health`;
    try {
      const res = await fetch(url, {
        method: "GET",
        signal: AbortSignal.timeout(8000),
      });
      cronState.lastPingAt = new Date().toISOString();
      cronState.lastPingOk = res.ok;
      if (!res.ok) {
        logger.warn({ url, status: res.status }, "cron keep-alive ping not ok");
      } else {
        logger.debug({ url }, "cron keep-alive ping ok");
      }
    } catch (err) {
      cronState.lastPingAt = new Date().toISOString();
      cronState.lastPingOk = false;
      cronState.lastError = err?.message || String(err);
      logger.warn({ err: cronState.lastError, url }, "cron keep-alive ping failed");
    }
  }

  function safeSchedule(expression, name, fn) {
    if (!cron.validate(expression)) {
      logger.error({ expression, name }, "invalid cron expression — skipped");
      return null;
    }
    try {
      const task = cron.schedule(
        expression,
        async () => {
          try {
            await fn();
          } catch (err) {
            cronState.lastError = err?.message || String(err);
            logger.error(
              { err: cronState.lastError, name },
              "cron job threw"
            );
          }
        },
        { timezone: TZ, name }
      );
      logger.info({ expression, name, timezone: TZ }, "cron job scheduled");
      return task;
    } catch (err) {
      logger.error(
        { err: err?.message || err, expression, name },
        "failed to schedule cron job"
      );
      return null;
    }
  }

  const healthJob = safeSchedule(healthExpr, "wa-health", runHealthCheck);
  if (healthJob) jobs.push(healthJob);

  const presenceJob = safeSchedule(presenceExpr, "wa-presence", runPresencePoke);
  if (presenceJob) jobs.push(presenceJob);

  const pingJob = safeSchedule(pingExpr, "http-keepalive", runKeepAlivePing);
  if (pingJob) jobs.push(pingJob);

  // Belt-and-suspenders: setInterval keep-alive in case the scheduler stalls.
  // Runs less often than cron but guarantees the process stays active.
  const intervalMs = Number(process.env.BOT_KEEPALIVE_INTERVAL_MS || 5 * 60 * 1000);
  const keepaliveInterval = setInterval(() => {
    runHealthCheck().catch(() => {});
    runKeepAlivePing().catch(() => {});
  }, intervalMs);
  if (typeof keepaliveInterval.unref === "function") {
    // Do NOT unref — we want the process to stay alive with this timer.
  }
  intervals.push(keepaliveInterval);
  logger.info({ intervalMs }, "setInterval keep-alive armed");

  // Kick once shortly after boot so we don't wait for the first cron tick.
  setTimeout(() => {
    runHealthCheck().catch(() => {});
    runPresencePoke().catch(() => {});
    runKeepAlivePing().catch(() => {});
  }, 15_000);

  // Optional daily broadcast
  const broadcastJid = process.env.BOT_CRON_BROADCAST_JID?.trim();
  if (broadcastJid) {
    const schedule = process.env.BOT_CRON_BROADCAST_SCHEDULE || "0 9 * * *";
    const broadcastJob = safeSchedule(schedule, "broadcast", async () => {
      const sock = getSock();
      if (!sock || getStatus() !== "open") return;
      const text =
        process.env.BOT_CRON_BROADCAST_TEXT ||
        "Good morning from Trade Square Marketplace · Kwekwe. Tell me what you need, or say *menu* for shops.";
      try {
        await sock.sendMessage(broadcastJid, { text });
        logger.info({ broadcastJid }, "cron broadcast sent");
      } catch (err) {
        cronState.lastError = err?.message || String(err);
        logger.error({ err: cronState.lastError }, "cron broadcast failed");
      }
    });
    if (broadcastJob) jobs.push(broadcastJob);
    logger.info({ schedule, broadcastJid }, "cron broadcast enabled");
  }

  cronState.jobCount = jobs.length;
  logger.info(
    { jobs: cronState.jobCount, timezone: TZ },
    "cron: keep-alive jobs started"
  );

  return () => {
    jobs.forEach((j) => {
      try {
        j.stop();
      } catch {
        /* ignore */
      }
    });
    intervals.forEach((id) => clearInterval(id));
  };
}

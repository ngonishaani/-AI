import cron from "node-cron";

/**
 * Keep-alive cron — tuned to avoid WhatsApp spam signals.
 * - HTTP self-ping only (no WhatsApp traffic)
 * - Occasional reconnect check
 * - Presence poke OFF by default (enable BOT_PRESENCE_POKE=1)
 * - Broadcast OFF unless BOT_CRON_BROADCAST_ENABLED=1
 */
export function startCronJobs({ getSock, getStatus, reconnect, logger }) {
  const jobs = [];
  const healthUrl = resolveHealthUrl();

  // Every 5 minutes: connection health + gentle reconnect
  jobs.push(
    cron.schedule(
      process.env.BOT_CRON_HEALTH || "*/5 * * * *",
      async () => {
        const status = getStatus();
        logger.info(
          { status, at: new Date().toISOString() },
          "cron health check"
        );
        if (status !== "open") {
          logger.warn("WhatsApp socket not open — triggering reconnect");
          try {
            await reconnect();
          } catch (err) {
            logger.error({ err: err?.message || err }, "cron reconnect failed");
          }
        }
      },
      { timezone: "Africa/Harare" }
    )
  );

  // Every 4 minutes: hit our own /health (does not touch WhatsApp)
  jobs.push(
    cron.schedule(
      process.env.BOT_CRON_PING || "*/4 * * * *",
      async () => {
        if (!healthUrl) return;
        try {
          const res = await fetch(healthUrl, {
            method: "GET",
            headers: { "user-agent": "trade-square-bot-self-keepalive/1.0" },
          });
          if (!res.ok) {
            logger.warn(
              { status: res.status, healthUrl },
              "cron keep-alive ping failed"
            );
            return;
          }
          logger.debug({ status: res.status, healthUrl }, "cron keep-alive ping ok");
        } catch (err) {
          logger.warn(
            { err: err?.message || err, healthUrl },
            "cron keep-alive ping error"
          );
        }
      },
      { timezone: "Africa/Harare" }
    )
  );

  // Presence poke is optional — frequent "available" looks automated
  if (process.env.BOT_PRESENCE_POKE === "1") {
    jobs.push(
      cron.schedule(
        process.env.BOT_CRON_PRESENCE || "0 */2 * * *",
        async () => {
          const sock = getSock();
          if (!sock || getStatus() !== "open") return;
          try {
            await sock.sendPresenceUpdate("available");
            logger.info("cron presence poke sent");
          } catch (err) {
            logger.warn(
              { err: err?.message || err },
              "cron presence poke failed"
            );
          }
        },
        { timezone: "Africa/Harare" }
      )
    );
  } else {
    logger.info("cron presence poke disabled (set BOT_PRESENCE_POKE=1 to enable)");
  }

  // Broadcast only when explicitly enabled — cold/bulk texts get accounts flagged
  const broadcastEnabled = process.env.BOT_CRON_BROADCAST_ENABLED === "1";
  const broadcastJid = process.env.BOT_CRON_BROADCAST_JID?.trim();
  if (broadcastEnabled && broadcastJid) {
    const schedule = process.env.BOT_CRON_BROADCAST_SCHEDULE || "0 9 * * *";
    jobs.push(
      cron.schedule(
        schedule,
        async () => {
          const sock = getSock();
          if (!sock || getStatus() !== "open") return;
          const text =
            process.env.BOT_CRON_BROADCAST_TEXT ||
            "Good morning from Trade Square Marketplace. Reply *menu* for shops.";
          try {
            await sock.sendMessage(broadcastJid, { text });
            logger.info({ broadcastJid }, "cron broadcast sent");
          } catch (err) {
            logger.error({ err: err?.message || err }, "cron broadcast failed");
          }
        },
        { timezone: "Africa/Harare" }
      )
    );
    logger.info({ schedule, broadcastJid }, "cron broadcast enabled");
  } else if (broadcastJid && !broadcastEnabled) {
    logger.warn(
      "BOT_CRON_BROADCAST_JID set but broadcast disabled — set BOT_CRON_BROADCAST_ENABLED=1 only if you accept ban risk"
    );
  }

  logger.info(
    { jobs: jobs.length, healthUrl: healthUrl || null },
    "cron: keep-alive started"
  );
  return () => jobs.forEach((j) => j.stop());
}

function resolveHealthUrl() {
  const explicit =
    process.env.KEEP_ALIVE_URL?.trim() ||
    process.env.BOT_HEALTH_URL?.trim() ||
    "";
  if (explicit) return explicit;

  const base =
    process.env.BOT_PUBLIC_URL?.trim() ||
    process.env.RENDER_EXTERNAL_URL?.trim() ||
    "";
  if (base) return `${base.replace(/\/$/, "")}/health`;

  if (process.env.NODE_ENV === "production" || process.env.RENDER) {
    return "https://ai-mallbot.onrender.com/health";
  }
  return "";
}

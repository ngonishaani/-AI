import cron from "node-cron";

/**
 * Cron jobs that keep the Baileys session alive on Render:
 *   - frequent WhatsApp health + reconnect
 *   - HTTP self-ping so the web process stays warm
 *   - presence poke so the linked device session stays active
 *   - optional daily broadcast
 *
 * Schedules use Africa/Harare (Zimbabwe).
 */
export function startCronJobs({ getSock, getStatus, reconnect, logger }) {
  const jobs = [];
  const healthUrl = resolveHealthUrl();

  // Every 2 minutes: connection health + reconnect if the socket dropped.
  jobs.push(
    cron.schedule(
      "*/2 * * * *",
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

  // Every 3 minutes: hit our own /health so hosts that idle inactive
  // HTTP services (e.g. Render free) keep this process awake.
  jobs.push(
    cron.schedule(
      "*/3 * * * *",
      async () => {
        if (!healthUrl) return;
        try {
          const res = await fetch(healthUrl, {
            method: "GET",
            headers: { "user-agent": "trade-square-bot-self-keepalive/1.0" },
          });
          const text = (await res.text()).slice(0, 40);
          if (!res.ok) {
            logger.warn(
              { status: res.status, text, healthUrl },
              "cron keep-alive ping failed"
            );
            return;
          }
          logger.info(
            { status: res.status, healthUrl },
            "cron keep-alive ping ok"
          );
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

  // Every 15 minutes: presence poke so the WhatsApp session stays warm.
  jobs.push(
    cron.schedule(
      "*/15 * * * *",
      async () => {
        const sock = getSock();
        if (!sock || getStatus() !== "open") return;
        try {
          await sock.sendPresenceUpdate("available");
          logger.info("cron presence poke sent");
        } catch (err) {
          logger.warn({ err: err?.message || err }, "cron presence poke failed");
        }
      },
      { timezone: "Africa/Harare" }
    )
  );

  // Optional daily mall hours broadcast to BOT_CRON_BROADCAST_JID (disabled unless set).
  const broadcastJid = process.env.BOT_CRON_BROADCAST_JID?.trim();
  if (broadcastJid) {
    const schedule = process.env.BOT_CRON_BROADCAST_SCHEDULE || "0 9 * * *";
    jobs.push(
      cron.schedule(
        schedule,
        async () => {
          const sock = getSock();
          if (!sock || getStatus() !== "open") return;
          const text =
            process.env.BOT_CRON_BROADCAST_TEXT ||
            "Good morning from Trade Square Mall · Kwekwe. Ask me about shops, dining, hours, or leasing space.";
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

  // Last resort for the known production service
  if (process.env.NODE_ENV === "production" || process.env.RENDER) {
    return "https://ai-mallbot.onrender.com/health";
  }
  return "";
}

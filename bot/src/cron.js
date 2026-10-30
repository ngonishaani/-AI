import cron from "node-cron";

/**
 * Cron jobs that keep the Baileys session healthy and optionally
 * push mall reminders. All schedules use Africa/Harare (Zimbabwe).
 */
export function startCronJobs({ getSock, getStatus, reconnect, logger }) {
  const jobs = [];

  // Every 5 minutes: connection health + reconnect if the socket dropped.
  jobs.push(
    cron.schedule(
      "*/5 * * * *",
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

  // Every hour on the hour: lightweight presence poke so the session stays warm.
  jobs.push(
    cron.schedule(
      "0 * * * *",
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

  logger.info(`cron: started ${jobs.length} job(s)`);
  return () => jobs.forEach((j) => j.stop());
}

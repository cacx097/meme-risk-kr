// Entry: web always; bot and alerts when TELEGRAM_BOT_TOKEN is set.
// Env: TELEGRAM_BOT_TOKEN, BOT_USERNAME, PORT (default 8787), WEB_BASE (public URL for links), DATA_FILE.
import { run } from "@grammyjs/runner";
import { startAlerts } from "./alerts.js";
import { createBot } from "./bot.js";
import { Inflight } from "./inflight.js";
import { Store } from "./store.js";
import { startWeb } from "./web.js";

const port = Number(process.env.PORT ?? 8787);
// Without a public WEB_BASE, bot messages carry no "자세히 보기" link (localhost is useless to other users).
const webBase = process.env.WEB_BASE || undefined;
const store = new Store(process.env.DATA_FILE ?? "data/state.json");
const s = store.state;
console.log(`state: users ${s.users.length}, groups ${s.groups.length}, checks ${s.checks}, alert subs ${Object.keys(s.alerts).length}`);

startWeb(port, store, process.env.BOT_USERNAME);
console.log(`web: http://localhost:${port}${webBase ? ` (public ${webBase})` : ""}`);

const token = process.env.TELEGRAM_BOT_TOKEN;
if (token) {
  const jobs = new Inflight();
  const bot = createBot(token, store, webBase, jobs);
  startAlerts(store, async (chatId, html) => {
    await bot.api.sendMessage(chatId, html, { parse_mode: "HTML", link_preview_options: { is_disabled: true } });
  }, webBase, jobs);
  // The runner handles updates concurrently, so one slow API call does not hold up every other chat.
  await bot.init();
  const runner = run(bot);
  console.log(`bot: @${bot.botInfo.username}`);
  // Servers stop the old copy with SIGTERM on each deploy (Railway: set RAILWAY_DEPLOYMENT_DRAINING_SECONDS
  // so there is time). Save at once in case we are killed early, stop taking updates, let running
  // replies and alert rounds finish, then save again.
  const DRAIN_MS = 8_000;
  for (const sig of ["SIGTERM", "SIGINT"] as const) {
    process.once(sig, async () => {
      store.flush();
      await runner.stop().catch(() => {});
      if (!(await jobs.close(DRAIN_MS))) console.error("shutdown: work still running after drain, saving anyway");
      store.flush();
      process.exit(0);
    });
  }
} else {
  console.log("bot: TELEGRAM_BOT_TOKEN not set, web only");
}

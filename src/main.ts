// Entry: web always; bot and alerts when TELEGRAM_BOT_TOKEN is set.
// Env: TELEGRAM_BOT_TOKEN, BOT_USERNAME, PORT (default 8787), WEB_BASE (public URL for links), DATA_FILE.
import { startAlerts } from "./alerts.js";
import { createBot } from "./bot.js";
import { Store } from "./store.js";
import { startWeb } from "./web.js";

const port = Number(process.env.PORT ?? 8787);
// Without a public WEB_BASE, bot messages carry no "자세히 보기" link (localhost is useless to other users).
const webBase = process.env.WEB_BASE || undefined;
const store = new Store(process.env.DATA_FILE ?? "data/state.json");

startWeb(port, store, process.env.BOT_USERNAME);
console.log(`web: http://localhost:${port}${webBase ? ` (public ${webBase})` : ""}`);

const token = process.env.TELEGRAM_BOT_TOKEN;
if (token) {
  const bot = createBot(token, store, webBase);
  startAlerts(store, async (chatId, html) => {
    await bot.api.sendMessage(chatId, html, { parse_mode: "HTML", link_preview_options: { is_disabled: true } });
  }, webBase);
  bot.start({ onStart: (me) => console.log(`bot: @${me.username}`) });
} else {
  console.log("bot: TELEGRAM_BOT_TOKEN not set, web only");
}

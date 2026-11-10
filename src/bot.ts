// Telegram bot: address in any message -> short Korean risk summary.
import { Bot, type Context } from "grammy";
import { analyze, findAddress, isEvm } from "./analyze.js";
import { ApiError } from "./chains/montra.js";
import { DISCLAIMER, telegramSummary } from "./format.js";
import { addrKey, type AlertSub, type Store } from "./store.js";

export const HELP = [
  "<b>밈코인 위험 점수 봇</b> (Elysium · Solana)",
  "",
  "토큰 주소를 보내면 위험 신호를 요약해 드립니다. 그룹에 넣어두면 누가 주소를 올릴 때 자동으로 답합니다.",
  "",
  "/check 주소 — 위험 점수 보기",
  "/watch 주소 — 위험 등급이 나빠지면 알림",
  "/unwatch 주소 — 알림 끄기",
  "/alerts 50000 — 시총 $50K를 넘은 Elysium 새 토큰 알림 받기 (/alerts off 로 끄기)",
  "",
  `<i>${DISCLAIMER}</i>`,
].join("\n");

const REPLY = { parse_mode: "HTML" as const, link_preview_options: { is_disabled: true } };

export function errorMessage(e: unknown, address = ""): string {
  if (e instanceof ApiError && e.status === 404)
    return isEvm(address)
      ? "Montra(Elysium)에서 찾을 수 없는 토큰 주소입니다. Base는 곧 지원 예정입니다."
      : "Solana에서 찾을 수 없는 토큰 주소입니다. 지갑 주소가 아니라 토큰 주소인지 확인해 주세요.";
  return "데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.";
}

export function parseAlertArg(arg: string): AlertSub | "off" | null {
  const a = arg.trim().toLowerCase();
  if (a === "off") return "off";
  const n = Number(a.replace(/[$,k]/g, "")) * (a.endsWith("k") ? 1000 : 1);
  if (!a) return { minMcapUsd: 50_000, maxLevel: "caution" };
  return Number.isFinite(n) && n >= 5_000 ? { minMcapUsd: n, maxLevel: "caution" } : null;
}

export function createBot(token: string, store: Store, webBase?: string) {
  const bot = new Bot(token);
  const isGroup = (ctx: Context) => ctx.chat?.type === "group" || ctx.chat?.type === "supergroup";

  bot.use(async (ctx, next) => {
    if (ctx.chat) store.touchChat(ctx.chat.id, isGroup(ctx));
    await next();
  });

  // quiet: auto-detected addresses in groups stay silent on errors (wallets, other chains)
  async function check(ctx: Context, address: string, quiet = false) {
    try {
      const report = await analyze(address);
      store.countCheck();
      store.state.lastLevel[addrKey(address)] = report.level;
      await ctx.reply(telegramSummary(report, webBase), { ...REPLY, reply_parameters: { message_id: ctx.msg!.message_id } });
    } catch (e) {
      if (!quiet) await ctx.reply(errorMessage(e, address), { reply_parameters: { message_id: ctx.msg!.message_id } });
    }
  }

  bot.command(["start", "help"], (ctx) => ctx.reply(HELP, REPLY));

  bot.command("check", async (ctx) => {
    const a = findAddress(ctx.match);
    if (!a) return ctx.reply("사용법: /check 토큰주소 (Elysium 0x... 또는 Solana)");
    await check(ctx, a);
  });

  bot.command("watch", async (ctx) => {
    const a = findAddress(ctx.match);
    if (!a) return ctx.reply("사용법: /watch 토큰주소");
    const ok = store.watch(ctx.chat.id, a);
    await ctx.reply(ok ? "지켜보기 시작했습니다. 위험 등급이 나빠지면 알려 드릴게요." : "이미 등록됐거나 20개 한도를 넘었습니다.");
  });

  bot.command("unwatch", async (ctx) => {
    const a = findAddress(ctx.match);
    if (!a) return ctx.reply("사용법: /unwatch 토큰주소");
    store.unwatch(ctx.chat.id, a);
    await ctx.reply("알림을 껐습니다.");
  });

  bot.command("alerts", async (ctx) => {
    const sub = parseAlertArg(ctx.match);
    if (sub === null) return ctx.reply("사용법: /alerts 50000 (최소 시총, 5000 이상) 또는 /alerts off");
    if (sub === "off") delete store.state.alerts[ctx.chat.id];
    else store.state.alerts[ctx.chat.id] = sub;
    store.save();
    await ctx.reply(sub === "off" ? "새 토큰 알림을 껐습니다." : `시총 $${sub.minMcapUsd.toLocaleString()} 이상이 된 토큰을 위험 점수와 함께 알려 드릴게요.`);
  });

  // Any text with an address (private chats, or groups where the bot can read messages)
  bot.on("message:text", async (ctx) => {
    if (ctx.msg.text.startsWith("/")) return;
    const a = findAddress(ctx.msg.text);
    if (a) await check(ctx, a, isGroup(ctx));
    else if (!isGroup(ctx)) await ctx.reply("토큰 주소를 보내 주세요 (Elysium 0x... 또는 Solana). /help 로 사용법을 볼 수 있습니다.");
  });

  bot.catch((err) => console.error("bot error", err.message));
  return bot;
}

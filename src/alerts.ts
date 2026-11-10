// Background loops: new-token alerts and watchlist level changes.
import { analyze } from "./analyze.js";
import { montra, type MontraToken } from "./chains/montra.js";
import { telegramSummary } from "./format.js";
import { Inflight } from "./inflight.js";
import type { Report } from "./score.js";
import type { AlertSub, Store } from "./store.js";

type Send = (chatId: string, html: string) => Promise<void>;

const LEVEL_RANK: Record<Report["level"], number> = { low: 0, caution: 1, high: 2 };

/** Tokens that crossed some subscriber's market-cap line and were not announced yet. */
export function candidates(tokens: MontraToken[], subs: AlertSub[], alerted: Set<string>, now: number): MontraToken[] {
  if (!subs.length) return [];
  const minLine = Math.min(...subs.map((s) => s.minMcapUsd));
  return tokens.filter(
    (t) => t.marketCapUsd >= minLine && now - t.launchedAt < MAX_AGE_MS && !alerted.has(t.address.toLowerCase()),
  );
}
const MAX_AGE_MS = 48 * 3600_000;

export function wants(sub: AlertSub, r: Report): boolean {
  return r.marketCapUsd >= sub.minMcapUsd && LEVEL_RANK[r.level] <= LEVEL_RANK[sub.maxLevel];
}

export function worsened(prev: string | undefined, r: Report): boolean {
  return prev !== undefined && prev in LEVEL_RANK && LEVEL_RANK[r.level] > LEVEL_RANK[prev as Report["level"]];
}

export function startAlerts(store: Store, send: Send, webBase?: string, jobs = new Inflight()) {
  async function newTokens() {
    const subs = Object.entries(store.state.alerts);
    if (!subs.length) return;
    // ~15 launches a minute, so "new" only covers minutes; trending catches tokens that just took off.
    const { tokens } = await montra.list("trending", 100);
    const fresh = candidates(tokens, subs.map(([, s]) => s), new Set(store.state.alerted), Date.now());
    for (const t of fresh.slice(0, 5)) {
      store.markAlerted(t.address);
      const r = await analyze(t.address);
      for (const [chatId, sub] of subs) {
        if (wants(sub, r)) await send(chatId, `🆕 시총 기준을 넘은 새 토큰\n\n${telegramSummary(r, webBase)}`).catch(() => {});
      }
    }
  }

  async function watchlist() {
    const byToken = new Map<string, string[]>();
    for (const [chatId, list] of Object.entries(store.state.watches))
      for (const a of list) byToken.set(a, [...(byToken.get(a) ?? []), chatId]);
    for (const [address, chats] of byToken) {
      const r = await analyze(address).catch(() => null); // one bad token must not stop the others
      if (!r) continue;
      const prev = store.state.lastLevel[address];
      store.state.lastLevel[address] = r.level;
      if (worsened(prev, r))
        for (const chatId of chats) await send(chatId, `⚠️ 지켜보는 토큰의 위험 등급이 나빠졌습니다\n\n${telegramSummary(r, webBase)}`).catch(() => {});
    }
    store.save();
  }

  // Each round runs inside `jobs` so shutdown waits for it; after shutdown starts, no new round begins.
  const loop = (fn: () => Promise<void>, ms: number) => {
    const run = () => {
      if (jobs.closed) return;
      jobs.run(fn).catch((e) => console.error("alert loop", (e as Error).message)).finally(() => setTimeout(run, ms));
    };
    setTimeout(run, 5_000);
  };
  loop(newTokens, 60_000);
  loop(watchlist, 180_000);
}

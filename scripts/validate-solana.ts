// Solana check: score real tokens older than 24h and compare those still alive (mcap >= $100K)
// with those that died (mcap < $10K). Flags that only restate the outcome (low liquidity, curve, new) are left out.
// Usage: npx tsx scripts/validate-solana.ts
import { analyze } from "../src/analyze.js";
import { solana } from "../src/chains/solana.js";
import { finish, type Report } from "../src/score.js";

const OUTCOME_FLAGS = new Set(["low-liq", "curve", "new", "lp-unlocked"]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const json = <T>(url: string) => fetch(url).then((r) => r.json() as Promise<T>);

const mints = new Set<string>();
const recent = await json<{ mint: string }[]>("https://api.rugcheck.xyz/v1/stats/recent");
const verified = await json<{ mint: string }[]>("https://api.rugcheck.xyz/v1/stats/verified");
const boosts = await json<{ chainId: string; tokenAddress: string }[]>("https://api.dexscreener.com/token-boosts/top/v1");
const fresh = await json<{ mint: string }[]>("https://api.rugcheck.xyz/v1/stats/new_tokens");
[...recent, ...verified].forEach((x) => mints.add(x.mint));
boosts.filter((x) => x.chainId === "solana").forEach((x) => mints.add(x.tokenAddress));
// Older launches by today's new creators: a fair source of dead tokens
for (const f of fresh.slice(0, 4)) {
  const rep = await solana.report(f.mint).catch(() => null);
  (rep?.creatorTokens ?? []).filter((t) => Date.now() - Date.parse(t.createdAt) > 48 * 3600_000).slice(0, 3).forEach((t) => mints.add(t.mint));
  await sleep(700);
}

const alive: Report[] = [];
const dead: Report[] = [];
let errors = 0;
for (const m of mints) {
  try {
    const r = await analyze(m);
    if (r.ageMinutes > 24 * 60) {
      if (r.marketCapUsd >= 100_000) alive.push(r);
      else if (r.marketCapUsd < 10_000) dead.push(r);
    }
  } catch (e) {
    errors++;
    console.log("error", m, (e as Error).message);
  }
  await sleep(700);
}

const fair = (r: Report) => finish(r.flags.filter((f) => !OUTCOME_FLAGS.has(f.id))).score;
const avg = (xs: Report[]) => (xs.length ? (xs.reduce((s, r) => s + fair(r), 0) / xs.length).toFixed(1) : "-");
for (const [label, xs] of [["alive", alive], ["dead", dead]] as const)
  for (const r of xs) console.log(label, r.token.symbol.padEnd(10), String(fair(r)).padStart(3), r.flags.filter((f) => !OUTCOME_FLAGS.has(f.id)).map((f) => f.id).join(","));
console.log(`checked ${mints.size}, errors ${errors}; alive n=${alive.length} avg ${avg(alive)}; dead n=${dead.length} avg ${avg(dead)}`);

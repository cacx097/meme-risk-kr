// Forward test: score tokens now, look at what happened to them later. No hindsight in the scores.
//   npx tsx scripts/forward-test.ts snap               -> saves validation/forward-<time>.json (commit it: the git date proves the scores came first)
//   npx tsx scripts/forward-test.ts eval <that file>   -> compares saved scores with today's market cap
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { analyze } from "../src/analyze.js";
import { ApiError, montra } from "../src/chains/montra.js";
import type { Report } from "../src/score.js";

interface Snap { address: string; chain: Report["chain"]; symbol: string; score: number; level: Report["level"]; flags: string[]; mcap: number; ageMinutes: number }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const json = <T>(url: string) => fetch(url).then((r) => r.json() as Promise<T>);
const [mode, file] = process.argv.slice(2);

if (mode === "snap") {
  const addrs = new Set<string>();
  const solNew = await json<{ mint: string }[]>("https://api.rugcheck.xyz/v1/stats/new_tokens").catch(() => []);
  const solRecent = await json<{ mint: string }[]>("https://api.rugcheck.xyz/v1/stats/recent").catch(() => []);
  const profiles = await json<{ chainId: string; tokenAddress: string }[]>("https://api.dexscreener.com/token-profiles/latest/v1").catch(() => []);
  [...solNew, ...solRecent].forEach((x) => addrs.add(x.mint));
  profiles.filter((x) => x.chainId === "solana").forEach((x) => addrs.add(x.tokenAddress));
  for (const sort of ["new", "trending"] as const) (await montra.list(sort, 40)).tokens.forEach((t) => addrs.add(t.address));

  const out: Snap[] = [];
  for (const a of addrs) {
    const r = await analyze(a).catch(() => null);
    if (r) out.push({ address: a, chain: r.chain, symbol: r.token.symbol, score: r.score, level: r.level, flags: r.flags.map((f) => f.id), mcap: r.marketCapUsd, ageMinutes: r.ageMinutes });
    await sleep(700);
  }
  mkdirSync("validation", { recursive: true });
  const path = `validation/forward-${new Date().toISOString().slice(0, 19).replace("T", "-").replace(/:/g, "")}.json`;
  writeFileSync(path, JSON.stringify({ at: Date.now(), tokens: out }, null, 1), { flag: "wx" }); // never replace an earlier snapshot
  console.log(`saved ${out.length} of ${addrs.size} tokens to ${path}`);
} else if (mode === "eval" && file) {
  const { at, tokens } = JSON.parse(readFileSync(file, "utf8")) as { at: number; tokens: Snap[] };
  console.log(`snapshot ${((Date.now() - at) / 3600_000).toFixed(1)}h ago, ${tokens.length} tokens`);
  // Market cap now. A 404 (token gone) counts as dead; other failures (429, timeouts) are retried and,
  // if still failing, left out of the numbers instead of being counted as dead.
  async function mcapNow(address: string): Promise<number | null> {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return (await analyze(address)).marketCapUsd;
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) return 0;
        await sleep(2_000 * (attempt + 1));
      }
    }
    return null;
  }
  const rows: (Snap & { now: number })[] = [];
  let unknown = 0;
  for (const t of tokens) {
    const now = await mcapNow(t.address);
    if (now === null) unknown++;
    else rows.push({ ...t, now });
    await sleep(700);
  }
  console.log(`could not look up ${unknown} tokens (left out)`);
  for (const chain of ["elysium", "solana"] as const) {
    const xs = rows.filter((r) => r.chain === chain);
    if (!xs.length) continue;
    const dead = (r: { now: number }) => r.now < 10_000;
    console.log(`\n${chain}: ${xs.length} tokens, ${xs.filter(dead).length} now under $10K`);
    for (const level of ["low", "caution", "high"] as const) {
      const g = xs.filter((r) => r.level === level);
      if (g.length) console.log(`  ${level.padEnd(7)} n=${String(g.length).padStart(3)}  dead ${((g.filter(dead).length / g.length) * 100).toFixed(0)}%`);
    }
    const avg = (g: typeof xs) => (g.length ? (g.reduce((s, r) => s + r.score, 0) / g.length).toFixed(1) : "-");
    const alive = xs.filter((r) => r.now >= 50_000);
    console.log(`  avg score at snapshot: alive(>=$50K) n=${alive.length} ${avg(alive)} · dead n=${xs.filter(dead).length} ${avg(xs.filter(dead))}`);
  }
} else {
  console.log("usage: forward-test.ts snap | eval <file>");
}

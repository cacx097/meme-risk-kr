// Base check: score real tokens (GeckoTerminal trending and newest pools) and show how the levels fall.
// Established = older than 24h with market cap >= $100K; dead = older than 24h under $10K; fresh = under 24h.
// Dead tokens rarely show up in public lists, so the fair comparison is the forward test (scripts/forward-test.ts).
// Slow on purpose: GoPlus allows about 10 calls a minute without a key.
// Usage: npx tsx scripts/validate-base.ts
import { analyze } from "../src/analyze.js";
import { finish, type Report } from "../src/score.js";

const OUTCOME_FLAGS = new Set(["low-liq", "new"]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
type GeckoPools = { data: { relationships: { base_token: { data: { id: string } } } }[] };

const addrs = new Set<string>();
for (const list of ["trending_pools?page=1", "trending_pools?page=2", "new_pools?page=1"]) {
  const pools = (await fetch(`https://api.geckoterminal.com/api/v2/networks/base/${list}`).then((r) => r.json())) as GeckoPools;
  pools.data.forEach((p) => addrs.add(p.relationships.base_token.data.id.replace("base_", "")));
  await sleep(1_000);
}

const groups: Record<string, Report[]> = { established: [], dead: [], fresh: [], other: [] };
let errors = 0;
for (const a of addrs) {
  try {
    const r = await analyze(a);
    if (r.chain !== "base") continue;
    const old = r.ageMinutes < 0 || r.ageMinutes > 24 * 60; // unknown age: listed by DexScreener without a date, treat as old
    groups[!old ? "fresh" : r.marketCapUsd >= 100_000 ? "established" : r.marketCapUsd < 10_000 ? "dead" : "other"].push(r);
  } catch (e) {
    errors++;
    console.log("error", a, (e as Error).message);
  }
  await sleep(7_000);
}

const fair = (r: Report) => finish(r.flags.filter((f) => !OUTCOME_FLAGS.has(f.id))).score;
for (const [label, xs] of Object.entries(groups)) {
  for (const r of xs) console.log(label.padEnd(11), r.token.symbol.slice(0, 10).padEnd(10), String(fair(r)).padStart(3), r.flags.filter((f) => !OUTCOME_FLAGS.has(f.id)).map((f) => f.id).join(","));
}
const avg = (xs: Report[]) => (xs.length ? (xs.reduce((s, r) => s + fair(r), 0) / xs.length).toFixed(1) : "-");
const unknown = Object.values(groups).flat().filter((r) => r.flags.some((f) => f.id === "unknown")).length;
console.log(`checked ${addrs.size}, errors ${errors}, with unchecked items ${unknown}; ` + Object.entries(groups).map(([k, xs]) => `${k} n=${xs.length} avg ${avg(xs)}`).join("; "));

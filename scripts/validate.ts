// Block 1 check: score real graduated tokens and compare "still alive" vs "fell back".
// The post-graduation-drop flag uses the outcome itself, so it is removed before comparing.
import { analyze } from "../src/analyze.js";
import { montra } from "../src/chains/montra.js";
import { scoreToken } from "../src/score.js";

const GRAD = 58_700;
const { tokens } = await montra.list("graduated", 100, "graduated");
const alive = tokens.filter((t) => t.marketCapUsd >= GRAD).slice(0, 10);
const dropped = tokens.filter((t) => t.marketCapUsd < GRAD).slice(0, 10);

let errors = 0;
async function scoreBlind(address: string): Promise<number | null> {
  try {
    const r = await analyze(address);
    const kept = r.flags.filter((f) => f.id !== "post-grad-drop");
    return kept.reduce((s, f) => s + ({ high: 30, mid: 15, low: 5, good: -10 } as const)[f.severity], 0);
  } catch (e) {
    errors++;
    console.error("error", address, (e as Error).message);
    return null;
  }
}

const result: Record<string, number[]> = { alive: [], dropped: [] };
for (const [group, list] of [["alive", alive], ["dropped", dropped]] as const) {
  for (const t of list) {
    const s = await scoreBlind(t.address);
    if (s !== null) result[group].push(Math.max(0, Math.min(100, s)));
    console.log(group.padEnd(8), t.symbol.slice(0, 12).padEnd(12), s);
  }
}
const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
console.log(`\nalive n=${result.alive.length} avg=${avg(result.alive).toFixed(1)}`);
console.log(`dropped n=${result.dropped.length} avg=${avg(result.dropped).toFixed(1)}`);
console.log(`errors=${errors}`);
void scoreToken;

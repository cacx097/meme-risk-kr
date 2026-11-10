// Gathers data for one token and scores it. The only place that talks to chain APIs.
import { montra } from "./chains/montra.js";
import { solana } from "./chains/solana.js";
import { scoreSolana } from "./score-solana.js";
import { scoreToken, type Report } from "./score.js";

export const EVM_ADDRESS = /0x[a-fA-F0-9]{40}/;
const BASE58 = /(?<![0-9A-Za-z])[1-9A-HJ-NP-Za-km-z]{32,44}(?![0-9A-Za-z])/g;

/** First token address in a text: 0x... (Elysium) or a Solana mint. Plain words are skipped. */
export function findAddress(text: string): string | null {
  const evm = text.match(EVM_ADDRESS);
  if (evm) return evm[0];
  for (const m of text.matchAll(BASE58)) if (/\d/.test(m[0]) && /[a-z]/.test(m[0]) && /[A-Z]/.test(m[0])) return m[0];
  return null;
}

export const isEvm = (address: string) => /^0x[a-fA-F0-9]{40}$/.test(address);

export async function analyze(address: string, now = Date.now()): Promise<Report> {
  if (!isEvm(address)) {
    const [report, pairs] = await Promise.all([solana.report(address), solana.pairs(address).catch(() => [])]);
    return scoreSolana({ report, pairs, now });
  }
  const token = await montra.token(address);
  const [holders, launches, sameName] = await Promise.all([
    montra.holders(address).catch(() => null),
    montra.launchesBy(token.creator).catch(() => ({ tokens: [] })),
    montra.searchByName(token.name).catch(() => ({ tokens: [] })),
  ]);
  return scoreToken({ token, holders, creatorLaunches: launches.tokens, sameName: sameName.tokens, now });
}

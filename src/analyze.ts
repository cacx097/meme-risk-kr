// Gathers data for one token and scores it. The only place that talks to chain APIs.
import { base } from "./chains/base.js";
import { ApiError, montra, type MontraToken } from "./chains/montra.js";
import { solana } from "./chains/solana.js";
import { scoreBase } from "./score-base.js";
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

async function analyzeBase(address: string, now: number): Promise<Report> {
  // A token nobody can trade has no pool. Checking that first also keeps wallet addresses
  // pasted in groups from using up the small GoPlus allowance.
  // If DexScreener itself fails, the error goes up as "try again later" instead of a report without market data.
  const pairs = await base.pairs(address);
  if (!pairs.length) throw new ApiError("no Base pool", 404);
  const [security, honeypot] = await Promise.all([base.security(address).catch(() => null), base.honeypot(address).catch(() => null)]);
  return scoreBase({ address, security, honeypot, pairs, now });
}

export async function analyze(address: string, now = Date.now()): Promise<Report> {
  if (!isEvm(address)) {
    const [report, pairs] = await Promise.all([solana.report(address), solana.pairs(address).catch(() => [])]);
    return scoreSolana({ report, pairs, now });
  }
  // 0x addresses look the same on Elysium and Base: ask Montra first, fall back to Base.
  let token: MontraToken;
  try {
    token = await montra.token(address);
  } catch (montraError) {
    try {
      return await analyzeBase(address, now);
    } catch (baseError) {
      // Not on Base either: if Montra itself was down, say "try again" rather than "not found".
      const notOnBase = baseError instanceof ApiError && baseError.status === 404;
      const notOnMontra = montraError instanceof ApiError && montraError.status === 404;
      throw notOnBase && !notOnMontra ? montraError : baseError;
    }
  }
  const [holders, launches, sameName] = await Promise.all([
    montra.holders(address).catch(() => null),
    montra.launchesBy(token.creator).catch(() => ({ tokens: [] })),
    montra.searchByName(token.name).catch(() => ({ tokens: [] })),
  ]);
  return scoreToken({ token, holders, creatorLaunches: launches.tokens, sameName: sameName.tokens, now });
}

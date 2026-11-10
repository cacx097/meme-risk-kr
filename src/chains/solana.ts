// Solana data: RugCheck (token safety report, no key) + DexScreener (price, volume, age).
import { ApiError, remember } from "./montra.js";

export interface RugReport {
  mint: string;
  creator: string | null;
  creatorBalance: number; // raw units
  mintAuthority: string | null;
  freezeAuthority: string | null;
  token: { supply: number; decimals: number } | null;
  tokenMeta: { name: string; symbol: string; mutable: boolean } | null;
  transferFee?: { pct: number } | null;
  topHolders: { address: string; owner: string; pct: number }[] | null;
  knownAccounts: Record<string, { name: string; type: string }> | null;
  markets: { marketType: string; lp: { lpLockedPct: number; lpLockedUSD: number } | null }[] | null;
  risks: { name: string; level: string; value: string }[] | null;
  creatorTokens: { mint: string; marketCap: number; createdAt: string }[] | null;
  totalHolders: number;
  totalMarketLiquidity: number;
  rugged: boolean;
  launchpad: { platform: string } | null;
  detectedAt: string;
  price: number;
}

export interface DexPair {
  dexId: string;
  url: string;
  marketCap?: number;
  fdv?: number;
  liquidity?: { usd: number };
  volume?: { h24: number };
  pairCreatedAt?: number;
  baseToken: { address: string; name: string; symbol: string };
}

const TTL_MS = 20_000;
const cache = new Map<string, { at: number; value: unknown }>();

async function get<T>(url: string, label: string): Promise<T> {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value as T;
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(10_000) });
    if (res.status === 429 && attempt === 0) {
      await new Promise((r) => setTimeout(r, 1_000));
      continue;
    }
    // RugCheck answers 400 for strings that are not a token mint (wallets etc.): treat as not found.
    if (!res.ok) throw new ApiError(`${label} ${res.status}`, res.status === 400 ? 404 : res.status);
    const value = (await res.json()) as T;
    remember(cache, url, value);
    return value;
  }
}

export const solana = {
  report: (mint: string) => get<RugReport>(`https://api.rugcheck.xyz/v1/tokens/${mint}/report`, "RugCheck"),
  pairs: (mint: string) => get<DexPair[]>(`https://api.dexscreener.com/tokens/v1/solana/${mint}`, "DexScreener"),
};

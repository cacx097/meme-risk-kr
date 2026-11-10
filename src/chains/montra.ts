// Montra (Elysium launchpad) public read-only API client.
// Docs: https://montramarkets.xyz/llms-full.txt — no key, rate limited (429).

const BASE = process.env.MONTRA_API ?? "https://api.montramarkets.xyz/api";
const TTL_MS = 20_000;

export interface MontraToken {
  address: string;
  name: string;
  symbol: string;
  creator: string;
  marketCapUsd: number;
  volume24hUsd: number;
  holders: number;
  swaps: number;
  launchedAt: number;
  lastTradeAt: number | null;
  totalFeePips: number;
  recipient: string;
  recipientKind: string;
  liquiditySealed: boolean;
  graduation: { stage: string; progressBps: number; graduatedAt: number | null };
  montra: string | null;
  pool?: { feeFixed?: boolean; feeLocked?: boolean; earlyBuyFeeStartPips?: number; earlyBuyFeeUntil?: number };
  live?: { buyFee?: number };
  stats?: { buys: number; sells: number };
}

export interface MontraHolders {
  count: number;
  top10Pct: number;
  inPoolPct: number;
  creatorPct: number;
}

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

const cache = new Map<string, { at: number; value: unknown }>();

async function get<T>(path: string): Promise<T> {
  const hit = cache.get(path);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value as T;

  for (let attempt = 0; ; attempt++) {
    const res = await fetch(BASE + path, { signal: AbortSignal.timeout(8_000) });
    if (res.status === 429 && attempt === 0) {
      await new Promise((r) => setTimeout(r, 1_000));
      continue;
    }
    if (!res.ok) throw new ApiError(`Montra API ${res.status} for ${path}`, res.status);
    const value = (await res.json()) as T;
    cache.set(path, { at: Date.now(), value });
    return value;
  }
}

export const montra = {
  token: (address: string) => get<MontraToken>(`/tokens/${address.toLowerCase()}`),
  holders: (address: string) => get<MontraHolders>(`/tokens/${address.toLowerCase()}/holders`),
  launchesBy: (wallet: string) =>
    get<{ tokens: MontraToken[]; total: number }>(`/wallets/${wallet.toLowerCase()}/launches`),
  searchByName: (name: string) =>
    get<{ tokens: MontraToken[]; total: number }>(`/tokens?search=${encodeURIComponent(name)}&limit=50`),
  list: (sort: "new" | "volume" | "graduated", limit = 50, stage?: string) =>
    get<{ tokens: MontraToken[]; total: number }>(
      `/tokens?sort=${sort}&limit=${limit}${stage ? `&stage=${stage}` : ""}`,
    ),
  stats: () =>
    get<{ tokensLaunched: number; launched24h: number; holders: number; volume24hUsd: number }>(`/stats`),
};

// Base data, all without a key: GoPlus (contract permissions, holders, LP), Honeypot.is (buy/sell simulation),
// DexScreener (price, volume, age). GoPlus allows about 10 calls a minute without a key, so its answers are kept longer.
import { ApiError } from "./montra.js";
import { getJson, type DexPair } from "./solana.js";

const CHAIN_ID = 8453;

/** GoPlus token_security record. Values are strings; "" or a missing key means "not known yet". */
export interface GoPlusToken {
  token_name?: string;
  token_symbol?: string;
  holder_count?: string;
  is_open_source?: string;
  is_proxy?: string;
  is_mintable?: string;
  is_honeypot?: string;
  cannot_sell_all?: string;
  buy_tax?: string; // fraction, "0.05" = 5%
  sell_tax?: string;
  transfer_tax?: string;
  slippage_modifiable?: string;
  personal_slippage_modifiable?: string;
  transfer_pausable?: string;
  is_blacklisted?: string;
  hidden_owner?: string;
  can_take_back_ownership?: string;
  selfdestruct?: string;
  honeypot_with_same_creator?: string;
  owner_address?: string;
  owner_percent?: string; // fraction
  creator_address?: string;
  creator_percent?: string;
  holders?: { address: string; percent: string; is_contract: number; is_locked: number }[];
  lp_holders?: { address: string; percent: string; is_locked: number; is_contract?: number }[];
}

export interface HoneypotCheck {
  simulationSuccess?: boolean;
  honeypotResult?: { isHoneypot: boolean };
  simulationResult?: { buyTax: number; sellTax: number; transferTax: number }; // percent
}

interface GoPlusResponse {
  code: number; // 1 ok, 4029 too many requests; other codes can still carry partial data
  message: string;
  result?: Record<string, GoPlusToken>;
}

export const base = {
  pairs: (address: string) => getJson<DexPair[]>(`https://api.dexscreener.com/tokens/v1/base/${address}`, "DexScreener"),
  /** null when GoPlus has no record for the address (wallets, unknown contracts). */
  security: async (address: string): Promise<GoPlusToken | null> => {
    const r = await getJson<GoPlusResponse>(
      `https://api.gopluslabs.io/api/v1/token_security/${CHAIN_ID}?contract_addresses=${address.toLowerCase()}`,
      "GoPlus",
      {
        ttl: 180_000,
        check: (v) => {
          if (v.code === 4029) throw new ApiError("GoPlus rate limit", 429);
        },
      },
    );
    return Object.values(r.result ?? {})[0] ?? null;
  },
  honeypot: (address: string) =>
    getJson<HoneypotCheck>(`https://api.honeypot.is/v2/IsHoneypot?address=${address}&chainID=${CHAIN_ID}`, "Honeypot.is", { ttl: 120_000 }),
};

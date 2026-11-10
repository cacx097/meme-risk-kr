import { describe, expect, it } from "vitest";
import { findAddress } from "../src/analyze.js";
import type { DexPair, RugReport } from "../src/chains/solana.js";
import { scoreSolana } from "../src/score-solana.js";
import { addrKey } from "../src/store.js";

const NOW = 1_794_300_000_000;
const H = 3600_000;
const MINT = "CbaC5NYsYvx3vtG49h8dJWf8vDxpLcqeZgKzHYYTpump";

function rep(over: Partial<RugReport> = {}): RugReport {
  return {
    mint: MINT,
    creator: "AyYH3TX5T3TqDD8CMo9TKBU8c2RRT79xsoyxYGSR7x7D",
    creatorBalance: 0,
    mintAuthority: null,
    freezeAuthority: null,
    token: { supply: 1e15, decimals: 6 },
    tokenMeta: { name: "Cat", symbol: "CAT", mutable: false },
    transferFee: { pct: 0 },
    topHolders: [],
    knownAccounts: {},
    markets: [{ marketType: "pump_amm", lp: { lpLockedPct: 100, lpLockedUSD: 50_000 } }],
    risks: [],
    creatorTokens: [],
    totalHolders: 2_000,
    totalMarketLiquidity: 50_000,
    rugged: false,
    launchpad: null,
    detectedAt: new Date(NOW - 72 * H).toISOString(),
    price: 0,
    ...over,
  };
}
const pair = (over: Partial<DexPair> = {}): DexPair => ({
  dexId: "pumpswap",
  url: "",
  marketCap: 500_000,
  liquidity: { usd: 50_000 },
  volume: { h24: 100_000 },
  pairCreatedAt: NOW - 72 * H,
  baseToken: { address: MINT, name: "Cat", symbol: "CAT" },
  ...over,
});
const ids = (r: ReturnType<typeof scoreSolana>) => r.flags.map((f) => f.id);

describe("scoreSolana", () => {
  it("clean graduated token has few signals", () => {
    const r = scoreSolana({ report: rep(), pairs: [pair()], now: NOW });
    expect(r.level).toBe("low");
    expect(r.flags).toHaveLength(0);
    expect(r.chain).toBe("solana");
  });

  it("mint and freeze authority are high risk", () => {
    const r = scoreSolana({ report: rep({ mintAuthority: "x", freezeAuthority: "y" }), pairs: [pair()], now: NOW });
    expect(r.level).toBe("high");
    expect(ids(r)).toEqual(expect.arrayContaining(["mint-auth", "freeze-auth"]));
  });

  it("pool accounts do not count as holder concentration", () => {
    const r = scoreSolana({
      report: rep({
        topHolders: [
          { address: "pool", owner: "ammOwner", pct: 60 },
          { address: "a", owner: "a", pct: 5 },
        ],
        knownAccounts: { ammOwner: { name: "Pump Fun AMM", type: "AMM" } },
      }),
      pairs: [pair()],
      now: NOW,
    });
    expect(ids(r)).not.toContain("top10");
  });

  it("serial creator with dead launches is flagged, young ones are not counted", () => {
    const old = [1, 2, 3, 4, 5].map((i) => ({ mint: `m${i}`, marketCap: 2_500, createdAt: new Date(NOW - 30 * H).toISOString() }));
    const young = [6, 7].map((i) => ({ mint: `m${i}`, marketCap: 2_500, createdAt: new Date(NOW - H).toISOString() }));
    const r = scoreSolana({ report: rep({ creatorTokens: [...old, ...young] }), pairs: [pair()], now: NOW });
    expect(r.flags.find((f) => f.id === "serial")?.severity).toBe("high");
    expect(r.creatorHistory).toEqual({ launches: 7, failed: 5, graduated: 0 });
  });

  it("bonding-curve tokens are not judged on pool liquidity", () => {
    const r = scoreSolana({ report: rep({ markets: [{ marketType: "pump_fun", lp: null }], totalMarketLiquidity: 3_000 }), pairs: [pair({ dexId: "pumpfun", liquidity: undefined })], now: NOW });
    expect(ids(r)).toContain("curve");
    expect(ids(r)).not.toContain("low-liq");
  });

  it("thin, unlocked pool after graduation is flagged", () => {
    const r = scoreSolana({ report: rep({ markets: [{ marketType: "raydium", lp: { lpLockedPct: 10, lpLockedUSD: 300 } }] }), pairs: [pair({ dexId: "raydium", liquidity: { usd: 3_000 } })], now: NOW });
    expect(ids(r)).toEqual(expect.arrayContaining(["low-liq", "lp-unlocked"]));
  });
});

describe("findAddress", () => {
  it("finds EVM first, then a Solana mint, and skips plain words", () => {
    expect(findAddress("look 0x236feecd909ff562e775318c77781f4946c33b3b")).toBe("0x236feecd909ff562e775318c77781f4946c33b3b");
    expect(findAddress(`ca: ${MINT} 🚀`)).toBe(MINT);
    expect(findAddress("supercalifragilisticexpialidociousness words")).toBeNull();
    expect(findAddress("https://pump.fun/coin/" + MINT)).toBe(MINT);
  });

  it("keeps Solana case when storing, lowercases EVM", () => {
    expect(addrKey(MINT)).toBe(MINT);
    expect(addrKey("0xABCdef0000000000000000000000000000000000")).toBe("0xabcdef0000000000000000000000000000000000");
  });
});

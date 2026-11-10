import { describe, expect, it } from "vitest";
import type { GoPlusToken, HoneypotCheck } from "../src/chains/base.js";
import type { DexPair, RugReport } from "../src/chains/solana.js";
import { holders, telegramSummary } from "../src/format.js";
import { scoreBase } from "../src/score-base.js";
import { scoreSolana } from "../src/score-solana.js";

const NOW = 1_794_300_000_000;
const H = 3600_000;
const ADDR = "0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed";
const ZERO = "0x0000000000000000000000000000000000000000";
const WALLET = "0x2222222222222222222222222222222222222222";

const sec = (over: Partial<GoPlusToken> = {}): GoPlusToken => ({
  token_name: "Cat",
  token_symbol: "CAT",
  holder_count: "5000",
  is_open_source: "1",
  is_proxy: "0",
  is_mintable: "0",
  is_honeypot: "0",
  buy_tax: "0",
  sell_tax: "0",
  hidden_owner: "0",
  owner_address: "0x1111111111111111111111111111111111111111",
  creator_percent: "0.000000",
  holders: [{ address: WALLET, percent: "0.02", is_contract: 0, is_locked: 0 }],
  lp_holders: [{ address: ZERO, percent: "0.99", is_locked: 0 }],
  ...over,
});
const sim = (over: Partial<HoneypotCheck> = {}): HoneypotCheck => ({
  simulationSuccess: true,
  honeypotResult: { isHoneypot: false },
  simulationResult: { buyTax: 0, sellTax: 0, transferTax: 0 },
  ...over,
});
const pair = (over: Partial<DexPair> = {}): DexPair => ({
  dexId: "uniswap",
  url: "",
  marketCap: 2_000_000,
  liquidity: { usd: 200_000 },
  volume: { h24: 300_000 },
  pairCreatedAt: NOW - 72 * H,
  baseToken: { address: ADDR.toLowerCase(), name: "Cat", symbol: "CAT" },
  ...over,
});
const run = (over: Partial<Parameters<typeof scoreBase>[0]> = {}) =>
  scoreBase({ address: ADDR, security: sec(), honeypot: sim(), pairs: [pair()], now: NOW, ...over });
const ids = (r: ReturnType<typeof scoreBase>) => r.flags.map((f) => f.id);
const unknownText = (r: ReturnType<typeof scoreBase>) => r.flags.find((f) => f.id === "unknown")?.text ?? "";

describe("scoreBase", () => {
  it("fully checked clean token has no warnings", () => {
    const r = run();
    expect(r.chain).toBe("base");
    expect(r.level).toBe("low");
    expect(r.flags).toHaveLength(0);
    expect(r.holders).toBe(5000);
  });

  it("a honeypot is high on its own when no source says otherwise", () => {
    const bySim = run({ security: sec({ is_honeypot: undefined }), honeypot: sim({ honeypotResult: { isHoneypot: true } }) });
    expect(bySim.level).toBe("high");
    expect(bySim.score).toBeGreaterThanOrEqual(60);
    expect(run({ security: sec({ is_honeypot: "1" }), honeypot: null }).level).toBe("high");
    expect(run({ security: sec({ is_honeypot: "1" }), honeypot: sim({ honeypotResult: { isHoneypot: true } }) }).level).toBe("high");
    // a simulation that ran but gave no verdict is not a "no": GoPlus's verdict stands
    const noVerdict = run({ security: sec({ is_honeypot: "1" }), honeypot: { simulationSuccess: true, simulationResult: { buyTax: 0, sellTax: 0, transferTax: 0 } } });
    expect(ids(noVerdict)).toContain("honeypot");
    expect(noVerdict.level).toBe("high");
  });

  it("sources that disagree about selling: no verdict, but never 'few signals'", () => {
    // seen on an exchange-listed token: the simulation said honeypot, GoPlus said it sells fine
    const r = run({ honeypot: sim({ honeypotResult: { isHoneypot: true } }) });
    expect(ids(r)).toContain("sell-conflict");
    expect(ids(r)).not.toContain("honeypot");
    expect(r.level).toBe("caution");
    expect(run({ security: sec({ is_honeypot: "1" }) }).level).toBe("caution");
    expect(r.flags.find((f) => f.id === "sell-conflict")?.text).not.toMatch(/소액|직접 확인/); // no nudge to trade
  });

  it("takes the worse fee of the two sources", () => {
    const r = run({ security: sec({ sell_tax: "0.01" }), honeypot: sim({ simulationResult: { buyTax: 1, sellTax: 12, transferTax: 0 } }) });
    expect(r.flags.find((f) => f.id === "fee")?.severity).toBe("high");
    expect(run({ security: sec({ buy_tax: "0.03" }) }).flags.find((f) => f.id === "fee")?.severity).toBe("mid");
  });

  it("anything unchecked is listed and keeps the level at caution or worse", () => {
    const none = run({ security: null, honeypot: null });
    expect(none.level).toBe("caution");
    for (const item of ["팔 수 있는지", "수수료", "컨트랙트 권한", "보유 분포"]) expect(unknownText(none)).toContain(item);
    expect(none.holders).toBe(-1);

    // partial GoPlus record: two fields present must not hide what is missing
    const partial = run({ security: { is_proxy: "0", is_honeypot: "0" }, honeypot: null });
    expect(partial.level).toBe("caution");
    for (const item of ["수수료", "컨트랙트 권한", "보유 분포"]) expect(unknownText(partial)).toContain(item);
    expect(unknownText(partial)).not.toContain("팔 수 있는지"); // GoPlus did answer that one

    // blank strings (brand-new token) are unknown, not zero
    const blank = run({ security: sec({ buy_tax: "", sell_tax: "", holders: undefined, holder_count: "0" }), honeypot: null });
    expect(unknownText(blank)).toContain("수수료");
    expect(unknownText(blank)).toContain("보유 분포");
    expect(blank.holders).toBe(-1);
  });

  it("flags contract permissions; a renounced owner does not clear the mint warning", () => {
    const r = run({ security: sec({ is_proxy: "1", is_mintable: "1", transfer_pausable: "1", hidden_owner: "1" }) });
    expect(ids(r)).toEqual(expect.arrayContaining(["proxy", "mintable", "pausable", "hidden-owner"]));
    expect(ids(run({ security: sec({ is_open_source: "0", is_mintable: undefined, is_proxy: undefined }) }))).toContain("unverified");
    const mintRole = run({ security: sec({ is_mintable: "1", owner_address: ZERO }) });
    expect(ids(mintRole)).toContain("mintable");
    expect(ids(mintRole)).not.toContain("renounced");
    expect(ids(run({ security: sec({ owner_address: ZERO }) }))).toContain("renounced");
  });

  it("holder concentration ignores contracts, locked and burn addresses", () => {
    const list = [
      { address: "0x498581ff718922c3f8e6a244956af099b2652b2b", percent: "0.60", is_contract: 1, is_locked: 0 },
      { address: "0x000000000000000000000000000000000000dEaD", percent: "0.20", is_contract: 0, is_locked: 0 },
      { address: WALLET, percent: "0.05", is_contract: 0, is_locked: 0 },
    ];
    expect(ids(run({ security: sec({ holders: list }) }))).not.toContain("top10");
    const heavy = [{ address: WALLET, percent: "0.55", is_contract: 0, is_locked: 0 }];
    expect(run({ security: sec({ holders: heavy }) }).flags.find((f) => f.id === "top10")?.severity).toBe("high");
  });

  it("flags thin liquidity and a pool one wallet can pull", () => {
    const r = run({ security: sec({ lp_holders: [{ address: "0x3333333333333333333333333333333333333333", percent: "0.99", is_locked: 0 }] }), pairs: [pair({ liquidity: { usd: 3_000 } })] });
    expect(ids(r)).toEqual(expect.arrayContaining(["low-liq", "lp-unlocked"]));
    // LP held by a gauge or locker contract is not one wallet's to pull
    const gauge = [{ address: "0x4444444444444444444444444444444444444444", percent: "0.99", is_locked: 0, is_contract: 1 }];
    expect(ids(run({ security: sec({ lp_holders: gauge }) }))).not.toContain("lp-unlocked");
  });

  it("unknown creation time and holder count are shown as unknown", () => {
    const r = run({ pairs: [pair({ pairCreatedAt: undefined })], security: sec({ holder_count: "" }) });
    expect(ids(r)).not.toContain("new");
    expect(r.ageMinutes).toBe(-1);
    expect(holders(-1)).toBe("모름");
    const text = telegramSummary(r);
    expect(text).toContain("보유자 모름");
    expect(text).toContain("생성 시각 모름");
    expect(text).not.toContain("안전");
  });
});

describe("level floors", () => {
  it("a Solana token already marked rugged is high even with nothing else", () => {
    const report = {
      mint: "CbaC5NYsYvx3vtG49h8dJWf8vDxpLcqeZgKzHYYTpump", creator: null, creatorBalance: 0, mintAuthority: null, freezeAuthority: null,
      token: { supply: 1e15, decimals: 6 }, tokenMeta: { name: "Cat", symbol: "CAT", mutable: false }, transferFee: { pct: 0 }, topHolders: [],
      knownAccounts: {}, markets: [{ marketType: "pump_amm", lp: { lpLockedPct: 100, lpLockedUSD: 50_000 } }], risks: [], creatorTokens: [],
      totalHolders: 2_000, totalMarketLiquidity: 50_000, rugged: true, launchpad: null, detectedAt: new Date(NOW - 72 * H).toISOString(), price: 0,
    } satisfies RugReport;
    const solPair = pair({ dexId: "pumpswap", liquidity: { usd: 50_000 } });
    expect(scoreSolana({ report, pairs: [solPair], now: NOW }).level).toBe("high");
  });
});

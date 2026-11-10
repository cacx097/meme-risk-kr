import { describe, expect, it } from "vitest";
import type { MontraToken } from "../src/chains/montra.js";
import { telegramSummary } from "../src/format.js";
import { scoreToken } from "../src/score.js";

const NOW = 1_794_300_000_000;
const H = 3600_000;

function tok(over: Partial<MontraToken> = {}): MontraToken {
  return {
    address: "0x" + "1".repeat(40),
    name: "Cat",
    symbol: "CAT",
    creator: "0x" + "c".repeat(40),
    marketCapUsd: 100_000,
    volume24hUsd: 50_000,
    holders: 500,
    swaps: 1000,
    launchedAt: NOW - 48 * H,
    lastTradeAt: NOW,
    totalFeePips: 10_000,
    recipient: "0x" + "c".repeat(40),
    recipientKind: "creator",
    liquiditySealed: true,
    graduation: { stage: "graduated", progressBps: 10_000, graduatedAt: NOW - 24 * H },
    montra: null,
    pool: { feeFixed: true, feeLocked: true },
    live: { buyFee: 10_000 },
    ...over,
  };
}
const dead = (i: number) =>
  tok({ address: "0x" + String(i).padStart(40, "9"), marketCapUsd: 3_200, graduation: { stage: "new", progressBps: 0, graduatedAt: null } });
const ids = (r: ReturnType<typeof scoreToken>) => r.flags.map((f) => f.id);

describe("scoreToken", () => {
  it("clean token has few signals", () => {
    const r = scoreToken({ token: tok(), holders: { count: 500, top10Pct: 15, inPoolPct: 40, creatorPct: 1 }, creatorLaunches: [], sameName: [], now: NOW });
    expect(r.level).toBe("low");
    expect(r.flags).toHaveLength(0);
  });

  it("serial launcher with 10% fee is high risk", () => {
    const r = scoreToken({
      token: tok({ totalFeePips: 100_000 }),
      holders: { count: 10, top10Pct: 60, inPoolPct: 30, creatorPct: 25 },
      creatorLaunches: [1, 2, 3, 4, 5, 6].map(dead),
      sameName: [],
      now: NOW,
    });
    expect(r.level).toBe("high");
    expect(ids(r)).toEqual(expect.arrayContaining(["fee", "serial", "creator-bag", "top10"]));
    expect(r.flags[0].severity).toBe("high");
  });

  it("young launches are not counted as failures", () => {
    const young = [1, 2, 3, 4, 5, 6].map((i) => ({ ...dead(i), launchedAt: NOW - H }));
    const r = scoreToken({ token: tok(), holders: null, creatorLaunches: young, sameName: [], now: NOW });
    expect(ids(r)).not.toContain("serial");
    expect(r.creatorHistory.failed).toBe(0);
  });

  it("flags a copycat when an older, bigger twin exists", () => {
    const original = tok({ address: "0x" + "2".repeat(40), launchedAt: NOW - 100 * H, marketCapUsd: 900_000 });
    const r = scoreToken({ token: tok({ marketCapUsd: 4_000 }), holders: null, creatorLaunches: [], sameName: [original], now: NOW });
    expect(ids(r)).toContain("copycat");
  });

  it("the original among twins only gets a low note", () => {
    const twins = [3, 4].map((i) => tok({ address: "0x" + String(i).repeat(40), launchedAt: NOW - H, marketCapUsd: 3_000 }));
    const r = scoreToken({ token: tok(), holders: null, creatorLaunches: [], sameName: twins, now: NOW });
    expect(r.flags.find((f) => f.id === "lookalike")?.severity).toBe("low");
  });

  it("anti-snipe buy fee above pool fee is flagged", () => {
    const r = scoreToken({ token: tok({ live: { buyFee: 500_000 } }), holders: null, creatorLaunches: [], sameName: [], now: NOW });
    expect(r.flags.find((f) => f.id === "snipe-fee")?.text).toContain("50%");
  });
});

describe("telegramSummary", () => {
  it("escapes HTML and links to the web report", () => {
    const r = scoreToken({ token: tok({ name: "<b>x</b>" }), holders: null, creatorLaunches: [], sameName: [], now: NOW });
    const msg = telegramSummary(r, "https://example.org");
    expect(msg).toContain("&lt;b&gt;x&lt;/b&gt;");
    expect(msg).toContain(`https://example.org/t/${r.token.address}`);
    expect(msg).toContain("투자 조언이 아닌");
  });
});

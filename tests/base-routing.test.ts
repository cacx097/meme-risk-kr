// Routing and caching for 0x addresses, with every outside call replaced by a fake.
import { afterEach, describe, expect, it, vi } from "vitest";
import { analyze } from "../src/analyze.js";
import { base } from "../src/chains/base.js";
import { ApiError, remember } from "../src/chains/montra.js";
import { errorMessage } from "../src/bot.js";

type Reply = { status?: number; body: unknown };
const calls: string[] = [];

/** Fake fetch: the first rule whose key is part of the URL answers. */
function fakeFetch(rules: [string, Reply | (() => Reply)][]) {
  calls.length = 0;
  vi.stubGlobal("fetch", async (input: string | URL) => {
    const url = String(input);
    calls.push(url);
    const rule = rules.find(([key]) => url.includes(key));
    if (!rule) throw new Error(`unexpected call ${url}`);
    const r = typeof rule[1] === "function" ? rule[1]() : rule[1];
    return new Response(JSON.stringify(r.body), { status: r.status ?? 200 });
  });
}
const called = (part: string) => calls.filter((u) => u.includes(part)).length;
const addr = (n: number) => "0x" + n.toString(16).padStart(40, "0"); // a fresh address per test: the caches are shared

const PAIR = (a: string) => [{ dexId: "uniswap", url: "", marketCap: 500_000, liquidity: { usd: 80_000 }, volume: { h24: 10_000 }, pairCreatedAt: Date.now() - 72 * 3600_000, baseToken: { address: a, name: "Cat", symbol: "CAT" } }];
const GOPLUS = (a: string) => ({ code: 1, message: "OK", result: { [a]: { token_name: "Cat", token_symbol: "CAT", holder_count: "900", is_open_source: "1", is_proxy: "0", is_mintable: "0", is_honeypot: "0", buy_tax: "0", sell_tax: "0", hidden_owner: "0", holders: [{ address: addr(999), percent: "0.01", is_contract: 0, is_locked: 0 }] } } });
const SIM = { simulationSuccess: true, honeypotResult: { isHoneypot: false }, simulationResult: { buyTax: 0, sellTax: 0, transferTax: 0 } };
const NOT_FOUND = { status: 404, body: { error: "not found" } };

afterEach(() => vi.unstubAllGlobals());

describe("0x address routing", () => {
  it("falls back to Base when Montra does not know the token", async () => {
    const a = addr(1);
    fakeFetch([["montramarkets", NOT_FOUND], ["dexscreener", { body: PAIR(a) }], ["gopluslabs", { body: GOPLUS(a) }], ["honeypot.is", { body: SIM }]]);
    const r = await analyze(a);
    expect(r.chain).toBe("base");
    expect(r.level).toBe("low");
  });

  it("a wallet address (no pool) is 'not found' and never reaches GoPlus or Honeypot.is", async () => {
    const a = addr(2);
    fakeFetch([["montramarkets", NOT_FOUND], ["dexscreener", { body: [] }]]);
    const e = await analyze(a).catch((x) => x);
    expect(e).toBeInstanceOf(ApiError);
    expect(e.status).toBe(404);
    expect(called("gopluslabs") + called("honeypot.is")).toBe(0);
    expect(errorMessage(e, a)).toContain("찾을 수 없는");
  });

  it("Montra down and nothing on Base: 'try again', not 'not found'", async () => {
    const a = addr(3);
    fakeFetch([["montramarkets", { status: 500, body: {} }], ["dexscreener", { body: [] }]]);
    const e = await analyze(a).catch((x) => x);
    expect(e.status).toBe(500);
    expect(errorMessage(e, a)).toContain("잠시 후");
  });

  it("DexScreener down: 'try again', not a report with $0 market data", async () => {
    const a = addr(4);
    fakeFetch([["montramarkets", NOT_FOUND], ["dexscreener", { status: 503, body: {} }]]);
    const e = await analyze(a).catch((x) => x);
    expect(e.status).toBe(503);
    expect(errorMessage(e, a)).toContain("잠시 후");
  });

  it("security sources down: still answers, with the unchecked items listed and level caution", async () => {
    const a = addr(5);
    fakeFetch([["montramarkets", NOT_FOUND], ["dexscreener", { body: PAIR(a) }], ["gopluslabs", { body: { code: 4029, message: "too many requests" } }], ["honeypot.is", NOT_FOUND]]);
    const r = await analyze(a);
    expect(r.level).toBe("caution");
    expect(r.flags.find((f) => f.id === "unknown")?.text).toContain("팔 수 있는지");
  });
});

describe("GoPlus caching", () => {
  it("a rate-limit answer (HTTP 200, code 4029) is an error and is not remembered", async () => {
    const a = addr(6);
    let limited = true;
    fakeFetch([["gopluslabs", () => ({ body: limited ? { code: 4029, message: "too many requests" } : GOPLUS(a) })]]);
    const e = await base.security(a).catch((x) => x);
    expect(e).toBeInstanceOf(ApiError);
    expect(e.status).toBe(429);
    limited = false;
    expect((await base.security(a))?.token_name).toBe("Cat");
    expect(called("gopluslabs")).toBe(2);
    await base.security(a); // a good answer is remembered
    expect(called("gopluslabs")).toBe(2);
  });

  it("pruning judges each entry by its own lifetime", () => {
    const map = new Map<string, { at: number; value: unknown; ttl?: number }>();
    const now = Date.now();
    for (let i = 0; i < 999; i++) map.set(`short${i}`, { at: now - 21_000, value: i }); // 20s entries, expired
    map.set("goplus", { at: now - 21_000, value: "kept", ttl: 180_000 }); // 3 min entry, still valid
    remember(map, "new", 1);
    expect(map.has("goplus")).toBe(true);
    expect(map.size).toBe(2);
  });
});

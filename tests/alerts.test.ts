import { describe, expect, it } from "vitest";
import { candidates, wants, worsened } from "../src/alerts.js";
import { parseAlertArg } from "../src/bot.js";
import type { MontraToken } from "../src/chains/montra.js";
import type { Report } from "../src/score.js";

const NOW = 1_794_300_000_000;
const t = (address: string, marketCapUsd: number, ageH = 1) => ({ address, marketCapUsd, launchedAt: NOW - ageH * 3600_000 }) as MontraToken;
const r = (level: Report["level"], marketCapUsd = 100_000) => ({ level, marketCapUsd }) as Report;

describe("alerts", () => {
  it("picks tokens over the lowest subscriber line, skipping announced and old ones", () => {
    const list = [t("0xa", 60_000), t("0xb", 10_000), t("0xc", 80_000), t("0xd", 90_000, 72)];
    const got = candidates(list, [{ minMcapUsd: 50_000, maxLevel: "caution" }], new Set(["0xc"]), NOW);
    expect(got.map((x) => x.address)).toEqual(["0xa"]);
  });

  it("no subscribers means no work", () => {
    expect(candidates([t("0xa", 1e6)], [], new Set(), NOW)).toEqual([]);
  });

  it("subscriber filter respects market cap and max level", () => {
    const sub = { minMcapUsd: 50_000, maxLevel: "caution" as const };
    expect(wants(sub, r("caution"))).toBe(true);
    expect(wants(sub, r("high"))).toBe(false);
    expect(wants(sub, r("low", 10_000))).toBe(false);
  });

  it("watch alert fires only when the level gets worse", () => {
    expect(worsened("low", r("caution"))).toBe(true);
    expect(worsened("high", r("caution"))).toBe(false);
    expect(worsened(undefined, r("high"))).toBe(false);
  });
});

describe("parseAlertArg", () => {
  it("parses amounts, k suffix, default and off", () => {
    expect(parseAlertArg("50000")).toEqual({ minMcapUsd: 50_000, maxLevel: "caution" });
    expect(parseAlertArg("100k")?.valueOf()).toEqual({ minMcapUsd: 100_000, maxLevel: "caution" });
    expect(parseAlertArg("$75,000")).toEqual({ minMcapUsd: 75_000, maxLevel: "caution" });
    expect(parseAlertArg("")).toEqual({ minMcapUsd: 50_000, maxLevel: "caution" });
    expect(parseAlertArg("off")).toBe("off");
    expect(parseAlertArg("abc")).toBeNull();
    expect(parseAlertArg("100")).toBeNull();
  });
});

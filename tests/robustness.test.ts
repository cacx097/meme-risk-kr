import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { makeRepeatGuard } from "../src/bot.js";
import { remember } from "../src/chains/montra.js";
import { Inflight } from "../src/inflight.js";
import { Store } from "../src/store.js";

describe("group repeat guard", () => {
  const A = "0xAbC0000000000000000000000000000000000000";
  const a = A.toLowerCase();

  it("answers an address once per chat per window", () => {
    const g = makeRepeatGuard(600_000);
    expect(g.take(1, A, 0)).toBe(true);
    expect(g.take(1, a, 10)).toBe(false); // same token pasted again while the first answer is running
    g.done(1, A, true, 0);
    expect(g.take(1, a, 1_000)).toBe(false); // same token, other casing
    expect(g.take(2, a, 1_000)).toBe(true); // other group
    expect(g.take(1, a, 600_000)).toBe(true); // window passed
  });

  it("lets the group retry right away when the answer failed", () => {
    const g = makeRepeatGuard(600_000);
    expect(g.take(1, A, 0)).toBe(true);
    g.done(1, A, false, 0);
    expect(g.take(1, A, 30_000)).toBe(true);
  });
});

describe("shutdown drain", () => {
  it("waits for running jobs, refuses new rounds, gives up after the limit", async () => {
    const jobs = new Inflight();
    let finished = false;
    const job = jobs.run(async () => {
      await new Promise((r) => setTimeout(r, 30));
      finished = true;
    });
    expect(await jobs.close(1_000)).toBe(true);
    expect(finished).toBe(true);
    expect(jobs.closed).toBe(true);
    await job;

    const slow = new Inflight();
    void slow.run(() => new Promise((r) => setTimeout(r, 200)));
    expect(await slow.close(20)).toBe(false);
  });
});

describe("store", () => {
  it("writes through a temp file, keeps unreadable files, knows watched tokens", () => {
    const dir = mkdtempSync(join(tmpdir(), "state-"));
    const file = join(dir, "state.json");
    const s = new Store(file);
    s.watch(1, "0xABC0000000000000000000000000000000000000");
    s.flush();
    expect(JSON.parse(readFileSync(file, "utf8")).watches["1"]).toHaveLength(1);
    expect(readdirSync(dir)).toEqual(["state.json"]);
    expect(s.isWatched("0xabc0000000000000000000000000000000000000")).toBe(true);
    expect(s.isWatched("0xdef0000000000000000000000000000000000000")).toBe(false);

    writeFileSync(file, "{broken");
    const t = new Store(file);
    expect(t.state.checks).toBe(0);
    expect(readdirSync(dir).some((f) => f.startsWith("state.json.bad-"))).toBe(true);
  });
});

describe("cache", () => {
  it("drops expired entries once it gets big", () => {
    const map = new Map<string, { at: number; value: unknown }>();
    for (let i = 0; i < 1_000; i++) map.set(`old${i}`, { at: 0, value: i });
    remember(map, "new", 1);
    expect(map.size).toBe(1);
  });
});

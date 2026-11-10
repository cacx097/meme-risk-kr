// Gathers data for one token and scores it. The only place that talks to chain APIs.
import { montra } from "./chains/montra.js";
import { scoreToken, type Report } from "./score.js";

export const EVM_ADDRESS = /0x[a-fA-F0-9]{40}/;

export async function analyze(address: string, now = Date.now()): Promise<Report> {
  const token = await montra.token(address);
  const [holders, launches, sameName] = await Promise.all([
    montra.holders(address).catch(() => null),
    montra.launchesBy(token.creator).catch(() => ({ tokens: [] })),
    montra.searchByName(token.name).catch(() => ({ tokens: [] })),
  ]);
  return scoreToken({ token, holders, creatorLaunches: launches.tokens, sameName: sameName.tokens, now });
}

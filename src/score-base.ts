// Base rules. Same point system as the other chains (finish in score.ts); inputs come from GoPlus, Honeypot.is, DexScreener.
// Data that could not be fetched is shown as "not confirmed" instead of being read as "no problem".
import type { GoPlusToken, HoneypotCheck } from "./chains/base.js";
import type { DexPair } from "./chains/solana.js";
import { finish, type Flag, type Report, type Severity } from "./score.js";

export interface BaseInput {
  address: string;
  security: GoPlusToken | null; // null: no GoPlus record, or GoPlus could not be reached
  honeypot: HoneypotCheck | null; // null: no simulation available
  pairs: DexPair[];
  now: number;
}

const BURN = new Set(["0x0000000000000000000000000000000000000000", "0x000000000000000000000000000000000000dead"]);
const on = (v: string | undefined) => v === "1";
const known = (v: string | undefined) => v === "0" || v === "1";
const pct = (v: string | undefined) => (Number(v) || 0) * 100; // GoPlus fractions -> percent
const given = (v: string | undefined) => v !== undefined && v !== "" && Number.isFinite(Number(v));
const show = (n: number) => `${+n.toFixed(1)}%`;

export function scoreBase({ address, security: g, honeypot: hp, pairs, now }: BaseInput): Report {
  const flags: Flag[] = [];
  const add = (id: string, severity: Severity, text: string) => flags.push({ id, severity, text });

  const own = pairs.filter((p) => p.baseToken.address.toLowerCase() === address.toLowerCase());
  const pair = [...(own.length ? own : pairs)].sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0];
  const created = Math.min(...pairs.map((p) => p.pairCreatedAt ?? Infinity));
  const ageMs = Number.isFinite(created) ? now - created : null; // DexScreener does not always give a creation time
  const volume24hUsd = pair?.volume?.h24 ?? 0;
  const holderCount = given(g?.holder_count) && Number(g?.holder_count) > 0 ? Number(g?.holder_count) : -1; // -1: not known
  const unknown: string[] = []; // things we could not check; never counted as "no problem"

  // Can it be sold?
  // Two independent opinions: Honeypot.is (a simulated sell) and GoPlus. Either can be wrong on its own
  // (seen on exchange-listed tokens), so "cannot sell" is decisive only when the other source does not say otherwise.
  const simSays = typeof hp?.honeypotResult?.isHoneypot === "boolean" ? hp.honeypotResult.isHoneypot : undefined;
  const goSays = known(g?.is_honeypot) ? on(g?.is_honeypot) : undefined;
  const honeypot = simSays === true || goSays === true;
  if (honeypot && (simSays === false || goSays === false))
    flags.push({ id: "sell-conflict", severity: "mid", text: "검사 결과가 엇갈려 팔 수 있는지 확정할 수 없음 (한 곳은 팔 수 없다고 판정)", floor: "caution" });
  else if (honeypot)
    flags.push({ id: "honeypot", severity: "high", text: "매도 시험에서 팔 수 없었음 (허니팟이거나 허가된 지갑만 거래 가능)", floor: "high" });
  else if (simSays === undefined && goSays === undefined) unknown.push("팔 수 있는지");
  if (on(g?.cannot_sell_all)) add("sell-limit", "high", "가진 토큰을 한 번에 다 팔 수 없게 막혀 있음");

  // Fees (the worse of the two sources)
  const sim = hp?.simulationSuccess ? hp.simulationResult : undefined;
  const buy = Math.max(pct(g?.buy_tax), sim?.buyTax ?? 0);
  const sell = Math.max(pct(g?.sell_tax), sim?.sellTax ?? 0, sim?.transferTax ?? 0, pct(g?.transfer_tax));
  const fee = Math.max(buy, sell);
  if (!sim && !(given(g?.buy_tax) && given(g?.sell_tax))) unknown.push("수수료");
  if (fee >= 5) add("fee", "high", `거래 수수료가 높음 (살 때 ${show(buy)}, 팔 때 ${show(sell)})`);
  else if (fee >= 2) add("fee", "mid", `거래 수수료 살 때 ${show(buy)}, 팔 때 ${show(sell)}`);

  // Contract permissions
  if (g?.is_open_source === "0") add("unverified", "high", "코드가 공개 검증되지 않아 무슨 기능이 있는지 확인할 수 없음");
  else if (!(g?.is_open_source === "1" && known(g.is_mintable) && known(g.is_proxy))) unknown.push("컨트랙트 권한");
  if (on(g?.hidden_owner)) add("hidden-owner", "high", "숨겨진 소유자가 있음 (권한을 포기한 척할 수 있음)");
  if (on(g?.can_take_back_ownership)) add("take-back", "high", "포기한 소유권을 되찾을 수 있음");
  if (on(g?.selfdestruct)) add("selfdestruct", "high", "컨트랙트를 통째로 없앨 수 있는 기능이 있음");
  if (on(g?.personal_slippage_modifiable)) add("personal-fee", "high", "특정 지갑에만 수수료를 따로 매길 수 있음");
  if (on(g?.honeypot_with_same_creator)) add("creator-honeypot", "high", "개발자가 전에 팔 수 없는 토큰을 만든 이력이 있음");
  if (on(g?.slippage_modifiable)) add("fee-mutable", "mid", "수수료를 나중에 올릴 수 있음");
  if (on(g?.transfer_pausable)) add("pausable", "mid", "거래를 멈출 수 있는 기능이 있음");
  if (on(g?.is_blacklisted)) add("blacklist", "mid", "특정 지갑의 거래를 막을 수 있음");
  if (on(g?.is_proxy)) add("proxy", "mid", "코드를 나중에 바꿀 수 있음 (프록시)");
  // A renounced owner does not rule out minting: a separate minter role can remain.
  if (on(g?.is_mintable)) add("mintable", "mid", "토큰을 추가로 찍어낼 수 있음");
  const renounced = BURN.has((g?.owner_address ?? "").toLowerCase());
  if (renounced && g?.is_open_source === "1" && g?.is_proxy === "0" && g?.hidden_owner === "0" && g?.is_mintable === "0")
    add("renounced", "good", "소유권이 포기됨 (소유자 권한으로는 설정을 바꿀 수 없음)");

  // Who holds it (contracts such as pools, lockers and burn addresses are left out)
  if (!g?.holders?.length) unknown.push("보유 분포");
  const wallets = (g?.holders ?? []).filter((h) => h.is_contract !== 1 && h.is_locked !== 1 && !BURN.has(h.address.toLowerCase()));
  const top10 = wallets.slice(0, 10).reduce((s, h) => s + pct(h.percent), 0);
  if (top10 >= 50) add("top10", "high", `상위 지갑들이 ${show(top10)} 보유 (컨트랙트 제외)`);
  else if (top10 >= 30) add("top10", "mid", `상위 지갑들이 ${show(top10)} 보유 (컨트랙트 제외)`);
  const bag = Math.max(pct(g?.creator_percent), pct(g?.owner_percent));
  if (bag >= 20) add("creator-bag", "high", `개발자 지갑이 ${show(bag)} 보유`);
  else if (bag >= 10) add("creator-bag", "mid", `개발자 지갑이 ${show(bag)} 보유`);

  // Liquidity
  if (!pair) unknown.push("유동성");
  else if ((pair.liquidity?.usd ?? 0) < 10_000) add("low-liq", "mid", `유동성이 $${Math.round(pair.liquidity?.usd ?? 0).toLocaleString()}로 매우 적음 (팔기 어려울 수 있음)`);
  // One ordinary wallet holding most of the pool, not locked and not burned, can pull it.
  // Contracts are skipped: staking gauges and lockers hold LP for many people.
  const loose = (g?.lp_holders ?? []).filter((h) => h.is_locked !== 1 && h.is_contract !== 1 && !BURN.has(h.address.toLowerCase()));
  const biggest = Math.max(0, ...loose.map((h) => pct(h.percent)));
  if (biggest >= 50) add("lp-unlocked", "mid", `유동성의 ${biggest.toFixed(0)}%를 한 지갑이 잠그지 않고 보유 (빼낼 수 있음)`);

  // Unknown is not "few signals": the level cannot be lower than caution while something is unchecked.
  if (unknown.length)
    flags.push({ id: "unknown", severity: "mid", text: `확인하지 못한 항목: ${unknown.join(", ")} (새 토큰이거나 데이터 조회 한도)`, floor: "caution" });

  // Activity shape
  if (ageMs !== null && ageMs < 3600_000) add("new", "low", `생긴 지 ${Math.max(1, Math.round(ageMs / 60_000))}분`);
  if (holderCount > 0 && volume24hUsd / holderCount > 5_000) add("wash", "mid", "보유자 수에 비해 거래량이 지나치게 많음 (자전거래 의심)");

  return {
    chain: "base",
    token: {
      address,
      name: g?.token_name || pair?.baseToken.name || "?",
      symbol: g?.token_symbol || pair?.baseToken.symbol || "?",
      creator: g?.creator_address ?? "",
    },
    marketCapUsd: pair?.marketCap ?? pair?.fdv ?? 0,
    volume24hUsd,
    holders: holderCount,
    ageMinutes: ageMs === null ? -1 : Math.round(ageMs / 60_000),
    ...finish(flags),
    creatorHistory: { launches: 0, failed: 0, graduated: 0 }, // no free source for a creator's other Base tokens
    lookalikes: 0,
  };
}

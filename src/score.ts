// Rule-based risk score. Pure functions only, so the same rules serve bot, web and tests.
import type { MontraHolders, MontraToken } from "./chains/montra.js";

export type Severity = "high" | "mid" | "low" | "good";

export interface Flag {
  id: string;
  severity: Severity;
  text: string; // Korean, one line
}

export type Chain = "elysium" | "solana";

export interface Report {
  chain: Chain;
  token: { address: string; name: string; symbol: string; creator: string };
  marketCapUsd: number;
  volume24hUsd: number;
  holders: number;
  ageMinutes: number;
  score: number; // 0 (few signals) .. 100 (many signals)
  level: "high" | "caution" | "low";
  flags: Flag[]; // most severe first
  creatorHistory: { launches: number; failed: number; graduated: number };
  lookalikes: number;
}

export interface ScoreInput {
  token: MontraToken;
  holders: MontraHolders | null;
  creatorLaunches: MontraToken[]; // may include the token itself
  sameName: MontraToken[]; // may include the token itself
  now: number;
}

const POINTS: Record<Severity, number> = { high: 30, mid: 15, low: 5, good: -10 };
const ORDER: Severity[] = ["high", "mid", "low", "good"];
// Montra graduation is ~$58.7k market cap; a fresh launch opens near $3.2–3.5k.
const GRADUATION_MCAP_USD = 58_700;
export const FAILED_MCAP_USD = 5_000;
export const FAILED_MIN_AGE_MS = 6 * 3600_000;

/** Shared by every chain: order flags, add up points, pick the level. */
export function finish(flags: Flag[]): Pick<Report, "flags" | "score" | "level"> {
  flags.sort((a, b) => ORDER.indexOf(a.severity) - ORDER.indexOf(b.severity));
  const score = Math.max(0, Math.min(100, flags.reduce((s, f) => s + POINTS[f.severity], 0)));
  return { flags, score, level: score >= 60 ? "high" : score >= 30 ? "caution" : "low" };
}

const pct = (pips: number) => `${+(pips / 10_000).toFixed(2)}%`;

export function isFailedLaunch(t: MontraToken, now: number): boolean {
  return t.graduation.stage !== "graduated" && t.marketCapUsd < FAILED_MCAP_USD && now - t.launchedAt > FAILED_MIN_AGE_MS;
}

export function scoreToken(input: ScoreInput): Report {
  const { token: t, holders: h, now } = input;
  const flags: Flag[] = [];
  const add = (id: string, severity: Severity, text: string) => flags.push({ id, severity, text });
  const addr = t.address.toLowerCase();

  if (t.montra === "official") add("official", "good", "Montra 공식 토큰으로 표시됨");

  // Fees
  if (t.totalFeePips >= 50_000) add("fee", "high", `거래 수수료 ${pct(t.totalFeePips)} (사고팔 때마다 차감)`);
  else if (t.totalFeePips >= 20_000) add("fee", "mid", `거래 수수료 ${pct(t.totalFeePips)}`);
  if (t.pool && (t.pool.feeFixed === false || t.pool.feeLocked === false)) add("fee-mutable", "mid", "수수료를 나중에 바꿀 수 있음");
  const buyFee = t.live?.buyFee ?? 0;
  if (buyFee > t.totalFeePips) add("snipe-fee", "mid", `지금 매수 수수료 ${pct(buyFee)} (초기 매수 방지 구간)`);

  // Who receives creator fees
  if (t.recipientKind === "holders") add("fee-to-holders", "good", "수수료가 보유자에게 분배됨");
  else if (t.recipientKind === "wallet" && t.recipient.toLowerCase() !== t.creator.toLowerCase())
    add("fee-recipient", "low", "수수료가 개발자가 아닌 다른 지갑으로 감");

  // Holder concentration
  if (h) {
    if (t.montra === "official" && h.creatorPct >= 10)
      add("creator-bag", "low", `개발자가 ${h.creatorPct.toFixed(1)}% 보유 (공식 토큰: 에어드랍·운영 물량일 수 있음)`);
    else if (h.creatorPct >= 20) add("creator-bag", "high", `개발자가 ${h.creatorPct.toFixed(1)}% 보유`);
    else if (h.creatorPct >= 10) add("creator-bag", "mid", `개발자가 ${h.creatorPct.toFixed(1)}% 보유`);
    if (h.top10Pct >= 50) add("top10", "high", `상위 10개 지갑이 ${h.top10Pct.toFixed(1)}% 보유`);
    else if (h.top10Pct >= 30) add("top10", "mid", `상위 10개 지갑이 ${h.top10Pct.toFixed(1)}% 보유`);
  }

  // Creator track record (other launches only)
  const others = input.creatorLaunches.filter((x) => x.address.toLowerCase() !== addr);
  // Judge failure only on launches old enough to have had a chance.
  const matured = others.filter((x) => now - x.launchedAt > FAILED_MIN_AGE_MS);
  const failed = matured.filter((x) => isFailedLaunch(x, now)).length;
  const graduated = others.filter((x) => x.graduation.stage === "graduated").length;
  if (matured.length >= 5 && failed / matured.length >= 0.8)
    add("serial", "high", `개발자 지갑이 6시간 넘은 다른 토큰 ${matured.length}개 중 ${failed}개 실패 (찍어내기 패턴)`);
  else if (matured.length >= 2 && failed / matured.length >= 0.5)
    add("serial", "mid", `개발자 지갑의 다른 토큰 ${matured.length}개 중 ${failed}개 실패`);
  if (others.length - matured.length >= 10) add("spam", "mid", `개발자 지갑이 최근 6시간에 토큰을 ${others.length - matured.length}개 만듦`);
  if (graduated > 0) add("creator-grad", "good", `개발자가 졸업 토큰을 ${graduated}개 만든 이력 있음`);

  // Lookalikes: same name or symbol, different address
  const norm = (s: string) => s.trim().toLowerCase();
  const twins = input.sameName.filter(
    (x) => x.address.toLowerCase() !== addr && (norm(x.name) === norm(t.name) || norm(x.symbol) === norm(t.symbol)),
  );
  const olderTwin = twins.some((x) => x.launchedAt < t.launchedAt && x.marketCapUsd > t.marketCapUsd);
  const largest = twins.every((x) => x.marketCapUsd <= t.marketCapUsd);
  if (olderTwin && t.montra !== "official") add("copycat", "high", `같은 이름의 더 오래되고 큰 토큰이 있음 (가짜일 수 있음, 주소 확인)`);
  else if (twins.length >= 2 && (largest || t.montra === "official"))
    add("lookalike", "low", `이름을 베낀 토큰 ${twins.length}개가 있음 (이 주소가 가장 큼)`);
  else if (twins.length >= 2) add("lookalike", "mid", `같은 이름 토큰이 ${twins.length + 1}개 있음 (주소 확인)`);

  // Activity shape
  const ageMs = now - t.launchedAt;
  if (ageMs < 3600_000) add("new", "low", `생긴 지 ${Math.max(1, Math.round(ageMs / 60_000))}분`);
  if (t.holders > 0 && t.volume24hUsd / t.holders > 5_000)
    add("wash", "mid", `보유자 수에 비해 거래량이 지나치게 많음 (자전거래 의심)`);
  if (t.graduation.stage === "graduated" && t.marketCapUsd < GRADUATION_MCAP_USD)
    add("post-grad-drop", "mid", "졸업 후 졸업 기준 아래로 다시 떨어짐");
  if (!t.liquiditySealed) add("unsealed", "low", "유동성이 봉인되지 않음");

  return {
    chain: "elysium",
    token: { address: t.address, name: t.name, symbol: t.symbol, creator: t.creator },
    marketCapUsd: t.marketCapUsd,
    volume24hUsd: t.volume24hUsd,
    holders: t.holders,
    ageMinutes: Math.round(ageMs / 60_000),
    ...finish(flags),
    creatorHistory: { launches: others.length, failed, graduated },
    lookalikes: twins.length,
  };
}

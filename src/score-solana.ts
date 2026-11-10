// Solana rules. Same point system as Elysium (finish in score.ts); inputs come from RugCheck + DexScreener.
import type { DexPair, RugReport } from "./chains/solana.js";
import { FAILED_MCAP_USD, FAILED_MIN_AGE_MS, finish, type Flag, type Report, type Severity } from "./score.js";

// RugCheck risks we do not compute ourselves, translated. Others are covered by our own rules below.
const RUG_RISKS: Record<string, [Severity, string]> = {
  "Permanent Control Enabled": ["high", "토큰을 지갑에서 마음대로 옮길 수 있는 영구 권한이 켜져 있음"],
  "Copycat token": ["mid", "유명 토큰 이름을 베낀 토큰으로 표시됨 (주소 확인)"],
  "Mutable metadata": ["low", "토큰 이름·이미지를 나중에 바꿀 수 있음"],
};
const COVERED = new Set([
  "Mint Authority still enabled",
  "Freeze Authority still enabled",
  "Creator history of rugged tokens",
  "Single holder ownership",
  "High holder concentration",
  "Top 10 holders high ownership",
  "High ownership",
  "Low Liquidity",
  "Low amount of LP Providers",
  "Large Amount of LP Unlocked", // our lp-unlocked rule
]);

export interface SolanaInput {
  report: RugReport;
  pairs: DexPair[];
  now: number;
}

export function scoreSolana({ report: r, pairs, now }: SolanaInput): Report {
  const flags: Flag[] = [];
  const add = (id: string, severity: Severity, text: string) => flags.push({ id, severity, text });

  const pair = [...pairs].sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0];
  const created = Math.min(...pairs.map((p) => p.pairCreatedAt ?? Infinity), Date.parse(r.detectedAt) || Infinity);
  const launchedAt = Number.isFinite(created) ? created : now;
  const ageMs = now - launchedAt;
  const marketCapUsd = pair?.marketCap ?? pair?.fdv ?? 0;
  const volume24hUsd = pair?.volume?.h24 ?? 0;

  if (r.rugged) flags.push({ id: "rugged", severity: "high", text: "RugCheck에서 이미 러그(유동성 회수)로 표시됨", floor: "high" });

  // Authorities
  if (r.mintAuthority) add("mint-auth", "high", "개발자가 토큰을 추가로 찍어낼 수 있음 (발행 권한 남아 있음)");
  if (r.freezeAuthority) add("freeze-auth", "high", "개발자가 지갑을 동결해 팔지 못하게 할 수 있음 (동결 권한 남아 있음)");

  // Transfer fee (Token-2022)
  const fee = r.transferFee?.pct ?? 0;
  if (fee >= 5) add("fee", "high", `전송 수수료 ${fee}% (옮기거나 팔 때마다 차감)`);
  else if (fee >= 2) add("fee", "mid", `전송 수수료 ${fee}%`);

  // Holder concentration (pools and launchpad curves excluded)
  const amm = new Set(Object.entries(r.knownAccounts ?? {}).filter(([, v]) => v.type === "AMM").map(([k]) => k));
  const holders = (r.topHolders ?? []).filter((h) => !amm.has(h.owner) && !amm.has(h.address));
  const top10 = holders.slice(0, 10).reduce((s, h) => s + h.pct, 0);
  const supply = r.token?.supply ?? 0;
  const creatorPct = supply > 0 ? (r.creatorBalance / supply) * 100 : 0;
  if (creatorPct >= 20) add("creator-bag", "high", `개발자가 ${creatorPct.toFixed(1)}% 보유`);
  else if (creatorPct >= 10) add("creator-bag", "mid", `개발자가 ${creatorPct.toFixed(1)}% 보유`);
  if (top10 >= 50) add("top10", "high", `상위 10개 지갑이 ${top10.toFixed(1)}% 보유`);
  else if (top10 >= 30) add("top10", "mid", `상위 10개 지갑이 ${top10.toFixed(1)}% 보유`);

  // Creator track record (other launches only)
  const others = (r.creatorTokens ?? []).filter((x) => x.mint !== r.mint);
  const matured = others.filter((x) => now - Date.parse(x.createdAt) > FAILED_MIN_AGE_MS);
  const failed = matured.filter((x) => x.marketCap < FAILED_MCAP_USD).length;
  if (matured.length >= 5 && failed / matured.length >= 0.8)
    add("serial", "high", `개발자 지갑이 6시간 넘은 다른 토큰 ${matured.length}개 중 ${failed}개 실패 (찍어내기 패턴)`);
  else if (matured.length >= 2 && failed / matured.length >= 0.5)
    add("serial", "mid", `개발자 지갑의 다른 토큰 ${matured.length}개 중 ${failed}개 실패`);
  else if (r.risks?.some((x) => x.name === "Creator history of rugged tokens"))
    add("serial", "high", "개발자가 이전에 러그 토큰을 만든 이력 (RugCheck)");
  if (others.length - matured.length >= 10) add("spam", "mid", `개발자 지갑이 최근 6시간에 토큰을 ${others.length - matured.length}개 만듦`);

  // Liquidity: a pump.fun bonding curve holds its own liquidity, so judge pools only after it leaves the curve
  const onCurve = pair?.dexId === "pumpfun" || (r.markets ?? []).every((m) => m.marketType === "pump_fun");
  if (onCurve) add("curve", "low", "아직 pump.fun 본딩 커브 단계 (졸업 전)");
  else {
    const liq = pair?.liquidity?.usd ?? r.totalMarketLiquidity;
    if (liq < 10_000) add("low-liq", "mid", `유동성이 $${Math.round(liq).toLocaleString()}로 매우 적음 (팔기 어려울 수 있음)`);
    const pools = (r.markets ?? []).filter((m) => m.marketType !== "pump_fun" && m.lp);
    const locked = Math.max(0, ...pools.map((m) => m.lp!.lpLockedPct)); // best-locked pool
    if (pools.length && locked < 50) add("lp-unlocked", "mid", `유동성 풀의 ${locked.toFixed(0)}%만 잠겨 있음 (빼낼 수 있음)`);
  }

  for (const risk of r.risks ?? []) {
    const known = RUG_RISKS[risk.name];
    if (known) add(`rc-${risk.name}`, known[0], known[1]);
    else if (!COVERED.has(risk.name) && risk.level === "danger") add(`rc-${risk.name}`, "mid", `RugCheck 경고: ${risk.name}`);
  }

  // Activity shape
  if (ageMs < 3600_000) add("new", "low", `생긴 지 ${Math.max(1, Math.round(ageMs / 60_000))}분`);
  if (r.totalHolders > 0 && volume24hUsd / r.totalHolders > 5_000) add("wash", "mid", "보유자 수에 비해 거래량이 지나치게 많음 (자전거래 의심)");

  return {
    chain: "solana",
    token: {
      address: r.mint,
      name: r.tokenMeta?.name || pair?.baseToken.name || "?",
      symbol: r.tokenMeta?.symbol || pair?.baseToken.symbol || "?",
      creator: r.creator ?? "",
    },
    marketCapUsd,
    volume24hUsd,
    holders: r.totalHolders,
    ageMinutes: Math.round(ageMs / 60_000),
    ...finish(flags),
    creatorHistory: { launches: others.length, failed, graduated: 0 },
    lookalikes: 0,
  };
}

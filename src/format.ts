// Korean output for Telegram (HTML parse mode) and the web pages.
import type { Flag, Report } from "./score.js";

export const DISCLAIMER = "투자 조언이 아닌 공개 데이터 기반 참고 정보입니다.";
export const CHAIN_LABEL: Record<Report["chain"], string> = { elysium: "Elysium", solana: "Solana" };

const LEVEL_LABEL: Record<Report["level"], string> = {
  high: "🔴 위험 신호 많음",
  caution: "🟡 주의",
  low: "🟢 위험 신호 적음",
};
const ICON: Record<Flag["severity"], string> = { high: "🔴", mid: "🟡", low: "⚪", good: "🟢" };

export const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function usd(n: number): string {
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

function age(min: number): string {
  if (min < 60) return `${min}분`;
  if (min < 48 * 60) return `${Math.round(min / 60)}시간`;
  return `${Math.round(min / 1440)}일`;
}

/** Short Telegram summary: level, key numbers, top 3 warnings, link to full report. */
export function telegramSummary(r: Report, webBase?: string): string {
  const warnings = r.flags.filter((f) => f.severity !== "good" && f.severity !== "low").slice(0, 3);
  const goods = r.flags.filter((f) => f.severity === "good").slice(0, 1);
  const lines = [
    `<b>${esc(r.token.name)} ($${esc(r.token.symbol)})</b> · ${CHAIN_LABEL[r.chain]}`,
    `${LEVEL_LABEL[r.level]} · 점수 ${r.score}/100`,
    `시총 ${usd(r.marketCapUsd)} · 24h 거래 ${usd(r.volume24hUsd)} · 보유자 ${r.holders} · ${age(r.ageMinutes)} 전 생성`,
    "",
    ...(warnings.length ? warnings : r.flags.filter((f) => f.severity === "low").slice(0, 2)).map((f) => `${ICON[f.severity]} ${esc(f.text)}`),
    ...goods.map((f) => `${ICON[f.severity]} ${esc(f.text)}`),
  ];
  if (webBase) lines.push("", `<a href="${webBase}/t/${r.token.address}">자세히 보기</a>`);
  lines.push(`<i>${DISCLAIMER}</i>`);
  return lines.join("\n");
}

/** Plain-text version for the command line. */
export function textReport(r: Report): string {
  return [
    `${r.token.name} ($${r.token.symbol}) ${CHAIN_LABEL[r.chain]} ${r.token.address}`,
    `${LEVEL_LABEL[r.level]}  점수 ${r.score}/100`,
    `시총 ${usd(r.marketCapUsd)} · 24h ${usd(r.volume24hUsd)} · 보유자 ${r.holders} · ${age(r.ageMinutes)}`,
    `개발자 이력: 다른 토큰 ${r.creatorHistory.launches}개, 실패 ${r.creatorHistory.failed}${r.chain === "elysium" ? `, 졸업 ${r.creatorHistory.graduated}` : ""}`,
    ...r.flags.map((f) => `  ${ICON[f.severity]} ${f.text}`),
  ].join("\n");
}

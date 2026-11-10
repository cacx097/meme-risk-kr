// Web pages served by the same process as the bot: token report, creator history, stats, method.
import { createServer, type Server } from "node:http";
import { analyze, findAddress } from "./analyze.js";
import { montra } from "./chains/montra.js";
import { errorMessage } from "./bot.js";
import { CHAIN_LABEL, DISCLAIMER, esc, usd } from "./format.js";
import { isFailedLaunch, type Report } from "./score.js";
import type { Store } from "./store.js";

const LEVEL: Record<Report["level"], [string, string]> = {
  high: ["위험 신호 많음", "var(--red)"],
  caution: ["주의", "var(--yellow)"],
  low: ["위험 신호 적음", "var(--green)"],
};
const SEV: Record<string, string> = { high: "🔴", mid: "🟡", low: "⚪", good: "🟢" };

function page(title: string, body: string, botUser?: string): string {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><style>
:root{--bg:#fafaf9;--fg:#1c1917;--muted:#78716c;--card:#fff;--line:#e7e5e4;--red:#dc2626;--yellow:#ca8a04;--green:#16a34a;--accent:#4f46e5}
@media (prefers-color-scheme:dark){:root{--bg:#0c0a09;--fg:#f5f5f4;--muted:#a8a29e;--card:#1c1917;--line:#292524;--red:#f87171;--yellow:#facc15;--green:#4ade80;--accent:#818cf8}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.6 system-ui,-apple-system,"Apple SD Gothic Neo","Malgun Gothic",sans-serif}
main{max-width:760px;margin:0 auto;padding:24px 16px 64px}a{color:var(--accent)}h1{font-size:1.5rem;margin:.2em 0}h2{font-size:1.1rem;margin-top:2em}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px 18px;margin:12px 0}
.muted{color:var(--muted);font-size:.9rem}.badge{display:inline-block;font-weight:700;padding:2px 10px;border-radius:999px;border:2px solid currentColor}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}.num{font-size:1.3rem;font-weight:700}
ul.flags{list-style:none;padding:0;margin:0}ul.flags li{padding:6px 0;border-bottom:1px solid var(--line)}ul.flags li:last-child{border:0}
code{font-size:.85em;word-break:break-all}table{width:100%;border-collapse:collapse;font-size:.9rem}td,th{text-align:left;padding:6px 4px;border-bottom:1px solid var(--line)}
form{display:flex;gap:8px}input{flex:1;min-width:0;padding:10px 12px;border-radius:8px;border:1px solid var(--line);background:var(--card);color:var(--fg);font:inherit}
button{padding:10px 16px;border-radius:8px;border:0;background:var(--accent);color:#fff;font:inherit;font-weight:600}
</style></head><body><main><p class="muted"><a href="/">← 홈</a> · <a href="/stats">통계</a> · <a href="/method">점수 계산 방법</a>${botUser ? ` · <a href="https://t.me/${esc(botUser)}">텔레그램 봇</a>` : ""}</p>
${body}<p class="muted" style="margin-top:3em">${DISCLAIMER} 데이터 출처: Montra, RugCheck, DexScreener 공개 API.</p></main></body></html>`;
}

const search = `<form action="/t" method="get"><input name="q" placeholder="토큰 주소 (Elysium 0x... 또는 Solana)" aria-label="토큰 주소"><button>검사</button></form>`;

export function reportHtml(r: Report): string {
  const [label, color] = LEVEL[r.level];
  const links =
    r.chain === "elysium"
      ? `<a href="/c/${r.token.creator}">개발자 이력 전체 보기</a> · <a href="https://dexscreener.com/elysium/${r.token.address}">DexScreener</a>`
      : `<a href="https://rugcheck.xyz/tokens/${r.token.address}">RugCheck</a> · <a href="https://dexscreener.com/solana/${r.token.address}">DexScreener</a>`;
  return `<h1>${esc(r.token.name)} <span class="muted">$${esc(r.token.symbol)} · ${CHAIN_LABEL[r.chain]}</span></h1>
<p class="muted"><code>${r.token.address}</code></p>
<div class="card"><span class="badge" style="color:${color}">${label}</span> <b style="margin-left:8px">점수 ${r.score}/100</b>
<div class="grid" style="margin-top:12px"><div><div class="muted">시가총액</div><div class="num">${usd(r.marketCapUsd)}</div></div>
<div><div class="muted">24시간 거래</div><div class="num">${usd(r.volume24hUsd)}</div></div>
<div><div class="muted">보유자</div><div class="num">${r.holders.toLocaleString()}</div></div>
<div><div class="muted">생성</div><div class="num">${r.ageMinutes < 120 ? `${r.ageMinutes}분 전` : `${Math.round(r.ageMinutes / 60)}시간 전`}</div></div></div></div>
<h2>근거</h2><div class="card"><ul class="flags">${r.flags.map((f) => `<li>${SEV[f.severity]} ${esc(f.text)}</li>`).join("") || "<li>눈에 띄는 위험 신호가 없습니다.</li>"}</ul></div>
<h2>개발자 지갑</h2><div class="card">다른 토큰 ${r.creatorHistory.launches}개 · 실패 ${r.creatorHistory.failed}개${r.chain === "elysium" ? ` · 졸업 ${r.creatorHistory.graduated}개` : ""}<br>${links}</div>`;
}

async function route(path: string, query: URLSearchParams, store: Store, botUser?: string): Promise<[number, string, string]> {
  const html = (body: string, title = "밈코인 위험 점수") => [200, "text/html; charset=utf-8", page(title, body, botUser)] as [number, string, string];

  if (path === "/") {
    const s = await montra.stats().catch(() => null);
    return html(`<h1>밈코인 위험 점수</h1><p>Elysium(Montra)과 Solana 토큰 주소를 넣으면 개발자 이력, 보유 쏠림, 수수료, 가짜 토큰 여부를 한국어로 요약합니다.</p>${search}
${s ? `<div class="card grid"><div><div class="muted">Montra 누적 토큰</div><div class="num">${s.tokensLaunched.toLocaleString()}</div></div><div><div class="muted">최근 24시간 발행</div><div class="num">${s.launched24h.toLocaleString()}</div></div><div><div class="muted">24시간 거래</div><div class="num">${usd(s.volume24hUsd)}</div></div></div>` : ""}`);
  }
  if (path === "/t") {
    const a = findAddress(query.get("q") ?? "");
    return a ? [302, `/t/${a}`, ""] : html(`<p>올바른 토큰 주소를 입력해 주세요.</p>${search}`);
  }
  const t = path.match(/^\/t\/(0x[a-fA-F0-9]{40}|[1-9A-HJ-NP-Za-km-z]{32,44})$/);
  if (t) {
    try {
      const r = await analyze(t[1]);
      store.countCheck();
      return html(reportHtml(r), `${r.token.symbol} 위험 점수`);
    } catch (e) {
      return [404, "text/html; charset=utf-8", page("찾을 수 없음", `<p>${esc(errorMessage(e, t[1]))}</p>${search}`, botUser)];
    }
  }
  const c = path.match(/^\/c\/(0x[a-fA-F0-9]{40})$/);
  if (c) {
    const { tokens } = await montra.launchesBy(c[1]);
    const now = Date.now();
    const rows = tokens
      .map((x) => `<tr><td><a href="/t/${x.address}">${esc(x.symbol)}</a></td><td>${usd(x.marketCapUsd)}</td><td>${x.graduation.stage === "graduated" ? "졸업" : isFailedLaunch(x, now) ? "실패" : "진행 중"}</td><td>${new Date(x.launchedAt).toISOString().slice(0, 16).replace("T", " ")}</td></tr>`)
      .join("");
    return html(`<h1>개발자 지갑 이력</h1><p class="muted"><code>${c[1]}</code></p><p>이 지갑이 Montra에서 만든 토큰 ${tokens.length}개</p>
<div class="card" style="overflow-x:auto"><table><tr><th>토큰</th><th>시총</th><th>상태</th><th>생성(UTC)</th></tr>${rows}</table></div>`, "개발자 이력");
  }
  if (path === "/stats") {
    const [s, grad] = await Promise.all([montra.stats().catch(() => null), montra.graduatedCount().catch(() => null)]);
    const rate = s && grad !== null ? ((grad / s.tokensLaunched) * 100).toFixed(2) : "?";
    return html(`<h1>공개 통계</h1><div class="card grid">
<div><div class="muted">Montra 누적 토큰</div><div class="num">${s?.tokensLaunched.toLocaleString() ?? "?"}</div></div>
<div><div class="muted">졸업한 토큰</div><div class="num">${grad ?? "?"}</div></div>
<div><div class="muted">졸업률</div><div class="num">${rate}%</div></div></div>
<h2>이 서비스 사용량</h2><div class="card grid"><div><div class="muted">사용자</div><div class="num">${store.state.users.length}</div></div>
<div><div class="muted">그룹</div><div class="num">${store.state.groups.length}</div></div><div><div class="muted">누적 검사</div><div class="num">${store.state.checks}</div></div></div>`, "공개 통계");
  }
  if (path === "/method") {
    return html(`<h1>점수 계산 방법</h1><p>AI 추측이 아니라 공개 데이터에 정해진 규칙을 적용합니다. 🔴 +30, 🟡 +15, ⚪ +5, 🟢 −10점을 더해 0~100으로 자릅니다. 60점 이상은 "위험 신호 많음", 30점 이상은 "주의"입니다.</p>
<div class="card"><ul class="flags">
<li>🔴/🟡 거래 수수료 5% 이상 / 2% 이상, 수수료 변경 가능, 초기 매수 방지 수수료 진행 중</li>
<li>🔴/🟡 개발자 보유 20% 이상 / 10% 이상, 상위 10개 지갑 보유 50% 이상 / 30% 이상</li>
<li>🔴/🟡 개발자 지갑의 다른 토큰(6시간 넘은 것) 중 80% 이상 / 50% 이상 실패, 6시간 안에 10개 이상 발행</li>
<li>🔴/🟡 같은 이름의 더 오래되고 큰 토큰이 있음(가짜 가능성) / 같은 이름 토큰 여러 개</li>
<li>🟡 보유자당 24시간 거래량 $5,000 초과(자전거래 의심), 졸업 후 기준 아래로 하락</li>
<li>⚪ 생긴 지 1시간 미만, 유동성 미봉인, 수수료가 제3 지갑으로</li>
<li>🟢 Montra 공식 토큰, 수수료 보유자 분배, 개발자의 졸업 토큰 이력</li></ul></div>
<h2>Solana 추가 규칙</h2><div class="card"><ul class="flags">
<li>🔴 추가 발행 권한 또는 지갑 동결 권한이 남아 있음, 영구 이동 권한, RugCheck 러그 표시</li>
<li>🔴/🟡 전송 수수료 5% 이상 / 2% 이상, 개발자·상위 10개 지갑 보유 비율(유동성 풀 제외), 개발자 지갑의 실패 이력</li>
<li>🟡 pump.fun 졸업 후 유동성 $10,000 미만, 유동성 풀 잠금 50% 미만, 유명 토큰 이름 베낌</li>
<li>⚪ 아직 pump.fun 본딩 커브 단계, 토큰 정보 변경 가능</li></ul></div>
<p class="muted">"실패"는 (Elysium은 졸업하지 못하고) 시가총액 $5,000 미만에 머문, 생성 6시간이 넘은 토큰입니다.</p>`, "점수 계산 방법");
  }
  return [404, "text/plain; charset=utf-8", "not found"];
}

export function startWeb(port: number, store: Store, botUser?: string): Server {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    try {
      const [status, type, body] = await route(url.pathname, url.searchParams, store, botUser);
      if (status === 302) res.writeHead(302, { location: type }).end();
      else res.writeHead(status, { "content-type": type, "cache-control": "public, max-age=20" }).end(body);
    } catch (e) {
      console.error("web", (e as Error).message);
      res.writeHead(500, { "content-type": "text/plain; charset=utf-8" }).end("일시적인 오류입니다.");
    }
  });
  return server.listen(port);
}

export { route as _route };

# STATE

## 지금 상태 (2026-11-10)
- 하는 일: Elysium(Montra) 밈코인 위험 점수 텔레그램 봇과 웹. 계획은 `plan/2026-11-10-memecoin-risk-bot.md`.
- 봇: @MemeRiskKR_bot. 1:1 대화 실제 동작 확인 완료. 그룹 자동 응답은 미확인.
- 완료:
  - 엔진: `src/score.ts`, `src/analyze.ts`, `src/chains/montra.ts`
  - 웹: `src/web.ts`
  - 알림: `src/alerts.ts`
  - 봇: `src/bot.ts`
  - 테스트 12개 통과
- 홍보 문구 초안: `docs/launch-ko.md`
- 봇 토큰은 프로젝트에 저장하지 않았다. 실행할 때 `TELEGRAM_BOT_TOKEN` 환경 변수로 넣는다.

- 코드 공개: https://github.com/cacx097/meme-risk-kr (GitHub 계정은 항상 cacx097)
- 서버: Railway Hobby(월 5달러, 사용 한도 5달러). 프로젝트 `meme-risk-kr`, 서비스 `bot`, 저장 공간 `/data`. `railway up --service bot`으로 올린다. 2026-11-10 배포 성공, 로그에 `bot: @MemeRiskKR_bot`.
- PC에서 같은 봇 토큰으로 동시에 실행하지 않는다.

- 서버 봇 1:1·그룹 동작 사용자 확인 완료. Railway Compute 한도 $10, 알림 $5.
- Solana 지원 완료: `src/chains/solana.ts`(RugCheck + DexScreener), `src/score-solana.ts`. 테스트 20개 통과.

- 안정성 보강(2026-11-10): 동시 처리(@grammyjs/runner), 그룹 같은 주소 10분 1회 답변, 종료 시 진행 중 작업 대기 후 저장, 상태 파일 안전 저장, 캐시 정리. 테스트 25개.
- 사전 검증: `validation/forward-2026-11-10-1421.json`(116개 점수 기록). 11/12 14:21 UTC 이후 `npx tsx scripts/forward-test.ts eval validation/forward-2026-11-10-1421.json`.
- 그랜트: Superteam 지역 그랜트는 전부 일시 중지(11/10 API 확인). Solana Foundation 표준 그랜트로 방향을 바꿨다. 초안은 `private/grant-solana-foundation.md`(git 제외).

- Base 지원 완료(2026-11-11): `src/chains/base.ts`(GoPlus + Honeypot.is + DexScreener), `src/score-base.ts`. 0x 주소는 Montra 먼저, 없으면 Base. 테스트 42개.
  - GoPlus는 키 없이 분당 약 10회. 한도를 넘거나 새 토큰이라 데이터가 없으면 "확인하지 못한 항목"으로 표시하고 등급은 최소 주의.
  - Base 사전 검증 기록: `validation/forward-2026-11-10-231135.json`(39개, 기록 시각 UTC). 11/12 23:12 UTC 이후 평가.

## 다음
1. 11/12 사전 검증 평가(Elysium·Solana는 14:21 UTC 이후, Base는 23:12 UTC 이후), 결과를 그랜트 초안에 반영.
2. Base Builder Grant 신청 경로 확인과 초안.
3. (사용자 결정) GoPlus 무료 키 발급 여부.

## Project rules
- 읽기 전용이다. 지갑 키와 매매 기능은 넣지 않는다. 투자 권유 문구를 쓰지 않고 안내 문구를 고정한다.
- 점수는 규칙으로 계산하고 근거를 공개한다. "안전"이라고 쓰지 않는다.

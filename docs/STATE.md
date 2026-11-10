# STATE

## 지금 상태 (2026-11-10)
- 하는 일: Elysium(Montra) 밈코인 위험 점수 텔레그램 봇과 웹. 계획은 `plan/2026-11-10-memecoin-risk-bot.md`.
- 완료:
  - 엔진: `src/score.ts`, `src/analyze.ts`, `src/chains/montra.ts`
  - 웹: `src/web.ts`
  - 알림: `src/alerts.ts`
  - 봇 코드: `src/bot.ts`
  - 테스트 12개 통과
- 미검증: 실제 텔레그램 동작 (봇 토큰 필요)

## 다음
1. 봇 토큰을 받으면 로컬에서 `TELEGRAM_BOT_TOKEN=... npm start`로 실제 1:1 대화와 그룹에서 확인한다.
2. 공개 준비 (사용자 승인 필요): 실행 장소, 공개 웹 주소(`WEB_BASE`), 코드 공개, 홍보 문구.
3. Solana 어댑터 (블록 5).

## Project rules
- 읽기 전용이다. 지갑 키와 매매 기능은 넣지 않는다. 투자 권유 문구를 쓰지 않고 안내 문구를 고정한다.
- 점수는 규칙으로 계산하고 근거를 공개한다. "안전"이라고 쓰지 않는다.

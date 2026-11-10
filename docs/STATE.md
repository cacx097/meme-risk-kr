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
- 서버: Railway Hobby(월 5달러)로 결정. 사용자 가입·결제 대기.

## 다음
1. Railway에 배포한다 (README의 "서버에 올리기"). 웹은 공개 주소 없이 봇만 먼저 공개한다.
2. Solana 어댑터 (블록 5).

## Project rules
- 읽기 전용이다. 지갑 키와 매매 기능은 넣지 않는다. 투자 권유 문구를 쓰지 않고 안내 문구를 고정한다.
- 점수는 규칙으로 계산하고 근거를 공개한다. "안전"이라고 쓰지 않는다.

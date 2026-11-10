# 밈코인 위험 점수 (텔레그램 봇 + 웹) · Elysium · Solana

텔레그램 봇: [@MemeRiskKR_bot](https://t.me/MemeRiskKR_bot)

Elysium(Montra)이나 Solana 토큰 주소를 넣으면 개발자 이력, 보유 쏠림, 수수료·권한, 가짜 토큰 여부를 한국어로 요약합니다.
읽기 전용이며 지갑 키를 다루지 않습니다. 점수 규칙은 `/method` 페이지와 `src/score.ts`, `src/score-solana.ts`에 공개되어 있습니다.
데이터: Montra 공개 API(Elysium), RugCheck·DexScreener 공개 API(Solana).

## 실행
```
npm install
npm test                         # 단위 테스트
npm run check -- 0x토큰주소       # 명령줄 검사
npm start                        # 웹(기본 http://localhost:8787), 토큰이 있으면 봇도 실행
npx tsx scripts/validate.ts      # 실제 졸업 토큰으로 점수 검증 (Elysium)
npx tsx scripts/validate-solana.ts  # 실제 토큰으로 점수 검증 (Solana)
```

환경 변수:
- `TELEGRAM_BOT_TOKEN`: @BotFather에서 발급. 없으면 웹만 실행됩니다.
- `BOT_USERNAME`: 웹에 봇 링크를 표시할 때 씁니다.
- `WEB_BASE`: 봇 메시지에 넣을 공개 웹 주소입니다.
- `PORT`: 웹 포트입니다.
- `DATA_FILE`: 사용 통계와 알림 설정을 저장할 파일입니다. 기본값은 `data/state.json`입니다.

## 서버에 올리기 (Railway)
1. Railway에서 이 저장소로 새 서비스를 만든다. 시작 명령은 `npm start`(자동 인식).
2. Variables에 `TELEGRAM_BOT_TOKEN`, `BOT_USERNAME`, `DATA_FILE=/data/state.json`을 넣는다.
3. Volume을 `/data`에 붙인다. 이렇게 해야 다시 배포해도 사용 통계와 알림 설정이 남는다.
4. 같은 봇 토큰으로 두 곳에서 동시에 실행하지 않는다. 텔레그램이 한 곳만 허용하므로 PC에서 켠 봇은 먼저 끈다.

## 그룹에서 자동 응답을 쓰려면
텔레그램 봇은 기본 설정으로는 그룹의 일반 메시지를 읽지 못합니다. 그룹에서 주소가 올라올 때 자동으로 응답하게 하려면 아래 둘 중 하나가 필요합니다.
- @BotFather → `/setprivacy` → 봇 선택 → **Disable**
- 또는 그룹에서 봇을 관리자로 지정

## 봇 명령
- `/check 주소`: 위험 점수 보기
- `/watch 주소`: 위험 등급이 나빠지면 알림 (최대 20개)
- `/unwatch 주소`: 알림 끄기
- `/alerts 50000`: 시총 $50K를 넘은 새 토큰 알림 받기 (`/alerts off`로 끄기)

투자 조언이 아닌 공개 데이터 기반 참고 정보입니다.

# 트러블슈팅 기록

셀프 보안·코드 리뷰로 찾은 문제와 해결 과정이에요. 형식은 **증상 → 원인 → 해결 → 재발 방지**예요.

| ID | 날짜 | 분류 | 제목 | 상태 |
|---|---|---|---|---|
| TS-01 | 2026-10-14 | 조회수 | 날짜를 UTC로 잘라 KST 오전 9시에 하루가 바뀜, RPC 실패에도 잠금이 걸림 | 해결 (서버 측 중복 판정은 남은 일) |
| TS-02 | 2026-10-14 | 보안 | 리뷰 삭제 비밀번호가 숫자 4자리 → 무차별 대입으로 남의 리뷰 삭제 가능 | 해결 (기존 리뷰는 남은 일) |
| TS-03 | 2026-10-14 | 동시성 | "하루 1회" 리뷰 제한이 조회 후 저장 2단계 → 동시 요청 두 건 통과 | 해결 (SQL 마이그레이션 실행 필요) |
| TS-04 | 2026-10-14 | 개인정보 | IP 해시 pepper가 선택 사항 → pepper 없으면 IP 복원 가능 | 경고 명확화 (Vercel 환경변수 설정 필요) |
| TS-05 | 2026-10-14 | 빌드 | CI에서 `npm ci` 실패: lock 파일이 package.json과 어긋남 | 임시 대응 |
| TS-06 | 2026-10-16 | 보안 | 리뷰 API CORS가 `*` → 아무 사이트에서나 방문자 브라우저로 호출 | 해결 |
| TS-07 | 2026-10-16 | 보안 | `X-Forwarded-For` 첫 값을 IP로 신뢰 → 헤더 위조로 하루 1회 제한 우회 | 해결 |
| TS-08 | 2026-10-16 | 보안 | Supabase RLS 미적용 → 공개 anon 키로 `password_hash` 조회·데이터 수정 가능 | 해결 (SQL 마이그레이션 실행 필요) |
| TS-09 | 2026-10-16 | 빌드/React | CI lint 실패: effect 안 동기 setState (react-hooks v7), 실패 원인이 PR에 안 보임 | 해결 |

---

### TS-01 조회수: UTC 날짜와 무시된 RPC 오류
- **증상:** 하루 1회 조회수 제한이 한국 시간 오전 9시에 초기화됨. RPC가 실패해도 그날은 다시 시도하지 않음.
- **원인:**
  - `new Date().toISOString().split('T')[0]`은 **UTC** 날짜. 리뷰 제한은 KST 자정 기준이라 규칙이 어긋남.
  - supabase-js v2의 `rpc()`는 실패해도 예외를 던지지 않고 `{ data, error }`를 돌려줌. try/catch만 있어서 실패해도 잠금을 걸었음.
- **해결:** `Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' })`로 KST 날짜 사용, `error`가 있으면 잠그지 않고 종료.
- **남은 일:** 중복 방지가 브라우저 localStorage에만 있어 공개 키로 RPC를 직접 호출하면 우회돼요. 서버리스 함수에서 `(식당, 방문자 해시, KST 날짜)` PK 테이블에 `INSERT ... ON CONFLICT DO NOTHING` 후 증가시키고, 공개 키의 RPC 실행 권한은 회수할 예정이에요.

### TS-02 리뷰 삭제 키가 숫자 4자리
- **증상(분석):** 리뷰 ID는 조회 API로 공개되고, 삭제 비밀번호는 0000~9999 중 하나. 삭제 실패 횟수 제한도 없어 최대 1만 번 시도로 남의 리뷰를 지울 수 있는 구조. 서버리스는 요청이 몰리면 인스턴스가 늘어나 bcrypt의 느림도 큰 장벽이 아님.
- **원인:** 처음엔 사용자가 직접 입력하는 비밀번호라 4자리로 정했는데, UX 개선으로 **자동 생성**으로 바꾼 뒤에도 길이를 그대로 둠.
- **해결:** 브라우저가 `crypto.randomUUID()`(122비트 이상 무작위)로 삭제 키를 만들고, API는 32~64자 토큰만 받음.
- **남은 일:** 이미 작성된 리뷰는 4자리 키 그대로예요. 삭제 실패를 IP 해시 기준으로 세어 일정 횟수 이상이면 차단하는 기능을 추가할 예정이에요.

### TS-03 "하루 1회" 제한의 Race Condition
- **증상(분석):** 같은 요청을 동시에 두 번 보내면 둘 다 "오늘 작성 0건"을 보고 저장됨.
- **원인:** 애플리케이션에서 조회 → 저장 2단계로 판단.
- **해결:** `supabase/migration-2026-10-14-review-daily-unique.sql` — KST 날짜 컬럼(`review_date`)을 트리거로 채우고 `(hashed_ip, restaurant_id, review_date)` 유니크 인덱스 추가. API는 위반(`23505`)을 429로 변환.
- **적용 방법:** Supabase SQL Editor에서 마이그레이션을 한 번 실행해야 해요.
- **마이그레이션 전에도 안 깨지는 이유:** API는 `review_date`를 읽거나 쓰지 않고(트리거가 채움), 인덱스가 없으면 `23505`가 안 날 뿐 기존 "조회 후 저장" 검사로 동작해요. 대신 그 사이에는 동시 요청을 못 막아요.
- **추가 수정(2026-10-16):** 마이그레이션을 `begin/commit`으로 묶어 기존 중복 행 때문에 인덱스 생성이 실패하면 컬럼·트리거도 함께 롤백되게 했어요. 사전 중복 확인 쿼리가 아직 없는 `review_date`를 참조하던 것도 `created_at`의 KST 날짜로 바꿨어요.

### TS-04 pepper 없는 IP 해시
- **위험:** `REVIEW_IP_PEPPER`가 없으면 SHA-256(IP)만 저장돼, IPv4 전체를 미리 해시해 대조하면 IP를 복원할 수 있어요.
- **조치:** 환경변수가 없으면 서버 로그에 경고를 남겨요. 운영 환경(Vercel)에 pepper가 설정돼 있는지 확인이 필요해요.
- **추가 수정(2026-10-16):** pepper가 없어도 리뷰 작성은 막지 않아요(설정 누락으로 운영이 멈추는 것보다 경고가 낫다고 판단). 대신 경고 문구에 위험·조치·부작용을 모두 적고, `VERCEL_ENV=production`에서는 `console.error`로 남겨요.
- **할 일:** Vercel → Settings → Environment Variables에 `REVIEW_IP_PEPPER`(32바이트 이상 랜덤, `.env.example`에 생성 명령)를 Production·Preview에 추가하고 재배포.
- **주의:** pepper를 추가·변경하면 같은 IP의 해시가 바뀌어, 그날의 하루 1회 제한이 한 번 초기화돼요. pepper는 한 번 정하면 바꾸지 않아요.

### TS-05 CI에서 `npm ci` 실패
- **증상:** `npm ci can only install packages when your package.json and package-lock.json ... are in sync`, `Missing: @emnapi/core@1.11.3 from lock file`.
- **원인:** 의존성을 바꾼 뒤 `package-lock.json`을 함께 커밋하지 않음. Vercel은 `npm install`을 써서 드러나지 않았어요.
- **임시 대응:** CI는 `npm install`로 설치. 
- **해결 예정:** 로컬에서 `npm install` 후 갱신된 `package-lock.json`을 커밋하고 CI를 `npm ci`로 되돌려요(같은 버전 재현을 보장하기 위해).

### TS-06 리뷰 API의 CORS `*`
- **증상(분석):** `Access-Control-Allow-Origin: *`라 어떤 사이트든 방문자 브라우저로 `/api/reviews`를 호출하고 응답을 읽을 수 있었어요. 리뷰 쓰기는 IP 기준으로 제한하는데, 다른 사이트가 방문자 IP로 리뷰를 대신 남기게 할 수 있는 구조였어요.
- **원인:** 로컬에서 Vite(`localhost:3000`)만 띄우고 배포 API를 부르려고 전부 허용해 둠.
- **해결:** `api/_lib/http.js`
  - 허용 목록(운영 `https://chosun-food-map.vercel.app`, `http://localhost:3000`, `http://127.0.0.1:3000`, 추가는 `ALLOWED_ORIGIN`)에 있는 Origin만 그대로 반사, `Vary: Origin`.
  - 허용 안 된 출처의 preflight는 403.
  - **POST/DELETE는 `Content-Type: application/json`만 받음(415).** `text/plain` 같은 단순 요청은 preflight 없이 다른 사이트에서 보낼 수 있어, CORS 허용 목록만으로는 쓰기를 못 막기 때문이에요.
- **기존 동작이 안 깨지는 이유:** 프론트와 API가 같은 출처(운영·Preview 배포 모두)라 브라우저가 CORS 검사를 하지 않아요. 프론트는 이미 `application/json`으로 보내요.
- **트레이드오프:** 출처 패턴(`*.vercel.app`)을 허용하면 남의 Vercel 프로젝트도 통과하므로 정확히 일치만 허용. 대신 커스텀 도메인을 붙이면 `ALLOWED_ORIGIN`을 설정해야 해요(같은 출처에서 부르면 필요 없음).
- **재발 방지:** `test/http.test.js`, `test/reviews-handler.test.js`.

### TS-07 위조 가능한 `X-Forwarded-For`
- **증상(분석):** `X-Forwarded-For: 1.1.1.1`처럼 헤더를 직접 넣고 값을 바꿔 가며 보내면 매번 다른 IP 해시가 돼 하루 1회 제한을 우회할 수 있었어요.
- **원인:** 프록시 체인에서 첫 값은 **클라이언트가 보낸 값**일 수 있는데 그대로 신뢰함.
- **해결:** Vercel 엣지가 직접 설정하는 `x-vercel-forwarded-for` → `x-real-ip` 순으로 쓰고, 둘 다 없으면(로컬) 소켓 주소. `X-Forwarded-For`는 읽지 않아요. `::ffff:a.b.c.d`는 IPv4로 정규화.
- **트레이드오프:** Vercel 앞에 다른 프록시(Cloudflare 등)를 두면 이 헤더들이 그 프록시 IP가 될 수 있어요. 그때는 해당 프록시가 주는 헤더로 바꿔야 해요.

### TS-08 Supabase RLS 미적용
- **위험:** 브라우저 번들에 들어 있는 anon 키로 Supabase REST API(`/rest/v1/reviews?select=password_hash,hashed_ip`)를 직접 부르면 서버리스 API를 거치지 않고 민감 컬럼을 읽거나, 식당·리뷰를 수정·삭제할 수 있는 구조였어요(RLS·권한이 Supabase 기본값이라면).
- **해결:** `supabase/migration-2026-10-16-rls-anon-read-only.sql`
  - `restaurants`: RLS + anon SELECT 정책, 쓰기 권한 회수, 예전 개발용 "anon insert" 정책 제거.
  - `reviews`: RLS + 공개 컬럼만 **컬럼 단위 GRANT** → `password_hash`·`hashed_ip`는 anon이 못 읽음.
  - `increment_visit_count`가 SECURITY INVOKER면 SECURITY DEFINER + `search_path` 고정으로 변경. anon의 UPDATE 권한을 회수하면 조회수 RPC가 막히기 때문이에요.
- **확인한 것:** 서버리스 API·`uploadData.js`는 service role(RLS 우회)이라 영향 없음. 로컬 PostgreSQL 16에 Supabase 역할(anon/authenticated/service_role)을 흉내 낸 스키마로 적용해, anon 읽기(뷰, 공개 컬럼)·RPC 성공, 민감 컬럼·쓰기 차단, service role 쓰기 성공, `restaurants_with_stats` 뷰가 security_invoker여도 동작함을 확인했어요.
- **남은 일:** `restaurants`·뷰·RPC 정의가 저장소에 없어 운영 DB와 다를 수 있어요. 파일 상단 "0단계" 쿼리로 먼저 확인하고 실행하세요. 조회수 RPC는 여전히 공개 키로 직접 부를 수 있어요(TS-01 남은 일).

### TS-09 CI lint 실패: effect 안 동기 setState
- **증상:** CI에 `npm run lint`를 넣자 실패했는데 PR 화면에 원인이 표시되지 않음.
- **원인:**
  - `eslint-plugin-react-hooks` v7의 `set-state-in-effect` 규칙. `RestaurantReviews.jsx`에서 (1) 리뷰 조회 effect가 `setLoading(true)`·`setError(null)`을 동기로 호출, (2) `isModalOpen`을 보는 effect에서 폼 state를 초기화. effect → setState → 다시 렌더가 연쇄로 일어나는 패턴.
  - 이 규칙의 메시지는 여러 줄이라 `setup-node`의 기본 problem matcher가 주석으로 만들지 못함.
- **해결:**
  - 조회: `loading`을 state에서 빼고 "현재 요청 키(`식당id#재조회번호`)의 결과가 아직 없음"으로 렌더 중 계산. 조회는 state를 건드리지 않는 `fetchReviews()`로 분리하고 effect는 비동기 결과만 반영. 작성·삭제 후 재조회는 핸들러에서 번호를 올림. `ignore` 플래그로 늦게 온 이전 식당 응답이 덮어쓰던 경쟁 상태도 함께 막음.
  - 모달: 폼 초기화를 effect에서 "여는" 이벤트 핸들러(`openModal`)로 이동.
  - CI: `eslint -f json` 결과를 `scripts/eslint-annotate.mjs`가 파일별 `::error` 주석으로 출력, 오류가 있으면 실패.
- **재발 방지:** lint를 CI 필수 단계로 유지. `eslint-disable`로 덮지 않음.

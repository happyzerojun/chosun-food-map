-- 2026-10-16 RLS: 브라우저(anon 키)는 읽기만, 쓰기는 서버리스 함수(service role 키)만 (docs/troubleshooting.md TS-08)
--
-- 왜: anon 키는 브라우저 번들에 그대로 들어 있어 누구나 볼 수 있습니다.
--     RLS가 꺼져 있으면 이 키로 Supabase REST API(/rest/v1/reviews 등)를 직접 호출해
--     password_hash·hashed_ip를 읽거나 식당·리뷰를 수정·삭제할 수 있습니다(서버리스 API의 검증을 건너뜀).
--
-- 실행 순서: 이 파일은 migration-2026-10-14-review-daily-unique.sql 다음에 실행합니다(서로 독립이라 반대로 해도 동작은 같음).
-- 실행 위치: Supabase 대시보드 → SQL Editor. 다시 실행해도 안전합니다(drop policy if exists / grant·revoke는 멱등).
--
-- 영향 범위(코드로 확인한 접근 경로):
--   - 프론트(anon):   restaurants_with_stats 뷰 SELECT (src/App.jsx), increment_visit_count RPC (src/App.jsx)
--   - 서버리스(service role): reviews SELECT/INSERT/DELETE (api/reviews.js) → service_role은 RLS를 우회하므로 영향 없음
--   - uploadData.js: SUPABASE_SERVICE_ROLE_KEY 사용 → 영향 없음
--
-- ─────────────────────────────────────────────────────────────────────────────
-- [0단계] 실행 전 확인 (아래 쿼리를 따로 실행해 결과를 기록해 두세요)
--
--   -- RLS 상태 (restaurants, reviews 외에 public 테이블이 더 있으면 그 테이블도 정책이 필요한지 검토)
--   select tablename, rowsecurity from pg_tables where schemaname = 'public' order by 1;
--
--   -- 조회수 함수가 SECURITY DEFINER인지(prosecdef), 소유자가 누구인지
--   select p.oid::regprocedure, p.prosecdef, pg_get_userbyid(p.proowner) as owner, pg_get_functiondef(p.oid)
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public' and p.proname = 'increment_visit_count';
--
--   -- 뷰가 security_invoker인지(reloptions에 security_invoker=true가 있는지)와 뷰 정의
--   select c.relname, c.reloptions, pg_get_userbyid(c.relowner) as owner from pg_class c where c.relname = 'restaurants_with_stats';
--   select pg_get_viewdef('public.restaurants_with_stats', true);
--
-- 뷰 정의에 reviews.password_hash·hashed_ip가 쓰이면(드묾) 아래 2번의 컬럼 GRANT에 맞춰 뷰를 먼저 고쳐야 합니다.
-- ─────────────────────────────────────────────────────────────────────────────

begin;

-- 1. restaurants: 누구나 읽기, 쓰기는 service role만
alter table public.restaurants enable row level security;

revoke insert, update, delete, truncate on public.restaurants from anon, authenticated;
grant select on public.restaurants to anon, authenticated;

drop policy if exists restaurants_select_public on public.restaurants;
create policy restaurants_select_public on public.restaurants
  for select to anon, authenticated
  using (true);

-- uploadData.js 주석에 있던 개발용 "anon insert 허용" 정책이 남아 있으면 제거
drop policy if exists "allow insert for anon migration" on public.restaurants;


-- 2. reviews: anon은 공개 컬럼만 읽기. password_hash·hashed_ip는 컬럼 권한에서 제외
--    (리뷰 목록은 /api/reviews가 service role로 내려주므로 프론트가 직접 읽지는 않음.
--     restaurants_with_stats 뷰가 security_invoker여도 평균 별점·리뷰 수 계산이 깨지지 않도록 공개 컬럼만 허용)
alter table public.reviews enable row level security;

revoke all on public.reviews from anon, authenticated;
grant select (id, restaurant_id, nickname, rating, content, tags, created_at)
  on public.reviews to anon, authenticated;

drop policy if exists reviews_select_public on public.reviews;
create policy reviews_select_public on public.reviews
  for select to anon, authenticated
  using (true);


-- 3. 조회수 RPC: anon이 restaurants를 UPDATE하지 못하게 됐으므로, 함수가 SECURITY INVOKER면
--    RLS·권한에 막혀 조회수가 더 이상 오르지 않습니다. SECURITY DEFINER(함수 소유자 권한)로 바꿉니다.
--    search_path를 고정해 다른 스키마의 같은 이름 객체로 바꿔치기되는 것을 막습니다.
--    (함수 본문은 바꾸지 않습니다. 이미 SECURITY DEFINER면 아무것도 하지 않습니다.)
do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 'increment_visit_count'
       and not p.prosecdef
  loop
    execute format('alter function %s security definer set search_path = public, pg_temp', f.sig);
    raise notice 'SECURITY DEFINER로 변경: %', f.sig;
  end loop;
end
$$;

commit;


-- ─────────────────────────────────────────────────────────────────────────────
-- [확인] 실행 후 anon 권한으로 동작 확인 (한 줄씩 실행. 각 블록은 rollback으로 끝나 데이터가 바뀌지 않습니다)
--
--   -- 성공해야 함: 프론트가 쓰는 뷰
--   begin; set local role anon; select id, name, visit_count from public.restaurants_with_stats limit 3; rollback;
--
--   -- 실패해야 함(permission denied for table reviews): 민감 컬럼
--   begin; set local role anon; select password_hash, hashed_ip from public.reviews limit 1; rollback;
--
--   -- 실패하거나 0행이어야 함: anon 쓰기
--   begin; set local role anon; update public.restaurants set name = name where false; rollback;
--
--   -- 성공해야 함: 조회수 RPC (rollback이라 실제로는 오르지 않음. restaurant_id 값은 실제 id로 바꿔서)
--   begin; set local role anon; select public.increment_visit_count(restaurant_id => '<실제 식당 id>'); rollback;
--
-- 배포 사이트에서 식당 목록·평균 별점이 그대로 보이고, 식당 클릭 시 브라우저 콘솔에
-- "조회수 업데이트 실패"가 없으면 정상입니다.
--
-- [되돌리기] 문제가 생기면:
--   alter table public.restaurants disable row level security;
--   alter table public.reviews disable row level security;
--   grant select, insert, update, delete on public.restaurants, public.reviews to anon, authenticated;
-- ─────────────────────────────────────────────────────────────────────────────

-- 2026-10-14 리뷰 "같은 식당 하루 1회" 규칙을 DB가 최종 보장하도록 (docs/troubleshooting.md TS-03)
-- Supabase SQL Editor에서 한 번 실행합니다. 이미 실행했다면 다시 실행해도 안전합니다(IF NOT EXISTS).
--
-- 기존 API는 "오늘 작성 수 조회 → 0이면 INSERT" 2단계라, 같은 요청이 동시에 두 번 오면 둘 다 통과할 수 있었습니다.
-- KST 날짜 컬럼을 트리거로 채우고 (hashed_ip, restaurant_id, review_date) 유니크 인덱스를 둡니다.
-- 위반 시 PostgreSQL 오류 코드 23505 → API가 429로 변환합니다.
--
-- 실행 전에도 API는 깨지지 않습니다: api/reviews.js는 review_date 컬럼을 읽거나 쓰지 않고(트리거가 채움),
-- 인덱스가 없으면 23505가 나지 않을 뿐 기존 "조회 후 저장" 검사로 동작합니다(동시 요청만 못 막음).
-- 전체를 트랜잭션으로 묶어, 중복 행 때문에 인덱스 생성이 실패하면 컬럼·트리거 추가도 함께 롤백됩니다.

begin;

alter table public.reviews add column if not exists review_date date;

-- 기존 행 채우기
update public.reviews
   set review_date = (created_at at time zone 'Asia/Seoul')::date
 where review_date is null;

create or replace function public.set_review_date_kst()
returns trigger
language plpgsql
as $$
begin
  new.review_date := (coalesce(new.created_at, now()) at time zone 'Asia/Seoul')::date;
  return new;
end;
$$;

drop trigger if exists trg_reviews_set_review_date on public.reviews;
create trigger trg_reviews_set_review_date
  before insert on public.reviews
  for each row execute function public.set_review_date_kst();

alter table public.reviews alter column review_date set not null;

-- 주의: 이미 같은 IP·식당·날짜 중복 행이 있으면 아래 인덱스 생성이 실패하고 전체가 롤백됩니다.
-- 실행 전에 따로 확인(review_date 컬럼이 아직 없어도 동작하도록 created_at으로 계산):
--   select hashed_ip, restaurant_id, (created_at at time zone 'Asia/Seoul')::date as d, count(*)
--     from public.reviews group by 1, 2, 3 having count(*) > 1;
-- 결과가 있으면 같은 (IP, 식당, 날짜)에서 가장 이른 리뷰만 남길지 판단한 뒤 정리하고 다시 실행하세요.
create unique index if not exists uq_reviews_ip_restaurant_day
  on public.reviews (hashed_ip, restaurant_id, review_date);

commit;

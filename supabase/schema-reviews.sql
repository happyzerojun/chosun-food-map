-- Supabase: 익명 리뷰 테이블 (SQL Editor에서 실행)
-- 서버(Vercel API)는 SUPABASE_SERVICE_ROLE_KEY 로만 접근하는 것을 권장합니다.

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  restaurant_id text not null,
  nickname text not null,
  password_hash text not null,
  rating int not null check (rating >= 1 and rating <= 5),
  content text,
  tags text[] not null default '{}',
  hashed_ip text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_reviews_restaurant_created
  on public.reviews (restaurant_id, created_at desc);

create index if not exists idx_reviews_ip_restaurant_day
  on public.reviews (hashed_ip, restaurant_id, created_at);

comment on table public.reviews is '가성비 맛집 지도 — 익명 닉네임 + 4자리 비밀번호 리뷰';

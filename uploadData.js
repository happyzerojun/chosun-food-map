/**
 * 일회성: src/data/restaurants.json → Supabase `restaurants` 테이블 bulk insert
 *
 * 사전 준비 (Supabase SQL Editor 등에서 테이블 생성 예시):
 *
 * create table public.restaurants (
 *   id text primary key,
 *   name text not null,
 *   category text,
 *   representative_price text,
 *   address text,
 *   lat double precision not null,
 *   lng double precision not null,
 *   tags jsonb default '[]'::jsonb,
 *   note text,
 *   created_at timestamptz default now()
 * );
 * alter table public.restaurants enable row level security;
 * -- 개발용: anon으로 insert 허용 (프로덕션에서는 service role 또는 정책 조정 권장)
 * create policy "allow insert for anon migration" on public.restaurants
 *   for insert to anon with check (true);
 *
 * 실행:
 *   node uploadData.js
 *   npm run upload:restaurants
 *
 * 환경변수 (.env): VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
 * (절대 코드에 하드코딩하지 마세요.)
 */

import 'dotenv/config'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const jsonPath = join(__dirname, 'src', 'data', 'restaurants.json')

function mapRestaurantToRow(r) {
  try {
    const lat = r?.position?.lat
    const lng = r?.position?.lng
    if (typeof lat !== 'number' || typeof lng !== 'number' || Number.isNaN(lat) || Number.isNaN(lng)) {
      throw new Error(`유효하지 않은 좌표: id=${r?.id}`)
    }
    return {
      id: String(r.id),
      name: String(r.name ?? ''),
      category: r.category ?? null,
      representative_price: r.representative_price ?? null,
      address: r.address ?? null,
      lat,
      lng,
      tags: Array.isArray(r.tags) ? r.tags : [],
      note: r.note ?? null,
    }
  } catch (e) {
    throw new Error(`행 매핑 실패 (${r?.id}): ${e.message}`)
  }
}

async function main() {
  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error(
      '[uploadData] 환경변수가 없습니다. 프로젝트 루트 .env 에 VITE_SUPABASE_URL 과 VITE_SUPABASE_ANON_KEY 를 설정하세요.',
    )
    process.exit(1)
  }

  let raw
  try {
    raw = readFileSync(jsonPath, 'utf8')
  } catch (e) {
    console.error('[uploadData] JSON 파일 읽기 실패:', jsonPath, e)
    process.exit(1)
  }

  let restaurants
  try {
    restaurants = JSON.parse(raw)
  } catch (e) {
    console.error('[uploadData] JSON 파싱 실패:', e.message)
    process.exit(1)
  }

  if (!Array.isArray(restaurants)) {
    console.error('[uploadData] restaurants.json 은 배열이어야 합니다.')
    process.exit(1)
  }

  let rows
  try {
    rows = restaurants.map(mapRestaurantToRow)
  } catch (e) {
    console.error('[uploadData] 매핑 오류:', e.message)
    process.exit(1)
  }

  console.log(`[uploadData] ${rows.length}건 준비 완료 → Supabase insert 시도`)

  let supabase
  try {
    supabase = createClient(supabaseUrl, supabaseKey)
  } catch (e) {
    console.error('[uploadData] Supabase 클라이언트 생성 실패:', e)
    process.exit(1)
  }

  try {
    const { data, error } = await supabase.from('restaurants').insert(rows).select()

    if (error) {
      console.error('[uploadData] Insert 실패:', error.message, error)
      process.exit(1)
    }

    console.log('[uploadData] 성공. 반환 행 수:', data?.length ?? 0)
  } catch (e) {
    console.error('[uploadData] Insert 요청 중 예외:', e)
    process.exit(1)
  }
}

main().catch((e) => {
  console.error('[uploadData] 처리되지 않은 오류:', e)
  process.exit(1)
})

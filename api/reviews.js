/**
 * Vercel Serverless: /api/reviews
 * 환경변수: VITE_SUPABASE_URL (또는 SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY
 * 운영 필수(없어도 동작은 함): REVIEW_IP_PEPPER (IP 해시에 섞는 비밀 값, 없으면 경고 로그)
 * 선택: ALLOWED_ORIGIN (CORS 추가 허용 출처, 쉼표 구분. 운영 도메인·localhost:3000은 기본 허용)
 *
 * GET    ?restaurant_id=  — 해당 식당 리뷰 목록 (password_hash 제외)
 * POST   JSON body — 리뷰 작성
 * DELETE JSON body { id, password } — 비밀번호 검증 후 삭제
 */

import { createClient } from '@supabase/supabase-js'
import bcrypt from 'bcryptjs'
import { randomUUID } from 'node:crypto'
import {
  applyCors,
  getClientIp,
  hashIp,
  isJsonContentType,
  PEPPER_MISSING_WARNING,
  startOfTodayKstIso,
  todayKstYmd,
} from './_lib/http.js'

function getSupabaseUrl() {
  return process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
}

function getServiceKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || ''
}

// pepper가 없어도 리뷰 작성은 막지 않는다(운영 중단 방지). 대신 콜드 스타트마다 한 번 경고한다 (TS-04)
// 운영(VERCEL_ENV=production)에서는 error 레벨로 남겨 Vercel 로그에서 눈에 띄게 한다
if (!process.env.REVIEW_IP_PEPPER) {
  const log = process.env.VERCEL_ENV === 'production' ? console.error : console.warn
  log(PEPPER_MISSING_WARNING)
}

function json(res, status, body) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

async function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = ''
    req.on('data', (chunk) => {
      raw += chunk
      if (raw.length > 1_000_000) {
        reject(new Error('payload too large'))
      }
    })
    req.on('end', () => {
      try {
        if (!raw) return resolve({})
        resolve(JSON.parse(raw))
      } catch (e) {
        reject(e)
      }
    })
    req.on('error', reject)
  })
}

export default async function handler(req, res) {
  const originAllowed = applyCors(req, res)

  if (req.method === 'OPTIONS') {
    // 허용하지 않은 출처의 preflight는 CORS 헤더 없이 403 → 브라우저가 본 요청을 보내지 않는다 (TS-06)
    res.statusCode = originAllowed ? 204 : 403
    return res.end()
  }

  // 쓰기 요청은 JSON만 받는다. text/plain 등 단순 요청은 preflight 없이 다른 사이트에서도 보낼 수 있기 때문 (TS-06)
  if ((req.method === 'POST' || req.method === 'DELETE') && !isJsonContentType(req)) {
    return json(res, 415, { error: 'Content-Type: application/json 요청만 받습니다.' })
  }

  const supabaseUrl = getSupabaseUrl()
  const serviceKey = getServiceKey()

  if (!supabaseUrl || !serviceKey) {
    return json(res, 500, {
      error: '서버 환경변수가 설정되지 않았습니다. SUPABASE_SERVICE_ROLE_KEY 및 Supabase URL을 확인하세요.',
    })
  }

  let supabase
  try {
    supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  } catch (e) {
    console.error('[api/reviews] Supabase 클라이언트 생성 실패', e)
    return json(res, 500, { error: '데이터베이스 초기화에 실패했습니다.' })
  }

  try {
    if (req.method === 'GET') {
      const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)
      const restaurantId = url.searchParams.get('restaurant_id')
      if (!restaurantId) {
        return json(res, 400, { error: 'restaurant_id 가 필요합니다.' })
      }

      const { data, error } = await supabase
        .from('reviews')
        .select('id, restaurant_id, nickname, rating, content, tags, created_at')
        .eq('restaurant_id', restaurantId)
        .order('created_at', { ascending: false })

      if (error) {
        console.error('[api/reviews] GET', error)
        return json(res, 500, { error: '리뷰를 불러오지 못했습니다.' })
      }
      return json(res, 200, { reviews: data ?? [], serverDateKst: todayKstYmd() })
    }

    if (req.method === 'POST') {
      let body
      try {
        body = await readJsonBody(req)
      } catch (e) {
        return json(res, 400, { error: 'JSON 본문이 올바르지 않습니다.' })
      }

      const {
        restaurant_id: restaurantId,
        nickname: nicknameRaw,
        password,
        rating: ratingRaw,
        content: contentRaw,
        tags: tagsRaw,
      } = body

      const nickname = typeof nicknameRaw === 'string' ? nicknameRaw.trim() : ''
      if (!restaurantId || typeof restaurantId !== 'string') {
        return json(res, 400, { error: 'restaurant_id 가 필요합니다.' })
      }
      if (!nickname || nickname.length > 40) {
        return json(res, 400, { error: '닉네임은 1~40자로 입력해 주세요.' })
      }
      // 새 클라이언트는 32~64자 랜덤 토큰을 보낸다. 예전 4자리 숫자는 무차별 대입에 약해 더 이상 받지 않는다 (TS-02)
      if (typeof password !== 'string' || !/^[A-Za-z0-9-]{32,64}$/.test(password)) {
        return json(res, 400, { error: '삭제 키 형식이 올바르지 않습니다. 페이지를 새로고침한 뒤 다시 시도해 주세요.' })
      }
      const rating = Number(ratingRaw)
      if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
        return json(res, 400, { error: '별점은 1~5 정수여야 합니다.' })
      }

      let tags = []
      if (Array.isArray(tagsRaw)) {
        tags = tagsRaw
          .map((t) => (typeof t === 'string' ? t.trim() : ''))
          .filter(Boolean)
          .slice(0, 10)
      }
      const content =
        typeof contentRaw === 'string' && contentRaw.trim().length > 0
          ? contentRaw.trim().slice(0, 2000)
          : null

      const hashedIp = hashIp(getClientIp(req))
      const dayStartIso = startOfTodayKstIso()

      const { count, error: countError } = await supabase
        .from('reviews')
        .select('id', { count: 'exact', head: true })
        .eq('hashed_ip', hashedIp)
        .eq('restaurant_id', restaurantId)
        .gte('created_at', dayStartIso)

      if (countError) {
        console.error('[api/reviews] rate count', countError)
        return json(res, 500, { error: '요청 한도 확인에 실패했습니다.' })
      }
      if ((count ?? 0) >= 1) {
        return json(res, 429, {
          error: '같은 식당에는 하루에 한 번만 리뷰를 남길 수 있어요. 내일 다시 시도해 주세요.',
        })
      }

      let passwordHash
      try {
        passwordHash = bcrypt.hashSync(password, 10)
      } catch (e) {
        console.error('[api/reviews] bcrypt hash', e)
        return json(res, 500, { error: '비밀번호 처리에 실패했습니다.' })
      }

      const id = randomUUID()
      const { data: inserted, error: insertError } = await supabase
        .from('reviews')
        .insert({
          id,
          restaurant_id: restaurantId,
          nickname,
          password_hash: passwordHash,
          rating,
          content,
          tags,
          hashed_ip: hashedIp,
        })
        .select('id, restaurant_id, nickname, rating, content, tags, created_at')
        .single()

      if (insertError) {
        // 동시 요청 두 건이 count 검사를 함께 통과해도, DB 유니크 인덱스(하루 1회)가 두 번째를 막는다 (TS-03)
        if (insertError.code === '23505') {
          return json(res, 429, {
            error: '같은 식당에는 하루에 한 번만 리뷰를 남길 수 있어요. 내일 다시 시도해 주세요.',
          })
        }
        console.error('[api/reviews] insert', insertError)
        return json(res, 500, { error: '리뷰 저장에 실패했습니다.' })
      }

      return json(res, 201, {
        review: inserted,
        serverDateKst: todayKstYmd(),
      })
    }

    if (req.method === 'DELETE') {
      let body
      try {
        body = await readJsonBody(req)
      } catch (e) {
        return json(res, 400, { error: 'JSON 본문이 올바르지 않습니다.' })
      }

      const { id, password } = body
      if (!id || typeof password !== 'string') {
        return json(res, 400, { error: 'id 와 password 가 필요합니다.' })
      }

      const { data: row, error: fetchError } = await supabase
        .from('reviews')
        .select('id, password_hash')
        .eq('id', id)
        .maybeSingle()

      if (fetchError) {
        console.error('[api/reviews] delete fetch', fetchError)
        return json(res, 500, { error: '리뷰를 찾는 데 실패했습니다.' })
      }
      if (!row) {
        return json(res, 404, { error: '리뷰를 찾을 수 없습니다.' })
      }

      let match = false
      try {
        match = bcrypt.compareSync(password, row.password_hash)
      } catch (e) {
        console.error('[api/reviews] bcrypt compare', e)
        return json(res, 500, { error: '비밀번호 검증에 실패했습니다.' })
      }
      if (!match) {
        return json(res, 403, { error: '비밀번호가 일치하지 않습니다.' })
      }

      const { error: delError } = await supabase.from('reviews').delete().eq('id', id)
      if (delError) {
        console.error('[api/reviews] delete', delError)
        return json(res, 500, { error: '삭제에 실패했습니다.' })
      }
      return json(res, 200, { ok: true })
    }

    res.setHeader('Allow', 'GET, POST, DELETE, OPTIONS')
    return json(res, 405, { error: 'Method Not Allowed' })
  } catch (e) {
    console.error('[api/reviews] unhandled', e)
    return json(res, 500, { error: '서버 오류가 발생했습니다.' })
  }
}

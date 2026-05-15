/**
 * Vercel Serverless: /api/reviews
 * 환경변수: VITE_SUPABASE_URL (또는 SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY
 * 선택: REVIEW_IP_PEPPER (IP 해시에 추가 솔트)
 *
 * GET    ?restaurant_id=  — 해당 식당 리뷰 목록 (password_hash 제외)
 * POST   JSON body — 리뷰 작성
 * DELETE JSON body { id, password } — 비밀번호 검증 후 삭제
 */

import { createClient } from '@supabase/supabase-js'
import bcrypt from 'bcryptjs'
import { createHash, randomUUID } from 'node:crypto'
import { formatInTimeZone } from 'date-fns-tz'

const TZ_SEOUL = 'Asia/Seoul'

function getSupabaseUrl() {
  return process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
}

function getServiceKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || ''
}

function hashIp(ip) {
  const h = createHash('sha256')
  h.update(String(ip || 'unknown'))
  if (process.env.REVIEW_IP_PEPPER) {
    h.update('|')
    h.update(process.env.REVIEW_IP_PEPPER)
  }
  return h.digest('hex')
}

function getClientIp(req) {
  const xf = req.headers['x-forwarded-for']
  if (typeof xf === 'string' && xf.length > 0) {
    return xf.split(',')[0].trim()
  }
  const real = req.headers['x-real-ip']
  if (typeof real === 'string' && real.length > 0) return real.trim()
  return req.socket?.remoteAddress || 'unknown'
}

/** KST(UTC+9, 서머타임 없음) 기준 해당 날짜 00:00 의 UTC instant */
function startOfTodayKstIso() {
  const ymd = formatInTimeZone(new Date(), TZ_SEOUL, 'yyyy-MM-dd')
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d, -9, 0, 0, 0)).toISOString()
}

/** KST 기준 오늘 날짜 문자열 (localStorage 키용) */
function todayKstYmd() {
  return formatInTimeZone(new Date(), TZ_SEOUL, 'yyyy-MM-dd')
}

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
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
  setCors(res)

  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    return res.end()
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
      if (typeof password !== 'string' || !/^\d{4}$/.test(password)) {
        return json(res, 400, { error: '비밀번호는 숫자 4자리여야 합니다.' })
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

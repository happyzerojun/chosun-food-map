/**
 * /api/reviews 공용 유틸 (CORS, 클라이언트 IP, IP 해시, KST 날짜)
 * `_`로 시작하는 디렉터리라 Vercel이 서버리스 함수로 만들지 않는다.
 * 순수 함수로 분리해 `npm test`(node:test)로 검증한다.
 */

import { createHash } from 'node:crypto'

export const TZ_SEOUL = 'Asia/Seoul'

/** 운영 도메인 (GitHub 저장소 homepage와 같음) */
export const PRODUCTION_ORIGIN = 'https://chosun-food-map.vercel.app'

/** 로컬에서 Vite(포트 3000 고정)만 띄우고 VITE_API_ORIGIN으로 배포 API를 부를 때의 출처 */
export const DEV_ORIGINS = ['http://localhost:3000', 'http://127.0.0.1:3000']

function normalizeOrigin(value) {
  return String(value).trim().replace(/\/+$/, '')
}

/**
 * 허용 출처 목록. 커스텀 도메인을 붙이면 ALLOWED_ORIGIN(쉼표 구분)에 추가한다.
 * 프론트와 API가 같은 출처(운영·Preview 배포 모두)면 브라우저가 CORS 검사를 하지 않으므로
 * 이 목록은 "다른 출처에서 부를 때"에만 의미가 있다.
 */
export function getAllowedOrigins(env = process.env) {
  const extra = String(env.ALLOWED_ORIGIN || '')
    .split(',')
    .map(normalizeOrigin)
    .filter(Boolean)
  return new Set([PRODUCTION_ORIGIN, ...DEV_ORIGINS, ...extra])
}

/** 요청 Origin이 허용 목록에 있으면 그 Origin을, 아니면 null */
export function resolveCorsOrigin(origin, allowed = getAllowedOrigins()) {
  if (typeof origin !== 'string' || origin.length === 0) return null
  const normalized = normalizeOrigin(origin)
  return allowed.has(normalized) ? normalized : null
}

/**
 * CORS 헤더 설정. 예전에는 `*`라 아무 사이트나 방문자 브라우저로 이 API를 호출해 응답을 읽을 수 있었다 (TS-06).
 * @returns {boolean} Origin이 없거나(같은 출처·서버 간 호출) 허용 출처면 true
 */
export function applyCors(req, res, allowed = getAllowedOrigins()) {
  // 출처마다 응답 헤더가 달라지므로 CDN 캐시가 섞이지 않게 한다
  res.setHeader('Vary', 'Origin')
  const origin = req.headers?.origin
  if (!origin) return true
  const allowOrigin = resolveCorsOrigin(origin, allowed)
  if (!allowOrigin) return false
  res.setHeader('Access-Control-Allow-Origin', allowOrigin)
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept')
  res.setHeader('Access-Control-Max-Age', '600')
  return true
}

/**
 * POST/DELETE는 Content-Type: application/json만 받는다.
 * text/plain 같은 "단순 요청"은 preflight 없이 다른 사이트에서도 보낼 수 있어 CORS 허용 목록만으로는 쓰기를 막지 못한다 (TS-06).
 */
export function isJsonContentType(req) {
  const ct = req.headers?.['content-type']
  return typeof ct === 'string' && /^application\/json\s*(;|$)/i.test(ct.trim())
}

/**
 * 클라이언트 IP. X-Forwarded-For 첫 값 → x-real-ip → 소켓 주소
 */
export function getClientIp(req) {
  const xf = req.headers?.['x-forwarded-for']
  if (typeof xf === 'string' && xf.length > 0) {
    return xf.split(',')[0].trim()
  }
  const real = req.headers?.['x-real-ip']
  if (typeof real === 'string' && real.length > 0) return real.trim()
  return req.socket?.remoteAddress || 'unknown'
}

// pepper 없이 SHA-256만 쓰면 IPv4 전체(약 43억 개)를 미리 해시해 대조할 수 있어 IP가 사실상 복원된다 (TS-04)
export function hashIp(ip, pepper = process.env.REVIEW_IP_PEPPER) {
  const h = createHash('sha256')
  h.update(String(ip || 'unknown'))
  if (pepper) {
    h.update('|')
    h.update(pepper)
  }
  return h.digest('hex')
}

export const PEPPER_MISSING_WARNING =
  '[api/reviews] REVIEW_IP_PEPPER가 설정되지 않았습니다. IP 해시가 사전 대입에 취약합니다.'

// en-CA 로캘은 yyyy-MM-dd 형식. 프론트(App.jsx 조회수 잠금)와 같은 방식이라 서버·클라이언트 날짜가 어긋나지 않는다
const KST_YMD = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ_SEOUL,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** KST(UTC+9, 서머타임 없음) 기준 오늘 날짜 문자열 yyyy-MM-dd */
export function todayKstYmd(now = new Date()) {
  return KST_YMD.format(now)
}

/** KST 기준 해당 날짜 00:00 의 UTC instant (ISO 문자열) */
export function startOfTodayKstIso(now = new Date()) {
  const [y, m, d] = todayKstYmd(now).split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d, -9, 0, 0, 0)).toISOString()
}

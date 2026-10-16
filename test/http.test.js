// api/_lib/http.js 단위 테스트 (node:test, 외부 의존성 없음). 실행: npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  applyCors,
  getAllowedOrigins,
  getClientIp,
  hashIp,
  isJsonContentType,
  PRODUCTION_ORIGIN,
  resolveCorsOrigin,
  startOfTodayKstIso,
  todayKstYmd,
} from '../api/_lib/http.js'

function mockRes() {
  const headers = {}
  return {
    headers,
    setHeader(name, value) {
      headers[name.toLowerCase()] = value
    },
  }
}

test('CORS: 운영 도메인과 localhost:3000만 반사하고 그 외는 거절 (TS-06)', () => {
  const allowed = getAllowedOrigins({})
  assert.equal(resolveCorsOrigin(PRODUCTION_ORIGIN, allowed), PRODUCTION_ORIGIN)
  assert.equal(resolveCorsOrigin('http://localhost:3000', allowed), 'http://localhost:3000')
  assert.equal(resolveCorsOrigin('http://127.0.0.1:3000', allowed), 'http://127.0.0.1:3000')
  assert.equal(resolveCorsOrigin('https://evil.example.com', allowed), null)
  // 접두어가 같은 다른 Vercel 프로젝트 도메인은 허용하지 않는다
  assert.equal(resolveCorsOrigin('https://chosun-food-map-evil.vercel.app', allowed), null)
  assert.equal(resolveCorsOrigin('http://localhost:5173', allowed), null)
  assert.equal(resolveCorsOrigin(undefined, allowed), null)
})

test('CORS: ALLOWED_ORIGIN(쉼표 구분, 끝 슬래시 무시)으로 출처 추가', () => {
  const allowed = getAllowedOrigins({ ALLOWED_ORIGIN: 'https://food.example.com/, https://b.example.com' })
  assert.equal(resolveCorsOrigin('https://food.example.com', allowed), 'https://food.example.com')
  assert.equal(resolveCorsOrigin('https://b.example.com', allowed), 'https://b.example.com')
  assert.equal(resolveCorsOrigin(PRODUCTION_ORIGIN, allowed), PRODUCTION_ORIGIN)
})

test('applyCors: 허용 출처만 헤더를 붙이고, Origin 없는 같은 출처 요청은 통과', () => {
  const allowed = getAllowedOrigins({})

  const ok = mockRes()
  assert.equal(applyCors({ headers: { origin: PRODUCTION_ORIGIN } }, ok, allowed), true)
  assert.equal(ok.headers['access-control-allow-origin'], PRODUCTION_ORIGIN)
  assert.equal(ok.headers.vary, 'Origin')

  const bad = mockRes()
  assert.equal(applyCors({ headers: { origin: 'https://evil.example.com' } }, bad, allowed), false)
  assert.equal(bad.headers['access-control-allow-origin'], undefined)
  assert.equal(bad.headers.vary, 'Origin')

  const same = mockRes()
  assert.equal(applyCors({ headers: {} }, same, allowed), true)
  assert.equal(same.headers['access-control-allow-origin'], undefined)
})

test('쓰기 요청은 application/json만 허용 (preflight 없는 단순 요청 차단)', () => {
  assert.equal(isJsonContentType({ headers: { 'content-type': 'application/json' } }), true)
  assert.equal(isJsonContentType({ headers: { 'content-type': 'application/json; charset=utf-8' } }), true)
  assert.equal(isJsonContentType({ headers: { 'content-type': 'text/plain' } }), false)
  assert.equal(isJsonContentType({ headers: { 'content-type': 'application/x-www-form-urlencoded' } }), false)
  assert.equal(isJsonContentType({ headers: { 'content-type': 'application/jsonp' } }), false)
  assert.equal(isJsonContentType({ headers: {} }), false)
})

test('IP: 클라이언트가 넣은 X-Forwarded-For는 무시하고 Vercel 헤더 사용 (TS-07)', () => {
  assert.equal(
    getClientIp({ headers: { 'x-forwarded-for': '6.6.6.6', 'x-vercel-forwarded-for': '1.2.3.4', 'x-real-ip': '5.6.7.8' } }),
    '1.2.3.4',
  )
  assert.equal(getClientIp({ headers: { 'x-forwarded-for': '6.6.6.6, 1.2.3.4', 'x-real-ip': '5.6.7.8' } }), '5.6.7.8')
  // Vercel 헤더가 없으면(로컬) 소켓 주소. X-Forwarded-For로 바꿔치기 불가
  assert.equal(
    getClientIp({ headers: { 'x-forwarded-for': '6.6.6.6' }, socket: { remoteAddress: '::ffff:10.0.0.7' } }),
    '10.0.0.7',
  )
  assert.equal(getClientIp({ headers: {} }), 'unknown')
})

test('IP 해시: pepper가 있으면 결과가 달라지고, 없어도 동작은 유지 (TS-04)', () => {
  const plain = hashIp('1.2.3.4', '')
  const peppered = hashIp('1.2.3.4', 'secret')
  assert.match(plain, /^[0-9a-f]{64}$/)
  assert.match(peppered, /^[0-9a-f]{64}$/)
  assert.notEqual(plain, peppered)
  assert.equal(hashIp('1.2.3.4', 'secret'), peppered)
})

test('KST 날짜: UTC 15:00(KST 자정)에 날짜가 바뀐다', () => {
  assert.equal(todayKstYmd(new Date('2026-10-15T14:59:59.999Z')), '2026-10-15')
  assert.equal(todayKstYmd(new Date('2026-10-15T15:00:00.000Z')), '2026-10-16')
  // KST 2026-10-16 08:00 (UTC 전날 23:00) → 그날 KST 자정은 UTC 2026-10-15T15:00
  assert.equal(startOfTodayKstIso(new Date('2026-10-15T23:00:00Z')), '2026-10-15T15:00:00.000Z')
  // 월말·연말 경계
  assert.equal(startOfTodayKstIso(new Date('2026-12-31T15:30:00Z')), '2026-12-31T15:00:00.000Z')
  assert.equal(todayKstYmd(new Date('2026-12-31T15:30:00Z')), '2027-01-01')
})

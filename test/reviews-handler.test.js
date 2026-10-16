// api/reviews.js 핸들러의 DB 접근 전 단계(CORS·Content-Type) 테스트. Supabase에 연결하지 않는다.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import handler from '../api/reviews.js'

function mockReq({ method = 'GET', headers = {}, url = '/api/reviews' } = {}) {
  return { method, headers, url, socket: { remoteAddress: '127.0.0.1' } }
}

function mockRes() {
  const res = {
    statusCode: 200,
    headers: {},
    body: undefined,
    setHeader(name, value) {
      res.headers[name.toLowerCase()] = value
    },
    end(body) {
      res.body = body
      return res
    },
  }
  return res
}

test('허용하지 않은 출처의 preflight는 403, CORS 헤더 없음', async () => {
  const res = mockRes()
  await handler(mockReq({ method: 'OPTIONS', headers: { origin: 'https://evil.example.com' } }), res)
  assert.equal(res.statusCode, 403)
  assert.equal(res.headers['access-control-allow-origin'], undefined)
})

test('운영 도메인의 preflight는 204, 해당 출처를 반사', async () => {
  const res = mockRes()
  await handler(mockReq({ method: 'OPTIONS', headers: { origin: 'https://chosun-food-map.vercel.app' } }), res)
  assert.equal(res.statusCode, 204)
  assert.equal(res.headers['access-control-allow-origin'], 'https://chosun-food-map.vercel.app')
})

test('text/plain POST(preflight 없는 단순 요청)는 DB 접근 전에 415', async () => {
  const res = mockRes()
  await handler(mockReq({ method: 'POST', headers: { 'content-type': 'text/plain' } }), res)
  assert.equal(res.statusCode, 415)
})

test('text/plain DELETE도 415', async () => {
  const res = mockRes()
  await handler(mockReq({ method: 'DELETE', headers: { 'content-type': 'text/plain;charset=UTF-8' } }), res)
  assert.equal(res.statusCode, 415)
})

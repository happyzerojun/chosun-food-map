/**
 * 리뷰 API 베이스 URL
 * - 배포(Vercel): 동일 오리진이면 빈 문자열 → `/api/reviews`
 * - 로컬에서 Vite만 쓸 때: `vercel dev`로 API를 띄운 뒤, 여기에 그 오리진을 넣거나
 *   배포된 사이트 URL을 넣어 테스트 (예: https://xxx.vercel.app)
 */
export function getReviewsApiUrl() {
  const origin = (import.meta.env.VITE_API_ORIGIN || '').replace(/\/$/, '')
  return origin ? `${origin}/api/reviews` : '/api/reviews'
}

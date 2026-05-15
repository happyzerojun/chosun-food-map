import { useMemo, useState, useEffect } from 'react'
import { CustomOverlayMap, Map, useKakaoLoader } from 'react-kakao-maps-sdk'
import restaurantsData from './data/restaurants.json'
import { config } from './config.js'
import { RestaurantReviews } from './components/RestaurantReviews.jsx'
import AdSense from './components/AdSense.jsx'

// 후원 페이지 URL
const COFFEE_DONATION_URL = 'https://ctee.kr/place/chosun_dev'

function CoffeeDonateButton() {
  return (
    <a
      href={COFFEE_DONATION_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="fixed bottom-6 right-6 z-[10050] rounded-full px-4 py-3 text-sm font-semibold text-slate-900 shadow-[0_8px_24px_rgba(0,0,0,0.18)] transition hover:brightness-[0.97] active:scale-[0.98]"
      style={{ backgroundColor: '#FFDD00' }}
    >
      개발자에게 커피 사주기 ☕
    </a>
  )
}

function KakaoMapView({ onReady }) {
  const [loading, error] = useKakaoLoader({
    appkey: config.kakaoApiKey,
    libraries: ['services'],
  })

  // 후원 버튼 및 UI와의 밸런스를 고려해 초기 중심 좌표 보정
  const center = useMemo(() => ({ lat: 35.1448, lng: 126.9305 }), [])
  const restaurants = restaurantsData
  const [selectedId, setSelectedId] = useState(() => restaurantsData[0]?.id ?? null)

  const selected = useMemo(
    () => restaurants.find((r) => r.id === selectedId) ?? null,
    [restaurants, selectedId],
  )

  // [핵심 로직] 지도가 로드 완료되면 부모 컴포넌트에 알림
  useEffect(() => {
    if (!loading && !error) {
      onReady(true)
    }
  }, [loading, error, onReady])

  // 원본 좌표는 유지하되, 겹치는 마커들을 시각적으로만 분산시키는 함수
  const getVisualOffset = (id) => {
    switch (id) {
      case 'tongkeun-donkatsu':
        return 'translate-x-8 -translate-y-4' // 우측 상단으로 이동
      case 'jodea-buger':
        return '-translate-x-6 translate-y-4' // 좌측 하단으로 이동
      case 'mujinjang-tteokbokki':
        return '-translate-x-2 -translate-y-6' // 좌측 상단으로 이동
      default:
        return '' // 겹치지 않는 곳은 이동 없음
    }
  }

  if (error)
    return (
      <div className="flex h-screen items-center justify-center p-6 text-center">
        <div className="max-w-md rounded-2xl border border-red-200 bg-white p-6 shadow-xl">
          <div className="text-sm font-semibold text-red-600">지도 로딩 실패</div>
          <div className="mt-2 text-sm text-slate-700">
            카카오 키가 올바른지 확인하세요. (Vercel 환경변수 포함)
          </div>
        </div>
      </div>
    )

  if (loading) return <div className="flex h-screen items-center justify-center">지도를 불러오는 중...</div>

  return (
    <div className="relative h-screen w-screen">
      <Map center={center} level={3} style={{ width: '100%', height: '100%' }}>
        {restaurants.map((r) => (
          <CustomOverlayMap
            key={r.id}
            position={r.position}
            xAnchor={0.5}
            yAnchor={1}
            zIndex={selectedId === r.id ? 20 : 12}
            clickable
          >
            <button
              type="button"
              onClick={() => setSelectedId(r.id)}
              className={`flex cursor-pointer flex-col items-center border-0 bg-transparent p-0 outline-none hover:scale-105 transition-transform ${getVisualOffset(r.id)}`}
              aria-label={`${r.name} ${r.representative_price} 상세 보기`}
            >
              <div className="rounded-xl border border-neutral-900/20 bg-white px-3 py-2 shadow-[0_4px_14px_rgba(0,0,0,0.16)]">
                <span className="block whitespace-nowrap text-[12px] font-semibold text-neutral-900">
                  {r.representative_price}
                </span>
                <span className="mt-0.5 block max-w-[132px] truncate text-center text-[10px] font-medium text-neutral-500">
                  {r.name}
                </span>
              </div>
              <div className="relative -mt-px flex flex-col items-center pointer-events-none">
                <svg width="20" height="9" viewBox="0 0 20 9" aria-hidden="true">
                  <path
                    d="M10 9 L1 1 H19 Z"
                    fill="#ffffff"
                    stroke="rgba(0,0,0,0.18)"
                    strokeWidth="1"
                    strokeLinejoin="round"
                  />
                </svg>
                <span
                  className="-mt-1 h-2.5 w-2.5 shrink-0 rounded-full border border-neutral-900/25 bg-white shadow-sm"
                  aria-hidden="true"
                />
              </div>
            </button>
          </CustomOverlayMap>
        ))}

        {selected ? (
          <CustomOverlayMap
            position={selected.position}
            yAnchor={1.12}
            zIndex={40}
          >
            {/* 🚀 수정됨: 화면 크기에 맞춰 유연하게 줄어들고(max-w), 최대 높이를 제한(max-h)하여 스크롤 생성 */}
            <div
              className={`pointer-events-auto w-[320px] max-w-[90vw] max-h-[65vh] flex flex-col overflow-hidden rounded-2xl border border-black/10 bg-white shadow-2xl ${getVisualOffset(selected.id)}`}
            >
              {/* 상단 헤더 영역 (고정) */}
              <div className="sticky top-0 z-10 flex-shrink-0 bg-white px-4 py-3 border-b border-slate-100 flex items-start justify-between gap-2 shadow-sm">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center rounded-full bg-violet-600 px-2 py-0.5 text-[10px] font-bold text-white tracking-wide">
                      {selected.category}
                    </span>
                    <span className="text-[11px] font-medium text-slate-400 whitespace-nowrap">조선대 근처</span>
                  </div>
                  <div className="mt-1 truncate text-lg font-bold text-slate-900">
                    {selected.name}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedId(null)}
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-800 transition-colors"
                  aria-label="닫기"
                >
                  <svg viewBox="0 0 24 24" className="h-5 w-5">
                    <path
                      fill="currentColor"
                      d="M18.3 5.71a1 1 0 0 1 0 1.42L13.42 12l4.88 4.88a1 1 0 1 1-1.42 1.42L12 13.42l-4.88 4.88a1 1 0 1 1-1.42-1.42L10.58 12 5.7 7.12a1 1 0 0 1 1.42-1.42L12 10.58l4.88-4.88a1 1 0 0 1 1.42 0Z"
                    />
                  </svg>
                </button>
              </div>

              {/* 본문 및 리뷰 영역 (스크롤 가능 영역) */}
              <div className="overflow-y-auto flex-1 p-0">
                <div className="px-4 py-3">
                  <div className="text-sm font-bold text-violet-700">
                    {selected.representative_price}
                  </div>
                  <div className="mt-2 whitespace-pre-wrap break-keep text-[13px] leading-relaxed text-slate-600">
                    {selected.note}
                  </div>
                </div>

                <div className="border-t border-slate-100 bg-slate-50 px-4 py-3">
                  <div className="text-[11px] font-semibold text-slate-500">주소</div>
                  <div className="mt-0.5 break-keep text-[12px] text-slate-700">{selected.address}</div>
                  {selected.tags?.length ? (
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {selected.tags.map((t) => (
                        <span
                          key={t}
                          className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 shadow-sm"
                        >
                          #{t}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>

                {/* 하단 리뷰 컴포넌트 */}
                <RestaurantReviews restaurantId={selected.id} />
              </div>
            </div>
          </CustomOverlayMap>
        ) : null}
      </Map>

      {/* 좌측 상단 플로팅 안내문 */}
      <div className="pointer-events-none absolute left-4 top-4 z-[1000] rounded-2xl border border-black/10 bg-white/95 px-4 py-3 shadow-lg backdrop-blur">
        <div className="text-sm font-bold text-slate-900">조대 후문 맛집 지도</div>
        <div className="mt-0.5 text-[11px] font-medium text-slate-500">
          마커를 누르면 상세 정보를 볼 수 있어요.
        </div>
      </div>
    </div>
  )
}

function App() {
  const [contentReady, setContentReady] = useState(false)

  if (!config.kakaoApiKey) {
    return (
      <>
        <div className="flex h-screen items-center justify-center bg-slate-50 p-6">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-xl">
            <div className="text-base font-semibold text-slate-900">API 키 설정 필요</div>
            <div className="mt-2 text-sm text-slate-600">
              카카오 지도 API 키가 설정되어 있지 않습니다.
              <br />
              Vercel 환경변수에 <span className="font-mono">VITE_KAKAO_API_KEY</span>를 추가해주세요.
            </div>
          </div>
        </div>
        <CoffeeDonateButton />
      </>
    )
  }

  return (
    <>
      <KakaoMapView onReady={setContentReady} />

      {/* 콘텐츠가 준비된 시점에만 AdSense 가동 */}
      <div className="fixed top-0 left-0 w-full z-[9999] pointer-events-none">
        <div className="pointer-events-auto max-w-4xl mx-auto">
          <AdSense isReady={contentReady} />
        </div>
      </div>

      <CoffeeDonateButton />
    </>
  )
}

export default App
import { useMemo, useState } from 'react'
import { CustomOverlayMap, Map, MapMarker, useKakaoLoader } from 'react-kakao-maps-sdk'
import restaurantsData from './data/restaurants.json'
import { config } from './config.js'

// 후원 페이지 URL — Toss / Buy Me a Coffee 등으로 교체하세요.
const COFFEE_DONATION_URL = 'https://ctee.kr/place/chosun_dev'

function CoffeeDonateButton() {
  return (
    <a
      href={COFFEE_DONATION_URL}
      // TODO: 위 COFFEE_DONATION_URL을 실제 후원 링크로 변경하세요. (# 이면 동일 탭으로 이동만 함)
      target="_blank"
      rel="noopener noreferrer"
      className="fixed bottom-6 right-6 z-[10050] rounded-full px-4 py-3 text-sm font-semibold text-slate-900 shadow-[0_8px_24px_rgba(0,0,0,0.18)] transition hover:brightness-[0.97] active:scale-[0.98]"
      style={{ backgroundColor: '#FFDD00' }}
    >
      개발자에게 커피 사주기 ☕
    </a>
  )
}

function KakaoMapView() {
  const [loading, error] = useKakaoLoader({
    appkey: config.kakaoApiKey,
    libraries: ['services'],
  })

  const center = useMemo(() => ({ lat: 35.1462, lng: 126.9318 }), [])
  const restaurants = restaurantsData
  const [selectedId, setSelectedId] = useState(() => restaurantsData[0]?.id ?? null)

  const selected = useMemo(
    () => restaurants.find((r) => r.id === selectedId) ?? null,
    [restaurants, selectedId],
  )

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
          <MapMarker key={r.id} position={r.position} onClick={() => setSelectedId(r.id)} />
        ))}

        {selected ? (
          <CustomOverlayMap position={selected.position} yAnchor={1.12}>
            <div className="w-[260px] overflow-hidden rounded-2xl border border-black/10 bg-white shadow-xl">
              <div className="flex items-start gap-2 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center rounded-full bg-violet-600 px-2 py-0.5 text-xs font-semibold text-white">
                      {selected.category}
                    </span>
                    <span className="text-xs text-slate-500">조선대 근처</span>
                  </div>
                  <div className="mt-1 truncate text-base font-semibold text-slate-900">
                    {selected.name}
                  </div>
                  <div className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                    {selected.note}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedId(null)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-700"
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

              <div className="border-t border-slate-100 px-4 py-3">
                <div className="text-xs font-medium text-slate-500">주소</div>
                <div className="mt-1 text-sm text-slate-800">{selected.address}</div>
                {selected.tags?.length ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {selected.tags.map((t) => (
                      <span
                        key={t}
                        className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700"
                      >
                        #{t}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          </CustomOverlayMap>
        ) : null}
      </Map>

      <div className="pointer-events-none absolute left-4 top-4 rounded-2xl border border-black/10 bg-white/90 px-4 py-3 shadow-lg backdrop-blur">
        <div className="text-sm font-semibold text-slate-900">조선대 맛집 지도</div>
        <div className="mt-0.5 text-xs text-slate-600">마커를 클릭하면 식당 정보가 보여요</div>
      </div>
    </div>
  )
}

function App() {
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
      <KakaoMapView />
      <CoffeeDonateButton />
    </>
  )
}

export default App
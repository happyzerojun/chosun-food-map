import { useMemo, useState } from 'react'
import { CustomOverlayMap, Map, useKakaoLoader } from 'react-kakao-maps-sdk'
import restaurantsData from './data/restaurants.json'
import { config } from './config.js'

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

function KakaoMapView() {
  const [loading, error] = useKakaoLoader({
    appkey: config.kakaoApiKey,
    libraries: ['services'],
  })

  // 후원 버튼 및 UI와의 밸런스를 고려해 초기 중심 좌표를 살짝 보정했습니다.
  const center = useMemo(() => ({ lat: 35.1448, lng: 126.9305 }), [])
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
              className="flex cursor-pointer flex-col items-center border-0 bg-transparent p-0 outline-none hover:scale-105 transition-transform"
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
          <CustomOverlayMap position={selected.position} yAnchor={1.12} zIndex={40}>
            {/* 넓이를 280px로 살짝 넓히고 가독성 속성(break-keep)을 추가했습니다. */}
            <div className="w-[280px] overflow-hidden rounded-2xl border border-black/10 bg-white shadow-2xl">
              <div className="flex items-start gap-2 px-4 py-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center rounded-full bg-violet-600 px-2 py-0.5 text-[10px] font-bold text-white tracking-wide">
                      {selected.category}
                    </span>
                    <span className="text-[11px] font-medium text-slate-400">조선대 근처</span>
                  </div>
                  <div className="mt-1.5 truncate text-lg font-bold text-slate-900">
                    {selected.name}
                  </div>
                  <div className="mt-0.5 text-sm font-bold text-violet-700">
                    {selected.representative_price}
                  </div>
                  {/* 한글 단어 단위 줄바꿈(break-keep) 적용으로 문장 깨짐 방지 */}
                  <div className="mt-2.5 whitespace-pre-wrap break-keep text-[13px] leading-relaxed text-slate-600">
                    {selected.note}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedId(null)}
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
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
            </div>
          </CustomOverlayMap>
        ) : null}
      </Map>

      {/* 좌측 상단 안내 박스 Z-index 상향 조정 */}
      <div className="pointer-events-none absolute left-4 top-4 z-[1000] rounded-2xl border border-black/10 bg-white/95 px-4 py-3 shadow-lg backdrop-blur">
        <div className="text-sm font-bold text-slate-900">조대 후문 가성비 맛집 지도</div>
        <div className="mt-0.5 text-[11px] font-medium text-slate-500">
          마커를 누르면 상세 가성비 정보를 볼 수 있어요.
        </div>
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
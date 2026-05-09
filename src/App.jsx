import { useEffect, useMemo, useState } from 'react'
import { CustomOverlayMap, Map, MapMarker, useKakaoLoader } from 'react-kakao-maps-sdk'
import restaurantsData from './data/restaurants.json'

function App() {
  const [loading, error] = useKakaoLoader({
    appkey: import.meta.env.VITE_KAKAO_API_KEY,
    libraries: ['services'],
  })

  const center = useMemo(() => ({ lat: 35.1462, lng: 126.9318 }), [])
  const restaurants = restaurantsData
  const [selectedId, setSelectedId] = useState(() => restaurantsData[0]?.id ?? null)

  useEffect(() => {
    // 점검용 로그: .env 값이 App까지 들어오는지 확인
    console.log('[ENV] VITE_KAKAO_API_KEY:', import.meta.env.VITE_KAKAO_API_KEY)
    if (!import.meta.env.VITE_KAKAO_API_KEY) {
      console.error('[ENV] VITE_KAKAO_API_KEY가 비어있습니다. .env 설정 후 dev 서버를 재시작하세요.')
    }
  }, [])

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
            카카오 키가 올바른지 확인하세요. 콘솔에 에러가 함께 찍힙니다.
          </div>
        </div>
      </div>
    )
  if (loading) return <div className="flex h-screen items-center justify-center">지도를 불러오는 중...</div>

  return (
    <div className="relative h-screen w-screen">
      <Map center={center} level={3} style={{ width: '100%', height: '100%' }}>
        {restaurants.map((r) => (
          <MapMarker
            key={r.id}
            position={r.position}
            onClick={() => setSelectedId(r.id)}
          />
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
        <div className="mt-0.5 text-xs text-slate-600">
          마커를 클릭하면 식당 정보가 보여요
        </div>
      </div>
    </div>
  )
}

export default App
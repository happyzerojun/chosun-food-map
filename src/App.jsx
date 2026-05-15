import { useMemo, useState, useEffect } from 'react'
import { CustomOverlayMap, Map, useKakaoLoader } from 'react-kakao-maps-sdk'
import { createClient } from '@supabase/supabase-js'
import { config } from './config.js'
import { RestaurantReviews } from './components/RestaurantReviews.jsx'
import AdSense from './components/AdSense.jsx'

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
)

const COFFEE_DONATION_URL = 'https://ctee.kr/place/chosun_dev'

function KakaoMapView({ onReady }) {
  const [loadingMap, errorMap] = useKakaoLoader({
    appkey: config.kakaoApiKey,
    libraries: ['services'],
  })

  const [restaurantsData, setRestaurantsData] = useState([])
  const [isDataLoading, setIsDataLoading] = useState(true)
  const [selectedId, setSelectedId] = useState(null)
  const [hoveredId, setHoveredId] = useState(null)
  const [sortBy, setSortBy] = useState('default')
  const [filterTag, setFilterTag] = useState('all')

  const center = useMemo(() => ({ lat: 35.1448, lng: 126.9305 }), [])

  useEffect(() => {
    async function fetchRestaurants() {
      try {
        const { data, error } = await supabase
          .from('restaurants_with_stats')
          .select('*')

        if (error) throw error
        setRestaurantsData(data || [])
      } catch (err) {
        console.error('데이터 로드 실패:', err)
      } finally {
        setIsDataLoading(false)
      }
    }
    fetchRestaurants()
  }, [])

  const allTags = useMemo(() => {
    const tags = new Set()
    restaurantsData.forEach(r => { if (r.category) tags.add(r.category) })
    return ['all', ...Array.from(tags)]
  }, [restaurantsData])

  const filteredAndSortedData = useMemo(() => {
    let result = [...restaurantsData]

    if (filterTag !== 'all') {
      result = result.filter(r => r.category === filterTag || r.tags?.includes(filterTag))
    }

    const getPrice = (p) => parseInt(p?.replace(/[^0-9]/g, '')) || 0

    if (sortBy === 'priceAsc') result.sort((a, b) => getPrice(a.representative_price) - getPrice(b.representative_price))
    else if (sortBy === 'priceDesc') result.sort((a, b) => getPrice(b.representative_price) - getPrice(a.representative_price))
    else if (sortBy === 'ratingDesc') result.sort((a, b) => b.avg_rating - a.avg_rating)

    return result
  }, [sortBy, filterTag, restaurantsData])

  const selected = useMemo(
    () => restaurantsData.find((r) => r.id === selectedId) ?? null,
    [selectedId, restaurantsData]
  )

  useEffect(() => {
    if (!loadingMap && !errorMap) onReady(true)
  }, [loadingMap, errorMap, onReady])

  const getVisualOffset = (id) => {
    switch (id) {
      case 'tongkeun-donkatsu': return 'translate-x-8 -translate-y-4'
      case 'jodea-buger': return '-translate-x-6 translate-y-4'
      case 'mujinjang-tteokbokki': return '-translate-x-2 -translate-y-6'
      default: return ''
    }
  }

  if (errorMap) return <div className="flex h-screen items-center justify-center text-red-500">지도 로드 실패</div>
  if (loadingMap || isDataLoading) return <div className="flex h-screen items-center justify-center font-bold text-slate-600">조대 후문 맛집 불러오는 중...</div>

  return (
    <div className="flex flex-col md:flex-row h-screen w-screen overflow-hidden bg-slate-50">

      {/* 🚀 좌측 사이드바 영역 */}
      <div className="w-full md:w-[380px] h-[40vh] md:h-full bg-white shadow-xl z-20 flex flex-col shrink-0 order-2 md:order-1 border-t md:border-t-0 md:border-r border-slate-200">
        <div className="p-5 border-b border-slate-100 bg-white">

          {/* 🚀 헤더: 제목 + 커피 후원 버튼 통합 */}
          <div className="flex justify-between items-center">
            <h1 className="text-xl font-black text-slate-900 tracking-tight">조대 후문 맛집</h1>
            <a
              href={COFFEE_DONATION_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 bg-[#FFDD00] text-slate-900 text-[11px] font-bold px-3 py-1.5 rounded-full shadow-sm hover:brightness-95 hover:scale-105 transition-all whitespace-nowrap"
            >
              커피 사주기 ☕
            </a>
          </div>

          <div className="flex gap-2 mt-4">
            <select className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold" value={filterTag} onChange={(e)=>setFilterTag(e.target.value)}>
              <option value="all">모든 카테고리</option>
              {allTags.filter(t=>t!=='all').map(t=><option key={t} value={t}>{t}</option>)}
            </select>
            <select className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold" value={sortBy} onChange={(e)=>setSortBy(e.target.value)}>
              <option value="default">기본순</option>
              <option value="ratingDesc">별점 높은순 ⭐</option>
              <option value="priceAsc">가격 낮은순</option>
            </select>
          </div>
        </div>

        {/* 🚀 사이드바 리스트: 노트(note)와 태그(tags) 복구 */}
        <ul className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
          {filteredAndSortedData.map(r => (
            <li
              key={r.id}
              onMouseEnter={() => setHoveredId(r.id)}
              onMouseLeave={() => setHoveredId(null)}
              onClick={() => setSelectedId(r.id)}
              className={`p-4 rounded-2xl border transition-all cursor-pointer ${selectedId === r.id ? 'border-violet-500 bg-violet-50 ring-2 ring-violet-200' : 'border-slate-100 bg-white hover:border-violet-300'}`}
            >
              <div className="flex justify-between items-start mb-2">
                <span className="text-[10px] font-black text-white bg-violet-600 px-2 py-0.5 rounded-full">{r.category}</span>
                <div className="flex items-center gap-1">
                  <span className="text-yellow-400 text-xs">★</span>
                  <span className="text-xs font-bold text-slate-600">{r.avg_rating}</span>
                </div>
              </div>

              <div className="flex justify-between items-end gap-2">
                <h3 className="text-base font-black text-slate-900 leading-tight">{r.name}</h3>
                <span className="text-sm font-bold text-violet-700 whitespace-nowrap">{r.representative_price}</span>
              </div>

              {/* 복구된 노트(한줄 설명) */}
              {r.note && (
                <p className="text-xs text-slate-500 mt-2 line-clamp-2 leading-relaxed">{r.note}</p>
              )}

              {/* 복구된 태그 */}
              {r.tags && r.tags.length > 0 && (
                <div className="mt-2.5 flex flex-wrap gap-1">
                  {r.tags.map(t => (
                    <span key={t} className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-[10px] font-medium text-slate-500">
                      #{t}
                    </span>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>

      {/* 🚀 우측 지도 영역 */}
      <div className="flex-1 relative h-[60vh] md:h-full order-1 md:order-2">
        <Map center={center} level={3} style={{ width: '100%', height: '100%' }}>
          {filteredAndSortedData.map((r) => {
            const isHighlighted = selectedId === r.id || hoveredId === r.id;
            return (
              <CustomOverlayMap key={r.id} position={{lat: r.lat, lng: r.lng}} xAnchor={0.5} yAnchor={1} zIndex={isHighlighted ? 50 : 10}>
                <button
                  onClick={() => setSelectedId(r.id)}
                  className={`flex flex-col items-center transition-all duration-200 ${isHighlighted ? 'scale-110' : 'scale-100'} ${getVisualOffset(r.id)}`}
                >
                  <div className={`rounded-2xl border px-3 py-2 shadow-2xl transition-colors ${isHighlighted ? 'bg-violet-600 border-violet-800 text-white' : 'bg-white border-slate-200 text-slate-900'}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-black">{r.representative_price}</span>
                      <div className="flex items-center gap-0.5">
                        <span className="text-[10px] text-yellow-400">★</span>
                        <span className={`text-[10px] font-bold ${isHighlighted ? 'text-white' : 'text-slate-500'}`}>{r.avg_rating}</span>
                      </div>
                    </div>
                    <span className={`mt-0.5 block max-w-[110px] truncate text-center text-[10px] font-bold ${isHighlighted ? 'text-violet-200' : 'text-slate-400'}`}>{r.name}</span>
                  </div>
                  <svg width="20" height="9"><path d="M10 9 L1 1 H19 Z" fill={isHighlighted ? '#7c3aed' : '#ffffff'} stroke={isHighlighted ? '#5b21b6' : 'rgba(0,0,0,0.1)'} strokeWidth="1"/></svg>
                </button>
              </CustomOverlayMap>
            )
          })}
        </Map>

        {/* 고정형 상세 정보 패널 */}
        {selected && (
          <div className="absolute bottom-0 left-0 right-0 md:top-4 md:right-4 md:left-auto md:bottom-auto z-[10001] p-4 pointer-events-none">
            <div className="pointer-events-auto w-full md:w-[400px] bg-white rounded-t-3xl md:rounded-3xl shadow-[0_-10px_40px_rgba(0,0,0,0.2)] md:shadow-2xl flex flex-col overflow-hidden max-h-[80vh] animate-in slide-in-from-bottom-10 duration-300">
              <div className="sticky top-0 bg-white p-5 border-b flex justify-between items-start">
                <div>
                  <span className="bg-violet-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">{selected.category}</span>
                  <h2 className="text-xl font-black text-slate-900 mt-2">{selected.name}</h2>
                </div>
                <button onClick={() => setSelectedId(null)} className="p-2 bg-slate-100 rounded-full text-slate-400 hover:text-slate-700">
                  <svg viewBox="0 0 24 24" className="h-6 w-6"><path fill="currentColor" d="M18.3 5.71a1 1 0 0 1 0 1.42L13.42 12l4.88 4.88a1 1 0 1 1-1.42 1.42L12 13.42l-4.88 4.88a1 1 0 1 1-1.42-1.42L10.58 12 5.7 7.12a1 1 0 0 1 1.42-1.42L12 10.58l4.88-4.88a1 1 0 0 1 1.42 0Z"/></svg>
                </button>
              </div>
              <div className="overflow-y-auto flex-1 custom-scrollbar">
                <div className="p-5">
                  <p className="text-sm font-bold text-violet-700">{selected.representative_price}</p>
                  <p className="text-sm text-slate-600 mt-2 leading-relaxed break-keep">{selected.note}</p>
                  <div className="mt-4 p-4 bg-slate-50 rounded-2xl border border-slate-100 text-xs font-medium text-slate-500">{selected.address}</div>
                </div>
                <RestaurantReviews restaurantId={selected.id} />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function App() {
  const [contentReady, setContentReady] = useState(false)
  if (!config.kakaoApiKey) return <div className="h-screen flex items-center justify-center font-bold">API 키 설정이 필요합니다.</div>

  return (
    <>
      <KakaoMapView onReady={setContentReady} />
      <div className="fixed top-0 left-0 w-full z-[11000] pointer-events-none">
        <div className="max-w-4xl mx-auto pointer-events-auto">
          <AdSense isReady={contentReady} />
        </div>
      </div>
      {/* 🚀 플로팅 버튼(CoffeeDonateButton) 삭제 완료 */}
    </>
  )
}

export default App
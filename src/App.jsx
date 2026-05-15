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

  // 🚀 카테고리 목록 추출
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
  if (loadingMap || isDataLoading) return <div className="flex h-screen items-center justify-center font-bold text-slate-600 font-sans">조대 후문 맛집 불러오는 중...</div>

  return (
    <div className="flex flex-col md:flex-row h-screen w-screen overflow-hidden bg-slate-50 font-sans">

      {/* 🚀 좌측 사이드바: 가로 스크롤 카테고리 적용 */}
      <div className="w-full md:w-[380px] h-[38vh] md:h-full bg-white shadow-xl z-20 flex flex-col shrink-0 order-2 md:order-1 border-t md:border-t-0 md:border-r border-slate-200">
        <div className="p-4 md:p-5 border-b border-slate-100 bg-white">
          <div className="flex justify-between items-center mb-4">
            <h1 className="text-lg md:text-xl font-black text-slate-900 tracking-tight">조대 후문 맛집</h1>
            <a
              href={COFFEE_DONATION_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 bg-[#FFDD00] text-slate-900 text-[10px] md:text-[11px] font-bold px-3 py-1.5 rounded-full shadow-sm hover:scale-105 transition-transform"
            >
              커피 사주기 ☕
            </a>
          </div>

          {/* 🚀 카테고리 가로 스크롤바 (핵심 수정) */}
          <div className="flex overflow-x-auto gap-2 pb-2 no-scrollbar scroll-smooth">
            {allTags.map(tag => (
              <button
                key={tag}
                onClick={() => setFilterTag(tag)}
                className={`px-3 py-1.5 rounded-full text-[11px] md:text-xs font-bold whitespace-nowrap border transition-all ${filterTag === tag ? 'bg-violet-600 border-violet-600 text-white shadow-sm' : 'bg-white border-slate-200 text-slate-600 hover:border-violet-300'}`}
              >
                {tag === 'all' ? '전체보기' : tag}
              </button>
            ))}
          </div>

          {/* 정렬 옵션은 카테고리 밑에 작게 배치 */}
          <div className="mt-2 flex justify-end">
            <select className="bg-transparent text-[10px] md:text-[11px] font-bold text-slate-400 outline-none cursor-pointer" value={sortBy} onChange={(e)=>setSortBy(e.target.value)}>
              <option value="default">기본 정렬</option>
              <option value="ratingDesc">별점 높은순</option>
              <option value="priceAsc">가격 낮은순</option>
            </select>
          </div>
        </div>

        <ul className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar bg-slate-50/50">
          {filteredAndSortedData.map(r => (
            <li
              key={r.id}
              onClick={() => setSelectedId(r.id)}
              className={`p-4 rounded-2xl border transition-all cursor-pointer shadow-sm ${selectedId === r.id ? 'border-violet-500 bg-violet-50 ring-2 ring-violet-100' : 'border-white bg-white hover:border-violet-200'}`}
            >
              <div className="flex justify-between items-start mb-2">
                <span className="text-[9px] md:text-[10px] font-black text-white bg-violet-600 px-2 py-0.5 rounded-full">{r.category}</span>
                <div className="flex items-center gap-1">
                  <span className="text-yellow-400 text-xs">★</span>
                  <span className="text-xs font-bold text-slate-600">{r.avg_rating}</span>
                </div>
              </div>
              <div className="flex justify-between items-end gap-2">
                <h3 className="text-sm md:text-base font-black text-slate-900 leading-tight">{r.name}</h3>
                <span className="text-[11px] md:text-sm font-bold text-violet-700 whitespace-nowrap">{r.representative_price}</span>
              </div>
              {r.note && <p className="text-[11px] text-slate-500 mt-2 line-clamp-1">{r.note}</p>}
            </li>
          ))}
        </ul>
      </div>

      {/* 🚀 우측 지도 영역 */}
      <div className="flex-1 relative h-[62vh] md:h-full order-1 md:order-2">
        <Map center={center} level={3} style={{ width: '100%', height: '100%' }}>
          {filteredAndSortedData.map((r) => {
            const isHighlighted = selectedId === r.id || hoveredId === r.id;
            return (
              <CustomOverlayMap key={r.id} position={{lat: r.lat, lng: r.lng}} xAnchor={0.5} yAnchor={1} zIndex={isHighlighted ? 50 : 10}>
                <button
                  onClick={() => setSelectedId(r.id)}
                  className={`flex flex-col items-center transition-all duration-200 ${isHighlighted ? 'scale-110' : 'scale-100'} ${getVisualOffset(r.id)}`}
                >
                  {/* 🚀 마커 내 가게 이름 복구 (핵심 수정) */}
                  <div className={`rounded-xl border px-3 py-1.5 shadow-xl transition-colors ${isHighlighted ? 'bg-violet-600 border-violet-800 text-white' : 'bg-white border-slate-200 text-slate-900'}`}>
                    <div className="flex items-center justify-center gap-1.5">
                      <span className="text-[10px] font-black">{r.representative_price}</span>
                      <div className="flex items-center gap-0.5">
                        <span className="text-[9px] text-yellow-400">★</span>
                        <span className={`text-[9px] font-bold ${isHighlighted ? 'text-white' : 'text-slate-500'}`}>{r.avg_rating}</span>
                      </div>
                    </div>
                    {/* 가게 이름 표시 */}
                    <div className={`mt-0.5 text-center text-[9px] font-bold truncate max-w-[80px] ${isHighlighted ? 'text-violet-100' : 'text-slate-400'}`}>
                      {r.name}
                    </div>
                  </div>
                  <svg width="18" height="8"><path d="M9 8 L1 1 H17 Z" fill={isHighlighted ? '#7c3aed' : '#ffffff'} stroke={isHighlighted ? '#5b21b6' : 'rgba(0,0,0,0.1)'} strokeWidth="1"/></svg>
                </button>
              </CustomOverlayMap>
            )
          })}
        </Map>

        {/* 고정형 상세 정보 패널 (짤림 방지) */}
        {selected && (
          <div className="absolute bottom-0 left-0 right-0 md:top-4 md:right-4 md:left-auto md:bottom-auto z-[10001] p-3 md:p-0 pointer-events-none">
            <div className="pointer-events-auto w-full md:w-[380px] bg-white rounded-t-2xl md:rounded-2xl shadow-2xl flex flex-col overflow-hidden max-h-[58vh] md:max-h-[85vh] animate-in slide-in-from-bottom-10 duration-300">
              <div className="h-1 bg-slate-200 w-8 rounded-full mx-auto my-2 md:hidden" />
              <div className="sticky top-0 bg-white px-5 py-3 md:py-4 border-b flex justify-between items-start">
                <div className="min-w-0 flex-1">
                  <span className="bg-violet-600 text-white text-[9px] font-bold px-2 py-0.5 rounded-full">{selected.category}</span>
                  <h2 className="text-lg md:text-xl font-black text-slate-900 mt-1 truncate">{selected.name}</h2>
                </div>
                <button onClick={() => setSelectedId(null)} className="p-2 bg-slate-50 rounded-full text-slate-400 hover:text-slate-700">
                  <svg viewBox="0 0 24 24" className="h-5 w-5 md:h-6 md:w-6"><path fill="currentColor" d="M18.3 5.71a1 1 0 0 1 0 1.42L13.42 12l4.88 4.88a1 1 0 1 1-1.42 1.42L12 13.42l-4.88 4.88a1 1 0 1 1-1.42-1.42L10.58 12 5.7 7.12a1 1 0 0 1 1.42-1.42L12 10.58l4.88-4.88a1 1 0 0 1 1.42 0Z"/></svg>
                </button>
              </div>
              <div className="overflow-y-auto flex-1 custom-scrollbar pb-4">
                <div className="p-5">
                  <p className="text-sm font-bold text-violet-700">{selected.representative_price}</p>
                  <p className="text-[12px] md:text-sm text-slate-600 mt-2 leading-relaxed break-keep">{selected.note}</p>
                  <div className="mt-4 p-3 bg-slate-50 rounded-xl border border-slate-100 text-[11px] text-slate-500 font-medium">{selected.address}</div>
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
    </>
  )
}

export default App
import { useMemo, useState, useEffect } from 'react'
import { CustomOverlayMap, Map, useKakaoLoader, MarkerClusterer } from 'react-kakao-maps-sdk'
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
    libraries: ['services', 'clusterer'],
  })

  const [restaurantsData, setRestaurantsData] = useState([])
  const [isDataLoading, setIsDataLoading] = useState(true)
  const [selectedId, setSelectedId] = useState(null)
  const [hoveredId, setHoveredId] = useState(null)
  const [sortBy, setSortBy] = useState('default')
  const [filterTag, setFilterTag] = useState('all')
  const [isExpanded, setIsExpanded] = useState(false)

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

  // 🚀 트렌드: 조회수(visit_count) 기준 인기 맛집 추출
  const popularRestaurants = useMemo(() => {
    return [...restaurantsData]
      .sort((a, b) => (b.visit_count || 0) - (a.visit_count || 0))
      .slice(0, 4)
  }, [restaurantsData])

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

  // 🚀 맛집 클릭 시 방문수 증가 로직
  const handleSelectRestaurant = async (id) => {
    setSelectedId(id)
    try {
      await supabase.rpc('increment_visit_count', { restaurant_id: id })
    } catch (err) {
      console.error('조회수 업데이트 실패:', err)
    }
  }

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
      <div className={`w-full md:w-[380px] transition-all duration-300 ${isExpanded ? 'h-[85vh]' : 'h-[38vh]'} md:h-full bg-white shadow-xl z-20 flex flex-col shrink-0 order-2 md:order-1 border-t md:border-t-0 md:border-r border-slate-200`}>
        <button onClick={() => setIsExpanded(!isExpanded)} className="md:hidden w-full py-1.5 text-[10px] font-bold text-slate-400 bg-slate-50 border-b border-slate-200 flex justify-center items-center gap-1">
          {isExpanded ? '▼ 목록 줄이기' : '▲ 목록 펼쳐보기'}
        </button>

        <div className="p-4 md:p-5 border-b border-slate-100 bg-white flex-shrink-0">
          <div className="flex justify-between items-center mb-4">
            <h1 className="text-lg md:text-xl font-black text-slate-900 tracking-tight">조대 후문 맛집</h1>
            <a href={COFFEE_DONATION_URL} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 bg-[#FFDD00] text-slate-900 text-[10px] md:text-[11px] font-bold px-3 py-1.5 rounded-full shadow-sm hover:scale-105 transition-transform">커피 사주기 ☕</a>
          </div>

          {popularRestaurants.length > 0 && filterTag === 'all' && (
            <div className="mb-4">
              <h2 className="text-xs font-black text-slate-800 mb-2">🔥 지금 뜨는 인기 맛집</h2>
              <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar scroll-smooth">
                {popularRestaurants.map((pr, idx) => (
                  <button key={pr.id} onClick={() => handleSelectRestaurant(pr.id)} className="flex-shrink-0 w-28 md:w-32 bg-gradient-to-br from-orange-50 to-red-50 border border-orange-100 rounded-xl p-2.5 text-left hover:shadow-md transition-all">
                    <div className="text-[10px] font-bold text-orange-600 mb-1">{idx + 1}위</div>
                    <div className="text-xs font-black text-slate-900 truncate mb-1">{pr.name}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex overflow-x-auto gap-2 pb-2 no-scrollbar scroll-smooth">
            {allTags.map(tag => (
              <button key={tag} onClick={() => setFilterTag(tag)} className={`px-3 py-1.5 rounded-full text-[11px] md:text-xs font-bold whitespace-nowrap border transition-all ${filterTag === tag ? 'bg-violet-600 text-white' : 'bg-white border-slate-200 text-slate-600'}`}>
                {tag === 'all' ? '전체보기' : tag}
              </button>
            ))}
          </div>
        </div>

        <ul className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar bg-slate-50/50">
          {filteredAndSortedData.map(r => (
            <li key={r.id} onClick={() => handleSelectRestaurant(r.id)} className={`p-4 rounded-2xl border cursor-pointer ${selectedId === r.id ? 'border-violet-500 bg-violet-50' : 'border-white bg-white'}`}>
              <div className="flex justify-between items-end gap-2">
                <h3 className="text-sm md:text-base font-black text-slate-900">{r.name}</h3>
                <span className="text-[11px] font-bold text-violet-700">{r.representative_price}</span>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className={`flex-1 relative transition-all duration-300 ${isExpanded ? 'h-[15vh]' : 'h-[62vh]'} md:h-full order-1 md:order-2`}>
        <Map center={center} level={3} style={{ width: '100%', height: '100%' }}>
          <MarkerClusterer averageCenter={true} minLevel={5}>
            {filteredAndSortedData.map((r) => (
              <CustomOverlayMap key={r.id} position={{lat: r.lat, lng: r.lng}} xAnchor={0.5} yAnchor={1}>
                <button onClick={() => handleSelectRestaurant(r.id)} className={`flex flex-col items-center ${getVisualOffset(r.id)}`}>
                  <div className={`rounded-xl border px-3 py-1.5 shadow-xl ${selectedId === r.id ? 'bg-violet-600 text-white' : 'bg-white text-slate-900'}`}>
                    <div className="text-[10px] font-black">{r.name}</div>
                  </div>
                  <svg width="18" height="8"><path d="M9 8 L1 1 H17 Z" fill={selectedId === r.id ? '#7c3aed' : '#ffffff'}/></svg>
                </button>
              </CustomOverlayMap>
            ))}
          </MarkerClusterer>
        </Map>
        {selected && (
          <div className="absolute bottom-0 left-0 right-0 z-[10001] p-3">
            <div className="bg-white rounded-t-2xl shadow-2xl p-5">
              <h2 className="text-xl font-black">{selected.name}</h2>
              <p className="text-sm mt-2">{selected.note}</p>
              <button onClick={() => setSelectedId(null)} className="mt-4 w-full bg-slate-100 py-2 rounded-xl text-sm font-bold">닫기</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function App() {
  const [contentReady, setContentReady] = useState(false)
  return <KakaoMapView onReady={setContentReady} />
}

export default App
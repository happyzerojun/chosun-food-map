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
        console.error('데이터 로드 실패했음:', err)
      } finally {
        setIsDataLoading(false)
      }
    }
    fetchRestaurants()
  }, [])

  const popularRestaurants = useMemo(() => {
    return [...restaurantsData]
      .sort((a, b) => (b.visit_count || 0) - (a.visit_count || 0))
      .slice(0, 4)
  }, [restaurantsData])

  const filteredAndSortedData = useMemo(() => {
    let result = [...restaurantsData]
    if (filterTag !== 'all') {
      result = result.filter(r => r.category === filterTag || r.tags?.includes(filterTag))
    }
    const getPrice = (p) => parseInt(p?.replace(/[^0-9]/g, '')) || 0
    if (sortBy === 'priceAsc') result.sort((a, b) => getPrice(a.representative_price) - getPrice(b.representative_price))
    else if (sortBy === 'ratingDesc') result.sort((a, b) => b.avg_rating - a.avg_rating)
    return result
  }, [sortBy, filterTag, restaurantsData])

  const selected = useMemo(() => restaurantsData.find((r) => r.id === selectedId) ?? null, [selectedId, restaurantsData])

  const handleSelectRestaurant = async (id) => {
    setSelectedId(id)
    try { await supabase.rpc('increment_visit_count', { restaurant_id: id }) } catch (err) { console.error(err) }
  }

  useEffect(() => {
    if (!loadingMap && !errorMap) onReady(true)
  }, [loadingMap, errorMap, onReady])

  if (errorMap) return <div className="h-screen flex items-center justify-center text-red-500">지도 로드 실패</div>
  if (loadingMap || isDataLoading) return <div className="h-screen flex items-center justify-center font-bold">로딩 중...</div>

  return (
    <div className="flex flex-col md:flex-row h-screen w-screen overflow-hidden bg-slate-50 font-sans">
      <div className={`w-full md:w-[380px] transition-all duration-300 ${isExpanded ? 'h-[85vh]' : 'h-[38vh]'} md:h-full bg-white shadow-xl z-20 flex flex-col order-2 md:order-1 border-r`}>
        <button onClick={() => setIsExpanded(!isExpanded)} className="md:hidden py-2 text-[10px] bg-slate-100 font-bold text-slate-500">
          {isExpanded ? '▼ 목록 줄이기' : '▲ 목록 펼쳐보기'}
        </button>
        <ul className="flex-1 overflow-y-auto p-3 space-y-2">
          {filteredAndSortedData.map(r => (
            <li key={r.id} onClick={() => handleSelectRestaurant(r.id)} className="p-4 bg-white border rounded-2xl cursor-pointer hover:border-violet-300 transition-all">
              <div className="flex justify-between"><h3 className="font-black">{r.name}</h3><span className="text-sm font-bold text-violet-600">{r.representative_price}</span></div>
              <div className="text-xs text-slate-500 mt-1">★ {r.avg_rating} | 리뷰 {r.review_count}개</div>
            </li>
          ))}
        </ul>
      </div>

      <div className={`flex-1 relative ${isExpanded ? 'h-[15vh]' : 'h-[62vh]'} md:h-full order-1 md:order-2`}>
        <Map center={center} level={3} style={{ width: '100%', height: '100%' }}>
          <MarkerClusterer minLevel={5}>
            {filteredAndSortedData.map((r) => (
              <CustomOverlayMap key={r.id} position={{lat: r.lat, lng: r.lng}}>
                <button onClick={() => handleSelectRestaurant(r.id)} className="bg-white px-2 py-1 rounded shadow text-[10px] font-bold border">{r.name}</button>
              </CustomOverlayMap>
            ))}
          </MarkerClusterer>
        </Map>

        {selected && (
          <div className="absolute bottom-0 left-0 right-0 z-[10001] bg-white rounded-t-2xl p-6 shadow-2xl">
            <div className="flex justify-between items-start">
              <div>
                <h2 className="text-2xl font-black">{selected.name}</h2>
                <div className="flex gap-4 mt-2 text-sm font-bold">
                  <span className="text-yellow-500">★ {selected.avg_rating}</span>
                  <span className="text-slate-600">가격 {selected.representative_price}</span>
                </div>
              </div>
              <button onClick={() => setSelectedId(null)} className="p-2 bg-slate-100 rounded-full">✕</button>
            </div>
            <p className="text-slate-600 text-sm mt-4">{selected.note}</p>
            <a href={`/write-review?id=${selected.id}`} className="mt-6 block w-full text-center bg-violet-600 text-white font-bold py-3 rounded-xl">리뷰 쓰기</a>
            <div className="mt-6"><RestaurantReviews restaurantId={selected.id} /></div>
          </div>
        )}
      </div>
    </div>
  )
}

function App() {
  const [contentReady, setContentReady] = useState(false)
  return (
    <>
      <KakaoMapView onReady={setContentReady} />
      <div className="fixed top-0 left-0 w-full z-[11000] pointer-events-none">
        <div className="max-w-4xl mx-auto pointer-events-auto"><AdSense isReady={contentReady} /></div>
      </div>
    </>
  )
}

export default App
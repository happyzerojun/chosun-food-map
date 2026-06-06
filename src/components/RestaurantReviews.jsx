import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { formatInTimeZone } from 'date-fns-tz'
import { getReviewsApiUrl } from '../lib/reviewsApi.js'

const LOCK_KEY = 'review_daily_lock_v1'
const MY_REVIEWS_KEY = 'my_authored_reviews_v1' // 🚀 내 리뷰 비밀번호 저장소
const TZ_SEOUL = 'Asia/Seoul'

function todayKstYmd() {
  return formatInTimeZone(new Date(), TZ_SEOUL, 'yyyy-MM-dd')
}

function readLockMap() {
  try {
    const raw = localStorage.getItem(LOCK_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function writeLockForRestaurant(restaurantId, dateKst) {
  try {
    const map = readLockMap()
    map[restaurantId] = dateKst
    localStorage.setItem(LOCK_KEY, JSON.stringify(map))
  } catch {
    /* ignore quota / private mode */
  }
}

// 🚀 내 리뷰 목록 읽고 쓰기 유틸리티
function getMyReviews() {
  try { return JSON.parse(localStorage.getItem(MY_REVIEWS_KEY)) || {} }
  catch { return {} }
}

function saveMyReview(reviewId, password) {
  const myReviews = getMyReviews();
  myReviews[reviewId] = password;
  localStorage.setItem(MY_REVIEWS_KEY, JSON.stringify(myReviews));
}

// 🚀 하드코딩된 프리셋 태그
const PRESET_TAGS = ['#가성비', '#혼밥', '#분위기맛집', '#웨이팅있음', '#친절해요', '#양많음'];

export function RestaurantReviews({ restaurantId }) {
  const apiUrl = useMemo(() => getReviewsApiUrl(), [])
  const [reviews, setReviews] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState(null)

  // 🚀 폼 자동화 State
  const [nickname, setNickname] = useState('')
  const [rating, setRating] = useState(5)
  const [content, setContent] = useState('')
  const [selectedTags, setSelectedTags] = useState([]) // 🚀 토글형 태그 상태

  const todayKst = todayKstYmd()
  const lockedForToday = readLockMap()[restaurantId] === todayKst
  const myReviews = getMyReviews(); // 내 기기에 저장된 리뷰/비번 딕셔너리

  // 🚀 평균 별점 계산 로직
  const { avgRating, reviewCount } = useMemo(() => {
    if (!reviews || reviews.length === 0) return { avgRating: '0.0', reviewCount: 0 };
    const total = reviews.reduce((acc, curr) => acc + curr.rating, 0);
    return {
      avgRating: (total / reviews.length).toFixed(1),
      reviewCount: reviews.length
    };
  }, [reviews]);

  const loadReviews = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${apiUrl}?restaurant_id=${encodeURIComponent(restaurantId)}`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(payload.error || '리뷰를 불러오지 못했습니다.')
      }
      setReviews(Array.isArray(payload.reviews) ? payload.reviews : [])
    } catch (e) {
      setError(e.message || '리뷰를 불러오지 못했습니다.')
      setReviews([])
    } finally {
      setLoading(false)
    }
  }, [apiUrl, restaurantId])

  useEffect(() => {
    loadReviews()
  }, [loadReviews])

  // 🚀 모달 열릴 때 랜덤 닉네임 세팅
  useEffect(() => {
    if (isModalOpen) {
      const randomId = Math.floor(1000 + Math.random() * 9000);
      setNickname(`조대미식가_${randomId}`);
      setContent('');
      setSelectedTags([]);
      setRating(5);
      setFormError(null);
    }
  }, [isModalOpen]);

  const toggleTag = (tag) => {
    setSelectedTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    )
  };

  const handleSubmit = async (e) => {
    e.preventDefault()
    setFormError(null)
    setSubmitting(true)
    try {
      // 백그라운드 랜덤 비밀번호 생성
      const autoPassword = Math.floor(1000 + Math.random() * 9000).toString();

      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          restaurant_id: restaurantId,
          nickname,
          password: autoPassword,
          rating: Number(rating),
          content: content.trim() || undefined,
          tags: selectedTags,
        }),
      })
      const payload = await res.json().catch(() => ({}))

      if (res.status === 429) {
        setFormError(payload.error || '오늘은 이미 이 식당에 리뷰를 남겼어요.')
        return
      }
      if (!res.ok) {
        throw new Error(payload.error || '리뷰 등록에 실패했습니다.')
      }

      const dateKst = payload.serverDateKst || todayKst
      writeLockForRestaurant(restaurantId, dateKst)

      // 방금 작성한 리뷰 ID와 비밀번호를 브라우저에 저장
      if (payload.review && payload.review.id) {
         saveMyReview(payload.review.id, autoPassword);
      }

      setIsModalOpen(false)
      await loadReviews()
    } catch (err) {
      setFormError(err.message || '리뷰 등록에 실패했습니다.')
    } finally {
      setSubmitting(false)
    }
  }

  // 🚀 비번 입력 없이 원클릭 삭제
  const handleDirectDelete = async (reviewId) => {
    const pwd = myReviews[reviewId];
    if (!pwd) return;
    if (!window.confirm("정말 이 리뷰를 삭제하시겠습니까?")) return;

    try {
      const res = await fetch(apiUrl, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ id: reviewId, password: pwd }),
      })
      const payload = await res.json().catch(() => ({}))

      if (!res.ok) {
        throw new Error(payload.error || '삭제에 실패했습니다.')
      }

      // 삭제 성공 시 로컬스토리지에서도 정리
      const updatedMyReviews = { ...myReviews };
      delete updatedMyReviews[reviewId];
      localStorage.setItem(MY_REVIEWS_KEY, JSON.stringify(updatedMyReviews));

      await loadReviews()
    } catch (err) {
      alert(err.message || '삭제에 실패했습니다.')
    }
  }

  return (
    <div className="w-full bg-white relative">
      {/* 🚀 평균 별점 요약 헤더 */}
      <div className="flex items-center justify-between border-b border-slate-50 pb-3 mb-3">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">학우들의 평가</div>
          <div className="flex items-baseline gap-1.5 mt-0.5">
            <span className="text-2xl font-black text-slate-900">{avgRating}</span>
            <span className="text-sm font-bold text-violet-600">★</span>
            <span className="text-[11px] font-medium text-slate-400 ml-1">({reviewCount}개의 리뷰)</span>
          </div>
        </div>

        {!lockedForToday && (
          <button
            onClick={() => setIsModalOpen(true)}
            className="rounded-full bg-violet-50 px-3 py-1.5 text-[11px] font-bold text-violet-700 hover:bg-violet-100 transition-colors"
          >
            리뷰쓰기
          </button>
        )}
      </div>

      {loading ? (
        <div className="mt-2 text-sm text-slate-500">불러오는 중…</div>
      ) : error ? (
        <div className="mt-2 text-sm text-red-600">{error}</div>
      ) : (
        <ul className="space-y-2.5 mb-3">
          {reviews.length === 0 ? (
            <li className="py-4 text-center text-sm text-slate-400 italic">아직 리뷰가 없어요. 첫 소감을 들려주세요!</li>
          ) : (
            reviews.map((r) => {
              const isMyReview = !!myReviews[r.id]; // 🚀 내 로컬스토리지에 있는가?
              return (
                <li
                  key={r.id}
                  className="rounded-xl border border-slate-100 bg-slate-50/50 px-3 py-2.5 text-[12px]"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-800">{r.nickname}</span>
                        <span className="text-violet-600 font-medium">★ {r.rating}</span>
                      </div>
                      {r.content ? (
                        <p className="mt-1.5 whitespace-pre-wrap text-slate-600 leading-relaxed break-words">{r.content}</p>
                      ) : null}
                      {r.tags?.length ? (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {r.tags.map((t) => (
                            <span key={t} className="rounded bg-white border border-slate-200 px-1.5 py-0.5 text-[10px] text-slate-500">
                              #{t.replace(/^#/, '')}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    {/* 🚀 내가 쓴 글일 때만 원클릭 '삭제' 버튼 노출 */}
                    {isMyReview && (
                      <button
                        type="button"
                        onClick={() => handleDirectDelete(r.id)}
                        className="shrink-0 text-[10px] font-bold text-red-400 hover:text-red-600 transition-colors"
                      >
                        삭제
                      </button>
                    )}
                  </div>
                </li>
              )
            })
          )}
        </ul>
      )}

      {lockedForToday && (
        <div className="rounded-lg border border-violet-100 bg-violet-50 px-3 py-2 text-center text-[11px] font-medium text-violet-800 break-keep">
          이미 리뷰를 남기셨어요! 내일 또 들러주세요 ☺️
        </div>
      )}

      {/* 모달 Portal 렌더링 부 */}
      {isModalOpen && createPortal(
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl relative animate-in fade-in zoom-in-95 duration-200">
            <h3 className="text-xl font-black text-slate-900 mb-4">리뷰 남기기</h3>
            <form className="space-y-4" onSubmit={handleSubmit}>
              {formError && <div className="text-sm text-red-600 bg-red-50 p-2 rounded">{formError}</div>}

              {/* 닉네임 */}
              <input maxLength={40} className="w-full rounded-xl border border-slate-200 px-3 py-3 text-sm focus:border-violet-500 focus:outline-none" value={nickname} onChange={(e) => setNickname(e.target.value)} />

              {/* 별점 */}
              <div className="flex items-center gap-3 bg-slate-50 p-3 rounded-xl border border-slate-100">
                <label className="text-sm font-bold text-slate-700">별점</label>
                 <select className="flex-1 bg-transparent font-black text-violet-700 text-lg cursor-pointer outline-none" value={rating} onChange={(e) => setRating(Number(e.target.value))}>
                  {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{'⭐'.repeat(n)} ({n}점)</option>)}
                </select>
              </div>

              {/* 🚀 클릭형 태그 토글 영역 */}
              <div className="flex flex-wrap gap-2">
                {PRESET_TAGS.map(tag => (
                  <button type="button" key={tag} onClick={() => toggleTag(tag)} className={`px-2.5 py-1.5 rounded-full text-xs font-bold transition-colors ${selectedTags.includes(tag) ? 'bg-violet-600 text-white shadow-sm' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
                    {tag}
                  </button>
                ))}
              </div>

              {/* 한줄평 (선택사항) */}
              <textarea rows={3} maxLength={2000} placeholder="리뷰 내용 (선택사항)" className="w-full rounded-xl border border-slate-200 px-3 py-3 text-sm resize-none focus:border-violet-500 focus:outline-none" value={content} onChange={(e) => setContent(e.target.value)} />

              <button type="submit" disabled={submitting} className="w-full rounded-xl bg-violet-600 py-4 text-sm font-black text-white shadow-lg hover:bg-violet-700 disabled:opacity-50 transition-all">
                {submitting ? '등록 중...' : '작성 완료'}
              </button>
              <button type="button" onClick={() => setIsModalOpen(false)} className="w-full py-2 text-sm text-slate-400 hover:text-slate-600 font-bold mt-2 transition-colors">
                취소
              </button>
            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
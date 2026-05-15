import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { formatInTimeZone } from 'date-fns-tz'
import { getReviewsApiUrl } from '../lib/reviewsApi.js'

const LOCK_KEY = 'review_daily_lock_v1'
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

export function RestaurantReviews({ restaurantId }) {
  const apiUrl = useMemo(() => getReviewsApiUrl(), [])
  const [reviews, setReviews] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState(null)

  const [nickname, setNickname] = useState('')
  const [password, setPassword] = useState('')
  const [rating, setRating] = useState(5)
  const [content, setContent] = useState('')
  const [tagsInput, setTagsInput] = useState('')

  const [deleteTargetId, setDeleteTargetId] = useState(null)
  const [deletePassword, setDeletePassword] = useState('')
  const [deleteBusy, setDeleteBusy] = useState(false)

  const todayKst = todayKstYmd()
  const lockedForToday = readLockMap()[restaurantId] === todayKst

  // 🚀 [핵심 추가] 평균 별점 계산 로직
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

  const handleSubmit = async (e) => {
    e.preventDefault()
    setFormError(null)
    setSubmitting(true)
    try {
      const tags = tagsInput
        .split(/[,#]/)
        .map((t) => t.trim())
        .filter(Boolean)
        .slice(0, 10)

      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          restaurant_id: restaurantId,
          nickname,
          password,
          rating: Number(rating),
          content: content.trim() || undefined,
          tags,
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

      setNickname('')
      setPassword('')
      setContent('')
      setTagsInput('')
      setRating(5)
      setIsModalOpen(false)
      await loadReviews()
    } catch (err) {
      setFormError(err.message || '리뷰 등록에 실패했습니다.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTargetId) return
    if (!/^\d{4}$/.test(deletePassword)) {
      setFormError('삭제용 비밀번호는 숫자 4자리여야 합니다.')
      return
    }
    setDeleteBusy(true)
    setFormError(null)
    try {
      const res = await fetch(apiUrl, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ id: deleteTargetId, password: deletePassword }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(payload.error || '삭제에 실패했습니다.')
      }
      setDeleteTargetId(null)
      setDeletePassword('')
      await loadReviews()
    } catch (err) {
      setFormError(err.message || '삭제에 실패했습니다.')
    } finally {
      setDeleteBusy(false)
    }
  }

  return (
    <div className="w-full bg-white relative">
      {/* 🚀 [디자인 변경] 평균 별점 요약 헤더 */}
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
            reviews.map((r) => (
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
                            #{t}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    className="shrink-0 text-[10px] text-slate-300 hover:text-red-400 transition-colors"
                    onClick={() => {
                      setDeleteTargetId(r.id)
                      setDeletePassword('')
                    }}
                  >
                    삭제
                  </button>
                </div>
              </li>
            ))
          )}
        </ul>
      )}

      {/* 삭제 확인 및 잠금 메시지는 하단에 유지 */}
      {deleteTargetId && (
        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50/80 p-3">
          <div className="text-[11px] font-semibold text-amber-900">비밀번호 확인 후 삭제</div>
          <input
            type="password"
            inputMode="numeric"
            maxLength={4}
            autoComplete="off"
            placeholder="4자리"
            className="mt-1 w-full min-w-0 rounded border border-amber-200 px-2 py-1.5 text-sm"
            value={deletePassword}
            onChange={(e) => setDeletePassword(e.target.value.replace(/\D/g, '').slice(0, 4))}
          />
          <div className="mt-2 flex gap-2">
            <button type="button" disabled={deleteBusy} className="flex-1 rounded bg-amber-700 px-2 py-1 text-xs font-semibold text-white disabled:opacity-50" onClick={handleDelete}>삭제 실행</button>
            <button type="button" className="flex-1 rounded border border-slate-200 px-2 py-1 text-xs text-slate-600 bg-white" onClick={() => { setDeleteTargetId(null); setDeletePassword(''); }}>취소</button>
          </div>
        </div>
      )}

      {lockedForToday && (
        <div className="rounded-lg border border-violet-100 bg-violet-50 px-3 py-2 text-center text-[11px] font-medium text-violet-800 break-keep">
          이미 리뷰를 남기셨어요! 내일 또 들러주세요 ☺️
        </div>
      )}

      {/* 모달 Portal 로직 (기존과 동일) */}
      {isModalOpen && createPortal(
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl relative animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-xl font-black text-slate-900">리뷰 남기기</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-700"><svg viewBox="0 0 24 24" className="h-6 w-6"><path fill="currentColor" d="M18.3 5.71a1 1 0 0 1 0 1.42L13.42 12l4.88 4.88a1 1 0 1 1-1.42 1.42L12 13.42l-4.88 4.88a1 1 0 1 1-1.42-1.42L10.58 12 5.7 7.12a1 1 0 0 1 1.42-1.42L12 10.58l4.88-4.88a1 1 0 0 1 1.42 0Z"/></svg></button>
            </div>
            <form className="space-y-4" onSubmit={handleSubmit}>
              {formError && <div className="text-sm text-red-600 bg-red-50 p-2 rounded">{formError}</div>}
              <div className="flex gap-2">
                <input required maxLength={40} placeholder="닉네임" className="w-full min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-3 text-sm focus:border-violet-500 focus:outline-none" value={nickname} onChange={(e) => setNickname(e.target.value)} />
                <input required type="password" inputMode="numeric" maxLength={4} pattern="\d{4}" placeholder="비번(4자리)" className="w-full min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-3 text-sm focus:border-violet-500 focus:outline-none" value={password} onChange={(e) => setPassword(e.target.value.replace(/\D/g, '').slice(0, 4))} />
              </div>
              <div className="flex items-center gap-3 bg-slate-50 p-3 rounded-xl border border-slate-100">
                <label className="text-sm font-bold text-slate-700">별점</label>
                <select className="flex-1 rounded-lg border-none bg-transparent font-black text-violet-700 text-lg cursor-pointer" value={rating} onChange={(e) => setRating(Number(e.target.value))}>
                  {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{'⭐'.repeat(n)} ({n}점)</option>)}
                </select>
              </div>
              <textarea rows={3} maxLength={2000} placeholder="솔직한 한줄평을 남겨주세요." className="w-full rounded-xl border border-slate-200 px-3 py-3 text-sm resize-none focus:border-violet-500 focus:outline-none" value={content} onChange={(e) => setContent(e.target.value)} />
              <input placeholder="태그 입력 (예: #가성비 #혼밥)" className="w-full rounded-xl border border-slate-200 px-3 py-3 text-sm focus:border-violet-500 focus:outline-none" value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} />
              <button type="submit" disabled={submitting} className="w-full rounded-xl bg-violet-600 py-4 text-sm font-black text-white shadow-lg hover:bg-violet-700 disabled:opacity-50 transition-all">{submitting ? '등록 중...' : '작성 완료'}</button>
            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
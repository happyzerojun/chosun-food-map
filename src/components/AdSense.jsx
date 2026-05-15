import { useEffect } from 'react';

/**
 * @description 구글 애드센스 정책 위반(콘텐츠 없음)을 방지하기 위한 스마트 광고 컴포넌트
 * @param {boolean} isReady - 맛집 데이터 로딩 완료 여부
 */
const AdSense = ({ isReady }) => {
  useEffect(() => {
    // 1. [환경 방어 훅] 로컬 개발 환경(localhost)에서는 광고를 로드하지 않음
    if (import.meta.env.DEV) {
      console.log('Vibe Check: 로컬 샌드박스 모드이므로 광고 로드를 생략합니다.');
      return;
    }

    // 2. [콘텐츠 동기화 훅] 데이터가 아직 준비되지 않았다면 멈춤
    if (!isReady) return;

    try {
      // 3. [오케스트레이션] 구글 광고 엔진 호출
      // window.adsbygoogle 객체가 로드되었는지 확인 후 push
      if (window.adsbygoogle) {
        (window.adsbygoogle = window.adsbygoogle || []).push({});
      }
    } catch (error) {
      console.error('AdSense Agent Error:', error);
    }
  }, [isReady]); // isReady 상태가 바뀔 때마다 실행

  // 로컬 개발 환경에서는 레이아웃 확인용 더미 박스 렌더링
  if (import.meta.env.DEV) {
    return (
      <div style={{
        background: '#e0e0e0',
        height: '100px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        margin: '20px 0',
        borderRadius: '8px',
        border: '2px dashed #999'
      }}>
        [AD_SANDBOX] 콘텐츠 로딩 완료 시 광고가 노출될 자리입니다.
      </div>
    );
  }

  // 실제 라이브 환경 렌더링 (데이터가 준비되었을 때만 표시)
  return isReady ? (
    <div className="adsense-wrap" style={{ overflow: 'hidden', margin: '20px 0' }}>
      <ins className="adsbygoogle"
           style={{ display: 'block' }}
           data-ad-client={import.meta.env.VITE_ADSENSE_CLIENT_ID}
           data-ad-slot="YOUR_AD_SLOT_ID" // 애드센스 대시보드에서 생성한 슬롯 ID를 넣으세요!
           data-ad-format="auto"
           data-full-width-responsive="true"></ins>
    </div>
  ) : null;
};

export default AdSense;
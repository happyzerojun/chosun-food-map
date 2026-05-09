function readViteEnv(key) {
  try {
    // Vite 런타임에서만 존재합니다. (빌드 시점에는 치환되며, 없으면 undefined)
    return import.meta?.env?.[key]
  } catch {
    return undefined
  }
}

export const config = {
  kakaoApiKey: readViteEnv('VITE_KAKAO_API_KEY') || '',
}


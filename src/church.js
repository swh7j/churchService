// 여러 교회: 주소 /c/{교회코드}/... 에서 교회를 정함
// 성도 화면 /c/코드/...   관리자 화면 /c/코드/admin/...
const m = window.location.pathname.match(/^\/c\/([a-z][a-z0-9-]{1,29})(?=\/|$)/);

/** 지금 화면의 교회 코드 (교회 선택 화면이면 '') */
export const CHURCH = m ? m[1] : '';
/** 이 교회 화면들의 주소 앞부분: '/c/코드' */
export const BASE = CHURCH ? `/c/${CHURCH}` : '';
/** 교회 주소 앞부분을 뺀 나머지 경로 */
export const REST = window.location.pathname.slice(BASE.length) || '/';

/** 이 교회 안의 화면 주소 */
export const churchPath = (p = '/') => BASE + (p.startsWith('/') ? p : '/' + p);

/** 사진·파일 받기처럼 헤더를 못 붙이는 API 주소에 교회 코드 붙이기 */
export const withChurch = (url) => (CHURCH ? url + (url.includes('?') ? '&' : '?') + 'church=' + CHURCH : url);

const LAST = 'church:last';
export const lastChurch = () => {
  try {
    return localStorage.getItem(LAST) || '';
  } catch {
    return '';
  }
};
export const rememberChurch = (code) => {
  try {
    if (code) localStorage.setItem(LAST, code);
  } catch {
    /* 저장 못 해도 동작에는 지장 없음 */
  }
};
